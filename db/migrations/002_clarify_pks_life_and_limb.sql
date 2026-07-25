UPDATE metric_definition
SET
  name_de = 'Registrierte Straftaten gegen Leib und Leben',
  description = 'Polizeilich registrierte Straftaten des 1. Titels des Strafgesetzbuchs gemäss PKS.',
  availability_note = 'Registrierte Straftaten sind keine Verurteilungen. Diese Kategorie entspricht dem PKS-Block "Leib und Leben", nicht einer frei definierten Gewalt-Summe.'
WHERE code = 'crime_violent';