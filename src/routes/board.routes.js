function registerBoardRoutes(app, {
  pool,
  authenticateToken,
  staffOrAdminAuth,
  assertActorHasShopScope,
  actorCanAccessShop,
  getOptionalTokenUser,
  getUserIdByUsername,
  hasQuestChainCouponAccess,
  resolveQuestPreviewContext,
  isPrivilegedPreviewActor,
  assertQuestChainAccess,
  isQuestChainStructureLocked,
  createStructureLockedError,
  assertTaskAccess,
  sanitizeQuestChainRow,
  sanitizeBoardMapRow,
  sanitizeBoardTileRow,
  sanitizeBoardSessionRow,
  assertBoardMapAccess,
  assertBoardTileAccess,
  normalizeNullableString,
  normalizeBoolean,
  parseJsonField,
  stringifyJsonField
}) {
  app.get('/api/board-maps/by-quest-chain/:questChainId', async (req, res) => {
    const { questChainId } = req.params;
    const requestedBoardMapId = Number(req.query.boardMapId || 0);
    let conn;
    try {
      conn = await pool.getConnection();
      const [questRows] = await conn.execute(
        `SELECT id, title, name, short_description, description, mode_type, experience_mode, play_style, game_rules, content_blueprint, is_active, shop_id
         FROM quest_chains
         WHERE id = ?
         LIMIT 1`,
        [questChainId]
      );
      const questChain = questRows[0] || null;
      if (!questChain) {
        return res.status(404).json({ success: false, message: '找不到對應的玩法入口' });
      }
      const sanitizedQuestChain = sanitizeQuestChainRow(questChain);
      const previewContext = resolveQuestPreviewContext(req, sanitizedQuestChain);
      const canPreviewInactive = previewContext.canPreviewUnpublished;
      if (previewContext.deniedByShopScope) {
        return res.status(403).json({ success: false, message: '無權限預覽其他商家的玩法入口' });
      }
      if (!sanitizedQuestChain.is_active && !canPreviewInactive) {
        return res.status(403).json({
          success: false,
          code: 'ENTRY_NOT_PUBLISHED',
          message: '此入口尚未正式發布，僅限後台預覽'
        });
      }
      if (sanitizedQuestChain.access_mode === 'coupon' && !canPreviewInactive) {
        const userId = previewContext.optionalUser?.username ? await getUserIdByUsername(conn, previewContext.optionalUser.username) : null;
        const allowed = await hasQuestChainCouponAccess(conn, userId, Number(questChainId));
        if (!allowed) {
          return res.status(403).json({
            success: false,
            code: 'COUPON_REQUIRED',
            message: '此入口需專屬 Coupon 才能遊玩'
          });
        }
      }
      const [maps] = await conn.execute(
        `SELECT bm.*,
                COUNT(bt.id) AS tile_count,
                SUM(CASE WHEN bt.tile_type = 'challenge' THEN 1 ELSE 0 END) AS challenge_tile_count,
                SUM(CASE WHEN bt.tile_type = 'event' THEN 1 ELSE 0 END) AS event_tile_count
         FROM board_maps bm
         LEFT JOIN board_tiles bt ON bt.board_map_id = bm.id AND bt.is_active = TRUE
         WHERE bm.quest_chain_id = ? AND (? = TRUE OR bm.is_active = TRUE)
         GROUP BY bm.id
         ORDER BY bm.id ASC`,
        [questChainId, canPreviewInactive]
      );
      if (!maps.length) {
        return res.status(404).json({ success: false, message: '找不到對應的大富翁地圖' });
      }
      const boardMap = (requestedBoardMapId
        ? maps.find((map) => Number(map.id) === requestedBoardMapId)
        : null) || maps[0];
      const [tiles] = await conn.execute(
        `SELECT bt.*, t.name AS task_name, t.description AS task_description, t.validation_mode, t.stage_template,
                t.task_type AS linked_task_type, t.submission_type AS linked_submission_type, t.hint_text, t.points AS task_points
         FROM board_tiles bt
         LEFT JOIN tasks t ON bt.task_id = t.id
         WHERE bt.board_map_id = ? AND bt.is_active = TRUE
         ORDER BY bt.tile_index ASC`,
        [boardMap.id]
      );
      res.json({
        success: true,
        questChain: sanitizedQuestChain,
        boardMap: sanitizeBoardMapRow(boardMap),
        boardMaps: maps.map((row) => sanitizeBoardMapRow(row)),
        tiles: tiles.map((row) => sanitizeBoardTileRow(row))
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  // 後台：依玩法入口列出大富翁地圖（無地圖時仍 200，供控制台建立流程）
  app.get('/api/board-maps/for-admin/:questChainId', staffOrAdminAuth, async (req, res) => {
    const { questChainId } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      await assertQuestChainAccess(conn, req.user, questChainId);
      const [maps] = await conn.execute(
        `SELECT bm.*,
                (SELECT COUNT(*) FROM board_tiles bt WHERE bt.board_map_id = bm.id) AS tile_count,
                (SELECT COUNT(*) FROM board_tiles bt WHERE bt.board_map_id = bm.id AND bt.tile_type = 'challenge') AS challenge_tile_count,
                (SELECT COUNT(*) FROM board_tiles bt WHERE bt.board_map_id = bm.id AND bt.tile_type = 'event') AS event_tile_count
         FROM board_maps bm
         WHERE bm.quest_chain_id = ?
         ORDER BY bm.id ASC`,
        [questChainId]
      );
      res.json({
        success: true,
        boardMaps: maps.map((row) => sanitizeBoardMapRow(row))
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入大富翁地圖失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/board-maps/admin', staffOrAdminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const params = [];
      const shopScopeSql = req.user?.role === 'admin' ? '' : 'WHERE bm.shop_id = ?';
      if (req.user?.role !== 'admin') {
        params.push(assertActorHasShopScope(req.user));
      }
      const [maps] = await conn.execute(`
        SELECT bm.*, qc.title AS quest_chain_title, qc.mode_type, qc.is_active AS quest_chain_active,
               COUNT(bt.id) AS tile_count,
               SUM(CASE WHEN bt.tile_type = 'challenge' THEN 1 ELSE 0 END) AS challenge_tile_count,
               SUM(CASE WHEN bt.tile_type = 'event' THEN 1 ELSE 0 END) AS event_tile_count
        FROM board_maps bm
        LEFT JOIN quest_chains qc ON bm.quest_chain_id = qc.id
        LEFT JOIN board_tiles bt ON bt.board_map_id = bm.id
        ${shopScopeSql}
        GROUP BY bm.id, qc.title, qc.mode_type, qc.is_active
        ORDER BY bm.is_active DESC, bm.id DESC
      `, params);
      res.json({
        success: true,
        boardMaps: maps.map((row) => sanitizeBoardMapRow(row))
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入大富翁地圖失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/board-maps', staffOrAdminAuth, async (req, res) => {
    const {
      quest_chain_id,
      name,
      description,
      play_style,
      cover_image,
      center_lat,
      center_lng,
      max_rounds,
      start_tile,
      finish_tile,
      dice_min,
      dice_max,
      failure_move,
      exact_finish_required,
      reward_points,
      is_active,
      rules_json
    } = req.body || {};

    if (!quest_chain_id || !name) {
      return res.status(400).json({ success: false, message: '缺少 quest_chain_id 或 name' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const chain = await assertQuestChainAccess(conn, req.user, quest_chain_id);
      if (isQuestChainStructureLocked(chain)) {
        throw createStructureLockedError('此玩法入口');
      }

      const [insertResult] = await conn.execute(
        `INSERT INTO board_maps
         (quest_chain_id, name, description, play_style, cover_image, center_lat, center_lng, max_rounds,
          start_tile, finish_tile, dice_min, dice_max, failure_move, exact_finish_required, reward_points,
          is_active, rules_json, created_by, shop_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(quest_chain_id),
          name,
          normalizeNullableString(description),
          normalizeNullableString(play_style) || 'fixed_track_race',
          normalizeNullableString(cover_image),
          normalizeNullableString(center_lat),
          normalizeNullableString(center_lng),
          normalizeNullableString(max_rounds),
          Number(start_tile || 1),
          Number(finish_tile || 10),
          Number(dice_min || 1),
          Number(dice_max || 6),
          Number(failure_move ?? -1),
          normalizeBoolean(exact_finish_required),
          Number(reward_points || 0),
          normalizeBoolean(is_active),
          stringifyJsonField(rules_json),
          req.user?.username || null,
          chain.shop_id || null
        ]
      );
      res.json({
        success: true,
        message: '大富翁地圖建立成功',
        id: insertResult.insertId
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '建立大富翁地圖失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/board-maps/:id', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    const {
      quest_chain_id,
      name,
      description,
      play_style,
      cover_image,
      center_lat,
      center_lng,
      max_rounds,
      start_tile,
      finish_tile,
      dice_min,
      dice_max,
      failure_move,
      exact_finish_required,
      reward_points,
      is_active,
      rules_json
    } = req.body || {};

    if (!quest_chain_id || !name) {
      return res.status(400).json({ success: false, message: '缺少 quest_chain_id 或 name' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const existingBoardMap = await assertBoardMapAccess(conn, req.user, id);
      const targetChain = await assertQuestChainAccess(conn, req.user, quest_chain_id);
      if (isQuestChainStructureLocked(targetChain)) {
        throw createStructureLockedError('此玩法入口');
      }
      await conn.execute(
        `UPDATE board_maps
         SET quest_chain_id = ?, name = ?, description = ?, play_style = ?, cover_image = ?,
             center_lat = ?, center_lng = ?, max_rounds = ?, start_tile = ?, finish_tile = ?,
             dice_min = ?, dice_max = ?, failure_move = ?, exact_finish_required = ?, reward_points = ?,
             is_active = ?, rules_json = ?, shop_id = ?
         WHERE id = ?`,
        [
          Number(quest_chain_id),
          name,
          normalizeNullableString(description),
          normalizeNullableString(play_style) || 'fixed_track_race',
          normalizeNullableString(cover_image),
          normalizeNullableString(center_lat),
          normalizeNullableString(center_lng),
          normalizeNullableString(max_rounds),
          Number(start_tile || 1),
          Number(finish_tile || 10),
          Number(dice_min || 1),
          Number(dice_max || 6),
          Number(failure_move ?? -1),
          normalizeBoolean(exact_finish_required),
          Number(reward_points || 0),
          normalizeBoolean(is_active),
          stringifyJsonField(rules_json),
          targetChain.shop_id || existingBoardMap.shop_id || null,
          Number(id)
        ]
      );
      res.json({ success: true, message: '大富翁地圖更新成功' });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '更新大富翁地圖失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.delete('/api/board-maps/:id', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      const boardMap = await assertBoardMapAccess(conn, req.user, id);
      if (boardMap.quest_chain_id) {
        const chain = await assertQuestChainAccess(conn, req.user, boardMap.quest_chain_id);
        if (isQuestChainStructureLocked(chain)) {
          throw createStructureLockedError('此玩法入口');
        }
      }
      await conn.execute('DELETE FROM board_maps WHERE id = ?', [id]);
      res.json({ success: true, message: '大富翁地圖已刪除' });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '刪除大富翁地圖失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/board-maps/:boardMapId/tiles', staffOrAdminAuth, async (req, res) => {
    const { boardMapId } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      await assertBoardMapAccess(conn, req.user, boardMapId);
      const [tiles] = await conn.execute(
        `SELECT bt.*, t.name AS task_name, t.validation_mode, t.task_type
         FROM board_tiles bt
         LEFT JOIN tasks t ON bt.task_id = t.id
         WHERE bt.board_map_id = ?
         ORDER BY bt.tile_index ASC, bt.id ASC`,
        [boardMapId]
      );
      res.json({
        success: true,
        tiles: tiles.map((row) => sanitizeBoardTileRow(row))
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入格子列表失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/board-maps/:boardMapId/tiles', staffOrAdminAuth, async (req, res) => {
    const { boardMapId } = req.params;
    const {
      tile_index,
      tile_name,
      tile_type,
      latitude,
      longitude,
      radius_meters,
      task_id,
      effect_type,
      effect_value,
      event_title,
      event_body,
      guide_content,
      tile_meta,
      is_active
    } = req.body || {};

    if (!tile_index || !tile_name || !tile_type) {
      return res.status(400).json({ success: false, message: '缺少格子編號、名稱或類型' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const boardMap = await assertBoardMapAccess(conn, req.user, boardMapId);
      if (boardMap.quest_chain_id) {
        const chain = await assertQuestChainAccess(conn, req.user, boardMap.quest_chain_id);
        if (isQuestChainStructureLocked(chain)) {
          throw createStructureLockedError('此玩法入口');
        }
      }
      if (task_id) {
        const task = await assertTaskAccess(conn, req.user, task_id);
        if (Number(task.quest_chain_id || 0) !== Number(boardMap.quest_chain_id || 0)) {
          return res.status(400).json({ success: false, message: '綁定任務必須屬於同一個玩法入口' });
        }
      }
      await conn.execute(
        `INSERT INTO board_tiles
         (board_map_id, tile_index, tile_name, tile_type, latitude, longitude, radius_meters, task_id,
          effect_type, effect_value, event_title, event_body, guide_content, tile_meta, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(boardMapId),
          Number(tile_index),
          tile_name,
          tile_type,
          normalizeNullableString(latitude),
          normalizeNullableString(longitude),
          normalizeNullableString(radius_meters),
          normalizeNullableString(task_id),
          normalizeNullableString(effect_type),
          normalizeNullableString(effect_value),
          normalizeNullableString(event_title),
          normalizeNullableString(event_body),
          normalizeNullableString(guide_content),
          stringifyJsonField(tile_meta),
          normalizeBoolean(is_active)
        ]
      );
      res.json({ success: true, message: '格子建立成功' });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '建立格子失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/board-tiles/:id', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    const {
      board_map_id,
      tile_index,
      tile_name,
      tile_type,
      latitude,
      longitude,
      radius_meters,
      task_id,
      effect_type,
      effect_value,
      event_title,
      event_body,
      guide_content,
      tile_meta,
      is_active
    } = req.body || {};

    if (!board_map_id || !tile_index || !tile_name || !tile_type) {
      return res.status(400).json({ success: false, message: '缺少格子資料' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await assertBoardTileAccess(conn, req.user, id);
      const boardMap = await assertBoardMapAccess(conn, req.user, board_map_id);
      if (boardMap.quest_chain_id) {
        const chain = await assertQuestChainAccess(conn, req.user, boardMap.quest_chain_id);
        if (isQuestChainStructureLocked(chain)) {
          throw createStructureLockedError('此玩法入口');
        }
      }
      if (task_id) {
        const task = await assertTaskAccess(conn, req.user, task_id);
        if (Number(task.quest_chain_id || 0) !== Number(boardMap.quest_chain_id || 0)) {
          return res.status(400).json({ success: false, message: '綁定任務必須屬於同一個玩法入口' });
        }
      }
      await conn.execute(
        `UPDATE board_tiles
         SET board_map_id = ?, tile_index = ?, tile_name = ?, tile_type = ?, latitude = ?, longitude = ?,
             radius_meters = ?, task_id = ?, effect_type = ?, effect_value = ?, event_title = ?, event_body = ?,
             guide_content = ?, tile_meta = ?, is_active = ?
         WHERE id = ?`,
        [
          Number(board_map_id),
          Number(tile_index),
          tile_name,
          tile_type,
          normalizeNullableString(latitude),
          normalizeNullableString(longitude),
          normalizeNullableString(radius_meters),
          normalizeNullableString(task_id),
          normalizeNullableString(effect_type),
          normalizeNullableString(effect_value),
          normalizeNullableString(event_title),
          normalizeNullableString(event_body),
          normalizeNullableString(guide_content),
          stringifyJsonField(tile_meta),
          normalizeBoolean(is_active),
          Number(id)
        ]
      );
      res.json({ success: true, message: '格子更新成功' });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '更新格子失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.delete('/api/board-tiles/:id', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      const boardTile = await assertBoardTileAccess(conn, req.user, id);
      const boardMap = await assertBoardMapAccess(conn, req.user, boardTile.board_map_id);
      if (boardMap.quest_chain_id) {
        const chain = await assertQuestChainAccess(conn, req.user, boardMap.quest_chain_id);
        if (isQuestChainStructureLocked(chain)) {
          throw createStructureLockedError('此玩法入口');
        }
      }
      await conn.execute('DELETE FROM board_tiles WHERE id = ?', [id]);
      res.json({ success: true, message: '格子已刪除' });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '刪除格子失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/board/session/start', authenticateToken, async (req, res) => {
    const { questChainId, boardMapId, preview } = req.body;
    if (!questChainId) {
      return res.status(400).json({ success: false, message: '缺少 questChainId' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const userId = await getUserIdByUsername(conn, req.user.username);
      if (!userId) {
        return res.status(400).json({ success: false, message: '使用者不存在' });
      }

      const [chainRows] = await conn.execute(
        `SELECT id, shop_id, access_mode, is_active
         FROM quest_chains
         WHERE id = ?
         LIMIT 1`,
        [questChainId]
      );
      if (!chainRows.length) {
        return res.status(404).json({ success: false, message: '找不到對應的玩法入口' });
      }
      const sanitizedQuestChain = sanitizeQuestChainRow(chainRows[0]);
      const previewRequested = normalizeBoolean(preview);
      const canPreviewInactive = previewRequested
        && isPrivilegedPreviewActor(req.user)
        && (req.user.role === 'admin' || actorCanAccessShop(req.user, sanitizedQuestChain.shop_id));
      if (previewRequested && !canPreviewInactive) {
        return res.status(403).json({ success: false, message: '無權限預覽其他商家的玩法入口' });
      }
      if (!sanitizedQuestChain.is_active && !canPreviewInactive) {
        return res.status(403).json({
          success: false,
          code: 'ENTRY_NOT_PUBLISHED',
          message: '此入口尚未正式發布，僅限後台預覽'
        });
      }
      if (sanitizedQuestChain.access_mode === 'coupon' && !canPreviewInactive) {
        const allowed = await hasQuestChainCouponAccess(conn, userId, Number(questChainId));
        if (!allowed) {
          return res.status(403).json({
            success: false,
            code: 'COUPON_REQUIRED',
            message: '此入口需專屬 Coupon 才能遊玩'
          });
        }
      }
      const mapSql = boardMapId
        ? 'SELECT * FROM board_maps WHERE quest_chain_id = ? AND id = ? AND (? = TRUE OR is_active = TRUE) ORDER BY id ASC LIMIT 1'
        : 'SELECT * FROM board_maps WHERE quest_chain_id = ? AND (? = TRUE OR is_active = TRUE) ORDER BY id ASC LIMIT 1';
      const mapParams = boardMapId
        ? [questChainId, Number(boardMapId), canPreviewInactive]
        : [questChainId, canPreviewInactive];
      const [maps] = await conn.execute(mapSql, mapParams);
      if (!maps.length) {
        return res.status(404).json({ success: false, message: '找不到對應的大富翁地圖' });
      }
      const boardMap = maps[0];

      const [existing] = await conn.execute(
        `SELECT * FROM user_game_sessions
         WHERE user_id = ? AND mode_type = 'board_game' AND quest_chain_id = ? AND board_map_id = ? AND status = 'active'
         ORDER BY id DESC LIMIT 1`,
        [userId, questChainId, boardMap.id]
      );

      let sessionId = existing[0]?.id || null;
      if (!sessionId) {
        const [insertResult] = await conn.execute(
          `INSERT INTO user_game_sessions
           (user_id, mode_type, quest_chain_id, board_map_id, status, current_tile, round_count, gained_points)
           VALUES (?, 'board_game', ?, ?, 'active', ?, 0, 0)`,
          [userId, questChainId, boardMap.id, Number(boardMap.start_tile || 1)]
        );
        sessionId = insertResult.insertId;
      }

      const [sessions] = await conn.execute('SELECT * FROM user_game_sessions WHERE id = ? LIMIT 1', [sessionId]);
      res.json({ success: true, session: sanitizeBoardSessionRow(sessions[0]), boardMap: { ...boardMap, rules_json: parseJsonField(boardMap.rules_json, null) } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '啟動大富翁 session 失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/board/session/:sessionId/roll', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      const userId = await getUserIdByUsername(conn, req.user.username);
      if (!userId) {
        return res.status(400).json({ success: false, message: '使用者不存在' });
      }

      const [sessions] = await conn.execute(
        'SELECT * FROM user_game_sessions WHERE id = ? AND user_id = ? LIMIT 1',
        [sessionId, userId]
      );
      if (!sessions.length) {
        return res.status(404).json({ success: false, message: '找不到這場大富翁 session' });
      }

      const session = sanitizeBoardSessionRow(sessions[0]);
      if (session.pending_target_tile) {
        return res.status(400).json({ success: false, message: '目前已有待結算的回合' });
      }

      const [maps] = await conn.execute('SELECT * FROM board_maps WHERE id = ? LIMIT 1', [session.board_map_id]);
      if (!maps.length) {
        return res.status(404).json({ success: false, message: '找不到棋盤資料' });
      }
      const boardMap = maps[0];

      const diceMin = Number(boardMap.dice_min || 1);
      const diceMax = Number(boardMap.dice_max || 6);
      const rules = parseJsonField(boardMap.rules_json, null) || {};
      const tutorialRollSequence = Array.isArray(rules.tutorial_roll_sequence)
        ? rules.tutorial_roll_sequence.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
        : [];
      const scriptedRoll = tutorialRollSequence.length
        ? tutorialRollSequence[Number(session.round_count || 0) % tutorialRollSequence.length]
        : null;
      const rollValue = scriptedRoll && scriptedRoll >= diceMin && scriptedRoll <= diceMax
        ? scriptedRoll
        : (Math.floor(Math.random() * (diceMax - diceMin + 1)) + diceMin);
      const finishTile = Number(boardMap.finish_tile || session.current_tile);
      const exactFinishRequired = Boolean(boardMap.exact_finish_required);
      const desiredTile = session.current_tile + rollValue;
      const targetTileIndex = exactFinishRequired && desiredTile > finishTile
        ? session.current_tile
        : Math.min(desiredTile, finishTile);

      const [tiles] = await conn.execute(
        `SELECT bt.*, t.name AS task_name, t.description AS task_description, t.validation_mode, t.stage_template, t.points AS task_points
         FROM board_tiles bt
         LEFT JOIN tasks t ON bt.task_id = t.id
         WHERE bt.board_map_id = ? AND bt.tile_index = ? LIMIT 1`,
        [boardMap.id, targetTileIndex]
      );
      if (!tiles.length) {
        return res.status(404).json({ success: false, message: '找不到目標格子' });
      }

      const targetTile = tiles[0];
      await conn.execute(
        `UPDATE user_game_sessions
         SET pending_roll = ?, pending_target_tile = ?, last_result = ?
         WHERE id = ?`,
        [
          rollValue,
          targetTileIndex,
          JSON.stringify({
            phase: 'rolled',
            rollValue,
            targetTileIndex,
            tileName: targetTile.tile_name,
            message: `命運之骰顯示 ${rollValue}，請前往第 ${targetTileIndex} 格「${targetTile.tile_name || '未命名格子'}」。`
          }),
          session.id
        ]
      );

      const [updatedRows] = await conn.execute('SELECT * FROM user_game_sessions WHERE id = ? LIMIT 1', [session.id]);
      res.json({
        success: true,
        session: sanitizeBoardSessionRow(updatedRows[0]),
        rollValue,
        targetTile: {
          ...targetTile,
          tile_meta: parseJsonField(targetTile.tile_meta, null)
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '擲骰失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/board/session/:sessionId/resolve', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    const { success } = req.body;
    if (typeof success !== 'boolean') {
      return res.status(400).json({ success: false, message: '缺少 success 狀態' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const userId = await getUserIdByUsername(conn, req.user.username);
      if (!userId) {
        return res.status(400).json({ success: false, message: '使用者不存在' });
      }

      const [sessions] = await conn.execute(
        'SELECT * FROM user_game_sessions WHERE id = ? AND user_id = ? LIMIT 1',
        [sessionId, userId]
      );
      if (!sessions.length) {
        return res.status(404).json({ success: false, message: '找不到這場大富翁 session' });
      }

      const session = sanitizeBoardSessionRow(sessions[0]);
      if (!session.pending_target_tile) {
        return res.status(400).json({ success: false, message: '目前沒有待結算的回合' });
      }

      const [maps] = await conn.execute('SELECT * FROM board_maps WHERE id = ? LIMIT 1', [session.board_map_id]);
      if (!maps.length) {
        return res.status(404).json({ success: false, message: '找不到棋盤資料' });
      }
      const boardMap = maps[0];

      const [tiles] = await conn.execute(
        `SELECT bt.*, t.points AS task_points
         FROM board_tiles bt
         LEFT JOIN tasks t ON bt.task_id = t.id
         WHERE bt.board_map_id = ? AND bt.tile_index = ? LIMIT 1`,
        [boardMap.id, session.pending_target_tile]
      );
      const pendingTile = tiles[0] || null;

      const failureMove = Number(boardMap.failure_move || -1);
      const nextTile = success
        ? session.pending_target_tile
        : Math.max(Number(boardMap.start_tile || 1), session.current_tile + failureMove);
      const gainedPoints = success
        ? Number(session.gained_points || 0) + Number(pendingTile?.task_points || pendingTile?.effect_value || 0)
        : Number(session.gained_points || 0);
      const nextRound = Number(session.round_count || 0) + 1;
      const finishTile = Number(boardMap.finish_tile || nextTile);
      const nextStatus = nextTile >= finishTile ? 'completed' : 'active';
      const turnPoints = Number(pendingTile?.task_points || pendingTile?.effect_value || 0);
      const tileName = pendingTile?.tile_name || pendingTile?.event_title || '未命名格子';
      let resolveMessage = '';
      if (success) {
        if (pendingTile?.tile_type === 'event') {
          resolveMessage = `${pendingTile?.event_title || tileName} 已觸發，你的隊伍推進到第 ${nextTile} 格。`;
        } else {
          resolveMessage = `「${tileName}」判定通過，你的隊伍推進到第 ${nextTile} 格。`;
        }
        if (turnPoints > 0) {
          resolveMessage += ` 本回合獲得 ${turnPoints} 點旅程積分。`;
        }
        if (nextStatus === 'completed') {
          resolveMessage += ' 你已抵達終點。';
        }
      } else {
        resolveMessage = `「${tileName}」未通過，依棋盤規則退回到第 ${nextTile} 格。`;
      }

      await conn.execute(
        `UPDATE user_game_sessions
         SET current_tile = ?, round_count = ?, gained_points = ?, pending_roll = NULL, pending_target_tile = NULL,
             status = ?, completed_at = ${nextStatus === 'completed' ? 'NOW()' : 'NULL'}, last_result = ?
         WHERE id = ?`,
        [
          nextTile,
          nextRound,
          gainedPoints,
          nextStatus,
          JSON.stringify({
            phase: 'resolved',
            success,
            nextTile,
            roundCount: nextRound,
            gainedPoints,
            tileName,
            tileType: pendingTile?.tile_type || null,
            message: resolveMessage
          }),
          session.id
        ]
      );

      // 將本回合積分寫入 point_transactions
      if (success && turnPoints > 0 && userId) {
        try {
          await conn.execute(
            'INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, 'earned', turnPoints, `棋盤回合: ${tileName}`, 'board_game_turn', session.id]
          );
        } catch (ptErr) {
          console.warn('棋盤積分寫入 point_transactions 失敗:', ptErr.message);
        }
      }

      const [updatedRows] = await conn.execute('SELECT * FROM user_game_sessions WHERE id = ? LIMIT 1', [session.id]);
      res.json({ success: true, session: sanitizeBoardSessionRow(updatedRows[0]) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '結算回合失敗' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  registerBoardRoutes
};
