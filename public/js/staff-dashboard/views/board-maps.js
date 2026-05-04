// ── Delete Tile ───────────────────────────────────────────────
function deleteTile(tileId) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再刪除格子', 'error');
    return;
  }
  showConfirm('確定要刪除這個格子嗎？', () => {
    fetch(`${API_BASE}/api/board-tiles/${tileId}`, {
      method: 'DELETE',
      headers: { 'x-username': loginUser.username },
      credentials: 'include'
    })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          showToast('格子已刪除');
          if (currentQuestChainId) loadBoardContent(currentQuestChainId);
        } else showToast(d.message || '刪除失敗', 'error');
      });
  });
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

  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    credentials: 'include',
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



// ── Board map form ────────────────────────────────────────────
document.getElementById('boardMapForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const form = this;
  const msg = document.getElementById('boardMapFormMsg');
  msg.textContent = '';
  const mapId = form.elements.id.value;
  const body = {
    quest_chain_id: Number(form.quest_chain_id.value),
    name: form.name.value.trim(),
    description: form.description.value.trim() || null,
    play_style: form.play_style.value || 'fixed_track_race',
    start_tile: Number(form.start_tile.value || 1),
    finish_tile: Number(form.finish_tile.value || 8),
    dice_min: Number(form.dice_min.value || 1),
    dice_max: Number(form.dice_max.value || 6),
    failure_move: Number(form.failure_move.value),
    reward_points: Number(form.reward_points.value || 0),
    exact_finish_required: form.exact_finish_required.checked,
    is_active: form.is_active.checked
  };
  if (!body.quest_chain_id || !body.name) {
    msg.textContent = '請填寫地圖名稱';
    return;
  }
  const url = mapId ? `${API_BASE}/api/board-maps/${mapId}` : `${API_BASE}/api/board-maps`;
  const method = mapId ? 'PUT' : 'POST';
  msg.textContent = '儲存中...';
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    const d = await res.json();
    if (d.success) {
      showToast(mapId ? '地圖已更新' : '地圖已建立');
      closeDrawer();
      if (currentQuestChainId) loadBoardContent(currentQuestChainId);
    } else {
      msg.textContent = d.message || '儲存失敗';
    }
  } catch {
    msg.textContent = '連線失敗';
  }
});



// ── Tile Drawer: Open for edit ────────────────────────────────
function editTile(tileId) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再編輯格子', 'error');
    return;
  }
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

function duplicateTile(tileId) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再複製格子', 'error');
    return;
  }
  const tile = currentBoardTiles.find(t => String(t.id) === String(tileId));
  if (!tile) return;
  openTileDrawerForCreate();
  const form = document.getElementById('tileForm');
  form.elements.id.value = '';
  form.elements.tile_name.value = `${tile.tile_name || ''}（複製）`.trim();
  form.elements.tile_type.value = tile.tile_type || 'event';
  document.getElementById('tileTaskId').value = tile.task_id || '';
  const taskSel = document.getElementById('tileTaskSelect');
  if (taskSel) taskSel.value = tile.task_id || '';
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
  form.elements.is_active.checked = true;
  updateTileFormByType();
  document.getElementById('tileFormMsg').textContent = '';
}



// ── Tile Drawer: Open for create ──────────────────────────────
function openTileDrawerForCreate() {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再新增格子', 'error');
    return;
  }
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



// ── 從挑戰格建立關卡後回綁 ───────────────────────────────────
let afterTaskCreateHook = null;
let pendingTileFormSnapshot = null;

function snapshotTileForm() {
  const f = document.getElementById('tileForm');
  if (!f) return null;
  const loc = document.getElementById('tileLocationToggle');
  return {
    id: f.id.value,
    board_map_id: f.board_map_id.value,
    task_id: document.getElementById('tileTaskId').value,
    tile_type: f.tile_type.value,
    tile_name: f.tile_name.value,
    tile_index: f.tile_index.value,
    latitude: f.latitude.value,
    longitude: f.longitude.value,
    radius_meters: f.radius_meters.value,
    effect_type: f.effect_type.value,
    effect_value: f.effect_value.value,
    event_title: f.event_title.value,
    event_body: f.event_body.value,
    guide_content: f.guide_content.value,
    is_active: f.is_active.checked,
    locationToggle: loc ? loc.checked : false
  };
}

