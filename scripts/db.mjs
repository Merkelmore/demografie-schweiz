import pg from "pg";

const { Pool } = pg;

function poolMax() {
  const configuredValue = Number.parseInt(process.env.PG_POOL_MAX ?? "3", 10);
  return Number.isSafeInteger(configuredValue) && configuredValue > 0 ? configuredValue : 3;
}

function defaultConnectionString() {
  const user = process.env.PGUSER ?? process.env.POSTGRES_USER ?? "demografie";
  const password = process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD ?? "demografie-dev-only";
  const host = process.env.PGHOST ?? "localhost";
  const port = process.env.PGPORT ?? process.env.POSTGRES_PORT ?? "5432";
  const database = process.env.PGDATABASE ?? process.env.POSTGRES_DB ?? "demografie";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function createDatabasePool() {
  const configuredUrl = process.env.DATABASE_URL;
  if (configuredUrl) {
    const parsedUrl = new URL(configuredUrl);
    if (process.env.NODE_ENV === "production") parsedUrl.searchParams.set("sslmode", "require");
    return new Pool({
      connectionString: parsedUrl.toString(),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: poolMax(),
    });
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be set in production.");
  }

  return new Pool({
    connectionString: defaultConnectionString(),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: poolMax(),
  });
}