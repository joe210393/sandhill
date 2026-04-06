const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { getDbConfig } = require('../../db-config');

const dbConfig = getDbConfig();

async function initDb() {
  let connection;
  try {
    console.log('🔄 開始初始化資料庫結構...');
    connection = await mysql.createConnection(dbConfig);

    // 1. 建立 users 表格
    console.log('📦 檢查/建立 users 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255),
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 預設管理員帳號
    console.log('👤 檢查預設管理員帳號...');
    const [adminUsers] = await connection.query(
      'SELECT id, password FROM users WHERE username = ? AND role = ? LIMIT 1',
      ['admin', 'admin']
    );
    const defaultAdminPasswordHash = await bcrypt.hash('admin', 10);
    if (adminUsers.length === 0) {
      await connection.query(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        ['admin', defaultAdminPasswordHash, 'admin']
      );
      console.log('✅ 已建立預設管理員帳號：admin / admin');
    } else {
      const existingPassword = adminUsers[0].password || '';
      const isBcryptHash = existingPassword.startsWith('$2a$') || existingPassword.startsWith('$2b$') || existingPassword.startsWith('$2y$');
      if (!isBcryptHash) {
        await connection.query('UPDATE users SET password = ? WHERE id = ?', [defaultAdminPasswordHash, adminUsers[0].id]);
        console.log('✅ 已修正預設管理員密碼格式：admin / admin');
      } else {
        console.log('ℹ️ 預設管理員帳號已存在');
      }
    }

    // 2. 建立 items 表格 (道具)
    console.log('📦 檢查/建立 items 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        image_url VARCHAR(255),
        model_url VARCHAR(512), -- 3D 模型
        type VARCHAR(20) DEFAULT 'normal',
        effect_value INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. 建立 ar_models 表格
    console.log('📦 檢查/建立 ar_models 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ar_models (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(512) NOT NULL,
        type VARCHAR(50) DEFAULT 'general',
        scale FLOAT DEFAULT 1.0,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. 建立 quest_chains 表格 (劇情線)
    console.log('📦 檢查/建立 quest_chains 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS quest_chains (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        chain_points INT DEFAULT 0,
        badge_name VARCHAR(100),
        badge_image VARCHAR(255),
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. 建立 tasks 表格
    console.log('📦 檢查/建立 tasks 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        radius INT DEFAULT 50,
        description TEXT,
        photoUrl VARCHAR(255),
        iconUrl VARCHAR(255),
        youtubeUrl VARCHAR(255),
        ar_image_url VARCHAR(255),
        points INT DEFAULT 10,
        task_type VARCHAR(50) DEFAULT 'qa',
        options JSON,
        correct_answer VARCHAR(255),
        
        -- 新增欄位
        type VARCHAR(20) DEFAULT 'single', -- single, quest, timed
        quest_chain_id INT,
        quest_order INT,
        required_item_id INT,
        reward_item_id INT,
        
        -- AR 欄位
        ar_model_id INT,
        ar_order_model INT,
        ar_order_image INT,
        ar_order_youtube INT,

        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (quest_chain_id) REFERENCES quest_chains(id) ON DELETE SET NULL,
        FOREIGN KEY (required_item_id) REFERENCES items(id) ON DELETE SET NULL,
        FOREIGN KEY (reward_item_id) REFERENCES items(id) ON DELETE SET NULL,
        FOREIGN KEY (ar_model_id) REFERENCES ar_models(id) ON DELETE SET NULL
      )
    `);

    // 6. 建立 user_tasks 表格
    console.log('📦 檢查/建立 user_tasks 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        task_id INT NOT NULL,
        status VARCHAR(20) DEFAULT '進行中',
        answer TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP NULL,
        redeemed BOOLEAN DEFAULT FALSE,
        redeemed_at TIMESTAMP NULL,
        redeemed_by VARCHAR(100) NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        UNIQUE KEY unique_user_task (user_id, task_id)
      )
    `);

    // 7. 建立 user_inventory 表格
    console.log('📦 檢查/建立 user_inventory 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        item_id INT NOT NULL,
        quantity INT DEFAULT 1,
        obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      )
    `);

    // 8. 建立 point_transactions 表格 (積分)
    console.log('📦 檢查/建立 point_transactions 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS point_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(20) NOT NULL, -- earned, spent
        points INT NOT NULL,
        description VARCHAR(255),
        reference_type VARCHAR(50), -- task, product, admin
        reference_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // 9. 建立 products 表格 (兌換商品)
    console.log('📦 檢查/建立 products 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        points_required INT NOT NULL,
        image_url VARCHAR(255),
        stock INT DEFAULT 0,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 10. 建立 redemptions 表格 (兌換紀錄)
    console.log('📦 檢查/建立 redemptions 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS redemptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // 11. 建立 user_quests 表格 (劇情進度)
    console.log('📦 檢查/建立 user_quests 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_quests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        quest_chain_id INT NOT NULL,
        is_completed BOOLEAN DEFAULT FALSE,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (quest_chain_id) REFERENCES quest_chains(id)
      )
    `);
    
    // 12. 建立 user_badges 表格 (稱號) - 新增
    console.log('📦 檢查/建立 user_badges 表格...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_badges (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        badge_name VARCHAR(100) NOT NULL,
        badge_image VARCHAR(255),
        obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    console.log('✅ 資料庫完整結構初始化完成');

  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

initDb();
