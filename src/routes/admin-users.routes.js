const XLSX = require('xlsx');

function getRandomDate(start, end, { startHour = 7, endHour = 23 } = {}) {
  const startTime = start.getTime();
  const endTime = end.getTime();
  const diff = endTime - startTime;
  const randomTime = startTime + Math.random() * diff;
  const date = new Date(randomTime);
  const randomHour = Math.floor(Math.random() * (endHour - startHour + 1)) + startHour;
  const randomMinute = Math.floor(Math.random() * 60);
  const randomSecond = Math.floor(Math.random() * 60);
  date.setHours(randomHour, randomMinute, randomSecond);
  return date;
}

function formatMysqlDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function registerAdminUserRoutes(app, { pool, adminAuth, uploadExcel }) {
  app.get('/api/admin/users', adminAuth, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const searchRaw = String(req.query.search || '').trim().slice(0, 120);
    const safeSearch = searchRaw.replace(/[%_\\]/g, '');
    const searchPattern = safeSearch.length ? `%${safeSearch}%` : null;

    let conn;
    try {
      conn = await pool.getConnection();

      let countSql = `SELECT COUNT(*) as total FROM users u WHERE u.role = 'user'`;
      const countParams = [];
      if (searchPattern) {
        countSql += ' AND u.username LIKE ?';
        countParams.push(searchPattern);
      }
      const [totalCount] = await conn.execute(countSql, countParams);
      const totalUsers = totalCount[0].total;

      const searchSql = searchPattern ? 'AND u.username LIKE ?' : '';
      const listParams = searchPattern ? [searchPattern, limit, offset] : [limit, offset];
      const [users] = await conn.query(
        `
        SELECT
          u.id,
          u.username,
          u.role,
          u.created_at,
          COALESCE(points.total_points, 0) AS total_points,
          COALESCE(tasks.completed_tasks, 0) AS completed_tasks,
          COALESCE(tasks.in_progress_tasks, 0) AS in_progress_tasks
        FROM users u
        LEFT JOIN (
          SELECT
            user_id,
            COALESCE(SUM(CASE WHEN type = 'earned' THEN points ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN type = 'spent' THEN points ELSE 0 END), 0) AS total_points
          FROM point_transactions
          GROUP BY user_id
        ) points ON points.user_id = u.id
        LEFT JOIN (
          SELECT
            user_id,
            SUM(CASE WHEN status = '完成' THEN 1 ELSE 0 END) AS completed_tasks,
            SUM(CASE WHEN status = '進行中' THEN 1 ELSE 0 END) AS in_progress_tasks
          FROM user_tasks
          GROUP BY user_id
        ) tasks ON tasks.user_id = u.id
        WHERE u.role = 'user'
        ${searchSql}
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
      `,
        listParams
      );

      const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

      res.json({
        success: true,
        users,
        total: totalUsers,
        pagination: {
          page,
          limit,
          totalUsers,
          totalPages
        }
      });
    } catch (err) {
      console.error('獲取用戶列表失敗:', err);
      console.error('錯誤詳情:', err.message);
      console.error('錯誤堆疊:', err.stack);
      res.status(500).json({
        success: false,
        message: '伺服器錯誤',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/admin/users/:userId/tasks', adminAuth, async (req, res) => {
    const { userId } = req.params;

    let conn;
    try {
      conn = await pool.getConnection();

      const [userCheck] = await conn.execute(
        'SELECT id, username FROM users WHERE id = ? AND role = ?',
        [userId, 'user']
      );

      if (userCheck.length === 0) {
        return res.status(404).json({ success: false, message: '用戶不存在' });
      }

      const [tasks] = await conn.query(`
        SELECT
          ut.id as user_task_id,
          ut.status,
          ut.started_at,
          ut.finished_at,
          ut.answer,
          t.id as task_id,
          t.name as task_name,
          t.points,
          t.type as task_type
        FROM user_tasks ut
        INNER JOIN tasks t ON ut.task_id = t.id
        WHERE ut.user_id = ?
        ORDER BY ut.started_at DESC
      `, [userId]);

      res.json({
        success: true,
        user: userCheck[0],
        tasks
      });
    } catch (err) {
      console.error('獲取用戶任務詳情失敗:', err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/admin/users/export', adminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();

      const [users] = await conn.query(`
        SELECT
          u.id,
          u.username,
          u.role,
          DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') as created_at,
          COALESCE(points.total_points, 0) AS total_points,
          COALESCE(tasks.completed_tasks, 0) AS completed_tasks,
          COALESCE(tasks.in_progress_tasks, 0) AS in_progress_tasks
        FROM users u
        LEFT JOIN (
          SELECT
            user_id,
            COALESCE(SUM(CASE WHEN type = 'earned' THEN points ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN type = 'spent' THEN points ELSE 0 END), 0) AS total_points
          FROM point_transactions
          GROUP BY user_id
        ) points ON points.user_id = u.id
        LEFT JOIN (
          SELECT
            user_id,
            SUM(CASE WHEN status = '完成' THEN 1 ELSE 0 END) AS completed_tasks,
            SUM(CASE WHEN status = '進行中' THEN 1 ELSE 0 END) AS in_progress_tasks
          FROM user_tasks
          GROUP BY user_id
        ) tasks ON tasks.user_id = u.id
        WHERE u.role = 'user'
        ORDER BY u.created_at DESC
      `);

      const wsData = users.map(user => ({
        '用戶ID': user.id,
        '帳號': user.username,
        '角色': user.role,
        '註冊時間': user.created_at,
        '總積分': user.total_points,
        '已完成任務數': user.completed_tasks,
        '進行中任務數': user.in_progress_tasks
      }));

      const ws = XLSX.utils.json_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '會員列表');

      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = `會員資料_${new Date().toISOString().split('T')[0]}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(excelBuffer);
    } catch (err) {
      console.error('導出 Excel 失敗:', err);
      res.status(500).json({ success: false, message: '導出失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/admin/import-users', adminAuth, uploadExcel.single('file'), async (req, res) => {
    const { simulateActivity, startDate, endDate } = req.body;
    const isSimulationEnabled = simulateActivity === 'true';

    if (!req.file) {
      return res.status(400).json({ success: false, message: '請上傳 Excel 檔案' });
    }

    let conn;
    try {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      if (data.length === 0) {
        return res.status(400).json({ success: false, message: 'Excel 檔案內容為空' });
      }

      const phoneKey = data[0].phone ? 'phone' : (data[0]['手機號碼'] ? '手機號碼' : null);
      if (!phoneKey) {
        return res.status(400).json({ success: false, message: '找不到手機號碼欄位 (請使用 "phone" 或 "手機號碼")' });
      }

      conn = await pool.getConnection();

      let independentTasks = [];
      let questChains = [];

      if (isSimulationEnabled) {
        const [tasks] = await conn.execute('SELECT id, points, quest_chain_id, quest_order FROM tasks');
        const [chains] = await conn.execute('SELECT id FROM quest_chains');

        independentTasks = tasks.filter(t => !t.quest_chain_id);

        const questTasks = tasks.filter(t => t.quest_chain_id);
        chains.forEach(chain => {
          const chainTasks = questTasks
            .filter(t => t.quest_chain_id === chain.id)
            .sort((a, b) => a.quest_order - b.quest_order);
          if (chainTasks.length > 0) {
            questChains.push({
              id: chain.id,
              tasks: chainTasks
            });
          }
        });
      }

      let successCount = 0;
      let skipCount = 0;
      const password = '';

      const START_DATE = startDate ? new Date(startDate) : new Date('2025-11-01');
      const END_DATE = endDate ? new Date(endDate) : new Date('2025-12-29');
      END_DATE.setHours(23, 59, 59, 999);

      for (const row of data) {
        const phone = String(row[phoneKey]).trim();
        if (!phone) continue;

        try {
          const [existing] = await conn.execute('SELECT id FROM users WHERE username = ?', [phone]);
          if (existing.length > 0) {
            skipCount++;
            continue;
          }

          const createdAt = getRandomDate(START_DATE, END_DATE);
          const formattedDate = formatMysqlDate(createdAt);

          const [result] = await conn.execute(
            'INSERT INTO users (username, password, role, created_at) VALUES (?, ?, ?, ?)',
            [phone, password, 'user', formattedDate]
          );

          const userId = result.insertId;
          successCount++;

          if (isSimulationEnabled) {
            const maxIndependent = Math.min(independentTasks.length, 5);
            const numIndependent = Math.floor(Math.random() * (maxIndependent + 1));
            const shuffledTasks = independentTasks.sort(() => 0.5 - Math.random());
            const selectedIndependent = shuffledTasks.slice(0, numIndependent);

            for (const task of selectedIndependent) {
              const taskTime = new Date(createdAt.getTime() + (Math.random() * 30 * 24 * 60 * 60 * 1000) + (60 * 60 * 1000));
              if (taskTime > new Date()) continue;

              const formattedTaskTime = formatMysqlDate(taskTime);

              await conn.execute(
                `INSERT INTO user_tasks (user_id, task_id, status, started_at, finished_at, answer)
                 VALUES (?, ?, '完成', ?, ?, ?)`,
                [userId, task.id, formattedTaskTime, formattedTaskTime, '模擬作答']
              );

              await conn.execute(
                `INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id, created_at)
                 VALUES (?, 'earned', ?, ?, 'task_completion', ?, ?)`,
                [userId, task.points, `完成任務 #${task.id}`, task.id, formattedTaskTime]
              );
            }

            const maxChains = Math.min(questChains.length, 2);
            const numChains = Math.floor(Math.random() * (maxChains + 1));
            const shuffledChains = questChains.sort(() => 0.5 - Math.random());
            const selectedChains = shuffledChains.slice(0, numChains);

            for (const chain of selectedChains) {
              const progress = Math.floor(Math.random() * chain.tasks.length) + 1;
              let lastTaskTime = new Date(createdAt.getTime() + (Math.random() * 24 * 60 * 60 * 1000));

              for (let i = 0; i < progress; i++) {
                const task = chain.tasks[i];
                lastTaskTime = new Date(lastTaskTime.getTime() + (Math.random() * 2 * 60 * 60 * 1000) + (10 * 60 * 1000));

                if (lastTaskTime > new Date()) break;

                const formattedTaskTime = formatMysqlDate(lastTaskTime);
                const isLastInProgress = (i === progress - 1) && (Math.random() < 0.3);

                if (isLastInProgress) {
                  await conn.execute(
                    `INSERT INTO user_tasks (user_id, task_id, status, started_at)
                     VALUES (?, ?, '進行中', ?)`,
                    [userId, task.id, formattedTaskTime]
                  );
                } else {
                  await conn.execute(
                    `INSERT INTO user_tasks (user_id, task_id, status, started_at, finished_at, answer)
                     VALUES (?, ?, '完成', ?, ?, ?)`,
                    [userId, task.id, formattedTaskTime, formattedTaskTime, '模擬劇情作答']
                  );

                  await conn.execute(
                    `INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id, created_at)
                     VALUES (?, 'earned', ?, ?, 'task_completion', ?, ?)`,
                    [userId, task.points, `完成劇情任務 #${task.id}`, task.id, formattedTaskTime]
                  );
                }
              }
            }
          }
        } catch (err) {
          console.error(`匯入失敗: ${phone}`, err);
        }
      }

      res.json({
        success: true,
        message: `匯入完成。成功: ${successCount}, 重複跳過: ${skipCount}`,
        details: { successCount, skipCount }
      });
    } catch (err) {
      console.error('Excel 匯入失敗:', err);
      res.status(500).json({ success: false, message: '匯入過程發生錯誤: ' + err.message });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  registerAdminUserRoutes
};
