function getCurrentBillingMonth() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeBillingMonth(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const month = Number(match[2]);
      if (month >= 1 && month <= 12) return trimmed;
    }
  }
  return getCurrentBillingMonth();
}

function getBillingMonthRange(billingMonth) {
  const normalized = normalizeBillingMonth(billingMonth);
  const [yearText, monthText] = normalized.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { billingMonth: normalized, start, end };
}

function roundCurrencyValue(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function normalizeBillingPolicy(value, createdBy = null) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'public_good') return 'public_good';
  if (!normalized && typeof createdBy === 'string' && createdBy.trim().toLowerCase() === 'admin') {
    return 'public_good';
  }
  return 'commercial';
}

function calculateBillingEquivalentAmount({
  monthlyBaseFee = 0,
  tokenPricePer1k = 0,
  totalTokens = 0,
  monthlyBillingEnabled = true
} = {}) {
  if (!monthlyBillingEnabled) return 0;
  const baseFee = Number(monthlyBaseFee || 0);
  const per1k = Number(tokenPricePer1k || 0);
  const tokens = Number(totalTokens || 0);
  const amount = baseFee + ((tokens > 0 ? tokens : 0) / 1000) * per1k;
  return roundCurrencyValue(amount);
}

function calculateBillingAmounts({
  billingPolicy = 'commercial',
  monthlyBaseFee = 0,
  tokenPricePer1k = 0,
  totalTokens = 0,
  monthlyBillingEnabled = true
} = {}) {
  const normalizedPolicy = normalizeBillingPolicy(billingPolicy);
  const equivalentAmount = calculateBillingEquivalentAmount({
    monthlyBaseFee,
    tokenPricePer1k,
    totalTokens,
    monthlyBillingEnabled
  });
  return {
    equivalent_amount: equivalentAmount,
    estimated_amount: normalizedPolicy === 'public_good' ? 0 : equivalentAmount,
    donated_amount: normalizedPolicy === 'public_good' ? equivalentAmount : 0
  };
}

module.exports = {
  getCurrentBillingMonth,
  normalizeBillingMonth,
  getBillingMonthRange,
  roundCurrencyValue,
  normalizeBillingPolicy,
  calculateBillingEquivalentAmount,
  calculateBillingAmounts
};
