/**
 * Validates catalog JSON against schema/catalog.schema.json using Ajv (Draft-07).
 */

'use strict';

const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve(__dirname, '..', '..', 'schema', 'catalog.schema.json');
const fixturePath = path.resolve(__dirname, 'fixtures', 'catalog.fixture.json');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const catalogFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateCatalog = ajv.compile(schema);

function validationErrors(instance) {
  const valid = validateCatalog(instance);
  return valid ? null : JSON.stringify(validateCatalog.errors, null, 2);
}

describe('catalog schema validation', () => {
  test('fixture validates against schema with no errors', () => {
    expect(validationErrors(catalogFixture)).toBeNull();
  });

  test('schema declares Draft-07', () => {
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
  });

  test('fixture has required top-level keys', () => {
    expect(catalogFixture).toHaveProperty('movements');
    expect(catalogFixture).toHaveProperty('parts');
  });

  test('extra fields are allowed at root and part level', () => {
    expect(validationErrors({ ...catalogFixture, _debug_build: 'extra-field' })).toBeNull();
    expect(
      validationErrors({
        ...catalogFixture,
        parts: [{ ...catalogFixture.parts[0], _extra: 'debug-value' }, ...catalogFixture.parts.slice(1)],
      }),
    ).toBeNull();
  });

  test('missing required keys fail validation', () => {
    const { movements, ...withoutMovements } = catalogFixture;
    const { parts, ...withoutParts } = catalogFixture;

    expect(validateCatalog(withoutMovements)).toBe(false);
    expect(validateCatalog(withoutParts)).toBe(false);
  });

  test('invalid part values fail validation', () => {
    expect(
      validateCatalog({
        ...catalogFixture,
        parts: [{ ...catalogFixture.parts[0], condition: 'Refurbished' }, ...catalogFixture.parts.slice(1)],
      }),
    ).toBe(false);

    expect(
      validateCatalog({
        ...catalogFixture,
        parts: [{ ...catalogFixture.parts[0], price: -1 }, ...catalogFixture.parts.slice(1)],
      }),
    ).toBe(false);
  });
});
