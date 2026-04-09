const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || '150.109.72.98',
  port: Number(process.env.MYSQL_PORT || 31591),
  user: process.env.MYSQL_USERNAME || 'root',
  password: process.env.MYSQL_PASSWORD || '4q7aRwS2d5G0czEL6bAPCmT8I9Zvp3H1',
  database: process.env.MYSQL_DATABASE || 'zeabur'
};

const BASE_LAT = 24.6782946;
const BASE_LNG = 121.7602662;
const CREATED_BY = 'admin';

const IMAGE_POOL = [
  '/images/banner.png',
  '/images/mascot.png',
  '/images/feature-map.png',
  '/images/feature-culture.png',
  '/images/feature-community.png',
  '/images/feature-reward.png'
];

const AUDIO_POOL = [
  '/audio/tide-loop.mp3',
  '/audio/lighthouse-bell.mp3',
  '/audio/wind-route.mp3',
  '/audio/fortune-wheel.mp3'
];

function imageAt(index) {
  return IMAGE_POOL[index % IMAGE_POOL.length];
}

function audioAt(index) {
  return AUDIO_POOL[index % AUDIO_POOL.length];
}

function aiIdentifyConfig(target, prompt) {
  return {
    system_prompt: '你是沙丘教學模式的 AI 裁判。請描述玩家照片中最主要的物件，並盡量用繁體中文回答。',
    user_prompt: prompt,
    target_label: target
  };
}

async function ensureItem(conn, { name, description, image_url, type, effect_value }) {
  const [rows] = await conn.execute('SELECT id FROM items WHERE name = ? LIMIT 1', [name]);
  if (rows.length) {
    await conn.execute(
      'UPDATE items SET description = ?, image_url = ?, type = ?, effect_value = ? WHERE id = ?',
      [description, image_url, type || 'normal', effect_value || 0, rows[0].id]
    );
    return rows[0].id;
  }
  const [result] = await conn.execute(
    'INSERT INTO items (name, description, image_url, type, effect_value) VALUES (?, ?, ?, ?, ?)',
    [name, description, image_url, type || 'normal', effect_value || 0]
  );
  return result.insertId;
}

