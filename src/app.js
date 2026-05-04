// Trigger Zeabur redeploy - 2026-02-01
const express = require('express');
const path = require('path');
const fs = require('fs');
const { configureWebPush } = require('./config/web-push');
const { createPoolFromEnv, isDbSkipped } = require('./db/pool');
const {
  resolveUploadDir,
  buildStaticAssetDirs
} = require('./config/assets');
const { applyCoreMiddleware } = require('./middleware/core');
const { createRoleAuthMiddleware } = require('./middleware/role-auth');
const {
  applyImageStaticMiddleware,
  applyPublicStaticMiddleware
} = require('./middleware/static-assets');
const {
  createUploadHandlers,
  MulterError,
  optimizeUploadedVideoForStreaming
} = require('./services/uploads');
const { normalizeBillingPolicy } = require('./services/billing');
const { createBoardService } = require('./services/board');
const {
  AI_VALIDATION_MODES,
  createTaskValidationService
} = require('./services/task-validation');
const { createAuthService } = require('./services/auth');
const {
  getActorShopId,
  actorCanAccessShop,
  assertActorHasShopScope,
  createShopScopeService
} = require('./services/shop-scope');
const {
  createAssetStorageService
} = require('./services/asset-storage');
const { registerSystemRoutes } = require('./routes/system.routes');
const { registerGameNpcRoutes } = require('./routes/game-npcs.routes');
const { registerCouponRoutes } = require('./routes/coupons.routes');
const { registerProductRoutes } = require('./routes/products.routes');
const { createPushNotifier, registerPushRoutes } = require('./routes/push.routes');
const { registerAdminUserRoutes } = require('./routes/admin-users.routes');
const { registerAuthRoutes } = require('./routes/auth.routes');
const { registerShopRoutes } = require('./routes/shops.routes');
const { registerBillingRoutes } = require('./routes/billing.routes');
const { registerAssetRoutes } = require('./routes/assets.routes');
const { registerBoardRoutes } = require('./routes/board.routes');
const { registerQuestChainRoutes } = require('./routes/quest-chains.routes');
const { registerTaskRoutes } = require('./routes/tasks.routes');
const { registerAiRoutes } = require('./routes/ai.routes');
const { registerAiTaskRoutes } = require('./routes/ai-tasks.routes');
const { registerUserTaskRoutes } = require('./routes/user-tasks.routes');
const { fetchAIWithRetry, getAiConfig } = require('./services/ai-client');
const { createAiTaskEvaluator } = require('./services/ai-task-evaluator');
const {
  recordLlmUsage,
  resolveUserFromRequest,
  getOrCreateUserTask,
  completeUserTask
} = require('./services/player-progress');

const {
  parseJsonField,
  normalizeNullableString,
  normalizeBoolean,
  stringifyJsonField,
  sanitizeTaskRow,
  sanitizeQuestChainRow,
  sanitizeShopRow,
  buildShopCode,
  normalizeAccessMode,
  normalizeExperienceMode,
  getQuestChainRuntimeFlags,
  buildDemoAutoPassMessage,
  buildDemoAiResult,
  tutorialIdentifyAliases,
  hasNegativeAliasMention,
  getAiIdentifyTargetAliases,
  containsTargetAliasMention,
  extractObservedLabelFromAiReason,
  getObservedIdentifyLabel,
  buildIdentifyFailureReason,
  isSafeIndirectHintText,
  getSafeIndirectHint,
  buildIdentifyRetryAdvice,
  sanitizeAiTaskPlayerFacingResult,
  evaluateTutorialIdentifyOutcome,
  buildTutorialForcedAiReason,
  getUserIdByUsername,
  hasQuestChainCouponAccess,
  assertValidIdentifier,
  getTableColumnSet,
  insertDynamicRecord,
  updateDynamicRecord,
  getQuestChainById,
  assertQuestChainAccess,
  isQuestChainStructureLocked,
  resolveQuestChainStructureLockedAt,
  isPrivilegedPreviewActor,
  resolveQuestPreviewContext,
  createStructureLockedError,
  cleanupUploadedFile,
  assertQuestChainStructureUnlocked,
  normalizeStructureComparableValue,
  getLockedTaskStructureChanges,
  getLockedQuestChainStructureChanges,
  getTaskByIdForScope,
  assertTaskAccess,
  getProductByIdForScope,
  assertProductAccess
} = require('./utils/app-helpers');
const { registerUploadRoutes } = require('./routes/uploads.routes');
const { registerDashboardOpsRoutes } = require('./routes/dashboard-ops.routes');


