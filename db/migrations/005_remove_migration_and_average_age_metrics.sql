WITH removed_metrics AS (
  SELECT id
  FROM metric_definition
  WHERE code IN (
    'migration_in',
    'migration_out',
    'migration_balance',
    'migration_balance_per_1000',
    'migration_in_percent',
    'migration_out_percent',
    'average_age'
  )
)
DELETE FROM derived_observation
WHERE metric_definition_id IN (SELECT id FROM removed_metrics);

WITH removed_metrics AS (
  SELECT id
  FROM metric_definition
  WHERE code IN (
    'migration_in',
    'migration_out',
    'migration_balance',
    'migration_balance_per_1000',
    'migration_in_percent',
    'migration_out_percent',
    'average_age'
  )
)
DELETE FROM observation
WHERE metric_definition_id IN (SELECT id FROM removed_metrics);

DELETE FROM metric_definition
WHERE code IN (
  'migration_in',
  'migration_out',
  'migration_balance',
  'migration_balance_per_1000',
  'migration_in_percent',
  'migration_out_percent',
  'average_age'
);

DELETE FROM import_run
WHERE source_snapshot_id IN (
  SELECT snapshot.id
  FROM source_snapshot snapshot
  JOIN source_dataset dataset ON dataset.id = snapshot.source_dataset_id
  WHERE dataset.code = 'bfs-demographic-balance'
);

DELETE FROM source_snapshot
WHERE source_dataset_id IN (
  SELECT id
  FROM source_dataset
  WHERE code = 'bfs-demographic-balance'
);

DELETE FROM source_dataset
WHERE code = 'bfs-demographic-balance';