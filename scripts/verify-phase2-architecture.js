const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');

assert.ok(
  indexSource.trim() === "require('./src/server');",
  'index.js must stay a thin entry that delegates to src/server.js'
);

const requiredRegistrations = [
  'registerAssetRoutes(app',
  'registerQuestChainRoutes(app',
  'registerTaskRoutes(app',
  'registerBoardRoutes(app',
  'registerProductRoutes(app',
  'registerDashboardOpsRoutes(app',
  'registerCouponRoutes(app'
];

for (const registration of requiredRegistrations) {
  assert.ok(appSource.includes(registration), `src/app.js must register ${registration}`);
}

const forbiddenInlineRoutes = [
  "app.get('/api/quest-chains'",
  "app.post('/api/quest-chains'",
  "app.put('/api/quest-chains/:id'",
  "app.patch('/api/quest-chains/:id/structure-lock'",
  "app.delete('/api/quest-chains/:id'",
  "app.get('/api/game-entries'",
  "app.get('/api/tasks'",
  "app.get('/api/tasks/admin'",
  "app.post('/api/tasks'",
  "app.get('/api/tasks/:id'",
  "app.put('/api/tasks/:id'",
  "app.post('/api/tasks/:id/duplicate'",
  "app.get('/api/tasks/:id/delete-impact'",
  "app.delete('/api/tasks/:id'",
  "app.get('/api/board-maps",
  "app.post('/api/board-maps",
  "app.put('/api/board-maps",
  "app.delete('/api/board-maps",
  "app.put('/api/board-tiles",
  "app.delete('/api/board-tiles",
  "app.post('/api/board/session'",
  "app.get('/api/dashboard/ops-snapshot'"
];

for (const route of forbiddenInlineRoutes) {
  assert.ok(!indexSource.includes(route), `index.js must not define ${route} inline`);
  assert.ok(!appSource.includes(route), `src/app.js must not define extracted route ${route} inline`);
}

const expectedRouteFiles = [
  'src/routes/assets.routes.js',
  'src/routes/quest-chains.routes.js',
  'src/routes/tasks.routes.js',
  'src/routes/board.routes.js',
  'src/routes/products.routes.js',
  'src/routes/dashboard-ops.routes.js',
  'src/routes/coupons.routes.js'
];

for (const relativePath of expectedRouteFiles) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} must exist`);
}

console.log('Phase 2 architecture verification passed');
