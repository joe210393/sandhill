const puppeteer = require('puppeteer');
const mysql = require('mysql2/promise');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4325';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const MYSQL_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3407);
const MYSQL_USERNAME = process.env.MYSQL_USERNAME || process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'testpass';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'sandhill_test';

async function loginAsAdmin(page) {
  await page.goto(`${BASE_URL}/login.html?force=1`, { waitUntil: 'networkidle2' });
  const result = await page.evaluate(
    async ({ username, password }) => {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, role: 'staff_portal' })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('loginUser', JSON.stringify(data.user));
      }
      return { status: res.status, data };
    },
    { username: ADMIN_USER, password: ADMIN_PASSWORD }
  );

  if (!result.data?.success) {
    throw new Error(`Admin login failed: ${JSON.stringify(result)}`);
  }

  return result.data.user;
}

async function createShopViaApi(page, stamp) {
  const shopUsername = `phase5_shop_${stamp}`;
  const result = await page.evaluate(
    async ({ username, password, shopName }) => {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          role: 'shop',
          shop_name: shopName,
          contact_name: '第五階段驗收店家',
          contact_phone: '0900000000',
          contact_email: 'phase5@example.com',
          shop_address: '測試路 5 號',
          shop_description: '第五階段驗收用商家'
        })
      });
      return { status: res.status, body: await res.json() };
    },
    { username: shopUsername, password: 'shop1234', shopName: `第五階段驗收商家-${stamp}` }
  );

  if (!result.body?.success || !result.body?.shop_id) {
    throw new Error(`Create shop failed: ${JSON.stringify(result)}`);
  }

  return String(result.body.shop_id);
}

