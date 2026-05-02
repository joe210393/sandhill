(function(global) {
  const IMAGE_AI_VALIDATION_MODES = ['ai_count', 'ai_identify', 'ai_score', 'ai_rule_check', 'ai_reference_match'];

  function parseLatLngPaste(text) {
    const value = (text || '').trim();
    const match = value.match(/(-?\d+\.?\d*)\s*[,，]\s*(-?\d+\.?\d*)/);
    if (!match) return null;
    const first = parseFloat(match[1]);
    const second = parseFloat(match[2]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
    if (first >= -90 && first <= 90 && second >= -180 && second <= 180) {
      return { lat: first, lng: second };
    }
    if (second >= -90 && second <= 90 && first >= -180 && first <= 180) {
      return { lat: second, lng: first };
    }
    return { lat: first, lng: second };
  }

  function wireLatLngPaste(inputEl, latEl, lngEl, { showToast } = {}) {
    if (!inputEl || !latEl || !lngEl) return;
    const applyParsed = (parsed) => {
      latEl.value = parsed.lat;
      lngEl.value = parsed.lng;
      if (typeof showToast === 'function') showToast('已填入緯度、經度');
    };
    const apply = () => {
      const parsed = parseLatLngPaste(inputEl.value);
      if (!parsed) return;
      applyParsed(parsed);
      inputEl.value = '';
    };
    inputEl.addEventListener('paste', (event) => {
      const text = event.clipboardData?.getData('text') || '';
      const parsed = parseLatLngPaste(text);
      if (parsed) {
        event.preventDefault();
        applyParsed(parsed);
      }
    });
    inputEl.addEventListener('blur', () => {
      if (inputEl.value.trim()) apply();
    });
  }

  function normalizeValidationModeForTaskType(taskType = 'qa', validationMode = 'auto') {
    const type = String(taskType || 'qa');
    const mode = String(validationMode || 'auto');
    const isImageAiMode = IMAGE_AI_VALIDATION_MODES.includes(mode);

    if (type === 'photo') return (mode === 'auto' || !isImageAiMode) ? 'ai_rule_check' : mode;
    if (type === 'qa') return mode === 'ai_text_check' ? mode : 'ai_text_check';
    if (type === 'keyword') return mode === 'keyword' ? mode : 'keyword';
    if (['multiple_choice', 'number', 'location'].includes(type)) return 'auto';
    return 'auto';
  }

  function buildAiTaskPayload(form) {
    const requestedTaskType = form.task_type?.value || 'qa';
    const validation_mode = normalizeValidationModeForTaskType(requestedTaskType, form.validation_mode?.value || 'auto');
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

  function validateAiPayload(payload, msgEl) {
    const mode = payload.validation_mode;
    if (!mode.startsWith('ai_')) return true;
    if (!payload.ai_config?.user_prompt) {
      msgEl.textContent = 'AI 任務請填寫使用者提示詞';
      return false;
    }
    if (mode === 'ai_text_check') return true;
    if (mode === 'ai_count' && !payload.ai_config?.target_label) {
      msgEl.textContent = '數量判斷請填目標標籤';
      return false;
    }
    if (mode === 'ai_count' && !payload.pass_criteria?.target_count) {
      msgEl.textContent = '數量判斷請填目標數量';
      return false;
    }
    if (mode === 'ai_identify' && !payload.ai_config?.target_label) {
      msgEl.textContent = '辨識任務請填目標標籤';
      return false;
    }
    if (mode === 'ai_score' && payload.pass_criteria?.min_score == null) {
      msgEl.textContent = '評分任務請填最低分數';
      return false;
    }
    return true;
  }

  global.StaffDashboardFormUtils = {
    IMAGE_AI_VALIDATION_MODES,
    parseLatLngPaste,
    wireLatLngPaste,
    normalizeValidationModeForTaskType,
    buildAiTaskPayload,
    validateAiPayload
  };
})(window);
