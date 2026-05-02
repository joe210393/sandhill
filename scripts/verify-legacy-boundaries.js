const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pkg = JSON.parse(read('package.json'));
const scripts = pkg.scripts || {};
const removedRagScripts = [
  'clean:plant-data',
  'dedup:plant-data',
  'enrich:plant-data',
  'build:plant-mapping',
  'verify:tlpg'
];

for (const scriptName of removedRagScripts) {
  assert(!scripts[scriptName], `Legacy RAG npm script must stay removed: ${scriptName}`);
}

const coreMiddleware = read('src/middleware/core.js');
assert(!coreMiddleware.includes('gpstask.zeabur.app'), 'Default CORS origins must not include gpstask.zeabur.app');

const envExample = read('env.example');
assert(!envExample.includes('gpstask.zeabur.app'), 'env.example must not advertise gpstask.zeabur.app');
assert(!envExample.includes('SINGLE_PHOTO_MODE'), 'env.example must not advertise legacy plant RAG flags');

const zeabur = read('zeabur.yaml');
assert(!/^\s+gps-task:/m.test(zeabur), 'zeabur.yaml service name must not use legacy gps-task');
assert(!/^\s+embedding-api:/m.test(zeabur), 'zeabur.yaml must not deploy legacy embedding-api by default');
assert(!zeabur.includes('Dockerfile.embedding'), 'zeabur.yaml must not reference legacy Dockerfile.embedding');
assert(!zeabur.includes('gps-task-qdrant'), 'zeabur.yaml must not reference legacy gps-task-qdrant');

const redirectPages = [
  'public/staff-dashboard-old.html',
  'public/staff-dashboard-v2.html',
  'public/admin-users.html',
  'public/admin-user-tasks.html',
  'public/redeem-tasks.html',
  'public/role-management.html'
];

for (const relPath of redirectPages) {
  const html = read(relPath);
  assert(html.includes('staff-dashboard.html'), `${relPath} must remain a thin redirect to staff-dashboard.html`);
  assert(!html.includes('staff-dashboard-old.js'), `${relPath} must not load staff-dashboard-old.js`);
  assert(!html.includes('admin-users.js'), `${relPath} must not load admin-users.js`);
  assert(!html.includes('role-management.js'), `${relPath} must not load role-management.js`);
}

assert(
  fs.existsSync(path.join(ROOT, 'docs/LEGACY_GPS_TASK_AUDIT.md')),
  'Legacy audit memo must exist'
);

console.log('✅ Legacy GPS-TASK/RAG boundaries verified');
