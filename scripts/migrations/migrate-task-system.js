const mysql = require('mysql2/promise');
const { getDbConfig } = require('../../db-config');

const dbConfig = getDbConfig();

async function migrate() {
  let connection;
  try {
    console.log('🔄 開始資料庫升級：任務系統大改版 (Quest/Timed/Single)...');
    connection = await mysql.createConnection(dbConfig);

    // 1. 建立 quest_chains 表格 (劇情任務線)
    console.log('📦 正在建立 quest_chains 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS quest_chains (
        id INT AUTO_INCREMENT PRIMARY KEY,
        created_by VARCHAR(50) NOT NULL DEFAULT 'admin' COMMENT '建立者帳號',
        title VARCHAR(100) NOT NULL,
        description TEXT,
        chain_points INT DEFAULT 0 COMMENT '全破獎勵積分',
        badge_name VARCHAR(100) COMMENT '獎章名稱',
        badge_image VARCHAR(255) COMMENT '獎章圖片URL',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ quest_chains 表格準備就緒');
    
    // 如果表已存在但沒有 created_by 欄位，則新增
    const [cols] = await connection.query("SHOW COLUMNS FROM quest_chains LIKE 'created_by'");
    if (cols.length === 0) {
      console.log('🛠 為現有的 quest_chains 表格新增 created_by 欄位...');
      await connection.query("ALTER TABLE quest_chains ADD COLUMN created_by VARCHAR(50) NOT NULL DEFAULT 'admin' AFTER id");
      console.log('✅ created_by 欄位新增完成');
    }

    // 2. 修改 tasks 表格 (加入任務類型與限制)
    console.log('🛠 正在修改 tasks 表格...');
    
    // 檢查欄位是否存在，避免重複錯誤
    const [columns] = await connection.query(`SHOW COLUMNS FROM tasks`);
    const columnNames = columns.map(c => c.Field);

    if (!columnNames.includes('type')) {
      await connection.query(`
        ALTER TABLE tasks
        ADD COLUMN type ENUM('single', 'timed', 'quest') NOT NULL DEFAULT 'single' COMMENT '任務類型',
        ADD COLUMN quest_chain_id INT NULL COMMENT '所屬劇情ID',
        ADD COLUMN quest_order INT NULL COMMENT '劇情中的順序',
        ADD COLUMN time_limit_start DATETIME NULL COMMENT '限時任務開始時間',
        ADD COLUMN time_limit_end DATETIME NULL COMMENT '限時任務結束時間',
        ADD COLUMN max_participants INT NULL COMMENT '限時任務名額限制',
        ADD COLUMN current_participants INT DEFAULT 0 COMMENT '目前完成人數',
        ADD CONSTRAINT fk_quest_chain FOREIGN KEY (quest_chain_id) REFERENCES quest_chains(id) ON DELETE SET NULL
      `);
      console.log('✅ tasks 表格欄位新增成功');
    } else {
      console.log('ℹ️ tasks 表格欄位已存在，跳過');
    }

    // 3. 建立 user_quests 表格 (記錄用戶劇情進度)
    console.log('📦 正在建立 user_quests 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_quests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        quest_chain_id INT NOT NULL,
        current_step_order INT DEFAULT 0 COMMENT '目前完成到第幾步',
        is_completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (quest_chain_id) REFERENCES quest_chains(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_quest (user_id, quest_chain_id)
      )
    `);
    console.log('✅ user_quests 表格準備就緒');

    const [userQuestColumns] = await connection.query(`SHOW COLUMNS FROM user_quests`);
    const userQuestColumnNames = userQuestColumns.map(c => c.Field);
    if (!userQuestColumnNames.includes('current_step_order')) {
      console.log('🛠 為現有的 user_quests 表格新增 current_step_order 欄位...');
      await connection.query("ALTER TABLE user_quests ADD COLUMN current_step_order INT DEFAULT 0 AFTER quest_chain_id");
      console.log('✅ current_step_order 欄位新增完成');
    }

    // 4. 建立 user_badges 表格 (記錄用戶獲得的獎章 - 預留未來使用)
    console.log('📦 正在建立 user_badges 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_badges (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        image_url VARCHAR(255) NOT NULL,
        obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source_type ENUM('quest', 'event', 'manual') DEFAULT 'quest',
        source_id INT COMMENT '來源ID (例如 quest_chain_id)',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ user_badges 表格準備就緒');

    console.log('🎉 資料庫升級完成！');

  } catch (error) {
    console.error('❌ 升級失敗:', error);
  } finally {
    if (connection) await connection.end();
  }
}

migrate();
