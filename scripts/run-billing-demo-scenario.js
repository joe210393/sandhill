const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getDbConfig } = require('../db-config');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4325';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const DEMO_SLUG = process.env.DEMO_SLUG || 'billingdemo';
const DEMO_TITLE_PREFIX = process.env.DEMO_TITLE_PREFIX || '【計費示範】';
const SAMPLE_IMAGE_PATH = process.env.SAMPLE_IMAGE_PATH || path.resolve(__dirname, '../public/images/mascot.png');
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.resolve(__dirname, '../output/billing-demo-report.json');
const USER_COUNT = Math.max(1, Number(process.env.USER_COUNT || 2));

const PRICING_PLANS = [
  { code: 'starter_10', name: '10 關方案', task_limit: 10, setup_fee: 5000, monthly_base_fee: 0, token_price_per_1k: 0.1 },
  { code: 'growth_20', name: '20 關方案', task_limit: 20, setup_fee: 8000, monthly_base_fee: 0, token_price_per_1k: 0.1 },
  { code: 'pro_30', name: '30 關方案', task_limit: 30, setup_fee: 11000, monthly_base_fee: 0, token_price_per_1k: 0.1 }
];

const DEMO_SHOPS = [
  {
    key: 'coast',
    username: `${DEMO_SLUG}_shop_coast`,
    password: 'shop1234',
    shop_name: `${DEMO_TITLE_PREFIX}海岸教室`,
    contact_name: '海岸教室',
    contact_phone: '0900000001',
    contact_email: 'coast@example.com',
    shop_address: '測試海岸 1 號',
    shop_description: '10 關示範用商家',
    entries: [
      { title: `${DEMO_TITLE_PREFIX}海岸觀察 10 關版`, planCode: 'starter_10', order: 10, taskCount: 2 }
    ]
  },
  {
    key: 'farm',
    username: `${DEMO_SLUG}_shop_farm`,
    password: 'shop1234',
    shop_name: `${DEMO_TITLE_PREFIX}食農工坊`,
    contact_name: '食農工坊',
    contact_phone: '0900000002',
    contact_email: 'farm@example.com',
    shop_address: '測試農場 2 號',
    shop_description: '20 關示範用商家',
    entries: [
      { title: `${DEMO_TITLE_PREFIX}田野探索 20 關版`, planCode: 'growth_20', order: 20, taskCount: 3 }
    ]
  },
  {
    key: 'forest',
    username: `${DEMO_SLUG}_shop_forest`,
    password: 'shop1234',
    shop_name: `${DEMO_TITLE_PREFIX}森林學堂`,
    contact_name: '森林學堂',
    contact_phone: '0900000003',
    contact_email: 'forest@example.com',
    shop_address: '測試林道 3 號',
    shop_description: '30 關示範用商家',
    entries: [
      { title: `${DEMO_TITLE_PREFIX}林道任務 30 關版`, planCode: 'pro_30', order: 30, taskCount: 3 },
      { title: `${DEMO_TITLE_PREFIX}濕地巡查 10 關版`, planCode: 'starter_10', order: 31, taskCount: 2 }
    ]
  }
];

function ensureOutputDir() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
}

function mergeCookie(existing, response) {
  const raw = response.headers.get('set-cookie');
  if (!raw) return existing || '';
  const next = raw
    .split(',')
    .map((chunk) => chunk.split(';')[0].trim())
    .filter(Boolean);
  const cookieMap = new Map();
  (existing || '').split(';').map((s) => s.trim()).filter(Boolean).forEach((pair) => {
    const [key, ...rest] = pair.split('=');
    cookieMap.set(key, `${key}=${rest.join('=')}`);
  });
  next.forEach((pair) => {
    const [key] = pair.split('=');
    cookieMap.set(key, pair);
  });
  return [...cookieMap.values()].join('; ');
}

async function jsonRequest(url, { method = 'GET', headers = {}, body, cookie } = {}) {
  const finalHeaders = { ...headers };
  if (cookie) finalHeaders.cookie = cookie;
  const response = await fetch(url, { method, headers: finalHeaders, body });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`Non-JSON response ${response.status} from ${url}: ${text.slice(0, 240)}`);
  }
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed ${response.status} for ${url}`);
  }
  return { data, cookie: mergeCookie(cookie, response) };
}

async function login({ username, password, role }) {
  return jsonRequest(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role })
  });
}

async function ensureUser(phone) {
  try {
    return await jsonRequest(`${BASE_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: phone, role: 'user' })
    });
  } catch (err) {
    if (!String(err.message).includes('帳號已存在')) throw err;
    return login({ username: phone, role: 'user' });
  }
}

