const jwt = require('jsonwebtoken');

function createAuthService({
  jwtSecret,
  jwtExpire = '7d',
  pool,
  skipDb = false
}) {
  function generateToken(user) {
    return jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        shop_id: user.shop_id || null,
        shop_name: user.shop_name || null
      },
      jwtSecret,
      { expiresIn: jwtExpire }
    );
  }

  function verifyToken(token) {
    try {
      return jwt.verify(token, jwtSecret);
    } catch (error) {
      return null;
    }
  }

  async function loadUserAuthContextByUsername(username) {
    if (skipDb || !pool || !username) return null;
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute(
        `SELECT u.id, u.username, u.role, u.shop_id, u.managed_by, u.created_by,
                u.shop_name AS legacy_shop_name, u.shop_address AS legacy_shop_address, u.shop_description AS legacy_shop_description,
                s.name AS shop_name, s.address AS shop_address, s.description AS shop_description, s.status AS shop_status
         FROM users u
         LEFT JOIN shops s ON s.id = u.shop_id
         WHERE u.username = ?
         LIMIT 1`,
        [username]
      );
      if (!rows.length) return null;
      const row = rows[0];
      return {
        id: Number(row.id),
        username: row.username,
        role: row.role,
        shop_id: row.shop_id == null ? null : Number(row.shop_id),
        managed_by: row.managed_by || null,
        created_by: row.created_by || null,
        shop_name: row.shop_name || row.legacy_shop_name || null,
        shop_address: row.shop_address || row.legacy_shop_address || null,
        shop_description: row.shop_description || row.legacy_shop_description || null,
        shop_status: row.shop_status || null
      };
    } finally {
      if (conn) conn.release();
    }
  }

  async function authenticateToken(req, res, next) {
    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: '未提供認證令牌' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, message: '認證令牌無效或已過期' });
    }

    if (!skipDb && decoded.username) {
      try {
        const userContext = await loadUserAuthContextByUsername(decoded.username);
        if (!userContext) {
          return res.status(401).json({ success: false, message: '此帳號已不存在或無法使用' });
        }
        req.user = userContext;
        return next();
      } catch (err) {
        console.error('載入登入者商家範圍失敗:', err);
        return res.status(500).json({ success: false, message: '載入登入資訊失敗' });
      }
    }

    req.user = decoded;
    return next();
  }

  function authenticateTokenCompat(req, res, next) {
    return authenticateToken(req, res, next);
  }

  function getOptionalTokenUser(req) {
    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    return verifyToken(token);
  }

  function requireRole(...allowedRoles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ success: false, message: '未認證' });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ success: false, message: '權限不足' });
      }

      next();
    };
  }

  return {
    generateToken,
    verifyToken,
    loadUserAuthContextByUsername,
    authenticateToken,
    authenticateTokenCompat,
    getOptionalTokenUser,
    requireRole
  };
}

module.exports = {
  createAuthService
};
