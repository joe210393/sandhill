let loginUser = window.loginUser || JSON.parse(localStorage.getItem('loginUser') || 'null');
let quotePlans = [];

function withActorHeaders(extra = {}) {
  return loginUser?.username && !extra['x-username']
    ? { ...extra, 'x-username': loginUser.username }
    : extra;
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: withActorHeaders(options.headers || {})
  });

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const data = await response.json();
  if (response.status === 401) {
    localStorage.removeItem('loginUser');
    window.location.href = '/login.html';
    throw new Error(data?.message || '登入已失效，請重新登入');
  }
  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || '載入失敗');
  }
  return data;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 'NT$0';
  return `NT$${amount.toLocaleString('zh-TW')}`;
}

function formatTokenCount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0';
  return amount.toLocaleString('zh-TW');
}

function formatTokenPricingRule(tokenPricePer1k = 0) {
  const perTenThousand = Number(tokenPricePer1k || 0) * 10;
  return `每 1 萬 tokens ${formatCurrency(perTenThousand)}`;
}

function getInputNumber(id, fallback = 0) {
  const input = document.getElementById(id);
  const value = Number(input?.value || 0);
  return Number.isFinite(value) ? value : fallback;
}

function calculateScenario(plan, scenarioTaskCount, taskTokens, entryTokens, participants) {
  const taskCount = Number(plan?.task_limit || scenarioTaskCount || 0);
  const setupFee = Number(plan?.setup_fee || 0);
  const monthlyBaseFee = Number(plan?.monthly_base_fee || 0);
  const tokenPricePer1k = Number(plan?.token_price_per_1k || 0);
  const perUserTaskTokens = Math.max(taskCount, 0) * Math.max(taskTokens, 0);
  const perUserTotalTokens = perUserTaskTokens + Math.max(entryTokens, 0);
  const totalTokens = perUserTotalTokens * Math.max(participants, 0);
  const perUserLmCost = (perUserTotalTokens / 1000) * tokenPricePer1k;
  const totalLmCost = (totalTokens / 1000) * tokenPricePer1k;
  const totalWithSetup = setupFee + monthlyBaseFee + totalLmCost;
  return {
    taskCount,
    setupFee,
    monthlyBaseFee,
    tokenPricePer1k,
    perUserTaskTokens,
    perUserTotalTokens,
    totalTokens,
    perUserLmCost,
    totalLmCost,
    totalWithSetup
  };
}

function calculateRecommendedPlan(taskCount, plans = []) {
  const normalizedTaskCount = Math.max(Math.ceil(Number(taskCount || 0)), 1);
  const activePlans = [...plans].filter((plan) => plan.is_active !== false)
    .sort((left, right) => Number(left.task_limit || 0) - Number(right.task_limit || 0));
  const directMatch = activePlans.find((plan) => Number(plan.task_limit || 0) >= normalizedTaskCount) || null;
  if (directMatch) {
    return { plan: directMatch, computedSetupFee: Number(directMatch.setup_fee || 0), computedTaskLimit: Number(directMatch.task_limit || 0), derived: false };
  }
  const bucket = Math.max(Math.ceil(normalizedTaskCount / 10), 1);
  return {
    plan: null,
    computedSetupFee: 5000 + Math.max(bucket - 1, 0) * 3000,
    computedTaskLimit: bucket * 10,
    derived: true
  };
}

