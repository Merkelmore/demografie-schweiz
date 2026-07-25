UPDATE geo_unit
SET name_de = convert_from(convert_to(name_de, 'LATIN1'), 'UTF8')
WHERE name_de LIKE '%' || chr(195) || '%' OR name_de LIKE '%' || chr(194) || '%';

UPDATE source_dataset
SET
  publisher = CASE WHEN publisher LIKE '%' || chr(195) || '%' OR publisher LIKE '%' || chr(194) || '%' THEN convert_from(convert_to(publisher, 'LATIN1'), 'UTF8') ELSE publisher END,
  title = CASE WHEN title LIKE '%' || chr(195) || '%' OR title LIKE '%' || chr(194) || '%' THEN convert_from(convert_to(title, 'LATIN1'), 'UTF8') ELSE title END,
  license = CASE WHEN license LIKE '%' || chr(195) || '%' OR license LIKE '%' || chr(194) || '%' THEN convert_from(convert_to(license, 'LATIN1'), 'UTF8') ELSE license END,
  definition = CASE WHEN definition LIKE '%' || chr(195) || '%' OR definition LIKE '%' || chr(194) || '%' THEN convert_from(convert_to(definition, 'LATIN1'), 'UTF8') ELSE definition END
WHERE concat_ws(' ', publisher, title, license, definition) LIKE '%' || chr(195) || '%'
   OR concat_ws(' ', publisher, title, license, definition) LIKE '%' || chr(194) || '%';

UPDATE metric_definition
SET
  name_de = CASE WHEN name_de LIKE '%' || chr(195) || '%' OR name_de LIKE '%' || chr(194) || '%' THEN convert_from(convert_to(name_de, 'LATIN1'), 'UTF8') ELSE name_de END,
  description = CASE WHEN description LIKE '%' || chr(195) || '%' OR description LIKE '%' || chr(194) || '%' THEN convert_from(convert_to(description, 'LATIN1'), 'UTF8') ELSE description END,
  availability_note = CASE WHEN availability_note LIKE '%' || chr(195) || '%' OR availability_note LIKE '%' || chr(194) || '%' THEN convert_from(convert_to(availability_note, 'LATIN1'), 'UTF8') ELSE availability_note END
WHERE concat_ws(' ', name_de, description, availability_note) LIKE '%' || chr(195) || '%'
   OR concat_ws(' ', name_de, description, availability_note) LIKE '%' || chr(194) || '%';

UPDATE derived_observation
SET calculation_definition = convert_from(convert_to(calculation_definition, 'LATIN1'), 'UTF8')
WHERE calculation_definition LIKE '%' || chr(195) || '%' OR calculation_definition LIKE '%' || chr(194) || '%';