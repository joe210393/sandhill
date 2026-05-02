const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function listFiles(dirRelPath) {
  const dirPath = path.join(root, dirRelPath);
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const result = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const relPath = path.join(dirRelPath, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(relPath));
    } else {
      result.push(relPath.split(path.sep).join('/'));
    }
  }
  return result;
}

assert.ok(exists('docs/ARCHIVE_MANIFEST.json'), 'archive manifest must exist');
assert.ok(exists('docs/DELETE_ISOLATED_ITEMS_PLAN.md'), 'delete isolated items plan must exist');

const manifest = JSON.parse(read('docs/ARCHIVE_MANIFEST.json'));
assert.strictEqual(manifest.lastUpdated, '2026-05-01', 'archive manifest date must be current');
assert.ok(Array.isArray(manifest.batches), 'archive manifest must contain batches');

const allowedTopLevelArchiveDirs = new Set([
  'historical-security',
  'legacy-ad-hoc-tests',
  'legacy-dangerous-scripts',
  'legacy-db-migrations',
  'legacy-db-seeds',
  'legacy-gps-task',
  'legacy-server-shell'
]);
const allowedNonArchiveDeletedPaths = new Set([
  '.venv-rag',
  'venv-embedding'
]);

if (exists('_archive')) {
  const archiveRootEntries = fs.readdirSync(path.join(root, '_archive'), { withFileTypes: true });
  for (const entry of archiveRootEntries) {
    assert.ok(entry.isDirectory(), `_archive top level must contain grouped directories only: ${entry.name}`);
    assert.ok(allowedTopLevelArchiveDirs.has(entry.name), `_archive has unknown top-level group: ${entry.name}`);
  }
}

const manifestPaths = new Set();
const manifestDirPaths = new Set();
const allowedStatuses = new Set([
  'ready_for_deletion_review',
  'quarantine_do_not_execute',
  'keep_for_reference',
  'deleted'
]);

for (const batch of manifest.batches) {
  assert.ok(batch.key, 'archive manifest batch must have key');
  assert.ok(allowedStatuses.has(batch.status), `archive manifest batch has unknown status: ${batch.key}`);
  assert.ok(batch.reason, `archive manifest batch must explain reason: ${batch.key}`);
  assert.ok(Array.isArray(batch.paths) && batch.paths.length > 0, `archive manifest batch must list paths: ${batch.key}`);
  if (batch.status === 'deleted') {
    assert.ok(batch.deletedAt, `deleted archive manifest batch must record deletedAt: ${batch.key}`);
  }

  for (const relPath of batch.paths) {
    const isAllowedNonArchiveDeletedPath = batch.status === 'deleted' && allowedNonArchiveDeletedPaths.has(relPath);
    assert.ok(
      relPath.startsWith('_archive/') || isAllowedNonArchiveDeletedPath,
      `archive manifest path must stay under _archive unless it is an approved deleted legacy root path: ${relPath}`
    );
    if (batch.status === 'deleted') {
      assert.ok(!exists(relPath), `deleted archive manifest path must stay deleted: ${relPath}`);
      continue;
    }
    assert.ok(exists(relPath), `archive manifest path must exist: ${relPath}`);
    const stat = fs.statSync(path.join(root, relPath));
    if (stat.isDirectory()) {
      manifestDirPaths.add(relPath);
    } else {
      manifestPaths.add(relPath);
    }
  }
}

const archiveFiles = listFiles('_archive');
for (const relPath of archiveFiles) {
  const isCoveredByDirectory = Array.from(manifestDirPaths).some((dirPath) => relPath.startsWith(`${dirPath}/`));
  assert.ok(
    manifestPaths.has(relPath) || isCoveredByDirectory,
    `archive file must be listed in docs/ARCHIVE_MANIFEST.json: ${relPath}`
  );
}

const deleteReadyBatches = manifest.batches.filter((batch) => (
  batch.status === 'ready_for_deletion_review' || batch.status === 'quarantine_do_not_execute'
));
const deletedBatches = manifest.batches.filter((batch) => batch.status === 'deleted');
assert.ok(
  deleteReadyBatches.length >= 1 || deletedBatches.length >= 1,
  'archive manifest must include deletion candidates or deleted batches'
);

const activeForbiddenPaths = [
  'CHANGELOG_RECENT.md',
  'SCORING_ALGORITHM_DOCUMENTATION.md',
  'Dockerfile.embedding',
  '.venv-rag',
  'venv-embedding',
  'docs/RAG_TUNING_GUIDE.md',
  'docs/FLOWER_COLOR_DESIGN.md',
  'public/js/staff-dashboard-old.js',
  'public/js/admin-users.js',
  'public/js/role-management.js',
  'scripts/cleanup-legacy-content.js',
  'server'
];

for (const relPath of activeForbiddenPaths) {
  assert.ok(!exists(relPath), `legacy path must stay out of active tree: ${relPath}`);
}

const deletionPlan = read('docs/DELETE_ISOLATED_ITEMS_PLAN.md');
for (const batch of [...deleteReadyBatches, ...deletedBatches]) {
  assert.ok(
    deletionPlan.includes(batch.key) || batch.paths.some((relPath) => deletionPlan.includes(relPath)),
    `delete plan must mention deletion batch: ${batch.key}`
  );
}

console.log('Archive deletion readiness verified.');
