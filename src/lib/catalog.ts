import { Pool } from "pg";

type GeoRow = {
  bfs_number: string | null;
  canton_code: string;
  id: string;
  level: "canton" | "municipality";
  name_de: string;
};

type MetricRow = {
  availability_note: string | null;
  calculation_definition: string | null;
  code: string;
  description: string;
  name_de: string;
  reference_date: string | null;
  source_title: string | null;
  source_url: string | null;
  unit: "count" | "percent" | "per_1000" | "per_100000" | "births_per_woman" | "score";
  value: string | null;
};

const validMapMetrics = new Set([
  "population_total",
  "population_foreign_percent",
  "crime_per_100000",
  "asylum_pending_per_1000",
  "fertility_tfr",
  "unemployment_rate",
  "political_orientation_score",
  "cultural_enrichment_score",
]);

const globalForCatalog = globalThis as unknown as { catalogPool?: Pool };

function poolMax() {
  const configuredValue = Number.parseInt(process.env.PG_POOL_MAX ?? "5", 10);
  return Number.isSafeInteger(configuredValue) && configuredValue > 0 ? configuredValue : 5;
}

function databaseUrl() {
  const configuredUrl = process.env.DATABASE_URL;
  if (configuredUrl) {
    if (process.env.NODE_ENV !== "production") return configuredUrl;

    const parsedUrl = new URL(configuredUrl);
    parsedUrl.searchParams.set("sslmode", "verify-full");
    parsedUrl.searchParams.set(
      "sslrootcert",
      process.env.PG_SSL_ROOT_CERT ?? "/app/certs/supabase-prod-ca-2021.crt",
    );
    parsedUrl.searchParams.set("uselibpqcompat", "true");
    return parsedUrl.toString();
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be set in production.");
  }

  const user = process.env.PGUSER ?? process.env.POSTGRES_USER ?? "demografie";
  const password = process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD ?? "demografie-dev-only";
  const host = process.env.PGHOST ?? "localhost";
  const port = process.env.PGPORT ?? process.env.POSTGRES_PORT ?? "5432";
  const database = process.env.PGDATABASE ?? process.env.POSTGRES_DB ?? "demografie";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function pool() {
  if (!globalForCatalog.catalogPool) {
    globalForCatalog.catalogPool = new Pool({
      connectionString: databaseUrl(),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: poolMax(),
    });
  }
  return globalForCatalog.catalogPool;
}

function unavailableReason(level: GeoRow["level"], metric: Pick<MetricRow, "availability_note">) {
  if (level === "municipality") {
    return "Für diese Gemeinde liegt im lokalen Katalog noch kein landesweit vergleichbarer amtlicher Wert vor.";
  }
  return metric.availability_note ?? "Diese Kennzahl wurde für die Kantonsebene noch nicht importiert.";
}

export type CatalogResponse = {
  ageGroups: Array<{ label: string; referenceDate: string; value: number }>;
  cantons: Array<{ code: string; name: string }>;
  election: { partyShares: Partial<Record<"FDP" | "GLP" | "GPS" | "Mitte" | "SP" | "SVP", number>>; referenceDate: string | null };
  map: { metric: string; referenceDate: string | null; values: Record<string, number> };
  metrics: Array<{
    availabilityNote: string | null;
    calculationDefinition: string | null;
    code: string;
    description: string;
    name: string;
    referenceDate: string | null;
    source: { title: string; url: string } | null;
    unavailableReason: string | null;
    unit: MetricRow["unit"];
    value: number | null;
  }>;
  municipalities: Array<{ bfsNumber: string; name: string }>;
  selectedGeo: { bfsNumber: string | null; cantonCode: string; level: GeoRow["level"]; name: string };
};

export type CantonCardResponse = Pick<CatalogResponse, "election" | "selectedGeo"> & {
  metrics: Array<Pick<CatalogResponse["metrics"][number], "code" | "unavailableReason" | "unit" | "value">>;
};
export type MapResponse = CatalogResponse["map"];

function normalizedMapMetric(requestedMapMetric: string) {
  return validMapMetrics.has(requestedMapMetric) ? requestedMapMetric : "population_total";
}

async function getMetrics(database: Pool, selectedGeo: GeoRow): Promise<CatalogResponse["metrics"]> {
  const metricsResult = await database.query<MetricRow>(`
    SELECT
      metric.code,
      metric.name_de,
      metric.unit,
      metric.description,
      metric.availability_note,
      latest.value,
      latest.reference_date,
      latest.source_title,
      latest.source_url,
      latest.calculation_definition
    FROM metric_definition metric
    LEFT JOIN LATERAL (
      SELECT *
      FROM (
        SELECT
          observation.value,
          observation.reference_date::text AS reference_date,
          dataset.title AS source_title,
          dataset.source_url,
          NULL::text AS calculation_definition
        FROM observation
        JOIN source_snapshot snapshot ON snapshot.id = observation.source_snapshot_id
        JOIN source_dataset dataset ON dataset.id = snapshot.source_dataset_id
        WHERE observation.geo_unit_id = $1
          AND observation.metric_definition_id = metric.id
          AND observation.dimensions = '{}'::jsonb
        UNION ALL
        SELECT
          derived.value,
          derived.reference_date::text AS reference_date,
          'Berechnete Kennzahl' AS source_title,
          NULL::text AS source_url,
          derived.calculation_definition
        FROM derived_observation derived
        WHERE derived.geo_unit_id = $1
          AND derived.metric_definition_id = metric.id
          AND derived.dimensions = '{}'::jsonb
      ) values_for_metric
      ORDER BY reference_date DESC
      LIMIT 1
    ) latest ON true
    WHERE metric.code NOT IN ('population_age_group', 'nc_vote_share')
    ORDER BY metric.name_de
  `, [selectedGeo.id]);

  return metricsResult.rows.map((metric) => ({
    availabilityNote: metric.availability_note,
    calculationDefinition: metric.calculation_definition,
    code: metric.code,
    description: metric.description,
    name: metric.name_de,
    referenceDate: metric.reference_date,
    source: metric.source_title ? { title: metric.source_title, url: metric.source_url ?? "" } : null,
    unavailableReason: metric.value === null ? unavailableReason(selectedGeo.level, metric) : null,
    unit: metric.unit,
    value: metric.value === null ? null : Number(metric.value),
  }));
}
  async function getCardMetrics(database: Pool, selectedGeo: GeoRow): Promise<CantonCardResponse["metrics"]> {
    const metricsResult = await database.query<Pick<MetricRow, "availability_note" | "code" | "unit" | "value">>(`
      SELECT metric.code, metric.unit, metric.availability_note, latest.value
      FROM metric_definition metric
      LEFT JOIN LATERAL (
        SELECT value
        FROM (
          SELECT observation.value, observation.reference_date
          FROM observation
          WHERE observation.geo_unit_id = $1
            AND observation.metric_definition_id = metric.id
            AND observation.dimensions = '{}'::jsonb
          UNION ALL
          SELECT derived.value, derived.reference_date
          FROM derived_observation derived
          WHERE derived.geo_unit_id = $1
            AND derived.metric_definition_id = metric.id
            AND derived.dimensions = '{}'::jsonb
        ) values_for_metric
        ORDER BY reference_date DESC
        LIMIT 1
      ) latest ON true
      WHERE metric.code NOT IN ('population_age_group', 'nc_vote_share')
      ORDER BY metric.name_de
    `, [selectedGeo.id]);

    return metricsResult.rows.map((metric) => ({
      code: metric.code,
      unavailableReason: metric.value === null ? unavailableReason(selectedGeo.level, metric) : null,
      unit: metric.unit,
      value: metric.value === null ? null : Number(metric.value),
    }));
  }

async function getElection(database: Pool, geoUnitId: string): Promise<CatalogResponse["election"]> {
  const electionResult = await database.query<{ party: "FDP" | "GLP" | "GPS" | "Mitte" | "SP" | "SVP"; reference_date: string; value: string }>(`
    SELECT DISTINCT ON (observation.dimensions->>'party')
      observation.dimensions->>'party' AS party,
      observation.reference_date::text AS reference_date,
      observation.value
    FROM observation
    JOIN metric_definition metric ON metric.id = observation.metric_definition_id
    WHERE observation.geo_unit_id = $1
      AND metric.code = 'nc_vote_share'
      AND observation.dimensions->>'party' IN ('FDP', 'GLP', 'GPS', 'Mitte', 'SP', 'SVP')
    ORDER BY observation.dimensions->>'party', observation.reference_date DESC
  `, [geoUnitId]);
  const referenceDates = new Set(electionResult.rows.map((row) => row.reference_date));

  return {
    partyShares: Object.fromEntries(electionResult.rows.map((row) => [row.party, Number(row.value)])),
    referenceDate: referenceDates.size === 1 ? [...referenceDates][0] ?? null : null,
  };
}

export async function getMap(requestedMapMetric: string): Promise<MapResponse> {
  const database = pool();
  const metric = normalizedMapMetric(requestedMapMetric);
  const mapResult = await database.query<{ canton_code: string; reference_date: string | null; value: string | null }>(`
    SELECT canton.canton_code, latest.value, latest.reference_date
    FROM geo_unit canton
    LEFT JOIN LATERAL (
      SELECT value, reference_date
      FROM (
        SELECT observation.value, observation.reference_date::text AS reference_date
        FROM observation
        JOIN metric_definition metric ON metric.id = observation.metric_definition_id
        WHERE observation.geo_unit_id = canton.id
          AND metric.code = $1
          AND observation.dimensions = '{}'::jsonb
        UNION ALL
        SELECT derived.value, derived.reference_date::text AS reference_date
        FROM derived_observation derived
        JOIN metric_definition metric ON metric.id = derived.metric_definition_id
        WHERE derived.geo_unit_id = canton.id
          AND metric.code = $1
          AND derived.dimensions = '{}'::jsonb
      ) values_for_canton
      ORDER BY reference_date DESC
      LIMIT 1
    ) latest ON true
    WHERE canton.level = 'canton' AND canton.is_current
    ORDER BY canton.canton_code
  `, [metric]);
  const referenceDates = new Set(mapResult.rows.map((row) => row.reference_date).filter(Boolean));

  return {
    metric,
    referenceDate: referenceDates.size === 1 ? [...referenceDates][0] ?? null : null,
    values: Object.fromEntries(mapResult.rows.filter((row) => row.value !== null).map((row) => [row.canton_code, Number(row.value)])),
  };
}

export async function getCantonCard(cantonCode: string): Promise<CantonCardResponse | null> {
  const database = pool();
  const selectedGeoResult = await database.query<GeoRow>(`
    SELECT id, level, bfs_number, canton_code, name_de
    FROM geo_unit
    WHERE level = 'canton' AND canton_code = $1 AND is_current
  `, [cantonCode.toUpperCase()]);
  const selectedGeo = selectedGeoResult.rows[0];
  if (!selectedGeo) return null;

    const [metrics, election] = await Promise.all([getCardMetrics(database, selectedGeo), getElection(database, selectedGeo.id)]);
  return {
    election,
    metrics,
    selectedGeo: {
      bfsNumber: selectedGeo.bfs_number,
      cantonCode: selectedGeo.canton_code,
      level: selectedGeo.level,
      name: selectedGeo.name_de,
    },
  };
}

export async function getCatalog(cantonCode: string, municipalityBfsNumber: string | null, requestedMapMetric: string): Promise<CatalogResponse | null> {
  const database = pool();
  const normalizedCantonCode = cantonCode.toUpperCase();
  const selectedGeoResult = municipalityBfsNumber
    ? await database.query<GeoRow>(`
        SELECT id, level, bfs_number, canton_code, name_de
        FROM geo_unit
        WHERE level = 'municipality' AND bfs_number = $1 AND canton_code = $2 AND is_current
      `, [municipalityBfsNumber, normalizedCantonCode])
    : await database.query<GeoRow>(`
        SELECT id, level, bfs_number, canton_code, name_de
        FROM geo_unit
        WHERE level = 'canton' AND canton_code = $1 AND is_current
      `, [normalizedCantonCode]);

  const selectedGeo = selectedGeoResult.rows[0];
  if (!selectedGeo) return null;

  const [cantonsResult, municipalitiesResult, metrics, map, ageGroupsResult, election] = await Promise.all([
    database.query<Pick<GeoRow, "canton_code" | "name_de">>(`
      SELECT canton_code, name_de
      FROM geo_unit
      WHERE level = 'canton' AND is_current
      ORDER BY canton_code
    `),
    database.query<Pick<GeoRow, "bfs_number" | "name_de">>(`
      SELECT bfs_number, name_de
      FROM geo_unit
      WHERE level = 'municipality' AND canton_code = $1 AND is_current
      ORDER BY name_de
    `, [normalizedCantonCode]),
    getMetrics(database, selectedGeo),
    getMap(requestedMapMetric),
    database.query<{ age_group: string; reference_date: string; value: string }>(`
      SELECT
        CASE
          WHEN observation.dimensions->>'age' = '99_plus' OR (observation.dimensions->>'age')::integer >= 65 THEN '65_plus'
          WHEN (observation.dimensions->>'age')::integer >= 20 THEN '20_64'
          ELSE '0_19'
        END AS age_group,
        observation.reference_date::text AS reference_date,
        sum(observation.value) AS value
      FROM observation
      JOIN metric_definition metric ON metric.id = observation.metric_definition_id
      WHERE observation.geo_unit_id = $1 AND metric.code = 'population_age_group'
      GROUP BY age_group, observation.reference_date
      ORDER BY observation.reference_date DESC, age_group
    `, [selectedGeo.id]),
    getElection(database, selectedGeo.id),
  ]);

  return {
    ageGroups: ageGroupsResult.rows.map((row) => ({
      label: row.age_group === '0_19' ? '0 bis 19 Jahre' : row.age_group === '20_64' ? '20 bis 64 Jahre' : '65 Jahre und älter',
      referenceDate: row.reference_date,
      value: Number(row.value),
    })),
    cantons: cantonsResult.rows.map((row) => ({ code: row.canton_code, name: row.name_de })),
    election,
    map,
    metrics,
    municipalities: municipalitiesResult.rows.flatMap((row) => row.bfs_number ? [{ bfsNumber: row.bfs_number, name: row.name_de }] : []),
    selectedGeo: {
      bfsNumber: selectedGeo.bfs_number,
      cantonCode: selectedGeo.canton_code,
      level: selectedGeo.level,
      name: selectedGeo.name_de,
    },
  };
}