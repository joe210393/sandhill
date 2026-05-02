const { getCurrentBillingMonth } = require('../services/billing');

function registerShopRoutes(app, {
  pool,
  authenticateToken,
  requireRole,
  normalizeNullableString,
  resolveActorShopId,
  assertActorHasShopScope,
  ensureShopExists,
  sanitizeShopRow
}) {
  app.get('/api/shop/profile', authenticateToken, requireRole('shop', 'admin'), async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const resolvedShopId = await resolveActorShopId(conn, req.user, req.query.shop_id);
      if (!resolvedShopId) {
        return res.status(400).json({ success: false, message: '請指定要查看的 shop_id' });
      }
      const shop = await ensureShopExists(conn, resolvedShopId);
      res.json({ success: true, profile: shop });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/shop/profile', authenticateToken, requireRole('shop', 'admin'), async (req, res) => {
    const { shop_id, shop_name, shop_address, shop_description, contact_name, contact_phone, contact_email, status } = req.body;
    let conn;
    try {
      conn = await pool.getConnection();
      const resolvedShopId = await resolveActorShopId(conn, req.user, shop_id);
      if (!resolvedShopId) {
        return res.status(400).json({ success: false, message: '請指定要更新的 shop_id' });
      }
      await ensureShopExists(conn, resolvedShopId);
      await conn.execute(
        `UPDATE shops
            SET name = ?, address = ?, description = ?, contact_name = ?, contact_phone = ?, contact_email = ?,
                status = COALESCE(?, status)
          WHERE id = ?`,
        [
          normalizeNullableString(shop_name),
          normalizeNullableString(shop_address),
          normalizeNullableString(shop_description),
          normalizeNullableString(contact_name),
          normalizeNullableString(contact_phone),
          normalizeNullableString(contact_email),
          req.user.role === 'admin' ? normalizeNullableString(status) : null,
          resolvedShopId
        ]
      );
      await conn.execute(
        `UPDATE users
            SET shop_name = ?, shop_address = ?, shop_description = ?
          WHERE shop_id = ? AND role = 'shop'`,
        [
          normalizeNullableString(shop_name),
          normalizeNullableString(shop_address),
          normalizeNullableString(shop_description),
          resolvedShopId
        ]
      );
      res.json({ success: true, message: '店家資訊已更新', shop_id: resolvedShopId });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/shops', authenticateToken, requireRole('admin', 'shop', 'staff'), async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const actorShopId = req.user?.role === 'admin' ? null : assertActorHasShopScope(req.user);
      const billingMonth = getCurrentBillingMonth();
      const [rows] = await conn.execute(
        `SELECT s.*,
                owner.username AS owner_username,
                owner.created_by AS builder_username,
                (SELECT COUNT(*) FROM users staff WHERE staff.shop_id = s.id AND staff.role = 'staff') AS staff_count,
                (SELECT COUNT(*) FROM quest_chains qc WHERE qc.shop_id = s.id) AS quest_chain_count,
                COALESCE(asset_summary.total_bytes, 0) AS asset_total_bytes,
                COALESCE(asset_summary.total_files, 0) AS asset_total_files,
                COALESCE(asset_summary.model_count, 0) AS asset_model_count,
                COALESCE(asset_summary.item_count, 0) AS asset_item_count,
                COALESCE(asset_summary.bgm_count, 0) AS asset_bgm_count,
                COALESCE(asset_summary.video_count, 0) AS asset_video_count,
                COALESCE(billing_summary.prompt_tokens, 0) AS billing_prompt_tokens,
                COALESCE(billing_summary.completion_tokens, 0) AS billing_completion_tokens,
                COALESCE(billing_summary.total_tokens, 0) AS billing_total_tokens,
                COALESCE(billing_summary.estimated_amount, 0) AS billing_estimated_amount,
                COALESCE(billing_summary.donated_amount, 0) AS billing_donated_amount,
                ? AS billing_month
         FROM shops s
         LEFT JOIN users owner ON owner.shop_id = s.id AND owner.role = 'shop'
         LEFT JOIN (
           SELECT scoped.shop_id,
                  SUM(scoped.asset_count) AS total_files,
                  SUM(scoped.total_bytes) AS total_bytes,
                  SUM(scoped.model_count) AS model_count,
                  SUM(scoped.item_count) AS item_count,
                  SUM(scoped.bgm_count) AS bgm_count,
                  SUM(scoped.video_count) AS video_count
             FROM (
               SELECT shop_id, COUNT(*) AS asset_count, COALESCE(SUM(file_size), 0) AS total_bytes,
                      COUNT(*) AS model_count, 0 AS item_count, 0 AS bgm_count, 0 AS video_count
                 FROM ar_models
                GROUP BY shop_id
               UNION ALL
               SELECT shop_id, COUNT(*) AS asset_count, COALESCE(SUM(file_size), 0) AS total_bytes,
                      0 AS model_count, COUNT(*) AS item_count, 0 AS bgm_count, 0 AS video_count
                 FROM items
                GROUP BY shop_id
               UNION ALL
               SELECT shop_id, COUNT(*) AS asset_count, COALESCE(SUM(file_size), 0) AS total_bytes,
                      0 AS model_count, 0 AS item_count, COUNT(*) AS bgm_count, 0 AS video_count
                 FROM bgm_library
                GROUP BY shop_id
               UNION ALL
               SELECT shop_id, COUNT(*) AS asset_count, COALESCE(SUM(file_size), 0) AS total_bytes,
                      0 AS model_count, 0 AS item_count, 0 AS bgm_count, COUNT(*) AS video_count
                 FROM video_library
                GROUP BY shop_id
             ) scoped
            GROUP BY scoped.shop_id
         ) asset_summary ON asset_summary.shop_id = s.id
         LEFT JOIN (
           SELECT logs.shop_id,
                  COALESCE(SUM(logs.prompt_tokens), 0) AS prompt_tokens,
                  COALESCE(SUM(logs.completion_tokens), 0) AS completion_tokens,
                  COALESCE(SUM(logs.total_tokens), 0) AS total_tokens,
                  COALESCE(SUM(CASE
                    WHEN COALESCE(qc.billing_policy, 'commercial') = 'public_good' THEN 0
                    WHEN COALESCE(qc.monthly_billing_enabled, TRUE) THEN (logs.total_tokens / 1000) * COALESCE(ep.token_price_per_1k, 0)
                    ELSE 0
                  END), 0) AS estimated_amount,
                  COALESCE(SUM(CASE
                    WHEN COALESCE(qc.billing_policy, 'commercial') = 'public_good'
                      THEN (logs.total_tokens / 1000) * COALESCE(ep.token_price_per_1k, 0)
                    ELSE 0
                  END), 0) AS donated_amount
             FROM llm_usage_logs logs
             LEFT JOIN quest_chains qc ON qc.id = logs.quest_chain_id
             LEFT JOIN entry_plans ep ON ep.id = qc.plan_id
            WHERE DATE_FORMAT(logs.created_at, '%Y-%m') = ?
            GROUP BY logs.shop_id
         ) billing_summary ON billing_summary.shop_id = s.id
         WHERE (? = 'admin' OR s.id = ?)
         ORDER BY s.created_at DESC, s.id DESC`,
        [billingMonth, billingMonth, req.user?.role || '', actorShopId]
      );
      res.json({ success: true, shops: rows.map((row) => sanitizeShopRow(row)) });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入商家列表失敗' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  registerShopRoutes
};
