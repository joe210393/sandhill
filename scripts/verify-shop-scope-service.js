const assert = require('assert/strict');
const {
  actorHasShopScope,
  getActorShopId,
  actorCanAccessShop,
  assertActorHasShopScope,
  createShopScopeService
} = require('../src/services/shop-scope');

async function main() {
  const admin = { role: 'admin' };
  const shop = { role: 'shop', shop_id: 5 };
  const staff = { role: 'staff', shop_id: '5' };
  const user = { role: 'user', shop_id: 5 };
  const unscopedShop = { role: 'shop', shop_id: null };

  assert.equal(actorHasShopScope(admin), false);
  assert.equal(actorHasShopScope(shop), true);
  assert.equal(actorHasShopScope(staff), true);
  assert.equal(actorHasShopScope(user), false);

  assert.equal(getActorShopId(shop), 5);
  assert.equal(getActorShopId(staff), 5);
  assert.equal(getActorShopId(unscopedShop), null);

  assert.equal(actorCanAccessShop(admin, 999), true);
  assert.equal(actorCanAccessShop(shop, 5), true);
  assert.equal(actorCanAccessShop(staff, 5), true);
  assert.equal(actorCanAccessShop(staff, 6), false);
  assert.equal(actorCanAccessShop(user, 5), true);

  assert.equal(assertActorHasShopScope(shop), 5);
  assert.equal(assertActorHasShopScope(staff), 5);
  assert.throws(() => assertActorHasShopScope(admin), /此帳號尚未綁定商家範圍/);
  assert.throws(() => assertActorHasShopScope(unscopedShop), /此帳號尚未綁定商家範圍/);

  const executed = [];
  const conn = {
    async execute(sql, params) {
      executed.push({ sql, params });
      if (params[0] === 404) return [[]];
      return [[{ id: params[0], name: '測試商家' }]];
    }
  };
  const scope = createShopScopeService({
    sanitizeShopRow(row) {
      return { id: Number(row.id), name: row.name };
    }
  });

  assert.deepEqual(await scope.ensureShopExists(conn, 12), { id: 12, name: '測試商家' });
  assert.equal(await scope.resolveActorShopId(conn, admin, 13), 13);
  assert.equal(await scope.resolveActorShopId(conn, admin), null);
  assert.equal(await scope.resolveActorShopId(conn, shop), 5);
  await assert.rejects(() => scope.ensureShopExists(conn, 0), /無效的 shop_id/);
  await assert.rejects(() => scope.ensureShopExists(conn, 404), /找不到指定商家/);
  assert.equal(executed.length, 3);

  console.log('Shop scope service verification passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
