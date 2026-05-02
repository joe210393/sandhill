function registerProductRoutes(app, {
  pool,
  authenticateToken,
  staffOrAdminAuth,
  assertActorHasShopScope,
  resolveActorShopId,
  assertProductAccess,
  getActorShopId
}) {
  app.get('/api/products', async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();

      const [isActiveCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'is_active'");
      const [createdByCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'created_by'");
      const hasIsActive = isActiveCols.length > 0;
      const hasCreatedBy = createdByCols.length > 0;

      let query;
      if (hasIsActive && hasCreatedBy) {
        query = `SELECT p.*, u.username as creator_username
          FROM products p
          LEFT JOIN users u ON p.created_by = u.username
          WHERE p.is_active = TRUE
          ORDER BY p.points_required ASC`;
      } else if (hasIsActive) {
        query = `SELECT p.*, NULL as creator_username
          FROM products p
          WHERE p.is_active = TRUE
          ORDER BY p.points_required ASC`;
      } else if (hasCreatedBy) {
        query = `SELECT p.*, u.username as creator_username
          FROM products p
          LEFT JOIN users u ON p.created_by = u.username
          ORDER BY p.points_required ASC`;
      } else {
        query = `SELECT p.*, NULL as creator_username
          FROM products p
          ORDER BY p.points_required ASC`;
      }

      const [rows] = await conn.execute(query);
      res.json({ success: true, products: rows });
    } catch (err) {
      console.error('[/api/products] 錯誤:', err);
      res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/products/admin', staffOrAdminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const userRole = req.user?.role;
      let query = 'SELECT * FROM products';
      const params = [];
      if (userRole !== 'admin') {
        query += ' WHERE shop_id = ?';
        params.push(assertActorHasShopScope(req.user));
      }
      query += ' ORDER BY created_at DESC';

      const [rows] = await conn.execute(query, params);
      res.json({ success: true, products: rows, userRole });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/products', staffOrAdminAuth, async (req, res) => {
    const { name, description, image_url, points_required, stock, is_active } = req.body;
    if (!name || !points_required || stock === undefined) {
      return res.status(400).json({ success: false, message: '缺少必要參數' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const actorShopId = await resolveActorShopId(conn, req.user, req.body.shop_id);
      if (!actorShopId) {
        return res.status(400).json({ success: false, message: '建立商品時必須指定 shop_id' });
      }
      const [result] = await conn.execute(
        `INSERT INTO products
          (name, description, image_url, points_required, stock, created_by, shop_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          description || '',
          image_url || '',
          points_required,
          stock,
          req.user?.username || null,
          actorShopId,
          is_active !== undefined ? is_active : true
        ]
      );
      res.json({ success: true, message: '商品新增成功', productId: result.insertId });
    } catch (err) {
      console.error('[/api/products POST] 錯誤:', err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/products/:id', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    const { name, description, image_url, points_required, stock, is_active } = req.body;
    if (!name || !points_required || stock === undefined) {
      return res.status(400).json({ success: false, message: '缺少必要參數' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await assertProductAccess(conn, req.user, id);

      await conn.execute(
        'UPDATE products SET name = ?, description = ?, image_url = ?, points_required = ?, stock = ?, is_active = ? WHERE id = ?',
        [name, description || '', image_url || '', points_required, stock, is_active !== undefined ? is_active : true, id]
      );
      res.json({ success: true, message: '商品更新成功' });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.delete('/api/products/:id', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    let conn;
    try {
      conn = await pool.getConnection();
      await assertProductAccess(conn, req.user, id);

      await conn.execute('DELETE FROM products WHERE id = ?', [id]);
      res.json({ success: true, message: '商品刪除成功' });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/products/redemptions', authenticateToken, async (req, res) => {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ success: false, message: '未認證' });
    }
    const username = req.user.username;

    let conn;
    try {
      conn = await pool.getConnection();
      const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (users.length === 0) {
        return res.status(400).json({ success: false, message: '用戶不存在' });
      }
      const userId = users[0].id;

      const [rows] = await conn.execute(`
        SELECT pr.*, p.id as product_id, p.name as product_name, p.image_url
        FROM product_redemptions pr
        JOIN products p ON pr.product_id = p.id
        WHERE pr.user_id = ?
        ORDER BY pr.redeemed_at DESC
      `, [userId]);

      res.json({ success: true, redemptions: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/products/:id/redeem', authenticateToken, async (req, res) => {
    const { id } = req.params;
    if (!req.user || !req.user.username) {
      return res.status(401).json({ success: false, message: '未認證' });
    }
    const username = req.user.username;

    let conn;
    try {
      conn = await pool.getConnection();

      const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (users.length === 0) {
        return res.status(400).json({ success: false, message: '用戶不存在' });
      }
      const userId = users[0].id;

      const [isActiveCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'is_active'");
      const hasIsActive = isActiveCols.length > 0;

      let products;
      if (hasIsActive) {
        [products] = await conn.execute('SELECT * FROM products WHERE id = ? AND is_active = TRUE', [id]);
      } else {
        [products] = await conn.execute('SELECT * FROM products WHERE id = ?', [id]);
      }
      if (products.length === 0) {
        return res.status(400).json({ success: false, message: '商品不存在或已下架' });
      }
      const product = products[0];

      if (product.stock <= 0) {
        return res.status(400).json({ success: false, message: '商品已售完' });
      }

      const [userPointsResult] = await conn.execute(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'earned' THEN points ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN type = 'spent' THEN points ELSE 0 END), 0) as total_points
        FROM point_transactions
        WHERE user_id = ?
      `, [userId]);

      const totalPoints = userPointsResult[0].total_points || 0;

      if (totalPoints < product.points_required) {
        return res.status(400).json({ success: false, message: `積分不足，需要 ${product.points_required} 積分，您目前有 ${totalPoints} 積分` });
      }

      await conn.beginTransaction();

      try {
        await conn.execute('UPDATE products SET stock = stock - 1 WHERE id = ?', [id]);

        const [redemptionResult] = await conn.execute(
          'INSERT INTO product_redemptions (user_id, product_id, points_used, status) VALUES (?, ?, ?, ?)',
          [userId, id, product.points_required, 'pending']
        );

        await conn.execute(
          'INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'spent', product.points_required, `兌換商品: ${product.name}`, 'product_redemption', redemptionResult.insertId]
        );

        await conn.commit();
        res.json({ success: true, message: '商品兌換成功！請等待工作人員確認。' });
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/user/points', authenticateToken, async (req, res) => {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ success: false, message: '未認證' });
    }
    const username = req.user.username;

    let conn;
    try {
      conn = await pool.getConnection();

      const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (users.length === 0) {
        return res.status(400).json({ success: false, message: '用戶不存在' });
      }
      const userId = users[0].id;

      const [result] = await conn.execute(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'earned' THEN points ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN type = 'spent' THEN points ELSE 0 END), 0) as total_points
        FROM point_transactions
        WHERE user_id = ?
      `, [userId]);

      res.json({ success: true, totalPoints: result[0].total_points || 0 });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.get('/api/product-redemptions/admin', staffOrAdminAuth, async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      const userRole = req.user?.role;
      let query;
      let params;

      if (userRole === 'admin') {
        query = `
          SELECT pr.*, p.name as product_name, p.image_url, p.created_by as merchant_name, u.username
          FROM product_redemptions pr
          JOIN products p ON pr.product_id = p.id
          JOIN users u ON pr.user_id = u.id
          ORDER BY pr.redeemed_at DESC
        `;
        params = [];
      } else {
        query = `
          SELECT pr.*, p.name as product_name, p.image_url, p.created_by as merchant_name, u.username
          FROM product_redemptions pr
          JOIN products p ON pr.product_id = p.id
          JOIN users u ON pr.user_id = u.id
          WHERE p.shop_id = ?
          ORDER BY pr.redeemed_at DESC
        `;
        params = [assertActorHasShopScope(req.user)];
      }

      const [rows] = await conn.execute(query, params);
      res.json({ success: true, redemptions: rows });
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.put('/api/product-redemptions/:id/status', staffOrAdminAuth, async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!['completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: '無效的狀態' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const actorShopId = getActorShopId(req.user);
      const [redemptions] = await conn.execute(
        `SELECT pr.*, p.name as product_name, p.shop_id, p.created_by
         FROM product_redemptions pr
         JOIN products p ON pr.product_id = p.id
         WHERE pr.id = ?
           AND (? = 'admin' OR p.shop_id = ?)`,
        [id, req.user?.role || '', actorShopId]
      );

      if (redemptions.length === 0) {
        return res.status(404).json({ success: false, message: '兌換記錄不存在或無權限處理' });
      }

      const redemption = redemptions[0];
      const productName = redemption.product_name;

      await conn.beginTransaction();

      try {
        await conn.execute(
          'UPDATE product_redemptions SET status = ?, notes = ? WHERE id = ?',
          [status, notes || '', id]
        );

        if (status === 'cancelled') {
          await conn.execute(
            'UPDATE products SET stock = stock + 1 WHERE id = ?',
            [redemption.product_id]
          );

          await conn.execute(
            'INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
            [redemption.user_id, 'earned', redemption.points_used, `取消兌換退還積分: ${productName}`, 'redemption_cancelled', redemption.id]
          );
        }

        await conn.commit();
        res.json({ success: true, message: status === 'completed' ? '兌換已完成' : '兌換已取消' });
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(err.statusCode || 500).json({ success: false, message: err.message || '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = { registerProductRoutes };
