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
      stage_intro: '潮汐關主・巴布要你留下第一張大富翁紀錄，隨手拍下眼前畫面就能前進。',
      description: '任意拍下一張你眼前的畫面，讓鯨語裁判替這一步蓋章。',
      hint_text: '教學模式：任意拍一張就能前進。',
      guide_content: '這一格用來體驗棋盤上的第一個拍照挑戰。',
      story_context: '棋盤正式開始轉動，你的第一步需要留下視角紀錄。'
    },
    {
      name: '第 4 格｜留下潮線記號',
      quest_order: 2,
      stage_intro: '潮聲提醒你，每往前一段都可以留下新的冒險記號。',
      description: '再任意拍一張畫面，讓沙丘記錄你繼續前進的證明。',
      hint_text: '教學模式：任意拍一張即可。',
      guide_content: '這一格讓玩家重複體驗拍照與自動推進。',
      story_context: '每個格子都是一次新的記錄。'
    },
    {
      name: '第 6 格｜補給站合照',
      quest_order: 3,
      stage_intro: '巴布在補給站等你，拍下一張畫面當作補給成功的證明。',
      description: '任意拍一張照片，沙丘會當成補給成功的合照記錄。',
      hint_text: '這一格重點是看見 NPC 結算後怎麼推進棋盤。',
      guide_content: '這一格讓玩家熟悉挑戰格與事件格混搭的節奏。',
      story_context: '補給成功後，隊伍準備繼續向前。'
    },
    {
      name: '第 8 格｜中繼觀測點',
      quest_order: 4,
      stage_intro: '鯨語要你在中繼站留下觀測影像，確認旅程仍穩定推進。',
      description: '任意拍一張畫面，讓鯨語完成中繼觀測。',
      hint_text: '教學模式：任意畫面都會先放行。',
      guide_content: '這一格讓玩家習慣重複挑戰卻不感到挫折。',
      story_context: '航線中段需要一次觀測校準。'
    },
    {
      name: '第 10 格｜風向確認照',
      quest_order: 5,
      stage_intro: '導覽員・潮聲請你拍下前方畫面，確認隊伍仍朝正確風向前進。',
      description: '任意拍一張照片，沙丘會將它視為風向確認照。',
      hint_text: '每完成一格，HUD 都會同步推進。',
      guide_content: '這一格強化玩家對 HUD 與棋盤推進的感受。',
      story_context: '風向穩定，終點已經不遠。'
    },
    {
      name: '第 12 格｜終點前的留影',
      quest_order: 6,
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
       VALUES (?, ?, ?, ?, ?, 'photo', NULL, NULL, ?, ?, 'codex', 0, 'image', 'ai_score',
               ?, ?, ?, ?, 9, 0, 'board_challenge', ?, ?, ?, ?, ?, TRUE, ?, ?, ?)`,
      [
        task.name,
        task.description,
        '/images/banner.png',
        '/images/banner.png',
        15,
        questChainId,
        task.quest_order,
        JSON.stringify({
          score_subject: 'tutorial_board_photo',
          system_prompt: '你是沙丘大富翁教學線的裁判。',
          user_prompt: '請查看玩家上傳的教學照片。'
        }),
        JSON.stringify({ min_score: 1 }),
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
     VALUES (?, ?, ?, 'tutorial_board', '/images/banner.png', ?, ?, 18, 1, 14, 1, 1, 0, FALSE, 120, TRUE, ?, 'codex')`,
    [
      questChainId,
      '沙丘教學棋盤｜一步一步走完大富翁',
      '這是一張專門拿來做手機教學的大富翁棋盤。骰子每次只前進一格，讓你可以逐格體驗事件格、挑戰格與終點收尾。',
      BASE_LAT,
      BASE_LNG,
      JSON.stringify({
        tutorial_mode: true,
        board_tutorial: true,
        one_step_dice: true,
        role_pack: ['host', 'judge', 'guide', 'rescue']
      })
    ]
  );
  const boardMapId = mapResult.insertId;

  const tiles = [
    { tile_index: 1, tile_name: '起點營地', tile_type: 'story', event_title: '教學開始', event_body: '主持人・史蛋宣布大富翁教學正式開始。', guide_content: '這張棋盤會一步一步帶你走完整段流程。' },
    { tile_index: 2, tile_name: '起航拍照格', tile_type: 'challenge', task_id: taskIds[0], event_title: '第一張紀錄', guide_content: '拍一張照片，感受 AI 裁判怎麼讓你前進。'},
    { tile_index: 3, tile_name: '海風事件格', tile_type: 'event', event_title: '海風推了一把', event_body: '史蛋宣布：海風正好把隊伍往前送，這一格只要讀完事件就能繼續。', guide_content: '事件格不需要拍照，也會自動結算。'},
    { tile_index: 4, tile_name: '潮線挑戰格', tile_type: 'challenge', task_id: taskIds[1], event_title: '留下潮線記號', guide_content: '再拍一張，確認你已經熟悉第二種節奏。'},
    { tile_index: 5, tile_name: '補給獎勵格', tile_type: 'reward', effect_type: 'gain_points', effect_value: 10, event_title: '補給成功', event_body: '海羽送來補給箱，這一格讓你獲得額外積分。', guide_content: '獎勵格會給正向回饋，但不需要額外操作。'},
    { tile_index: 6, tile_name: '補給站合照格', tile_type: 'challenge', task_id: taskIds[2], event_title: '補給站合照', guide_content: '拍一張畫面，感受挑戰格與獎勵格交錯出現。'},
    { tile_index: 7, tile_name: '潮汐劇情格', tile_type: 'story', event_title: '潮聲導航', event_body: '導覽員・潮聲提醒你：教學棋盤的重點不是輸贏，而是理解每一步怎麼被推進。', guide_content: '劇情格主要負責敘事與節奏。'},
    { tile_index: 8, tile_name: '中繼觀測格', tile_type: 'challenge', task_id: taskIds[3], event_title: '中繼觀測', guide_content: '拍照後，棋盤會繼續往終點前進。'},
    { tile_index: 9, tile_name: '輕微亂流格', tile_type: 'event', event_title: '亂流擦肩而過', event_body: '史蛋宣布：這股亂流只是在嚇你，今天不會把你吹回去。', guide_content: '教學棋盤保留事件感，但不會真的懲罰玩家。'},
    { tile_index: 10, tile_name: '風向確認格', tile_type: 'challenge', task_id: taskIds[4], event_title: '風向確認', guide_content: '再拍一張，確認你已經掌握整個教學流程。'},
    { tile_index: 11, tile_name: '救援補給格', tile_type: 'support', effect_type: 'grant_hint', effect_value: 1, event_title: '海羽支援', event_body: '海羽提醒你：即使卡關，沙丘也會用 NPC 與提示把你帶到終點。', guide_content: '這一格是救援系統的示意演出。'},
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
        JSON.stringify({
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
