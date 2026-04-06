const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || '150.109.72.98',
  port: Number(process.env.MYSQL_PORT || 31591),
  user: process.env.MYSQL_USERNAME || 'root',
  password: process.env.MYSQL_PASSWORD || '4q7aRwS2d5G0czEL6bAPCmT8I9Zvp3H1',
  database: process.env.MYSQL_DATABASE || 'zeabur'
};

const STORY_TITLE = '沙丘教學模式｜手機流程導覽';
const BOARD_TITLE = '沙丘教學模式｜大富翁流程導覽';
const BASE_LAT = 24.6782946;
const BASE_LNG = 121.7602662;

async function findQuestChain(conn, title) {
  const [rows] = await conn.execute(
    'SELECT * FROM quest_chains WHERE title = ? OR name = ? ORDER BY id DESC LIMIT 1',
    [title, title]
  );
  return rows[0] || null;
}

async function ensureBoardTutorialChain(conn) {
  const existing = await findQuestChain(conn, BOARD_TITLE);
  const payload = [
    BOARD_TITLE,
    BOARD_TITLE,
    '這是一條給手機教學與工作室展示使用的大富翁教學線。玩家可在沒有工作人員與沒有現地條件下，一格一格把棋盤流程完整走完。',
    '大富翁教學線｜一格一格往前走，逐步體驗事件格、挑戰格與 AI 裁判。',
    '進入教學棋盤',
    '大富翁教學',
    'tutorial_board',
    '/images/banner.png',
    JSON.stringify({
      demo_autopass: true,
      tutorial_mode: true,
      rpg_dialog: true,
      mobile_single_hand: true,
      board_tutorial: true
    }),
    JSON.stringify({
      demo_autopass: true,
      tutorial_mode: true,
      board_tutorial: true
    })
  ];

  if (existing) {
    await conn.execute(
      `UPDATE quest_chains
       SET name = ?, title = ?, description = ?, short_description = ?, mode_type = 'board_game',
           is_active = TRUE, entry_order = 1, entry_button_text = ?, entry_scene_label = ?,
           play_style = ?, cover_image = ?, game_rules = ?, content_blueprint = ?
       WHERE id = ?`,
      [...payload, existing.id]
    );
    return existing.id;
  }

  const [result] = await conn.execute(
    `INSERT INTO quest_chains
      (name, title, description, short_description, mode_type, is_active, entry_order, entry_button_text,
       entry_scene_label, play_style, cover_image, created_by, game_rules, content_blueprint)
     VALUES (?, ?, ?, ?, 'board_game', TRUE, 1, ?, ?, ?, ?, 'codex', ?, ?)`,
    payload
  );
  return result.insertId;
}

async function clearBoardTutorialContent(conn, questChainId) {
  const [maps] = await conn.execute('SELECT id FROM board_maps WHERE quest_chain_id = ?', [questChainId]);
  const mapIds = maps.map((row) => row.id);

  if (mapIds.length) {
    await conn.execute('DELETE FROM user_game_sessions WHERE quest_chain_id = ?', [questChainId]);
    await conn.execute('DELETE FROM board_maps WHERE quest_chain_id = ?', [questChainId]);
  }

  const [tasks] = await conn.execute('SELECT id FROM tasks WHERE quest_chain_id = ?', [questChainId]);
  const taskIds = tasks.map((row) => row.id);
  if (taskIds.length) {
    const placeholders = taskIds.map(() => '?').join(',');
    await conn.execute(`DELETE FROM task_attempts WHERE task_id IN (${placeholders})`, taskIds);
    await conn.execute(`DELETE FROM user_tasks WHERE task_id IN (${placeholders})`, taskIds);
    await conn.execute('DELETE FROM tasks WHERE quest_chain_id = ?', [questChainId]);
  }
}

