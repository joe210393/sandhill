const fs = require('fs');
const { normalizeBillingPolicy } = require('../services/billing');
const { actorCanAccessShop } = require('../services/shop-scope');

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
    id: row.id == null ? null : Number(row.id),
    shop_id: row.shop_id == null ? null : Number(row.shop_id),
    plan_id: row.plan_id == null ? null : Number(row.plan_id),
    task_limit: row.task_limit == null ? null : Number(row.task_limit),
    setup_fee: row.setup_fee == null ? 0 : Number(row.setup_fee),
    chain_points: row.chain_points == null ? 0 : Number(row.chain_points),
    lm_total_tokens: row.lm_total_tokens == null ? 0 : Number(row.lm_total_tokens),
    current_billing_month_tokens: row.current_billing_month_tokens == null ? 0 : Number(row.current_billing_month_tokens),
    setup_fee_paid: Boolean(row.setup_fee_paid),
    billing_policy: normalizeBillingPolicy(row.billing_policy, row.created_by),
    monthly_billing_enabled: row.monthly_billing_enabled == null ? true : Boolean(row.monthly_billing_enabled),
    title: row.title || row.name || '',
    access_mode: normalizeAccessMode(row.access_mode),
    experience_mode: normalizeExperienceMode(row.experience_mode, row),
    // NULL／缺欄位：相容舊資料，視為已發布；僅明確 false／0 為草稿
    is_active: row.is_active == null ? true : Boolean(row.is_active),
    game_rules: parseJsonField(row.game_rules, null),
    content_blueprint: parseJsonField(row.content_blueprint, null)
  };
}

function sanitizeShopRow(row) {
  if (!row) return row;
  return {
    ...row,
    id: row.id == null ? null : Number(row.id),
    staff_count: row.staff_count == null ? 0 : Number(row.staff_count),
    quest_chain_count: row.quest_chain_count == null ? 0 : Number(row.quest_chain_count),
    asset_total_bytes: row.asset_total_bytes == null ? 0 : Number(row.asset_total_bytes),
    asset_total_files: row.asset_total_files == null ? 0 : Number(row.asset_total_files),
    asset_model_count: row.asset_model_count == null ? 0 : Number(row.asset_model_count),
    asset_item_count: row.asset_item_count == null ? 0 : Number(row.asset_item_count),
    asset_bgm_count: row.asset_bgm_count == null ? 0 : Number(row.asset_bgm_count),
    asset_video_count: row.asset_video_count == null ? 0 : Number(row.asset_video_count),
    billing_prompt_tokens: row.billing_prompt_tokens == null ? 0 : Number(row.billing_prompt_tokens),
    billing_completion_tokens: row.billing_completion_tokens == null ? 0 : Number(row.billing_completion_tokens),
    billing_total_tokens: row.billing_total_tokens == null ? 0 : Number(row.billing_total_tokens),
    billing_estimated_amount: row.billing_estimated_amount == null ? 0 : Number(row.billing_estimated_amount),
    billing_donated_amount: row.billing_donated_amount == null ? 0 : Number(row.billing_donated_amount),
    is_active: row.status ? row.status === 'active' : true
  };
}

