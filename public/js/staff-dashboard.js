// ============================================================
// staff-dashboard-v2.js — 沙丘內容控制台 V2
// Sidebar + Drill-down + Right Drawer architecture
// Backend API unchanged — only presentation layer refactored
// ============================================================

const loginUser = window.loginUser || JSON.parse(localStorage.getItem('loginUser') || 'null');
if (!loginUser || (loginUser.role !== 'admin' && loginUser.role !== 'shop')) {
  window.location.href = '/login.html';
}

const API_BASE = '';

// ── Global State ──────────────────────────────────────────────
let globalQuestChainsMap = {};
let globalTaskRecords = [];
let globalBoardMaps = [];
let globalModelsMap = {};
let globalItemsMap = {};

// Current drill-down context
let currentQuestChainId = null;
let currentQuestChainTitle = '';
let currentQuestChainMode = '';

// Drawer state
let activeFormId = null;

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

// ── View Switching ────────────────────────────────────────────
function switchView(viewId) {
  document.querySelectorAll('.v2-view').forEach(el => el.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');

  // Update sidebar active state only for top-level views
  const navMap = {
    'view-quest-chains': 'view-quest-chains',
    'view-quest-detail': 'view-quest-chains', // keep parent highlighted
    'view-assets': 'view-assets',
    'view-settings': 'view-settings'
  };
  const targetNav = navMap[viewId] || viewId;
  document.querySelectorAll('.v2-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === targetNav);
  });
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
  section.classList.add('active');

  const form = section.querySelector('form');
  activeFormId = form ? form.id : null;

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

  drawer.classList.add('open');
  overlay.classList.add('open');
}

function closeDrawer() {
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  activeFormId = null;
}

function submitActiveForm() {
  if (!activeFormId) return;
  const form = document.getElementById(activeFormId);
  if (form.reportValidity()) {
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }
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
  document.getElementById('bpModeText').textContent = c.modeText;
  document.getElementById('bpJudgeText').textContent = c.judgeText;
  document.getElementById('bpSummaryText').textContent = c.summary;

  if (!preserveValues) {
    const catSel = document.getElementById('taskCategorySelect');
    const typeSel = document.getElementById('taskTypeSelect');
    const valSel = document.getElementById('validationModeSelect');
    if (catSel) { catSel.value = c.defaults.category; catSel.dispatchEvent(new Event('change')); }
    if (typeSel) { typeSel.value = c.defaults.taskType; typeSel.dispatchEvent(new Event('change')); }
    if (valSel) { valSel.value = c.defaults.validationMode; valSel.dispatchEvent(new Event('change')); }
  }
}

