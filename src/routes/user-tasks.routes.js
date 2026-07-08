function registerUserTaskRoutes(app, {
  pool,
  authenticateToken,
  requireRole,
  reviewerAuth,
  parseJsonField,
  getQuestChainRuntimeFlags,
  evaluateAiTaskText,
  buildDemoAutoPassMessage,
  recordLlmUsage,
  completeUserTask,
  sendPushNotification,
  resolveUserFromRequest,
  getUserIdByUsername,
  getOrCreateUserTask,
  sanitizeTaskRow
}) {
app.get('/api/user-tasks', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;
  
  let conn;
  try {
    conn = await pool.getConnection();
    // 取得 user_id（使用認證的 username）
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.json({ success: true, tasks: [] });
    const userId = users[0].id;
    // 查詢進行中任務
    const [rows] = await conn.execute(
      `SELECT t.*, ut.status, ut.started_at, ut.finished_at, ut.id as user_task_id
       FROM user_tasks ut
       JOIN tasks t ON ut.task_id = t.id
       WHERE ut.user_id = ? AND ut.status = '進行中'`,
      [userId]
    );
    res.json({ success: true, tasks: rows });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 加入任務（需傳 username, task_id）
app.post('/api/user-tasks', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;

  const { task_id } = req.body;
  if (!task_id) return res.status(400).json({ success: false, message: '缺少參數' });
  let conn;
  try {
    conn = await pool.getConnection();
    // 取得 user_id 與 role（使用認證的 username，而不是請求中的 username）
    const [users] = await conn.execute('SELECT id, role FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.status(400).json({ success: false, message: '找不到使用者' });
    
    const user = users[0];
    const userId = user.id;
    // 檢查是否已經有進行中
    const [inProgress] = await conn.execute('SELECT id FROM user_tasks WHERE user_id = ? AND task_id = ? AND status = "進行中"', [userId, task_id]);
    if (inProgress.length > 0) return res.json({ success: true, message: '已在進行中', userTaskId: inProgress[0].id });

    // 檢查是否已經完成過
    const [completed] = await conn.execute('SELECT id FROM user_tasks WHERE user_id = ? AND task_id = ? AND status = "完成"', [userId, task_id]);
    if (completed.length > 0) return res.json({ success: false, message: '此任務已完成過，無法再次接取' });

    const [insertResult] = await conn.execute('INSERT INTO user_tasks (user_id, task_id, status) VALUES (?, ?, "進行中")', [userId, task_id]);
    res.json({ success: true, message: '已加入任務', userTaskId: insertResult.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 管理員刪除用戶任務紀錄 (重置任務狀態)
app.delete('/api/user-tasks/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    // 檢查該紀錄是否存在
    const [rows] = await conn.execute('SELECT id FROM user_tasks WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: '找不到該任務紀錄' });

    await conn.execute('DELETE FROM user_tasks WHERE id = ?', [id]);
    res.json({ success: true, message: '任務紀錄已刪除，玩家可重新接取' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 舊人工完成任務入口已停用，保留相容回應
app.post('/api/user-tasks/finish', reviewerAuth, async (req, res) => {
  return res.status(410).json({
    success: false,
    code: 'MANUAL_REVIEW_REMOVED',
    message: '平台已改為 AI / 系統自動判定，人工審核入口已停用'
  });
});

// 查詢單一任務
// ====== Rank 計算工具 ======
// 計算任務完成時間差並返回等級
// 注意：此函數假設資料庫 TIMESTAMP 存儲的是 UTC 時間
// 如果 MySQL 的 time_zone 設定為 UTC，則此假設正確
// 如果資料庫存儲的已經是本地時間（台灣時區），則不需要手動轉換
function getRank(started, finished) {
  if (!started || !finished) return '';
  
  // MySQL TIMESTAMP 類型會自動轉換為伺服器時區
  // 如果伺服器時區是 UTC，則需要手動轉換為台灣時區 (UTC+8)
  // 如果伺服器時區已經是 Asia/Taipei，則不需要轉換
  // 為了安全，這裡假設資料庫返回的是 UTC，手動轉換為台灣時區
  const startedDate = new Date(started);
  const finishedDate = new Date(finished);
  
  // 計算時間差（小時）- 直接計算，因為 Date 對象會自動處理時區
  // 如果資料庫返回的是 UTC 字符串，JavaScript Date 會自動轉換為本地時區
  // 所以這裡不需要手動加 8 小時，除非資料庫返回的是已經轉換過的本地時間字符串
  const diff = (finishedDate.getTime() - startedDate.getTime()) / (1000 * 60 * 60);
  
  // 等級判定（基於完成時間，單位：小時）
  if (diff <= 1) return 'S+';
  if (diff <= 2) return 'S';
  if (diff <= 3) return 'A';
  if (diff <= 4) return 'B';
  if (diff <= 5) return 'C';
  if (diff <= 6) return 'D';
  return 'E';
}

// 查詢使用者在各劇情任務線的目前進度 (具備自我修復功能)
app.get('/api/user/quest-progress', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;
  
  if (!username) {
    console.warn('[quest-progress] 未提供用戶名');
    return res.json({ success: true, progress: {} });
  } 

  let conn;
  try {
    conn = await pool.getConnection();
    
    // 取得 user_id
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.json({ success: true, progress: {} });
    const userId = users[0].id;

    // 1. 查詢 user_quests 表 (目前的記錄)
    const [questRows] = await conn.execute(
      'SELECT quest_chain_id, current_step_order FROM user_quests WHERE user_id = ?',
      [userId]
    );
    const currentProgress = {};
    questRows.forEach(row => {
      // 確保 quest_chain_id 作為字串 key，避免類型不匹配問題
      const chainId = String(row.quest_chain_id);
      currentProgress[chainId] = row.current_step_order;
    });

    // 2. 自我修復邏輯：檢查 user_tasks 中實際完成的任務
    // 找出每個劇情線中，使用者已完成的最大 quest_order
    const [completedRows] = await conn.execute(`
      SELECT t.quest_chain_id, MAX(t.quest_order) as max_completed_order
      FROM user_tasks ut
      JOIN tasks t ON ut.task_id = t.id
      WHERE ut.user_id = ? AND ut.status = '完成' AND t.quest_chain_id IS NOT NULL
      GROUP BY t.quest_chain_id
    `, [userId]);

    const updates = [];

    // 比對並修復
    for (const row of completedRows) {
      // 確保 chainId 作為字串，與 currentProgress 的 key 類型一致
      const chainId = String(row.quest_chain_id);
      const maxCompleted = row.max_completed_order;
      // 理論上，如果完成了第 N 關，當前進度應該是 N + 1
      const correctNextStep = maxCompleted + 1;

      if (!currentProgress[chainId]) {
        // 情況 A: user_quests 沒記錄，但有完成的任務 -> 補插入
        updates.push(
          conn.execute(
            'INSERT INTO user_quests (user_id, quest_chain_id, current_step_order) VALUES (?, ?, ?)',
            [userId, row.quest_chain_id, correctNextStep] // 資料庫插入時使用原始數字類型
          )
        );
        currentProgress[chainId] = correctNextStep;
      } else if (currentProgress[chainId] < correctNextStep) {
        // 情況 B: 記錄落後 (例如記錄是 1，但已經完成了第 1 關，應該要是 2) -> 更新
        updates.push(
          conn.execute(
            'UPDATE user_quests SET current_step_order = ? WHERE user_id = ? AND quest_chain_id = ?',
            [correctNextStep, userId, row.quest_chain_id] // 資料庫更新時使用原始數字類型
          )
        );
        currentProgress[chainId] = correctNextStep;
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
      console.log(`[quest-progress] 已自動修復使用者 ${username} 的 ${updates.length} 條劇情進度`);
    }

    console.log(`[quest-progress] 使用者 ${username} 的劇情進度:`, currentProgress);
    res.json({ success: true, progress: currentProgress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 查詢所有（進行中＋完成）任務
app.get('/api/user-tasks/all', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;
  
  let conn;
  try {
    conn = await pool.getConnection();
    // 取得 user_id（使用認證的 username）
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.json({ success: true, tasks: [] });
    const userId = users[0].id;
    // 查詢所有任務
    const [rows] = await conn.execute(
      `SELECT t.*, ut.status, ut.started_at, ut.finished_at, ut.id as user_task_id, ut.redeemed, ut.redeemed_at, ut.redeemed_by, ut.answer
       FROM user_tasks ut
       JOIN tasks t ON ut.task_id = t.id
       WHERE ut.user_id = ?
       ORDER BY ut.started_at DESC`,
      [userId]
    );
    // 加 rank
    const tasks = rows.map(row => ({
      ...row,
      rank: getRank(row.started_at, row.finished_at)
    }));
    res.json({ success: true, tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== Staff 兌換任務獎勵 =====
app.post('/api/user-tasks/:id/redeem', reviewerAuth, async (req, res) => {
  const { id } = req.params;
  const staffUser = req.user.username;
  let conn;
  try {
    conn = await pool.getConnection();
    // 只能兌換已完成且未兌換的（同時做任務建立者權限範圍判斷）
    const [rows] = await conn.execute(
      `SELECT ut.*, t.created_by
       FROM user_tasks ut
       JOIN tasks t ON ut.task_id = t.id
       WHERE ut.id = ? AND ut.status = "完成" AND ut.redeemed = 0`,
      [id]
    );
    if (rows.length === 0) return res.status(400).json({ success: false, message: '不可重複兌換或尚未完成' });

    // 新規則：shop 也可核銷全部任務（不限制 created_by）

    await conn.execute('UPDATE user_tasks SET redeemed = 1, redeemed_at = NOW(), redeemed_by = ? WHERE id = ?', [staffUser, id]);
    res.json({ success: true, message: '已兌換' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== Staff 查詢所有進行中任務（可搜尋） =====
app.get('/api/user-tasks/in-progress', reviewerAuth, async (req, res) => {
  res.json({
    success: true,
    tasks: [],
    message: '人工審核流程已停用，進行中的任務會由 AI 或系統規則自動判定'
  });
});

// ===== Staff 查詢所有已完成但未兌換的任務（可搜尋） =====
app.get('/api/user-tasks/to-redeem', reviewerAuth, async (req, res) => {
  const { taskName, username } = req.query;
  let conn;
  try {
    conn = await pool.getConnection();
    const userRole = req.user.role;
    const reqUsername = req.user.username;
    const reviewerOwner = reqUsername;
    let sql = `SELECT ut.id as user_task_id, ut.user_id, ut.task_id, ut.status, ut.started_at, ut.finished_at, ut.redeemed, ut.redeemed_at, ut.redeemed_by, u.username, t.name as task_name, t.description, t.points, t.created_by as task_creator, t.task_type
      FROM user_tasks ut
      JOIN users u ON ut.user_id = u.id
      JOIN tasks t ON ut.task_id = t.id
      WHERE ut.status = '完成' AND ut.redeemed = 0`;
    const params = [];

    // 新規則：shop 也可查看本商家範圍內的兌換資料（不再限制 created_by）

    if (taskName) {
      sql += ' AND t.name LIKE ?';
      params.push('%' + taskName + '%');
    }
    if (username) {
      sql += ' AND u.username LIKE ?';
      params.push('%' + username + '%');
    }
    sql += ' ORDER BY ut.finished_at DESC';
    const [rows] = await conn.execute(sql, params);
    res.json({ success: true, tasks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 儲存/更新猜謎答案或提交選擇題答案
app.patch('/api/user-tasks/:id/answer', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { answer } = req.body;
  if (!answer) return res.status(400).json({ success: false, message: '缺少答案' });
  
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;
  
  let conn;
  try {
    conn = await pool.getConnection();

    // 1. 取得任務資訊
    const [rows] = await conn.execute(`
      SELECT ut.*, t.task_type, t.options, t.correct_answer, t.points, t.name as task_name, ut.user_id, ut.task_id, t.quest_chain_id, t.quest_order,
             COALESCE(t.shop_id, qc.shop_id) AS shop_id,
             t.validation_mode, t.ai_config, t.pass_criteria, t.failure_message, t.success_message,
             qc.game_rules, qc.content_blueprint
      FROM user_tasks ut
      JOIN tasks t ON ut.task_id = t.id
      LEFT JOIN quest_chains qc ON t.quest_chain_id = qc.id
      WHERE ut.id = ?
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ success: false, message: '任務不存在' });
    const userTask = rows[0];
    
    // 2. 驗證任務屬於當前用戶
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.status(401).json({ success: false, message: '用戶不存在' });
    const userId = users[0].id;
    
    if (userTask.user_id !== userId) {
      return res.status(403).json({ success: false, message: '無權限：此任務不屬於您' });
    }

    if (userTask.status === '完成') {
       return res.json({ 
         success: true, 
         message: '任務已完成，無需更新',
         isCompleted: true,
         questChainCompleted: false,
         questChainReward: null
       });
    }

    let isCompleted = false;
    let message = '答案已儲存';
    let earnedItemName = null; // 移到外層宣告
    let questChainCompleted = false; // 移到外層宣告
    let questChainReward = null; // 移到外層宣告
    const runtimeFlags = getQuestChainRuntimeFlags(userTask);
    let aiTextEvaluation = null;
    const normalizeAnswerForCompare = (value) => String(value ?? '').trim().toLowerCase();
    const toAsciiUpper = (char) => {
      if (!char) return '';
      const code = char.charCodeAt(0);
      if (code >= 0xFF21 && code <= 0xFF3A) {
        return String.fromCharCode(code - 0xFEE0);
      }
      return char.toUpperCase();
    };
    const extractChoiceKey = (value) => {
      const raw = String(value ?? '').trim();
      if (!raw) return '';
      const normalized = raw.replace(/^[\(\[（【「\s]+/, '');
      const first = toAsciiUpper(normalized.charAt(0));
      return /^[A-D]$/.test(first) ? first : '';
    };
    const readChoiceText = (option) => {
      if (typeof option === 'string') return option.trim();
      if (!option || typeof option !== 'object') return '';
      return String(option.value ?? option.label ?? option.text ?? option.title ?? option.name ?? '').trim();
    };
    const resolveOptionByKey = (options, key) => {
      if (!key || !Array.isArray(options)) return '';
      const indexed = options[key.charCodeAt(0) - 65];
      return readChoiceText(indexed);
    };
    const isMultipleChoiceAnswerMatch = (submittedAnswer, correctAnswer, rawOptions) => {
      const submitted = String(submittedAnswer ?? '').trim();
      const correct = String(correctAnswer ?? '').trim();
      if (!submitted || !correct) return false;
      if (normalizeAnswerForCompare(submitted) === normalizeAnswerForCompare(correct)) return true;

      const submittedKey = extractChoiceKey(submitted);
      const correctKey = extractChoiceKey(correct);
      if (submittedKey && correctKey && submittedKey === correctKey) return true;

      const options = parseJsonField(rawOptions, []);
      const correctFromKey = resolveOptionByKey(options, correctKey);
      const submittedFromKey = resolveOptionByKey(options, submittedKey);

      if (correctFromKey && normalizeAnswerForCompare(submitted) === normalizeAnswerForCompare(correctFromKey)) return true;
      if (submittedFromKey && normalizeAnswerForCompare(submittedFromKey) === normalizeAnswerForCompare(correct)) return true;
      return false;
    };

    // 2. 檢查是否為自動驗證題型且答案正確
    if (runtimeFlags.demoAutoPass) {
      isCompleted = true;
      message = buildDemoAutoPassMessage(userTask);
    } else if (userTask.validation_mode === 'ai_text_check' || userTask.task_type === 'qa') {
      aiTextEvaluation = await evaluateAiTaskText(userTask, answer, {
        timeoutMs: 90000,
        maxRetries: 1
      });
      const textResult = aiTextEvaluation.parsed;
      isCompleted = Boolean(textResult.passed);
      message = isCompleted
        ? (userTask.success_message || textResult.reason || 'AI 認為你的回答已符合題意，任務完成！')
        : (textResult.reason || userTask.failure_message || 'AI 認為這次回答還沒有抓到題目重點。');
    } else if (userTask.task_type === 'photo') {
      isCompleted = true;
      message = userTask.success_message || '照片已提交完成，系統已自動記錄這一關。';
    } else if (['multiple_choice', 'number', 'keyword', 'location'].includes(userTask.task_type)) {
      if (userTask.task_type === 'location') {
        // 地理圍欄任務：只要前端送出請求，即視為完成
        isCompleted = true;
        message = '📍 打卡成功！';
      } else if (userTask.task_type === 'multiple_choice'
        && isMultipleChoiceAnswerMatch(answer, userTask.correct_answer, userTask.options)) {
        isCompleted = true;
        message = '答對了！任務完成！';
      } else if (userTask.correct_answer
        && normalizeAnswerForCompare(answer) === normalizeAnswerForCompare(userTask.correct_answer)) {
        isCompleted = true;
        message = '答對了！任務完成！';
      } else {
        // 答錯，不完成任務
        message = '答案不正確，請再試一次';
      }
    }

    // 3. 更新狀態
    if (isCompleted) {
       await conn.beginTransaction();
       try {
         await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [answer, id]);
         if (aiTextEvaluation) {
           const [attemptCountRows] = await conn.execute(
             'SELECT COUNT(*) AS count FROM task_attempts WHERE user_task_id = ?',
             [id]
           );
           const attemptNo = Number(attemptCountRows[0]?.count || 0) + 1;
           await recordLlmUsage(conn, userTask, userId, aiTextEvaluation?.usage, {
             model: aiTextEvaluation?.model || null,
             request_type: 'ai_text_submit',
             success: true
           });
           await conn.execute(
             `INSERT INTO task_attempts
               (user_id, task_id, user_task_id, attempt_no, submission_type, submitted_answer, ai_result, ai_raw_response, passed,
                score, failure_reason, retry_advice)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
             [
               userId,
               userTask.task_id,
               id,
               attemptNo,
               'answer',
               answer,
               JSON.stringify(aiTextEvaluation.parsed),
               aiTextEvaluation.rawContent,
               true,
               aiTextEvaluation.parsed.score,
               null,
               null
             ]
           );
         }
         ({ message, earnedItemName, questChainCompleted, questChainReward } = await completeUserTask(conn, userTask));

         await conn.commit();
       } catch (err) {
         await conn.rollback();
         throw err;
       }
    } else {
       // 只更新答案，狀態不變（保持進行中）
       await conn.beginTransaction();
       try {
         await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [answer, id]);
         if (aiTextEvaluation) {
           const [attemptCountRows] = await conn.execute(
             'SELECT COUNT(*) AS count FROM task_attempts WHERE user_task_id = ?',
             [id]
           );
           const attemptNo = Number(attemptCountRows[0]?.count || 0) + 1;
           await recordLlmUsage(conn, userTask, userId, aiTextEvaluation?.usage, {
             model: aiTextEvaluation?.model || null,
             request_type: 'ai_text_submit',
             success: false
           });
           await conn.execute(
             `INSERT INTO task_attempts
               (user_id, task_id, user_task_id, attempt_no, submission_type, submitted_answer, ai_result, ai_raw_response, passed,
                score, failure_reason, retry_advice)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
             [
               userId,
               userTask.task_id,
               id,
               attemptNo,
               'answer',
               answer,
               JSON.stringify(aiTextEvaluation.parsed),
               aiTextEvaluation.rawContent,
               false,
               aiTextEvaluation.parsed.score,
               aiTextEvaluation.parsed.reason || userTask.failure_message || 'AI 判定未通過',
               aiTextEvaluation.parsed.retry_advice || null
             ]
           );
         }
         await conn.commit();
       } catch (err) {
         await conn.rollback();
         throw err;
       }
    }

    // 如果任務完成，發送推送通知
    if (isCompleted) {
      const pushTitle = questChainCompleted 
        ? '🎉 劇情線完成！' 
        : '✅ 任務完成！';
      
      let pushBody = `恭喜完成「${userTask.task_name}」`;
      if (earnedItemName) {
        pushBody += `，獲得道具：${earnedItemName}`;
      }
      if (questChainCompleted && questChainReward) {
        pushBody += `\n獲得稱號：${questChainReward.badge_name || '未命名稱號'}`;
        if (questChainReward.chain_points > 0) {
          pushBody += `\n額外積分：${questChainReward.chain_points}`;
        }
      }

      // 非阻塞方式發送推送（不等待完成）
      sendPushNotification(
        userTask.user_id,
        pushTitle,
        pushBody,
        {
          url: `/task-detail.html?id=${userTask.task_id}`,
          taskId: userTask.task_id
        }
      ).catch(err => {
        console.error('推送通知發送失敗（非阻塞）:', err);
      });
    }

    res.json({ 
      success: true, 
      message, 
      isCompleted, 
      earnedItemName,
      questChainCompleted,
      questChainReward: questChainCompleted ? questChainReward : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/user-tasks/:id/attempts', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const user = await resolveUserFromRequest(conn, req.user.username);
    if (!user) return res.status(401).json({ success: false, message: '用戶不存在' });

    const [userTasks] = await conn.execute('SELECT id, user_id FROM user_tasks WHERE id = ?', [id]);
    if (userTasks.length === 0) {
      return res.status(404).json({ success: false, message: '找不到任務紀錄' });
    }
    if (user.role !== 'admin' && userTasks[0].user_id !== user.id) {
      return res.status(403).json({ success: false, message: '無權限查看此任務挑戰紀錄' });
    }

    const [attempts] = await conn.execute(
      `SELECT id, attempt_no, submission_type, submission_url, submitted_answer, ai_result, passed,
              score, detected_count, detected_label, failure_reason, retry_advice, created_at
       FROM task_attempts
       WHERE user_task_id = ?
       ORDER BY attempt_no DESC`,
      [id]
    );
    res.json({
      success: true,
      attempts: attempts.map(attempt => ({
        ...attempt,
        ai_result: parseJsonField(attempt.ai_result, null),
        passed: Boolean(attempt.passed)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 教學模式非照片任務完成（已登入用戶）
app.post('/api/tutorial/tasks/:taskId/complete', authenticateToken, async (req, res) => {
  const { taskId } = req.params;
  const { answer } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    const userId = await getUserIdByUsername(conn, req.user.username);
    if (!userId) return res.status(400).json({ success: false, message: '使用者不存在' });

    const [tasks] = await conn.execute(
      `SELECT t.*, qc.game_rules, qc.content_blueprint, qc.experience_mode, qc.play_style
       FROM tasks t
       LEFT JOIN quest_chains qc ON t.quest_chain_id = qc.id
       WHERE t.id = ?`,
      [taskId]
    );
    if (!tasks.length) return res.status(404).json({ success: false, message: '找不到任務' });
    const task = sanitizeTaskRow(tasks[0]);

    const runtimeFlags = getQuestChainRuntimeFlags(task);
    if (!runtimeFlags.demoAutoPass && !runtimeFlags.tutorialMode) {
      return res.status(403).json({ success: false, message: '此任務不允許教學模式完成' });
    }

    await conn.beginTransaction();
    try {
      const userTask = await getOrCreateUserTask(conn, userId, Number(taskId));
      if (userTask.status === '完成') {
        await conn.commit();
        return res.json({ success: true, user_task_id: userTask.id, earnedItemName: null, message: '任務已完成' });
      }
      await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [answer || 'tutorial_pass', userTask.id]);
      const completion = await completeUserTask(conn, {
        ...userTask,
        task_name: task.name,
        task_id: task.id,
        user_id: userId,
        points: task.points,
        quest_chain_id: task.quest_chain_id,
        quest_order: task.quest_order
      });
      await conn.commit();
      res.json({ success: true, user_task_id: userTask.id, earnedItemName: completion?.earnedItemName || null });
    } catch (txErr) {
      try { await conn.rollback(); } catch (_) {}
      throw txErr;
    }
  } catch (err) {
    console.error('教學模式任務完成失敗:', err);
    res.status(500).json({ success: false, message: err.message || '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 獲取用戶的所有稱號
app.get('/api/user/badges', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;

  let conn;
  try {
    conn = await pool.getConnection();
    
    // 獲取用戶 ID
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.json({ success: true, badges: [] });
    }
    const userId = users[0].id;

    // 從 user_quests JOIN quest_chains 獲取已完成的劇情稱號
    const [badges] = await conn.execute(
      `SELECT 
        uq.id,
        qc.badge_name as name,
        qc.badge_image as image_url,
        uq.completed_at as obtained_at,
        'quest' as source_type,
        uq.quest_chain_id as source_id
      FROM user_quests uq
      JOIN quest_chains qc ON uq.quest_chain_id = qc.id
      WHERE uq.user_id = ? AND uq.is_completed = TRUE AND qc.badge_name IS NOT NULL
      ORDER BY uq.completed_at DESC`,
      [userId]
    );

    res.json({ success: true, badges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});
}

module.exports = {
  registerUserTaskRoutes
};
