const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4325';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const COVER_PATH = process.env.COVER_PATH || path.resolve(__dirname, '../public/images/mascot.png');
const ARTIFACT_DIR = path.resolve(__dirname, '../output/playwright');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickByText(page, selector, text) {
  const ok = await page.evaluate((selectorArg, textArg) => {
    const target = [...document.querySelectorAll(selectorArg)].find((el) =>
      !el.disabled && el.offsetParent !== null && (el.textContent || '').trim().includes(textArg)
    );
    if (!target) return false;
    target.click();
    return true;
  }, selector, text);
  if (!ok) {
    throw new Error(`Cannot find ${selector} with text "${text}"`);
  }
}

async function setValue(page, selector, value) {
  await page.waitForSelector(selector, { visible: true });
  await page.$eval(
    selector,
    (el, nextValue) => {
      el.value = nextValue;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    value
  );
}

async function setChecked(page, selector, checked) {
  await page.waitForSelector(selector, { visible: true });
  await page.$eval(
    selector,
    (el, nextChecked) => {
      el.checked = nextChecked;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    checked
  );
}

async function clickVisibleButtonByText(page, text) {
  await page.evaluate((textArg) => {
    const target = [...document.querySelectorAll('button')]
      .find((el) => !el.disabled && el.offsetParent !== null && (el.textContent || '').trim().includes(textArg));
    if (!target) throw new Error(`Cannot find visible button: ${textArg}`);
    target.click();
  }, text);
}

async function clickQuestCardMenuAction(page, title, actionText) {
  await page.evaluate(({ questTitle, nextActionText }) => {
    const card = [...document.querySelectorAll('.quest-card')].find((el) => el.textContent.includes(questTitle));
    if (!card) throw new Error(`Cannot find quest card: ${questTitle}`);
    const menuBtn = card.querySelector('.card-menu-btn');
    if (!menuBtn) throw new Error(`Cannot find quest card menu button: ${questTitle}`);
    menuBtn.click();
    const actionBtn = [...card.querySelectorAll('.card-menu button')].find((btn) =>
      (btn.textContent || '').trim().includes(nextActionText)
    );
    if (!actionBtn) throw new Error(`Cannot find quest card action "${nextActionText}" for ${questTitle}`);
    actionBtn.click();
  }, { questTitle: title, nextActionText: actionText });
}

async function submitQuestChainForm(page) {
  await page.evaluate(() => {
    const form = document.getElementById('questChainForm');
    if (!form) {
      throw new Error('Quest chain form is missing');
    }
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
      return;
    }
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
}

async function submitTaskForm(page) {
  await page.evaluate(() => {
    const form = document.getElementById('taskForm');
    if (!form) {
      throw new Error('Task form is missing');
    }
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
      return;
    }
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
}

async function selectFirstNonEmptyOption(page, selector) {
  await page.waitForSelector(selector, { visible: true });
  return page.$eval(selector, (el) => {
    const option = [...el.options].find((opt) => opt.value);
    if (!option) throw new Error(`No non-empty option found for ${el.name || el.id}`);
    el.value = option.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return option.value;
  });
}

async function loginAsAdmin(page) {
  await page.goto(`${BASE_URL}/login.html?force=1`, { waitUntil: 'networkidle2' });
  const result = await page.evaluate(
    async ({ username, password }) => {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, role: 'staff_portal' })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('loginUser', JSON.stringify(data.user));
      }
      return { status: res.status, data };
    },
    { username: ADMIN_USER, password: ADMIN_PASSWORD }
  );

  if (!result.data?.success) {
    throw new Error(`Admin login failed: ${JSON.stringify(result)}`);
  }

  return result.data.user;
}

async function createShopViaApi(page, stamp) {
  const shopUsername = `shop_${stamp}`;
  const shopPassword = 'shop1234';
  const result = await page.evaluate(
    async ({ username, password, shopName }) => {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          role: 'shop',
          shop_name: shopName,
          contact_name: '驗收店家',
          contact_phone: '0900000000',
          contact_email: 'shop@example.com',
          shop_address: '測試路 1 號',
          shop_description: '第四階段驗收用商家'
        })
      });
      return { status: res.status, body: await res.json() };
    },
    { username: shopUsername, password: shopPassword, shopName: `第四階段驗收商家-${stamp}` }
  );

  if (!result.body?.success || !result.body?.shop_id) {
    throw new Error(`Create shop failed: ${JSON.stringify(result)}`);
  }

  return { shopId: String(result.body.shop_id), shopUsername, shopPassword };
}

