function actorHasShopScope(actor) {
  return actor?.role === 'shop' || actor?.role === 'staff';
}

function getActorShopId(actor) {
  return actor?.shop_id == null ? null : Number(actor.shop_id);
}

function actorCanAccessShop(actor, shopId) {
  if (actor?.role === 'admin') return true;
  const actorShopId = getActorShopId(actor);
  return Number.isFinite(actorShopId) && Number(actorShopId) === Number(shopId);
}

function assertActorHasShopScope(actor) {
  const shopId = getActorShopId(actor);
  if (!actorHasShopScope(actor) || !Number.isFinite(shopId) || shopId <= 0) {
    const err = new Error('此帳號尚未綁定商家範圍');
    err.statusCode = 403;
    throw err;
  }
  return shopId;
}

function createShopScopeService({ sanitizeShopRow }) {
  async function ensureShopExists(conn, shopId) {
    const numericShopId = Number(shopId);
    if (!Number.isFinite(numericShopId) || numericShopId <= 0) {
      const err = new Error('無效的 shop_id');
      err.statusCode = 400;
      throw err;
    }
    const [rows] = await conn.execute('SELECT * FROM shops WHERE id = ? LIMIT 1', [numericShopId]);
    if (!rows.length) {
      const err = new Error('找不到指定商家');
      err.statusCode = 404;
      throw err;
    }
    return sanitizeShopRow(rows[0]);
  }

  async function resolveActorShopId(conn, actor, explicitShopId = null) {
    if (actor?.role === 'admin') {
      if (explicitShopId == null || String(explicitShopId).trim() === '') return null;
      const shop = await ensureShopExists(conn, explicitShopId);
      return shop.id;
    }
    return assertActorHasShopScope(actor);
  }

  return {
    ensureShopExists,
    resolveActorShopId
  };
}

module.exports = {
  actorHasShopScope,
  getActorShopId,
  actorCanAccessShop,
  assertActorHasShopScope,
  createShopScopeService
};
