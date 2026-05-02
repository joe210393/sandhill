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

const indexSource = read('index.js');
const appSource = read('src/app.js');
const serverSource = read('src/server.js');
const aiRoutesSource = read('src/routes/ai.routes.js');
const aiTaskRoutesSource = read('src/routes/ai-tasks.routes.js');
const userTaskRoutesSource = read('src/routes/user-tasks.routes.js');
const aiClientSource = read('src/services/ai-client.js');
const aiTaskEvaluatorSource = read('src/services/ai-task-evaluator.js');
const playerProgressSource = read('src/services/player-progress.js');
const roleAuthSource = read('src/middleware/role-auth.js');

assert.strictEqual(indexSource.trim(), "require('./src/server');", 'index.js must remain a one-line server entry');
assert.ok(serverSource.includes("require('./app')"), 'src/server.js must load the assembled app');
assert.ok(serverSource.includes('startServer(app'), 'src/server.js must own startServer invocation');
assert.ok(!appSource.includes('startServer(app'), 'src/app.js must not start the HTTP listener');
assert.ok(!appSource.includes('app.listen('), 'src/app.js must not call app.listen');
assert.ok(appSource.includes('module.exports = {'), 'src/app.js must export the assembled app context');

assert.ok(exists('src/routes/ai.routes.js'), 'AI routes must be isolated in src/routes/ai.routes.js');
assert.ok(exists('src/routes/ai-tasks.routes.js'), 'AI task submit routes must be isolated in src/routes/ai-tasks.routes.js');
assert.ok(exists('src/routes/user-tasks.routes.js'), 'user task routes must be isolated in src/routes/user-tasks.routes.js');
assert.ok(exists('src/services/ai-client.js'), 'AI client config/retry logic must be isolated in src/services/ai-client.js');
assert.ok(exists('src/services/ai-task-evaluator.js'), 'AI task evaluator must be isolated in src/services/ai-task-evaluator.js');
assert.ok(exists('src/services/player-progress.js'), 'player progress service must be isolated in src/services/player-progress.js');
assert.ok(exists('src/middleware/role-auth.js'), 'role auth middleware must be isolated in src/middleware/role-auth.js');
assert.ok(appSource.includes('registerAiRoutes(app'), 'src/app.js must register AI routes through registerAiRoutes');
assert.ok(appSource.includes('registerAiTaskRoutes(app'), 'src/app.js must register AI task submit routes through registerAiTaskRoutes');
assert.ok(appSource.includes('registerUserTaskRoutes(app'), 'src/app.js must register user task routes through registerUserTaskRoutes');
assert.ok(!appSource.includes("app.post('/api/vision-test'"), 'src/app.js must not define /api/vision-test inline');
assert.ok(!appSource.includes("app.post('/api/chat-text'"), 'src/app.js must not define /api/chat-text inline');
assert.ok(!appSource.includes("app.get('/api/plant-vision-prompt'"), 'src/app.js must not define /api/plant-vision-prompt inline');
assert.ok(!appSource.includes("app.post('/api/tutorial/ai-tasks/:taskId/submit'"), 'src/app.js must not define tutorial AI task submit inline');
assert.ok(!appSource.includes("app.post('/api/ai-tasks/:taskId/submit'"), 'src/app.js must not define AI task submit inline');
assert.ok(!appSource.includes("app.get('/api/user-tasks'"), 'src/app.js must not define user task routes inline');
assert.ok(!appSource.includes("app.patch('/api/user-tasks/:id/answer'"), 'src/app.js must not define user task answer route inline');
assert.ok(!appSource.includes("app.get('/api/user/badges'"), 'src/app.js must not define user badge route inline');
assert.ok(!appSource.includes("app.get('/api/user/quest-progress'"), 'src/app.js must not define quest progress route inline');
assert.ok(!appSource.includes('function getAiConfig('), 'src/app.js must not define AI config inline');
assert.ok(!appSource.includes('async function fetchAIWithRetry('), 'src/app.js must not define AI retry client inline');
assert.ok(!appSource.includes('function buildAiTaskPrompt('), 'src/app.js must not define AI task prompt inline');
assert.ok(!appSource.includes('function buildAiTextTaskPrompt('), 'src/app.js must not define AI text task prompt inline');
assert.ok(!appSource.includes('function normalizeAiTaskResult('), 'src/app.js must not define AI task result normalization inline');
assert.ok(!appSource.includes('function normalizeAiTextTaskResult('), 'src/app.js must not define AI text task result normalization inline');
assert.ok(!appSource.includes('async function evaluateAiTaskImage('), 'src/app.js must not define AI image evaluator inline');
assert.ok(!appSource.includes('async function evaluateAiTaskText('), 'src/app.js must not define AI text evaluator inline');
assert.ok(!appSource.includes('async function recordLlmUsage('), 'src/app.js must not define LLM usage recording inline');
assert.ok(!appSource.includes('async function resolveUserFromRequest('), 'src/app.js must not define user auth lookup inline');
assert.ok(!appSource.includes('async function getOrCreateUserTask('), 'src/app.js must not define user task creation inline');
assert.ok(!appSource.includes('async function completeUserTask('), 'src/app.js must not define task completion reward logic inline');
assert.ok(!appSource.includes('function adminAuth('), 'src/app.js must not define adminAuth inline');
assert.ok(!appSource.includes('function staffOrAdminAuth('), 'src/app.js must not define staffOrAdminAuth inline');
assert.ok(!appSource.includes('function shopOrAdminAuth('), 'src/app.js must not define shopOrAdminAuth inline');
assert.ok(!appSource.includes('function reviewerAuth('), 'src/app.js must not define reviewerAuth inline');