// Embedding API 已移除，視覺辨識改為 LM-only 模式

// JWT 設定
const JWT_SECRET = process.env.JWT_SECRET;
// 強制生產環境檢查
if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
  console.error('❌ 嚴重錯誤: 生產環境未設定 JWT_SECRET，拒絕啟動。');
  process.exit(1);
}
// 開發環境 fallback
const FINAL_JWT_SECRET = JWT_SECRET || 'dev-secret-key-do-not-use-in-prod';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

const { webpush, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = configureWebPush();
const app = express();
console.log('🚀 沙丘遊戲伺服器（LM-only 視覺裁判）');
applyCoreMiddleware(app, express);

const UPLOAD_DIR = resolveUploadDir();
console.log('📁 圖片儲存路徑:', UPLOAD_DIR);

const STATIC_ASSET_DIRS = buildStaticAssetDirs(UPLOAD_DIR);
console.log('🗂️ 靜態素材搜尋路徑:', STATIC_ASSET_DIRS.join(' -> '));
const {
  uploadImage,
  uploadModel,
  uploadAudio,
  uploadVideo,
  uploadAiTaskImage,
  uploadExcel,
  uploadTemp,
  upload
} = createUploadHandlers(UPLOAD_DIR);

// 優先從目前上傳目錄提供素材；若找不到，再回退到舊路徑，避免調整掛載點後舊素材瞬間失效。
// 影片會補上更友善的串流與快取 header，減少手機端等待時間。
applyImageStaticMiddleware(app, STATIC_ASSET_DIRS);

// 設定靜態檔案服務，並強制為 .glb/.gltf 設定正確的 MIME type
applyPublicStaticMiddleware(app, path.join(__dirname, '..', 'public'));

// 移除錯誤的 mime.define
// express.static.mime.define({'model/gltf-binary': ['glb']});
// express.static.mime.define({'model/gltf+json': ['gltf']});

// IMPORTANT: DB config must come from env vars only. No hardcoded defaults.
// 開發驗證用：允許 SKIP_DB=1 跳過 DB（不影響 /api/vision-test 的 LM-only smoke test）
const SKIP_DB = isDbSkipped();
const { dbConfig, pool } = createPoolFromEnv();
if (SKIP_DB) {
  console.log('[DB] SKIP_DB=1：跳過資料庫連線與啟動遷移（僅用於本機驗證）');
}
const {
  generateToken,
  loadUserAuthContextByUsername,
  authenticateToken,
  authenticateTokenCompat,
  getOptionalTokenUser,
  requireRole
} = createAuthService({
  jwtSecret: FINAL_JWT_SECRET,
  jwtExpire: JWT_EXPIRE,
  pool,
  skipDb: SKIP_DB
});
const {
  ensureShopExists,
  resolveActorShopId
} = createShopScopeService({ sanitizeShopRow });
const {
  getSharedAssetStorageSummary,
  getSharedAssetStorageBreakdown,
  assertSharedAssetStorageAvailable
} = createAssetStorageService({ assertActorHasShopScope });
const {
  sanitizeBoardSessionRow,
  sanitizeBoardMapRow,
  sanitizeBoardTileRow,
  assertBoardMapAccess,
  assertBoardTileAccess
} = createBoardService({
  parseJsonField,
  actorCanAccessShop
});
const {
  prepareTaskValidationSettings
} = createTaskValidationService({
  parseJsonField,
  normalizeNullableString,
  normalizeBoolean
});
const {
  adminAuth,
  staffOrAdminAuth,
  shopOrAdminAuth,
  reviewerAuth
} = createRoleAuthMiddleware({ pool, authenticateTokenCompat });
const sendPushNotification = createPushNotifier({
  pool,
  webpush,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
});
const {
  evaluateAiTaskImage,
  evaluateAiTaskText
} = createAiTaskEvaluator({
  uploadDir: UPLOAD_DIR,
  parseJsonField,
  normalizeNullableString,
  normalizeBoolean,
  sanitizeAiTaskPlayerFacingResult
});

async function testDatabaseConnection() {
  if (SKIP_DB) return false;
  let conn;
  try {
    console.log('🔄 測試資料庫連接...');
    
    // 開發環境：顯示詳細診斷資訊（不包含密碼）
    if (process.env.NODE_ENV !== 'production') {
      console.log('   連接資訊:');
      console.log(`   - Host: ${dbConfig.host}`);
      console.log(`   - Port: ${dbConfig.port}`);
      console.log(`   - User: ${dbConfig.user}`);
      console.log(`   - Database: ${dbConfig.database}`);
      console.log(`   - Password: ${dbConfig.password ? (dbConfig.password.length > 0 ? `[已設定，長度: ${dbConfig.password.length}]` : '[空字串]') : '[未設定]'}`);
    }
    
    // 使用連接池獲取連接
    conn = await pool.getConnection();
    console.log('✅ 資料庫連接成功 (Connection Pool Active)');
    return true;
  } catch (error) {
    console.error('❌ 資料庫連接失敗:', error.message);
    
    // 開發環境：顯示詳細診斷資訊
    if (process.env.NODE_ENV !== 'production' && error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   診斷: 這通常是因為：');
      console.error('   1. 密碼不正確');
      console.error('   2. 環境變數包含未展開的變數語法（如 ${PASSWORD}）');
      console.error('   3. 用戶權限不足');
    }
    
    // 生產環境：僅顯示錯誤訊息，不顯示詳細診斷
    return false;
  } finally {
    if (conn) conn.release(); // 釋放連接回池
  }
}

// 根據優惠券代碼查詢優惠券（商家核銷用）

// 商家核銷優惠券

// 獲取今日核銷歷史（商家用）

// 創建優惠券（任務完成後自動調用）
// 查詢所有任務
// 獲取任務（前端用）
// 查詢目前登入者進行中的任務（需傳 username）
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function saveBufferAsImage(file) {
  ensureUploadDir();
  const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
  return `/images/${filename}`;
}

registerUploadRoutes(app, { authenticateToken, requireRole, uploadImage, uploadAudio });
registerAiRoutes(app, { uploadTemp });
registerAiTaskRoutes(app, {
  pool,
  authenticateToken,
  uploadAiTaskImage,
  getOptionalTokenUser,
  getUserIdByUsername,
  resolveUserFromRequest,
  sanitizeTaskRow,
  getQuestChainRuntimeFlags,
  saveBufferAsImage,
  evaluateAiTaskImage,
  buildDemoAiResult,
  buildTutorialForcedAiReason,
  recordLlmUsage,
  getOrCreateUserTask,
  completeUserTask,
  AI_VALIDATION_MODES
});
registerUserTaskRoutes(app, {
  pool,
  authenticateToken,
  requireRole,
  reviewerAuth,
  parseJsonField,
  getQuestChainRuntimeFlags,
  evaluateAiTaskText,
  buildDemoAutoPassMessage,
  recordLlmUsage,
  completeUserTask,
  sendPushNotification,
  resolveUserFromRequest,
  getUserIdByUsername,
  getOrCreateUserTask,
  sanitizeTaskRow
});

registerAuthRoutes(app, {
  pool,
  authenticateToken,
  requireRole,
  generateToken,
  loadUserAuthContextByUsername,
  buildShopCode,
  normalizeNullableString,
  assertActorHasShopScope,
  ensureShopExists,
  actorCanAccessShop
});
registerShopRoutes(app, {
  pool,
  authenticateToken,
  requireRole,
  normalizeNullableString,
  resolveActorShopId,
  assertActorHasShopScope,
  ensureShopExists,
  sanitizeShopRow
});
registerBillingRoutes(app, {
  pool,
  authenticateToken,
  requireRole,
  resolveActorShopId,
  normalizeBoolean
});
registerAssetRoutes(app, {
  pool,
  authenticateToken,
  staffOrAdminAuth,
  uploadImage,
  uploadModel,
  uploadAudio,
  uploadVideo,
  optimizeUploadedVideoForStreaming,
  cleanupUploadedFile,
  resolveActorShopId,
  getActorShopId,
  actorCanAccessShop,
  ensureShopExists,
  getSharedAssetStorageSummary,
  getSharedAssetStorageBreakdown,
  assertSharedAssetStorageAvailable
});
registerQuestChainRoutes(app, {
  pool,
  staffOrAdminAuth,
  uploadImage,
  getOptionalTokenUser,
  getUserIdByUsername,
  hasQuestChainCouponAccess,
  resolveQuestPreviewContext: (req, questChain) => resolveQuestPreviewContext(req, questChain, { getOptionalTokenUser }),
  assertQuestChainAccess,
  getQuestChainById,
  isQuestChainStructureLocked,
  createStructureLockedError,
  getLockedQuestChainStructureChanges,
  sanitizeQuestChainRow,
  sanitizeTaskRow,
  sanitizeBoardMapRow,
  sanitizeBoardTileRow,
  resolveActorShopId,
  actorCanAccessShop,
  getActorShopId,
  assertActorHasShopScope,
  normalizeBillingPolicy,
  normalizeNullableString,
  normalizeBoolean,
  normalizeAccessMode,
  normalizeExperienceMode,
  parseJsonField,
  stringifyJsonField,
  getTableColumnSet,
  insertDynamicRecord,
  updateDynamicRecord
});
registerTaskRoutes(app, {
  pool,
  authenticateToken,
  requireRole,
  staffOrAdminAuth,
  getActorShopId,
  assertActorHasShopScope,
  resolveActorShopId,
  actorCanAccessShop,
  assertQuestChainAccess,
  isQuestChainStructureLocked,
  resolveQuestChainStructureLockedAt,
  createStructureLockedError,
  getLockedTaskStructureChanges,
  assertTaskAccess,
  sanitizeTaskRow,
  prepareTaskValidationSettings,
  normalizeNullableString,
  normalizeBoolean,
  parseJsonField,
  stringifyJsonField,
  getTableColumnSet,
  insertDynamicRecord,
  updateDynamicRecord
});
registerBoardRoutes(app, {
  pool,
  authenticateToken,
  staffOrAdminAuth,
  assertActorHasShopScope,
  actorCanAccessShop,
  getOptionalTokenUser,
  getUserIdByUsername,
  hasQuestChainCouponAccess,
  resolveQuestPreviewContext: (req, questChain) => resolveQuestPreviewContext(req, questChain, { getOptionalTokenUser }),
  isPrivilegedPreviewActor,
  assertQuestChainAccess,
  isQuestChainStructureLocked,
  createStructureLockedError,
  assertTaskAccess,
  sanitizeQuestChainRow,
  sanitizeBoardMapRow,
  sanitizeBoardTileRow,
  sanitizeBoardSessionRow,
  assertBoardMapAccess,
  assertBoardTileAccess,
  normalizeNullableString,
  normalizeBoolean,
  parseJsonField,
  stringifyJsonField
});
registerProductRoutes(app, {
  pool,
  authenticateToken,
  staffOrAdminAuth,
  assertActorHasShopScope,
  resolveActorShopId,
  assertProductAccess,
  getActorShopId
});
registerDashboardOpsRoutes(app, {
  pool,
  staffOrAdminAuth,
  assertActorHasShopScope,
  getSharedAssetStorageSummary
});
registerPushRoutes(app, {
  pool,
  authenticateTokenCompat,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
});
registerAdminUserRoutes(app, {
  pool,
  adminAuth,
  uploadExcel
});
registerCouponRoutes(app, {
  pool,
  shopOrAdminAuth,
  resolveActorShopId,
  actorCanAccessShop,
  getActorShopId
});
registerGameNpcRoutes(app, { pool, adminAuth });
registerSystemRoutes(app, { publicDir: path.join(__dirname, '..', 'public') });
module.exports = {
  app,
  pool,
  dbConfig,
  skipDb: SKIP_DB,
  testDatabaseConnection
};
// Force redeploy timestamp: Tue Jan  6 12:06:17 CST 2026
