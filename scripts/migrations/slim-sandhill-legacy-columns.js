const mysql = require('mysql2/promise');
const { getDbConfig } = require('../../db-config');

const dbConfig = getDbConfig();

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM ${table} LIKE ${mysql.escape(column)}`);
  return rows.length > 0;
}

async function migrate() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('🔄 開始執行沙丘安全瘦身遷移...');

    // tasks.ar_model_scale 是舊版遺留欄位。
    // 實際上前台已改用 ar_models.scale JOIN 出來的 ar_model_scale，
    // tasks 表本身的 ar_model_scale 沒有再被程式直接讀寫。
    if (await columnExists(conn, 'tasks', 'ar_model_scale')) {
      console.log('🧹 移除未使用的 tasks.ar_model_scale 欄位...');
      await conn.execute('ALTER TABLE tasks DROP COLUMN ar_model_scale');
    } else {
      console.log('ℹ️ tasks.ar_model_scale 不存在，跳過');
    }

    console.log('✅ 沙丘安全瘦身遷移完成');
  } catch (err) {
    console.error('❌ 沙丘安全瘦身遷移失敗:', err);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

migrate();