function makeDemoPhone(index) {
  return `0905${String(100000 + index).slice(-6)}`;
}

function placeholderList(items) {
  return items.map(() => '?').join(', ');
}

async function configurePricingPlans(conn) {
  for (const plan of PRICING_PLANS) {
    await conn.execute(
      `INSERT INTO entry_plans (code, name, task_limit, setup_fee, monthly_base_fee, token_price_per_1k, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         task_limit = VALUES(task_limit),
         setup_fee = VALUES(setup_fee),
         monthly_base_fee = VALUES(monthly_base_fee),
         token_price_per_1k = VALUES(token_price_per_1k),
         is_active = TRUE`,
      [plan.code, plan.name, plan.task_limit, plan.setup_fee, plan.monthly_base_fee, plan.token_price_per_1k]
    );
  }
}

async function cleanupDemoData(conn) {
  const [shopRows] = await conn.execute(
    `SELECT id FROM shops
     WHERE owner_username LIKE ? OR code LIKE ? OR name LIKE ?`,
    [`${DEMO_SLUG}%`, `${DEMO_SLUG}%`, `${DEMO_TITLE_PREFIX}%`]
  );
  const [questRows] = await conn.execute(
    `SELECT id FROM quest_chains WHERE title LIKE ? OR name LIKE ?`,
    [`${DEMO_TITLE_PREFIX}%`, `${DEMO_TITLE_PREFIX}%`]
  );
  const [userRows] = await conn.execute(
    `SELECT id FROM users WHERE username LIKE ? OR shop_name LIKE ?`,
    [`${DEMO_SLUG}%`, `${DEMO_TITLE_PREFIX}%`]
  );

  const shopIds = shopRows.map((row) => Number(row.id));
  const questIds = questRows.map((row) => Number(row.id));
  const userIds = userRows.map((row) => Number(row.id));

  if (!shopIds.length && !questIds.length && !userIds.length) return;

  await conn.beginTransaction();
  try {
    let taskIds = [];
    if (questIds.length) {
      const [taskRows] = await conn.execute(
        `SELECT id FROM tasks WHERE quest_chain_id IN (${placeholderList(questIds)})`,
        questIds
      );
      taskIds = taskRows.map((row) => Number(row.id));
    }

    let boardMapIds = [];
    if (questIds.length) {
      const [boardRows] = await conn.execute(
        `SELECT id FROM board_maps WHERE quest_chain_id IN (${placeholderList(questIds)})`,
        questIds
      );
      boardMapIds = boardRows.map((row) => Number(row.id));
    }

    if (taskIds.length) {
      await conn.execute(`DELETE FROM task_attempts WHERE task_id IN (${placeholderList(taskIds)})`, taskIds);
      await conn.execute(`DELETE FROM user_tasks WHERE task_id IN (${placeholderList(taskIds)})`, taskIds);
      await conn.execute(`DELETE FROM llm_usage_logs WHERE task_id IN (${placeholderList(taskIds)})`, taskIds);
    }
    if (userIds.length) {
      await conn.execute(`DELETE FROM user_tasks WHERE user_id IN (${placeholderList(userIds)})`, userIds);
      await conn.execute(`DELETE FROM user_quests WHERE user_id IN (${placeholderList(userIds)})`, userIds);
      await conn.execute(`DELETE FROM llm_usage_logs WHERE user_id IN (${placeholderList(userIds)})`, userIds);
      await conn.execute(`DELETE FROM user_game_sessions WHERE user_id IN (${placeholderList(userIds)})`, userIds);
    }
    if (boardMapIds.length) {
      await conn.execute(`DELETE FROM user_game_sessions WHERE board_map_id IN (${placeholderList(boardMapIds)})`, boardMapIds);
      await conn.execute(`DELETE FROM board_tiles WHERE board_map_id IN (${placeholderList(boardMapIds)})`, boardMapIds);
      await conn.execute(`DELETE FROM board_maps WHERE id IN (${placeholderList(boardMapIds)})`, boardMapIds);
    }
    if (questIds.length) {
      await conn.execute(`DELETE FROM llm_usage_logs WHERE quest_chain_id IN (${placeholderList(questIds)})`, questIds);
      await conn.execute(`DELETE FROM llm_usage_monthly_summary WHERE quest_chain_id IN (${placeholderList(questIds)})`, questIds);
      await conn.execute(`DELETE FROM entry_billing_records WHERE quest_chain_id IN (${placeholderList(questIds)})`, questIds);
      await conn.execute(`DELETE FROM user_quests WHERE quest_chain_id IN (${placeholderList(questIds)})`, questIds);
      await conn.execute(`DELETE FROM user_game_sessions WHERE quest_chain_id IN (${placeholderList(questIds)})`, questIds);
      if (taskIds.length) {
        await conn.execute(`DELETE FROM tasks WHERE id IN (${placeholderList(taskIds)})`, taskIds);
      }
      await conn.execute(`DELETE FROM quest_chains WHERE id IN (${placeholderList(questIds)})`, questIds);
    }
    if (shopIds.length) {
      await conn.execute(`DELETE FROM llm_usage_logs WHERE shop_id IN (${placeholderList(shopIds)})`, shopIds);
      await conn.execute(`DELETE FROM llm_usage_monthly_summary WHERE shop_id IN (${placeholderList(shopIds)})`, shopIds);
      await conn.execute(`DELETE FROM entry_billing_records WHERE shop_id IN (${placeholderList(shopIds)})`, shopIds);
      await conn.execute(`UPDATE users SET shop_id = NULL WHERE shop_id IN (${placeholderList(shopIds)})`, shopIds);
      await conn.execute(`DELETE FROM shops WHERE id IN (${placeholderList(shopIds)})`, shopIds);
    }
    if (userIds.length) {
      await conn.execute(`DELETE FROM users WHERE id IN (${placeholderList(userIds)})`, userIds);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

async function createShopViaAdmin(cookie, shop) {
  const { data } = await jsonRequest(`${BASE_URL}/api/admin/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      username: shop.username,
      password: shop.password,
      role: 'shop',
      shop_name: shop.shop_name,
      contact_name: shop.contact_name,
      contact_phone: shop.contact_phone,
      contact_email: shop.contact_email,
      shop_address: shop.shop_address,
      shop_description: shop.shop_description,
      status: 'active'
    })
  });
  return Number(data.shop_id);
}

async function fetchPlans(cookie) {
  const { data } = await jsonRequest(`${BASE_URL}/api/entry-plans?include_inactive=1`, { cookie });
  return data.plans || [];
}

async function createQuestChain(cookie, shopId, planId, entry) {
  const form = new FormData();
  form.append('shop_id', String(shopId));
  form.append('plan_id', String(planId));
  form.append('title', entry.title);
  form.append('description', `${entry.title} 的計費示範入口，會真的走 LM 判定。`);
  form.append('short_description', '供商業計費與 LM 用量展示');
  form.append('chain_points', '120');
  form.append('mode_type', 'story_campaign');
  form.append('entry_order', String(entry.order || 0));
  form.append('entry_button_text', '開始示範');
  form.append('entry_scene_label', 'LM 計費示範');
  form.append('play_style', 'field_exploration');
  form.append('access_mode', 'public');
  form.append('experience_mode', 'tutorial');
  form.append('game_rules', JSON.stringify({ demo_autopass: true }));
  form.append('content_blueprint', JSON.stringify({ category: 'billing_demo' }));
  form.append('is_active', '0');
  form.append('setup_fee_paid', '0');
  form.append('monthly_billing_enabled', '1');
  const { data } = await jsonRequest(`${BASE_URL}/api/quest-chains`, {
    method: 'POST',
    body: form,
    cookie
  });
  return Number(data.id);
}

async function publishQuestChain(cookie, entryId, shopId, planId, entry) {
  const form = new FormData();
  form.append('shop_id', String(shopId));
  form.append('plan_id', String(planId));
  form.append('title', entry.title);
  form.append('description', `${entry.title} 的計費示範入口，會真的走 LM 判定。`);
  form.append('short_description', '供商業計費與 LM 用量展示');
  form.append('chain_points', '120');
  form.append('mode_type', 'story_campaign');
  form.append('entry_order', String(entry.order || 0));
  form.append('entry_button_text', '開始示範');
  form.append('entry_scene_label', 'LM 計費示範');
  form.append('play_style', 'field_exploration');
  form.append('access_mode', 'public');
  form.append('experience_mode', 'tutorial');
  form.append('game_rules', JSON.stringify({ demo_autopass: true }));
  form.append('content_blueprint', JSON.stringify({ category: 'billing_demo' }));
  form.append('is_active', '1');

  await jsonRequest(`${BASE_URL}/api/quest-chains/${entryId}`, {
    method: 'PUT',
    body: form,
    cookie
  });
}

async function createAiTask(cookie, questChainId, shopId, taskName, order, targetLabel) {
  const payload = {
    name: taskName,
    lat: '0',
    lng: '0',
    radius: '0',
    description: `${taskName}：請拍攝符合線索的內容，讓 AI 做辨識。`,
    photoUrl: '/images/mascot.png',
    youtubeUrl: null,
    ar_image_url: null,
    points: '0',
    task_type: 'photo',
    options: null,
    correct_answer: null,
    submission_type: 'image',
    validation_mode: 'ai_identify',
    ai_config: {
      system_prompt: '你是戶外探索課程的 AI 裁判。先描述玩家拍到的內容，再根據題目線索給暗示，不要直接說答案。',
      user_prompt: `請判斷這張照片是否符合題目「${taskName}」的線索。`,
      target_label: targetLabel
    },
    pass_criteria: { target_label: targetLabel, min_confidence: 0.1 },
    failure_message: '這次拍到的內容不太像，請再試一次。',
    success_message: 'AI 已確認，這一關通過。',
    max_attempts: '5',
    location_required: false,
    type: 'quest',
    quest_chain_id: String(questChainId),
    quest_order: String(order),
    required_item_id: null,
    reward_item_id: null,
    is_final_step: order >= 2,
    bgm_url: null,
    stage_template: 'story_intro',
    stage_intro: `${taskName}：請根據題目提示完成拍照。`,
    hint_text: '回到現場描述，找找看具有相符特徵的目標。',
    story_context: '這是一段戶外探索學習情境。',
    guide_content: '先觀察周遭，再決定拍什麼。',
    rescue_content: '你可以先判斷它是動物、植物、標誌還是物件。',
    event_config: null,
    is_active: true,
    shop_id: String(shopId)
  };
  const { data } = await jsonRequest(`${BASE_URL}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cookie
  });
  return Number(data.id);
}

async function seedDemoScenario() {
  const db = await mysql.createConnection(getDbConfig());
  const adminLogin = await login({ username: ADMIN_USER, password: ADMIN_PASSWORD, role: 'staff_portal' });
  let adminCookie = adminLogin.cookie;
  try {
    await cleanupDemoData(db);
    await configurePricingPlans(db);

    const plans = await fetchPlans(adminCookie);
    const planMap = new Map(plans.map((plan) => [plan.code, plan]));
    const scenario = [];

    for (const shop of DEMO_SHOPS) {
      const shopId = await createShopViaAdmin(adminCookie, shop);
      const shopLogin = await login({ username: shop.username, password: shop.password, role: 'staff_portal' });
      let shopCookie = shopLogin.cookie;
      const seededEntries = [];

      for (const entry of shop.entries) {
        const plan = planMap.get(entry.planCode);
        if (!plan) throw new Error(`找不到方案 ${entry.planCode}`);
        const questChainId = await createQuestChain(shopCookie, shopId, plan.id, entry);
        const taskIds = [];
        for (let i = 1; i <= entry.taskCount; i += 1) {
          const taskId = await createAiTask(
            shopCookie,
            questChainId,
            shopId,
            `${entry.title}｜第 ${i} 關`,
            i,
            i % 2 === 0 ? '植物' : '動物'
          );
          taskIds.push(taskId);
        }
        await publishQuestChain(shopCookie, questChainId, shopId, plan.id, entry);
        seededEntries.push({
          id: questChainId,
          title: entry.title,
          plan_code: entry.planCode,
          plan_name: plan.name,
          task_limit: Number(plan.task_limit || 0),
          setup_fee: Number(plan.setup_fee || 0),
          task_ids: taskIds
        });
      }

      scenario.push({
        shop_id: shopId,
        shop_username: shop.username,
        shop_name: shop.shop_name,
        entries: seededEntries
      });
    }

    return scenario;
  } finally {
    await db.end().catch(() => {});
  }
}

async function submitTutorialPhoto(taskId, cookie) {
  const form = new FormData();
  const buffer = fs.readFileSync(SAMPLE_IMAGE_PATH);
  form.append('image', new Blob([buffer], { type: 'image/png' }), path.basename(SAMPLE_IMAGE_PATH));
  return jsonRequest(`${BASE_URL}/api/tutorial/ai-tasks/${taskId}/submit`, {
    method: 'POST',
    body: form,
    cookie
  });
}

async function playEntry(entry, cookie) {
  const { data: contentData } = await jsonRequest(`${BASE_URL}/api/quest-chains/${entry.id}/public-content`, { cookie });
  const steps = [];
  for (const task of contentData.tasks || []) {
    const photoResult = await submitTutorialPhoto(task.id, cookie);
    cookie = photoResult.cookie;
    steps.push({
      task_id: task.id,
      task_name: task.name,
      passed: Boolean(photoResult.data.passed),
      reason: photoResult.data.reason || photoResult.data.message || ''
    });
  }
  return { cookie, steps };
}

async function simulateUsers() {
  const { data: entryData } = await jsonRequest(`${BASE_URL}/api/game-entries`);
  const targetEntries = [...(entryData.storyCampaigns || []), ...(entryData.boardGames || [])]
    .filter((entry) => String(entry.title || '').startsWith(DEMO_TITLE_PREFIX))
    .filter((entry) => entry.mode_type === 'story_campaign');

  const users = [];
  for (let i = 1; i <= USER_COUNT; i += 1) {
    const phone = makeDemoPhone(i);
    const loginResult = await ensureUser(phone);
    let cookie = loginResult.cookie;
    const played = [];
    for (const entry of targetEntries) {
      const result = await playEntry(entry, cookie);
      cookie = result.cookie;
      played.push({
        entry_id: entry.id,
        entry_title: entry.title,
        steps: result.steps
      });
    }
    users.push({ username: phone, played });
  }
  return { user_count: users.length, entries: targetEntries, users };
}

async function collectBillingReport() {
  const db = await mysql.createConnection(getDbConfig());
  const adminLogin = await login({ username: ADMIN_USER, password: ADMIN_PASSWORD, role: 'staff_portal' });
  const cookie = adminLogin.cookie;
  const billingMonth = new Date().toISOString().slice(0, 7);

  try {
    const [overviewRes, shopsRes, entriesRes, logsRes] = await Promise.all([
      jsonRequest(`${BASE_URL}/api/billing/overview?billing_month=${encodeURIComponent(billingMonth)}`, { cookie }),
      jsonRequest(`${BASE_URL}/api/billing/shops?billing_month=${encodeURIComponent(billingMonth)}`, { cookie }),
      jsonRequest(`${BASE_URL}/api/billing/entries?billing_month=${encodeURIComponent(billingMonth)}`, { cookie }),
      jsonRequest(`${BASE_URL}/api/billing/logs?billing_month=${encodeURIComponent(billingMonth)}&limit=200`, { cookie })
    ]);

    const demoEntryTitles = new Set(
      (entriesRes.data.entries || [])
        .filter((entry) => String(entry.title || '').startsWith(DEMO_TITLE_PREFIX))
        .map((entry) => entry.title)
    );
    const [usageRows] = await db.execute(
      `SELECT COUNT(*) AS log_count,
              COALESCE(SUM(total_tokens), 0) AS total_tokens
       FROM llm_usage_logs
       WHERE quest_chain_id IN (
         SELECT id FROM quest_chains WHERE title LIKE ?
       )`,
      [`${DEMO_TITLE_PREFIX}%`]
    );

    return {
      billing_month: billingMonth,
      overview: overviewRes.data.overview,
      shops: (shopsRes.data.shops || []).filter((shop) => String(shop.name || '').startsWith(DEMO_TITLE_PREFIX)),
      entries: (entriesRes.data.entries || []).filter((entry) => demoEntryTitles.has(entry.title)),
      logs: (logsRes.data.logs || []).filter((log) => demoEntryTitles.has(log.quest_chain_title)),
      db_usage: {
        log_count: Number(usageRows[0]?.log_count || 0),
        total_tokens: Number(usageRows[0]?.total_tokens || 0)
      }
    };
  } finally {
    await db.end().catch(() => {});
  }
}

async function main() {
  ensureOutputDir();
  const startedAt = new Date().toISOString();
  const seeded = await seedDemoScenario();
  const simulation = await simulateUsers();
  const billing = await collectBillingReport();

  const output = {
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    base_url: BASE_URL,
    pricing_standard: {
      setup_fee_rule: '10 關 5000，每增加 10 關 +3000；不滿 10 關以 10 關計',
      token_rule: '每 10000 tokens = 1 元'
    },
    seeded,
    simulation,
    billing
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log('BILLING_DEMO_SUCCESS');
  console.log(JSON.stringify({
    outputPath: OUTPUT_PATH,
    entryCount: billing.entries.length,
    logCount: billing.db_usage.log_count,
    totalTokens: billing.db_usage.total_tokens
  }, null, 2));
}

main().catch((err) => {
  console.error('BILLING_DEMO_FAILED');
  console.error(err);
  process.exit(1);
});
