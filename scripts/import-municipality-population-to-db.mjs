import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDatabasePool } from "./db.mjs";

const sourceUrl = "https://www.pxweb.bfs.admin.ch/api/v1/de/px-x-0102020000_201/px-x-0102020000_201.px";
const sourceCode = "bfs-statpop-municipality-population";
const expectedMunicipalityCount = 2134;
const geographyDimension = "Kanton (-) / Bezirk (>>) / Gemeinde (......)";
const metricSelections = [
  { nationality: "0", metric: "population_total" },
  { nationality: "2", metric: "population_foreign" },
];

function valueAt(payload, coordinates) {
  let offset = 0;
  let multiplier = 1;
  for (let index = payload.id.length - 1; index >= 0; index -= 1) {
    const dimension = payload.id[index];
    const coordinate = payload.dimension[dimension].category.index[coordinates[dimension]];
    if (coordinate === undefined) throw new Error(`Missing ${coordinates[dimension]} in ${dimension}`);
    offset += coordinate * multiplier;
    multiplier *= payload.size[index];
  }
  return payload.value[offset];
}

const metadataResponse = await fetch(sourceUrl);
if (!metadataResponse.ok) throw new Error(`BFS metadata request failed with ${metadataResponse.status}`);
const metadata = await metadataResponse.json();
const latestYear = String(Math.max(...metadata.variables.find((variable) => variable.code === "Jahr").values.map(Number)));
const geography = metadata.variables.find((variable) => variable.code === geographyDimension);
if (!geography) throw new Error("BFS metadata no longer exposes the expected municipality dimension");

const municipalitySourceIds = geography.values.filter((_, index) => geography.valueTexts[index].startsWith("......"));
const municipalities = geography.valueTexts.flatMap((valueText, index) => {
  const match = valueText.match(/^\.\.\.\.\.\.(\d{4}) /);
  return match ? [{ bfsNumber: match[1], sourceId: geography.values[index] }] : [];
});
if (municipalities.length !== expectedMunicipalityCount) throw new Error(`Expected ${expectedMunicipalityCount} municipality source IDs, received ${municipalities.length}`);

const response = await fetch(sourceUrl, {
  body: JSON.stringify({
    query: [
      { code: "Jahr", selection: { filter: "item", values: [latestYear] } },
      { code: geographyDimension, selection: { filter: "item", values: municipalitySourceIds } },
      { code: "Staatsangehörigkeit (Kategorie)", selection: { filter: "item", values: metricSelections.map(({ nationality }) => nationality) } },
      { code: "Geschlecht", selection: { filter: "item", values: ["0"] } },
      { code: "Demografische Komponente", selection: { filter: "item", values: ["16"] } },
    ],
    response: { format: "json-stat2" },
  }),
  headers: { "Content-Type": "application/json" },
  method: "POST",
});
if (!response.ok) throw new Error(`BFS data request failed with ${response.status}`);
const payload = await response.json();
const payloadBuffer = Buffer.from(JSON.stringify(payload));
const contentHash = createHash("sha256").update(payloadBuffer).digest("hex");
const retrievedAt = new Date();
const rawDirectory = resolve("data/raw", sourceCode);
const rawPath = resolve(rawDirectory, `${retrievedAt.toISOString().replaceAll(":", "-")}-${contentHash.slice(0, 12)}.json`);
await mkdir(rawDirectory, { recursive: true });
await writeFile(rawPath, payloadBuffer);

const expectedValues = expectedMunicipalityCount * metricSelections.length;
if (payload.value.length !== expectedValues) throw new Error(`Expected ${expectedValues} municipality population values, received ${payload.value.length}`);

