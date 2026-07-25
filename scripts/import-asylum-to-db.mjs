import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import XLSX from "xlsx";

import { createDatabasePool } from "./db.mjs";

const sourceUrl = "https://www.sem.admin.ch/dam/sem/de/data/publiservice/statistik/asylstatistik/2026/06/6-10-best-asylprozess-2026-06.xlsx.download.xlsx/6-10-best-asylprozess-2026-06-d.xlsx";
const sourceCode = "sem-asylum-procedure-stock";
const referenceDate = "2026-06-30";
const cantonCodes = ["AG", "AR", "AI", "BL", "BS", "BE", "FR", "GE", "GL", "GR", "JU", "LU", "NE", "NW", "OW", "SH", "SZ", "SO", "SG", "TI", "TG", "UR", "VD", "VS", "ZG", "ZH"];

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`SEM asylum workbook request failed with ${response.status}`);

const workbookBuffer = Buffer.from(await response.arrayBuffer());
const contentHash = createHash("sha256").update(workbookBuffer).digest("hex");
const rawDirectory = resolve("data/raw", sourceCode);
const rawPath = resolve(rawDirectory, `${new Date().toISOString().replaceAll(":", "-")}-${contentHash.slice(0, 12)}.xlsx`);
await mkdir(rawDirectory, { recursive: true });
await writeFile(rawPath, workbookBuffer);

const workbook = XLSX.read(workbookBuffer, { type: "buffer" });
const sourceCantonCodes = workbook.SheetNames.filter((name) => /^[A-Z]{2}$/.test(name) && name !== "ZZ");
if (sourceCantonCodes.length !== 26 || !cantonCodes.every((code) => sourceCantonCodes.includes(code))) {
  throw new Error(`Expected 26 canton sheets, received ${sourceCantonCodes.join(", ")}`);
}

const valuesByCanton = new Map();
for (const cantonCode of cantonCodes) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[cantonCode], { header: 1, defval: "" });
  const procedureHeader = rows.find((row) => row.some((cell) => String(cell).includes("Personen im Verfahrensprozess")));
  const procedureColumn = procedureHeader?.findIndex((cell) => String(cell).includes("Personen im Verfahrensprozess")) ?? -1;
  const totalRow = rows.find((row) => row[0] === "Gesamttotal");
  const value = totalRow?.[procedureColumn];

  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid SEM procedure count for ${cantonCode}`);
  valuesByCanton.set(cantonCode, value);
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
      VALUES ($1, 'Staatssekretariat für Migration (SEM)', 'Bestand im Asylprozess nach Kanton', $2, 'Amtliche Statistik des SEM', 'Personen im Verfahrensprozess je Kanton am Stichtag; nicht gleichzusetzen mit allen Personen in Schutz- oder vorläufigen Aufnahmestatus.')
      ON CONFLICT (code) DO UPDATE SET source_url = EXCLUDED.source_url
      RETURNING id
    `, [sourceCode, sourceUrl]);
    const snapshot = await sourceClient.query(`
      INSERT INTO source_snapshot (source_dataset_id, reference_date, content_hash, raw_path, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (source_dataset_id, content_hash) DO UPDATE SET raw_path = EXCLUDED.raw_path, metadata = EXCLUDED.metadata
      RETURNING id
    `, [dataset.rows[0].id, referenceDate, contentHash, rawPath, JSON.stringify({ semWorkbook: "6-10-best-asylprozess", measure: "Personen im Verfahrensprozess", excludedSheet: "ZZ", expectedCantons: 26 })]);
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
    VALUES ($1, 'scripts/import-asylum-to-db.mjs', 'running')
    RETURNING id
  `, [snapshotId]);
  runId = importRun.rows[0].id;

  const importClient = await pool.connect();
  try {
    await importClient.query("BEGIN");
    const geoUnits = new Map((await importClient.query("SELECT id, canton_code FROM geo_unit WHERE level = 'canton' AND is_current")).rows.map((row) => [row.canton_code, row.id]));
    if (geoUnits.size !== 26) throw new Error(`Expected 26 imported canton geographies, received ${geoUnits.size}`);
    const metric = await importClient.query("SELECT id FROM metric_definition WHERE code = 'asylum_pending'");
    if (metric.rowCount !== 1) throw new Error("Missing asylum_pending metric definition");

    for (const cantonCode of cantonCodes) {
      await importClient.query(`
        INSERT INTO observation (geo_unit_id, metric_definition_id, source_snapshot_id, reference_date, value)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (geo_unit_id, metric_definition_id, reference_date, dimensions)
        DO UPDATE SET value = EXCLUDED.value, source_snapshot_id = EXCLUDED.source_snapshot_id, updated_at = now()
      `, [geoUnits.get(cantonCode), metric.rows[0].id, snapshotId, referenceDate, valuesByCanton.get(cantonCode)]);
    }
    await importClient.query("COMMIT");
  } catch (error) {
    await importClient.query("ROLLBACK");
    throw error;
  } finally {
    importClient.release();
  }

  await pool.query("UPDATE import_run SET status = 'succeeded', completed_at = now(), records_written = 26 WHERE id = $1", [runId]);
  console.log(`Imported 26 SEM asylum-procedure observations for ${referenceDate}.`);
} catch (error) {
  if (runId) await pool.query("UPDATE import_run SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1", [runId, String(error)]);
  throw error;
} finally {
  await pool.end();
}