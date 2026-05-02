const bcrypt = require('bcryptjs');

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function registerAuthRoutes(app, {
  pool,
  authenticateToken,
  requireRole,
  generateToken,
  loadUserAuthContextByUsername,
  buildShopCode,
  normalizeNullableString,
  assertActorHasShopScope,
  ensureShopExists,
  actorCanAccessShop
}) {
  app.post('/api/login', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !role) {
      return res.status(400).json({ success: false, message: '缺少參數' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      if (role === 'user') {
        const [users] = await conn.execute(
          'SELECT * FROM users WHERE username = ? AND role IN (?, ?)',
          [username, 'user', 'staff']
        );
        if (users.length === 0) {
          return res.status(400).json({ success: false, message: '查無此用戶' });
        }

        const user = users[0];
        if (user.password && user.password.trim() !== '') {
          if (!password) {
            return res.status(400).json({ success: false, message: '此帳號需要密碼，請輸入密碼' });
          }
          const isValid = await bcrypt.compare(password, user.password);
          if (!isValid) {
            return res.status(400).json({ success: false, message: '密碼錯誤' });
          }
        }

        const token = generateToken(user);
        setAuthCookie(res, token);

        res.json({
          success: true,
          user: {
            id: users[0].id,
            username: users[0].username,
            role: users[0].role
          }
        });
      } else if (role === 'staff_portal' || role === 'shop' || role === 'admin' || role === 'staff') {
        const [users] = await conn.execute(
          'SELECT * FROM users WHERE username = ? AND role IN (?, ?)',
          [username, 'shop', 'admin']
        );
        if (users.length === 0) {
          return res.status(400).json({ success: false, message: '查無此帳號' });
        }

        const storedPassword = users[0].password;
        let match = false;

        if (storedPassword && (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$'))) {
          match = await bcrypt.compare(password, storedPassword);
        } else {
          match = false;
          console.warn(`用戶 ${username} 的密碼格式不正確`);
        }

        if (!match) {
          return res.status(400).json({ success: false, message: '密碼錯誤' });
        }

        const userContext = await loadUserAuthContextByUsername(users[0].username) || users[0];
        const token = generateToken(userContext);
        setAuthCookie(res, token);

        res.json({
          success: true,
          user: {
            id: userContext.id,
            username: userContext.username,
            role: userContext.role,
            shop_id: userContext.shop_id || null,
            shop_name: userContext.shop_name || null
          }
        });
      } else {
        return res.status(400).json({ success: false, message: '角色錯誤' });
      }
    } catch (err) {
      console.error('登入 API 錯誤:', err);
      if (err.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('資料庫連接失敗 - 請檢查環境變數設定');
        return res.status(503).json({
          success: false,
          message: '資料庫連接失敗，請聯繫管理員檢查伺服器設定'
        });
      }
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, message: '已成功登出' });
  });

  app.get('/api/me', authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
  });

  app.post('/api/register', async (req, res) => {
    const { username, role } = req.body;
    if (!username || !role) {
      return res.status(400).json({ success: false, message: '缺少參數' });
    }
    if (role !== 'user') {
      return res.status(403).json({ success: false, message: '僅允許註冊一般用戶，工作人員/商店/管理員帳號請由管理員建立或指派' });
    }
    if (!/^09[0-9]{8}$/.test(username)) {
      return res.status(400).json({ success: false, message: '請輸入正確的手機門號' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const [exist] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (exist.length > 0) {
        return res.status(400).json({ success: false, message: '帳號已存在' });
      }

      const [insertResult] = await conn.execute(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [username, null, 'user']
      );
      const newUser = { id: insertResult.insertId, username, role: 'user' };
      const token = generateToken(newUser);
      setAuthCookie(res, token);
      res.json({ success: true, message: '註冊成功', user: newUser });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/admin/accounts', authenticateToken, requireRole('admin'), async (req, res) => {
    const { username, password, role, shop_name, contact_name, contact_phone, contact_email, shop_address, shop_description, status } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ success: false, message: '缺少參數' });
    }
    if (!['admin', 'shop'].includes(role)) {
      return res.status(400).json({ success: false, message: '僅允許建立 admin 或 shop 帳號' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const [exist] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (exist.length > 0) return res.status(400).json({ success: false, message: '帳號已存在' });

      const hashed = await bcrypt.hash(password, 10);
      let shopId = null;
      if (role === 'shop') {
        const [shopInsert] = await conn.execute(
          `INSERT INTO shops (code, name, owner_username, contact_name, contact_phone, contact_email, address, description, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            buildShopCode(username),
            normalizeNullableString(shop_name) || username,
            username,
            normalizeNullableString(contact_name) || normalizeNullableString(shop_name) || username,
            normalizeNullableString(contact_phone),
            normalizeNullableString(contact_email),
            normalizeNullableString(shop_address),
            normalizeNullableString(shop_description),
            normalizeNullableString(status) || 'active'
          ]
        );
        shopId = shopInsert.insertId;
      }
      const [userInsert] = await conn.execute(
        `INSERT INTO users
          (username, password, role, shop_id, created_by, shop_name, shop_address, shop_description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          username,
          hashed,
          role,
          shopId,
          req.user.username,
          normalizeNullableString(shop_name),
          normalizeNullableString(shop_address),
          normalizeNullableString(shop_description)
        ]
      );
      if (shopId) {
        await conn.execute('UPDATE shops SET owner_username = ? WHERE id = ?', [username, shopId]);
      }
      res.json({ success: true, message: '建立成功', user_id: userInsert.insertId, shop_id: shopId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/staff/assign', authenticateToken, requireRole('admin'), async (req, res) => {
    const { username, shop_id } = req.body;
    if (!username) return res.status(400).json({ success: false, message: '缺少 username' });
    let conn;
    try {
      conn = await pool.getConnection();
      const actor = req.user;
      const targetShopId = actor.role === 'admin'
        ? Number(shop_id || 0) || null
        : assertActorHasShopScope(actor);
      if (!targetShopId) {
        return res.status(400).json({ success: false, message: 'admin 指派 staff 時必須指定 shop_id' });
      }
      await ensureShopExists(conn, targetShopId);
      const [rows] = await conn.execute('SELECT id, role FROM users WHERE username = ?', [username]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: '找不到使用者' });
      const u = rows[0];
      if (u.role === 'admin' || u.role === 'shop') return res.status(400).json({ success: false, message: '不可將 admin/shop 指派為 staff' });
      if (u.role === 'staff' && actor.role !== 'admin') {
        return res.status(403).json({ success: false, message: '此帳號已是 staff，僅 admin 可重新指派' });
      }
      await conn.execute(
        'UPDATE users SET role = ?, managed_by = ?, shop_id = ? WHERE id = ?',
        ['staff', req.user.username, targetShopId, u.id]
      );
      res.json({ success: true, message: '已指派為 staff', shop_id: targetShopId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/staff/revoke', authenticateToken, requireRole('admin'), async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: '缺少 username' });
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT id, role, managed_by, shop_id FROM users WHERE username = ?', [username]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: '找不到使用者' });
      const u = rows[0];
      if (u.role !== 'staff') return res.status(400).json({ success: false, message: '此帳號不是 staff' });
      if (req.user.role === 'shop' && !actorCanAccessShop(req.user, u.shop_id)) {
        return res.status(403).json({ success: false, message: '無權限撤銷非本店 staff' });
      }
      await conn.execute('UPDATE users SET role = ?, managed_by = NULL, shop_id = NULL WHERE id = ?', ['user', u.id]);
      res.json({ success: true, message: '已撤銷 staff，恢復為一般用戶' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/change-password', authenticateToken, requireRole('admin', 'shop'), async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ success: false, message: '缺少參數' });
    if (String(newPassword).length < 6) return res.status(400).json({ success: false, message: '新密碼至少 6 碼' });
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT id, password FROM users WHERE username = ?', [req.user.username]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: '找不到使用者' });
      const stored = rows[0].password;
      const ok = stored && (stored.startsWith('$2a$') || stored.startsWith('$2b$')) && await bcrypt.compare(oldPassword, stored);
      if (!ok) return res.status(400).json({ success: false, message: '舊密碼錯誤' });
      const hashed = await bcrypt.hash(newPassword, 10);
      await conn.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, rows[0].id]);
      res.json({ success: true, message: '密碼已更新' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  registerAuthRoutes
};
