// ============================================================
// staff-dashboard-v2.js — 沙丘內容控制台 V2
// Sidebar + Drill-down + Right Drawer architecture
// Backend API unchanged — only presentation layer refactored
// ============================================================

let loginUser = window.loginUser || JSON.parse(localStorage.getItem('loginUser') || 'null');

const API_BASE = '';
const nativeFetch = window.fetch.bind(window);

function withActorHeaders(extra = {}) {
  return loginUser?.username && !extra['x-username']
    ? { ...extra, 'x-username': loginUser.username }
    : extra;
}

window.fetch = async function patchedStaffFetch(input, options = {}) {
  const mergedOptions = {
    credentials: 'same-origin',
    ...options,
    headers: withActorHeaders(options.headers || {})
  };

  try {
    const res = await nativeFetch(input, mergedOptions);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json') || res.status === 204) {
      return res;
    }

    const text = await res.text();
    const message =
      res.status === 401 ? '登入已失效，請重新登入' :
      res.status === 502 ? '伺服器暫時無法回應（Bad Gateway），請稍後再試' :
      (text || `HTTP ${res.status}`);

    return new Response(JSON.stringify({ success: false, message }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: '網路連線失敗，請稍後再試'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

async function apiJson(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (error) {
    throw new Error('伺服器回應格式異常');
  }

  if (res.status === 401) {
    localStorage.removeItem('loginUser');
    window.location.href = '/login.html';
    throw new Error(data?.message || '登入已失效，請重新登入');
  }

  return data;
}

// ── Global State ──────────────────────────────────────────────
let globalQuestChainsMap = {};
let globalShopsMap = {};
let globalEntryPlansMap = {};
let globalTaskRecords = [];
let globalBoardMaps = [];
let globalModelsMap = {};
let globalItemsMap = {};
let globalBgmLibraryMap = {};
let currentStructureMap = null;
let currentStructureSelection = null;
let taskWizardStep = 1;
const TASK_WIZARD_TOTAL_STEPS = 4;
let currentBillingDailyData = null;
let currentBillingDailyScope = 'platform';
const DRAWER_FORM_ID_MAP = {
  'form-quest-chain': 'questChainForm',
  'form-board-map': 'boardMapForm',
  'form-task': 'taskForm',
  'form-tile': 'tileForm',
  'form-item': 'itemForm',
  'form-bgm-asset': 'bgmAssetForm',
  'form-asset': 'assetForm',
  'form-npc': 'npcForm',
  'form-product': 'productForm',
  'form-import-users': 'importUsersForm',
  'form-shop': 'shopForm',
  'form-plan': 'planForm'
};

// Current drill-down context
let currentQuestChainId = null;
let currentQuestChainTitle = '';
let currentQuestChainMode = '';

// Drawer state
let activeFormId = null;
let currentQuestChainSearchTerm = '';

// ── Utilities ─────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type} show`;
  setTimeout(() => t.classList.remove('show'), 2800);
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function setInlineMessage(elOrId, message = '', type = 'error') {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  el.textContent = message;
  el.className = `inline-form-msg${message ? ` ${type}` : ''}`;
}

function formatCurrency(amount) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return 'NT$0';
  return `NT$${value.toLocaleString('zh-TW')}`;
}

function formatTokenPricingRule(tokenPricePer1k = 0) {
  const perTenThousand = Number(tokenPricePer1k || 0) * 10;
  return `每 1 萬 tokens ${formatCurrency(perTenThousand)}`;
}

function formatTokenPricingDetail(tokenPricePer1k = 0) {
  const perTenThousand = Number(tokenPricePer1k || 0) * 10;
  return `${formatTokenPricingRule(tokenPricePer1k)}｜等於每 1K tokens ${formatCurrency(tokenPricePer1k)}`;
}

function normalizeQuestChainBillingPolicy(chain = null) {
  if (!chain) return 'commercial';
  const policy = typeof chain.billing_policy === 'string' ? chain.billing_policy.trim().toLowerCase() : '';
  if (policy === 'public_good') return 'public_good';
  if (!policy && String(chain.created_by || '').trim().toLowerCase() === 'admin') return 'public_good';
  return 'commercial';
}

function isPublicGoodQuestChain(chain = null) {
  return normalizeQuestChainBillingPolicy(chain) === 'public_good';
}

function populateQuestChainShopOptions() {
  const select = document.getElementById('questChainShopSelect');
  if (!select) return;
  const isAdmin = loginUser?.role === 'admin';
  const actorShopId = loginUser?.shop_id ? String(loginUser.shop_id) : '';
  const options = Object.values(globalShopsMap);
  select.innerHTML = isAdmin
    ? '<option value="">-- 請選擇商家 --</option>'
    : '';
  options.forEach((shop) => {
    const option = document.createElement('option');
    option.value = String(shop.id);
    option.textContent = shop.name || `商家 #${shop.id}`;
    select.appendChild(option);
  });
  if (!isAdmin && actorShopId) {
    select.value = actorShopId;
  }
  const staffShopSelect = document.getElementById('staffShopSelect');
  if (staffShopSelect) {
    const currentValue = staffShopSelect.value;
    staffShopSelect.innerHTML = '<option value="">-- 請選擇商店 --</option>';
    options.forEach((shop) => {
      const option = document.createElement('option');
      option.value = String(shop.id);
      option.textContent = shop.name || `商家 #${shop.id}`;
      staffShopSelect.appendChild(option);
    });
    if (currentValue) staffShopSelect.value = currentValue;
  }
}

function populateQuestChainPlanOptions() {
  const select = document.getElementById('questChainPlanSelect');
  if (!select) return;
  select.innerHTML = '<option value="">-- 請選擇方案 --</option>';
  Object.values(globalEntryPlansMap)
    .sort((a, b) => Number(a.task_limit || 0) - Number(b.task_limit || 0))
    .forEach((plan) => {
      const option = document.createElement('option');
      option.value = String(plan.id);
      option.textContent = `${plan.name || `方案 ${plan.id}`}｜${plan.task_limit || 0} 關｜${formatCurrency(plan.setup_fee)}`;
      select.appendChild(option);
    });
}

function syncQuestChainCommercialFields() {
  const form = document.getElementById('questChainForm');
  if (!form) return;
  const isEditing = Boolean(form.elements.id?.value);
  const shopSelect = form.elements.shop_id;
  const planSelect = form.elements.plan_id;
  const taskLimitInput = form.elements.task_limit;
  const setupFeeInput = form.elements.setup_fee;
  const setupFeePaidInput = form.elements.setup_fee_paid;
  const monthlyBillingInput = form.elements.monthly_billing_enabled;
  const shopHint = document.getElementById('questChainShopHint');
  const planHint = document.getElementById('questChainPlanHint');
  const summary = document.getElementById('questChainCommercialSummaryText');
  const billingHint = document.getElementById('questChainBillingPolicyHint');
  const setupFeePaidLabel = document.getElementById('questChainSetupFeePaidLabel');
  const monthlyBillingLabel = document.getElementById('questChainMonthlyBillingLabel');
  const selectedShop = globalShopsMap[String(shopSelect?.value || '')] || null;
  const selectedPlan = globalEntryPlansMap[String(planSelect?.value || '')] || null;
  const editingChain = isEditing ? globalQuestChainsMap[String(form.elements.id?.value || '')] || null : null;
  const billingPolicy = editingChain
    ? normalizeQuestChainBillingPolicy(editingChain)
    : (loginUser?.role === 'admin' ? 'public_good' : 'commercial');
  const isPublicGood = billingPolicy === 'public_good';

  if (selectedPlan) {
    taskLimitInput.value = selectedPlan.task_limit ?? '';
    setupFeeInput.value = selectedPlan.setup_fee ?? 0;
  } else if (!isEditing || !planSelect?.value) {
    taskLimitInput.value = '';
    setupFeeInput.value = '';
  }

  if (!loginUser?.role || !shopSelect || !planSelect) return;
  if (loginUser.role !== 'admin' && loginUser.shop_id) {
    shopSelect.value = String(loginUser.shop_id);
  }

  const lockCommercialFields = isEditing;
  shopSelect.disabled = loginUser.role !== 'admin' || lockCommercialFields;
  planSelect.disabled = lockCommercialFields;
  if (setupFeePaidInput) {
    setupFeePaidInput.disabled = isPublicGood;
    if (isPublicGood) setupFeePaidInput.checked = false;
  }
  if (monthlyBillingInput) {
    monthlyBillingInput.disabled = isPublicGood;
    if (isPublicGood) monthlyBillingInput.checked = true;
  }
  if (setupFeePaidLabel) {
    setupFeePaidLabel.textContent = isPublicGood ? '公益入口免收建置費' : '已完成建置費收款';
  }
  if (monthlyBillingLabel) {
    monthlyBillingLabel.textContent = isPublicGood ? '持續統計 LM tokens 與公益代付值' : '啟用每月 LM token 計費';
  }

  if (shopHint) {
    shopHint.textContent = loginUser.role === 'admin'
      ? (lockCommercialFields ? '入口建立後商家歸屬會固定保留；若要搬移，建議以資料遷移方式處理。' : 'admin 可指定入口要歸屬到哪個建置商家；由 admin 建立時，會自動視為公益入口。')
      : '這個入口會自動歸屬在你目前登入的商家底下。';
  }
  if (planHint) {
    planHint.textContent = lockCommercialFields
      ? '入口建立後會保留原本方案與關卡上限，避免後續計價與內容範圍混亂。'
      : (isPublicGood ? '公益入口仍會綁定方案，方便統計關卡上限與捐贈等值。' : '請先選擇方案，系統會自動帶入關卡上限與一次性建置費。');
  }
  if (billingHint) {
    billingHint.textContent = isPublicGood
      ? '這個入口屬於 admin 建置的公益入口：不代收建置費、不向商家收取 LM 月費，但仍會統計 token 與公益代付值。'
      : '商業入口會記錄建置費與月費；若由 admin 建置，會自動改為公益入口。';
  }

  if (summary) {
    const shopText = selectedShop?.name || (shopSelect?.value ? `商家 #${shopSelect.value}` : '尚未指定商家');
    const planText = selectedPlan?.name || (planSelect?.value ? `方案 #${planSelect.value}` : '尚未指定方案');
    const limitText = taskLimitInput?.value ? `${taskLimitInput.value} 關` : '未設定關卡上限';
    const feeText = formatCurrency(setupFeeInput?.value);
    summary.textContent = isPublicGood
      ? `${shopText}｜${planText}｜${limitText}｜公益入口｜建置費參考 ${feeText}（免收）`
      : `${shopText}｜${planText}｜${limitText}｜建置費 ${feeText}`;
  }
}

function loadShops() {
  return apiJson(`${API_BASE}/api/shops`, {
    headers: withActorHeaders()
  }).then((data) => {
    globalShopsMap = {};
    (data.shops || []).forEach((shop) => {
      globalShopsMap[String(shop.id)] = shop;
    });
    populateQuestChainShopOptions();
    syncQuestChainCommercialFields();
    if (Object.keys(globalQuestChainsMap).length) {
      renderQuestChainList(filterQuestChains(Object.values(globalQuestChainsMap)));
    }
    renderShopList(Object.values(globalShopsMap));
  });
}

function loadEntryPlans() {
  const suffix = loginUser?.role === 'admin' ? '?include_inactive=1' : '';
  return apiJson(`${API_BASE}/api/entry-plans${suffix}`, {
    headers: withActorHeaders()
  }).then((data) => {
    globalEntryPlansMap = {};
    (data.plans || []).forEach((plan) => {
      globalEntryPlansMap[String(plan.id)] = plan;
    });
    populateQuestChainPlanOptions();
    syncQuestChainCommercialFields();
    if (Object.keys(globalQuestChainsMap).length) {
      renderQuestChainList(filterQuestChains(Object.values(globalQuestChainsMap)));
    }
    renderPlanList(Object.values(globalEntryPlansMap));
  });
}

function getDefaultBillingMonth() {
  return new Date().toISOString().slice(0, 7);
}

function getSelectedBillingMonth() {
  const input = document.getElementById('billingMonthInput');
  return input?.value || getDefaultBillingMonth();
}

function formatTokenCount(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString('zh-TW') : '0';
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDayLabel(value) {
  if (!value) return '';
  const [, month = '', day = ''] = String(value).split('-');
  return `${month}/${day}`;
}

function sumBy(items = [], field) {
  return items.reduce((sum, item) => sum + Number(item?.[field] || 0), 0);
}

function getBillingColorPalette() {
  return ['#0f766e', '#2563eb', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#65a30d', '#db2777'];
}

function pickBillingSeriesColor(index) {
  const palette = getBillingColorPalette();
  return palette[index % palette.length];
}

function filterQuestChains(chains = []) {
  const term = String(currentQuestChainSearchTerm || '').trim().toLowerCase();
  if (!term) return chains;
  return chains.filter((chain) => {
    const haystack = [
      chain.title,
      chain.short_description,
      chain.shop_name,
      globalShopsMap[String(chain.shop_id)]?.name,
      chain.plan_name,
      globalEntryPlansMap[String(chain.plan_id)]?.name
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(term);
  });
}

function renderBillingOverview(overview = {}) {
  const container = document.getElementById('billingOverviewCards');
  if (!container) return;
  const cards = [
    ['入口總數', overview.entry_count || 0, `啟用中 ${formatTokenCount(overview.active_entry_count || 0)} 個`],
    ['商家數', overview.shop_count || 0, `啟用月計費 ${formatTokenCount(overview.monthly_enabled_entry_count || 0)} 個入口`],
    ['本月總 tokens', formatTokenCount(overview.total_tokens || 0), `Prompt ${formatTokenCount(overview.prompt_tokens || 0)} / Completion ${formatTokenCount(overview.completion_tokens || 0)}`],
    ['本月預估金額', formatCurrency(overview.estimated_amount || 0), `待開帳 ${formatTokenCount(overview.uninvoiced_entry_count || 0)} 個入口`],
    ['公益入口', formatTokenCount(overview.public_good_entry_count || 0), `平台公益代付 ${formatCurrency(overview.donated_amount || 0)}`],
    ['公益免收建置費', formatCurrency(overview.donated_setup_fee_amount || 0), '由 admin 建置的入口不代收建置費'],
    ['建置費待收', formatTokenCount(overview.setup_fee_pending_count || 0), `金額 ${formatCurrency(overview.setup_fee_pending_amount || 0)}`],
    ['建置費已收', formatTokenCount(overview.setup_fee_paid_count || 0), `金額 ${formatCurrency(overview.setup_fee_paid_amount || 0)}`],
    ['已開帳入口', formatTokenCount(overview.invoiced_entry_count || 0), '可作為月底結帳依據'],
    ['月計費入口', formatTokenCount(overview.monthly_enabled_entry_count || 0), '僅商業入口會計入 LM 月費']
  ];
  container.innerHTML = cards.map(([label, value, subtle]) => `
    <div class="stat-card">
      <div class="stat-card-label">${escHtml(label)}</div>
      <div class="stat-card-value">${escHtml(String(value))}</div>
      <div class="stat-card-subtle">${escHtml(subtle)}</div>
    </div>
  `).join('');
}

function renderBillingEntries(entries = []) {
  const container = document.getElementById('billingEntriesTable');
  if (!container) return;
  if (!entries.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📈</div>這個月份還沒有入口計費資料</div>';
    return;
  }
  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>入口</th>
          <th>商家 / 方案</th>
          <th>本月 Tokens</th>
          <th>本月應收 / 公益代付</th>
          <th>建置費</th>
          <th>狀態</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map((entry) => `
          <tr>
            <td class="wrap">
              <strong>${escHtml(entry.title || `入口 #${entry.id}`)}</strong><br>
              <span class="subtle-note">上限 ${escHtml(entry.task_limit ? `${entry.task_limit} 關` : '未限制')}</span>
              ${entry.billing_policy === 'public_good' ? '<br><span class="tag tag-green">公益入口</span>' : ''}
            </td>
            <td class="wrap">
              <div>${escHtml(entry.shop_name || '未指定商家')}</div>
              <div class="subtle-note">${escHtml(entry.plan_name || '歷史方案')}｜基本月費 ${formatCurrency(entry.monthly_base_fee || 0)}｜${escHtml(formatTokenPricingRule(entry.token_price_per_1k || 0))}</div>
            </td>
            <td>
              <strong>${formatTokenCount(entry.total_tokens || 0)}</strong><br>
              <span class="subtle-note">P ${formatTokenCount(entry.prompt_tokens || 0)} / C ${formatTokenCount(entry.completion_tokens || 0)}</span>
            </td>
            <td>
              <strong>${formatCurrency(entry.estimated_amount || 0)}</strong><br>
              <span class="subtle-note">${entry.billing_policy === 'public_good'
                ? `公益代付 ${formatCurrency(entry.donated_amount || 0)}`
                : (entry.monthly_billing_enabled ? '月計費啟用' : '未啟用月計費')}</span>
            </td>
            <td>
              <strong>${entry.billing_policy === 'public_good' ? '公益免收' : formatCurrency(entry.setup_fee || 0)}</strong><br>
              <span class="subtle-note">${entry.billing_policy === 'public_good'
                ? `參考 ${formatCurrency(entry.donated_setup_fee_amount || 0)}`
                : (entry.setup_fee_paid ? '已收款' : '待收款')}</span>
            </td>
            <td>
              <span class="tag ${entry.is_active ? 'tag-green' : 'tag-red'}">${entry.is_active ? '已開放' : '草稿 / 停用'}</span>
              <span class="tag ${entry.billing_policy === 'public_good' ? 'tag-green' : (entry.is_invoiced ? 'tag-blue' : 'tag-amber')}">${entry.billing_policy === 'public_good' ? '公益免計費' : (entry.is_invoiced ? '已開帳' : '待開帳')}</span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderBillingShopTotals(shops = []) {
  const container = document.getElementById('billingShopTotalsTable');
  if (!container) return;
  if (!shops.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏪</div>目前沒有商店總帳資料</div>';
    return;
  }
  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>商店</th>
          <th>入口數</th>
          <th>本月 Tokens</th>
          <th>本月應收 / 公益代付</th>
          <th>建置費 / 公益免收</th>
        </tr>
      </thead>
      <tbody>
        ${shops.map((shop) => `
          <tr>
            <td class="wrap"><strong>${escHtml(shop.name || `商店 #${shop.id}`)}</strong><br><span class="subtle-note">管理帳號：${escHtml(shop.owner_username || 'admin')}</span></td>
            <td>${formatTokenCount(shop.entry_count || 0)}<br><span class="subtle-note">啟用 ${formatTokenCount(shop.active_entry_count || 0)} 個｜公益 ${formatTokenCount(shop.public_good_entry_count || 0)} 個</span></td>
            <td><strong>${formatTokenCount(shop.total_tokens || 0)}</strong><br><span class="subtle-note">P ${formatTokenCount(shop.prompt_tokens || 0)} / C ${formatTokenCount(shop.completion_tokens || 0)}</span></td>
            <td><strong>${formatCurrency(shop.estimated_amount || 0)}</strong><br><span class="subtle-note">公益代付 ${formatCurrency(shop.donated_amount || 0)}</span></td>
            <td><strong>待收 ${formatCurrency(shop.setup_fee_pending_amount || 0)}</strong><br><span class="subtle-note">已收 ${formatCurrency(shop.setup_fee_paid_amount || 0)}｜免收 ${formatCurrency(shop.donated_setup_fee_amount || 0)}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderSetupFeeRecords(records = []) {
  const container = document.getElementById('billingSetupFeeTable');
  if (!container) return;
  if (!records.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧾</div>目前沒有建置費紀錄</div>';
    return;
  }
  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>建立時間</th>
          <th>入口</th>
          <th>商家 / 方案</th>
          <th>金額</th>
          <th>狀態</th>
          <th>備註</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((record) => `
          <tr>
            <td>${escHtml(formatDateTime(record.created_at))}</td>
            <td class="wrap">${escHtml(record.quest_chain_title || `入口 #${record.quest_chain_id || record.id}`)}</td>
            <td class="wrap">${escHtml(record.shop_name || '未指定商家')}<br><span class="subtle-note">${escHtml(record.plan_name || '未指定方案')}</span></td>
            <td><strong>${formatCurrency(record.amount || 0)}</strong></td>
            <td>
              <span class="tag ${record.status === 'paid' ? 'tag-green' : record.status === 'pending' ? 'tag-amber' : 'tag-gray'}">${escHtml(record.status || 'pending')}</span>
              <div class="subtle-note">${record.paid_at ? `付款於 ${escHtml(formatDateTime(record.paid_at))}` : '尚未標記收款'}</div>
            </td>
            <td class="wrap">${escHtml(record.note || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderBillingUsageLogs(logs = []) {
  const container = document.getElementById('billingUsageLogsTable');
  if (!container) return;
  if (!logs.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🤖</div>這個月份還沒有 LM 呼叫明細</div>';
    return;
  }
  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>時間</th>
          <th>商店</th>
          <th>玩家</th>
          <th>入口 / 關卡</th>
          <th>請求類型</th>
          <th>模型</th>
          <th>Tokens</th>
          <th>本次金額</th>
          <th>結果</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map((log) => `
          <tr>
            <td>${escHtml(formatDateTime(log.created_at))}</td>
            <td class="wrap">${escHtml(log.shop_name || '未指定商店')}</td>
            <td>${escHtml(log.player_username || '匿名 / 系統')}</td>
            <td class="wrap">
              <strong>${escHtml(log.quest_chain_title || '未指定入口')}</strong><br>
              <span class="subtle-note">${escHtml(log.task_name || '未指定關卡')}</span>
            </td>
            <td>${escHtml(log.request_type || 'unknown')}</td>
            <td class="wrap">${escHtml(log.model || '未記錄模型')}</td>
            <td>
              <strong>${formatTokenCount(log.total_tokens || 0)}</strong><br>
              <span class="subtle-note">P ${formatTokenCount(log.prompt_tokens || 0)} / C ${formatTokenCount(log.completion_tokens || 0)}</span>
            </td>
            <td>
              <strong>${formatCurrency(log.estimated_amount || 0)}</strong><br>
              <span class="subtle-note">${log.billing_policy === 'public_good'
                ? `公益代付 ${formatCurrency(log.donated_amount || 0)}`
                : escHtml(formatTokenPricingRule(log.token_price_per_1k || 0))}</span>
            </td>
            <td><span class="tag ${log.success ? 'tag-green' : 'tag-red'}">${log.success ? '成功' : '失敗'}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function buildBillingSeriesForScope(data = null, scope = 'platform') {
  if (!data) return [];
  const shops = Array.isArray(data.shops) ? data.shops : [];
  const totals = Array.isArray(data.totals) ? data.totals : [];
  if (scope === 'combined') {
    const topShops = shops.slice(0, 6);
    return [
      {
        key: 'platform',
        label: '全平台總量',
        color: '#0f766e',
        daily: totals
      },
      ...topShops.map((shop, index) => ({
        key: `shop:${shop.shop_id}`,
        label: shop.shop_name || `商店 #${shop.shop_id}`,
        color: pickBillingSeriesColor(index + 1),
        daily: Array.isArray(shop.daily) ? shop.daily : []
      }))
    ];
  }
  if (scope.startsWith('shop:')) {
    const targetShopId = String(scope.split(':')[1] || '');
    const shop = shops.find((row) => String(row.shop_id) === targetShopId);
    return shop ? [{
      key: scope,
      label: shop.shop_name || `商店 #${shop.shop_id}`,
      color: '#2563eb',
      daily: Array.isArray(shop.daily) ? shop.daily : []
    }] : [];
  }
  return [{
    key: 'platform',
    label: '全平台總量',
    color: '#0f766e',
    daily: totals
  }];
}

function populateBillingDailyScopeOptions(data = null) {
  const select = document.getElementById('billingDailyScopeSelect');
  if (!select) return;
  const shops = Array.isArray(data?.shops) ? data.shops : [];
  const isAdmin = loginUser?.role === 'admin';
  const options = [];
  if (isAdmin) {
    options.push({ value: 'platform', label: '全平台總量' });
    if (shops.length > 1) {
      options.push({ value: 'combined', label: '全平台 + 各商店一起看' });
    }
    shops.forEach((shop) => {
      options.push({
        value: `shop:${shop.shop_id}`,
        label: `只看 ${shop.shop_name || `商店 #${shop.shop_id}`}`
      });
    });
  } else if (shops.length) {
    const shop = shops[0];
    options.push({
      value: `shop:${shop.shop_id}`,
      label: `${shop.shop_name || '我的商店'} 每日趨勢`
    });
  } else {
    options.push({ value: 'platform', label: '全平台總量' });
  }

  const previousValue = currentBillingDailyScope;
  select.innerHTML = options.map((option) => `<option value="${escHtml(option.value)}">${escHtml(option.label)}</option>`).join('');
  const allowedValues = new Set(options.map((option) => option.value));
  currentBillingDailyScope = allowedValues.has(previousValue)
    ? previousValue
    : (options[0]?.value || 'platform');
  select.value = currentBillingDailyScope;
}

function renderBillingChartSummary(data = null, scope = 'platform') {
  const container = document.getElementById('billingDailyChartSummary');
  const hint = document.getElementById('billingDailyChartHint');
  if (!container || !hint) return;
  if (!data) {
    container.innerHTML = '';
    hint.textContent = '每日圖表資料尚未載入。';
    return;
  }

  const isAdmin = loginUser?.role === 'admin';
  let label = '全平台總量';
  let source = Array.isArray(data.totals) ? data.totals : [];
  if (scope.startsWith('shop:')) {
    const targetShopId = String(scope.split(':')[1] || '');
    const shop = (data.shops || []).find((row) => String(row.shop_id) === targetShopId);
    if (shop) {
      label = shop.shop_name || `商店 #${shop.shop_id}`;
      source = Array.isArray(shop.daily) ? shop.daily : [];
      hint.textContent = `目前圖表聚焦在 ${label} 的每日數據。`;
    } else {
      hint.textContent = '找不到指定商店的每日資料。';
    }
  } else if (scope === 'combined') {
    label = '全平台 + 各商店';
    source = Array.isArray(data.totals) ? data.totals : [];
    hint.textContent = '目前同時顯示全平台與各商店每日曲線，適合比較每天哪一間商店正在消耗 token。';
  } else {
    hint.textContent = isAdmin
      ? '目前顯示全平台每日總量；可切換成各商店一起看，或只看單一商店。'
      : '目前顯示你自己的商店每日趨勢。';
  }

  const requestCount = sumBy(source, 'request_count');
  const totalTokens = sumBy(source, 'total_tokens');
  const estimatedAmount = sumBy(source, 'estimated_amount');
  const donatedAmount = sumBy(source, 'donated_amount');
  const peakDay = source.reduce((best, day) => {
    if (!best || Number(day.total_tokens || 0) > Number(best.total_tokens || 0)) return day;
    return best;
  }, null);

  container.innerHTML = [
    ['目前範圍', label],
    ['本月請求數', `${formatTokenCount(requestCount)} 次`],
    ['本月 Tokens', formatTokenCount(totalTokens)],
    ['本月金額', formatCurrency(estimatedAmount)],
    ['公益代付', formatCurrency(donatedAmount)],
    ['最高峰日', peakDay && peakDay.total_tokens ? `${formatDayLabel(peakDay.date)}｜${formatTokenCount(peakDay.total_tokens)} tokens` : '本月尚無資料']
  ].map(([summaryLabel, value]) => `
    <div class="billing-chart-summary-item">
      <div class="billing-chart-summary-label">${escHtml(summaryLabel)}</div>
      <div class="billing-chart-summary-value">${escHtml(String(value))}</div>
    </div>
  `).join('');
}

function renderBillingTrendChart(containerId, metricKey, formatter, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const data = currentBillingDailyData;
  const series = buildBillingSeriesForScope(data, currentBillingDailyScope)
    .map((item) => ({
      ...item,
      values: (item.daily || []).map((day) => Number(day?.[metricKey] || 0))
    }))
    .filter((item) => item.values.some((value) => value > 0));

  if (!series.length) {
    container.className = 'billing-chart-empty';
    container.innerHTML = escHtml(emptyText);
    return;
  }

  const labels = data?.days || [];
  const width = 760;
  const height = 260;
  const left = 44;
  const right = 18;
  const top = 14;
  const bottom = 32;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const allValues = series.flatMap((item) => item.values);
  const maxValue = Math.max(...allValues, 1);
  const yMax = maxValue <= 5 ? 5 : Math.ceil(maxValue * 1.15);
  const tickCount = 4;
  const xStep = labels.length > 1 ? plotWidth / (labels.length - 1) : plotWidth;
  const xTicks = labels
    .map((label, index) => ({ label, index }))
    .filter((item, index, list) => {
      if (index === 0 || index === list.length - 1) return true;
      const step = Math.max(Math.floor(list.length / 4), 1);
      return index % step === 0;
    });

  const gridLines = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = (yMax / tickCount) * index;
    const y = top + plotHeight - (value / yMax) * plotHeight;
    return { value, y };
  });

  const lineMarkup = series.map((item) => {
    const points = item.values.map((value, index) => {
      const x = left + (labels.length === 1 ? plotWidth / 2 : xStep * index);
      const y = top + plotHeight - (value / yMax) * plotHeight;
      return { x, y, value, index };
    });
    const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
    return `
      <polyline fill="none" stroke="${item.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
      ${points.map((point) => `
        <circle cx="${point.x}" cy="${point.y}" r="3.5" fill="${item.color}">
          <title>${escHtml(item.label)}｜${escHtml(formatDayLabel(labels[point.index || 0]))}｜${escHtml(formatter(point.value))}</title>
        </circle>
      `).join('')}
    `;
  }).join('');

  container.className = '';
  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="billing-chart-svg" role="img" aria-label="billing chart">
      ${gridLines.map((line) => `
        <line x1="${left}" y1="${line.y}" x2="${width - right}" y2="${line.y}" stroke="#e2e8f0" stroke-dasharray="4 4" />
        <text x="${left - 8}" y="${line.y + 4}" font-size="11" text-anchor="end" fill="#64748b">${escHtml(formatter(line.value))}</text>
      `).join('')}
      ${xTicks.map((tick) => {
        const x = left + (labels.length === 1 ? plotWidth / 2 : xStep * tick.index);
        return `
          <line x1="${x}" y1="${top + plotHeight}" x2="${x}" y2="${top + plotHeight + 4}" stroke="#94a3b8" />
          <text x="${x}" y="${height - 8}" font-size="11" text-anchor="middle" fill="#64748b">${escHtml(formatDayLabel(tick.label))}</text>
        `;
      }).join('')}
      <line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" stroke="#94a3b8" />
      ${lineMarkup}
    </svg>
    <div class="billing-chart-legend">
      ${series.map((item) => `
        <div class="billing-chart-legend-item">
          <span class="billing-chart-legend-swatch" style="background:${item.color};"></span>
          <span>${escHtml(item.label)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderBillingDailyCharts(data = null) {
  currentBillingDailyData = data;
  populateBillingDailyScopeOptions(data);
  renderBillingChartSummary(data, currentBillingDailyScope);
  renderBillingTrendChart('billingDailyTokensChart', 'total_tokens', formatTokenCount, '這個月份還沒有每日 token 資料。');
  renderBillingTrendChart('billingDailyAmountChart', 'estimated_amount', formatCurrency, '這個月份還沒有每日金額資料。');
}

function setBillingLoadingState() {
  const cards = document.getElementById('billingOverviewCards');
  const shops = document.getElementById('billingShopTotalsTable');
  const entries = document.getElementById('billingEntriesTable');
  const setup = document.getElementById('billingSetupFeeTable');
  const logs = document.getElementById('billingUsageLogsTable');
  const dailyTokens = document.getElementById('billingDailyTokensChart');
  const dailyAmount = document.getElementById('billingDailyAmountChart');
  const dailySummary = document.getElementById('billingDailyChartSummary');
  const dailyHint = document.getElementById('billingDailyChartHint');
  if (cards) cards.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">💳</div>載入中...</div>';
  if (shops) shops.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏪</div>載入中...</div>';
  if (entries) entries.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📈</div>載入中...</div>';
  if (setup) setup.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧾</div>載入中...</div>';
  if (logs) logs.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🤖</div>載入中...</div>';
  if (dailyTokens) {
    dailyTokens.className = 'billing-chart-empty';
    dailyTokens.textContent = '載入每日 token 趨勢中...';
  }
  if (dailyAmount) {
    dailyAmount.className = 'billing-chart-empty';
    dailyAmount.textContent = '載入每日金額趨勢中...';
  }
  if (dailySummary) dailySummary.innerHTML = '';
  if (dailyHint) dailyHint.textContent = '載入每日圖表資料中...';
}

function loadBillingDashboard() {
  const billingMonth = getSelectedBillingMonth();
  const params = new URLSearchParams({ billing_month: billingMonth });
  const scopeHint = document.getElementById('billingScopeHint');
  if (scopeHint) {
    scopeHint.textContent = loginUser?.role === 'admin'
      ? '目前為平台管理視角，可查看全部商家的用量、收費狀態與公益代付數據。'
      : `目前為 ${loginUser?.shop_name || '你的商家'} 視角，只顯示自己商家的入口資料與使用量。`;
  }
  setBillingLoadingState();
  return Promise.all([
    apiJson(`${API_BASE}/api/billing/overview?${params.toString()}`, { headers: withActorHeaders() }),
    apiJson(`${API_BASE}/api/billing/shops?${params.toString()}`, { headers: withActorHeaders() }),
    apiJson(`${API_BASE}/api/billing/entries?${params.toString()}`, { headers: withActorHeaders() }),
    apiJson(`${API_BASE}/api/entry-billing-records?limit=20`, { headers: withActorHeaders() }),
    apiJson(`${API_BASE}/api/billing/logs?${params.toString()}&limit=100`, { headers: withActorHeaders() }),
    apiJson(`${API_BASE}/api/billing/daily?${params.toString()}`, { headers: withActorHeaders() })
  ])
    .then(([overviewData, shopsData, entriesData, setupData, logsData, dailyData]) => {
      if (!overviewData.success || !shopsData.success || !entriesData.success || !setupData.success || !logsData.success || !dailyData.success) {
        throw new Error('載入計費資料失敗');
      }
      renderBillingOverview(overviewData.overview || {});
      renderBillingShopTotals(shopsData.shops || []);
      renderBillingEntries(entriesData.entries || []);
      renderSetupFeeRecords(setupData.records || []);
      renderBillingUsageLogs(logsData.logs || []);
      renderBillingDailyCharts(dailyData);
    })
    .catch((error) => {
      const message = error.message || '載入計費資料失敗';
      const cards = document.getElementById('billingOverviewCards');
      if (cards) cards.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">⚠️</div>${escHtml(message)}</div>`;
      showToast(message, 'error');
    });
}

/** Paste from Google Maps etc.: "lat, lng" or two decimals */
function parseLatLngPaste(text) {
  const t = (text || '').trim();
  const m = t.match(/(-?\d+\.?\d*)\s*[,，]\s*(-?\d+\.?\d*)/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let lat;
  let lng;
  if (a >= -90 && a <= 90 && b >= -180 && b <= 180) {
    lat = a;
    lng = b;
  } else if (b >= -90 && b <= 90 && a >= -180 && a <= 180) {
    lat = b;
    lng = a;
  } else {
    lat = a;
    lng = b;
  }
  return { lat, lng };
}

function wireLatLngPaste(inputEl, latEl, lngEl) {
  if (!inputEl || !latEl || !lngEl) return;
  const apply = () => {
    const parsed = parseLatLngPaste(inputEl.value);
    if (!parsed) return;
    latEl.value = parsed.lat;
    lngEl.value = parsed.lng;
    inputEl.value = '';
    showToast('已填入緯度、經度');
  };
  inputEl.addEventListener('paste', e => {
    const txt = e.clipboardData?.getData('text') || '';
    const parsed = parseLatLngPaste(txt);
    if (parsed) {
      e.preventDefault();
      latEl.value = parsed.lat;
      lngEl.value = parsed.lng;
      showToast('已填入緯度、經度');
    }
  });
  inputEl.addEventListener('blur', () => {
    if (inputEl.value.trim()) apply();
  });
}

// ── View Switching（支援網址 #hash 深連結）──────────────────────
const STAFF_DASH_HASH_BY_VIEW = {
  'view-quest-chains': 'quests',
  'view-billing': 'billing',
  'view-shops': 'shops',
  'view-plans': 'plans',
  'view-assets': 'assets',
  'view-products': 'products',
  'view-reward-shop': 'reward-shop',
  'view-redemptions': 'redemptions',
  'view-coupon-issue': 'coupon-issue',
  'view-pos': 'pos',
  'view-users': 'users',
  'view-roles': 'roles'
};

function setStaffViewHash(viewId) {
  const h = STAFF_DASH_HASH_BY_VIEW[viewId];
  if (!h || typeof history === 'undefined' || !history.replaceState) return;
  const next = `${location.pathname}${location.search}#${h}`;
  if (location.hash !== `#${h}`) history.replaceState(null, '', next);
}

/** 在側欄可見性套用後呼叫：優先還原網址 #hash，否則選第一個可見分頁 */
function selectInitialStaffView() {
  const raw = (location.hash || '').replace(/^#\/?/, '').toLowerCase();
  const normalizedHash = raw === 'review' ? 'quests' : raw;
  const fromHash = normalizedHash
    ? Object.keys(STAFF_DASH_HASH_BY_VIEW).find(k => STAFF_DASH_HASH_BY_VIEW[k] === normalizedHash)
    : null;

  if (fromHash) {
    const nav = document.querySelector(`.v2-nav-item[data-view="${fromHash}"]`);
    if (nav && nav.style.display !== 'none') {
      document.querySelectorAll('.v2-nav-item').forEach(n => n.classList.remove('active'));
      nav.classList.add('active');
      switchView(fromHash, { skipHash: true });
      return;
    }
  }

  let pick = null;
  document.querySelectorAll('.v2-nav-item[data-roles]').forEach(n => {
    if (!pick && n.style.display !== 'none') pick = n;
  });
  if (pick) {
    document.querySelectorAll('.v2-nav-item').forEach(n => n.classList.remove('active'));
    pick.classList.add('active');
    switchView(pick.dataset.view);
  }
}

function switchView(viewId, opts = {}) {
  if (viewId === 'view-review') {
    viewId = 'view-quest-chains';
  }
  document.querySelectorAll('.v2-view').forEach(el => el.classList.remove('active'));
  document.getElementById(viewId)?.classList.add('active');

  const navMap = {
    'view-quest-chains': 'view-quest-chains',
    'view-quest-detail': 'view-quest-chains',
    'view-billing': 'view-billing',
    'view-shops': 'view-shops',
    'view-plans': 'view-plans',
    'view-assets': 'view-assets',
    'view-products': 'view-products',
    'view-reward-shop': 'view-reward-shop',
    'view-redemptions': 'view-redemptions',
    'view-coupon-issue': 'view-coupon-issue',
    'view-pos': 'view-pos',
    'view-users': 'view-users',
    'view-roles': 'view-roles'
  };
  const targetNav = navMap[viewId] || viewId;
  document.querySelectorAll('.v2-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === targetNav);
  });

  if (!opts.skipHash) setStaffViewHash(viewId);

  // Lazy-load data for new views
  if (viewId === 'view-billing') loadBillingDashboard();
  if (viewId === 'view-shops') loadShopManagement();
  if (viewId === 'view-plans') loadPlanManagement();
  if (viewId === 'view-reward-shop') ensureRewardShopIframe();
  if (viewId === 'view-products') loadProducts();
  if (viewId === 'view-redemptions') loadRedemptions();
  if (viewId === 'view-coupon-issue') loadIssuedCoupons();
  if (viewId === 'view-pos') loadPosHistory();
  if (viewId === 'view-users') loadUsers(1);
}

function ensureRewardShopIframe() {
  const iframe = document.getElementById('rewardShopIframe');
  if (!iframe) return;
  if (!iframe.getAttribute('src') || iframe.getAttribute('src') === 'about:blank') {
    iframe.src = '/products.html?embed=1';
  }
}

// Sidebar click handlers
document.querySelectorAll('.v2-nav-item').forEach(item => {
  item.addEventListener('click', () => switchView(item.dataset.view));
});

// ── Drawer Logic ──────────────────────────────────────────────
const drawer = document.getElementById('rightDrawer');
const overlay = document.getElementById('drawerOverlay');
const drawerTitle = document.getElementById('drawerTitle');

overlay.addEventListener('click', closeDrawer);

function getTaskWizardStepElement(step) {
  return document.querySelector(`.task-wizard-step[data-task-step="${step}"]`);
}

function resolveActiveForm() {
  const activeSection = drawer?.dataset.activeSection
    ? document.getElementById(drawer.dataset.activeSection)
    : document.querySelector('.drawer-form-section.active');
  if (!activeSection) return null;
  const fallbackFormId = activeSection.dataset.formId || DRAWER_FORM_ID_MAP[activeSection.id] || '';
  const form = fallbackFormId ? document.getElementById(fallbackFormId) : activeSection.querySelector('form');
  if (form?.id) activeFormId = form.id;
  return form || null;
}

function scrollToFirstInvalid(scope) {
  if (!scope) return;
  const firstInvalid = scope.querySelector(':invalid');
  if (firstInvalid && typeof firstInvalid.scrollIntoView === 'function') {
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof firstInvalid.focus === 'function') firstInvalid.focus();
  }
}

function syncDrawerFooter() {
  const note = document.getElementById('drawerFooterNote');
  const backBtn = document.getElementById('drawerBackBtn');
  const nextBtn = document.getElementById('drawerNextBtn');
  const submitBtn = document.getElementById('drawerSubmitBtn');
  const form = activeFormId ? document.getElementById(activeFormId) : resolveActiveForm();
  const isTaskWizard = activeFormId === 'taskForm';
  const hasActiveForm = !!form;

  backBtn?.classList.toggle('hidden', !isTaskWizard || taskWizardStep === 1);
  nextBtn?.classList.toggle('hidden', !isTaskWizard || taskWizardStep === TASK_WIZARD_TOTAL_STEPS);
  submitBtn?.classList.toggle('hidden', isTaskWizard && taskWizardStep !== TASK_WIZARD_TOTAL_STEPS);

  if (submitBtn) {
    submitBtn.disabled = !hasActiveForm;
    submitBtn.style.opacity = hasActiveForm ? '1' : '0.55';
    submitBtn.style.cursor = hasActiveForm ? 'pointer' : 'not-allowed';
  }

  if (!note) return;
  if (isTaskWizard) {
    note.textContent = `新增關卡流程：第 ${taskWizardStep} / ${TASK_WIZARD_TOTAL_STEPS} 步`;
  } else if (activeFormId === 'tileForm') {
    note.textContent = '大富翁格子會直接歸屬在目前這張棋盤底下。';
  } else if (activeFormId === 'questChainForm') {
    note.textContent = '玩法入口建立後，底下的關卡與棋盤都會獨立歸屬在這個入口。';
  } else {
    note.textContent = '';
  }
}

function syncTaskWizardUI() {
  document.querySelectorAll('.task-wizard-step[data-task-step]').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.taskStep) === taskWizardStep);
  });
  document.querySelectorAll('[data-step-chip]').forEach(chip => {
    const step = Number(chip.dataset.stepChip);
    chip.classList.toggle('active', step === taskWizardStep);
    chip.classList.toggle('done', step < taskWizardStep);
  });
  syncDrawerFooter();
}

function validateTaskWizardStep(step) {
  const stepEl = getTaskWizardStepElement(step);
  if (!stepEl) return true;
  if (step === 2) {
    const form = document.getElementById('taskForm');
    const typeSel = document.getElementById('taskTypeSelect');
    const gpsToggle = document.getElementById('taskLocationRequiredToggle');
    const gpsRequired = Boolean((typeSel && typeSel.value === 'location') || (gpsToggle && gpsToggle.checked));
    const lat = form?.elements?.lat?.value?.trim() || '';
    const lng = form?.elements?.lng?.value?.trim() || '';
    const radius = form?.elements?.radius?.value?.trim() || '';
    const hasAnyLocationValue = Boolean(lat || lng || radius);
    const hasAllLocationValues = Boolean(lat && lng && radius);

    if (gpsRequired && !hasAllLocationValues) {
      const target = !lat ? form.elements.lat : (!lng ? form.elements.lng : form.elements.radius);
      if (target) {
        target.setCustomValidity('啟用 GPS 位置限制時，請完整填寫緯度、經度與觸發半徑。');
        target.reportValidity();
        target.setCustomValidity('');
      }
      scrollToFirstInvalid(stepEl);
      return false;
    }

    if (!gpsRequired && hasAnyLocationValue && !hasAllLocationValues) {
      const target = !lat ? form.elements.lat : (!lng ? form.elements.lng : form.elements.radius);
      if (target) {
        target.setCustomValidity('若要保留座標資料，請完整填寫緯度、經度與觸發半徑；否則請全部留空。');
        target.reportValidity();
        target.setCustomValidity('');
      }
      scrollToFirstInvalid(stepEl);
      return false;
    }
  }
  const inputs = Array.from(stepEl.querySelectorAll('input, select, textarea')).filter((el) => {
    if (el.disabled) return false;
    if (el.closest('[style*="display:none"]')) return false;
    return true;
  });
  for (const input of inputs) {
    if (typeof input.reportValidity === 'function' && !input.reportValidity()) {
      scrollToFirstInvalid(stepEl);
      return false;
    }
  }
  return true;
}

function goTaskWizardStep(direction) {
  if (activeFormId !== 'taskForm') return;
  if (direction > 0 && !validateTaskWizardStep(taskWizardStep)) return;
  taskWizardStep = Math.min(TASK_WIZARD_TOTAL_STEPS, Math.max(1, taskWizardStep + direction));
  syncTaskWizardUI();
}

function resetTaskWizard() {
  taskWizardStep = 1;
  syncTaskWizardUI();
}

function initializeTaskWizardDOM() {
  const form = document.getElementById('taskForm');
  if (!form || form.dataset.wizardReady === '1') return;
  const shell = form.querySelector('.wizard-shell');
  const taskLockedContext = document.getElementById('taskLockedContext');
  const blueprintInfo = form.querySelector('.blueprint-info');
  const gamePositionTitle = Array.from(form.querySelectorAll('.section-title')).find((el) => el.textContent.includes('遊戲定位'));
  const fieldAreaTitle = Array.from(form.querySelectorAll('.section-title')).find((el) => el.textContent.includes('場域與目標'));
  const interactionTitle = Array.from(form.querySelectorAll('.section-title')).find((el) => el.textContent.includes('互動方式'));
  const playerContentTitle = Array.from(form.querySelectorAll('.section-title')).find((el) => el.textContent.includes('玩家感受到的內容'));
  const taskFormMsg = document.getElementById('taskFormMsg');
  if (!shell || !taskLockedContext || !blueprintInfo || !gamePositionTitle || !fieldAreaTitle || !interactionTitle || !playerContentTitle || !taskFormMsg) return;

  const children = Array.from(form.children);
  const beforeStep1 = children.indexOf(taskLockedContext);
  const start2 = children.indexOf(fieldAreaTitle);
  const start3 = children.indexOf(interactionTitle);
  const start4 = children.indexOf(playerContentTitle);
  const end4 = children.indexOf(taskFormMsg);
  if ([beforeStep1, start2, start3, start4, end4].some((idx) => idx < 0)) return;

  const makeStep = (stepNo) => {
    const wrapper = document.createElement('div');
    wrapper.className = `task-wizard-step${stepNo === 1 ? ' active' : ''}`;
    wrapper.dataset.taskStep = String(stepNo);
    return wrapper;
  };
  const steps = [makeStep(1), makeStep(2), makeStep(3), makeStep(4)];
  shell.insertAdjacentElement('afterend', steps[0]);
  steps[0].after(steps[1]);
  steps[1].after(steps[2]);
  steps[2].after(steps[3]);

  children.slice(beforeStep1, start2).forEach((node) => steps[0].appendChild(node));
  children.slice(start2, start3).forEach((node) => steps[1].appendChild(node));
  children.slice(start3, start4).forEach((node) => steps[2].appendChild(node));
  children.slice(start4, end4 + 1).forEach((node) => steps[3].appendChild(node));
  form.dataset.wizardReady = '1';
}

function openDrawer(title, formSectionId, data, opts = {}) {
  drawerTitle.textContent = title;

  document.querySelectorAll('.drawer-form-section').forEach(el => el.classList.remove('active'));
  const section = document.getElementById(formSectionId);
  section.classList.add('active');
  drawer.dataset.activeSection = formSectionId;

  const form = section.querySelector('form');
  activeFormId = section.dataset.formId || (form ? form.id : null);
  taskWizardStep = 1;

  if (data && form) {
    fillForm(form, data);
  } else if (form && !opts.skipReset) {
    form.reset();
    // Clear hidden id fields
    const idField = form.querySelector('input[name="id"]');
    if (idField) idField.value = '';
    // Clear photo preview
    const preview = form.querySelector('img[id$="Preview"]');
    if (preview) preview.style.display = 'none';
  }

  if (activeFormId === 'questChainForm') {
    const shopSelect = form?.elements?.shop_id;
    if (shopSelect && loginUser?.role !== 'admin' && loginUser?.shop_id) {
      shopSelect.value = String(loginUser.shop_id);
    }
    syncQuestChainCommercialFields();
    const editingChain = form?.elements?.id?.value ? globalQuestChainsMap[String(form.elements.id.value)] || null : null;
    applyQuestChainFormLockUi(editingChain);
    setInlineMessage('questChainFormMsg', '');
  } else if (activeFormId === 'shopForm') {
    setInlineMessage('shopFormMsg', '');
  } else if (activeFormId === 'planForm') {
    setInlineMessage('planFormMsg', '');
  }

  drawer.classList.add('open');
  overlay.classList.add('open');
  syncDrawerFooter();
}

function closeDrawer() {
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  activeFormId = null;
  delete drawer.dataset.activeSection;
  taskWizardStep = 1;
  syncDrawerFooter();
}

function submitActiveForm() {
  let form = activeFormId ? document.getElementById(activeFormId) : null;
  if (!form) form = resolveActiveForm();
  if (!form) {
    showToast('目前沒有可儲存的表單', 'error');
    syncDrawerFooter();
    return;
  }
  if (activeFormId === 'taskForm' && taskWizardStep < TASK_WIZARD_TOTAL_STEPS) {
    goTaskWizardStep(1);
    return;
  }
  if (typeof form.reportValidity === 'function' && form.reportValidity()) {
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  } else {
    scrollToFirstInvalid(activeFormId === 'taskForm' ? getTaskWizardStepElement(taskWizardStep) : form);
  }
}

// ── Fill form helper ──────────────────────────────────────────
function fillForm(form, data) {
  Object.keys(data).forEach(key => {
    const el = form.elements[key];
    if (!el) return;
    if (el.type === 'checkbox') {
      el.checked = !!data[key];
    } else {
      el.value = data[key] ?? '';
    }
  });
}

const IMAGE_AI_VALIDATION_MODES = ['ai_count', 'ai_identify', 'ai_score', 'ai_rule_check', 'ai_reference_match'];

// ── Blueprint System ──────────────────────────────────────────
const blueprintConfigs = {
  // 劇情主線
  story_ai_identify: {
    modeText: '劇情主線', judgeText: 'AI 指定物辨識',
    summary: '適合植物、物件觀察關。預設主線 + AI 辨識。',
    defaults: { category: 'quest', taskType: 'photo', validationMode: 'ai_identify' }
  },
  story_reference_match: {
    modeText: '劇情主線', judgeText: 'AI 地點照片比對',
    summary: '適合景點定位、尋寶關。封面圖當參考照。',
    defaults: { category: 'quest', taskType: 'photo', validationMode: 'ai_reference_match' }
  },
  story_ai_score: {
    modeText: '劇情主線', judgeText: 'AI 圖像評分',
    summary: '適合團體照、構圖拍攝。建議填評分主題與分數。',
    defaults: { category: 'quest', taskType: 'photo', validationMode: 'ai_score' }
  },
  story_keyword: {
    modeText: '劇情主線', judgeText: '關鍵字自動驗證',
    summary: '適合知識問答、密語解謎。玩家輸入正確關鍵字即通關。',
    defaults: { category: 'quest', taskType: 'keyword', validationMode: 'keyword' }
  },
  story_choice: {
    modeText: '劇情主線', judgeText: '選擇題自動判定',
    summary: '適合情境選擇、知識測驗。四選一自動判定。',
    defaults: { category: 'quest', taskType: 'multiple_choice', validationMode: 'auto' }
  },
  // 大富翁
  board_ai_count: {
    modeText: '大富翁模式', judgeText: 'AI 數量判斷',
    summary: '挑戰格用，自動偏向單點 + AI 計數。',
    defaults: { category: 'single', taskType: 'photo', validationMode: 'ai_count' }
  },
  board_ai_identify: {
    modeText: '大富翁模式', judgeText: 'AI 指定物辨識',
    summary: '挑戰格用，拍攝指定物件即通過。',
    defaults: { category: 'single', taskType: 'photo', validationMode: 'ai_identify' }
  },
  board_event: {
    modeText: '大富翁模式', judgeText: 'AI 劇情判定',
    summary: '事件格或補給格，交給 AI 依題目與情境自動回應。',
    defaults: { category: 'single', taskType: 'qa', validationMode: 'ai_text_check' }
  },
  // 教育課程
  edu_observe: {
    modeText: '教育課程', judgeText: 'AI 生物辨識',
    summary: '自然觀察課程：學生拍攝指定生物或植物，AI 自動辨識驗證。適合生態踏查。',
    defaults: { category: 'quest', taskType: 'photo', validationMode: 'ai_identify' }
  },
  edu_quiz: {
    modeText: '教育課程', judgeText: '自動判定',
    summary: '隨堂測驗：可設定選擇題或填答題，系統自動批改。適合導覽後的知識複習。',
    defaults: { category: 'quest', taskType: 'multiple_choice', validationMode: 'auto' }
  },
  edu_fieldwork: {
    modeText: '教育課程', judgeText: '地點打卡驗證',
    summary: '實地考察：學生到達指定地點自動打卡完成。適合戶外教學路線。',
    defaults: { category: 'quest', taskType: 'location', validationMode: 'auto' }
  },
  edu_creative: {
    modeText: '教育課程', judgeText: 'AI 作品評分',
    summary: '創意任務：學生拍攝作品由 AI 評分。適合美術、攝影、環境設計課程。',
    defaults: { category: 'quest', taskType: 'photo', validationMode: 'ai_score' }
  }
};

function applyBlueprint(key, preserveValues) {
  const c = blueprintConfigs[key] || blueprintConfigs.story_ai_identify;
  document.getElementById('bpModeText').textContent = c.modeText;
  document.getElementById('bpJudgeText').textContent = c.judgeText;
  document.getElementById('bpSummaryText').textContent = c.summary;

  if (!preserveValues) {
    const catSel = document.getElementById('taskCategorySelect');
    const typeSel = document.getElementById('taskTypeSelect');
    const valSel = document.getElementById('validationModeSelect');
    if (catSel) { catSel.value = c.defaults.category; catSel.dispatchEvent(new Event('change')); }
    if (typeSel) { typeSel.value = c.defaults.taskType; typeSel.dispatchEvent(new Event('change')); }
    if (valSel) { valSel.value = c.defaults.validationMode; valSel.dispatchEvent(new Event('change')); }
  }
}

function inferBlueprintFromTask(task) {
  if (task?.validation_mode === 'ai_reference_match') return 'story_reference_match';
  if (task?.validation_mode === 'ai_score') return 'story_ai_score';
  if (task?.validation_mode === 'ai_count' && task?.type !== 'quest') return 'board_ai_count';
  if (task?.validation_mode === 'ai_text_check' && task?.type !== 'quest') return 'board_event';
  return 'story_ai_identify';
}

document.getElementById('taskBlueprintSelect').addEventListener('change', function () {
  applyBlueprint(this.value, false);
});

// ── Category / TaskType / Validation toggles ──────────────────
function setupCategoryToggle() {
  const sel = document.getElementById('taskCategorySelect');
  const questDiv = document.getElementById('questFields');
  const timedDiv = document.getElementById('timedFields');
  if (!sel) return;
  const update = () => {
    questDiv.style.display = sel.value === 'quest' ? 'block' : 'none';
    timedDiv.style.display = sel.value === 'timed' ? 'block' : 'none';
  };
  sel.addEventListener('change', update);
  update();
}

function setupTaskTypeToggle() {
  const sel = document.getElementById('taskTypeSelect');
  const mcDiv = document.getElementById('multipleChoiceOptions');
  const saDiv = document.getElementById('standardAnswerBlock');
  const validationSel = document.getElementById('validationModeSelect');
  if (!sel) return;
  sel.addEventListener('change', () => {
    mcDiv.style.display = sel.value === 'multiple_choice' ? 'block' : 'none';
    saDiv.style.display = (sel.value === 'number' || sel.value === 'keyword') ? 'block' : 'none';
    if (validationSel) {
      if (sel.value === 'qa' && validationSel.value === 'auto') validationSel.value = 'ai_text_check';
      else if (sel.value === 'photo' && validationSel.value === 'auto') validationSel.value = 'ai_rule_check';
      else if (sel.value === 'keyword' && validationSel.value === 'auto') validationSel.value = 'keyword';
      else if (['multiple_choice', 'number', 'location'].includes(sel.value) && ['ai_text_check', 'ai_rule_check'].includes(validationSel.value)) validationSel.value = 'auto';
      validationSel.dispatchEvent(new Event('change'));
    }
  });
}

function syncTaskLocationRequirementUi() {
  const form = document.getElementById('taskForm');
  const typeSel = document.getElementById('taskTypeSelect');
  const gpsToggle = document.getElementById('taskLocationRequiredToggle');
  const hint = document.getElementById('taskLocationRequiredHint');
  const latInput = document.getElementById('taskLatInput');
  const lngInput = document.getElementById('taskLngInput');
  const radiusInput = form?.elements?.radius;
  if (!form || !typeSel || !gpsToggle || !latInput || !lngInput || !radiusInput) return;

  const forcedByTaskType = typeSel.value === 'location';
  if (forcedByTaskType) gpsToggle.checked = true;
  gpsToggle.disabled = forcedByTaskType;

  const gpsRequired = forcedByTaskType || gpsToggle.checked;
  [latInput, lngInput, radiusInput].forEach((input) => {
    input.required = gpsRequired;
    input.setCustomValidity('');
  });

  if (hint) {
    hint.textContent = gpsRequired
      ? '已啟用 GPS 位置限制：玩家必須到這組座標半徑內，才有辦法接取任務。'
      : '未啟用 GPS 位置限制：任何地方都可以開啟任務；下方座標可作為參考資料保留。';
  }
}

function setupLocationRequirementToggle() {
  const typeSel = document.getElementById('taskTypeSelect');
  const gpsToggle = document.getElementById('taskLocationRequiredToggle');
  if (!typeSel || !gpsToggle) return;
  typeSel.addEventListener('change', syncTaskLocationRequirementUi);
  gpsToggle.addEventListener('change', syncTaskLocationRequirementUi);
  syncTaskLocationRequirementUi();
}

const validationModeMeta = {
  ai_text_check: { helper: 'AI 會閱讀玩家的文字回答，自動判定是否符合題意。', label: '回答主題', placeholder: '請描述你觀察到的內容', showCount: false, showScore: false },
  ai_count: { helper: 'AI 判斷指定物件是否達到目標數量。', label: '目標物件標籤', placeholder: 'plastic_bottle', showCount: true, showScore: false },
  ai_identify: { helper: 'AI 辨識照片是否為指定物件或植物。', label: '指定辨識標籤', placeholder: 'morning_glory', showCount: false, showScore: false },
  ai_score: { helper: 'AI 依主題為照片評分，達門檻即通關。', label: '評分主題', placeholder: 'group_photo', showCount: false, showScore: true },
  ai_rule_check: { helper: 'AI 檢查照片是否符合指定規則。', label: '規則主題', placeholder: 'beach_cleanup', showCount: false, showScore: false },
  ai_reference_match: { helper: '比對玩家照片與任務封面圖是否為同一地點。', label: '比對主題', placeholder: 'treasure_spot', showCount: false, showScore: false }
};

function setupValidationModeToggle() {
  const sel = document.getElementById('validationModeSelect');
  const fields = document.getElementById('aiConfigFields');
  const helper = document.getElementById('aiModeHelper');
  const labelEl = document.getElementById('aiTargetLabelLabel');
  const labelInput = document.getElementById('aiTargetLabelInput');
  const countGrp = document.getElementById('aiTargetCountGroup');
  const scoreGrp = document.getElementById('aiMinScoreGroup');
  if (!sel || !fields) return;

  const update = () => {
    const isAi = sel.value.startsWith('ai_');
    fields.style.display = isAi ? 'block' : 'none';
    if (!isAi) return;
    const m = validationModeMeta[sel.value] || validationModeMeta.ai_identify;
    if (helper) helper.textContent = m.helper;
    if (labelEl) labelEl.textContent = m.label;
    if (labelInput) labelInput.placeholder = m.placeholder;
    if (countGrp) countGrp.style.display = m.showCount ? 'block' : 'none';
    if (scoreGrp) scoreGrp.style.display = m.showScore ? 'block' : 'none';
  };
  sel.addEventListener('change', update);
  update();
}

setupCategoryToggle();
setupTaskTypeToggle();
setupValidationModeToggle();
setupLocationRequirementToggle();

// Apply initial blueprint
applyBlueprint('story_ai_identify', false);

// ── AI Payload Builder ────────────────────────────────────────
function buildAiTaskPayload(form) {
  const requestedTaskType = form.task_type?.value || 'qa';
  let validation_mode = form.validation_mode?.value || 'auto';
  if (validation_mode === 'auto' && requestedTaskType === 'qa') validation_mode = 'ai_text_check';
  if (validation_mode === 'auto' && requestedTaskType === 'photo') validation_mode = 'ai_rule_check';
  const isAi = validation_mode.startsWith('ai_');
  const isImageAi = IMAGE_AI_VALIDATION_MODES.includes(validation_mode);
  const targetLabel = form.ai_target_label?.value.trim() || null;
  const targetCount = form.ai_target_count?.value ? Number(form.ai_target_count.value) : null;
  const minScore = form.ai_min_score?.value ? Number(form.ai_min_score.value) : null;
  const minConfidence = form.ai_min_confidence?.value ? Number(form.ai_min_confidence.value) : null;

  const ai_config = isAi ? {
    system_prompt: form.ai_system_prompt?.value.trim() || undefined,
    user_prompt: form.ai_user_prompt?.value.trim() || undefined,
    target_label: targetLabel || undefined
  } : null;

  const pass_criteria = isAi ? {
    ...(targetLabel ? { target_label: targetLabel } : {}),
    ...(Number.isFinite(targetCount) ? { target_count: targetCount } : {}),
    ...(Number.isFinite(minScore) ? { min_score: minScore } : {}),
    ...(Number.isFinite(minConfidence) ? { min_confidence: minConfidence } : {}),
    ...(validation_mode === 'ai_rule_check' ? { all_rules_must_pass: true } : {})
  } : null;

  return {
    submission_type: isImageAi ? 'image' : 'answer',
    validation_mode,
    ai_config,
    pass_criteria,
    failure_message: form.failure_message?.value.trim() || null,
    success_message: form.success_message?.value.trim() || null,
    max_attempts: form.max_attempts?.value || null,
    location_required: !!form.location_required?.checked
  };
}

function validateAiPayload(form, payload, msgEl) {
  const mode = payload.validation_mode;
  if (!mode.startsWith('ai_')) return true;
  if (!payload.ai_config?.user_prompt) { msgEl.textContent = 'AI 任務請填寫使用者提示詞'; return false; }
  if (mode === 'ai_text_check') return true;
  if (mode === 'ai_count' && !payload.ai_config?.target_label) { msgEl.textContent = '數量判斷請填目標標籤'; return false; }
  if (mode === 'ai_count' && !payload.pass_criteria?.target_count) { msgEl.textContent = '數量判斷請填目標數量'; return false; }
  if (mode === 'ai_identify' && !payload.ai_config?.target_label) { msgEl.textContent = '辨識任務請填目標標籤'; return false; }
  if (mode === 'ai_score' && (payload.pass_criteria?.min_score == null)) { msgEl.textContent = '評分任務請填最低分數'; return false; }
  return true;
}

// ── Load Quest Chains ─────────────────────────────────────────
function loadQuestChains() {
  return apiJson(`${API_BASE}/api/quest-chains`, {
    headers: withActorHeaders()
  })
    .then(data => {
      if (!data.success) return;
      globalQuestChainsMap = {};
      data.questChains.forEach(q => { globalQuestChainsMap[q.id] = q; });

      // Update quest chain select in task form
      const sel = document.getElementById('questChainSelect');
      if (sel) {
        sel.innerHTML = '<option value="">-- 請選擇 --</option>';
        data.questChains.forEach(q => {
          sel.innerHTML += `<option value="${q.id}">${escHtml(q.title)}</option>`;
        });
      }

      refreshCouponQuestChainOptions();
      renderQuestChainList(filterQuestChains(data.questChains));
    });
}

function renderQuestChainList(chains) {
  const container = document.getElementById('questChainListContainer');
  if (!chains.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div>${currentQuestChainSearchTerm ? '找不到符合搜尋條件的入口' : '目前沒有玩法入口，點右上角新增'}</div>`;
    return;
  }
  container.innerHTML = chains.map(q => {
    const billingPolicy = normalizeQuestChainBillingPolicy(q);
    const modeTag = q.mode_type === 'board_game' ? '<span class="tag tag-green">大富翁</span>' : '<span class="tag tag-blue">劇情主線</span>';
    const accessMode = q.access_mode || 'public';
    const accessTag = accessMode === 'coupon'
      ? '<span class="tag tag-red">需 Coupon</span>'
      : '<span class="tag tag-green">公開入口</span>';
    const experienceMode = q.experience_mode || 'formal';
    const experienceTag = experienceMode === 'tutorial'
      ? '<span class="tag tag-amber">教學模式</span>'
      : experienceMode === 'demo'
        ? '<span class="tag tag-red">Demo 模式</span>'
        : '<span class="tag tag-gray">正式模式</span>';
    const statusTag = q.is_active
      ? '<span class="tag tag-green">已開放</span>'
      : '<span class="tag tag-red">未開放</span>';
    const structureLockTag = isQuestChainStructureLockedClient(q)
      ? '<span class="tag tag-red">結構已鎖定</span>'
      : '<span class="tag tag-blue">可編輯結構</span>';
    const shopName = q.shop_name || globalShopsMap[String(q.shop_id)]?.name || (q.shop_id ? `商家 #${q.shop_id}` : '未指定商家');
    const planName = q.plan_name || globalEntryPlansMap[String(q.plan_id)]?.name || (q.plan_id ? `方案 #${q.plan_id}` : '歷史入口');
    const taskLimit = q.task_limit ? `${q.task_limit} 關` : '未限制';
    const setupFee = formatCurrency(q.setup_fee || 0);
    const billingTag = billingPolicy === 'public_good'
      ? '<span class="tag tag-green">公益入口</span>'
      : (q.setup_fee_paid
        ? '<span class="tag tag-green">建置費已收款</span>'
        : '<span class="tag tag-amber">建置費待收</span>');
    return `
      <div class="quest-card">
        <div style="min-width:0;">
          <div class="quest-card-title">${escHtml(q.title)}</div>
          <div class="quest-card-meta">
            ${modeTag} ${accessTag} ${experienceTag} ${statusTag}
            ${structureLockTag}
            ${q.entry_scene_label ? `<span class="tag tag-gray">${escHtml(q.entry_scene_label)}</span>` : ''}
            <span class="tag tag-amber">🏆 ${q.chain_points || 0} 分</span>
            ${q.play_style ? `<span class="tag tag-gray">🎲 ${escHtml(q.play_style)}</span>` : ''}
            <span class="tag tag-gray">🏪 ${escHtml(shopName)}</span>
            <span class="tag tag-gray">📦 ${escHtml(planName)}</span>
            <span class="tag tag-gray">📏 ${escHtml(taskLimit)}</span>
            <span class="tag tag-gray">💰 ${billingPolicy === 'public_good' ? `${escHtml(setupFee)}（免收）` : escHtml(setupFee)}</span>
            ${billingTag}
            <span class="tag tag-gray">🤖 本月 ${Number(q.current_billing_month_tokens || 0).toLocaleString('zh-TW')} tokens</span>
          </div>
          ${q.short_description ? `<div style="font-size:0.85rem; color:#64748b; margin-top:6px;">${escHtml(q.short_description)}</div>` : ''}
        </div>
        <div class="quest-card-actions">
          <button class="btn-sm btn-secondary-v2" onclick="goToQuestDetail('${q.id}')">管理內容</button>
          <button class="btn-sm btn-secondary-v2" onclick="editQuestChain('${q.id}')">編輯</button>
          ${isQuestChainStructureLockedClient(q) ? '' : `<button class="btn-sm btn-danger-v2" onclick="deleteQuestChain('${q.id}')">刪除</button>`}
        </div>
      </div>
    `;
  }).join('');
}

function applyQuestChainSearch() {
  currentQuestChainSearchTerm = document.getElementById('questChainSearchInput')?.value.trim() || '';
  renderQuestChainList(filterQuestChains(Object.values(globalQuestChainsMap)));
}

function resetQuestChainSearch() {
  currentQuestChainSearchTerm = '';
  const input = document.getElementById('questChainSearchInput');
  if (input) input.value = '';
  renderQuestChainList(Object.values(globalQuestChainsMap));
}

function editQuestChain(id) {
  const q = globalQuestChainsMap[id];
  if (!q) return;
  openDrawer('編輯玩法入口', 'form-quest-chain', {
    id: q.id, mode_type: q.mode_type, title: q.title,
    short_description: q.short_description || '', description: q.description || '',
    entry_order: q.entry_order || 0, entry_button_text: q.entry_button_text || '',
    entry_scene_label: q.entry_scene_label || '', access_mode: q.access_mode || 'public', experience_mode: q.experience_mode || 'formal', play_style: q.play_style || '',
    chain_points: q.chain_points || 100, badge_name: q.badge_name || '',
    shop_id: q.shop_id || '',
    plan_id: q.plan_id || '',
    task_limit: q.task_limit || '',
    setup_fee: q.setup_fee || 0,
    setup_fee_paid: q.setup_fee_paid,
    billing_policy: normalizeQuestChainBillingPolicy(q),
    monthly_billing_enabled: q.monthly_billing_enabled !== false,
    is_active: q.is_active
  });
  applyQuestChainFormLockUi(q);
}

function deleteQuestChain(id) {
  const q = globalQuestChainsMap[id];
  if (isQuestChainStructureLockedClient(q)) {
    showToast('這個入口的結構已鎖定，發布後請改用停用或維護，不可直接刪除', 'error');
    return;
  }
  if (!confirm('確定要刪除此玩法入口嗎？\n如果底下還有關卡，將無法刪除。')) return;
  fetch(`${API_BASE}/api/quest-chains/${id}`, {
    method: 'DELETE', headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) { showToast('已刪除'); loadQuestChains(); }
      else showToast(d.message || '刪除失敗', 'error');
    });
}

function renderShopList(shops = []) {
  const container = document.getElementById('shopListContainer');
  if (!container) return;
  if (!shops.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏪</div>尚無商店資料</div>';
    return;
  }
  container.innerHTML = shops.map((shop) => `
    <div class="quest-card">
      <div style="min-width:0;">
        <div class="quest-card-title">${escHtml(shop.name || `商店 #${shop.id}`)}</div>
        <div class="quest-card-meta">
          <span class="tag ${shop.is_active ? 'tag-green' : 'tag-red'}">${shop.is_active ? '啟用中' : '已停用'}</span>
          <span class="tag tag-gray">建置者 ${escHtml(shop.builder_username || 'admin')}</span>
          <span class="tag tag-gray">商店帳號 ${escHtml(shop.owner_username || '未建立')}</span>
          <span class="tag tag-gray">員工 ${formatTokenCount(shop.staff_count || 0)} 人</span>
          <span class="tag tag-gray">入口 ${formatTokenCount(shop.quest_chain_count || 0)} 個</span>
        </div>
        <div style="font-size:0.84rem; color:#64748b; margin-top:8px;">
          ${escHtml(shop.contact_name || '未填聯絡人')}｜${escHtml(shop.contact_phone || '未填電話')}｜${escHtml(shop.contact_email || '未填 Email')}
        </div>
      </div>
      <div class="quest-card-actions">
        <button class="btn-sm btn-secondary-v2" onclick="openShopDrawer('${shop.id}')">編輯</button>
      </div>
    </div>
  `).join('');
}

function loadShopManagement() {
  return apiJson(`${API_BASE}/api/shops`, {
    headers: withActorHeaders()
  }).then((data) => {
    renderShopList(data.shops || []);
  });
}

function openShopDrawer(id = '') {
  const shop = id ? globalShopsMap[String(id)] : null;
  openDrawer(shop ? '編輯商店' : '新增商店', 'form-shop', {
    shop_id: shop?.id || '',
    shop_name: shop?.name || '',
    username: '',
    password: '',
    contact_name: shop?.contact_name || '',
    contact_phone: shop?.contact_phone || '',
    contact_email: shop?.contact_email || '',
    shop_address: shop?.address || '',
    shop_description: shop?.description || '',
    status: shop?.status || 'active'
  });
  const form = document.getElementById('shopForm');
  if (form) {
    const editing = Boolean(shop);
    form.elements.username.disabled = editing;
    form.elements.password.disabled = editing;
    form.elements.username.required = !editing;
    form.elements.password.required = !editing;
  }
}

function renderPlanList(plans = []) {
  const container = document.getElementById('planListContainer');
  if (!container) return;
  if (!plans.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📐</div>尚無方案資料</div>';
    return;
  }
  container.innerHTML = plans.map((plan) => `
    <div class="quest-card">
      <div style="min-width:0;">
        <div class="quest-card-title">${escHtml(plan.name || `方案 #${plan.id}`)}</div>
        <div class="quest-card-meta">
          <span class="tag ${plan.is_active ? 'tag-green' : 'tag-red'}">${plan.is_active ? '可使用' : '已停用'}</span>
          <span class="tag tag-gray">上限 ${formatTokenCount(plan.task_limit || 0)} 關</span>
          <span class="tag tag-gray">建置費 ${formatCurrency(plan.setup_fee || 0)}</span>
          <span class="tag tag-gray">月費 ${formatCurrency(plan.monthly_base_fee || 0)}</span>
          <span class="tag tag-gray">${escHtml(formatTokenPricingRule(plan.token_price_per_1k || 0))}</span>
        </div>
      </div>
      <div class="quest-card-actions">
        <button class="btn-sm btn-secondary-v2" onclick="openPlanDrawer('${plan.id}')">編輯</button>
      </div>
    </div>
  `).join('');
}

function loadPlanManagement() {
  return apiJson(`${API_BASE}/api/entry-plans?include_inactive=1`, {
    headers: withActorHeaders()
  }).then((data) => {
    renderPlanList(data.plans || []);
    renderPlanQuotePreview(data.plans || []);
  });
}

function getPrintablePlanQuoteHtml(plans = []) {
  const sortedPlans = [...plans].sort((left, right) => Number(left.task_limit || 0) - Number(right.task_limit || 0));
  const generatedAt = new Date().toLocaleString('zh-TW');
  return `
    <!DOCTYPE html>
    <html lang="zh-Hant">
    <head>
      <meta charset="UTF-8">
      <title>沙丘平台方案報價</title>
      <style>
        body { font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
        .sheet { max-width: 960px; margin: 0 auto; background: white; min-height: 100vh; padding: 40px 48px; box-sizing: border-box; }
        .hero { border-radius: 24px; padding: 28px 30px; color: white; background: linear-gradient(135deg, #0f766e, #0f172a); }
        .hero h1 { margin: 0 0 10px; font-size: 2rem; }
        .hero p { margin: 0; line-height: 1.7; color: rgba(255,255,255,0.88); }
        .meta { margin-top: 14px; font-size: 0.88rem; color: rgba(255,255,255,0.78); }
        .section { margin-top: 28px; }
        .section h2 { font-size: 1.2rem; margin: 0 0 14px; }
        .panel { border: 1px solid #dbeafe; border-radius: 18px; padding: 18px 20px; background: linear-gradient(180deg, #ffffff, #f8fafc); }
        .plan-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .plan-card { border: 1px solid #cbd5e1; border-radius: 18px; padding: 18px; background: white; }
        .plan-card h3 { margin: 0 0 8px; font-size: 1.06rem; }
        .price { font-size: 1.5rem; font-weight: 800; color: #0f766e; margin-bottom: 10px; }
        .muted { color: #64748b; line-height: 1.7; }
        .rule-list { display: grid; gap: 10px; }
        .rule-item { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px; background: white; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 18px; overflow: hidden; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 14px; text-align: left; vertical-align: top; }
        th { background: #eff6ff; color: #1e3a8a; font-size: 0.9rem; }
        tr:last-child td { border-bottom: none; }
        .footer-note { margin-top: 22px; color: #64748b; font-size: 0.85rem; line-height: 1.7; }
        @media print {
          body { background: white; }
          .sheet { padding: 20px 24px; }
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        <div class="hero">
          <h1>沙丘平台 方案介紹與報價</h1>
          <p>把環境教育、食農教育與場域體驗，從被動導覽轉成主動探索。廠商可用平台建立自己的入口、關卡與 AI 互動體驗，並依實際 LM 使用量按月計費。</p>
          <div class="meta">匯出時間：${escHtml(generatedAt)}｜用途：廠商報價與方案說明</div>
        </div>

        <div class="section">
          <h2>方案一覽</h2>
          <div class="plan-grid">
            ${sortedPlans.map((plan) => `
              <div class="plan-card">
                <h3>${escHtml(plan.name || `方案 #${plan.id}`)}</h3>
                <div class="price">${formatCurrency(plan.setup_fee || 0)}</div>
                <div class="muted">
                  關卡上限：${escHtml(formatTokenCount(plan.task_limit || 0))} 關<br>
                  每月基本費：${formatCurrency(plan.monthly_base_fee || 0)}<br>
                  LM 使用量：${escHtml(formatTokenPricingRule(plan.token_price_per_1k || 0))}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="section">
          <h2>收費規則</h2>
          <div class="rule-list">
            <div class="rule-item"><strong>一次性建置費</strong><br><span class="muted">10 關 NT$5,000；每增加 10 關加 NT$3,000。不滿 10 關仍以 10 關方案計價。</span></div>
            <div class="rule-item"><strong>每月 LM 費用</strong><br><span class="muted">依實際 LM 使用量計費，目前標準為每 1 萬 tokens = NT$10。</span></div>
            <div class="rule-item"><strong>建置完成後可修改</strong><br><span class="muted">文字敘事、圖片素材、提示文案、成功/失敗訊息可持續調整。</span></div>
            <div class="rule-item"><strong>建置完成後不可修改</strong><br><span class="muted">關卡類型、驗證方式、GPS 結構、核心玩法順序等會鎖定，避免已上線內容被改壞。</span></div>
          </div>
        </div>

        <div class="section">
          <h2>交付內容</h2>
          <div class="two-col">
            <div class="panel">
              <strong>平台角色</strong>
              <div class="muted">admin 為平台管理員；shop 為建置廠商；staff 為廠商員工並綁定在 shop 底下。各商店的入口、商品、coupon、使用量彼此獨立管理。</div>
            </div>
            <div class="panel">
              <strong>數據與帳務</strong>
              <div class="muted">平台可追蹤每日與每月的 LM tokens、入口用量、商店總帳，以及每位玩家在每一關實際消耗的 token 明細。</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>報價明細表</h2>
          <table>
            <thead>
              <tr>
                <th>方案</th>
                <th>關卡上限</th>
                <th>一次性建置費</th>
                <th>每月基本費</th>
                <th>LM 使用量費率</th>
              </tr>
            </thead>
            <tbody>
              ${sortedPlans.map((plan) => `
                <tr>
                  <td>${escHtml(plan.name || `方案 #${plan.id}`)}</td>
                  <td>${escHtml(formatTokenCount(plan.task_limit || 0))} 關</td>
                  <td>${formatCurrency(plan.setup_fee || 0)}</td>
                  <td>${formatCurrency(plan.monthly_base_fee || 0)}</td>
                  <td>${escHtml(formatTokenPricingRule(plan.token_price_per_1k || 0))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="footer-note">
          備註：本頁為方案說明與報價用途。實際專案若有特殊場域需求、客製化關卡數或公益合作模式，可再另行討論。
        </div>
      </div>
      <script>
        window.onload = () => {
          setTimeout(() => window.print(), 200);
        };
      </script>
    </body>
    </html>
  `;
}

function renderPlanQuotePreview(plans = []) {
  const container = document.getElementById('planQuotePreview');
  if (!container) return;
  const sortedPlans = [...plans].sort((left, right) => Number(left.task_limit || 0) - Number(right.task_limit || 0));
  if (!sortedPlans.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div>尚無方案資料，請先建立至少一筆方案。</div>';
    return;
  }
  container.innerHTML = `
    <div class="panel-card" style="border-style:dashed;">
      <div class="panel-card-header">
        <div>
          <div class="panel-card-title">廠商報價頁預覽</div>
          <div class="panel-card-subtitle">這一頁會用目前方案資料自動組成，可直接列印成 PDF 提供給廠商。</div>
        </div>
      </div>
      <div style="display:grid; gap:16px;">
        <div style="background:linear-gradient(135deg,#0f766e,#0f172a); color:white; border-radius:18px; padding:20px 22px;">
          <div style="font-size:1.35rem; font-weight:800; margin-bottom:8px;">沙丘平台 方案介紹與報價</div>
          <div style="line-height:1.8; color:rgba(255,255,255,0.88);">把教育內容帶回場域，讓學員走出去自己找答案。平台提供入口建置、AI 關卡、使用量追蹤與月結帳務。</div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
          ${sortedPlans.map((plan) => `
            <div style="background:white; border:1px solid #dbeafe; border-radius:16px; padding:16px;">
              <div style="font-size:1.02rem; font-weight:700; color:#0f172a; margin-bottom:8px;">${escHtml(plan.name || `方案 #${plan.id}`)}</div>
              <div style="font-size:1.4rem; font-weight:800; color:#0f766e; margin-bottom:8px;">${formatCurrency(plan.setup_fee || 0)}</div>
              <div class="subtle-note">關卡上限 ${escHtml(formatTokenCount(plan.task_limit || 0))} 關</div>
              <div class="subtle-note">每月基本費 ${formatCurrency(plan.monthly_base_fee || 0)}</div>
              <div class="subtle-note">${escHtml(formatTokenPricingRule(plan.token_price_per_1k || 0))}</div>
            </div>
          `).join('')}
        </div>
        <div style="display:grid; gap:10px;">
          <div class="locked-field"><div class="locked-field-label">一次性建置費</div><div class="locked-field-value">10 關 NT$5,000；每增加 10 關加 NT$3,000；不滿 10 關仍以 10 關計。</div></div>
          <div class="locked-field"><div class="locked-field-label">每月 LM 使用量</div><div class="locked-field-value">每 1 萬 tokens = NT$10，可按商店、入口、玩家逐關明細追蹤。</div></div>
          <div class="locked-field"><div class="locked-field-label">建置後可調整範圍</div><div class="locked-field-value">文字敘事、提示文案、圖片素材可修改；關卡類型、GPS 與核心驗證結構會鎖定。</div></div>
        </div>
      </div>
    </div>
  `;
}

function downloadPlanQuotePdf() {
  const plans = Object.values(globalEntryPlansMap);
  if (!plans.length) {
    showToast('目前沒有方案資料可匯出', 'error');
    return;
  }
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=900');
  if (!popup) {
    showToast('無法開啟列印視窗，請確認瀏覽器未封鎖彈出視窗', 'error');
    return;
  }
  popup.document.open();
  popup.document.write(getPrintablePlanQuoteHtml(plans));
  popup.document.close();
}

function openPlanDrawer(id = '') {
  const plan = id ? globalEntryPlansMap[String(id)] : null;
  openDrawer(plan ? '編輯方案' : '新增方案', 'form-plan', {
    id: plan?.id || '',
    name: plan?.name || '',
    task_limit: plan?.task_limit || '',
    setup_fee: plan?.setup_fee || 0,
    monthly_base_fee: plan?.monthly_base_fee || 0,
    token_price_per_1k: Number(plan?.token_price_per_1k || 0) * 10,
    is_active: plan?.is_active !== false
  });
}

// ── Quest Chain Form Submit ───────────────────────────────────
document.getElementById('questChainForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.id.value;
  const msgEl = document.getElementById('questChainFormMsg');
  setInlineMessage(msgEl, '');
  if (!form.reportValidity()) {
    scrollToFirstInvalid(form);
    setInlineMessage(msgEl, '請先完成必填欄位');
    return;
  }

  const fd = new FormData();
  fd.append('shop_id', form.shop_id.value);
  fd.append('plan_id', form.plan_id.value);
  fd.append('task_limit', form.task_limit.value);
  fd.append('setup_fee', form.setup_fee.value);
  const editingChain = id ? globalQuestChainsMap[String(id)] || null : null;
  const billingPolicy = editingChain
    ? normalizeQuestChainBillingPolicy(editingChain)
    : (loginUser?.role === 'admin' ? 'public_good' : 'commercial');
  fd.append('setup_fee_paid', billingPolicy === 'public_good' ? '0' : (form.setup_fee_paid.checked ? '1' : '0'));
  fd.append('monthly_billing_enabled', billingPolicy === 'public_good' ? '1' : (form.monthly_billing_enabled.checked ? '1' : '0'));
  fd.append('title', form.title.value.trim());
  fd.append('description', form.description.value.trim());
  fd.append('short_description', form.short_description.value.trim());
  fd.append('chain_points', form.chain_points.value);
  fd.append('badge_name', form.badge_name.value.trim());
  fd.append('mode_type', form.mode_type.value);
  fd.append('entry_order', form.entry_order.value);
  fd.append('entry_button_text', form.entry_button_text.value.trim());
  fd.append('entry_scene_label', form.entry_scene_label.value.trim());
  fd.append('access_mode', form.access_mode.value);
  fd.append('experience_mode', form.experience_mode.value);
  fd.append('play_style', form.play_style.value);
  fd.append('is_active', form.is_active.checked ? '1' : '0');
  const badgeFile = form.badge_image?.files[0];
  if (badgeFile) fd.append('badge_image', badgeFile);

  const url = id ? `${API_BASE}/api/quest-chains/${id}` : `${API_BASE}/api/quest-chains`;
  setInlineMessage(msgEl, id ? '入口更新中...' : '入口建立中...', 'info');
  fetch(url, {
    method: id ? 'PUT' : 'POST',
    headers: withActorHeaders(),
    body: fd
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        setInlineMessage(msgEl, id ? '入口已更新' : '入口已建立', 'success');
        showToast(id ? '更新成功' : '建立成功');
        closeDrawer();
        loadQuestChains();
      } else {
        setInlineMessage(msgEl, d.message || '操作失敗');
        showToast(d.message || '操作失敗', 'error');
      }
    })
    .catch(() => {
      setInlineMessage(msgEl, '伺服器連線失敗');
      showToast('伺服器連線失敗', 'error');
    });
});

// Badge preview
const qcBadgeInput = document.getElementById('qcBadgeInput');
const qcBadgePreview = document.getElementById('qcBadgePreview');
if (qcBadgeInput) {
  qcBadgeInput.addEventListener('change', function () {
    const file = this.files[0];
    if (file) {
      const r = new FileReader();
      r.onload = e => { qcBadgePreview.src = e.target.result; qcBadgePreview.style.display = 'block'; };
      r.readAsDataURL(file);
    } else { qcBadgePreview.style.display = 'none'; }
  });
}

const questChainShopSelect = document.getElementById('questChainShopSelect');
if (questChainShopSelect) {
  questChainShopSelect.addEventListener('change', syncQuestChainCommercialFields);
}

const questChainPlanSelect = document.getElementById('questChainPlanSelect');
if (questChainPlanSelect) {
  questChainPlanSelect.addEventListener('change', syncQuestChainCommercialFields);
}

// ── Drill-down: Load quest detail ─────────────────────────────
let currentBoardMapId = null;
let currentBoardMapName = '';
let currentBoardTiles = [];
let lastLoadedBoardMap = null;
let currentQuestChainLocked = false;
let currentQuestChainFormLocked = false;

const boardPlayStyleLabels = {
  fixed_track_race: '終點競走型',
  random_trip: '三回合探索型',
  round_score: '積分累積型'
};

const TASK_STRUCTURE_LOCK_FIELD_NAMES = [
  'type',
  'quest_chain_id_select',
  'quest_order',
  'is_final_step',
  'time_limit_start',
  'time_limit_end',
  'max_participants',
  'task_type',
  'validation_mode',
  'location_required',
  'lat',
  'lng',
  'radius',
  'points',
  'correct_answer_text',
  'optionA',
  'optionB',
  'optionC',
  'optionD',
  'correct_answer_select',
  'ai_target_label',
  'ai_target_count',
  'ai_min_score',
  'ai_min_confidence',
  'ai_system_prompt',
  'ai_user_prompt',
  'max_attempts',
  'required_item_id',
  'reward_item_id',
  'ar_model_id',
  'ar_order_model',
  'ar_order_image',
  'ar_order_youtube'
];

const QUEST_CHAIN_FORM_LOCK_FIELD_NAMES = [
  'mode_type',
  'chain_points',
  'entry_order',
  'access_mode',
  'experience_mode',
  'play_style'
];

function isQuestChainStructureLockedClient(chain) {
  if (!chain) return false;
  return Boolean(chain.structure_locked_at) || Boolean(chain.is_active);
}

function applyQuestChainStructureLockUi(chain) {
  currentQuestChainLocked = isQuestChainStructureLockedClient(chain);
  const banner = document.getElementById('questStructureLockBanner');
  const createTaskBtn = document.getElementById('btnAddTask');
  const createTileBtn = document.getElementById('btnAddTile');
  const createBoardMapBtn = document.getElementById('btnCreateBoardMap');
  const editBoardMapBtn = document.getElementById('btnEditBoardMap');

  if (banner) {
    if (currentQuestChainLocked) {
      banner.style.display = 'block';
      banner.textContent = '這個入口已進入發布後維護階段，核心結構已鎖定。你仍可修改文案、提示與素材，但不能新增、刪除或更動題型、GPS、驗證方式、順序等結構設定。';
    } else {
      banner.style.display = 'none';
      banner.textContent = '';
    }
  }

  if (createTaskBtn) {
    createTaskBtn.disabled = currentQuestChainLocked;
    createTaskBtn.style.opacity = currentQuestChainLocked ? '0.55' : '1';
    createTaskBtn.style.cursor = currentQuestChainLocked ? 'not-allowed' : 'pointer';
  }
  if (createTileBtn) {
    createTileBtn.disabled = currentQuestChainLocked;
    createTileBtn.style.opacity = currentQuestChainLocked ? '0.55' : '1';
    createTileBtn.style.cursor = currentQuestChainLocked ? 'not-allowed' : 'pointer';
  }
  if (createBoardMapBtn) {
    createBoardMapBtn.disabled = currentQuestChainLocked;
    createBoardMapBtn.style.opacity = currentQuestChainLocked ? '0.55' : '1';
    createBoardMapBtn.style.cursor = currentQuestChainLocked ? 'not-allowed' : 'pointer';
  }
  if (editBoardMapBtn) {
    editBoardMapBtn.disabled = currentQuestChainLocked;
    editBoardMapBtn.style.opacity = currentQuestChainLocked ? '0.55' : '1';
    editBoardMapBtn.style.cursor = currentQuestChainLocked ? 'not-allowed' : 'pointer';
  }
}

function applyQuestChainFormLockUi(chain = null) {
  const form = document.getElementById('questChainForm');
  const banner = document.getElementById('questChainFormLockBanner');
  if (!form) return;

  currentQuestChainFormLocked = isQuestChainStructureLockedClient(chain);
  if (banner) {
    if (currentQuestChainFormLocked) {
      banner.style.display = 'block';
      banner.textContent = '這個入口已發布，入口核心結構已鎖定。你現在仍可調整標題、介紹、入口文案、封面素材、收款狀態與上下架狀態，但不能修改方案、模式、玩法規則與入口結構。';
    } else {
      banner.style.display = 'none';
      banner.textContent = '';
    }
  }

  QUEST_CHAIN_FORM_LOCK_FIELD_NAMES.forEach((name) => {
    const field = form.elements[name];
    if (!field) return;
    field.disabled = currentQuestChainFormLocked;
  });
}

function applyTaskStructureLockUi(task = null, chain = null) {
  const banner = document.getElementById('taskStructureLockBanner');
  const form = document.getElementById('taskForm');
  const blueprintSelect = document.getElementById('taskBlueprintSelect');
  const locked = Boolean(task && (task.structure_locked || task.structure_locked_at || isQuestChainStructureLockedClient(chain)));

  if (banner) {
    if (locked) {
      banner.style.display = 'block';
      banner.textContent = '這個入口已發布，關卡核心結構已鎖定。你現在只能修改文字敘事、提示、成功失敗文案、封面與素材，不能修改題型、GPS、驗證方式、順序、積分與通關規則。';
    } else {
      banner.style.display = 'none';
      banner.textContent = '';
    }
  }

  if (!form) return;
  TASK_STRUCTURE_LOCK_FIELD_NAMES.forEach((name) => {
    const field = form.elements[name];
    if (!field) return;
    field.disabled = locked;
  });
  if (blueprintSelect) blueprintSelect.disabled = locked;
}

function setBoardMapToolbar(hasMap, bm) {
  const stats = document.getElementById('boardMapStatsBlock');
  const empty = document.getElementById('boardMapEmptyBlock');
  const btnCreate = document.getElementById('btnCreateBoardMap');
  const btnEdit = document.getElementById('btnEditBoardMap');
  const btnAddTile = document.getElementById('btnAddTile');
  const btnAddTask = document.getElementById('btnAddTask');
  if (!stats || !empty || !btnCreate || !btnEdit) return;

  if (hasMap && bm) {
    lastLoadedBoardMap = bm;
    stats.style.display = 'flex';
    empty.style.display = 'none';
    btnCreate.style.display = 'none';
    btnEdit.style.display = 'inline-flex';
    const styleKey = bm.play_style || 'fixed_track_race';
    const styleLabel = boardPlayStyleLabels[styleKey] || styleKey;
    document.getElementById('boardMapName').textContent = `🗺️ ${bm.name || '未命名地圖'}`;
    document.getElementById('boardMapStyle').textContent = `🎮 ${styleLabel}`;
    document.getElementById('boardMapTileCount').textContent = `🧩 ${bm.tile_count || 0} 格`;
    document.getElementById('boardMapDice').textContent = `🎯 骰子 ${bm.dice_min || 1}-${bm.dice_max || 6}`;
    document.getElementById('boardMapRange').textContent = `🏁 ${bm.start_tile || 1} → ${bm.finish_tile || 8}`;
    if (btnAddTile) btnAddTile.style.display = 'inline-flex';
    if (btnAddTask) btnAddTask.style.display = 'inline-flex';
  } else {
    lastLoadedBoardMap = null;
    stats.style.display = 'none';
    empty.style.display = 'block';
    btnCreate.style.display = 'inline-flex';
    btnEdit.style.display = 'none';
    if (btnAddTile) btnAddTile.style.display = 'none';
    if (btnAddTask) btnAddTask.style.display = 'inline-flex';
  }
  applyQuestChainStructureLockUi(globalQuestChainsMap[String(currentQuestChainId)] || null);
}

function goToQuestDetail(questChainId) {
  const q = globalQuestChainsMap[questChainId];
  if (!q) return;

  currentQuestChainId = questChainId;
  currentQuestChainTitle = q.title;
  currentQuestChainMode = q.mode_type;
  applyQuestChainStructureLockUi(q);

  document.getElementById('detailQuestTitle').textContent = `管理：${q.title}`;
  document.getElementById('task_locked_quest_name').textContent = q.title;
  document.getElementById('task_quest_chain_id').value = questChainId;

  // Toggle buttons based on mode
  const btnAddTask = document.getElementById('btnAddTask');
  const btnAddTile = document.getElementById('btnAddTile');
  const boardInfoBar = document.getElementById('boardMapInfoBar');

  if (q.mode_type === 'board_game') {
    btnAddTask.style.display = 'inline-flex';
    btnAddTile.style.display = 'none';
    boardInfoBar.style.display = 'block';
  } else {
    btnAddTask.style.display = 'inline-flex';
    btnAddTile.style.display = 'none';
    boardInfoBar.style.display = 'none';
  }

  switchView('view-quest-detail');
  currentStructureMap = null;
  currentStructureSelection = null;
  const structurePanel = document.getElementById('structureMapPanel');
  if (structurePanel) structurePanel.style.display = 'none';
  const structureCanvas = document.getElementById('structureMapCanvas');
  if (structureCanvas) {
    structureCanvas.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗺️</div>點上方按鈕載入主結構地圖</div>';
  }

  if (q.mode_type === 'board_game') {
    loadBoardContent(questChainId);
  } else {
    loadTasksForQuest(questChainId);
  }
}

function inferNpcLabel(node) {
  let eventConfig = null;
  try { eventConfig = node.event_config ? JSON.parse(node.event_config) : null; } catch (err) { eventConfig = null; }
  if (eventConfig?.npc) return String(eventConfig.npc);
  const type = node.tile_type || node.type || '';
  const validation = node.validation_mode || '';
  const stage = node.stage_template || '';
  if (type === 'fortune') return '主持人・史蛋';
  if (type === 'chance') return '主持人・史蛋';
  if (type === 'story') return '導覽員・潮聲';
  if (type === 'event') return '引路人・史蛋';
  if (type === 'quiz') return '潮汐關主・巴布';
  if (type === 'finish') return '潮汐裁判・鯨老';
  if (validation.startsWith('ai_')) return '潮汐裁判・鯨老';
  if (stage.includes('intro') || stage.includes('story')) return '引路人・史蛋';
  return '潮汐關主・巴布';
}

function inferNodeKindLabel(node, modeType) {
  if (modeType === 'board_game') {
    return tileTypeLabels[node.tile_type] || '棋盤節點';
  }
  if (node.type === 'quest') return '劇情主線關卡';
  if (node.type === 'timed') return '限時關卡';
  return '一般關卡';
}

function getTaskHumanType(task) {
  if (task.validation_mode?.startsWith('ai_')) {
    const map = {
      ai_text_check: 'AI 文字判定',
      ai_count: 'AI 數量判斷',
      ai_identify: 'AI 指定物辨識',
      ai_score: 'AI 圖像評分',
      ai_rule_check: 'AI 規則檢查',
      ai_reference_match: 'AI 地點照片比對'
    };
    return map[task.validation_mode] || 'AI 任務';
  }
  const map = {
    multiple_choice: '選擇題',
    photo: '拍照任務',
    number: '數字解謎',
    keyword: '關鍵字',
    location: '地點打卡',
    qa: '問答題'
  };
  return map[task.task_type] || '關卡';
}

function describeAudioLabel(node) {
  let eventConfig = null;
  try { eventConfig = node.event_config ? JSON.parse(node.event_config) : null; } catch (err) { eventConfig = null; }
  if (eventConfig?.sfx) return `音效：${eventConfig.sfx}`;
  if (node.bgm_url || node.linked_bgm_url) return '有背景音樂';
  return '無音效設定';
}

function buildStructureNode(type, source, modeType) {
  const isBoard = modeType === 'board_game';
  let eventConfig = null;
  try {
    eventConfig = source.event_config ? JSON.parse(source.event_config) : null;
  } catch (err) {
    eventConfig = null;
  }
  return {
    id: `${type}-${source.id}`,
    nodeType: type,
    sourceId: source.id,
    order: isBoard ? Number(source.tile_index || 0) : Number(source.quest_order || 0),
    title: isBoard ? (source.tile_name || `第 ${source.tile_index} 格`) : source.name,
    subtitle: inferNodeKindLabel(source, modeType),
    description: isBoard
      ? (source.event_body || source.guide_content || source.task_description || '尚未填寫格子說明')
      : (source.description || source.guide_content || '尚未填寫關卡說明'),
    npcLabel: inferNpcLabel(source),
    primaryLabel: isBoard
      ? (tileTypeLabels[source.tile_type] || source.tile_type || '格子')
      : getTaskHumanType(source),
    requiredItem: source.required_item_name || null,
    rewardItem: source.reward_item_name || null,
    audioLabel: describeAudioLabel(source),
    validationLabel: source.validation_mode || source.tile_type || source.task_type || '未設定',
    stageTemplate: source.stage_template || null,
    eventConfig,
    raw: source
  };
}

function renderStructureMap() {
  const summary = document.getElementById('structureMapSummary');
  const canvas = document.getElementById('structureMapCanvas');
  const legend = document.getElementById('structureMapLegend');
  const inspectorTitle = document.getElementById('structureInspectorTitle');
  const inspectorLead = document.getElementById('structureInspectorLead');
  const inspectorBody = document.getElementById('structureInspectorBody');
  if (!summary || !canvas || !legend || !inspectorTitle || !inspectorLead || !inspectorBody) return;

  if (!currentStructureMap) {
    legend.style.display = 'none';
    summary.innerHTML = '<span class="tag tag-gray">尚未載入主結構</span>';
    canvas.innerHTML = '<div class="empty-state" style="width:100%;"><div class="empty-state-icon">🗺️</div>尚無結構資料</div>';
    inspectorTitle.textContent = '節點詳情';
    inspectorLead.textContent = '點擊左側節點，可查看這一關 / 這一格的 NPC、道具、音效與驗證方式。';
    inspectorBody.innerHTML = '';
    return;
  }

  const { questChain, tasks = [], boardMaps = [], boardTiles = [] } = currentStructureMap;
  const modeType = questChain.mode_type || 'story_campaign';
  legend.style.display = 'flex';
  legend.innerHTML = [
    ['🎯', '挑戰 / 主線關卡'],
    ['🧑‍🚀', 'NPC'],
    ['🎁', '道具'],
    ['🎵', '音效 / BGM'],
    ['🤖', 'AI 驗證 / 事件']
  ].map(([icon, text]) => `<span class="tag tag-gray">${icon} ${escHtml(text)}</span>`).join('');

  const nodes = modeType === 'board_game'
    ? boardTiles.map(tile => buildStructureNode('tile', tile, modeType)).sort((a, b) => a.order - b.order)
    : tasks.map(task => buildStructureNode('task', task, modeType)).sort((a, b) => a.order - b.order);

  summary.innerHTML = `
    <span class="tag tag-blue">${escHtml(questChain.title)}</span>
    <span class="tag tag-gray">${modeType === 'board_game' ? '大富翁模式' : '劇情主線'}</span>
    <span class="tag tag-gray">節點 ${nodes.length}</span>
    <span class="tag tag-gray">NPC ${new Set(nodes.map(node => node.npcLabel)).size}</span>
    ${boardMaps.length ? `<span class="tag tag-gray">棋盤 ${boardMaps.length}</span>` : ''}
  `;

  if (!nodes.length) {
    canvas.innerHTML = '<div class="empty-state" style="width:100%;"><div class="empty-state-icon">🧩</div>此主結構還沒有任何節點</div>';
    inspectorTitle.textContent = '主結構詳情';
    inspectorLead.textContent = questChain.short_description || questChain.description || '這個主結構尚未建立內容。';
    inspectorBody.innerHTML = '';
    return;
  }

  if (!currentStructureSelection || !nodes.some(node => node.id === currentStructureSelection.id)) {
    currentStructureSelection = nodes[0];
  }

  const mapCluster = boardMaps.length
    ? `<div class="structure-cluster">
         <div class="structure-cluster-label">棋盤結構</div>
         ${boardMaps.map((map) => `
           <div class="structure-node ${currentStructureSelection?.id === `board-map-${map.id}` ? 'active' : ''}" data-structure-board="${map.id}">
             <div class="structure-node-kind">${escHtml(map.play_style || 'board_game')}</div>
             <div class="structure-node-title">${escHtml(map.name)}</div>
             <div class="structure-node-meta">
               <span class="tag tag-gray">🧩 ${map.tile_count || 0} 格</span>
               <span class="tag tag-gray">🎯 ${map.challenge_tile_count || 0} 挑戰格</span>
               <span class="tag tag-gray">✨ ${map.event_tile_count || 0} 事件格</span>
             </div>
             <div class="structure-node-desc">起點 ${map.start_tile || 1} → 終點 ${map.finish_tile || 0}</div>
           </div>
         `).join('')}
       </div>`
    : '';

  canvas.innerHTML = `
    <div class="structure-lane-wrap">
      <div class="structure-root-node">
        <div class="structure-node-kind">${modeType === 'board_game' ? '大富翁玩法入口' : '劇情主線入口'}</div>
        <div class="structure-node-title">${escHtml(questChain.title)}</div>
        <div class="structure-node-badges">
          <span class="tag tag-gray">${modeType === 'board_game' ? '🎲 棋盤玩法' : '📖 劇情玩法'}</span>
          ${questChain.entry_scene_label ? `<span class="tag tag-gray">${escHtml(questChain.entry_scene_label)}</span>` : ''}
          ${questChain.play_style ? `<span class="tag tag-gray">${escHtml(questChain.play_style)}</span>` : ''}
        </div>
        <div class="structure-node-desc">${escHtml(questChain.short_description || questChain.description || '尚未填寫玩法說明')}</div>
      </div>
      <div class="structure-node-link"></div>
      ${mapCluster || ''}
      ${mapCluster ? '<div class="structure-node-link"></div>' : ''}
      <div class="structure-cluster">
        <div class="structure-cluster-label">${modeType === 'board_game' ? '格子 / 關卡節點' : '關卡節點'}</div>
        <div class="structure-lane">${
          nodes.map((node, index) => `
            <div class="structure-node ${currentStructureSelection.id === node.id ? 'active' : ''}" data-structure-node="${node.id}">
              <div class="structure-node-kind">${node.order ? `#${node.order}｜` : ''}${escHtml(node.subtitle)}</div>
              <div class="structure-node-title">${escHtml(node.title)}</div>
              <div class="structure-node-badges">
                <span class="tag tag-gray">${escHtml(node.primaryLabel)}</span>
                <span class="tag tag-gray">${escHtml(node.npcLabel)}</span>
                ${node.requiredItem ? `<span class="tag tag-gray">🔐 ${escHtml(node.requiredItem)}</span>` : ''}
                ${node.rewardItem ? `<span class="tag tag-gray">🎁 ${escHtml(node.rewardItem)}</span>` : ''}
              </div>
              <div class="structure-node-meta">${escHtml(node.audioLabel)}｜${escHtml(node.validationLabel)}</div>
              <div class="structure-node-desc">${escHtml(node.description || '尚未填寫說明')}</div>
            </div>
            ${index < nodes.length - 1 ? '<div class="structure-node-link">→</div>' : ''}
          `).join('')
        }</div>
      </div>
    </div>`;

  canvas.querySelectorAll('[data-structure-node]').forEach(el => {
    el.addEventListener('click', () => {
      const selected = nodes.find(node => node.id === el.dataset.structureNode);
      if (!selected) return;
      currentStructureSelection = selected;
      renderStructureMap();
    });
  });

  canvas.querySelectorAll('[data-structure-board]').forEach(el => {
    el.addEventListener('click', () => {
      const selectedBoard = boardMaps.find(map => String(map.id) === String(el.dataset.structureBoard));
      if (!selectedBoard) return;
      inspectorTitle.textContent = selectedBoard.name;
      inspectorLead.textContent = `這張棋盤屬於 ${questChain.title}，共有 ${selectedBoard.tile_count || 0} 格，採用 ${selectedBoard.play_style || 'fixed_track_race'} 規則。`;
      inspectorBody.innerHTML = `
        <div class="structure-inspector-list">
          <div class="structure-inspector-row"><strong>玩法樣式</strong><span>${escHtml(selectedBoard.play_style || 'fixed_track_race')}</span></div>
          <div class="structure-inspector-row"><strong>關卡分布</strong><span>${selectedBoard.challenge_tile_count || 0} 個挑戰格｜${selectedBoard.event_tile_count || 0} 個事件格</span></div>
          <div class="structure-inspector-row"><strong>路線</strong><span>起點 ${selectedBoard.start_tile || 1} → 終點 ${selectedBoard.finish_tile || 0}</span></div>
        </div>`;
    });
  });

  const selected = currentStructureSelection;
  inspectorTitle.textContent = selected.title;
  inspectorLead.textContent = selected.description || '這個節點尚未填寫補充說明。';
  inspectorBody.innerHTML = `
    <div class="structure-inspector-list">
      <div class="structure-inspector-row"><strong>節點類型</strong><span>${escHtml(selected.subtitle)}</span></div>
      <div class="structure-inspector-row"><strong>主要玩法</strong><span>${escHtml(selected.primaryLabel)}</span></div>
      <div class="structure-inspector-row"><strong>預設 NPC</strong><span>${escHtml(selected.npcLabel)}</span></div>
      <div class="structure-inspector-row"><strong>音效 / BGM</strong><span>${escHtml(selected.audioLabel)}</span></div>
      <div class="structure-inspector-row"><strong>道具關聯</strong><span>${selected.requiredItem ? `需 ${escHtml(selected.requiredItem)}` : '無前置需求'}${selected.rewardItem ? `｜完成得 ${escHtml(selected.rewardItem)}` : ''}</span></div>
      <div class="structure-inspector-row"><strong>提示 / 劇情</strong><span>${escHtml(selected.raw.stage_intro || selected.raw.story_context || selected.raw.guide_content || selected.raw.hint_text || '尚未設定')}</span></div>
      <div class="structure-inspector-row"><strong>驗證 / 節點資訊</strong><span>${escHtml(selected.validationLabel)}</span></div>
      <div class="structure-inspector-row"><strong>模板 / 事件設定</strong><span>${escHtml(selected.stageTemplate || '未指定模板')}${selected.eventConfig ? `<br>${escHtml(JSON.stringify(selected.eventConfig))}` : ''}</span></div>
    </div>`;
}

function loadStructureMap(questChainId) {
  currentStructureSelection = null;
  return apiJson(`${API_BASE}/api/quest-chains/${questChainId}/structure-map`, {
    headers: withActorHeaders()
  }).then(data => {
    currentStructureMap = data;
    renderStructureMap();
  }).catch(err => {
    currentStructureMap = null;
    const canvas = document.getElementById('structureMapCanvas');
    if (canvas) {
      canvas.innerHTML = `<div class="empty-state" style="width:100%;"><div class="empty-state-icon">⚠️</div>${escHtml(err.message || '結構地圖載入失敗')}</div>`;
    }
  });
}

function toggleStructureMap() {
  const panel = document.getElementById('structureMapPanel');
  if (!panel || !currentQuestChainId) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    if (!currentStructureMap) loadStructureMap(currentQuestChainId);
    else renderStructureMap();
  }
}

function refreshStructureMap() {
  if (!currentQuestChainId) return;
  const panel = document.getElementById('structureMapPanel');
  if (panel) panel.style.display = 'block';
  loadStructureMap(currentQuestChainId);
}

// ── Story mode: load tasks ────────────────────────────────────
function loadTasksForQuest(questChainId) {
  const container = document.getElementById('questDetailContentContainer');
  container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div>載入中...</div>';

  fetch(`${API_BASE}/api/tasks/admin`, {
    headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) { container.innerHTML = '<div class="empty-state">載入失敗</div>'; return; }

      globalTaskRecords = data.tasks || [];
      const tasks = globalTaskRecords.filter(t => String(t.quest_chain_id) === String(questChainId));
      tasks.sort((a, b) => (a.quest_order || 0) - (b.quest_order || 0));

      if (!tasks.length) {
        container.innerHTML = currentQuestChainLocked
          ? '<div class="empty-state"><div class="empty-state-icon">📦</div>此入口目前沒有關卡，而且結構已鎖定；若要補齊內容，請先建立草稿版入口再規劃後上線。</div>'
          : '<div class="empty-state"><div class="empty-state-icon">📦</div>此入口尚無關卡，點右上角新增</div>';
        return;
      }

      container.innerHTML = tasks.map(t => renderTaskItem(t)).join('');
    });
}

function renderTaskItem(t) {
  let typeLabel = '問答';
  if (t.validation_mode?.startsWith('ai_')) typeLabel = `AI (${t.validation_mode.replace('ai_', '')})`;
  else if (t.task_type === 'multiple_choice') typeLabel = '選擇題';
  else if (t.task_type === 'photo') typeLabel = '拍照';
  else if (t.task_type === 'number') typeLabel = '數字';
  else if (t.task_type === 'keyword') typeLabel = '關鍵字';
  else if (t.task_type === 'location') typeLabel = '打卡';

  const orderTag = t.quest_order ? `<span class="tag tag-blue">第 ${t.quest_order} 關</span>` : '';
  const finalTag = t.is_final_step ? '<span class="tag tag-amber">🏆 結局</span>' : '';
  const lat = Number(t.lat);
  const lng = Number(t.lng);
  const coordTag = Number.isFinite(lat) && Number.isFinite(lng)
    ? `<span class="tag tag-gray">📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>`
    : '<span class="tag tag-gray">📍 未設定</span>';
  const structureTag = currentQuestChainLocked
    ? '<span class="tag tag-red">結構已鎖定</span>'
    : '';
  const destructiveActions = currentQuestChainLocked
    ? ''
    : `<button class="btn-sm btn-secondary-v2" onclick="duplicateTask('${t.id}')">複製</button>
        <button class="btn-sm btn-danger-v2" onclick="deleteTask('${t.id}')">刪除</button>`;

  return `
    <div class="task-item">
      <img src="${escHtml(t.photoUrl || '/images/mascot.png')}" class="task-item-img" onerror="this.src='/images/mascot.png'">
      <div class="task-item-body">
        <div class="task-item-title">${escHtml(t.name)}</div>
        <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:4px;">
          ${orderTag} ${finalTag}
          <span class="tag tag-gray">${typeLabel}</span>
          <span class="tag tag-gray">💰 ${t.points || 0}</span>
          ${coordTag}
          ${structureTag}
        </div>
        <div class="task-item-desc">${escHtml(t.description || '')}</div>
      </div>
      <div class="task-item-actions">
        <button class="btn-sm btn-secondary-v2" onclick="editTask('${t.id}')">編輯</button>
        ${destructiveActions}
      </div>
    </div>
  `;
}

// ── Board game mode: load board map + tiles ───────────────────
function loadBoardContent(questChainId) {
  const container = document.getElementById('questDetailContentContainer');
  container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div>載入大富翁地圖...</div>';

  const authHeaders = { 'x-username': loginUser.username };

  const tasksPromise = fetch(`${API_BASE}/api/tasks/admin`, {
    headers: authHeaders,
    credentials: 'include'
  })
    .then(r => r.json())
    .then(d => {
      globalTaskRecords = d.success ? (d.tasks || []) : [];
      populateTileTaskSelect();
    });

  fetch(`${API_BASE}/api/board-maps/for-admin/${questChainId}`, {
    headers: authHeaders,
    credentials: 'include'
  })
    .then(r => r.json())
    .then(async data => {
      await tasksPromise;

      if (!data.success) {
        setBoardMapToolbar(false, null);
        currentBoardMapId = null;
        currentBoardMapName = '';
        document.getElementById('tile_board_map_id').value = '';
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗺️</div>無法載入大富翁地圖</div>';
        return null;
      }

      const maps = data.boardMaps || [];
      if (!maps.length) {
        setBoardMapToolbar(false, null);
        currentBoardMapId = null;
        currentBoardMapName = '';
        document.getElementById('tile_board_map_id').value = '';
        container.innerHTML =
          '<div class="empty-state"><div class="empty-state-icon">🗺️</div>尚未建立地圖，請先點上方「建立大富翁地圖」</div>';
        return null;
      }

      const bm = maps[0];
      currentBoardMapId = bm.id;
      currentBoardMapName = bm.name;
      setBoardMapToolbar(true, bm);

      document.getElementById('tile_board_map_id').value = bm.id;
      document.getElementById('tile_locked_map_name').textContent = bm.name;

      return fetch(`${API_BASE}/api/board-maps/${bm.id}/tiles`, {
        headers: authHeaders,
        credentials: 'include'
      });
    })
    .then(r => (r && r.json ? r.json() : null))
    .then(data => {
      if (!data) return;
      if (!data.success) {
        container.innerHTML = '<div class="empty-state">載入格子失敗</div>';
        return;
      }

      currentBoardTiles = data.tiles || [];
      currentBoardTiles.sort((a, b) => (a.tile_index || 0) - (b.tile_index || 0));

      if (!currentBoardTiles.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧩</div>尚無格子，點右上角「+ 新增格子」</div>';
        return;
      }

      container.innerHTML = currentBoardTiles.map(tile => renderTileItem(tile)).join('');
    })
    .catch(err => {
      console.error(err);
      setBoardMapToolbar(false, null);
      container.innerHTML = '<div class="empty-state">載入失敗</div>';
    });
}

const tileTypeIcons = {
  challenge: '🎯', event: '✨', supply: '💊', reward: '🎁', penalty: '💀',
  story: '📖', teleport: '🌀', finish: '🏁', fortune: '🔮', chance: '🎲',
  quiz: '📝', rest: '☕'
};

const tileTypeLabels = {
  challenge: '挑戰格', event: '事件格', supply: '補給格', reward: '獎勵格',
  penalty: '懲罰格', story: '劇情格', teleport: '傳送格', finish: '終點格',
  fortune: '命運格', chance: '機會格', quiz: '小考格', rest: '休息格'
};

function renderTileItem(tile) {
  const icon = tileTypeIcons[tile.tile_type] || '⬜';
  const typeLabel = tileTypeLabels[tile.tile_type] || tile.tile_type;
  const taskBinding = tile.task_name ? `<span class="tag tag-blue">綁定：${escHtml(tile.task_name)}</span>` : '';
  const effectTag = tile.effect_type
    ? `<span class="tag tag-amber">${escHtml(tile.effect_type)}${tile.effect_value != null ? `(${tile.effect_value})` : ''}</span>` : '';
  const activeTag = tile.is_active ? '' : '<span class="tag tag-red">未啟用</span>';
  const hasLocation = !!(tile.latitude && tile.longitude);
  const locationTag = hasLocation ? `<span class="tag tag-blue">📍 定位導引</span>` : '<span class="tag tag-gray">📍 無導航</span>';
  const eventPreview = tile.event_body
    ? `<div class="task-item-desc" style="margin-top:2px;">${escHtml(tile.event_body)}</div>` : '';

  return `
    <div class="task-item">
      <div style="width:50px; height:50px; border-radius:10px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; font-size:1.5rem; flex-shrink:0;">${icon}</div>
      <div class="task-item-body">
        <div class="task-item-title">第 ${tile.tile_index} 格｜${escHtml(tile.tile_name)}</div>
        <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:2px;">
          <span class="tag tag-gray">${typeLabel}</span>
          ${taskBinding} ${effectTag} ${activeTag} ${locationTag}
        </div>
        ${eventPreview}
      </div>
      <div class="task-item-actions">
        <button class="btn-sm btn-secondary-v2" onclick="duplicateTile('${tile.id}')">複製</button>
        <button class="btn-sm btn-secondary-v2" onclick="editTile('${tile.id}')">編輯</button>
        <button class="btn-sm btn-danger-v2" onclick="deleteTile('${tile.id}')">刪除</button>
      </div>
    </div>
  `;
}

// ── Tile type-driven UX ───────────────────────────────────────
const tileTypeMeta = {
  challenge: {
    hint: '玩家到達後需完成一個關卡任務（拍照、AI 辨識等），成功才能繼續前進。',
    hintBg: '#eff6ff', hintColor: '#1d4ed8', hintBorder: '#bfdbfe',
    showChallenge: true, showEvent: false, showEffect: false
  },
  quiz: {
    hint: '玩家到達時會跳出一道問題，答對加分、答錯扣分。在下方填寫題目與答案。',
    hintBg: '#fef3c7', hintColor: '#92400e', hintBorder: '#fde68a',
    showChallenge: true, showEvent: true, showEffect: true,
    eventTitle: '題目標題', eventBody: '把問題寫在這裡，選項可用 A/B/C/D 分行列出', eventHint: '答案寫在導覽補充裡，方便對答案'
  },
  event: {
    hint: '玩家踩到後會看到一段文案訊息，不需要完成任何任務，看完就繼續。',
    hintBg: '#fef3c7', hintColor: '#92400e', hintBorder: '#fde68a',
    showChallenge: false, showEvent: true, showEffect: false
  },
  story: {
    hint: '用來嵌入教學知識、劇情轉場或導覽內容。適合搭配教育課程使用。',
    hintBg: '#eff6ff', hintColor: '#1d4ed8', hintBorder: '#bfdbfe',
    showChallenge: false, showEvent: true, showEffect: false,
    eventTitle: '章節標題', eventBody: '教學內容或故事段落', eventHint: '導覽補充可以放更深入的知識解說'
  },
  fortune: {
    hint: '隨機事件！好事壞事都可能發生。用分號「;」分隔多個可能結果，系統會隨機抽一個。',
    hintBg: '#faf5ff', hintColor: '#7c3aed', hintBorder: '#ddd6fe',
    showChallenge: false, showEvent: true, showEffect: true,
    eventTitle: '命運標題', eventBody: '前進兩格！;退後一格！;獲得 20 分！;暫停一回合！', eventHint: '用分號分隔多個結果，系統隨機抽取'
  },
  chance: {
    hint: '正面隨機獎勵！只會發生好事。用分號「;」分隔多個獎勵選項。',
    hintBg: '#ecfdf5', hintColor: '#047857', hintBorder: '#a7f3d0',
    showChallenge: false, showEvent: true, showEffect: true,
    eventTitle: '機會標題', eventBody: '獲得 30 分！;前進三格！;再擲一次骰子！', eventHint: '用分號分隔多個獎勵，系統隨機抽取'
  },
  supply: {
    hint: '玩家踩到自動獲得加分或道具，不需要做任何事。設定下方的效果就好。',
    hintBg: '#ecfdf5', hintColor: '#047857', hintBorder: '#a7f3d0',
    showChallenge: false, showEvent: true, showEffect: true
  },
  reward: {
    hint: '額外獎勵格，給予玩家積分或道具獎勵。',
    hintBg: '#ecfdf5', hintColor: '#047857', hintBorder: '#a7f3d0',
    showChallenge: false, showEvent: true, showEffect: true
  },
  penalty: {
    hint: '懲罰格！扣分、退後或暫停一回合，增加遊戲緊張感。',
    hintBg: '#fef2f2', hintColor: '#b91c1c', hintBorder: '#fecaca',
    showChallenge: false, showEvent: true, showEffect: true
  },
  teleport: {
    hint: '傳送格：把效果類型設成「傳送到指定格」，數值填目標格子的編號。',
    hintBg: '#faf5ff', hintColor: '#7c3aed', hintBorder: '#ddd6fe',
    showChallenge: false, showEvent: true, showEffect: true
  },
  rest: {
    hint: '休息格，什麼都不會發生。讓玩家喘口氣。',
    hintBg: '#f1f5f9', hintColor: '#475569', hintBorder: '#e2e8f0',
    showChallenge: false, showEvent: false, showEffect: false
  },
  finish: {
    hint: '終點格！玩家到達即完成遊戲，觸發結算與獎勵發放。',
    hintBg: '#fef3c7', hintColor: '#92400e', hintBorder: '#fde68a',
    showChallenge: false, showEvent: true, showEffect: false,
    eventTitle: '結算標題', eventBody: '恭喜完成大富翁！你的成績是...'
  }
};

function updateTileFormByType() {
  const type = document.getElementById('tileTypeSelect').value;
  const meta = tileTypeMeta[type] || tileTypeMeta.event;

  // Hint
  const hint = document.getElementById('tileTypeHint');
  hint.textContent = meta.hint;
  hint.style.background = meta.hintBg;
  hint.style.color = meta.hintColor;
  hint.style.border = `1px solid ${meta.hintBorder}`;

  // Section visibility
  document.getElementById('tileSec_challenge').style.display = meta.showChallenge ? 'block' : 'none';
  document.getElementById('tileSec_event').style.display = meta.showEvent ? 'block' : 'none';
  document.getElementById('tileSec_effect').style.display = meta.showEffect ? 'block' : 'none';

  // Dynamic labels
  if (meta.eventTitle) {
    document.getElementById('tileEventTitleLabel').textContent = meta.eventTitle;
  } else {
    document.getElementById('tileEventTitleLabel').textContent = '事件標題';
  }
  if (meta.eventBody) {
    document.getElementById('tileEventBodyInput').placeholder = meta.eventBody;
  } else {
    document.getElementById('tileEventBodyInput').placeholder = '玩家踩到這格時看到的內容';
  }
  document.getElementById('tileEventBodyHint').textContent = meta.eventHint || '';

  // Section title
  const titles = { story: '教學內容', quiz: '問答內容', fortune: '命運卡內容', chance: '機會卡內容' };
  document.getElementById('tileEventSectionTitle').textContent = titles[type] || '玩家會看到的內容';

  // Auto-set effect for some types
  const effectSel = document.getElementById('tileEffectType');
  if (type === 'penalty' && !effectSel.value) effectSel.value = 'lose_points';
  if (type === 'supply' && !effectSel.value) effectSel.value = 'gain_points';
  if (type === 'reward' && !effectSel.value) effectSel.value = 'gain_points';
  if (type === 'teleport' && !effectSel.value) effectSel.value = 'teleport_to_tile';
}

const tileTypeSelect = document.getElementById('tileTypeSelect');
if (tileTypeSelect) {
  tileTypeSelect.addEventListener('change', updateTileFormByType);
}

// Tile location toggle
const tileLocationToggle = document.getElementById('tileLocationToggle');
const tileLocationFields = document.getElementById('tileLocationFields');
if (tileLocationToggle) {
  tileLocationToggle.addEventListener('change', () => {
    tileLocationFields.style.display = tileLocationToggle.checked ? 'block' : 'none';
  });
}

// ── Tile task select population ───────────────────────────────
function populateTileTaskSelect() {
  const sel = document.getElementById('tileTaskSelect');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- 不綁定（純事件/效果格）--</option>';
  const chainId = currentQuestChainId;
  const list = chainId
    ? globalTaskRecords.filter(t => String(t.quest_chain_id) === String(chainId))
    : globalTaskRecords;
  list.forEach(t => {
    const kind = t.validation_mode?.startsWith('ai_') ? 'AI 挑戰' : (t.task_type || '一般');
    sel.innerHTML += `<option value="${t.id}">${escHtml(t.name)}｜${kind}</option>`;
  });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
}

// ── 從挑戰格建立關卡後回綁 ───────────────────────────────────
let afterTaskCreateHook = null;
let pendingTileFormSnapshot = null;

function snapshotTileForm() {
  const f = document.getElementById('tileForm');
  if (!f) return null;
  const loc = document.getElementById('tileLocationToggle');
  return {
    id: f.id.value,
    board_map_id: f.board_map_id.value,
    task_id: document.getElementById('tileTaskId').value,
    tile_type: f.tile_type.value,
    tile_name: f.tile_name.value,
    tile_index: f.tile_index.value,
    latitude: f.latitude.value,
    longitude: f.longitude.value,
    radius_meters: f.radius_meters.value,
    effect_type: f.effect_type.value,
    effect_value: f.effect_value.value,
    event_title: f.event_title.value,
    event_body: f.event_body.value,
    guide_content: f.guide_content.value,
    is_active: f.is_active.checked,
    locationToggle: loc ? loc.checked : false
  };
}

function restoreTileForm(snap) {
  if (!snap) return;
  const f = document.getElementById('tileForm');
  f.id.value = snap.id || '';
  f.board_map_id.value = snap.board_map_id || '';
  document.getElementById('tileTaskId').value = snap.task_id || '';
  f.tile_type.value = snap.tile_type || 'challenge';
  f.tile_name.value = snap.tile_name || '';
  f.tile_index.value = snap.tile_index || '';
  f.latitude.value = snap.latitude || '';
  f.longitude.value = snap.longitude || '';
  f.radius_meters.value = snap.radius_meters || '';
  f.effect_type.value = snap.effect_type || '';
  f.effect_value.value = snap.effect_value ?? '';
  f.event_title.value = snap.event_title || '';
  f.event_body.value = snap.event_body || '';
  f.guide_content.value = snap.guide_content || '';
  f.is_active.checked = snap.is_active !== false;
  const locToggle = document.getElementById('tileLocationToggle');
  const locFields = document.getElementById('tileLocationFields');
  if (locToggle) locToggle.checked = !!snap.locationToggle;
  if (locFields) locFields.style.display = snap.locationToggle ? 'block' : 'none';
  updateTileFormByType();
}

function openTaskDrawerForBoardChallenge() {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再新增挑戰關卡', 'error');
    return;
  }
  openDrawer('新增關卡（挑戰格）', 'form-task');
  const form = document.getElementById('taskForm');
  document.getElementById('task_quest_chain_id').value = currentQuestChainId || '';
  document.getElementById('task_locked_quest_name').textContent = currentQuestChainTitle || '';
  document.getElementById('taskLockedContext').style.display = 'block';
  document.getElementById('taskPhotoUrl').value = '';
  document.getElementById('taskPhotoPreview').style.display = 'none';
  document.getElementById('taskFormMsg').textContent = '';
  const catSel = document.getElementById('taskCategorySelect');
  catSel.value = 'single';
  catSel.dispatchEvent(new Event('change'));
  const qcSel = document.getElementById('questChainSelect');
  if (qcSel && currentQuestChainId) qcSel.value = currentQuestChainId;
  const bpSel = document.getElementById('taskBlueprintSelect');
  bpSel.value = 'board_ai_identify';
  applyBlueprint('board_ai_identify', false);
  applyTaskStructureLockUi(null, globalQuestChainsMap[String(currentQuestChainId)] || null);
}

function openTaskDrawerFromTileChallenge() {
  pendingTileFormSnapshot = snapshotTileForm();
  afterTaskCreateHook = async newTaskId => {
    const d = await fetch(`${API_BASE}/api/tasks/admin`, {
      headers: { 'x-username': loginUser.username },
      credentials: 'include'
    }).then(r => r.json());
    globalTaskRecords = d.success ? (d.tasks || []) : globalTaskRecords;
    populateTileTaskSelect();
    openDrawer('完成格子設定', 'form-tile', null, { skipReset: true });
    restoreTileForm(pendingTileFormSnapshot);
    pendingTileFormSnapshot = null;
    const ts = document.getElementById('tileTaskSelect');
    const tid = String(newTaskId);
    if (ts && [...ts.options].some(o => o.value === tid)) {
      ts.value = tid;
      document.getElementById('tileTaskId').value = tid;
    }
    updateTileFormByType();
    showToast('已建立關卡並選取，請按儲存完成格子');
  };
  closeDrawer();
  openTaskDrawerForBoardChallenge();
}

function openBoardMapDrawer(isEdit) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再調整大富翁地圖', 'error');
    return;
  }
  const title = isEdit ? '編輯大富翁地圖' : '建立大富翁地圖';
  openDrawer(title, 'form-board-map', null, { skipReset: true });
  const form = document.getElementById('boardMapForm');
  document.getElementById('bm_locked_chain_title').textContent = currentQuestChainTitle || '—';
  document.getElementById('bm_quest_chain_id').value = currentQuestChainId || '';
  document.getElementById('boardMapFormMsg').textContent = '';

  if (isEdit && lastLoadedBoardMap) {
    const bm = lastLoadedBoardMap;
    form.elements.id.value = bm.id;
    form.elements.name.value = bm.name || '';
    form.elements.description.value = bm.description || '';
    form.elements.play_style.value = bm.play_style || 'fixed_track_race';
    form.elements.start_tile.value = bm.start_tile ?? 1;
    form.elements.finish_tile.value = bm.finish_tile ?? 8;
    form.elements.dice_min.value = bm.dice_min ?? 1;
    form.elements.dice_max.value = bm.dice_max ?? 6;
    form.elements.failure_move.value = bm.failure_move ?? -1;
    form.elements.reward_points.value = bm.reward_points ?? 0;
    form.elements.exact_finish_required.checked = !!bm.exact_finish_required;
    form.elements.is_active.checked = bm.is_active !== false && bm.is_active !== 0;
  } else {
    form.reset();
    document.getElementById('bm_locked_chain_title').textContent = currentQuestChainTitle || '—';
    document.getElementById('bm_quest_chain_id').value = currentQuestChainId || '';
    form.elements.id.value = '';
    form.elements.is_active.checked = true;
    form.elements.exact_finish_required.checked = false;
    form.elements.start_tile.value = 1;
    form.elements.finish_tile.value = 8;
    form.elements.dice_min.value = 1;
    form.elements.dice_max.value = 6;
    form.elements.failure_move.value = -1;
    form.elements.reward_points.value = 0;
  }
}

// ── Tile Drawer: Open for create ──────────────────────────────
function openTileDrawerForCreate() {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再新增格子', 'error');
    return;
  }
  openDrawer('新增格子', 'form-tile');
  const form = document.getElementById('tileForm');
  form.reset();
  form.elements.id.value = '';
  form.elements.is_active.checked = true;

  // Auto-lock board map
  if (currentBoardMapId) {
    document.getElementById('tile_board_map_id').value = currentBoardMapId;
    document.getElementById('tile_locked_map_name').textContent = currentBoardMapName;
  }

  // Auto-set next tile index
  const maxIndex = currentBoardTiles.reduce((m, t) => Math.max(m, t.tile_index || 0), 0);
  form.elements.tile_index.value = maxIndex + 1;

  // Reset location toggle
  const locToggle = document.getElementById('tileLocationToggle');
  const locFields = document.getElementById('tileLocationFields');
  if (locToggle) locToggle.checked = false;
  if (locFields) locFields.style.display = 'none';
  document.getElementById('tileFormMsg').textContent = '';

  // Set default type and update form
  document.getElementById('tileTypeSelect').value = 'event';
  updateTileFormByType();
}

// ── Tile Drawer: Open for edit ────────────────────────────────
function editTile(tileId) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再編輯格子', 'error');
    return;
  }
  const tile = currentBoardTiles.find(t => String(t.id) === String(tileId));
  if (!tile) return;

  openDrawer('編輯格子', 'form-tile');
  const form = document.getElementById('tileForm');

  form.elements.id.value = tile.id;
  form.elements.tile_index.value = tile.tile_index;
  form.elements.tile_type.value = tile.tile_type || 'event';
  form.elements.tile_name.value = tile.tile_name || '';
  // Task binding (hidden + select)
  document.getElementById('tileTaskId').value = tile.task_id || '';
  const taskSel = document.getElementById('tileTaskSelect');
  if (taskSel) taskSel.value = tile.task_id || '';
  // Set location toggle
  const hasLocation = !!(tile.latitude && tile.longitude);
  const locToggle = document.getElementById('tileLocationToggle');
  const locFields = document.getElementById('tileLocationFields');
  if (locToggle) locToggle.checked = hasLocation;
  if (locFields) locFields.style.display = hasLocation ? 'block' : 'none';
  form.elements.latitude.value = tile.latitude || '';
  form.elements.longitude.value = tile.longitude || '';
  form.elements.radius_meters.value = tile.radius_meters || '';
  form.elements.effect_type.value = tile.effect_type || '';
  form.elements.effect_value.value = tile.effect_value ?? '';
  form.elements.event_title.value = tile.event_title || '';
  form.elements.event_body.value = tile.event_body || '';
  form.elements.guide_content.value = tile.guide_content || '';
  form.elements.is_active.checked = tile.is_active !== false && tile.is_active !== 0;

  document.getElementById('tile_board_map_id').value = tile.board_map_id || currentBoardMapId;
  document.getElementById('tile_locked_map_name').textContent = currentBoardMapName;

  // Update form sections by type
  updateTileFormByType();

  document.getElementById('tileFormMsg').textContent = '';
}

function duplicateTile(tileId) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再複製格子', 'error');
    return;
  }
  const tile = currentBoardTiles.find(t => String(t.id) === String(tileId));
  if (!tile) return;
  openTileDrawerForCreate();
  const form = document.getElementById('tileForm');
  form.elements.id.value = '';
  form.elements.tile_name.value = `${tile.tile_name || ''}（複製）`.trim();
  form.elements.tile_type.value = tile.tile_type || 'event';
  document.getElementById('tileTaskId').value = tile.task_id || '';
  const taskSel = document.getElementById('tileTaskSelect');
  if (taskSel) taskSel.value = tile.task_id || '';
  const hasLocation = !!(tile.latitude && tile.longitude);
  const locToggle = document.getElementById('tileLocationToggle');
  const locFields = document.getElementById('tileLocationFields');
  if (locToggle) locToggle.checked = hasLocation;
  if (locFields) locFields.style.display = hasLocation ? 'block' : 'none';
  form.elements.latitude.value = tile.latitude || '';
  form.elements.longitude.value = tile.longitude || '';
  form.elements.radius_meters.value = tile.radius_meters || '';
  form.elements.effect_type.value = tile.effect_type || '';
  form.elements.effect_value.value = tile.effect_value ?? '';
  form.elements.event_title.value = tile.event_title || '';
  form.elements.event_body.value = tile.event_body || '';
  form.elements.guide_content.value = tile.guide_content || '';
  form.elements.is_active.checked = true;
  updateTileFormByType();
  document.getElementById('tileFormMsg').textContent = '';
}

// ── Board map form ────────────────────────────────────────────
document.getElementById('boardMapForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const form = this;
  const msg = document.getElementById('boardMapFormMsg');
  msg.textContent = '';
  const mapId = form.elements.id.value;
  const body = {
    quest_chain_id: Number(form.quest_chain_id.value),
    name: form.name.value.trim(),
    description: form.description.value.trim() || null,
    play_style: form.play_style.value || 'fixed_track_race',
    start_tile: Number(form.start_tile.value || 1),
    finish_tile: Number(form.finish_tile.value || 8),
    dice_min: Number(form.dice_min.value || 1),
    dice_max: Number(form.dice_max.value || 6),
    failure_move: Number(form.failure_move.value),
    reward_points: Number(form.reward_points.value || 0),
    exact_finish_required: form.exact_finish_required.checked,
    is_active: form.is_active.checked
  };
  if (!body.quest_chain_id || !body.name) {
    msg.textContent = '請填寫地圖名稱';
    return;
  }
  const url = mapId ? `${API_BASE}/api/board-maps/${mapId}` : `${API_BASE}/api/board-maps`;
  const method = mapId ? 'PUT' : 'POST';
  msg.textContent = '儲存中...';
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    const d = await res.json();
    if (d.success) {
      showToast(mapId ? '地圖已更新' : '地圖已建立');
      closeDrawer();
      if (currentQuestChainId) loadBoardContent(currentQuestChainId);
    } else {
      msg.textContent = d.message || '儲存失敗';
    }
  } catch {
    msg.textContent = '連線失敗';
  }
});

// ── Tile Form Submit ──────────────────────────────────────────
document.getElementById('tileForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.id.value;
  const boardMapId = form.elements.board_map_id.value;
  const msgEl = document.getElementById('tileFormMsg');
  msgEl.textContent = '';

  if (!boardMapId) { msgEl.textContent = '缺少地圖 ID'; return; }

  // Prefer visible select, fall back to hidden field
  const taskIdFromSelect = document.getElementById('tileTaskSelect')?.value;
  const taskIdFromHidden = document.getElementById('tileTaskId')?.value;
  const payload = {
    tile_index: Number(form.elements.tile_index.value),
    tile_name: form.elements.tile_name.value.trim(),
    tile_type: form.elements.tile_type.value,
    task_id: taskIdFromSelect || taskIdFromHidden || null,
    latitude: form.elements.latitude.value || null,
    longitude: form.elements.longitude.value || null,
    radius_meters: form.elements.radius_meters.value || null,
    effect_type: form.elements.effect_type.value || null,
    effect_value: form.elements.effect_value.value || null,
    event_title: form.elements.event_title.value.trim() || null,
    event_body: form.elements.event_body.value.trim() || null,
    guide_content: form.elements.guide_content.value.trim() || null,
    is_active: form.elements.is_active.checked ? 1 : 0
  };

  msgEl.textContent = id ? '更新中...' : '建立中...';
  const url = id ? `${API_BASE}/api/board-tiles/${id}` : `${API_BASE}/api/board-maps/${boardMapId}/tiles`;
  const method = id ? 'PUT' : 'POST';

  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    credentials: 'include',
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast(id ? '格子更新成功' : '格子建立成功');
        closeDrawer();
        if (currentQuestChainId) loadBoardContent(currentQuestChainId);
      } else { msgEl.textContent = d.message || '操作失敗'; }
    })
    .catch(() => { msgEl.textContent = '伺服器連線失敗'; });
});

// ── Delete Tile ───────────────────────────────────────────────
function deleteTile(tileId) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再刪除格子', 'error');
    return;
  }
  showConfirm('確定要刪除這個格子嗎？', () => {
    fetch(`${API_BASE}/api/board-tiles/${tileId}`, {
      method: 'DELETE',
      headers: { 'x-username': loginUser.username },
      credentials: 'include'
    })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          showToast('格子已刪除');
          if (currentQuestChainId) loadBoardContent(currentQuestChainId);
        } else showToast(d.message || '刪除失敗', 'error');
      });
  });
}

