const {
  SHOP_SHARED_ASSET_LIMIT_BYTES,
  buildBytesLabel
} = require('../services/asset-storage');

function registerAssetRoutes(app, {
  pool,
  authenticateToken,
  staffOrAdminAuth,
  uploadImage,
  uploadModel,
  uploadAudio,
  uploadVideo,
  optimizeUploadedVideoForStreaming,
  cleanupUploadedFile,
  resolveActorShopId,
  getActorShopId,
  actorCanAccessShop,
  ensureShopExists,
  getSharedAssetStorageSummary,
  getSharedAssetStorageBreakdown,
  assertSharedAssetStorageAvailable
}) {
  app.get('/api/ar-models', staffOrAdminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const scopedShopId = req.user?.role === 'admin'
        ? (req.query.shop_id ? await resolveActorShopId(conn, req.user, req.query.shop_id) : null)
        : getActorShopId(req.user);
      const scopeSql = scopedShopId == null ? '' : 'WHERE m.shop_id = ?';
      const params = scopedShopId == null ? [] : [scopedShopId];
      const [rows] = await conn.execute(
        `SELECT m.*, s.name AS shop_name
           FROM ar_models m
           LEFT JOIN shops s ON s.id = m.shop_id
           ${scopeSql}
          ORDER BY m.id DESC`,
        params
      );
      res.json({ success: true, models: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/ar-models', staffOrAdminAuth, uploadModel.single('model'), async (req, res) => {
    const { name, scale } = req.body;
    if (!name) return res.status(400).json({ success: false, message: '缺少模型名稱' });
    if (!req.file) return res.status(400).json({ success: false, message: '未選擇檔案' });

    const modelUrl = '/images/' + req.file.filename;
    const modelScale = parseFloat(scale) || 1.0;
    const username = req.user?.username || req.user?.username;

    let conn;
    try {
      conn = await pool.getConnection();
      await assertSharedAssetStorageAvailable(conn, req.user, req.file.size, '模型素材');
      const shopId = req.user?.role === 'admin' ? null : getActorShopId(req.user);
      await conn.execute(
        'INSERT INTO ar_models (name, url, scale, created_by, shop_id, file_size) VALUES (?, ?, ?, ?, ?, ?)',
        [name, modelUrl, modelScale, username, shopId, req.file.size || 0]
      );
      res.json({ success: true, message: '模型上傳成功' });
    } catch (err) {
      cleanupUploadedFile(req.file);
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/assets/storage-summary', staffOrAdminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const isAdmin = req.user?.role === 'admin';
      const shopId = isAdmin
        ? (req.query.shop_id ? await resolveActorShopId(conn, req.user, req.query.shop_id) : null)
        : getActorShopId(req.user);
      const summary = await getSharedAssetStorageSummary(conn, { shopId });
      const limitBytes = isAdmin ? null : SHOP_SHARED_ASSET_LIMIT_BYTES;
      const remainingBytes = isAdmin ? null : Math.max(limitBytes - Number(summary.total_bytes || 0), 0);
      const usagePercent = isAdmin || !limitBytes
        ? null
        : Math.min(100, Math.round((Number(summary.total_bytes || 0) / limitBytes) * 1000) / 10);
      const shopBreakdown = isAdmin ? await getSharedAssetStorageBreakdown(conn) : [];
      res.json({
        success: true,
        summary: {
          ...summary,
          total_bytes_label: buildBytesLabel(summary.total_bytes),
          remaining_bytes: remainingBytes,
          remaining_bytes_label: remainingBytes == null ? '無上限' : buildBytesLabel(remainingBytes),
          limit_bytes: limitBytes,
          limit_bytes_label: limitBytes == null ? '無上限' : buildBytesLabel(limitBytes),
          unlimited: isAdmin,
          usage_percent: usagePercent
        },
        scope: {
          role: req.user?.role || null,
          shop_id: shopId,
          shop_name: shopId
            ? (await ensureShopExists(conn, shopId)).name
            : (req.user?.shop_name || null)
        },
        shop_breakdown: shopBreakdown
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/bgm-assets', staffOrAdminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const scopedShopId = req.user?.role === 'admin'
        ? (req.query.shop_id ? await resolveActorShopId(conn, req.user, req.query.shop_id) : null)
        : getActorShopId(req.user);
      const scopeSql = scopedShopId == null ? '' : 'WHERE b.shop_id = ?';
      const params = scopedShopId == null ? [] : [scopedShopId];
      const [rows] = await conn.execute(
        `SELECT b.id, b.name, b.url, b.created_by, b.created_at, b.shop_id, b.file_size, s.name AS shop_name
           FROM bgm_library b
           LEFT JOIN shops s ON s.id = b.shop_id
           ${scopeSql}
          ORDER BY b.id DESC`,
        params
      );
      res.json({ success: true, assets: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/video-assets', staffOrAdminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const scopedShopId = req.user?.role === 'admin'
        ? (req.query.shop_id ? await resolveActorShopId(conn, req.user, req.query.shop_id) : null)
        : getActorShopId(req.user);
      const scopeSql = scopedShopId == null ? '' : 'WHERE v.shop_id = ?';
      const params = scopedShopId == null ? [] : [scopedShopId];
      const [rows] = await conn.execute(
        `SELECT v.id, v.name, v.url, v.created_by, v.created_at, v.shop_id, v.file_size, s.name AS shop_name
           FROM video_library v
           LEFT JOIN shops s ON s.id = v.shop_id
           ${scopeSql}
          ORDER BY v.id DESC`,
        params
      );
      res.json({ success: true, assets: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/video-assets', staffOrAdminAuth, uploadVideo.single('video'), async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: '請填寫影片名稱' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: '請選擇影片檔' });
    }
    const createdBy = req.user?.username || null;
    let conn;
    try {
      const optimization = await optimizeUploadedVideoForStreaming(req.file);
      const url = '/images/' + req.file.filename;
      conn = await pool.getConnection();
      await assertSharedAssetStorageAvailable(conn, req.user, req.file.size, '影片素材');
      const shopId = req.user?.role === 'admin' ? null : getActorShopId(req.user);
      const [result] = await conn.execute(
        'INSERT INTO video_library (name, url, created_by, shop_id, file_size) VALUES (?, ?, ?, ?, ?)',
        [name, url, createdBy, shopId, req.file.size || 0]
      );
      res.json({
        success: true,
        message: optimization.optimized ? '影片已加入素材庫（已最佳化）' : '影片已加入素材庫',
        id: result.insertId,
        url,
        optimization: {
          optimized: optimization.optimized,
          original_size: optimization.originalSize,
          final_size: optimization.finalSize
        }
      });
    } catch (err) {
      cleanupUploadedFile(req.file);
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.delete('/api/video-assets/:id', staffOrAdminAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: '無效的 ID' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT shop_id FROM video_library WHERE id = ?', [id]);
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: '找不到此素材' });
      }
      if (!actorCanAccessShop(req.user, rows[0].shop_id)) {
        return res.status(403).json({ success: false, message: '無權限刪除此素材' });
      }
      await conn.execute('DELETE FROM video_library WHERE id = ?', [id]);
      res.json({ success: true, message: '已刪除' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/bgm-assets', staffOrAdminAuth, uploadAudio.single('audio'), async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: '請填寫音樂名稱' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: '請選擇音檔' });
    }
    const url = '/images/' + req.file.filename;
    const createdBy = req.user?.username || null;
    let conn;
    try {
      conn = await pool.getConnection();
      await assertSharedAssetStorageAvailable(conn, req.user, req.file.size, '背景音樂素材');
      const shopId = req.user?.role === 'admin' ? null : getActorShopId(req.user);
      const [result] = await conn.execute(
        'INSERT INTO bgm_library (name, url, created_by, shop_id, file_size) VALUES (?, ?, ?, ?, ?)',
        [name, url, createdBy, shopId, req.file.size || 0]
      );
      res.json({
        success: true,
        message: '背景音樂已加入素材庫',
        id: result.insertId,
        url
      });
    } catch (err) {
      cleanupUploadedFile(req.file);
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.delete('/api/bgm-assets/:id', staffOrAdminAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: '無效的 ID' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT url, shop_id FROM bgm_library WHERE id = ?', [id]);
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: '找不到此素材' });
      }
      if (!actorCanAccessShop(req.user, rows[0].shop_id)) {
        return res.status(403).json({ success: false, message: '無權限刪除此素材' });
      }
      const url = rows[0].url;
      const [tasks] = await conn.execute('SELECT id FROM tasks WHERE bgm_url = ? LIMIT 1', [url]);
      if (tasks.length > 0) {
        return res.status(400).json({ success: false, message: '有關卡正在使用此音樂，請先改關卡背景音樂再刪除' });
      }
      await conn.execute('DELETE FROM bgm_library WHERE id = ?', [id]);
      res.json({ success: true, message: '已刪除' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.delete('/api/ar-models/:id', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      const [models] = await conn.execute('SELECT id, shop_id FROM ar_models WHERE id = ? LIMIT 1', [id]);
      if (!models.length) {
        return res.status(404).json({ success: false, message: '找不到此模型' });
      }
      if (!actorCanAccessShop(req.user, models[0].shop_id)) {
        return res.status(403).json({ success: false, message: '無權限刪除此模型' });
      }

      const [tasks] = await conn.execute('SELECT id FROM tasks WHERE ar_model_id = ?', [id]);
      if (tasks.length > 0) {
        return res.status(400).json({ success: false, message: '此模型正被任務使用中，無法刪除' });
      }

      await conn.execute('DELETE FROM ar_models WHERE id = ?', [id]);
      res.json({ success: true, message: '模型已刪除' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/items', staffOrAdminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const scopedShopId = req.user?.role === 'admin'
        ? (req.query.shop_id ? await resolveActorShopId(conn, req.user, req.query.shop_id) : null)
        : getActorShopId(req.user);
      const scopeSql = scopedShopId == null ? '' : 'WHERE i.shop_id = ?';
      const params = scopedShopId == null ? [] : [scopedShopId];
      const [rows] = await conn.execute(
        `SELECT i.*, s.name AS shop_name
           FROM items i
           LEFT JOIN shops s ON s.id = i.shop_id
           ${scopeSql}
          ORDER BY i.id DESC`,
        params
      );
      res.json({ success: true, items: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/items', staffOrAdminAuth, uploadImage.single('image'), async (req, res) => {
    const { name, description, model_url } = req.body;
    if (!name) return res.status(400).json({ success: false, message: '缺少道具名稱' });

    let image_url = null;
    if (req.file) {
      image_url = '/images/' + req.file.filename;
    } else if (req.body.image_url) {
      image_url = req.body.image_url;
    }

    let conn;
    try {
      conn = await pool.getConnection();
      if (req.file) {
        await assertSharedAssetStorageAvailable(conn, req.user, req.file.size, '道具素材');
      }
      const shopId = req.user?.role === 'admin' ? null : getActorShopId(req.user);
      await conn.execute(
        'INSERT INTO items (name, description, image_url, model_url, shop_id, file_size) VALUES (?, ?, ?, ?, ?, ?)',
        [name, description || '', image_url, model_url || null, shopId, req.file?.size || 0]
      );
      res.json({ success: true, message: '道具新增成功' });
    } catch (err) {
      cleanupUploadedFile(req.file);
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/items/:id', staffOrAdminAuth, uploadImage.single('image'), async (req, res) => {
    const { id } = req.params;
    const { name, description, model_url } = req.body;
    if (!name) return res.status(400).json({ success: false, message: '缺少道具名稱' });

    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT id, shop_id, file_size FROM items WHERE id = ? LIMIT 1', [id]);
      if (!rows.length) {
        return res.status(404).json({ success: false, message: '找不到此道具' });
      }
      const existingItem = rows[0];
      if (!actorCanAccessShop(req.user, existingItem.shop_id)) {
        return res.status(403).json({ success: false, message: '無權限編輯此道具' });
      }

      let sql;
      let params;
      if (req.file) {
        const deltaBytes = Math.max(Number(req.file.size || 0) - Number(existingItem.file_size || 0), 0);
        if (deltaBytes > 0) {
          await assertSharedAssetStorageAvailable(conn, req.user, deltaBytes, '道具素材');
        }
        const image_url = '/images/' + req.file.filename;
        sql = 'UPDATE items SET name = ?, description = ?, image_url = ?, model_url = ?, file_size = ? WHERE id = ?';
        params = [name, description || '', image_url, model_url || null, req.file.size || 0, id];
      } else if (req.body.image_url) {
        sql = 'UPDATE items SET name = ?, description = ?, image_url = ?, model_url = ? WHERE id = ?';
        params = [name, description || '', req.body.image_url, model_url || null, id];
      } else {
        sql = 'UPDATE items SET name = ?, description = ?, model_url = ? WHERE id = ?';
        params = [name, description || '', model_url || null, id];
      }

      await conn.execute(sql, params);
      res.json({ success: true, message: '道具更新成功' });
    } catch (err) {
      cleanupUploadedFile(req.file);
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.delete('/api/items/:id', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      const [items] = await conn.execute('SELECT id, shop_id FROM items WHERE id = ? LIMIT 1', [id]);
      if (!items.length) {
        return res.status(404).json({ success: false, message: '找不到此道具' });
      }
      if (!actorCanAccessShop(req.user, items[0].shop_id)) {
        return res.status(403).json({ success: false, message: '無權限刪除此道具' });
      }

      const [tasks] = await conn.execute(
        'SELECT id FROM tasks WHERE required_item_id = ? OR reward_item_id = ?',
        [id, id]
      );
      if (tasks.length > 0) {
        return res.status(400).json({ success: false, message: '此道具被任務引用中，無法刪除' });
      }

      await conn.execute('DELETE FROM items WHERE id = ?', [id]);
      res.json({ success: true, message: '道具已刪除' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/admin/grant-item', staffOrAdminAuth, async (req, res) => {
    const { username, item_id, quantity } = req.body;
    if (!username || !item_id) return res.status(400).json({ success: false, message: '缺少必要參數' });
    const qty = parseInt(quantity) || 1;

    let conn;
    try {
      conn = await pool.getConnection();

      const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (users.length === 0) return res.status(404).json({ success: false, message: '找不到此玩家帳號' });
      const userId = users[0].id;

      const [items] = await conn.execute('SELECT id, name FROM items WHERE id = ?', [item_id]);
      if (items.length === 0) return res.status(404).json({ success: false, message: '找不到此道具' });
      const itemName = items[0].name;

      const [inventory] = await conn.execute(
        'SELECT id FROM user_inventory WHERE user_id = ? AND item_id = ?',
        [userId, item_id]
      );

      if (inventory.length > 0) {
        await conn.execute('UPDATE user_inventory SET quantity = quantity + ? WHERE id = ?', [qty, inventory[0].id]);
      } else {
        await conn.execute('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES (?, ?, ?)', [userId, item_id, qty]);
      }

      res.json({ success: true, message: `已成功發放 ${qty} 個【${itemName}】給 ${username}` });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/user/inventory', authenticateToken, async (req, res) => {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ success: false, message: '未認證' });
    }
    const username = req.user.username;

    let conn;
    try {
      conn = await pool.getConnection();
      const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (users.length === 0) return res.json({ success: true, inventory: [] });
      const userId = users[0].id;

      const [rows] = await conn.execute(`
        SELECT ui.*, i.name, i.description, i.image_url
        FROM user_inventory ui
        JOIN items i ON ui.item_id = i.id
        WHERE ui.user_id = ?
      `, [userId]);

      res.json({ success: true, inventory: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  registerAssetRoutes
};
