CREATE TABLE geo_unit (
  id bigserial PRIMARY KEY,
  level text NOT NULL CHECK (level IN ('canton', 'municipality')),
  bfs_number text,
  canton_code text NOT NULL,
  name_de text NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level, bfs_number)
);

CREATE UNIQUE INDEX geo_unit_current_canton_code_key
  ON geo_unit (canton_code)
  WHERE level = 'canton' AND is_current;

CREATE INDEX geo_unit_current_municipality_canton_index
  ON geo_unit (canton_code, name_de)
  WHERE level = 'municipality' AND is_current;

CREATE TABLE source_dataset (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  publisher text NOT NULL,
  title text NOT NULL,
  source_url text NOT NULL,
  license text,
  definition text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_snapshot (
  id bigserial PRIMARY KEY,
  source_dataset_id bigint NOT NULL REFERENCES source_dataset (id),
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  published_at date,
  reference_date date,
  content_hash text NOT NULL,
  raw_path text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_dataset_id, content_hash)
);

CREATE TABLE import_run (
  id bigserial PRIMARY KEY,
  source_snapshot_id bigint REFERENCES source_snapshot (id),
  importer text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  records_written integer NOT NULL DEFAULT 0,
  error_message text
);

CREATE TABLE metric_definition (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name_de text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('count', 'percent', 'per_1000', 'per_100000', 'births_per_woman')),
  description text NOT NULL,
  is_derived boolean NOT NULL DEFAULT false,
  availability_note text
);

CREATE TABLE observation (
  id bigserial PRIMARY KEY,
  geo_unit_id bigint NOT NULL REFERENCES geo_unit (id),
  metric_definition_id bigint NOT NULL REFERENCES metric_definition (id),
  source_snapshot_id bigint NOT NULL REFERENCES source_snapshot (id),
  reference_date date NOT NULL,
  value numeric NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (geo_unit_id, metric_definition_id, reference_date, dimensions)
);

CREATE INDEX observation_lookup_index
  ON observation (geo_unit_id, metric_definition_id, reference_date DESC);

CREATE TABLE derived_observation (
  id bigserial PRIMARY KEY,
  geo_unit_id bigint NOT NULL REFERENCES geo_unit (id),
  metric_definition_id bigint NOT NULL REFERENCES metric_definition (id),
  reference_date date NOT NULL,
  value numeric NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculation_definition text NOT NULL,
  source_observation_ids bigint[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (geo_unit_id, metric_definition_id, reference_date, dimensions)
);

INSERT INTO metric_definition (code, name_de, unit, description, is_derived, availability_note) VALUES
  ('population_total', 'Ständige Wohnbevölkerung', 'count', 'Ständige Wohnbevölkerung gemäss BFS STATPOP.', false, NULL),
  ('population_foreign', 'Ausländische ständige Wohnbevölkerung', 'count', 'Personen mit ausländischer Staatsangehörigkeit in der ständigen Wohnbevölkerung.', false, NULL),
  ('population_foreign_percent', 'Ausländische Bevölkerung', 'percent', 'Anteil ausländischer ständiger Wohnbevölkerung an der Gesamtbevölkerung.', true, NULL),
  ('population_age_group', 'Bevölkerung nach Altersgruppe', 'count', 'Ständige Wohnbevölkerung nach Altersgruppe.', false, NULL),
  ('migration_in', 'Zuzüge', 'count', 'Zuzüge der ständigen Wohnbevölkerung.', false, 'Gemeindeabdeckung muss je BFS-Quelle validiert werden.'),
  ('migration_out', 'Wegzüge', 'count', 'Wegzüge der ständigen Wohnbevölkerung.', false, 'Gemeindeabdeckung muss je BFS-Quelle validiert werden.'),
  ('migration_balance', 'Wanderungssaldo', 'count', 'Saldo aus Zu- und Wegzügen inklusive Änderung des Bevölkerungstyps.', false, NULL),
  ('migration_balance_per_1000', 'Wanderungssaldo pro 1''000 Einwohner', 'per_1000', 'Wanderungssaldo geteilt durch ständige Wohnbevölkerung.', true, NULL),
  ('crime_total', 'Registrierte Straftaten', 'count', 'Polizeilich registrierte Straftaten gemäss PKS.', false, 'Registrierte Straftaten sind keine Verurteilungen.'),
  ('crime_violent', 'Registrierte Gewaltdelikte', 'count', 'Polizeilich registrierte Gewaltdelikte gemäss PKS.', false, 'Registrierte Straftaten sind keine Verurteilungen.'),
  ('crime_property', 'Registrierte Vermögensdelikte', 'count', 'Polizeilich registrierte Vermögensdelikte gemäss PKS.', false, 'Registrierte Straftaten sind keine Verurteilungen.'),
  ('crime_per_100000', 'Registrierte Straftaten pro 100''000 Einwohner', 'per_100000', 'Registrierte Straftaten geteilt durch ständige Wohnbevölkerung.', true, 'Registrierte Straftaten sind keine Verurteilungen.'),
  ('religion_affiliation', 'Religionszugehörigkeit', 'count', 'Selbstdeklarierte Religionszugehörigkeit gemäss Volkszählung.', false, 'Separater Census-2021-Snapshot; keine jährliche Zeitreihe.'),
  ('asylum_pending', 'Personen im offenen Asylverfahren', 'count', 'Personen mit offenem Asylverfahren zum amtlichen Stichtag.', false, 'Geografische Zuteilung ist keine Herkunftsangabe.'),
  ('asylum_pending_per_1000', 'Offene Asylverfahren pro 1''000 Einwohner', 'per_1000', 'Personen im offenen Asylverfahren geteilt durch ständige Wohnbevölkerung.', true, 'Geografische Zuteilung ist keine Herkunftsangabe.'),
  ('births_live', 'Lebendgeburten', 'count', 'Amtlich registrierte Lebendgeburten.', false, NULL),
  ('birth_rate_per_1000', 'Lebendgeburten pro 1''000 Einwohner', 'per_1000', 'Lebendgeburten geteilt durch ständige Wohnbevölkerung.', true, NULL),
  ('fertility_tfr', 'Zusammengefasste Geburtenziffer', 'births_per_woman', 'Kinder pro Frau im Periodenmass.', false, 'Bei kleinen Populationen können jährliche Werte stark schwanken.')
ON CONFLICT (code) DO NOTHING;