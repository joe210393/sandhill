// ============================================================
// staff-dashboard-v2.js — 沙丘內容控制台 V2
// Sidebar + Drill-down + Right Drawer architecture
// Backend API unchanged — only presentation layer refactored
// ============================================================

let loginUser = null;

const API_BASE = '';

// ── Global State ──────────────────────────────────────────────
let globalQuestChainsMap = {};
let globalTaskRecords = [];
let globalBoardMaps = [];
let globalModelsMap = {};
let globalItemsMap = {};
let globalNpcMap = {};

// Current drill-down context
let currentQuestChainId = null;
let currentQuestChainTitle = '';
let currentQuestChainMode = '';
let currentDetailViewMode = 'list';
let currentStructureMap = null;
let currentStructureSelection = null;
let lastMutatedQuestChainId = null;
let lastMutatedTaskId = null;
let lastMutatedTileId = null;

// Drawer state
let activeFormId = null;
let taskWizardStep = 1;
const TASK_WIZARD_TOTAL_STEPS = 4;
let currentWizardModeLabel = '劇情主線';
const DRAWER_FORM_ID_MAP = {
  'form-quest-chain': 'questChainForm',
  'form-task': 'taskForm',
  'form-tile': 'tileForm',
  'form-item': 'itemForm',
  'form-asset': 'assetForm',
  'form-product': 'productForm',
  'form-import-users': 'importUsersForm'
};

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

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.headers || {})
    }
  });
  return res;
}

async function apiJson(url, options = {}) {
  const res = await apiFetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error('伺服器回應格式異常');
  }
  if (res.status === 401) {
    localStorage.removeItem('loginUser');
    window.location.href = '/login.html';
    throw new Error(data?.message || '登入已失效，請重新登入');
  }
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || '操作失敗');
  }
  return data;
}

function withActorHeaders(extra = {}) {
  return loginUser?.username
    ? { ...extra, 'x-username': loginUser.username }
    : extra;
}

function scrollToFirstInvalid(root) {
  const invalid = root?.querySelector(':invalid');
  if (invalid?.scrollIntoView) {
    invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    invalid.focus?.();
  }
}

// ── View Switching ────────────────────────────────────────────
function switchView(viewId) {
  document.querySelectorAll('.v2-view').forEach(el => el.classList.remove('active'));
  document.getElementById(viewId)?.classList.add('active');

  const navMap = {
    'view-quest-chains': 'view-quest-chains',
    'view-quest-detail': 'view-quest-chains',
    'view-assets': 'view-assets',
    'view-products': 'view-products',
    'view-redemptions': 'view-redemptions',
    'view-pos': 'view-pos',
    'view-users': 'view-users',
    'view-roles': 'view-roles'
  };
  const targetNav = navMap[viewId] || viewId;
  document.querySelectorAll('.v2-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === targetNav);
  });

  // Lazy-load data for new views
  if (viewId === 'view-products') loadProducts();
  if (viewId === 'view-redemptions') loadRedemptions();
  if (viewId === 'view-pos') loadPosHistory();
  if (viewId === 'view-users') loadUsers(1);
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

function openDrawer(title, formSectionId, data) {
  drawerTitle.textContent = title;

  document.querySelectorAll('.drawer-form-section').forEach(el => el.classList.remove('active'));
  const section = document.getElementById(formSectionId);
  if (!section) {
    activeFormId = null;
    syncDrawerFooter();
    showToast(`找不到表單區塊：${formSectionId}`, 'error');
    return;
  }
  section.classList.add('active');

  const explicitFormId = section.dataset.formId || DRAWER_FORM_ID_MAP[formSectionId] || '';
  const form = explicitFormId ? document.getElementById(explicitFormId) : section.querySelector('form');
  activeFormId = form ? form.id : null;
  drawer.dataset.activeSection = formSectionId;

  if (data && form) {
    fillForm(form, data);
  } else if (form) {
    form.reset();
    // Clear hidden id fields
    const idField = form.querySelector('input[name="id"]');
    if (idField) idField.value = '';
    // Clear photo preview
    const preview = form.querySelector('img[id$="Preview"]');
    if (preview) preview.style.display = 'none';
  }

  section.querySelectorAll('.inline-form-msg').forEach((el) => setInlineMessage(el, ''));
  syncDrawerFooter();

  drawer.classList.add('open');
  overlay.classList.add('open');
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
  if (!form) {
    const activeSection = drawer.dataset.activeSection
      ? document.getElementById(drawer.dataset.activeSection)
      : document.querySelector('.drawer-form-section.active');
    if (activeSection) {
      const fallbackFormId = activeSection.dataset.formId || DRAWER_FORM_ID_MAP[activeSection.id] || '';
      form = fallbackFormId ? document.getElementById(fallbackFormId) : activeSection.querySelector('form');
      activeFormId = form ? form.id : null;
    }
  }
  if (!form) {
    showToast('目前沒有可儲存的表單', 'error');
    syncDrawerFooter();
    return;
  }
  if (activeFormId === 'taskForm') {
    if (taskWizardStep < TASK_WIZARD_TOTAL_STEPS) {
      goTaskWizardStep(1);
      return;
    }
  }
  if (form.reportValidity()) {
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  } else {
    scrollToFirstInvalid(activeFormId === 'taskForm' ? getTaskWizardStepElement(taskWizardStep) : form);
  }
}

function syncDrawerFooter() {
  const note = document.getElementById('drawerFooterNote');
  const backBtn = document.getElementById('drawerBackBtn');
  const nextBtn = document.getElementById('drawerNextBtn');
  const submitBtn = document.getElementById('drawerSubmitBtn');
  const hasActiveForm = !!(activeFormId && document.getElementById(activeFormId));
  const isTaskWizard = activeFormId === 'taskForm';
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
    note.textContent = '大富翁格子會直接綁到目前這張棋盤。';
  } else if (activeFormId === 'questChainForm') {
    note.textContent = '玩法入口建立後，底下的關卡與棋盤都會獨立歸屬在這個入口。';
  } else {
    note.textContent = '';
  }
}

function getTaskWizardStepElement(step) {
  return document.querySelector(`[data-task-step="${step}"]`);
}

function syncTaskWizardUI() {
  document.querySelectorAll('[data-task-step]').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.taskStep) === taskWizardStep);
  });
  document.querySelectorAll('[data-step-chip]').forEach((chip) => {
    const step = Number(chip.dataset.stepChip);
    chip.classList.toggle('active', step === taskWizardStep);
    chip.classList.toggle('done', step < taskWizardStep);
  });
  syncDrawerFooter();
}

