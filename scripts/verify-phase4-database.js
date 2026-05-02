const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

assert.ok(exists('docs/DATABASE_SCHEMA_MEMO.md'), 'database schema memo must exist');
assert.ok(exists('docs/SCHEMA_OWNERSHIP.json'), 'schema ownership manifest must exist');

const packageJson = JSON.parse(read('package.json'));
const startScript = packageJson.scripts?.start || '';
assert.ok(
  startScript === 'node scripts/migrations/run-startup-migrations.js; node index.js',
  'npm start must run the startup migration runner before index.js'
);

const indexJs = read('index.js');
assert.ok(!/ALTER TABLE/i.test(indexJs), 'index.js must not contain runtime ALTER TABLE statements');
assert.ok(!/CREATE TABLE IF NOT EXISTS/i.test(indexJs), 'index.js must not contain runtime CREATE TABLE statements');
assert.ok(!indexJs.includes('migrateOperationalSchema('), 'index.js must not run operational schema migration directly');

assert.ok(exists('src/db/operational-schema-migration.js'), 'operational schema migration module must exist');
assert.ok(exists('scripts/migrations/migrate-operational-schema.js'), 'operational schema migration entry must exist');
assert.ok(exists('scripts/migrations/startup-manifest.js'), 'startup migration manifest must exist');
assert.ok(exists('scripts/migrations/run-startup-migrations.js'), 'startup migration runner must exist');

const { STARTUP_MIGRATION_GROUPS, STARTUP_MIGRATIONS } = require('./migrations/startup-manifest');
const expectedStartupMigrationGroups = [
  {
    key: 'bootstrap',
    label: 'Bootstrap baseline',
    files: [
      'init-db.js'
    ]
  },
  {
    key: 'historical-core-patches',
    label: 'Historical core patches',
    files: [
      'fix-db-schema.js',
      'migrate-ar-image.js',
      'migrate-task-system.js',
      'migrate-task-type.js',
      'migrate-user-roles.js',
      'migrate-quest-chain-owner.js',
      'migrate-item-system.js',
      'migrate-points-table.js',
      'fix-product-schema.js',
      'migrate-quest-final-step.js',
      'add-ai-task-support.js'
    ]
  },
  {
    key: 'sandhill-product-model',
    label: 'Sandhill product model',
    files: [
      'migrate-sandhill-blueprint.js',
      'migrate-quest-chain-experience-mode.js',
      'migrate-coupon-entry-access.js',
      'slim-sandhill-legacy-columns.js'
    ]
  },
  {
    key: 'platform-commercial-layer',
    label: 'Platform and commercial layer',
    files: [
      'migrate-shop-platform.js'
    ]
  },
  {
    key: 'operational-current-patch',
    label: 'Operational current patch',
    files: [
      'migrate-operational-schema.js'
    ]
  }
];
const expectedStartupMigrations = [
  'init-db.js',
  'fix-db-schema.js',
  'migrate-ar-image.js',
  'migrate-task-system.js',
  'migrate-task-type.js',
  'migrate-user-roles.js',
  'migrate-quest-chain-owner.js',
  'migrate-item-system.js',
  'migrate-points-table.js',
  'fix-product-schema.js',
  'migrate-quest-final-step.js',
  'add-ai-task-support.js',
  'migrate-sandhill-blueprint.js',
  'migrate-quest-chain-experience-mode.js',
  'migrate-coupon-entry-access.js',
  'slim-sandhill-legacy-columns.js',
  'migrate-shop-platform.js',
  'migrate-operational-schema.js'
];
assert.deepStrictEqual(
  STARTUP_MIGRATION_GROUPS,
  expectedStartupMigrationGroups,
  'startup migration groups must preserve reviewed ownership grouping'
);
assert.deepStrictEqual(
  STARTUP_MIGRATIONS,
  expectedStartupMigrations,
  'startup migration manifest must preserve the reviewed migration order'
);

const deletedLegacyFiles = [
  '_archive/legacy-gps-task/CHANGELOG_RECENT.md',
  '_archive/legacy-gps-task/SCORING_ALGORITHM_DOCUMENTATION.md',
  '_archive/legacy-gps-task/Dockerfile.embedding',
  '_archive/legacy-gps-task/RAG_TUNING_GUIDE.md',
  '_archive/legacy-gps-task/FLOWER_COLOR_DESIGN.md',
  '_archive/legacy-gps-task/staff-dashboard-old.js',
  '_archive/legacy-gps-task/admin-users.js',
  '_archive/legacy-gps-task/role-management.js'
];

for (const relPath of deletedLegacyFiles) {
  assert.ok(!exists(relPath), `deleted legacy file must not return: ${relPath}`);
}

const removedMainPathFiles = [
  'CHANGELOG_RECENT.md',
  'SCORING_ALGORITHM_DOCUMENTATION.md',
  'Dockerfile.embedding',
  'docs/RAG_TUNING_GUIDE.md',
  'docs/FLOWER_COLOR_DESIGN.md',
  'public/js/staff-dashboard-old.js',
  'public/js/admin-users.js',
  'public/js/role-management.js'
];