function renderRecommendation() {
  const taskCount = getInputNumber('scenarioTaskCount', 10);
  const taskTokens = getInputNumber('scenarioTaskTokens', 700);
  const entryTokens = getInputNumber('scenarioEntryTokens', 300);
  const participants = getInputNumber('scenarioParticipants', 5000);
  const recommendation = calculateRecommendedPlan(taskCount, quotePlans);
  const targetPlan = recommendation.plan || {
    name: `${recommendation.computedTaskLimit} 關推估方案`,
    task_limit: recommendation.computedTaskLimit,
    setup_fee: recommendation.computedSetupFee,
    monthly_base_fee: 0,
    token_price_per_1k: 1
  };
  const scenario = calculateScenario(targetPlan, taskCount, taskTokens, entryTokens, participants);

  const recommendationEl = document.getElementById('quoteRecommendation');
  if (recommendationEl) {
    recommendationEl.innerHTML = `
      <div style="font-size:1rem; font-weight:800; margin-bottom:8px;">建議方案：<strong>${escHtml(targetPlan.name || `${targetPlan.task_limit} 關方案`)}</strong></div>
      <div style="color:#475569; line-height:1.8;">
        你目前預計做 <strong>${escHtml(String(taskCount))} 關</strong>。系統建議至少採用 <strong>${escHtml(String(recommendation.computedTaskLimit))} 關容量</strong>。
        ${recommendation.derived ? '目前現行方案表沒有更高上限，先用收費規則推估。' : '這筆推估直接對應到現在的方案表。'}
      </div>
      <div class="pill-row">
        <span class="pill">建置費 ${formatCurrency(recommendation.computedSetupFee)}</span>
        <span class="pill">${escHtml(formatTokenPricingRule(targetPlan.token_price_per_1k || 0))}</span>
        <span class="pill">每月基本費 ${formatCurrency(targetPlan.monthly_base_fee || 0)}</span>
      </div>
    `;
  }

  const metrics = [
    ['每人每關預估', `${formatTokenCount(taskTokens)} tokens`],
    ['每人入口劇情', `${formatTokenCount(entryTokens)} tokens`],
    ['每人總 tokens', `${formatTokenCount(scenario.perUserTotalTokens)} tokens`],
    ['每人 LM 費用', formatCurrency(scenario.perUserLmCost)],
    ['整體 tokens', `${formatTokenCount(scenario.totalTokens)} tokens`],
    ['LM 預估費用', formatCurrency(scenario.totalLmCost)],
    ['一次性建置費', formatCurrency(recommendation.computedSetupFee)],
    ['含建置費總額', formatCurrency(scenario.totalWithSetup)],
    ['預計參加人數', `${formatTokenCount(participants)} 人`]
  ];
  const metricsEl = document.getElementById('quoteMetrics');
  if (metricsEl) {
    metricsEl.innerHTML = metrics.map(([label, value]) => `
      <div class="metric">
        <div class="metric-label">${escHtml(label)}</div>
        <div class="metric-value">${escHtml(value)}</div>
      </div>
    `).join('');
  }

  const formulaEl = document.getElementById('quoteFormulaNote');
  if (formulaEl) {
    formulaEl.textContent = `估算公式：(${taskCount} 關 × 每關 ${taskTokens} tokens + 入口劇情 ${entryTokens} tokens) × ${participants} 人 = ${formatTokenCount(scenario.totalTokens)} tokens，再依每 1 萬 tokens = NT$10 換算 LM 費用。`;
  }
}