function validateTaskWizardStep(step) {
  const stepEl = getTaskWizardStepElement(step);
  if (!stepEl) return true;
  const inputs = Array.from(stepEl.querySelectorAll('input, select, textarea'))
    .filter((el) => {
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
    modeText: '劇情主線', judgeText: '選擇題自動驗證',
    summary: '適合情境選擇、知識測驗。四選一自動判定。',
    defaults: { category: 'quest', taskType: 'multiple_choice', validationMode: 'manual' }
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
    modeText: '大富翁模式', judgeText: '人工 / 劇情事件',
    summary: '事件格或補給格，無 AI 裁判。',
    defaults: { category: 'single', taskType: 'qa', validationMode: 'manual' }
  },
  // 教育課程
  edu_observe: {
    modeText: '教育課程', judgeText: 'AI 生物辨識',
    summary: '自然觀察課程：學生拍攝指定生物或植物，AI 自動辨識驗證。適合生態踏查。',
    defaults: { category: 'quest', taskType: 'photo', validationMode: 'ai_identify' }
  },
  edu_quiz: {
    modeText: '教育課程', judgeText: '自動批改',
    summary: '隨堂測驗：可設定選擇題或填答題，系統自動批改。適合導覽後的知識複習。',
    defaults: { category: 'quest', taskType: 'multiple_choice', validationMode: 'manual' }
  },
  edu_fieldwork: {
    modeText: '教育課程', judgeText: '地點打卡驗證',
    summary: '實地考察：學生到達指定地點自動打卡完成。適合戶外教學路線。',
    defaults: { category: 'quest', taskType: 'location', validationMode: 'manual' }
  },
  edu_creative: {
    modeText: '教育課程', judgeText: 'AI 作品評分',
    summary: '創意任務：學生拍攝作品由 AI 評分。適合美術、攝影、環境設計課程。',
    defaults: { category: 'quest', taskType: 'photo', validationMode: 'ai_score' }
  }
};

function applyBlueprint(key, preserveValues) {
  const c = blueprintConfigs[key] || blueprintConfigs.story_ai_identify;
  currentWizardModeLabel = c.modeText;
  document.getElementById('bpModeText').textContent = c.modeText;
  document.getElementById('bpJudgeText').textContent = c.judgeText;
  document.getElementById('bpSummaryText').textContent = c.summary;

  if (!preserveValues) {
    const catSel = document.getElementById('taskCategorySelect');
    const typeSel = document.getElementById('taskTypeSelect');
    const valSel = document.getElementById('validationModeSelect');
    const stageTpl = document.querySelector('#taskForm [name="stage_template"]');
    if (catSel) { catSel.value = c.defaults.category; catSel.dispatchEvent(new Event('change')); }
    if (typeSel) { typeSel.value = c.defaults.taskType; typeSel.dispatchEvent(new Event('change')); }
    if (valSel) { valSel.value = c.defaults.validationMode; valSel.dispatchEvent(new Event('change')); }
    if (stageTpl) {
      stageTpl.value = c.modeText === '大富翁模式'
        ? (c.defaults.validationMode === 'manual' ? 'board_event' : 'board_challenge')
        : (c.defaults.taskType === 'multiple_choice' || c.defaults.taskType === 'keyword' ? 'quiz_gate' : 'story_intro');
    }
  }
  refreshTaskWizardPreview();
}

function inferBlueprintFromTask(task) {
  if (task?.validation_mode === 'ai_reference_match') return 'story_reference_match';
  if (task?.validation_mode === 'ai_score') return 'story_ai_score';
  if (task?.validation_mode === 'ai_count' && task?.type !== 'quest') return 'board_ai_count';
  if (task?.validation_mode === 'manual' && task?.type !== 'quest') return 'board_event';
  return 'story_ai_identify';
}

function readTaskWizardValue(selector) {
  const el = document.querySelector(selector);
  if (!el) return '';
  if (el.type === 'checkbox') return el.checked ? '是' : '';
  return (el.value || '').trim();
}

function refreshTaskWizardPreview() {
  const metaEl = document.getElementById('taskWizardPreviewMeta');
  const copyEl = document.getElementById('taskWizardPreviewCopy');
  if (!metaEl || !copyEl) return;

  const name = readTaskWizardValue('#taskForm [name="name"]') || '尚未命名的關卡';
  const category = document.getElementById('taskCategorySelect')?.selectedOptions?.[0]?.textContent?.trim() || '尚未選類型';
  const taskType = document.getElementById('taskTypeSelect')?.selectedOptions?.[0]?.textContent?.trim() || '尚未選互動';
  const validation = document.getElementById('validationModeSelect')?.selectedOptions?.[0]?.textContent?.trim() || '尚未選裁判';
  const stageTemplate = readTaskWizardValue('#taskForm [name="stage_template"]') || 'story_intro';
  const stageIntro = readTaskWizardValue('#taskForm [name="stage_intro"]');
  const storyContext = readTaskWizardValue('#taskForm [name="story_context"]');
  const guide = readTaskWizardValue('#taskForm [name="guide_content"]');
  const rescue = readTaskWizardValue('#taskForm [name="rescue_content"]');
  const hint = readTaskWizardValue('#taskForm [name="hint_text"]');
  const requiredItem = document.querySelector('#taskForm [name="required_item_id"]')?.selectedOptions?.[0]?.textContent?.trim() || '無前置道具';
  const rewardItem = document.querySelector('#taskForm [name="reward_item_id"]')?.selectedOptions?.[0]?.textContent?.trim() || '無獎勵道具';
  const bgm = readTaskWizardValue('#taskForm [name="bgm_url"]') ? '有 BGM' : '無 BGM';
  const activeText = document.querySelector('#taskForm [name="is_active"]')?.checked ? '啟用中' : '草稿中';
  const previewBits = [
    currentWizardModeLabel || '主線模式',
    category,
    taskType,
    validation,
    `模板：${stageTemplate}`,
    activeText,
    requiredItem !== '-- 無 --' ? `需求：${requiredItem}` : '無前置道具',
    rewardItem !== '-- 無 --' ? `獎勵：${rewardItem}` : '無獎勵道具',
    bgm
  ];
  metaEl.innerHTML = previewBits.map((text) => `<span class="tag tag-gray">${escHtml(text)}</span>`).join('');

  const lead = stageIntro || storyContext || `這一關會以「${name}」作為主標題。`;
  const guideLine = guide || '尚未填寫導覽補充，NPC 會先使用關卡說明作為主要台詞。';
  const hintLine = hint || '尚未設定提示文字。';
  const rescueLine = rescue || '尚未設定救援內容。';
  copyEl.innerHTML = `
    <div><strong>${escHtml(name)}</strong></div>
    <div>${escHtml(lead)}</div>
    <div style="margin-top:6px;">導覽：${escHtml(guideLine)}</div>
    <div>提示：${escHtml(hintLine)}</div>
    <div>救援：${escHtml(rescueLine)}</div>
  `;
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
  if (!sel) return;
  sel.addEventListener('change', () => {
    mcDiv.style.display = sel.value === 'multiple_choice' ? 'block' : 'none';
    saDiv.style.display = (sel.value === 'number' || sel.value === 'keyword') ? 'block' : 'none';
  });
}

const validationModeMeta = {
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

// Apply initial blueprint
applyBlueprint('story_ai_identify', false);

const taskFormEl = document.getElementById('taskForm');
if (taskFormEl) {
  taskFormEl.addEventListener('input', refreshTaskWizardPreview);
  taskFormEl.addEventListener('change', refreshTaskWizardPreview);
}

// ── AI Payload Builder ────────────────────────────────────────
function buildAiTaskPayload(form) {
  const validation_mode = form.validation_mode?.value || 'manual';
  const isAi = validation_mode.startsWith('ai_');
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
    submission_type: isAi ? 'image' : 'answer',
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
  }).then(data => {
    globalQuestChainsMap = {};
    data.questChains.forEach(q => { globalQuestChainsMap[q.id] = q; });

    const sel = document.getElementById('questChainSelect');
    if (sel) {
      sel.innerHTML = '<option value="">-- 請選擇 --</option>';
      data.questChains.forEach(q => {
        sel.innerHTML += `<option value="${q.id}">${escHtml(q.title)}</option>`;
      });
    }

    renderQuestChainList(data.questChains);
  }).catch(err => {
    document.getElementById('questChainListContainer').innerHTML =
      `<div class="empty-state"><div class="empty-state-icon">⚠️</div>${escHtml(err.message || '載入失敗')}</div>`;
  });
}

