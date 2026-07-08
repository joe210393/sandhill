function registerQuestChainRoutes(app, {
  pool,
  staffOrAdminAuth,
  uploadImage,
  getOptionalTokenUser,
  getUserIdByUsername,
  hasQuestChainCouponAccess,
  resolveQuestPreviewContext,
  assertQuestChainAccess,
  getQuestChainById,
  isQuestChainStructureLocked,
  createStructureLockedError,
  getLockedQuestChainStructureChanges,
  sanitizeQuestChainRow,
  sanitizeTaskRow,
  sanitizeBoardMapRow,
  sanitizeBoardTileRow,
  resolveActorShopId,
  actorCanAccessShop,
  getActorShopId,
  assertActorHasShopScope,
  normalizeBillingPolicy,
  normalizeNullableString,
  normalizeBoolean,
  normalizeAccessMode,
  normalizeExperienceMode,
  parseJsonField,
  stringifyJsonField,
  getTableColumnSet,
  insertDynamicRecord,
  updateDynamicRecord
}) {
  app.get('/api/quest-chains', staffOrAdminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const { role } = req.user || {};
      const actorShopId = getActorShopId(req.user);
      let query = `
        SELECT qc.*,
               s.name AS shop_name,
               ep.name AS plan_name
        FROM quest_chains qc
        LEFT JOIN shops s ON s.id = qc.shop_id
        LEFT JOIN entry_plans ep ON ep.id = qc.plan_id
      `;
      let params = [];
      if (role !== 'admin') {
        assertActorHasShopScope(req.user);
        query += ' WHERE qc.shop_id = ?';
        params.push(actorShopId);
      }
      query += ' ORDER BY qc.id DESC';
      const [rows] = await conn.execute(query, params);
      res.json({ success: true, questChains: rows.map(sanitizeQuestChainRow) });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  // 新增劇情 (支援圖片上傳)
  app.post('/api/quest-chains', staffOrAdminAuth, uploadImage.single('badge_image'), async (req, res) => {
    const {
      title, description, chain_points, badge_name,
      mode_type, is_active, cover_image_url, short_description,
      entry_order, entry_button_text, entry_scene_label, play_style, experience_mode, access_mode,
      game_rules, content_blueprint,
      shop_id, plan_id, task_limit, setup_fee, setup_fee_paid, monthly_billing_enabled, structure_locked_at
    } = req.body;
    if (!title) return res.status(400).json({ success: false, message: '缺少標題' });
    if (!plan_id) return res.status(400).json({ success: false, message: '建立玩法入口時必須選擇入口方案' });

    const creator = req.user?.username || null;
    const billingPolicy = req.user?.role === 'admin' ? 'public_good' : 'commercial';
    
    // 處理上傳的圖片
    let badge_image = null;
    if (req.file) {
      badge_image = '/images/' + req.file.filename;
    } else if (cover_image_url || req.body.badge_image_url) {
       // 如果有提供 URL (兼容舊方式或直接輸入)
       badge_image = cover_image_url || req.body.badge_image_url;
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const resolvedShopId = await resolveActorShopId(conn, req.user, shop_id);
      if (req.user?.role !== 'admin' && !resolvedShopId) {
        return res.status(400).json({ success: false, message: '建立玩法入口時必須指定 shop_id' });
      }
      let selectedPlan = null;
      if (plan_id) {
        const [planRows] = await conn.execute('SELECT * FROM entry_plans WHERE id = ? LIMIT 1', [Number(plan_id)]);
        if (!planRows.length) {
          return res.status(404).json({ success: false, message: '找不到指定方案' });
        }
        selectedPlan = planRows[0];
      }
      const resolvedTaskLimit = task_limit ? Number(task_limit) : (selectedPlan ? Number(selectedPlan.task_limit || 0) || null : null);
      const resolvedSetupFee = setup_fee != null && String(setup_fee).trim() !== ''
        ? Number(setup_fee)
        : Number(selectedPlan?.setup_fee || 0);
      const resolvedMonthlyBillingEnabled = billingPolicy === 'public_good'
        ? true
        : (monthly_billing_enabled == null ? true : normalizeBoolean(monthly_billing_enabled));
      const questChainColumns = await getTableColumnSet(conn, 'quest_chains');
      const publishNow = normalizeBoolean(is_active);
      const explicitStructureLockedAt = normalizeNullableString(structure_locked_at);
      const resolvedStructureLockedAt = publishNow ? (explicitStructureLockedAt || new Date()) : null;
      const questChainRecord = {
        title,
        name: title,
        description: description || '',
        chain_points: chain_points || 0,
        badge_name: badge_name || null,
        badge_image: badge_image || null,
        created_by: creator,
        shop_id: resolvedShopId,
        plan_id: plan_id ? Number(plan_id) : null,
        task_limit: resolvedTaskLimit,
        setup_fee: resolvedSetupFee,
        setup_fee_paid: billingPolicy === 'public_good' ? false : normalizeBoolean(setup_fee_paid),
        billing_policy: billingPolicy,
        monthly_billing_enabled: resolvedMonthlyBillingEnabled,
        structure_locked_at: resolvedStructureLockedAt,
        mode_type: normalizeNullableString(mode_type) || 'story_campaign',
        is_active: publishNow,
        cover_image: badge_image || null,
        short_description: normalizeNullableString(short_description),
        entry_order: entry_order ? Number(entry_order) : 0,
        entry_button_text: normalizeNullableString(entry_button_text),
        entry_scene_label: normalizeNullableString(entry_scene_label),
        play_style: normalizeNullableString(play_style),
        access_mode: normalizeAccessMode(access_mode),
        experience_mode: normalizeExperienceMode(experience_mode, { play_style, game_rules, content_blueprint }),
        game_rules: stringifyJsonField(parseJsonField(game_rules, null)),
        content_blueprint: stringifyJsonField(parseJsonField(content_blueprint, null))
      };
      const filteredRecord = Object.fromEntries(
        Object.entries(questChainRecord).filter(([column]) => questChainColumns.has(column))
      );
      const [insertHeader] = await insertDynamicRecord(conn, 'quest_chains', filteredRecord);
      if (billingPolicy !== 'public_good' && resolvedShopId && (selectedPlan || resolvedSetupFee > 0)) {
        await conn.execute(
          `INSERT INTO entry_billing_records
            (quest_chain_id, shop_id, plan_id, billing_type, amount, status, paid_at, note)
           VALUES (?, ?, ?, 'setup_fee', ?, ?, ?, ?)`,
          [
            insertHeader.insertId,
            resolvedShopId,
            selectedPlan ? Number(selectedPlan.id) : null,
            resolvedSetupFee,
            normalizeBoolean(setup_fee_paid) ? 'paid' : 'pending',
            normalizeBoolean(setup_fee_paid) ? new Date() : null,
            selectedPlan ? `${selectedPlan.name || '入口方案'} 建置費` : '玩法入口建置費'
          ]
        );
      }
      res.json({ success: true, message: '劇情建立成功', id: insertHeader.insertId });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  // 更新劇情入口
  app.put('/api/quest-chains/:id', staffOrAdminAuth, uploadImage.single('badge_image'), async (req, res) => {
    const { id } = req.params;
    const {
      title, description, chain_points, badge_name,
      mode_type, is_active, cover_image_url, short_description,
      entry_order, entry_button_text, entry_scene_label, play_style, experience_mode, access_mode,
      game_rules, content_blueprint,
      shop_id
    } = req.body;
    if (!title) return res.status(400).json({ success: false, message: '缺少標題' });

    let conn;
    try {
      conn = await pool.getConnection();
      const chain = await assertQuestChainAccess(conn, req.user, id);
      const chainLockActive = isQuestChainStructureLocked(chain);
      const publishNow = normalizeBoolean(is_active);
      const shouldAutoLock = publishNow && !chain.structure_locked_at;

      let badge_image = chain.badge_image || chain.cover_image || null;
      if (req.file) {
        badge_image = '/images/' + req.file.filename;
      } else if (cover_image_url || req.body.badge_image_url) {
        badge_image = cover_image_url || req.body.badge_image_url;
      }

      const questChainColumns = await getTableColumnSet(conn, 'quest_chains');
      const resolvedStructureLockedAt = chain.structure_locked_at || (shouldAutoLock ? new Date() : null);
      const normalizedBillingPolicy = normalizeBillingPolicy(chain.billing_policy, chain.created_by);
      let resolvedShopId = chain.shop_id || null;
      if (req.user?.role === 'admin' && !resolvedShopId && shop_id != null && String(shop_id).trim() !== '') {
        resolvedShopId = await resolveActorShopId(conn, req.user, shop_id);
      }
      const questChainRecord = {
        title,
        name: title,
        description: description || '',
        chain_points: chain_points || 0,
        badge_name: badge_name || null,
        badge_image: badge_image || null,
        shop_id: resolvedShopId,
        plan_id: chain.plan_id || null,
        task_limit: chain.task_limit || null,
        setup_fee: chain.setup_fee || 0,
        setup_fee_paid: normalizedBillingPolicy === 'public_good' ? false : chain.setup_fee_paid,
        billing_policy: normalizedBillingPolicy,
        monthly_billing_enabled: normalizedBillingPolicy === 'public_good' ? true : chain.monthly_billing_enabled,
        structure_locked_at: resolvedStructureLockedAt,
        mode_type: normalizeNullableString(mode_type) || 'story_campaign',
        is_active: publishNow,
        cover_image: badge_image || null,
        short_description: normalizeNullableString(short_description),
        entry_order: entry_order ? Number(entry_order) : 0,
        entry_button_text: normalizeNullableString(entry_button_text),
        entry_scene_label: normalizeNullableString(entry_scene_label),
        play_style: normalizeNullableString(play_style),
        access_mode: normalizeAccessMode(access_mode),
        experience_mode: normalizeExperienceMode(experience_mode, { play_style, game_rules, content_blueprint }),
        game_rules: stringifyJsonField(parseJsonField(game_rules, null)),
        content_blueprint: stringifyJsonField(parseJsonField(content_blueprint, null))
      };
      const filteredRecord = Object.fromEntries(
        Object.entries(questChainRecord).filter(([column]) => questChainColumns.has(column))
      );
      if (chainLockActive) {
        const changedFields = getLockedQuestChainStructureChanges(chain, filteredRecord);
        if (changedFields.length) {
          return res.status(409).json({
            success: false,
            code: 'QUEST_CHAIN_STRUCTURE_LOCKED',
            message: '此入口核心結構已鎖定；目前只能修改文案、素材與營運狀態',
            locked_fields: changedFields
          });
        }
      }
      await updateDynamicRecord(conn, 'quest_chains', id, filteredRecord);
      if (!chain.shop_id && resolvedShopId) {
        await conn.execute(
          'UPDATE tasks SET shop_id = ? WHERE quest_chain_id = ? AND (shop_id IS NULL OR shop_id = 0)',
          [resolvedShopId, Number(id)]
        );
        await conn.execute(
          'UPDATE llm_usage_logs SET shop_id = ? WHERE quest_chain_id = ? AND shop_id IS NULL',
          [resolvedShopId, Number(id)]
        );
      }
      if (shouldAutoLock) {
        const taskColumns = await getTableColumnSet(conn, 'tasks');
        const taskAssignments = [];
        const taskParams = [];
        if (taskColumns.has('structure_locked')) {
          taskAssignments.push('structure_locked = ?');
          taskParams.push(true);
        }
        if (taskColumns.has('structure_locked_at')) {
          taskAssignments.push('structure_locked_at = ?');
          taskParams.push(resolvedStructureLockedAt);
        }
        if (taskAssignments.length) {
          taskParams.push(Number(id));
          await conn.execute(
            `UPDATE tasks
                SET ${taskAssignments.join(', ')}
              WHERE quest_chain_id = ?`,
            taskParams
          );
        }
      }
      res.json({ success: true, message: '玩法入口更新成功' });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.patch('/api/quest-chains/:id/structure-lock', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    const desiredLocked = normalizeBoolean(req.body?.locked);
    let conn;
    try {
      conn = await pool.getConnection();
      const chain = await assertQuestChainAccess(conn, req.user, id);
      if (!desiredLocked && req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: '只有 admin 可以解鎖入口結構' });
      }

      const nextLockedAt = desiredLocked ? (chain.structure_locked_at || new Date()) : null;
      await conn.beginTransaction();

      await updateDynamicRecord(conn, 'quest_chains', id, {
        structure_locked_at: nextLockedAt
      });

      const taskColumns = await getTableColumnSet(conn, 'tasks');
      const taskAssignments = [];
      const taskParams = [];
      if (taskColumns.has('structure_locked')) {
        taskAssignments.push('structure_locked = ?');
        taskParams.push(desiredLocked);
      }
      if (taskColumns.has('structure_locked_at')) {
        taskAssignments.push('structure_locked_at = ?');
        taskParams.push(nextLockedAt);
      }
      if (taskAssignments.length) {
        taskParams.push(Number(id));
        await conn.execute(
          `UPDATE tasks
              SET ${taskAssignments.join(', ')}
            WHERE quest_chain_id = ?`,
          taskParams
        );
      }

      await conn.commit();
      const updatedChain = await getQuestChainById(conn, id);
      res.json({
        success: true,
        message: desiredLocked ? '入口核心結構已鎖定' : '入口核心結構已解鎖',
        questChain: updatedChain
      });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch (_) {}
      }
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '更新入口鎖定狀態失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/game-entries', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const optionalUser = getOptionalTokenUser(req);
      const userId = optionalUser?.username ? await getUserIdByUsername(conn, optionalUser.username) : null;
      const questChainColumns = await getTableColumnSet(conn, 'quest_chains');
      const hasModeType = questChainColumns.has('mode_type');
      const hasIsActive = questChainColumns.has('is_active');
      const query = hasModeType
        ? `SELECT * FROM quest_chains ${hasIsActive ? 'WHERE is_active = TRUE' : ''} ORDER BY entry_order ASC, id ASC`
        : 'SELECT * FROM quest_chains ORDER BY id ASC';
      const [rows] = await conn.execute(query);
      const couponQuestChainIds = new Set();
      if (userId) {
        const couponColumns = await getTableColumnSet(conn, 'user_coupons');
        if (couponColumns.has('quest_chain_id')) {
          const statusExpr = couponColumns.has('status') ? "AND (status IS NULL OR status = 'active')" : '';
          const expiryExpr = couponColumns.has('expiry_date') ? 'AND (expiry_date IS NULL OR expiry_date >= CURDATE())' : '';
          const [couponRows] = await conn.execute(
            `SELECT quest_chain_id
               FROM user_coupons
              WHERE user_id = ?
                AND quest_chain_id IS NOT NULL
                ${statusExpr}
                ${expiryExpr}`,
            [userId]
          );
          couponRows.forEach((row) => {
            if (row.quest_chain_id != null) couponQuestChainIds.add(Number(row.quest_chain_id));
          });
        }
      }
      const entries = rows.map((row) => {
        const entry = sanitizeQuestChainRow(row);
        const requiresCoupon = entry.access_mode === 'coupon';
        const hasCouponAccess = requiresCoupon ? couponQuestChainIds.has(Number(entry.id)) : true;
        return {
          ...entry,
          has_coupon_access: hasCouponAccess,
          is_accessible: requiresCoupon ? hasCouponAccess : true
        };
      });
      res.json({
        success: true,
        storyCampaigns: entries.filter(entry => (entry.mode_type || 'story_campaign') === 'story_campaign'),
        boardGames: entries.filter(entry => entry.mode_type === 'board_game')
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  // 舊版相容：ai-lab 摘要頁會用到
  app.get('/api/quest-chains/public-entries', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const optionalUser = getOptionalTokenUser(req);
      const userId = optionalUser?.username ? await getUserIdByUsername(conn, optionalUser.username) : null;
      const questChainColumns = await getTableColumnSet(conn, 'quest_chains');
      const hasModeType = questChainColumns.has('mode_type');
      const hasIsActive = questChainColumns.has('is_active');
      const query = hasModeType
        ? `SELECT * FROM quest_chains ${hasIsActive ? 'WHERE is_active = TRUE' : ''} ORDER BY entry_order ASC, id ASC`
        : 'SELECT * FROM quest_chains ORDER BY id ASC';
      const [rows] = await conn.execute(query);
      const couponQuestChainIds = new Set();
      if (userId) {
        const couponColumns = await getTableColumnSet(conn, 'user_coupons');
        if (couponColumns.has('quest_chain_id')) {
          const statusExpr = couponColumns.has('status') ? "AND (status IS NULL OR status = 'active')" : '';
          const expiryExpr = couponColumns.has('expiry_date') ? 'AND (expiry_date IS NULL OR expiry_date >= CURDATE())' : '';
          const [couponRows] = await conn.execute(
            `SELECT quest_chain_id
               FROM user_coupons
              WHERE user_id = ?
                AND quest_chain_id IS NOT NULL
                ${statusExpr}
                ${expiryExpr}`,
            [userId]
          );
          couponRows.forEach((row) => {
            if (row.quest_chain_id != null) couponQuestChainIds.add(Number(row.quest_chain_id));
          });
        }
      }
      const entries = rows.map((row) => {
        const entry = sanitizeQuestChainRow(row);
        const requiresCoupon = entry.access_mode === 'coupon';
        const hasCouponAccess = requiresCoupon ? couponQuestChainIds.has(Number(entry.id)) : true;
        return {
          ...entry,
          has_coupon_access: hasCouponAccess,
          is_accessible: requiresCoupon ? hasCouponAccess : true
        };
      });
      res.json({ success: true, entries });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/quest-chains/:id/public-content', async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      const questChainColumns = await getTableColumnSet(conn, 'quest_chains');
      const taskColumns = await getTableColumnSet(conn, 'tasks');
      const titleExpr = questChainColumns.has('title') ? 'COALESCE(title, name)' : 'name';
      const [chains] = await conn.execute(`SELECT *, ${titleExpr} AS resolved_title FROM quest_chains WHERE id = ? LIMIT 1`, [id]);
      if (!chains.length) {
        return res.status(404).json({ success: false, message: '找不到此劇情' });
      }
      const questChain = sanitizeQuestChainRow({ ...chains[0], title: chains[0].resolved_title });
      const previewContext = resolveQuestPreviewContext(req, questChain);
      if (previewContext.deniedByShopScope) {
        return res.status(403).json({ success: false, message: '無權限預覽其他商家的玩法入口' });
      }
      if (!questChain.is_active && !previewContext.canPreviewUnpublished) {
        return res.status(403).json({
          success: false,
          code: 'ENTRY_NOT_PUBLISHED',
          message: '此入口尚未正式發布，僅限後台預覽'
        });
      }
      if (questChain.access_mode === 'coupon' && !previewContext.canPreviewUnpublished) {
        const userId = previewContext.optionalUser?.username ? await getUserIdByUsername(conn, previewContext.optionalUser.username) : null;
        const allowed = await hasQuestChainCouponAccess(conn, userId, Number(id));
        if (!allowed) {
          return res.status(403).json({
            success: false,
            code: 'COUPON_REQUIRED',
            message: '此入口需專屬 Coupon 才能遊玩'
          });
        }
      }
      const activeFilter = taskColumns.has('is_active') ? 'AND (is_active = TRUE OR is_active IS NULL)' : '';
      const [tasks] = await conn.execute(
        `SELECT * FROM tasks WHERE quest_chain_id = ? ${activeFilter} ORDER BY quest_order ASC, id ASC`,
        [id]
      );
      res.json({
        success: true,
        questChain,
        tasks: tasks.map(sanitizeTaskRow)
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  // 後台：刪除玩法入口前的影響範圍
  app.get('/api/quest-chains/:id/delete-impact', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;

    let conn;
    try {
      conn = await pool.getConnection();
      const questChain = await assertQuestChainAccess(conn, req.user, id);

      const [taskRows] = await conn.execute(
        'SELECT id, name, quest_order, task_type, validation_mode FROM tasks WHERE quest_chain_id = ? ORDER BY COALESCE(quest_order, 9999), id ASC',
        [id]
      );
      const [boardMapRows] = await conn.execute(
        'SELECT id, name, finish_tile, play_style FROM board_maps WHERE quest_chain_id = ? ORDER BY id ASC',
        [id]
      );
      const [tileRows] = await conn.execute(
        `SELECT bt.id, bt.tile_index, bt.tile_name, bt.tile_type, bt.board_map_id, bm.name AS board_map_name
         FROM board_tiles bt
         INNER JOIN board_maps bm ON bm.id = bt.board_map_id
         WHERE bm.quest_chain_id = ?
         ORDER BY bt.board_map_id ASC, bt.tile_index ASC`,
        [id]
      );
      const [userQuestRows] = await conn.execute(
        'SELECT COUNT(*) AS total FROM user_quests WHERE quest_chain_id = ?',
        [id]
      );
      const [userTaskRows] = await conn.execute(
        `SELECT COUNT(*) AS total
         FROM user_tasks ut
         INNER JOIN tasks t ON t.id = ut.task_id
         WHERE t.quest_chain_id = ?`,
        [id]
      );

      res.json({
        success: true,
        questChain,
        impact: {
          taskCount: taskRows.length,
          tasks: taskRows.map((row) => sanitizeTaskRow(row)),
          boardMapCount: boardMapRows.length,
          boardMaps: boardMapRows,
          boardTileCount: tileRows.length,
          boardTiles: tileRows,
          userQuestCount: Number(userQuestRows[0]?.total || 0),
          userTaskCount: Number(userTaskRows[0]?.total || 0)
        }
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入刪除影響範圍失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  // 後台：主結構可視化地圖資料
  app.get('/api/quest-chains/:id/structure-map', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      const [questRows] = await conn.execute(
        `SELECT id, title, name, short_description, description, mode_type, experience_mode, play_style,
                badge_name, badge_image, cover_image, chain_points, is_active,
                game_rules, content_blueprint, created_by, shop_id
         FROM quest_chains
         WHERE id = ?
         LIMIT 1`,
        [id]
      );
      if (!questRows.length) {
        return res.status(404).json({ success: false, message: '找不到此玩法入口' });
      }

      const questChain = sanitizeQuestChainRow(questRows[0]);
      if (req.user?.role !== 'admin' && !actorCanAccessShop(req.user, questChain.shop_id)) {
        return res.status(403).json({ success: false, message: '無權限查看此玩法入口結構' });
      }
      const [taskRows] = await conn.execute(
        `SELECT t.*,
                req_item.name AS required_item_name,
                rew_item.name AS reward_item_name
         FROM tasks t
         LEFT JOIN items req_item ON req_item.id = t.required_item_id
         LEFT JOIN items rew_item ON rew_item.id = t.reward_item_id
         WHERE t.quest_chain_id = ?
         ORDER BY COALESCE(t.quest_order, 9999) ASC, t.id ASC`,
        [id]
      );
      const [boardMapRows] = await conn.execute(
        `SELECT bm.*,
                COUNT(bt.id) AS tile_count,
                SUM(CASE WHEN bt.tile_type = 'challenge' THEN 1 ELSE 0 END) AS challenge_tile_count,
                SUM(CASE WHEN bt.tile_type IN ('event','story','fortune','chance','quiz') THEN 1 ELSE 0 END) AS event_tile_count
         FROM board_maps bm
         LEFT JOIN board_tiles bt ON bt.board_map_id = bm.id
         WHERE bm.quest_chain_id = ?
         GROUP BY bm.id
         ORDER BY bm.id ASC`,
        [id]
      );
      const boardMaps = boardMapRows.map((row) => sanitizeBoardMapRow(row));
      const boardMapIds = boardMaps.map((map) => map.id);
      let boardTiles = [];
      if (boardMapIds.length > 0) {
        const placeholders = boardMapIds.map(() => '?').join(',');
        const [tileRows] = await conn.execute(
          `SELECT bt.*,
                  t.name AS task_name,
                  t.validation_mode,
                  t.stage_template,
                  t.task_type AS linked_task_type,
                  t.bgm_url AS linked_bgm_url,
                  req_item.name AS required_item_name,
                  rew_item.name AS reward_item_name
           FROM board_tiles bt
           LEFT JOIN tasks t ON t.id = bt.task_id
           LEFT JOIN items req_item ON req_item.id = t.required_item_id
           LEFT JOIN items rew_item ON rew_item.id = t.reward_item_id
           WHERE bt.board_map_id IN (${placeholders})
           ORDER BY bt.board_map_id ASC, bt.tile_index ASC`,
          boardMapIds
        );
        boardTiles = tileRows.map((row) => sanitizeBoardTileRow(row));
      }

      res.json({
        success: true,
        questChain,
        tasks: taskRows.map((row) => sanitizeTaskRow(row)),
        boardMaps,
        boardTiles
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入結構地圖失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  // 刪除劇情
  app.delete('/api/quest-chains/:id', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;

    let conn;
    try {
      conn = await pool.getConnection();
      const chain = await assertQuestChainAccess(conn, req.user, id);
      if (isQuestChainStructureLocked(chain)) {
        throw createStructureLockedError('此玩法入口');
      }

      // 2. 統計將一併刪除的子內容
      const [tasks] = await conn.execute(
        'SELECT id, name, quest_order, task_type, validation_mode FROM tasks WHERE quest_chain_id = ? ORDER BY COALESCE(quest_order, 9999), id ASC',
        [id]
      );
      const [boardMaps] = await conn.execute(
        'SELECT id, name, finish_tile, play_style FROM board_maps WHERE quest_chain_id = ? ORDER BY id ASC',
        [id]
      );
      const [tileRows] = await conn.execute(
        `SELECT bt.id
         FROM board_tiles bt
         INNER JOIN board_maps bm ON bm.id = bt.board_map_id
         WHERE bm.quest_chain_id = ?`,
        [id]
      );
      // 3. 執行刪除（使用事務確保數據一致性）
      await conn.beginTransaction();
      try {
        // 先刪除棋盤遊戲 session
        await conn.execute('DELETE FROM user_game_sessions WHERE quest_chain_id = ?', [id]);

        // 刪除關聯任務的玩家進度（task_attempts 會隨 user_tasks cascade）
        if (tasks.length > 0) {
          await conn.execute(
            `DELETE ut
             FROM user_tasks ut
             INNER JOIN tasks t ON t.id = ut.task_id
             WHERE t.quest_chain_id = ?`,
            [id]
          );
        }

        // 先刪除用戶的劇情進度
        await conn.execute('DELETE FROM user_quests WHERE quest_chain_id = ?', [id]);

        // 清理 point_transactions 中的劇情完成關聯紀錄
        await conn.execute(
          'UPDATE point_transactions SET reference_id = NULL, description = CONCAT(description, " (劇情已刪除)") WHERE reference_type = "quest_chain_completion" AND reference_id = ?',
          [id]
        );

        // 刪除關聯任務
        if (tasks.length > 0) {
          await conn.execute('DELETE FROM tasks WHERE quest_chain_id = ?', [id]);
        }

        // 刪除棋盤（board_tiles 將隨 FK cascade）
        if (boardMaps.length > 0) {
          await conn.execute('DELETE FROM board_maps WHERE quest_chain_id = ?', [id]);
        }

        // 最後刪除玩法入口
        await conn.execute('DELETE FROM quest_chains WHERE id = ?', [id]);
        
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }
      res.json({
        success: true,
        message: '玩法入口已刪除，關聯內容已一併清理',
        deleted: {
          taskCount: tasks.length,
          boardMapCount: boardMaps.length,
          boardTileCount: tileRows.length
        }
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  registerQuestChainRoutes
};
