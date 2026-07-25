import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import XLSX from "xlsx";

import { createDatabasePool } from "./db.mjs";

const sourceUrl = "https://dam-api.bfs.admin.ch/hub/api/dam/assets/36347244/master";
const sourceCode = "bfs-unemployment-rate-by-canton";
const cantonCodesByGeo = {
  CH011: "VD", CH012: "VS", CH013: "GE", CH021: "BE", CH022: "FR", CH023: "SO", CH024: "NE", CH025: "JU",
  CH031: "BS", CH032: "BL", CH033: "AG", CH040: "ZH", CH051: "GL", CH052: "SH", CH053: "AR", CH054: "AI",
  CH055: "SG", CH056: "GR", CH057: "TG", CH061: "LU", CH062: "UR", CH063: "SZ", CH064: "OW", CH065: "NW",
  CH066: "ZG", CH070: "TI",
};

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`BFS unemployment CSV request failed with ${response.status}`);

const csvBuffer = Buffer.from(await response.arrayBuffer());
const contentHash = createHash("sha256").update(csvBuffer).digest("hex");
const rawDirectory = resolve("data/raw", sourceCode);
const rawPath = resolve(rawDirectory, `${new Date().toISOString().replaceAll(":", "-")}-${contentHash.slice(0, 12)}.csv`);
await mkdir(rawDirectory, { recursive: true });
await writeFile(rawPath, csvBuffer);

const workbook = XLSX.read(csvBuffer, { type: "buffer", raw: true });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
const years = rows.map((row) => Number(String(row.TIME_PERIOD).replaceAll('"', ""))).filter(Number.isInteger);
const latestYear = Math.max(...years);
if (!Number.isInteger(latestYear)) throw new Error("Could not determine the latest BFS unemployment data year");

const cantonRows = rows
  .filter((row) => Number(String(row.TIME_PERIOD).replaceAll('"', "")) === latestYear)
  .filter((row) => row.UNIT_MEA === "pers in %" && row.ERWP === "Total" && row.ERWL === "1" && row.POP1564 === "1")
  .filter((row) => row.GEO in cantonCodesByGeo);

if (cantonRows.length !== 26) throw new Error(`Expected 26 BFS canton unemployment rows, received ${cantonRows.length}`);

const valuesByCanton = new Map();
const unavailableCantons = [];
for (const row of cantonRows) {
  const cantonCode = cantonCodesByGeo[row.GEO];
  const value = Number(row.OBS_VALUE);
  if (row.OBS_VALUE === ".") {
    unavailableCantons.push(cantonCode);
    continue;
  }
  if (!Number.isFinite(value) || value <= 0 || value >= 100) throw new Error(`Invalid BFS unemployment rate for ${cantonCode}`);
  valuesByCanton.set(cantonCode, value);
}

if (valuesByCanton.size !== 25 || unavailableCantons.length !== 1 || unavailableCantons[0] !== "AI") {
  throw new Error(`Expected 25 published values and a single unavailable value for AI, received ${valuesByCanton.size} values and ${unavailableCantons.join(", ")}`);
}

const pool = createDatabasePool();
let runId;
try {
  const sourceClient = await pool.connect();
  let snapshotId;
  try {
    await sourceClient.query("BEGIN");
    const dataset = await sourceClient.query(`
      INSERT INTO source_dataset (code, publisher, title, source_url, license, definition)
      VALUES ($1, 'Bundesamt für Statistik (BFS)', 'Erwerbs- und Erwerbslosenquote nach Kanton', $2, 'OPEN-BY', 'BFS-Erwerbslosenquote nach ILO-Definition: Anteil Erwerbsloser an den Erwerbspersonen; jährliche Schätzung der Strukturerhebung.')
      ON CONFLICT (code) DO UPDATE SET source_url = EXCLUDED.source_url
      RETURNING id
    `, [sourceCode, sourceUrl]);
    const snapshot = await sourceClient.query(`
      INSERT INTO source_snapshot (source_dataset_id, reference_date, content_hash, raw_path, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (source_dataset_id, content_hash) DO UPDATE SET raw_path = EXCLUDED.raw_path, metadata = EXCLUDED.metadata
      RETURNING id
    `, [dataset.rows[0].id, `${latestYear}-12-31`, contentHash, rawPath, JSON.stringify({ bfsNumber: "ts-x-40.02.03.02.03", expectedCantonRows: 26, publishedValues: valuesByCanton.size, unavailableCantons })]);
    snapshotId = snapshot.rows[0].id;
    await sourceClient.query("COMMIT");
  } catch (error) {
    await sourceClient.query("ROLLBACK");
    throw error;
  } finally {
    sourceClient.release();
  }

  const importRun = await pool.query(`
    INSERT INTO import_run (source_snapshot_id, importer, status)
    VALUES ($1, 'scripts/import-unemployment-to-db.mjs', 'running')
    RETURNING id
  `, [snapshotId]);
  runId = importRun.rows[0].id;

  const importClient = await pool.connect();
  try {
    await importClient.query("BEGIN");
    const geoUnits = new Map((await importClient.query("SELECT id, canton_code FROM geo_unit WHERE level = 'canton' AND is_current")).rows.map((row) => [row.canton_code, row.id]));
    if (geoUnits.size !== 26) throw new Error(`Expected 26 imported canton geographies, received ${geoUnits.size}`);
    const metric = await importClient.query("SELECT id FROM metric_definition WHERE code = 'unemployment_rate'");
    if (metric.rowCount !== 1) throw new Error("Missing unemployment_rate metric definition");

    for (const [cantonCode, value] of valuesByCanton) {
      await importClient.query(`
        INSERT INTO observation (geo_unit_id, metric_definition_id, source_snapshot_id, reference_date, value)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (geo_unit_id, metric_definition_id, reference_date, dimensions)
        DO UPDATE SET value = EXCLUDED.value, source_snapshot_id = EXCLUDED.source_snapshot_id, updated_at = now()
      `, [geoUnits.get(cantonCode), metric.rows[0].id, snapshotId, `${latestYear}-12-31`, value]);
    }
    await importClient.query("COMMIT");
  } catch (error) {
    await importClient.query("ROLLBACK");
    throw error;
  } finally {
    importClient.release();
  }

  await pool.query("UPDATE import_run SET status = 'succeeded', completed_at = now(), records_written = 25 WHERE id = $1", [runId]);
  console.log(`Imported 25 published BFS unemployment-rate observations for ${latestYear}; AI is not published.`);
} catch (error) {
  if (runId) await pool.query("UPDATE import_run SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1", [runId, String(error)]);
  throw error;
} finally {
  await pool.end();
}