function restoreTileForm(snap) {
  if (!snap) return;
  const f = document.getElementById('tileForm');
  f.id.value = snap.id || '';
  f.board_map_id.value = snap.board_map_id || '';
  document.getElementById('tileTaskId').value = snap.task_id || '';
  f.tile_type.value = snap.tile_type || 'challenge';
  f.tile_name.value = snap.tile_name || '';
  f.tile_index.value = snap.tile_index || '';
  f.latitude.value = snap.latitude || '';
  f.longitude.value = snap.longitude || '';
  f.radius_meters.value = snap.radius_meters || '';
  f.effect_type.value = snap.effect_type || '';
  f.effect_value.value = snap.effect_value ?? '';
  f.event_title.value = snap.event_title || '';
  f.event_body.value = snap.event_body || '';
  f.guide_content.value = snap.guide_content || '';
  f.is_active.checked = snap.is_active !== false;
  const locToggle = document.getElementById('tileLocationToggle');
  const locFields = document.getElementById('tileLocationFields');
  if (locToggle) locToggle.checked = !!snap.locationToggle;
  if (locFields) locFields.style.display = snap.locationToggle ? 'block' : 'none';
  updateTileFormByType();
}

function openTaskDrawerForBoardChallenge() {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再新增挑戰關卡', 'error');
    return;
  }
  openDrawer('新增關卡（挑戰格）', 'form-task');
  const form = document.getElementById('taskForm');
  document.getElementById('task_quest_chain_id').value = currentQuestChainId || '';
  document.getElementById('task_locked_quest_name').textContent = currentQuestChainTitle || '';
  document.getElementById('taskLockedContext').style.display = 'block';
  document.getElementById('taskPhotoUrl').value = '';
  document.getElementById('taskPhotoPreview').style.display = 'none';
  document.getElementById('taskFormMsg').textContent = '';
  const catSel = document.getElementById('taskCategorySelect');
  catSel.value = 'single';
  catSel.dispatchEvent(new Event('change'));
  const qcSel = document.getElementById('questChainSelect');
  if (qcSel && currentQuestChainId) qcSel.value = currentQuestChainId;
  const bpSel = document.getElementById('taskBlueprintSelect');
  bpSel.value = 'board_ai_identify';
  applyBlueprint('board_ai_identify', false);
  window.applyTaskValidationModeUi?.();
  applyTaskStructureLockUi(null, globalQuestChainsMap[String(currentQuestChainId)] || null);
}

function openTaskDrawerFromTileChallenge() {
  pendingTileFormSnapshot = snapshotTileForm();
  afterTaskCreateHook = async newTaskId => {
    const d = await fetch(`${API_BASE}/api/tasks/admin`, {
      headers: { 'x-username': loginUser.username },
      credentials: 'include'
    }).then(r => r.json());
    globalTaskRecords = d.success ? (d.tasks || []) : globalTaskRecords;
    populateTileTaskSelect();
    openDrawer('完成格子設定', 'form-tile', null, { skipReset: true });
    restoreTileForm(pendingTileFormSnapshot);
    pendingTileFormSnapshot = null;
    const ts = document.getElementById('tileTaskSelect');
    const tid = String(newTaskId);
    if (ts && [...ts.options].some(o => o.value === tid)) {
      ts.value = tid;
      document.getElementById('tileTaskId').value = tid;
    }
    updateTileFormByType();
    showToast('已建立關卡並選取，請按儲存完成格子');
  };
  closeDrawer();
  openTaskDrawerForBoardChallenge();
}

