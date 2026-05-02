function createRoleAuthMiddleware({ pool, authenticateTokenCompat }) {
  function adminAuth(req, res, next) {
    authenticateTokenCompat(req, res, () => {
      if (req.user && req.user.role === 'admin') {
        next();
      } else {
        return res.status(403).json({ success: false, message: '無權限：需要管理員身分' });
      }
    });
  }

  function staffOrAdminAuth(req, res, next) {
    authenticateTokenCompat(req, res, () => {
      const role = req.user?.role;
      if (role === 'admin' || role === 'shop' || role === 'staff') {
        next();
      } else {
        return res.status(403).json({ success: false, message: '無權限' });
      }
    });
  }

  function shopOrAdminAuth(req, res, next) {
    authenticateTokenCompat(req, res, () => {
      const role = req.user?.role;
      if (role === 'admin' || role === 'shop') return next();
      return res.status(403).json({ success: false, message: '僅管理員或商店帳號可核銷優惠券' });
    });
  }

  function reviewerAuth(req, res, next) {
    authenticateTokenCompat(req, res, async () => {
      if (!req.user || !req.user.username) return res.status(401).json({ success: false, message: '未認證' });
      let conn;
      try {
        conn = await pool.getConnection();
        const [rows] = await conn.execute('SELECT role, managed_by FROM users WHERE username = ?', [req.user.username]);
        if (rows.length === 0) return res.status(401).json({ success: false, message: '用戶不存在' });
        const role = rows[0].role;
        if (!['admin', 'shop', 'staff'].includes(role)) {
          return res.status(403).json({ success: false, message: '無權限' });
        }
        req.user.role = role;
        req.user.managed_by = rows[0].managed_by || null;
        return next();
      } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: '伺服器錯誤' });
      } finally {
        if (conn) conn.release();
      }
    });
  }

  return {
    adminAuth,
    staffOrAdminAuth,
    shopOrAdminAuth,
    reviewerAuth
  };
}

module.exports = {
  createRoleAuthMiddleware
};