function inferBlueprintFromTask(task) {
  if (task?.validation_mode === 'ai_reference_match') return 'story_reference_match';
  if (task?.validation_mode === 'ai_score') return 'story_ai_score';
  if (task?.validation_mode === 'ai_count' && task?.type !== 'quest') return 'board_ai_count';
  if (task?.validation_mode === 'manual' && task?.type !== 'quest') return 'board_event';
  return 'story_ai_identify';
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
  return fetch(`${API_BASE}/api/quest-chains`, {
    headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      globalQuestChainsMap = {};
      data.questChains.forEach(q => { globalQuestChainsMap[q.id] = q; });

      // Update quest chain select in task form
      const sel = document.getElementById('questChainSelect');
      if (sel) {
        sel.innerHTML = '<option value="">-- 請選擇 --</option>';
        data.questChains.forEach(q => {
          sel.innerHTML += `<option value="${q.id}">${escHtml(q.title)}</option>`;
        });
      }

      renderQuestChainList(data.questChains);
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
      <div class="quest-card">
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
          <button class="btn-sm btn-secondary-v2" onclick="goToQuestDetail('${q.id}')">管理內容</button>
          <button class="btn-sm btn-secondary-v2" onclick="editQuestChain('${q.id}')">編輯</button>
          <button class="btn-sm btn-danger-v2" onclick="deleteQuestChain('${q.id}')">刪除</button>
        </div>
      </div>
    `;
  }).join('');
}

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
  if (!confirm('確定要刪除此玩法入口嗎？\n如果底下還有關卡，將無法刪除。')) return;
  fetch(`${API_BASE}/api/quest-chains/${id}`, {
    method: 'DELETE', headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) { showToast('已刪除'); loadQuestChains(); }
      else showToast(d.message || '刪除失敗', 'error');
    });
}

// ── Quest Chain Form Submit ───────────────────────────────────
document.getElementById('questChainForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.id.value;

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

  // NOTE: backend currently only supports POST for quest chains (no PUT endpoint for updating)
  // If editing, we use the same POST approach but include the id
  const url = id ? `${API_BASE}/api/quest-chains` : `${API_BASE}/api/quest-chains`;
  fetch(url, {
    method: 'POST',
    headers: { 'x-username': loginUser.username },
    body: fd
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast(id ? '更新成功' : '建立成功');
        closeDrawer();
        loadQuestChains();
      } else {
        showToast(d.message || '操作失敗', 'error');
      }
    })
    .catch(() => showToast('伺服器連線失敗', 'error'));
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

  if (q.mode_type === 'board_game') {
    loadBoardContent(questChainId);
  } else {
    loadTasksForQuest(questChainId);
  }
}

// ── Story mode: load tasks ────────────────────────────────────
function loadTasksForQuest(questChainId) {
  const container = document.getElementById('questDetailContentContainer');
  container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div>載入中...</div>';

  fetch(`${API_BASE}/api/tasks/admin`, {
    headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) { container.innerHTML = '<div class="empty-state">載入失敗</div>'; return; }

      globalTaskRecords = data.tasks || [];
      const tasks = globalTaskRecords.filter(t => String(t.quest_chain_id) === String(questChainId));
      tasks.sort((a, b) => (a.quest_order || 0) - (b.quest_order || 0));

      if (!tasks.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div>此入口尚無關卡，點右上角新增</div>';
        return;
      }

      container.innerHTML = tasks.map(t => renderTaskItem(t)).join('');
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
    <div class="task-item">
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
  const tasksPromise = fetch(`${API_BASE}/api/tasks/admin`, {
    headers: { 'x-username': loginUser.username }
  }).then(r => r.json()).then(d => {
    globalTaskRecords = d.success ? (d.tasks || []) : [];
    populateTileTaskSelect();
  });

  // Then load board content
  fetch(`${API_BASE}/api/board-maps/by-quest-chain/${questChainId}`, {
    headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(async data => {
      await tasksPromise;

      if (!data.success || !data.boardMap) {
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
      return fetch(`${API_BASE}/api/board-maps/${bm.id}/tiles`, {
        headers: { 'x-username': loginUser.username }
      });
    })
    .then(r => r ? r.json() : null)
    .then(data => {
      if (!data) return;
      if (!data.success) { container.innerHTML = '<div class="empty-state">載入格子失敗</div>'; return; }

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
      container.innerHTML = '<div class="empty-state">載入失敗</div>';
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
    <div class="task-item">
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

// ── Tile type hints ───────────────────────────────────────────
const tileTypeHints = {
  challenge: '🎯 挑戰格：玩家需完成綁定的關卡（拍照、AI 驗證等）才能通過。',
  event: '✨ 事件格：觸發一段劇情或事件文案，不需要挑戰。',
  supply: '💊 補給格：自動給予玩家加分或道具，可設定效果。',
  fortune: '🔮 命運格：隨機抽取一個效果（好或壞），在事件文案裡用分號分隔多個選項。',
  chance: '🎲 機會格：類似命運格但偏向正面效果，適合獎勵型隨機事件。',
  reward: '🎁 獎勵格：給予玩家額外獎勵積分或道具。',
  penalty: '💀 懲罰格：扣分或退後，增加遊戲緊張感。',
  story: '📖 劇情格：展示教育內容或故事文案，適合嵌入課程知識點。',
  teleport: '🌀 傳送格：將玩家傳送到指定格子（在效果數值填入目標格編號）。',
  quiz: '📝 小考格：到達此格時出一道隨堂問答，答對加分答錯扣分。把題目寫在事件文案。',
  rest: '☕ 休息格：什麼都不發生，讓玩家喘口氣。',
  finish: '🏁 終點格：到達即完成遊戲，觸發結算。'
};

const tileTypeSelect = document.getElementById('tileTypeSelect');
if (tileTypeSelect) {
  tileTypeSelect.addEventListener('change', () => {
    const hint = document.getElementById('tileTypeHint');
    if (hint) hint.textContent = tileTypeHints[tileTypeSelect.value] || '';
  });
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
  // Reset type hint
  const hint = document.getElementById('tileTypeHint');
  if (hint) hint.textContent = tileTypeHints.challenge || '';
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
  form.elements.task_id.value = tile.task_id || '';
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

  // Update hint
  const hint = document.getElementById('tileTypeHint');
  if (hint) hint.textContent = tileTypeHints[tile.tile_type] || '';

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

  const payload = {
    tile_index: Number(form.elements.tile_index.value),
    tile_name: form.elements.tile_name.value.trim(),
    tile_type: form.elements.tile_type.value,
    task_id: form.elements.task_id.value || null,
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

  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast(id ? '格子更新成功' : '格子建立成功');
        closeDrawer();
        if (currentQuestChainId) loadBoardContent(currentQuestChainId);
      } else { msgEl.textContent = d.message || '操作失敗'; }
    })
    .catch(() => { msgEl.textContent = '伺服器連線失敗'; });
});

// ── Delete Tile ───────────────────────────────────────────────
function deleteTile(tileId) {
  if (!confirm('確定要刪除這個格子嗎？')) return;
  fetch(`${API_BASE}/api/board-tiles/${tileId}`, {
    method: 'DELETE', headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast('格子已刪除');
        if (currentQuestChainId) loadBoardContent(currentQuestChainId);
      } else showToast(d.message || '刪除失敗', 'error');
    });
}

// ── Task Drawer: Open for create ──────────────────────────────
function openTaskDrawerForCreate() {
  openDrawer('新增關卡', 'form-task');
  const form = document.getElementById('taskForm');

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

  // Apply default blueprint
  const bpSel = document.getElementById('taskBlueprintSelect');
  bpSel.value = 'story_ai_identify';
  applyBlueprint('story_ai_identify', false);
}

// ── Task Drawer: Open for edit ────────────────────────────────
function editTask(taskId) {
  fetch(`${API_BASE}/api/tasks/${taskId}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      const t = data.task;

      openDrawer('編輯關卡', 'form-task');
      const form = document.getElementById('taskForm');

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
    });
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
      const uploadRes = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST', headers: { 'x-username': loginUser.username }, body: fd
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) { msgEl.textContent = uploadData.message || '圖片上傳失敗'; return; }
      photoUrl = uploadData.url;
    }

    // Upload AR image if provided
    let arImageUrl = document.getElementById('taskArImageUrl').value || null;
    const arImageFile = form.arImage?.files[0];
    if (arImageFile) {
      msgEl.textContent = '場景圖上傳中...';
      const arFd = new FormData();
      arFd.append('photo', arImageFile);
      const arRes = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST', headers: { 'x-username': loginUser.username }, body: arFd
      });
      const arData = await arRes.json();
      if (arData.success) arImageUrl = arData.url;
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
      bgm_url: bgmUrl
    };

    msgEl.textContent = id ? '更新中...' : '建立中...';
    const url = id ? `${API_BASE}/api/tasks/${id}` : `${API_BASE}/api/tasks`;
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      showToast(id ? '關卡更新成功' : '關卡建立成功');
      closeDrawer();
      if (currentQuestChainId) {
        if (currentQuestChainMode === 'board_game') loadBoardContent(currentQuestChainId);
        else loadTasksForQuest(currentQuestChainId);
      }
    } else {
      msgEl.textContent = result.message || '操作失敗';
    }
  } catch (err) {
    console.error(err);
    msgEl.textContent = '伺服器連線失敗';
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
  if (!confirm('確定要刪除這個關卡嗎？')) return;
  fetch(`${API_BASE}/api/tasks/${taskId}`, {
    method: 'DELETE', headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast('已刪除');
        if (currentQuestChainId) {
          if (currentQuestChainMode === 'board_game') loadBoardContent(currentQuestChainId);
          else loadTasksForQuest(currentQuestChainId);
        }
      } else showToast(d.message || '刪除失敗', 'error');
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

// ── Init: Load everything ─────────────────────────────────────
Promise.all([loadQuestChains(), loadItems(), loadARModels()]).then(() => {
  // Ready
});
