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
  const [questRows] = await conn.execute('SELECT id, title FROM quest_chains ORDER BY id ASC');
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
             description = CONCAT(description, ' (demo reset)')
         WHERE reference_type IN ('task_completion', 'quest_chain_completion')
           AND reference_id IN (${placeholders})`,
        taskIds
      );
      await conn.execute(`UPDATE board_tiles SET task_id = NULL WHERE task_id IN (${placeholders})`, taskIds);
    } else {
      await conn.execute(
        `UPDATE point_transactions
         SET reference_id = NULL,
             description = CONCAT(description, ' (demo reset)')
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
       entry_scene_label, play_style, game_rules, content_blueprint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?, ?, ?)`,
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
      task.failure_message || 'Demo 模式會保留 LM 回覆，但先讓你繼續前進。',
      task.success_message || 'Demo 通關成功，往下一段推進。',
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
      map.play_style || 'fixed_track_race',
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

function storyTaskDefs(itemIds, storyKey) {
  const [compassId, shellId, bottleId, coralId, keyId] = itemIds;
  if (storyKey === 'coast') {
    return [
      {
        name: '第 1 關｜碼頭報到',
        task_type: 'location',
        submission_type: 'answer',
        validation_mode: 'manual',
        quest_order: 1,
        stage_template: 'story_intro',
        stage_intro: '主持人・史蛋要你先在入口完成報到，確認這段濱海守護線正式開始。',
        description: '按下報到，讓沙丘確認你已進入故事主線。',
        hint_text: 'Demo 模式：只要開始就會通過。',
        story_context: '守護行動從碼頭邊的第一步開始。',
        guide_content: '這一關示範劇情起手式與報到關卡。',
        rescue_content: '就算定位不穩，Demo 模式也會先讓你繼續。',
        event_config: { npc: '主持人・史蛋', sfx: 'start-bell', mood: 'opening' },
        reward_item_id: compassId,
        points: 8
      },
      {
        name: '第 2 關｜找回海岸視角',
        task_type: 'photo',
        submission_type: 'image',
        validation_mode: 'ai_reference_match',
        quest_order: 2,
        stage_template: 'story_challenge',
        stage_intro: '潮汐裁判・鯨語要你拍一張和參考景相近的畫面，確認你看懂這段海岸線。',
        description: '隨手拍下眼前畫面，鯨語會真的看圖，但 Demo 先讓你通過。',
        hint_text: '這一關會呼叫 LM 判圖，再用 Demo 放行。',
        story_context: '你正在確認自己與海岸地景的連結。',
        guide_content: '這一關示範參考照片比對與 AI 裁判回覆。',
        rescue_content: '就算畫面不完整，Demo 模式仍會帶你往下走。',
        ai_config: {
          system_prompt: '你是沙丘 Demo 劇情的 AI 裁判，請比較參考畫面與玩家照片是否屬於相近場景。',
          user_prompt: '請描述玩家照片看到了什麼，以及是否與海岸/碼頭視角相近。',
          target_label: 'coast_reference'
        },
        pass_criteria: { target_label: 'coast_reference', min_confidence: 0.1 },
        photoUrl: imageAt(0),
        cover_image_url: imageAt(0),
        bgm_url: audioAt(0),
        event_config: { npc: '潮汐裁判・鯨語', sfx: 'camera-judge', mood: 'focus' },
        required_item_id: compassId,
        reward_item_id: shellId,
        points: 18
      },
      {
        name: '第 3 關｜選擇巡航策略',
        task_type: 'multiple_choice',
        submission_type: 'choice',
        validation_mode: 'manual',
        quest_order: 3,
        options: ['沿著海堤找線索', '先找漂流垃圾', '先拍一張合照', '直接往終點跑'],
        correct_answer: '沿著海堤找線索',
        stage_template: 'story_choice',
        stage_intro: '導覽員・潮聲想知道你這輪會用什麼方式探索。',
        description: '任意選一個答案，Demo 模式會先記錄你的選擇並通關。',
        hint_text: '這一關用來測選擇題流程與 NPC 對話切換。',
        story_context: '不同選擇會讓人對航線有不同想像。',
        guide_content: '這一關示範主線中的選擇題互動。',
        rescue_content: '就算選錯也不會卡住。',
        event_config: { npc: '導覽員・潮聲', sfx: 'choice-click', mood: 'curious' },
        points: 10
      },
      {
        name: '第 4 關｜說出你想找的東西',
        task_type: 'keyword',
        submission_type: 'text',
        validation_mode: 'manual',
        quest_order: 4,
        correct_answer: '漂流瓶',
        stage_template: 'story_keyword',
        stage_intro: '救援員・海羽要你說出此刻最想尋找的海岸線索。',
        description: '輸入任意文字，讓系統示範文字輸入型關卡。',
        hint_text: 'Demo 模式：只要有輸入就過關。',
        story_context: '每個玩家心中的海岸線索都不一樣。',
        guide_content: '這一關示範文字輸入型玩法。',
        rescue_content: '若想不到答案，輸入任何字詞即可繼續。',
        event_config: { npc: '救援員・海羽', sfx: 'soft-note', mood: 'support' },
        reward_item_id: bottleId,
        points: 10
      },
      {
        name: '第 5 關｜留下海岸合照',
        task_type: 'photo',
        submission_type: 'image',
        validation_mode: 'ai_score',
        quest_order: 5,
        is_final_step: true,
        stage_template: 'story_finale',
        stage_intro: '主持人・史蛋請你留下這條守護線的合照，作為結尾紀錄。',
        description: '上傳任何畫面，LM 會給評論，Demo 會讓你收尾通關。',
        hint_text: '這一關示範 AI 評分型收尾關卡。',
        story_context: '最後一張照片用來替整條故事畫下句點。',
        guide_content: '這一關示範 AI score 類型與最終結算。',
        rescue_content: '任何畫面都會先通過，但仍會保留 AI 評語。',
        ai_config: {
          system_prompt: '你是沙丘 Demo 劇情的終點裁判，請描述玩家照片氛圍並給簡短評語。',
          user_prompt: '請對這張收尾照片給出 1 到 10 分的感受分數與一句評語。',
          score_subject: 'coast_demo_finale'
        },
        pass_criteria: { min_score: 1 },
        photoUrl: imageAt(1),
        cover_image_url: imageAt(1),
        bgm_url: audioAt(1),
        event_config: { npc: '主持人・史蛋', sfx: 'finish-fanfare', mood: 'celebrate' },
        required_item_id: bottleId,
        reward_item_id: coralId,
        points: 24
      }
    ];
  }

  return [
    {
      name: '第 1 關｜燈塔開機',
      task_type: 'location',
      submission_type: 'answer',
      validation_mode: 'manual',
      quest_order: 1,
      stage_template: 'story_intro',
      stage_intro: '主持人・巴布要你先把燈塔偵測器打開，準備進入另一條 Demo 劇情。',
      description: '按下開始，示範第二條主線的入口流程。',
      hint_text: 'Demo 模式：入口關不會卡住。',
      story_context: '燈塔線的調查從設備開機開始。',
      guide_content: '這一關示範不同劇情入口的第一步。',
      rescue_content: '若設備條件不足，沙丘也會先替你放行。',
      event_config: { npc: '主持人・巴布', sfx: 'device-on', mood: 'warmup' },
      reward_item_id: keyId,
      points: 8
    },
    {
      name: '第 2 關｜辨識海邊物件',
      task_type: 'photo',
      submission_type: 'image',
      validation_mode: 'ai_identify',
      quest_order: 2,
      stage_template: 'story_challenge',
      stage_intro: '鯨語想知道你拍下來的畫面裡有什麼，這一關示範物件辨識。',
      description: '拍任意畫面讓 LM 描述內容，再由 Demo 自動放行。',
      hint_text: '這一關是 ai_identify 類型。',
      story_context: '任何畫面都能成為 AI 觀察的素材。',
      guide_content: 'LM 會真的回覆看到的東西，但結果仍會放行。',
      rescue_content: '即使辨識模糊也不會阻擋你前進。',
      ai_config: {
        system_prompt: '你是沙丘 Demo 劇情的辨識裁判，請描述玩家照片的主要物件。',
        user_prompt: '請用一句話描述玩家照片裡最主要的物件或場景。',
        target_label: 'coastal_object'
      },
      pass_criteria: { target_label: 'coastal_object', min_confidence: 0.1 },
      photoUrl: imageAt(2),
      cover_image_url: imageAt(2),
      bgm_url: audioAt(2),
      event_config: { npc: '潮汐裁判・鯨語', sfx: 'identify-tone', mood: 'analysis' },
      required_item_id: keyId,
      reward_item_id: shellId,
      points: 16
    },
    {
      name: '第 3 關｜數一數眼前線索',
      task_type: 'photo',
      submission_type: 'image',
      validation_mode: 'ai_count',
      quest_order: 3,
      stage_template: 'story_observe',
      stage_intro: '這一關讓鯨語幫你數數看畫面裡的線索數量。',
      description: '上傳任意照片，LM 會嘗試描述數量，但 Demo 依然先放行。',
      hint_text: '這一關是 ai_count 類型。',
      story_context: '觀察與統計是燈塔巡查的另一種節奏。',
      guide_content: '用來測試 count 類型結果回傳與文案。',
      rescue_content: '數量不準時仍會先放行。',
      ai_config: {
        system_prompt: '你是沙丘 Demo 劇情的計數裁判，請估計玩家照片中可辨識的重複物件數量。',
        user_prompt: '請估計畫面中最明顯的一種物件大約出現幾個。',
        target_label: 'visible_object'
      },
      pass_criteria: { target_label: 'visible_object', target_count: 1, min_confidence: 0.1 },
      photoUrl: imageAt(3),
      cover_image_url: imageAt(3),
      bgm_url: audioAt(2),
      event_config: { npc: '潮汐裁判・鯨語', sfx: 'count-scan', mood: 'observe' },
      reward_item_id: bottleId,
      points: 18
    },
    {
      name: '第 4 關｜輸入燈塔密碼',
      task_type: 'number',
      submission_type: 'text',
      validation_mode: 'manual',
      quest_order: 4,
      correct_answer: '42',
      stage_template: 'story_unlock',
      stage_intro: '潮聲要你打開燈塔小門，先輸入一組任意數字體驗解鎖。',
      description: '任意輸入數字即可通過，這一關用來測數字型玩法。',
      hint_text: 'Demo 模式：任何數字都算通過。',
      story_context: '每道鎖都只是讓你感受節奏的一部分。',
      guide_content: '測數字輸入與解鎖型任務。',
      rescue_content: '輸入任意數字即可繼續。',
      event_config: { npc: '導覽員・潮聲', sfx: 'keypad-beep', mood: 'unlock' },
      points: 10
    },
    {
      name: '第 5 關｜檢查場景條件',
      task_type: 'photo',
      submission_type: 'image',
      validation_mode: 'ai_rule_check',
      quest_order: 5,
      is_final_step: true,
      stage_template: 'story_finale',
      stage_intro: '最後一關讓鯨語確認畫面條件，做一次完整的 AI 規則檢查示範。',
      description: 'LM 會描述畫面條件是否齊全，但 Demo 會先讓你通過。',
      hint_text: '這一關是 ai_rule_check 類型。',
      story_context: '調查終點需要做一次總檢視。',
      guide_content: '用來演示條件檢查、規則式 AI 文案與結尾對話。',
      rescue_content: '若條件不足，Demo 仍會收尾放行。',
      ai_config: {
        system_prompt: '你是沙丘 Demo 劇情的條件檢查裁判，請描述玩家照片中的場景元素。',
        user_prompt: '請列出畫面中有哪些主要元素，並判斷是否像是一個完整的觀測場景。',
        required_elements: ['視野', '主體', '背景']
      },
      pass_criteria: { all_rules_must_pass: false, min_confidence: 0.1 },
      photoUrl: imageAt(4),
      cover_image_url: imageAt(4),
      bgm_url: audioAt(3),
      event_config: { npc: '潮汐裁判・鯨語', sfx: 'rule-check', mood: 'final' },
      required_item_id: shellId,
      reward_item_id: coralId,
      points: 22
    }
  ];
}

function boardTaskDefs(itemIds, boardKey) {
  const [compassId, shellId, bottleId, coralId, keyId] = itemIds;
  if (boardKey === 'fortune') {
    return [
      {
        name: '棋盤挑戰｜起航留影',
        task_type: 'photo',
        submission_type: 'image',
        validation_mode: 'ai_score',
        stage_template: 'board_challenge',
        stage_intro: '留下第一張棋盤留影，讓 AI 替你記錄這一步。',
        description: '任意拍照即可前進。',
        guide_content: '大富翁挑戰格示範：拍照評分。',
        hint_text: 'Demo：任意照片都會通過。',
        story_context: '航線開始運轉。',
        rescue_content: '沒有合適畫面也可直接拍。',
        event_config: { npc: '棋盤主持人・史蛋', sfx: 'board-camera', mood: 'starter' },
        ai_config: { system_prompt: '描述這張棋盤教學照片。', user_prompt: '請給一句簡短評語。', score_subject: 'board_photo' },
        pass_criteria: { min_score: 1 },
        required_item_id: compassId,
        reward_item_id: shellId,
        points: 15
      },
      {
        name: '棋盤挑戰｜回答海岸問題',
        task_type: 'multiple_choice',
        submission_type: 'choice',
        validation_mode: 'manual',
        options: ['機會關卡', '命運關卡', '挑戰關卡'],
        correct_answer: '挑戰關卡',
        stage_template: 'board_quiz',
        stage_intro: '來答一題，感受棋盤上的問題關卡。',
        description: '任意選一個答案即可通過。',
        guide_content: '問題關卡示範。',
        hint_text: 'Demo：任意答案都算通過。',
        story_context: '答題只是節奏的一部分。',
        rescue_content: '不用怕答錯，Demo 會先放行。',
        event_config: { npc: '出題員・潮聲', sfx: 'quiz-bell', mood: 'quiz' },
        points: 12
      },
      {
        name: '棋盤挑戰｜輸入口令',
        task_type: 'keyword',
        submission_type: 'text',
        validation_mode: 'manual',
        correct_answer: '順風',
        stage_template: 'board_challenge',
        stage_intro: '輸入一個你想對海風說的詞。',
        description: '任意輸入文字即可通過。',
        guide_content: '文字輸入型挑戰示範。',
        hint_text: 'Demo：任意文字皆可。',
        story_context: '有時只是讓玩家參與其中。',
        rescue_content: '輸入任何內容即可。',
        event_config: { npc: '救援員・海羽', sfx: 'soft-chime', mood: 'gentle' },
        reward_item_id: bottleId,
        points: 10
      },
      {
        name: '棋盤挑戰｜辨識眼前場景',
        task_type: 'photo',
        submission_type: 'image',
        validation_mode: 'ai_identify',
        stage_template: 'board_challenge',
        stage_intro: '鯨語想知道你眼前看到了什麼。',
        description: '上傳任意畫面，AI 真的會描述，但 Demo 先通關。',
        guide_content: 'AI identify 挑戰示範。',
        hint_text: 'Demo：任意畫面皆可。',
        story_context: '感受 AI 在棋盤上的裁判角色。',
        rescue_content: '沒拍好也能繼續。',
        event_config: { npc: '潮汐裁判・鯨語', sfx: 'scan-identify', mood: 'focus' },
        ai_config: { system_prompt: '請描述玩家照片。', user_prompt: '用一句話描述照片內容。', target_label: 'scene_object' },
        pass_criteria: { target_label: 'scene_object', min_confidence: 0.1 },
        reward_item_id: coralId,
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
      stage_intro: '先留下一張觀測照，作為競速棋盤的開場。',
      description: '任意畫面都會先通關。',
      guide_content: '拍照型挑戰。',
      hint_text: 'Demo：任意畫面都通過。',
      story_context: '競速棋盤的第一步是留下視角。',
      rescue_content: '照片隨手拍即可。',
      event_config: { npc: '棋盤主持人・巴布', sfx: 'quick-shot', mood: 'fast' },
      ai_config: { system_prompt: '請描述玩家照片。', user_prompt: '給一句感想。', score_subject: 'board_fast_photo' },
      pass_criteria: { min_score: 1 },
      required_item_id: keyId,
      reward_item_id: shellId,
      points: 14
    },
    {
      name: '燈塔挑戰｜快速作答',
      task_type: 'number',
      submission_type: 'text',
      validation_mode: 'manual',
      correct_answer: '7',
      stage_template: 'board_quiz',
      stage_intro: '輸入任意數字，示範棋盤上的快問快答。',
      description: '任意數字即可通關。',
      guide_content: '數字型問題關卡。',
      hint_text: 'Demo：任何數字都可。',
      story_context: '快問快答帶來不同節奏。',
      rescue_content: '輸入一個數字就行。',
      event_config: { npc: '出題員・潮聲', sfx: 'quiz-fast', mood: 'tempo' },
      points: 10
    },
    {
      name: '燈塔挑戰｜條件檢查',
      task_type: 'photo',
      submission_type: 'image',
      validation_mode: 'ai_rule_check',
      stage_template: 'board_challenge',
      stage_intro: '最後一張圖交給鯨語做條件檢查，完成整張競速棋盤。',
      description: 'AI 會描述條件結果，Demo 仍會先放行。',
      guide_content: '條件檢查型挑戰。',
      hint_text: 'Demo：任意畫面都會被放行。',
      story_context: '終點前的規則確認。',
      rescue_content: '畫面不足也不會阻擋你通關。',
      event_config: { npc: '潮汐裁判・鯨語', sfx: 'final-scan', mood: 'resolve' },
      ai_config: { system_prompt: '請描述這張照片中的場景元素。', user_prompt: '列出畫面中看得到的元素。', required_elements: ['主體', '背景'] },
      pass_criteria: { all_rules_must_pass: false, min_confidence: 0.1 },
      reward_item_id: coralId,
      points: 20
    }
  ];
}

async function seedStoryCampaign(conn, itemIds, config, orderOffset) {
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
    game_rules: {
      demo_autopass: true,
      tutorial_mode: true,
      rpg_dialog: true,
      mobile_single_hand: true
    },
    content_blueprint: {
      kind: 'demo_story',
      scene: config.entry_scene_label,
      chapter: config.play_style
    }
  });

  const tasks = storyTaskDefs(itemIds, config.storyKey);
  const taskIds = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const taskId = await insertTask(conn, questChainId, tasks[i], { imageIndex: orderOffset + i, audioIndex: i });
    taskIds.push(taskId);
  }
  return { questChainId, taskIds };
}

async function seedBoardCampaign(conn, itemIds, config, orderOffset) {
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
    game_rules: {
      demo_autopass: true,
      tutorial_mode: true,
      rpg_dialog: true,
      board_tutorial: true,
      mobile_single_hand: true
    },
    content_blueprint: {
      kind: 'demo_board',
      scene: config.entry_scene_label,
      chapter: config.play_style
    }
  });

  const tasks = boardTaskDefs(itemIds, config.boardKey);
  const taskIds = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const taskId = await insertTask(conn, questChainId, tasks[i], { imageIndex: orderOffset + i, audioIndex: i + 1 });
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
    console.log('開始重建 Demo 世界...');
    await cleanupExistingContent(conn);

    const itemIds = [];
    itemIds.push(await ensureItem(conn, { name: '潮汐羅盤', description: '用來象徵前進方向的 demo 道具。', image_url: imageAt(0), type: 'normal', effect_value: 0 }));
    itemIds.push(await ensureItem(conn, { name: '海玻璃徽章', description: '完成劇情後會得到的徽章。', image_url: imageAt(1), type: 'badge', effect_value: 0 }));
    itemIds.push(await ensureItem(conn, { name: '漂流瓶線索', description: '文字輸入與故事線索的代表物。', image_url: imageAt(2), type: 'clue', effect_value: 0 }));
    itemIds.push(await ensureItem(conn, { name: '珊瑚通行章', description: '收尾與終點用的 demo 道具。', image_url: imageAt(3), type: 'badge', effect_value: 0 }));
    itemIds.push(await ensureItem(conn, { name: '燈塔鑰匙', description: '燈塔調查線的起手道具。', image_url: imageAt(4), type: 'key', effect_value: 0 }));

    const seeded = [];

    seeded.push(await seedStoryCampaign(conn, itemIds, {
      title: '沙丘 Demo｜潮聲巡航線',
      description: '以濱海守護與觀察為主軸的 Demo 劇情線，會完整演示報到、AI 拍照、選擇題、文字輸入與收尾評分。',
      short_description: '劇情模式 Demo：完整體驗報到、拍照、選擇題與收尾評分。',
      chain_points: 80,
      badge_name: '潮聲徽章',
      badge_image: imageAt(0),
      cover_image: imageAt(0),
      entry_button_text: '開始巡航',
      entry_scene_label: '濱海守護',
      play_style: 'demo_story_coast',
      storyKey: 'coast'
    }, 1));

    seeded.push(await seedStoryCampaign(conn, itemIds, {
      title: '沙丘 Demo｜燈塔搜查線',
      description: '以 AI 辨識、數量判斷、規則檢查與數字解鎖為核心的 Demo 劇情線。',
      short_description: '劇情模式 Demo：完整體驗 identify、count、rule check 與數字題。',
      chain_points: 90,
      badge_name: '燈塔徽章',
      badge_image: imageAt(1),
      cover_image: imageAt(1),
      entry_button_text: '開始搜查',
      entry_scene_label: '燈塔調查',
      play_style: 'demo_story_lighthouse',
      storyKey: 'lighthouse'
    }, 2));

    seeded.push(await seedBoardCampaign(conn, itemIds, {
      title: '沙丘 Demo｜濱海命運棋盤',
      description: '一張含挑戰、機會、命運、問題與終點的完整 Demo 棋盤。',
      short_description: '大富翁 Demo：混合挑戰格、機會格、命運格與問題格。',
      chain_points: 120,
      badge_name: '命運棋盤徽章',
      badge_image: imageAt(2),
      cover_image: imageAt(2),
      entry_button_text: '進入命運棋盤',
      entry_scene_label: '濱海棋盤',
      play_style: 'demo_board_fortune',
      boardKey: 'fortune',
      map: {
        name: '濱海命運棋盤',
        description: '混合型示範棋盤，讓玩家可以一路踩到挑戰、機會、命運與問題關卡。',
        play_style: 'demo_board_fortune',
        cover_image: imageAt(2),
        finish_tile: 12,
        dice_min: 1,
        dice_max: 3,
        reward_points: 140,
        rules_json: {
          demo_autopass: true,
          tutorial_mode: true,
          rpg_dialog: true,
          tutorial_roll_sequence: [2, 1, 2, 3, 1, 2, 1]
        }
      },
      tiles: (taskIds) => ([
        { tile_index: 1, tile_name: '起點｜集合', tile_type: 'story', event_title: '旅程開始', event_body: '主持人・史蛋宣布棋盤啟動。', guide_content: '起點故事格。', tile_meta: { label: '起點', npc: '主持人・史蛋' } },
        { tile_index: 2, tile_name: '挑戰｜起航留影', tile_type: 'challenge', task_id: taskIds[0], event_title: '留影挑戰', guide_content: '拍照挑戰格', tile_meta: { label: '挑戰關卡', npc: '棋盤主持人・史蛋', icon: '📸' } },
        { tile_index: 3, tile_name: '機會｜海風補給', tile_type: 'chance', effect_type: 'gain_points', effect_value: 8, event_title: '機會關卡', event_body: '海風替你送來補給。', guide_content: '機會關卡示範。', tile_meta: { label: '機會關卡', card_type: 'chance', npc: '潮聲', sfx: 'slot-machine' } },
        { tile_index: 4, tile_name: '問題｜路線判斷', tile_type: 'quiz', task_id: taskIds[1], event_title: '問題關卡', guide_content: '選擇題關卡', tile_meta: { label: '問題關卡', npc: '出題員・潮聲', icon: '❓' } },
        { tile_index: 5, tile_name: '命運｜潮汐轉盤', tile_type: 'fortune', effect_type: 'move_forward', effect_value: 1, event_title: '命運關卡', event_body: '命運轉盤決定你是否再往前一步。', guide_content: '命運關卡示範。', tile_meta: { label: '命運關卡', card_type: 'fortune', npc: '潮汐裁判・鯨語', sfx: 'fortune-wheel' } },
        { tile_index: 6, tile_name: '挑戰｜輸入口令', tile_type: 'challenge', task_id: taskIds[2], event_title: '文字挑戰', guide_content: '文字輸入型挑戰', tile_meta: { label: '挑戰關卡', npc: '海羽', icon: '⌨️' } },
        { tile_index: 7, tile_name: '事件｜海流提示', tile_type: 'event', effect_type: 'gain_points', effect_value: 5, event_title: '事件關卡', event_body: '你收到一段海流提示，獲得額外積分。', guide_content: '事件格示範。', tile_meta: { label: '事件關卡', npc: '導覽員・潮聲', icon: '🌊' } },
        { tile_index: 8, tile_name: '挑戰｜辨識眼前場景', tile_type: 'challenge', task_id: taskIds[3], event_title: '辨識挑戰', guide_content: 'AI 辨識型挑戰', tile_meta: { label: '挑戰關卡', npc: '潮汐裁判・鯨語', icon: '🔍' } },
        { tile_index: 9, tile_name: '機會｜捷徑', tile_type: 'chance', effect_type: 'move_forward', effect_value: 1, event_title: '機會關卡', event_body: '你發現一條捷徑。', guide_content: '機會格再示範。', tile_meta: { label: '機會關卡', npc: '主持人・史蛋', sfx: 'slot-machine' } },
        { tile_index: 10, tile_name: '事件｜潮水回退', tile_type: 'event', effect_type: 'move_backward', effect_value: 1, event_title: '事件關卡', event_body: '潮水讓你稍微退後，但 Demo 仍會幫你推進。', guide_content: '負效果事件格示範。', tile_meta: { label: '事件關卡', npc: '海羽', icon: '↩' } },
        { tile_index: 11, tile_name: '問題｜終點前提問', tile_type: 'quiz', task_id: taskIds[1], event_title: '問題關卡', guide_content: '終點前的最後提問', tile_meta: { label: '問題關卡', npc: '潮聲', icon: '❓' } },
        { tile_index: 12, tile_name: '終點｜命運靠岸', tile_type: 'story', event_title: '終點', event_body: '你已完成命運棋盤。', guide_content: '終點故事格。', tile_meta: { label: '終點', npc: '主持人・史蛋' } }
      ])
    }, 3));

    seeded.push(await seedBoardCampaign(conn, itemIds, {
      title: '沙丘 Demo｜燈塔競速棋盤',
      description: '節奏更快的棋盤版本，包含挑戰、命運、事件與終點衝刺。',
      short_description: '大富翁 Demo：快速競速版，體驗更快節奏的棋盤推進。',
      chain_points: 100,
      badge_name: '競速棋盤徽章',
      badge_image: imageAt(3),
      cover_image: imageAt(3),
      entry_button_text: '進入競速棋盤',
      entry_scene_label: '燈塔競速',
      play_style: 'demo_board_sprint',
      boardKey: 'sprint',
      map: {
        name: '燈塔競速棋盤',
        description: '更短更快的示範棋盤，適合快速驗證流程與事件節奏。',
        play_style: 'demo_board_sprint',
        cover_image: imageAt(3),
        finish_tile: 10,
        dice_min: 1,
        dice_max: 3,
        reward_points: 110,
        rules_json: {
          demo_autopass: true,
          tutorial_mode: true,
          rpg_dialog: true,
          tutorial_roll_sequence: [1, 3, 2, 2, 1, 3]
        }
      },
      tiles: (taskIds) => ([
        { tile_index: 1, tile_name: '起點｜燈塔集合', tile_type: 'story', event_title: '起點', event_body: '巴布宣布競速開始。', guide_content: '起點故事格。', tile_meta: { label: '起點', npc: '主持人・巴布' } },
        { tile_index: 2, tile_name: '挑戰｜第一張觀測照', tile_type: 'challenge', task_id: taskIds[0], event_title: '拍照挑戰', guide_content: '照片挑戰格', tile_meta: { label: '挑戰關卡', npc: '主持人・巴布', icon: '📸' } },
        { tile_index: 3, tile_name: '命運｜順風', tile_type: 'fortune', effect_type: 'move_forward', effect_value: 1, event_title: '命運關卡', event_body: '一陣順風把你往前推。', guide_content: '命運關卡。', tile_meta: { label: '命運關卡', npc: '鯨語', sfx: 'fortune-wheel' } },
        { tile_index: 4, tile_name: '問題｜快速作答', tile_type: 'quiz', task_id: taskIds[1], event_title: '問題關卡', guide_content: '數字型快答', tile_meta: { label: '問題關卡', npc: '潮聲', icon: '🔢' } },
        { tile_index: 5, tile_name: '事件｜補給', tile_type: 'event', effect_type: 'gain_points', effect_value: 6, event_title: '事件關卡', event_body: '獲得一組補給積分。', guide_content: '補給事件格。', tile_meta: { label: '事件關卡', npc: '海羽', icon: '🎒' } },
        { tile_index: 6, tile_name: '挑戰｜條件檢查', tile_type: 'challenge', task_id: taskIds[2], event_title: '條件挑戰', guide_content: 'AI 規則檢查', tile_meta: { label: '挑戰關卡', npc: '鯨語', icon: '🧪' } },
        { tile_index: 7, tile_name: '機會｜再前進', tile_type: 'chance', effect_type: 'move_forward', effect_value: 1, event_title: '機會關卡', event_body: '你找到一條捷徑。', guide_content: '機會格。', tile_meta: { label: '機會關卡', npc: '史蛋', sfx: 'slot-machine' } },
        { tile_index: 8, tile_name: '事件｜短暫停靠', tile_type: 'event', effect_type: 'gain_points', effect_value: 4, event_title: '事件關卡', event_body: '在停靠點休整後獲得少量積分。', guide_content: '中繼事件格。', tile_meta: { label: '事件關卡', npc: '潮聲', icon: '⛵' } },
        { tile_index: 9, tile_name: '問題｜終點前確認', tile_type: 'quiz', task_id: taskIds[1], event_title: '問題關卡', guide_content: '終點前最後確認', tile_meta: { label: '問題關卡', npc: '潮聲', icon: '❓' } },
        { tile_index: 10, tile_name: '終點｜燈塔衝線', tile_type: 'story', event_title: '終點', event_body: '你完成競速棋盤，成功衝線。', guide_content: '終點故事格。', tile_meta: { label: '終點', npc: '巴布' } }
      ])
    }, 4));

    console.log('\nDemo 世界已建立完成：');
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
