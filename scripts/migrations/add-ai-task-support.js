const mysql = require('mysql2/promise');
const { getDbConfig } = require('../../db-config');

const dbConfig = getDbConfig();

async function migrate() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('🔄 開始執行 AI 任務支援遷移...');

    const taskColumns = [
      {
        name: 'submission_type',
        definition: "VARCHAR(20) NOT NULL DEFAULT 'answer' COMMENT 'answer, image'"
      },
      {
        name: 'validation_mode',
        definition: "VARCHAR(50) NOT NULL DEFAULT 'manual' COMMENT 'manual, keyword, ai_count, ai_identify, ai_score, ai_rule_check'"
      },
      {
        name: 'ai_config',
        definition: "JSON NULL COMMENT 'AI task prompt and task configuration'"
      },
      {
        name: 'pass_criteria',
        definition: "JSON NULL COMMENT 'AI pass thresholds and rule settings'"
      },
      {
        name: 'failure_message',
        definition: "TEXT NULL COMMENT 'Default failure message shown to the user'"
      },
      {
        name: 'success_message',
        definition: "TEXT NULL COMMENT 'Default success message shown to the user'"
      },
      {
        name: 'max_attempts',
        definition: "INT NULL COMMENT 'Maximum attempt count for the task'"
      },
      {
        name: 'location_required',
        definition: "BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether task submission requires location check'"
      }
    ];

    for (const column of taskColumns) {
      const [rows] = await conn.execute(`SHOW COLUMNS FROM tasks LIKE '${column.name}'`);
      if (rows.length === 0) {
        console.log(`🛠 新增 tasks.${column.name} 欄位...`);
        await conn.execute(`ALTER TABLE tasks ADD COLUMN ${column.name} ${column.definition}`);
      } else {
        console.log(`ℹ️ tasks.${column.name} 已存在，跳過`);
      }
    }

    const [attemptTables] = await conn.execute("SHOW TABLES LIKE 'task_attempts'");
    if (attemptTables.length === 0) {
      console.log('📦 建立 task_attempts 表格...');
      await conn.execute(`
        CREATE TABLE task_attempts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          task_id INT NOT NULL,
          user_task_id INT NOT NULL,
          attempt_no INT NOT NULL,
          submission_type VARCHAR(20) NOT NULL DEFAULT 'image',
          submission_url VARCHAR(255) NULL,
          submitted_answer TEXT NULL,
          ai_result JSON NULL,
          ai_raw_response LONGTEXT NULL,
          passed BOOLEAN NOT NULL DEFAULT FALSE,
          score DECIMAL(6,2) NULL,
          detected_count INT NULL,
          detected_label VARCHAR(255) NULL,
          failure_reason TEXT NULL,
          retry_advice TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
          FOREIGN KEY (user_task_id) REFERENCES user_tasks(id) ON DELETE CASCADE,
          UNIQUE KEY unique_user_task_attempt (user_task_id, attempt_no),
          KEY idx_task_attempts_user_task (user_task_id),
          KEY idx_task_attempts_user_task_created (user_task_id, created_at),
          KEY idx_task_attempts_task_user (task_id, user_id)
        )
      `);
    } else {
      console.log('ℹ️ task_attempts 表格已存在，跳過');
    }

    console.log('✅ AI 任務支援遷移完成');
  } catch (err) {
    console.error('❌ AI 任務支援遷移失敗:', err);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

migrate();
