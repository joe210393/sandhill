// ── Drill-down: Load quest detail ─────────────────────────────
let currentBoardMapId = null;
let currentBoardMapName = '';
let currentBoardTiles = [];
let lastLoadedBoardMap = null;
let currentQuestChainLocked = false;
let currentQuestChainFormLocked = false;

const boardPlayStyleLabels = {
  fixed_track_race: '終點競走型',
  random_trip: '三回合探索型',
  round_score: '積分累積型'
};

const TASK_STRUCTURE_LOCK_FIELD_NAMES = [
  'type',
  'quest_chain_id_select',
  'quest_order',
  'is_final_step',
  'time_limit_start',
  'time_limit_end',
  'max_participants',
  'task_type',
  'validation_mode',
  'location_required',
  'lat',
  'lng',
  'radius',
  'points',
  'correct_answer_text',
  'optionA',
  'optionB',
  'optionC',
  'optionD',
  'correct_answer_select',
  'ai_target_label',
  'ai_target_count',
  'ai_min_score',
  'ai_min_confidence',
  'ai_system_prompt',
  'ai_user_prompt',
  'max_attempts',
  'required_item_id',
  'reward_item_id',
  'ar_model_id',
  'ar_order_model',
  'ar_order_image',
  'ar_order_youtube'
];

const QUEST_CHAIN_FORM_LOCK_FIELD_NAMES = [
  'mode_type',
  'chain_points',
  'entry_order',
  'access_mode',
  'experience_mode',
  'play_style'
];

function isQuestChainStructureLockedClient(chain) {
  if (!chain) return false;
  return Boolean(chain.structure_locked_at);
}

function applyQuestChainStructureLockUi(chain) {
  currentQuestChainLocked = isQuestChainStructureLockedClient(chain);
  const banner = document.getElementById('questStructureLockBanner');
  const createTaskBtn = document.getElementById('btnAddTask');
  const createTileBtn = document.getElementById('btnAddTile');
  const createBoardMapBtn = document.getElementById('btnCreateBoardMap');
  const editBoardMapBtn = document.getElementById('btnEditBoardMap');

  if (banner) {
    if (currentQuestChainLocked) {
      banner.style.display = 'block';
      banner.textContent = '這個入口的核心結構已鎖定。你仍可修改文案、提示與素材，但不能新增、刪除或更動題型、GPS、驗證方式、順序等結構設定。';
    } else {
      banner.style.display = 'none';
      banner.textContent = '';
    }
  }

  if (createTaskBtn) {
    createTaskBtn.disabled = currentQuestChainLocked;
    createTaskBtn.style.opacity = currentQuestChainLocked ? '0.55' : '1';
    createTaskBtn.style.cursor = currentQuestChainLocked ? 'not-allowed' : 'pointer';
  }
  if (createTileBtn) {
    createTileBtn.disabled = currentQuestChainLocked;
    createTileBtn.style.opacity = currentQuestChainLocked ? '0.55' : '1';
    createTileBtn.style.cursor = currentQuestChainLocked ? 'not-allowed' : 'pointer';
  }
  if (createBoardMapBtn) {
    createBoardMapBtn.disabled = currentQuestChainLocked;
    createBoardMapBtn.style.opacity = currentQuestChainLocked ? '0.55' : '1';
    createBoardMapBtn.style.cursor = currentQuestChainLocked ? 'not-allowed' : 'pointer';
  }
  if (editBoardMapBtn) {
    editBoardMapBtn.disabled = currentQuestChainLocked;
    editBoardMapBtn.style.opacity = currentQuestChainLocked ? '0.55' : '1';
    editBoardMapBtn.style.cursor = currentQuestChainLocked ? 'not-allowed' : 'pointer';
  }
}

function applyQuestChainFormLockUi(chain = null) {
  const form = document.getElementById('questChainForm');
  const banner = document.getElementById('questChainFormLockBanner');
  if (!form) return;

  currentQuestChainFormLocked = isQuestChainStructureLockedClient(chain);
  if (banner) {
    if (currentQuestChainFormLocked) {
      banner.style.display = 'block';
      banner.textContent = '這個入口的核心結構已鎖定。你現在仍可調整標題、介紹、入口文案、封面素材、收款狀態與上下架狀態，但不能修改方案、模式、玩法規則與入口結構。若要改核心設定，請由 admin 先解鎖。';
    } else {
      banner.style.display = 'none';
      banner.textContent = '';
    }
  }

  QUEST_CHAIN_FORM_LOCK_FIELD_NAMES.forEach((name) => {
    const field = form.elements[name];
    if (!field) return;
    field.disabled = currentQuestChainFormLocked;
  });
}

function applyTaskStructureLockUi(task = null, chain = null) {
  const banner = document.getElementById('taskStructureLockBanner');
  const form = document.getElementById('taskForm');
  const blueprintSelect = document.getElementById('taskBlueprintSelect');
  const locked = Boolean(task && (task.structure_locked || task.structure_locked_at || isQuestChainStructureLockedClient(chain)));

  if (banner) {
    if (locked) {
      banner.style.display = 'block';
      banner.textContent = '這個入口的關卡核心結構已鎖定。你現在只能修改文字敘事、提示、成功失敗文案、封面與素材，不能修改題型、GPS、驗證方式、順序、積分與通關規則。';
    } else {
      banner.style.display = 'none';
      banner.textContent = '';
    }
  }

  if (!form) return;
  TASK_STRUCTURE_LOCK_FIELD_NAMES.forEach((name) => {
    const field = form.elements[name];
    if (!field) return;
    field.disabled = locked;
  });
  if (blueprintSelect) blueprintSelect.disabled = locked;
}

function setBoardMapToolbar(hasMap, bm) {
  const stats = document.getElementById('boardMapStatsBlock');
  const empty = document.getElementById('boardMapEmptyBlock');
  const btnCreate = document.getElementById('btnCreateBoardMap');
  const btnEdit = document.getElementById('btnEditBoardMap');
  const btnAddTile = document.getElementById('btnAddTile');
  const btnAddTask = document.getElementById('btnAddTask');
  if (!stats || !empty || !btnCreate || !btnEdit) return;

  if (hasMap && bm) {
    lastLoadedBoardMap = bm;
    stats.style.display = 'flex';
    empty.style.display = 'none';
    btnCreate.style.display = 'none';
    btnEdit.style.display = 'inline-flex';
    const styleKey = bm.play_style || 'fixed_track_race';
    const styleLabel = boardPlayStyleLabels[styleKey] || styleKey;
    document.getElementById('boardMapName').textContent = `🗺️ ${bm.name || '未命名地圖'}`;
    document.getElementById('boardMapStyle').textContent = `🎮 ${styleLabel}`;
    document.getElementById('boardMapTileCount').textContent = `🧩 ${bm.tile_count || 0} 格`;
    document.getElementById('boardMapDice').textContent = `🎯 骰子 ${bm.dice_min || 1}-${bm.dice_max || 6}`;
    document.getElementById('boardMapRange').textContent = `🏁 ${bm.start_tile || 1} → ${bm.finish_tile || 8}`;
    if (btnAddTile) btnAddTile.style.display = 'inline-flex';
    if (btnAddTask) btnAddTask.style.display = 'inline-flex';
  } else {
    lastLoadedBoardMap = null;
    stats.style.display = 'none';
    empty.style.display = 'block';
    btnCreate.style.display = 'inline-flex';
    btnEdit.style.display = 'none';
    if (btnAddTile) btnAddTile.style.display = 'none';
    if (btnAddTask) btnAddTask.style.display = 'inline-flex';
  }
  applyQuestChainStructureLockUi(globalQuestChainsMap[String(currentQuestChainId)] || null);
}