// ── Task Drawer: Open for create ──────────────────────────────
function openTaskDrawerForCreate() {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再新增關卡', 'error');
    return;
  }
  openDrawer('新增關卡', 'form-task');
  resetTaskWizard();
  const form = document.getElementById('taskForm');
  if (form.elements.location_required) form.elements.location_required.checked = false;

  // Auto-lock quest chain context
  if (currentQuestChainId) {
    document.getElementById('task_quest_chain_id').value = currentQuestChainId;
    document.getElementById('task_locked_quest_name').textContent = currentQuestChainTitle;
    document.getElementById('taskLockedContext').style.display = 'block';

    if (currentQuestChainMode === 'story_campaign') {
      const catSel = document.getElementById('taskCategorySelect');
      catSel.value = 'quest';
      catSel.dispatchEvent(new Event('change'));

      const qcSel = document.getElementById('questChainSelect');
      if (qcSel) qcSel.value = currentQuestChainId;
    } else if (currentQuestChainMode === 'board_game') {
      const catSel = document.getElementById('taskCategorySelect');
      catSel.value = 'single';
      catSel.dispatchEvent(new Event('change'));
      const qcSel = document.getElementById('questChainSelect');
      if (qcSel && currentQuestChainId) qcSel.value = currentQuestChainId;
    }
  }

  // Reset photo state
  document.getElementById('taskPhotoUrl').value = '';
  document.getElementById('taskPhotoPreview').style.display = 'none';
  document.getElementById('taskFormMsg').textContent = '';

  const bpSel = document.getElementById('taskBlueprintSelect');
  if (currentQuestChainMode === 'board_game') {
    bpSel.value = 'board_ai_identify';
    applyBlueprint('board_ai_identify', false);
  } else {
    bpSel.value = 'story_ai_identify';
    applyBlueprint('story_ai_identify', false);
  }
  syncTaskLocationRequirementUi();
  syncTaskWizardUI();
  applyTaskStructureLockUi(null, globalQuestChainsMap[String(currentQuestChainId)] || null);
}

