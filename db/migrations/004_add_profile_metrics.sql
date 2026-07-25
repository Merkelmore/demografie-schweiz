ALTER TABLE metric_definition
DROP CONSTRAINT metric_definition_unit_check;

ALTER TABLE metric_definition
ADD CONSTRAINT metric_definition_unit_check
CHECK (unit IN ('count', 'percent', 'per_1000', 'per_100000', 'births_per_woman', 'years'));

INSERT INTO metric_definition (code, name_de, unit, description, is_derived, availability_note) VALUES
  ('average_age', 'Durchschnittsalter', 'years', 'Gewichtetes Durchschnittsalter aus BFS-Einjahresaltersgruppen; die offene Altersgruppe 99+ wird mit 99 Jahren gewichtet.', true, NULL),
  ('migration_in_percent', 'Zuwanderung in Prozent der Bevölkerung', 'percent', 'Zuzüge geteilt durch die ständige Wohnbevölkerung.', true, NULL),
  ('migration_out_percent', 'Abwanderung in Prozent der Bevölkerung', 'percent', 'Wegzüge geteilt durch die ständige Wohnbevölkerung.', true, NULL)
ON CONFLICT (code) DO NOTHING;