function goToQuestDetail(questChainId) {
  const q = globalQuestChainsMap[questChainId];
  if (!q) return;

  currentQuestChainId = questChainId;
  currentQuestChainTitle = q.title;
  currentQuestChainMode = q.mode_type;
  applyQuestChainStructureLockUi(q);

  document.getElementById('detailQuestTitle').textContent = `管理：${q.title}`;
  document.getElementById('task_locked_quest_name').textContent = q.title;
  document.getElementById('task_quest_chain_id').value = questChainId;

  const detailNote = document.getElementById('questDetailScopeNote');
  if (detailNote) {
    detailNote.style.display = 'block';
    const modeLabel = q.mode_type === 'board_game' ? '大富翁' : '劇情主線';
    const scopeHint =
      loginUser?.role === 'admin'
        ? '平台視角：可編排此入口之關卡／棋盤（仍受結構鎖與後端權限約束）。'
        : '商家視角：僅能管理你有權限的此入口內容。';
    detailNote.textContent = `${modeLabel} · ${scopeHint}`;
  }

  // Toggle buttons based on mode
  const btnAddTask = document.getElementById('btnAddTask');
  const btnAddTile = document.getElementById('btnAddTile');
  const boardInfoBar = document.getElementById('boardMapInfoBar');

  if (q.mode_type === 'board_game') {
    btnAddTask.style.display = 'inline-flex';
    btnAddTile.style.display = 'none';
    boardInfoBar.style.display = 'block';
  } else {
    btnAddTask.style.display = 'inline-flex';
    btnAddTile.style.display = 'none';
    boardInfoBar.style.display = 'none';
  }

  switchView('view-quest-detail');
  currentStructureMap = null;
  currentStructureSelection = null;
  const structurePanel = document.getElementById('structureMapPanel');
  if (structurePanel) structurePanel.style.display = 'none';
  const structureCanvas = document.getElementById('structureMapCanvas');
  if (structureCanvas) {
    structureCanvas.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗺️</div>點上方按鈕載入主結構地圖</div>';
  }

  if (q.mode_type === 'board_game') {
    loadBoardContent(questChainId);
  } else {
    loadTasksForQuest(questChainId);
  }
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
      ai_text_check: 'AI 文字判定',
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
  let eventConfig = null;
  try {
    eventConfig = source.event_config ? JSON.parse(source.event_config) : null;
  } catch (err) {
    eventConfig = null;
  }
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
    summary.innerHTML = '<span class="tag tag-gray">尚未載入主結構</span>';
    canvas.innerHTML = '<div class="empty-state" style="width:100%;"><div class="empty-state-icon">🗺️</div>尚無結構資料</div>';
    inspectorTitle.textContent = '節點詳情';
    inspectorLead.textContent = '點擊左側節點，可查看這一關 / 這一格的 NPC、道具、音效與驗證方式。';
    inspectorBody.innerHTML = '';
    return;
  }

  const { questChain, tasks = [], boardMaps = [], boardTiles = [] } = currentStructureMap;
  const modeType = questChain.mode_type || 'story_campaign';
  legend.style.display = 'flex';
  legend.innerHTML = [
    ['🎯', '挑戰 / 主線關卡'],
    ['🧑‍🚀', 'NPC'],
    ['🎁', '道具'],
    ['🎵', '音效 / BGM'],
    ['🤖', 'AI 驗證 / 事件']
  ].map(([icon, text]) => `<span class="tag tag-gray">${icon} ${escHtml(text)}</span>`).join('');

  const nodes = modeType === 'board_game'
    ? boardTiles.map(tile => buildStructureNode('tile', tile, modeType)).sort((a, b) => a.order - b.order)
    : tasks.map(task => buildStructureNode('task', task, modeType)).sort((a, b) => a.order - b.order);

  summary.innerHTML = `
    <span class="tag tag-blue">${escHtml(questChain.title)}</span>
    <span class="tag tag-gray">${modeType === 'board_game' ? '大富翁模式' : '劇情主線'}</span>
    <span class="tag tag-gray">節點 ${nodes.length}</span>
    <span class="tag tag-gray">NPC ${new Set(nodes.map(node => node.npcLabel)).size}</span>
    ${boardMaps.length ? `<span class="tag tag-gray">棋盤 ${boardMaps.length}</span>` : ''}
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

  const mapCluster = boardMaps.length
    ? `<div class="structure-cluster">
         <div class="structure-cluster-label">棋盤結構</div>
         ${boardMaps.map((map) => `
           <div class="structure-node ${currentStructureSelection?.id === `board-map-${map.id}` ? 'active' : ''}" data-structure-board="${map.id}">
             <div class="structure-node-kind">${escHtml(map.play_style || 'board_game')}</div>
             <div class="structure-node-title">${escHtml(map.name)}</div>
             <div class="structure-node-meta">
               <span class="tag tag-gray">🧩 ${map.tile_count || 0} 格</span>
               <span class="tag tag-gray">🎯 ${map.challenge_tile_count || 0} 挑戰格</span>
               <span class="tag tag-gray">✨ ${map.event_tile_count || 0} 事件格</span>
             </div>
             <div class="structure-node-desc">起點 ${map.start_tile || 1} → 終點 ${map.finish_tile || 0}</div>
           </div>
         `).join('')}
       </div>`
    : '';

  canvas.innerHTML = `
    <div class="structure-lane-wrap">
      <div class="structure-root-node">
        <div class="structure-node-kind">${modeType === 'board_game' ? '大富翁玩法入口' : '劇情主線入口'}</div>
        <div class="structure-node-title">${escHtml(questChain.title)}</div>
        <div class="structure-node-badges">
          <span class="tag tag-gray">${modeType === 'board_game' ? '🎲 棋盤玩法' : '📖 劇情玩法'}</span>
          ${questChain.entry_scene_label ? `<span class="tag tag-gray">${escHtml(questChain.entry_scene_label)}</span>` : ''}
          ${questChain.play_style ? `<span class="tag tag-gray">${escHtml(questChain.play_style)}</span>` : ''}
        </div>
        <div class="structure-node-desc">${escHtml(questChain.short_description || questChain.description || '尚未填寫玩法說明')}</div>
      </div>
      <div class="structure-node-link"></div>
      ${mapCluster || ''}
      ${mapCluster ? '<div class="structure-node-link"></div>' : ''}
      <div class="structure-cluster">
        <div class="structure-cluster-label">${modeType === 'board_game' ? '格子 / 關卡節點' : '關卡節點'}</div>
        <div class="structure-lane">${
          nodes.map((node, index) => `
            <div class="structure-node ${currentStructureSelection.id === node.id ? 'active' : ''}" data-structure-node="${node.id}">
              <div class="structure-node-kind">${node.order ? `#${node.order}｜` : ''}${escHtml(node.subtitle)}</div>
              <div class="structure-node-title">${escHtml(node.title)}</div>
              <div class="structure-node-badges">
                <span class="tag tag-gray">${escHtml(node.primaryLabel)}</span>
                <span class="tag tag-gray">${escHtml(node.npcLabel)}</span>
                ${node.requiredItem ? `<span class="tag tag-gray">🔐 ${escHtml(node.requiredItem)}</span>` : ''}
                ${node.rewardItem ? `<span class="tag tag-gray">🎁 ${escHtml(node.rewardItem)}</span>` : ''}
              </div>
              <div class="structure-node-meta">${escHtml(node.audioLabel)}｜${escHtml(node.validationLabel)}</div>
              <div class="structure-node-desc">${escHtml(node.description || '尚未填寫說明')}</div>
            </div>
            ${index < nodes.length - 1 ? '<div class="structure-node-link">→</div>' : ''}
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
        <div class="structure-inspector-list">
          <div class="structure-inspector-row"><strong>玩法樣式</strong><span>${escHtml(selectedBoard.play_style || 'fixed_track_race')}</span></div>
          <div class="structure-inspector-row"><strong>關卡分布</strong><span>${selectedBoard.challenge_tile_count || 0} 個挑戰格｜${selectedBoard.event_tile_count || 0} 個事件格</span></div>
          <div class="structure-inspector-row"><strong>路線</strong><span>起點 ${selectedBoard.start_tile || 1} → 終點 ${selectedBoard.finish_tile || 0}</span></div>
        </div>`;
    });
  });

  const selected = currentStructureSelection;
  inspectorTitle.textContent = selected.title;
  inspectorLead.textContent = selected.description || '這個節點尚未填寫補充說明。';
  inspectorBody.innerHTML = `
    <div class="structure-inspector-list">
      <div class="structure-inspector-row"><strong>節點類型</strong><span>${escHtml(selected.subtitle)}</span></div>
      <div class="structure-inspector-row"><strong>主要玩法</strong><span>${escHtml(selected.primaryLabel)}</span></div>
      <div class="structure-inspector-row"><strong>預設 NPC</strong><span>${escHtml(selected.npcLabel)}</span></div>
      <div class="structure-inspector-row"><strong>音效 / BGM</strong><span>${escHtml(selected.audioLabel)}</span></div>
      <div class="structure-inspector-row"><strong>道具關聯</strong><span>${selected.requiredItem ? `需 ${escHtml(selected.requiredItem)}` : '無前置需求'}${selected.rewardItem ? `｜完成得 ${escHtml(selected.rewardItem)}` : ''}</span></div>
      <div class="structure-inspector-row"><strong>提示 / 劇情</strong><span>${escHtml(selected.raw.stage_intro || selected.raw.story_context || selected.raw.guide_content || selected.raw.hint_text || '尚未設定')}</span></div>
      <div class="structure-inspector-row"><strong>驗證 / 節點資訊</strong><span>${escHtml(selected.validationLabel)}</span></div>
      <div class="structure-inspector-row"><strong>模板 / 事件設定</strong><span>${escHtml(selected.stageTemplate || '未指定模板')}${selected.eventConfig ? `<br>${escHtml(JSON.stringify(selected.eventConfig))}` : ''}</span></div>
    </div>`;
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

function toggleStructureMap() {
  const panel = document.getElementById('structureMapPanel');
  if (!panel || !currentQuestChainId) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    if (!currentStructureMap) loadStructureMap(currentQuestChainId);
    else renderStructureMap();
  }
}

function refreshStructureMap() {
  if (!currentQuestChainId) return;
  const panel = document.getElementById('structureMapPanel');
  if (panel) panel.style.display = 'block';
  loadStructureMap(currentQuestChainId);
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
  const normalizedShopValue = form.shop_id.value === ADMIN_SHARED_SHOP_VALUE ? '' : form.shop_id.value;
  fd.append('shop_id', normalizedShopValue);
  fd.append('plan_id', form.plan_id.value);
  fd.append('task_limit', form.task_limit.value);
  fd.append('setup_fee', form.setup_fee.value);
  const editingChain = id ? globalQuestChainsMap[String(id)] || null : null;
  const billingPolicy = editingChain
    ? normalizeQuestChainBillingPolicy(editingChain)
    : (loginUser?.role === 'admin' ? 'public_good' : 'commercial');
  fd.append('setup_fee_paid', '0');
  fd.append('monthly_billing_enabled', billingPolicy === 'public_good' ? '1' : (form.monthly_billing_enabled.checked ? '1' : '0'));
  fd.append('title', form.title.value.trim());
  fd.append('description', form.description.value.trim());
  fd.append('short_description', form.short_description.value.trim());
  fd.append('chain_points', form.chain_points.value);
  fd.append('badge_name', form.badge_name.value.trim());
  fd.append('mode_type', form.mode_type.value);
  fd.append('entry_order', form.entry_order.value);
  fd.append('entry_button_text', form.entry_button_text.value.trim());
  fd.append('entry_scene_label', form.entry_scene_label.value.trim());
  fd.append('access_mode', form.access_mode.value);
  fd.append('experience_mode', form.experience_mode.value);
  fd.append('play_style', form.play_style.value);
  fd.append('is_active', form.is_active.checked ? '1' : '0');
  const badgeFile = form.badge_image?.files[0];
  if (badgeFile) fd.append('badge_image', badgeFile);

  const url = id ? `${API_BASE}/api/quest-chains/${id}` : `${API_BASE}/api/quest-chains`;
  setInlineMessage(msgEl, id ? '入口更新中...' : '入口建立中...', 'info');
  fetch(url, {
    method: id ? 'PUT' : 'POST',
    headers: withActorHeaders(),
    body: fd
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        setInlineMessage(msgEl, id ? '入口已更新' : '入口已建立', 'success');
        showToast(id ? '更新成功' : '建立成功');
        closeDrawer();
        loadQuestChains();
      } else {
        setInlineMessage(msgEl, d.message || '操作失敗');
        showToast(d.message || '操作失敗', 'error');
      }
    })
    .catch(() => {
      setInlineMessage(msgEl, '伺服器連線失敗');
      showToast('伺服器連線失敗', 'error');
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

const questChainShopSelect = document.getElementById('questChainShopSelect');
if (questChainShopSelect) {
  questChainShopSelect.addEventListener('change', syncQuestChainCommercialFields);
}

const questChainShopSearchInput = document.getElementById('questChainShopSearchInput');
if (questChainShopSearchInput) {
  questChainShopSearchInput.addEventListener('input', function () {
    populateQuestChainShopOptions(this.value);
    syncQuestChainCommercialFields();
  });
}

const questChainPlanSelect = document.getElementById('questChainPlanSelect');
if (questChainPlanSelect) {
  questChainPlanSelect.addEventListener('change', syncQuestChainCommercialFields);
}



// ── Load Quest Chains ─────────────────────────────────────────
function loadQuestChains() {
  return apiJson(`${API_BASE}/api/quest-chains`, {
    headers: withActorHeaders()
  })
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

      refreshCouponQuestChainOptions();
      renderQuestChainList(applyQuestChainListFilters(data.questChains));
    });
}

/** 依目前 API 載入的 globalQuestChainsMap 顯示快照（不受列表篩選影響，方便 Admin／Shop 一眼掌握） */
function renderQuestChainSnapshotStrip() {
  const strip = document.getElementById('questChainSnapshotStrip');
  if (!strip) return;
  const all = Object.values(globalQuestChainsMap || {});
  if (!all.length) {
    strip.classList.remove('is-visible');
    strip.innerHTML = '';
    return;
  }
  const n = all.length;
  const published = all.filter((q) => q.is_active).length;
  const draft = n - published;
  const locked = all.filter((q) => isQuestChainStructureLockedClient(q)).length;
  const board = all.filter((q) => q.mode_type === 'board_game').length;
  const story = n - board;
  strip.classList.add('is-visible');
  strip.innerHTML = `
    <div class="sd-snapshot-hint">以下統計為<strong>目前載入的入口資料</strong>（與頂欄資料範圍一致；不受下方篩選／搜尋影響）。</div>
    <div class="sd-snapshot-chip"><strong>${n}</strong>總數</div>
    <div class="sd-snapshot-chip"><strong>${published}</strong>已發布</div>
    <div class="sd-snapshot-chip"><strong>${draft}</strong>草稿</div>
    <div class="sd-snapshot-chip"><strong>${locked}</strong>結構已鎖</div>
    <div class="sd-snapshot-chip"><strong>${story}</strong>劇情</div>
    <div class="sd-snapshot-chip"><strong>${board}</strong>大富翁</div>
  `;
}

/** 搜尋（billing.js `filterQuestChains`）＋狀態篩選（全部／已發布／草稿／結構已鎖） */
function applyQuestChainListFilters(chains = []) {
  const base = filterQuestChains(Array.isArray(chains) ? chains : []);
  const f = questChainStatusFilter || 'all';
  if (f === 'published') return base.filter((q) => q.is_active);
  if (f === 'draft') return base.filter((q) => !q.is_active);
  if (f === 'locked') return base.filter((q) => isQuestChainStructureLockedClient(q));
  return base;
}

function renderQuestChainList(chains) {
  const container = document.getElementById('questChainListContainer');
  if (!container) return;
  const totalLoaded = Object.keys(globalQuestChainsMap).length;
  if (!chains.length) {
    let msg = '目前沒有玩法入口，點右上角「新增入口」';
    if (totalLoaded > 0) {
      if (String(currentQuestChainSearchTerm || '').trim()) {
        msg = '找不到符合搜尋條件的入口';
      } else if ((questChainStatusFilter || 'all') !== 'all') {
        msg = '此篩選下沒有入口，請切換篩選或清除搜尋';
      }
    }
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div>${msg}</div>`;
    renderQuestChainSnapshotStrip();
    return;
  }
  container.innerHTML = chains.map((q) => {
    const billingPolicy = normalizeQuestChainBillingPolicy(q);
    const accessMode = q.access_mode || 'public';
    const experienceMode = q.experience_mode || 'formal';
    const isLocked = isQuestChainStructureLockedClient(q);
    const shopName = q.shop_name || globalShopsMap[String(q.shop_id)]?.name || (q.shop_id ? `商家 #${q.shop_id}` : 'admin 公益共用');
    const planName = q.plan_name || globalEntryPlansMap[String(q.plan_id)]?.name || (q.plan_id ? `方案 #${q.plan_id}` : '歷史入口');
    const taskLimit = q.task_limit ? `${q.task_limit} 關` : '未限制';
    const setupFee = formatCurrency(q.setup_fee || 0);
    const tokens = Number(q.current_billing_month_tokens || 0).toLocaleString('zh-TW');

    const modeTag = q.mode_type === 'board_game'
      ? `<span class="tag tag-green">大富翁</span>${q.play_style ? `<span class="tag tag-gray">${escHtml(boardPlayStyleLabels[q.play_style] || q.play_style)}</span>` : ''}`
      : '<span class="tag tag-blue">劇情主線</span>';
    const statusTag = q.is_active
      ? '<span class="tag tag-green">已發布</span>'
      : '<span class="tag tag-red">草稿</span>';
    const lockBadge = isLocked
      ? '<span class="tag tag-red" title="核心結構已鎖定">🔒 結構鎖</span>'
      : '';

    const metaParts = [
      `🏪 ${escHtml(shopName)}`,
      `📦 ${escHtml(planName)}`,
      escHtml(taskLimit),
      `${Number(q.chain_points || 0)} 分`,
      `LM ${tokens} tokens`
    ];
    if (q.entry_scene_label) {
      metaParts.splice(1, 0, `場景 ${escHtml(q.entry_scene_label)}`);
    }
    if (accessMode === 'coupon') metaParts.push('需 Coupon');
    if (experienceMode === 'tutorial') metaParts.push('教學');
    else if (experienceMode === 'demo') metaParts.push('Demo');

    const billingLabel = billingPolicy === 'public_good'
      ? `公益 · 建置 ${escHtml(setupFee)}（免收）`
      : `${escHtml(setupFee)} · ${q.setup_fee_paid ? '建置費已收' : '建置費待收'}`;
    metaParts.push(billingLabel);

    const metaLine = metaParts.join(' · ');

    let lockMenuBtn = '';
    if (!isLocked) {
      lockMenuBtn = `<button type="button" class="btn-sm btn-secondary-v2" onclick="toggleQuestChainStructureLock('${q.id}', true)">鎖定結構</button>`;
    } else if (loginUser?.role === 'admin') {
      lockMenuBtn = `<button type="button" class="btn-sm btn-secondary-v2" onclick="toggleQuestChainStructureLock('${q.id}', false)">admin 解鎖結構</button>`;
    }

    const deleteMenuBtn = isLocked
      ? ''
      : `<button type="button" class="btn-sm btn-danger-v2" onclick="deleteQuestChain('${q.id}')">刪除入口</button>`;

    const descOneLine = q.short_description
      ? `<div style="font-size:0.85rem;color:#64748b;margin-top:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(q.short_description)}">${escHtml(q.short_description)}</div>`
      : '';

    return `
      <div class="quest-card qc-entry-card">
        <div style="min-width:0;flex:1;">
          <div class="quest-card-title">${escHtml(q.title)}</div>
          <div class="quest-card-meta qc-entry-badges">${modeTag} ${statusTag} ${lockBadge}</div>
          <div class="qc-entry-meta-line">${metaLine}</div>
          ${descOneLine}
        </div>
        <div class="quest-card-actions qc-entry-actions">
          <button type="button" class="btn-md btn-primary-v2" onclick="goToQuestDetail('${q.id}')">管理內容</button>
          <details class="qc-more">
            <summary class="btn-sm btn-secondary-v2 qc-more-summary" aria-label="更多操作">⋯</summary>
            <div class="qc-more-body">
              <button type="button" class="btn-sm btn-secondary-v2" onclick="editQuestChain('${q.id}')">編輯設定</button>
              ${lockMenuBtn}
              ${deleteMenuBtn}
            </div>
          </details>
        </div>
      </div>
    `;
  }).join('');
  renderQuestChainSnapshotStrip();
}

