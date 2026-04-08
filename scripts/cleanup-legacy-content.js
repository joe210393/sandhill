const mysql = require('mysql2/promise');

const KEEP_IDS = [9, 10];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '150.109.72.98',
    port: Number(process.env.MYSQL_PORT || 31591),
    user: process.env.MYSQL_USERNAME || 'root',
    password: process.env.MYSQL_PASSWORD || '4q7aRwS2d5G0czEL6bAPCmT8I9Zvp3H1',
    database: process.env.MYSQL_DATABASE || 'zeabur'
  });

  try {
    const [legacyChains] = await conn.query(
      `SELECT id, title FROM quest_chains WHERE id NOT IN (${KEEP_IDS.map(() => '?').join(',')}) ORDER BY id`,
      KEEP_IDS
    );
    console.log(`準備清理 ${legacyChains.length} 條舊玩法入口`);
    legacyChains.forEach((row) => console.log(`- ${row.id}｜${row.title}`));

    await conn.beginTransaction();

    const [legacyTasks] = await conn.query(
      `SELECT id FROM tasks WHERE quest_chain_id NOT IN (${KEEP_IDS.map(() => '?').join(',')})`,
      KEEP_IDS
    );
    const legacyTaskIds = legacyTasks.map((row) => row.id);

    if (legacyTaskIds.length) {
      await conn.query(
        `UPDATE board_tiles SET task_id = NULL WHERE task_id IN (${legacyTaskIds.map(() => '?').join(',')})`,
        legacyTaskIds
      );
      await conn.query(
        `DELETE FROM user_tasks WHERE task_id IN (${legacyTaskIds.map(() => '?').join(',')})`,
        legacyTaskIds
      );
      await conn.query(
        `UPDATE point_transactions
         SET reference_id = NULL,
             description = CONCAT(description, ' (舊劇情清理)')
         WHERE reference_type = 'task_completion'
           AND reference_id IN (${legacyTaskIds.map(() => '?').join(',')})`,
        legacyTaskIds
      );
      await conn.query(
        `DELETE FROM tasks WHERE id IN (${legacyTaskIds.map(() => '?').join(',')})`,
        legacyTaskIds
      );
    }

    const [legacyBoardMaps] = await conn.query(
      `SELECT id FROM board_maps WHERE quest_chain_id NOT IN (${KEEP_IDS.map(() => '?').join(',')})`,
      KEEP_IDS
    );
    const legacyBoardMapIds = legacyBoardMaps.map((row) => row.id);
    if (legacyBoardMapIds.length) {
      await conn.query(
        `DELETE FROM board_maps WHERE id IN (${legacyBoardMapIds.map(() => '?').join(',')})`,
        legacyBoardMapIds
      );
    }

    await conn.query(
      `DELETE FROM user_game_sessions WHERE quest_chain_id NOT IN (${KEEP_IDS.map(() => '?').join(',')})`,
      KEEP_IDS
    );
    await conn.query(
      `DELETE FROM user_quests WHERE quest_chain_id NOT IN (${KEEP_IDS.map(() => '?').join(',')})`,
      KEEP_IDS
    );
    await conn.query(
      `UPDATE point_transactions
       SET reference_id = NULL,
           description = CONCAT(description, ' (舊劇情清理)')
       WHERE reference_type = 'quest_chain_completion'
         AND reference_id NOT IN (${KEEP_IDS.map(() => '?').join(',')})`,
      KEEP_IDS
    );
    await conn.query(
      `DELETE FROM quest_chains WHERE id NOT IN (${KEEP_IDS.map(() => '?').join(',')})`,
      KEEP_IDS
    );

    await conn.commit();

    const [remaining] = await conn.query(
      'SELECT id, title, mode_type FROM quest_chains ORDER BY id'
    );
    console.log('清理完成，剩餘玩法入口：');
    remaining.forEach((row) => console.log(`- ${row.id}｜${row.title}｜${row.mode_type}`));
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