assert.ok(aiRoutesSource.includes("app.post('/api/vision-test'"), 'AI routes module must own /api/vision-test');
assert.ok(aiRoutesSource.includes("app.post('/api/chat-text'"), 'AI routes module must own /api/chat-text');
assert.ok(aiRoutesSource.includes("app.get('/api/plant-vision-prompt'"), 'AI routes module must own disabled plant prompt compatibility endpoint');
assert.ok(aiTaskRoutesSource.includes("app.post('/api/tutorial/ai-tasks/:taskId/submit'"), 'AI task routes module must own tutorial AI task submit');
assert.ok(aiTaskRoutesSource.includes("app.post('/api/ai-tasks/:taskId/submit'"), 'AI task routes module must own authenticated AI task submit');
assert.ok(userTaskRoutesSource.includes("app.get('/api/user-tasks'"), 'user task routes module must own user task list');
assert.ok(userTaskRoutesSource.includes("app.patch('/api/user-tasks/:id/answer'"), 'user task routes module must own user task answer submit');
assert.ok(userTaskRoutesSource.includes("app.get('/api/user/badges'"), 'user task routes module must own user badges');
assert.ok(userTaskRoutesSource.includes("app.get('/api/user/quest-progress'"), 'user task routes module must own quest progress');
assert.ok(aiClientSource.includes('function getAiConfig('), 'AI client service must own getAiConfig');
assert.ok(aiClientSource.includes('async function fetchAIWithRetry('), 'AI client service must own fetchAIWithRetry');
assert.ok(aiTaskEvaluatorSource.includes('function createAiTaskEvaluator('), 'AI task evaluator service must expose createAiTaskEvaluator');
assert.ok(aiTaskEvaluatorSource.includes('async function evaluateAiTaskImage('), 'AI task evaluator service must own image evaluation');
assert.ok(aiTaskEvaluatorSource.includes('async function evaluateAiTaskText('), 'AI task evaluator service must own text evaluation');
assert.ok(playerProgressSource.includes('async function recordLlmUsage('), 'player progress service must own LLM usage recording');
assert.ok(playerProgressSource.includes('async function completeUserTask('), 'player progress service must own task completion reward logic');
assert.ok(roleAuthSource.includes('function createRoleAuthMiddleware('), 'role auth middleware must expose createRoleAuthMiddleware');
assert.ok(roleAuthSource.includes('function reviewerAuth('), 'role auth middleware must own reviewerAuth');

const architectureMemo = read('docs/ARCHITECTURE_MEMO.md');
const normalizationAudit = read('docs/NORMALIZATION_AUDIT.md');
assert.ok(architectureMemo.includes('Phase 6'), 'architecture memo must mention Phase 6 normalization');
assert.ok(normalizationAudit.includes('Phase 6'), 'normalization audit must include Phase 6 status');

console.log('Phase 6 normalization verification passed');
