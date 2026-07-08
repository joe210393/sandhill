// Names must differ from staff-dashboard.js: classic scripts share one global lexical scope;
// redeclaring `const staffFormUtils` / `const staffDrawer` here throws SyntaxError and prevents syncDrawerFooter from being defined.
const sdFormUtils = window.StaffDashboardFormUtils;
const sdDrawer = window.StaffDashboardDrawer;

function normalizeQuestChainBillingPolicy(chain = null) {
  if (!chain) return 'commercial';
  const policy = typeof chain.billing_policy === 'string' ? chain.billing_policy.trim().toLowerCase() : '';
  if (policy === 'public_good') return 'public_good';
  if (!policy && String(chain.created_by || '').trim().toLowerCase() === 'admin') return 'public_good';
  return 'commercial';
}

function isPublicGoodQuestChain(chain = null) {
  return normalizeQuestChainBillingPolicy(chain) === 'public_good';
}

function getQuestChainShopOptionItems() {
  const items = Object.values(globalShopsMap)
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hant'));
  if (loginUser?.role === 'admin') {
    return [
      {
        id: ADMIN_SHARED_SHOP_VALUE,
        name: 'admin 公益共用',
        keywords: 'admin 公益 平台 管理員 共用'
      },
      ...items
    ];
  }
  return items;
}

function normalizeQuestChainShopSelectValue(rawValue = '') {
  if (loginUser?.role === 'admin') {
    return rawValue ? String(rawValue) : ADMIN_SHARED_SHOP_VALUE;
  }
  return rawValue ? String(rawValue) : (loginUser?.shop_id ? String(loginUser.shop_id) : '');
}

function getQuestChainShopDisplayName(shopValue = '') {
  const normalizedValue = normalizeQuestChainShopSelectValue(shopValue);
  if (normalizedValue === ADMIN_SHARED_SHOP_VALUE) return 'admin 公益共用';
  return globalShopsMap[String(normalizedValue)]?.name || (normalizedValue ? `商家 #${normalizedValue}` : '未指定商家');
}

