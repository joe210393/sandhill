'use strict';

/**
 * 營運總覽聚合快照：單一 round-trip，依角色套用 shop / 全平台範圍。
 * 指標為產品定稿 8 項；Admin 另附 shopsTotal、entryPlansActive、storage 摘要於 meta。
 */
function registerDashboardOpsRoutes(app, {
  pool,
  staffOrAdminAuth,
  assertActorHasShopScope,
  getSharedAssetStorageSummary
}) {
  app.get('/api/dashboard/ops-snapshot', staffOrAdminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const role = req.user?.role || '';
      const isAdmin = role === 'admin';
      const shopId = isAdmin ? null : assertActorHasShopScope(req.user);

      const qcWhere = isAdmin ? '' : 'WHERE qc.shop_id = ?';
      const qcParams = isAdmin ? [] : [shopId];

      const countOne = async (sql, params = []) => {
        const [[row]] = await conn.execute(sql, params);
        return Number(row?.n ?? 0);
      };

      const questEntries = await countOne(
        `SELECT COUNT(*) AS n FROM quest_chains qc ${qcWhere}`,
        qcParams
      );
      const questPublished = await countOne(
        `SELECT COUNT(*) AS n FROM quest_chains qc ${qcWhere ? `${qcWhere} AND` : 'WHERE'} qc.is_active = 1`,
        qcParams
      );
      const questLocked = await countOne(
        `SELECT COUNT(*) AS n FROM quest_chains qc ${qcWhere ? `${qcWhere} AND` : 'WHERE'} qc.structure_locked_at IS NOT NULL`,
        qcParams
      );

      const tWhere = isAdmin ? '' : 'WHERE t.shop_id = ?';
      const tParams = isAdmin ? [] : [shopId];
      const tasksTotal = await countOne(`SELECT COUNT(*) AS n FROM tasks t ${tWhere}`, tParams);

      const completions30d = await countOne(
        `SELECT COUNT(*) AS n
           FROM user_tasks ut
           INNER JOIN tasks t ON t.id = ut.task_id
          WHERE ut.status = '完成'
            AND ut.finished_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            ${isAdmin ? '' : 'AND t.shop_id = ?'}`,
        isAdmin ? [] : [shopId]
      );

      const bmWhere = isAdmin ? '' : 'WHERE bm.shop_id = ?';
      const bmParams = isAdmin ? [] : [shopId];
      const boardMaps = await countOne(`SELECT COUNT(*) AS n FROM board_maps bm ${bmWhere}`, bmParams);

      const pWhere = isAdmin ? 'WHERE p.is_active = 1' : 'WHERE p.shop_id = ? AND p.is_active = 1';
      const pParams = isAdmin ? [] : [shopId];
      const productsActive = await countOne(`SELECT COUNT(*) AS n FROM products p ${pWhere}`, pParams);

      const redemptionsPending = await countOne(
        `SELECT COUNT(*) AS n
           FROM product_redemptions pr
           INNER JOIN products p ON p.id = pr.product_id
          WHERE pr.status = 'pending'
            ${isAdmin ? '' : 'AND p.shop_id = ?'}`,
        isAdmin ? [] : [shopId]
      );

      const storage = await getSharedAssetStorageSummary(conn, { shopId: isAdmin ? null : shopId });

      let shopsTotal = null;
      let entryPlansActive = null;
      if (isAdmin) {
        shopsTotal = await countOne('SELECT COUNT(*) AS n FROM shops', []);
        entryPlansActive = await countOne('SELECT COUNT(*) AS n FROM entry_plans WHERE is_active = 1', []);
      }

      const metrics = [
        {
          id: 'quest_entries',
          label: '玩法入口',
          value: questEntries,
          hint: 'quest_chains，依商家／全平台範圍'
        },
        {
          id: 'quest_published',
          label: '已發布入口',
          value: questPublished,
          hint: 'is_active 為真'
        },
        {
          id: 'tasks_total',
          label: '關卡總數',
          value: tasksTotal,
          hint: 'tasks 列舉筆數'
        },
        {
          id: 'player_completions_30d',
          label: '近 30 日完成關卡',
          value: completions30d,
          hint: 'user_tasks 完成且 finished_at 於 30 日內'
        },
        {
          id: 'board_maps',
          label: '大富翁棋盤',
          value: boardMaps,
          hint: 'board_maps'
        },
        {
          id: 'products_active',
          label: '上架兌換商品',
          value: productsActive,
          hint: 'products 且 is_active'
        },
        {
          id: 'redemptions_pending',
          label: '待處理兌換',
          value: redemptionsPending,
          hint: 'product_redemptions.status = pending'
        },
        {
          id: 'quest_structure_locked',
          label: '結構已鎖入口',
          value: questLocked,
          hint: 'structure_locked_at 有值'
        }
      ];

      res.json({
        success: true,
        generatedAt: new Date().toISOString(),
        scope: isAdmin ? 'platform' : 'shop',
        actorRole: role,
        shopId: isAdmin ? null : shopId,
        metrics,
        meta: {
          storageBytes: Number(storage?.total_bytes || 0),
          storageFiles: Number(storage?.total_files || 0),
          shopsTotal,
          entryPlansActive
        }
      });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || '載入營運快照失敗'
      });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  registerDashboardOpsRoutes
};
