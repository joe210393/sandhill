const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4325';
const USER_COUNT = Number(process.env.USER_COUNT || 5);
const SAMPLE_IMAGE_PATH = process.env.SAMPLE_IMAGE_PATH || path.resolve(__dirname, '../public/images/mascot.png');
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.resolve(__dirname, '../docs/沙丘-demo-playtest-report.json');

function randomPhone(index) {
  return `0903${String(100000 + index).slice(-6)}`;
}

function mergeCookie(existing, response) {
  const raw = response.headers.get('set-cookie');
  if (!raw) return existing || '';
  const next = raw.split(',').map((chunk) => chunk.split(';')[0].trim()).filter(Boolean);
  const cookieMap = new Map();
  (existing || '').split(';').map((s) => s.trim()).filter(Boolean).forEach((pair) => {
    const [key, ...rest] = pair.split('=');
    cookieMap.set(key, `${key}=${rest.join('=')}`);
  });
  next.forEach((pair) => {
    const [key] = pair.split('=');
    cookieMap.set(key, pair);
  });
  return [...cookieMap.values()].join('; ');
}

async function jsonRequest(url, { method = 'GET', headers = {}, body, cookie } = {}) {
  const finalHeaders = { ...headers };
  if (cookie) finalHeaders.cookie = cookie;
  const response = await fetch(url, { method, headers: finalHeaders, body });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`Non-JSON response ${response.status} from ${url}: ${text.slice(0, 180)}`);
  }
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed ${response.status} for ${url}`);
  }
  return { data, cookie: mergeCookie(cookie, response) };
}

async function ensureUser(phone) {
  const registerPayload = JSON.stringify({ username: phone, role: 'user' });
  try {
    return await jsonRequest(`${BASE_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: registerPayload
    });
  } catch (err) {
    if (!String(err.message).includes('帳號已存在')) throw err;
    return jsonRequest(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: phone, role: 'user' })
    });
  }
}

async function submitTutorialPhoto(taskId, cookie) {
  const form = new FormData();
  const buffer = fs.readFileSync(SAMPLE_IMAGE_PATH);
  form.append('image', new Blob([buffer], { type: 'image/png' }), 'demo.png');
  return jsonRequest(`${BASE_URL}/api/tutorial/ai-tasks/${taskId}/submit`, {
    method: 'POST',
    body: form,
    cookie
  });
}

async function submitTutorialAnswer(taskId, answer, cookie) {
  return jsonRequest(`${BASE_URL}/api/tutorial/tasks/${taskId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
    cookie
  });
}

async function playStory(entry, cookie, log) {
  const { data: storyData } = await jsonRequest(`${BASE_URL}/api/quest-chains/${entry.id}/public-content`, { cookie });
  for (const task of storyData.tasks) {
    if (String(task.validation_mode || '').startsWith('ai_') || task.task_type === 'photo') {
      const { data, cookie: nextCookie } = await submitTutorialPhoto(task.id, cookie);
      cookie = nextCookie;
      log.push({
        kind: 'story-task',
        entry: entry.title,
        task: task.name,
        mode: task.validation_mode,
        passed: data.passed,
        reason: data.reason || data.message || ''
      });
    } else {
      const fakeAnswer = task.task_type === 'number' ? '7' : task.task_type === 'multiple_choice' ? 'A' : 'demo_answer';
      const { data, cookie: nextCookie } = await submitTutorialAnswer(task.id, fakeAnswer, cookie);
      cookie = nextCookie;
      log.push({
        kind: 'story-task',
        entry: entry.title,
        task: task.name,
        mode: task.task_type,
        passed: data.success,
        reason: data.message || '已完成'
      });
    }
  }
  return cookie;
}

async function playBoard(entry, cookie, log) {
  let { data: startData, cookie: nextCookie } = await jsonRequest(`${BASE_URL}/api/board/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questChainId: entry.id }),
    cookie
  });
  cookie = nextCookie;
  let session = startData.session;
  let turns = 0;

  while (session.status !== 'completed' && turns < 40) {
    turns += 1;
    const rolled = await jsonRequest(`${BASE_URL}/api/board/session/${session.id}/roll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      cookie
    });
    cookie = rolled.cookie;
    const targetTile = rolled.data.targetTile;

    if (targetTile.task_id) {
      if (String(targetTile.validation_mode || '').startsWith('ai_') || targetTile.linked_task_type === 'photo') {
        const photoResult = await submitTutorialPhoto(targetTile.task_id, cookie);
        cookie = photoResult.cookie;
        log.push({
          kind: 'board-challenge',
          entry: entry.title,
          tile: targetTile.tile_name,
          task: targetTile.task_name,
          mode: targetTile.validation_mode,
          lmReason: photoResult.data.reason || photoResult.data.message || ''
        });
      } else {
        const answerResult = await submitTutorialAnswer(targetTile.task_id, 'demo_answer', cookie);
        cookie = answerResult.cookie;
        log.push({
          kind: 'board-challenge',
          entry: entry.title,
          tile: targetTile.tile_name,
          task: targetTile.task_name,
          mode: targetTile.linked_task_type || 'manual',
          lmReason: answerResult.data.message || '已完成'
        });
      }
    } else {
      log.push({
        kind: 'board-tile',
        entry: entry.title,
        tile: targetTile.tile_name,
        mode: targetTile.tile_type,
        lmReason: targetTile.event_title || targetTile.tile_name
      });
    }

    const resolved = await jsonRequest(`${BASE_URL}/api/board/session/${session.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
      cookie
    });
    cookie = resolved.cookie;
    session = resolved.data.session;
  }

  if (session.status !== 'completed') {
    throw new Error(`Board ${entry.title} did not complete within ${turns} turns`);
  }

  return cookie;
}

async function main() {
  const entryResult = await jsonRequest(`${BASE_URL}/api/game-entries`);
  const allEntries = [...(entryResult.data.storyCampaigns || []), ...(entryResult.data.boardGames || [])];
  const report = {
    baseUrl: BASE_URL,
    userCount: USER_COUNT,
    startedAt: new Date().toISOString(),
    entries: allEntries.map((entry) => ({ id: entry.id, title: entry.title, mode_type: entry.mode_type, play_style: entry.play_style })),
    users: []
  };

  for (let i = 1; i <= USER_COUNT; i += 1) {
    const phone = randomPhone(i);
    console.log(`\n=== 玩家 ${phone} 開始 ===`);
    const login = await ensureUser(phone);
    let cookie = login.cookie;
    const userRun = {
      username: phone,
      playedAt: new Date().toISOString(),
      steps: []
    };

    for (const entry of allEntries) {
      console.log(`玩家 ${phone} 正在遊玩：${entry.title}`);
      if (entry.mode_type === 'story_campaign') {
        cookie = await playStory(entry, cookie, userRun.steps);
      } else if (entry.mode_type === 'board_game') {
        cookie = await playBoard(entry, cookie, userRun.steps);
      }
    }

    report.users.push(userRun);
    console.log(`完成玩家 ${phone}，共記錄 ${userRun.steps.length} 步`);
  }

  report.completedAt = new Date().toISOString();
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
  console.log(`已輸出模擬報告：${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