function buildShopCode(seed) {
  const normalized = String(seed || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return normalized || `shop-${Date.now().toString(36)}`;
}

function normalizeAccessMode(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'coupon' ? 'coupon' : 'public';
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

function tutorialIdentifyAliases(targetLabel) {
  const key = normalizeLabel(targetLabel);
  if (!key) return [];
  const aliasMap = {
    pen_like: ['筆', '原子筆', '鉛筆', '自動鉛筆', '簽字筆', 'pen', 'pencil', 'ballpoint'],
    utility_knife: ['美工刀', '裁切刀', '刀具', '刀片', 'utility knife', 'box cutter'],
    cup_like: ['水杯', '杯子', '馬克杯', '咖啡杯', '保溫杯', 'cup', 'mug'],
    charger_like: ['充電器', '充電頭', '充電線', '變壓器', 'adapter', 'charger', 'usb'],
    computer_like: ['電腦', '筆電', '筆記型電腦', '桌機', 'macbook', 'laptop', 'computer', 'pc'],
    monitor_like: ['螢幕', '顯示器', '電視', '電視螢幕', '監視器', 'monitor', 'screen', 'display', 'tv']
  };
  return aliasMap[key] || [key];
}

function hasNegativeAliasMention(text, alias) {
  const escaped = String(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`不是\\s*${escaped}`, 'i'),
    new RegExp(`並非\\s*${escaped}`, 'i'),
    new RegExp(`而非\\s*${escaped}`, 'i'),
    new RegExp(`非\\s*${escaped}`, 'i'),
    new RegExp(`不像\\s*${escaped}`, 'i'),
    new RegExp(`沒有\\s*${escaped}`, 'i'),
    new RegExp(`未見\\s*${escaped}`, 'i')
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function getAiIdentifyTargetAliases(task) {
  const targetLabel = task?.pass_criteria?.target_label || task?.ai_config?.target_label;
  return tutorialIdentifyAliases(targetLabel);
}

function containsTargetAliasMention(text, aliases = []) {
  const haystack = normalizeNullableString(text)?.toLowerCase() || '';
  if (!haystack) return false;
  return aliases.some((alias) => haystack.includes(String(alias).toLowerCase()));
}

function extractObservedLabelFromAiReason(reason = '', aliases = []) {
  const normalized = normalizeNullableString(reason);
  if (!normalized) return null;
  const patterns = [
    /顯示的是([^，。,；;]+?)(?:，|,|而非|不是|並非|。|；|;|$)/i,
    /看起來是([^，。,；;]+?)(?:，|,|而非|不是|並非|。|；|;|$)/i,
    /畫面中是([^，。,；;]+?)(?:，|,|而非|不是|並非|。|；|;|$)/i,
    /照片中是([^，。,；;]+?)(?:，|,|而非|不是|並非|。|；|;|$)/i,
    /我看到的是([^，。,；;]+?)(?:，|,|而非|不是|並非|。|；|;|$)/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = normalizeNullableString(match?.[1]);
    if (!candidate) continue;
    if (containsTargetAliasMention(candidate, aliases)) continue;
    return candidate;
  }
  return null;
}

function getObservedIdentifyLabel(task, aiLabel = '', aiReason = '') {
  const aliases = getAiIdentifyTargetAliases(task);
  const normalizedLabel = normalizeNullableString(aiLabel);
  if (
    normalizedLabel
    && !containsTargetAliasMention(normalizedLabel, aliases)
    && !aliases.some((alias) => hasNegativeAliasMention(normalizedLabel.toLowerCase(), String(alias).toLowerCase()))
  ) {
    return normalizedLabel;
  }
  return extractObservedLabelFromAiReason(aiReason, aliases);
}

function buildIdentifyFailureReason(task, aiLabel = '', aiReason = '') {
  const observedLabel = getObservedIdentifyLabel(task, aiLabel, aiReason);
  if (observedLabel) {
    return `我看到的是「${observedLabel}」，看起來和這一關要找的目標不太一樣。`;
  }
  if (containsTargetAliasMention(aiReason, getAiIdentifyTargetAliases(task))) {
    return '我有看到畫面主體，但它看起來還不是這一關要找的目標。';
  }
  return '我有看到你拍到的主體，但它看起來和這一關要找的目標不太一樣。';
}

function isSafeIndirectHintText(task, text = '') {
  const normalized = normalizeNullableString(text);
  if (!normalized) return false;
  return !containsTargetAliasMention(normalized, getAiIdentifyTargetAliases(task));
}

function getSafeIndirectHint(task) {
  const hintCandidates = [
    normalizeNullableString(task?.rescue_content),
    normalizeNullableString(task?.hint_text),
    normalizeNullableString(task?.stage_intro),
    normalizeNullableString(task?.guide_content)
  ].filter(Boolean);
  return hintCandidates.find((text) => isSafeIndirectHintText(task, text)) || null;
}

function buildIdentifyRetryAdvice(task, aiLabel = '', aiReason = '', rawRetryAdvice = '') {
  const observedLabel = getObservedIdentifyLabel(task, aiLabel, aiReason);
  const safeHint = getSafeIndirectHint(task);
  const safeRawRetry = normalizeNullableString(rawRetryAdvice);
  if (safeRawRetry && isSafeIndirectHintText(task, safeRawRetry)) {
    return safeRawRetry;
  }
  if (safeHint) {
    return `試著回到題目線索再找一次。提示：${safeHint}`;
  }
  if (observedLabel) {
    return '試著依照題目線索，找更接近目標特徵的內容再拍一次。把主體置中、靠近一些，避免背景太雜。';
  }
  return '試著回到題目線索，重新找更符合目標特徵的內容。把主體拍清楚、靠近一些，再試一次。';
}

function sanitizeAiTaskPlayerFacingResult(task, result) {
  if (!result || task?.validation_mode !== 'ai_identify' || result.passed) {
    return result;
  }
  const safeReason = normalizeNullableString(result.reason);
  const safeRetryAdvice = normalizeNullableString(result.retry_advice);
  const observedLabel = getObservedIdentifyLabel(task, result.label, result.reason);
  return {
    ...result,
    label: observedLabel || null,
    reason: isSafeIndirectHintText(task, safeReason)
      ? safeReason
      : buildIdentifyFailureReason(task, result.label, result.reason),
    retry_advice: isSafeIndirectHintText(task, safeRetryAdvice)
      ? safeRetryAdvice
      : buildIdentifyRetryAdvice(task, result.label, result.reason, result.retry_advice)
  };
}

function evaluateTutorialIdentifyOutcome(task, aiReason = '', aiLabel = '') {
  if (task?.validation_mode !== 'ai_identify') return 'unknown';
  const targetLabel = task?.pass_criteria?.target_label || task?.ai_config?.target_label;
  const aliases = tutorialIdentifyAliases(targetLabel);
  if (!aliases.length) return 'unknown';
  const haystack = `${normalizeNullableString(aiReason) || ''}\n${normalizeNullableString(aiLabel) || ''}`.toLowerCase();
  const negativeTarget = aliases.some((alias) => hasNegativeAliasMention(haystack, String(alias).toLowerCase()));
  if (negativeTarget) return 'mismatch';

  const positiveTarget = aliases.some((alias) => haystack.includes(String(alias).toLowerCase()));
  if (positiveTarget) return 'match';

  return 'mismatch';
}

function buildTutorialForcedAiReason(task, aiReason = '', aiPassed = null, aiLabel = '') {
  const fallback = `我看見了你上傳的畫面，但因為現在是教學模式，所以「${task?.name || '這一關'}」先讓你通過，方便你把整段流程走完。`;
  const normalized = normalizeNullableString(aiReason);
  if (!normalized) return fallback;
  const identifyOutcome = evaluateTutorialIdentifyOutcome(task, normalized, aiLabel);
  const effectivePass = task?.validation_mode === 'ai_identify'
    ? identifyOutcome === 'match'
    : aiPassed === true;
  if (!effectivePass) {
    return `我看見了：${normalized}\n\n不過這次不是這一關要找的內容喔。因為現在是教學模式，所以我還是先讓你通過，方便你繼續往下體驗。正式關卡時，還是需要拍到任務指定的物品或場景才會過關。`;
  }
  return `我看見了：${normalized}\n\n這看起來就是這一關要找的內容。因為現在是教學模式，所以我直接讓你通過，方便你繼續把流程走完。正式關卡時，仍然需要拍到任務要求的內容才會通過。`;
}

async function getUserIdByUsername(conn, username) {
  const [users] = await conn.execute('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  return users[0]?.id || null;
}

async function hasQuestChainCouponAccess(conn, userId, questChainId) {
  if (!userId || !questChainId) return false;
  const couponColumns = await getTableColumnSet(conn, 'user_coupons');
  if (!couponColumns.has('quest_chain_id')) return false;
  const statusExpr = couponColumns.has('status') ? "AND (status IS NULL OR status = 'active')" : '';
  const expiryExpr = couponColumns.has('expiry_date') ? 'AND (expiry_date IS NULL OR expiry_date >= CURDATE())' : '';
  const [rows] = await conn.execute(
    `SELECT id
       FROM user_coupons
      WHERE user_id = ?
        AND quest_chain_id = ?
        ${statusExpr}
        ${expiryExpr}
      ORDER BY id DESC
      LIMIT 1`,
    [userId, questChainId]
  );
  return rows.length > 0;
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

async function getQuestChainById(conn, questChainId) {
  const [rows] = await conn.execute('SELECT * FROM quest_chains WHERE id = ? LIMIT 1', [questChainId]);
  return rows[0] ? sanitizeQuestChainRow(rows[0]) : null;
}

async function assertQuestChainAccess(conn, actor, questChainId, { allowAdmin = true } = {}) {
  const chain = await getQuestChainById(conn, questChainId);
  if (!chain) {
    const err = new Error('找不到此玩法入口');
    err.statusCode = 404;
    throw err;
  }
  if (allowAdmin && actor?.role === 'admin') return chain;
  if (!actorCanAccessShop(actor, chain.shop_id)) {
    const err = new Error('無權限存取此玩法入口');
    err.statusCode = 403;
    throw err;
  }
  return chain;
}

function isQuestChainStructureLocked(chain) {
  if (!chain) return false;
  return Boolean(chain.structure_locked_at);
}

function resolveQuestChainStructureLockedAt(chain) {
  if (!chain) return null;
  return chain.structure_locked_at || null;
}

function isPrivilegedPreviewActor(actor) {
  return ['admin', 'shop', 'staff'].includes(actor?.role);
}

function resolveQuestPreviewContext(req, questChain = null, { getOptionalTokenUser } = {}) {
  const previewRequested = normalizeBoolean(req?.query?.preview ?? req?.body?.preview);
  const optionalUser = typeof getOptionalTokenUser === 'function'
    ? getOptionalTokenUser(req)
    : req?.user || null;
  const canPreviewByRole = previewRequested && isPrivilegedPreviewActor(optionalUser);
  if (!canPreviewByRole) {
    return { previewRequested, optionalUser, canPreviewUnpublished: false, deniedByShopScope: false };
  }
  if (questChain && optionalUser?.role !== 'admin' && !actorCanAccessShop(optionalUser, questChain.shop_id)) {
    return { previewRequested, optionalUser, canPreviewUnpublished: false, deniedByShopScope: true };
  }
  return { previewRequested, optionalUser, canPreviewUnpublished: true, deniedByShopScope: false };
}

function createStructureLockedError(scopeLabel = '此玩法入口') {
  const err = new Error(`${scopeLabel}核心結構已鎖定；目前只能調整文案與素材`);
  err.statusCode = 409;
  err.code = 'STRUCTURE_LOCKED';
  return err;
}

function cleanupUploadedFile(file) {
  if (!file?.path) return;
  fs.unlink(file.path, () => {});
}

async function assertQuestChainStructureUnlocked(conn, actor, questChainId, scopeLabel = '此玩法入口') {
  const chain = await assertQuestChainAccess(conn, actor, questChainId);
  if (isQuestChainStructureLocked(chain)) {
    throw createStructureLockedError(scopeLabel);
  }
  return chain;
}

const TASK_STRUCTURE_BOOLEAN_FIELDS = new Set(['location_required', 'is_final_step']);

function normalizeStructureComparableValue(value, field = null) {
  if (field && TASK_STRUCTURE_BOOLEAN_FIELDS.has(field)) {
    if (value === undefined || value === null || value === '') return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === '' || trimmed === '0' || trimmed === 'false' || trimmed === 'null') return false;
      if (trimmed === '1' || trimmed === 'true') return true;
    }
  }

  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) ? numeric : trimmed;
    }
    return trimmed;
  }
  return JSON.stringify(value);
}