async function insertBoardTutorialTasks(conn, questChainId) {
  const taskDefs = [
    {
      name: '第 2 格｜拍下起航視角',
      quest_order: 1,
      task_type: 'photo',
      submission_type: 'image',
      validation_mode: 'ai_score',
      ai_config: {
        score_subject: 'tutorial_board_photo',
        system_prompt: '你是沙丘大富翁教學線的裁判。',
        user_prompt: '請查看玩家上傳的教學照片。'
      },
      pass_criteria: { min_score: 1 },
      stage_intro: '潮汐關主・巴布要你留下第一張大富翁紀錄，隨手拍下眼前畫面就能前進。',
      description: '任意拍下一張你眼前的畫面，讓鯨語裁判替這一步蓋章。',
      hint_text: '教學模式：任意拍一張就能前進。',
      guide_content: '這一格用來體驗棋盤上的第一個拍照挑戰。',
      story_context: '棋盤正式開始轉動，你的第一步需要留下視角紀錄。'
    },
    {
      name: '第 4 格｜選擇你想走的路',
      quest_order: 2,
      task_type: 'multiple_choice',
      submission_type: 'choice',
      validation_mode: 'manual',
      options: ['找一個特定物件', '拍一張團體照', '直接往前衝'],
      correct_answer: '找一個特定物件',
      stage_intro: '潮聲想知道你比較偏好哪一種玩法路線，先做一個選擇。',
      description: '任選一個你現在想玩的模式，沙丘會記住你的選擇並帶你繼續前進。',
      hint_text: '教學模式：任意選一個都會通關。',
      guide_content: '這一格是選擇題玩法示範。',
      story_context: '冒險風格可以不同，但旅程會繼續。'
    },
    {
      name: '第 6 格｜輸入你想找的東西',
      quest_order: 3,
      task_type: 'keyword',
      submission_type: 'text',
      validation_mode: 'manual',
      correct_answer: '貝殼',
      stage_intro: '巴布想知道，如果現在要你去找一樣東西，你第一個想到的是什麼。',
      description: '任意輸入一個你想找的物件名稱，例如貝殼、漂流瓶、旗子都可以。',
      hint_text: '教學模式：只要有輸入內容就會先通關。',
      guide_content: '這一格示範文字輸入型玩法。',
      story_context: '玩家的選擇會決定接下來的探索想像。'
    },
    {
      name: '第 8 格｜中繼觀測點',
      quest_order: 4,
      task_type: 'photo',
      submission_type: 'image',
      validation_mode: 'ai_score',
      ai_config: {
        score_subject: 'tutorial_board_photo',
        system_prompt: '你是沙丘大富翁教學線的裁判。',
        user_prompt: '請查看玩家上傳的教學照片。'
      },
      pass_criteria: { min_score: 1 },
      stage_intro: '鯨語要你在中繼站留下觀測影像，確認旅程仍穩定推進。',
      description: '任意拍一張畫面，讓鯨語完成中繼觀測。',
      hint_text: '教學模式：任意畫面都會先放行。',
      guide_content: '這一格讓玩家習慣重複挑戰卻不感到挫折。',
      story_context: '航線中段需要一次觀測校準。'
    },
    {
      name: '第 10 格｜輸入通關密碼',
      quest_order: 5,
      task_type: 'number',
      submission_type: 'text',
      validation_mode: 'manual',
      correct_answer: '12',
      stage_intro: '潮聲把一個小鎖箱放到你面前，請輸入任意數字體驗解鎖流程。',
      description: '任意轉出一組數字，沙丘會把它當成這次教學解鎖結果。',
      hint_text: '教學模式：任意密碼都會先放行。',
      guide_content: '這一格示範數字鎖與解鎖型玩法。',
      story_context: '終點前要先解開一個象徵性的鎖。'
    },
    {
      name: '第 12 格｜終點前的留影',
      quest_order: 6,
      task_type: 'photo',
      submission_type: 'image',
      validation_mode: 'ai_score',
      ai_config: {
        score_subject: 'tutorial_board_photo',
        system_prompt: '你是沙丘大富翁教學線的裁判。',
        user_prompt: '請查看玩家上傳的教學照片。'
      },
      pass_criteria: { min_score: 1 },
      stage_intro: '最後衝刺前，再拍下一張畫面，讓主持人為這輪棋盤旅程蓋章。',
      description: '任意拍下一張畫面，完成終點前的最後留影。',
      hint_text: '這一格完成後就會接近終點。',
      guide_content: '這是進終點前最後一次 AI 拍照裁判演出。',
      story_context: '終點燈塔就在前方。'
    }
  ];

  const taskIds = [];
  for (const task of taskDefs) {
    const [result] = await conn.execute(
      `INSERT INTO tasks
        (name, description, photoUrl, cover_image_url, points, task_type, options, correct_answer,
         quest_chain_id, quest_order, created_by, is_final_step, submission_type, validation_mode,
         ai_config, pass_criteria, failure_message, success_message, max_attempts, location_required,
         stage_template, stage_intro, hint_text, story_context, guide_content, rescue_content, is_active,
         lat, lng, radius)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'codex', 0, ?, ?,
               ?, ?, ?, ?, 9, 0, 'board_challenge', ?, ?, ?, ?, ?, TRUE, ?, ?, ?)`,
      [
        task.name,
        task.description,
        '/images/banner.png',
        '/images/banner.png',
        15,
        task.task_type,
        task.options ? JSON.stringify(task.options) : null,
        task.correct_answer || null,
        questChainId,
        task.quest_order,
        task.submission_type,
        task.validation_mode,
        task.ai_config ? JSON.stringify(task.ai_config) : null,
        task.pass_criteria ? JSON.stringify(task.pass_criteria) : null,
        '教學模式會先放行，讓你繼續往下一格。',
        '教學棋盤通關，繼續前進。',
        task.stage_intro,
        task.hint_text,
        task.story_context,
        task.guide_content,
        '就算現場沒有正式素材，教學模式也會先讓你前進。',
        BASE_LAT,
        BASE_LNG,
        30
      ]
    );
    taskIds.push(result.insertId);
  }

  return taskIds;
}

