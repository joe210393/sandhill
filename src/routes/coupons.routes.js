function formatCouponDiscount(row) {
  if (row.discount_amount != null && Number(row.discount_amount) > 0) {
    return `${row.discount_amount} 元`;
  }
  if (row.discount_percent != null && Number(row.discount_percent) > 0) {
    return `${row.discount_percent}%`;
  }
  return '';
}

function couponIsExpired(row) {
  if (!row.expiry_date) return false;
  const end = new Date(row.expiry_date);
  end.setHours(23, 59, 59, 999);
  return Date.now() > end.getTime();
}

function generateCouponCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 10; i += 1) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

function registerCouponRoutes(app, {
  pool,
  shopOrAdminAuth,
  resolveActorShopId,
  actorCanAccessShop,
  getActorShopId
}) {
  app.post('/api/coupons/issue', shopOrAdminAuth, async (req, res) => {
    const body = req.body || {};
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const questChainIdRaw = body.quest_chain_id;
    const questChainId = questChainIdRaw != null && String(questChainIdRaw).trim() !== ''
      ? Number(questChainIdRaw)
      : null;
    const amtRaw = body.discount_amount;
    const pctRaw = body.discount_percent;
    const amt = amtRaw != null && amtRaw !== '' ? Number(amtRaw) : null;
    const pct = pctRaw != null && pctRaw !== '' ? parseInt(pctRaw, 10) : null;
    const hasAmt = Number.isFinite(amt) && amt > 0;
    const hasPct = Number.isFinite(pct) && pct > 0 && pct <= 100;
    let expiryDate = null;
    if (body.expiry_date != null && String(body.expiry_date).trim() !== '') {
      const d = String(body.expiry_date).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return res.status(400).json({ success: false, message: '到期日格式須為 YYYY-MM-DD' });
      }
      expiryDate = d;
    }
    let couponCode = typeof body.coupon_code === 'string' ? body.coupon_code.trim() : '';
    if (!username) {
      return res.status(400).json({ success: false, message: '請填寫玩家手機（帳號）' });
    }
    if (!title || title.length > 255) {
      return res.status(400).json({ success: false, message: '請填寫券名稱（最多 255 字）' });
    }
    if (questChainId == null && ((hasAmt && hasPct) || (!hasAmt && !hasPct))) {
      return res.status(400).json({ success: false, message: '請擇一填寫「折扣金額」或「折扣百分比」（1–100），或改成綁定劇情入口的遊玩券' });
    }
    if (couponCode && !/^[A-Za-z0-9_-]{4,32}$/.test(couponCode)) {
      return res.status(400).json({ success: false, message: '自訂代碼須為 4–32 碼英數、底線或連字號' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const actorShopId = await resolveActorShopId(conn, req.user, body.shop_id);
      if (!actorShopId) {
        return res.status(400).json({ success: false, message: '發放優惠券時必須指定 shop_id' });
      }
      const [users] = await conn.execute(
        'SELECT id, username, role FROM users WHERE username = ? LIMIT 1',
        [username]
      );
      if (users.length === 0) {
        return res.status(404).json({ success: false, message: '找不到此帳號' });
      }
      const u = users[0];
      if (u.role !== 'user') {
        return res.status(400).json({ success: false, message: '僅能發放給一般玩家帳號' });
      }
      let questChainTitle = null;
      if (questChainId != null) {
        if (!Number.isFinite(questChainId) || questChainId <= 0) {
          return res.status(400).json({ success: false, message: '綁定入口格式錯誤' });
        }
        const [chains] = await conn.execute(
          'SELECT id, title, name, shop_id FROM quest_chains WHERE id = ? LIMIT 1',
          [questChainId]
        );
        if (!chains.length) {
          return res.status(404).json({ success: false, message: '找不到要綁定的玩法入口' });
        }
        if (actorShopId && !actorCanAccessShop(req.user, chains[0].shop_id)) {
          return res.status(403).json({ success: false, message: '不可發放其他商家的玩法券' });
        }
        questChainTitle = chains[0].title || chains[0].name || null;
      }
      const discountAmount = hasAmt ? amt : null;
      const discountPercent = hasPct ? pct : null;
      let insertId;
      if (couponCode) {
        const [ins] = await conn.execute(
          `INSERT INTO user_coupons (coupon_code, user_id, shop_id, title, quest_chain_id, discount_amount, discount_percent, expiry_date, is_used, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'active')`,
          [couponCode, u.id, actorShopId, title, questChainId, discountAmount, discountPercent, expiryDate]
        );
        insertId = ins.insertId;
      } else {
        let attempts = 0;
        while (attempts < 8) {
          attempts += 1;
          const code = generateCouponCode();
          try {
            const [ins] = await conn.execute(
              `INSERT INTO user_coupons (coupon_code, user_id, shop_id, title, quest_chain_id, discount_amount, discount_percent, expiry_date, is_used, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'active')`,
              [code, u.id, actorShopId, title, questChainId, discountAmount, discountPercent, expiryDate]
            );
            insertId = ins.insertId;
            couponCode = code;
            break;
          } catch (e) {
            if (e && e.code === 'ER_DUP_ENTRY') continue;
            throw e;
          }
        }
        if (!couponCode) {
          return res.status(500).json({ success: false, message: '產生代碼重試失敗，請稍後再試' });
        }
      }
      res.json({
        success: true,
        message: questChainId ? '已發放遊玩券' : '已發放兌換卷',
        coupon: { id: insertId, coupon_code: couponCode, username: u.username, title, quest_chain_id: questChainId, quest_chain_title: questChainTitle }
      });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: '此優惠券代碼已被使用，請換一組' });
      }
      console.error('coupon issue', err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/coupons/issued', shopOrAdminAuth, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 30));
    const offset = (page - 1) * pageSize;
    let conn;
    try {
      conn = await pool.getConnection();
      const safePageSize = Number(pageSize) || 30;
      const safeOffset = Number(offset) || 0;
      const actorShopId = getActorShopId(req.user);
      const whereSql = req.user?.role === 'admin' ? '' : 'WHERE uc.shop_id = ?';
      const [rows] = await conn.query(
        `SELECT uc.id, uc.coupon_code, uc.title, uc.quest_chain_id, uc.discount_amount, uc.discount_percent, uc.expiry_date,
                uc.is_used, uc.used_at, uc.created_at, u.username AS owner_username,
                qc.title AS quest_chain_title, qc.name AS quest_chain_name
         FROM user_coupons uc
         LEFT JOIN users u ON uc.user_id = u.id
         LEFT JOIN quest_chains qc ON uc.quest_chain_id = qc.id
         ${whereSql}
         ORDER BY uc.created_at DESC
         LIMIT ${safePageSize} OFFSET ${safeOffset}`,
        req.user?.role === 'admin' ? [] : [actorShopId]
      );
      const [[{ total }]] = await conn.execute(
        req.user?.role === 'admin'
          ? 'SELECT COUNT(*) AS total FROM user_coupons'
          : 'SELECT COUNT(*) AS total FROM user_coupons WHERE shop_id = ?',
        req.user?.role === 'admin' ? [] : [actorShopId]
      );
      const coupons = rows.map((r) => ({
        id: r.id,
        coupon_code: r.coupon_code,
        title: r.title,
        quest_chain_id: r.quest_chain_id,
        quest_chain_title: r.quest_chain_title || r.quest_chain_name || null,
        discount_amount: r.discount_amount,
        discount_percent: r.discount_percent,
        discount: formatCouponDiscount(r),
        expiry_date: r.expiry_date,
        is_used: !!r.is_used,
        used_at: r.used_at,
        created_at: r.created_at,
        username: r.owner_username || null,
        status: r.is_used ? 'used' : (couponIsExpired(r) ? 'expired' : 'active')
      }));
      res.json({ success: true, coupons, page, pageSize, total: Number(total) || 0 });
    } catch (err) {
      console.error('coupon issued list', err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/coupons/lookup/:code', shopOrAdminAuth, async (req, res) => {
    const raw = req.params.code || '';
    const code = decodeURIComponent(raw).trim();
    if (!code) {
      return res.status(400).json({ success: false, message: '請提供優惠券代碼' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      const actorShopId = getActorShopId(req.user);
      const [rows] = await conn.execute(
        `SELECT uc.*, u.username AS owner_username
         FROM user_coupons uc
         LEFT JOIN users u ON uc.user_id = u.id
         WHERE LOWER(TRIM(uc.coupon_code)) = LOWER(?)
           AND (? = 'admin' OR uc.shop_id = ?)`,
        [code, req.user?.role || '', actorShopId]
      );
      if (rows.length === 0) {
        return res.json({ success: false, message: '查無此券' });
      }
      const row = rows[0];
      const expired = couponIsExpired(row);
      const status = row.is_used ? 'used' : (expired ? 'expired' : 'active');
      const coupon = {
        id: row.id,
        coupon_code: row.coupon_code,
        title: row.title,
        username: row.owner_username || null,
        status,
        is_used: !!row.is_used,
        discount_amount: row.discount_amount,
        discount_percent: row.discount_percent,
        discount: formatCouponDiscount(row),
        expiry_date: row.expiry_date
      };
      res.json({ success: true, coupon });
    } catch (err) {
      console.error('coupon lookup', err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/coupons/:id/redeem', shopOrAdminAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const staffUser = req.user.username;
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: '無效的優惠券 ID' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      const actorShopId = getActorShopId(req.user);
      const [rows] = await conn.execute(
        `SELECT * FROM user_coupons
         WHERE id = ?
           AND (? = 'admin' OR shop_id = ?)`,
        [id, req.user?.role || '', actorShopId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: '優惠券不存在' });
      }
      const row = rows[0];
      if (row.is_used) {
        return res.status(400).json({ success: false, message: '此券已使用' });
      }
      if (couponIsExpired(row)) {
        return res.status(400).json({ success: false, message: '此券已過期' });
      }
      await conn.execute(
        'UPDATE user_coupons SET is_used = 1, used_at = NOW(), used_by = ? WHERE id = ? AND is_used = 0',
        [staffUser, id]
      );
      res.json({ success: true, message: '核銷成功' });
    } catch (err) {
      console.error('coupon redeem', err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/coupons/redeem-history', shopOrAdminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const actorShopId = getActorShopId(req.user);
      const [rows] = await conn.execute(
        `SELECT uc.coupon_code, uc.title, uc.used_at AS redeemed_at,
                COALESCE(u.username, '') AS username
         FROM user_coupons uc
         LEFT JOIN users u ON uc.user_id = u.id
         WHERE uc.is_used = 1 AND DATE(uc.used_at) = CURDATE()
           AND (? = 'admin' OR uc.shop_id = ?)
         ORDER BY uc.used_at DESC
         LIMIT 100`,
        [req.user?.role || '', actorShopId]
      );
      const history = rows.map((r) => ({
        coupon_code: r.coupon_code,
        title: r.title,
        username: r.username,
        redeemed_at: r.redeemed_at,
        coupon_title: r.title
      }));
      res.json({ success: true, history });
    } catch (err) {
      console.error('coupon redeem-history', err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  registerCouponRoutes,
  couponIsExpired,
  formatCouponDiscount,
  generateCouponCode
};
