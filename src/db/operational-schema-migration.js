async function migrateOperationalSchema(pool) {
  let conn;
  try {
    conn = await pool.getConnection();

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ar_models (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(512) NOT NULL,
        type VARCHAR(50) DEFAULT 'general',
        scale FLOAT DEFAULT 1.0,
        created_by VARCHAR(255),
        shop_id INT DEFAULT NULL,
        file_size BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [arModelShopCols] = await conn.execute("SHOW COLUMNS FROM ar_models LIKE 'shop_id'");
    if (arModelShopCols.length === 0) {
      await conn.execute("ALTER TABLE ar_models ADD COLUMN shop_id INT DEFAULT NULL");
      console.log('✅ 資料庫遷移: ar_models 表已新增 shop_id');
    }
    const [arModelSizeCols] = await conn.execute("SHOW COLUMNS FROM ar_models LIKE 'file_size'");
    if (arModelSizeCols.length === 0) {
      await conn.execute("ALTER TABLE ar_models ADD COLUMN file_size BIGINT NOT NULL DEFAULT 0");
      console.log('✅ 資料庫遷移: ar_models 表已新增 file_size');
    }

    const [taskCols] = await conn.execute("SHOW COLUMNS FROM tasks LIKE 'ar_model_id'");
    if (taskCols.length === 0) {
      await conn.execute("ALTER TABLE tasks ADD COLUMN ar_model_id INT DEFAULT NULL");
      console.log('✅ 資料庫遷移: tasks 表已新增 ar_model_id');
    }

    const [itemCols] = await conn.execute("SHOW COLUMNS FROM items LIKE 'model_url'");
    if (itemCols.length === 0) {
      await conn.execute("ALTER TABLE items ADD COLUMN model_url VARCHAR(512) DEFAULT NULL");
      console.log('✅ 資料庫遷移: items 表已新增 model_url');
    }
    const [itemShopCols] = await conn.execute("SHOW COLUMNS FROM items LIKE 'shop_id'");
    if (itemShopCols.length === 0) {
      await conn.execute("ALTER TABLE items ADD COLUMN shop_id INT DEFAULT NULL");
      console.log('✅ 資料庫遷移: items 表已新增 shop_id');
    }
    const [itemSizeCols] = await conn.execute("SHOW COLUMNS FROM items LIKE 'file_size'");
    if (itemSizeCols.length === 0) {
      await conn.execute("ALTER TABLE items ADD COLUMN file_size BIGINT NOT NULL DEFAULT 0");
      console.log('✅ 資料庫遷移: items 表已新增 file_size');
    }

    const [productCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'is_active'");
    if (productCols.length === 0) {
      await conn.execute("ALTER TABLE products ADD COLUMN is_active BOOLEAN DEFAULT TRUE");
      console.log('✅ 資料庫遷移: products 表已新增 is_active');
    }

    const [productCreatedByCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'created_by'");
    if (productCreatedByCols.length === 0) {
      await conn.execute("ALTER TABLE products ADD COLUMN created_by VARCHAR(255) DEFAULT NULL");
      console.log('✅ 資料庫遷移: products 表已新增 created_by');
    }

    const arOrderCols = ['ar_order_model', 'ar_order_image', 'ar_order_youtube'];
    for (const col of arOrderCols) {
      const [check] = await conn.execute(`SHOW COLUMNS FROM tasks LIKE '${col}'`);
      if (check.length === 0) {
        await conn.execute(`ALTER TABLE tasks ADD COLUMN ${col} INT DEFAULT NULL`);
        console.log(`✅ 資料庫遷移: tasks 表已新增 ${col}`);
      }
    }

    const [bgmCols] = await conn.execute("SHOW COLUMNS FROM tasks LIKE 'bgm_url'");
    if (bgmCols.length === 0) {
      await conn.execute("ALTER TABLE tasks ADD COLUMN bgm_url VARCHAR(512) DEFAULT NULL");
      console.log('✅ 資料庫遷移: tasks 表已新增 bgm_url');
    }
    const [taskVideoCols] = await conn.execute("SHOW COLUMNS FROM tasks LIKE 'video_url'");
    if (taskVideoCols.length === 0) {
      await conn.execute("ALTER TABLE tasks ADD COLUMN video_url VARCHAR(512) DEFAULT NULL");
      console.log('✅ 資料庫遷移: tasks 表已新增 video_url');
    }

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS bgm_library (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(512) NOT NULL,
        created_by VARCHAR(255),
        shop_id INT DEFAULT NULL,
        file_size BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ 資料庫遷移: bgm_library 表已建立');
    const [bgmShopCols] = await conn.execute("SHOW COLUMNS FROM bgm_library LIKE 'shop_id'");
    if (bgmShopCols.length === 0) {
      await conn.execute("ALTER TABLE bgm_library ADD COLUMN shop_id INT DEFAULT NULL");
      console.log('✅ 資料庫遷移: bgm_library 表已新增 shop_id');
    }
    const [bgmSizeCols] = await conn.execute("SHOW COLUMNS FROM bgm_library LIKE 'file_size'");
    if (bgmSizeCols.length === 0) {
      await conn.execute("ALTER TABLE bgm_library ADD COLUMN file_size BIGINT NOT NULL DEFAULT 0");
      console.log('✅ 資料庫遷移: bgm_library 表已新增 file_size');
    }

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS video_library (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(512) NOT NULL,
        created_by VARCHAR(255),
        shop_id INT DEFAULT NULL,
        file_size BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ 資料庫遷移: video_library 表已建立');

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coupon_code VARCHAR(64) NOT NULL,
        user_id INT NULL,
        title VARCHAR(255) NOT NULL DEFAULT '優惠券',
        quest_chain_id INT NULL,
        discount_amount DECIMAL(10,2) NULL,
        discount_percent INT NULL,
        expiry_date DATE NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP NULL,
        used_by VARCHAR(100) NULL,
        status VARCHAR(32) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_coupons_code (coupon_code),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (quest_chain_id) REFERENCES quest_chains(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ 資料庫遷移: user_coupons 表已建立');

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS game_npcs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        npc_key VARCHAR(32) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        portrait_emoji VARCHAR(16) DEFAULT '🧭',
        role_line VARCHAR(64) DEFAULT '',
        description TEXT,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_game_npcs_key (npc_key)
      )
    `);
    const [npcCountRows] = await conn.execute('SELECT COUNT(*) AS c FROM game_npcs');
    if (npcCountRows[0].c === 0) {
      await conn.execute(
        `INSERT INTO game_npcs (npc_key, display_name, portrait_emoji, role_line, description, sort_order) VALUES
         ('guide', '引路人・史蛋', '🥚', 'guide / host', '負責引導、事件主持', 1),
         ('gatekeeper', '潮汐關主・巴布', '🦀', 'gatekeeper / rescue', '負責挑戰、救援提示', 2),
         ('judge', '潮汐裁判・鯨老', '🐋', 'judge / lore', '負責判定、知識導覽', 3)`
      );
      console.log('✅ 資料庫遷移: game_npcs 已寫入預設三角色');
    } else {
      console.log('✅ 資料庫遷移: game_npcs 表已就緒');
    }

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_endpoint (user_id, endpoint(255))
      )
    `);
    console.log('✅ 資料庫遷移: push_subscriptions 表已建立');

    console.log('✅ operational schema migration 完成');
  } catch (err) {
    console.error('❌ operational schema migration 失敗:', err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { migrateOperationalSchema };