function populateQuestChainShopOptions(searchTerm = null) {
  const select = document.getElementById('questChainShopSelect');
  const searchInput = document.getElementById('questChainShopSearchInput');
  if (!select) return;
  const isAdmin = loginUser?.role === 'admin';
  const actorShopId = loginUser?.shop_id ? String(loginUser.shop_id) : '';
  const currentValue = normalizeQuestChainShopSelectValue(select.value || actorShopId);
  const effectiveSearch = searchTerm == null ? (searchInput?.value || '') : searchTerm;
  const normalizedSearch = String(effectiveSearch || '').trim().toLowerCase();
  let options = getQuestChainShopOptionItems();
  if (searchInput) {
    searchInput.disabled = !isAdmin;
    if (searchTerm != null) searchInput.value = searchTerm;
  }
  if (normalizedSearch) {
    options = options.filter((shop) => {
      const haystack = [
        shop.name,
        shop.keywords,
        shop.contact_name,
        shop.contact_phone,
        shop.contact_email,
        shop.id
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }
  select.innerHTML = '';
  if (!options.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '查無符合條件的商家';
    option.disabled = true;
    option.selected = true;
    select.appendChild(option);
    return;
  }
  options.forEach((shop) => {
    const option = document.createElement('option');
    option.value = String(shop.id);
    option.textContent = shop.name || `商家 #${shop.id}`;
    select.appendChild(option);
  });
  if (options.some((shop) => String(shop.id) === currentValue)) {
    select.value = currentValue;
  } else if (!isAdmin && actorShopId) {
    select.value = actorShopId;
  } else if (isAdmin) {
    select.value = options[0] ? String(options[0].id) : ADMIN_SHARED_SHOP_VALUE;
  }
  const staffShopSelect = document.getElementById('staffShopSelect');
  if (staffShopSelect) {
    const currentValue = staffShopSelect.value;
    staffShopSelect.innerHTML = '<option value="">-- 請選擇商店 --</option>';
    options.forEach((shop) => {
      const option = document.createElement('option');
      option.value = String(shop.id);
      option.textContent = shop.name || `商家 #${shop.id}`;
      staffShopSelect.appendChild(option);
    });
    if (currentValue) staffShopSelect.value = currentValue;
  }
}

function populateQuestChainPlanOptions() {
  const select = document.getElementById('questChainPlanSelect');
  if (!select) return;
  select.innerHTML = '<option value="">-- 請選擇方案 --</option>';
  Object.values(globalEntryPlansMap)
    .sort((a, b) => Number(a.task_limit || 0) - Number(b.task_limit || 0))
    .forEach((plan) => {
      const option = document.createElement('option');
      option.value = String(plan.id);
      option.textContent = `${plan.name || `方案 ${plan.id}`}｜${plan.task_limit || 0} 關｜${formatCurrency(plan.setup_fee)}`;
      select.appendChild(option);
    });
}

function syncQuestChainCommercialFields() {
  const form = document.getElementById('questChainForm');
  if (!form) return;
  const isEditing = Boolean(form.elements.id?.value);
  const shopSelect = form.elements.shop_id;
  const planSelect = form.elements.plan_id;
  const taskLimitInput = form.elements.task_limit;
  const setupFeeInput = form.elements.setup_fee;
  const setupFeePaidInput = form.elements.setup_fee_paid;
  const monthlyBillingInput = form.elements.monthly_billing_enabled;
  const shopHint = document.getElementById('questChainShopHint');
  const planHint = document.getElementById('questChainPlanHint');
  const summary = document.getElementById('questChainCommercialSummaryText');
  const billingHint = document.getElementById('questChainBillingPolicyHint');
  const setupFeePaidLabel = document.getElementById('questChainSetupFeePaidLabel');
  const monthlyBillingLabel = document.getElementById('questChainMonthlyBillingLabel');
  const selectedShop = globalShopsMap[String(shopSelect?.value || '')] || null;
  const selectedPlan = globalEntryPlansMap[String(planSelect?.value || '')] || null;
  const editingChain = isEditing ? globalQuestChainsMap[String(form.elements.id?.value || '')] || null : null;
  const billingPolicy = editingChain
    ? normalizeQuestChainBillingPolicy(editingChain)
    : (loginUser?.role === 'admin' ? 'public_good' : 'commercial');
  const isPublicGood = billingPolicy === 'public_good';
  const shopSearchInput = document.getElementById('questChainShopSearchInput');

  const allowShopAssignment = loginUser?.role === 'admin' && isEditing && !editingChain?.shop_id;

  if (loginUser?.role === 'admin' && shopSelect && !shopSelect.value && !allowShopAssignment) {
    shopSelect.value = ADMIN_SHARED_SHOP_VALUE;
  }
  if (allowShopAssignment && shopSelect && shopSelect.value === ADMIN_SHARED_SHOP_VALUE) {
    shopSelect.value = '';
  }

  if (selectedPlan) {
    taskLimitInput.value = selectedPlan.task_limit ?? '';
    setupFeeInput.value = selectedPlan.setup_fee ?? 0;
  } else if (!isEditing || !planSelect?.value) {
    taskLimitInput.value = '';
    setupFeeInput.value = '';
  }

  if (!loginUser?.role || !shopSelect || !planSelect) return;
  if (loginUser.role !== 'admin' && loginUser.shop_id) {
    shopSelect.value = String(loginUser.shop_id);
  }

  const lockCommercialFields = isEditing && Boolean(editingChain?.shop_id);
  shopSelect.disabled = loginUser.role !== 'admin' || (isEditing && !allowShopAssignment);
  if (shopSearchInput) {
    shopSearchInput.disabled = loginUser.role !== 'admin' || (isEditing && !allowShopAssignment);
    if (shopSearchInput.disabled) {
      shopSearchInput.value = getQuestChainShopDisplayName(shopSelect.value || '');
    }
  }
  planSelect.disabled = lockCommercialFields;
  if (setupFeePaidInput) {
    setupFeePaidInput.value = '0';
  }
  if (monthlyBillingInput) {
    monthlyBillingInput.disabled = isPublicGood;
    if (isPublicGood) monthlyBillingInput.checked = true;
  }
  if (setupFeePaidLabel) {
    setupFeePaidLabel.textContent = isPublicGood
      ? '公益入口免收建置費，建立後只統計 token 與公益代付值。'
      : '商業入口建立後預設待收，請到「計費與 LM 用量」頁面管理收款。';
  }
  if (monthlyBillingLabel) {
    monthlyBillingLabel.textContent = isPublicGood ? '持續統計 LM tokens 與公益代付值' : '啟用每月 LM token 計費';
  }

  if (shopHint) {
    shopHint.textContent = loginUser.role === 'admin'
      ? (allowShopAssignment
        ? '此入口尚未指定商家，請在此補選一次；儲存後商家歸屬會固定，之後若要搬移需由資料遷移處理。'
        : (lockCommercialFields ? '入口建立後商家歸屬會固定保留；若要搬移，建議以資料遷移方式處理。' : 'admin 可指定入口要歸屬到哪個建置商家；由 admin 建立時，會自動視為公益入口。'))
      : '這個入口會自動歸屬在你目前登入的商家底下。';
  }
  if (planHint) {
    planHint.textContent = lockCommercialFields
      ? '入口建立後會保留原本方案與關卡上限，避免後續計價與內容範圍混亂。'
      : (isPublicGood ? '公益入口仍會綁定方案，方便統計關卡上限與捐贈等值。' : '請先選擇方案，系統會自動帶入關卡上限與一次性建置費。');
  }
  if (billingHint) {
    billingHint.textContent = isPublicGood
      ? '這個入口屬於 admin 建置的公益入口：不代收建置費、不向商家收取 LM 月費，但仍會統計 token 與公益代付值。'
      : '商業入口會記錄建置費與月費；若由 admin 建置，會自動改為公益入口。';
  }

  if (summary) {
    const shopText = getQuestChainShopDisplayName(shopSelect?.value || '');
    const planText = selectedPlan?.name || (planSelect?.value ? `方案 #${planSelect.value}` : '尚未指定方案');
    const limitText = taskLimitInput?.value ? `${taskLimitInput.value} 關` : '未設定關卡上限';
    const feeText = formatCurrency(setupFeeInput?.value);
    summary.textContent = isPublicGood
      ? `${shopText}｜${planText}｜${limitText}｜公益入口｜建置費參考 ${feeText}（免收）`
      : `${shopText}｜${planText}｜${limitText}｜建置費 ${feeText}`;
  }
}


// ── Drawer Logic ──────────────────────────────────────────────
const drawer = document.getElementById('rightDrawer');
const overlay = document.getElementById('drawerOverlay');
const drawerTitle = document.getElementById('drawerTitle');

overlay.addEventListener('click', closeDrawer);

function getTaskWizardStepElement(step) {
  return sdDrawer.getTaskWizardStepElement(step);
}

function resolveActiveForm() {
  return sdDrawer.resolveActiveForm({
    drawer,
    formIdMap: DRAWER_FORM_ID_MAP,
    setActiveFormId: (value) => { activeFormId = value; }
  });
}

function scrollToFirstInvalid(scope) {
  sdDrawer.scrollToFirstInvalid(scope);
}

function syncDrawerFooter() {
  sdDrawer.syncDrawerFooter({
    drawer,
    formIdMap: DRAWER_FORM_ID_MAP,
    activeFormId,
    taskWizardStep,
    totalSteps: TASK_WIZARD_TOTAL_STEPS,
    setActiveFormId: (value) => { activeFormId = value; }
  });
}

function syncTaskWizardUI() {
  sdDrawer.syncTaskWizardUI({
    taskWizardStep,
    totalSteps: TASK_WIZARD_TOTAL_STEPS,
    syncDrawerFooter
  });
}

function goTaskWizardStep(direction) {
  if (activeFormId !== 'taskForm') return;
  if (direction > 0 && !sdDrawer.validateTaskWizardStep(taskWizardStep)) return;
  taskWizardStep = Math.min(TASK_WIZARD_TOTAL_STEPS, Math.max(1, taskWizardStep + direction));
  syncTaskWizardUI();
}

function resetTaskWizard() {
  taskWizardStep = 1;
  syncTaskWizardUI();
}

function openDrawer(title, formSectionId, data, opts = {}) {
  sdDrawer.openDrawer({
    title,
    formSectionId,
    data,
    opts,
    drawer,
    overlay,
    drawerTitle,
    fillForm,
    setActiveFormId: (value) => { activeFormId = value; },
    setTaskWizardStep: (value) => { taskWizardStep = value; },
    syncDrawerFooter,
    onAfterOpen: ({ activeFormId: nextActiveFormId, form }) => {
      if (nextActiveFormId === 'questChainForm') {
        const shopSearchInput = document.getElementById('questChainShopSearchInput');
        if (shopSearchInput) shopSearchInput.value = '';
        populateQuestChainShopOptions('');
        const shopSelect = form?.elements?.shop_id;
        if (shopSelect && loginUser?.role !== 'admin' && loginUser?.shop_id) {
          shopSelect.value = String(loginUser.shop_id);
        }
        syncQuestChainCommercialFields();
        const editingChain = form?.elements?.id?.value ? globalQuestChainsMap[String(form.elements.id.value)] || null : null;
        applyQuestChainFormLockUi(editingChain);
        setInlineMessage('questChainFormMsg', '');
      } else if (nextActiveFormId === 'taskForm') {
        syncTaskVideoPreview(form?.elements?.video_url?.value || '');
        setInlineMessage('taskFormMsg', '');
      } else if (nextActiveFormId === 'shopForm') {
        setInlineMessage('shopFormMsg', '');
      } else if (nextActiveFormId === 'planForm') {
        setInlineMessage('planFormMsg', '');
      }
    }
  });
}

function closeDrawer() {
  sdDrawer.closeDrawer({
    drawer,
    overlay,
    setActiveFormId: (value) => { activeFormId = value; },
    setTaskWizardStep: (value) => { taskWizardStep = value; },
    syncDrawerFooter
  });
}

function submitActiveForm() {
  sdDrawer.submitActiveForm({
    activeFormId,
    taskWizardStep,
    totalSteps: TASK_WIZARD_TOTAL_STEPS,
    drawer,
    formIdMap: DRAWER_FORM_ID_MAP,
    setActiveFormId: (value) => { activeFormId = value; },
    goTaskWizardStep,
    syncDrawerFooter,
    showToast
  });
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

const IMAGE_AI_VALIDATION_MODES = sdFormUtils.IMAGE_AI_VALIDATION_MODES;

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
    modeText: '劇情主線', judgeText: '選擇題自動判定',
    summary: '適合情境選擇、知識測驗。四選一自動判定。',
    defaults: { category: 'quest', taskType: 'multiple_choice', validationMode: 'auto' }
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
    modeText: '大富翁模式', judgeText: 'AI 劇情判定',
    summary: '事件格或補給格，交給 AI 依題目與情境自動回應。',
    defaults: { category: 'single', taskType: 'qa', validationMode: 'ai_text_check' }
  },
  // 教育課程
  edu_observe: {
    modeText: '教育課程', judgeText: 'AI 生物辨識',
    summary: '自然觀察課程：學生拍攝指定生物或植物，AI 自動辨識驗證。適合生態踏查。',
    defaults: { category: 'quest', taskType: 'photo', validationMode: 'ai_identify' }
  },
  edu_quiz: {
    modeText: '教育課程', judgeText: '自動判定',
    summary: '隨堂測驗：可設定選擇題或填答題，系統自動批改。適合導覽後的知識複習。',
    defaults: { category: 'quest', taskType: 'multiple_choice', validationMode: 'auto' }
  },
  edu_fieldwork: {
    modeText: '教育課程', judgeText: '地點打卡驗證',
    summary: '實地考察：學生到達指定地點自動打卡完成。適合戶外教學路線。',
    defaults: { category: 'quest', taskType: 'location', validationMode: 'auto' }
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
  if (task?.validation_mode === 'ai_text_check' && task?.type !== 'quest') return 'board_event';
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
  const validationSel = document.getElementById('validationModeSelect');
  if (!sel) return;
  sel.addEventListener('change', () => {
    mcDiv.style.display = sel.value === 'multiple_choice' ? 'block' : 'none';
    saDiv.style.display = (sel.value === 'number' || sel.value === 'keyword') ? 'block' : 'none';
    if (validationSel) {
      validationSel.value = normalizeValidationModeForTaskType(sel.value, validationSel.value);
      validationSel.dispatchEvent(new Event('change'));
    }
  });
}

function syncTaskLocationRequirementUi() {
  const form = document.getElementById('taskForm');
  const typeSel = document.getElementById('taskTypeSelect');
  const gpsToggle = document.getElementById('taskLocationRequiredToggle');
  const hint = document.getElementById('taskLocationRequiredHint');
  const latInput = document.getElementById('taskLatInput');
  const lngInput = document.getElementById('taskLngInput');
  const radiusInput = form?.elements?.radius;
  if (!form || !typeSel || !gpsToggle || !latInput || !lngInput || !radiusInput) return;

  const forcedByTaskType = typeSel.value === 'location';
  if (forcedByTaskType) gpsToggle.checked = true;
  gpsToggle.disabled = forcedByTaskType;

  const gpsRequired = forcedByTaskType || gpsToggle.checked;
  [latInput, lngInput, radiusInput].forEach((input) => {
    input.required = gpsRequired;
    input.setCustomValidity('');
  });

  if (hint) {
    hint.textContent = gpsRequired
      ? '已啟用 GPS 位置限制：玩家必須到這組座標半徑內，才有辦法接取任務。'
      : '未啟用 GPS 位置限制：任何地方都可以開啟任務；經緯度與半徑可留空，不會阻擋儲存。';
  }
}

function setupLocationRequirementToggle() {
  const typeSel = document.getElementById('taskTypeSelect');
  const gpsToggle = document.getElementById('taskLocationRequiredToggle');
  if (!typeSel || !gpsToggle) return;
  typeSel.addEventListener('change', syncTaskLocationRequirementUi);
  gpsToggle.addEventListener('change', syncTaskLocationRequirementUi);
  syncTaskLocationRequirementUi();
}

const validationModeMeta = {
  ai_text_check: { helper: 'AI 會閱讀玩家的文字回答，自動判定是否符合題意。', label: '回答主題', placeholder: '請描述你觀察到的內容', showCount: false, showScore: false },
  ai_count: { helper: 'AI 判斷指定物件是否達到目標數量。', label: '目標物件標籤', placeholder: 'plastic_bottle', showCount: true, showScore: false },
  ai_identify: { helper: 'AI 辨識照片是否為指定物件或植物。', label: '指定辨識標籤', placeholder: 'morning_glory', showCount: false, showScore: false },
  ai_score: { helper: 'AI 依主題為照片評分，達門檻即通關。', label: '評分主題', placeholder: 'group_photo', showCount: false, showScore: true },
  ai_rule_check: { helper: 'AI 檢查照片是否符合指定規則。', label: '規則主題', placeholder: 'beach_cleanup', showCount: false, showScore: false },
  ai_reference_match: { helper: '比對玩家照片與任務封面圖是否為同一地點。', label: '比對主題', placeholder: 'treasure_spot', showCount: false, showScore: false }
};

function normalizeValidationModeForTaskType(taskType = 'qa', validationMode = 'auto') {
  return sdFormUtils.normalizeValidationModeForTaskType(taskType, validationMode);
}

/** 與 task-form-copy.js 同步；若該檔未載入或快取舊版，仍要能顯示正確範例，避免畫面卡在海洋／寶特瓶舊文案。 */
const FALLBACK_AI_JUDGE_PLACEHOLDERS = {
  ai_text_check: {
    system:
      '你是關卡「文字」裁判：只依下方「任務說明」判斷是否扣題；不代寫作文、不延伸創作；同義改寫可接受時請在理由簡述。',
    user:
      '請依本關規約判斷玩家回答是否扣題。例：須同時提到「地層受擠壓」與「逆斷層」兩個概念；只提到其中一個不算過關；可用自己的話，不必逐字相同。',
    failure: '回答裡還缺「○○」或「△△」其中一項，對照關卡說明再補一句即可。',
    success: '兩個重點都有講到，這一關過關！'
  },
  ai_count: {
    system:
      '你是關卡「計數」裁判：只數任務說明裡指定的物件類別；遮擋過半、倒影、非本體不計；邊界採保守。',
    user:
      '請數照片中「易開罐本體」數量（不含壓扁碎片與遠方模糊小點）。達 5 個通關；若同一物重疊只算 1。',
    failure: '目前數到的數量還不到門檻，靠近主體、避免反光再拍一張。',
    success: '數量達標，過關！'
  },
  ai_identify: {
    system:
      '你是關卡「辨識」裁判：只判斷任務說明中的目標是否清楚出現在畫面主要區域；不猜地點、不評美醜。',
    user:
      '請判斷畫面中是否清楚可見「指定招牌上的店名全稱」或「完整花冠的牽牛花」二擇一即過關；局部裁切不算。',
    failure: '鏡頭裡還找不到清楚的主體，請對焦後再試一次。',
    success: '有拍到清楚目標，過關！'
  },
  ai_score: {
    system:
      '你是關卡「攝影／構圖評分」裁判：只依下方「任務說明」裡的配分表與通關門檻給分；不臆測關卡主題（主題完全由任務說明定義）；主觀分項須註明上限並避免與必要項矛盾。',
    user:
      '【請改成你的主題，以下為配分表範例】① 必要項（共 6 分）：畫面須同時清楚出現「天空、沙灘、海」三元素，缺一則必要項不滿分。② 加分（+1）：有清楚可辨的人物。③ 主觀池（至多 3 分）：幽默、美感等，由你依畫面自由心證，但不得推翻①②的事實認定。④ 通關：總分須達本關「最低通過分數」欄位所設門檻。',
    failure: '目前總分未達通關門檻，或必要項／加分條件未滿足；請對照上方配分表調整畫面後再拍。',
    success: '配分表各項與總分皆達標，恭喜過關！'
  },
  ai_rule_check: {
    system:
      '你是關卡「規則檢查」裁判：只檢查任務說明列出的必達條與禁則；未列的不臆測、不額外扣分。',
    user:
      '請逐條檢查：① 畫面須同時出現「手套」與「垃圾袋」② 不可只有手部特寫而看不到環境脈絡。任一禁則觸發即不通關。',
    failure: '規則裡還有條件沒達成（例：缺手套或構圖太局部），調整後再拍。',
    success: '列出的條件都符合，過關！'
  },
  ai_reference_match: {
    system:
      '你是關卡「場景比對」裁判：比對玩家照片與關卡封面／參考意圖是否為同一地點或同一視角類型；容許天候、色差、人潮差異。',
    user:
      '請比對是否與封面所代表的「同一個地標入口」或「同一面解說看板」為同一處；僅風格相似但建築不同不算過關。',
    failure: '看起來不像同一地標或視角，請靠近封面構圖再拍一張。',
    success: '地點或構圖對上了，過關！'
  }
};

function resolveAiJudgePlaceholders(mode) {
  const fromCopy = window.StaffDashboardTaskFormCopy?.getAiJudgePlaceholders?.(mode);
  if (fromCopy) return fromCopy;
  return FALLBACK_AI_JUDGE_PLACEHOLDERS[mode] || null;
}

function applyAiJudgePlaceholderAttrs(form, judgePh) {
  if (!judgePh || !form) return;
  const sysTa = form.querySelector('textarea[name="ai_system_prompt"]');
  const userTa = form.querySelector('textarea[name="ai_user_prompt"]');
  const failIn = form.querySelector('input[name="failure_message"]');
  const okIn = form.querySelector('input[name="success_message"]');
  if (sysTa && judgePh.system) {
    sysTa.setAttribute('placeholder', judgePh.system);
    sysTa.placeholder = judgePh.system;
  }
  if (userTa && judgePh.user) {
    userTa.setAttribute('placeholder', judgePh.user);
    userTa.placeholder = judgePh.user;
  }
  if (failIn && judgePh.failure) {
    failIn.setAttribute('placeholder', judgePh.failure);
    failIn.placeholder = judgePh.failure;
  }
  if (okIn && judgePh.success) {
    okIn.setAttribute('placeholder', judgePh.success);
    okIn.placeholder = judgePh.success;
  }
}

/** 依「提交類型 + 驗證模式」同步 AI 區塊顯示與各欄 placeholder（wizard 分步後仍可呼叫）。 */
function applyTaskValidationModeUi() {
  const sel = document.getElementById('validationModeSelect');
  const typeSel = document.getElementById('taskTypeSelect');
  const fields = document.getElementById('aiConfigFields');
  const aiWrap = document.getElementById('taskAiAdvancedWrap');
  const helper = document.getElementById('aiModeHelper');
  const labelEl = document.getElementById('aiTargetLabelLabel');
  const labelInput = document.getElementById('aiTargetLabelInput');
  const countGrp = document.getElementById('aiTargetCountGroup');
  const scoreGrp = document.getElementById('aiMinScoreGroup');
  if (!sel || !fields) return;

  const normalizedMode = normalizeValidationModeForTaskType(typeSel?.value || 'qa', sel.value);
  if (sel.value !== normalizedMode) {
    sel.value = normalizedMode;
  }
  const isAi = sel.value.startsWith('ai_');
  if (aiWrap) aiWrap.style.display = isAi ? 'block' : 'none';
  fields.style.display = isAi ? 'block' : 'none';
  if (!isAi) return;

  const m = validationModeMeta[sel.value] || validationModeMeta.ai_identify;
  const human = window.StaffDashboardTaskFormCopy?.getValidationUi?.(sel.value);
  if (helper) helper.textContent = human?.helper || m.helper;
  if (labelEl) labelEl.textContent = human?.label || m.label;
  if (labelInput) labelInput.placeholder = human?.placeholder || m.placeholder;
  if (countGrp) countGrp.style.display = m.showCount ? 'block' : 'none';
  if (scoreGrp) scoreGrp.style.display = m.showScore ? 'block' : 'none';

  const form = document.getElementById('taskForm');
  const modeSnapshot = sel.value;
  const judgePh = resolveAiJudgePlaceholders(sel.value);
  applyAiJudgePlaceholderAttrs(form, judgePh);

  requestAnimationFrame(() => {
    const selLater = document.getElementById('validationModeSelect');
    const formLater = document.getElementById('taskForm');
    if (!selLater || !formLater || selLater.value !== modeSnapshot) return;
    applyAiJudgePlaceholderAttrs(formLater, resolveAiJudgePlaceholders(selLater.value));
  });
}

function setupValidationModeToggle() {
  const sel = document.getElementById('validationModeSelect');
  if (!sel) return;
  sel.addEventListener('change', applyTaskValidationModeUi);
  applyTaskValidationModeUi();
}

function wireTaskAiAdvancedPlaceholderResync() {
  const panel = document.getElementById('taskAiAdvancedPanel');
  if (!panel || panel.dataset.placeholderResync === '1') return;
  panel.dataset.placeholderResync = '1';
  panel.addEventListener('toggle', () => {
    if (panel.open) applyTaskValidationModeUi();
  });
}

setupCategoryToggle();
setupTaskTypeToggle();
setupValidationModeToggle();
wireTaskAiAdvancedPlaceholderResync();
setupLocationRequirementToggle();

window.applyTaskValidationModeUi = applyTaskValidationModeUi;

// Apply initial blueprint
applyBlueprint('story_ai_identify', false);

// ── AI Payload Builder ────────────────────────────────────────
function buildAiTaskPayload(form) {
  return sdFormUtils.buildAiTaskPayload(form);
}

function validateAiPayload(form, payload, msgEl) {
  return sdFormUtils.validateAiPayload(payload, msgEl);
}

