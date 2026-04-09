// Trigger Zeabur redeploy - 2026-02-01
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const webpush = require('web-push');
const XLSX = require('xlsx');
const { getDbConfig } = require('./db-config');

// RAG / Embedding API 已移除，視覺辨識改為 LM-only 模式

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

// Web Push (VAPID) 設定
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@sandhill.app';

// 初始化 webpush（如果提供了 VAPID 金鑰）
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log('✅ Web Push (VAPID) 已初始化');
} else {
  console.warn('⚠️  警告: 未設定 VAPID 金鑰，推送通知功能將無法使用');
  console.warn('   請設定環境變數: VAPID_PUBLIC_KEY 和 VAPID_PRIVATE_KEY');
  console.warn('   可以使用以下命令生成: npx web-push generate-vapid-keys');
}

const app = express();
console.log('🚀 沙丘遊戲伺服器（LM-only 視覺裁判，RAG 已停用）');

// 🔥 關鍵設定：信任反向代理（Zeabur/Cloudflare 等）
// 設定為 1 表示只信任第一層代理（Zeabur 通常只有一層負載均衡器）
// 這比 trust proxy: true 更安全，避免信任過多代理層導致 IP 偽造風險
app.set('trust proxy', 1);

// 安全性設定
app.use(helmet({
  contentSecurityPolicy: false, // AR.js 需要較寬鬆的 CSP
  crossOriginEmbedderPolicy: false
}));

// 全局限流
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 1000, // 每個 IP 限制 1000 次請求
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// 登入限流 (更嚴格)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, message: '嘗試次數過多，請 15 分鐘後再試' }
});
app.use('/api/login', authLimiter);
app.use('/api/staff-login', authLimiter);

// 設定圖片上傳目錄
// 如果 /data/public/images 存在 (Zeabur 環境)，就使用該路徑
// 否則使用本地 public/images
const ZEABUR_UPLOAD_PATH = '/data/public/images';
const UPLOAD_DIR = fs.existsSync(ZEABUR_UPLOAD_PATH) 
  ? ZEABUR_UPLOAD_PATH 
  : path.join(__dirname, 'public/images');
  
console.log('📁 圖片儲存路徑:', UPLOAD_DIR);

// CORS 設定 - 根據環境變數限制網域
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4015',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:4015',
      'https://gpstask.zeabur.app',
      'https://sandhill.zeabur.app'
    ];

const corsOptions = {
  origin: (origin, callback) => {
    // 允許沒有 origin 的請求（如 Postman 或 curl）
    if (!origin) return callback(null, true);

    const isLocalDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

    if (allowedOrigins.includes(origin) || isLocalDevOrigin) {
      return callback(null, true);
    } else {
      console.warn(`🚫 CORS 阻擋來源: ${origin}`);
      return callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true, // 允許 cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-username'],
  maxAge: 86400 // 預檢請求快取 24 小時
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ charset: 'utf-8' }));

// 優先從 UPLOAD_DIR 提供圖片服務，這對於掛載的 Volume 很重要
// 當請求 /images/xxx.jpg 時，會先去 UPLOAD_DIR 找
app.use('/images', express.static(UPLOAD_DIR));

// 設定靜態檔案服務，並強制為 .glb/.gltf 設定正確的 MIME type
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (path.extname(filePath) === '.glb') {
      res.setHeader('Content-Type', 'model/gltf-binary');
    } else if (path.extname(filePath) === '.gltf') {
      res.setHeader('Content-Type', 'model/gltf+json');
    }
  }
}));

// 移除錯誤的 mime.define
// express.static.mime.define({'model/gltf-binary': ['glb']});
// express.static.mime.define({'model/gltf+json': ['gltf']});

// 設置響應字符集
app.use((req, res, next) => {
  // 對於 API 路由，設置正確的字符集
  if (req.path.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  next();
});

// IMPORTANT: DB config must come from env vars only. No hardcoded defaults.
// 開發 / RAG 驗證用：允許 SKIP_DB=1 跳過 DB（不影響 /api/vision-test / 植物 RAG）
const SKIP_DB = String(process.env.SKIP_DB || '').trim() === '1';
let dbConfig = null;
let pool = null;
if (!SKIP_DB) {
  dbConfig = getDbConfig();

  // 建立連接池
  pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });
} else {
  console.log('[DB] SKIP_DB=1：跳過資料庫連線與啟動遷移（僅用於本機 RAG/驗證）');
}

const ALLOWED_TASK_TYPES = ['qa', 'multiple_choice', 'photo', 'number', 'keyword', 'location'];
const AI_VALIDATION_MODES = ['ai_count', 'ai_identify', 'ai_score', 'ai_rule_check', 'ai_reference_match'];

function parseJsonField(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function normalizeNullableString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function stringifyJsonField(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      JSON.parse(trimmed);
    } catch (e) {
      return null;
    }
    return trimmed;
  }
  return JSON.stringify(value);
}

function sanitizeTaskRow(row) {
  if (!row) return row;
  return {
    ...row,
    options: parseJsonField(row.options, row.options),
    ai_config: parseJsonField(row.ai_config, null),
    pass_criteria: parseJsonField(row.pass_criteria, null),
    event_config: parseJsonField(row.event_config, null),
    is_active: row.is_active == null ? true : Boolean(row.is_active),
    location_required: Boolean(row.location_required)
  };
}

function sanitizeQuestChainRow(row) {
  if (!row) return row;
  return {
    ...row,
    title: row.title || row.name || '',
    experience_mode: normalizeExperienceMode(row.experience_mode, row),
    is_active: Boolean(row.is_active),
    game_rules: parseJsonField(row.game_rules, null),
    content_blueprint: parseJsonField(row.content_blueprint, null)
  };
}

function normalizeExperienceMode(value, questChainLike = null) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (['formal', 'tutorial', 'demo'].includes(normalized)) {
    return normalized;
  }
  if (!questChainLike) return 'formal';
  const gameRules = parseJsonField(questChainLike?.game_rules, {}) || {};
  const contentBlueprint = parseJsonField(questChainLike?.content_blueprint, {}) || {};
  const playStyle = normalizeNullableString(questChainLike?.play_style)?.toLowerCase() || '';
  if (
    normalizeBoolean(gameRules.demo_autopass) ||
    normalizeBoolean(gameRules.demoAutoPass) ||
    normalizeBoolean(contentBlueprint.demo_autopass) ||
    normalizeBoolean(contentBlueprint.demoAutoPass) ||
    playStyle === 'demo_story'
  ) {
    return 'demo';
  }
  if (
    normalizeBoolean(gameRules.tutorial_mode) ||
    normalizeBoolean(gameRules.tutorialMode) ||
    normalizeBoolean(contentBlueprint.tutorial_mode) ||
    normalizeBoolean(contentBlueprint.tutorialMode) ||
    playStyle === 'tutorial_story' ||
    playStyle === 'tutorial_board'
  ) {
    return 'tutorial';
  }
  return 'formal';
}

function getQuestChainRuntimeFlags(questChainLike) {
  const gameRules = parseJsonField(questChainLike?.game_rules, {}) || {};
  const contentBlueprint = parseJsonField(questChainLike?.content_blueprint, {}) || {};
  const experienceMode = normalizeExperienceMode(questChainLike?.experience_mode, questChainLike);
  return {
    experienceMode,
    demoAutoPass: experienceMode === 'demo' || normalizeBoolean(gameRules.demo_autopass) || normalizeBoolean(contentBlueprint.demo_autopass),
    tutorialMode: experienceMode === 'tutorial' || normalizeBoolean(gameRules.tutorial_mode) || normalizeBoolean(contentBlueprint.tutorial_mode),
    rpgStyleDialog: normalizeBoolean(gameRules.rpg_dialog) || normalizeBoolean(contentBlueprint.rpg_dialog)
  };
}

function buildDemoAutoPassMessage(task, mode = 'story') {
  const baseName = task?.name || '這一關';
  if (mode === 'ai') {
    return `教學模式開啟中，沙丘已先讓你通過「${baseName}」，繼續往下一段劇情前進。`;
  }
  if (task?.task_type === 'location') {
    return `教學模式開啟中，沙丘已替你完成「${baseName}」的報到判定。`;
  }
  if (task?.task_type === 'multiple_choice') {
    return `教學模式開啟中，沙丘已記錄你的選擇，直接通過「${baseName}」。`;
  }
  if (task?.task_type === 'photo') {
    return `教學模式開啟中，沙丘已收下這張照片，直接通過「${baseName}」。`;
  }
  return `教學模式開啟中，沙丘已替你通過「${baseName}」。`;
}

function buildDemoAiResult(task, submissionUrl = null) {
  return {
    passed: true,
    confidence: 1,
    label: (task?.pass_criteria && task.pass_criteria.target_label) || (task?.ai_config && task.ai_config.target_label) || 'demo_pass',
    count_detected: Number(task?.pass_criteria?.target_count || 1),
    score: Number(task?.pass_criteria?.min_score || 10),
    same_location: true,
    reason: buildDemoAutoPassMessage(task, 'ai'),
    retry_advice: '',
    source: 'sandhill_demo_autopass',
    submission_url: submissionUrl
  };
}

function buildTutorialForcedAiReason(task, aiReason = '', aiPassed = null) {
  const fallback = `我看見了你上傳的畫面，但因為現在是教學模式，所以「${task?.name || '這一關'}」先讓你通過，方便你把整段流程走完。`;
  const normalized = normalizeNullableString(aiReason);
  if (!normalized) return fallback;
  if (aiPassed === false) {
    return `我看見了：${normalized}\n\n不過這次不是這一關要找的內容喔。因為現在是教學模式，所以我還是先讓你通過，方便你繼續往下體驗。正式關卡時，還是需要拍到任務指定的物品或場景才會過關。`;
  }
  return `我看見了：${normalized}\n\n這看起來就是這一關要找的內容。因為現在是教學模式，所以我直接讓你通過，方便你繼續把流程走完。正式關卡時，仍然需要拍到任務要求的內容才會通過。`;
}

function buildAiNoContentResult(task) {
  const label = (task?.pass_criteria && task.pass_criteria.target_label)
    || (task?.ai_config && task.ai_config.target_label)
    || null;
  return {
    passed: false,
    confidence: null,
    label,
    count_detected: null,
    score: null,
    reason: `AI 這次沒有成功回覆可辨識內容，所以暫時無法確認「${task?.name || '這一關'}」是否正確。`,
    retry_advice: '請重新拍攝一次，盡量讓主體更清楚、靠近一點，或稍後再試一次。',
    rule_results: null
  };
}

async function getUserIdByUsername(conn, username) {
  const [users] = await conn.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  return users[0]?.id || null;
}

function sanitizeBoardSessionRow(row) {
  if (!row) return row;
  return {
    ...row,
    current_tile: Number(row.current_tile || 1),
    round_count: Number(row.round_count || 0),
    pending_roll: row.pending_roll == null ? null : Number(row.pending_roll),
    pending_target_tile: row.pending_target_tile == null ? null : Number(row.pending_target_tile),
    gained_points: Number(row.gained_points || 0),
    session_state: parseJsonField(row.session_state, null),
    last_result: parseJsonField(row.last_result, null)
  };
}

function sanitizeBoardMapRow(row) {
  if (!row) return row;
  return {
    ...row,
    tile_count: Number(row.tile_count || 0),
    challenge_tile_count: Number(row.challenge_tile_count || 0),
    event_tile_count: Number(row.event_tile_count || 0),
    is_active: Boolean(row.is_active),
    exact_finish_required: Boolean(row.exact_finish_required),
    rules_json: parseJsonField(row.rules_json, null)
  };
}

function sanitizeBoardTileRow(row) {
  if (!row) return row;
  return {
    ...row,
    is_active: Boolean(row.is_active),
    tile_meta: parseJsonField(row.tile_meta, null)
  };
}

const VALID_SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function assertValidIdentifier(name, context) {
  if (!VALID_SQL_IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${context}: ${name}`);
  }
}

async function getTableColumnSet(conn, tableName) {
  assertValidIdentifier(tableName, 'table name');
  const [rows] = await conn.execute(`SHOW COLUMNS FROM \`${tableName}\``);
  return new Set(rows.map(row => row.Field));
}

async function insertDynamicRecord(conn, tableName, record) {
  assertValidIdentifier(tableName, 'table name');
  const columns = Object.keys(record);
  columns.forEach(col => assertValidIdentifier(col, 'column name'));
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO \`${tableName}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`;
  const values = columns.map(column => record[column]);
  return conn.execute(sql, values);
}

async function updateDynamicRecord(conn, tableName, id, record) {
  assertValidIdentifier(tableName, 'table name');
  const columns = Object.keys(record);
  columns.forEach(col => assertValidIdentifier(col, 'column name'));
  const assignments = columns.map(column => `\`${column}\` = ?`).join(', ');
  const sql = `UPDATE \`${tableName}\` SET ${assignments} WHERE id = ?`;
  const values = [...columns.map(column => record[column]), id];
  return conn.execute(sql, values);
}

function prepareTaskValidationSettings(body = {}) {
  const validationModeInput = normalizeNullableString(body.validation_mode) || 'manual';
  const isAiMode = AI_VALIDATION_MODES.includes(validationModeInput);
  const validationMode = isAiMode || ['manual', 'keyword'].includes(validationModeInput)
    ? validationModeInput
    : 'manual';
  const submissionType = isAiMode ? 'image' : (body.submission_type === 'image' ? 'image' : 'answer');
  const taskType = isAiMode
    ? 'photo'
    : (ALLOWED_TASK_TYPES.includes(body.task_type) ? body.task_type : 'qa');

  const rawAiConfig = parseJsonField(body.ai_config, null) || {};
  const rawPassCriteria = parseJsonField(body.pass_criteria, null) || {};

  if (!isAiMode) {
    return {
      taskType,
      submissionType,
      validationMode,
      aiConfigJson: null,
      passCriteriaJson: null,
      failureMessage: normalizeNullableString(body.failure_message),
      successMessage: normalizeNullableString(body.success_message),
      maxAttempts: body.max_attempts ? Number(body.max_attempts) : null,
      locationRequired: normalizeBoolean(body.location_required),
      isAiMode: false
    };
  }

  const aiConfig = {
    system_prompt: normalizeNullableString(rawAiConfig.system_prompt),
    user_prompt: normalizeNullableString(rawAiConfig.user_prompt),
    target_label: normalizeNullableString(rawAiConfig.target_label)
  };

  const passCriteria = {
    target_label: normalizeNullableString(rawPassCriteria.target_label),
    target_count: rawPassCriteria.target_count === undefined || rawPassCriteria.target_count === null || rawPassCriteria.target_count === ''
      ? null
      : Number(rawPassCriteria.target_count),
    min_score: rawPassCriteria.min_score === undefined || rawPassCriteria.min_score === null || rawPassCriteria.min_score === ''
      ? null
      : Number(rawPassCriteria.min_score),
    min_confidence: rawPassCriteria.min_confidence === undefined || rawPassCriteria.min_confidence === null || rawPassCriteria.min_confidence === ''
      ? null
      : Number(rawPassCriteria.min_confidence),
    all_rules_must_pass: normalizeBoolean(rawPassCriteria.all_rules_must_pass)
  };

  if (!aiConfig.user_prompt) {
    throw new Error('AI 任務必須設定 AI 使用者提示詞');
  }

  if (validationMode === 'ai_count') {
    if (!aiConfig.target_label && !passCriteria.target_label) {
      throw new Error('AI 數量判斷任務必須設定目標標籤');
    }
    if (!Number.isFinite(passCriteria.target_count) || passCriteria.target_count <= 0) {
      throw new Error('AI 數量判斷任務必須設定有效的目標數量');
    }
  }

  if (validationMode === 'ai_identify') {
    if (!aiConfig.target_label && !passCriteria.target_label) {
      throw new Error('AI 指定物辨識任務必須設定目標標籤');
    }
  }

  if (validationMode === 'ai_score') {
    if (!Number.isFinite(passCriteria.min_score)) {
      throw new Error('AI 圖像評分任務必須設定最低通過分數');
    }
  }

  if (validationMode === 'ai_reference_match') {
    passCriteria.target_label = passCriteria.target_label || aiConfig.target_label || 'reference_location';
  }

  if (validationMode === 'ai_rule_check' && !passCriteria.all_rules_must_pass) {
    passCriteria.all_rules_must_pass = true;
  }

  if (passCriteria.min_confidence !== null && (!Number.isFinite(passCriteria.min_confidence) || passCriteria.min_confidence < 0 || passCriteria.min_confidence > 1)) {
    throw new Error('最低信心值必須介於 0 到 1');
  }

  const maxAttempts = body.max_attempts ? Number(body.max_attempts) : null;
  if (maxAttempts !== null && (!Number.isFinite(maxAttempts) || maxAttempts <= 0)) {
    throw new Error('max_attempts 必須為正整數');
  }

  return {
    taskType,
    submissionType,
    validationMode,
    aiConfigJson: JSON.stringify(aiConfig),
    passCriteriaJson: JSON.stringify(passCriteria),
    failureMessage: normalizeNullableString(body.failure_message),
    successMessage: normalizeNullableString(body.success_message),
    maxAttempts,
    locationRequired: normalizeBoolean(body.location_required),
    isAiMode: true
  };
}

// JWT 工具函數
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    FINAL_JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );
}

// 測試資料庫連接
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

function verifyToken(token) {
  try {
    return jwt.verify(token, FINAL_JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// JWT 認證中間層
function authenticateToken(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, message: '未提供認證令牌' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: '認證令牌無效或已過期' });
  }

  req.user = decoded;
  next();
}

// 兼容性認證中間層 - 現在與 authenticateToken 功能完全相同
// 保留此函數以維持向後兼容性，實際上是 authenticateToken 的別名
function authenticateTokenCompat(req, res, next) {
  return authenticateToken(req, res, next);
}

function getOptionalTokenUser(req) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  return verifyToken(token);
}

// RBAC 角色授權中間層
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '未認證' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: '權限不足' });
    }

    next();
  };
}

// 共享的存儲配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // 確保目錄存在
      if (!fs.existsSync(UPLOAD_DIR)) {
        try {
          fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        } catch (err) {
          console.error('建立上傳目錄失敗:', err);
        }
      }
      cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      // 生成安全的檔案名稱：時間戳 + 隨機字串 + 副檔名
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, uniqueSuffix + extension);
    }
});

// 共享的檔案類型過濾器（圖片和 3D 模型）
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.glb', '.gltf'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('不支援的檔案類型。只允許 JPG, PNG, GIF, WebP, GLB, GLTF。'), false);
  }
};

// 音頻文件過濾器
const audioFileFilter = (req, file, cb) => {
  const allowedExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm'];
    const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
    cb(new Error('不支援的檔案類型。只允許 MP3, WAV, OGG, M4A, AAC, FLAC, WebM。'), false);
  }
};

// 一般圖片上傳配置（5MB 限制）- 用於用戶上傳照片答案、道具圖片、徽章圖片等
const uploadImage = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB 限制
    files: 1
  },
  fileFilter: fileFilter
});

// 3D 模型上傳配置（100MB 限制）- 用於 AR 模型上傳
const uploadModel = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB 限制 (為了支援 GLB 模型)
    files: 1
  },
  fileFilter: fileFilter
});

// 音頻文件上傳配置（100MB 限制）- 用於背景音樂上傳
const uploadAudio = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB 限制 (為了支援高品質音頻)
    files: 1
  },
  fileFilter: audioFileFilter
});

const uploadAiTaskImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  },
  fileFilter: fileFilter
});

// 向後兼容：保留 upload 作為 uploadImage 的別名（用於舊代碼）
const upload = uploadImage;

// 登入 API
// - role=user：一般用戶登入（手機門號，不需密碼），同時允許 staff 也用此入口登入
// - role=staff_portal：工作人員入口（帳號密碼），僅允許 admin/shop
// - 兼容：role=shop/admin/staff（舊版工作人員入口）
app.post('/api/login', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !role) {
    return res.status(400).json({ success: false, message: '缺少參數' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    if (role === 'user') {
      // 手機門號登入 - 設計為無密碼快速登入（景點快速使用）
      // 如果用戶提供了密碼且帳號有密碼，則驗證；否則直接通過
      const [users] = await conn.execute(
        'SELECT * FROM users WHERE username = ? AND role IN (?, ?)',
        [username, 'user', 'staff']
      );
      if (users.length === 0) {
        return res.status(400).json({ success: false, message: '查無此用戶' });
      }

      const user = users[0];
      
      // 安全修復：如果帳號有密碼，必須提供並驗證密碼
      // 只有當帳號沒有密碼時，才允許無密碼登入（快速登入設計）
      if (user.password && user.password.trim() !== '') {
        // 帳號有密碼，必須提供密碼並驗證
        if (!password) {
          return res.status(400).json({ success: false, message: '此帳號需要密碼，請輸入密碼' });
        }
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return res.status(400).json({ success: false, message: '密碼錯誤' });
        }
      }
      // 如果帳號沒有密碼，允許無密碼登入（符合快速登入設計）

      // 生成 JWT token
      const token = generateToken(user);

      // 設置 httpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        // IMPORTANT:
        // - Using SameSite=Strict can break flows when users open the site from external apps (LINE/FB/in-app browsers),
        //   causing cookies not to be sent and "開始任務" to fail with 401.
        // - Lax is the practical default for this app while still providing CSRF mitigation.
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/' // 確保 cookie 在所有路徑下都可用
      });

      // 返回用戶信息
      const userResponse = {
        id: users[0].id,
        username: users[0].username,
        role: users[0].role
      };

      res.json({ success: true, user: userResponse });
    } else if (role === 'staff_portal' || role === 'shop' || role === 'admin' || role === 'staff') {
      // 工作人員入口（帳號密碼）
      // 新規則：僅允許 admin / shop 走此入口（staff 一律走一般用戶登入）
      const [users] = await conn.execute(
        'SELECT * FROM users WHERE username = ? AND role IN (?, ?)',
        [username, 'shop', 'admin']
      );
      if (users.length === 0) {
        return res.status(400).json({ success: false, message: '查無此帳號' });
      }

      const storedPassword = users[0].password;
      let match = false;

      // 所有密碼都必須是 bcrypt hash 格式
      if (storedPassword && (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$'))) {
        // 使用 bcrypt 比較
        match = await bcrypt.compare(password, storedPassword);
      } else {
        // 密碼格式錯誤或為空，拒絕登入
        match = false;
        console.warn(`用戶 ${username} 的密碼格式不正確`);
      }

      if (!match) {
        return res.status(400).json({ success: false, message: '密碼錯誤' });
      }

      // 生成 JWT token
      const token = generateToken(users[0]);

      // 設置 httpOnly cookie
      res.cookie('token', token, {
        httpOnly: true, // 防止 XSS 攻擊
        secure: process.env.NODE_ENV === 'production', // 生產環境使用 HTTPS
        // See note above: keep lax to avoid external-entry cookie loss.
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
        path: '/' // 確保 cookie 在所有路徑下都可用
      });

      // 返回用戶信息（不包含敏感數據）
      const userResponse = {
        id: users[0].id,
        username: users[0].username,
        role: users[0].role
      };

      res.json({ success: true, user: userResponse });
    } else {
      return res.status(400).json({ success: false, message: '角色錯誤' });
    }
  } catch (err) {
    console.error('登入 API 錯誤:', err);
    // 如果是資料庫連接錯誤，返回更清楚的錯誤訊息
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('資料庫連接失敗 - 請檢查環境變數設定');
      return res.status(503).json({ 
        success: false, 
        message: '資料庫連接失敗，請聯繫管理員檢查伺服器設定' 
      });
    }
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 登出 API - 清除 JWT cookie
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: '已成功登出' });
});

// 獲取當前用戶信息 API
app.get('/api/me', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});



// 根據優惠券代碼查詢優惠券（商家核銷用）

// 商家核銷優惠券

// 獲取今日核銷歷史（商家用）

// 創建優惠券（任務完成後自動調用）