function renderQuestChainList(chains) {
  const container = document.getElementById('questChainListContainer');
  if (!chains.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div>目前沒有玩法入口，點右上角新增</div>';
    return;
  }
  container.innerHTML = chains.map(q => {
    const modeTag = q.mode_type === 'board_game' ? '<span class="tag tag-green">大富翁</span>' : '<span class="tag tag-blue">劇情主線</span>';
    const statusTag = q.is_active
      ? '<span class="tag tag-green">已開放</span>'
      : '<span class="tag tag-red">未開放</span>';
    return `
      <div class="quest-card ${String(lastMutatedQuestChainId) === String(q.id) ? 'highlight' : ''}" data-quest-id="${q.id}">
        <div style="min-width:0;">
          <div class="quest-card-title">${escHtml(q.title)}</div>
          <div class="quest-card-meta">
            ${modeTag} ${statusTag}
            ${q.entry_scene_label ? `<span class="tag tag-gray">${escHtml(q.entry_scene_label)}</span>` : ''}
            <span class="tag tag-amber">🏆 ${q.chain_points || 0} 分</span>
            ${q.play_style ? `<span class="tag tag-gray">🎲 ${escHtml(q.play_style)}</span>` : ''}
          </div>
          ${q.short_description ? `<div style="font-size:0.85rem; color:#64748b; margin-top:6px;">${escHtml(q.short_description)}</div>` : ''}
        </div>
        <div class="quest-card-actions">
          <button class="btn-sm btn-primary-v2" onclick="goToQuestDetail('${q.id}')">管理內容</button>
          <button class="btn-sm btn-secondary-v2" onclick="goToQuestDetail('${q.id}'); setDetailContentMode('map');">結構地圖</button>
          <div class="card-menu-wrap">
            <button class="card-menu-btn" onclick="toggleCardMenu(event, 'quest-menu-${q.id}')">⋯</button>
            <div class="card-menu" id="quest-menu-${q.id}">
              <button onclick="editQuestChain('${q.id}'); closeAllCardMenus();">編輯入口</button>
              <button class="danger" onclick="deleteQuestChain('${q.id}'); closeAllCardMenus();">刪除入口</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleCardMenu(event, id) {
  event.stopPropagation();
  const menu = document.getElementById(id);
  const willOpen = !menu.classList.contains('open');
  closeAllCardMenus();
  if (willOpen) menu.classList.add('open');
}

function closeAllCardMenus() {
  document.querySelectorAll('.card-menu.open').forEach(el => el.classList.remove('open'));
}

document.addEventListener('click', closeAllCardMenus);

function editQuestChain(id) {
  const q = globalQuestChainsMap[id];
  if (!q) return;
  openDrawer('編輯玩法入口', 'form-quest-chain', {
    id: q.id, mode_type: q.mode_type, title: q.title,
    short_description: q.short_description || '', description: q.description || '',
    entry_order: q.entry_order || 0, entry_button_text: q.entry_button_text || '',
    entry_scene_label: q.entry_scene_label || '', play_style: q.play_style || '',
    chain_points: q.chain_points || 100, badge_name: q.badge_name || '',
    is_active: q.is_active
  });
}

function deleteQuestChain(id) {
  const q = globalQuestChainsMap[id];
  const hint = q ? `「${q.title}」` : '這個玩法入口';
  apiJson(`${API_BASE}/api/quest-chains/${id}/delete-impact`, {
    headers: withActorHeaders()
  }).then(({ impact }) => {
    const taskPreview = (impact.tasks || []).slice(0, 5).map((task) => {
      const orderText = task.quest_order ? `第 ${task.quest_order} 關` : '未排順序';
      return `- ${orderText}｜${task.name}`;
    });
    const boardPreview = (impact.boardMaps || []).slice(0, 4).map((map) => `- ${map.name}`);
    const summary = [
      `確定要刪除 ${hint} 嗎？`,
      '',
      '這次會一併清理下列子內容：',
      `- 關聯關卡：${impact.taskCount || 0} 個`,
      `- 大富翁棋盤：${impact.boardMapCount || 0} 張`,
      `- 棋盤格子：${impact.boardTileCount || 0} 個`,
      `- 玩家劇情進度：${impact.userQuestCount || 0} 筆`,
      `- 玩家關卡進度：${impact.userTaskCount || 0} 筆`
    ];

    if (taskPreview.length) {
      summary.push('', '關卡來源：', ...taskPreview);
    }
    if (boardPreview.length) {
      summary.push('', '棋盤來源：', ...boardPreview);
    }
    if ((impact.taskCount || 0) > taskPreview.length) {
      summary.push(`- 其餘關卡 ${impact.taskCount - taskPreview.length} 個`);
    }
    if ((impact.boardMapCount || 0) > boardPreview.length) {
      summary.push(`- 其餘棋盤 ${impact.boardMapCount - boardPreview.length} 張`);
    }
    summary.push('', '確認後系統會整包刪除，不需要再手動回頭拆關聯。');

    showConfirm(summary.join('\n'), async () => {
      try {
        const result = await apiJson(`${API_BASE}/api/quest-chains/${id}`, {
          method: 'DELETE',
          headers: withActorHeaders()
        });
        showToast(result.message || '玩法入口已刪除');
        lastMutatedQuestChainId = null;
        await loadQuestChains();
        if (String(currentQuestChainId) === String(id)) {
          switchView('view-quest-chains');
        }
      } catch (err) {
        showToast(err.message || '刪除失敗', 'error');
      }
    });
  }).catch(err => {
    showToast(err.message || '無法載入刪除影響範圍', 'error');
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
  fd.append('title', form.title.value.trim());
  fd.append('description', form.description.value.trim());
  fd.append('short_description', form.short_description.value.trim());
  fd.append('chain_points', form.chain_points.value);
  fd.append('badge_name', form.badge_name.value.trim());
  fd.append('mode_type', form.mode_type.value);
  fd.append('entry_order', form.entry_order.value);
  fd.append('entry_button_text', form.entry_button_text.value.trim());
  fd.append('entry_scene_label', form.entry_scene_label.value.trim());
  fd.append('play_style', form.play_style.value);
  fd.append('is_active', form.is_active.checked ? '1' : '0');
  const badgeFile = form.badge_image?.files[0];
  if (badgeFile) fd.append('badge_image', badgeFile);

  const url = id ? `${API_BASE}/api/quest-chains/${id}` : `${API_BASE}/api/quest-chains`;
  const method = id ? 'PUT' : 'POST';
  setInlineMessage(msgEl, id ? '入口更新中...' : '入口建立中...', 'info');
  apiJson(url, {
    method,
    headers: withActorHeaders(),
    body: fd
  })
    .then(async (result) => {
      lastMutatedQuestChainId = id || result.id || null;
      setInlineMessage(msgEl, id ? '入口已更新' : '入口已建立', 'success');
      showToast(id ? '玩法入口更新成功' : '玩法入口建立成功');
      closeDrawer();
      await loadQuestChains();
      if (id && currentQuestChainId && String(currentQuestChainId) === String(id)) {
        goToQuestDetail(String(id));
      }
    })
    .catch((err) => {
      setInlineMessage(msgEl, err.message || '操作失敗');
      showToast(err.message || '操作失敗', 'error');
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

// ── Drill-down: Load quest detail ─────────────────────────────
let currentBoardMapId = null;
let currentBoardMapName = '';
let currentBoardTiles = [];

function goToQuestDetail(questChainId) {
  const q = globalQuestChainsMap[questChainId];
  if (!q) return;

  currentQuestChainId = questChainId;
  currentQuestChainTitle = q.title;
  currentQuestChainMode = q.mode_type;

  document.getElementById('detailQuestTitle').textContent = `管理：${q.title}`;
  document.getElementById('task_locked_quest_name').textContent = q.title;
  document.getElementById('task_quest_chain_id').value = questChainId;

  // Toggle buttons based on mode
  const btnAddTask = document.getElementById('btnAddTask');
  const btnAddTile = document.getElementById('btnAddTile');
  const boardInfoBar = document.getElementById('boardMapInfoBar');

  if (q.mode_type === 'board_game') {
    btnAddTask.style.display = 'none';
    btnAddTile.style.display = 'inline-flex';
    boardInfoBar.style.display = 'block';
  } else {
    btnAddTask.style.display = 'inline-flex';
    btnAddTile.style.display = 'none';
    boardInfoBar.style.display = 'none';
  }

  switchView('view-quest-detail');
  setDetailContentMode(currentDetailViewMode || 'list');

  if (q.mode_type === 'board_game') {
    loadBoardContent(questChainId);
  } else {
    loadTasksForQuest(questChainId);
  }
  loadStructureMap(questChainId);
}

function setDetailContentMode(mode) {
  currentDetailViewMode = mode;
  document.getElementById('questDetailListMode')?.classList.toggle('active', mode === 'list');
  document.getElementById('questDetailMapMode')?.classList.toggle('active', mode === 'map');
  document.getElementById('detailModeListBtn')?.classList.toggle('active', mode === 'list');
  document.getElementById('detailModeMapBtn')?.classList.toggle('active', mode === 'map');
  const legend = document.getElementById('structureMapLegend');
  if (legend) legend.style.display = mode === 'map' ? 'flex' : 'none';
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
  const eventConfig = (() => {
    try {
      return source.event_config ? JSON.parse(source.event_config) : null;
    } catch (err) {
      return null;
    }
  })();
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
    summary.innerHTML = '<span class="structure-summary-pill">尚未選擇玩法入口</span>';
    canvas.innerHTML = '<div class="empty-state" style="width:100%;"><div class="empty-state-icon">🗺️</div>尚無結構資料</div>';
    inspectorTitle.textContent = '關卡詳情';
    inspectorLead.textContent = '點擊左側節點，可查看這一關 / 這一格的 NPC、道具、音效與驗證方式。';
    inspectorBody.innerHTML = '';
    return;
  }

  const { questChain, tasks = [], boardMaps = [], boardTiles = [] } = currentStructureMap;
  const modeType = questChain.mode_type || 'story_campaign';
  legend.style.display = 'flex';
  legend.innerHTML = [
    ['🎯', '挑戰 / 主線關卡'],
    ['🧑‍🚀', 'NPC / 導覽角色'],
    ['🎁', '道具與獎勵'],
    ['🎵', '音效 / 背景音樂'],
    ['🤖', 'AI 驗證 / 事件設定']
  ].map(([icon, text]) => `<span class="structure-legend-item"><span>${icon}</span><span>${escHtml(text)}</span></span>`).join('');
  const nodes = modeType === 'board_game'
    ? boardTiles.map(tile => buildStructureNode('tile', tile, modeType)).sort((a, b) => a.order - b.order)
    : tasks.map(task => buildStructureNode('task', task, modeType)).sort((a, b) => a.order - b.order);

  summary.innerHTML = `
    <span class="structure-summary-pill">${escHtml(questChain.title)}</span>
    <span class="structure-summary-pill">${modeType === 'board_game' ? '大富翁模式' : '劇情主線'}</span>
    <span class="structure-summary-pill">關卡 / 格子：${nodes.length}</span>
    <span class="structure-summary-pill">NPC 角色：${new Set(nodes.map(node => node.npcLabel)).size}</span>
    <span class="structure-summary-pill">背景音樂節點：${nodes.filter(node => node.audioLabel === '有背景音樂').length}</span>
    ${boardMaps.length ? `<span class="structure-summary-pill">棋盤：${boardMaps.length} 張</span>` : ''}
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

  const rootSubtitle = modeType === 'board_game' ? '大富翁玩法入口' : '劇情主線入口';
  const mapCluster = boardMaps.length
    ? `<div class="structure-cluster">
         <div class="structure-cluster-label">棋盤結構</div>
         ${boardMaps.map((map) => `
           <div class="structure-node ${currentStructureSelection?.id === `board-map-${map.id}` ? 'active highlight' : ''}" data-structure-board="${map.id}">
             <div class="structure-node-kind">${escHtml(map.play_style || 'board_game')}</div>
             <div class="structure-node-title">${escHtml(map.name)}</div>
             <div class="structure-node-meta">
               <span class="structure-badge">🧩 ${map.tile_count || 0} 格</span>
               <span class="structure-badge">🎯 ${map.challenge_tile_count || 0} 挑戰格</span>
               <span class="structure-badge">✨ ${map.event_tile_count || 0} 事件格</span>
             </div>
             <div class="structure-node-desc">起點 ${map.start_tile || 1} → 終點 ${map.finish_tile || 0}</div>
           </div>
         `).join('')}
       </div>`
    : '';

  canvas.innerHTML = `
    <div class="structure-lane-wrap">
      <div class="structure-root-node">
        <div class="structure-node-kind">${escHtml(rootSubtitle)}</div>
        <div class="structure-node-title">${escHtml(questChain.title)}</div>
        <div class="structure-node-meta" style="margin-top:10px;">
          <span class="structure-badge">${modeType === 'board_game' ? '🎲 棋盤玩法' : '📖 劇情玩法'}</span>
          ${questChain.entry_scene_label ? `<span class="structure-badge">${escHtml(questChain.entry_scene_label)}</span>` : ''}
          ${questChain.play_style ? `<span class="structure-badge">${escHtml(questChain.play_style)}</span>` : ''}
        </div>
        <div class="structure-node-desc" style="margin-top:10px;">${escHtml(questChain.short_description || questChain.description || '尚未填寫玩法說明')}</div>
      </div>
      <div class="structure-node-link"></div>
      ${mapCluster || ''}
      ${mapCluster ? '<div class="structure-node-link"></div>' : ''}
      <div class="structure-cluster">
        <div class="structure-cluster-label">${modeType === 'board_game' ? '格子 / 關卡節點' : '關卡節點'}</div>
        <div class="structure-lane">${
          nodes.map((node, index) => `
            <div class="structure-node ${currentStructureSelection.id === node.id ? 'active highlight' : ''}" data-structure-node="${node.id}">
              <div class="structure-node-kind">${node.order ? `#${node.order}｜` : ''}${escHtml(node.subtitle)}</div>
              <div class="structure-node-title">${escHtml(node.title)}</div>
              <div class="structure-node-meta">
                <span class="structure-badge">${escHtml(node.primaryLabel)}</span>
                <span class="structure-badge">${escHtml(node.npcLabel)}</span>
                ${node.requiredItem ? `<span class="structure-badge">🔐 ${escHtml(node.requiredItem)}</span>` : ''}
                ${node.rewardItem ? `<span class="structure-badge">🎁 ${escHtml(node.rewardItem)}</span>` : ''}
              </div>
              <div class="structure-node-assets">
                <div class="structure-node-asset">
                  <div class="structure-node-asset-label">音效 / 音樂</div>
                  <div class="structure-node-asset-value">${escHtml(node.audioLabel)}</div>
                </div>
                <div class="structure-node-asset">
                  <div class="structure-node-asset-label">驗證 / 規則</div>
                  <div class="structure-node-asset-value">${escHtml(node.validationLabel)}</div>
                </div>
              </div>
              <div class="structure-node-desc">${escHtml(node.description || '尚未填寫說明')}</div>
            </div>
            ${index < nodes.length - 1 ? '<div class="structure-link">→</div>' : ''}
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
        <div class="inspector-item">
          <div class="inspector-label">玩法樣式</div>
          <div class="inspector-value">${escHtml(selectedBoard.play_style || 'fixed_track_race')}</div>
        </div>
        <div class="inspector-item">
          <div class="inspector-label">關卡分布</div>
          <div class="inspector-value">${selectedBoard.challenge_tile_count || 0} 個挑戰格｜${selectedBoard.event_tile_count || 0} 個事件格</div>
        </div>
        <div class="inspector-item">
          <div class="inspector-label">路線</div>
          <div class="inspector-value">起點 ${selectedBoard.start_tile || 1} → 終點 ${selectedBoard.finish_tile || 0}</div>
        </div>
      `;
      canvas.querySelectorAll('.structure-node[data-structure-board]').forEach(nodeEl => {
        nodeEl.classList.toggle('active', nodeEl.dataset.structureBoard === String(selectedBoard.id));
      });
      canvas.querySelectorAll('.structure-node[data-structure-node]').forEach(nodeEl => nodeEl.classList.remove('active'));
    });
  });

  const selected = currentStructureSelection;
  inspectorTitle.textContent = selected.title;
  inspectorLead.textContent = selected.description || '這個節點尚未填寫補充說明。';
  inspectorBody.innerHTML = `
    <div class="inspector-grid">
      <div class="inspector-item">
        <div class="inspector-label">節點類型</div>
        <div class="inspector-value">${escHtml(selected.subtitle)}</div>
      </div>
      <div class="inspector-item">
        <div class="inspector-label">主要玩法</div>
        <div class="inspector-value">${escHtml(selected.primaryLabel)}</div>
      </div>
      <div class="inspector-item">
        <div class="inspector-label">預設 NPC</div>
        <div class="inspector-value">${escHtml(selected.npcLabel)}</div>
      </div>
      <div class="inspector-item">
        <div class="inspector-label">音效 / BGM</div>
        <div class="inspector-value">${escHtml(selected.audioLabel)}</div>
      </div>
    </div>
    <div class="inspector-item">
      <div class="inspector-label">道具關聯</div>
      <div class="inspector-value">${selected.requiredItem ? `需 ${escHtml(selected.requiredItem)}` : '無前置需求'}${selected.rewardItem ? `｜完成得 ${escHtml(selected.rewardItem)}` : ''}</div>
    </div>
    <div class="inspector-item">
      <div class="inspector-label">場景敘事 / 提示</div>
      <div class="inspector-value">${escHtml(selected.raw.stage_intro || selected.raw.story_context || selected.raw.guide_content || selected.raw.hint_text || '尚未設定提示與劇情文字')}</div>
    </div>
    <div class="inspector-item">
      <div class="inspector-label">救援內容</div>
      <div class="inspector-value">${escHtml(selected.raw.rescue_content || '尚未設定救援內容')}</div>
    </div>
    <div class="inspector-item">
      <div class="inspector-label">驗證 / 節點資訊</div>
      <div class="inspector-value">${escHtml(selected.validationLabel)}</div>
    </div>
    <div class="inspector-item">
      <div class="inspector-label">模板 / 事件設定</div>
      <div class="inspector-value">${escHtml(selected.stageTemplate || '未指定模板')}${selected.eventConfig ? `<br>${escHtml(JSON.stringify(selected.eventConfig))}` : ''}</div>
    </div>
  `;
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

// ── Story mode: load tasks ────────────────────────────────────
function loadTasksForQuest(questChainId) {
  const container = document.getElementById('questDetailContentContainer');
  container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div>載入中...</div>';

  apiJson(`${API_BASE}/api/tasks/admin`, {
    headers: withActorHeaders()
  })
    .then(data => {
      globalTaskRecords = data.tasks || [];
      const tasks = globalTaskRecords.filter(t => String(t.quest_chain_id) === String(questChainId));
      tasks.sort((a, b) => (a.quest_order || 0) - (b.quest_order || 0));

      if (!tasks.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div>此入口尚無關卡，點右上角新增</div>';
        return;
      }

      container.innerHTML = tasks.map(t => renderTaskItem(t)).join('');
    })
    .catch(err => {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div>${escHtml(err.message || '載入失敗')}</div>`;
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

  return `
    <div class="task-item ${String(lastMutatedTaskId) === String(t.id) ? 'highlight' : ''}" data-task-id="${t.id}">
      <img src="${escHtml(t.photoUrl || '/images/mascot.png')}" class="task-item-img" onerror="this.src='/images/mascot.png'">
      <div class="task-item-body">
        <div class="task-item-title">${escHtml(t.name)}</div>
        <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:4px;">
          ${orderTag} ${finalTag}
          <span class="tag tag-gray">${typeLabel}</span>
          <span class="tag tag-gray">💰 ${t.points || 0}</span>
          <span class="tag tag-gray">📍 ${Number(t.lat).toFixed(4)}, ${Number(t.lng).toFixed(4)}</span>
        </div>
        <div class="task-item-desc">${escHtml(t.description || '')}</div>
      </div>
      <div class="task-item-actions">
        <button class="btn-sm btn-secondary-v2" onclick="editTask('${t.id}')">編輯</button>
        <button class="btn-sm btn-secondary-v2" onclick="duplicateTask('${t.id}')">複製</button>
        <button class="btn-sm btn-danger-v2" onclick="deleteTask('${t.id}')">刪除</button>
      </div>
    </div>
  `;
}

// ── Board game mode: load board map + tiles ───────────────────
function loadBoardContent(questChainId) {
  const container = document.getElementById('questDetailContentContainer');
  container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div>載入大富翁地圖...</div>';

  // First load all tasks for tile binding
  const tasksPromise = apiJson(`${API_BASE}/api/tasks/admin`, {
    headers: withActorHeaders()
  }).then(d => {
    globalTaskRecords = d.tasks || [];
    populateTileTaskSelect();
  }).catch(() => {
    globalTaskRecords = [];
  });

  // Then load board content
  apiJson(`${API_BASE}/api/board-maps/by-quest-chain/${questChainId}`, {
    headers: withActorHeaders()
  })
    .then(async data => {
      await tasksPromise;

      if (!data.boardMap) {
        document.getElementById('boardMapInfoBar').innerHTML = '<span style="color:#94a3b8;">尚未建立地圖，請先在舊版後台建立大富翁地圖。</span>';
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗺️</div>此入口尚未綁定大富翁地圖</div>';
        return;
      }

      const bm = data.boardMap;
      currentBoardMapId = bm.id;
      currentBoardMapName = bm.name;

      // Update info bar
      document.getElementById('boardMapName').textContent = `🗺️ ${bm.name}`;
      document.getElementById('boardMapStyle').textContent = `🎲 ${bm.play_style || 'fixed_track_race'}`;
      document.getElementById('boardMapTileCount').textContent = `🧩 ${bm.tile_count || 0} 格`;
      document.getElementById('boardMapDice').textContent = `🎯 骰子 ${bm.dice_min || 1}-${bm.dice_max || 6}`;
      document.getElementById('boardMapRange').textContent = `🏁 ${bm.start_tile || 1} → ${bm.finish_tile || 8}`;

      // Update tile form context
      document.getElementById('tile_board_map_id').value = bm.id;
      document.getElementById('tile_locked_map_name').textContent = bm.name;

      // Load tiles
      return apiJson(`${API_BASE}/api/board-maps/${bm.id}/tiles`, {
        headers: withActorHeaders()
      });
    })
    .then(data => {
      if (!data) return;

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
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div>${escHtml(err.message || '載入失敗')}</div>`;
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
    <div class="task-item ${String(lastMutatedTileId) === String(tile.id) ? 'highlight' : ''}" data-tile-id="${tile.id}">
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
  globalTaskRecords.forEach(t => {
    const kind = t.validation_mode?.startsWith('ai_') ? 'AI 挑戰' : (t.task_type || '一般');
    sel.innerHTML += `<option value="${t.id}">${escHtml(t.name)}｜${kind}</option>`;
  });
  sel.value = cur;
}

// ── Tile Drawer: Open for create ──────────────────────────────
function openTileDrawerForCreate() {
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

  apiJson(url, {
    method,
    headers: withActorHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  })
    .then(d => {
      lastMutatedTileId = id || d.id || null;
      setInlineMessage(msgEl, id ? '格子已更新' : '格子已建立', 'success');
      showToast(id ? '格子更新成功' : '格子建立成功');
      closeDrawer();
      if (currentQuestChainId) {
        loadBoardContent(currentQuestChainId);
        loadStructureMap(currentQuestChainId);
      }
    })
    .catch((err) => { setInlineMessage(msgEl, err.message || '操作失敗'); });
});

// ── Delete Tile ───────────────────────────────────────────────
function deleteTile(tileId) {
  showConfirm('確定要刪除這個格子嗎？若它綁定了挑戰關卡，之後需要重新安排格子順序。', async () => {
    try {
      await apiJson(`${API_BASE}/api/board-tiles/${tileId}`, {
        method: 'DELETE',
        headers: withActorHeaders()
      });
      showToast('格子已刪除');
      lastMutatedTileId = null;
      if (currentQuestChainId) {
        loadBoardContent(currentQuestChainId);
        loadStructureMap(currentQuestChainId);
      }
    } catch (err) {
      showToast(err.message || '刪除失敗', 'error');
    }
  });
}

// ── Task Drawer: Open for create ──────────────────────────────
function openTaskDrawerForCreate() {
  openDrawer('新增關卡', 'form-task');
  const form = document.getElementById('taskForm');
  activeFormId = 'taskForm';
  taskWizardStep = 1;
  syncTaskWizardUI();
  document.getElementById('drawerBackBtn')?.classList.add('hidden');
  document.getElementById('drawerNextBtn')?.classList.remove('hidden');
  document.getElementById('drawerSubmitBtn')?.classList.add('hidden');
  document.getElementById('drawerFooterNote').textContent = `新增關卡流程：第 1 / ${TASK_WIZARD_TOTAL_STEPS} 步`;
  form.reset();
  form.elements.id.value = '';

  // Auto-lock quest chain context
  if (currentQuestChainId) {
    document.getElementById('task_quest_chain_id').value = currentQuestChainId;
    document.getElementById('task_locked_quest_name').textContent = currentQuestChainTitle;
    document.getElementById('taskLockedContext').style.display = 'block';

    // Auto-set category to quest if story mode
    if (currentQuestChainMode === 'story_campaign') {
      const catSel = document.getElementById('taskCategorySelect');
      catSel.value = 'quest';
      catSel.dispatchEvent(new Event('change'));

      // Lock quest chain select to current
      const qcSel = document.getElementById('questChainSelect');
      if (qcSel) qcSel.value = currentQuestChainId;
    }
  }

  // Reset photo state
  document.getElementById('taskPhotoUrl').value = '';
  document.getElementById('taskPhotoPreview').style.display = 'none';
  document.getElementById('taskFormMsg').textContent = '';
  form.elements.stage_template.value = 'story_intro';
  form.elements.stage_intro.value = '';
  form.elements.hint_text.value = '';
  form.elements.story_context.value = '';
  form.elements.guide_content.value = '';
  form.elements.rescue_content.value = '';
  form.elements.event_config.value = '';
  form.elements.is_active.checked = true;

  // Apply default blueprint
  const bpSel = document.getElementById('taskBlueprintSelect');
  bpSel.value = 'story_ai_identify';
  applyBlueprint('story_ai_identify', false);
  refreshTaskWizardPreview();
}

// ── Task Drawer: Open for edit ────────────────────────────────
function editTask(taskId) {
  apiJson(`${API_BASE}/api/tasks/${taskId}`)
    .then(data => {
      const t = data.task;

      openDrawer('編輯關卡', 'form-task');
      const form = document.getElementById('taskForm');
      activeFormId = 'taskForm';
      taskWizardStep = 1;
      syncTaskWizardUI();
      document.getElementById('drawerBackBtn')?.classList.add('hidden');
      document.getElementById('drawerNextBtn')?.classList.remove('hidden');
      document.getElementById('drawerSubmitBtn')?.classList.add('hidden');
      document.getElementById('drawerFooterNote').textContent = `新增關卡流程：第 1 / ${TASK_WIZARD_TOTAL_STEPS} 步`;

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
      valSel.value = t.validation_mode || 'manual';
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

      // Items
      const reqItemSel = form.querySelector('select[name="required_item_id"]');
      const rewItemSel = form.querySelector('select[name="reward_item_id"]');
      if (reqItemSel) reqItemSel.value = t.required_item_id || '';
      if (rewItemSel) rewItemSel.value = t.reward_item_id || '';
      form.elements.stage_template.value = t.stage_template || 'story_intro';
      form.elements.stage_intro.value = t.stage_intro || '';
      form.elements.hint_text.value = t.hint_text || '';
      form.elements.story_context.value = t.story_context || '';
      form.elements.guide_content.value = t.guide_content || '';
      form.elements.rescue_content.value = t.rescue_content || '';
      form.elements.event_config.value = t.event_config ? JSON.stringify(t.event_config, null, 2) : '';
      form.elements.is_active.checked = t.is_active !== false && t.is_active !== 0;

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
      refreshTaskWizardPreview();
    })
    .catch((err) => showToast(err.message || '載入關卡失敗', 'error'));
}

// ── Task Form Submit (Create or Update) ───────────────────────
document.getElementById('taskForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.id.value;
  const msgEl = document.getElementById('taskFormMsg');
  msgEl.textContent = '';

  const aiPayload = buildAiTaskPayload(form);
  const task_type = aiPayload.validation_mode.startsWith('ai_') ? 'photo' : form.elements.task_type.value;

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

    if (!id && !photoFile) { msgEl.textContent = '請選擇封面圖'; return; }

    if (photoFile) {
      if (photoFile.size > 5 * 1024 * 1024) { msgEl.textContent = '圖片超過 5MB'; return; }
      msgEl.textContent = '封面圖上傳中...';
      const fd = new FormData();
      fd.append('photo', photoFile);
      const uploadData = await apiJson(`${API_BASE}/api/upload`, {
        method: 'POST', headers: withActorHeaders(), body: fd
      });
      photoUrl = uploadData.url;
    }

    // Upload AR image if provided
    let arImageUrl = document.getElementById('taskArImageUrl').value || null;
    const arImageFile = form.arImage?.files[0];
    if (arImageFile) {
      msgEl.textContent = '場景圖上傳中...';
      const arFd = new FormData();
      arFd.append('photo', arImageFile);
      const arData = await apiJson(`${API_BASE}/api/upload`, {
        method: 'POST', headers: withActorHeaders(), body: arFd
      });
      arImageUrl = arData.url;
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
      bgm_url: bgmUrl,
      stage_template: form.stage_template?.value || null,
      stage_intro: form.stage_intro?.value.trim() || null,
      hint_text: form.hint_text?.value.trim() || null,
      story_context: form.story_context?.value.trim() || null,
      guide_content: form.guide_content?.value.trim() || null,
      rescue_content: form.rescue_content?.value.trim() || null,
      event_config: form.event_config?.value.trim() || null,
      is_active: form.is_active?.checked ? 1 : 0
    };

    msgEl.textContent = id ? '更新中...' : '建立中...';
    const url = id ? `${API_BASE}/api/tasks/${id}` : `${API_BASE}/api/tasks`;
    const method = id ? 'PUT' : 'POST';
    const result = await apiJson(url, {
      method,
      headers: withActorHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    lastMutatedTaskId = id || result.id || null;
    setInlineMessage(msgEl, id ? '關卡已更新' : '關卡已建立', 'success');
    showToast(id ? '關卡更新成功' : '關卡建立成功');
    closeDrawer();
    if (currentQuestChainId) {
      if (currentQuestChainMode === 'board_game') loadBoardContent(currentQuestChainId);
      else loadTasksForQuest(currentQuestChainId);
      loadStructureMap(currentQuestChainId);
    }
  } catch (err) {
    console.error(err);
    setInlineMessage(msgEl, err.message || '伺服器連線失敗');
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
  apiJson(`${API_BASE}/api/tasks/${taskId}/delete-impact`, {
    headers: withActorHeaders()
  }).then(({ task, impact }) => {
    const lines = [
      `確定要刪除「${task.name}」嗎？`,
      '',
      '這次會影響：',
      `- 所屬玩法：${task.quest_chain_title || '未綁定'}`,
      `- 玩家關卡進度：${impact.userTaskCount || 0} 筆`,
      `- 拍照 / 嘗試紀錄：${impact.taskAttemptCount || 0} 筆`,
      `- 棋盤格綁定：${impact.boardTileCount || 0} 個`
    ];
    if ((impact.boardTiles || []).length) {
      lines.push('', '關聯棋盤格：', ...impact.boardTiles.slice(0, 5).map((tile) => `- ${tile.board_map_name}｜第 ${tile.tile_index} 格｜${tile.tile_name}`));
    }
    if ((impact.userTaskCount || 0) > 0) {
      lines.push('', '系統會一併清理玩家在這關的進度資料。');
    }
    if ((impact.boardTileCount || 0) > 0) {
      lines.push('系統會保留棋盤格，但會自動解除該格與本關卡的綁定。');
    }
    showConfirm(lines.join('\n'), async () => {
      try {
        await apiJson(`${API_BASE}/api/tasks/${taskId}`, {
          method: 'DELETE',
          headers: withActorHeaders()
        });
        showToast('關卡已刪除');
        lastMutatedTaskId = null;
        if (currentQuestChainId) {
          if (currentQuestChainMode === 'board_game') loadBoardContent(currentQuestChainId);
          else loadTasksForQuest(currentQuestChainId);
          loadStructureMap(currentQuestChainId);
        }
      } catch (err) {
        showToast(err.message || '刪除失敗', 'error');
      }
    });
  }).catch((err) => {
    showToast(err.message || '無法載入關卡影響範圍', 'error');
  });
}

function duplicateTask(taskId) {
  showConfirm('確定要複製這個關卡嗎？系統會建立一顆新的關卡，不會影響原本那一顆。', async () => {
    try {
      const result = await apiJson(`${API_BASE}/api/tasks/${taskId}/duplicate`, {
        method: 'POST',
        headers: withActorHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ quest_chain_id: currentQuestChainId || null })
      });
      lastMutatedTaskId = result.id || null;
      showToast('關卡已複製');
      if (currentQuestChainId) {
        if (currentQuestChainMode === 'board_game') loadBoardContent(currentQuestChainId);
        else loadTasksForQuest(currentQuestChainId);
        loadStructureMap(currentQuestChainId);
      }
    } catch (err) {
      showToast(err.message || '複製失敗', 'error');
    }
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
}

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
  // Auto-select first visible nav item
  const firstVisible = document.querySelector('.v2-nav-item[style*="flex"], .v2-nav-item:not([style*="none"])');
  if (firstVisible) {
    document.querySelectorAll('.v2-nav-item').forEach(n => n.classList.remove('active'));
    firstVisible.classList.add('active');
    switchView(firstVisible.dataset.view);
  }
  // Hide create account section for shop role
  const createSection = document.getElementById('roleSection_createAccount');
  if (createSection) createSection.style.display = role === 'admin' ? 'block' : 'none';
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
function loadProducts() {
  return fetch(`${API_BASE}/api/products/admin`, { headers: { 'x-username': loginUser.username } })
    .then(r => r.json()).then(data => {
      if (!data.success) return;
      globalProducts = data.products || [];
      renderProducts();
    }).catch(() => {});
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
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <span class="tag tag-amber">💰 ${p.points_required} 分</span>
        <span class="tag tag-gray">庫存 ${p.stock ?? '∞'}</span>
        <span class="tag ${p.is_active ? 'tag-green' : 'tag-red'}">${p.is_active ? '上架中' : '已下架'}</span>
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
    fetch(`${API_BASE}/api/products/${id}`, { method: 'DELETE', headers: { 'x-username': loginUser.username } })
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
  fetch(url, { method, headers: { 'x-username': loginUser.username }, body: fd })
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
  fetch(`${API_BASE}/api/product-redemptions/admin`, { headers: { 'x-username': loginUser.username } })
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
              <span class="tag tag-gray">${r.created_at ? new Date(r.created_at).toLocaleString('zh-TW') : ''}</span>
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
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      body: JSON.stringify({ status: 'completed' })
    }).then(r => r.json()).then(d => { if (d.success) { showToast('兌換已完成'); loadRedemptions(); } else showToast(d.message || '失敗', 'error'); });
  });
}

function cancelRedemption(id) {
  showConfirm('確定取消此兌換？', () => {
    fetch(`${API_BASE}/api/product-redemptions/${id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      body: JSON.stringify({ status: 'cancelled' })
    }).then(r => r.json()).then(d => { if (d.success) { showToast('兌換已取消'); loadRedemptions(); } else showToast(d.message || '失敗', 'error'); });
  });
}

// ── POS Coupon ────────────────────────────────────────────────
function lookupCoupon() {
  const code = document.getElementById('couponCodeInput').value.trim();
  if (!code) { showToast('請輸入代碼', 'error'); return; }
  const result = document.getElementById('couponResult');
  result.style.display = 'none';
  fetch(`${API_BASE}/api/coupons/lookup/${encodeURIComponent(code)}`, { headers: { 'x-username': loginUser.username } })
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
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username }
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('核銷成功！'); document.getElementById('couponResult').style.display = 'none'; document.getElementById('couponCodeInput').value = ''; loadPosHistory(); }
    else showToast(d.message || '核銷失敗', 'error');
  });
}

