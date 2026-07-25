import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDatabasePool } from "./db.mjs";

const sourceUrl = "https://ogd-static.voteinfo-app.ch/v4/ogd/sd-t-17.02-NRW2023-parteien.json";
const sourceCode = "bfs-national-council-election-2023-parties";
const referenceDate = "2023-10-22";
const partyIds = { FDP: 1, SP: 3, SVP: 4, GPS: 13, GLP: 31, Mitte: 34 };
const cantonCodesByNumber = {
  1: "ZH", 2: "BE", 3: "LU", 4: "UR", 5: "SZ", 6: "OW", 7: "NW", 8: "GL", 9: "ZG", 10: "FR", 11: "SO", 12: "BS", 13: "BL",
  14: "SH", 15: "AR", 16: "AI", 17: "SG", 18: "GR", 19: "AG", 20: "TG", 21: "TI", 22: "VD", 23: "VS", 24: "NE", 25: "GE", 26: "JU",
};

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`BFS election JSON request failed with ${response.status}`);

const jsonBuffer = Buffer.from(await response.arrayBuffer());
const contentHash = createHash("sha256").update(jsonBuffer).digest("hex");
const rawDirectory = resolve("data/raw", sourceCode);
const rawPath = resolve(rawDirectory, `${new Date().toISOString().replaceAll(":", "-")}-${contentHash.slice(0, 12)}.json`);
await mkdir(rawDirectory, { recursive: true });
await writeFile(rawPath, jsonBuffer);

const data = JSON.parse(jsonBuffer.toString("utf8"));
if (data.wahl_jahr !== 2023 || !data.stand?.wahl_abgeschlossen || data.stand?.kantone_total !== 26 || data.stand?.kantone_abgeschlossen !== 26) {
  throw new Error("BFS election data is not the final, complete National Council election of 2023");
}

const valuesByPartyAndCanton = new Map(Object.keys(partyIds).map((party) => [party, new Map()]));
const missingCantonsByParty = {};
for (const [party, partyId] of Object.entries(partyIds)) {
  const rows = data.level_kantone.filter((row) => row.partei_id === partyId);
  const seenCantons = new Set();
  for (const row of rows) {
    const cantonCode = cantonCodesByNumber[row.kanton_nummer];
    const value = Number(row.partei_staerke);
    if (!cantonCode || seenCantons.has(cantonCode) || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`Invalid ${party} result for canton number ${row.kanton_nummer}`);
    }
    seenCantons.add(cantonCode);
    valuesByPartyAndCanton.get(party).set(cantonCode, value);
  }
  if (seenCantons.size === 0 || seenCantons.size > 26) throw new Error(`Invalid number of ${party} canton results: ${seenCantons.size}`);
  const missingCantons = Object.values(cantonCodesByNumber).filter((cantonCode) => !seenCantons.has(cantonCode));
  missingCantonsByParty[party] = missingCantons;
  for (const cantonCode of missingCantons) valuesByPartyAndCanton.get(party).set(cantonCode, 0);
}

if ([...valuesByPartyAndCanton.values()].some((values) => values.size !== 26)) throw new Error("Each selected party must have 26 canton values after documented zero-list handling");

const pool = createDatabasePool();
let runId;
try {
  const sourceClient = await pool.connect();
  let snapshotId;
  try {
    await sourceClient.query("BEGIN");
    const dataset = await sourceClient.query(`
      INSERT INTO source_dataset (code, publisher, title, source_url, license, definition)
      VALUES ($1, 'Bundesamt für Statistik (BFS)', 'Eidgenössische Wahlen 2023: Parteistärken Nationalrat nach Kanton', $2, 'OPEN-BY', 'Finale Parteistärken der Nationalratswahl vom 22. Oktober 2023. Nicht kandidierende Parteien werden je Kanton als 0 Prozent dokumentiert.')
      ON CONFLICT (code) DO UPDATE SET source_url = EXCLUDED.source_url
      RETURNING id
    `, [sourceCode, sourceUrl]);
    const snapshot = await sourceClient.query(`
      INSERT INTO source_snapshot (source_dataset_id, reference_date, content_hash, raw_path, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (source_dataset_id, content_hash) DO UPDATE SET raw_path = EXCLUDED.raw_path, metadata = EXCLUDED.metadata
      RETURNING id
    `, [dataset.rows[0].id, referenceDate, contentHash, rawPath, JSON.stringify({ election: "Nationalratswahl 2023", final: data.stand.wahl_abgeschlossen, cantonStatus: data.stand, partyIds, missingCantonsRecordedAsZero: missingCantonsByParty })]);
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
    VALUES ($1, 'scripts/import-national-council-election-to-db.mjs', 'running')
    RETURNING id
  `, [snapshotId]);
  runId = importRun.rows[0].id;

  const importClient = await pool.connect();
  try {
    await importClient.query("BEGIN");
    const geoUnits = new Map((await importClient.query("SELECT id, canton_code FROM geo_unit WHERE level = 'canton' AND is_current")).rows.map((row) => [row.canton_code, row.id]));
    if (geoUnits.size !== 26) throw new Error(`Expected 26 imported canton geographies, received ${geoUnits.size}`);
    const metric = await importClient.query("SELECT id FROM metric_definition WHERE code = 'nc_vote_share'");
    if (metric.rowCount !== 1) throw new Error("Missing nc_vote_share metric definition");

    for (const [party, valuesByCanton] of valuesByPartyAndCanton) {
      for (const [cantonCode, value] of valuesByCanton) {
        await importClient.query(`
          INSERT INTO observation (geo_unit_id, metric_definition_id, source_snapshot_id, reference_date, value, dimensions)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          ON CONFLICT (geo_unit_id, metric_definition_id, reference_date, dimensions)
          DO UPDATE SET value = EXCLUDED.value, source_snapshot_id = EXCLUDED.source_snapshot_id, updated_at = now()
        `, [geoUnits.get(cantonCode), metric.rows[0].id, snapshotId, referenceDate, value, JSON.stringify({ party })]);
      }
    }
    await importClient.query("COMMIT");
  } catch (error) {
    await importClient.query("ROLLBACK");
    throw error;
  } finally {
    importClient.release();
  }

  await pool.query("UPDATE import_run SET status = 'succeeded', completed_at = now(), records_written = 156 WHERE id = $1", [runId]);
  console.log("Imported 156 final BFS National Council 2023 party-share observations.");
} catch (error) {
  if (runId) await pool.query("UPDATE import_run SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1", [runId, String(error)]);
  throw error;
} finally {
  await pool.end();
}