async function createQuestChainViaApi(page, { shopId, planId, title }) {
  const result = await page.evaluate(
    async ({ nextShopId, nextPlanId, nextTitle }) => {
      const fd = new FormData();
      fd.append('shop_id', nextShopId);
      fd.append('plan_id', nextPlanId);
      fd.append('title', nextTitle);
      fd.append('description', '第五階段計費驗收入口');
      fd.append('short_description', 'LM 計費驗收用');
      fd.append('chain_points', '88');
      fd.append('mode_type', 'story_campaign');
      fd.append('entry_order', '0');
      fd.append('access_mode', 'public');
      fd.append('experience_mode', 'formal');
      fd.append('is_active', '1');
      fd.append('setup_fee_paid', '0');
      fd.append('monthly_billing_enabled', '1');
      const res = await fetch('/api/quest-chains', {
        method: 'POST',
        credentials: 'include',
        body: fd
      });
      return { status: res.status, body: await res.json() };
    },
    { nextShopId: shopId, nextPlanId: String(planId), nextTitle: title }
  );

  if (!result.body?.success || !result.body?.id) {
    throw new Error(`Create quest chain failed: ${JSON.stringify(result)}`);
  }

  return Number(result.body.id);
}

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 1100 }
  });
  const page = await browser.newPage();
  const db = await mysql.createConnection({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USERNAME,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE
  });
  const stamp = Date.now();
  const billingMonth = new Date().toISOString().slice(0, 7);
  const questTitle = `Phase5計費入口-${stamp}`;
  const stepLog = [];

  try {
    stepLog.push('登入 admin');
    await loginAsAdmin(page);

    stepLog.push('建立驗收 shop');
    const shopId = await createShopViaApi(page, stamp);

    stepLog.push('設定方案費率');
    const [[plan]] = await db.execute('SELECT * FROM entry_plans ORDER BY task_limit ASC, id ASC LIMIT 1');
    if (!plan) {
      throw new Error('No entry plans found for phase 5 verification');
    }
    await db.execute(
      'UPDATE entry_plans SET monthly_base_fee = ?, token_price_per_1k = ?, setup_fee = ? WHERE id = ?',
      [1200, 25, 3600, plan.id]
    );

    stepLog.push('建立入口');
    const questChainId = await createQuestChainViaApi(page, { shopId, planId: plan.id, title: questTitle });

    stepLog.push('寫入 LM 月報與明細');
    await db.execute(
      `INSERT INTO llm_usage_monthly_summary
        (shop_id, quest_chain_id, billing_month, prompt_tokens, completion_tokens, total_tokens, estimated_amount, is_invoiced)
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)
       ON DUPLICATE KEY UPDATE
         prompt_tokens = VALUES(prompt_tokens),
         completion_tokens = VALUES(completion_tokens),
         total_tokens = VALUES(total_tokens),
         estimated_amount = VALUES(estimated_amount),
         is_invoiced = FALSE`,
      [shopId, questChainId, billingMonth, 900, 600, 1500, 1237.5]
    );
    await db.execute(
      `INSERT INTO llm_usage_logs
        (shop_id, quest_chain_id, task_id, user_id, provider, model, request_type, prompt_tokens, completion_tokens, total_tokens, success, meta_json)
       VALUES (?, ?, NULL, NULL, 'openai_compatible', 'phase5-test-model', 'ai_identify', ?, ?, ?, TRUE, ?)`,
      [shopId, questChainId, 900, 600, 1500, JSON.stringify({ source: 'verify-phase5' })]
    );

    stepLog.push('驗證 billing API');
    const apiCheck = await page.evaluate(async (targetMonth, targetTitle) => {
      const [overviewRes, entriesRes, logsRes, recordsRes] = await Promise.all([
        fetch(`/api/billing/overview?billing_month=${encodeURIComponent(targetMonth)}`, { credentials: 'include' }),
        fetch(`/api/billing/entries?billing_month=${encodeURIComponent(targetMonth)}`, { credentials: 'include' }),
        fetch(`/api/billing/logs?billing_month=${encodeURIComponent(targetMonth)}&limit=20`, { credentials: 'include' }),
        fetch('/api/entry-billing-records?limit=20', { credentials: 'include' })
      ]);
      const [overview, entries, logs, records] = await Promise.all([
        overviewRes.json(),
        entriesRes.json(),
        logsRes.json(),
        recordsRes.json()
      ]);
      return {
        overview,
        entries,
        logs,
        records,
        hasEntry: (entries.entries || []).some((entry) => entry.title === targetTitle && Number(entry.total_tokens) === 1500),
        hasLog: (logs.logs || []).some((log) => log.quest_chain_title === targetTitle && Number(log.total_tokens) === 1500),
        hasSetupFee: (records.records || []).some((record) => record.quest_chain_title === targetTitle)
      };
    }, billingMonth, questTitle);

    if (!apiCheck.overview?.success || !apiCheck.entries?.success || !apiCheck.logs?.success || !apiCheck.records?.success) {
      throw new Error(`Billing API verification failed: ${JSON.stringify(apiCheck)}`);
    }
    if (!apiCheck.hasEntry || !apiCheck.hasLog || !apiCheck.hasSetupFee) {
      throw new Error(`Billing API payload incomplete: ${JSON.stringify(apiCheck)}`);
    }

    stepLog.push('驗證 staff-dashboard-v2 計費畫面');
    await page.goto(`${BASE_URL}/staff-dashboard-v2.html#billing`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      (targetTitle) => {
        const table = document.getElementById('billingEntriesTable');
        return table && table.textContent.includes(targetTitle) && table.textContent.includes('1,500');
      },
      {},
      questTitle
    );
    await page.waitForFunction(() => {
      const cards = document.getElementById('billingOverviewCards');
      return cards && cards.textContent.includes('本月總 tokens') && cards.textContent.includes('本月預估金額');
    });

    stepLog.push('驗證 staff-dashboard 舊版計費畫面');
    await page.goto(`${BASE_URL}/staff-dashboard.html#billing`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      (targetTitle) => {
        const table = document.getElementById('billingEntriesTable');
        return table && table.textContent.includes(targetTitle) && table.textContent.includes('1,500');
      },
      {},
      questTitle
    );

    console.log('VERIFY_PHASE5_SUCCESS');
    console.log(JSON.stringify({ billingMonth, questTitle, stepLog }, null, 2));
  } finally {
    await db.end().catch(() => {});
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error('VERIFY_PHASE5_FAILED');
  console.error(error);
  process.exit(1);
});