function loadPosHistory() {
  fetch(`${API_BASE}/api/coupons/redeem-history`, { headers: { 'x-username': loginUser.username } })
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
function loadUsers(page) {
  currentUserPage = page || 1;
  fetch(`${API_BASE}/api/admin/users?page=${currentUserPage}&limit=50`, { headers: { 'x-username': loginUser.username } })
    .then(r => r.json()).then(data => {
      if (!data.success) return;
      document.getElementById('totalUserCount').textContent = data.total || data.users?.length || 0;
      const c = document.getElementById('userListContainer');
      if (!data.users?.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div>尚無會員</div>'; return; }
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
      // Pagination
      const totalPages = Math.ceil((data.total || data.users.length) / 50);
      const pag = document.getElementById('userPagination');
      if (totalPages <= 1) { pag.innerHTML = ''; return; }
      pag.innerHTML = Array.from({length: totalPages}, (_, i) =>
        `<button class="btn-sm ${i+1 === currentUserPage ? 'btn-primary-v2' : 'btn-secondary-v2'}" onclick="loadUsers(${i+1})">${i+1}</button>`
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
  fetch(`${API_BASE}/api/admin/import-users`, { method: 'POST', headers: { 'x-username': loginUser.username }, body: fd })
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
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    body: JSON.stringify({ role, username, password })
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('帳號建立成功'); document.getElementById('newAccountUsername').value = ''; document.getElementById('newAccountPassword').value = ''; }
    else showToast(d.message || '建立失敗', 'error');
  });
}

function assignStaff() {
  const phone = document.getElementById('staffPhoneInput').value.trim();
  if (!phone) { showToast('請輸入手機號碼', 'error'); return; }
  fetch(`${API_BASE}/api/staff/assign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    body: JSON.stringify({ phone })
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('已指派為工作人員'); document.getElementById('staffPhoneInput').value = ''; }
    else showToast(d.message || '指派失敗', 'error');
  });
}

function revokeStaff() {
  const phone = document.getElementById('staffPhoneInput').value.trim();
  if (!phone) { showToast('請輸入手機號碼', 'error'); return; }
  showConfirm(`確定要撤銷 ${phone} 的工作人員權限嗎？`, () => {
    fetch(`${API_BASE}/api/staff/revoke`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      body: JSON.stringify({ phone })
    }).then(r => r.json()).then(d => {
      if (d.success) { showToast('已撤銷'); document.getElementById('staffPhoneInput').value = ''; }
      else showToast(d.message || '撤銷失敗', 'error');
    });
  });
}

function changePassword() {
  const oldPw = document.getElementById('oldPasswordInput').value;
  const newPw = document.getElementById('newPasswordInput').value;
  if (!oldPw || !newPw) { showToast('請填寫密碼', 'error'); return; }
  if (newPw.length < 6) { showToast('新密碼至少 6 位', 'error'); return; }
  fetch(`${API_BASE}/api/change-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('密碼已更新'); document.getElementById('oldPasswordInput').value = ''; document.getElementById('newPasswordInput').value = ''; }
    else showToast(d.message || '更新失敗', 'error');
  });
}