function populateTaskFormForEdit(t) {
  const form = document.getElementById('taskForm');

  // Fill basic fields
  form.elements.id.value = t.id;
  form.elements.name.value = t.name;
      form.elements.lat.value = t.lat;
      form.elements.lng.value = t.lng;
      form.elements.radius.value = t.radius;
      form.elements.points.value = t.points || 0;
      form.elements.description.value = t.description || '';

      // Photo
      document.getElementById('taskPhotoUrl').value = t.photoUrl || '';
      const preview = document.getElementById('taskPhotoPreview');
      if (t.photoUrl) { preview.src = t.photoUrl; preview.style.display = 'block'; }
      else preview.style.display = 'none';

      // AR media
      const modelSel = document.getElementById('taskArModelSelect');
      if (modelSel) modelSel.value = t.ar_model_id || '';
      form.elements.ar_order_model.value = t.ar_order_model || '';
      form.elements.ar_order_image.value = t.ar_order_image || '';
      form.elements.ar_order_youtube.value = t.ar_order_youtube || '';
      form.elements.youtubeUrl.value = t.youtubeUrl || '';
      document.getElementById('taskArImageUrl').value = t.ar_image_url || '';

      // BGM
      const bgmInput = document.getElementById('bgmUrlInput');
      if (bgmInput) bgmInput.value = t.bgm_url || '';
      const bgmPreview = document.getElementById('bgmPreview');
      const bgmAudio = document.getElementById('bgmPreviewAudio');
      if (t.bgm_url && bgmPreview && bgmAudio) {
        bgmPreview.style.display = 'block';
        bgmAudio.src = t.bgm_url;
      } else if (bgmPreview) {
        bgmPreview.style.display = 'none';
      }

      // Category
      const catSel = document.getElementById('taskCategorySelect');
      catSel.value = t.type || 'single';
      catSel.dispatchEvent(new Event('change'));

      // Quest fields
      if (t.type === 'quest') {
        const qcSel = document.getElementById('questChainSelect');
        if (qcSel) qcSel.value = t.quest_chain_id || '';
        form.elements.quest_order.value = t.quest_order || 1;
        if (form.elements.is_final_step) form.elements.is_final_step.checked = !!t.is_final_step;
      }

      // Timed fields
      if (t.type === 'timed') {
        const fmt = iso => iso ? new Date(iso).toISOString().slice(0, 16) : '';
        form.elements.time_limit_start.value = fmt(t.time_limit_start);
        form.elements.time_limit_end.value = fmt(t.time_limit_end);
        form.elements.max_participants.value = t.max_participants || 0;
      }

      // Task type
      const typeSel = document.getElementById('taskTypeSelect');
      typeSel.value = t.task_type || 'qa';
      typeSel.dispatchEvent(new Event('change'));

      // Multiple choice
      if (t.task_type === 'multiple_choice' && t.options) {
        const opts = typeof t.options === 'string' ? JSON.parse(t.options) : t.options;
        if (Array.isArray(opts) && opts.length >= 4) {
          form.elements.optionA.value = opts[0];
          form.elements.optionB.value = opts[1];
          form.elements.optionC.value = opts[2];
          form.elements.optionD.value = opts[3];
          if (t.correct_answer === opts[0]) form.elements.correct_answer_select.value = 'A';
          else if (t.correct_answer === opts[1]) form.elements.correct_answer_select.value = 'B';
          else if (t.correct_answer === opts[2]) form.elements.correct_answer_select.value = 'C';
          else if (t.correct_answer === opts[3]) form.elements.correct_answer_select.value = 'D';
        }
      } else if (t.task_type === 'number' || t.task_type === 'keyword') {
        form.elements.correct_answer_text.value = t.correct_answer || '';
      }

      // Validation mode
      const valSel = document.getElementById('validationModeSelect');
      const normalizedValidationMode = t.validation_mode === 'manual'
        ? (t.task_type === 'photo' ? 'ai_rule_check' : (t.task_type === 'qa' ? 'ai_text_check' : 'auto'))
        : (t.validation_mode || 'auto');
      valSel.value = normalizedValidationMode;
      valSel.dispatchEvent(new Event('change'));

      // AI fields
      const aiConfig = t.ai_config || {};
      const passCriteria = t.pass_criteria || {};
      form.elements.ai_target_label.value = aiConfig.target_label || passCriteria.target_label || '';
      form.elements.ai_target_count.value = passCriteria.target_count || '';
      form.elements.ai_min_score.value = passCriteria.min_score || '';
      form.elements.ai_min_confidence.value = passCriteria.min_confidence || '';
      form.elements.ai_system_prompt.value = aiConfig.system_prompt || '';
      form.elements.ai_user_prompt.value = aiConfig.user_prompt || '';
      form.elements.failure_message.value = t.failure_message || '';
      form.elements.success_message.value = t.success_message || '';
      form.elements.max_attempts.value = t.max_attempts || '';
      if (form.elements.location_required) form.elements.location_required.checked = !!t.location_required;
      syncTaskLocationRequirementUi();

      // Items
      const reqItemSel = form.querySelector('select[name="required_item_id"]');
      const rewItemSel = form.querySelector('select[name="reward_item_id"]');
      if (reqItemSel) reqItemSel.value = t.required_item_id || '';
      if (rewItemSel) rewItemSel.value = t.reward_item_id || '';

      // Lock context
      const chainId = t.quest_chain_id || currentQuestChainId;
      if (chainId) {
        document.getElementById('task_quest_chain_id').value = chainId;
        const chain = globalQuestChainsMap[chainId];
        document.getElementById('task_locked_quest_name').textContent = chain ? chain.title : `ID: ${chainId}`;
        document.getElementById('taskLockedContext').style.display = 'block';
      }

  // Blueprint
  const bp = inferBlueprintFromTask(t);
  document.getElementById('taskBlueprintSelect').value = bp;
  applyBlueprint(bp, true);

  document.getElementById('taskFormMsg').textContent = '';
  const chain = globalQuestChainsMap[String(t.quest_chain_id || currentQuestChainId)] || null;
  applyTaskStructureLockUi(t, chain);
}