for (const relPath of removedMainPathFiles) {
  assert.ok(!exists(relPath), `legacy file must not return to active path: ${relPath}`);
}

const migrationFiles = fs
  .readdirSync(path.join(root, 'scripts/migrations'))
  .filter((name) => name.endsWith('.js'));

assert.ok(migrationFiles.includes('init-db.js'), 'init-db.js migration must exist');
assert.ok(migrationFiles.includes('migrate-shop-platform.js'), 'migrate-shop-platform.js migration must exist');
assert.ok(migrationFiles.includes('migrate-sandhill-blueprint.js'), 'migrate-sandhill-blueprint.js migration must exist');
assert.ok(migrationFiles.includes('migrate-operational-schema.js'), 'migrate-operational-schema.js migration must exist');

const allowedMigrationFiles = new Set([
  ...expectedStartupMigrations,
  'startup-manifest.js',
  'run-startup-migrations.js'
]);
assert.deepStrictEqual(
  migrationFiles.slice().sort(),
  Array.from(allowedMigrationFiles).sort(),
  'scripts/migrations must contain only startup-managed migration files'
);

const deletedLegacyMigrations = [
  '_archive/legacy-db-migrations/fix-password-null.js',
  '_archive/legacy-db-migrations/hash-plaintext-passwords.js',
  '_archive/legacy-db-migrations/migrate-ar-system.js',
  '_archive/legacy-db-migrations/migrate-db.js',
  '_archive/legacy-db-migrations/migrate-quest-chain-creator.js',
  '_archive/legacy-db-migrations/migrate-task-types.js'
];

for (const relPath of deletedLegacyMigrations) {
  assert.ok(!exists(relPath), `deleted legacy DB migration must not return: ${relPath}`);
}

assert.ok(!exists('_archive/legacy-db-seeds/seed.sql'), 'deleted legacy seed.sql must not return');
assert.ok(!exists('server/seed.sql'), 'legacy server/seed.sql must not return to active path');
assert.ok(!exists('_archive/legacy-server-shell/package-lock.json'), 'deleted legacy server shell must not return');
assert.ok(!exists('server'), 'legacy server shell must not return to active path');

assert.ok(
  !exists('_archive/legacy-dangerous-scripts/cleanup-legacy-content.js'),
  'deleted dangerous legacy cleanup script must not return'
);
assert.ok(
  !exists('scripts/cleanup-legacy-content.js'),
  'dangerous cleanup script must not return to active scripts'
);

const forbiddenSecretPatterns = [
  '150.109.72.98',
  '4q7aRwS2d5G0czEL6bAPCmT8I9Zvp3H1'
];

for (const relPath of [
  'scripts/seed-sandhill-tutorial-modes.js',
  'scripts/seed-sandhill-demo-experience.js',
  'scripts/reset-and-seed-sandhill-demo-world.js'
]) {
  const source = read(relPath);
  assert.ok(source.includes("require('../db-config')"), `${relPath} must use db-config.js`);
  for (const pattern of forbiddenSecretPatterns) {
    assert.ok(!source.includes(pattern), `${relPath} must not contain hardcoded remote DB fallback`);
  }
}

const schemaOwnership = JSON.parse(read('docs/SCHEMA_OWNERSHIP.json'));
const ownershipGroups = schemaOwnership.groups || {};
const ownedTables = new Set(
  Object.values(ownershipGroups).flatMap((group) => group.tables || [])
);
const requiredOwnershipGroups = [
  'identity',
  'content',
  'player_progress',
  'rewards',
  'assets',
  'billing_lm',
  'notifications'
];

for (const groupKey of requiredOwnershipGroups) {
  assert.ok(ownershipGroups[groupKey], `schema ownership group must exist: ${groupKey}`);
  assert.ok(Array.isArray(ownershipGroups[groupKey].tables), `schema ownership group must list tables: ${groupKey}`);
}

const activeSchemaSources = [
  ...STARTUP_MIGRATIONS.map((file) => `scripts/migrations/${file}`),
  'src/db/operational-schema-migration.js'
];
const createdTables = new Set();
const createTablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z_][a-zA-Z0-9_]*)`?/gi;

for (const relPath of activeSchemaSources) {
  const source = read(relPath);
  let match;
  while ((match = createTablePattern.exec(source)) !== null) {
    createdTables.add(match[1]);
  }
}

for (const tableName of createdTables) {
  assert.ok(
    ownedTables.has(tableName),
    `created table must be listed in docs/SCHEMA_OWNERSHIP.json: ${tableName}`
  );
}

const databaseMemo = read('docs/DATABASE_SCHEMA_MEMO.md');
for (const tableName of ownedTables) {
  assert.ok(
    databaseMemo.includes(`\`${tableName}\``) || tableName === 'redemptions',
    `database schema memo should mention owned table: ${tableName}`
  );
}

console.log('Phase 4 database and legacy isolation verification passed');