const TASK_STRUCTURE_LOCKED_FIELDS = [
  'lat',
  'lng',
  'radius',
  'points',
  'task_type',
  'options',
  'correct_answer',
  'submission_type',
  'validation_mode',
  'ai_config',
  'pass_criteria',
  'max_attempts',
  'location_required',
  'type',
  'quest_chain_id',
  'quest_order',
  'time_limit_start',
  'time_limit_end',
  'max_participants',
  'required_item_id',
  'reward_item_id',
  'is_final_step',
  'ar_model_id',
  'ar_order_model',
  'ar_order_image',
  'ar_order_youtube'
];

function getLockedTaskStructureChanges(existingTask, nextTaskRecord = {}) {
  return TASK_STRUCTURE_LOCKED_FIELDS.filter((field) => {
    if (!(field in nextTaskRecord)) return false;
    const prev = normalizeStructureComparableValue(existingTask?.[field], field);
    const next = normalizeStructureComparableValue(nextTaskRecord[field], field);
    return prev !== next;
  });
}

const QUEST_CHAIN_STRUCTURE_LOCKED_FIELDS = [
  'chain_points',
  'mode_type',
  'entry_order',
  'access_mode',
  'experience_mode',
  'play_style',
  'game_rules',
  'content_blueprint'
];

