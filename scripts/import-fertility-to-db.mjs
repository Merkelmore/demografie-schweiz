import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import XLSX from "xlsx";

import { createDatabasePool } from "./db.mjs";

const sourceUrl = "https://dam-api.bfs.admin.ch/hub/api/dam/assets/36142182/master";
const sourceCode = "bfs-total-fertility-rate-by-canton";
const cantonCodes = {
  "Aargau": "AG", "Appenzell A. Rh.": "AR", "Appenzell I. Rh.": "AI", "Basel-Landschaft": "BL", "Basel-Stadt": "BS",
  "Bern": "BE", "Freiburg": "FR", "Genf": "GE", "Glarus": "GL", "Graubünden": "GR", "Jura": "JU", "Luzern": "LU",
  "Neuenburg": "NE", "Nidwalden": "NW", "Obwalden": "OW", "Schaffhausen": "SH", "Schwyz": "SZ", "Solothurn": "SO",
  "St. Gallen": "SG", "Tessin": "TI", "Thurgau": "TG", "Uri": "UR", "Waadt": "VD", "Wallis": "VS", "Zug": "ZG", "Zürich": "ZH",
};

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`BFS fertility workbook request failed with ${response.status}`);

const workbookBuffer = Buffer.from(await response.arrayBuffer());
const contentHash = createHash("sha256").update(workbookBuffer).digest("hex");
const rawDirectory = resolve("data/raw", sourceCode);
const rawPath = resolve(rawDirectory, `${new Date().toISOString().replaceAll(":", "-")}-${contentHash.slice(0, 12)}.xlsx`);
await mkdir(rawDirectory, { recursive: true });
await writeFile(rawPath, workbookBuffer);

const workbook = XLSX.read(workbookBuffer, { type: "buffer" });
const sheetName = "su-d-01.04.01.02.07";
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
const years = rows[1];
const latestColumn = years.length - 1;
const latestYear = years[latestColumn];
if (!Number.isInteger(latestYear)) throw new Error("Could not determine the latest fertility data year");

const valuesByCanton = new Map();
for (const row of rows.slice(2)) {
  const cantonCode = cantonCodes[row[0]];
  if (!cantonCode) continue;
  const value = row[latestColumn];
  if (typeof value !== "number" || value <= 0 || value > 10) throw new Error(`Invalid fertility value for ${row[0]}`);
  valuesByCanton.set(cantonCode, value);
}
if (valuesByCanton.size !== 26) throw new Error(`Expected 26 canton fertility values, received ${valuesByCanton.size}`);

const pool = createDatabasePool();
let runId;
try {
  const sourceClient = await pool.connect();
  let snapshotId;
  try {
    await sourceClient.query("BEGIN");
    const dataset = await sourceClient.query(`
      INSERT INTO source_dataset (code, publisher, title, source_url, license, definition)
      VALUES ($1, 'Bundesamt für Statistik (BFS)', 'Zusammengefasste Geburtenziffer nach Kanton, 1981-2024', $2, 'OPEN-BY', 'Periodenindikator: durchschnittliche Anzahl Kinder pro Frau bei konstanten altersspezifischen Geburtenhäufigkeiten des Kalenderjahres.')
      ON CONFLICT (code) DO UPDATE SET source_url = EXCLUDED.source_url
      RETURNING id
    `, [sourceCode, sourceUrl]);
    const snapshot = await sourceClient.query(`
      INSERT INTO source_snapshot (source_dataset_id, published_at, reference_date, content_hash, raw_path, metadata)
      VALUES ($1, '2025-09-25', $2, $3, $4, $5::jsonb)
      ON CONFLICT (source_dataset_id, content_hash) DO UPDATE SET raw_path = EXCLUDED.raw_path, metadata = EXCLUDED.metadata
      RETURNING id
    `, [dataset.rows[0].id, `${latestYear}-12-31`, contentHash, rawPath, JSON.stringify({ bfsNumber: "su-d-01.04.01.02.07", expectedCantons: 26, latestYear })]);
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
    VALUES ($1, 'scripts/import-fertility-to-db.mjs', 'running')
    RETURNING id
  `, [snapshotId]);
  runId = importRun.rows[0].id;

  const importClient = await pool.connect();
  try {
    await importClient.query("BEGIN");
    const geoUnits = new Map((await importClient.query("SELECT id, canton_code FROM geo_unit WHERE level = 'canton' AND is_current")).rows.map((row) => [row.canton_code, row.id]));
    if (geoUnits.size !== 26) throw new Error(`Expected 26 imported canton geographies, received ${geoUnits.size}`);
    const metric = await importClient.query("SELECT id FROM metric_definition WHERE code = 'fertility_tfr'");
    if (metric.rowCount !== 1) throw new Error("Missing fertility_tfr metric definition");

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

  await pool.query("UPDATE import_run SET status = 'succeeded', completed_at = now(), records_written = 26 WHERE id = $1", [runId]);
  console.log(`Imported 26 BFS fertility observations for ${latestYear}.`);
} catch (error) {
  if (runId) await pool.query("UPDATE import_run SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1", [runId, String(error)]);
  throw error;
} finally {
  await pool.end();
}