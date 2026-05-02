const { createPoolFromEnv } = require('../../src/db/pool');
const { migrateOperationalSchema } = require('../../src/db/operational-schema-migration');

async function migrate() {
  const { pool } = createPoolFromEnv();
  try {
    console.log('🔄 開始執行 operational schema migration...');
    await migrateOperationalSchema(pool);
    console.log('✅ operational schema migration 已完成');
  } catch (err) {
    console.error('❌ operational schema migration 失敗:', err);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = {
  migrate
};