function openBoardMapDrawer(isEdit) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再調整大富翁地圖', 'error');
    return;
  }
  const title = isEdit ? '編輯大富翁地圖' : '建立大富翁地圖';
  openDrawer(title, 'form-board-map', null, { skipReset: true });
  const form = document.getElementById('boardMapForm');
  document.getElementById('bm_locked_chain_title').textContent = currentQuestChainTitle || '—';
  document.getElementById('bm_quest_chain_id').value = currentQuestChainId || '';
  document.getElementById('boardMapFormMsg').textContent = '';

  if (isEdit && lastLoadedBoardMap) {
    const bm = lastLoadedBoardMap;
    form.elements.id.value = bm.id;
    form.elements.name.value = bm.name || '';
    form.elements.description.value = bm.description || '';
    form.elements.play_style.value = bm.play_style || 'fixed_track_race';
    form.elements.start_tile.value = bm.start_tile ?? 1;
    form.elements.finish_tile.value = bm.finish_tile ?? 8;
    form.elements.dice_min.value = bm.dice_min ?? 1;
    form.elements.dice_max.value = bm.dice_max ?? 6;
    form.elements.failure_move.value = bm.failure_move ?? -1;
    form.elements.reward_points.value = bm.reward_points ?? 0;
    form.elements.exact_finish_required.checked = !!bm.exact_finish_required;
    form.elements.is_active.checked = bm.is_active !== false && bm.is_active !== 0;
  } else {
    form.reset();
    document.getElementById('bm_locked_chain_title').textContent = currentQuestChainTitle || '—';
    document.getElementById('bm_quest_chain_id').value = currentQuestChainId || '';
    form.elements.id.value = '';
    form.elements.is_active.checked = true;
    form.elements.exact_finish_required.checked = false;
    form.elements.start_tile.value = 1;
    form.elements.finish_tile.value = 8;
    form.elements.dice_min.value = 1;
    form.elements.dice_max.value = 6;
    form.elements.failure_move.value = -1;
    form.elements.reward_points.value = 0;
  }
}



// ── Tile task select population ───────────────────────────────
function populateTileTaskSelect() {
  const sel = document.getElementById('tileTaskSelect');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- 不綁定（純事件/效果格）--</option>';
  const chainId = currentQuestChainId;
  const list = chainId
    ? globalTaskRecords.filter(t => String(t.quest_chain_id) === String(chainId))
    : globalTaskRecords;
  list.forEach(t => {
    const kind = t.validation_mode?.startsWith('ai_') ? 'AI 挑戰' : (t.task_type || '一般');
    sel.innerHTML += `<option value="${t.id}">${escHtml(t.name)}｜${kind}</option>`;
  });
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
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



// ── Board game mode: load board map + tiles ───────────────────
function loadBoardContent(questChainId) {
  const container = document.getElementById('questDetailContentContainer');
  container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div>載入大富翁地圖...</div>';

  const authHeaders = { 'x-username': loginUser.username };

  const tasksPromise = fetch(`${API_BASE}/api/tasks/admin`, {
    headers: authHeaders,
    credentials: 'include'
  })
    .then(r => r.json())
    .then(d => {
      globalTaskRecords = d.success ? (d.tasks || []) : [];
      populateTileTaskSelect();
    });

  fetch(`${API_BASE}/api/board-maps/for-admin/${questChainId}`, {
    headers: authHeaders,
    credentials: 'include'
  })
    .then(r => r.json())
    .then(async data => {
      await tasksPromise;

      if (!data.success) {
        setBoardMapToolbar(false, null);
        currentBoardMapId = null;
        currentBoardMapName = '';
        document.getElementById('tile_board_map_id').value = '';
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗺️</div>無法載入大富翁地圖</div>';
        return null;
      }

      const maps = data.boardMaps || [];
      if (!maps.length) {
        setBoardMapToolbar(false, null);
        currentBoardMapId = null;
        currentBoardMapName = '';
        document.getElementById('tile_board_map_id').value = '';
        container.innerHTML =
          '<div class="empty-state"><div class="empty-state-icon">🗺️</div>尚未建立地圖，請先點上方「建立大富翁地圖」</div>';
        return null;
      }

      const bm = maps[0];
      currentBoardMapId = bm.id;
      currentBoardMapName = bm.name;
      setBoardMapToolbar(true, bm);

      document.getElementById('tile_board_map_id').value = bm.id;
      document.getElementById('tile_locked_map_name').textContent = bm.name;

      return fetch(`${API_BASE}/api/board-maps/${bm.id}/tiles`, {
        headers: authHeaders,
        credentials: 'include'
      });
    })
    .then(r => (r && r.json ? r.json() : null))
    .then(data => {
      if (!data) return;
      if (!data.success) {
        container.innerHTML = '<div class="empty-state">載入格子失敗</div>';
        return;
      }

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
      setBoardMapToolbar(false, null);
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
        <button class="btn-sm btn-secondary-v2" onclick="duplicateTile('${tile.id}')">複製</button>
        <button class="btn-sm btn-secondary-v2" onclick="editTile('${tile.id}')">編輯</button>
        <button class="btn-sm btn-danger-v2" onclick="deleteTile('${tile.id}')">刪除</button>
      </div>
    </div>
  `;
}

