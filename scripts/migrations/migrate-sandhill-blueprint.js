const mysql = require('mysql2/promise');
const { getDbConfig } = require('../../db-config');

const dbConfig = getDbConfig();

async function ensureColumn(conn, table, name, definition) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM ${table} LIKE ${mysql.escape(name)}`);
  if (rows.length === 0) {
    console.log(`🛠 新增 ${table}.${name}`);
    await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  } else {
    console.log(`ℹ️ ${table}.${name} 已存在`);
  }
}

async function migrate() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('🔄 開始執行沙丘藍圖遷移...');

    await ensureColumn(conn, 'quest_chains', 'title', "VARCHAR(100) NULL COMMENT '新版劇情標題'");
    await conn.execute("UPDATE quest_chains SET title = name WHERE (title IS NULL OR title = '') AND name IS NOT NULL");

    await ensureColumn(conn, 'quest_chains', 'mode_type', "VARCHAR(50) NOT NULL DEFAULT 'story_campaign' COMMENT 'story_campaign, board_game'");
    await ensureColumn(conn, 'quest_chains', 'access_mode', "VARCHAR(30) NOT NULL DEFAULT 'public' COMMENT 'public, coupon'");
    await ensureColumn(conn, 'quest_chains', 'experience_mode', "VARCHAR(30) NOT NULL DEFAULT 'formal' COMMENT 'formal, tutorial, demo'");
    await ensureColumn(conn, 'quest_chains', 'is_active', "BOOLEAN NOT NULL DEFAULT FALSE COMMENT '首頁入口是否開放'");
    await ensureColumn(conn, 'quest_chains', 'cover_image', "VARCHAR(255) NULL COMMENT '劇情入口封面圖'");
    await ensureColumn(conn, 'quest_chains', 'short_description', "TEXT NULL COMMENT '首頁簡介'");
    await ensureColumn(conn, 'quest_chains', 'entry_order', "INT NOT NULL DEFAULT 0 COMMENT '首頁排序'");
    await ensureColumn(conn, 'quest_chains', 'entry_button_text', "VARCHAR(50) NULL COMMENT '首頁按鈕文案'");
    await ensureColumn(conn, 'quest_chains', 'entry_scene_label', "VARCHAR(100) NULL COMMENT '入口場景標籤'");
    await ensureColumn(conn, 'quest_chains', 'play_style', "VARCHAR(50) NULL COMMENT 'board_game 的玩法模板'");
    await ensureColumn(conn, 'quest_chains', 'game_rules', "JSON NULL COMMENT '模式規則設定'");
    await ensureColumn(conn, 'quest_chains', 'content_blueprint', "JSON NULL COMMENT '內容包與角色設定摘要'");

    await ensureColumn(conn, 'tasks', 'cover_image_url', "VARCHAR(255) NULL COMMENT '關卡封面圖'");
    await ensureColumn(conn, 'tasks', 'stage_template', "VARCHAR(50) NULL COMMENT '關卡模板類型'");
    await ensureColumn(conn, 'tasks', 'stage_intro', "TEXT NULL COMMENT '關卡開場文案'");
    await ensureColumn(conn, 'tasks', 'hint_text', "TEXT NULL COMMENT '第一層提示'");
    await ensureColumn(conn, 'tasks', 'story_context', "TEXT NULL COMMENT '劇情內容補充'");
    await ensureColumn(conn, 'tasks', 'guide_content', "TEXT NULL COMMENT '導覽員內容'");
    await ensureColumn(conn, 'tasks', 'rescue_content', "TEXT NULL COMMENT '救援員內容'");
    await ensureColumn(conn, 'tasks', 'event_config', "JSON NULL COMMENT '事件型關卡與額外配置'");
    await ensureColumn(conn, 'tasks', 'is_active', "BOOLEAN NOT NULL DEFAULT TRUE COMMENT '關卡是否開放'");

    console.log('📦 檢查 / 建立 board_maps...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS board_maps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quest_chain_id INT NULL,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        play_style VARCHAR(50) NOT NULL DEFAULT 'fixed_track_race',
        cover_image VARCHAR(255) NULL,
        center_lat DOUBLE NULL,
        center_lng DOUBLE NULL,
        max_rounds INT NULL,
        start_tile INT NOT NULL DEFAULT 1,
        finish_tile INT NOT NULL DEFAULT 10,
        dice_min INT NOT NULL DEFAULT 1,
        dice_max INT NOT NULL DEFAULT 6,
        failure_move INT NOT NULL DEFAULT -1,
        exact_finish_required BOOLEAN NOT NULL DEFAULT FALSE,
        reward_points INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        rules_json JSON NULL,
        created_by VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quest_chain_id) REFERENCES quest_chains(id) ON DELETE SET NULL
      )
    `);

    console.log('📦 檢查 / 建立 board_tiles...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS board_tiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        board_map_id INT NOT NULL,
        tile_index INT NOT NULL,
        tile_name VARCHAR(150) NOT NULL,
        tile_type VARCHAR(50) NOT NULL DEFAULT 'challenge',
        latitude DOUBLE NULL,
        longitude DOUBLE NULL,
        radius_meters INT NULL,
        task_id INT NULL,
        effect_type VARCHAR(50) NULL,
        effect_value INT NULL,
        event_title VARCHAR(150) NULL,
        event_body TEXT NULL,
        guide_content TEXT NULL,
        tile_meta JSON NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (board_map_id) REFERENCES board_maps(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        UNIQUE KEY unique_board_tile_index (board_map_id, tile_index)
      )
    `);

    console.log('📦 檢查 / 建立 user_game_sessions...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_game_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        mode_type VARCHAR(50) NOT NULL DEFAULT 'board_game',
        quest_chain_id INT NULL,
        board_map_id INT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        current_tile INT NOT NULL DEFAULT 1,
        round_count INT NOT NULL DEFAULT 0,
        pending_roll INT NULL,
        pending_target_tile INT NULL,
        gained_points INT NOT NULL DEFAULT 0,
        session_state JSON NULL,
        last_result JSON NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (quest_chain_id) REFERENCES quest_chains(id) ON DELETE SET NULL,
        FOREIGN KEY (board_map_id) REFERENCES board_maps(id) ON DELETE SET NULL,
        INDEX idx_user_game_sessions_lookup (user_id, mode_type, quest_chain_id, status)
      )
    `);

    console.log('✅ 沙丘藍圖遷移完成');
  } catch (err) {
    console.error('❌ 沙丘藍圖遷移失敗:', err);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

migrate();
