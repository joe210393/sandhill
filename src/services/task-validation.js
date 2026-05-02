const ALLOWED_TASK_TYPES = ['qa', 'multiple_choice', 'photo', 'number', 'keyword', 'location'];
const AI_VALIDATION_MODES = ['ai_count', 'ai_identify', 'ai_score', 'ai_rule_check', 'ai_reference_match'];
const TEXT_AI_VALIDATION_MODES = ['ai_text_check'];
const SYSTEM_VALIDATION_MODES = ['auto', 'keyword'];

function createTaskValidationService({
  parseJsonField,
  normalizeNullableString,
  normalizeBoolean
}) {
  function prepareTaskValidationSettings(body = {}) {
    const requestedTaskType = ALLOWED_TASK_TYPES.includes(body.task_type) ? body.task_type : 'qa';
    const validationModeInput = normalizeNullableString(body.validation_mode) || 'auto';
    let validationMode = validationModeInput;

    if (validationMode === 'manual') {
      if (requestedTaskType === 'photo') validationMode = 'ai_rule_check';
      else if (requestedTaskType === 'qa') validationMode = 'ai_text_check';
      else if (requestedTaskType === 'keyword') validationMode = 'keyword';
      else validationMode = 'auto';
    }

    const isImageAiMode = AI_VALIDATION_MODES.includes(validationMode);
    const isTextAiMode = TEXT_AI_VALIDATION_MODES.includes(validationMode);
    const isAiMode = isImageAiMode || isTextAiMode;

    if (!isAiMode && !SYSTEM_VALIDATION_MODES.includes(validationMode)) {
      if (requestedTaskType === 'photo') validationMode = 'ai_rule_check';
      else if (requestedTaskType === 'qa') validationMode = 'ai_text_check';
      else if (requestedTaskType === 'keyword') validationMode = 'keyword';
      else validationMode = 'auto';
    }

    const submissionType = isImageAiMode ? 'image' : 'answer';
    const taskType = isImageAiMode ? 'photo' : requestedTaskType;

    const rawAiConfig = parseJsonField(body.ai_config, null) || {};
    const rawPassCriteria = parseJsonField(body.pass_criteria, null) || {};

    if (!isAiMode) {
      return {
        taskType,
        submissionType,
        validationMode,
        aiConfigJson: null,
        passCriteriaJson: null,
        failureMessage: normalizeNullableString(body.failure_message),
        successMessage: normalizeNullableString(body.success_message),
        maxAttempts: body.max_attempts ? Number(body.max_attempts) : null,
        locationRequired: normalizeBoolean(body.location_required),
        isAiMode: false
      };
    }

    const aiConfig = {
      system_prompt: normalizeNullableString(rawAiConfig.system_prompt),
      user_prompt: normalizeNullableString(rawAiConfig.user_prompt),
      target_label: normalizeNullableString(rawAiConfig.target_label),
      answer_guardrails: normalizeNullableString(rawAiConfig.answer_guardrails)
    };

    const passCriteria = {
      target_label: normalizeNullableString(rawPassCriteria.target_label),
      target_count: rawPassCriteria.target_count === undefined || rawPassCriteria.target_count === null || rawPassCriteria.target_count === ''
        ? null
        : Number(rawPassCriteria.target_count),
      min_score: rawPassCriteria.min_score === undefined || rawPassCriteria.min_score === null || rawPassCriteria.min_score === ''
        ? null
        : Number(rawPassCriteria.min_score),
      min_confidence: rawPassCriteria.min_confidence === undefined || rawPassCriteria.min_confidence === null || rawPassCriteria.min_confidence === ''
        ? null
        : Number(rawPassCriteria.min_confidence),
      all_rules_must_pass: normalizeBoolean(rawPassCriteria.all_rules_must_pass),
      strict_label_match: normalizeBoolean(rawPassCriteria.strict_label_match)
    };

    if (!aiConfig.user_prompt) {
      throw new Error('AI 任務必須設定 AI 使用者提示詞');
    }

    if (isTextAiMode && taskType !== 'qa') {
      throw new Error('AI 文字判定目前僅支援問答題型');
    }

    if (validationMode === 'ai_count') {
      if (!aiConfig.target_label && !passCriteria.target_label) {
        throw new Error('AI 數量判斷任務必須設定目標標籤');
      }
      if (!Number.isFinite(passCriteria.target_count) || passCriteria.target_count <= 0) {
        throw new Error('AI 數量判斷任務必須設定有效的目標數量');
      }
    }

    if (validationMode === 'ai_identify') {
      if (!aiConfig.target_label && !passCriteria.target_label) {
        throw new Error('AI 指定物辨識任務必須設定目標標籤');
      }
    }

    if (validationMode === 'ai_score') {
      if (!Number.isFinite(passCriteria.min_score)) {
        throw new Error('AI 圖像評分任務必須設定最低通過分數');
      }
    }

    if (validationMode === 'ai_reference_match') {
      passCriteria.target_label = passCriteria.target_label || aiConfig.target_label || 'reference_location';
    }

    if (validationMode === 'ai_rule_check' && !passCriteria.all_rules_must_pass) {
      passCriteria.all_rules_must_pass = true;
    }

    if (passCriteria.min_confidence !== null && (!Number.isFinite(passCriteria.min_confidence) || passCriteria.min_confidence < 0 || passCriteria.min_confidence > 1)) {
      throw new Error('最低信心值必須介於 0 到 1');
    }

    const maxAttempts = body.max_attempts ? Number(body.max_attempts) : null;
    if (maxAttempts !== null && (!Number.isFinite(maxAttempts) || maxAttempts <= 0)) {
      throw new Error('max_attempts 必須為正整數');
    }

    return {
      taskType,
      submissionType,
      validationMode,
      aiConfigJson: JSON.stringify(aiConfig),
      passCriteriaJson: JSON.stringify(passCriteria),
      failureMessage: normalizeNullableString(body.failure_message),
      successMessage: normalizeNullableString(body.success_message),
      maxAttempts,
      locationRequired: normalizeBoolean(body.location_required),
      isAiMode: true
    };
  }

  return {
    prepareTaskValidationSettings
  };
}

module.exports = {
  ALLOWED_TASK_TYPES,
  AI_VALIDATION_MODES,
  TEXT_AI_VALIDATION_MODES,
  SYSTEM_VALIDATION_MODES,
  createTaskValidationService
};