function editTask(taskId) {
  fetch(`${API_BASE}/api/tasks/${taskId}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      openDrawer('編輯關卡', 'form-task');
      resetTaskWizard();
      populateTaskFormForEdit(data.task);
      syncTaskWizardUI();
    });
}

function duplicateTask(taskId) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再複製關卡', 'error');
    return;
  }
  fetch(`${API_BASE}/api/tasks/${taskId}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        showToast('無法載入關卡', 'error');
        return;
      }
      openDrawer('複製關卡', 'form-task');
      resetTaskWizard();
      populateTaskFormForEdit(data.task);
      const form = document.getElementById('taskForm');
      form.elements.id.value = '';
      form.elements.name.value = `${data.task.name || ''}（複製）`.trim();
      const photoIn = document.getElementById('taskPhotoInput');
      if (photoIn) photoIn.value = '';
      document.getElementById('taskFormMsg').textContent = '';
      syncTaskLocationRequirementUi();
      syncTaskWizardUI();
      applyTaskStructureLockUi(null, globalQuestChainsMap[String(currentQuestChainId)] || null);
    });
}

// ── Task Form Submit (Create or Update) ───────────────────────
document.getElementById('taskForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.id.value;
  const msgEl = document.getElementById('taskFormMsg');
  msgEl.textContent = '';

  const aiPayload = buildAiTaskPayload(form);
  const task_type = IMAGE_AI_VALIDATION_MODES.includes(aiPayload.validation_mode) ? 'photo' : form.elements.task_type.value;

  // Validate
  if (!validateAiPayload(form, aiPayload, msgEl)) return;

  // Multiple choice / standard answer
  let options = null;
  let correct_answer = null;
  if (task_type === 'multiple_choice') {
    const optA = form.optionA.value.trim();
    const optB = form.optionB.value.trim();
    const optC = form.optionC.value.trim();
    const optD = form.optionD.value.trim();
    if (!optA || !optB || !optC || !optD) { msgEl.textContent = '請填寫所有選項'; return; }
    options = [optA, optB, optC, optD];
    const sel = form.correct_answer_select.value;
    correct_answer = sel === 'A' ? optA : sel === 'B' ? optB : sel === 'C' ? optC : optD;
  } else if (task_type === 'number' || task_type === 'keyword') {
    correct_answer = form.correct_answer_text.value.trim();
    if (!correct_answer) { msgEl.textContent = '請輸入標準答案'; return; }
  }

  // Quest chain id: prefer locked context, then form select
  const quest_chain_id = form.elements.quest_chain_id?.value
    || document.getElementById('questChainSelect')?.value || null;

  try {
    // Upload photo if new file
    let photoUrl = document.getElementById('taskPhotoUrl').value;
    const photoFile = form.photo?.files[0];

    if (!id && !photoFile && !photoUrl) { msgEl.textContent = '請選擇封面圖或保留複製的封面網址'; return; }

    if (photoFile) {
      if (photoFile.size > 5 * 1024 * 1024) { msgEl.textContent = '圖片超過 5MB'; return; }
      msgEl.textContent = '封面圖上傳中...';
      const fd = new FormData();
      fd.append('photo', photoFile);
      const uploadRes = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST', headers: { 'x-username': loginUser.username }, body: fd
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) { msgEl.textContent = uploadData.message || '圖片上傳失敗'; return; }
      photoUrl = uploadData.url;
    }

    // Upload AR image if provided
    let arImageUrl = document.getElementById('taskArImageUrl').value || null;
    const arImageFile = form.arImage?.files[0];
    if (arImageFile) {
      msgEl.textContent = '場景圖上傳中...';
      const arFd = new FormData();
      arFd.append('photo', arImageFile);
      const arRes = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST', headers: { 'x-username': loginUser.username }, body: arFd
      });
      const arData = await arRes.json();
      if (arData.success) arImageUrl = arData.url;
    }

    // Upload BGM if provided
    let bgmUrl = form.bgm_url?.value.trim() || null;
    const bgmFile = form.bgmFile?.files[0];
    if (bgmFile) {
      msgEl.textContent = '音樂上傳中...';
      bgmUrl = await uploadBgmWithProgress(bgmFile);
    }

    // Build payload
    const payload = {
      name: form.name.value.trim(),
      lat: form.lat.value,
      lng: form.lng.value,
      radius: form.radius.value,
      points: form.points.value,
      description: form.description.value.trim(),
      photoUrl,
      youtubeUrl: form.youtubeUrl.value.trim() || null,
      ar_image_url: arImageUrl,
      ar_model_id: form.ar_model_id?.value || null,
      ar_order_model: form.ar_order_model.value || null,
      ar_order_image: form.ar_order_image.value || null,
      ar_order_youtube: form.ar_order_youtube.value || null,
      task_type,
      options,
      correct_answer,
      ...aiPayload,
      type: form.type.value,
      quest_chain_id,
      quest_order: form.quest_order?.value || null,
      time_limit_start: form.time_limit_start?.value || null,
      time_limit_end: form.time_limit_end?.value || null,
      max_participants: form.max_participants?.value || null,
      is_final_step: form.is_final_step?.checked || false,
      required_item_id: form.required_item_id?.value || null,
      reward_item_id: form.reward_item_id?.value || null,
      bgm_url: bgmUrl
    };

    msgEl.textContent = id ? '更新中...' : '建立中...';
    const url = id ? `${API_BASE}/api/tasks/${id}` : `${API_BASE}/api/tasks`;
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      if (!id && result.id && typeof afterTaskCreateHook === 'function') {
        const hook = afterTaskCreateHook;
        afterTaskCreateHook = null;
        await hook(result.id);
        msgEl.textContent = '';
        return;
      }
      showToast(id ? '關卡更新成功' : '關卡建立成功');
      closeDrawer();
      if (currentQuestChainId) {
        if (currentQuestChainMode === 'board_game') loadBoardContent(currentQuestChainId);
        else loadTasksForQuest(currentQuestChainId);
      }
    } else {
      msgEl.textContent = result.message || '操作失敗';
    }
  } catch (err) {
    console.error(err);
    msgEl.textContent = '伺服器連線失敗';
  }
});

