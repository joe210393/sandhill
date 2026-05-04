(function attachOpsOverviewView(global) {
  const API_BASE = global.StaffDashboardConfig?.apiBase || '';
  const { apiJson, withActorHeaders } = global.SandhillApi;
  const { escHtml, showToast } = global.SandhillDom;
  const { formatBytes } = global.SandhillFormat;

  function kpiCard(title, value, hint) {
    const v = value === undefined || value === null ? '—' : value;
    const num = typeof v === 'number';
    const display = num ? String(v.toLocaleString('zh-TW')) : escHtml(String(v));
    return `
      <div class="ops-kpi-card">
        <div class="ops-kpi-title">${escHtml(title)}</div>
        <div class="ops-kpi-value">${display}</div>
        ${hint ? `<div class="ops-kpi-hint">${escHtml(hint)}</div>` : ''}
      </div>
    `;
  }

  function renderMetaRow(meta, actorRole) {
    if (!meta) return '';
    const parts = [];
    const bytes = Number(meta.storageBytes || 0);
    const files = Number(meta.storageFiles || 0);
    parts.push(`素材估算：${formatBytes(bytes)}（約 ${files.toLocaleString('zh-TW')} 個檔案）`);
    if (actorRole === 'admin' && meta.shopsTotal != null) {
      parts.push(`全平台商店：${Number(meta.shopsTotal).toLocaleString('zh-TW')} 家`);
    }
    if (actorRole === 'admin' && meta.entryPlansActive != null) {
      parts.push(`啟用中計價方案：${Number(meta.entryPlansActive).toLocaleString('zh-TW')} 個`);
    }
    if (!parts.length) return '';
    return `<div class="ops-meta-row">${parts.map((p) => `<span class="ops-meta-chip">${escHtml(p)}</span>`).join('')}</div>`;
  }

  async function loadOpsOverview() {
    const grid = global.document.getElementById('opsOverviewGrid');
    const foot = global.document.getElementById('opsOverviewFootnote');
    const metaHost = global.document.getElementById('opsOverviewMeta');
    if (!grid) return;
    grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div>載入營運指標中…</div>';
    if (metaHost) metaHost.innerHTML = '';
    if (foot) {
      foot.textContent = '資料來源：GET /api/dashboard/ops-snapshot（後端單次聚合；與頂欄資料範圍一致）。';
    }

    try {
      const data = await apiJson(`${API_BASE}/api/dashboard/ops-snapshot`, {
        headers: withActorHeaders()
      });
      if (!data.success) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div>${escHtml(data.message || '載入失敗')}</div>`;
        return;
      }
      const metrics = Array.isArray(data.metrics) ? data.metrics : [];
      const cards = metrics.map((m) => kpiCard(m.label || m.id, m.value, m.hint || ''));
      grid.innerHTML = `<div class="ops-kpi-grid">${cards.join('')}</div>`;
      if (metaHost) {
        metaHost.innerHTML = renderMetaRow(data.meta, data.actorRole);
      }
      if (foot && data.generatedAt) {
        foot.textContent = `快照時間：${data.generatedAt}｜範圍：${data.scope === 'platform' ? '全平台' : '單一商家'}｜GET /api/dashboard/ops-snapshot`;
      }
    } catch (e) {
      showToast?.(e.message || '營運總覽載入失敗', 'error');
      grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div>無法載入聚合資料</div>';
    }
  }

  function refreshOpsOverview() {
    loadOpsOverview();
  }

  global.loadOpsOverview = loadOpsOverview;
  global.refreshOpsOverview = refreshOpsOverview;
})(window);