function getLockedQuestChainStructureChanges(existingChain, nextChainRecord = {}) {
  return QUEST_CHAIN_STRUCTURE_LOCKED_FIELDS.filter((field) => {
    if (!(field in nextChainRecord)) return false;
    const prev = normalizeStructureComparableValue(existingChain?.[field], field);
    const next = normalizeStructureComparableValue(nextChainRecord[field], field);
    return prev !== next;
  });
}

async function getTaskByIdForScope(conn, taskId) {
  const [rows] = await conn.execute('SELECT * FROM tasks WHERE id = ? LIMIT 1', [taskId]);
  return rows[0] ? sanitizeTaskRow(rows[0]) : null;
}

async function assertTaskAccess(conn, actor, taskId, { allowAdmin = true } = {}) {
  const task = await getTaskByIdForScope(conn, taskId);
  if (!task) {
    const err = new Error('找不到此任務');
    err.statusCode = 404;
    throw err;
  }
  if (allowAdmin && actor?.role === 'admin') return task;
  if (!actorCanAccessShop(actor, task.shop_id)) {
    const err = new Error('無權限存取此任務');
    err.statusCode = 403;
    throw err;
  }
  return task;
}

async function getProductByIdForScope(conn, productId) {
  const [rows] = await conn.execute('SELECT * FROM products WHERE id = ? LIMIT 1', [productId]);
  return rows[0] || null;
}

async function assertProductAccess(conn, actor, productId, { allowAdmin = true } = {}) {
  const product = await getProductByIdForScope(conn, productId);
  if (!product) {
    const err = new Error('找不到此商品');
    err.statusCode = 404;
    throw err;
  }
  if (allowAdmin && actor?.role === 'admin') return product;
  if (!actorCanAccessShop(actor, product.shop_id)) {
    const err = new Error('無權限存取此商品');
    err.statusCode = 403;
    throw err;
  }
  return product;
}


module.exports = {
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
};
