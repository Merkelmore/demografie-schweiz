UPDATE metric_definition
SET description = 'Abgeleiteter, auf das finale Schweizer Nationalratsresultat 2023 zentrierter Score aus den Parteistärken von SP, GPS, Mitte, GLP, FDP und SVP. 0 entspricht dem nationalen Referenzresultat.'
WHERE code = 'political_orientation_score';