async function toggleQuestChainStructureLock(id, locked) {
  const q = globalQuestChainsMap[id];
  if (!q) return;
  const confirmMessage = locked
    ? `確定要鎖定「${q.title}」的核心結構嗎？\n鎖定後將不能再修改題型、GPS、驗證方式、順序等結構設定。`
    : `確定要解鎖「${q.title}」的核心結構嗎？\n解鎖後可以再次調整入口與關卡的核心結構。`;
  if (!confirm(confirmMessage)) return;
  try {
    const d = await apiJson(`${API_BASE}/api/quest-chains/${id}/structure-lock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...withActorHeaders() },
      body: JSON.stringify({ locked })
    });
    if (!d.success) {
      showToast(d.message || '更新失敗', 'error');
      return;
    }
    showToast(d.message || (locked ? '結構已鎖定' : '結構已解鎖'));
    await loadQuestChains();
    if (currentQuestChainId && String(currentQuestChainId) === String(id)) {
      goToQuestDetail(id);
    }
  } catch (err) {
    showToast(err?.message || '伺服器連線失敗', 'error');
  }
}

function applyQuestChainSearch() {
  currentQuestChainSearchTerm = document.getElementById('questChainSearchInput')?.value.trim() || '';
  renderQuestChainList(applyQuestChainListFilters(Object.values(globalQuestChainsMap)));
}

function resetQuestChainSearch() {
  currentQuestChainSearchTerm = '';
  const input = document.getElementById('questChainSearchInput');
  if (input) input.value = '';
  renderQuestChainList(applyQuestChainListFilters(Object.values(globalQuestChainsMap)));
}

function ensureQuestChainSearchStartsBlank() {
  if (questChainSearchBootstrapped) return;
  questChainSearchBootstrapped = true;
  currentQuestChainSearchTerm = '';
  const clearInput = () => {
    const input = document.getElementById('questChainSearchInput');
    if (!input) return;
    if (document.activeElement === input) return;
    input.value = '';
    input.setAttribute('value', '');
  };
  clearInput();
  requestAnimationFrame(clearInput);
  setTimeout(clearInput, 180);
  setTimeout(clearInput, 600);
}

function editQuestChain(id) {
  const q = globalQuestChainsMap[id];
  if (!q) return;
  openDrawer('編輯玩法入口', 'form-quest-chain', {
    id: q.id, mode_type: q.mode_type, title: q.title,
    short_description: q.short_description || '', description: q.description || '',
    entry_order: q.entry_order || 0, entry_button_text: q.entry_button_text || '',
    entry_scene_label: q.entry_scene_label || '', access_mode: q.access_mode || 'public', experience_mode: q.experience_mode || 'formal', play_style: q.play_style || '',
    chain_points: q.chain_points || 100, badge_name: q.badge_name || '',
    shop_id: q.shop_id || '',
    plan_id: q.plan_id || '',
    task_limit: q.task_limit || '',
    setup_fee: q.setup_fee || 0,
    setup_fee_paid: q.setup_fee_paid,
    billing_policy: normalizeQuestChainBillingPolicy(q),
    monthly_billing_enabled: q.monthly_billing_enabled !== false,
    is_active: q.is_active
  });
  applyQuestChainFormLockUi(q);
}

function deleteQuestChain(id) {
  const q = globalQuestChainsMap[id];
  if (isQuestChainStructureLockedClient(q)) {
    showToast('這個入口的結構已鎖定，發布後請改用停用或維護，不可直接刪除', 'error');
    return;
  }
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

function renderShopList(shops = []) {
  const container = document.getElementById('shopListContainer');
  if (!container) return;
  if (!shops.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏪</div>尚無商店資料</div>';
    renderShopDetailPanel(null);
    return;
  }
  if (!currentShopDetailId || !shops.some((shop) => String(shop.id) === String(currentShopDetailId))) {
    currentShopDetailId = String(shops[0].id);
  }
  container.innerHTML = shops.map((shop) => `
    <div class="quest-card">
      <div style="min-width:0;">
        <div class="quest-card-title">${escHtml(shop.name || `商店 #${shop.id}`)}</div>
        <div class="quest-card-meta">
          <span class="tag ${shop.is_active ? 'tag-green' : 'tag-red'}">${shop.is_active ? '啟用中' : '已停用'}</span>
          <span class="tag tag-gray">建置者 ${escHtml(shop.builder_username || 'admin')}</span>
          <span class="tag tag-gray">商店帳號 ${escHtml(shop.owner_username || '未建立')}</span>
          <span class="tag tag-gray">員工 ${formatTokenCount(shop.staff_count || 0)} 人</span>
          <span class="tag tag-gray">入口 ${formatTokenCount(shop.quest_chain_count || 0)} 個</span>
          <span class="tag tag-gray">素材 ${formatBytes(shop.asset_total_bytes || 0)}</span>
          <span class="tag tag-gray">本月 LM ${formatTokenCount(shop.billing_total_tokens || 0)} tokens</span>
        </div>
        <div style="font-size:0.84rem; color:#64748b; margin-top:8px;">
          ${escHtml(shop.contact_name || '未填聯絡人')}｜${escHtml(shop.contact_phone || '未填電話')}｜${escHtml(shop.contact_email || '未填 Email')}
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-top:12px;">
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px;">
            <div class="subtle-note" style="margin-bottom:6px;">素材庫概況</div>
            <div style="font-weight:700;">${formatBytes(shop.asset_total_bytes || 0)}</div>
            <div style="font-size:0.82rem; color:#64748b; margin-top:4px;">模型 ${formatTokenCount(shop.asset_model_count || 0)}｜道具 ${formatTokenCount(shop.asset_item_count || 0)}｜音樂 ${formatTokenCount(shop.asset_bgm_count || 0)}｜影片 ${formatTokenCount(shop.asset_video_count || 0)}</div>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px;">
            <div class="subtle-note" style="margin-bottom:6px;">${escHtml(shop.billing_month || getDefaultBillingMonth())} LM 用量</div>
            <div style="font-weight:700;">${formatTokenCount(shop.billing_total_tokens || 0)} tokens</div>
            <div style="font-size:0.82rem; color:#64748b; margin-top:4px;">P ${formatTokenCount(shop.billing_prompt_tokens || 0)} / C ${formatTokenCount(shop.billing_completion_tokens || 0)}｜${shop.billing_donated_amount > 0 ? `公益代付 ${formatCurrency(shop.billing_donated_amount || 0)}` : `應收 ${formatCurrency(shop.billing_estimated_amount || 0)}`}</div>
          </div>
        </div>
      </div>
      <div class="quest-card-actions">
        <button class="btn-sm btn-secondary-v2" onclick="showShopDetail('${shop.id}')">查看詳情</button>
        <button class="btn-sm btn-secondary-v2" onclick="focusShopBilling('${shop.id}')">看 LM 紀錄</button>
        <button class="btn-sm btn-secondary-v2" onclick="focusShopAssets('${shop.id}')">看素材庫</button>
        <button class="btn-sm btn-secondary-v2" onclick="openShopDrawer('${shop.id}')">編輯</button>
      </div>
    </div>
  `).join('');
  renderShopDetailPanel(globalShopsMap[String(currentShopDetailId)] || shops[0]);
}

function loadShopManagement() {
  return apiJson(`${API_BASE}/api/shops`, {
    headers: withActorHeaders()
  }).then((data) => {
    globalShopsMap = {};
    (data.shops || []).forEach((shop) => {
      globalShopsMap[String(shop.id)] = shop;
    });
    renderShopList(data.shops || []);
  });
}

function renderShopDetailPanel(shop) {
  const container = document.getElementById('shopDetailContainer');
  if (!container) return;
  if (!shop) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏪</div>選擇一間商店即可查看詳情摘要</div>';
    return;
  }
  const shopName = shop.name || `商店 #${shop.id}`;
  container.innerHTML = `
    <div style="background:white; border:1px solid #dbeafe; border-radius:16px; padding:18px 20px; display:grid; gap:14px;">
      <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start;">
        <div>
          <div style="font-size:0.82rem; color:#64748b; margin-bottom:4px;">商店詳情</div>
          <div style="font-size:1.2rem; font-weight:800; color:#0f172a;">${escHtml(shopName)}</div>
          <div style="font-size:0.9rem; color:#64748b; margin-top:6px;">帳號：${escHtml(shop.owner_username || '未建立')}｜建置者：${escHtml(shop.builder_username || 'admin')}</div>
          <div style="font-size:0.9rem; color:#64748b; margin-top:4px;">聯絡人：${escHtml(shop.contact_name || '未填')}｜電話：${escHtml(shop.contact_phone || '未填')}｜Email：${escHtml(shop.contact_email || '未填')}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn-sm btn-secondary-v2" onclick="focusShopBilling('${shop.id}')">看 LM 紀錄</button>
          <button class="btn-sm btn-secondary-v2" onclick="focusShopAssets('${shop.id}')">看素材庫</button>
          <button class="btn-sm btn-secondary-v2" onclick="openShopDrawer('${shop.id}')">編輯商店</button>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:10px;">
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
          <div class="subtle-note" style="margin-bottom:6px;">素材總量</div>
          <div style="font-weight:800;">${formatBytes(shop.asset_total_bytes || 0)}</div>
          <div style="font-size:0.82rem; color:#64748b; margin-top:4px;">共 ${formatTokenCount(shop.asset_total_files || 0)} 個素材</div>
        </div>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
          <div class="subtle-note" style="margin-bottom:6px;">素材組成</div>
          <div style="font-weight:800;">模型 ${formatTokenCount(shop.asset_model_count || 0)}｜道具 ${formatTokenCount(shop.asset_item_count || 0)}</div>
          <div style="font-size:0.82rem; color:#64748b; margin-top:4px;">音樂 ${formatTokenCount(shop.asset_bgm_count || 0)}｜影片 ${formatTokenCount(shop.asset_video_count || 0)}</div>
        </div>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
          <div class="subtle-note" style="margin-bottom:6px;">${escHtml(shop.billing_month || getDefaultBillingMonth())} LM Tokens</div>
          <div style="font-weight:800;">${formatTokenCount(shop.billing_total_tokens || 0)}</div>
          <div style="font-size:0.82rem; color:#64748b; margin-top:4px;">P ${formatTokenCount(shop.billing_prompt_tokens || 0)} / C ${formatTokenCount(shop.billing_completion_tokens || 0)}</div>
        </div>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
          <div class="subtle-note" style="margin-bottom:6px;">LM 金額摘要</div>
          <div style="font-weight:800;">${shop.billing_donated_amount > 0 ? `公益代付 ${formatCurrency(shop.billing_donated_amount || 0)}` : `應收 ${formatCurrency(shop.billing_estimated_amount || 0)}`}</div>
          <div style="font-size:0.82rem; color:#64748b; margin-top:4px;">入口 ${formatTokenCount(shop.quest_chain_count || 0)}｜員工 ${formatTokenCount(shop.staff_count || 0)}</div>
        </div>
      </div>
    </div>
  `;
}

function showShopDetail(shopId) {
  currentShopDetailId = String(shopId || '');
  renderShopDetailPanel(globalShopsMap[String(currentShopDetailId)] || null);
}

function focusShopAssets(shopId) {
  const shop = globalShopsMap[String(shopId)] || null;
  currentAssetShopFilter = shopId ? String(shopId) : '';
  currentAssetShopName = shop?.name || '';
  switchView('view-assets');
  showToast(shop ? `已切換到 ${shop.name} 的素材庫視角` : '已切換到素材庫');
  loadAssetStorageOverview();
  loadARModels();
  loadItems();
  loadBgmAssets();
  loadVideoAssets();
}

function resetAssetLibraryScope() {
  currentAssetShopFilter = '';
  currentAssetShopName = '';
  loadAssetStorageOverview();
  loadARModels();
  loadItems();
  loadBgmAssets();
  loadVideoAssets();
  showToast('已切換回全平台素材庫');
}

function focusShopBilling(shopId) {
  const shop = globalShopsMap[String(shopId)] || null;
  switchView('view-billing');
  currentBillingDailyScope = `shop:${shopId}`;
  setTimeout(() => {
    const scopeSelect = document.getElementById('billingDailyScopeSelect');
    if (scopeSelect) scopeSelect.value = currentBillingDailyScope;
    if (shop) showToast(`已切換到 ${shop.name} 的 LM 用量視角`);
  }, 150);
}

function openShopDrawer(id = '') {
  const shop = id ? globalShopsMap[String(id)] : null;
  openDrawer(shop ? '編輯商店' : '新增商店', 'form-shop', {
    shop_id: shop?.id || '',
    shop_name: shop?.name || '',
    username: '',
    password: '',
    contact_name: shop?.contact_name || '',
    contact_phone: shop?.contact_phone || '',
    contact_email: shop?.contact_email || '',
    shop_address: shop?.address || '',
    shop_description: shop?.description || '',
    status: shop?.status || 'active'
  });
  const form = document.getElementById('shopForm');
  if (form) {
    const editing = Boolean(shop);
    form.elements.username.disabled = editing;
    form.elements.password.disabled = editing;
    form.elements.username.required = !editing;
    form.elements.password.required = !editing;
  }
}

function renderPlanList(plans = []) {
  const container = document.getElementById('planListContainer');
  if (!container) return;
  if (!plans.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📐</div>尚無方案資料</div>';
    return;
  }
  container.innerHTML = plans.map((plan) => `
    <div class="quest-card">
      <div style="min-width:0;">
        <div class="quest-card-title">${escHtml(plan.name || `方案 #${plan.id}`)}</div>
        <div class="quest-card-meta">
          <span class="tag ${plan.is_active ? 'tag-green' : 'tag-red'}">${plan.is_active ? '可使用' : '已停用'}</span>
          <span class="tag tag-gray">上限 ${formatTokenCount(plan.task_limit || 0)} 關</span>
          <span class="tag tag-gray">建置費 ${formatCurrency(plan.setup_fee || 0)}</span>
          <span class="tag tag-gray">月費 ${formatCurrency(plan.monthly_base_fee || 0)}</span>
          <span class="tag tag-gray">${escHtml(formatTokenPricingRule(plan.token_price_per_1k || 0))}</span>
        </div>
      </div>
      <div class="quest-card-actions">
        <button class="btn-sm btn-secondary-v2" onclick="openPlanDrawer('${plan.id}')">編輯</button>
      </div>
    </div>
  `).join('');
}

function loadPlanManagement() {
  return apiJson(`${API_BASE}/api/entry-plans?include_inactive=1`, {
    headers: withActorHeaders()
  }).then((data) => {
    renderPlanList(data.plans || []);
    renderPlanQuotePreview(data.plans || []);
  });
}

function getPrintablePlanQuoteHtml(plans = []) {
  const sortedPlans = [...plans].sort((left, right) => Number(left.task_limit || 0) - Number(right.task_limit || 0));
  const generatedAt = new Date().toLocaleString('zh-TW');
  return `
    <!DOCTYPE html>
    <html lang="zh-Hant">
    <head>
      <meta charset="UTF-8">
      <title>樂樂園平台方案報價</title>
      <style>
        body { font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
        .sheet { max-width: 960px; margin: 0 auto; background: white; min-height: 100vh; padding: 40px 48px; box-sizing: border-box; }
        .hero { border-radius: 24px; padding: 28px 30px; color: white; background: linear-gradient(135deg, #0f766e, #0f172a); }
        .hero h1 { margin: 0 0 10px; font-size: 2rem; }
        .hero p { margin: 0; line-height: 1.7; color: rgba(255,255,255,0.88); }
        .meta { margin-top: 14px; font-size: 0.88rem; color: rgba(255,255,255,0.78); }
        .section { margin-top: 28px; }
        .section h2 { font-size: 1.2rem; margin: 0 0 14px; }
        .panel { border: 1px solid #dbeafe; border-radius: 18px; padding: 18px 20px; background: linear-gradient(180deg, #ffffff, #f8fafc); }
        .plan-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .plan-card { border: 1px solid #cbd5e1; border-radius: 18px; padding: 18px; background: white; }
        .plan-card h3 { margin: 0 0 8px; font-size: 1.06rem; }
        .price { font-size: 1.5rem; font-weight: 800; color: #0f766e; margin-bottom: 10px; }
        .muted { color: #64748b; line-height: 1.7; }
        .rule-list { display: grid; gap: 10px; }
        .rule-item { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px; background: white; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        table { width: 100%; border-collapse: collapse; background: white; border-radius: 18px; overflow: hidden; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 14px; text-align: left; vertical-align: top; }
        th { background: #eff6ff; color: #1e3a8a; font-size: 0.9rem; }
        tr:last-child td { border-bottom: none; }
        .footer-note { margin-top: 22px; color: #64748b; font-size: 0.85rem; line-height: 1.7; }
        @media print {
          body { background: white; }
          .sheet { padding: 20px 24px; }
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        <div class="hero">
          <h1>樂樂園平台 方案介紹與報價</h1>
          <p>把環境教育、食農教育與場域體驗，從被動導覽轉成主動探索。廠商可用平台建立自己的入口、關卡與 AI 互動體驗，並依實際 LM 使用量按月計費。</p>
          <div class="meta">匯出時間：${escHtml(generatedAt)}｜用途：廠商報價與方案說明</div>
        </div>

        <div class="section">
          <h2>方案一覽</h2>
          <div class="plan-grid">
            ${sortedPlans.map((plan) => `
              <div class="plan-card">
                <h3>${escHtml(plan.name || `方案 #${plan.id}`)}</h3>
                <div class="price">${formatCurrency(plan.setup_fee || 0)}</div>
                <div class="muted">
                  關卡上限：${escHtml(formatTokenCount(plan.task_limit || 0))} 關<br>
                  每月基本費：${formatCurrency(plan.monthly_base_fee || 0)}<br>
                  LM 使用量：${escHtml(formatTokenPricingRule(plan.token_price_per_1k || 0))}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="section">
          <h2>收費規則</h2>
          <div class="rule-list">
            <div class="rule-item"><strong>一次性建置費</strong><br><span class="muted">10 關 NT$5,000；每增加 10 關加 NT$3,000。不滿 10 關仍以 10 關方案計價。</span></div>
            <div class="rule-item"><strong>每月 LM 費用</strong><br><span class="muted">依實際 LM 使用量計費，目前標準為每 1 萬 tokens = NT$10。</span></div>
            <div class="rule-item"><strong>建置完成後可修改</strong><br><span class="muted">文字敘事、圖片素材、提示文案、成功/失敗訊息可持續調整。</span></div>
            <div class="rule-item"><strong>建置完成後不可修改</strong><br><span class="muted">關卡類型、驗證方式、GPS 結構、核心玩法順序等會鎖定，避免已上線內容被改壞。</span></div>
          </div>
        </div>

        <div class="section">
          <h2>交付內容</h2>
          <div class="two-col">
            <div class="panel">
              <strong>平台角色</strong>
              <div class="muted">admin 為平台管理員；shop 為建置廠商；staff 為廠商員工並綁定在 shop 底下。各商店的入口、商品、coupon、使用量彼此獨立管理。</div>
            </div>
            <div class="panel">
              <strong>數據與帳務</strong>
              <div class="muted">平台可追蹤每日與每月的 LM tokens、入口用量、商店總帳，以及每位玩家在每一關實際消耗的 token 明細。</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>報價明細表</h2>
          <table>
            <thead>
              <tr>
                <th>方案</th>
                <th>關卡上限</th>
                <th>一次性建置費</th>
                <th>每月基本費</th>
                <th>LM 使用量費率</th>
              </tr>
            </thead>
            <tbody>
              ${sortedPlans.map((plan) => `
                <tr>
                  <td>${escHtml(plan.name || `方案 #${plan.id}`)}</td>
                  <td>${escHtml(formatTokenCount(plan.task_limit || 0))} 關</td>
                  <td>${formatCurrency(plan.setup_fee || 0)}</td>
                  <td>${formatCurrency(plan.monthly_base_fee || 0)}</td>
                  <td>${escHtml(formatTokenPricingRule(plan.token_price_per_1k || 0))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="footer-note">
          備註：本頁為方案說明與報價用途。實際專案若有特殊場域需求、客製化關卡數或公益合作模式，可再另行討論。
        </div>
      </div>
      <script>
        window.onload = () => {
          setTimeout(() => window.print(), 200);
        };
      </script>
    </body>
    </html>
  `;
}

function renderPlanQuotePreview(plans = []) {
  const container = document.getElementById('planQuotePreview');
  if (!container) return;
  const sortedPlans = [...plans].sort((left, right) => Number(left.task_limit || 0) - Number(right.task_limit || 0));
  if (!sortedPlans.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div>尚無方案資料，請先建立至少一筆方案。</div>';
    return;
  }
  container.innerHTML = `
    <div class="panel-card" style="border-style:dashed;">
      <div class="panel-card-header">
        <div>
          <div class="panel-card-title">廠商報價頁預覽</div>
          <div class="panel-card-subtitle">這一頁會用目前方案資料自動組成，可直接列印成 PDF 提供給廠商。</div>
        </div>
      </div>
      <div style="display:grid; gap:16px;">
        <div style="background:linear-gradient(135deg,#0f766e,#0f172a); color:white; border-radius:18px; padding:20px 22px;">
          <div style="font-size:1.35rem; font-weight:800; margin-bottom:8px;">樂樂園平台 方案介紹與報價</div>
          <div style="line-height:1.8; color:rgba(255,255,255,0.88);">把教育內容帶回場域，讓學員走出去自己找答案。平台提供入口建置、AI 關卡、使用量追蹤與月結帳務。</div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
          ${sortedPlans.map((plan) => `
            <div style="background:white; border:1px solid #dbeafe; border-radius:16px; padding:16px;">
              <div style="font-size:1.02rem; font-weight:700; color:#0f172a; margin-bottom:8px;">${escHtml(plan.name || `方案 #${plan.id}`)}</div>
              <div style="font-size:1.4rem; font-weight:800; color:#0f766e; margin-bottom:8px;">${formatCurrency(plan.setup_fee || 0)}</div>
              <div class="subtle-note">關卡上限 ${escHtml(formatTokenCount(plan.task_limit || 0))} 關</div>
              <div class="subtle-note">每月基本費 ${formatCurrency(plan.monthly_base_fee || 0)}</div>
              <div class="subtle-note">${escHtml(formatTokenPricingRule(plan.token_price_per_1k || 0))}</div>
            </div>
          `).join('')}
        </div>
        <div style="display:grid; gap:10px;">
          <div class="locked-field"><div class="locked-field-label">一次性建置費</div><div class="locked-field-value">10 關 NT$5,000；每增加 10 關加 NT$3,000；不滿 10 關仍以 10 關計。</div></div>
          <div class="locked-field"><div class="locked-field-label">每月 LM 使用量</div><div class="locked-field-value">每 1 萬 tokens = NT$10，可按商店、入口、玩家逐關明細追蹤。</div></div>
          <div class="locked-field"><div class="locked-field-label">建置後可調整範圍</div><div class="locked-field-value">文字敘事、提示文案、圖片素材可修改；關卡類型、GPS 與核心驗證結構會鎖定。</div></div>
        </div>
      </div>
    </div>
  `;
}

function downloadPlanQuotePdf() {
  const plans = Object.values(globalEntryPlansMap);
  if (!plans.length) {
    showToast('目前沒有方案資料可匯出', 'error');
    return;
  }
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=900');
  if (!popup) {
    showToast('無法開啟列印視窗，請確認瀏覽器未封鎖彈出視窗', 'error');
    return;
  }
  popup.document.open();
  popup.document.write(getPrintablePlanQuoteHtml(plans));
  popup.document.close();
}

function openPlanDrawer(id = '') {
  const plan = id ? globalEntryPlansMap[String(id)] : null;
  openDrawer(plan ? '編輯方案' : '新增方案', 'form-plan', {
    id: plan?.id || '',
    name: plan?.name || '',
    task_limit: plan?.task_limit || '',
    setup_fee: plan?.setup_fee || 0,
    monthly_base_fee: plan?.monthly_base_fee || 0,
    token_price_per_1k: Number(plan?.token_price_per_1k || 0) * 10,
    is_active: plan?.is_active !== false
  });
}

function syncQuestChainFilterTabUi() {
  const root = document.getElementById('questChainFilterTabs');
  if (!root) return;
  const cur = questChainStatusFilter || 'all';
  root.querySelectorAll('[data-qc-filter]').forEach((btn) => {
    const v = btn.getAttribute('data-qc-filter') || 'all';
    const active = v === cur;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

(function wireQuestChainFilterTabs() {
  const root = document.getElementById('questChainFilterTabs');
  if (!root || root.dataset.wired === '1') return;
  root.dataset.wired = '1';
  root.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-qc-filter]');
    if (!btn) return;
    const next = btn.getAttribute('data-qc-filter') || 'all';
    if (next === (questChainStatusFilter || 'all')) return;
    questChainStatusFilter = next;
    syncQuestChainFilterTabUi();
    renderQuestChainList(applyQuestChainListFilters(Object.values(globalQuestChainsMap)));
  });
  syncQuestChainFilterTabUi();
})();

