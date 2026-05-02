const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const deletedPaths = [
  '_archive',
  '.venv-rag',
  'venv-embedding',
  'CHANGELOG_RECENT.md',
  'SCORING_ALGORITHM_DOCUMENTATION.md',
  'Dockerfile.embedding',
  'docs/RAG_TUNING_GUIDE.md',
  'docs/FLOWER_COLOR_DESIGN.md',
  'public/js/staff-dashboard-old.js',
  'public/js/admin-users.js',
  'public/js/role-management.js',
  'scripts/cleanup-legacy-content.js',
  'server'
];

for (const relPath of deletedPaths) {
  assert.ok(!exists(relPath), `Phase 5 deleted path must not return: ${relPath}`);
}

const requiredCompatShims = [
  'public/staff-dashboard-old.html',
  'public/staff-dashboard-v2.html',
  'public/admin-users.html',
  'public/admin-user-tasks.html',
  'public/redeem-tasks.html',
  'public/role-management.html'
];

for (const relPath of requiredCompatShims) {
  const source = read(relPath);
  assert.ok(source.includes('staff-dashboard.html'), `${relPath} must keep redirecting to the active dashboard`);
  assert.ok(!source.includes('staff-dashboard-old.js'), `${relPath} must not load deleted staff-dashboard-old.js`);
  assert.ok(!source.includes('admin-users.js'), `${relPath} must not load deleted admin-users.js`);
  assert.ok(!source.includes('role-management.js'), `${relPath} must not load deleted role-management.js`);
}

const manifest = JSON.parse(read('docs/ARCHIVE_MANIFEST.json'));
const nonDeletedArchiveBatches = manifest.batches.filter((batch) => batch.status !== 'deleted');
assert.deepStrictEqual(nonDeletedArchiveBatches, [], 'all archive manifest batches must be deleted after Phase 5 cleanup');

for (const batch of manifest.batches) {
  assert.ok(batch.deletedAt, `deleted batch must record deletedAt: ${batch.key}`);
  for (const relPath of batch.paths) {
    assert.ok(!exists(relPath), `deleted manifest path must not exist: ${relPath}`);
  }
}

const deletionPlan = read('docs/DELETE_ISOLATED_ITEMS_PLAN.md');
assert.ok(deletionPlan.includes('Phase 5 隔離刪除完成紀錄'), 'delete plan must record Phase 5 completion');
assert.ok(deletionPlan.includes('delete-ready-legacy-python-envs'), 'delete plan must mention deleted legacy Python environments');

console.log('Phase 5 cleanup verification passed');
