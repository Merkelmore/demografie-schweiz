import { createDatabasePool } from "./db.mjs";

const pool = createDatabasePool();
const nationalPoliticalReferenceScore = 0.170624250654;

try {
  const nationalityResult = await pool.query(`
    INSERT INTO derived_observation (
      geo_unit_id,
      metric_definition_id,
      reference_date,
      value,
      calculation_definition,
      source_observation_ids
    )
    SELECT
      foreign_population.geo_unit_id,
      derived_metric.id,
      foreign_population.reference_date,
      (foreign_population.value / population.value) * 100,
      'population_foreign / population_total * 100',
      ARRAY[foreign_population.id, population.id]
    FROM observation foreign_population
    JOIN metric_definition foreign_metric ON foreign_metric.id = foreign_population.metric_definition_id AND foreign_metric.code = 'population_foreign'
    JOIN observation population ON population.geo_unit_id = foreign_population.geo_unit_id AND population.reference_date = foreign_population.reference_date
    JOIN metric_definition population_metric ON population_metric.id = population.metric_definition_id AND population_metric.code = 'population_total'
    JOIN metric_definition derived_metric ON derived_metric.code = 'population_foreign_percent'
    WHERE population.value > 0
    ON CONFLICT (geo_unit_id, metric_definition_id, reference_date, dimensions)
    DO UPDATE SET
      value = EXCLUDED.value,
      calculation_definition = EXCLUDED.calculation_definition,
      source_observation_ids = EXCLUDED.source_observation_ids,
      updated_at = now()
  `);
  if (nationalityResult.rowCount < 26) throw new Error(`Expected at least 26 derived foreign-population shares, wrote ${nationalityResult.rowCount}`);

  const crimeRateResult = await pool.query(`
    INSERT INTO derived_observation (
      geo_unit_id,
      metric_definition_id,
      reference_date,
      value,
      calculation_definition,
      source_observation_ids
    )
    SELECT
      crime.geo_unit_id,
      derived_metric.id,
      crime.reference_date,
      (crime.value / population.value) * 100000,
      'crime_total ' || crime.reference_date::text || ' / population_total ' || population.reference_date::text || ' * 100000',
      ARRAY[crime.id, population.id]
    FROM observation crime
    JOIN metric_definition crime_metric ON crime_metric.id = crime.metric_definition_id AND crime_metric.code = 'crime_total'
    JOIN LATERAL (
      SELECT population.*
      FROM observation population
      JOIN metric_definition population_metric ON population_metric.id = population.metric_definition_id AND population_metric.code = 'population_total'
      WHERE population.geo_unit_id = crime.geo_unit_id
      ORDER BY population.reference_date DESC
      LIMIT 1
    ) population ON true
    JOIN metric_definition derived_metric ON derived_metric.code = 'crime_per_100000'
    WHERE population.value > 0
    ON CONFLICT (geo_unit_id, metric_definition_id, reference_date, dimensions)
    DO UPDATE SET
      value = EXCLUDED.value,
      calculation_definition = EXCLUDED.calculation_definition,
      source_observation_ids = EXCLUDED.source_observation_ids,
      updated_at = now()
  `);
  if (crimeRateResult.rowCount !== 26) throw new Error(`Expected 26 derived PKS rates, wrote ${crimeRateResult.rowCount}`);

  const asylumRateResult = await pool.query(`
    INSERT INTO derived_observation (
      geo_unit_id,
      metric_definition_id,
      reference_date,
      value,
      calculation_definition,
      source_observation_ids
    )
    SELECT
      asylum.geo_unit_id,
      derived_metric.id,
      asylum.reference_date,
      (asylum.value / population.value) * 1000,
      'asylum_pending ' || asylum.reference_date::text || ' / population_total ' || population.reference_date::text || ' * 1000',
      ARRAY[asylum.id, population.id]
    FROM observation asylum
    JOIN metric_definition asylum_metric ON asylum_metric.id = asylum.metric_definition_id AND asylum_metric.code = 'asylum_pending'
    JOIN LATERAL (
      SELECT population.*
      FROM observation population
      JOIN metric_definition population_metric ON population_metric.id = population.metric_definition_id AND population_metric.code = 'population_total'
      WHERE population.geo_unit_id = asylum.geo_unit_id
      ORDER BY population.reference_date DESC
      LIMIT 1
    ) population ON true
    JOIN metric_definition derived_metric ON derived_metric.code = 'asylum_pending_per_1000'
    WHERE population.value > 0
    ON CONFLICT (geo_unit_id, metric_definition_id, reference_date, dimensions)
    DO UPDATE SET
      value = EXCLUDED.value,
      calculation_definition = EXCLUDED.calculation_definition,
      source_observation_ids = EXCLUDED.source_observation_ids,
      updated_at = now()
  `);
  if (asylumRateResult.rowCount !== 26) throw new Error(`Expected 26 derived asylum rates, wrote ${asylumRateResult.rowCount}`);

  const politicalScoreResult = await pool.query(`
    WITH party_shares AS (
      SELECT
        observation.geo_unit_id,
        observation.reference_date,
        max(observation.value) FILTER (WHERE observation.dimensions->>'party' = 'SVP') AS svp,
        max(observation.value) FILTER (WHERE observation.dimensions->>'party' = 'FDP') AS fdp,
        max(observation.value) FILTER (WHERE observation.dimensions->>'party' = 'GLP') AS glp,
        max(observation.value) FILTER (WHERE observation.dimensions->>'party' = 'GPS') AS gps,
        max(observation.value) FILTER (WHERE observation.dimensions->>'party' = 'SP') AS sp,
        max(observation.value) FILTER (WHERE observation.dimensions->>'party' = 'Mitte') AS mitte,
        array_agg(observation.id ORDER BY observation.id) AS source_observation_ids
      FROM observation
      JOIN metric_definition metric ON metric.id = observation.metric_definition_id AND metric.code = 'nc_vote_share'
      WHERE observation.dimensions->>'party' IN ('SVP', 'FDP', 'GLP', 'GPS', 'SP', 'Mitte')
      GROUP BY observation.geo_unit_id, observation.reference_date
      HAVING count(*) = 6
    )
    INSERT INTO derived_observation (
      geo_unit_id,
      metric_definition_id,
      reference_date,
      value,
      calculation_definition,
      source_observation_ids
    )
    SELECT
      party_shares.geo_unit_id,
      derived_metric.id,
      party_shares.reference_date,
      (party_shares.svp + 0.5 * party_shares.fdp + 0.5 * party_shares.glp - 0.5 * party_shares.gps - party_shares.sp)
        / NULLIF(party_shares.svp + party_shares.fdp + party_shares.glp + party_shares.mitte + party_shares.gps + party_shares.sp, 0)
        - $1::numeric,
      '(SVP + 0.5 * FDP + 0.5 * GLP - 0.5 * GPS - SP) / (SVP + FDP + GLP + Mitte + GPS + SP) - 0.170624250654; 0 equals the final Swiss National Council result of 2023; absent cantonal party lists are recorded as 0%',
      party_shares.source_observation_ids
    FROM party_shares
    JOIN metric_definition derived_metric ON derived_metric.code = 'political_orientation_score'
    ON CONFLICT (geo_unit_id, metric_definition_id, reference_date, dimensions)
    DO UPDATE SET
      value = EXCLUDED.value,
      calculation_definition = EXCLUDED.calculation_definition,
      source_observation_ids = EXCLUDED.source_observation_ids,
      updated_at = now()
  `, [nationalPoliticalReferenceScore]);
  if (politicalScoreResult.rowCount !== 26) throw new Error(`Expected 26 derived political scores, wrote ${politicalScoreResult.rowCount}`);

  const culturalEnrichmentResult = await pool.query(`
    WITH latest_values AS (
      SELECT DISTINCT ON (derived.geo_unit_id, metric.code)
        derived.geo_unit_id,
        metric.code,
        derived.value,
        derived.reference_date,
        derived.source_observation_ids
      FROM derived_observation derived
      JOIN metric_definition metric ON metric.id = derived.metric_definition_id
      WHERE metric.code IN ('crime_per_100000', 'asylum_pending_per_1000', 'population_foreign_percent')
      ORDER BY derived.geo_unit_id, metric.code, derived.reference_date DESC
    ),
    latest_unemployment AS (
      SELECT DISTINCT ON (observation.geo_unit_id)
        observation.geo_unit_id,
        observation.value,
        observation.reference_date,
        ARRAY[observation.id] AS source_observation_ids
      FROM observation
      JOIN metric_definition metric ON metric.id = observation.metric_definition_id
      WHERE metric.code = 'unemployment_rate'
      ORDER BY observation.geo_unit_id, observation.reference_date DESC
    ),
    components AS (
      SELECT
        crime.geo_unit_id,
        crime.value AS crime_value,
        asylum.value AS asylum_value,
        foreign_population.value AS foreign_population_value,
        unemployment.value AS unemployment_value,
        greatest(crime.reference_date, asylum.reference_date, foreign_population.reference_date, unemployment.reference_date) AS reference_date,
        crime.source_observation_ids || asylum.source_observation_ids || foreign_population.source_observation_ids || unemployment.source_observation_ids AS source_observation_ids
      FROM latest_values crime
      JOIN latest_values asylum ON asylum.geo_unit_id = crime.geo_unit_id AND asylum.code = 'asylum_pending_per_1000'
      JOIN latest_values foreign_population ON foreign_population.geo_unit_id = crime.geo_unit_id AND foreign_population.code = 'population_foreign_percent'
      JOIN latest_unemployment unemployment ON unemployment.geo_unit_id = crime.geo_unit_id
      WHERE crime.code = 'crime_per_100000'
    ),
    bounds AS (
      SELECT
        min(crime_value) AS crime_min,
        max(crime_value) AS crime_max,
        min(asylum_value) AS asylum_min,
        max(asylum_value) AS asylum_max,
        min(foreign_population_value) AS foreign_population_min,
        max(foreign_population_value) AS foreign_population_max,
        min(unemployment_value) AS unemployment_min,
        max(unemployment_value) AS unemployment_max
      FROM components
    )
    INSERT INTO derived_observation (
      geo_unit_id,
      metric_definition_id,
      reference_date,
      value,
      calculation_definition,
      source_observation_ids
    )
    SELECT
      components.geo_unit_id,
      derived_metric.id,
      components.reference_date,
      25 * (
        (components.crime_value - bounds.crime_min) / NULLIF(bounds.crime_max - bounds.crime_min, 0)
        + (components.asylum_value - bounds.asylum_min) / NULLIF(bounds.asylum_max - bounds.asylum_min, 0)
        + (components.foreign_population_value - bounds.foreign_population_min) / NULLIF(bounds.foreign_population_max - bounds.foreign_population_min, 0)
        + (components.unemployment_value - bounds.unemployment_min) / NULLIF(bounds.unemployment_max - bounds.unemployment_min, 0)
      ),
      'CES = 25 * (n(crime_per_100000) + n(asylum_pending_per_1000) + n(population_foreign_percent) + n(unemployment_rate)); min-max bounds: crime [' || bounds.crime_min || ', ' || bounds.crime_max || '], asylum [' || bounds.asylum_min || ', ' || bounds.asylum_max || '], foreign population [' || bounds.foreign_population_min || ', ' || bounds.foreign_population_max || '], unemployment [' || bounds.unemployment_min || ', ' || bounds.unemployment_max || ']; reference dates: crime 2025-12-31, asylum 2026-06-30, foreign population 2024-12-31, unemployment 2024-12-31',
      components.source_observation_ids
    FROM components
    CROSS JOIN bounds
    JOIN metric_definition derived_metric ON derived_metric.code = 'cultural_enrichment_score'
    ON CONFLICT (geo_unit_id, metric_definition_id, reference_date, dimensions)
    DO UPDATE SET
      value = EXCLUDED.value,
      calculation_definition = EXCLUDED.calculation_definition,
      source_observation_ids = EXCLUDED.source_observation_ids,
      updated_at = now()
  `);
  if (culturalEnrichmentResult.rowCount !== 25) throw new Error(`Expected 25 cultural enrichment scores, wrote ${culturalEnrichmentResult.rowCount}`);

  console.log(`Derived ${nationalityResult.rowCount} foreign-population shares, ${crimeRateResult.rowCount} PKS rates, ${asylumRateResult.rowCount} asylum rates, ${politicalScoreResult.rowCount} political scores and ${culturalEnrichmentResult.rowCount} cultural enrichment scores.`);
} finally {
  await pool.end();
}