// ── BGM Upload with progress ──────────────────────────────────
function uploadBgmWithProgress(file) {
  return new Promise((resolve, reject) => {
    const progressContainer = document.getElementById('bgmUploadProgress');
    const progressBar = document.getElementById('bgmUploadProgressBar');
    const percentText = document.getElementById('bgmUploadPercent');

    if (progressContainer) {
      progressContainer.style.display = 'block';
      progressBar.style.width = '0%';
      percentText.textContent = '0%';
    }

    const fd = new FormData();
    fd.append('audio', file);
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable && progressContainer) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = pct + '%';
        percentText.textContent = pct + '%';
      }
    });

    xhr.addEventListener('load', () => {
      if (progressContainer) progressContainer.style.display = 'none';
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success) resolve(data.url);
          else reject(new Error(data.message || '上傳失敗'));
        } catch { reject(new Error('解析回應失敗')); }
      } else { reject(new Error('HTTP ' + xhr.status)); }
    });

    xhr.addEventListener('error', () => {
      if (progressContainer) progressContainer.style.display = 'none';
      reject(new Error('網路失敗'));
    });

    xhr.open('POST', `${API_BASE}/api/upload-audio`);
    xhr.setRequestHeader('x-username', loginUser.username);
    xhr.withCredentials = true;
    xhr.send(fd);
  });
}