const rows = municipalities.flatMap(({ bfsNumber, sourceId }) => metricSelections.map(({ nationality, metric }) => {
  const value = valueAt(payload, {
    Jahr: latestYear,
    [geographyDimension]: sourceId,
    "Staatsangehörigkeit (Kategorie)": nationality,
    Geschlecht: "0",
    "Demografische Komponente": "16",
  });
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid ${metric} value for municipality ${bfsNumber}`);
  return { bfsNumber, metric, value };
}));
const inactiveBfsNumbers = rows
  .filter((row) => row.metric === "population_total" && row.value === 0)
  .map((row) => row.bfsNumber);

const pool = createDatabasePool();
let runId;
try {
  const sourceClient = await pool.connect();
  let snapshotId;
  try {
    await sourceClient.query("BEGIN");
    const dataset = await sourceClient.query(`
      INSERT INTO source_dataset (code, publisher, title, source_url, license, definition)
      VALUES ($1, 'Bundesamt für Statistik (BFS)', 'Demografische Bilanz nach Gemeinde', $2, 'Open Government Data (OGD), CC BY 4.0', 'Ständige Wohnbevölkerung und ausländische ständige Wohnbevölkerung nach aktueller BFS-Gemeinde, jeweils am 31. Dezember.')
      ON CONFLICT (code) DO UPDATE SET source_url = EXCLUDED.source_url
      RETURNING id
    `, [sourceCode, sourceUrl]);
    const snapshot = await sourceClient.query(`
      INSERT INTO source_snapshot (source_dataset_id, reference_date, content_hash, raw_path, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (source_dataset_id, content_hash) DO UPDATE SET raw_path = EXCLUDED.raw_path, metadata = EXCLUDED.metadata
      RETURNING id
    `, [dataset.rows[0].id, `${latestYear}-12-31`, contentHash, rawPath, JSON.stringify({ bfsTable: "px-x-0102020000_201", expectedMunicipalities: expectedMunicipalityCount, metrics: metricSelections.map(({ metric }) => metric) })]);
    snapshotId = snapshot.rows[0].id;
    await sourceClient.query("COMMIT");
  } catch (error) {
    await sourceClient.query("ROLLBACK");
    throw error;
  } finally {
    sourceClient.release();
  }

  const importRun = await pool.query(`INSERT INTO import_run (source_snapshot_id, importer, status) VALUES ($1, 'scripts/import-municipality-population-to-db.mjs', 'running') RETURNING id`, [snapshotId]);
  runId = importRun.rows[0].id;
  const importClient = await pool.connect();
  try {
    await importClient.query("BEGIN");
    const geoUnits = new Map((await importClient.query("SELECT id, bfs_number FROM geo_unit WHERE level = 'municipality' AND is_current")).rows.map((row) => [row.bfs_number, row.id]));
    if (geoUnits.size !== expectedMunicipalityCount) throw new Error("Current municipality geography must be imported before municipality observations");
    const metrics = new Map((await importClient.query("SELECT id, code FROM metric_definition WHERE code = ANY($1)", [metricSelections.map(({ metric }) => metric)])).rows.map((row) => [row.code, row.id]));
    const write = await importClient.query(`
      INSERT INTO observation (geo_unit_id, metric_definition_id, source_snapshot_id, reference_date, value)
      SELECT geo_unit_id, metric_definition_id, $1, $2, value
      FROM unnest($3::bigint[], $4::bigint[], $5::numeric[]) AS item(geo_unit_id, metric_definition_id, value)
      ON CONFLICT (geo_unit_id, metric_definition_id, reference_date, dimensions)
      DO UPDATE SET value = EXCLUDED.value, source_snapshot_id = EXCLUDED.source_snapshot_id, updated_at = now()
    `, [snapshotId, `${latestYear}-12-31`, rows.map((row) => geoUnits.get(row.bfsNumber)), rows.map((row) => metrics.get(row.metric)), rows.map((row) => row.value)]);
    if (write.rowCount !== expectedValues) throw new Error(`Expected ${expectedValues} municipality observations, wrote ${write.rowCount}`);
    if (inactiveBfsNumbers.length > 0) {
      await importClient.query(`
        UPDATE geo_unit
        SET is_current = false, updated_at = now()
        WHERE level = 'municipality' AND bfs_number = ANY($1::text[])
      `, [inactiveBfsNumbers]);
    }
    await importClient.query("COMMIT");
  } catch (error) {
    await importClient.query("ROLLBACK");
    throw error;
  } finally {
    importClient.release();
  }

  await pool.query("UPDATE import_run SET status = 'succeeded', completed_at = now(), records_written = $2 WHERE id = $1", [runId, expectedValues]);
  console.log(`Imported ${expectedValues} latest municipality population observations for ${expectedMunicipalityCount - inactiveBfsNumbers.length} current municipalities in ${latestYear}.`);
} catch (error) {
  if (runId) await pool.query("UPDATE import_run SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1", [runId, String(error)]);
  throw error;
} finally {
  await pool.end();
}