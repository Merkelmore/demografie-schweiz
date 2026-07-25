ALTER TABLE metric_definition
DROP CONSTRAINT metric_definition_unit_check;

ALTER TABLE metric_definition
ADD CONSTRAINT metric_definition_unit_check
CHECK (unit IN ('count', 'percent', 'per_1000', 'per_100000', 'births_per_woman', 'score'));

INSERT INTO metric_definition (code, name_de, unit, description, is_derived, availability_note) VALUES
  ('unemployment_rate', 'BFS-Erwerbslosenquote', 'percent', 'Jährliche Erwerbslosenquote nach ILO-Definition aus der BFS-Strukturerhebung; nicht identisch mit der registrierten Arbeitslosenquote nach SECO.', false, 'Der BFS-Wert für Appenzell Innerrhoden wurde für den aktuellen Datenstand nicht veröffentlicht.'),
  ('nc_vote_share', 'Parteistärke Nationalratswahl', 'percent', 'Parteistärke der finalen Nationalratswahl 2023 nach Kanton und Partei.', false, 'Finale Nationalratswahl 2023 nur auf Kantonsebene.'),
  ('political_orientation_score', 'Politische Orientierung', 'score', 'Abgeleiteter Score aus den Parteistärken von SP, GPS, Mitte, GLP, FDP und SVP der finalen Nationalratswahl 2023.', true, 'Finale Nationalratswahl 2023 nur auf Kantonsebene.')
ON CONFLICT (code) DO NOTHING;