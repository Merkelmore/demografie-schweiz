import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDatabasePool } from "./db.mjs";

const sourceUrl = "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0102020000_201/px-x-0102020000_201.px";
const sourceCode = "bfs-current-municipality-directory";
const cantonCodes = {
  1: "ZH", 174: "BE", 520: "LU", 607: "UR", 628: "SZ", 665: "OW", 674: "NW", 687: "GL", 692: "ZG",
  705: "FR", 839: "SO", 956: "BS", 961: "BL", 1053: "SH", 1086: "AR", 1110: "AI", 1117: "SG",
  1201: "GR", 1314: "AG", 1523: "TG", 1612: "TI", 1727: "VD", 2038: "VS", 2174: "NE", 2203: "GE", 2250: "JU",
};
const expectedMunicipalityCount = 2134;

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`BFS metadata request failed with ${response.status}`);
const metadata = await response.json();
const payloadBuffer = Buffer.from(JSON.stringify(metadata));
const contentHash = createHash("sha256").update(payloadBuffer).digest("hex");
const retrievedAt = new Date();
const rawDirectory = resolve("data/raw", sourceCode);
const rawPath = resolve(rawDirectory, `${retrievedAt.toISOString().replaceAll(":", "-")}-${contentHash.slice(0, 12)}.json`);
await mkdir(rawDirectory, { recursive: true });
await writeFile(rawPath, payloadBuffer);

const geography = metadata.variables.find((variable) => variable.code.startsWith("Kanton (-)"));
const year = metadata.variables.find((variable) => variable.code === "Jahr");
if (!geography || !year) throw new Error("BFS metadata no longer exposes the expected geography or year dimensions");

const municipalities = [];
let cantonCode;
for (const [index, valueText] of geography.valueTexts.entries()) {
  const sourceId = geography.values[index];
  if (valueText.startsWith("- ")) {
    cantonCode = cantonCodes[sourceId];
    if (!cantonCode) throw new Error(`Unknown BFS canton identifier: ${sourceId}`);
    continue;
  }

  const municipality = valueText.match(/^\.\.\.\.\.\.(\d{4}) (.+)$/);
  if (municipality) {
    if (!cantonCode) throw new Error(`Municipality appears before canton: ${valueText}`);
    municipalities.push({ bfsNumber: municipality[1], cantonCode, name: municipality[2] });
  }
}

if (municipalities.length !== expectedMunicipalityCount) {
  throw new Error(`Expected ${expectedMunicipalityCount} current BFS municipalities, received ${municipalities.length}`);
}
if (new Set(municipalities.map(({ bfsNumber }) => bfsNumber)).size !== municipalities.length) {
  throw new Error("BFS municipality directory contains duplicate BFS numbers");
}
if (new Set(municipalities.map(({ cantonCode: code }) => code)).size !== 26) {
  throw new Error("BFS municipality directory does not cover all 26 cantons");
}

const latestYear = String(Math.max(...year.values.map(Number)));
const pool = createDatabasePool();
let runId;
try {
  const sourceClient = await pool.connect();
  let snapshotId;
  try {
    await sourceClient.query("BEGIN");
    const dataset = await sourceClient.query(`
      INSERT INTO source_dataset (code, publisher, title, source_url, license, definition)
      VALUES ($1, 'Bundesamt für Statistik (BFS)', 'Aktuelle Gemeinden nach BFS-Gemeindenummer und Kanton', $2, 'Open Government Data (OGD), CC BY 4.0', 'Aktuelle BFS-Gemeindegliederung, aus der Geografiedimension der demografischen Bilanz.')
      ON CONFLICT (code) DO UPDATE SET source_url = EXCLUDED.source_url
      RETURNING id
    `, [sourceCode, sourceUrl]);
    const snapshot = await sourceClient.query(`
      INSERT INTO source_snapshot (source_dataset_id, reference_date, content_hash, raw_path, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (source_dataset_id, content_hash) DO UPDATE SET raw_path = EXCLUDED.raw_path, metadata = EXCLUDED.metadata
      RETURNING id
    `, [dataset.rows[0].id, `${latestYear}-12-31`, contentHash, rawPath, JSON.stringify({ bfsTable: "px-x-0102020000_201", expectedMunicipalities: expectedMunicipalityCount, expectedCantons: 26 })]);
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
    VALUES ($1, 'scripts/import-municipalities-to-db.mjs', 'running')
    RETURNING id
  `, [snapshotId]);
  runId = importRun.rows[0].id;

  const importClient = await pool.connect();
  try {
    await importClient.query("BEGIN");
    const result = await importClient.query(`
      INSERT INTO geo_unit (level, bfs_number, canton_code, name_de)
      SELECT 'municipality', bfs_number, canton_code, name_de
      FROM unnest($1::text[], $2::text[], $3::text[]) AS item(bfs_number, canton_code, name_de)
      ON CONFLICT (level, bfs_number) DO UPDATE SET
        canton_code = EXCLUDED.canton_code,
        name_de = EXCLUDED.name_de,
        is_current = true,
        updated_at = now()
    `, [municipalities.map(({ bfsNumber }) => bfsNumber), municipalities.map(({ cantonCode: code }) => code), municipalities.map(({ name }) => name)]);
    if (result.rowCount !== expectedMunicipalityCount) throw new Error(`Expected ${expectedMunicipalityCount} municipality writes, received ${result.rowCount}`);

    await importClient.query(`
      UPDATE geo_unit
      SET is_current = false, updated_at = now()
      WHERE level = 'municipality' AND is_current AND NOT (bfs_number = ANY($1::text[]))
    `, [municipalities.map(({ bfsNumber }) => bfsNumber)]);
    await importClient.query("COMMIT");
  } catch (error) {
    await importClient.query("ROLLBACK");
    throw error;
  } finally {
    importClient.release();
  }

  await pool.query("UPDATE import_run SET status = 'succeeded', completed_at = now(), records_written = $2 WHERE id = $1", [runId, expectedMunicipalityCount]);
  console.log(`Imported ${expectedMunicipalityCount} current municipalities for all 26 cantons from BFS ${latestYear} metadata.`);
} catch (error) {
  if (runId) await pool.query("UPDATE import_run SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1", [runId, String(error)]);
  throw error;
} finally {
  await pool.end();
}