(function attachSandhillFormat(global) {
  function formatCurrency(amount) {
    const value = Number(amount || 0);
    if (!Number.isFinite(value)) return 'NT$0';
    return `NT$${value.toLocaleString('zh-TW')}`;
  }

  function formatBytes(bytes = 0) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const digits = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
    return `${size.toFixed(digits)} ${units[unitIndex]}`;
  }

  function formatTokenPricingRule(tokenPricePer1k = 0) {
    const perTenThousand = Number(tokenPricePer1k || 0) * 10;
    return `每 1 萬 tokens ${formatCurrency(perTenThousand)}`;
  }

  function formatTokenPricingDetail(tokenPricePer1k = 0) {
    return `${formatTokenPricingRule(tokenPricePer1k)}｜等於每 1K tokens ${formatCurrency(tokenPricePer1k)}`;
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

  global.SandhillFormat = {
    formatCurrency,
    formatBytes,
    formatTokenPricingRule,
    formatTokenPricingDetail,
    formatTokenCount,
    formatDateTime,
    formatDayLabel
  };
})(window);
