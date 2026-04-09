const mysql = require('mysql2/promise');
const { getDbConfig } = require('../../db-config');

async function ensureColumn(conn, table, name, definition) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM ${table} LIKE ${mysql.escape(name)}`);
  if (rows.length === 0) {
    console.log(`🛠 新增 ${table}.${name}`);
    await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  } else {
    console.log(`ℹ️ ${table}.${name} 已存在`);
  }
}

async function ensureForeignKey(conn, table, fkName, ddl) {
  const [rows] = await conn.query(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?`,
    [table, fkName]
  );
  if (rows.length === 0) {
    console.log(`🛠 新增外鍵 ${table}.${fkName}`);
    await conn.execute(ddl);
  } else {
    console.log(`ℹ️ 外鍵 ${table}.${fkName} 已存在`);
  }
}

async function migrate() {
  const conn = await mysql.createConnection(getDbConfig());
  try {
    console.log('🔄 開始執行 coupon 入口授權遷移...');
    await ensureColumn(conn, 'quest_chains', 'access_mode', "VARCHAR(30) NOT NULL DEFAULT 'public' COMMENT 'public, coupon'");
    await ensureColumn(conn, 'user_coupons', 'quest_chain_id', "INT NULL COMMENT '綁定玩法入口'");
    await ensureForeignKey(
      conn,
      'user_coupons',
      'fk_user_coupons_quest_chain',
      'ALTER TABLE user_coupons ADD CONSTRAINT fk_user_coupons_quest_chain FOREIGN KEY (quest_chain_id) REFERENCES quest_chains(id) ON DELETE SET NULL'
    );
    await conn.execute("UPDATE quest_chains SET access_mode = 'public' WHERE access_mode IS NULL OR access_mode = ''");
    console.log('✅ coupon 入口授權遷移完成');
  } catch (err) {
    console.error('❌ coupon 入口授權遷移失敗:', err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

migrate();