// ── Photo preview ─────────────────────────────────────────────
const taskPhotoInput = document.getElementById('taskPhotoInput');
if (taskPhotoInput) {
  taskPhotoInput.addEventListener('change', function () {
    const file = this.files[0];
    const preview = document.getElementById('taskPhotoPreview');
    if (file) {
      const r = new FileReader();
      r.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
      r.readAsDataURL(file);
    }
  });
}

wireLatLngPaste(
  document.getElementById('taskLatLngPaste'),
  document.getElementById('taskLatInput'),
  document.getElementById('taskLngInput')
);
wireLatLngPaste(
  document.getElementById('tileLatLngPaste'),
  document.getElementById('tileLatInput'),
  document.getElementById('tileLngInput')
);

// BGM manual preview
const bgmUrlInputEl = document.getElementById('bgmUrlInput');
if (bgmUrlInputEl) {
  bgmUrlInputEl.addEventListener('input', () => {
    const preview = document.getElementById('bgmPreview');
    const audio = document.getElementById('bgmPreviewAudio');
    if (bgmUrlInputEl.value.trim()) {
      preview.style.display = 'block';
      audio.src = bgmUrlInputEl.value.trim();
    } else {
      preview.style.display = 'none';
    }
  });
}

// BGM upload button
const uploadBgmBtnEl = document.getElementById('uploadBgmBtn');
const taskBgmLibrarySelectEl = document.getElementById('taskBgmLibrarySelect');
if (taskBgmLibrarySelectEl) {
  taskBgmLibrarySelectEl.addEventListener('change', () => {
    const v = taskBgmLibrarySelectEl.value.trim();
    if (!v) return;
    const inp = document.getElementById('bgmUrlInput');
    if (inp) {
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    taskBgmLibrarySelectEl.value = '';
  });
}

if (uploadBgmBtnEl) {
  uploadBgmBtnEl.addEventListener('click', async () => {
    const fileInput = document.getElementById('bgmFileInput');
    if (!fileInput.files[0]) { alert('請先選擇音樂檔'); return; }
    uploadBgmBtnEl.disabled = true;
    uploadBgmBtnEl.textContent = '上傳中...';
    try {
      const url = await uploadBgmWithProgress(fileInput.files[0]);
      document.getElementById('bgmUrlInput').value = url;
      const preview = document.getElementById('bgmPreview');
      const audio = document.getElementById('bgmPreviewAudio');
      preview.style.display = 'block';
      audio.src = url;
      showToast('音樂上傳成功');
    } catch (err) {
      showToast('音樂上傳失敗: ' + err.message, 'error');
    }
    uploadBgmBtnEl.disabled = false;
    uploadBgmBtnEl.textContent = '上傳';
  });
}

// ── Delete Task ───────────────────────────────────────────────
function deleteTask(taskId) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再刪除關卡', 'error');
    return;
  }
  if (!confirm('確定要刪除這個關卡嗎？')) return;
  fetch(`${API_BASE}/api/tasks/${taskId}`, {
    method: 'DELETE', headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast('已刪除');
        if (currentQuestChainId) {
          if (currentQuestChainMode === 'board_game') loadBoardContent(currentQuestChainId);
          else loadTasksForQuest(currentQuestChainId);
        }
      } else showToast(d.message || '刪除失敗', 'error');
    });
}