async function insertBoardTutorialMap(conn, questChainId, taskIds) {
  const [mapResult] = await conn.execute(
    `INSERT INTO board_maps
     (quest_chain_id, name, description, play_style, cover_image, center_lat, center_lng, max_rounds,
       start_tile, finish_tile, dice_min, dice_max, failure_move, exact_finish_required, reward_points,
       is_active, rules_json, created_by)
     VALUES (?, ?, ?, 'tutorial_board', '/images/banner.png', ?, ?, 18, 1, 14, 1, 3, 0, FALSE, 120, TRUE, ?, 'codex')`,
    [
      questChainId,
      '沙丘教學棋盤｜一步一步走完大富翁',
      '這是一張專門拿來做手機教學的大富翁棋盤。骰子會在 1 到 3 點之間隨機滾動，讓你能一次測到多種挑戰格、事件格與終點節奏。',
      BASE_LAT,
      BASE_LNG,
      JSON.stringify({
        tutorial_mode: true,
        board_tutorial: true,
        one_step_dice: false,
        tutorial_roll_sequence: [1, 2, 1, 1, 2, 1, 1, 2],
        role_pack: ['host', 'judge', 'guide', 'rescue']
      })
    ]
  );
  const boardMapId = mapResult.insertId;

  const tiles = [
    { tile_index: 1, tile_name: '起點營地', tile_type: 'story', event_title: '教學開始', event_body: '主持人・史蛋宣布大富翁教學正式開始。', guide_content: '這張棋盤會一步一步帶你走完整段流程。' },
    { tile_index: 2, tile_name: '起航拍照格', tile_type: 'challenge', task_id: taskIds[0], event_title: '第一張紀錄', guide_content: '拍一張照片，感受 AI 裁判怎麼讓你前進。'},
    {
      tile_index: 3,
      tile_name: '海風機會卡',
      tile_type: 'event',
      event_title: '機會卡｜海風推了一把',
      event_body: '史蛋把一張機會卡塞進你手裡，吃角子老虎機會決定這一格的額外獎勵。',
      guide_content: '這一格會用吃角子老虎機抽出機會卡效果。',
      tile_meta: {
        template: 'event',
        card_type: 'chance',
        randomizer: 'slot',
        draw_pool: [
          { label: '獲得 6 點旅程積分', effect_type: 'gain_points', effect_value: 6, icon: '🌊', flavor: '海風吹來一小段順風積分。' },
          { label: '獲得 10 點旅程積分', effect_type: 'gain_points', effect_value: 10, icon: '🎁', flavor: '你撿到一個漂流補給箱。' },
          { label: '再前進 1 格', effect_type: 'move_forward', effect_value: 1, icon: '🧭', flavor: '順風把你直接往前推了一格。' }
        ]
      }
    },
    { tile_index: 4, tile_name: '路線抉擇格', tile_type: 'challenge', task_id: taskIds[1], event_title: '選擇你想走的路', guide_content: '這一格是選擇題教學，你隨便選一個答案也能前進。'},
    {
      tile_index: 5,
      tile_name: '命運轉盤格',
      tile_type: 'event',
      event_title: '命運卡｜潮汐轉盤',
      event_body: '潮聲打開了一面轉盤，命運會決定你這一步的額外變化。',
      guide_content: '這一格會用轉盤抽出命運卡效果。',
      tile_meta: {
        template: 'event',
        card_type: 'fate',
        randomizer: 'wheel',
        draw_pool: [
          { label: '穩穩拿下 5 點', effect_type: 'gain_points', effect_value: 5, icon: '✨', flavor: '今天的海況平穩，穩穩加點。' },
          { label: '順勢再前進 1 格', effect_type: 'move_forward', effect_value: 1, icon: '🧭', flavor: '命運把你往前再推一步。' },
          { label: '保持節奏不加不減', effect_type: 'narrative', effect_value: 0, icon: '🐚', flavor: '這一步只是提醒你，節奏也很重要。' },
          { label: '獲得 8 點旅程積分', effect_type: 'gain_points', effect_value: 8, icon: '🌊', flavor: '潮汐替你把旅程積分補滿一點。' }
        ]
      }
    },
    { tile_index: 6, tile_name: '尋物口令格', tile_type: 'challenge', task_id: taskIds[2], event_title: '輸入你想找的東西', guide_content: '這一格是文字輸入教學，只要有輸入就會通關。'},
    { tile_index: 7, tile_name: '潮汐劇情格', tile_type: 'story', event_title: '潮聲導航', event_body: '導覽員・潮聲提醒你：教學棋盤的重點不是輸贏，而是理解每一步怎麼被推進。', guide_content: '劇情格主要負責敘事與節奏。'},
    { tile_index: 8, tile_name: '中繼觀測格', tile_type: 'challenge', task_id: taskIds[3], event_title: '中繼觀測', guide_content: '拍照後，棋盤會繼續往終點前進。'},
    {
      tile_index: 9,
      tile_name: '亂流機會卡',
      tile_type: 'event',
      event_title: '機會卡｜亂流擦肩而過',
      event_body: '史蛋又拿出一張機會卡，看看這次亂流會帶來什麼獎勵。',
      guide_content: '第二次機會卡，讓你多看一次吃角子老虎機動畫。',
      tile_meta: {
        template: 'event',
        card_type: 'chance',
        randomizer: 'slot',
        draw_pool: [
          { label: '獲得 4 點旅程積分', effect_type: 'gain_points', effect_value: 4, icon: '🌊', flavor: '輕微亂流沒有阻礙你，反而送來小加分。' },
          { label: '獲得 12 點旅程積分', effect_type: 'gain_points', effect_value: 12, icon: '🎁', flavor: '你在亂流後方撿到一整袋補給。' },
          { label: '再前進 1 格', effect_type: 'move_forward', effect_value: 1, icon: '🧭', flavor: '亂流把你甩到更前面去了。' }
        ]
      }
    },
    { tile_index: 10, tile_name: '密碼解鎖格', tile_type: 'challenge', task_id: taskIds[4], event_title: '輸入通關密碼', guide_content: '這一格是數字解鎖教學，任意輸入都會先通關。'},
    {
      tile_index: 11,
      tile_name: '命運轉盤格｜救援版',
      tile_type: 'event',
      event_title: '命運卡｜海羽支援',
      event_body: '海羽讓你再轉一次命運轉盤，看看這次會拿到什麼保護。',
      guide_content: '第二次命運卡，讓你多看一次轉盤抽獎。',
      tile_meta: {
        template: 'event',
        card_type: 'fate',
        randomizer: 'wheel',
        draw_pool: [
          { label: '獲得 6 點旅程積分', effect_type: 'gain_points', effect_value: 6, icon: '🌟', flavor: '海羽替你加了一點安心分數。' },
          { label: '再前進 1 格', effect_type: 'move_forward', effect_value: 1, icon: '🧭', flavor: '海羽幫你把路線往前挪了一格。' },
          { label: '這一步保持穩定', effect_type: 'narrative', effect_value: 0, icon: '🐋', flavor: '這一次沒有額外效果，但救援節奏很完整。' },
          { label: '獲得 9 點旅程積分', effect_type: 'gain_points', effect_value: 9, icon: '🎁', flavor: '海羽塞給你一包額外補給。' }
        ]
      }
    },
    { tile_index: 12, tile_name: '終點前留影格', tile_type: 'challenge', task_id: taskIds[5], event_title: '終點前留影', guide_content: '最後再感受一次 AI 裁判結算。'},
    { tile_index: 13, tile_name: '終點前劇情格', tile_type: 'story', event_title: '終點已現身', event_body: '潮聲說：前面就是燈塔，讀完這段話後就準備收尾。', guide_content: '這一格讓終點前有一個明確的情緒轉場。'},
    { tile_index: 14, tile_name: '終點燈塔', tile_type: 'finish', event_title: '教學棋盤完成', event_body: '主持人・史蛋宣布：你已經把整條教學棋盤走完，可以放心開始測真正的遊戲內容了。', guide_content: '終點用來收束整段教學體驗。'}
  ];

  for (const tile of tiles) {
    await conn.execute(
      `INSERT INTO board_tiles
        (board_map_id, tile_index, tile_name, tile_type, latitude, longitude, radius_meters, task_id,
         effect_type, effect_value, event_title, event_body, guide_content, tile_meta, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        boardMapId,
        tile.tile_index,
        tile.tile_name,
        tile.tile_type,
        BASE_LAT,
        BASE_LNG,
        30,
        tile.task_id || null,
        tile.effect_type || null,
        tile.effect_value || null,
        tile.event_title || null,
        tile.event_body || null,
        tile.guide_content || null,
        JSON.stringify(tile.tile_meta || {
          template: tile.tile_type,
          role_pack: tile.task_id ? ['gatekeeper', 'judge', 'rescue'] : ['host', 'guide']
        })
      ]
    );
  }

  return boardMapId;
}

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    await conn.beginTransaction();

    const storyChain = await findQuestChain(conn, STORY_TITLE);
    if (!storyChain) {
      throw new Error(`找不到既有劇情教學線：${STORY_TITLE}`);
    }

    await conn.execute(
      `UPDATE quest_chains
       SET is_active = TRUE, entry_order = 0, entry_button_text = '立即體驗', entry_scene_label = '教學模式'
       WHERE id = ?`,
      [storyChain.id]
    );

    const boardTutorialId = await ensureBoardTutorialChain(conn);
    await clearBoardTutorialContent(conn, boardTutorialId);
    const boardTaskIds = await insertBoardTutorialTasks(conn, boardTutorialId);
    const boardMapId = await insertBoardTutorialMap(conn, boardTutorialId, boardTaskIds);

    await conn.execute(
      `UPDATE quest_chains
       SET is_active = CASE WHEN id IN (?, ?) THEN TRUE ELSE FALSE END,
           entry_order = CASE
             WHEN id = ? THEN 0
             WHEN id = ? THEN 1
             ELSE entry_order
           END`,
      [storyChain.id, boardTutorialId, storyChain.id, boardTutorialId]
    );

    await conn.commit();
    console.log(JSON.stringify({
      success: true,
      storyTutorialQuestChainId: storyChain.id,
      boardTutorialQuestChainId: boardTutorialId,
      boardTutorialMapId: boardMapId,
      boardTutorialTiles: 14,
      activeEntries: 2
    }, null, 2));
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