async function getQuestChainIdByTitle(page, title) {
  return page.evaluate(async (targetTitle) => {
    const res = await fetch('/api/quest-chains', { credentials: 'include' });
    const data = await res.json();
    const chain = (data.questChains || []).find((item) => item.title === targetTitle);
    return chain ? String(chain.id) : null;
  }, title);
}

async function getQuestChainByTitle(page, title) {
  return page.evaluate(async (targetTitle) => {
    const res = await fetch('/api/quest-chains', { credentials: 'include' });
    const data = await res.json();
    return (data.questChains || []).find((item) => item.title === targetTitle) || null;
  }, title);
}

async function getTaskIdByName(page, questChainId, taskName) {
  return page.evaluate(async ({ chainId, targetName }) => {
    const res = await fetch('/api/tasks/admin', { credentials: 'include', headers: { 'x-username': 'admin' } });
    const data = await res.json();
    const task = (data.tasks || []).find((item) => String(item.quest_chain_id) === String(chainId) && item.name === targetName);
    return task ? String(task.id) : null;
  }, { chainId: questChainId, targetName: taskName });
}

async function openQuestDetailFromList(page, title) {
  await page.evaluate((questTitle) => {
    const card = [...document.querySelectorAll('.quest-card')].find((el) => el.textContent.includes(questTitle));
    if (!card) throw new Error(`Cannot find quest card: ${questTitle}`);
    const manageButton = [...card.querySelectorAll('button')].find((btn) => (btn.textContent || '').includes('管理內容'));
    if (!manageButton) throw new Error(`Cannot find 管理內容 button for ${questTitle}`);
    manageButton.click();
  }, title);
  await page.waitForFunction(
    (questTitle) => document.querySelector('#detailQuestTitle')?.textContent.includes(questTitle),
    {},
    title
  );
}

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 1100 }
  });
  const page = await browser.newPage();
  const stepLog = [];
  const stamp = Date.now();
  const questTitle = `Phase4驗收入口-${stamp}`;
  const questTitlePublished = `${questTitle}-已發布`;
  const taskTitle = `Phase4驗收關卡-${stamp}`;
  const taskTitleLocked = `${taskTitle}-已鎖定文案`;
  let questChainId = null;
  let taskId = null;

  try {
    stepLog.push('登入 admin');
    await loginAsAdmin(page);

    stepLog.push('建立驗收 shop');
    const { shopId } = await createShopViaApi(page, stamp);

    stepLog.push('打開 staff-dashboard-v2');
    await page.goto(`${BASE_URL}/staff-dashboard-v2.html`, { waitUntil: 'networkidle2' });

    stepLog.push('建立草稿入口');
    await clickByText(page, 'button', '新增入口');
    await wait(250);
    await setValue(page, '#questChainForm select[name="shop_id"]', shopId);
    await selectFirstNonEmptyOption(page, '#questChainForm select[name="plan_id"]');
    await setValue(page, '#questChainForm input[name="title"]', questTitle);
    await setValue(page, '#questChainForm textarea[name="short_description"]', '第四階段草稿入口驗收');
    await setValue(page, '#questChainForm textarea[name="description"]', '先建立草稿，再確認發布後鎖定規則。');
    await setValue(page, '#questChainForm input[name="chain_points"]', '120');
    await setChecked(page, '#questChainForm input[name="is_active"]', false);
    await submitQuestChainForm(page);
    await page.waitForFunction(
      (title) => [...document.querySelectorAll('.quest-card-title')].some((el) => el.textContent.includes(title)),
      {},
      questTitle
    );
    await page.waitForFunction(
      (title) => {
        const card = [...document.querySelectorAll('.quest-card')].find((el) => el.textContent.includes(title));
        return card && card.textContent.includes('可編輯結構');
      },
      {},
      questTitle
    );

    stepLog.push('草稿階段修改入口結構欄位');
    await clickQuestCardMenuAction(page, questTitle, '編輯入口');
    await wait(250);
    await setValue(page, '#questChainForm select[name="play_style"]', 'round_score');
    await setValue(page, '#questChainForm input[name="chain_points"]', '180');
    await submitQuestChainForm(page);
    await page.waitForFunction(
      (title) => {
        const card = [...document.querySelectorAll('.quest-card')].find((el) => el.textContent.includes(title));
        return card && card.textContent.includes('180 分');
      },
      {},
      questTitle
    );

    stepLog.push('新增草稿關卡');
    await openQuestDetailFromList(page, questTitle);
    await clickByText(page, 'button', '新增關卡');
    await wait(300);
    await setValue(page, '#taskBlueprintSelect', 'story_keyword');
    await clickVisibleButtonByText(page, '下一步');
    await page.waitForFunction(() => document.querySelector('[data-task-step="2"]')?.classList.contains('active'));
    await setValue(page, '#taskForm select[name="type"]', 'quest');
    await setValue(page, '#taskForm input[name="quest_order"]', '1');
    await setValue(page, '#taskForm input[name="name"]', taskTitle);
    await setValue(page, '#taskForm input[name="lat"]', '24.6782946');
    await setValue(page, '#taskForm input[name="lng"]', '121.7602662');
    await setValue(page, '#taskForm input[name="radius"]', '25');
    await setValue(page, '#taskForm input[name="points"]', '15');
    await clickVisibleButtonByText(page, '下一步');
    await page.waitForFunction(() => document.querySelector('[data-task-step="3"]')?.classList.contains('active'));
    await setValue(page, '#taskForm select[name="task_type"]', 'keyword');
    await setValue(page, '#taskForm select[name="validation_mode"]', 'keyword');
    await setValue(page, '#taskForm input[name="correct_answer_text"]', '沙丘');
    await clickVisibleButtonByText(page, '下一步');
    await page.waitForFunction(() => document.querySelector('[data-task-step="4"]')?.classList.contains('active'));
    await setValue(page, '#taskForm textarea[name="description"]', '草稿階段可自由建置的驗收關卡');
    const photoInput = await page.$('#taskPhotoInput');
    await photoInput.uploadFile(COVER_PATH);
    await submitTaskForm(page);
    questChainId = await getQuestChainIdByTitle(page, questTitle);
    await page.waitForFunction(
      async ({ chainId, title }) => {
        const res = await fetch('/api/tasks/admin', { credentials: 'include', headers: { 'x-username': 'admin' } });
        const data = await res.json();
        return (data.tasks || []).some((task) => String(task.quest_chain_id) === String(chainId) && task.name === title);
      },
      { timeout: 15000 },
      { chainId: questChainId, title: taskTitle }
    );
    await page.goto(`${BASE_URL}/staff-dashboard-v2.html`, { waitUntil: 'networkidle2' });
    await openQuestDetailFromList(page, questTitle);
    await page.waitForFunction(
      (title) => [...document.querySelectorAll('.task-item-title')].some((el) => el.textContent.includes(title)),
      { timeout: 15000 },
      taskTitle
    );

    stepLog.push('回列表並發布入口');
    await clickByText(page, '.breadcrumb', '返回玩法入口列表');
    await page.waitForFunction(() => document.querySelector('.v2-view.active h2')?.textContent.includes('玩法入口管理'));
    await clickQuestCardMenuAction(page, questTitle, '編輯入口');
    await wait(250);
    await setValue(page, '#questChainForm input[name="title"]', questTitlePublished);
    await setValue(page, '#questChainForm textarea[name="short_description"]', '入口已發布，接下來驗證鎖定');
    await setChecked(page, '#questChainForm input[name="setup_fee_paid"]', true);
    await setChecked(page, '#questChainForm input[name="is_active"]', true);
    await submitQuestChainForm(page);
    await page.waitForFunction(
      (title) => {
        const card = [...document.querySelectorAll('.quest-card')].find((el) => el.textContent.includes(title));
        return card && card.textContent.includes('結構已鎖定');
      },
      { timeout: 15000 },
      questTitlePublished
    );

    stepLog.push('驗證入口編輯畫面鎖定狀態');
    await clickQuestCardMenuAction(page, questTitlePublished, '編輯入口');
    await page.waitForSelector('#questChainFormLockBanner', { visible: true });
    const questFormLockState = await page.evaluate(() => ({
      bannerVisible: document.getElementById('questChainFormLockBanner')?.offsetParent !== null,
      modeDisabled: document.querySelector('#questChainForm select[name="mode_type"]')?.disabled,
      chainPointsDisabled: document.querySelector('#questChainForm input[name="chain_points"]')?.disabled,
      playStyleDisabled: document.querySelector('#questChainForm select[name="play_style"]')?.disabled,
      titleDisabled: document.querySelector('#questChainForm input[name="title"]')?.disabled
    }));
    if (!questFormLockState.bannerVisible || !questFormLockState.modeDisabled || !questFormLockState.chainPointsDisabled || !questFormLockState.playStyleDisabled || questFormLockState.titleDisabled) {
      throw new Error(`Quest form lock state invalid: ${JSON.stringify(questFormLockState)}`);
    }
    const allowedQuestApiResult = await page.evaluate(async ({ targetTitle }) => {
      const listRes = await fetch('/api/quest-chains', { credentials: 'include' });
      const listData = await listRes.json();
      const chain = (listData.questChains || []).find((item) => item.title === targetTitle);
      if (!chain) return { status: 404, body: { message: 'chain not found' } };
      const fd = new FormData();
      fd.append('title', chain.title);
      fd.append('description', chain.description || '');
      fd.append('short_description', '發布後仍可修改文案');
      fd.append('chain_points', String(chain.chain_points || 0));
      fd.append('badge_name', chain.badge_name || '');
      fd.append('mode_type', chain.mode_type || 'story_campaign');
      fd.append('entry_order', String(chain.entry_order || 0));
      fd.append('entry_button_text', chain.entry_button_text || '');
      fd.append('entry_scene_label', chain.entry_scene_label || '');
      fd.append('access_mode', chain.access_mode || 'public');
      fd.append('experience_mode', chain.experience_mode || 'formal');
      fd.append('play_style', chain.play_style || '');
      fd.append('is_active', chain.is_active ? '1' : '0');
      const res = await fetch(`/api/quest-chains/${chain.id}`, {
        method: 'PUT',
        credentials: 'include',
        body: fd
      });
      return { status: res.status, body: await res.json() };
    }, { targetTitle: questTitlePublished });
    if (allowedQuestApiResult.status !== 200 || !allowedQuestApiResult.body?.success) {
      throw new Error(`Locked quest copy update should succeed: ${JSON.stringify(allowedQuestApiResult)}`);
    }
    await page.evaluate(() => {
      const closeBtn = document.querySelector('#rightDrawer .drawer-close');
      if (closeBtn) closeBtn.click();
    });
    const updatedQuestChain = await getQuestChainByTitle(page, questTitlePublished);
    if (updatedQuestChain?.short_description !== '發布後仍可修改文案') {
      throw new Error(`Published quest copy update not persisted: ${JSON.stringify(updatedQuestChain)}`);
    }

    stepLog.push('驗證入口詳情頁鎖定狀態');
    await openQuestDetailFromList(page, questTitlePublished);
    await page.waitForSelector('#questStructureLockBanner', { visible: true });
    const questDetailLockState = await page.evaluate(() => ({
      bannerVisible: document.getElementById('questStructureLockBanner')?.offsetParent !== null,
      addTaskDisabled: document.getElementById('btnAddTask')?.disabled
    }));
    if (!questDetailLockState.bannerVisible || !questDetailLockState.addTaskDisabled) {
      throw new Error(`Quest detail lock state invalid: ${JSON.stringify(questDetailLockState)}`);
    }

    stepLog.push('驗證關卡編輯畫面鎖定狀態');
    await page.evaluate((title) => {
      const item = [...document.querySelectorAll('.task-item')].find((el) => el.textContent.includes(title));
      const editButton = [...item.querySelectorAll('button')].find((btn) => (btn.textContent || '').includes('編輯'));
      editButton.click();
    }, taskTitle);
    await page.waitForSelector('#taskStructureLockBanner', { visible: true });
    const taskLockState = await page.evaluate(() => ({
      bannerVisible: document.getElementById('taskStructureLockBanner')?.offsetParent !== null,
      pointsDisabled: document.querySelector('#taskForm input[name="points"]')?.disabled,
      validationDisabled: document.querySelector('#taskForm select[name="validation_mode"]')?.disabled,
      descriptionDisabled: document.querySelector('#taskForm textarea[name="description"]')?.disabled
    }));
    if (!taskLockState.bannerVisible || !taskLockState.pointsDisabled || !taskLockState.validationDisabled || taskLockState.descriptionDisabled) {
      throw new Error(`Task lock state invalid: ${JSON.stringify(taskLockState)}`);
    }
    stepLog.push('抓取入口與關卡 id');
    questChainId = await getQuestChainIdByTitle(page, questTitlePublished);
    if (!questChainId) throw new Error('Cannot resolve quest chain id after publish');
    taskId = await getTaskIdByName(page, questChainId, taskTitle);
    if (!taskId) throw new Error('Cannot resolve task id before locked copy update');

    stepLog.push('API 驗證鎖定後仍可更新關卡文案');
    const allowedTaskApiResult = await page.evaluate(async ({ targetTaskId, nextName }) => {
      const detailRes = await fetch(`/api/tasks/${targetTaskId}`, { credentials: 'include' });
      const detailData = await detailRes.json();
      const task = detailData.task;
      const body = {
        name: nextName,
        lat: String(task.lat),
        lng: String(task.lng),
        radius: String(task.radius),
        description: '發布後只改文案，結構保持鎖定',
        photoUrl: task.photoUrl || '',
        youtubeUrl: task.youtubeUrl || null,
        ar_image_url: task.ar_image_url || null,
        points: String(task.points || 0),
        task_type: task.task_type,
        options: task.options || null,
        correct_answer: task.correct_answer || null,
        submission_type: task.submission_type,
        validation_mode: task.validation_mode,
        ai_config: task.ai_config || null,
        pass_criteria: task.pass_criteria || null,
        failure_message: task.failure_message || null,
        success_message: task.success_message || null,
        max_attempts: task.max_attempts || null,
        location_required: !!task.location_required,
        type: task.type,
        quest_chain_id: task.quest_chain_id,
        quest_order: task.quest_order,
        time_limit_start: task.time_limit_start || null,
        time_limit_end: task.time_limit_end || null,
        max_participants: task.max_participants || null,
        required_item_id: task.required_item_id || null,
        reward_item_id: task.reward_item_id || null,
        is_final_step: !!task.is_final_step,
        ar_model_id: task.ar_model_id || null,
        ar_order_model: task.ar_order_model || null,
        ar_order_image: task.ar_order_image || null,
        ar_order_youtube: task.ar_order_youtube || null,
        bgm_url: task.bgm_url || null,
        stage_template: task.stage_template || null,
        stage_intro: task.stage_intro || null,
        hint_text: task.hint_text || null,
        story_context: task.story_context || null,
        guide_content: task.guide_content || null,
        rescue_content: task.rescue_content || null,
        event_config: task.event_config || null,
        is_active: !!task.is_active
      };
      const res = await fetch(`/api/tasks/${targetTaskId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: res.status, body: await res.json() };
    }, { targetTaskId: taskId, nextName: taskTitleLocked });
    if (allowedTaskApiResult.status !== 200 || !allowedTaskApiResult.body?.success) {
      throw new Error(`Locked task copy update should succeed: ${JSON.stringify(allowedTaskApiResult)}`);
    }
    await page.evaluate(() => {
      const closeBtn = document.querySelector('#rightDrawer .drawer-close');
      if (closeBtn) closeBtn.click();
    });
    await page.goto(`${BASE_URL}/staff-dashboard-v2.html`, { waitUntil: 'networkidle2' });
    await openQuestDetailFromList(page, questTitlePublished);
    await page.waitForFunction(
      (title) => [...document.querySelectorAll('.task-item-title')].some((el) => el.textContent.includes(title)),
      { timeout: 15000 },
      taskTitleLocked
    );
    if (!taskId) throw new Error('Cannot resolve task id after lock');

    stepLog.push('API 驗證入口結構修改被擋');
    const questApiResult = await page.evaluate(async ({ targetQuestChainId }) => {
      const listRes = await fetch('/api/quest-chains', { credentials: 'include' });
      const listData = await listRes.json();
      const chain = (listData.questChains || []).find((item) => String(item.id) === String(targetQuestChainId));
      if (!chain) return { status: 404, body: { message: 'chain not found' } };
      const fd = new FormData();
      fd.append('title', chain.title);
      fd.append('description', chain.description || '');
      fd.append('short_description', chain.short_description || '');
      fd.append('chain_points', String(chain.chain_points || 0));
      fd.append('badge_name', chain.badge_name || '');
      fd.append('mode_type', 'board_game');
      fd.append('entry_order', String(chain.entry_order || 0));
      fd.append('entry_button_text', chain.entry_button_text || '');
      fd.append('entry_scene_label', chain.entry_scene_label || '');
      fd.append('play_style', chain.play_style || '');
      fd.append('access_mode', chain.access_mode || 'public');
      fd.append('experience_mode', chain.experience_mode || 'formal');
      fd.append('is_active', chain.is_active ? '1' : '0');
      const res = await fetch(`/api/quest-chains/${targetQuestChainId}`, {
        method: 'PUT',
        credentials: 'include',
        body: fd
      });
      return { status: res.status, body: await res.json() };
    }, { targetQuestChainId: questChainId });
    if (questApiResult.status !== 409 || questApiResult.body?.code !== 'QUEST_CHAIN_STRUCTURE_LOCKED') {
      throw new Error(`Quest chain lock API did not reject as expected: ${JSON.stringify(questApiResult)}`);
    }

    stepLog.push('API 驗證關卡結構修改被擋');
    const taskApiResult = await page.evaluate(async ({ targetTaskId }) => {
      const detailRes = await fetch(`/api/tasks/${targetTaskId}`, { credentials: 'include' });
      const detailData = await detailRes.json();
      const task = detailData.task;
      const body = {
        name: task.name,
        lat: String(task.lat),
        lng: String(task.lng),
        radius: String(task.radius),
        description: task.description || '',
        photoUrl: task.photoUrl || '',
        youtubeUrl: task.youtubeUrl || null,
        ar_image_url: task.ar_image_url || null,
        points: String(Number(task.points || 0) + 5),
        task_type: task.task_type,
        options: task.options || null,
        correct_answer: task.correct_answer || null,
        submission_type: task.submission_type,
        validation_mode: task.validation_mode,
        ai_config: task.ai_config || null,
        pass_criteria: task.pass_criteria || null,
        failure_message: task.failure_message || null,
        success_message: task.success_message || null,
        max_attempts: task.max_attempts || null,
        location_required: !!task.location_required,
        type: task.type,
        quest_chain_id: task.quest_chain_id,
        quest_order: task.quest_order,
        time_limit_start: task.time_limit_start || null,
        time_limit_end: task.time_limit_end || null,
        max_participants: task.max_participants || null,
        required_item_id: task.required_item_id || null,
        reward_item_id: task.reward_item_id || null,
        is_final_step: !!task.is_final_step,
        ar_model_id: task.ar_model_id || null,
        ar_order_model: task.ar_order_model || null,
        ar_order_image: task.ar_order_image || null,
        ar_order_youtube: task.ar_order_youtube || null,
        bgm_url: task.bgm_url || null,
        stage_template: task.stage_template || null,
        stage_intro: task.stage_intro || null,
        hint_text: task.hint_text || null,
        story_context: task.story_context || null,
        guide_content: task.guide_content || null,
        rescue_content: task.rescue_content || null,
        event_config: task.event_config || null,
        is_active: !!task.is_active
      };
      const res = await fetch(`/api/tasks/${targetTaskId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: res.status, body: await res.json() };
    }, { targetTaskId: taskId });
    if (taskApiResult.status !== 409 || taskApiResult.body?.code !== 'TASK_STRUCTURE_LOCKED') {
      throw new Error(`Task lock API did not reject as expected: ${JSON.stringify(taskApiResult)}`);
    }

    stepLog.push('API 驗證入口刪除被擋');
    const deleteApiResult = await page.evaluate(async ({ targetQuestChainId }) => {
      const res = await fetch(`/api/quest-chains/${targetQuestChainId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      return { status: res.status, body: await res.json() };
    }, { targetQuestChainId: questChainId });
    if (deleteApiResult.status !== 409 || deleteApiResult.body?.message?.includes('已發布') !== true) {
      throw new Error(`Quest delete lock API did not reject as expected: ${JSON.stringify(deleteApiResult)}`);
    }

    console.log('VERIFY_SUCCESS');
    console.log('STEP_LOG', JSON.stringify(stepLog, null, 2));
  } catch (error) {
    console.error('VERIFY_FAIL', error.message);
    console.log('STEP_LOG', JSON.stringify(stepLog, null, 2));
    try {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-phase34-failure.png'), fullPage: true });
    } catch (screenshotError) {
      console.error('SCREENSHOT_FAIL', screenshotError.message);
    }
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