// ── Load AR Models ────────────────────────────────────────────
function loadARModels() {
  return fetch(`${API_BASE}/api/ar-models`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      globalModelsMap = {};
      data.models.forEach(m => { globalModelsMap[m.id] = m; });

      // Update task form model selects
      document.querySelectorAll('select[name="ar_model_id"]').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = '<option value="">-- 選填 --</option>';
        data.models.forEach(m => { sel.innerHTML += `<option value="${m.id}">${escHtml(m.name)}</option>`; });
        sel.value = cur;
      });

      // Update item form model URL selects
      document.querySelectorAll('.ar-model-url-select').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = '<option value="">-- 無 --</option>';
        data.models.forEach(m => { sel.innerHTML += `<option value="${m.url}">${escHtml(m.name)}</option>`; });
        sel.value = cur;
      });

      // Render model list in assets view
      renderModelList(data.models);
    })
    .catch(() => {});
}

function renderModelList(models) {
  const container = document.getElementById('modelListContainer');
  if (!container) return;
  if (!models.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧊</div>尚無模型</div>';
    return;
  }
  container.innerHTML = models.map(m => `
    <div style="background:white; padding:14px; border-radius:10px; border:1px solid #e2e8f0;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <span style="font-size:1.3rem;">🧊</span>
        <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(m.name)}</div>
      </div>
      <div style="font-size:0.8rem; color:#64748b;">Scale: ${m.scale || 1.0}</div>
      <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:8px;">
        <a href="${escHtml(m.url)}" target="_blank" class="btn-sm btn-secondary-v2" style="text-decoration:none; font-size:0.8rem;">下載</a>
        <button class="btn-sm btn-danger-v2" onclick="deleteModel('${m.id}')" style="font-size:0.8rem;">刪除</button>
      </div>
    </div>
  `).join('');
}

function deleteModel(id) {
  if (!confirm('確定要刪除這個模型嗎？')) return;
  fetch(`${API_BASE}/api/ar-models/${id}`, {
    method: 'DELETE', headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) { showToast('模型已刪除'); loadARModels(); }
      else showToast(d.message || '刪除失敗', 'error');
    });
}

function copyBgmAssetUrl(url) {
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => showToast('已複製音樂 URL')).catch(() => showToast('複製失敗', 'error'));
}

function populateTaskBgmLibrarySelect() {
  const sel = document.getElementById('taskBgmLibrarySelect');
  if (!sel) return;
  const assets = Object.values(globalBgmLibraryMap).sort((a, b) => b.id - a.id);
  sel.innerHTML = '<option value="">— 從共用素材庫選擇背景音樂 —</option>';
  assets.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.url;
    opt.textContent = b.name;
    sel.appendChild(opt);
  });
}

function renderBgmList(assets) {
  const container = document.getElementById('bgmListContainer');
  if (!container) return;
  if (!assets.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎵</div>尚無背景音樂，點右上角上傳</div>';
    return;
  }
  container.innerHTML = assets.map(b => `
    <div style="background:white; padding:14px; border-radius:10px; border:1px solid #e2e8f0;">
      <div style="font-weight:600; margin-bottom:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(b.name)}</div>
      <audio controls preload="none" src="${escHtml(b.url)}" style="width:100%; margin:8px 0;"></audio>
      <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end;">
        <button type="button" class="btn-sm btn-secondary-v2" onclick="copyBgmAssetUrl(${JSON.stringify(b.url)})" style="font-size:0.8rem;">複製 URL</button>
        <button type="button" class="btn-sm btn-danger-v2" onclick="deleteBgmAsset(${b.id})" style="font-size:0.8rem;">刪除</button>
      </div>
    </div>
  `).join('');
}

function deleteBgmAsset(id) {
  if (!confirm('確定從素材庫移除此音樂？（若關卡仍使用此 URL，請先改關卡設定）')) return;
  fetch(`${API_BASE}/api/bgm-assets/${id}`, {
    method: 'DELETE',
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) { showToast('已刪除'); loadBgmAssets(); }
      else showToast(d.message || '刪除失敗', 'error');
    });
}

function loadBgmAssets() {
  if (loginUser.role !== 'admin') return Promise.resolve();
  return fetch(`${API_BASE}/api/bgm-assets`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      globalBgmLibraryMap = {};
      (data.assets || []).forEach(b => { globalBgmLibraryMap[b.id] = b; });
      renderBgmList(data.assets || []);
      populateTaskBgmLibrarySelect();
    })
    .catch(() => {});
}

// BGM 素材庫上傳
document.getElementById('bgmAssetForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const form = this;
  const msg = document.getElementById('bgmAssetFormMsg');
  const fileInput = form.querySelector('input[type="file"][name="audioFile"]');
  const file = fileInput?.files?.[0];
  if (!file) {
    msg.textContent = '請選擇音檔';
    return;
  }
  msg.textContent = '上傳中...';
  const fd = new FormData();
  fd.append('name', form.name.value.trim());
  fd.append('audio', file);
  fetch(`${API_BASE}/api/bgm-assets`, {
    method: 'POST',
    headers: { 'x-username': loginUser.username },
    credentials: 'include',
    body: fd
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast('背景音樂已加入素材庫');
        closeDrawer();
        msg.textContent = '';
        form.reset();
        loadBgmAssets();
      } else {
        msg.textContent = d.message || '上傳失敗';
      }
    })
    .catch(() => { msg.textContent = '連線失敗'; });
});

// Asset upload form
document.getElementById('assetForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const form = this;
  const msg = document.getElementById('assetFormMsg');
  msg.textContent = '上傳中...';

  const fd = new FormData();
  fd.append('name', form.name.value.trim());
  fd.append('scale', form.scale.value);
  if (form.modelFile.files[0]) fd.append('model', form.modelFile.files[0]);

  fetch(`${API_BASE}/api/ar-models`, {
    method: 'POST', headers: { 'x-username': loginUser.username }, body: fd
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast('上傳成功');
        closeDrawer();
        msg.textContent = '';
        loadARModels();
      } else { msg.textContent = d.message || '上傳失敗'; }
    })
    .catch(() => { msg.textContent = '上傳失敗'; });
});

// Item form submit
document.getElementById('itemForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.id.value;
  const msgEl = document.getElementById('itemFormMsg');
  msgEl.textContent = '';

  const fd = new FormData();
  fd.append('name', form.name.value.trim());
  fd.append('description', form.description.value.trim());
  fd.append('model_url', form.model_url?.value || '');

  const imageFile = form.image?.files[0];
  if (imageFile) {
    fd.append('image', imageFile);
  } else if (id) {
    fd.append('image_url', document.getElementById('itemImageUrl').value);
  }

  const url = id ? `${API_BASE}/api/items/${id}` : `${API_BASE}/api/items`;
  const method = id ? 'PUT' : 'POST';

  fetch(url, { method, headers: { 'x-username': loginUser.username }, body: fd })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast(id ? '道具更新成功' : '道具新增成功');
        closeDrawer();
        loadItems();
      } else { msgEl.textContent = d.message || '操作失敗'; }
    })
    .catch(() => { msgEl.textContent = '伺服器連線失敗'; });
});

// Item image preview
const itemImageInput = document.getElementById('itemImageInput');
if (itemImageInput) {
  itemImageInput.addEventListener('change', function() {
    const file = this.files[0];
    const preview = document.getElementById('itemImagePreview');
    if (file) {
      const r = new FileReader();
      r.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
      r.readAsDataURL(file);
    }
  });
}

// ── Load Items ────────────────────────────────────────────────
function loadItems() {
  return fetch(`${API_BASE}/api/items`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      globalItemsMap = {};
      data.items.forEach(item => { globalItemsMap[item.id] = item; });

      // Update item selects in task form
      document.querySelectorAll('.item-select').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = '<option value="">-- 無 --</option>';
        data.items.forEach(item => {
          sel.innerHTML += `<option value="${item.id}">${escHtml(item.name)}</option>`;
        });
        sel.value = cur;
      });

      // Render items in assets view
      renderItemList(data.items);
    })
    .catch(() => {});
}

function renderItemList(items) {
  const container = document.getElementById('itemListContainer');
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎒</div>尚無道具，點右上角新增</div>';
    return;
  }
  container.innerHTML = items.map(item => `
    <div style="background:white; padding:14px; border-radius:10px; border:1px solid #e2e8f0;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        ${item.image_url ? `<img src="${escHtml(item.image_url)}" style="width:40px; height:40px; object-fit:contain; border-radius:6px;">` : '<span style="font-size:1.5rem;">🎒</span>'}
        <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(item.name)}</div>
      </div>
      <div style="font-size:0.82rem; color:#64748b; margin-bottom:8px;">${escHtml(item.description || '無描述')}</div>
      <div style="display:flex; gap:6px; justify-content:flex-end;">
        <button class="btn-sm btn-secondary-v2" onclick="editItem('${item.id}')" style="font-size:0.8rem;">編輯</button>
        <button class="btn-sm btn-danger-v2" onclick="deleteItem('${item.id}')" style="font-size:0.8rem;">刪除</button>
      </div>
    </div>
  `).join('');
}

function editItem(id) {
  const item = globalItemsMap[id];
  if (!item) return;
  openDrawer('編輯道具', 'form-item');
  const form = document.getElementById('itemForm');
  form.elements.id.value = item.id;
  form.elements.name.value = item.name;
  form.elements.description.value = item.description || '';
  document.getElementById('itemImageUrl').value = item.image_url || '';
  const preview = document.getElementById('itemImagePreview');
  if (item.image_url) { preview.src = item.image_url; preview.style.display = 'block'; }
  else preview.style.display = 'none';
  const modelSel = form.querySelector('.ar-model-url-select');
  if (modelSel) modelSel.value = item.model_url || '';
}

function deleteItem(id) {
  if (!confirm('確定要刪除這個道具嗎？')) return;
  fetch(`${API_BASE}/api/items/${id}`, {
    method: 'DELETE', headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) { showToast('道具已刪除'); loadItems(); }
      else showToast(d.message || '刪除失敗', 'error');
    });
}

// ── Asset Tabs ────────────────────────────────────────────────
function switchAssetTab(tab, el) {
  document.querySelectorAll('.asset-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.asset-section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('assetSection-' + tab).classList.add('active');

  // Toggle action buttons
  document.getElementById('btnAssetAdd').style.display = tab === 'models' ? 'inline-flex' : 'none';
  document.getElementById('btnItemAdd').style.display = tab === 'items' ? 'inline-flex' : 'none';
  const btnBgm = document.getElementById('btnBgmAdd');
  if (btnBgm) {
    btnBgm.style.display = tab === 'bgm' && loginUser.role === 'admin' ? 'inline-flex' : 'none';
  }
  const btnNpc = document.getElementById('btnNpcAdd');
  if (btnNpc) {
    btnNpc.style.display = tab === 'npc' && loginUser.role === 'admin' ? 'inline-flex' : 'none';
  }
  if (tab === 'npc') loadNpcs();
  if (tab === 'bgm') loadBgmAssets();
}

let globalNpcs = [];

function loadNpcs() {
  const container = document.getElementById('npcListContainer');
  if (!container) return;
  fetch(`${API_BASE}/api/game-npcs`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        container.innerHTML = '<div class="empty-state">載入 NPC 失敗</div>';
        return;
      }
      globalNpcs = data.npcs || [];
      renderNpcList(globalNpcs);
    })
    .catch(() => {
      container.innerHTML = '<div class="empty-state">載入失敗</div>';
    });
}

function renderNpcList(npcs) {
  const container = document.getElementById('npcListContainer');
  if (!container) return;
  if (!npcs.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎭</div>尚無 NPC</div>';
    return;
  }
  const isAdmin = loginUser.role === 'admin';
  container.innerHTML = npcs.map(n => `
    <div style="background:white; padding:16px; border-radius:10px; border:1px solid #e2e8f0; text-align:center;">
      <div style="font-size:3rem; margin-bottom:8px;">${escHtml(n.portrait_emoji || '🧭')}</div>
      <div style="font-weight:600;">${escHtml(n.display_name)}</div>
      <div style="font-size:0.82rem; color:#64748b;">${escHtml(n.npc_key)}</div>
      ${n.role_line ? `<div style="font-size:0.82rem; color:#94a3b8; margin-top:6px;">${escHtml(n.role_line)}</div>` : ''}
      ${isAdmin ? `<div style="display:flex; gap:6px; justify-content:center; margin-top:10px; flex-wrap:wrap;">
        <button type="button" class="btn-sm btn-secondary-v2" onclick="openNpcDrawer(true, '${n.id}')">編輯</button>
        <button type="button" class="btn-sm btn-danger-v2" onclick="deleteNpc('${n.id}')">刪除</button>
      </div>` : ''}
    </div>
  `).join('');
}

function openNpcDrawer(isEdit, npcId) {
  openDrawer(isEdit ? '編輯 NPC' : '新增 NPC', 'form-npc');
  const form = document.getElementById('npcForm');
  const msg = document.getElementById('npcFormMsg');
  const keyInput = document.getElementById('npc_key_input');
  msg.textContent = '';

  if (isEdit && npcId != null) {
    const n = globalNpcs.find(x => String(x.id) === String(npcId));
    if (!n) return;
    document.getElementById('npc_form_id').value = n.id;
    keyInput.value = n.npc_key;
    keyInput.readOnly = true;
    keyInput.removeAttribute('required');
    form.display_name.value = n.display_name || '';
    form.portrait_emoji.value = n.portrait_emoji || '';
    form.role_line.value = n.role_line || '';
    form.description.value = n.description || '';
    form.sort_order.value = n.sort_order ?? 0;
  } else {
    form.reset();
    document.getElementById('npc_form_id').value = '';
    keyInput.readOnly = false;
    keyInput.setAttribute('required', 'required');
    keyInput.value = '';
    form.sort_order.value = 0;
    form.portrait_emoji.value = '🧭';
  }
}

function deleteNpc(id) {
  showConfirm('確定刪除此 NPC？若遊戲劇本仍引用該 npc_key，前端可能無法對應角色。', () => {
    fetch(`${API_BASE}/api/game-npcs/${id}`, {
      method: 'DELETE',
      headers: { 'x-username': loginUser.username },
      credentials: 'include'
    })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          showToast('已刪除');
          loadNpcs();
        } else showToast(d.message || '刪除失敗', 'error');
      });
  });
}

