const mysql = require('mysql2/promise');
const { getDbConfig } = require('../../db-config');

const dbConfig = getDbConfig();

async function ensureColumn(conn, tableName, columnName, definition) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [columnName]);
  if (rows.length === 0) {
    console.log(`🛠 新增 ${tableName}.${columnName} 欄位...`);
    await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
    console.log(`✅ ${tableName}.${columnName} 新增完成`);
  } else {
    console.log(`ℹ️ ${tableName}.${columnName} 已存在，跳過`);
  }
}

async function ensureIndex(conn, tableName, indexName, ddl) {
  const [rows] = await conn.query(`SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`, [indexName]);
  if (rows.length === 0) {
    console.log(`🛠 新增索引 ${tableName}.${indexName}...`);
    await conn.query(ddl);
    console.log(`✅ 索引 ${tableName}.${indexName} 新增完成`);
  } else {
    console.log(`ℹ️ 索引 ${tableName}.${indexName} 已存在，跳過`);
  }
}

async function ensureForeignKey(conn, tableName, keyName, ddl) {
  const [rows] = await conn.query(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND CONSTRAINT_NAME = ?`,
    [tableName, keyName]
  );
  if (rows.length === 0) {
    console.log(`🛠 新增外鍵 ${keyName}...`);
    try {
      await conn.query(ddl);
      console.log(`✅ 外鍵 ${keyName} 新增完成`);
    } catch (err) {
      console.warn(`⚠️ 外鍵 ${keyName} 新增失敗，先略過:`, err.message);
    }
  } else {
    console.log(`ℹ️ 外鍵 ${keyName} 已存在，跳過`);
  }
}

function buildShopCode(seed) {
  return String(seed || 'shop')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || `shop-${Date.now()}`;
}

async function ensureDefaultPlans(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS entry_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      task_limit INT NOT NULL,
      setup_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
      monthly_base_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
      token_price_per_1k DECIMAL(10,4) NOT NULL DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  const plans = [
    ['starter_10', '10 關方案', 10, 5000, 0, 0.1],
    ['growth_20', '20 關方案', 20, 8000, 0, 0.1],
    ['pro_30', '30 關方案', 30, 11000, 0, 0.1]
  ];
  for (const [code, name, taskLimit, setupFee, monthlyBaseFee, tokenPricePer1k] of plans) {
    await conn.query(
      `INSERT INTO entry_plans (code, name, task_limit, setup_fee, monthly_base_fee, token_price_per_1k)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         task_limit = VALUES(task_limit),
         setup_fee = VALUES(setup_fee),
         monthly_base_fee = VALUES(monthly_base_fee),
         token_price_per_1k = VALUES(token_price_per_1k)`,
      [code, name, taskLimit, setupFee, monthlyBaseFee, tokenPricePer1k]
    );
  }
}

async function migrate() {
  let conn;
  try {
    console.log('🔄 開始執行商家平台基礎遷移...');
    conn = await mysql.createConnection(dbConfig);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS shops (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        owner_username VARCHAR(50) NULL,
        contact_name VARCHAR(100) NULL,
        contact_phone VARCHAR(50) NULL,
        contact_email VARCHAR(100) NULL,
        address VARCHAR(255) NULL,
        description TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ shops 表格準備就緒');

    await ensureDefaultPlans(conn);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS entry_billing_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shop_id INT NOT NULL,
        quest_chain_id INT NULL,
        plan_id INT NULL,
        billing_type VARCHAR(30) NOT NULL DEFAULT 'setup_fee',
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        paid_at TIMESTAMP NULL,
        note TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS llm_usage_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        shop_id INT NULL,
        quest_chain_id INT NULL,
        task_id INT NULL,
        user_id INT NULL,
        provider VARCHAR(50) NULL,
        model VARCHAR(100) NULL,
        request_type VARCHAR(50) NULL,
        prompt_tokens INT NOT NULL DEFAULT 0,
        completion_tokens INT NOT NULL DEFAULT 0,
        total_tokens INT NOT NULL DEFAULT 0,
        success BOOLEAN DEFAULT TRUE,
        meta_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS llm_usage_monthly_summary (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        shop_id INT NOT NULL,
        quest_chain_id INT NULL,
        billing_month VARCHAR(7) NOT NULL,
        prompt_tokens INT NOT NULL DEFAULT 0,
        completion_tokens INT NOT NULL DEFAULT 0,
        total_tokens INT NOT NULL DEFAULT 0,
        estimated_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        donated_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        is_invoiced BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_llm_usage_monthly (shop_id, quest_chain_id, billing_month)
      )
    `);

    await ensureColumn(conn, 'users', 'shop_id', 'INT NULL AFTER role');
    await ensureColumn(conn, 'quest_chains', 'shop_id', 'INT NULL AFTER created_by');
    await ensureColumn(conn, 'quest_chains', 'plan_id', 'INT NULL AFTER shop_id');
    await ensureColumn(conn, 'quest_chains', 'task_limit', 'INT NULL AFTER plan_id');
    await ensureColumn(conn, 'quest_chains', 'setup_fee', 'DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER task_limit');
    await ensureColumn(conn, 'quest_chains', 'setup_fee_paid', 'BOOLEAN DEFAULT FALSE AFTER setup_fee');
    await ensureColumn(conn, 'quest_chains', 'monthly_billing_enabled', 'BOOLEAN DEFAULT TRUE AFTER setup_fee_paid');
    await ensureColumn(conn, 'quest_chains', 'billing_policy', "VARCHAR(20) NOT NULL DEFAULT 'commercial' AFTER monthly_billing_enabled");
    await ensureColumn(conn, 'quest_chains', 'structure_locked_at', 'TIMESTAMP NULL AFTER monthly_billing_enabled');
    await ensureColumn(conn, 'quest_chains', 'lm_total_prompt_tokens', 'INT NOT NULL DEFAULT 0 AFTER structure_locked_at');
    await ensureColumn(conn, 'quest_chains', 'lm_total_completion_tokens', 'INT NOT NULL DEFAULT 0 AFTER lm_total_prompt_tokens');
    await ensureColumn(conn, 'quest_chains', 'lm_total_tokens', 'INT NOT NULL DEFAULT 0 AFTER lm_total_completion_tokens');
    await ensureColumn(conn, 'quest_chains', 'current_billing_month_tokens', 'INT NOT NULL DEFAULT 0 AFTER lm_total_tokens');
    await ensureColumn(conn, 'llm_usage_monthly_summary', 'donated_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER estimated_amount');

    await ensureColumn(conn, 'tasks', 'shop_id', 'INT NULL AFTER created_by');
    await ensureColumn(conn, 'tasks', 'structure_locked', 'BOOLEAN DEFAULT FALSE AFTER shop_id');
    await ensureColumn(conn, 'tasks', 'structure_locked_at', 'TIMESTAMP NULL AFTER structure_locked');
    await ensureColumn(conn, 'products', 'shop_id', 'INT NULL AFTER created_by');
    await ensureColumn(conn, 'user_coupons', 'shop_id', 'INT NULL AFTER user_id');
    await ensureColumn(conn, 'product_redemptions', 'shop_id', 'INT NULL AFTER product_id');
    await ensureColumn(conn, 'board_maps', 'shop_id', 'INT NULL AFTER created_by');

    await ensureIndex(conn, 'users', 'idx_users_shop_id', 'CREATE INDEX idx_users_shop_id ON users (shop_id)');
    await ensureIndex(conn, 'quest_chains', 'idx_quest_chains_shop_id', 'CREATE INDEX idx_quest_chains_shop_id ON quest_chains (shop_id)');
    await ensureIndex(conn, 'tasks', 'idx_tasks_shop_id', 'CREATE INDEX idx_tasks_shop_id ON tasks (shop_id)');
    await ensureIndex(conn, 'products', 'idx_products_shop_id', 'CREATE INDEX idx_products_shop_id ON products (shop_id)');
    await ensureIndex(conn, 'user_coupons', 'idx_user_coupons_shop_id', 'CREATE INDEX idx_user_coupons_shop_id ON user_coupons (shop_id)');
    await ensureIndex(conn, 'product_redemptions', 'idx_product_redemptions_shop_id', 'CREATE INDEX idx_product_redemptions_shop_id ON product_redemptions (shop_id)');
    await ensureIndex(conn, 'board_maps', 'idx_board_maps_shop_id', 'CREATE INDEX idx_board_maps_shop_id ON board_maps (shop_id)');
    await ensureIndex(conn, 'llm_usage_logs', 'idx_llm_usage_logs_shop_id_created_at', 'CREATE INDEX idx_llm_usage_logs_shop_id_created_at ON llm_usage_logs (shop_id, created_at)');

    const [shopUsers] = await conn.query(`
      SELECT id, username, role, shop_id, shop_name, shop_address, shop_description
      FROM users
      WHERE role = 'shop'
    `);
    for (const user of shopUsers) {
      let shopId = user.shop_id ? Number(user.shop_id) : null;
      if (!shopId) {
        const shopCode = buildShopCode(user.username);
        const [existing] = await conn.query('SELECT id FROM shops WHERE owner_username = ? LIMIT 1', [user.username]);
        if (existing.length > 0) {
          shopId = existing[0].id;
        } else {
          const [insertResult] = await conn.query(
            `INSERT INTO shops (code, name, owner_username, contact_name, address, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              shopCode,
              user.shop_name || user.username,
              user.username,
              user.shop_name || user.username,
              user.shop_address || null,
              user.shop_description || null
            ]
          );
          shopId = insertResult.insertId;
        }
        await conn.query('UPDATE users SET shop_id = ? WHERE id = ?', [shopId, user.id]);
      }
    }

    await conn.query(`
      UPDATE users staff_user
      JOIN users manager_user ON manager_user.username = staff_user.managed_by AND manager_user.role = 'shop'
      SET staff_user.shop_id = manager_user.shop_id
      WHERE staff_user.role = 'staff'
        AND staff_user.shop_id IS NULL
        AND manager_user.shop_id IS NOT NULL
    `);

    await conn.query(`
      UPDATE quest_chains qc
      LEFT JOIN users creator_user ON creator_user.username = qc.created_by
      SET qc.shop_id = creator_user.shop_id
      WHERE qc.shop_id IS NULL
        AND creator_user.shop_id IS NOT NULL
    `);

    await conn.query(`
      UPDATE quest_chains qc
      LEFT JOIN users creator_user ON creator_user.username = qc.created_by
      SET qc.billing_policy = CASE
        WHEN creator_user.role = 'admin' OR LOWER(COALESCE(qc.created_by, '')) = 'admin' THEN 'public_good'
        ELSE 'commercial'
      END
      WHERE qc.billing_policy IS NULL OR qc.billing_policy = '' OR qc.billing_policy = 'commercial'
    `);

    await conn.query(`
      UPDATE tasks t
      LEFT JOIN quest_chains qc ON qc.id = t.quest_chain_id
      LEFT JOIN users creator_user ON creator_user.username = t.created_by
      SET t.shop_id = COALESCE(qc.shop_id, creator_user.shop_id)
      WHERE t.shop_id IS NULL
        AND COALESCE(qc.shop_id, creator_user.shop_id) IS NOT NULL
    `);

    await conn.query(`
      UPDATE products p
      LEFT JOIN users creator_user ON creator_user.username = p.created_by
      SET p.shop_id = creator_user.shop_id
      WHERE p.shop_id IS NULL
        AND creator_user.shop_id IS NOT NULL
    `);

    await conn.query(`
      UPDATE user_coupons uc
      LEFT JOIN quest_chains qc ON qc.id = uc.quest_chain_id
      SET uc.shop_id = qc.shop_id
      WHERE uc.shop_id IS NULL
        AND qc.shop_id IS NOT NULL
    `);

    await conn.query(`
      UPDATE product_redemptions pr
      JOIN products p ON p.id = pr.product_id
      SET pr.shop_id = p.shop_id
      WHERE pr.shop_id IS NULL
        AND p.shop_id IS NOT NULL
    `);

    await conn.query(`
      UPDATE board_maps bm
      JOIN quest_chains qc ON qc.id = bm.quest_chain_id
      SET bm.shop_id = qc.shop_id
      WHERE bm.shop_id IS NULL
        AND qc.shop_id IS NOT NULL
    `);

    await conn.query(`
      UPDATE entry_billing_records ebr
      JOIN quest_chains qc ON qc.id = ebr.quest_chain_id
      SET ebr.status = 'cancelled',
          ebr.note = CONCAT(
            COALESCE(NULLIF(ebr.note, ''), '玩法入口建置費'),
            '｜公益入口免收建置費'
          )
      WHERE qc.billing_policy = 'public_good'
        AND ebr.billing_type = 'setup_fee'
        AND ebr.status <> 'cancelled'
    `);

    await conn.query(`
      UPDATE llm_usage_monthly_summary summary
      LEFT JOIN quest_chains qc ON qc.id = summary.quest_chain_id
      LEFT JOIN entry_plans ep ON ep.id = qc.plan_id
      SET summary.estimated_amount = CASE
            WHEN COALESCE(qc.billing_policy, 'commercial') = 'public_good' THEN 0
            WHEN COALESCE(qc.monthly_billing_enabled, TRUE) THEN COALESCE(ep.monthly_base_fee, 0) + (COALESCE(summary.total_tokens, 0) / 1000) * COALESCE(ep.token_price_per_1k, 0)
            ELSE 0
          END,
          summary.donated_amount = CASE
            WHEN COALESCE(qc.billing_policy, 'commercial') = 'public_good'
             AND COALESCE(qc.monthly_billing_enabled, TRUE)
              THEN COALESCE(ep.monthly_base_fee, 0) + (COALESCE(summary.total_tokens, 0) / 1000) * COALESCE(ep.token_price_per_1k, 0)
            ELSE 0
          END
    `);

    await ensureForeignKey(conn, 'users', 'fk_users_shop_id', 'ALTER TABLE users ADD CONSTRAINT fk_users_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'quest_chains', 'fk_quest_chains_shop_id', 'ALTER TABLE quest_chains ADD CONSTRAINT fk_quest_chains_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'quest_chains', 'fk_quest_chains_plan_id', 'ALTER TABLE quest_chains ADD CONSTRAINT fk_quest_chains_plan_id FOREIGN KEY (plan_id) REFERENCES entry_plans(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'tasks', 'fk_tasks_shop_id', 'ALTER TABLE tasks ADD CONSTRAINT fk_tasks_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'products', 'fk_products_shop_id', 'ALTER TABLE products ADD CONSTRAINT fk_products_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'user_coupons', 'fk_user_coupons_shop_id', 'ALTER TABLE user_coupons ADD CONSTRAINT fk_user_coupons_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'product_redemptions', 'fk_product_redemptions_shop_id', 'ALTER TABLE product_redemptions ADD CONSTRAINT fk_product_redemptions_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'board_maps', 'fk_board_maps_shop_id', 'ALTER TABLE board_maps ADD CONSTRAINT fk_board_maps_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'entry_billing_records', 'fk_entry_billing_records_shop_id', 'ALTER TABLE entry_billing_records ADD CONSTRAINT fk_entry_billing_records_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE');
    await ensureForeignKey(conn, 'entry_billing_records', 'fk_entry_billing_records_quest_chain_id', 'ALTER TABLE entry_billing_records ADD CONSTRAINT fk_entry_billing_records_quest_chain_id FOREIGN KEY (quest_chain_id) REFERENCES quest_chains(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'entry_billing_records', 'fk_entry_billing_records_plan_id', 'ALTER TABLE entry_billing_records ADD CONSTRAINT fk_entry_billing_records_plan_id FOREIGN KEY (plan_id) REFERENCES entry_plans(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'llm_usage_logs', 'fk_llm_usage_logs_shop_id', 'ALTER TABLE llm_usage_logs ADD CONSTRAINT fk_llm_usage_logs_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'llm_usage_logs', 'fk_llm_usage_logs_quest_chain_id', 'ALTER TABLE llm_usage_logs ADD CONSTRAINT fk_llm_usage_logs_quest_chain_id FOREIGN KEY (quest_chain_id) REFERENCES quest_chains(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'llm_usage_logs', 'fk_llm_usage_logs_task_id', 'ALTER TABLE llm_usage_logs ADD CONSTRAINT fk_llm_usage_logs_task_id FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'llm_usage_logs', 'fk_llm_usage_logs_user_id', 'ALTER TABLE llm_usage_logs ADD CONSTRAINT fk_llm_usage_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
    await ensureForeignKey(conn, 'llm_usage_monthly_summary', 'fk_llm_usage_monthly_summary_shop_id', 'ALTER TABLE llm_usage_monthly_summary ADD CONSTRAINT fk_llm_usage_monthly_summary_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE');
    await ensureForeignKey(conn, 'llm_usage_monthly_summary', 'fk_llm_usage_monthly_summary_quest_chain_id', 'ALTER TABLE llm_usage_monthly_summary ADD CONSTRAINT fk_llm_usage_monthly_summary_quest_chain_id FOREIGN KEY (quest_chain_id) REFERENCES quest_chains(id) ON DELETE SET NULL');

    console.log('🎉 商家平台基礎遷移完成');
  } catch (err) {
    console.error('❌ 商家平台基礎遷移失敗:', err);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

migrate();
