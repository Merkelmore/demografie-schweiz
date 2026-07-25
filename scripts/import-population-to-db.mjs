import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as XLSX from "xlsx";

import { createDatabasePool } from "./db.mjs";

const sourceUrl = "https://dam-api.bfs.admin.ch/hub/api/dam/assets/36073663/master";
const sourceCode = "bfs-statpop-population-structure";
const cantonsByBfsName = {
  Aargau: { bfsNumber: "19", code: "AG", name: "Aargau" },
  "Appenzell A. Rh.": { bfsNumber: "16", code: "AR", name: "Appenzell Ausserrhoden" },
  "Appenzell I. Rh.": { bfsNumber: "15", code: "AI", name: "Appenzell Innerrhoden" },
  "Basel-Landschaft": { bfsNumber: "13", code: "BL", name: "Basel-Landschaft" },
  "Basel-Stadt": { bfsNumber: "12", code: "BS", name: "Basel-Stadt" },
  Bern: { bfsNumber: "2", code: "BE", name: "Bern" },
  Freiburg: { bfsNumber: "10", code: "FR", name: "Freiburg" },
  Genf: { bfsNumber: "25", code: "GE", name: "Genf" },
  Glarus: { bfsNumber: "8", code: "GL", name: "Glarus" },
  Graubünden: { bfsNumber: "18", code: "GR", name: "Graubünden" },
  Jura: { bfsNumber: "26", code: "JU", name: "Jura" },
  Luzern: { bfsNumber: "3", code: "LU", name: "Luzern" },
  Neuenburg: { bfsNumber: "24", code: "NE", name: "Neuenburg" },
  Nidwalden: { bfsNumber: "7", code: "NW", name: "Nidwalden" },
  Obwalden: { bfsNumber: "6", code: "OW", name: "Obwalden" },
  Schaffhausen: { bfsNumber: "14", code: "SH", name: "Schaffhausen" },
  Schwyz: { bfsNumber: "5", code: "SZ", name: "Schwyz" },
  Solothurn: { bfsNumber: "11", code: "SO", name: "Solothurn" },
  "St. Gallen": { bfsNumber: "17", code: "SG", name: "St. Gallen" },
  Tessin: { bfsNumber: "21", code: "TI", name: "Tessin" },
  Thurgau: { bfsNumber: "20", code: "TG", name: "Thurgau" },
  Uri: { bfsNumber: "4", code: "UR", name: "Uri" },
  Waadt: { bfsNumber: "22", code: "VD", name: "Waadt" },
  Wallis: { bfsNumber: "23", code: "VS", name: "Wallis" },
  Zug: { bfsNumber: "9", code: "ZG", name: "Zug" },
  Zürich: { bfsNumber: "1", code: "ZH", name: "Zürich" },
};

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`BFS download failed with ${response.status}`);

const workbookBuffer = Buffer.from(await response.arrayBuffer());
const contentHash = createHash("sha256").update(workbookBuffer).digest("hex");
const retrievedAt = new Date();
const rawDirectory = resolve("data/raw", sourceCode);
const rawPath = resolve(rawDirectory, `${retrievedAt.toISOString().replaceAll(":", "-")}-${contentHash.slice(0, 12)}.xlsx`);
await mkdir(rawDirectory, { recursive: true });
await writeFile(rawPath, workbookBuffer);

const workbook = XLSX.read(workbookBuffer, { type: "buffer" });
const latestYear = Math.max(...workbook.SheetNames.filter((name) => /^20\d{2}$/.test(name)).map(Number));
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[String(latestYear)], { defval: "", header: 1 });
const values = new Map();

for (const row of rows.slice(5)) {
  const canton = cantonsByBfsName[row[0]];
  const population = Number(row[1]);
  if (canton && Number.isInteger(population) && population > 0) values.set(canton.code, { canton, population });
}

if (values.size !== 26) throw new Error(`Expected 26 canton populations for ${latestYear}, received ${values.size}`);

const pool = createDatabasePool();
let runId;
try {
  const client = await pool.connect();
  let snapshotId;
  try {
    await client.query("BEGIN");
    const dataset = await client.query(`
      INSERT INTO source_dataset (code, publisher, title, source_url, license, definition)
      VALUES ($1, 'Bundesamt für Statistik (BFS)', 'Struktur der ständigen Wohnbevölkerung nach Kanton', $2, 'Open Government Data (OGD), CC BY 4.0', 'Ständige Wohnbevölkerung nach Kanton, jeweils am 31. Dezember.')
      ON CONFLICT (code) DO UPDATE SET source_url = EXCLUDED.source_url
      RETURNING id
    `, [sourceCode, sourceUrl]);
    const snapshot = await client.query(`
      INSERT INTO source_snapshot (source_dataset_id, published_at, reference_date, content_hash, raw_path, metadata)
      VALUES ($1, NULL, $2, $3, $4, $5::jsonb)
      ON CONFLICT (source_dataset_id, content_hash) DO UPDATE SET raw_path = EXCLUDED.raw_path, metadata = EXCLUDED.metadata
      RETURNING id
    `, [dataset.rows[0].id, `${latestYear}-12-31`, contentHash, rawPath, JSON.stringify({ sheet: String(latestYear), table: "T 01.02.03.04", expectedCantons: 26 })]);
    snapshotId = snapshot.rows[0].id;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const importRun = await pool.query(`
    INSERT INTO import_run (source_snapshot_id, importer, status)
    VALUES ($1, 'scripts/import-population-to-db.mjs', 'running')
    RETURNING id
  `, [snapshotId]);
  runId = importRun.rows[0].id;

  const importClient = await pool.connect();
  try {
    await importClient.query("BEGIN");
    const metric = await importClient.query("SELECT id FROM metric_definition WHERE code = 'population_total'");

    for (const { canton, population } of values.values()) {
      const geoUnit = await importClient.query(`
        INSERT INTO geo_unit (level, bfs_number, canton_code, name_de)
        VALUES ('canton', $1, $2, $3)
        ON CONFLICT (level, bfs_number) DO UPDATE SET canton_code = EXCLUDED.canton_code, name_de = EXCLUDED.name_de, is_current = true, updated_at = now()
        RETURNING id
      `, [canton.bfsNumber, canton.code, canton.name]);
      await importClient.query(`
        INSERT INTO observation (geo_unit_id, metric_definition_id, source_snapshot_id, reference_date, value)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (geo_unit_id, metric_definition_id, reference_date, dimensions)
        DO UPDATE SET value = EXCLUDED.value, source_snapshot_id = EXCLUDED.source_snapshot_id, updated_at = now()
      `, [geoUnit.rows[0].id, metric.rows[0].id, snapshotId, `${latestYear}-12-31`, population]);
    }

    await importClient.query("COMMIT");
  } catch (error) {
    await importClient.query("ROLLBACK");
    throw error;
  } finally {
    importClient.release();
  }

  await pool.query("UPDATE import_run SET status = 'succeeded', completed_at = now(), records_written = $2 WHERE id = $1", [runId, values.size]);
  console.log(`Imported ${values.size} latest canton population observations for ${latestYear}.`);
} catch (error) {
  if (runId) await pool.query("UPDATE import_run SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1", [runId, String(error)]);
  throw error;
} finally {
  await pool.end();
}