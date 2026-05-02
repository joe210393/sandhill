const VALID_NPC_KEY = /^[a-z][a-z0-9_]{0,30}$/;

function registerGameNpcRoutes(app, { pool, adminAuth }) {
  app.get('/api/game-npcs', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute(
        'SELECT id, npc_key, display_name, portrait_emoji, role_line, description, sort_order FROM game_npcs ORDER BY sort_order ASC, id ASC'
      );
      res.json({ success: true, npcs: rows });
    } catch (err) {
      console.error('game-npcs list', err);
      res.status(500).json({ success: false, message: '讀取 NPC 失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/game-npcs', adminAuth, async (req, res) => {
    const { npc_key, display_name, portrait_emoji, role_line, description, sort_order } = req.body || {};
    if (!npc_key || !display_name) {
      return res.status(400).json({ success: false, message: '缺少 npc_key 或 display_name' });
    }
    if (!VALID_NPC_KEY.test(String(npc_key).trim())) {
      return res.status(400).json({
        success: false,
        message: 'npc_key 僅能使用小寫英數與底線，且需以字母開頭'
      });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      const [r] = await conn.execute(
        `INSERT INTO game_npcs (npc_key, display_name, portrait_emoji, role_line, description, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          String(npc_key).trim(),
          String(display_name).trim(),
          portrait_emoji != null ? String(portrait_emoji).trim().slice(0, 16) : '🧭',
          role_line != null ? String(role_line).trim().slice(0, 64) : '',
          description != null ? String(description).trim() : '',
          Number(sort_order) || 0
        ]
      );
      res.json({ success: true, message: 'NPC 已建立', id: r.insertId });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: 'npc_key 已存在' });
      }
      console.error('game-npcs create', err);
      res.status(500).json({ success: false, message: '建立 NPC 失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/game-npcs/:id', adminAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: '無效的 ID' });
    }
    const { display_name, portrait_emoji, role_line, description, sort_order } = req.body || {};
    if (!display_name) {
      return res.status(400).json({ success: false, message: '缺少 display_name' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.execute(
        `UPDATE game_npcs SET display_name = ?, portrait_emoji = ?, role_line = ?, description = ?, sort_order = ?
         WHERE id = ?`,
        [
          String(display_name).trim(),
          portrait_emoji != null ? String(portrait_emoji).trim().slice(0, 16) : '🧭',
          role_line != null ? String(role_line).trim().slice(0, 64) : '',
          description != null ? String(description).trim() : '',
          Number(sort_order) || 0,
          id
        ]
      );
      res.json({ success: true, message: 'NPC 已更新' });
    } catch (err) {
      console.error('game-npcs update', err);
      res.status(500).json({ success: false, message: '更新 NPC 失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.delete('/api/game-npcs/:id', adminAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: '無效的 ID' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.execute('DELETE FROM game_npcs WHERE id = ?', [id]);
      res.json({ success: true, message: 'NPC 已刪除' });
    } catch (err) {
      console.error('game-npcs delete', err);
      res.status(500).json({ success: false, message: '刪除 NPC 失敗' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = { registerGameNpcRoutes };
