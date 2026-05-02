const { spawnSync } = require('child_process');
const path = require('path');
const { STARTUP_MIGRATION_GROUPS } = require('./startup-manifest');

const migrationDir = __dirname;

for (const group of STARTUP_MIGRATION_GROUPS) {
  console.log(`\n=== Migration group: ${group.label} (${group.key}) ===`);

  for (const migrationFile of group.files) {
    const migrationPath = path.join(migrationDir, migrationFile);
    console.log(`\n▶ Running migration: ${migrationFile}`);
    const result = spawnSync(process.execPath, [migrationPath], {
      stdio: 'inherit',
      env: process.env
    });

    if (result.status !== 0) {
      console.error(`❌ Migration failed: ${migrationFile}`);
      process.exit(result.status || 1);
    }
  }
}

console.log('\n✅ Startup migrations complete');
