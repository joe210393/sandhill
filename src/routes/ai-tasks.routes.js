function registerAiTaskRoutes(app, {
  pool,
  authenticateToken,
  uploadAiTaskImage,
  getOptionalTokenUser,
  getUserIdByUsername,
  resolveUserFromRequest,
  sanitizeTaskRow,
  getQuestChainRuntimeFlags,
  saveBufferAsImage,
  evaluateAiTaskImage,
  buildDemoAiResult,
  buildTutorialForcedAiReason,
  recordLlmUsage,
  getOrCreateUserTask,
  completeUserTask,
  AI_VALIDATION_MODES
}) {
  app.post('/api/tutorial/ai-tasks/:taskId/submit', uploadAiTaskImage.single('image'), async (req, res) => {
    const { taskId } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, message: '請先上傳圖片' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const [tasks] = await conn.execute(
        `SELECT t.*, qc.name AS quest_chain_name, qc.game_rules, qc.content_blueprint, qc.experience_mode, qc.play_style
         FROM tasks t
         LEFT JOIN quest_chains qc ON t.quest_chain_id = qc.id
         WHERE t.id = ?`,
        [taskId]
      );
      if (tasks.length === 0) {
        return res.status(404).json({ success: false, message: '找不到任務' });
      }

      const task = sanitizeTaskRow(tasks[0]);
      if (!AI_VALIDATION_MODES.includes(task.validation_mode)) {
        return res.status(400).json({ success: false, message: '此任務不是 AI 驗證任務' });
      }
      if (task.submission_type !== 'image') {
        return res.status(400).json({ success: false, message: '此任務目前不支援圖片提交' });
      }

      const runtimeFlags = getQuestChainRuntimeFlags(task);
      const tutorialLikeMode = runtimeFlags.demoAutoPass || runtimeFlags.tutorialMode;
      if (!tutorialLikeMode) {
        return res.status(403).json({ success: false, message: '這個教學關卡目前不允許匿名體驗' });
      }

      const submissionUrl = saveBufferAsImage(req.file);
      let lmEvaluation = null;
      try {
        lmEvaluation = await evaluateAiTaskImage(task, req.file, {
          latitude: req.body.latitude,
          longitude: req.body.longitude,
          timeoutMs: tutorialLikeMode ? 90000 : 180000,
          maxRetries: tutorialLikeMode ? 0 : 2
        });
      } catch (lmErr) {
        console.warn('教學模式匿名 LM 判定失敗，改用自動放行內容:', lmErr?.message || lmErr);
      }

      const fallbackResult = buildDemoAiResult(task, submissionUrl);
      const lmResult = lmEvaluation?.parsed || null;
      const optionalUser = getOptionalTokenUser(req);
      const optionalUserId = optionalUser?.username ? await getUserIdByUsername(conn, optionalUser.username) : null;

      await recordLlmUsage(conn, task, optionalUserId, lmEvaluation?.usage, {
        model: lmEvaluation?.model || null,
        request_type: 'tutorial_ai_submit',
        success: true,
        tutorial_guest: !optionalUser
      });

      let userTaskId = null;
      let earnedItemName = null;
      if (optionalUser) {
        try {
          const userId = optionalUserId;
          if (userId) {
            await conn.beginTransaction();
            try {
              const userTask = await getOrCreateUserTask(conn, userId, Number(taskId));
              if (userTask.status !== '完成') {
                await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [submissionUrl, userTask.id]);
                const completion = await completeUserTask(conn, {
                  ...userTask,
                  task_name: task.name,
                  task_id: task.id,
                  user_id: userId,
                  points: task.points,
                  quest_chain_id: task.quest_chain_id,
                  quest_order: task.quest_order
                });
                earnedItemName = completion?.earnedItemName || null;
              }
              await conn.commit();
              userTaskId = userTask.id;
            } catch (txErr) {
              try { await conn.rollback(); } catch (_) {}
              console.warn('教學模式已登入用戶任務紀錄建立失敗:', txErr.message);
            }
          }
        } catch (userErr) {
          console.warn('教學模式查詢用戶失敗:', userErr.message);
        }
      }

      return res.json({
        success: true,
        passed: true,
        tutorial_guest: !optionalUser,
        message: '教學模式已完成這一步',
        reason: buildTutorialForcedAiReason(task, lmResult?.reason, lmResult?.passed, lmResult?.label),
        retry_advice: '',
        user_task_id: userTaskId,
        earnedItemName,
        score: lmResult?.score ?? fallbackResult.score,
        count_detected: lmResult?.count_detected ?? fallbackResult.count_detected,
        label: lmResult?.label ?? fallbackResult.label,
        submission_url: submissionUrl,
        source: lmResult ? 'sandhill_tutorial_guest_with_lm' : fallbackResult.source
      });
    } catch (error) {
      console.error('❌ 教學模式匿名 AI 任務提交失敗:', error);
      return res.status(500).json({ success: false, message: error.message || '教學模式 AI 判定失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/ai-tasks/:taskId/submit', authenticateToken, uploadAiTaskImage.single('image'), async (req, res) => {
    const { taskId } = req.params;
    if (!req.user || !req.user.username) {
      return res.status(401).json({ success: false, message: '未認證' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: '請先上傳圖片' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const user = await resolveUserFromRequest(conn, req.user.username);
      if (!user) return res.status(401).json({ success: false, message: '用戶不存在' });
      if (user.role !== 'user') {
        return res.status(403).json({ success: false, message: '僅一般用戶可提交 AI 任務' });
      }

      const [tasks] = await conn.execute(
        `SELECT t.*, qc.name AS quest_chain_name, qc.game_rules, qc.content_blueprint, qc.experience_mode, qc.play_style
         FROM tasks t
         LEFT JOIN quest_chains qc ON t.quest_chain_id = qc.id
         WHERE t.id = ?`,
        [taskId]
      );
      if (tasks.length === 0) {
        return res.status(404).json({ success: false, message: '找不到任務' });
      }

      const task = sanitizeTaskRow(tasks[0]);
      if (!AI_VALIDATION_MODES.includes(task.validation_mode)) {
        return res.status(400).json({ success: false, message: '此任務不是 AI 驗證任務' });
      }
      if (task.submission_type !== 'image') {
        return res.status(400).json({ success: false, message: '此任務目前不支援圖片提交' });
      }

      const userTask = await getOrCreateUserTask(conn, user.id, task.id);
      if (userTask.status === '完成') {
        return res.json({ success: true, passed: true, alreadyCompleted: true, message: '此任務已完成' });
      }

      const [attemptCountRows] = await conn.execute(
        'SELECT COUNT(*) AS count FROM task_attempts WHERE user_task_id = ?',
        [userTask.id]
      );
      const attemptCount = Number(attemptCountRows[0]?.count || 0);
      if (task.max_attempts && attemptCount >= Number(task.max_attempts)) {
        return res.status(400).json({ success: false, message: '已達到此任務的最大挑戰次數' });
      }

      const runtimeFlags = getQuestChainRuntimeFlags(task);
      const submissionUrl = saveBufferAsImage(req.file);
      let evaluation;
      if (runtimeFlags.demoAutoPass) {
        let lmEvaluation = null;
        try {
          lmEvaluation = await evaluateAiTaskImage(task, req.file, {
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            timeoutMs: runtimeFlags.demoAutoPass ? 90000 : 180000,
            maxRetries: runtimeFlags.demoAutoPass ? 0 : 2
          });
        } catch (lmErr) {
          console.warn('教學模式 LM 判定失敗，改用自動放行內容:', lmErr?.message || lmErr);
        }

        const fallbackResult = buildDemoAiResult(task, submissionUrl);
        const lmResult = lmEvaluation?.parsed || null;
        evaluation = {
          rawContent: lmEvaluation?.rawContent || JSON.stringify(fallbackResult),
          parsed: {
            ...(lmResult || fallbackResult),
            passed: true,
            retry_advice: '',
            source: lmResult ? 'sandhill_demo_autopass_with_lm' : fallbackResult.source,
            submission_url: submissionUrl,
            reason: buildTutorialForcedAiReason(task, lmResult?.reason, lmResult?.passed, lmResult?.label)
          }
        };
      } else {
        evaluation = await evaluateAiTaskImage(task, req.file, {
          latitude: req.body.latitude,
          longitude: req.body.longitude,
          timeoutMs: 180000,
          maxRetries: 2
        });
      }

      const attemptNo = attemptCount + 1;
      const result = evaluation.parsed;
      const failureReason = result.passed ? null : (result.reason || task.failure_message || '尚未符合任務條件');
      const retryAdvice = result.passed
        ? null
        : (result.retry_advice || task.failure_message || '請依提示調整後再試一次');

      await conn.beginTransaction();
      let completion = null;
      try {
        await recordLlmUsage(conn, task, user.id, evaluation?.usage, {
          model: evaluation?.model || null,
          request_type: 'ai_task_submit',
          success: result.passed
        });
        await conn.execute(
          `INSERT INTO task_attempts
            (user_id, task_id, user_task_id, attempt_no, submission_type, submission_url, ai_result, ai_raw_response, passed,
             score, detected_count, detected_label, failure_reason, retry_advice)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id,
            task.id,
            userTask.id,
            attemptNo,
            'image',
            submissionUrl,
            JSON.stringify(result),
            evaluation.rawContent,
            result.passed,
            result.score,
            result.count_detected,
            result.label,
            failureReason,
            retryAdvice
          ]
        );

        if (result.passed) {
          await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [submissionUrl, userTask.id]);
          completion = await completeUserTask(conn, {
            ...userTask,
            task_name: task.name,
            task_id: task.id,
            user_id: user.id,
            points: task.points,
            quest_chain_id: task.quest_chain_id,
            quest_order: task.quest_order
          });
        } else {
          await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [submissionUrl, userTask.id]);
        }

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }

      return res.json({
        success: true,
        passed: result.passed,
        message: result.passed
          ? (task.success_message || completion?.message || 'AI 驗證通過，任務完成！')
          : failureReason,
        reason: result.reason || null,
        retry_advice: retryAdvice,
        score: result.score,
        count_detected: result.count_detected,
        label: result.label,
        confidence: result.confidence,
        attempt_no: attemptNo,
        remaining_attempts: task.max_attempts ? Math.max(Number(task.max_attempts) - attemptNo, 0) : null,
        user_task_id: userTask.id,
        submission_url: submissionUrl,
        demo_mode: runtimeFlags.demoAutoPass,
        isCompleted: result.passed,
        earnedItemName: completion?.earnedItemName || null,
        questChainCompleted: completion?.questChainCompleted || false,
        questChainReward: completion?.questChainReward || null
      });
    } catch (err) {
      console.error('AI 任務提交失敗:', err);
      return res.status(500).json({ success: false, message: err.message || 'AI 任務提交失敗' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  registerAiTaskRoutes
};
