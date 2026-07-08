const {
  normalizeBillingMonth,
  getBillingMonthRange,
  roundCurrencyValue,
  normalizeBillingPolicy,
  calculateBillingAmounts
} = require('../services/billing');

function registerBillingRoutes(app, {
  pool,
  authenticateToken,
  requireRole,
  resolveActorShopId,
  normalizeBoolean,
  reconcileLlmUsageMonthlySummary
}) {
  app.get('/api/billing/shops', authenticateToken, requireRole('admin', 'shop', 'staff'), async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const billingMonth = normalizeBillingMonth(req.query.billing_month);
      const resolvedShopId = await resolveActorShopId(conn, req.user, req.query.shop_id);
      const params = [billingMonth];
      let whereClause = '';
      if (resolvedShopId) {
        whereClause = 'WHERE s.id = ?';
        params.push(resolvedShopId);
      }
      const [rows] = await conn.execute(
        `SELECT s.id,
                s.name,
                s.owner_username,
                COUNT(DISTINCT qc.id) AS entry_count,
                SUM(CASE WHEN qc.is_active THEN 1 ELSE 0 END) AS active_entry_count,
                SUM(CASE WHEN qc.billing_policy = 'public_good' THEN 1 ELSE 0 END) AS public_good_entry_count,
                COALESCE(SUM(summary.prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(summary.completion_tokens), 0) AS completion_tokens,
                COALESCE(SUM(summary.total_tokens), 0) AS total_tokens,
                COALESCE(SUM(summary.estimated_amount), 0) AS estimated_amount,
                COALESCE(SUM(summary.donated_amount), 0) AS donated_amount,
                COALESCE(SUM(CASE WHEN qc.billing_policy = 'public_good' THEN COALESCE(qc.setup_fee, 0) ELSE 0 END), 0) AS donated_setup_fee_amount,
                COALESCE(setup.pending_amount, 0) AS setup_fee_pending_amount,
                COALESCE(setup.paid_amount, 0) AS setup_fee_paid_amount
         FROM shops s
         LEFT JOIN quest_chains qc ON qc.shop_id = s.id
         LEFT JOIN llm_usage_monthly_summary summary
                ON summary.shop_id = s.id
               AND summary.quest_chain_id = qc.id
               AND summary.billing_month = ?
         LEFT JOIN (
           SELECT ebr.shop_id,
                  SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS pending_amount,
                  SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid_amount
           FROM entry_billing_records ebr
           LEFT JOIN quest_chains qc ON qc.id = ebr.quest_chain_id
           WHERE COALESCE(qc.billing_policy, 'commercial') <> 'public_good'
           GROUP BY ebr.shop_id
         ) setup ON setup.shop_id = s.id
         ${whereClause}
         GROUP BY s.id, s.name, s.owner_username, setup.pending_amount, setup.paid_amount
         ORDER BY estimated_amount DESC, total_tokens DESC, s.id DESC`,
        params
      );
      res.json({
        success: true,
        billing_month: billingMonth,
        shops: rows.map((row) => ({
          id: Number(row.id),
          name: row.name || `商家 #${row.id}`,
          owner_username: row.owner_username || null,
          entry_count: Number(row.entry_count || 0),
          active_entry_count: Number(row.active_entry_count || 0),
          public_good_entry_count: Number(row.public_good_entry_count || 0),
          prompt_tokens: Number(row.prompt_tokens || 0),
          completion_tokens: Number(row.completion_tokens || 0),
          total_tokens: Number(row.total_tokens || 0),
          estimated_amount: roundCurrencyValue(row.estimated_amount || 0),
          donated_amount: roundCurrencyValue(row.donated_amount || 0),
          donated_setup_fee_amount: roundCurrencyValue(row.donated_setup_fee_amount || 0),
          setup_fee_pending_amount: roundCurrencyValue(row.setup_fee_pending_amount || 0),
          setup_fee_paid_amount: roundCurrencyValue(row.setup_fee_paid_amount || 0)
        }))
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入商店總帳失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/entry-plans', authenticateToken, requireRole('admin', 'shop', 'staff'), async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const includeInactive = req.user?.role === 'admin' && req.query.include_inactive === '1';
      const [rows] = await conn.execute(
        `SELECT * FROM entry_plans
         ${includeInactive ? '' : 'WHERE is_active = TRUE'}
         ORDER BY task_limit ASC, id ASC`
      );
      res.json({ success: true, plans: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '載入方案列表失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/entry-plans', authenticateToken, requireRole('admin'), async (req, res) => {
    const { code, name, task_limit, setup_fee, monthly_base_fee, token_price_per_1k, is_active } = req.body || {};
    if (!name || !task_limit) {
      return res.status(400).json({ success: false, message: '方案名稱與關卡上限為必填' });
    }
    const finalCode = code || `plan_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    let conn;
    try {
      conn = await pool.getConnection();
      const [result] = await conn.execute(
        `INSERT INTO entry_plans
          (code, name, task_limit, setup_fee, monthly_base_fee, token_price_per_1k, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          finalCode,
          String(name).trim(),
          Number(task_limit) || 0,
          Number(setup_fee || 0),
          Number(monthly_base_fee || 0),
          Number(token_price_per_1k || 0),
          is_active == null ? true : normalizeBoolean(is_active)
        ]
      );
      res.json({ success: true, message: '方案建立成功', id: result.insertId, code: finalCode });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '建立方案失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/entry-plans/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { name, task_limit, setup_fee, monthly_base_fee, token_price_per_1k, is_active } = req.body || {};
    if (!name || !task_limit) {
      return res.status(400).json({ success: false, message: '方案名稱與關卡上限為必填' });
    }
    let conn;
    try {
      conn = await pool.getConnection();
      const [existing] = await conn.execute('SELECT id FROM entry_plans WHERE id = ? LIMIT 1', [id]);
      if (!existing.length) {
        return res.status(404).json({ success: false, message: '找不到方案' });
      }
      await conn.execute(
        `UPDATE entry_plans
            SET name = ?, task_limit = ?, setup_fee = ?, monthly_base_fee = ?, token_price_per_1k = ?, is_active = ?
          WHERE id = ?`,
        [
          String(name).trim(),
          Number(task_limit) || 0,
          Number(setup_fee || 0),
          Number(monthly_base_fee || 0),
          Number(token_price_per_1k || 0),
          is_active == null ? true : normalizeBoolean(is_active),
          id
        ]
      );
      res.json({ success: true, message: '方案更新成功' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '更新方案失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/billing/overview', authenticateToken, requireRole('admin', 'shop', 'staff'), async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const billingMonth = normalizeBillingMonth(req.query.billing_month);
      const resolvedShopId = await resolveActorShopId(conn, req.user, req.query.shop_id);
      const shopFilterClause = resolvedShopId ? 'WHERE qc.shop_id = ?' : '';
      const shopFilterParams = resolvedShopId ? [resolvedShopId] : [];
      const setupFilterClause = resolvedShopId ? 'WHERE ebr.shop_id = ?' : '';
      const setupFilterParams = resolvedShopId ? [resolvedShopId] : [];

      const [entryRows] = await conn.execute(
        `SELECT COUNT(*) AS entry_count,
                COUNT(DISTINCT qc.shop_id) AS shop_count,
                SUM(CASE WHEN qc.is_active THEN 1 ELSE 0 END) AS active_entry_count,
                SUM(CASE WHEN qc.billing_policy = 'public_good' THEN 1 ELSE 0 END) AS public_good_entry_count,
                SUM(CASE WHEN qc.monthly_billing_enabled THEN 1 ELSE 0 END) AS monthly_enabled_entry_count,
                SUM(CASE WHEN summary.is_invoiced THEN 1 ELSE 0 END) AS invoiced_entry_count,
                SUM(CASE WHEN qc.monthly_billing_enabled AND COALESCE(summary.is_invoiced, FALSE) = FALSE THEN 1 ELSE 0 END) AS uninvoiced_entry_count,
                COALESCE(SUM(summary.prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(summary.completion_tokens), 0) AS completion_tokens,
                COALESCE(SUM(summary.total_tokens), 0) AS total_tokens,
                COALESCE(SUM(summary.estimated_amount), 0) AS estimated_amount,
                COALESCE(SUM(summary.donated_amount), 0) AS donated_amount,
                COALESCE(SUM(CASE WHEN qc.billing_policy = 'public_good' THEN COALESCE(qc.setup_fee, 0) ELSE 0 END), 0) AS donated_setup_fee_amount
         FROM quest_chains qc
         LEFT JOIN llm_usage_monthly_summary summary
                ON summary.quest_chain_id = qc.id
               AND summary.shop_id = qc.shop_id
               AND summary.billing_month = ?
         ${shopFilterClause}`,
        [billingMonth, ...shopFilterParams]
      );

      const [setupRows] = await conn.execute(
        `SELECT SUM(CASE WHEN ebr.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
                COALESCE(SUM(CASE WHEN ebr.status = 'pending' THEN ebr.amount ELSE 0 END), 0) AS pending_amount,
                SUM(CASE WHEN ebr.status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
                COALESCE(SUM(CASE WHEN ebr.status = 'paid' THEN ebr.amount ELSE 0 END), 0) AS paid_amount
         FROM entry_billing_records ebr
         LEFT JOIN quest_chains qc ON qc.id = ebr.quest_chain_id
         ${setupFilterClause ? `${setupFilterClause} AND COALESCE(qc.billing_policy, 'commercial') <> 'public_good'` : "WHERE COALESCE(qc.billing_policy, 'commercial') <> 'public_good'"}`,
        setupFilterParams
      );

      const overview = entryRows[0] || {};
      const setup = setupRows[0] || {};
      res.json({
        success: true,
        billing_month: billingMonth,
        overview: {
          entry_count: Number(overview.entry_count || 0),
          shop_count: Number(overview.shop_count || 0),
          active_entry_count: Number(overview.active_entry_count || 0),
          public_good_entry_count: Number(overview.public_good_entry_count || 0),
          monthly_enabled_entry_count: Number(overview.monthly_enabled_entry_count || 0),
          invoiced_entry_count: Number(overview.invoiced_entry_count || 0),
          uninvoiced_entry_count: Number(overview.uninvoiced_entry_count || 0),
          prompt_tokens: Number(overview.prompt_tokens || 0),
          completion_tokens: Number(overview.completion_tokens || 0),
          total_tokens: Number(overview.total_tokens || 0),
          estimated_amount: roundCurrencyValue(overview.estimated_amount || 0),
          donated_amount: roundCurrencyValue(overview.donated_amount || 0),
          donated_setup_fee_amount: roundCurrencyValue(overview.donated_setup_fee_amount || 0),
          setup_fee_pending_count: Number(setup.pending_count || 0),
          setup_fee_pending_amount: roundCurrencyValue(setup.pending_amount || 0),
          setup_fee_paid_count: Number(setup.paid_count || 0),
          setup_fee_paid_amount: roundCurrencyValue(setup.paid_amount || 0)
        }
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入計費總覽失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/billing/entries', authenticateToken, requireRole('admin', 'shop', 'staff'), async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const billingMonth = normalizeBillingMonth(req.query.billing_month);
      if (typeof reconcileLlmUsageMonthlySummary === 'function') {
        try {
          await reconcileLlmUsageMonthlySummary(conn, billingMonth);
        } catch (reconcileErr) {
          console.warn('LM 用量月報補齊失敗，改以現有資料顯示:', reconcileErr?.message || reconcileErr);
        }
      }
      const resolvedShopId = await resolveActorShopId(conn, req.user, req.query.shop_id);
      const queryParams = [billingMonth];
      let whereClause = '';
      if (resolvedShopId) {
        whereClause = 'WHERE qc.shop_id = ?';
        queryParams.push(resolvedShopId);
      }

      const [rows] = await conn.execute(
        `SELECT qc.id,
                qc.title,
                qc.shop_id,
                qc.is_active,
                qc.task_limit,
                qc.setup_fee,
                qc.setup_fee_paid,
                qc.billing_policy,
                qc.monthly_billing_enabled,
                qc.structure_locked_at,
                s.name AS shop_name,
                ep.name AS plan_name,
                ep.monthly_base_fee,
                ep.token_price_per_1k,
                COALESCE(summary.prompt_tokens, 0) AS prompt_tokens,
                COALESCE(summary.completion_tokens, 0) AS completion_tokens,
                COALESCE(summary.total_tokens, 0) AS total_tokens,
                COALESCE(summary.estimated_amount, 0) AS stored_estimated_amount,
                COALESCE(summary.donated_amount, 0) AS stored_donated_amount,
                COALESCE(summary.is_invoiced, FALSE) AS is_invoiced
         FROM quest_chains qc
         LEFT JOIN shops s ON s.id = qc.shop_id
         LEFT JOIN entry_plans ep ON ep.id = qc.plan_id
         LEFT JOIN llm_usage_monthly_summary summary
                ON summary.quest_chain_id = qc.id
               AND summary.shop_id = qc.shop_id
               AND summary.billing_month = ?
         ${whereClause}
         ORDER BY total_tokens DESC, qc.id DESC`,
        queryParams
      );

      const entries = rows.map((row) => {
        const amounts = calculateBillingAmounts({
          billingPolicy: row.billing_policy,
          monthlyBaseFee: row.monthly_base_fee,
          tokenPricePer1k: row.token_price_per_1k,
          totalTokens: row.total_tokens,
          monthlyBillingEnabled: row.monthly_billing_enabled
        });
        return {
          id: Number(row.id),
          title: row.title || '',
          shop_id: row.shop_id == null ? null : Number(row.shop_id),
          shop_name: row.shop_name || null,
          plan_name: row.plan_name || null,
          is_active: Boolean(row.is_active),
          task_limit: row.task_limit == null ? null : Number(row.task_limit),
          setup_fee: Number(row.setup_fee || 0),
          setup_fee_paid: Boolean(row.setup_fee_paid),
          billing_policy: normalizeBillingPolicy(row.billing_policy),
          monthly_billing_enabled: row.monthly_billing_enabled == null ? true : Boolean(row.monthly_billing_enabled),
          structure_locked_at: row.structure_locked_at || null,
          prompt_tokens: Number(row.prompt_tokens || 0),
          completion_tokens: Number(row.completion_tokens || 0),
          total_tokens: Number(row.total_tokens || 0),
          monthly_base_fee: Number(row.monthly_base_fee || 0),
          token_price_per_1k: Number(row.token_price_per_1k || 0),
          estimated_amount: amounts.estimated_amount,
          donated_amount: amounts.donated_amount,
          donated_setup_fee_amount: normalizeBillingPolicy(row.billing_policy) === 'public_good' ? Number(row.setup_fee || 0) : 0,
          stored_estimated_amount: Number(row.stored_estimated_amount || 0),
          stored_donated_amount: Number(row.stored_donated_amount || 0),
          is_invoiced: Boolean(row.is_invoiced)
        };
      });

      res.json({ success: true, billing_month: billingMonth, entries });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入入口月報失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/billing/logs', authenticateToken, requireRole('admin', 'shop', 'staff'), async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const { billingMonth, start, end } = getBillingMonthRange(req.query.billing_month);
      const resolvedShopId = await resolveActorShopId(conn, req.user, req.query.shop_id);
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
      const queryParams = [start, end];
      let whereClause = 'WHERE logs.created_at >= ? AND logs.created_at < ?';
      if (resolvedShopId) {
        whereClause += ' AND logs.shop_id = ?';
        queryParams.push(resolvedShopId);
      }
      const [rows] = await conn.execute(
        `SELECT logs.id,
                logs.shop_id,
                logs.quest_chain_id,
                logs.task_id,
                logs.user_id,
                logs.provider,
                logs.model,
                logs.request_type,
                logs.prompt_tokens,
                logs.completion_tokens,
                logs.total_tokens,
                logs.success,
                logs.created_at,
                qc.title AS quest_chain_title,
                qc.billing_policy,
                qc.monthly_billing_enabled,
                t.name AS task_name,
                s.name AS shop_name,
                u.username AS player_username,
                ep.token_price_per_1k,
                ep.monthly_base_fee
         FROM llm_usage_logs logs
         LEFT JOIN quest_chains qc ON qc.id = logs.quest_chain_id
         LEFT JOIN tasks t ON t.id = logs.task_id
         LEFT JOIN shops s ON s.id = logs.shop_id
         LEFT JOIN users u ON u.id = logs.user_id
         LEFT JOIN entry_plans ep ON ep.id = qc.plan_id
         ${whereClause}
         ORDER BY logs.created_at DESC, logs.id DESC
         LIMIT ${limit}`,
        queryParams
      );

      const logs = rows.map((row) => {
        const amounts = calculateBillingAmounts({
          billingPolicy: row.billing_policy,
          monthlyBaseFee: 0,
          tokenPricePer1k: row.token_price_per_1k,
          totalTokens: row.total_tokens,
          monthlyBillingEnabled: row.monthly_billing_enabled
        });
        return {
          id: Number(row.id),
          shop_id: row.shop_id == null ? null : Number(row.shop_id),
          shop_name: row.shop_name || null,
          quest_chain_id: row.quest_chain_id == null ? null : Number(row.quest_chain_id),
          quest_chain_title: row.quest_chain_title || null,
          task_id: row.task_id == null ? null : Number(row.task_id),
          task_name: row.task_name || null,
          user_id: row.user_id == null ? null : Number(row.user_id),
          player_username: row.player_username || null,
          provider: row.provider || null,
          model: row.model || null,
          request_type: row.request_type || 'unknown',
          prompt_tokens: Number(row.prompt_tokens || 0),
          completion_tokens: Number(row.completion_tokens || 0),
          total_tokens: Number(row.total_tokens || 0),
          token_price_per_1k: Number(row.token_price_per_1k || 0),
          monthly_base_fee: Number(row.monthly_base_fee || 0),
          billing_policy: normalizeBillingPolicy(row.billing_policy),
          monthly_billing_enabled: row.monthly_billing_enabled == null ? true : Boolean(row.monthly_billing_enabled),
          estimated_amount: amounts.estimated_amount,
          donated_amount: amounts.donated_amount,
          success: row.success == null ? true : Boolean(row.success),
          created_at: row.created_at
        };
      });

      res.json({ success: true, billing_month: billingMonth, logs });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入 LM 用量明細失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/billing/daily', authenticateToken, requireRole('admin', 'shop', 'staff'), async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const { billingMonth, start, end } = getBillingMonthRange(req.query.billing_month);
      const resolvedShopId = await resolveActorShopId(conn, req.user, req.query.shop_id);
      const queryParams = [start, end];
      let whereClause = 'WHERE logs.created_at >= ? AND logs.created_at < ?';
      if (resolvedShopId) {
        whereClause += ' AND logs.shop_id = ?';
        queryParams.push(resolvedShopId);
      }

      const [rows] = await conn.execute(
        `SELECT DATE_FORMAT(logs.created_at + INTERVAL 8 HOUR, '%Y-%m-%d') AS day_key,
                logs.shop_id,
                s.name AS shop_name,
                COUNT(*) AS request_count,
                COALESCE(SUM(logs.prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(logs.completion_tokens), 0) AS completion_tokens,
                COALESCE(SUM(logs.total_tokens), 0) AS total_tokens,
                COALESCE(SUM(
                  CASE
                    WHEN COALESCE(qc.monthly_billing_enabled, TRUE) = FALSE THEN 0
                    WHEN COALESCE(qc.billing_policy, 'commercial') = 'public_good'
                      THEN 0
                    ELSE (COALESCE(logs.total_tokens, 0) / 1000) * COALESCE(ep.token_price_per_1k, 0)
                  END
                ), 0) AS estimated_amount,
                COALESCE(SUM(
                  CASE
                    WHEN COALESCE(qc.monthly_billing_enabled, TRUE) = FALSE THEN 0
                    WHEN COALESCE(qc.billing_policy, 'commercial') = 'public_good'
                      THEN (COALESCE(logs.total_tokens, 0) / 1000) * COALESCE(ep.token_price_per_1k, 0)
                    ELSE 0
                  END
                ), 0) AS donated_amount
         FROM llm_usage_logs logs
         LEFT JOIN quest_chains qc ON qc.id = logs.quest_chain_id
         LEFT JOIN entry_plans ep ON ep.id = qc.plan_id
         LEFT JOIN shops s ON s.id = logs.shop_id
         ${whereClause}
         GROUP BY day_key, logs.shop_id, s.name
         ORDER BY day_key ASC, logs.shop_id ASC`,
        queryParams
      );

      const [yearText, monthText] = billingMonth.split('-');
      const year = Number(yearText);
      const month = Number(monthText);
      const daysInMonth = new Date(year, month, 0).getDate();
      const dayKeys = Array.from({ length: daysInMonth }, (_, index) => {
        const day = String(index + 1).padStart(2, '0');
        return `${billingMonth}-${day}`;
      });

      const buildEmptyDay = (dayKey) => ({
        date: dayKey,
        request_count: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        estimated_amount: 0,
        donated_amount: 0
      });

      const totalsMap = new Map(dayKeys.map((dayKey) => [dayKey, buildEmptyDay(dayKey)]));
      const shopsMap = new Map();

      rows.forEach((row) => {
        const dayKey = row.day_key;
        if (!totalsMap.has(dayKey)) return;
        const totalDay = totalsMap.get(dayKey);
        totalDay.request_count += Number(row.request_count || 0);
        totalDay.prompt_tokens += Number(row.prompt_tokens || 0);
        totalDay.completion_tokens += Number(row.completion_tokens || 0);
        totalDay.total_tokens += Number(row.total_tokens || 0);
        totalDay.estimated_amount = roundCurrencyValue(Number(totalDay.estimated_amount || 0) + Number(row.estimated_amount || 0));
        totalDay.donated_amount = roundCurrencyValue(Number(totalDay.donated_amount || 0) + Number(row.donated_amount || 0));

        const shopKey = String(row.shop_id || '');
        if (!shopsMap.has(shopKey)) {
          shopsMap.set(shopKey, {
            shop_id: row.shop_id == null ? null : Number(row.shop_id),
            shop_name: row.shop_name || (row.shop_id == null ? '未指定商店' : `商店 #${row.shop_id}`),
            request_count: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            estimated_amount: 0,
            donated_amount: 0,
            daily: new Map(dayKeys.map((key) => [key, buildEmptyDay(key)]))
          });
        }

        const shopRecord = shopsMap.get(shopKey);
        const shopDay = shopRecord.daily.get(dayKey);
        shopRecord.request_count += Number(row.request_count || 0);
        shopRecord.prompt_tokens += Number(row.prompt_tokens || 0);
        shopRecord.completion_tokens += Number(row.completion_tokens || 0);
        shopRecord.total_tokens += Number(row.total_tokens || 0);
        shopRecord.estimated_amount = roundCurrencyValue(Number(shopRecord.estimated_amount || 0) + Number(row.estimated_amount || 0));
        shopRecord.donated_amount = roundCurrencyValue(Number(shopRecord.donated_amount || 0) + Number(row.donated_amount || 0));

        shopDay.request_count += Number(row.request_count || 0);
        shopDay.prompt_tokens += Number(row.prompt_tokens || 0);
        shopDay.completion_tokens += Number(row.completion_tokens || 0);
        shopDay.total_tokens += Number(row.total_tokens || 0);
        shopDay.estimated_amount = roundCurrencyValue(Number(shopDay.estimated_amount || 0) + Number(row.estimated_amount || 0));
        shopDay.donated_amount = roundCurrencyValue(Number(shopDay.donated_amount || 0) + Number(row.donated_amount || 0));
      });

      const totals = dayKeys.map((dayKey) => totalsMap.get(dayKey));
      const shops = Array.from(shopsMap.values())
        .map((shop) => ({
          shop_id: shop.shop_id,
          shop_name: shop.shop_name,
          request_count: Number(shop.request_count || 0),
          prompt_tokens: Number(shop.prompt_tokens || 0),
          completion_tokens: Number(shop.completion_tokens || 0),
          total_tokens: Number(shop.total_tokens || 0),
          estimated_amount: roundCurrencyValue(shop.estimated_amount || 0),
          donated_amount: roundCurrencyValue(shop.donated_amount || 0),
          daily: dayKeys.map((dayKey) => shop.daily.get(dayKey))
        }))
        .sort((left, right) => Number(right.total_tokens || 0) - Number(left.total_tokens || 0));

      res.json({
        success: true,
        billing_month: billingMonth,
        days: dayKeys,
        totals,
        shops
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入每日 LM 用量圖表失敗' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/entry-billing-records', authenticateToken, requireRole('admin', 'shop', 'staff'), async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const resolvedShopId = await resolveActorShopId(conn, req.user, req.query.shop_id);
      const status = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
      const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 300);
      const params = [];
      const whereParts = [];
      if (resolvedShopId) {
        whereParts.push('ebr.shop_id = ?');
        params.push(resolvedShopId);
      }
      if (status) {
        whereParts.push('ebr.status = ?');
        params.push(status);
      }

      const [rows] = await conn.execute(
        `SELECT ebr.*,
                qc.title AS quest_chain_title,
                qc.billing_policy,
                s.name AS shop_name,
                ep.name AS plan_name
         FROM entry_billing_records ebr
         LEFT JOIN quest_chains qc ON qc.id = ebr.quest_chain_id
         LEFT JOIN shops s ON s.id = ebr.shop_id
         LEFT JOIN entry_plans ep ON ep.id = ebr.plan_id
         ${whereParts.length ? `WHERE ${whereParts.join(' AND ')} AND COALESCE(qc.billing_policy, 'commercial') <> 'public_good'` : "WHERE COALESCE(qc.billing_policy, 'commercial') <> 'public_good'"}
         ORDER BY ebr.created_at DESC, ebr.id DESC
         LIMIT ${limit}`,
        params
      );

      const records = rows.map((row) => ({
        id: Number(row.id),
        quest_chain_id: row.quest_chain_id == null ? null : Number(row.quest_chain_id),
        quest_chain_title: row.quest_chain_title || null,
        shop_id: row.shop_id == null ? null : Number(row.shop_id),
        shop_name: row.shop_name || null,
        plan_id: row.plan_id == null ? null : Number(row.plan_id),
        plan_name: row.plan_name || null,
        billing_type: row.billing_type || 'setup_fee',
        amount: roundCurrencyValue(row.amount || 0),
        status: row.status || 'pending',
        paid_at: row.paid_at || null,
        note: row.note || null,
        created_at: row.created_at
      }));

      res.json({ success: true, records });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '載入建置費紀錄失敗' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  registerBillingRoutes
};
