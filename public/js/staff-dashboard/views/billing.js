(function attachBillingView(global) {
  const API_BASE = global.StaffDashboardConfig?.apiBase || '';
  const { apiJson, withActorHeaders, getLoginUser } = global.SandhillApi;
  const { showToast, escHtml } = global.SandhillDom;
  const {
    formatCurrency,
    formatTokenPricingRule,
    formatTokenCount,
    formatDateTime,
    formatDayLabel
  } = global.SandhillFormat;

  function getDefaultBillingMonth() {
    return new Date().toISOString().slice(0, 7);
  }

  function getSelectedBillingMonth() {
    const input = document.getElementById('billingMonthInput');
    return input?.value || getDefaultBillingMonth();
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
                <span class="tag ${entry.is_active ? 'tag-green' : 'tag-red'}">${entry.is_active ? '已正式發布' : '測試草稿 / 停用'}</span>
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
    const isAdmin = getLoginUser()?.role === 'admin';
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

    const previousValue = window.currentBillingDailyScope;
    select.innerHTML = options.map((option) => `<option value="${escHtml(option.value)}">${escHtml(option.label)}</option>`).join('');
    const allowedValues = new Set(options.map((option) => option.value));
    window.currentBillingDailyScope = allowedValues.has(previousValue)
      ? previousValue
      : (options[0]?.value || 'platform');
    select.value = window.currentBillingDailyScope;
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

    const isAdmin = getLoginUser()?.role === 'admin';
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
    const data = window.currentBillingDailyData;
    const series = buildBillingSeriesForScope(data, window.currentBillingDailyScope)
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
    window.currentBillingDailyData = data;
    populateBillingDailyScopeOptions(data);
    renderBillingChartSummary(data, window.currentBillingDailyScope);
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
      const u = getLoginUser();
      scopeHint.textContent =
        global.StaffDashboardRoleContext?.getBillingScopeHintText?.(u) ||
        (u?.role === 'admin'
          ? '目前為平台管理視角，可查看全部商家的用量、收費狀態與公益代付數據。'
          : `目前為 ${u?.shop_name || '你的商家'} 視角，只顯示自己商家的入口資料與使用量。`);
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

  // Shared by quest-chains.js + data-services.js (quest list search / re-render after shop & plan loads).
  global.filterQuestChains = filterQuestChains;

  global.getDefaultBillingMonth = getDefaultBillingMonth;
  global.getSelectedBillingMonth = getSelectedBillingMonth;
  global.renderBillingOverview = renderBillingOverview;
  global.renderBillingEntries = renderBillingEntries;
  global.renderBillingShopTotals = renderBillingShopTotals;
  global.renderSetupFeeRecords = renderSetupFeeRecords;
  global.renderBillingUsageLogs = renderBillingUsageLogs;
  global.renderBillingDailyCharts = renderBillingDailyCharts;
  global.loadBillingDashboard = loadBillingDashboard;
})(window);
