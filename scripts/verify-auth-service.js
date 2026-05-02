const assert = require('assert/strict');
const { createAuthService } = require('../src/services/auth');

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function runMiddleware(middleware, req) {
  const res = createMockResponse();
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

async function main() {
  const auth = createAuthService({
    jwtSecret: 'verify-auth-secret',
    jwtExpire: '1h',
    pool: null,
    skipDb: true
  });

  const user = { id: 7, username: 'shop-owner', role: 'shop', shop_id: 3, shop_name: '測試商店' };
  const token = auth.generateToken(user);
  const decoded = auth.verifyToken(token);
  assert.equal(decoded.id, user.id);
  assert.equal(decoded.username, user.username);
  assert.equal(decoded.role, user.role);
  assert.equal(decoded.shop_id, user.shop_id);
  assert.equal(decoded.shop_name, user.shop_name);

  assert.equal(auth.verifyToken('bad-token'), null);

  const missingTokenResult = await runMiddleware(auth.authenticateToken, {
    cookies: {},
    headers: {}
  });
  assert.equal(missingTokenResult.nextCalled, false);
  assert.equal(missingTokenResult.res.statusCode, 401);
  assert.equal(missingTokenResult.res.body.message, '未提供認證令牌');

  const validTokenReq = {
    cookies: {},
    headers: { authorization: `Bearer ${token}` }
  };
  const validTokenResult = await runMiddleware(auth.authenticateToken, validTokenReq);
  assert.equal(validTokenResult.nextCalled, true);
  assert.equal(validTokenReq.user.username, user.username);

  const adminOnly = auth.requireRole('admin');
  const forbiddenResult = await runMiddleware(adminOnly, { user: validTokenReq.user });
  assert.equal(forbiddenResult.nextCalled, false);
  assert.equal(forbiddenResult.res.statusCode, 403);
  assert.equal(forbiddenResult.res.body.message, '權限不足');

  const shopAllowed = auth.requireRole('admin', 'shop');
  const allowedResult = await runMiddleware(shopAllowed, { user: validTokenReq.user });
  assert.equal(allowedResult.nextCalled, true);

  console.log('Auth service verification passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