function renderPlanComparison() {
  const taskTokens = getInputNumber('scenarioTaskTokens', 700);
  const entryTokens = getInputNumber('scenarioEntryTokens', 300);
  const participants = getInputNumber('scenarioParticipants', 5000);
  const cardsEl = document.getElementById('quotePlanCards');
  const tableEl = document.getElementById('quotePlanTableBody');

  if (!quotePlans.length) {
    if (cardsEl) cardsEl.innerHTML = '<div class="empty">目前沒有方案資料。</div>';
    if (tableEl) tableEl.innerHTML = '<tr><td colspan="9" class="empty">目前沒有方案資料。</td></tr>';
    return;
  }

  const sortedPlans = [...quotePlans].sort((left, right) => Number(left.task_limit || 0) - Number(right.task_limit || 0));
  if (cardsEl) {
    cardsEl.innerHTML = sortedPlans.map((plan) => {
      const scenario = calculateScenario(plan, plan.task_limit, taskTokens, entryTokens, participants);
      return `
        <div class="plan-card">
          <h3>${escHtml(plan.name || `方案 #${plan.id}`)}</h3>
          <div class="plan-price">${formatCurrency(plan.setup_fee || 0)}</div>
          <div class="hint">上限 ${escHtml(formatTokenCount(plan.task_limit || 0))} 關｜${escHtml(formatTokenPricingRule(plan.token_price_per_1k || 0))}</div>
          <div class="pill-row">
            <span class="pill">每人 ${formatTokenCount(scenario.perUserTotalTokens)} tokens</span>
            <span class="pill">LM ${formatCurrency(scenario.totalLmCost)}</span>
            <span class="pill">總額 ${formatCurrency(scenario.totalWithSetup)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  if (tableEl) {
    tableEl.innerHTML = sortedPlans.map((plan) => {
      const scenario = calculateScenario(plan, plan.task_limit, taskTokens, entryTokens, participants);
      return `
        <tr>
          <td>${escHtml(plan.name || `方案 #${plan.id}`)}</td>
          <td>${escHtml(formatTokenCount(plan.task_limit || 0))} 關</td>
          <td>${formatCurrency(plan.setup_fee || 0)}</td>
          <td>${formatCurrency(plan.monthly_base_fee || 0)}</td>
          <td>${escHtml(formatTokenPricingRule(plan.token_price_per_1k || 0))}</td>
          <td>${formatTokenCount(scenario.perUserTotalTokens)} tokens</td>
          <td>${formatTokenCount(scenario.totalTokens)} tokens</td>
          <td>${formatCurrency(scenario.totalLmCost)}</td>
          <td>${formatCurrency(scenario.totalWithSetup)}</td>
        </tr>
      `;
    }).join('');
  }
}

function renderQuotePage() {
  renderRecommendation();
  renderPlanComparison();
}

function bindScenarioInputs() {
  ['scenarioTaskCount', 'scenarioTaskTokens', 'scenarioEntryTokens', 'scenarioParticipants'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('input', renderQuotePage);
    input.addEventListener('change', renderQuotePage);
  });

  const resetBtn = document.getElementById('resetScenarioBtn');
  if (resetBtn && !resetBtn.dataset.bound) {
    resetBtn.dataset.bound = '1';
    resetBtn.addEventListener('click', () => {
      document.getElementById('scenarioTaskCount').value = 10;
      document.getElementById('scenarioTaskTokens').value = 700;
      document.getElementById('scenarioEntryTokens').value = 300;
      document.getElementById('scenarioParticipants').value = 5000;
      renderQuotePage();
    });
  }

  const printBtn = document.getElementById('printQuoteBtn');
  if (printBtn && !printBtn.dataset.bound) {
    printBtn.dataset.bound = '1';
    printBtn.addEventListener('click', () => window.print());
  }
}

function setError(message) {
  const errorEl = document.getElementById('quotePageError');
  if (!errorEl) return;
  errorEl.style.display = message ? 'block' : 'none';
  errorEl.textContent = message || '';
}

async function bootstrap() {
  try {
    const me = await apiJson('/api/me');
    loginUser = me.user;
    localStorage.setItem('loginUser', JSON.stringify(me.user));
    if (loginUser?.role !== 'admin') {
      throw new Error('這一頁僅限平台管理員使用');
    }
    const metaEl = document.getElementById('quotePageMeta');
    if (metaEl) {
      metaEl.textContent = `目前登入：${loginUser.username}｜用途：廠商報價與活動規模預估`;
    }
    bindScenarioInputs();
    const plansData = await apiJson('/api/entry-plans?include_inactive=1');
    quotePlans = plansData.plans || [];
    renderQuotePage();
  } catch (error) {
    setError(error.message || '載入方案報價頁失敗');
  }
}

bootstrap();
