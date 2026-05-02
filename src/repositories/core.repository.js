const { getTableColumnSet, insertDynamicRecord, updateDynamicRecord, assertValidIdentifier } = require('../db/core-helpers'); // Assumed path

async function getUserIdByUsername(conn, username) {
  const [users] = await conn.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  return users[0]?.id || null;
}

async function hasQuestChainCouponAccess(conn, userId, questChainId) {
  if (!userId || !questChainId) return false;
  const couponColumns = await getTableColumnSet(conn, 'user_coupons');
  if (!couponColumns.has('quest_chain_id')) return false;
  const statusExpr = couponColumns.has('status') ? "AND (status IS NULL OR status = 'active')" : '';
  const expiryExpr = couponColumns.has('expiry_date') ? 'AND (expiry_date IS NULL OR expiry_date >= CURDATE())' : '';
  const [rows] = await conn.execute(
    `SELECT id
       FROM user_coupons
      WHERE user_id = ?
        AND quest_chain_id = ?
        ${statusExpr}
        ${expiryExpr}
      ORDER BY id DESC
      LIMIT 1`,
    [userId, questChainId]
  );
  return rows.length > 0;
}

module.exports = {
  getUserIdByUsername,
  hasQuestChainCouponAccess
};
