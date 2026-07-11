'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const repoRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(repoRoot, 'schema', 'catalog.schema.json');
const catalogArg = process.argv[2];
const catalogPath = catalogArg
  ? path.resolve(process.cwd(), catalogArg)
  : path.join(repoRoot, 'tests', 'javascript', 'fixtures', 'catalog.fixture.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (!fs.existsSync(schemaPath)) {
  console.error(`Schema not found: ${schemaPath}`);
  process.exit(1);
}

if (!fs.existsSync(catalogPath)) {
  console.error(`Catalog not found: ${catalogPath}`);
  process.exit(1);
}

const schema = readJson(schemaPath);
const catalog = readJson(catalogPath);
const ajv = new Ajv({ allErrors: true, strict: false });
const validateCatalog = ajv.compile(schema);

if (!validateCatalog(catalog)) {
  console.error(`Catalog validation failed: ${catalogPath}`);
  console.error(JSON.stringify(validateCatalog.errors, null, 2));
  process.exit(1);
}

console.log(`Catalog validation passed: ${catalogPath}`);
