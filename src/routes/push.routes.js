function createPushNotifier({ pool, webpush, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY }) {
  return async function sendPushNotification(userId, title, body, data = {}) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.warn('⚠️  無法發送推送通知: VAPID 金鑰未配置');
      return;
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const [subscriptions] = await conn.execute(
        'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
        [userId]
      );

      if (subscriptions.length === 0) {
        return;
      }

      const promises = subscriptions.map(async (sub) => {
        try {
          const subscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          };

          const payload = JSON.stringify({
            title,
            body,
            icon: '/images/mascot.png',
            badge: '/images/flag-red.png',
            vibrate: [100, 50, 100],
            ...data
          });

          await webpush.sendNotification(subscription, payload);
          console.log(`✅ 推送通知已發送給用戶 ${userId}`);
        } catch (err) {
          console.error(`❌ 推送通知發送失敗 (用戶 ${userId}):`, err);

          if (err.statusCode === 410) {
            await conn.execute(
              'DELETE FROM push_subscriptions WHERE endpoint = ?',
              [sub.endpoint]
            );
            console.log(`🗑️  已刪除失效的推送訂閱: ${sub.endpoint}`);
          }
        }
      });

      await Promise.allSettled(promises);
    } catch (err) {
      console.error('發送推送通知時發生錯誤:', err);
    } finally {
      if (conn) conn.release();
    }
  };
}

function registerPushRoutes(app, {
  pool,
  authenticateTokenCompat,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
}) {
  app.get('/api/push/vapid-public-key', (req, res) => {
    if (!VAPID_PUBLIC_KEY) {
      return res.json({
        success: false,
        message: '推送通知服務未配置，請聯繫管理員'
      });
    }
    res.json({ success: true, publicKey: VAPID_PUBLIC_KEY });
  });

  app.post('/api/push/subscribe', authenticateTokenCompat, async (req, res) => {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(503).json({
        success: false,
        message: '推送通知服務未配置'
      });
    }

    const username = req.user?.username;
    if (!username) {
      return res.status(401).json({ success: false, message: '未登入' });
    }

    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ success: false, message: '無效的訂閱資訊' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (users.length === 0) {
        return res.status(404).json({ success: false, message: '用戶不存在' });
      }
      const userId = users[0].id;

      await conn.execute(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           p256dh = VALUES(p256dh),
           auth = VALUES(auth),
           updated_at = NOW()`,
        [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
      );

      res.json({ success: true, message: '推送訂閱成功' });
    } catch (err) {
      console.error('推送訂閱失敗:', err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });

  app.post('/api/push/unsubscribe', authenticateTokenCompat, async (req, res) => {
    const username = req.user?.username;
    if (!username) {
      return res.status(401).json({ success: false, message: '未登入' });
    }

    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ success: false, message: '缺少 endpoint' });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (users.length === 0) {
        return res.status(404).json({ success: false, message: '用戶不存在' });
      }
      const userId = users[0].id;

      await conn.execute(
        'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
        [userId, endpoint]
      );

      res.json({ success: true, message: '已取消推送訂閱' });
    } catch (err) {
      console.error('取消訂閱失敗:', err);
      res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });
}

module.exports = {
  createPushNotifier,
  registerPushRoutes
};
