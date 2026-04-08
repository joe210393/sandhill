const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4325';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const COVER_PATH = process.env.COVER_PATH || path.resolve(__dirname, '../public/images/mascot.png');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickByText(page, selector, text) {
  const ok = await page.evaluate((selectorArg, textArg) => {
    const target = [...document.querySelectorAll(selectorArg)].find((el) =>
      (el.textContent || '').trim().includes(textArg)
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

async function clickVisibleButtonByText(page, text) {
  await page.evaluate((textArg) => {
    const target = [...document.querySelectorAll('button')]
      .find((el) => !el.disabled && el.offsetParent !== null && (el.textContent || '').trim().includes(textArg));
    if (!target) throw new Error(`Cannot find visible button: ${textArg}`);
    target.click();
  }, text);
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

  return result;
}

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 1100 }
  });
  const page = await browser.newPage();

  const apiLog = [];
  const stepLog = [];

  page.on('console', (msg) => {
    const line = `PAGELOG ${msg.type()} ${msg.text()}`;
    apiLog.push(line);
    console.log(line);
  });

  page.on('response', async (res) => {
    if (res.url().includes('/api/quest-chains') || res.url().includes('/api/tasks')) {
      let text = '';
      try {
        text = await res.text();
      } catch (err) {
        text = String(err.message || err);
      }
      const line = `RESP ${res.status()} ${res.url()} ${text.slice(0, 200)}`;
      apiLog.push(line);
      console.log(line);
    }
  });

  const stamp = Date.now();
  const questTitle = `V2測試劇情-${stamp}`;
  const editedQuestTitle = `${questTitle}-已編輯`;
  const taskTitle = `V2測試關卡-${stamp}`;
  const editedTaskTitle = `${taskTitle}-已編輯`;

  try {
    stepLog.push('登入管理員');
    await loginAsAdmin(page);

    stepLog.push('打開 staff-dashboard-v2');
    await page.goto(`${BASE_URL}/staff-dashboard-v2.html`, { waitUntil: 'networkidle2' });

    stepLog.push('新增玩法入口');
    await clickByText(page, 'button', '新增入口');
    await wait(300);
    await setValue(page, '#questChainForm select[name="mode_type"]', 'story_campaign');
    await setValue(page, '#questChainForm input[name="title"]', questTitle);
    await setValue(page, '#questChainForm textarea[name="short_description"]', '管理員真實流程驗證用入口');
    await setValue(page, '#questChainForm textarea[name="description"]', '這是一條從 V2 內容控制台建立的測試劇情。');
    await page.evaluate(() => {
      document
        .getElementById('questChainForm')
        .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });
    await page.waitForFunction(
      (title) => [...document.querySelectorAll('.quest-card-title')].some((el) => el.textContent.includes(title)),
      {},
      questTitle
    );

    stepLog.push('編輯玩法入口');
    await page.evaluate((title) => {
      const card = [...document.querySelectorAll('.quest-card')].find((el) => el.textContent.includes(title));
      card.querySelector('.card-menu-btn').click();
    }, questTitle);
    await wait(150);
    await clickByText(page, '.card-menu button', '編輯入口');
    await wait(200);
    await setValue(page, '#questChainForm input[name="title"]', editedQuestTitle);
    await setValue(page, '#questChainForm textarea[name="short_description"]', '已編輯後的短描述');
    await page.evaluate(() => {
      document
        .getElementById('questChainForm')
        .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });
    await page.waitForFunction(
      (title) => [...document.querySelectorAll('.quest-card-title')].some((el) => el.textContent.includes(title)),
      {},
      editedQuestTitle
    );

    stepLog.push('進入玩法內容');
    await page.evaluate((title) => {
      const card = [...document.querySelectorAll('.quest-card')].find((el) => el.textContent.includes(title));
      const manageButton = [...card.querySelectorAll('button')].find((btn) =>
        (btn.textContent || '').includes('管理內容')
      );
      manageButton.click();
    }, editedQuestTitle);
    await page.waitForFunction(
      (title) => document.querySelector('#detailQuestTitle')?.textContent.includes(title),
      {},
      editedQuestTitle
    );

    stepLog.push('新增關卡');
    await clickByText(page, 'button', '新增關卡');
    await wait(350);
    await setValue(page, '#taskBlueprintSelect', 'story_keyword');
    await clickVisibleButtonByText(page, '下一步');
    await page.waitForFunction(() => document.querySelector('[data-task-step="2"]')?.classList.contains('active'));
    await setValue(page, '#taskForm input[name="name"]', taskTitle);
    await setValue(page, '#taskForm input[name="lat"]', '24.6782946');
    await setValue(page, '#taskForm input[name="lng"]', '121.7602662');
    await setValue(page, '#taskForm input[name="radius"]', '25');
    await setValue(page, '#taskForm input[name="points"]', '15');
    await clickVisibleButtonByText(page, '下一步');
    await page.waitForFunction(() => document.querySelector('[data-task-step="3"]')?.classList.contains('active'));
    await wait(150);
    await setValue(page, '#taskForm select[name="task_type"]', 'keyword');
    await setValue(page, '#taskForm select[name="validation_mode"]', 'keyword');
    await setValue(page, '#taskForm input[name="correct_answer_text"]', '沙丘');
    await clickVisibleButtonByText(page, '下一步');
    await page.waitForFunction(() => document.querySelector('[data-task-step="4"]')?.classList.contains('active'));
    await wait(150);
    await setValue(page, '#taskForm textarea[name="description"]', '請玩家輸入海洋密語作答');
    const photoInput = await page.$('#taskPhotoInput');
    await photoInput.uploadFile(COVER_PATH);
    await clickVisibleButtonByText(page, '儲存');
    await page.waitForFunction(
      (title) => [...document.querySelectorAll('.task-item-title')].some((el) => el.textContent.includes(title)),
      { timeout: 15000 },
      taskTitle
    );

    stepLog.push('編輯關卡');
    await page.evaluate((title) => {
      const item = [...document.querySelectorAll('.task-item')].find((el) => el.textContent.includes(title));
      item.querySelector('.btn-secondary-v2').click();
    }, taskTitle);
    await wait(250);
    await clickVisibleButtonByText(page, '下一步');
    await page.waitForFunction(() => document.querySelector('[data-task-step="2"]')?.classList.contains('active'));
    await setValue(page, '#taskForm input[name="name"]', editedTaskTitle);
    await clickVisibleButtonByText(page, '下一步');
    await page.waitForFunction(() => document.querySelector('[data-task-step="3"]')?.classList.contains('active'));
    await clickVisibleButtonByText(page, '下一步');
    await page.waitForFunction(() => document.querySelector('[data-task-step="4"]')?.classList.contains('active'));
    await setValue(page, '#taskForm textarea[name="description"]', '請玩家輸入海洋密語作答（已編輯）');
    await clickVisibleButtonByText(page, '儲存');
    await page.waitForFunction(
      (title) => [...document.querySelectorAll('.task-item-title')].some((el) => el.textContent.includes(title)),
      { timeout: 15000 },
      editedTaskTitle
    );

    stepLog.push('複製關卡');
    await page.evaluate((title) => {
      const item = [...document.querySelectorAll('.task-item')].find((el) => el.textContent.includes(title));
      [...item.querySelectorAll('button')]
        .find((btn) => (btn.textContent || '').includes('複製'))
        .click();
    }, editedTaskTitle);
    await page.waitForSelector('#confirmDialog', { visible: true });
    await clickByText(page, '#confirmDialog button', '確定');
    await page.waitForFunction(
      (title) =>
        [...document.querySelectorAll('.task-item-title')].filter((el) => el.textContent.includes(title)).length >= 2,
      { timeout: 15000 },
      editedTaskTitle
    );

    stepLog.push('查看結構地圖');
    await clickByText(page, 'button', '主結構地圖');
    await page.waitForSelector('#structureMapCanvas .structure-node', { visible: true });

    stepLog.push('刪除複製關卡');
    await clickByText(page, 'button', '清單檢視');
    await page.evaluate((title) => {
      const items = [...document.querySelectorAll('.task-item')].filter((el) => el.textContent.includes(title));
      const target = items[items.length - 1];
      [...target.querySelectorAll('button')]
        .find((btn) => (btn.textContent || '').includes('刪除'))
        .click();
    }, editedTaskTitle);
    await page.waitForSelector('#confirmDialog', { visible: true });
    await clickByText(page, '#confirmDialog button', '確定');
    await page.waitForFunction(
      (title) =>
        [...document.querySelectorAll('.task-item-title')].filter((el) => el.textContent.includes(title)).length === 1,
      { timeout: 15000 },
      editedTaskTitle
    );

    stepLog.push('刪除原關卡');
    await page.evaluate((title) => {
      const item = [...document.querySelectorAll('.task-item')].find((el) => el.textContent.includes(title));
      [...item.querySelectorAll('button')]
        .find((btn) => (btn.textContent || '').includes('刪除'))
        .click();
    }, editedTaskTitle);
    await page.waitForSelector('#confirmDialog', { visible: true });
    await clickByText(page, '#confirmDialog button', '確定');
    await page.waitForFunction(
      (title) => ![...document.querySelectorAll('.task-item-title')].some((el) => el.textContent.includes(title)),
      { timeout: 15000 },
      editedTaskTitle
    );

    stepLog.push('刪除玩法入口');
    await clickByText(page, '.breadcrumb', '返回玩法入口列表');
    await page.waitForFunction(
      () => document.querySelector('.v2-view.active h2')?.textContent.includes('玩法入口管理'),
      { timeout: 10000 }
    );
    await page.evaluate((title) => {
      const card = [...document.querySelectorAll('.quest-card')].find((el) => el.textContent.includes(title));
      card.querySelector('.card-menu-btn').click();
    }, editedQuestTitle);
    await wait(150);
    await clickByText(page, '.card-menu button', '刪除入口');
    await page.waitForSelector('#confirmDialog', { visible: true });
    await clickByText(page, '#confirmDialog button', '確定');
    await page.waitForFunction(
      (title) => ![...document.querySelectorAll('.quest-card-title')].some((el) => el.textContent.includes(title)),
      { timeout: 15000 },
      editedQuestTitle
    );

    console.log('VERIFY_SUCCESS');
  } catch (error) {
    console.error('VERIFY_FAIL', error.message);
    console.log('STEP_LOG', JSON.stringify(stepLog, null, 2));
    const questCards = await page.$$eval('.quest-card-title', (els) => els.map((el) => el.textContent.trim()).slice(0, 8)).catch(() => []);
    const taskCards = await page.$$eval('.task-item-title', (els) => els.map((el) => el.textContent.trim()).slice(0, 8)).catch(() => []);
    const inspector = await page.$eval('#structureInspectorBody', (el) => el.textContent.slice(0, 300)).catch(() => '');
    console.log('QUEST_CARDS', JSON.stringify(questCards));
    console.log('TASK_CARDS', JSON.stringify(taskCards));
    console.log('INSPECTOR', inspector);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
