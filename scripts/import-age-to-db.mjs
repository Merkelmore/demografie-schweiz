import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDatabasePool } from "./db.mjs";

const sourceUrl = "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0102020000_104/px-x-0102020000_104.px";
const sourceCode = "bfs-demographic-balance-by-age-and-canton";
const bfsCantonCodes = {
  1: "ZH", 2: "BE", 3: "LU", 4: "UR", 5: "SZ", 6: "OW", 7: "NW", 8: "GL", 9: "ZG", 10: "FR", 11: "SO", 12: "BS", 13: "BL",
  14: "SH", 15: "AR", 16: "AI", 17: "SG", 18: "GR", 19: "AG", 20: "TG", 21: "TI", 22: "VD", 23: "VS", 24: "NE", 25: "GE", 26: "JU",
};
const cantonIds = Object.keys(bfsCantonCodes);
const ageCodes = Array.from({ length: 100 }, (_, index) => String(index + 1));

const metadataResponse = await fetch(sourceUrl);
if (!metadataResponse.ok) throw new Error(`BFS metadata request failed with ${metadataResponse.status}`);
const metadata = await metadataResponse.json();
const latestYear = String(Math.max(...metadata.variables.find((variable) => variable.code === "Jahr").values.map(Number)));

const response = await fetch(sourceUrl, {
  body: JSON.stringify({
    query: [
      { code: "Jahr", selection: { filter: "item", values: [latestYear] } },
      { code: "Kanton", selection: { filter: "item", values: cantonIds } },
      { code: "Staatsangehörigkeit (Kategorie)", selection: { filter: "item", values: ["0"] } },
      { code: "Geschlecht", selection: { filter: "item", values: ["0"] } },
      { code: "Alter", selection: { filter: "item", values: ageCodes } },
      { code: "Demografische Komponente", selection: { filter: "item", values: ["14"] } },
    ],
    response: { format: "json-stat2" },
  }),
  headers: { "Content-Type": "application/json" },
  method: "POST",
});

if (!response.ok) throw new Error(`BFS data request failed with ${response.status}`);
const payload = await response.json();
const expectedValues = cantonIds.length * ageCodes.length;
if (payload.value.length !== expectedValues) throw new Error(`Expected ${expectedValues} age values, received ${payload.value.length}`);
if (payload.value.some((value) => !Number.isInteger(value) || value < 0)) throw new Error("Received an invalid age-population value");

const contentHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
const rawDirectory = resolve("data/raw", sourceCode);
const rawPath = resolve(rawDirectory, `${new Date().toISOString().replaceAll(":", "-")}-${contentHash.slice(0, 12)}.json`);
await mkdir(rawDirectory, { recursive: true });
await writeFile(rawPath, `${JSON.stringify(payload)}\n`);

const pool = createDatabasePool();
let runId;
try {
  const sourceClient = await pool.connect();
  let snapshotId;
  try {
    await sourceClient.query("BEGIN");
    const dataset = await sourceClient.query(`
      INSERT INTO source_dataset (code, publisher, title, source_url, license, definition)
      VALUES ($1, 'Bundesamt für Statistik (BFS)', 'Demografische Bilanz nach Alter und Kanton', $2, 'Open Government Data (OGD), CC BY 4.0', 'Ständige Wohnbevölkerung nach Einjahresalter und Kanton.')
      ON CONFLICT (code) DO UPDATE SET source_url = EXCLUDED.source_url
      RETURNING id
    `, [sourceCode, sourceUrl]);
    const snapshot = await sourceClient.query(`
      INSERT INTO source_snapshot (source_dataset_id, reference_date, content_hash, raw_path, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (source_dataset_id, content_hash) DO UPDATE SET raw_path = EXCLUDED.raw_path, metadata = EXCLUDED.metadata
      RETURNING id
    `, [dataset.rows[0].id, `${latestYear}-12-31`, contentHash, rawPath, JSON.stringify({ bfsTable: "px-x-0102020000_104", ageCategories: "0 to 98 and 99_plus", excludedCategory: "Ohne Angabe", expectedCantons: 26 })]);
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
    VALUES ($1, 'scripts/import-age-to-db.mjs', 'running')
    RETURNING id
  `, [snapshotId]);
  runId = importRun.rows[0].id;

  const importClient = await pool.connect();
  try {
    await importClient.query("BEGIN");
    const geoUnits = new Map((await importClient.query("SELECT id, canton_code FROM geo_unit WHERE level = 'canton' AND is_current")).rows.map((row) => [row.canton_code, row.id]));
    if (geoUnits.size !== 26) throw new Error(`Expected 26 imported canton geographies, received ${geoUnits.size}`);
    const metric = await importClient.query("SELECT id FROM metric_definition WHERE code = 'population_age_group'");

    for (const [cantonIndex, cantonId] of cantonIds.entries()) {
      for (const [ageIndex, ageCode] of ageCodes.entries()) {
        const age = ageCode === "100" ? "99_plus" : String(Number(ageCode) - 1);
        const value = payload.value[cantonIndex * ageCodes.length + ageIndex];
        await importClient.query(`
          INSERT INTO observation (geo_unit_id, metric_definition_id, source_snapshot_id, reference_date, value, dimensions)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          ON CONFLICT (geo_unit_id, metric_definition_id, reference_date, dimensions)
          DO UPDATE SET value = EXCLUDED.value, source_snapshot_id = EXCLUDED.source_snapshot_id, updated_at = now()
        `, [geoUnits.get(bfsCantonCodes[cantonId]), metric.rows[0].id, snapshotId, `${latestYear}-12-31`, value, JSON.stringify({ age })]);
      }
    }
    await importClient.query("COMMIT");
  } catch (error) {
    await importClient.query("ROLLBACK");
    throw error;
  } finally {
    importClient.release();
  }

  await pool.query("UPDATE import_run SET status = 'succeeded', completed_at = now(), records_written = $2 WHERE id = $1", [runId, expectedValues]);
  console.log(`Imported ${expectedValues} latest age observations for 26 cantons in ${latestYear}.`);
} catch (error) {
  if (runId) await pool.query("UPDATE import_run SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1", [runId, String(error)]);
  throw error;
} finally {
  await pool.end();
}