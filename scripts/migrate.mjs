import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createDatabasePool } from "./db.mjs";

const migrationsDirectory = resolve("db/migrations");
const showStatus = process.argv.includes("--status");
const pool = createDatabasePool();

function checksumFor(sql) {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

function hasLegacyLineEndingChecksum(recordedChecksum, sql) {
  const normalizedSql = sql.replace(/\r\n/g, "\n");
  const crlfChecksum = createHash("sha256").update(normalizedSql.replace(/\n/g, "\r\n")).digest("hex");
  return recordedChecksum === crlfChecksum;
}

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  const applied = new Map((await pool.query("SELECT filename, checksum FROM schema_migration")).rows.map((row) => [row.filename, row.checksum]));

  if (showStatus) {
    for (const filename of migrationFiles) {
      console.log(`${applied.has(filename) ? "applied" : "pending"}  ${filename}`);
    }
    return;
  }

  for (const filename of migrationFiles) {
    const sql = await readFile(resolve(migrationsDirectory, filename), "utf8");
    const checksum = checksumFor(sql);
    const recordedChecksum = applied.get(filename);

    if (recordedChecksum) {
      if (recordedChecksum === checksum) continue;
      if (!hasLegacyLineEndingChecksum(recordedChecksum, sql)) {
        throw new Error(`Migration changed after application: ${filename}`);
      }
      await pool.query("UPDATE schema_migration SET checksum = $2 WHERE filename = $1", [filename, checksum]);
      console.log(`Normalized checksum for ${filename}`);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migration (filename, checksum) VALUES ($1, $2)", [filename, checksum]);
      await client.query("COMMIT");
      console.log(`Applied ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

try {
  await run();
} catch (error) {
  if (error?.code === "ECONNREFUSED") {
    console.error("Database unavailable. Install and start Docker Desktop, then run: docker compose up -d");
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}