document.getElementById('npcForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const form = this;
  const msg = document.getElementById('npcFormMsg');
  msg.textContent = '';
  const fid = document.getElementById('npc_form_id').value;
  const headers = { 'Content-Type': 'application/json', 'x-username': loginUser.username };

  try {
    if (fid) {
      const body = {
        display_name: form.display_name.value.trim(),
        portrait_emoji: form.portrait_emoji.value.trim(),
        role_line: form.role_line.value.trim(),
        description: form.description.value.trim(),
        sort_order: Number(form.sort_order.value) || 0
      };
      const res = await fetch(`${API_BASE}/api/game-npcs/${fid}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const d = await res.json();
      if (d.success) {
        showToast('NPC 已更新');
        closeDrawer();
        loadNpcs();
      } else msg.textContent = d.message || '更新失敗';
    } else {
      const body = {
        npc_key: form.npc_key.value.trim(),
        display_name: form.display_name.value.trim(),
        portrait_emoji: form.portrait_emoji.value.trim() || '🧭',
        role_line: form.role_line.value.trim(),
        description: form.description.value.trim(),
        sort_order: Number(form.sort_order.value) || 0
      };
      const res = await fetch(`${API_BASE}/api/game-npcs`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const d = await res.json();
      if (d.success) {
        showToast('NPC 已建立');
        closeDrawer();
        loadNpcs();
      } else msg.textContent = d.message || '建立失敗';
    }
  } catch {
    msg.textContent = '連線失敗';
  }
});

// ── RBAC Sidebar Control ──────────────────────────────────────
function applySidebarRBAC() {
  const role = loginUser?.role || '';
  document.querySelectorAll('.v2-nav-item[data-roles]').forEach(item => {
    const allowed = item.dataset.roles.split(',');
    item.style.display = allowed.includes(role) ? 'flex' : 'none';
  });
  // Hide section labels if all items below are hidden
  document.querySelectorAll('.v2-sidebar-label').forEach(label => {
    let next = label.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('v2-sidebar-label')) {
      if (next.style.display !== 'none') hasVisible = true;
      next = next.nextElementSibling;
    }
    label.style.display = hasVisible ? 'block' : 'none';
  });
  // Hide create account section for shop role
  const createSection = document.getElementById('roleSection_createAccount');
  if (createSection) createSection.style.display = role === 'admin' ? 'block' : 'none';
  const assignSection = document.getElementById('roleSection_assignStaff');
  if (assignSection) assignSection.style.display = role === 'admin' ? 'block' : 'none';
  const subtitle = document.getElementById('rolesViewSubtitle');
  if (subtitle) {
    subtitle.textContent = role === 'admin'
      ? '僅限平台管理員。管理後台帳號與 staff 指派規則。'
      : '此頁僅保留帳號安全設定；商店與會員管理由平台管理員統一處理。';
  }
}

function hydrateLoginHeader() {
  const info = document.getElementById('loginUserInfo');
  const roles = { admin: '平台管理員', shop: '建置廠商', staff: '廠商員工', user: '玩家' };
  if (info && loginUser) {
    info.textContent = `${roles[loginUser.role] || ''}：${loginUser.username}`;
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.style.display = loginUser ? 'inline-block' : 'none';
    logoutBtn.onclick = async () => {
      try {
        await apiJson(`${API_BASE}/api/logout`, { method: 'POST' });
      } catch (error) {
        // ignore logout API errors; local cleanup below is sufficient
      }
      localStorage.removeItem('loginUser');
      window.location.href = '/login.html';
    };
  }
}

async function bootstrapSession() {
  try {
    initializeTaskWizardDOM();
    syncDrawerFooter();
    const billingMonthInput = document.getElementById('billingMonthInput');
    if (billingMonthInput && !billingMonthInput.value) {
      billingMonthInput.value = getDefaultBillingMonth();
    }
    if (billingMonthInput && !billingMonthInput.dataset.bound) {
      billingMonthInput.dataset.bound = '1';
      billingMonthInput.addEventListener('change', () => {
        if (document.getElementById('view-billing')?.classList.contains('active')) {
          loadBillingDashboard();
        }
      });
    }
    const billingScopeSelect = document.getElementById('billingDailyScopeSelect');
    if (billingScopeSelect && !billingScopeSelect.dataset.bound) {
      billingScopeSelect.dataset.bound = '1';
      billingScopeSelect.addEventListener('change', (event) => {
        currentBillingDailyScope = event.target.value || 'platform';
        renderBillingDailyCharts(currentBillingDailyData);
      });
    }
    const data = await apiJson(`${API_BASE}/api/me`);
    loginUser = data.user;
    window.loginUser = data.user;
    localStorage.setItem('loginUser', JSON.stringify(data.user));
    hydrateLoginHeader();
    applySidebarRBAC();
    selectInitialStaffView();

    const role = loginUser?.role || '';
    const initLoads = [];
    if (['admin', 'shop', 'staff'].includes(role)) {
      initLoads.push(loadShops(), loadEntryPlans(), loadQuestChains(), loadItems(), loadARModels(), loadBgmAssets());
      if (role === 'admin' || role === 'shop') {
        initLoads.push(loadProducts());
      }
    } else {
      throw new Error('僅限管理員、商店或工作人員使用');
    }

    await Promise.all(initLoads);
  } catch (error) {
    alert(error.message || '請先以管理員或工作人員登入內容控制台');
    localStorage.removeItem('loginUser');
    window.location.href = '/login.html';
  }
}

// ── Mobile Sidebar Toggle ─────────────────────────────────────
const sidebarToggle = document.getElementById('sidebarToggle');
const mainSidebar = document.getElementById('mainSidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
if (sidebarToggle && mainSidebar) {
  sidebarToggle.addEventListener('click', () => {
    mainSidebar.classList.toggle('mobile-open');
    sidebarBackdrop.classList.toggle('open');
  });
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', () => {
      mainSidebar.classList.remove('mobile-open');
      sidebarBackdrop.classList.remove('open');
    });
  }
  // Close sidebar on nav click (mobile)
  document.querySelectorAll('.v2-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      mainSidebar.classList.remove('mobile-open');
      sidebarBackdrop.classList.remove('open');
    });
  });
}

// ── Confirm Dialog ────────────────────────────────────────────
let confirmCallback = null;
function showConfirm(msg, onOk) {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmDialog').style.display = 'block';
  confirmCallback = onOk;
}
function closeConfirm() {
  document.getElementById('confirmDialog').style.display = 'none';
  confirmCallback = null;
}
document.getElementById('confirmOkBtn').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  closeConfirm();
});

// ── Products ──────────────────────────────────────────────────
let globalProducts = [];
let lastProductsAdminRole = null;

function loadProducts() {
  return fetch(`${API_BASE}/api/products/admin`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      globalProducts = data.products || [];
      lastProductsAdminRole = data.userRole || null;
      const banner = document.getElementById('shopOpsBanner');
      if (banner) {
        banner.style.display = lastProductsAdminRole === 'shop' ? 'block' : 'none';
      }
      renderProducts();
    })
    .catch(() => {});
}

function renderProducts() {
  const c = document.getElementById('productListContainer');
  if (!c) return;
  if (!globalProducts.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div>尚無商品</div>'; return; }
  c.innerHTML = globalProducts.map(p => `
    <div style="background:white; padding:16px; border-radius:12px; border:1px solid #e2e8f0;">
      ${p.image_url ? `<img src="${escHtml(p.image_url)}" style="width:100%; height:120px; object-fit:cover; border-radius:8px; margin-bottom:10px;" onerror="this.style.display='none'">` : ''}
      <div style="font-weight:600; margin-bottom:4px;">${escHtml(p.name)}</div>
      <div style="font-size:0.82rem; color:#64748b; margin-bottom:8px;">${escHtml(p.description || '')}</div>
      <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
        <span class="tag tag-amber">💰 ${p.points_required} 分</span>
        <span class="tag tag-gray">庫存 ${p.stock ?? '∞'}</span>
        <span class="tag ${p.is_active ? 'tag-green' : 'tag-red'}">${p.is_active ? '上架中' : '已下架'}</span>
        ${loginUser.role === 'admin' && p.created_by ? `<span class="tag tag-blue">🏪 ${escHtml(p.created_by)}</span>` : ''}
      </div>
      <div style="display:flex; gap:6px; justify-content:flex-end;">
        <button class="btn-sm btn-secondary-v2" onclick="editProduct('${p.id}')">編輯</button>
        <button class="btn-sm btn-danger-v2" onclick="deleteProduct('${p.id}')">刪除</button>
      </div>
    </div>
  `).join('');
}

function editProduct(id) {
  const p = globalProducts.find(x => String(x.id) === String(id));
  if (!p) return;
  openDrawer('編輯商品', 'form-product');
  const form = document.getElementById('productForm');
  form.elements.id.value = p.id;
  form.elements.name.value = p.name;
  form.elements.description.value = p.description || '';
  form.elements.points_required.value = p.points_required;
  form.elements.stock.value = p.stock ?? 0;
  document.getElementById('productImageUrl').value = p.image_url || '';
  const preview = document.getElementById('productImagePreview');
  if (p.image_url) { preview.src = p.image_url; preview.style.display = 'block'; } else preview.style.display = 'none';
}

function deleteProduct(id) {
  showConfirm('確定要刪除這個商品嗎？', () => {
    fetch(`${API_BASE}/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'x-username': loginUser.username },
      credentials: 'include'
    })
      .then(r => r.json()).then(d => {
        if (d.success) { showToast('商品已刪除'); loadProducts(); } else showToast(d.message || '刪除失敗', 'error');
      });
  });
}

// Product form submit
document.getElementById('productForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const form = this; const id = form.elements.id.value;
  const msgEl = document.getElementById('productFormMsg'); msgEl.textContent = '';
  const fd = new FormData();
  fd.append('name', form.name.value.trim());
  fd.append('description', form.description.value.trim());
  fd.append('points_required', form.points_required.value);
  fd.append('stock', form.stock.value);
  const imgFile = form.image?.files[0];
  if (imgFile) fd.append('image', imgFile);
  else if (id) fd.append('image_url', document.getElementById('productImageUrl').value);
  const url = id ? `${API_BASE}/api/products/${id}` : `${API_BASE}/api/products`;
  const method = id ? 'PUT' : 'POST';
  fetch(url, {
    method,
    headers: { 'x-username': loginUser.username },
    credentials: 'include',
    body: fd
  })
    .then(r => r.json()).then(d => {
      if (d.success) { showToast(id ? '商品已更新' : '商品已建立'); closeDrawer(); loadProducts(); }
      else msgEl.textContent = d.message || '操作失敗';
    }).catch(() => { msgEl.textContent = '連線失敗'; });
});

const productImageInput = document.getElementById('productImageInput');
if (productImageInput) {
  productImageInput.addEventListener('change', function() {
    const file = this.files[0]; const preview = document.getElementById('productImagePreview');
    if (file) { const r = new FileReader(); r.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; }; r.readAsDataURL(file); }
  });
}

// ── Redemptions ───────────────────────────────────────────────
function loadRedemptions() {
  const status = document.getElementById('redemptionStatusFilter')?.value || '';
  const search = document.getElementById('redemptionSearch')?.value.trim() || '';
  fetch(`${API_BASE}/api/product-redemptions/admin`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json()).then(data => {
      if (!data.success) return;
      let records = data.redemptions || [];
      if (status) records = records.filter(r => r.status === status);
      if (search) records = records.filter(r => (r.username || '').includes(search) || (r.product_name || '').includes(search));
      const c = document.getElementById('redemptionListContainer');
      if (!records.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧾</div>沒有符合的紀錄</div>'; return; }
      c.innerHTML = records.map(r => {
        const statusColors = { pending: 'tag-amber', completed: 'tag-green', cancelled: 'tag-red' };
        const statusLabels = { pending: '待處理', completed: '已完成', cancelled: '已取消' };
        const redeemedAt = r.redeemed_at ? new Date(r.redeemed_at).toLocaleString('zh-TW') : '';
        const actions = r.status === 'pending' ? `
          <button class="btn-sm btn-primary-v2" onclick="completeRedemption('${r.id}')">完成兌換</button>
          <button class="btn-sm btn-danger-v2" onclick="cancelRedemption('${r.id}')">取消</button>
        ` : '';
        return `<div class="task-item">
          <div class="task-item-body">
            <div class="task-item-title">${escHtml(r.product_name || '商品')}</div>
            <div style="display:flex; gap:4px; flex-wrap:wrap;">
              <span class="tag tag-gray">👤 ${escHtml(r.username || '')}</span>
              <span class="tag ${statusColors[r.status] || 'tag-gray'}">${statusLabels[r.status] || r.status}</span>
              <span class="tag tag-gray">💰 ${r.points_used ?? 0} 分</span>
              ${redeemedAt ? `<span class="tag tag-gray">申請 ${redeemedAt}</span>` : ''}
            </div>
          </div>
          <div class="task-item-actions">${actions}</div>
        </div>`;
      }).join('');
    });
}

function completeRedemption(id) {
  showConfirm('確定完成此兌換？', () => {
    fetch(`${API_BASE}/api/product-redemptions/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      credentials: 'include',
      body: JSON.stringify({ status: 'completed' })
    }).then(r => r.json()).then(d => { if (d.success) { showToast('兌換已完成'); loadRedemptions(); } else showToast(d.message || '失敗', 'error'); });
  });
}

function cancelRedemption(id) {
  showConfirm('確定取消此兌換？', () => {
    fetch(`${API_BASE}/api/product-redemptions/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      credentials: 'include',
      body: JSON.stringify({ status: 'cancelled' })
    }).then(r => r.json()).then(d => { if (d.success) { showToast('兌換已取消'); loadRedemptions(); } else showToast(d.message || '失敗', 'error'); });
  });
}

// ── 發放兌換卷 ────────────────────────────────────────────────
function loadIssuedCoupons() {
  const c = document.getElementById('issuedCouponsContainer');
  if (!c) return;
  fetch(`${API_BASE}/api/coupons/issued?page=1&pageSize=40`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        c.innerHTML = '<div style="color:#94a3b8;">載入失敗</div>';
        return;
      }
      if (!data.coupons?.length) {
        c.innerHTML = '<div style="color:#94a3b8; font-size:0.9rem;">尚無發放紀錄</div>';
        return;
      }
      c.innerHTML = data.coupons.map(cp => `
        <div style="background:#f8fafc; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0;">
          <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="font-weight:600;">${escHtml(cp.title)}</div>
              <div style="font-size:0.85rem; color:#64748b; margin-top:4px;">代碼 <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;">${escHtml(cp.coupon_code)}</code> · ${escHtml(cp.username || '—')}</div>
              ${cp.quest_chain_title ? `<div style="font-size:0.82rem; color:#475569; margin-top:6px;">綁定入口：${escHtml(cp.quest_chain_title)}</div>` : ''}
            </div>
            <span class="tag ${cp.is_used ? 'tag-gray' : (cp.status === 'expired' ? 'tag-amber' : 'tag-green')}">${cp.is_used ? '已核銷' : (cp.status === 'expired' ? '已過期' : '未使用')}</span>
          </div>
          <div style="font-size:0.82rem; color:#64748b; margin-top:8px;">${cp.discount ? `折扣 ${escHtml(String(cp.discount))}` : ''}${cp.expiry_date ? ` · 到期 ${escHtml(String(cp.expiry_date))}` : ''}${cp.created_at ? ` · ${escHtml(new Date(cp.created_at).toLocaleString('zh-TW'))}` : ''}</div>
        </div>
      `).join('');
    })
    .catch(() => {
      c.innerHTML = '<div style="color:#94a3b8;">載入失敗</div>';
    });
}

function refreshCouponQuestChainOptions() {
  const select = document.getElementById('couponQuestChainSelect');
  if (!select) return;
  const currentValue = select.value;
  const options = Object.values(globalQuestChainsMap)
    .sort((a, b) => (Number(a.entry_order || 0) - Number(b.entry_order || 0)) || (Number(a.id) - Number(b.id)))
    .map((q) => `<option value="${q.id}">${escHtml(q.title)}${q.access_mode === 'coupon' ? '（需 Coupon）' : '（公開入口）'}</option>`)
    .join('');
  select.innerHTML = `<option value="">不綁定入口（一般折扣券）</option>${options}`;
  if ([...select.options].some(option => option.value === currentValue)) {
    select.value = currentValue;
  }
}

const couponIssueFormEl = document.getElementById('couponIssueForm');
if (couponIssueFormEl) {
  couponIssueFormEl.addEventListener('submit', e => {
    e.preventDefault();
    const msgEl = document.getElementById('couponIssueFormMsg');
    if (msgEl) msgEl.textContent = '';
    const fd = new FormData(couponIssueFormEl);
    const body = {
      username: (fd.get('username') || '').toString().trim(),
      title: (fd.get('title') || '').toString().trim(),
      quest_chain_id: (fd.get('quest_chain_id') || '').toString().trim(),
      discount_amount: fd.get('discount_amount') || '',
      discount_percent: fd.get('discount_percent') || '',
      expiry_date: fd.get('expiry_date') || '',
      coupon_code: (fd.get('coupon_code') || '').toString().trim()
    };
    fetch(`${API_BASE}/api/coupons/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      credentials: 'include',
      body: JSON.stringify(body)
    })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const code = d.coupon?.coupon_code || '';
          showToast(code ? `已發放，代碼：${code}` : (d.message || '已發放'));
          couponIssueFormEl.reset();
          loadIssuedCoupons();
        } else if (msgEl) {
          msgEl.textContent = d.message || '發放失敗';
        } else {
          showToast(d.message || '發放失敗', 'error');
        }
      })
      .catch(() => {
        if (msgEl) msgEl.textContent = '連線失敗';
        else showToast('連線失敗', 'error');
      });
  });
}

// ── POS Coupon ────────────────────────────────────────────────
function lookupCoupon() {
  const code = document.getElementById('couponCodeInput').value.trim();
  if (!code) { showToast('請輸入代碼', 'error'); return; }
  const result = document.getElementById('couponResult');
  result.style.display = 'none';
  fetch(`${API_BASE}/api/coupons/lookup/${encodeURIComponent(code)}`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json()).then(data => {
      if (!data.success) { showToast(data.message || '查無此券', 'error'); return; }
      const c = data.coupon;
      const canRedeem = c.status === 'active' && !c.is_used;
      result.innerHTML = `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700; font-size:1.1rem; margin-bottom:4px;">${escHtml(c.title || '優惠券')}</div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <span class="tag ${canRedeem ? 'tag-green' : 'tag-red'}">${canRedeem ? '可核銷' : (c.is_used ? '已使用' : c.status)}</span>
            <span class="tag tag-gray">👤 ${escHtml(c.username || '')}</span>
            ${c.discount ? `<span class="tag tag-amber">折扣 ${c.discount}</span>` : ''}
          </div>
        </div>
        ${canRedeem ? `<button class="btn-md btn-primary-v2" onclick="redeemCoupon('${c.id}')" style="width:100%;">確認核銷</button>` : '<div style="color:#dc2626; text-align:center;">此券無法核銷</div>'}
      `;
      result.style.display = 'block';
    }).catch(() => showToast('查詢失敗', 'error'));
}

function redeemCoupon(id) {
  fetch(`${API_BASE}/api/coupons/${id}/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    credentials: 'include'
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('核銷成功！'); document.getElementById('couponResult').style.display = 'none'; document.getElementById('couponCodeInput').value = ''; loadPosHistory(); }
    else showToast(d.message || '核銷失敗', 'error');
  });
}

function loadPosHistory() {
  fetch(`${API_BASE}/api/coupons/redeem-history`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json()).then(data => {
      const c = document.getElementById('posHistoryContainer');
      if (!data.success || !data.history?.length) { c.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem;">今日尚無核銷紀錄</div>'; return; }
      c.innerHTML = data.history.map(h => `
        <div style="background:#f8fafc; padding:10px 14px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
          <div><span style="font-weight:500;">${escHtml(h.title || h.coupon_code)}</span> <span style="color:#64748b; font-size:0.82rem;">— ${escHtml(h.username || '')}</span></div>
          <span style="font-size:0.8rem; color:#94a3b8;">${h.redeemed_at ? new Date(h.redeemed_at).toLocaleTimeString('zh-TW') : ''}</span>
        </div>
      `).join('');
    }).catch(() => {});
}

// ── Users ─────────────────────────────────────────────────────
let currentUserPage = 1;
let userSearchDebounceTimer = null;

function loadUsers(page) {
  currentUserPage = page || 1;
  const q = document.getElementById('userSearchInput')?.value.trim() || '';
  const qs = new URLSearchParams({ page: String(currentUserPage), limit: '50' });
  if (q) qs.set('search', q);
  fetch(`${API_BASE}/api/admin/users?${qs}`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json()).then(data => {
      if (!data.success) return;
      const total = data.pagination?.totalUsers ?? data.total ?? data.users?.length ?? 0;
      document.getElementById('totalUserCount').textContent = total;
      const c = document.getElementById('userListContainer');
      if (!data.users?.length) {
        c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div>尚無符合的會員</div>';
        document.getElementById('userPagination').innerHTML = '';
        return;
      }
      c.innerHTML = data.users.map(u => `
        <div class="task-item">
          <div class="task-item-body">
            <div class="task-item-title">👤 ${escHtml(u.username)}</div>
            <div style="display:flex; gap:4px; flex-wrap:wrap;">
              <span class="tag tag-gray">${escHtml(u.role || 'user')}</span>
              <span class="tag tag-amber">💰 ${u.total_points || 0} 分</span>
              <span class="tag tag-green">✅ ${u.completed_tasks || 0} 完成</span>
              <span class="tag tag-blue">🔄 ${u.in_progress_tasks || 0} 進行中</span>
            </div>
          </div>
        </div>
      `).join('');
      const totalPages = data.pagination?.totalPages ?? Math.max(1, Math.ceil(total / 50));
      const pag = document.getElementById('userPagination');
      if (totalPages <= 1) { pag.innerHTML = ''; return; }
      pag.innerHTML = Array.from({ length: totalPages }, (_, i) =>
        `<button class="btn-sm ${i + 1 === currentUserPage ? 'btn-primary-v2' : 'btn-secondary-v2'}" onclick="loadUsers(${i + 1})">${i + 1}</button>`
      ).join('');
    });
}

function exportUsers() {
  window.open(`${API_BASE}/api/admin/users/export`, '_blank');
}

// Import users form
document.getElementById('importUsersForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const form = this; const msgEl = document.getElementById('importFormMsg');
  const fd = new FormData();
  if (form.file.files[0]) fd.append('file', form.file.files[0]);
  if (form.simulateActivity.checked) {
    fd.append('simulateActivity', 'true');
    fd.append('startDate', form.startDate.value);
    fd.append('endDate', form.endDate.value);
  }
  msgEl.textContent = '匯入中...';
  fetch(`${API_BASE}/api/admin/import-users`, {
    method: 'POST',
    headers: { 'x-username': loginUser.username },
    credentials: 'include',
    body: fd
  })
    .then(r => r.json()).then(d => {
      if (d.success) { showToast(d.message || '匯入成功'); closeDrawer(); loadUsers(1); }
      else msgEl.textContent = d.message || '匯入失敗';
    }).catch(() => { msgEl.textContent = '連線失敗'; });
});

// Simulate activity toggle
const simCheck = document.querySelector('#importUsersForm input[name="simulateActivity"]');
if (simCheck) {
  simCheck.addEventListener('change', () => {
    document.getElementById('importSimFields').style.display = simCheck.checked ? 'block' : 'none';
  });
}

// ── Roles ─────────────────────────────────────────────────────
function createAccount() {
  const role = document.getElementById('newAccountRole').value;
  const username = document.getElementById('newAccountUsername').value.trim();
  const password = document.getElementById('newAccountPassword').value;
  if (!username || !password) { showToast('請填寫帳號和密碼', 'error'); return; }
  if (password.length < 6) { showToast('密碼至少 6 位', 'error'); return; }
  fetch(`${API_BASE}/api/admin/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    credentials: 'include',
    body: JSON.stringify({ role, username, password })
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('帳號建立成功'); document.getElementById('newAccountUsername').value = ''; document.getElementById('newAccountPassword').value = ''; }
    else showToast(d.message || '建立失敗', 'error');
  });
}

function assignStaff() {
  const username = document.getElementById('staffPhoneInput').value.trim();
  const shopId = document.getElementById('staffShopSelect')?.value || '';
  if (!username) { showToast('請輸入玩家手機帳號', 'error'); return; }
  if (!shopId) { showToast('請先選擇商店', 'error'); return; }
  fetch(`${API_BASE}/api/staff/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    credentials: 'include',
    body: JSON.stringify({ username, shop_id: shopId })
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('已指派為工作人員'); document.getElementById('staffPhoneInput').value = ''; }
    else showToast(d.message || '指派失敗', 'error');
  });
}

function revokeStaff() {
  const username = document.getElementById('staffPhoneInput').value.trim();
  if (!username) { showToast('請輸入玩家手機帳號', 'error'); return; }
  showConfirm(`確定要撤銷 ${username} 的工作人員權限嗎？`, () => {
    fetch(`${API_BASE}/api/staff/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      credentials: 'include',
      body: JSON.stringify({ username })
    }).then(r => r.json()).then(d => {
      if (d.success) { showToast('已撤銷'); document.getElementById('staffPhoneInput').value = ''; }
      else showToast(d.message || '撤銷失敗', 'error');
    });
  });
}

document.getElementById('shopForm')?.addEventListener('submit', function(e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.shop_id.value;
  const msgEl = document.getElementById('shopFormMsg');
  setInlineMessage(msgEl, '');
  const payload = {
    shop_name: form.elements.shop_name.value.trim(),
    contact_name: form.elements.contact_name.value.trim(),
    contact_phone: form.elements.contact_phone.value.trim(),
    contact_email: form.elements.contact_email.value.trim(),
    shop_address: form.elements.shop_address.value.trim(),
    shop_description: form.elements.shop_description.value.trim(),
    status: form.elements.status.value
  };
  if (!payload.shop_name) {
    setInlineMessage(msgEl, '請填寫商店名稱');
    return;
  }

  const request = id
    ? fetch(`${API_BASE}/api/shop/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...withActorHeaders() },
        credentials: 'include',
        body: JSON.stringify({ ...payload, shop_id: id })
      })
    : fetch(`${API_BASE}/api/admin/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...withActorHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          role: 'shop',
          username: form.elements.username.value.trim(),
          password: form.elements.password.value,
          ...payload
        })
      });

  setInlineMessage(msgEl, id ? '商店資料更新中...' : '商店建立中...', 'info');
  request.then(r => r.json()).then(async (d) => {
    if (!d.success) {
      setInlineMessage(msgEl, d.message || '操作失敗');
      return;
    }
    showToast(id ? '商店資料已更新' : '商店已建立');
    closeDrawer();
    await loadShops();
    await loadShopManagement();
  }).catch(() => setInlineMessage(msgEl, '連線失敗'));
});

document.getElementById('planForm')?.addEventListener('submit', function(e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.id.value;
  const msgEl = document.getElementById('planFormMsg');
  setInlineMessage(msgEl, '');
  const payload = {
    name: form.elements.name.value.trim(),
    task_limit: Number(form.elements.task_limit.value || 0),
    setup_fee: Number(form.elements.setup_fee.value || 0),
    monthly_base_fee: Number(form.elements.monthly_base_fee.value || 0),
    token_price_per_1k: Number(form.elements.token_price_per_1k.value || 0) / 10,
    is_active: form.elements.is_active.checked
  };
  if (!payload.name || !payload.task_limit) {
    setInlineMessage(msgEl, '請填寫方案名稱與關卡上限');
    return;
  }
  setInlineMessage(msgEl, id ? '方案更新中...' : '方案建立中...', 'info');
  fetch(`${API_BASE}/api/entry-plans${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json', ...withActorHeaders() },
    credentials: 'include',
    body: JSON.stringify(payload)
  }).then(r => r.json()).then(async (d) => {
    if (!d.success) {
      setInlineMessage(msgEl, d.message || '操作失敗');
      return;
    }
    showToast(id ? '方案已更新' : '方案已建立');
    closeDrawer();
    await loadEntryPlans();
    await loadPlanManagement();
  }).catch(() => setInlineMessage(msgEl, '連線失敗'));
});

function changePassword() {
  const oldPw = document.getElementById('oldPasswordInput').value;
  const newPw = document.getElementById('newPasswordInput').value;
  if (!oldPw || !newPw) { showToast('請填寫密碼', 'error'); return; }
  if (newPw.length < 6) { showToast('新密碼至少 6 位', 'error'); return; }
  fetch(`${API_BASE}/api/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    credentials: 'include',
    body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('密碼已更新'); document.getElementById('oldPasswordInput').value = ''; document.getElementById('newPasswordInput').value = ''; }
    else showToast(d.message || '更新失敗', 'error');
  });
}

// ── POS：Enter 查券 ────────────────────────────────────────────
const couponCodeInputEl = document.getElementById('couponCodeInput');
if (couponCodeInputEl) {
  couponCodeInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      lookupCoupon();
    }
  });
}

// ── 會員搜尋 debounce ─────────────────────────────────────────
const userSearchInputEl = document.getElementById('userSearchInput');
if (userSearchInputEl) {
  userSearchInputEl.addEventListener('input', () => {
    clearTimeout(userSearchDebounceTimer);
    userSearchDebounceTimer = setTimeout(() => loadUsers(1), 360);
  });
}

const questChainSearchInputEl = document.getElementById('questChainSearchInput');
if (questChainSearchInputEl) {
  questChainSearchInputEl.addEventListener('input', () => {
    currentQuestChainSearchTerm = questChainSearchInputEl.value.trim();
    renderQuestChainList(filterQuestChains(Object.values(globalQuestChainsMap)));
  });
}

window.addEventListener('hashchange', () => {
  applySidebarRBAC();
  selectInitialStaffView();
});

// ── Init: Load everything ─────────────────────────────────────
bootstrapSession();