function hydrateLoginHeader() {
  const info = document.getElementById('loginUserInfo');
  const roles = { admin: '管理員', shop: '工作人員', user: '玩家' };
  if (info && loginUser) {
    info.textContent = `${roles[loginUser.role] || ''}：${loginUser.username}`;
  }
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.style.display = loginUser ? 'inline-block' : 'none';
    logoutBtn.onclick = async () => {
      try {
        await apiJson(`${API_BASE}/api/logout`, { method: 'POST' });
      } catch (err) {
        // ignore logout API failure; still clear local state
      }
      localStorage.removeItem('loginUser');
      window.location.href = '/login.html';
    };
  }
}

async function bootstrapSession() {
  try {
    const data = await apiJson(`${API_BASE}/api/me`);
    loginUser = data.user;
    window.loginUser = data.user;
    localStorage.setItem('loginUser', JSON.stringify(data.user));
    hydrateLoginHeader();
    applySidebarRBAC();

    const role = loginUser?.role || '';
    const initLoads = [];
    if (role === 'admin') {
      initLoads.push(loadQuestChains(), loadItems(), loadARModels(), loadProducts());
    } else if (role === 'shop') {
      initLoads.push(loadProducts());
    }
    await Promise.all(initLoads);
  } catch (err) {
    alert('請先以管理員或工作人員登入內容控制台');
    localStorage.removeItem('loginUser');
    window.location.href = '/login.html';
  }
}

bootstrapSession();
