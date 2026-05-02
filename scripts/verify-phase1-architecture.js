const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const startupSource = fs.readFileSync(path.join(root, 'src/server/startup.js'), 'utf8');
const packageJson = require('../package.json');

const requiredModules = [
  'src/config/assets.js',
  'src/config/web-push.js',
  'src/db/pool.js',
  'src/db/operational-schema-migration.js',
  'src/middleware/core.js',
  'src/middleware/static-assets.js',
  'src/services/auth.js',
  'src/services/billing.js',
  'src/services/shop-scope.js',
  'src/services/uploads.js',
  'src/server/startup.js',
  'scripts/migrations/startup-manifest.js',
  'scripts/migrations/run-startup-migrations.js',
  'scripts/migrations/migrate-operational-schema.js'
];

for (const relativePath of requiredModules) {
  assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} should exist`);
}

assert.equal(indexSource.includes('ensureRuntimeSchema'), false);
assert.equal(indexSource.includes("require('./src/db/runtime-schema')"), false);
assert.equal(startupSource.includes('ensureRuntimeSchema'), false);
assert.equal(startupSource.includes('await ensureRuntimeSchema'), false);
assert.equal(
  packageJson.scripts.start.includes('scripts/migrations/run-startup-migrations.js'),
  true,
  'npm start should run startup migration runner before index.js'
);

const { STARTUP_MIGRATIONS } = require('./migrations/startup-manifest');
assert.equal(
  STARTUP_MIGRATIONS.at(-1),
  'migrate-operational-schema.js',
  'operational schema migration should remain the last startup migration'
);

console.log('Phase 1 architecture verification passed');
