const assert = require('assert/strict');
const {
  normalizeBillingMonth,
  getBillingMonthRange,
  roundCurrencyValue,
  normalizeBillingPolicy,
  calculateBillingEquivalentAmount,
  calculateBillingAmounts
} = require('../src/services/billing');

function assertMonthRange(input, expectedMonth, expectedStart, expectedEnd) {
  const range = getBillingMonthRange(input);
  assert.equal(range.billingMonth, expectedMonth);
  assert.equal(range.start.toISOString(), expectedStart);
  assert.equal(range.end.toISOString(), expectedEnd);
}

assert.equal(normalizeBillingMonth('2026-04'), '2026-04');
assert.match(normalizeBillingMonth('bad-month'), /^\d{4}-\d{2}$/);
assertMonthRange('2026-04', '2026-04', '2026-04-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

assert.equal(roundCurrencyValue(12.345), 12.35);
assert.equal(roundCurrencyValue('not-a-number'), 0);

assert.equal(normalizeBillingPolicy('public_good'), 'public_good');
assert.equal(normalizeBillingPolicy('', 'admin'), 'public_good');
assert.equal(normalizeBillingPolicy(''), 'commercial');
assert.equal(normalizeBillingPolicy('commercial'), 'commercial');

assert.equal(
  calculateBillingEquivalentAmount({
    monthlyBaseFee: 100,
    tokenPricePer1k: 2.5,
    totalTokens: 1500,
    monthlyBillingEnabled: true
  }),
  103.75
);
assert.equal(
  calculateBillingEquivalentAmount({
    monthlyBaseFee: 100,
    tokenPricePer1k: 2.5,
    totalTokens: 1500,
    monthlyBillingEnabled: false
  }),
  0
);

assert.deepEqual(
  calculateBillingAmounts({
    billingPolicy: 'commercial',
    monthlyBaseFee: 100,
    tokenPricePer1k: 2.5,
    totalTokens: 1500,
    monthlyBillingEnabled: true
  }),
  {
    equivalent_amount: 103.75,
    estimated_amount: 103.75,
    donated_amount: 0
  }
);

assert.deepEqual(
  calculateBillingAmounts({
    billingPolicy: 'public_good',
    monthlyBaseFee: 100,
    tokenPricePer1k: 2.5,
    totalTokens: 1500,
    monthlyBillingEnabled: true
  }),
  {
    equivalent_amount: 103.75,
    estimated_amount: 0,
    donated_amount: 103.75
  }
);

console.log('Billing service verification passed');