async function cleanupExistingContent(conn) {
  const [questRows] = await conn.execute('SELECT id FROM quest_chains ORDER BY id ASC');
  console.log(`準備清除 ${questRows.length} 條玩法入口`);

  await conn.beginTransaction();
  try {
    const [taskRows] = await conn.execute('SELECT id FROM tasks');
    const taskIds = taskRows.map((row) => row.id);

    await conn.execute('DELETE FROM user_game_sessions');
    await conn.execute('DELETE FROM user_tasks');
    await conn.execute('DELETE FROM user_quests');
    await conn.execute('DELETE FROM task_attempts');

    if (taskIds.length) {
      const placeholders = taskIds.map(() => '?').join(',');
      await conn.execute(
        `UPDATE point_transactions
         SET reference_id = NULL,
             description = CONCAT(description, ' (tutorial reset)')
         WHERE reference_type IN ('task_completion', 'quest_chain_completion')
           AND reference_id IN (${placeholders})`,
        taskIds
      );
      await conn.execute(`UPDATE board_tiles SET task_id = NULL WHERE task_id IN (${placeholders})`, taskIds);
    } else {
      await conn.execute(
        `UPDATE point_transactions
         SET reference_id = NULL,
             description = CONCAT(description, ' (tutorial reset)')
         WHERE reference_type IN ('task_completion', 'quest_chain_completion')`
      );
    }

    await conn.execute('DELETE FROM board_maps');
    await conn.execute('DELETE FROM tasks');
    await conn.execute('DELETE FROM quest_chains');

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

async function insertQuestChain(conn, payload) {
  const [result] = await conn.execute(
    `INSERT INTO quest_chains
      (name, title, description, short_description, chain_points, badge_name, badge_image,
       created_by, mode_type, is_active, cover_image, entry_order, entry_button_text,
       entry_scene_label, play_style, experience_mode, game_rules, content_blueprint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.title,
      payload.title,
      payload.description,
      payload.short_description,
      payload.chain_points || 0,
      payload.badge_name || null,
      payload.badge_image || null,
      CREATED_BY,
      payload.mode_type,
      payload.cover_image || payload.badge_image || imageAt(0),
      payload.entry_order || 0,
      payload.entry_button_text || '開始體驗',
      payload.entry_scene_label || null,
      payload.play_style || null,
      payload.experience_mode || 'tutorial',
      JSON.stringify(payload.game_rules || {}),
      JSON.stringify(payload.content_blueprint || {})
    ]
  );
  return result.insertId;
}

async function insertTask(conn, questChainId, task, context = {}) {
  const [result] = await conn.execute(
    `INSERT INTO tasks
      (name, lat, lng, radius, description, photoUrl, cover_image_url, points, task_type,
       options, correct_answer, type, quest_chain_id, quest_order, required_item_id, reward_item_id,
       created_by, is_final_step, bgm_url, submission_type, validation_mode, ai_config, pass_criteria,
       failure_message, success_message, max_attempts, location_required, stage_template, stage_intro,
       hint_text, story_context, guide_content, rescue_content, event_config, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quest', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [
      task.name,
      task.lat ?? BASE_LAT,
      task.lng ?? BASE_LNG,
      task.radius ?? 35,
      task.description,
      task.photoUrl || task.cover_image_url || imageAt(context.imageIndex || 0),
      task.cover_image_url || task.photoUrl || imageAt(context.imageIndex || 0),
      task.points ?? 15,
      task.task_type,
      task.options ? JSON.stringify(task.options) : null,
      task.correct_answer ?? null,
      questChainId,
      task.quest_order ?? null,
      task.required_item_id || null,
      task.reward_item_id || null,
      CREATED_BY,
      task.is_final_step ? 1 : 0,
      task.bgm_url || audioAt(context.audioIndex || 0),
      task.submission_type || 'answer',
      task.validation_mode || 'manual',
      task.ai_config ? JSON.stringify(task.ai_config) : null,
      task.pass_criteria ? JSON.stringify(task.pass_criteria) : null,
      task.failure_message || '教學模式會保留 LM 回覆，但先讓你繼續前進。',
      task.success_message || '教學模式通關成功，往下一段推進。',
      task.max_attempts ?? 9,
      task.location_required ? 1 : 0,
      task.stage_template || 'story_intro',
      task.stage_intro || '',
      task.hint_text || '',
      task.story_context || '',
      task.guide_content || '',
      task.rescue_content || '',
      JSON.stringify(task.event_config || {})
    ]
  );
  return result.insertId;
}

async function insertBoardMap(conn, questChainId, map) {
  const [result] = await conn.execute(
    `INSERT INTO board_maps
      (quest_chain_id, name, description, play_style, cover_image, center_lat, center_lng, max_rounds,
       start_tile, finish_tile, dice_min, dice_max, failure_move, exact_finish_required, reward_points,
       is_active, rules_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
    [
      questChainId,
      map.name,
      map.description,
      map.play_style || 'tutorial_board',
      map.cover_image || imageAt(0),
      map.center_lat ?? BASE_LAT,
      map.center_lng ?? BASE_LNG,
      map.max_rounds ?? 18,
      map.start_tile ?? 1,
      map.finish_tile,
      map.dice_min ?? 1,
      map.dice_max ?? 3,
      map.failure_move ?? 0,
      map.exact_finish_required ? 1 : 0,
      map.reward_points ?? 120,
      JSON.stringify(map.rules_json || {}),
      CREATED_BY
    ]
  );
  return result.insertId;
}

async function insertBoardTile(conn, boardMapId, tile) {
  const [result] = await conn.execute(
    `INSERT INTO board_tiles
      (board_map_id, tile_index, tile_name, tile_type, latitude, longitude, radius_meters,
       task_id, effect_type, effect_value, event_title, event_body, guide_content, tile_meta, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [
      boardMapId,
      tile.tile_index,
      tile.tile_name,
      tile.tile_type,
      tile.latitude ?? BASE_LAT,
      tile.longitude ?? BASE_LNG,
      tile.radius_meters ?? 28,
      tile.task_id || null,
      tile.effect_type || null,
      tile.effect_value ?? null,
      tile.event_title || null,
      tile.event_body || null,
      tile.guide_content || null,
      JSON.stringify(tile.tile_meta || {})
    ]
  );
  return result.insertId;
}

function buildMixedStoryTasks(itemIds, variant = 'coast') {
  const [compassId, badgeId, clueId, passId] = itemIds;
  const intros = variant === 'coast'
    ? {
        title: '第 1 關｜集合報到',
        intro: '主持人・史蛋先帶你完成報到，讓玩家看懂劇情開場與任務節奏。',
        context: '這條教學線用來示範完整劇情玩法。'
      }
    : {
        title: '第 1 關｜燈塔開機',
        intro: '主持人・巴布先帶你啟動燈塔裝置，感受另一條劇情線的節奏。',
        context: '這條教學線用來示範另一套劇情模板。'
      };

  return [
    {
      name: intros.title,
      task_type: 'location',
      submission_type: 'answer',
      validation_mode: 'manual',
      quest_order: 1,
      stage_template: 'story_intro',
      stage_intro: intros.intro,
      description: '按下開始即可通過，示範劇情報到型關卡。',
      hint_text: '教學模式：直接開始即可。',
      story_context: intros.context,
      guide_content: '示範報到關、NPC 開場與第一步推進。',
      rescue_content: '若玩家不理解，按下開始即可往下。',
      event_config: { npc: '主持人・史蛋', mood: 'opening' },
      reward_item_id: compassId,
      points: 8
    },
    {
      name: variant === 'coast' ? '第 2 關｜拍下眼前畫面' : '第 2 關｜辨識眼前場景',
      task_type: 'photo',
      submission_type: 'image',
      validation_mode: variant === 'coast' ? 'ai_score' : 'ai_identify',
      quest_order: 2,
      stage_template: 'story_challenge',
      stage_intro: '潮汐裁判・鯨語會真的看圖，並告訴玩家看見了什麼。',
      description: '拍任意畫面都會通過，但教學模式仍會顯示 LM 的判定文字。',
      hint_text: '這一關示範 AI 圖片關卡與 RPG 裁判對話。',
      story_context: '用 AI 回覆讓玩家感受裁判真的在看圖。',
      guide_content: '示範 AI 判定但教學先放行。',
      rescue_content: '任意照片都會讓你繼續。',
      ai_config: variant === 'coast'
        ? { system_prompt: '你是沙丘教學模式的 AI 裁判，請描述玩家照片氛圍。', user_prompt: '請說出你看見了什麼，並給一句簡短回饋。', score_subject: 'tutorial_story_photo' }
        : aiIdentifyConfig('scene_object', '請用一句話描述玩家照片裡最主要的物件或場景。'),
      pass_criteria: variant === 'coast' ? { min_score: 1 } : { target_label: 'scene_object', min_confidence: 0.1 },
      reward_item_id: badgeId,
      points: 18
    },
    {
      name: '第 3 關｜選擇你的行動',
      task_type: 'multiple_choice',
      submission_type: 'choice',
      validation_mode: 'manual',
      quest_order: 3,
      options: variant === 'coast'
        ? ['先看海線', '先拍合照', '先找垃圾', '先衝終點']
        : ['先檢查設備', '先看燈塔門', '先自拍', '先跳過'],
      correct_answer: variant === 'coast' ? '先看海線' : '先檢查設備',
      stage_template: 'story_choice',
      stage_intro: '導覽員・潮聲想知道你會怎麼開始探索。',
      description: '任意選項都能過關，示範選擇題流程與對話切換。',
      hint_text: '教學模式：任意選項都算通過。',
      story_context: '玩家會在這裡感受到劇情分支的假象與引導。',
      guide_content: '示範多選題與 NPC 回饋。',
      rescue_content: '真的不知道選什麼也沒關係，任意選即可。',
      event_config: { npc: '導覽員・潮聲', mood: 'curious' },
      points: 10
    },
    {
      name: '第 4 關｜輸入一句話',
      task_type: 'keyword',
      submission_type: 'text',
      validation_mode: 'manual',
      quest_order: 4,
      correct_answer: variant === 'coast' ? '海風' : '燈塔',
      stage_template: 'story_keyword',
      stage_intro: '救援員・海羽請你輸入一句話，示範文字輸入型關卡。',
      description: '任意輸入都可以過關，用來測試手機文字輸入流程。',
      hint_text: '教學模式：輸入任何文字即可。',
      story_context: '讓玩家感受不只是拍照，也會有文字互動。',
      guide_content: '示範文字輸入題。',
      rescue_content: '隨便輸入也能繼續。',
      reward_item_id: clueId,
      points: 10
    },
    {
      name: '第 5 關｜輸入數字',
      task_type: 'number',
      submission_type: 'text',
      validation_mode: 'manual',
      quest_order: 5,
      correct_answer: variant === 'coast' ? '7' : '42',
      stage_template: 'story_unlock',
      stage_intro: '這一關示範數字型玩法與解鎖節奏。',
      description: '輸入任意數字即可通過。',
      hint_text: '教學模式：任意數字皆可。',
      story_context: '讓玩家體驗解鎖感。',
      guide_content: '示範數字輸入。',
      rescue_content: '任意數字都可前進。',
      reward_item_id: passId,
      points: 10
    },
    {
      name: '第 6 關｜留下收尾照片',
      task_type: 'photo',
      submission_type: 'image',
      validation_mode: 'ai_rule_check',
      quest_order: 6,
      is_final_step: true,
      stage_template: 'story_finale',
      stage_intro: '最後一關交給鯨語檢查畫面內容，讓玩家感受收尾與結算。',
      description: '上傳任意畫面，LM 會描述內容，但教學模式仍先通過。',
      hint_text: '示範 AI 條件檢查與結尾對話。',
      story_context: '最後一關讓玩家看到完整收尾。',
      guide_content: '示範 rule check 類型。',
      rescue_content: '任意畫面都會完成主線。',
      ai_config: { system_prompt: '你是沙丘教學模式的 AI 裁判，請描述玩家照片中的主要元素。', user_prompt: '請說出你看見了什麼，並簡單描述場景元素。', required_elements: ['主體', '背景'] },
      pass_criteria: { all_rules_must_pass: false, min_confidence: 0.1 },
      reward_item_id: badgeId,
      points: 24
    }
  ];
}

function buildStationeryStoryTasks(itemIds) {
  const [, badgeId, clueId, passId] = itemIds;
  const defs = [
    ['第 1 題｜找一支筆', 'pen_like', '請描述這張照片裡是否出現筆、鉛筆、原子筆或類似書寫工具。', '筆、鉛筆、原子筆等都可以。'],
    ['第 2 題｜找美工刀', 'utility_knife', '請描述這張照片裡是否出現美工刀或裁切工具。', '任何美工刀都可以。'],
    ['第 3 題｜找水杯', 'cup_like', '請描述這張照片裡是否出現水杯、馬克杯、咖啡杯或類似杯子。', '馬克杯、咖啡杯等都可以。'],
    ['第 4 題｜找充電器', 'charger_like', '請描述這張照片裡是否出現充電器、充電頭、充電線或充電設備。', '任何充電器都可以。'],
    ['第 5 題｜找電腦', 'computer_like', '請描述這張照片裡是否出現筆電、桌機、螢幕連接電腦或其他電腦設備。', '任何電腦都可以。'],
    ['第 6 題｜找電視螢幕', 'monitor_like', '請描述這張照片裡是否出現電視、監視器、外接螢幕或類似顯示器。', '任何電視螢幕都可以。']
  ];

  return defs.map((def, index) => ({
    name: def[0],
    task_type: 'photo',
    submission_type: 'image',
    validation_mode: 'ai_identify',
    quest_order: index + 1,
    is_final_step: index === defs.length - 1,
    stage_template: index === 0 ? 'story_intro' : (index === defs.length - 1 ? 'story_finale' : 'story_challenge'),
    stage_intro: `潮汐裁判・鯨語要你拍出指定物件。${def[3]}`,
    description: `LM 會真的看圖並回覆「我看見了...」，但教學模式會先放行。${def[3]}`,
    hint_text: `教學模式：辨識結果會顯示，但不會卡關。${def[3]}`,
    story_context: '這條教學線專門示範物件辨識型關卡。',
    guide_content: '玩家可以連續體驗 6 種辨識題型，全部都是日常文具與設備。',
    rescue_content: '如果一時找不到，任意拍照也能先繼續。',
    ai_config: aiIdentifyConfig(def[1], def[2]),
    pass_criteria: { target_label: def[1], min_confidence: 0.1 },
    reward_item_id: index % 2 === 0 ? clueId : passId,
    points: 16 + index
  }));
}

function buildBoardTaskDefs(itemIds, variant = 'coast') {
  const [compassId, badgeId, clueId, passId] = itemIds;
  if (variant === 'coast') {
    return [
      {
        name: '棋盤挑戰｜起航留影',
        task_type: 'photo',
        submission_type: 'image',
        validation_mode: 'ai_score',
        stage_template: 'board_challenge',
        stage_intro: '留下第一張照片，示範棋盤上的拍照挑戰。',
        description: '任意照片都會先通關。',
        guide_content: '示範拍照評分格。',
        hint_text: '教學模式：任意畫面皆可。',
        story_context: '棋盤的第一張照片只是讓玩家暖身。',
        rescue_content: '任何畫面都會先放行。',
        event_config: { npc: '棋盤主持人・史蛋', mood: 'starter' },
        ai_config: { system_prompt: '請描述這張教學棋盤照片。', user_prompt: '請說出你看見了什麼，並給一句簡短回應。', score_subject: 'tutorial_board_photo' },
        pass_criteria: { min_score: 1 },
        reward_item_id: compassId,
        points: 15
      },
      {
        name: '棋盤挑戰｜回答海岸問題',
        task_type: 'multiple_choice',
        submission_type: 'choice',
        validation_mode: 'manual',
        options: ['挑戰關卡', '機會關卡', '命運關卡'],
        correct_answer: '挑戰關卡',
        stage_template: 'board_quiz',
        stage_intro: '示範棋盤上的問題關卡。',
        description: '任意選一個答案即可通過。',
        guide_content: '示範選擇題。',
        hint_text: '教學模式：任意答案皆可。',
        story_context: '讓玩家看到棋盤不是只有拍照。',
        rescue_content: '不知道答案也不會卡住。',
        event_config: { npc: '出題員・潮聲', mood: 'quiz' },
        points: 12
      },
      {
        name: '棋盤挑戰｜輸入口令',
        task_type: 'keyword',
        submission_type: 'text',
        validation_mode: 'manual',
        correct_answer: '順風',
        stage_template: 'board_keyword',
        stage_intro: '輸入一句話，示範棋盤上的文字題。',
        description: '任意輸入都可以過關。',
        guide_content: '示範文字輸入關。',
        hint_text: '教學模式：任意文字皆可。',
        story_context: '棋盤上的挑戰也可以是文字互動。',
        rescue_content: '隨便輸入就能繼續。',
        event_config: { npc: '海羽', mood: 'support' },
        reward_item_id: clueId,
        points: 10
      },
      {
        name: '棋盤挑戰｜辨識眼前場景',
        task_type: 'photo',
        submission_type: 'image',
        validation_mode: 'ai_identify',
        stage_template: 'board_challenge',
        stage_intro: '鯨語會辨識你眼前的畫面。',
        description: 'AI 會說出看見了什麼，教學模式依然放行。',
        guide_content: '示範 identify 關卡。',
        hint_text: '任意照片都能前進。',
        story_context: '棋盤上的 AI 也要有存在感。',
        rescue_content: '拍任何內容都不會卡。',
        event_config: { npc: '潮汐裁判・鯨語', mood: 'analysis' },
        ai_config: aiIdentifyConfig('scene_object', '請用一句話描述玩家照片裡最主要的物件或場景。'),
        pass_criteria: { target_label: 'scene_object', min_confidence: 0.1 },
        reward_item_id: passId,
        points: 18
      }
    ];
  }

  return [
    {
      name: '燈塔挑戰｜第一張觀測照',
      task_type: 'photo',
      submission_type: 'image',
      validation_mode: 'ai_score',
      stage_template: 'board_challenge',
      stage_intro: '先拍一張觀測照，示範競速棋盤的第一格。',
      description: '任意畫面都會通過。',
      guide_content: '示範拍照型挑戰。',
      hint_text: '教學模式：任意畫面皆可。',
      story_context: '競速棋盤的節奏更快。',
      rescue_content: '照片隨手拍即可。',
      event_config: { npc: '主持人・巴布', mood: 'fast' },
      ai_config: { system_prompt: '請描述這張教學照片。', user_prompt: '請說出你看見了什麼，並給一句回應。', score_subject: 'tutorial_fast_board_photo' },
      pass_criteria: { min_score: 1 },
      reward_item_id: badgeId,
      points: 14
    },
    {
      name: '燈塔挑戰｜快速作答',
      task_type: 'number',
      submission_type: 'text',
      validation_mode: 'manual',
      correct_answer: '7',
      stage_template: 'board_quiz',
      stage_intro: '輸入任意數字，示範快問快答。',
      description: '任意數字都能通關。',
      guide_content: '示範數字題。',
      hint_text: '教學模式：任意數字皆可。',
      story_context: '數字題讓棋盤節奏更快。',
      rescue_content: '輸入一個數字即可。',
      event_config: { npc: '潮聲', mood: 'tempo' },
      points: 10
    },
    {
      name: '燈塔挑戰｜條件檢查',
      task_type: 'photo',
      submission_type: 'image',
      validation_mode: 'ai_rule_check',
      stage_template: 'board_challenge',
      stage_intro: '最後一張圖交給鯨語做條件檢查。',
      description: 'LM 會描述畫面條件，但教學模式會先放行。',
      guide_content: '示範 AI 規則檢查。',
      hint_text: '任意照片都可以前進。',
      story_context: '讓玩家感受 AI 判定不同型態。',
      rescue_content: '就算條件不足也不會卡關。',
      event_config: { npc: '鯨語', mood: 'resolve' },
      ai_config: { system_prompt: '請描述照片中的主要元素。', user_prompt: '請用一句話說出你看見了什麼，並列出主要元素。', required_elements: ['主體', '背景'] },
      pass_criteria: { all_rules_must_pass: false, min_confidence: 0.1 },
      reward_item_id: passId,
      points: 20
    }
  ];
}

async function seedStoryCampaign(conn, itemIds, config, orderOffset, taskBuilder) {
  const questChainId = await insertQuestChain(conn, {
    title: config.title,
    description: config.description,
    short_description: config.short_description,
    chain_points: config.chain_points,
    badge_name: config.badge_name,
    badge_image: config.badge_image,
    mode_type: 'story_campaign',
    cover_image: config.cover_image,
    entry_order: orderOffset,
    entry_button_text: config.entry_button_text,
    entry_scene_label: config.entry_scene_label,
    play_style: config.play_style,
    experience_mode: 'tutorial',
    game_rules: {
      demo_autopass: true,
      tutorial_mode: true,
      gps_required: false,
      rpg_dialog: true,
      mobile_single_hand: true
    },
    content_blueprint: {
      kind: 'tutorial_story',
      scene: config.entry_scene_label,
      chapter: config.play_style,
      gps_required: false
    }
  });

  const tasks = taskBuilder(itemIds);
  const taskIds = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const taskId = await insertTask(conn, questChainId, {
      ...tasks[i],
      location_required: false,
      lat: BASE_LAT,
      lng: BASE_LNG,
      radius: 35
    }, { imageIndex: orderOffset + i, audioIndex: i });
    taskIds.push(taskId);
  }
  return { questChainId, taskIds };
}

async function seedBoardCampaign(conn, itemIds, config, orderOffset, taskBuilder) {
  const questChainId = await insertQuestChain(conn, {
    title: config.title,
    description: config.description,
    short_description: config.short_description,
    chain_points: config.chain_points,
    badge_name: config.badge_name,
    badge_image: config.badge_image,
    mode_type: 'board_game',
    cover_image: config.cover_image,
    entry_order: orderOffset,
    entry_button_text: config.entry_button_text,
    entry_scene_label: config.entry_scene_label,
    play_style: config.play_style,
    experience_mode: 'tutorial',
    game_rules: {
      demo_autopass: true,
      tutorial_mode: true,
      gps_required: false,
      rpg_dialog: true,
      board_tutorial: true,
      mobile_single_hand: true
    },
    content_blueprint: {
      kind: 'tutorial_board',
      scene: config.entry_scene_label,
      chapter: config.play_style,
      gps_required: false
    }
  });

  const tasks = taskBuilder(itemIds);
  const taskIds = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const taskId = await insertTask(conn, questChainId, {
      ...tasks[i],
      location_required: false,
      lat: BASE_LAT,
      lng: BASE_LNG,
      radius: 35
    }, { imageIndex: orderOffset + i, audioIndex: i + 1 });
    taskIds.push(taskId);
  }

  const boardMapId = await insertBoardMap(conn, questChainId, config.map);
  for (const tile of config.tiles(taskIds)) {
    await insertBoardTile(conn, boardMapId, tile);
  }

  return { questChainId, boardMapId, taskIds };
}

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    console.log('開始重建教學世界...');
    await cleanupExistingContent(conn);

    const itemIds = [];
    itemIds.push(await ensureItem(conn, { name: '潮汐羅盤', description: '象徵方向與前進的教學道具。', image_url: imageAt(0), type: 'normal', effect_value: 0 }));
    itemIds.push(await ensureItem(conn, { name: '海玻璃徽章', description: '完成教學後獲得的徽章。', image_url: imageAt(1), type: 'badge', effect_value: 0 }));
    itemIds.push(await ensureItem(conn, { name: '漂流瓶線索', description: '文字輸入與提示用的線索道具。', image_url: imageAt(2), type: 'clue', effect_value: 0 }));
    itemIds.push(await ensureItem(conn, { name: '珊瑚通行章', description: '關卡結算與收尾用道具。', image_url: imageAt(3), type: 'badge', effect_value: 0 }));

    const seeded = [];

    seeded.push(await seedStoryCampaign(conn, itemIds, {
      title: '沙丘教學｜潮聲巡航線',
      description: '完整示範劇情主線：報到、AI 拍照、選擇題、文字題、數字題與收尾照片。',
      short_description: '劇情教學：完整走一次主線玩法。',
      chain_points: 80,
      badge_name: '潮聲徽章',
      badge_image: imageAt(0),
      cover_image: imageAt(0),
      entry_button_text: '開始巡航',
      entry_scene_label: '濱海劇情',
      play_style: 'tutorial_story_coast'
    }, 1, (ids) => buildMixedStoryTasks(ids, 'coast')));

    seeded.push(await seedStoryCampaign(conn, itemIds, {
      title: '沙丘教學｜燈塔搜查線',
      description: '第二條劇情主線，示範另一套節奏與 AI 互動。',
      short_description: '劇情教學：另一條劇情模板。',
      chain_points: 84,
      badge_name: '燈塔徽章',
      badge_image: imageAt(1),
      cover_image: imageAt(1),
      entry_button_text: '開始搜查',
      entry_scene_label: '燈塔劇情',
      play_style: 'tutorial_story_lighthouse'
    }, 2, (ids) => buildMixedStoryTasks(ids, 'lighthouse')));

    seeded.push(await seedStoryCampaign(conn, itemIds, {
      title: '沙丘教學｜文具辨識線',
      description: '六題連續物件辨識教學，全部都會真的交給 LM 看圖，但教學模式先放行。',
      short_description: '劇情教學：文具與設備辨識 6 連關。',
      chain_points: 96,
      badge_name: '文具觀察徽章',
      badge_image: imageAt(2),
      cover_image: imageAt(2),
      entry_button_text: '開始辨識',
      entry_scene_label: '文具辨識',
      play_style: 'tutorial_story_stationery'
    }, 3, (ids) => buildStationeryStoryTasks(ids)));

    seeded.push(await seedBoardCampaign(conn, itemIds, {
      title: '沙丘教學｜濱海命運棋盤',
      description: '混合挑戰、問題、機會、命運與事件的完整棋盤教學。',
      short_description: '大富翁教學：混合型棋盤。',
      chain_points: 120,
      badge_name: '命運棋盤徽章',
      badge_image: imageAt(3),
      cover_image: imageAt(3),
      entry_button_text: '進入命運棋盤',
      entry_scene_label: '濱海棋盤',
      play_style: 'tutorial_board_fortune',
      map: {
        name: '濱海命運棋盤',
        description: '混合挑戰、事件、機會、命運與問題關卡。',
        play_style: 'tutorial_board_fortune',
        cover_image: imageAt(3),
        finish_tile: 12,
        dice_min: 1,
        dice_max: 3,
        reward_points: 140,
        rules_json: {
          demo_autopass: true,
          tutorial_mode: true,
          gps_required: false,
          rpg_dialog: true,
          tutorial_roll_sequence: [2, 1, 2, 3, 1, 2, 1]
        }
      },
      tiles: (taskIds) => ([
        { tile_index: 1, tile_name: '起點｜集合', tile_type: 'story', event_title: '旅程開始', event_body: '主持人・史蛋宣布棋盤啟動。', guide_content: '起點故事格。', tile_meta: { label: '起點', npc: '主持人・史蛋' } },
        { tile_index: 2, tile_name: '挑戰｜起航留影', tile_type: 'challenge', task_id: taskIds[0], event_title: '留影挑戰', guide_content: '拍照挑戰格', tile_meta: { label: '挑戰關卡', npc: '主持人・史蛋' } },
        { tile_index: 3, tile_name: '機會｜海風補給', tile_type: 'chance', effect_type: 'gain_points', effect_value: 8, event_title: '機會關卡', event_body: '海風替你送來補給。', guide_content: '機會關卡示範。', tile_meta: { label: '機會關卡', npc: '潮聲' } },
        { tile_index: 4, tile_name: '問題｜路線判斷', tile_type: 'quiz', task_id: taskIds[1], event_title: '問題關卡', guide_content: '選擇題關卡', tile_meta: { label: '問題關卡', npc: '出題員・潮聲' } },
        { tile_index: 5, tile_name: '命運｜潮汐轉盤', tile_type: 'fortune', effect_type: 'move_forward', effect_value: 1, event_title: '命運關卡', event_body: '命運轉盤決定是否再前進。', guide_content: '命運關卡示範。', tile_meta: { label: '命運關卡', npc: '鯨語' } },
        { tile_index: 6, tile_name: '挑戰｜輸入口令', tile_type: 'challenge', task_id: taskIds[2], event_title: '文字挑戰', guide_content: '文字輸入型挑戰', tile_meta: { label: '挑戰關卡', npc: '海羽' } },
        { tile_index: 7, tile_name: '事件｜海流提示', tile_type: 'event', effect_type: 'gain_points', effect_value: 5, event_title: '事件關卡', event_body: '收到一段海流提示。', guide_content: '事件格示範。', tile_meta: { label: '事件關卡', npc: '導覽員・潮聲' } },
        { tile_index: 8, tile_name: '挑戰｜辨識眼前場景', tile_type: 'challenge', task_id: taskIds[3], event_title: '辨識挑戰', guide_content: 'AI 辨識型挑戰', tile_meta: { label: '挑戰關卡', npc: '潮汐裁判・鯨語' } },
        { tile_index: 9, tile_name: '機會｜捷徑', tile_type: 'chance', effect_type: 'move_forward', effect_value: 1, event_title: '機會關卡', event_body: '你發現一條捷徑。', guide_content: '機會格再示範。', tile_meta: { label: '機會關卡', npc: '史蛋' } },
        { tile_index: 10, tile_name: '事件｜潮水回退', tile_type: 'event', effect_type: 'move_backward', effect_value: 1, event_title: '事件關卡', event_body: '潮水讓你稍微退後。', guide_content: '負效果事件格示範。', tile_meta: { label: '事件關卡', npc: '海羽' } },
        { tile_index: 11, tile_name: '問題｜終點前提問', tile_type: 'quiz', task_id: taskIds[1], event_title: '問題關卡', guide_content: '終點前的最後提問', tile_meta: { label: '問題關卡', npc: '潮聲' } },
        { tile_index: 12, tile_name: '終點｜命運靠岸', tile_type: 'story', event_title: '終點', event_body: '你已完成命運棋盤。', guide_content: '終點故事格。', tile_meta: { label: '終點', npc: '主持人・史蛋' } }
      ])
    }, 4, (ids) => buildBoardTaskDefs(ids, 'coast')));

    seeded.push(await seedBoardCampaign(conn, itemIds, {
      title: '沙丘教學｜燈塔競速棋盤',
      description: '更快節奏的棋盤教學，示範競速、事件、命運與終點收尾。',
      short_description: '大富翁教學：快速競速版棋盤。',
      chain_points: 100,
      badge_name: '競速棋盤徽章',
      badge_image: imageAt(4),
      cover_image: imageAt(4),
      entry_button_text: '進入競速棋盤',
      entry_scene_label: '燈塔棋盤',
      play_style: 'tutorial_board_sprint',
      map: {
        name: '燈塔競速棋盤',
        description: '節奏更快的教學棋盤。',
        play_style: 'tutorial_board_sprint',
        cover_image: imageAt(4),
        finish_tile: 10,
        dice_min: 1,
        dice_max: 3,
        reward_points: 110,
        rules_json: {
          demo_autopass: true,
          tutorial_mode: true,
          gps_required: false,
          rpg_dialog: true,
          tutorial_roll_sequence: [1, 3, 2, 2, 1, 3]
        }
      },
      tiles: (taskIds) => ([
        { tile_index: 1, tile_name: '起點｜燈塔集合', tile_type: 'story', event_title: '起點', event_body: '巴布宣布競速開始。', guide_content: '起點故事格。', tile_meta: { label: '起點', npc: '主持人・巴布' } },
        { tile_index: 2, tile_name: '挑戰｜第一張觀測照', tile_type: 'challenge', task_id: taskIds[0], event_title: '拍照挑戰', guide_content: '照片挑戰格', tile_meta: { label: '挑戰關卡', npc: '主持人・巴布' } },
        { tile_index: 3, tile_name: '命運｜順風', tile_type: 'fortune', effect_type: 'move_forward', effect_value: 1, event_title: '命運關卡', event_body: '一陣順風把你往前推。', guide_content: '命運關卡。', tile_meta: { label: '命運關卡', npc: '鯨語' } },
        { tile_index: 4, tile_name: '問題｜快速作答', tile_type: 'quiz', task_id: taskIds[1], event_title: '問題關卡', guide_content: '數字型快答', tile_meta: { label: '問題關卡', npc: '潮聲' } },
        { tile_index: 5, tile_name: '事件｜補給', tile_type: 'event', effect_type: 'gain_points', effect_value: 6, event_title: '事件關卡', event_body: '獲得一組補給積分。', guide_content: '補給事件格。', tile_meta: { label: '事件關卡', npc: '海羽' } },
        { tile_index: 6, tile_name: '挑戰｜條件檢查', tile_type: 'challenge', task_id: taskIds[2], event_title: '條件挑戰', guide_content: 'AI 規則檢查', tile_meta: { label: '挑戰關卡', npc: '鯨語' } },
        { tile_index: 7, tile_name: '機會｜再前進', tile_type: 'chance', effect_type: 'move_forward', effect_value: 1, event_title: '機會關卡', event_body: '你找到一條捷徑。', guide_content: '機會格。', tile_meta: { label: '機會關卡', npc: '史蛋' } },
        { tile_index: 8, tile_name: '事件｜短暫停靠', tile_type: 'event', effect_type: 'gain_points', effect_value: 4, event_title: '事件關卡', event_body: '在停靠點休整後獲得少量積分。', guide_content: '中繼事件格。', tile_meta: { label: '事件關卡', npc: '潮聲' } },
        { tile_index: 9, tile_name: '問題｜終點前確認', tile_type: 'quiz', task_id: taskIds[1], event_title: '問題關卡', guide_content: '終點前最後確認', tile_meta: { label: '問題關卡', npc: '潮聲' } },
        { tile_index: 10, tile_name: '終點｜燈塔衝線', tile_type: 'story', event_title: '終點', event_body: '你完成競速棋盤，成功衝線。', guide_content: '終點故事格。', tile_meta: { label: '終點', npc: '巴布' } }
      ])
    }, 5, (ids) => buildBoardTaskDefs(ids, 'sprint')));

    console.log('\n教學世界已建立完成：');
    seeded.forEach((entry, index) => {
      console.log(`- [${index + 1}] quest_chain_id=${entry.questChainId}${entry.boardMapId ? ` board_map_id=${entry.boardMapId}` : ''}`);
    });
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
