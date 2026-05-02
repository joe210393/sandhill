function registerTaskRoutes(app, {
  pool,
  authenticateToken,
  requireRole,
  staffOrAdminAuth,
  getActorShopId,
  assertActorHasShopScope,
  resolveActorShopId,
  actorCanAccessShop,
  assertQuestChainAccess,
  isQuestChainStructureLocked,
  resolveQuestChainStructureLockedAt,
  createStructureLockedError,
  getLockedTaskStructureChanges,
  assertTaskAccess,
  sanitizeTaskRow,
  prepareTaskValidationSettings,
  normalizeNullableString,
  normalizeBoolean,
  parseJsonField,
  stringifyJsonField,
  getTableColumnSet,
  insertDynamicRecord,
  updateDynamicRecord
}) {
  app.get('/api/tasks', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      // Join items 表格以獲取道具名稱，Join ar_models 獲取 3D 模型
      const [rows] = await conn.execute(`
        SELECT t.*, 
               i_req.name as required_item_name, i_req.image_url as required_item_image, i_req.model_url as required_item_model,
               i_rew.name as reward_item_name, i_rew.image_url as reward_item_image, i_rew.model_url as reward_item_model,
               am.url as ar_model_url, am.scale as ar_model_scale
        FROM tasks t
        LEFT JOIN items i_req ON t.required_item_id = i_req.id
        LEFT JOIN items i_rew ON t.reward_item_id = i_rew.id
        LEFT JOIN ar_models am ON t.ar_model_id = am.id
        WHERE 1=1 ORDER BY t.id DESC
      `);
      res.json({ success: true, tasks: rows.map(sanitizeTaskRow) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  // 獲取任務（管理後台用，根據用戶角色篩選）
  app.get('/api/tasks/admin', authenticateToken, requireRole('shop', 'admin'), async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const userRole = req.user.role;
      const actorShopId = getActorShopId(req.user);
      let query = 'SELECT * FROM tasks';
      let params = [];
      if (userRole !== 'admin') {
        assertActorHasShopScope(req.user);
        query += ' WHERE shop_id = ?';
        params.push(actorShopId);
      }
      query += ' ORDER BY id DESC';

      const [rows] = await conn.execute(query, params);
      res.json({ success: true, tasks: rows.map(sanitizeTaskRow), userRole });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  // === 劇情任務 (Quest Chains) API ===

  // 取得所有劇情 (admin / shop)
  // 新增任務
  app.post('/api/tasks', staffOrAdminAuth, async (req, res) => {
    const { 
      name, lat, lng, radius, description, photoUrl, youtubeUrl, video_url, ar_image_url, points, 
      task_type, options, correct_answer,
      submission_type, validation_mode, ai_config, pass_criteria, failure_message, success_message,
      max_attempts, location_required,
      // 新增參數
      type, quest_chain_id, quest_order, time_limit_start, time_limit_end, max_participants,
      // 道具參數
      required_item_id, reward_item_id,
      // 劇情結局關卡
      is_final_step,
      // AR 模型 ID 與 順序
      ar_model_id,
      ar_order_model, ar_order_image, ar_order_youtube,
      // 背景音樂
      bgm_url,
      stage_template, stage_intro, hint_text, story_context, guide_content, rescue_content,
      event_config, is_active, shop_id
    } = req.body;

    console.log('[POST /api/tasks] Received:', req.body);

    const requiresGps = normalizeBoolean(location_required) || task_type === 'location';
    const hasAllLocationValues = [lat, lng, radius].every((value) => value !== undefined && value !== null && String(value).trim() !== '');

    if (!name || !description || !photoUrl) {
      return res.status(400).json({ success: false, message: '缺少參數' });
    }
    if (requiresGps && !hasAllLocationValues) {
      return res.status(400).json({ success: false, message: '啟用 GPS 位置限制時，必須填寫緯度、經度與觸發半徑。' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const username = req.user?.username;
      let actorShopId = await resolveActorShopId(conn, req.user, shop_id);
      const pts = Number(points) || 0;
      
      const opts = options ? JSON.stringify(options) : null;
      const validationSettings = prepareTaskValidationSettings({
        task_type,
        submission_type,
        validation_mode,
        ai_config,
        pass_criteria,
        failure_message,
        success_message,
        max_attempts,
        location_required
      });
      const tType = validationSettings.taskType;

      // 檢查 type (single/timed/quest)
      const mainType = ['single', 'timed', 'quest'].includes(type) ? type : 'single';
      
      // 處理時間格式 (如果空字串轉為 null)
      const tStart = time_limit_start || null;
      const tEnd = time_limit_end || null;
      const maxP = max_participants ? Number(max_participants) : null;
      const qId = quest_chain_id ? Number(quest_chain_id) : null;
      const qOrder = quest_order ? Number(quest_order) : null;
      let targetQuestChain = null;
      if (qId) {
        targetQuestChain = await assertQuestChainAccess(conn, req.user, qId);
        if (isQuestChainStructureLocked(targetQuestChain)) {
          throw createStructureLockedError('此玩法入口');
        }
        actorShopId = targetQuestChain.shop_id || actorShopId;
      }
      
      const reqItemId = required_item_id ? Number(required_item_id) : null;
      const rewItemId = reward_item_id ? Number(reward_item_id) : null;
      const isFinal = is_final_step === true || is_final_step === 'true' || is_final_step === 1;
      const arModelId = ar_model_id ? Number(ar_model_id) : null;
      
      const orderModel = ar_order_model ? Number(ar_order_model) : null;
      const orderImage = ar_order_image ? Number(ar_order_image) : null;
      const orderYoutube = ar_order_youtube ? Number(ar_order_youtube) : null;
      const resolvedLat = hasAllLocationValues ? normalizeNullableString(lat) : '0';
      const resolvedLng = hasAllLocationValues ? normalizeNullableString(lng) : '0';
      const resolvedRadius = hasAllLocationValues ? normalizeNullableString(radius) : '0';

      const bgmUrlValue = bgm_url || null;
      const taskColumns = await getTableColumnSet(conn, 'tasks');
      const taskRecord = {
        name,
        lat: resolvedLat,
        lng: resolvedLng,
        radius: resolvedRadius,
        description,
        photoUrl,
        iconUrl: '/images/flag-red.png',
        youtubeUrl: youtubeUrl || null,
        video_url: normalizeNullableString(video_url),
        ar_image_url: ar_image_url || null,
        points: pts,
        created_by: username,
        shop_id: actorShopId,
        task_type: tType,
        options: opts,
        correct_answer: correct_answer || null,
        submission_type: validationSettings.submissionType,
        validation_mode: validationSettings.validationMode,
        ai_config: validationSettings.aiConfigJson,
        pass_criteria: validationSettings.passCriteriaJson,
        failure_message: validationSettings.failureMessage,
        success_message: validationSettings.successMessage,
        max_attempts: validationSettings.maxAttempts,
        location_required: requiresGps,
        type: mainType,
        quest_chain_id: qId,
        quest_order: qOrder,
        time_limit_start: tStart,
        time_limit_end: tEnd,
        max_participants: maxP,
        required_item_id: reqItemId,
        reward_item_id: rewItemId,
        is_final_step: isFinal,
        ar_model_id: arModelId,
        ar_order_model: orderModel,
        ar_order_image: orderImage,
        ar_order_youtube: orderYoutube,
        bgm_url: bgmUrlValue,
        cover_image_url: photoUrl,
        stage_template: normalizeNullableString(stage_template),
        stage_intro: normalizeNullableString(stage_intro),
        hint_text: normalizeNullableString(hint_text),
        story_context: normalizeNullableString(story_context),
        guide_content: normalizeNullableString(guide_content),
        rescue_content: normalizeNullableString(rescue_content),
        event_config: stringifyJsonField(parseJsonField(event_config, null)),
        is_active: is_active === undefined ? true : normalizeBoolean(is_active),
        structure_locked: targetQuestChain ? isQuestChainStructureLocked(targetQuestChain) : false,
        structure_locked_at: targetQuestChain ? resolveQuestChainStructureLockedAt(targetQuestChain) : null
      };
      const filteredRecord = Object.fromEntries(
        Object.entries(taskRecord).filter(([column]) => taskColumns.has(column))
      );
      const [insertHeader] = await insertDynamicRecord(conn, 'tasks', filteredRecord);
      res.json({
        success: true,
        message: '新增成功',
        id: insertHeader.insertId
      });
    } catch (err) {
      console.error(err);
      res.status(err.message?.includes('AI ') || err.message?.includes('max_attempts') || err.message?.includes('信心值') ? 400 : 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/tasks/:id', async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      // Join items 表格以獲取道具名稱，Join ar_models 獲取 3D 模型
      const [rows] = await conn.execute(`
        SELECT t.*, 
               i_req.name as required_item_name, i_req.image_url as required_item_image, i_req.model_url as required_item_model,
               i_rew.name as reward_item_name, i_rew.image_url as reward_item_image, i_rew.model_url as reward_item_model,
               am.url as ar_model_url, am.scale as ar_model_scale
        FROM tasks t
        LEFT JOIN items i_req ON t.required_item_id = i_req.id
        LEFT JOIN items i_rew ON t.reward_item_id = i_rew.id
        LEFT JOIN ar_models am ON t.ar_model_id = am.id
        WHERE t.id = ?
      `, [id]);
      
      if (rows.length === 0) return res.status(404).json({ success: false, message: '找不到任務' });
      res.json({ success: true, task: sanitizeTaskRow(rows[0]) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  // 編輯任務
  app.put('/api/tasks/:id', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    const { 
      name, lat, lng, radius, description, photoUrl, youtubeUrl, video_url, ar_image_url, points, 
      task_type, options, correct_answer,
      submission_type, validation_mode, ai_config, pass_criteria, failure_message, success_message,
      max_attempts, location_required,
      type, quest_chain_id, quest_order, time_limit_start, time_limit_end, max_participants,
      // 道具參數
      required_item_id, reward_item_id,
      // 劇情結局關卡
      is_final_step,
      // AR 模型 ID 與 順序
      ar_model_id,
      ar_order_model, ar_order_image, ar_order_youtube,
      // 背景音樂
      bgm_url,
      stage_template, stage_intro, hint_text, story_context, guide_content, rescue_content,
      event_config, is_active
    } = req.body;

    let conn;
    try {
      conn = await pool.getConnection();
      const existingTask = await assertTaskAccess(conn, req.user, id);
      const existingQuestChain = existingTask.quest_chain_id
        ? await assertQuestChainAccess(conn, req.user, existingTask.quest_chain_id)
        : null;
      const chainLockActive = Boolean(existingTask.structure_locked || existingTask.structure_locked_at) || isQuestChainStructureLocked(existingQuestChain);

      const qId = quest_chain_id ? Number(quest_chain_id) : null;

      if (existingTask && Number(existingTask.quest_chain_id || 0) !== Number(qId || 0) && Number(existingTask.quest_chain_id || 0) > 0) {
        return res.status(400).json({
          success: false,
          message: '關卡不可直接跨劇情移動，請使用「複製關卡」建立新版本。'
        });
      }

      const requiresGps = normalizeBoolean(location_required) || task_type === 'location';
      const hasAllLocationValues = [lat, lng, radius].every((value) => value !== undefined && value !== null && String(value).trim() !== '');

      if (!name || !description || !photoUrl) {
        return res.status(400).json({ success: false, message: '缺少參數' });
      }
      if (requiresGps && !hasAllLocationValues) {
        return res.status(400).json({ success: false, message: '啟用 GPS 位置限制時，必須填寫緯度、經度與觸發半徑。' });
      }
      let targetQuestChain = null;
      if (qId) {
        targetQuestChain = await assertQuestChainAccess(conn, req.user, qId);
      }

      const pts = Number(points) || 0;
      const opts = options ? JSON.stringify(options) : null;
      const validationSettings = prepareTaskValidationSettings({
        task_type,
        submission_type,
        validation_mode,
        ai_config,
        pass_criteria,
        failure_message,
        success_message,
        max_attempts,
        location_required
      });
      const tType = validationSettings.taskType;

      // 檢查 type (single/timed/quest)
      const mainType = ['single', 'timed', 'quest'].includes(type) ? type : 'single';
      
      const tStart = time_limit_start || null;
      const tEnd = time_limit_end || null;
      const maxP = max_participants ? Number(max_participants) : null;
      const qOrder = quest_order ? Number(quest_order) : null;
      
      const reqItemId = required_item_id ? Number(required_item_id) : null;
      const rewItemId = reward_item_id ? Number(reward_item_id) : null;
      const isFinal = is_final_step === true || is_final_step === 'true' || is_final_step === 1;
      const arModelId = ar_model_id ? Number(ar_model_id) : null;
      
      const orderModel = ar_order_model ? Number(ar_order_model) : null;
      const orderImage = ar_order_image ? Number(ar_order_image) : null;
      const orderYoutube = ar_order_youtube ? Number(ar_order_youtube) : null;
      const fallbackLat = normalizeNullableString(existingTask.lat) || '0';
      const fallbackLng = normalizeNullableString(existingTask.lng) || '0';
      const fallbackRadius = normalizeNullableString(existingTask.radius) || '0';
      const resolvedLat = hasAllLocationValues ? normalizeNullableString(lat) : fallbackLat;
      const resolvedLng = hasAllLocationValues ? normalizeNullableString(lng) : fallbackLng;
      const resolvedRadius = hasAllLocationValues ? normalizeNullableString(radius) : fallbackRadius;
      const bgmUrlValue = bgm_url || null;

      const taskColumns = await getTableColumnSet(conn, 'tasks');
      const taskRecord = {
        name,
        lat: resolvedLat,
        lng: resolvedLng,
        radius: resolvedRadius,
        description,
        photoUrl,
        youtubeUrl: youtubeUrl || null,
        video_url: normalizeNullableString(video_url),
        ar_image_url: ar_image_url || null,
        points: pts,
        shop_id: existingTask.shop_id || getActorShopId(req.user),
        task_type: tType,
        options: opts,
        correct_answer: correct_answer || null,
        submission_type: validationSettings.submissionType,
        validation_mode: validationSettings.validationMode,
        ai_config: validationSettings.aiConfigJson,
        pass_criteria: validationSettings.passCriteriaJson,
        failure_message: validationSettings.failureMessage,
        success_message: validationSettings.successMessage,
        max_attempts: validationSettings.maxAttempts,
        location_required: requiresGps,
        type: mainType,
        quest_chain_id: qId,
        quest_order: qOrder,
        time_limit_start: tStart,
        time_limit_end: tEnd,
        max_participants: maxP,
        required_item_id: reqItemId,
        reward_item_id: rewItemId,
        is_final_step: isFinal,
        ar_model_id: arModelId,
        ar_order_model: orderModel,
        ar_order_image: orderImage,
        ar_order_youtube: orderYoutube,
        bgm_url: bgmUrlValue,
        cover_image_url: photoUrl,
        stage_template: normalizeNullableString(stage_template),
        stage_intro: normalizeNullableString(stage_intro),
        hint_text: normalizeNullableString(hint_text),
        story_context: normalizeNullableString(story_context),
        guide_content: normalizeNullableString(guide_content),
        rescue_content: normalizeNullableString(rescue_content),
        event_config: stringifyJsonField(parseJsonField(event_config, null)),
        is_active: is_active === undefined ? true : normalizeBoolean(is_active),
        structure_locked: chainLockActive,
        structure_locked_at: chainLockActive
          ? (existingTask.structure_locked_at || resolveQuestChainStructureLockedAt(existingQuestChain) || new Date())
          : null
      };
      const filteredRecord = Object.fromEntries(
        Object.entries(taskRecord).filter(([column]) => taskColumns.has(column))
      );
      if (chainLockActive) {
        const changedFields = getLockedTaskStructureChanges(existingTask, filteredRecord);
        if (changedFields.length) {
          return res.status(409).json({
            success: false,
            code: 'TASK_STRUCTURE_LOCKED',
            message: '此入口的關卡核心結構已鎖定；目前只能修改文案與素材',
            locked_fields: changedFields
          });
        }
      }
      await updateDynamicRecord(conn, 'tasks', id, filteredRecord);
      res.json({ success: true, message: '更新成功' });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || (err.message?.includes('AI ') || err.message?.includes('max_attempts') || err.message?.includes('信心值') ? 400 : 500)).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  // 複製關卡：避免直接跨劇情共用同一顆 task
  app.post('/api/tasks/:id/duplicate', staffOrAdminAuth, async (req, res) => {
    const sourceId = Number(req.params.id);
    const targetQuestChainId = req.body?.quest_chain_id ? Number(req.body.quest_chain_id) : null;
    if (!Number.isFinite(sourceId)) {
      return res.status(400).json({ success: false, message: '無效的關卡 ID' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const sourceTask = await assertTaskAccess(conn, req.user, sourceId);
      if (sourceTask.quest_chain_id) {
        const sourceChain = await assertQuestChainAccess(conn, req.user, sourceTask.quest_chain_id);
        if (isQuestChainStructureLocked(sourceChain)) {
          throw createStructureLockedError('此玩法入口');
        }
      }

      const destinationQuestChainId = Number.isFinite(targetQuestChainId) && targetQuestChainId > 0
        ? targetQuestChainId
        : (sourceTask.quest_chain_id ? Number(sourceTask.quest_chain_id) : null);

      if (destinationQuestChainId) {
        const destinationChain = await assertQuestChainAccess(conn, req.user, destinationQuestChainId);
        if (isQuestChainStructureLocked(destinationChain)) {
          throw createStructureLockedError('此玩法入口');
        }
      }

      const taskColumns = await getTableColumnSet(conn, 'tasks');
      const cloneRecord = {
        ...sourceTask,
        name: `${sourceTask.name}（複製）`,
        quest_chain_id: destinationQuestChainId,
        created_by: req.user?.username || null,
        shop_id: sourceTask.shop_id || getActorShopId(req.user),
        photoUrl: sourceTask.photoUrl || null,
        options: sourceTask.options ? JSON.stringify(sourceTask.options) : null,
        ai_config: stringifyJsonField(sourceTask.ai_config),
        pass_criteria: stringifyJsonField(sourceTask.pass_criteria)
      };
      delete cloneRecord.id;
      delete cloneRecord.required_item_name;
      delete cloneRecord.reward_item_name;
      delete cloneRecord.required_item_image;
      delete cloneRecord.required_item_model;
      delete cloneRecord.reward_item_image;
      delete cloneRecord.reward_item_model;
      delete cloneRecord.ar_model_url;
      delete cloneRecord.ar_model_scale;

      const filteredRecord = Object.fromEntries(
        Object.entries(cloneRecord).filter(([column]) => taskColumns.has(column))
      );
      const [insertHeader] = await insertDynamicRecord(conn, 'tasks', filteredRecord);
      res.json({
        success: true,
        message: '關卡已複製',
        id: insertHeader.insertId
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '複製關卡失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/tasks/:id/delete-impact', staffOrAdminAuth, async (req, res) => {
    const taskId = Number(req.params.id);
    if (!Number.isFinite(taskId)) {
      return res.status(400).json({ success: false, message: '無效的關卡 ID' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const [taskRows] = await conn.execute(
        `SELECT t.id, t.name, t.quest_chain_id, t.created_by, t.task_type, t.validation_mode,
                t.shop_id, qc.title AS quest_chain_title
         FROM tasks t
         LEFT JOIN quest_chains qc ON qc.id = t.quest_chain_id
         WHERE t.id = ?
         LIMIT 1`,
        [taskId]
      );
      if (!taskRows.length) {
        return res.status(404).json({ success: false, message: '找不到此關卡' });
      }
      const task = sanitizeTaskRow(taskRows[0]);
      if (req.user?.role !== 'admin' && !actorCanAccessShop(req.user, task.shop_id)) {
        return res.status(403).json({ success: false, message: '無權限查看此關卡' });
      }

      const [boardTileRows] = await conn.execute(
        `SELECT bt.id, bt.tile_index, bt.tile_name, bt.tile_type, bm.id AS board_map_id, bm.name AS board_map_name
         FROM board_tiles bt
         INNER JOIN board_maps bm ON bm.id = bt.board_map_id
         WHERE bt.task_id = ?
         ORDER BY bm.id ASC, bt.tile_index ASC`,
        [taskId]
      );
      const [userTaskRows] = await conn.execute(
        'SELECT COUNT(*) AS total FROM user_tasks WHERE task_id = ?',
        [taskId]
      );
      const [attemptRows] = await conn.execute(
        `SELECT COUNT(*) AS total
         FROM task_attempts ta
         INNER JOIN user_tasks ut ON ut.id = ta.user_task_id
         WHERE ut.task_id = ?`,
        [taskId]
      );

      res.json({
        success: true,
        task,
        impact: {
          boardTileCount: boardTileRows.length,
          boardTiles: boardTileRows,
          userTaskCount: Number(userTaskRows[0]?.total || 0),
          taskAttemptCount: Number(attemptRows[0]?.total || 0)
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '載入關卡刪除影響範圍失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  // 刪除任務
  app.delete('/api/tasks/:id', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      const task = await assertTaskAccess(conn, req.user, id);
      if (task.quest_chain_id) {
        const chain = await assertQuestChainAccess(conn, req.user, task.quest_chain_id);
        if (isQuestChainStructureLocked(chain)) {
          throw createStructureLockedError('此玩法入口');
        }
      }

      await conn.beginTransaction();
      try {
        await conn.execute('UPDATE board_tiles SET task_id = NULL WHERE task_id = ?', [id]);
        await conn.execute('DELETE FROM user_tasks WHERE task_id = ?', [id]);
        await conn.execute(
          'UPDATE point_transactions SET reference_id = NULL, description = CONCAT(description, " (關卡已刪除)") WHERE reference_type = "task_completion" AND reference_id = ?',
          [id]
        );
        await conn.execute('DELETE FROM tasks WHERE id = ?', [id]);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }
      res.json({ success: true, message: '關卡已刪除，關聯棋盤格與玩家進度已同步清理' });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  registerTaskRoutes
};
