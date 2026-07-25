UPDATE metric_definition
SET availability_note = 'Keine Erwerbslosenquote veröffentlicht.'
WHERE code = 'unemployment_rate';

UPDATE metric_definition
SET availability_note = 'Kein Score verfügbar, da keine Erwerbslosenquote veröffentlicht wurde.'
WHERE code = 'cultural_enrichment_score';