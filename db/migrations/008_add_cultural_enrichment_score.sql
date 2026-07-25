INSERT INTO metric_definition (code, name_de, unit, description, is_derived, availability_note)
VALUES (
  'cultural_enrichment_score',
  'Cultural Enrichment Score',
  'score',
  'Nicht amtlicher Kompositindex aus Kriminalität, offenen Asylverfahren, ausländischer Bevölkerung und BFS-Erwerbslosenquote. Jede Komponente wird über die aktuell vollständig verfügbaren Kantone min-max-normalisiert und zählt zu 25 Prozent.',
  true,
  'Für Appenzell Innerrhoden ist kein Score verfügbar, weil die BFS-Erwerbslosenquote für den aktuellen Datenstand nicht veröffentlicht wurde.'
)
ON CONFLICT (code) DO NOTHING;