app.post('/api/register', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !role) {
    return res.status(400).json({ success: false, message: '缺少參數' });
  }
  // 新規則：註冊僅允許一般用戶（手機門號）。staff 需由 admin/shop 指派；shop/admin 需由 admin 建立。
  if (role !== 'user') {
    return res.status(403).json({ success: false, message: '僅允許註冊一般用戶，工作人員/商店/管理員帳號請由管理員建立或指派' });
  }
    // 手機門號註冊，不需密碼
    if (!/^09[0-9]{8}$/.test(username)) {
      return res.status(400).json({ success: false, message: '請輸入正確的手機門號' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    // 檢查帳號是否已存在
    const [exist] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (exist.length > 0) {
      return res.status(400).json({ success: false, message: '帳號已存在' });
    }
    // 寫入資料庫
    const [insertResult] = await conn.execute(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      [username, null, 'user']
    );
    // 自動登入：產生 JWT 並設定 cookie
    const newUser = { id: insertResult.insertId, username, role: 'user' };
    const token = generateToken(newUser);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });
    res.json({ success: true, message: '註冊成功', user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== 帳號/權限管理（新規則）=====

// admin 建立 admin/shop 帳號（帳號密碼）
app.post('/api/admin/accounts', authenticateToken, requireRole('admin'), async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, message: '缺少參數' });
  }
  if (!['admin', 'shop'].includes(role)) {
    return res.status(400).json({ success: false, message: '僅允許建立 admin 或 shop 帳號' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    const [exist] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (exist.length > 0) return res.status(400).json({ success: false, message: '帳號已存在' });

    const hashed = await bcrypt.hash(password, 10);
    await conn.execute(
      'INSERT INTO users (username, password, role, created_by) VALUES (?, ?, ?, ?)',
      [username, hashed, role, req.user.username]
    );
    res.json({ success: true, message: '建立成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// admin/shop 指派 staff：指定人選需先註冊 user（手機門號）
app.post('/api/staff/assign', authenticateToken, requireRole('admin', 'shop'), async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ success: false, message: '缺少 username' });
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT id, role FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: '找不到使用者' });
    const u = rows[0];
    if (u.role === 'admin' || u.role === 'shop') return res.status(400).json({ success: false, message: '不可將 admin/shop 指派為 staff' });
    // 允許 user -> staff、或 staff 重新綁定（由 admin）
    if (u.role === 'staff' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '此帳號已是 staff，僅 admin 可重新指派' });
    }
    await conn.execute('UPDATE users SET role = ?, managed_by = ? WHERE id = ?', ['staff', req.user.username, u.id]);
    res.json({ success: true, message: '已指派為 staff' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// admin/shop 撤銷 staff：staff 變回 user，即可接取任務
app.post('/api/staff/revoke', authenticateToken, requireRole('admin', 'shop'), async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ success: false, message: '缺少 username' });
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT id, role, managed_by FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: '找不到使用者' });
    const u = rows[0];
    if (u.role !== 'staff') return res.status(400).json({ success: false, message: '此帳號不是 staff' });
    if (req.user.role === 'shop' && u.managed_by !== req.user.username) {
      return res.status(403).json({ success: false, message: '無權限撤銷非本店 staff' });
    }
    await conn.execute('UPDATE users SET role = ?, managed_by = NULL WHERE id = ?', ['user', u.id]);
    res.json({ success: true, message: '已撤銷 staff，恢復為一般用戶' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// admin/shop 修改自己的密碼（第一次登入後可改）
app.post('/api/change-password', authenticateToken, requireRole('admin', 'shop'), async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ success: false, message: '缺少參數' });
  if (String(newPassword).length < 6) return res.status(400).json({ success: false, message: '新密碼至少 6 碼' });
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT id, password FROM users WHERE username = ?', [req.user.username]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: '找不到使用者' });
    const stored = rows[0].password;
    const ok = stored && (stored.startsWith('$2a$') || stored.startsWith('$2b$')) && await bcrypt.compare(oldPassword, stored);
    if (!ok) return res.status(400).json({ success: false, message: '舊密碼錯誤' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await conn.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, rows[0].id]);
    res.json({ success: true, message: '密碼已更新' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// shop 店家資訊（未來地圖顯示用）
app.get('/api/shop/profile', authenticateToken, requireRole('shop', 'admin'), async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute(
      'SELECT username, role, shop_name, shop_address, shop_description FROM users WHERE username = ?',
      [req.user.username]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: '找不到帳號' });
    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

app.put('/api/shop/profile', authenticateToken, requireRole('shop', 'admin'), async (req, res) => {
  const { shop_name, shop_address, shop_description } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute(
      'UPDATE users SET shop_name = ?, shop_address = ?, shop_description = ? WHERE username = ?',
      [shop_name || null, shop_address || null, shop_description || null, req.user.username]
    );
    res.json({ success: true, message: '店家資訊已更新' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 查詢所有任務
// 獲取任務（前端用）
app.get('/api/tasks', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    // Join items 表格以獲取道具名稱，Join ar_models 獲取 3D 模型
    const [rows] = await conn.execute(`
      SELECT t.*, 
             i_req.name as required_item_name, i_req.image_url as required_item_image, i_req.model_url as required_item_model,
             i_rew.name as reward_item_name, i_rew.image_url as reward_item_image, i_rew.model_url as reward_item_model,
             am.url as ar_model_url, am.scale as ar_model_scale
      FROM tasks t
      LEFT JOIN items i_req ON t.required_item_id = i_req.id
      LEFT JOIN items i_rew ON t.reward_item_id = i_rew.id
      LEFT JOIN ar_models am ON t.ar_model_id = am.id
      WHERE 1=1 ORDER BY t.id DESC
    `);
    res.json({ success: true, tasks: rows.map(sanitizeTaskRow) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 獲取任務（管理後台用，根據用戶角色篩選）
app.get('/api/tasks/admin', authenticateToken, requireRole('shop', 'admin'), async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user.username;
    const userRole = req.user.role;

    let query, params;

    if (userRole === 'admin') {
      // 管理員可以看到所有任務
      query = 'SELECT * FROM tasks ORDER BY id DESC';
      params = [];
    } else {
      // 商店只能看到自己創建的任務
      query = 'SELECT * FROM tasks WHERE created_by = ? ORDER BY id DESC';
      params = [username];
    }

    const [rows] = await conn.execute(query, params);
    res.json({ success: true, tasks: rows.map(sanitizeTaskRow), userRole });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// === 劇情任務 (Quest Chains) API ===

// 取得所有劇情 (admin / shop)
app.get('/api/quest-chains', staffOrAdminAuth, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const { username, role } = req.user || {};
    // admin 看全部；shop 只看自己建立的劇情
    const [rows] = await conn.execute(
      role === 'admin'
        ? 'SELECT * FROM quest_chains ORDER BY id DESC'
        : 'SELECT * FROM quest_chains WHERE created_by = ? ORDER BY id DESC',
      role === 'admin' ? [] : [username]
    );
    res.json({ success: true, questChains: rows.map(sanitizeQuestChainRow) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 新增劇情 (支援圖片上傳)
app.post('/api/quest-chains', staffOrAdminAuth, uploadImage.single('badge_image'), async (req, res) => {
  const {
    title, description, chain_points, badge_name,
    mode_type, is_active, cover_image_url, short_description,
    entry_order, entry_button_text, entry_scene_label, play_style, experience_mode,
    game_rules, content_blueprint
  } = req.body;
  if (!title) return res.status(400).json({ success: false, message: '缺少標題' });

  const creator = req.user?.username || req.user?.username;
  
  // 處理上傳的圖片
  let badge_image = null;
  if (req.file) {
    badge_image = '/images/' + req.file.filename;
  } else if (cover_image_url || req.body.badge_image_url) {
     // 如果有提供 URL (兼容舊方式或直接輸入)
     badge_image = cover_image_url || req.body.badge_image_url;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const questChainColumns = await getTableColumnSet(conn, 'quest_chains');
    const questChainRecord = {
      title,
      name: title,
      description: description || '',
      chain_points: chain_points || 0,
      badge_name: badge_name || null,
      badge_image: badge_image || null,
      created_by: creator,
      mode_type: normalizeNullableString(mode_type) || 'story_campaign',
      is_active: normalizeBoolean(is_active),
      cover_image: badge_image || null,
      short_description: normalizeNullableString(short_description),
      entry_order: entry_order ? Number(entry_order) : 0,
      entry_button_text: normalizeNullableString(entry_button_text),
      entry_scene_label: normalizeNullableString(entry_scene_label),
      play_style: normalizeNullableString(play_style),
      experience_mode: normalizeExperienceMode(experience_mode, { play_style, game_rules, content_blueprint }),
      game_rules: stringifyJsonField(parseJsonField(game_rules, null)),
      content_blueprint: stringifyJsonField(parseJsonField(content_blueprint, null))
    };
    const filteredRecord = Object.fromEntries(
      Object.entries(questChainRecord).filter(([column]) => questChainColumns.has(column))
    );
    const [insertHeader] = await insertDynamicRecord(conn, 'quest_chains', filteredRecord);
    res.json({ success: true, message: '劇情建立成功', id: insertHeader.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 更新劇情入口
app.put('/api/quest-chains/:id', staffOrAdminAuth, uploadImage.single('badge_image'), async (req, res) => {
  const { id } = req.params;
  const {
    title, description, chain_points, badge_name,
    mode_type, is_active, cover_image_url, short_description,
    entry_order, entry_button_text, entry_scene_label, play_style, experience_mode,
    game_rules, content_blueprint
  } = req.body;
  if (!title) return res.status(400).json({ success: false, message: '缺少標題' });

  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username || null;
    const role = req.user?.role || null;
    const [rows] = await conn.execute('SELECT * FROM quest_chains WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '找不到此玩法入口' });
    }

    const chain = rows[0];
    if (role !== 'admin' && chain.created_by !== username) {
      return res.status(403).json({ success: false, message: '無權限編輯此玩法入口' });
    }

    let badge_image = chain.badge_image || chain.cover_image || null;
    if (req.file) {
      badge_image = '/images/' + req.file.filename;
    } else if (cover_image_url || req.body.badge_image_url) {
      badge_image = cover_image_url || req.body.badge_image_url;
    }

    const questChainColumns = await getTableColumnSet(conn, 'quest_chains');
    const questChainRecord = {
      title,
      name: title,
      description: description || '',
      chain_points: chain_points || 0,
      badge_name: badge_name || null,
      badge_image: badge_image || null,
      mode_type: normalizeNullableString(mode_type) || 'story_campaign',
      is_active: normalizeBoolean(is_active),
      cover_image: badge_image || null,
      short_description: normalizeNullableString(short_description),
      entry_order: entry_order ? Number(entry_order) : 0,
      entry_button_text: normalizeNullableString(entry_button_text),
      entry_scene_label: normalizeNullableString(entry_scene_label),
      play_style: normalizeNullableString(play_style),
      experience_mode: normalizeExperienceMode(experience_mode, { play_style, game_rules, content_blueprint }),
      game_rules: stringifyJsonField(parseJsonField(game_rules, null)),
      content_blueprint: stringifyJsonField(parseJsonField(content_blueprint, null))
    };
    const filteredRecord = Object.fromEntries(
      Object.entries(questChainRecord).filter(([column]) => questChainColumns.has(column))
    );
    await updateDynamicRecord(conn, 'quest_chains', id, filteredRecord);
    res.json({ success: true, message: '玩法入口更新成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/game-entries', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const questChainColumns = await getTableColumnSet(conn, 'quest_chains');
    const hasModeType = questChainColumns.has('mode_type');
    const hasIsActive = questChainColumns.has('is_active');
    const query = hasModeType
      ? `SELECT * FROM quest_chains ${hasIsActive ? 'WHERE is_active = TRUE' : ''} ORDER BY entry_order ASC, id ASC`
      : 'SELECT * FROM quest_chains ORDER BY id ASC';
    const [rows] = await conn.execute(query);
    const entries = rows.map(sanitizeQuestChainRow);
    res.json({
      success: true,
      storyCampaigns: entries.filter(entry => (entry.mode_type || 'story_campaign') === 'story_campaign'),
      boardGames: entries.filter(entry => entry.mode_type === 'board_game')
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/quest-chains/:id/public-content', async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    const questChainColumns = await getTableColumnSet(conn, 'quest_chains');
    const taskColumns = await getTableColumnSet(conn, 'tasks');
    const titleExpr = questChainColumns.has('title') ? 'COALESCE(title, name)' : 'name';
    const [chains] = await conn.execute(`SELECT *, ${titleExpr} AS resolved_title FROM quest_chains WHERE id = ? LIMIT 1`, [id]);
    if (!chains.length) {
      return res.status(404).json({ success: false, message: '找不到此劇情' });
    }
    const activeFilter = taskColumns.has('is_active') ? 'AND (is_active = TRUE OR is_active IS NULL)' : '';
    const [tasks] = await conn.execute(
      `SELECT * FROM tasks WHERE quest_chain_id = ? ${activeFilter} ORDER BY quest_order ASC, id ASC`,
      [id]
    );
    res.json({
      success: true,
      questChain: sanitizeQuestChainRow({ ...chains[0], title: chains[0].resolved_title }),
      tasks: tasks.map(sanitizeTaskRow)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 後台：刪除玩法入口前的影響範圍
app.get('/api/quest-chains/:id/delete-impact', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  const username = req.user?.username || null;
  const userRole = req.user?.role || null;

  let conn;
  try {
    conn = await pool.getConnection();
    const [questRows] = await conn.execute(
      'SELECT id, title, name, created_by, mode_type FROM quest_chains WHERE id = ? LIMIT 1',
      [id]
    );
    if (!questRows.length) {
      return res.status(404).json({ success: false, message: '找不到此玩法入口' });
    }

    const questChain = sanitizeQuestChainRow(questRows[0]);
    if (userRole !== 'admin' && questChain.created_by !== username) {
      return res.status(403).json({ success: false, message: '無權限查看此玩法入口' });
    }

    const [taskRows] = await conn.execute(
      'SELECT id, name, quest_order, task_type, validation_mode FROM tasks WHERE quest_chain_id = ? ORDER BY COALESCE(quest_order, 9999), id ASC',
      [id]
    );
    const [boardMapRows] = await conn.execute(
      'SELECT id, name, finish_tile, play_style FROM board_maps WHERE quest_chain_id = ? ORDER BY id ASC',
      [id]
    );
    const [tileRows] = await conn.execute(
      `SELECT bt.id, bt.tile_index, bt.tile_name, bt.tile_type, bt.board_map_id, bm.name AS board_map_name
       FROM board_tiles bt
       INNER JOIN board_maps bm ON bm.id = bt.board_map_id
       WHERE bm.quest_chain_id = ?
       ORDER BY bt.board_map_id ASC, bt.tile_index ASC`,
      [id]
    );
    const [userQuestRows] = await conn.execute(
      'SELECT COUNT(*) AS total FROM user_quests WHERE quest_chain_id = ?',
      [id]
    );
    const [userTaskRows] = await conn.execute(
      `SELECT COUNT(*) AS total
       FROM user_tasks ut
       INNER JOIN tasks t ON t.id = ut.task_id
       WHERE t.quest_chain_id = ?`,
      [id]
    );

    res.json({
      success: true,
      questChain,
      impact: {
        taskCount: taskRows.length,
        tasks: taskRows.map((row) => sanitizeTaskRow(row)),
        boardMapCount: boardMapRows.length,
        boardMaps: boardMapRows,
        boardTileCount: tileRows.length,
        boardTiles: tileRows,
        userQuestCount: Number(userQuestRows[0]?.total || 0),
        userTaskCount: Number(userTaskRows[0]?.total || 0)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '載入刪除影響範圍失敗' });
  } finally {
    if (conn) conn.release();
  }
});

// 後台：主結構可視化地圖資料
app.get('/api/quest-chains/:id/structure-map', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    const [questRows] = await conn.execute(
      `SELECT id, title, name, short_description, description, mode_type, experience_mode, play_style,
              badge_name, badge_image, cover_image, chain_points, is_active,
              game_rules, content_blueprint, created_by
       FROM quest_chains
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    if (!questRows.length) {
      return res.status(404).json({ success: false, message: '找不到此玩法入口' });
    }

    const questChain = sanitizeQuestChainRow(questRows[0]);
    const [taskRows] = await conn.execute(
      `SELECT t.*,
              req_item.name AS required_item_name,
              rew_item.name AS reward_item_name
       FROM tasks t
       LEFT JOIN items req_item ON req_item.id = t.required_item_id
       LEFT JOIN items rew_item ON rew_item.id = t.reward_item_id
       WHERE t.quest_chain_id = ?
       ORDER BY COALESCE(t.quest_order, 9999) ASC, t.id ASC`,
      [id]
    );
    const [boardMapRows] = await conn.execute(
      `SELECT bm.*,
              COUNT(bt.id) AS tile_count,
              SUM(CASE WHEN bt.tile_type = 'challenge' THEN 1 ELSE 0 END) AS challenge_tile_count,
              SUM(CASE WHEN bt.tile_type IN ('event','story','fortune','chance','quiz') THEN 1 ELSE 0 END) AS event_tile_count
       FROM board_maps bm
       LEFT JOIN board_tiles bt ON bt.board_map_id = bm.id
       WHERE bm.quest_chain_id = ?
       GROUP BY bm.id
       ORDER BY bm.id ASC`,
      [id]
    );
    const boardMaps = boardMapRows.map((row) => sanitizeBoardMapRow(row));
    const boardMapIds = boardMaps.map((map) => map.id);
    let boardTiles = [];
    if (boardMapIds.length > 0) {
      const placeholders = boardMapIds.map(() => '?').join(',');
      const [tileRows] = await conn.execute(
        `SELECT bt.*,
                t.name AS task_name,
                t.validation_mode,
                t.stage_template,
                t.task_type AS linked_task_type,
                t.bgm_url AS linked_bgm_url,
                req_item.name AS required_item_name,
                rew_item.name AS reward_item_name
         FROM board_tiles bt
         LEFT JOIN tasks t ON t.id = bt.task_id
         LEFT JOIN items req_item ON req_item.id = t.required_item_id
         LEFT JOIN items rew_item ON rew_item.id = t.reward_item_id
         WHERE bt.board_map_id IN (${placeholders})
         ORDER BY bt.board_map_id ASC, bt.tile_index ASC`,
        boardMapIds
      );
      boardTiles = tileRows.map((row) => sanitizeBoardTileRow(row));
    }

    res.json({
      success: true,
      questChain,
      tasks: taskRows.map((row) => sanitizeTaskRow(row)),
      boardMaps,
      boardTiles
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '載入結構地圖失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/board-maps/by-quest-chain/:questChainId', async (req, res) => {
  const { questChainId } = req.params;
  const requestedBoardMapId = Number(req.query.boardMapId || 0);
  const previewMode = req.query.preview === '1';
  const previewUser = getOptionalTokenUser(req);
  const canPreviewInactive = previewMode && ['admin', 'shop', 'staff'].includes(previewUser?.role);
  let conn;
  try {
    conn = await pool.getConnection();
    const [questRows] = await conn.execute(
      `SELECT id, title, name, short_description, description, mode_type, experience_mode, play_style, game_rules, content_blueprint, is_active
       FROM quest_chains
       WHERE id = ?
       LIMIT 1`,
      [questChainId]
    );
    const questChain = questRows[0] || null;
    const [maps] = await conn.execute(
      `SELECT bm.*,
              COUNT(bt.id) AS tile_count,
              SUM(CASE WHEN bt.tile_type = 'challenge' THEN 1 ELSE 0 END) AS challenge_tile_count,
              SUM(CASE WHEN bt.tile_type = 'event' THEN 1 ELSE 0 END) AS event_tile_count
       FROM board_maps bm
       LEFT JOIN board_tiles bt ON bt.board_map_id = bm.id AND bt.is_active = TRUE
       WHERE bm.quest_chain_id = ? AND (? = TRUE OR bm.is_active = TRUE)
       GROUP BY bm.id
       ORDER BY bm.id ASC`,
      [questChainId, canPreviewInactive]
    );
    if (!maps.length) {
      return res.status(404).json({ success: false, message: '找不到對應的大富翁地圖' });
    }
    const boardMap = (requestedBoardMapId
      ? maps.find((map) => Number(map.id) === requestedBoardMapId)
      : null) || maps[0];
    const [tiles] = await conn.execute(
      `SELECT bt.*, t.name AS task_name, t.description AS task_description, t.validation_mode, t.stage_template,
              t.task_type AS linked_task_type, t.submission_type AS linked_submission_type, t.hint_text, t.points AS task_points
       FROM board_tiles bt
       LEFT JOIN tasks t ON bt.task_id = t.id
       WHERE bt.board_map_id = ? AND bt.is_active = TRUE
       ORDER BY bt.tile_index ASC`,
      [boardMap.id]
    );
    res.json({
      success: true,
      questChain: sanitizeQuestChainRow(questChain),
      boardMap: sanitizeBoardMapRow(boardMap),
      boardMaps: maps.map((row) => sanitizeBoardMapRow(row)),
      tiles: tiles.map((row) => sanitizeBoardTileRow(row))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 後台：依玩法入口列出大富翁地圖（無地圖時仍 200，供控制台建立流程）
app.get('/api/board-maps/for-admin/:questChainId', staffOrAdminAuth, async (req, res) => {
  const { questChainId } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    const [maps] = await conn.execute(
      `SELECT bm.*,
              (SELECT COUNT(*) FROM board_tiles bt WHERE bt.board_map_id = bm.id) AS tile_count,
              (SELECT COUNT(*) FROM board_tiles bt WHERE bt.board_map_id = bm.id AND bt.tile_type = 'challenge') AS challenge_tile_count,
              (SELECT COUNT(*) FROM board_tiles bt WHERE bt.board_map_id = bm.id AND bt.tile_type = 'event') AS event_tile_count
       FROM board_maps bm
       WHERE bm.quest_chain_id = ?
       ORDER BY bm.id ASC`,
      [questChainId]
    );
    res.json({
      success: true,
      boardMaps: maps.map((row) => sanitizeBoardMapRow(row))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '載入大富翁地圖失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/board-maps/admin', staffOrAdminAuth, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const [maps] = await conn.execute(`
      SELECT bm.*, qc.title AS quest_chain_title, qc.mode_type, qc.is_active AS quest_chain_active,
             COUNT(bt.id) AS tile_count,
             SUM(CASE WHEN bt.tile_type = 'challenge' THEN 1 ELSE 0 END) AS challenge_tile_count,
             SUM(CASE WHEN bt.tile_type = 'event' THEN 1 ELSE 0 END) AS event_tile_count
      FROM board_maps bm
      LEFT JOIN quest_chains qc ON bm.quest_chain_id = qc.id
      LEFT JOIN board_tiles bt ON bt.board_map_id = bm.id
      GROUP BY bm.id, qc.title, qc.mode_type, qc.is_active
      ORDER BY bm.is_active DESC, bm.id DESC
    `);
    res.json({
      success: true,
      boardMaps: maps.map((row) => sanitizeBoardMapRow(row))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '載入大富翁地圖失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/board-maps', staffOrAdminAuth, async (req, res) => {
  const {
    quest_chain_id,
    name,
    description,
    play_style,
    cover_image,
    center_lat,
    center_lng,
    max_rounds,
    start_tile,
    finish_tile,
    dice_min,
    dice_max,
    failure_move,
    exact_finish_required,
    reward_points,
    is_active,
    rules_json
  } = req.body || {};

  if (!quest_chain_id || !name) {
    return res.status(400).json({ success: false, message: '缺少 quest_chain_id 或 name' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const [chains] = await conn.execute('SELECT id, mode_type FROM quest_chains WHERE id = ? LIMIT 1', [quest_chain_id]);
    if (!chains.length) {
      return res.status(404).json({ success: false, message: '找不到對應玩法入口' });
    }

    const [insertResult] = await conn.execute(
      `INSERT INTO board_maps
       (quest_chain_id, name, description, play_style, cover_image, center_lat, center_lng, max_rounds,
        start_tile, finish_tile, dice_min, dice_max, failure_move, exact_finish_required, reward_points,
        is_active, rules_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(quest_chain_id),
        name,
        normalizeNullableString(description),
        normalizeNullableString(play_style) || 'fixed_track_race',
        normalizeNullableString(cover_image),
        normalizeNullableString(center_lat),
        normalizeNullableString(center_lng),
        normalizeNullableString(max_rounds),
        Number(start_tile || 1),
        Number(finish_tile || 10),
        Number(dice_min || 1),
        Number(dice_max || 6),
        Number(failure_move ?? -1),
        normalizeBoolean(exact_finish_required),
        Number(reward_points || 0),
        normalizeBoolean(is_active),
        stringifyJsonField(rules_json),
        req.user?.username || null
      ]
    );
    res.json({
      success: true,
      message: '大富翁地圖建立成功',
      id: insertResult.insertId
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '建立大富翁地圖失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.put('/api/board-maps/:id', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  const {
    quest_chain_id,
    name,
    description,
    play_style,
    cover_image,
    center_lat,
    center_lng,
    max_rounds,
    start_tile,
    finish_tile,
    dice_min,
    dice_max,
    failure_move,
    exact_finish_required,
    reward_points,
    is_active,
    rules_json
  } = req.body || {};

  if (!quest_chain_id || !name) {
    return res.status(400).json({ success: false, message: '缺少 quest_chain_id 或 name' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute(
      `UPDATE board_maps
       SET quest_chain_id = ?, name = ?, description = ?, play_style = ?, cover_image = ?,
           center_lat = ?, center_lng = ?, max_rounds = ?, start_tile = ?, finish_tile = ?,
           dice_min = ?, dice_max = ?, failure_move = ?, exact_finish_required = ?, reward_points = ?,
           is_active = ?, rules_json = ?
       WHERE id = ?`,
      [
        Number(quest_chain_id),
        name,
        normalizeNullableString(description),
        normalizeNullableString(play_style) || 'fixed_track_race',
        normalizeNullableString(cover_image),
        normalizeNullableString(center_lat),
        normalizeNullableString(center_lng),
        normalizeNullableString(max_rounds),
        Number(start_tile || 1),
        Number(finish_tile || 10),
        Number(dice_min || 1),
        Number(dice_max || 6),
        Number(failure_move ?? -1),
        normalizeBoolean(exact_finish_required),
        Number(reward_points || 0),
        normalizeBoolean(is_active),
        stringifyJsonField(rules_json),
        Number(id)
      ]
    );
    res.json({ success: true, message: '大富翁地圖更新成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '更新大富翁地圖失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.delete('/api/board-maps/:id', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute('DELETE FROM board_maps WHERE id = ?', [id]);
    res.json({ success: true, message: '大富翁地圖已刪除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '刪除大富翁地圖失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/board-maps/:boardMapId/tiles', staffOrAdminAuth, async (req, res) => {
  const { boardMapId } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    const [tiles] = await conn.execute(
      `SELECT bt.*, t.name AS task_name, t.validation_mode, t.task_type
       FROM board_tiles bt
       LEFT JOIN tasks t ON bt.task_id = t.id
       WHERE bt.board_map_id = ?
       ORDER BY bt.tile_index ASC, bt.id ASC`,
      [boardMapId]
    );
    res.json({
      success: true,
      tiles: tiles.map((row) => sanitizeBoardTileRow(row))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '載入格子列表失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/board-maps/:boardMapId/tiles', staffOrAdminAuth, async (req, res) => {
  const { boardMapId } = req.params;
  const {
    tile_index,
    tile_name,
    tile_type,
    latitude,
    longitude,
    radius_meters,
    task_id,
    effect_type,
    effect_value,
    event_title,
    event_body,
    guide_content,
    tile_meta,
    is_active
  } = req.body || {};

  if (!tile_index || !tile_name || !tile_type) {
    return res.status(400).json({ success: false, message: '缺少格子編號、名稱或類型' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute(
      `INSERT INTO board_tiles
       (board_map_id, tile_index, tile_name, tile_type, latitude, longitude, radius_meters, task_id,
        effect_type, effect_value, event_title, event_body, guide_content, tile_meta, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(boardMapId),
        Number(tile_index),
        tile_name,
        tile_type,
        normalizeNullableString(latitude),
        normalizeNullableString(longitude),
        normalizeNullableString(radius_meters),
        normalizeNullableString(task_id),
        normalizeNullableString(effect_type),
        normalizeNullableString(effect_value),
        normalizeNullableString(event_title),
        normalizeNullableString(event_body),
        normalizeNullableString(guide_content),
        stringifyJsonField(tile_meta),
        normalizeBoolean(is_active)
      ]
    );
    res.json({ success: true, message: '格子建立成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '建立格子失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.put('/api/board-tiles/:id', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  const {
    board_map_id,
    tile_index,
    tile_name,
    tile_type,
    latitude,
    longitude,
    radius_meters,
    task_id,
    effect_type,
    effect_value,
    event_title,
    event_body,
    guide_content,
    tile_meta,
    is_active
  } = req.body || {};

  if (!board_map_id || !tile_index || !tile_name || !tile_type) {
    return res.status(400).json({ success: false, message: '缺少格子資料' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute(
      `UPDATE board_tiles
       SET board_map_id = ?, tile_index = ?, tile_name = ?, tile_type = ?, latitude = ?, longitude = ?,
           radius_meters = ?, task_id = ?, effect_type = ?, effect_value = ?, event_title = ?, event_body = ?,
           guide_content = ?, tile_meta = ?, is_active = ?
       WHERE id = ?`,
      [
        Number(board_map_id),
        Number(tile_index),
        tile_name,
        tile_type,
        normalizeNullableString(latitude),
        normalizeNullableString(longitude),
        normalizeNullableString(radius_meters),
        normalizeNullableString(task_id),
        normalizeNullableString(effect_type),
        normalizeNullableString(effect_value),
        normalizeNullableString(event_title),
        normalizeNullableString(event_body),
        normalizeNullableString(guide_content),
        stringifyJsonField(tile_meta),
        normalizeBoolean(is_active),
        Number(id)
      ]
    );
    res.json({ success: true, message: '格子更新成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '更新格子失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.delete('/api/board-tiles/:id', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute('DELETE FROM board_tiles WHERE id = ?', [id]);
    res.json({ success: true, message: '格子已刪除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '刪除格子失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/board/session/start', authenticateToken, async (req, res) => {
  const { questChainId, boardMapId, preview } = req.body;
  if (!questChainId) {
    return res.status(400).json({ success: false, message: '缺少 questChainId' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const userId = await getUserIdByUsername(conn, req.user.username);
    if (!userId) {
      return res.status(400).json({ success: false, message: '使用者不存在' });
    }

    const canPreviewInactive = Boolean(preview) && ['admin', 'shop', 'staff'].includes(req.user?.role);
    const mapSql = boardMapId
      ? 'SELECT * FROM board_maps WHERE quest_chain_id = ? AND id = ? AND (? = TRUE OR is_active = TRUE) ORDER BY id ASC LIMIT 1'
      : 'SELECT * FROM board_maps WHERE quest_chain_id = ? AND (? = TRUE OR is_active = TRUE) ORDER BY id ASC LIMIT 1';
    const mapParams = boardMapId
      ? [questChainId, Number(boardMapId), canPreviewInactive]
      : [questChainId, canPreviewInactive];
    const [maps] = await conn.execute(mapSql, mapParams);
    if (!maps.length) {
      return res.status(404).json({ success: false, message: '找不到對應的大富翁地圖' });
    }
    const boardMap = maps[0];

    const [existing] = await conn.execute(
      `SELECT * FROM user_game_sessions
       WHERE user_id = ? AND mode_type = 'board_game' AND quest_chain_id = ? AND board_map_id = ? AND status = 'active'
       ORDER BY id DESC LIMIT 1`,
      [userId, questChainId, boardMap.id]
    );

    let sessionId = existing[0]?.id || null;
    if (!sessionId) {
      const [insertResult] = await conn.execute(
        `INSERT INTO user_game_sessions
         (user_id, mode_type, quest_chain_id, board_map_id, status, current_tile, round_count, gained_points)
         VALUES (?, 'board_game', ?, ?, 'active', ?, 0, 0)`,
        [userId, questChainId, boardMap.id, Number(boardMap.start_tile || 1)]
      );
      sessionId = insertResult.insertId;
    }

    const [sessions] = await conn.execute('SELECT * FROM user_game_sessions WHERE id = ? LIMIT 1', [sessionId]);
    res.json({ success: true, session: sanitizeBoardSessionRow(sessions[0]), boardMap: { ...boardMap, rules_json: parseJsonField(boardMap.rules_json, null) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '啟動大富翁 session 失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/board/session/:sessionId/roll', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    const userId = await getUserIdByUsername(conn, req.user.username);
    if (!userId) {
      return res.status(400).json({ success: false, message: '使用者不存在' });
    }

    const [sessions] = await conn.execute(
      'SELECT * FROM user_game_sessions WHERE id = ? AND user_id = ? LIMIT 1',
      [sessionId, userId]
    );
    if (!sessions.length) {
      return res.status(404).json({ success: false, message: '找不到這場大富翁 session' });
    }

    const session = sanitizeBoardSessionRow(sessions[0]);
    if (session.pending_target_tile) {
      return res.status(400).json({ success: false, message: '目前已有待結算的回合' });
    }

    const [maps] = await conn.execute('SELECT * FROM board_maps WHERE id = ? LIMIT 1', [session.board_map_id]);
    if (!maps.length) {
      return res.status(404).json({ success: false, message: '找不到棋盤資料' });
    }
    const boardMap = maps[0];

    const diceMin = Number(boardMap.dice_min || 1);
    const diceMax = Number(boardMap.dice_max || 6);
    const rules = parseJsonField(boardMap.rules_json, null) || {};
    const tutorialRollSequence = Array.isArray(rules.tutorial_roll_sequence)
      ? rules.tutorial_roll_sequence.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
      : [];
    const scriptedRoll = tutorialRollSequence.length
      ? tutorialRollSequence[Number(session.round_count || 0) % tutorialRollSequence.length]
      : null;
    const rollValue = scriptedRoll && scriptedRoll >= diceMin && scriptedRoll <= diceMax
      ? scriptedRoll
      : (Math.floor(Math.random() * (diceMax - diceMin + 1)) + diceMin);
    const finishTile = Number(boardMap.finish_tile || session.current_tile);
    const exactFinishRequired = Boolean(boardMap.exact_finish_required);
    const desiredTile = session.current_tile + rollValue;
    const targetTileIndex = exactFinishRequired && desiredTile > finishTile
      ? session.current_tile
      : Math.min(desiredTile, finishTile);

    const [tiles] = await conn.execute(
      `SELECT bt.*, t.name AS task_name, t.description AS task_description, t.validation_mode, t.stage_template, t.points AS task_points
       FROM board_tiles bt
       LEFT JOIN tasks t ON bt.task_id = t.id
       WHERE bt.board_map_id = ? AND bt.tile_index = ? LIMIT 1`,
      [boardMap.id, targetTileIndex]
    );
    if (!tiles.length) {
      return res.status(404).json({ success: false, message: '找不到目標格子' });
    }

    const targetTile = tiles[0];
    await conn.execute(
      `UPDATE user_game_sessions
       SET pending_roll = ?, pending_target_tile = ?, last_result = ?
       WHERE id = ?`,
      [
        rollValue,
        targetTileIndex,
        JSON.stringify({
          phase: 'rolled',
          rollValue,
          targetTileIndex,
          tileName: targetTile.tile_name,
          message: `命運之骰顯示 ${rollValue}，請前往第 ${targetTileIndex} 格「${targetTile.tile_name || '未命名格子'}」。`
        }),
        session.id
      ]
    );

    const [updatedRows] = await conn.execute('SELECT * FROM user_game_sessions WHERE id = ? LIMIT 1', [session.id]);
    res.json({
      success: true,
      session: sanitizeBoardSessionRow(updatedRows[0]),
      rollValue,
      targetTile: {
        ...targetTile,
        tile_meta: parseJsonField(targetTile.tile_meta, null)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '擲骰失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/board/session/:sessionId/resolve', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const { success } = req.body;
  if (typeof success !== 'boolean') {
    return res.status(400).json({ success: false, message: '缺少 success 狀態' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const userId = await getUserIdByUsername(conn, req.user.username);
    if (!userId) {
      return res.status(400).json({ success: false, message: '使用者不存在' });
    }

    const [sessions] = await conn.execute(
      'SELECT * FROM user_game_sessions WHERE id = ? AND user_id = ? LIMIT 1',
      [sessionId, userId]
    );
    if (!sessions.length) {
      return res.status(404).json({ success: false, message: '找不到這場大富翁 session' });
    }

    const session = sanitizeBoardSessionRow(sessions[0]);
    if (!session.pending_target_tile) {
      return res.status(400).json({ success: false, message: '目前沒有待結算的回合' });
    }

    const [maps] = await conn.execute('SELECT * FROM board_maps WHERE id = ? LIMIT 1', [session.board_map_id]);
    if (!maps.length) {
      return res.status(404).json({ success: false, message: '找不到棋盤資料' });
    }
    const boardMap = maps[0];

    const [tiles] = await conn.execute(
      `SELECT bt.*, t.points AS task_points
       FROM board_tiles bt
       LEFT JOIN tasks t ON bt.task_id = t.id
       WHERE bt.board_map_id = ? AND bt.tile_index = ? LIMIT 1`,
      [boardMap.id, session.pending_target_tile]
    );
    const pendingTile = tiles[0] || null;

    const failureMove = Number(boardMap.failure_move || -1);
    const nextTile = success
      ? session.pending_target_tile
      : Math.max(Number(boardMap.start_tile || 1), session.current_tile + failureMove);
    const gainedPoints = success
      ? Number(session.gained_points || 0) + Number(pendingTile?.task_points || pendingTile?.effect_value || 0)
      : Number(session.gained_points || 0);
    const nextRound = Number(session.round_count || 0) + 1;
    const finishTile = Number(boardMap.finish_tile || nextTile);
    const nextStatus = nextTile >= finishTile ? 'completed' : 'active';
    const turnPoints = Number(pendingTile?.task_points || pendingTile?.effect_value || 0);
    const tileName = pendingTile?.tile_name || pendingTile?.event_title || '未命名格子';
    let resolveMessage = '';
    if (success) {
      if (pendingTile?.tile_type === 'event') {
        resolveMessage = `${pendingTile?.event_title || tileName} 已觸發，你的隊伍推進到第 ${nextTile} 格。`;
      } else {
        resolveMessage = `「${tileName}」判定通過，你的隊伍推進到第 ${nextTile} 格。`;
      }
      if (turnPoints > 0) {
        resolveMessage += ` 本回合獲得 ${turnPoints} 點旅程積分。`;
      }
      if (nextStatus === 'completed') {
        resolveMessage += ' 你已抵達終點。';
      }
    } else {
      resolveMessage = `「${tileName}」未通過，依棋盤規則退回到第 ${nextTile} 格。`;
    }

    await conn.execute(
      `UPDATE user_game_sessions
       SET current_tile = ?, round_count = ?, gained_points = ?, pending_roll = NULL, pending_target_tile = NULL,
           status = ?, completed_at = ${nextStatus === 'completed' ? 'NOW()' : 'NULL'}, last_result = ?
       WHERE id = ?`,
      [
        nextTile,
        nextRound,
        gainedPoints,
        nextStatus,
        JSON.stringify({
          phase: 'resolved',
          success,
          nextTile,
          roundCount: nextRound,
          gainedPoints,
          tileName,
          tileType: pendingTile?.tile_type || null,
          message: resolveMessage
        }),
        session.id
      ]
    );

    // 將本回合積分寫入 point_transactions
    if (success && turnPoints > 0 && userId) {
      try {
        await conn.execute(
          'INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'earned', turnPoints, `棋盤回合: ${tileName}`, 'board_game_turn', session.id]
        );
      } catch (ptErr) {
        console.warn('棋盤積分寫入 point_transactions 失敗:', ptErr.message);
      }
    }

    const [updatedRows] = await conn.execute('SELECT * FROM user_game_sessions WHERE id = ? LIMIT 1', [session.id]);
    res.json({ success: true, session: sanitizeBoardSessionRow(updatedRows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '結算回合失敗' });
  } finally {
    if (conn) conn.release();
  }
});

// 刪除劇情
app.delete('/api/quest-chains/:id', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  const username = req.user?.username || req.user?.username;
  const userRole = req.user?.role;

  let conn;
  try {
    conn = await pool.getConnection();
    
    // 1. 檢查權限與擁有者
    const [quests] = await conn.execute('SELECT created_by FROM quest_chains WHERE id = ?', [id]);
    if (quests.length === 0) {
      return res.status(404).json({ success: false, message: '找不到此劇情' });
    }
    
    // Admin 可以刪除所有；Shop 只能刪除自己的
    if (userRole !== 'admin' && quests[0].created_by !== username) {
      return res.status(403).json({ success: false, message: '無權限刪除此劇情' });
    }

    // 2. 統計將一併刪除的子內容
    const [tasks] = await conn.execute(
      'SELECT id, name, quest_order, task_type, validation_mode FROM tasks WHERE quest_chain_id = ? ORDER BY COALESCE(quest_order, 9999), id ASC',
      [id]
    );
    const [boardMaps] = await conn.execute(
      'SELECT id, name, finish_tile, play_style FROM board_maps WHERE quest_chain_id = ? ORDER BY id ASC',
      [id]
    );
    const [tileRows] = await conn.execute(
      `SELECT bt.id
       FROM board_tiles bt
       INNER JOIN board_maps bm ON bm.id = bt.board_map_id
       WHERE bm.quest_chain_id = ?`,
      [id]
    );
    // 3. 執行刪除（使用事務確保數據一致性）
    await conn.beginTransaction();
    try {
      // 先刪除棋盤遊戲 session
      await conn.execute('DELETE FROM user_game_sessions WHERE quest_chain_id = ?', [id]);

      // 刪除關聯任務的玩家進度（task_attempts 會隨 user_tasks cascade）
      if (tasks.length > 0) {
        await conn.execute(
          `DELETE ut
           FROM user_tasks ut
           INNER JOIN tasks t ON t.id = ut.task_id
           WHERE t.quest_chain_id = ?`,
          [id]
        );
      }

      // 先刪除用戶的劇情進度
      await conn.execute('DELETE FROM user_quests WHERE quest_chain_id = ?', [id]);

      // 清理 point_transactions 中的劇情完成關聯紀錄
      await conn.execute(
        'UPDATE point_transactions SET reference_id = NULL, description = CONCAT(description, " (劇情已刪除)") WHERE reference_type = "quest_chain_completion" AND reference_id = ?',
        [id]
      );

      // 刪除關聯任務
      if (tasks.length > 0) {
        await conn.execute('DELETE FROM tasks WHERE quest_chain_id = ?', [id]);
      }

      // 刪除棋盤（board_tiles 將隨 FK cascade）
      if (boardMaps.length > 0) {
        await conn.execute('DELETE FROM board_maps WHERE quest_chain_id = ?', [id]);
      }

      // 最後刪除玩法入口
      await conn.execute('DELETE FROM quest_chains WHERE id = ?', [id]);
      
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }
    res.json({
      success: true,
      message: '玩法入口已刪除，關聯內容已一併清理',
      deleted: {
        taskCount: tasks.length,
        boardMapCount: boardMaps.length,
        boardTileCount: tileRows.length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== 3D 模型庫管理 API =====

// 取得所有模型
app.get('/api/ar-models', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT * FROM ar_models ORDER BY id DESC');
    res.json({ success: true, models: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 上傳模型 (Admin/Shop)
app.post('/api/ar-models', staffOrAdminAuth, uploadModel.single('model'), async (req, res) => {
  const { name, scale } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '缺少模型名稱' });
  if (!req.file) return res.status(400).json({ success: false, message: '未選擇檔案' });

  const modelUrl = '/images/' + req.file.filename; // 因為我們還是存在 /images 目錄下 (雖然是 .glb)
  const modelScale = parseFloat(scale) || 1.0;
  const username = req.user?.username || req.user?.username;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute(
      'INSERT INTO ar_models (name, url, scale, created_by) VALUES (?, ?, ?, ?)',
      [name, modelUrl, modelScale, username]
    );
    res.json({ success: true, message: '模型上傳成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== 共用素材庫：背景音樂（僅 admin）=====
app.get('/api/bgm-assets', adminAuth, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute(
      'SELECT id, name, url, created_by, created_at FROM bgm_library ORDER BY id DESC'
    );
    res.json({ success: true, assets: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/bgm-assets', adminAuth, uploadAudio.single('audio'), async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ success: false, message: '請填寫音樂名稱' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: '請選擇音檔' });
  }
  const url = '/images/' + req.file.filename;
  const createdBy = req.user?.username || null;
  let conn;
  try {
    conn = await pool.getConnection();
    const [result] = await conn.execute(
      'INSERT INTO bgm_library (name, url, created_by) VALUES (?, ?, ?)',
      [name, url, createdBy]
    );
    res.json({
      success: true,
      message: '背景音樂已加入素材庫',
      id: result.insertId,
      url
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

app.delete('/api/bgm-assets/:id', adminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, message: '無效的 ID' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT url FROM bgm_library WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到此素材' });
    }
    const url = rows[0].url;
    const [tasks] = await conn.execute('SELECT id FROM tasks WHERE bgm_url = ? LIMIT 1', [url]);
    if (tasks.length > 0) {
      return res.status(400).json({ success: false, message: '有關卡正在使用此音樂，請先改關卡背景音樂再刪除' });
    }
    await conn.execute('DELETE FROM bgm_library WHERE id = ?', [id]);
    res.json({ success: true, message: '已刪除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 刪除模型
app.delete('/api/ar-models/:id', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    
    // 檢查是否有任務引用
    const [tasks] = await conn.execute('SELECT id FROM tasks WHERE ar_model_id = ?', [id]);
    if (tasks.length > 0) {
      return res.status(400).json({ success: false, message: '此模型正被任務使用中，無法刪除' });
    }

    // 刪除檔案 (選擇性實作，目前只刪除 DB 紀錄，保留檔案以防誤刪)
    await conn.execute('DELETE FROM ar_models WHERE id = ?', [id]);
    res.json({ success: true, message: '模型已刪除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== 道具系統 (Item System) API =====

// 取得所有道具
app.get('/api/items', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT * FROM items ORDER BY id DESC');
    res.json({ success: true, items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 新增道具 (Admin/Shop)
app.post('/api/items', staffOrAdminAuth, uploadImage.single('image'), async (req, res) => {
  const { name, description, model_url } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '缺少道具名稱' });

  let image_url = null;
  if (req.file) {
    image_url = '/images/' + req.file.filename;
  } else if (req.body.image_url) {
    image_url = req.body.image_url;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute(
      'INSERT INTO items (name, description, image_url, model_url) VALUES (?, ?, ?, ?)',
      [name, description || '', image_url, model_url || null]
    );
    res.json({ success: true, message: '道具新增成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 編輯道具
app.put('/api/items/:id', staffOrAdminAuth, uploadImage.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, description, model_url } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '缺少道具名稱' });

  let conn;
  try {
    conn = await pool.getConnection();
    
    // 如果有上傳新圖片就更新，否則保留原圖
    let sql, params;
    if (req.file) {
      const image_url = '/images/' + req.file.filename;
      sql = 'UPDATE items SET name = ?, description = ?, image_url = ?, model_url = ? WHERE id = ?';
      params = [name, description || '', image_url, model_url || null, id];
    } else if (req.body.image_url) {
      sql = 'UPDATE items SET name = ?, description = ?, image_url = ?, model_url = ? WHERE id = ?';
      params = [name, description || '', req.body.image_url, model_url || null, id];
    } else {
      sql = 'UPDATE items SET name = ?, description = ?, model_url = ? WHERE id = ?';
      params = [name, description || '', model_url || null, id];
    }

    await conn.execute(sql, params);
    res.json({ success: true, message: '道具更新成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 刪除道具
app.delete('/api/items/:id', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    
    // 檢查是否有任務使用了此道具
    const [tasks] = await conn.execute(
      'SELECT id FROM tasks WHERE required_item_id = ? OR reward_item_id = ?',
      [id, id]
    );
    if (tasks.length > 0) {
      return res.status(400).json({ success: false, message: '此道具被任務引用中，無法刪除' });
    }

    await conn.execute('DELETE FROM items WHERE id = ?', [id]);
    res.json({ success: true, message: '道具已刪除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 管理員發放道具給玩家
app.post('/api/admin/grant-item', staffOrAdminAuth, async (req, res) => {
  const { username, item_id, quantity } = req.body;
  if (!username || !item_id) return res.status(400).json({ success: false, message: '缺少必要參數' });
  const qty = parseInt(quantity) || 1;

  let conn;
  try {
    conn = await pool.getConnection();
    
    // 檢查玩家是否存在
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.status(404).json({ success: false, message: '找不到此玩家帳號' });
    const userId = users[0].id;

    // 檢查道具是否存在
    const [items] = await conn.execute('SELECT id, name FROM items WHERE id = ?', [item_id]);
    if (items.length === 0) return res.status(404).json({ success: false, message: '找不到此道具' });
    const itemName = items[0].name;

    // 發放道具 (檢查是否已有，有則更新數量，無則新增)
    const [inventory] = await conn.execute(
      'SELECT id FROM user_inventory WHERE user_id = ? AND item_id = ?', 
      [userId, item_id]
    );

    if (inventory.length > 0) {
      await conn.execute('UPDATE user_inventory SET quantity = quantity + ? WHERE id = ?', [qty, inventory[0].id]);
    } else {
      await conn.execute('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES (?, ?, ?)', [userId, item_id, qty]);
    }

    res.json({ success: true, message: `已成功發放 ${qty} 個【${itemName}】給 ${username}` });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 取得使用者背包
app.get('/api/user/inventory', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;

  let conn;
  try {
    conn = await pool.getConnection();
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.json({ success: true, inventory: [] });
    const userId = users[0].id;

    const [rows] = await conn.execute(`
      SELECT ui.*, i.name, i.description, i.image_url 
      FROM user_inventory ui
      JOIN items i ON ui.item_id = i.id
      WHERE ui.user_id = ?
    `, [userId]);
    
    res.json({ success: true, inventory: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 新增任務
app.post('/api/tasks', staffOrAdminAuth, async (req, res) => {
  const { 
    name, lat, lng, radius, description, photoUrl, youtubeUrl, ar_image_url, points, 
    task_type, options, correct_answer,
    submission_type, validation_mode, ai_config, pass_criteria, failure_message, success_message,
    max_attempts, location_required,
    // 新增參數
    type, quest_chain_id, quest_order, time_limit_start, time_limit_end, max_participants,
    // 道具參數
    required_item_id, reward_item_id,
    // 劇情結局關卡
    is_final_step,
    // AR 模型 ID 與 順序
    ar_model_id,
    ar_order_model, ar_order_image, ar_order_youtube,
    // 背景音樂
    bgm_url,
    stage_template, stage_intro, hint_text, story_context, guide_content, rescue_content,
    event_config, is_active
  } = req.body;

  console.log('[POST /api/tasks] Received:', req.body);

  const requester = req.user || {};
  const requesterRole = requester.role;
  const requesterName = requester.username;

  const requiresGps = normalizeBoolean(location_required) || task_type === 'location';
  const hasAnyLocationValue = [lat, lng, radius].some((value) => value !== undefined && value !== null && String(value).trim() !== '');
  const hasAllLocationValues = [lat, lng, radius].every((value) => value !== undefined && value !== null && String(value).trim() !== '');

  if (!name || !description || !photoUrl) {
    return res.status(400).json({ success: false, message: '缺少參數' });
  }
  if (requiresGps && !hasAllLocationValues) {
    return res.status(400).json({ success: false, message: '啟用 GPS 位置限制時，必須填寫緯度、經度與觸發半徑。' });
  }
  if (!requiresGps && hasAnyLocationValue && !hasAllLocationValues) {
    return res.status(400).json({ success: false, message: '若要保留座標資料，請完整填寫緯度、經度與觸發半徑。' });
  }

  // 商店新增任務：若指定 quest_chain_id，必須是自己建立的劇情
  if (requesterRole === 'shop' && quest_chain_id) {
    let connCheck;
    try {
      connCheck = await pool.getConnection();
      const [chains] = await connCheck.execute(
        'SELECT id FROM quest_chains WHERE id = ? AND created_by = ?',
        [quest_chain_id, requesterName]
      );
      if (chains.length === 0) {
        return res.status(403).json({ success: false, message: '無權使用其他人建立的劇情' });
      }
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (connCheck) connCheck.release();
    }
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username;
    const pts = Number(points) || 0;
    
    const opts = options ? JSON.stringify(options) : null;
    const validationSettings = prepareTaskValidationSettings({
      task_type,
      submission_type,
      validation_mode,
      ai_config,
      pass_criteria,
      failure_message,
      success_message,
      max_attempts,
      location_required
    });
    const tType = validationSettings.taskType;

    // 檢查 type (single/timed/quest)
    const mainType = ['single', 'timed', 'quest'].includes(type) ? type : 'single';
    
    // 處理時間格式 (如果空字串轉為 null)
    const tStart = time_limit_start || null;
    const tEnd = time_limit_end || null;
    const maxP = max_participants ? Number(max_participants) : null;
    const qId = quest_chain_id ? Number(quest_chain_id) : null;
    const qOrder = quest_order ? Number(quest_order) : null;
    
    const reqItemId = required_item_id ? Number(required_item_id) : null;
    const rewItemId = reward_item_id ? Number(reward_item_id) : null;
    const isFinal = is_final_step === true || is_final_step === 'true' || is_final_step === 1;
    const arModelId = ar_model_id ? Number(ar_model_id) : null;
    
    const orderModel = ar_order_model ? Number(ar_order_model) : null;
    const orderImage = ar_order_image ? Number(ar_order_image) : null;
    const orderYoutube = ar_order_youtube ? Number(ar_order_youtube) : null;

    const bgmUrlValue = bgm_url || null;
    const taskColumns = await getTableColumnSet(conn, 'tasks');
    const taskRecord = {
      name,
      lat: hasAllLocationValues ? normalizeNullableString(lat) : null,
      lng: hasAllLocationValues ? normalizeNullableString(lng) : null,
      radius: hasAllLocationValues ? normalizeNullableString(radius) : null,
      description,
      photoUrl,
      iconUrl: '/images/flag-red.png',
      youtubeUrl: youtubeUrl || null,
      ar_image_url: ar_image_url || null,
      points: pts,
      created_by: username,
      task_type: tType,
      options: opts,
      correct_answer: correct_answer || null,
      submission_type: validationSettings.submissionType,
      validation_mode: validationSettings.validationMode,
      ai_config: validationSettings.aiConfigJson,
      pass_criteria: validationSettings.passCriteriaJson,
      failure_message: validationSettings.failureMessage,
      success_message: validationSettings.successMessage,
      max_attempts: validationSettings.maxAttempts,
      location_required: requiresGps,
      type: mainType,
      quest_chain_id: qId,
      quest_order: qOrder,
      time_limit_start: tStart,
      time_limit_end: tEnd,
      max_participants: maxP,
      required_item_id: reqItemId,
      reward_item_id: rewItemId,
      is_final_step: isFinal,
      ar_model_id: arModelId,
      ar_order_model: orderModel,
      ar_order_image: orderImage,
      ar_order_youtube: orderYoutube,
      bgm_url: bgmUrlValue,
      cover_image_url: photoUrl,
      stage_template: normalizeNullableString(stage_template),
      stage_intro: normalizeNullableString(stage_intro),
      hint_text: normalizeNullableString(hint_text),
      story_context: normalizeNullableString(story_context),
      guide_content: normalizeNullableString(guide_content),
      rescue_content: normalizeNullableString(rescue_content),
      event_config: stringifyJsonField(parseJsonField(event_config, null)),
      is_active: is_active === undefined ? true : normalizeBoolean(is_active)
    };
    const filteredRecord = Object.fromEntries(
      Object.entries(taskRecord).filter(([column]) => taskColumns.has(column))
    );
    const [insertHeader] = await insertDynamicRecord(conn, 'tasks', filteredRecord);
    res.json({
      success: true,
      message: '新增成功',
      id: insertHeader.insertId
    });
  } catch (err) {
    console.error(err);
    res.status(err.message?.includes('AI ') || err.message?.includes('max_attempts') || err.message?.includes('信心值') ? 400 : 500).json({ success: false, message: err.message || '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 安全的檔案上傳 API（圖片，5MB 限制）
app.post('/api/upload', authenticateToken, requireRole('user', 'shop', 'admin'), (req, res) => {
  // 使用一般圖片上傳配置（5MB 限制）
  uploadImage.single('photo')(req, res, (err) => {
    if (err) {
      // 處理上傳錯誤
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: '檔案大小超過 5MB 限制' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ success: false, message: '一次只能上傳一個檔案' });
        }
      }

      // 處理自定義錯誤（檔案類型不支援）
      if (err.message.includes('不支援的檔案類型')) {
        return res.status(400).json({ success: false, message: err.message });
      }

      // 其他錯誤
      console.error('檔案上傳錯誤:', err);
      return res.status(500).json({ success: false, message: '檔案上傳失敗' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: '未選擇檔案' });
    }

    // 回傳安全的圖片路徑（使用新的檔案名稱）
    const imageUrl = '/images/' + req.file.filename;
    console.log(`✅ 檔案上傳成功: ${req.file.originalname} -> ${req.file.filename}`);
    res.json({ success: true, url: imageUrl, filename: req.file.filename });
  });
});

// 音頻文件上傳 API（100MB 限制）
app.post('/api/upload-audio', authenticateToken, requireRole('shop', 'admin'), (req, res) => {
  // 使用音頻上傳配置（100MB 限制）
  uploadAudio.single('audio')(req, res, (err) => {
    if (err) {
      // 處理上傳錯誤
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: '檔案大小超過 100MB 限制' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ success: false, message: '一次只能上傳一個檔案' });
        }
      }

      // 處理自定義錯誤（檔案類型不支援）
      if (err.message.includes('不支援的檔案類型')) {
        return res.status(400).json({ success: false, message: err.message });
      }

      // 其他錯誤
      console.error('音頻上傳錯誤:', err);
      return res.status(500).json({ success: false, message: '音頻上傳失敗' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: '未選擇檔案' });
    }

    // 回傳安全的音頻路徑（使用新的檔案名稱）
    const audioUrl = '/images/' + req.file.filename;
    console.log(`✅ 音頻上傳成功: ${req.file.originalname} -> ${req.file.filename}`);
    res.json({ success: true, url: audioUrl, filename: req.file.filename });
  });
});

// 查詢目前登入者進行中的任務（需傳 username）
app.get('/api/user-tasks', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;
  
  let conn;
  try {
    conn = await pool.getConnection();
    // 取得 user_id（使用認證的 username）
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.json({ success: true, tasks: [] });
    const userId = users[0].id;
    // 查詢進行中任務
    const [rows] = await conn.execute(
      `SELECT t.*, ut.status, ut.started_at, ut.finished_at, ut.id as user_task_id
       FROM user_tasks ut
       JOIN tasks t ON ut.task_id = t.id
       WHERE ut.user_id = ? AND ut.status = '進行中'`,
      [userId]
    );
    res.json({ success: true, tasks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 加入任務（需傳 username, task_id）
app.post('/api/user-tasks', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;

  const { task_id } = req.body;
  if (!task_id) return res.status(400).json({ success: false, message: '缺少參數' });
  let conn;
  try {
    conn = await pool.getConnection();
    // 取得 user_id 與 role（使用認證的 username，而不是請求中的 username）
    const [users] = await conn.execute('SELECT id, role FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.status(400).json({ success: false, message: '找不到使用者' });
    
    const user = users[0];
    // 阻擋管理員或工作人員接取任務
    if (user.role === 'admin' || user.role === 'shop' || user.role === 'staff') {
      return res.status(403).json({ success: false, message: '管理員或工作人員無法接取任務' });
    }

    const userId = user.id;
    // 檢查是否已經有進行中
    const [inProgress] = await conn.execute('SELECT id FROM user_tasks WHERE user_id = ? AND task_id = ? AND status = "進行中"', [userId, task_id]);
    if (inProgress.length > 0) return res.json({ success: true, message: '已在進行中', userTaskId: inProgress[0].id });

    // 檢查是否已經完成過
    const [completed] = await conn.execute('SELECT id FROM user_tasks WHERE user_id = ? AND task_id = ? AND status = "完成"', [userId, task_id]);
    if (completed.length > 0) return res.json({ success: false, message: '此任務已完成過，無法再次接取' });

    const [insertResult] = await conn.execute('INSERT INTO user_tasks (user_id, task_id, status) VALUES (?, ?, "進行中")', [userId, task_id]);
    res.json({ success: true, message: '已加入任務', userTaskId: insertResult.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 管理員刪除用戶任務紀錄 (重置任務狀態)
app.delete('/api/user-tasks/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    // 檢查該紀錄是否存在
    const [rows] = await conn.execute('SELECT id FROM user_tasks WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: '找不到該任務紀錄' });

    await conn.execute('DELETE FROM user_tasks WHERE id = ?', [id]);
    res.json({ success: true, message: '任務紀錄已刪除，玩家可重新接取' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 完成任務（人工審核用，需 reviewer 權限）
app.post('/api/user-tasks/finish', reviewerAuth, async (req, res) => {
  const { username, task_id } = req.body;
  if (!username || !task_id) return res.status(400).json({ success: false, message: '缺少參數' });
  let conn;
  try {
    conn = await pool.getConnection();

    // 取得 user_id
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.status(400).json({ success: false, message: '找不到使用者' });
    const userId = users[0].id;

    // 取得任務資訊 + 建立者（用於權限判斷）
    const [tasks] = await conn.execute('SELECT name, points, created_by, quest_chain_id, quest_order FROM tasks WHERE id = ?', [task_id]);
    if (tasks.length === 0) return res.status(400).json({ success: false, message: '找不到任務' });
    const task = tasks[0];

    // 權限範圍判斷（admin 全部；shop 僅自己；staff 僅所屬 shop/admin）
    // 新規則：shop 也可審核全部任務（不限制 created_by）

    // 開始交易
    await conn.beginTransaction();

    try {
      // 更新任務狀態為完成
      await conn.execute('UPDATE user_tasks SET status = "完成", finished_at = NOW() WHERE user_id = ? AND task_id = ? AND status = "進行中"', [userId, task_id]);

      // 記錄積分獲得交易
      if (task.points > 0) {
        await conn.execute(
          'INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'earned', task.points, `完成任務: ${task.name}`, 'task_completion', task_id]
        );
      }

      // 發放獎勵道具 (檢查任務是否有 reward_item_id)
      let earnedItemName = null;
      const [taskDetails] = await conn.execute('SELECT reward_item_id, i.name as item_name FROM tasks t LEFT JOIN items i ON t.reward_item_id = i.id WHERE t.id = ?', [task_id]);
      if (taskDetails.length > 0 && taskDetails[0].reward_item_id) {
        const rewardItemId = taskDetails[0].reward_item_id;
        earnedItemName = taskDetails[0].item_name;
        // 檢查背包是否已有此道具
        const [inventory] = await conn.execute(
          'SELECT id, quantity FROM user_inventory WHERE user_id = ? AND item_id = ?',
          [userId, rewardItemId]
        );
        if (inventory.length > 0) {
          // 已有，數量+1
          await conn.execute('UPDATE user_inventory SET quantity = quantity + 1 WHERE id = ?', [inventory[0].id]);
        } else {
          // 沒有，新增
          await conn.execute('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES (?, ?, 1)', [userId, rewardItemId]);
        }
      }

      // 更新劇情任務進度
      if (task.quest_chain_id && task.quest_order) {
        const [userQuests] = await conn.execute(
          'SELECT id, current_step_order FROM user_quests WHERE user_id = ? AND quest_chain_id = ?',
          [userId, task.quest_chain_id]
        );

        if (userQuests.length > 0) {
          if (userQuests[0].current_step_order === task.quest_order) {
            await conn.execute(
              'UPDATE user_quests SET current_step_order = current_step_order + 1 WHERE id = ?',
              [userQuests[0].id]
            );
          }
        } else {
          await conn.execute(
            'INSERT INTO user_quests (user_id, quest_chain_id, current_step_order) VALUES (?, ?, ?)',
            [userId, task.quest_chain_id, task.quest_order + 1]
          );
        }
      }

      await conn.commit();
      
      let msg = `已完成任務，獲得 ${task.points} 積分！`;
      if (earnedItemName) {
        msg += ` 並獲得道具：${earnedItemName}`;
      }
      res.json({ success: true, message: msg });

    } catch (err) {
      await conn.rollback();
      throw err;
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 查詢單一任務
app.get('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    // Join items 表格以獲取道具名稱，Join ar_models 獲取 3D 模型
    const [rows] = await conn.execute(`
      SELECT t.*, 
             i_req.name as required_item_name, i_req.image_url as required_item_image, i_req.model_url as required_item_model,
             i_rew.name as reward_item_name, i_rew.image_url as reward_item_image, i_rew.model_url as reward_item_model,
             am.url as ar_model_url, am.scale as ar_model_scale
      FROM tasks t
      LEFT JOIN items i_req ON t.required_item_id = i_req.id
      LEFT JOIN items i_rew ON t.reward_item_id = i_rew.id
      LEFT JOIN ar_models am ON t.ar_model_id = am.id
      WHERE t.id = ?
    `, [id]);
    
    if (rows.length === 0) return res.status(404).json({ success: false, message: '找不到任務' });
    res.json({ success: true, task: sanitizeTaskRow(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 編輯任務
app.put('/api/tasks/:id', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { 
    name, lat, lng, radius, description, photoUrl, youtubeUrl, ar_image_url, points, 
    task_type, options, correct_answer,
    submission_type, validation_mode, ai_config, pass_criteria, failure_message, success_message,
    max_attempts, location_required,
    type, quest_chain_id, quest_order, time_limit_start, time_limit_end, max_participants,
    // 道具參數
    required_item_id, reward_item_id,
    // 劇情結局關卡
    is_final_step,
    // AR 模型 ID 與 順序
    ar_model_id,
    ar_order_model, ar_order_image, ar_order_youtube,
    // 背景音樂
    bgm_url,
    stage_template, stage_intro, hint_text, story_context, guide_content, rescue_content,
    event_config, is_active
  } = req.body;

  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username;

    // 獲取用戶角色
    const [userRows] = await conn.execute(
      'SELECT role FROM users WHERE username = ?',
      [username]
    );

    if (userRows.length === 0) {
      return res.status(401).json({ success: false, message: '用戶不存在' });
    }

    const userRole = userRows[0].role;

    // 檢查任務是否存在，並確認權限
    let taskQuery, taskParams;
    if (userRole === 'admin') {
      taskQuery = 'SELECT id FROM tasks WHERE id = ?';
      taskParams = [id];
    } else {
      taskQuery = 'SELECT id FROM tasks WHERE id = ? AND created_by = ?';
      taskParams = [id, username];
    }

    const [taskRows] = await conn.execute(taskQuery, taskParams);
    if (taskRows.length === 0) {
      return res.status(403).json({ success: false, message: '無權限編輯此任務' });
    }

    const [existingTaskRows] = await conn.execute('SELECT id, quest_chain_id, type, created_by FROM tasks WHERE id = ? LIMIT 1', [id]);
    const existingTask = existingTaskRows[0] || null;

    const qId = quest_chain_id ? Number(quest_chain_id) : null;

    if (existingTask && Number(existingTask.quest_chain_id || 0) !== Number(qId || 0) && Number(existingTask.quest_chain_id || 0) > 0) {
      return res.status(400).json({
        success: false,
        message: '關卡不可直接跨劇情移動，請使用「複製關卡」建立新版本。'
      });
    }

    const requiresGps = normalizeBoolean(location_required) || task_type === 'location';
    const hasAnyLocationValue = [lat, lng, radius].some((value) => value !== undefined && value !== null && String(value).trim() !== '');
    const hasAllLocationValues = [lat, lng, radius].every((value) => value !== undefined && value !== null && String(value).trim() !== '');

    if (!name || !description || !photoUrl) {
      return res.status(400).json({ success: false, message: '缺少參數' });
    }
    if (requiresGps && !hasAllLocationValues) {
      return res.status(400).json({ success: false, message: '啟用 GPS 位置限制時，必須填寫緯度、經度與觸發半徑。' });
    }
    if (!requiresGps && hasAnyLocationValue && !hasAllLocationValues) {
      return res.status(400).json({ success: false, message: '若要保留座標資料，請完整填寫緯度、經度與觸發半徑。' });
    }

    const pts = Number(points) || 0;
    const opts = options ? JSON.stringify(options) : null;
    const validationSettings = prepareTaskValidationSettings({
      task_type,
      submission_type,
      validation_mode,
      ai_config,
      pass_criteria,
      failure_message,
      success_message,
      max_attempts,
      location_required
    });
    const tType = validationSettings.taskType;

    // 檢查 type (single/timed/quest)
    const mainType = ['single', 'timed', 'quest'].includes(type) ? type : 'single';
    
    const tStart = time_limit_start || null;
    const tEnd = time_limit_end || null;
    const maxP = max_participants ? Number(max_participants) : null;
    const qOrder = quest_order ? Number(quest_order) : null;
    
    const reqItemId = required_item_id ? Number(required_item_id) : null;
    const rewItemId = reward_item_id ? Number(reward_item_id) : null;
    const isFinal = is_final_step === true || is_final_step === 'true' || is_final_step === 1;
    const arModelId = ar_model_id ? Number(ar_model_id) : null;
    
    const orderModel = ar_order_model ? Number(ar_order_model) : null;
    const orderImage = ar_order_image ? Number(ar_order_image) : null;
    const orderYoutube = ar_order_youtube ? Number(ar_order_youtube) : null;
    const bgmUrlValue = bgm_url || null;

    const taskColumns = await getTableColumnSet(conn, 'tasks');
    const taskRecord = {
      name,
      lat: hasAllLocationValues ? normalizeNullableString(lat) : null,
      lng: hasAllLocationValues ? normalizeNullableString(lng) : null,
      radius: hasAllLocationValues ? normalizeNullableString(radius) : null,
      description,
      photoUrl,
      youtubeUrl: youtubeUrl || null,
      ar_image_url: ar_image_url || null,
      points: pts,
      task_type: tType,
      options: opts,
      correct_answer: correct_answer || null,
      submission_type: validationSettings.submissionType,
      validation_mode: validationSettings.validationMode,
      ai_config: validationSettings.aiConfigJson,
      pass_criteria: validationSettings.passCriteriaJson,
      failure_message: validationSettings.failureMessage,
      success_message: validationSettings.successMessage,
      max_attempts: validationSettings.maxAttempts,
      location_required: requiresGps,
      type: mainType,
      quest_chain_id: qId,
      quest_order: qOrder,
      time_limit_start: tStart,
      time_limit_end: tEnd,
      max_participants: maxP,
      required_item_id: reqItemId,
      reward_item_id: rewItemId,
      is_final_step: isFinal,
      ar_model_id: arModelId,
      ar_order_model: orderModel,
      ar_order_image: orderImage,
      ar_order_youtube: orderYoutube,
      bgm_url: bgmUrlValue,
      cover_image_url: photoUrl,
      stage_template: normalizeNullableString(stage_template),
      stage_intro: normalizeNullableString(stage_intro),
      hint_text: normalizeNullableString(hint_text),
      story_context: normalizeNullableString(story_context),
      guide_content: normalizeNullableString(guide_content),
      rescue_content: normalizeNullableString(rescue_content),
      event_config: stringifyJsonField(parseJsonField(event_config, null)),
      is_active: is_active === undefined ? true : normalizeBoolean(is_active)
    };
    const filteredRecord = Object.fromEntries(
      Object.entries(taskRecord).filter(([column]) => taskColumns.has(column))
    );
    await updateDynamicRecord(conn, 'tasks', id, filteredRecord);
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    console.error(err);
    res.status(err.message?.includes('AI ') || err.message?.includes('max_attempts') || err.message?.includes('信心值') ? 400 : 500).json({ success: false, message: err.message || '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 複製關卡：避免直接跨劇情共用同一顆 task
app.post('/api/tasks/:id/duplicate', staffOrAdminAuth, async (req, res) => {
  const sourceId = Number(req.params.id);
  const targetQuestChainId = req.body?.quest_chain_id ? Number(req.body.quest_chain_id) : null;
  if (!Number.isFinite(sourceId)) {
    return res.status(400).json({ success: false, message: '無效的關卡 ID' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username || null;
    const role = req.user?.role || null;
    const [rows] = await conn.execute('SELECT * FROM tasks WHERE id = ? LIMIT 1', [sourceId]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '找不到來源關卡' });
    }
    const sourceTask = sanitizeTaskRow(rows[0]);
    if (role !== 'admin' && sourceTask.created_by !== username) {
      return res.status(403).json({ success: false, message: '無權限複製此關卡' });
    }

    const destinationQuestChainId = Number.isFinite(targetQuestChainId) && targetQuestChainId > 0
      ? targetQuestChainId
      : (sourceTask.quest_chain_id ? Number(sourceTask.quest_chain_id) : null);

    if (role === 'shop' && destinationQuestChainId) {
      const [chains] = await conn.execute(
        'SELECT id FROM quest_chains WHERE id = ? AND created_by = ? LIMIT 1',
        [destinationQuestChainId, username]
      );
      if (!chains.length) {
        return res.status(403).json({ success: false, message: '無權將關卡複製到其他人建立的玩法入口' });
      }
    }

    const taskColumns = await getTableColumnSet(conn, 'tasks');
    const cloneRecord = {
      ...sourceTask,
      name: `${sourceTask.name}（複製）`,
      quest_chain_id: destinationQuestChainId,
      created_by: username,
      photoUrl: sourceTask.photoUrl || null,
      options: sourceTask.options ? JSON.stringify(sourceTask.options) : null,
      ai_config: stringifyJsonField(sourceTask.ai_config),
      pass_criteria: stringifyJsonField(sourceTask.pass_criteria)
    };
    delete cloneRecord.id;
    delete cloneRecord.required_item_name;
    delete cloneRecord.reward_item_name;
    delete cloneRecord.required_item_image;
    delete cloneRecord.required_item_model;
    delete cloneRecord.reward_item_image;
    delete cloneRecord.reward_item_model;
    delete cloneRecord.ar_model_url;
    delete cloneRecord.ar_model_scale;

    const filteredRecord = Object.fromEntries(
      Object.entries(cloneRecord).filter(([column]) => taskColumns.has(column))
    );
    const [insertHeader] = await insertDynamicRecord(conn, 'tasks', filteredRecord);
    res.json({
      success: true,
      message: '關卡已複製',
      id: insertHeader.insertId
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '複製關卡失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/tasks/:id/delete-impact', staffOrAdminAuth, async (req, res) => {
  const taskId = Number(req.params.id);
  if (!Number.isFinite(taskId)) {
    return res.status(400).json({ success: false, message: '無效的關卡 ID' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username || null;
    const role = req.user?.role || null;
    const [taskRows] = await conn.execute(
      `SELECT t.id, t.name, t.quest_chain_id, t.created_by, t.task_type, t.validation_mode,
              qc.title AS quest_chain_title
       FROM tasks t
       LEFT JOIN quest_chains qc ON qc.id = t.quest_chain_id
       WHERE t.id = ?
       LIMIT 1`,
      [taskId]
    );
    if (!taskRows.length) {
      return res.status(404).json({ success: false, message: '找不到此關卡' });
    }
    const task = sanitizeTaskRow(taskRows[0]);
    if (role !== 'admin' && task.created_by !== username) {
      return res.status(403).json({ success: false, message: '無權限查看此關卡' });
    }

    const [boardTileRows] = await conn.execute(
      `SELECT bt.id, bt.tile_index, bt.tile_name, bt.tile_type, bm.id AS board_map_id, bm.name AS board_map_name
       FROM board_tiles bt
       INNER JOIN board_maps bm ON bm.id = bt.board_map_id
       WHERE bt.task_id = ?
       ORDER BY bm.id ASC, bt.tile_index ASC`,
      [taskId]
    );
    const [userTaskRows] = await conn.execute(
      'SELECT COUNT(*) AS total FROM user_tasks WHERE task_id = ?',
      [taskId]
    );
    const [attemptRows] = await conn.execute(
      `SELECT COUNT(*) AS total
       FROM task_attempts ta
       INNER JOIN user_tasks ut ON ut.id = ta.user_task_id
       WHERE ut.task_id = ?`,
      [taskId]
    );

    res.json({
      success: true,
      task,
      impact: {
        boardTileCount: boardTileRows.length,
        boardTiles: boardTileRows,
        userTaskCount: Number(userTaskRows[0]?.total || 0),
        taskAttemptCount: Number(attemptRows[0]?.total || 0)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '載入關卡刪除影響範圍失敗' });
  } finally {
    if (conn) conn.release();
  }
});

// 刪除任務
app.delete('/api/tasks/:id', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username;

    // 獲取用戶角色
    const [userRows] = await conn.execute(
      'SELECT role FROM users WHERE username = ?',
      [username]
    );

    if (userRows.length === 0) {
      return res.status(401).json({ success: false, message: '用戶不存在' });
    }

    const userRole = userRows[0].role;

    // 檢查任務是否存在，並確認權限
    let taskQuery, taskParams;
    if (userRole === 'admin') {
      taskQuery = 'SELECT id FROM tasks WHERE id = ?';
      taskParams = [id];
    } else {
      taskQuery = 'SELECT id FROM tasks WHERE id = ? AND created_by = ?';
      taskParams = [id, username];
    }

    const [taskRows] = await conn.execute(taskQuery, taskParams);
    if (taskRows.length === 0) {
      return res.status(403).json({ success: false, message: '無權限刪除此任務' });
    }

    await conn.beginTransaction();
    try {
      await conn.execute('UPDATE board_tiles SET task_id = NULL WHERE task_id = ?', [id]);
      await conn.execute('DELETE FROM user_tasks WHERE task_id = ?', [id]);
      await conn.execute(
        'UPDATE point_transactions SET reference_id = NULL, description = CONCAT(description, " (關卡已刪除)") WHERE reference_type = "task_completion" AND reference_id = ?',
        [id]
      );
      await conn.execute('DELETE FROM tasks WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }
    res.json({ success: true, message: '關卡已刪除，關聯棋盤格與玩家進度已同步清理' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ====== Rank 計算工具 ======
// 計算任務完成時間差並返回等級
// 注意：此函數假設資料庫 TIMESTAMP 存儲的是 UTC 時間
// 如果 MySQL 的 time_zone 設定為 UTC，則此假設正確
// 如果資料庫存儲的已經是本地時間（台灣時區），則不需要手動轉換
function getRank(started, finished) {
  if (!started || !finished) return '';
  
  // MySQL TIMESTAMP 類型會自動轉換為伺服器時區
  // 如果伺服器時區是 UTC，則需要手動轉換為台灣時區 (UTC+8)
  // 如果伺服器時區已經是 Asia/Taipei，則不需要轉換
  // 為了安全，這裡假設資料庫返回的是 UTC，手動轉換為台灣時區
  const startedDate = new Date(started);
  const finishedDate = new Date(finished);
  
  // 計算時間差（小時）- 直接計算，因為 Date 對象會自動處理時區
  // 如果資料庫返回的是 UTC 字符串，JavaScript Date 會自動轉換為本地時區
  // 所以這裡不需要手動加 8 小時，除非資料庫返回的是已經轉換過的本地時間字符串
  const diff = (finishedDate.getTime() - startedDate.getTime()) / (1000 * 60 * 60);
  
  // 等級判定（基於完成時間，單位：小時）
  if (diff <= 1) return 'S+';
  if (diff <= 2) return 'S';
  if (diff <= 3) return 'A';
  if (diff <= 4) return 'B';
  if (diff <= 5) return 'C';
  if (diff <= 6) return 'D';
  return 'E';
}

// 查詢使用者在各劇情任務線的目前進度 (具備自我修復功能)
app.get('/api/user/quest-progress', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;
  
  if (!username) {
    console.warn('[quest-progress] 未提供用戶名');
    return res.json({ success: true, progress: {} });
  } 

  let conn;
  try {
    conn = await pool.getConnection();
    
    // 取得 user_id
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.json({ success: true, progress: {} });
    const userId = users[0].id;

    // 1. 查詢 user_quests 表 (目前的記錄)
    const [questRows] = await conn.execute(
      'SELECT quest_chain_id, current_step_order FROM user_quests WHERE user_id = ?',
      [userId]
    );
    const currentProgress = {};
    questRows.forEach(row => {
      // 確保 quest_chain_id 作為字串 key，避免類型不匹配問題
      const chainId = String(row.quest_chain_id);
      currentProgress[chainId] = row.current_step_order;
    });

    // 2. 自我修復邏輯：檢查 user_tasks 中實際完成的任務
    // 找出每個劇情線中，使用者已完成的最大 quest_order
    const [completedRows] = await conn.execute(`
      SELECT t.quest_chain_id, MAX(t.quest_order) as max_completed_order
      FROM user_tasks ut
      JOIN tasks t ON ut.task_id = t.id
      WHERE ut.user_id = ? AND ut.status = '完成' AND t.quest_chain_id IS NOT NULL
      GROUP BY t.quest_chain_id
    `, [userId]);

    const updates = [];

    // 比對並修復
    for (const row of completedRows) {
      // 確保 chainId 作為字串，與 currentProgress 的 key 類型一致
      const chainId = String(row.quest_chain_id);
      const maxCompleted = row.max_completed_order;
      // 理論上，如果完成了第 N 關，當前進度應該是 N + 1
      const correctNextStep = maxCompleted + 1;

      if (!currentProgress[chainId]) {
        // 情況 A: user_quests 沒記錄，但有完成的任務 -> 補插入
        updates.push(
          conn.execute(
            'INSERT INTO user_quests (user_id, quest_chain_id, current_step_order) VALUES (?, ?, ?)',
            [userId, row.quest_chain_id, correctNextStep] // 資料庫插入時使用原始數字類型
          )
        );
        currentProgress[chainId] = correctNextStep;
      } else if (currentProgress[chainId] < correctNextStep) {
        // 情況 B: 記錄落後 (例如記錄是 1，但已經完成了第 1 關，應該要是 2) -> 更新
        updates.push(
          conn.execute(
            'UPDATE user_quests SET current_step_order = ? WHERE user_id = ? AND quest_chain_id = ?',
            [correctNextStep, userId, row.quest_chain_id] // 資料庫更新時使用原始數字類型
          )
        );
        currentProgress[chainId] = correctNextStep;
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
      console.log(`[quest-progress] 已自動修復使用者 ${username} 的 ${updates.length} 條劇情進度`);
    }

    console.log(`[quest-progress] 使用者 ${username} 的劇情進度:`, currentProgress);
    res.json({ success: true, progress: currentProgress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 查詢所有（進行中＋完成）任務
app.get('/api/user-tasks/all', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;
  
  let conn;
  try {
    conn = await pool.getConnection();
    // 取得 user_id（使用認證的 username）
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.json({ success: true, tasks: [] });
    const userId = users[0].id;
    // 查詢所有任務
    const [rows] = await conn.execute(
      `SELECT t.*, ut.status, ut.started_at, ut.finished_at, ut.id as user_task_id, ut.redeemed, ut.redeemed_at, ut.redeemed_by, ut.answer
       FROM user_tasks ut
       JOIN tasks t ON ut.task_id = t.id
       WHERE ut.user_id = ?
       ORDER BY ut.started_at DESC`,
      [userId]
    );
    // 加 rank
    const tasks = rows.map(row => ({
      ...row,
      rank: getRank(row.started_at, row.finished_at)
    }));
    res.json({ success: true, tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== Admin 權限驗證中介層 (安全性修復：基於 JWT) =====
function adminAuth(req, res, next) {
  authenticateTokenCompat(req, res, () => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
      return res.status(403).json({ success: false, message: '無權限：需要管理員身分' });
    }
  });
}

// ===== Staff 或 Admin 權限驗證中介層 (安全性修復：基於 JWT) =====
function staffOrAdminAuth(req, res, next) {
  authenticateTokenCompat(req, res, () => {
    const role = req.user?.role;
    if (role === 'admin' || role === 'shop' || role === 'staff') {
      next();
    } else {
          return res.status(403).json({ success: false, message: '無權限' });
        }
  });
}

// 優惠券核銷台：僅 admin / shop（與 redeem-coupons.html 一致）
function shopOrAdminAuth(req, res, next) {
  authenticateTokenCompat(req, res, () => {
    const role = req.user?.role;
    if (role === 'admin' || role === 'shop') return next();
    return res.status(403).json({ success: false, message: '僅管理員或商店帳號可核銷優惠券' });
  });
}

// ===== Reviewer 權限：staff / shop / admin 都可審核（新規則）=====
function reviewerAuth(req, res, next) {
  authenticateTokenCompat(req, res, async () => {
    if (!req.user || !req.user.username) return res.status(401).json({ success: false, message: '未認證' });
    let conn;
    try {
      conn = await pool.getConnection();
      const [rows] = await conn.execute('SELECT role, managed_by FROM users WHERE username = ?', [req.user.username]);
      if (rows.length === 0) return res.status(401).json({ success: false, message: '用戶不存在' });
      const role = rows[0].role;
      if (!['admin', 'shop', 'staff'].includes(role)) {
        return res.status(403).json({ success: false, message: '無權限' });
      }
      // 強制以 DB 為準（避免 token 舊資料）
      req.user.role = role;
      req.user.managed_by = rows[0].managed_by || null;
      return next();
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: '伺服器錯誤' });
    } finally {
      if (conn) conn.release();
    }
  });
}

// ===== Staff 兌換任務獎勵 =====
app.post('/api/user-tasks/:id/redeem', reviewerAuth, async (req, res) => {
  const { id } = req.params;
  const staffUser = req.user.username;
  let conn;
  try {
    conn = await pool.getConnection();
    // 只能兌換已完成且未兌換的（同時做任務建立者權限範圍判斷）
    const [rows] = await conn.execute(
      `SELECT ut.*, t.created_by
       FROM user_tasks ut
       JOIN tasks t ON ut.task_id = t.id
       WHERE ut.id = ? AND ut.status = "完成" AND ut.redeemed = 0`,
      [id]
    );
    if (rows.length === 0) return res.status(400).json({ success: false, message: '不可重複兌換或尚未完成' });

    // 新規則：shop 也可核銷全部任務（不限制 created_by）

    await conn.execute('UPDATE user_tasks SET redeemed = 1, redeemed_at = NOW(), redeemed_by = ? WHERE id = ?', [staffUser, id]);
    res.json({ success: true, message: '已兌換' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== Staff 查詢所有進行中任務（可搜尋） =====
app.get('/api/user-tasks/in-progress', reviewerAuth, async (req, res) => {
  const { taskName, username } = req.query;
  let conn;
  try {
    conn = await pool.getConnection();
    const userRole = req.user.role;
    const reqUsername = req.user.username;
    const reviewerOwner = reqUsername;
    let sql = `SELECT ut.id as user_task_id, ut.user_id, ut.task_id, ut.status, ut.started_at, ut.finished_at, ut.redeemed, ut.redeemed_at, ut.redeemed_by, ut.answer, u.username, t.name as task_name, t.description, t.points, t.created_by as task_creator, t.task_type
      FROM user_tasks ut
      JOIN users u ON ut.user_id = u.id
      JOIN tasks t ON ut.task_id = t.id
      WHERE ut.status = '進行中'`;
    const params = [];

    // 新規則：shop 也可審核全部任務（不再限制 created_by）

    if (taskName) {
      sql += ' AND t.name LIKE ?';
      params.push('%' + taskName + '%');
    }
    if (username) {
      sql += ' AND u.username LIKE ?';
      params.push('%' + username + '%');
    }
    sql += ' ORDER BY ut.started_at DESC';
    const [rows] = await conn.execute(sql, params);
    res.json({ success: true, tasks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== Staff 查詢所有已完成但未兌換的任務（可搜尋） =====
app.get('/api/user-tasks/to-redeem', reviewerAuth, async (req, res) => {
  const { taskName, username } = req.query;
  let conn;
  try {
    conn = await pool.getConnection();
    const userRole = req.user.role;
    const reqUsername = req.user.username;
    const reviewerOwner = reqUsername;
    let sql = `SELECT ut.id as user_task_id, ut.user_id, ut.task_id, ut.status, ut.started_at, ut.finished_at, ut.redeemed, ut.redeemed_at, ut.redeemed_by, u.username, t.name as task_name, t.description, t.points, t.created_by as task_creator, t.task_type
      FROM user_tasks ut
      JOIN users u ON ut.user_id = u.id
      JOIN tasks t ON ut.task_id = t.id
      WHERE ut.status = '完成' AND ut.redeemed = 0`;
    const params = [];

    // 新規則：shop 也可審核全部任務（不再限制 created_by）

    if (taskName) {
      sql += ' AND t.name LIKE ?';
      params.push('%' + taskName + '%');
    }
    if (username) {
      sql += ' AND u.username LIKE ?';
      params.push('%' + username + '%');
    }
    sql += ' ORDER BY ut.finished_at DESC';
    const [rows] = await conn.execute(sql, params);
    res.json({ success: true, tasks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 儲存/更新猜謎答案或提交選擇題答案
app.patch('/api/user-tasks/:id/answer', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { answer } = req.body;
  if (!answer) return res.status(400).json({ success: false, message: '缺少答案' });
  
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;
  
  let conn;
  try {
    conn = await pool.getConnection();

    // 1. 取得任務資訊
    const [rows] = await conn.execute(`
      SELECT ut.*, t.task_type, t.correct_answer, t.points, t.name as task_name, ut.user_id, ut.task_id, t.quest_chain_id, t.quest_order,
             qc.game_rules, qc.content_blueprint
      FROM user_tasks ut
      JOIN tasks t ON ut.task_id = t.id
      LEFT JOIN quest_chains qc ON t.quest_chain_id = qc.id
      WHERE ut.id = ?
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ success: false, message: '任務不存在' });
    const userTask = rows[0];
    
    // 2. 驗證任務屬於當前用戶
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) return res.status(401).json({ success: false, message: '用戶不存在' });
    const userId = users[0].id;
    
    if (userTask.user_id !== userId) {
      return res.status(403).json({ success: false, message: '無權限：此任務不屬於您' });
    }

    if (userTask.status === '完成') {
       return res.json({ 
         success: true, 
         message: '任務已完成，無需更新',
         isCompleted: true,
         questChainCompleted: false,
         questChainReward: null
       });
    }

    let isCompleted = false;
    let message = '答案已儲存';
    let earnedItemName = null; // 移到外層宣告
    let questChainCompleted = false; // 移到外層宣告
    let questChainReward = null; // 移到外層宣告
    const runtimeFlags = getQuestChainRuntimeFlags(userTask);

    // 2. 檢查是否為自動驗證題型且答案正確
    if (runtimeFlags.demoAutoPass) {
      isCompleted = true;
      message = buildDemoAutoPassMessage(userTask);
    } else if (['multiple_choice', 'number', 'keyword', 'location'].includes(userTask.task_type)) {
      if (userTask.task_type === 'location') {
        // 地理圍欄任務：只要前端送出請求，即視為完成
        isCompleted = true;
        message = '📍 打卡成功！';
      } else if (userTask.correct_answer && answer.trim().toLowerCase() === userTask.correct_answer.trim().toLowerCase()) {
        isCompleted = true;
        message = '答對了！任務完成！';
      } else {
        // 答錯，不完成任務
        message = '答案不正確，請再試一次';
      }
    }

    // 3. 更新狀態
    if (isCompleted) {
       await conn.beginTransaction();
       try {
         await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [answer, id]);
         ({ message, earnedItemName, questChainCompleted, questChainReward } = await completeUserTask(conn, userTask));

         await conn.commit();
       } catch (err) {
         await conn.rollback();
         throw err;
       }
    } else {
       // 只更新答案，狀態不變（保持進行中）
       await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [answer, id]);
    }

    // 如果任務完成，發送推送通知
    if (isCompleted) {
      const pushTitle = questChainCompleted 
        ? '🎉 劇情線完成！' 
        : '✅ 任務完成！';
      
      let pushBody = `恭喜完成「${userTask.task_name}」`;
      if (earnedItemName) {
        pushBody += `，獲得道具：${earnedItemName}`;
      }
      if (questChainCompleted && questChainReward) {
        pushBody += `\n獲得稱號：${questChainReward.badge_name || '未命名稱號'}`;
        if (questChainReward.chain_points > 0) {
          pushBody += `\n額外積分：${questChainReward.chain_points}`;
        }
      }

      // 非阻塞方式發送推送（不等待完成）
      sendPushNotification(
        userTask.user_id,
        pushTitle,
        pushBody,
        {
          url: `/task-detail.html?id=${userTask.task_id}`,
          taskId: userTask.task_id
        }
      ).catch(err => {
        console.error('推送通知發送失敗（非阻塞）:', err);
      });
    }

    res.json({ 
      success: true, 
      message, 
      isCompleted, 
      earnedItemName,
      questChainCompleted,
      questChainReward: questChainCompleted ? questChainReward : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/user-tasks/:id/attempts', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const user = await resolveUserFromRequest(conn, req.user.username);
    if (!user) return res.status(401).json({ success: false, message: '用戶不存在' });

    const [userTasks] = await conn.execute('SELECT id, user_id FROM user_tasks WHERE id = ?', [id]);
    if (userTasks.length === 0) {
      return res.status(404).json({ success: false, message: '找不到任務紀錄' });
    }
    if (user.role !== 'admin' && userTasks[0].user_id !== user.id) {
      return res.status(403).json({ success: false, message: '無權限查看此任務挑戰紀錄' });
    }

    const [attempts] = await conn.execute(
      `SELECT id, attempt_no, submission_type, submission_url, submitted_answer, ai_result, passed,
              score, detected_count, detected_label, failure_reason, retry_advice, created_at
       FROM task_attempts
       WHERE user_task_id = ?
       ORDER BY attempt_no DESC`,
      [id]
    );
    res.json({
      success: true,
      attempts: attempts.map(attempt => ({
        ...attempt,
        ai_result: parseJsonField(attempt.ai_result, null),
        passed: Boolean(attempt.passed)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/tutorial/ai-tasks/:taskId/submit', uploadAiTaskImage.single('image'), async (req, res) => {
  const { taskId } = req.params;
  if (!req.file) {
    return res.status(400).json({ success: false, message: '請先上傳圖片' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const [tasks] = await conn.execute(
      `SELECT t.*, qc.name AS quest_chain_name, qc.game_rules, qc.content_blueprint
       FROM tasks t
       LEFT JOIN quest_chains qc ON t.quest_chain_id = qc.id
       WHERE t.id = ?`,
      [taskId]
    );
    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: '找不到任務' });
    }

    const task = sanitizeTaskRow(tasks[0]);
    if (!AI_VALIDATION_MODES.includes(task.validation_mode)) {
      return res.status(400).json({ success: false, message: '此任務不是 AI 驗證任務' });
    }
    if (task.submission_type !== 'image') {
      return res.status(400).json({ success: false, message: '此任務目前不支援圖片提交' });
    }

    const runtimeFlags = getQuestChainRuntimeFlags(task);
    if (!runtimeFlags.demoAutoPass) {
      return res.status(403).json({ success: false, message: '這個教學關卡目前不允許匿名體驗' });
    }

    const submissionUrl = saveBufferAsImage(req.file);
    let lmEvaluation = null;
    try {
      lmEvaluation = await evaluateAiTaskImage(task, req.file, {
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        timeoutMs: runtimeFlags.demoAutoPass ? 90000 : 180000,
        maxRetries: runtimeFlags.demoAutoPass ? 0 : 2
      });
    } catch (lmErr) {
      console.warn('教學模式匿名 LM 判定失敗，改用自動放行內容:', lmErr?.message || lmErr);
    }

    const fallbackResult = buildDemoAiResult(task, submissionUrl);
    const lmResult = lmEvaluation?.parsed || null;

    // 若有 JWT 登入，建立 user_task 完成紀錄以推進劇情進度
    let userTaskId = null;
    let earnedItemName = null;
    const optionalUser = getOptionalTokenUser(req);
    if (optionalUser) {
      try {
        const userId = await getUserIdByUsername(conn, optionalUser.username);
        if (userId) {
          await conn.beginTransaction();
          try {
            const userTask = await getOrCreateUserTask(conn, userId, Number(taskId));
            if (userTask.status !== '完成') {
              await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [submissionUrl, userTask.id]);
              const completion = await completeUserTask(conn, {
                ...userTask,
                task_name: task.name,
                task_id: task.id,
                user_id: userId,
                points: task.points,
                quest_chain_id: task.quest_chain_id,
                quest_order: task.quest_order
              });
              earnedItemName = completion?.earnedItemName || null;
            }
            await conn.commit();
            userTaskId = userTask.id;
          } catch (txErr) {
            try { await conn.rollback(); } catch (_) {}
            console.warn('教學模式已登入用戶任務紀錄建立失敗:', txErr.message);
          }
        }
      } catch (userErr) {
        console.warn('教學模式查詢用戶失敗:', userErr.message);
      }
    }

    return res.json({
      success: true,
      passed: true,
      tutorial_guest: !optionalUser,
      message: '教學模式已完成這一步',
      reason: buildTutorialForcedAiReason(task, lmResult?.reason, lmResult?.passed),
      retry_advice: '',
      user_task_id: userTaskId,
      earnedItemName: earnedItemName,
      score: lmResult?.score ?? fallbackResult.score,
      count_detected: lmResult?.count_detected ?? fallbackResult.count_detected,
      label: lmResult?.label ?? fallbackResult.label,
      submission_url: submissionUrl,
      source: lmResult ? 'sandhill_tutorial_guest_with_lm' : fallbackResult.source
    });
  } catch (error) {
    console.error('❌ 教學模式匿名 AI 任務提交失敗:', error);
    return res.status(500).json({ success: false, message: error.message || '教學模式 AI 判定失敗' });
  } finally {
    if (conn) conn.release();
  }
});

// 教學模式非照片任務完成（已登入用戶）
app.post('/api/tutorial/tasks/:taskId/complete', authenticateToken, async (req, res) => {
  const { taskId } = req.params;
  const { answer } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    const userId = await getUserIdByUsername(conn, req.user.username);
    if (!userId) return res.status(400).json({ success: false, message: '使用者不存在' });

    const [tasks] = await conn.execute(
      `SELECT t.*, qc.game_rules, qc.content_blueprint
       FROM tasks t
       LEFT JOIN quest_chains qc ON t.quest_chain_id = qc.id
       WHERE t.id = ?`,
      [taskId]
    );
    if (!tasks.length) return res.status(404).json({ success: false, message: '找不到任務' });
    const task = sanitizeTaskRow(tasks[0]);

    const runtimeFlags = getQuestChainRuntimeFlags(task);
    if (!runtimeFlags.demoAutoPass && !runtimeFlags.tutorialMode) {
      return res.status(403).json({ success: false, message: '此任務不允許教學模式完成' });
    }

    await conn.beginTransaction();
    try {
      const userTask = await getOrCreateUserTask(conn, userId, Number(taskId));
      if (userTask.status === '完成') {
        await conn.commit();
        return res.json({ success: true, user_task_id: userTask.id, earnedItemName: null, message: '任務已完成' });
      }
      await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [answer || 'tutorial_pass', userTask.id]);
      const completion = await completeUserTask(conn, {
        ...userTask,
        task_name: task.name,
        task_id: task.id,
        user_id: userId,
        points: task.points,
        quest_chain_id: task.quest_chain_id,
        quest_order: task.quest_order
      });
      await conn.commit();
      res.json({ success: true, user_task_id: userTask.id, earnedItemName: completion?.earnedItemName || null });
    } catch (txErr) {
      try { await conn.rollback(); } catch (_) {}
      throw txErr;
    }
  } catch (err) {
    console.error('教學模式任務完成失敗:', err);
    res.status(500).json({ success: false, message: err.message || '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/ai-tasks/:taskId/submit', authenticateToken, uploadAiTaskImage.single('image'), async (req, res) => {
  const { taskId } = req.params;
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: '請先上傳圖片' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const user = await resolveUserFromRequest(conn, req.user.username);
    if (!user) return res.status(401).json({ success: false, message: '用戶不存在' });
    if (user.role !== 'user') {
      return res.status(403).json({ success: false, message: '僅一般用戶可提交 AI 任務' });
    }

    const [tasks] = await conn.execute(
      `SELECT t.*, qc.name AS quest_chain_name, qc.game_rules, qc.content_blueprint
       FROM tasks t
       LEFT JOIN quest_chains qc ON t.quest_chain_id = qc.id
       WHERE t.id = ?`,
      [taskId]
    );
    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: '找不到任務' });
    }

    const task = sanitizeTaskRow(tasks[0]);
    if (!AI_VALIDATION_MODES.includes(task.validation_mode)) {
      return res.status(400).json({ success: false, message: '此任務不是 AI 驗證任務' });
    }
    if (task.submission_type !== 'image') {
      return res.status(400).json({ success: false, message: '此任務目前不支援圖片提交' });
    }

    const userTask = await getOrCreateUserTask(conn, user.id, task.id);
    if (userTask.status === '完成') {
      return res.json({ success: true, passed: true, alreadyCompleted: true, message: '此任務已完成' });
    }

    const [attemptCountRows] = await conn.execute(
      'SELECT COUNT(*) AS count FROM task_attempts WHERE user_task_id = ?',
      [userTask.id]
    );
    const attemptCount = Number(attemptCountRows[0]?.count || 0);
    if (task.max_attempts && attemptCount >= Number(task.max_attempts)) {
      return res.status(400).json({ success: false, message: '已達到此任務的最大挑戰次數' });
    }

    const runtimeFlags = getQuestChainRuntimeFlags(task);
    const submissionUrl = saveBufferAsImage(req.file);
    let evaluation;
    if (runtimeFlags.demoAutoPass) {
      let lmEvaluation = null;
      try {
        lmEvaluation = await evaluateAiTaskImage(task, req.file, {
          latitude: req.body.latitude,
          longitude: req.body.longitude,
          timeoutMs: runtimeFlags.demoAutoPass ? 90000 : 180000,
          maxRetries: runtimeFlags.demoAutoPass ? 0 : 2
        });
      } catch (lmErr) {
        console.warn('教學模式 LM 判定失敗，改用自動放行內容:', lmErr?.message || lmErr);
      }

      const fallbackResult = buildDemoAiResult(task, submissionUrl);
      const lmResult = lmEvaluation?.parsed || null;
      evaluation = {
        rawContent: lmEvaluation?.rawContent || JSON.stringify(fallbackResult),
        parsed: {
          ...(lmResult || fallbackResult),
          passed: true,
          retry_advice: '',
          source: lmResult ? 'sandhill_demo_autopass_with_lm' : fallbackResult.source,
          submission_url: submissionUrl,
          reason: buildTutorialForcedAiReason(task, lmResult?.reason, lmResult?.passed)
        }
      };
    } else {
      evaluation = await evaluateAiTaskImage(task, req.file, {
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        timeoutMs: 180000,
        maxRetries: 2
      });
    }

    const attemptNo = attemptCount + 1;
    const result = evaluation.parsed;
    const failureReason = result.passed ? null : (result.reason || task.failure_message || '尚未符合任務條件');
    const retryAdvice = result.passed
      ? null
      : (result.retry_advice || task.failure_message || '請依提示調整後再試一次');

    await conn.beginTransaction();
    let completion = null;
    try {
      await conn.execute(
        `INSERT INTO task_attempts
          (user_id, task_id, user_task_id, attempt_no, submission_type, submission_url, ai_result, ai_raw_response, passed,
           score, detected_count, detected_label, failure_reason, retry_advice)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          task.id,
          userTask.id,
          attemptNo,
          'image',
          submissionUrl,
          JSON.stringify(result),
          evaluation.rawContent,
          result.passed,
          result.score,
          result.count_detected,
          result.label,
          failureReason,
          retryAdvice
        ]
      );

      if (result.passed) {
        await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [submissionUrl, userTask.id]);
        completion = await completeUserTask(conn, {
          ...userTask,
          task_name: task.name,
          task_id: task.id,
          user_id: user.id,
          points: task.points,
          quest_chain_id: task.quest_chain_id,
          quest_order: task.quest_order
        });
      } else {
        await conn.execute('UPDATE user_tasks SET answer = ? WHERE id = ?', [submissionUrl, userTask.id]);
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }

    res.json({
      success: true,
      passed: result.passed,
      message: result.passed
        ? (task.success_message || completion?.message || 'AI 驗證通過，任務完成！')
        : failureReason,
      reason: result.reason || null,
      retry_advice: retryAdvice,
      score: result.score,
      count_detected: result.count_detected,
      label: result.label,
      confidence: result.confidence,
      attempt_no: attemptNo,
      remaining_attempts: task.max_attempts ? Math.max(Number(task.max_attempts) - attemptNo, 0) : null,
      user_task_id: userTask.id,
      submission_url: submissionUrl,
      demo_mode: runtimeFlags.demoAutoPass,
      isCompleted: result.passed,
      earnedItemName: completion?.earnedItemName || null,
      questChainCompleted: completion?.questChainCompleted || false,
      questChainReward: completion?.questChainReward || null
    });
  } catch (err) {
    console.error('AI 任務提交失敗:', err);
    res.status(500).json({ success: false, message: err.message || 'AI 任務提交失敗' });
  } finally {
    if (conn) conn.release();
  }
});

// 獲取用戶的所有稱號
app.get('/api/user/badges', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;

  let conn;
  try {
    conn = await pool.getConnection();
    
    // 獲取用戶 ID
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.json({ success: true, badges: [] });
    }
    const userId = users[0].id;

    // 從 user_quests JOIN quest_chains 獲取已完成的劇情稱號
    const [badges] = await conn.execute(
      `SELECT 
        uq.id,
        qc.badge_name as name,
        qc.badge_image as image_url,
        uq.completed_at as obtained_at,
        'quest' as source_type,
        uq.quest_chain_id as source_id
      FROM user_quests uq
      JOIN quest_chains qc ON uq.quest_chain_id = qc.id
      WHERE uq.user_id = ? AND uq.is_completed = TRUE AND qc.badge_name IS NOT NULL
      ORDER BY uq.completed_at DESC`,
      [userId]
    );

    res.json({ success: true, badges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== 推送通知 API =====

// 獲取 VAPID 公鑰（前端訂閱時需要）
app.get('/api/push/vapid-public-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.json({ 
      success: false, 
      message: '推送通知服務未配置，請聯繫管理員' 
    });
  }
  res.json({ success: true, publicKey: VAPID_PUBLIC_KEY });
});

// 訂閱推送通知
app.post('/api/push/subscribe', authenticateTokenCompat, async (req, res) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(503).json({ 
      success: false, 
      message: '推送通知服務未配置' 
    });
  }

  const username = req.user?.username;
  if (!username) {
    return res.status(401).json({ success: false, message: '未登入' });
  }

  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ success: false, message: '無效的訂閱資訊' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    
    // 獲取用戶 ID
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: '用戶不存在' });
    }
    const userId = users[0].id;

    // 儲存或更新訂閱資訊
    await conn.execute(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         p256dh = VALUES(p256dh),
         auth = VALUES(auth),
         updated_at = NOW()`,
      [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );

    res.json({ success: true, message: '推送訂閱成功' });
  } catch (err) {
    console.error('推送訂閱失敗:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 取消推送訂閱
app.post('/api/push/unsubscribe', authenticateTokenCompat, async (req, res) => {
  const username = req.user?.username;
  if (!username) {
    return res.status(401).json({ success: false, message: '未登入' });
  }

  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ success: false, message: '缺少 endpoint' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    
    // 獲取用戶 ID
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: '用戶不存在' });
    }
    const userId = users[0].id;

    // 刪除訂閱
    await conn.execute(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [userId, endpoint]
    );

    res.json({ success: true, message: '已取消推送訂閱' });
  } catch (err) {
    console.error('取消訂閱失敗:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 推送通知發送函數（內部使用）
async function sendPushNotification(userId, title, body, data = {}) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('⚠️  無法發送推送通知: VAPID 金鑰未配置');
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    
    // 獲取用戶的所有訂閱
    const [subscriptions] = await conn.execute(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );

    if (subscriptions.length === 0) {
      return; // 用戶未訂閱，靜默失敗
    }

    // 發送推送給所有訂閱
    const promises = subscriptions.map(async (sub) => {
      try {
        const subscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        const payload = JSON.stringify({
          title,
          body,
          icon: '/images/mascot.png',
          badge: '/images/flag-red.png',
          vibrate: [100, 50, 100],
          ...data
        });

        await webpush.sendNotification(subscription, payload);
        console.log(`✅ 推送通知已發送給用戶 ${userId}`);
      } catch (err) {
        console.error(`❌ 推送通知發送失敗 (用戶 ${userId}):`, err);
        
        // 如果訂閱已失效（410 Gone），刪除它
        if (err.statusCode === 410) {
          await conn.execute(
            'DELETE FROM push_subscriptions WHERE endpoint = ?',
            [sub.endpoint]
          );
          console.log(`🗑️  已刪除失效的推送訂閱: ${sub.endpoint}`);
        }
      }
    });

    await Promise.allSettled(promises);
  } catch (err) {
    console.error('發送推送通知時發生錯誤:', err);
  } finally {
    if (conn) conn.release();
  }
}

// ===== 商品管理 API =====

// 獲取所有商品（用戶用）
app.get('/api/products', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    
    // 檢查 products 表是否有 is_active 和 created_by 欄位
    const [isActiveCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'is_active'");
    const [createdByCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'created_by'");
    const hasIsActive = isActiveCols.length > 0;
    const hasCreatedBy = createdByCols.length > 0;
    
    // 根據欄位存在與否構建查詢
    let query;
    if (hasIsActive && hasCreatedBy) {
      query = `SELECT p.*, u.username as creator_username
      FROM products p
      LEFT JOIN users u ON p.created_by = u.username
      WHERE p.is_active = TRUE
         ORDER BY p.points_required ASC`;
    } else if (hasIsActive) {
      query = `SELECT p.*, NULL as creator_username
         FROM products p
         WHERE p.is_active = TRUE
         ORDER BY p.points_required ASC`;
    } else if (hasCreatedBy) {
      query = `SELECT p.*, u.username as creator_username
         FROM products p
         LEFT JOIN users u ON p.created_by = u.username
         ORDER BY p.points_required ASC`;
    } else {
      query = `SELECT p.*, NULL as creator_username
         FROM products p
         ORDER BY p.points_required ASC`;
    }
    
    const [rows] = await conn.execute(query);
    res.json({ success: true, products: rows });
  } catch (err) {
    console.error('[/api/products] 錯誤:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// 獲取所有商品（管理員用）- 根據用戶角色篩選
app.get('/api/products/admin', staffOrAdminAuth, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username;

    // 獲取用戶角色
    const [userRows] = await conn.execute(
      'SELECT role FROM users WHERE username = ?',
      [username]
    );

    if (userRows.length === 0) {
      return res.status(401).json({ success: false, message: '用戶不存在' });
    }

    const userRole = userRows[0].role;

    // 檢查 products 表是否有 created_by 欄位
    const [createdByCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'created_by'");
    const hasCreatedBy = createdByCols.length > 0;
    
    let query, params;
    if (userRole === 'admin') {
      // 管理員可以看到所有商品
      query = 'SELECT * FROM products ORDER BY created_at DESC';
      params = [];
    } else {
      // 工作人員只能看到自己創建的商品（如果有 created_by 欄位）
      if (hasCreatedBy) {
      query = 'SELECT * FROM products WHERE created_by = ? ORDER BY created_at DESC';
      params = [username];
      } else {
        // 如果沒有 created_by 欄位，工作人員可以看到所有商品（向後兼容）
        query = 'SELECT * FROM products ORDER BY created_at DESC';
        params = [];
      }
    }

    const [rows] = await conn.execute(query, params);
    res.json({ success: true, products: rows, userRole });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 新增商品
app.post('/api/products', staffOrAdminAuth, async (req, res) => {
  const { name, description, image_url, points_required, stock, is_active } = req.body;
  if (!name || !points_required || stock === undefined) {
    return res.status(400).json({ success: false, message: '缺少必要參數' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username;

    // 檢查 products 表是否有 is_active 和 created_by 欄位
    const [isActiveCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'is_active'");
    const [createdByCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'created_by'");
    const hasIsActive = isActiveCols.length > 0;
    const hasCreatedBy = createdByCols.length > 0;

    let result;
    if (hasIsActive && hasCreatedBy) {
      // 如果有 is_active 和 created_by 欄位，包含在 INSERT 中
      [result] = await conn.execute(
        'INSERT INTO products (name, description, image_url, points_required, stock, created_by, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, description || '', image_url || '', points_required, stock, username, is_active !== undefined ? is_active : true]
      );
    } else if (hasCreatedBy) {
      // 如果只有 created_by 欄位，不包含 is_active
      [result] = await conn.execute(
      'INSERT INTO products (name, description, image_url, points_required, stock, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description || '', image_url || '', points_required, stock, username]
    );
    } else {
      // 如果都沒有，使用最簡單的 INSERT 語句
      [result] = await conn.execute(
        'INSERT INTO products (name, description, image_url, points_required, stock) VALUES (?, ?, ?, ?, ?)',
        [name, description || '', image_url || '', points_required, stock]
      );
    }
    res.json({ success: true, message: '商品新增成功', productId: result.insertId });
  } catch (err) {
    console.error('[/api/products POST] 錯誤:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤', error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// 編輯商品
app.put('/api/products/:id', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { name, description, image_url, points_required, stock, is_active } = req.body;
  if (!name || !points_required || stock === undefined) {
    return res.status(400).json({ success: false, message: '缺少必要參數' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username;

    // 獲取用戶角色
    const [userRows] = await conn.execute(
      'SELECT role FROM users WHERE username = ?',
      [username]
    );

    if (userRows.length === 0) {
      return res.status(401).json({ success: false, message: '用戶不存在' });
    }

    const userRole = userRows[0].role;

    // 檢查 products 表是否有 created_by 欄位
    const [createdByCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'created_by'");
    const hasCreatedBy = createdByCols.length > 0;

    // 檢查商品是否存在，並確認權限
    let productQuery, productParams;
    if (userRole === 'admin') {
      productQuery = 'SELECT id FROM products WHERE id = ?';
      productParams = [id];
    } else {
      if (hasCreatedBy) {
      productQuery = 'SELECT id FROM products WHERE id = ? AND created_by = ?';
      productParams = [id, username];
      } else {
        // 如果沒有 created_by 欄位，工作人員可以編輯任何商品（向後兼容）
        productQuery = 'SELECT id FROM products WHERE id = ?';
        productParams = [id];
      }
    }

    const [productRows] = await conn.execute(productQuery, productParams);
    if (productRows.length === 0) {
      return res.status(403).json({ success: false, message: '無權限編輯此商品' });
    }

    await conn.execute(
      'UPDATE products SET name = ?, description = ?, image_url = ?, points_required = ?, stock = ?, is_active = ? WHERE id = ?',
      [name, description || '', image_url || '', points_required, stock, is_active !== undefined ? is_active : true, id]
    );
    res.json({ success: true, message: '商品更新成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 刪除商品
app.delete('/api/products/:id', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username;

    // 獲取用戶角色
    const [userRows] = await conn.execute(
      'SELECT role FROM users WHERE username = ?',
      [username]
    );

    if (userRows.length === 0) {
      return res.status(401).json({ success: false, message: '用戶不存在' });
    }

    const userRole = userRows[0].role;

    // 檢查商品是否存在，並確認權限
    let productQuery, productParams;
    if (userRole === 'admin') {
      productQuery = 'SELECT id FROM products WHERE id = ?';
      productParams = [id];
    } else {
      productQuery = 'SELECT id FROM products WHERE id = ? AND created_by = ?';
      productParams = [id, username];
    }

    const [productRows] = await conn.execute(productQuery, productParams);
    if (productRows.length === 0) {
      return res.status(403).json({ success: false, message: '無權限刪除此商品' });
    }

    await conn.execute(
      'DELETE FROM products WHERE id = ?',
      [id]
    );
    res.json({ success: true, message: '商品刪除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 獲取用戶的商品兌換記錄
app.get('/api/products/redemptions', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;

  let conn;
  try {
    conn = await pool.getConnection();
    // 獲取用戶ID
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(400).json({ success: false, message: '用戶不存在' });
    }
    const userId = users[0].id;

    // 獲取兌換記錄
    const [rows] = await conn.execute(`
      SELECT pr.*, p.id as product_id, p.name as product_name, p.image_url
      FROM product_redemptions pr
      JOIN products p ON pr.product_id = p.id
      WHERE pr.user_id = ?
      ORDER BY pr.redeemed_at DESC
    `, [userId]);

    res.json({ success: true, redemptions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 兌換商品
app.post('/api/products/:id/redeem', authenticateToken, async (req, res) => {
  const { id } = req.params;
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;

  let conn;
  try {
    conn = await pool.getConnection();

    // 獲取用戶ID
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(400).json({ success: false, message: '用戶不存在' });
    }
    const userId = users[0].id;

    // 檢查 products 表是否有 is_active 欄位
    const [isActiveCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'is_active'");
    const hasIsActive = isActiveCols.length > 0;

    // 獲取商品資訊
    let products;
    if (hasIsActive) {
      [products] = await conn.execute('SELECT * FROM products WHERE id = ? AND is_active = TRUE', [id]);
    } else {
      [products] = await conn.execute('SELECT * FROM products WHERE id = ?', [id]);
    }
    if (products.length === 0) {
      return res.status(400).json({ success: false, message: '商品不存在或已下架' });
    }
    const product = products[0];

    // 檢查庫存
    if (product.stock <= 0) {
      return res.status(400).json({ success: false, message: '商品已售完' });
    }

    // 計算用戶總積分（獲得積分 - 消費積分）
    const [userPointsResult] = await conn.execute(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'earned' THEN points ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN type = 'spent' THEN points ELSE 0 END), 0) as total_points
      FROM point_transactions
      WHERE user_id = ?
    `, [userId]);

    const totalPoints = userPointsResult[0].total_points || 0;

    // 檢查積分是否足夠
    if (totalPoints < product.points_required) {
      return res.status(400).json({ success: false, message: `積分不足，需要 ${product.points_required} 積分，您目前有 ${totalPoints} 積分` });
    }

    // 開始交易
    await conn.beginTransaction();

    try {
      // 減少庫存
      await conn.execute('UPDATE products SET stock = stock - 1 WHERE id = ?', [id]);

      // 記錄兌換
      const [redemptionResult] = await conn.execute(
        'INSERT INTO product_redemptions (user_id, product_id, points_used, status) VALUES (?, ?, ?, ?)',
        [userId, id, product.points_required, 'pending']
      );

      // 記錄積分扣除交易
      await conn.execute(
        'INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, 'spent', product.points_required, `兌換商品: ${product.name}`, 'product_redemption', redemptionResult.insertId]
      );

      await conn.commit();
      res.json({ success: true, message: '商品兌換成功！請等待工作人員確認。' });

    } catch (err) {
      await conn.rollback();
      throw err;
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 獲取用戶總積分
app.get('/api/user/points', authenticateToken, async (req, res) => {
  // 強制使用 JWT 認證
  if (!req.user || !req.user.username) {
    return res.status(401).json({ success: false, message: '未認證' });
  }
  const username = req.user.username;

  let conn;
  try {
    conn = await pool.getConnection();

    // 獲取用戶ID
    const [users] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(400).json({ success: false, message: '用戶不存在' });
    }
    const userId = users[0].id;

    // 計算總積分（獲得積分 - 消費積分）
    const [result] = await conn.execute(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'earned' THEN points ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN type = 'spent' THEN points ELSE 0 END), 0) as total_points
      FROM point_transactions
      WHERE user_id = ?
    `, [userId]);

    res.json({ success: true, totalPoints: result[0].total_points || 0 });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== 兌換記錄管理 API =====

// 獲取商品兌換記錄（管理員/工作人員用）
app.get('/api/product-redemptions/admin', staffOrAdminAuth, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username;

    // 獲取用戶角色
    const [userRows] = await conn.execute(
      'SELECT role FROM users WHERE username = ?',
      [username]
    );

    if (userRows.length === 0) {
      return res.status(401).json({ success: false, message: '用戶不存在' });
    }

    const userRole = userRows[0].role;
    
    // 檢查 products 表是否有 created_by 欄位
    const [createdByCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'created_by'");
    const hasCreatedBy = createdByCols.length > 0;
    
    let query, params;

    if (userRole === 'admin') {
      // 管理員可以看到所有兌換記錄
      if (hasCreatedBy) {
      query = `
        SELECT pr.*, p.name as product_name, p.image_url, p.created_by as merchant_name, u.username
        FROM product_redemptions pr
        JOIN products p ON pr.product_id = p.id
        JOIN users u ON pr.user_id = u.id
        ORDER BY pr.redeemed_at DESC
      `;
      } else {
        query = `
          SELECT pr.*, p.name as product_name, p.image_url, NULL as merchant_name, u.username
          FROM product_redemptions pr
          JOIN products p ON pr.product_id = p.id
          JOIN users u ON pr.user_id = u.id
          ORDER BY pr.redeemed_at DESC
        `;
      }
      params = [];
    } else {
      // 工作人員只能看到自己管理的商品的兌換記錄
      if (hasCreatedBy) {
      query = `
        SELECT pr.*, p.name as product_name, p.image_url, p.created_by as merchant_name, u.username
        FROM product_redemptions pr
        JOIN products p ON pr.product_id = p.id
        JOIN users u ON pr.user_id = u.id
        WHERE p.created_by = ?
        ORDER BY pr.redeemed_at DESC
      `;
      params = [username];
      } else {
        // 如果沒有 created_by 欄位，工作人員可以看到所有記錄（向後兼容）
        query = `
          SELECT pr.*, p.name as product_name, p.image_url, NULL as merchant_name, u.username
          FROM product_redemptions pr
          JOIN products p ON pr.product_id = p.id
          JOIN users u ON pr.user_id = u.id
          ORDER BY pr.redeemed_at DESC
        `;
        params = [];
      }
    }

    const [rows] = await conn.execute(query, params);
    res.json({ success: true, redemptions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== Admin 會員管理 API =====

// 獲取所有用戶列表（含統計資訊，支持分頁）- 僅 admin
app.get('/api/admin/users', adminAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;
  const searchRaw = String(req.query.search || '').trim().slice(0, 120);
  const safeSearch = searchRaw.replace(/[%_\\]/g, '');
  const searchPattern = safeSearch.length ? `%${safeSearch}%` : null;

  let conn;
  try {
    conn = await pool.getConnection();

    let countSql = `SELECT COUNT(*) as total FROM users u WHERE u.role = 'user'`;
    const countParams = [];
    if (searchPattern) {
      countSql += ' AND u.username LIKE ?';
      countParams.push(searchPattern);
    }
    const [totalCount] = await conn.execute(countSql, countParams);
    const totalUsers = totalCount[0].total;

    const searchSql = searchPattern ? 'AND u.username LIKE ?' : '';
    const listParams = searchPattern ? [searchPattern, limit, offset] : [limit, offset];
    const [users] = await conn.query(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.created_at,
        COALESCE(points.total_points, 0) AS total_points,
        COALESCE(tasks.completed_tasks, 0) AS completed_tasks,
        COALESCE(tasks.in_progress_tasks, 0) AS in_progress_tasks
      FROM users u
      LEFT JOIN (
        SELECT
          user_id,
          COALESCE(SUM(CASE WHEN type = 'earned' THEN points ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN type = 'spent' THEN points ELSE 0 END), 0) AS total_points
        FROM point_transactions
        GROUP BY user_id
      ) points ON points.user_id = u.id
      LEFT JOIN (
        SELECT
          user_id,
          SUM(CASE WHEN status = '完成' THEN 1 ELSE 0 END) AS completed_tasks,
          SUM(CASE WHEN status = '進行中' THEN 1 ELSE 0 END) AS in_progress_tasks
        FROM user_tasks
        GROUP BY user_id
      ) tasks ON tasks.user_id = u.id
      WHERE u.role = 'user'
      ${searchSql}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `,
      listParams
    );

    const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

    res.json({
      success: true,
      users,
      total: totalUsers,
      pagination: {
        page,
        limit,
        totalUsers,
        totalPages
      }
    });
  } catch (err) {
    console.error('獲取用戶列表失敗:', err);
    console.error('錯誤詳情:', err.message);
    console.error('錯誤堆疊:', err.stack);
    res.status(500).json({ 
      success: false, 
      message: '伺服器錯誤',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    if (conn) conn.release();
  }
});

// 獲取單個用戶的任務詳情 - 僅 admin
app.get('/api/admin/users/:userId/tasks', adminAuth, async (req, res) => {
  const { userId } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();

    // 驗證用戶是否存在且為一般用戶
    const [userCheck] = await conn.execute(
      'SELECT id, username FROM users WHERE id = ? AND role = ?',
      [userId, 'user']
    );

    if (userCheck.length === 0) {
      return res.status(404).json({ success: false, message: '用戶不存在' });
    }

    // 獲取用戶的所有任務
    const [tasks] = await conn.query(`
      SELECT 
        ut.id as user_task_id,
        ut.status,
        ut.started_at,
        ut.finished_at,
        ut.answer,
        t.id as task_id,
        t.name as task_name,
        t.points,
        t.type as task_type
      FROM user_tasks ut
      INNER JOIN tasks t ON ut.task_id = t.id
      WHERE ut.user_id = ?
      ORDER BY ut.started_at DESC
    `, [userId]);

    res.json({
      success: true,
      user: userCheck[0],
      tasks
    });
  } catch (err) {
    console.error('獲取用戶任務詳情失敗:', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 導出所有用戶資料為 Excel - 僅 admin
app.get('/api/admin/users/export', adminAuth, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    // 獲取所有用戶 + 統計資訊
    const [users] = await conn.query(`
      SELECT
        u.id,
        u.username,
        u.role,
        DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') as created_at,
        COALESCE(points.total_points, 0) AS total_points,
        COALESCE(tasks.completed_tasks, 0) AS completed_tasks,
        COALESCE(tasks.in_progress_tasks, 0) AS in_progress_tasks
      FROM users u
      LEFT JOIN (
        SELECT
          user_id,
          COALESCE(SUM(CASE WHEN type = 'earned' THEN points ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN type = 'spent' THEN points ELSE 0 END), 0) AS total_points
        FROM point_transactions
        GROUP BY user_id
      ) points ON points.user_id = u.id
      LEFT JOIN (
        SELECT
          user_id,
          SUM(CASE WHEN status = '完成' THEN 1 ELSE 0 END) AS completed_tasks,
          SUM(CASE WHEN status = '進行中' THEN 1 ELSE 0 END) AS in_progress_tasks
        FROM user_tasks
        GROUP BY user_id
      ) tasks ON tasks.user_id = u.id
      WHERE u.role = 'user'
      ORDER BY u.created_at DESC
    `);

    // 準備 Excel 資料
    const wsData = users.map(user => ({
      '用戶ID': user.id,
      '帳號': user.username,
      '角色': user.role,
      '註冊時間': user.created_at,
      '總積分': user.total_points,
      '已完成任務數': user.completed_tasks,
      '進行中任務數': user.in_progress_tasks
    }));

    // 創建工作表
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '會員列表');

    // 生成 Excel 緩衝區
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // 設置響應頭
    const filename = `會員資料_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    res.send(excelBuffer);
  } catch (err) {
    console.error('導出 Excel 失敗:', err);
    res.status(500).json({ success: false, message: '導出失敗' });
  } finally {
    if (conn) conn.release();
  }
});

// 批量匯入會員 API
// 上傳 Excel 的 Multer 設定 (使用記憶體儲存，不存硬碟)
const uploadExcel = multer({ storage: multer.memoryStorage() });

// AI 辨識用的暫存上傳 (使用記憶體儲存，快速且不佔空間)
const uploadTemp = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 限制 10MB
});

// AI 請求輔助：逾時 + 重試（應對模型崩潰、Channel Error）
async function fetchAIWithRetry(url, init, { timeoutMs = 180000, maxRetries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const opts = { ...init, signal: controller.signal };
    try {
      const response = await fetch(url, opts);
      clearTimeout(timeoutId);
      if (response.ok) return response;
      const errText = await response.text();
      const isTransient =
        response.status === 502 ||
        response.status === 503 ||
        /channel\s*error|crashed|exit\s*code\s*null/i.test(errText);
      if (attempt < maxRetries && isTransient) {
        console.warn(`[AI] 暫時性錯誤 (${response.status})，2s 後重試 (${attempt + 1}/${maxRetries})...`, errText.slice(0, 200));
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (/channel\s*error/i.test(errText)) throw new Error('AI 連線中斷 (Channel Error)，請稍後再試');
      if (/crashed|exit\s*code\s*null/i.test(errText)) throw new Error('AI 模型暫時異常，請稍後再試');
      throw new Error(`AI 回應錯誤: ${response.status}. ${errText.slice(0, 150)}`);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error('AI 請求逾時，請稍後再試');
      if (attempt < maxRetries && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('fetch'))) {
        console.warn(`[AI] 連線錯誤，2s 後重試 (${attempt + 1}/${maxRetries})...`, err.message);
        lastError = err;
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error('AI 請求失敗');
}

function getAiConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const apiUrlRaw = process.env.AI_API_URL || (isProduction ? null : 'http://localhost:1234/v1');
  const model = process.env.AI_MODEL || (isProduction ? null : 'google/gemma-3-27b');
  const apiKey = process.env.AI_API_KEY || 'lm-studio';

  if (!apiUrlRaw) {
    throw new Error('AI_API_URL 未設定：請在部署環境設定 AI_API_URL / AI_API_KEY / AI_MODEL');
  }

  if (!model) {
    throw new Error('AI_MODEL 未設定：請在部署環境設定 AI_MODEL（例如：google/gemma-3-27b）');
  }

  const apiUrl = String(apiUrlRaw).replace(/\/$/, '');

  if (isProduction && /^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?(\/|$)/i.test(apiUrl)) {
    throw new Error('AI_API_URL 在 production 不能指向 localhost/127.0.0.1/::1，請改成可從 Zeabur 存取的公開 URL');
  }

  return { AI_API_URL: apiUrl, AI_MODEL: model, AI_API_KEY: apiKey };
}

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

function extractJsonObject(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('AI 未回傳可解析的文字內容');
  }

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : text.trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  const jsonText = firstBrace >= 0 && lastBrace > firstBrace
    ? candidate.slice(firstBrace, lastBrace + 1)
    : candidate;
  return JSON.parse(jsonText);
}

function normalizeLabel(value) {
  return normalizeNullableString(value)?.toLowerCase() || null;
}

function buildAiTaskPrompt(task) {
  const aiConfig = parseJsonField(task.ai_config, {}) || {};
  const passCriteria = parseJsonField(task.pass_criteria, {}) || {};
  const systemPrompt = aiConfig.system_prompt || '你是活動任務的 AI 審核員。請根據任務規則檢查照片，並只回傳 JSON。';
  const taskGoal = aiConfig.user_prompt || task.description || task.name;
  const criteriaText = JSON.stringify(passCriteria, null, 2);
  const configText = JSON.stringify(aiConfig, null, 2);

  return {
    systemPrompt,
    userPrompt: [
      `任務名稱：${task.name}`,
      `驗證模式：${task.validation_mode}`,
      `任務說明：${taskGoal}`,
      `AI 設定：${configText}`,
      `通關條件：${criteriaText}`,
      task.validation_mode === 'ai_reference_match'
        ? '你會同時收到兩張圖：第一張是任務的參考地點照片，第二張是玩家上傳照片。請判斷是否為同一地點、同一場景或高度相近的拍攝位置。'
        : '請分析這張圖片是否符合任務要求，並只輸出 JSON。',
      task.validation_mode === 'ai_reference_match'
        ? 'JSON 欄位必須包含：passed, same_location, confidence, label, count_detected, score, reason, retry_advice。'
        : 'JSON 欄位必須包含：passed, confidence, label, count_detected, score, reason, retry_advice。',
      '若某欄位不適用，請填 null。',
      '不要輸出 Markdown，不要輸出額外說明。'
    ].join('\n')
  };
}

function normalizeAiTaskResult(task, aiResult) {
  const passCriteria = parseJsonField(task.pass_criteria, {}) || {};
  const confidence = Number(aiResult.confidence);
  const hasConfidence = !Number.isNaN(confidence);
  const detectedCount = aiResult.count_detected === null || aiResult.count_detected === undefined
    ? null
    : Number(aiResult.count_detected);
  const score = aiResult.score === null || aiResult.score === undefined
    ? null
    : Number(aiResult.score);
  const label = normalizeNullableString(aiResult.label);
  let passed = normalizeBoolean(aiResult.passed);

  if (task.validation_mode === 'ai_count' && Number.isFinite(detectedCount) && Number.isFinite(Number(passCriteria.target_count))) {
    passed = detectedCount >= Number(passCriteria.target_count);
  }

  if (task.validation_mode === 'ai_identify' && passCriteria.target_label) {
    const targetLabel = normalizeLabel(passCriteria.target_label);
    if (targetLabel) passed = normalizeLabel(label) === targetLabel;
  }

  if (task.validation_mode === 'ai_score' && Number.isFinite(score) && Number.isFinite(Number(passCriteria.min_score))) {
    passed = score >= Number(passCriteria.min_score);
  }

  if (task.validation_mode === 'ai_rule_check' && Array.isArray(aiResult.rule_results) && passCriteria.all_rules_must_pass) {
    passed = aiResult.rule_results.every(rule => normalizeBoolean(rule.passed));
  }

  if (task.validation_mode === 'ai_reference_match' && aiResult.same_location !== undefined) {
    passed = normalizeBoolean(aiResult.same_location);
  }

  if (hasConfidence && Number.isFinite(Number(passCriteria.min_confidence))) {
    passed = passed && confidence >= Number(passCriteria.min_confidence);
  }

  return {
    passed,
    confidence: hasConfidence ? confidence : null,
    label,
    count_detected: Number.isFinite(detectedCount) ? detectedCount : null,
    score: Number.isFinite(score) ? score : null,
    reason: normalizeNullableString(aiResult.reason) || (passed ? 'AI 判定通過' : 'AI 判定未通過'),
    retry_advice: normalizeNullableString(aiResult.retry_advice) || null,
    rule_results: Array.isArray(aiResult.rule_results) ? aiResult.rule_results : null
  };
}

function getMimeTypeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
  };
  return mimeTypes[ext] || 'image/jpeg';
}

async function getTaskReferenceImageDataUrl(task) {
  const photoUrl = normalizeNullableString(task.photoUrl);
  if (!photoUrl) return null;

  if (/^https?:\/\//i.test(photoUrl)) {
    const response = await fetch(photoUrl);
    if (!response.ok) {
      throw new Error('無法讀取任務參考圖片');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  const normalizedPath = decodeURIComponent(photoUrl.replace(/^\/+/, ''));
  const candidatePaths = [
    path.join(__dirname, 'public', normalizedPath),
    normalizedPath.startsWith('images/')
      ? path.join(UPLOAD_DIR, path.basename(normalizedPath))
      : null
  ].filter(Boolean);
  const localPath = candidatePaths.find(candidate => fs.existsSync(candidate));
  if (!localPath) {
    return null;
  }
  const buffer = fs.readFileSync(localPath);
  return `data:${getMimeTypeFromPath(localPath)};base64,${buffer.toString('base64')}`;
}

async function evaluateAiTaskImage(task, file, extraContext = {}) {
  const { AI_API_URL, AI_MODEL, AI_API_KEY } = getAiConfig();
  const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const prompt = buildAiTaskPrompt(task);
  const referenceImageDataUrl = task.validation_mode === 'ai_reference_match'
    ? await getTaskReferenceImageDataUrl(task)
    : null;
  if (task.validation_mode === 'ai_reference_match' && !referenceImageDataUrl) {
    throw new Error('此任務缺少可用的參考圖片，請先確認任務封面圖片是否存在');
  }
  const locationText = extraContext.latitude && extraContext.longitude
    ? `\n拍攝地點：緯度 ${extraContext.latitude}，經度 ${extraContext.longitude}`
    : '';
  const imageContent = [];
  if (referenceImageDataUrl) {
    imageContent.push({ type: 'image_url', image_url: { url: referenceImageDataUrl } });
  }
  imageContent.push({ type: 'image_url', image_url: { url: dataUrl } });

  const response = await fetchAIWithRetry(
    `${AI_API_URL}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: `${prompt.userPrompt}${locationText}` },
              ...imageContent
            ]
          }
        ],
        max_tokens: 800,
        temperature: 0
      })
    },
    {
      timeoutMs: Number(extraContext.timeoutMs || 180000),
      maxRetries: Number.isFinite(Number(extraContext.maxRetries)) ? Number(extraContext.maxRetries) : 2
    }
  );

  const aiData = await response.json();
  const rawContent = aiData.choices?.[0]?.message?.content;
  const textContent = Array.isArray(rawContent)
    ? rawContent.map(item => item.text || '').join('\n')
    : rawContent;
  const normalizedText = typeof textContent === 'string' ? textContent.trim() : '';
  if (!normalizedText) {
    return {
      rawContent: '',
      parsed: buildAiNoContentResult(task)
    };
  }

  let parsed;
  try {
    parsed = extractJsonObject(normalizedText);
  } catch (error) {
    return {
      rawContent: normalizedText,
      parsed: {
        ...buildAiNoContentResult(task),
        reason: `AI 有回覆一些內容，但格式不完整，暫時無法直接判定正確或不正確。原始回覆：${normalizedText.slice(0, 180)}`
      }
    };
  }
  return {
    rawContent: normalizedText,
    parsed: normalizeAiTaskResult(task, parsed)
  };
}

async function resolveUserFromRequest(conn, username) {
  const [users] = await conn.execute('SELECT id, role FROM users WHERE username = ?', [username]);
  return users[0] || null;
}

async function getOrCreateUserTask(conn, userId, taskId) {
  const [existing] = await conn.execute(
    'SELECT * FROM user_tasks WHERE user_id = ? AND task_id = ? ORDER BY id DESC LIMIT 1',
    [userId, taskId]
  );

  if (existing.length > 0) return existing[0];

  await conn.execute('INSERT INTO user_tasks (user_id, task_id, status) VALUES (?, ?, "進行中")', [userId, taskId]);
  const [created] = await conn.execute(
    'SELECT * FROM user_tasks WHERE user_id = ? AND task_id = ? ORDER BY id DESC LIMIT 1',
    [userId, taskId]
  );
  return created[0];
}

async function completeUserTask(conn, userTask) {
  let message = '任務完成！';
  let earnedItemName = null;
  let questChainCompleted = false;
  let questChainReward = null;

  await conn.execute('UPDATE user_tasks SET status = "完成", finished_at = NOW() WHERE id = ?', [userTask.id]);

  if (userTask.points > 0) {
    await conn.execute(
      'INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
      [userTask.user_id, 'earned', userTask.points, `完成任務: ${userTask.task_name}`, 'task_completion', userTask.task_id]
    );
  }

  const [taskDetails] = await conn.execute(
    'SELECT reward_item_id, i.name as item_name FROM tasks t LEFT JOIN items i ON t.reward_item_id = i.id WHERE t.id = ?',
    [userTask.task_id]
  );
  if (taskDetails.length > 0 && taskDetails[0].reward_item_id) {
    const rewardItemId = taskDetails[0].reward_item_id;
    earnedItemName = taskDetails[0].item_name;
    const [inventory] = await conn.execute(
      'SELECT id FROM user_inventory WHERE user_id = ? AND item_id = ?',
      [userTask.user_id, rewardItemId]
    );
    if (inventory.length > 0) {
      await conn.execute('UPDATE user_inventory SET quantity = quantity + 1 WHERE id = ?', [inventory[0].id]);
    } else {
      await conn.execute('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES (?, ?, 1)', [userTask.user_id, rewardItemId]);
    }
  }

  if (userTask.quest_chain_id && userTask.quest_order) {
    const [userQuests] = await conn.execute(
      'SELECT id, current_step_order FROM user_quests WHERE user_id = ? AND quest_chain_id = ?',
      [userTask.user_id, userTask.quest_chain_id]
    );

    if (userQuests.length > 0) {
      if (userQuests[0].current_step_order === userTask.quest_order) {
        await conn.execute('UPDATE user_quests SET current_step_order = current_step_order + 1 WHERE id = ?', [userQuests[0].id]);
      }
    } else {
      await conn.execute(
        'INSERT INTO user_quests (user_id, quest_chain_id, current_step_order) VALUES (?, ?, ?)',
        [userTask.user_id, userTask.quest_chain_id, userTask.quest_order + 1]
      );
    }

    const [maxOrder] = await conn.execute(
      'SELECT MAX(quest_order) as max_order FROM tasks WHERE quest_chain_id = ?',
      [userTask.quest_chain_id]
    );

    if (maxOrder.length > 0 && maxOrder[0].max_order === userTask.quest_order) {
      questChainCompleted = true;
      const [questChain] = await conn.execute(
        'SELECT chain_points, badge_name, badge_image FROM quest_chains WHERE id = ?',
        [userTask.quest_chain_id]
      );
      if (questChain.length > 0) {
        questChainReward = questChain[0];
        if (questChainReward.chain_points > 0) {
          await conn.execute(
            'INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
            [userTask.user_id, 'earned', questChainReward.chain_points, `完成劇情線：${questChainReward.badge_name || '未命名劇情'}`, 'quest_chain_completion', userTask.quest_chain_id]
          );
        }
        await conn.execute(
          'UPDATE user_quests SET is_completed = TRUE, completed_at = NOW() WHERE user_id = ? AND quest_chain_id = ?',
          [userTask.user_id, userTask.quest_chain_id]
        );
      }
    }
  }

  if (earnedItemName) {
    message += ` 並獲得道具：${earnedItemName}！`;
  }

  return { message, earnedItemName, questChainCompleted, questChainReward };
}

// AI 視覺辨識 API
app.post('/api/vision-test', uploadTemp.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '未上傳圖片' });
    }

    // 1. 將圖片轉為 Base64
    const base64Image = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64Image}`;

    // 2. 準備 AI 提示詞 (Prompt)
    // 優先使用前端傳來的自訂 Prompt (導演模式)
    const systemPrompt = req.body.systemPrompt || '你是一個有用的 AI 助手。';
    const userPromptText = req.body.userPrompt || '請辨識這張圖片的內容。';

    // 如果有 GPS，加入地點資訊到 User Prompt 後面
    let locationInfo = '';
    if (req.body.latitude && req.body.longitude) {
      locationInfo = `\n(拍攝地點: 緯度 ${req.body.latitude}, 經度 ${req.body.longitude})`;
    }

    const finalUserPrompt = userPromptText + locationInfo;

    // 3. 呼叫 AI API (LM Studio / OpenAI Compatible)
    // AI endpoint (OpenAI-compatible)
    // NOTE: On Zeabur/production you MUST set AI_API_URL (and usually AI_API_KEY),
    // otherwise the server would try to call localhost and always fail.
    const { AI_API_URL, AI_MODEL, AI_API_KEY } = getAiConfig();

    // 3.5. 檢查是否為快速特徵提取模式（前端已進行快速提取，這裡只返回特徵）
    // 注意：快速特徵提取已經在前端完成，這裡不再重複調用，避免重複 API 調用
    let plantResults = null;
    let ragContextForLM = ''; // RAG 結果，將加入 LM prompt
    let quickFeatures = null; // 快速特徵提取結果，用於前端第一階段顯示
    
    // 檢查是否為快速提取模式（前端傳遞 quickOnly=true）
    const quickOnly = req.body && (req.body.quickOnly === 'true' || req.body.quick_only === 'true');
    
    if (quickOnly) {
      // 快速提取模式：只進行特徵提取，不進行 RAG 和完整分析
      console.log('⚡ 快速特徵提取模式：只提取特徵，跳過 RAG 和完整分析');
      
      const quickFeaturePrompt = `你是一位專業的植物形態學家。請快速分析圖片中的植物特徵，只提取關鍵識別特徵（生活型、葉序、葉形、花序、花色等），不要給出植物名稱。用簡短文字描述即可。`;
      
      const quickResponse = await fetchAIWithRetry(
        `${AI_API_URL}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AI_API_KEY}`
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: "system", content: quickFeaturePrompt },
              {
                role: "user",
                content: [
                  { type: "text", text: "請快速提取這張圖片中植物的關鍵識別特徵（生活型、葉序、葉形、花序、花色等），用簡短文字描述。" },
                  { type: "image_url", image_url: { url: dataUrl } }
                ]
              }
            ],
            max_tokens: 500,
            temperature: 0.3
          })
        },
        { timeoutMs: 180000, maxRetries: 2 }
      );
      
      if (quickResponse.ok) {
        const quickData = await quickResponse.json();
        quickFeatures = quickData.choices[0].message.content;
        console.log('📊 快速特徵提取完成');
        
        // 快速模式：直接返回特徵，不進行後續處理
        return res.json({
          success: true,
          quick_features: quickFeatures,
          description: quickFeatures
        });
      } else {
        throw new Error('快速特徵提取失敗');
      }
    }

    // 3.6. 簡易模式：只送照片到 LM，LM 回覆答案，不進行 RAG / traits / 植物搜尋
    const simpleMode = req.body && (req.body.simpleMode === 'true' || req.body.simple_mode === 'true');
    if (simpleMode) {
      console.log('📷 簡易模式：只呼叫 LM 辨識，跳過 RAG / 特徵 / 植物搜尋');
      const simpleSystem = req.body.systemPrompt || '你是一個友善的 AI 助手。請簡潔描述圖片中圈選的物體。';
      const simpleUser = req.body.userPrompt || '請描述這張圖片中圈選區域的物體是什麼，並用簡短文字介紹。';

      const simpleResponse = await fetchAIWithRetry(
        `${AI_API_URL}/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              { role: 'system', content: simpleSystem },
              { role: 'user', content: [{ type: 'text', text: simpleUser }, { type: 'image_url', image_url: { url: dataUrl } }] }
            ],
            max_tokens: 1000,
            temperature: 0.3
          })
        },
        { timeoutMs: 180000, maxRetries: 2 }
      );

      if (!simpleResponse.ok) {
        const errText = await simpleResponse.text();
        throw new Error(`AI 辨識失敗: ${simpleResponse.status}`);
      }
      const simpleData = await simpleResponse.json();
      const reply = simpleData.choices?.[0]?.message?.content || '';
      return res.json({ success: true, description: reply });
    }

    // LM-only 模式（RAG 已停用）：使用前端傳來的 system/user prompt，只呼叫 LM
    console.log('📷 LM-only 模式：使用 prompt 呼叫 LM，不進行植物資料庫比對');
    const aiResponse = await fetchAIWithRetry(
      `${AI_API_URL}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: [{ type: 'text', text: finalUserPrompt }, { type: 'image_url', image_url: { url: dataUrl } }] }
          ],
          max_tokens: 2000,
          temperature: 0
        })
      },
      { timeoutMs: 180000, maxRetries: 2 }
    );
    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI 辨識失敗: ${aiResponse.status}`);
    }
    const aiData = await aiResponse.json();
    const description = aiData.choices?.[0]?.message?.content || '';
    return res.json({ success: true, description, skip_rag: true });
  } catch (err) {
    console.error('❌ AI 辨識失敗:', err);
    if (err.stack) console.error('❌ Stack:', err.stack);
    res.status(500).json({
      success: false,
      message: 'AI 暫時無法連線，請確認後端設定',
      error: err.message,
      ...(process.env.NODE_ENV !== 'production' && err.stack && { stack: err.stack })
    });
  }
});

// 取得植物辨識用的結構化 Prompt（RAG 已停用，回傳 503）
app.get('/api/plant-vision-prompt', (req, res) => {
  res.status(503).json({ success: false, message: 'RAG 已停用，Plant Vision Prompt API 不可用' });
});

// AI 文字聊天 API (語音/文字用)
app.post('/api/chat-text', async (req, res) => {
  try {
    const systemPrompt = req.body.systemPrompt || '你是一個有用的 AI 助手。';
    const userPromptText = req.body.userPrompt || '';
    const userText = req.body.text || '';
    const locationText = req.body.locationText || '';

    if (!userText) {
      return res.status(400).json({ success: false, message: '缺少使用者內容' });
    }

    const finalUserPrompt = `${userPromptText}\n\n${userText}${locationText ? `\n\n(位置: ${locationText})` : ''}`.trim();

    const { AI_API_URL, AI_MODEL, AI_API_KEY } = getAiConfig();

    console.log('🤖 正在呼叫 AI(文字):', AI_API_URL);

    const aiResponse = await fetchAIWithRetry(
      `${AI_API_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_API_KEY}`
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: finalUserPrompt }
          ],
          max_tokens: 600,
          temperature: 0.7
        })
      },
      { timeoutMs: 90000, maxRetries: 2 }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI API Error(文字):', errText);
      throw new Error(`AI API 回應錯誤: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const description = aiData.choices[0].message.content;

    res.json({
      success: true,
      description: description
    });
  } catch (err) {
    console.error('❌ AI 文字回覆失敗:', err);
    res.status(500).json({
      success: false,
      message: 'AI 暫時無法連線，請確認後端設定',
      error: err.message
    });
  }
});

app.post('/api/admin/import-users', adminAuth, uploadExcel.single('file'), async (req, res) => {
  const { simulateActivity, startDate, endDate } = req.body;
  const isSimulationEnabled = simulateActivity === 'true';

  if (!req.file) {
    return res.status(400).json({ success: false, message: '請上傳 Excel 檔案' });
  }

  let conn;
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      return res.status(400).json({ success: false, message: 'Excel 檔案內容為空' });
    }

    // 檢查欄位 (支援 'phone' 或 '手機號碼')
    const phoneKey = data[0].phone ? 'phone' : (data[0]['手機號碼'] ? '手機號碼' : null);
    if (!phoneKey) {
      return res.status(400).json({ success: false, message: '找不到手機號碼欄位 (請使用 "phone" 或 "手機號碼")' });
    }

    conn = await pool.getConnection();
    
    // 預先抓取所有任務資料供模擬使用
    let independentTasks = [];
    let questChains = [];
    
    if (isSimulationEnabled) {
      const [tasks] = await conn.execute('SELECT id, points, quest_chain_id, quest_order FROM tasks');
      const [chains] = await conn.execute('SELECT id FROM quest_chains');
      
      independentTasks = tasks.filter(t => !t.quest_chain_id);
      
      // 整理劇情任務結構
      const questTasks = tasks.filter(t => t.quest_chain_id);
      chains.forEach(chain => {
        const chainTasks = questTasks.filter(t => t.quest_chain_id === chain.id).sort((a, b) => a.quest_order - b.quest_order);
        if (chainTasks.length > 0) {
          questChains.push({
            id: chain.id,
            tasks: chainTasks
          });
        }
      });
    }

    let successCount = 0;
    let skipCount = 0;
    const password = ''; // 無密碼
    
    // 設定註冊時間範圍 (使用前端傳來的參數，或預設值)
    const START_DATE = startDate ? new Date(startDate) : new Date('2025-11-01');
    const END_DATE = endDate ? new Date(endDate) : new Date('2025-12-29');
    
    // 確保結束時間包含了當天的最後一刻
    END_DATE.setHours(23, 59, 59, 999);

    const START_HOUR = 7;
    const END_HOUR = 23;

    function getRandomDate(start, end) {
        const startTime = start.getTime();
        const endTime = end.getTime();
        const diff = endTime - startTime;
        let randomTime = startTime + Math.random() * diff;
        let date = new Date(randomTime);
        const randomHour = Math.floor(Math.random() * (END_HOUR - START_HOUR + 1)) + START_HOUR;
        const randomMinute = Math.floor(Math.random() * 60);
        const randomSecond = Math.floor(Math.random() * 60);
        date.setHours(randomHour, randomMinute, randomSecond);
        return date;
    }

    for (const row of data) {
      const phone = String(row[phoneKey]).trim();
      if (!phone) continue;

      try {
        // 檢查是否已存在
        const [existing] = await conn.execute('SELECT id FROM users WHERE username = ?', [phone]);
        if (existing.length > 0) {
          skipCount++;
          continue;
        }

        const createdAt = getRandomDate(START_DATE, END_DATE);
        const formattedDate = createdAt.toISOString().slice(0, 19).replace('T', ' ');

        const [result] = await conn.execute(
          'INSERT INTO users (username, password, role, created_at) VALUES (?, ?, ?, ?)',
          [phone, password, 'user', formattedDate]
        );
        
        const userId = result.insertId;
        successCount++;

        // --- 模擬遊玩數據 ---
        if (isSimulationEnabled) {
          // 1. 模擬一般任務
          // 確保不超過現有任務數量
          const maxIndependent = Math.min(independentTasks.length, 5); // 最多 5 個，或是全部
          const numIndependent = Math.floor(Math.random() * (maxIndependent + 1)); // 0 ~ max
          
          const shuffledTasks = independentTasks.sort(() => 0.5 - Math.random());
          const selectedIndependent = shuffledTasks.slice(0, numIndependent);

          for (const task of selectedIndependent) {
             // 隨機完成時間：註冊後 1小時 ~ 30天
             const taskTime = new Date(createdAt.getTime() + (Math.random() * 30 * 24 * 60 * 60 * 1000) + (60 * 60 * 1000));
             if (taskTime > new Date()) continue; // 不超過現在時間

             const formattedTaskTime = taskTime.toISOString().slice(0, 19).replace('T', ' ');
             
             // 寫入 user_tasks
             await conn.execute(
               `INSERT INTO user_tasks (user_id, task_id, status, started_at, finished_at, answer) 
                VALUES (?, ?, '完成', ?, ?, ?)`,
               [userId, task.id, formattedTaskTime, formattedTaskTime, '模擬作答']
             );

             // 寫入 point_transactions
             await conn.execute(
               `INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id, created_at)
                VALUES (?, 'earned', ?, ?, 'task_completion', ?, ?)`,
               [userId, task.points, `完成任務 #${task.id}`, task.id, formattedTaskTime]
             );
          }

          // 2. 模擬劇情任務
          // 確保不超過現有劇情鏈數量
          const maxChains = Math.min(questChains.length, 2); // 最多 2 個，或是全部
          const numChains = Math.floor(Math.random() * (maxChains + 1)); // 0 ~ max
          
          const shuffledChains = questChains.sort(() => 0.5 - Math.random());
          const selectedChains = shuffledChains.slice(0, numChains);

          for (const chain of selectedChains) {
            // 隨機決定玩到第幾關 (1 ~ chain.tasks.length)
            // 這裡本身就不會超過該劇情鏈的長度
            const progress = Math.floor(Math.random() * chain.tasks.length) + 1;
            
            // 按順序解鎖
            let lastTaskTime = new Date(createdAt.getTime() + (Math.random() * 24 * 60 * 60 * 1000)); // 註冊後一天開始玩

            for (let i = 0; i < progress; i++) {
               const task = chain.tasks[i];
               // 每一關間隔 10分 ~ 2小時
               lastTaskTime = new Date(lastTaskTime.getTime() + (Math.random() * 2 * 60 * 60 * 1000) + (10 * 60 * 1000));
               
               if (lastTaskTime > new Date()) break;

               const formattedTaskTime = lastTaskTime.toISOString().slice(0, 19).replace('T', ' ');

               // 最後一關有機率是「進行中」而非「完成」
               // 如果是最後一關且不是整個劇情鏈的最後一關，30% 機率是進行中
               const isLastInProgress = (i === progress - 1) && (Math.random() < 0.3);
               
               if (isLastInProgress) {
                 await conn.execute(
                   `INSERT INTO user_tasks (user_id, task_id, status, started_at) 
                    VALUES (?, ?, '進行中', ?)`,
                   [userId, task.id, formattedTaskTime]
                 );
               } else {
                 await conn.execute(
                   `INSERT INTO user_tasks (user_id, task_id, status, started_at, finished_at, answer) 
                    VALUES (?, ?, '完成', ?, ?, ?)`,
                   [userId, task.id, formattedTaskTime, formattedTaskTime, '模擬劇情作答']
                 );
                 
                 await conn.execute(
                   `INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id, created_at)
                    VALUES (?, 'earned', ?, ?, 'task_completion', ?, ?)`,
                   [userId, task.points, `完成劇情任務 #${task.id}`, task.id, formattedTaskTime]
                 );
               }
            }
          }
        }

      } catch (err) {
        console.error(`匯入失敗: ${phone}`, err);
        // 不中斷迴圈，繼續下一個
      }
    }

    res.json({
      success: true,
      message: `匯入完成。成功: ${successCount}, 重複跳過: ${skipCount}`,
      details: { successCount, skipCount }
    });

  } catch (err) {
    console.error('Excel 匯入失敗:', err);
    res.status(500).json({ success: false, message: '匯入過程發生錯誤: ' + err.message });
  } finally {
    if (conn) conn.release();
  }
});

// 批量新增特定用戶（一次性功能）

// 更新兌換記錄狀態
app.put('/api/product-redemptions/:id/status', staffOrAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (!['completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ success: false, message: '無效的狀態' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const username = req.user?.username;

    // 獲取用戶角色
    const [userRows] = await conn.execute(
      'SELECT role FROM users WHERE username = ?',
      [username]
    );

    if (userRows.length === 0) {
      return res.status(401).json({ success: false, message: '用戶不存在' });
    }

    const userRole = userRows[0].role;

    // 檢查 products 表是否有 created_by 欄位
    const [createdByCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'created_by'");
    const hasCreatedBy = createdByCols.length > 0;

    // 獲取兌換記錄詳情和商品名稱
    let query, params;
    if (userRole === 'admin') {
      if (hasCreatedBy) {
      query = `
        SELECT pr.*, p.name as product_name, p.created_by
        FROM product_redemptions pr
        JOIN products p ON pr.product_id = p.id
        WHERE pr.id = ?
      `;
      } else {
        query = `
          SELECT pr.*, p.name as product_name, NULL as created_by
          FROM product_redemptions pr
          JOIN products p ON pr.product_id = p.id
          WHERE pr.id = ?
        `;
      }
      params = [id];
    } else {
      if (hasCreatedBy) {
      query = `
        SELECT pr.*, p.name as product_name, p.created_by
        FROM product_redemptions pr
        JOIN products p ON pr.product_id = p.id
        WHERE pr.id = ? AND p.created_by = ?
      `;
      params = [id, username];
      } else {
        // 如果沒有 created_by 欄位，工作人員可以處理任何兌換記錄（向後兼容）
        query = `
          SELECT pr.*, p.name as product_name, NULL as created_by
          FROM product_redemptions pr
          JOIN products p ON pr.product_id = p.id
          WHERE pr.id = ?
        `;
        params = [id];
      }
    }

    const [redemptions] = await conn.execute(query, params);

    if (redemptions.length === 0) {
      return res.status(404).json({ success: false, message: '兌換記錄不存在或無權限處理' });
    }

    const redemption = redemptions[0];
    const productName = redemption.product_name;

    // 開始交易
    await conn.beginTransaction();

    try {
      // 更新兌換記錄狀態
      await conn.execute(
        'UPDATE product_redemptions SET status = ?, notes = ? WHERE id = ?',
        [status, notes || '', id]
      );

      // 如果是取消兌換，需要退還積分和商品庫存
      if (status === 'cancelled') {
        // 退還商品庫存
        await conn.execute(
          'UPDATE products SET stock = stock + 1 WHERE id = ?',
          [redemption.product_id]
        );

        // 記錄積分退還交易
        await conn.execute(
          'INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
          [redemption.user_id, 'earned', redemption.points_used, `取消兌換退還積分: ${productName}`, 'redemption_cancelled', redemption.id]
        );
      }

      await conn.commit();
      res.json({ success: true, message: status === 'completed' ? '兌換已完成' : '兌換已取消' });

    } catch (err) {
      await conn.rollback();
      throw err;
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ── 優惠券核銷 API（現場 POS / staff-dashboard）────────────────
function formatCouponDiscount(row) {
  if (row.discount_amount != null && Number(row.discount_amount) > 0) {
    return `${row.discount_amount} 元`;
  }
  if (row.discount_percent != null && Number(row.discount_percent) > 0) {
    return `${row.discount_percent}%`;
  }
  return '';
}

function couponIsExpired(row) {
  if (!row.expiry_date) return false;
  const end = new Date(row.expiry_date);
  end.setHours(23, 59, 59, 999);
  return Date.now() > end.getTime();
}

function generateCouponCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 10; i += 1) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

// 發放優惠券／兌換卷（綁定玩家）
app.post('/api/coupons/issue', shopOrAdminAuth, async (req, res) => {
  const body = req.body || {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const amtRaw = body.discount_amount;
  const pctRaw = body.discount_percent;
  const amt = amtRaw != null && amtRaw !== '' ? Number(amtRaw) : null;
  const pct = pctRaw != null && pctRaw !== '' ? parseInt(pctRaw, 10) : null;
  const hasAmt = Number.isFinite(amt) && amt > 0;
  const hasPct = Number.isFinite(pct) && pct > 0 && pct <= 100;
  let expiryDate = null;
  if (body.expiry_date != null && String(body.expiry_date).trim() !== '') {
    const d = String(body.expiry_date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return res.status(400).json({ success: false, message: '到期日格式須為 YYYY-MM-DD' });
    }
    expiryDate = d;
  }
  let couponCode = typeof body.coupon_code === 'string' ? body.coupon_code.trim() : '';
  if (!username) {
    return res.status(400).json({ success: false, message: '請填寫玩家手機（帳號）' });
  }
  if (!title || title.length > 255) {
    return res.status(400).json({ success: false, message: '請填寫券名稱（最多 255 字）' });
  }
  if ((hasAmt && hasPct) || (!hasAmt && !hasPct)) {
    return res.status(400).json({ success: false, message: '請擇一填寫「折扣金額」或「折扣百分比」（1–100）' });
  }
  if (couponCode) {
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(couponCode)) {
      return res.status(400).json({ success: false, message: '自訂代碼須為 4–32 碼英數、底線或連字號' });
    }
  }
  let conn;
  try {
    conn = await pool.getConnection();
    const [users] = await conn.execute(
      'SELECT id, username, role FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: '找不到此帳號' });
    }
    const u = users[0];
    if (u.role !== 'user') {
      return res.status(400).json({ success: false, message: '僅能發放給一般玩家帳號' });
    }
    const discountAmount = hasAmt ? amt : null;
    const discountPercent = hasPct ? pct : null;
    let insertId;
    if (couponCode) {
      const [ins] = await conn.execute(
        `INSERT INTO user_coupons (coupon_code, user_id, title, discount_amount, discount_percent, expiry_date, is_used, status)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'active')`,
        [couponCode, u.id, title, discountAmount, discountPercent, expiryDate]
      );
      insertId = ins.insertId;
    } else {
      let attempts = 0;
      while (attempts < 8) {
        attempts += 1;
        const code = generateCouponCode();
        try {
          const [ins] = await conn.execute(
            `INSERT INTO user_coupons (coupon_code, user_id, title, discount_amount, discount_percent, expiry_date, is_used, status)
             VALUES (?, ?, ?, ?, ?, ?, 0, 'active')`,
            [code, u.id, title, discountAmount, discountPercent, expiryDate]
          );
          insertId = ins.insertId;
          couponCode = code;
          break;
        } catch (e) {
          if (e && e.code === 'ER_DUP_ENTRY') continue;
          throw e;
        }
      }
      if (!couponCode) {
        return res.status(500).json({ success: false, message: '產生代碼重試失敗，請稍後再試' });
      }
    }
    res.json({
      success: true,
      message: '已發放兌換卷',
      coupon: { id: insertId, coupon_code: couponCode, username: u.username, title }
    });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '此優惠券代碼已被使用，請換一組' });
    }
    console.error('coupon issue', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 最近發放的兌換卷列表（後台）
app.get('/api/coupons/issued', shopOrAdminAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 30));
  const offset = (page - 1) * pageSize;
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute(
      `SELECT uc.id, uc.coupon_code, uc.title, uc.discount_amount, uc.discount_percent, uc.expiry_date,
              uc.is_used, uc.used_at, uc.created_at, u.username AS owner_username
       FROM user_coupons uc
       LEFT JOIN users u ON uc.user_id = u.id
       ORDER BY uc.created_at DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );
    const [[{ total }]] = await conn.execute('SELECT COUNT(*) AS total FROM user_coupons');
    const coupons = rows.map((r) => ({
      id: r.id,
      coupon_code: r.coupon_code,
      title: r.title,
      discount_amount: r.discount_amount,
      discount_percent: r.discount_percent,
      discount: formatCouponDiscount(r),
      expiry_date: r.expiry_date,
      is_used: !!r.is_used,
      used_at: r.used_at,
      created_at: r.created_at,
      username: r.owner_username || null,
      status: r.is_used ? 'used' : (couponIsExpired(r) ? 'expired' : 'active')
    }));
    res.json({ success: true, coupons, page, pageSize, total: Number(total) || 0 });
  } catch (err) {
    console.error('coupon issued list', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 查詢優惠券（依代碼）
app.get('/api/coupons/lookup/:code', shopOrAdminAuth, async (req, res) => {
  const raw = req.params.code || '';
  const code = decodeURIComponent(raw).trim();
  if (!code) {
    return res.status(400).json({ success: false, message: '請提供優惠券代碼' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute(
      `SELECT uc.*, u.username AS owner_username
       FROM user_coupons uc
       LEFT JOIN users u ON uc.user_id = u.id
       WHERE LOWER(TRIM(uc.coupon_code)) = LOWER(?)`,
      [code]
    );
    if (rows.length === 0) {
      return res.json({ success: false, message: '查無此券' });
    }
    const row = rows[0];
    const expired = couponIsExpired(row);
    const status = row.is_used ? 'used' : (expired ? 'expired' : 'active');
    const coupon = {
      id: row.id,
      coupon_code: row.coupon_code,
      title: row.title,
      username: row.owner_username || null,
      status,
      is_used: !!row.is_used,
      discount_amount: row.discount_amount,
      discount_percent: row.discount_percent,
      discount: formatCouponDiscount(row),
      expiry_date: row.expiry_date
    };
    res.json({ success: true, coupon });
  } catch (err) {
    console.error('coupon lookup', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 確認核銷
app.post('/api/coupons/:id/redeem', shopOrAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const staffUser = req.user.username;
  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, message: '無效的優惠券 ID' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT * FROM user_coupons WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '優惠券不存在' });
    }
    const row = rows[0];
    if (row.is_used) {
      return res.status(400).json({ success: false, message: '此券已使用' });
    }
    if (couponIsExpired(row)) {
      return res.status(400).json({ success: false, message: '此券已過期' });
    }
    await conn.execute(
      'UPDATE user_coupons SET is_used = 1, used_at = NOW(), used_by = ? WHERE id = ? AND is_used = 0',
      [staffUser, id]
    );
    res.json({ success: true, message: '核銷成功' });
  } catch (err) {
    console.error('coupon redeem', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// 今日核銷紀錄（依伺服器本地日期的 used_at）
app.get('/api/coupons/redeem-history', shopOrAdminAuth, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute(
      `SELECT uc.coupon_code, uc.title, uc.used_at AS redeemed_at,
              COALESCE(u.username, '') AS username
       FROM user_coupons uc
       LEFT JOIN users u ON uc.user_id = u.id
       WHERE uc.is_used = 1 AND DATE(uc.used_at) = CURDATE()
       ORDER BY uc.used_at DESC
       LIMIT 100`
    );
    const history = rows.map((r) => ({
      coupon_code: r.coupon_code,
      title: r.title,
      username: r.username,
      redeemed_at: r.redeemed_at,
      coupon_title: r.title
    }));
    res.json({ success: true, history });
  } catch (err) {
    console.error('coupon redeem-history', err);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  } finally {
    if (conn) conn.release();
  }
});

// ── 遊戲 NPC 設定（後台編輯文案／頭像；ai-lab 仍以 npc_key 對照）────────
const VALID_NPC_KEY = /^[a-z][a-z0-9_]{0,30}$/;

app.get('/api/game-npcs', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.execute(
      'SELECT id, npc_key, display_name, portrait_emoji, role_line, description, sort_order FROM game_npcs ORDER BY sort_order ASC, id ASC'
    );
    res.json({ success: true, npcs: rows });
  } catch (err) {
    console.error('game-npcs list', err);
    res.status(500).json({ success: false, message: '讀取 NPC 失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/game-npcs', adminAuth, async (req, res) => {
  const { npc_key, display_name, portrait_emoji, role_line, description, sort_order } = req.body || {};
  if (!npc_key || !display_name) {
    return res.status(400).json({ success: false, message: '缺少 npc_key 或 display_name' });
  }
  if (!VALID_NPC_KEY.test(String(npc_key).trim())) {
    return res.status(400).json({
      success: false,
      message: 'npc_key 僅能使用小寫英數與底線，且需以字母開頭'
    });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    const [r] = await conn.execute(
      `INSERT INTO game_npcs (npc_key, display_name, portrait_emoji, role_line, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(npc_key).trim(),
        String(display_name).trim(),
        portrait_emoji != null ? String(portrait_emoji).trim().slice(0, 16) : '🧭',
        role_line != null ? String(role_line).trim().slice(0, 64) : '',
        description != null ? String(description).trim() : '',
        Number(sort_order) || 0
      ]
    );
    res.json({ success: true, message: 'NPC 已建立', id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'npc_key 已存在' });
    }
    console.error('game-npcs create', err);
    res.status(500).json({ success: false, message: '建立 NPC 失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.put('/api/game-npcs/:id', adminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, message: '無效的 ID' });
  }
  const { display_name, portrait_emoji, role_line, description, sort_order } = req.body || {};
  if (!display_name) {
    return res.status(400).json({ success: false, message: '缺少 display_name' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute(
      `UPDATE game_npcs SET display_name = ?, portrait_emoji = ?, role_line = ?, description = ?, sort_order = ?
       WHERE id = ?`,
      [
        String(display_name).trim(),
        portrait_emoji != null ? String(portrait_emoji).trim().slice(0, 16) : '🧭',
        role_line != null ? String(role_line).trim().slice(0, 64) : '',
        description != null ? String(description).trim() : '',
        Number(sort_order) || 0,
        id
      ]
    );
    res.json({ success: true, message: 'NPC 已更新' });
  } catch (err) {
    console.error('game-npcs update', err);
    res.status(500).json({ success: false, message: '更新 NPC 失敗' });
  } finally {
    if (conn) conn.release();
  }
});

app.delete('/api/game-npcs/:id', adminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, message: '無效的 ID' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.execute('DELETE FROM game_npcs WHERE id = ?', [id]);
    res.json({ success: true, message: 'NPC 已刪除' });
  } catch (err) {
    console.error('game-npcs delete', err);
    res.status(500).json({ success: false, message: '刪除 NPC 失敗' });
  } finally {
    if (conn) conn.release();
  }
});

const PORT = process.env.PORT || 3001;

// catch-all route for static html (avoid 404 on /), 只針對非 /api/ 路徑
// 健康檢查端點
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      host: process.env.MYSQL_HOST ? '[已設定]' : '[未設定]',
      port: process.env.MYSQL_PORT ? '[已設定]' : '[未設定]',
      database: process.env.MYSQL_DATABASE ? '[已設定]' : '[未設定]',
      username: process.env.MYSQL_USERNAME ? '[已設定]' : '[未設定]',
      password: process.env.MYSQL_ROOT_PASSWORD ? '[已設定]' : '[未設定]'
    }
  });
});

// Embedding API health (for Zeabur debugging from phone)
// RAG 已停用，Embedding API 不可用
app.get('/api/embedding-health', (req, res) => {
  res.json({
    ok: false,
    ready: false,
    embedding_api_url: null,
    message: 'RAG 已停用',
  });
});

app.get('/api/embedding-stats', (req, res) => {
  res.json({
    ok: false,
    embedding_api_url: null,
    message: 'RAG 已停用',
  });
});

app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (req.path.match(/\.[a-zA-Z0-9]+$/)) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 輸出環境變數檢查（僅在開發環境顯示詳細資訊，生產環境僅顯示必要狀態）
if (process.env.NODE_ENV !== 'production') {
  console.log('=== 環境變數檢查 (開發模式) ===');
  if (process.env.DATABASE_URL) {
    console.log('DATABASE_URL:', '[已設定 - 將優先使用]');
  } else {
    console.log('DATABASE_URL:', '[未設定]');
    console.log('MYSQL_HOST:', process.env.MYSQL_HOST || '[未設定]');
    console.log('MYSQL_PORT:', process.env.MYSQL_PORT || '[未設定]');
    console.log('MYSQL_USERNAME:', process.env.MYSQL_USERNAME || '[未設定]');
    console.log('MYSQL_DATABASE:', process.env.MYSQL_DATABASE || '[未設定]');
  console.log('MYSQL_ROOT_PASSWORD:', process.env.MYSQL_ROOT_PASSWORD ? '[已設定]' : '[未設定]');
    console.log('MYSQL_PASSWORD:', process.env.MYSQL_PASSWORD ? '[已設定]' : '[未設定]');
  }
  console.log('ALLOWED_ORIGINS:', process.env.ALLOWED_ORIGINS || '[未設定]');
  console.log('==================');
} else {
  // 生產環境：僅顯示必要狀態，不輸出任何敏感資訊
  console.log('✅ 環境變數已載入（生產模式，詳細資訊已隱藏）');
}

// 啟動時測試資料庫連接（可用 SKIP_DB=1 略過）
if (!SKIP_DB) {
  (async () => {
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      console.error('⚠️  警告: 資料庫連接失敗，部分功能可能無法正常運作');
    } else {
      // 自動執行 AR 系統資料庫遷移
      let conn;
      try {
        conn = await pool.getConnection();
        
        // 1. 建立 ar_models 表
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS ar_models (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            url VARCHAR(512) NOT NULL,
            type VARCHAR(50) DEFAULT 'general',
            scale FLOAT DEFAULT 1.0,
            created_by VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 2. 修改 tasks 表
        const [taskCols] = await conn.execute("SHOW COLUMNS FROM tasks LIKE 'ar_model_id'");
        if (taskCols.length === 0) {
            await conn.execute("ALTER TABLE tasks ADD COLUMN ar_model_id INT DEFAULT NULL");
            console.log('✅ 資料庫遷移: tasks 表已新增 ar_model_id');
        }

        // 3. 修改 items 表
        const [itemCols] = await conn.execute("SHOW COLUMNS FROM items LIKE 'model_url'");
        if (itemCols.length === 0) {
            await conn.execute("ALTER TABLE items ADD COLUMN model_url VARCHAR(512) DEFAULT NULL");
            console.log('✅ 資料庫遷移: items 表已新增 model_url');
        }

        // 4. 修改 products 表 - 添加 is_active 欄位
        const [productCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'is_active'");
        if (productCols.length === 0) {
            await conn.execute("ALTER TABLE products ADD COLUMN is_active BOOLEAN DEFAULT TRUE");
            console.log('✅ 資料庫遷移: products 表已新增 is_active');
        }

        // 5. 修改 products 表 - 添加 created_by 欄位
        const [productCreatedByCols] = await conn.execute("SHOW COLUMNS FROM products LIKE 'created_by'");
        if (productCreatedByCols.length === 0) {
            await conn.execute("ALTER TABLE products ADD COLUMN created_by VARCHAR(255) DEFAULT NULL");
            console.log('✅ 資料庫遷移: products 表已新增 created_by');
        }

        // 4. 新增 AR 順序欄位 (tasks 表)
        const arOrderCols = ['ar_order_model', 'ar_order_image', 'ar_order_youtube'];
        for (const col of arOrderCols) {
            const [check] = await conn.execute(`SHOW COLUMNS FROM tasks LIKE '${col}'`);
            if (check.length === 0) {
                await conn.execute(`ALTER TABLE tasks ADD COLUMN ${col} INT DEFAULT NULL`);
                console.log(`✅ 資料庫遷移: tasks 表已新增 ${col}`);
            }
        }

        // 6. 新增背景音樂欄位 (tasks 表)
        const [bgmCols] = await conn.execute("SHOW COLUMNS FROM tasks LIKE 'bgm_url'");
        if (bgmCols.length === 0) {
            await conn.execute("ALTER TABLE tasks ADD COLUMN bgm_url VARCHAR(512) DEFAULT NULL");
            console.log('✅ 資料庫遷移: tasks 表已新增 bgm_url');
        }

        // 共用素材庫：背景音樂
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS bgm_library (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            url VARCHAR(512) NOT NULL,
            created_by VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log('✅ 資料庫遷移: bgm_library 表已建立');

        // 5b. 優惠券（現場核銷 / POS）
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS user_coupons (
            id INT AUTO_INCREMENT PRIMARY KEY,
            coupon_code VARCHAR(64) NOT NULL,
            user_id INT NULL,
            title VARCHAR(255) NOT NULL DEFAULT '優惠券',
            discount_amount DECIMAL(10,2) NULL,
            discount_percent INT NULL,
            expiry_date DATE NULL,
            is_used BOOLEAN DEFAULT FALSE,
            used_at TIMESTAMP NULL,
            used_by VARCHAR(100) NULL,
            status VARCHAR(32) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_user_coupons_code (coupon_code),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
          )
        `);
        console.log('✅ 資料庫遷移: user_coupons 表已建立');

        await conn.execute(`
          CREATE TABLE IF NOT EXISTS game_npcs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            npc_key VARCHAR(32) NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            portrait_emoji VARCHAR(16) DEFAULT '🧭',
            role_line VARCHAR(64) DEFAULT '',
            description TEXT,
            sort_order INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_game_npcs_key (npc_key)
          )
        `);
        const [npcCountRows] = await conn.execute('SELECT COUNT(*) AS c FROM game_npcs');
        if (npcCountRows[0].c === 0) {
          await conn.execute(
            `INSERT INTO game_npcs (npc_key, display_name, portrait_emoji, role_line, description, sort_order) VALUES
             ('guide', '引路人・史蛋', '🥚', 'guide / host', '負責引導、事件主持', 1),
             ('gatekeeper', '潮汐關主・巴布', '🦀', 'gatekeeper / rescue', '負責挑戰、救援提示', 2),
             ('judge', '潮汐裁判・鯨老', '🐋', 'judge / lore', '負責判定、知識導覽', 3)`
          );
          console.log('✅ 資料庫遷移: game_npcs 已寫入預設三角色');
        } else {
          console.log('✅ 資料庫遷移: game_npcs 表已就緒');
        }

        // 5. 建立推送訂閱表
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            endpoint TEXT NOT NULL,
            p256dh VARCHAR(255) NOT NULL,
            auth VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY unique_user_endpoint (user_id, endpoint(255))
          )
        `);
        console.log('✅ 資料庫遷移: push_subscriptions 表已建立');
        
        console.log('✅ AR 多步驟系統資料庫結構檢查完成');
      } catch (err) {
        console.error('❌ AR 系統資料庫遷移失敗:', err);
      } finally {
        if (conn) conn.release();
      }
    }
  })();
}

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
  console.log(`🌐 應用程式運行在: http://localhost:${PORT}`);
  console.log(`🔍 健康檢查端點: http://localhost:${PORT}/api/health`);
}); 
// Force redeploy timestamp: Tue Jan  6 12:06:17 CST 2026
