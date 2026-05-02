const assert = require('assert');
const { createTaskValidationService, AI_VALIDATION_MODES } = require('../src/services/task-validation');

function parseJsonField(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
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

const service = createTaskValidationService({
  parseJsonField,
  normalizeNullableString,
  normalizeBoolean
});

const keyword = service.prepareTaskValidationSettings({
  task_type: 'keyword',
  validation_mode: 'manual',
  location_required: '1'
});
assert.strictEqual(keyword.taskType, 'keyword');
assert.strictEqual(keyword.validationMode, 'keyword');
assert.strictEqual(keyword.isAiMode, false);
assert.strictEqual(keyword.locationRequired, true);

const imageAi = service.prepareTaskValidationSettings({
  task_type: 'photo',
  validation_mode: 'ai_count',
  ai_config: { user_prompt: 'Count red items', target_label: 'red item' },
  pass_criteria: { target_count: '2', min_confidence: '0.5' },
  max_attempts: '3'
});
assert.strictEqual(imageAi.taskType, 'photo');
assert.strictEqual(imageAi.submissionType, 'image');
assert.strictEqual(imageAi.validationMode, 'ai_count');
assert.strictEqual(imageAi.maxAttempts, 3);
assert.deepStrictEqual(JSON.parse(imageAi.passCriteriaJson).target_count, 2);

assert.throws(
  () => service.prepareTaskValidationSettings({
    task_type: 'photo',
    validation_mode: 'ai_count',
    ai_config: { user_prompt: 'Count it', target_label: 'coin' },
    pass_criteria: { target_count: '0' }
  }),
  /有效的目標數量/
);

assert.ok(AI_VALIDATION_MODES.includes('ai_reference_match'));
console.log('Task validation service verification passed');
