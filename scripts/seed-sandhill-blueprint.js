const mysql = require('mysql2/promise');
const { getDbConfig } = require('../db-config');

const dbConfig = getDbConfig();

const BASE_LAT = 24.6782946;
const BASE_LNG = 121.7602662;

async function upsertQuestChain(conn, payload) {
  const [questChainColumns] = await conn.query('SHOW COLUMNS FROM quest_chains');
  const hasTitle = questChainColumns.some(column => column.Field === 'title');
  const hasName = questChainColumns.some(column => column.Field === 'name');
  const titleColumn = hasTitle ? 'title' : 'name';
  const [existing] = await conn.execute(`SELECT id FROM quest_chains WHERE ${titleColumn} = ? LIMIT 1`, [payload.title]);
  const record = {
    [titleColumn]: payload.title,
    ...(hasName && titleColumn !== 'name' ? { name: payload.title } : {}),
    description: payload.description,
    chain_points: payload.chain_points,
    badge_name: payload.badge_name,
    badge_image: payload.badge_image,
    created_by: payload.created_by,
    mode_type: payload.mode_type,
    is_active: payload.is_active,
    cover_image: payload.cover_image,
    short_description: payload.short_description,
    entry_order: payload.entry_order,
    entry_button_text: payload.entry_button_text,
    entry_scene_label: payload.entry_scene_label,
    play_style: payload.play_style,
    game_rules: JSON.stringify(payload.game_rules || {}),
    content_blueprint: JSON.stringify(payload.content_blueprint || {})
  };
  const filteredEntries = Object.entries(record).filter(([column]) => questChainColumns.some(field => field.Field === column));

  if (existing.length > 0) {
    const id = existing[0].id;
    await conn.execute(`UPDATE quest_chains SET ${filteredEntries.map(([column]) => `${column} = ?`).join(', ')} WHERE id = ?`, [
      ...filteredEntries.map(([, value]) => value),
      id
    ]);
    return id;
  }

  const columns = filteredEntries.map(([column]) => column);
  const [result] = await conn.execute(
    `INSERT INTO quest_chains (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    filteredEntries.map(([, value]) => value)
  );
  return result.insertId;
}

async function upsertTask(conn, payload) {
  const [existing] = await conn.execute('SELECT id FROM tasks WHERE name = ? LIMIT 1', [payload.name]);
  const values = [
    payload.lat, payload.lng, payload.radius, payload.description, payload.photoUrl, payload.iconUrl, payload.points,
    payload.task_type, payload.type, payload.quest_chain_id, payload.quest_order, payload.created_by,
    payload.submission_type, payload.validation_mode, JSON.stringify(payload.ai_config || {}),
    JSON.stringify(payload.pass_criteria || {}), payload.failure_message, payload.success_message, payload.max_attempts,
    payload.location_required, payload.cover_image_url, payload.stage_template, payload.stage_intro, payload.hint_text,
    payload.story_context, payload.guide_content, payload.rescue_content, JSON.stringify(payload.event_config || {}),
    payload.is_active
  ];

  if (existing.length > 0) {
    const id = existing[0].id;
    await conn.execute(
      `UPDATE tasks
       SET lat = ?, lng = ?, radius = ?, description = ?, photoUrl = ?, iconUrl = ?, points = ?, task_type = ?, type = ?, quest_chain_id = ?, quest_order = ?, created_by = ?,
           submission_type = ?, validation_mode = ?, ai_config = ?, pass_criteria = ?, failure_message = ?, success_message = ?, max_attempts = ?, location_required = ?, cover_image_url = ?, stage_template = ?, stage_intro = ?, hint_text = ?, story_context = ?, guide_content = ?, rescue_content = ?, event_config = ?, is_active = ?
       WHERE id = ?`,
      [...values, id]
    );
    return id;
  }

  const [result] = await conn.execute(
    `INSERT INTO tasks
     (name, lat, lng, radius, description, photoUrl, iconUrl, points, task_type, type, quest_chain_id, quest_order, created_by, submission_type, validation_mode, ai_config, pass_criteria, failure_message, success_message, max_attempts, location_required, cover_image_url, stage_template, stage_intro, hint_text, story_context, guide_content, rescue_content, event_config, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.name, ...values]
  );
  return result.insertId;
}

async function upsertBoardMap(conn, payload) {
  const [existing] = await conn.execute('SELECT id FROM board_maps WHERE name = ? LIMIT 1', [payload.name]);
  const values = [
    payload.quest_chain_id,
    payload.description,
    payload.play_style,
    payload.cover_image,
    payload.center_lat,
    payload.center_lng,
    payload.max_rounds,
    payload.start_tile,
    payload.finish_tile,
    payload.dice_min,
    payload.dice_max,
    payload.failure_move,
    payload.exact_finish_required,
    payload.reward_points,
    payload.is_active,
    JSON.stringify(payload.rules_json || {}),
    payload.created_by
  ];
  if (existing.length > 0) {
    const id = existing[0].id;
    await conn.execute(
      `UPDATE board_maps
       SET quest_chain_id = ?, description = ?, play_style = ?, cover_image = ?, center_lat = ?, center_lng = ?, max_rounds = ?, start_tile = ?, finish_tile = ?, dice_min = ?, dice_max = ?, failure_move = ?, exact_finish_required = ?, reward_points = ?, is_active = ?, rules_json = ?, created_by = ?
       WHERE id = ?`,
      [...values, id]
    );
    return id;
  }
  const [result] = await conn.execute(
    `INSERT INTO board_maps
     (name, quest_chain_id, description, play_style, cover_image, center_lat, center_lng, max_rounds, start_tile, finish_tile, dice_min, dice_max, failure_move, exact_finish_required, reward_points, is_active, rules_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.name, ...values]
  );
  return result.insertId;
}

async function upsertBoardTile(conn, payload) {
  const [existing] = await conn.execute(
    'SELECT id FROM board_tiles WHERE board_map_id = ? AND tile_index = ? LIMIT 1',
    [payload.board_map_id, payload.tile_index]
  );
  const values = [
    payload.tile_name,
    payload.tile_type,
    payload.latitude,
    payload.longitude,
    payload.radius_meters,
    payload.task_id,
    payload.effect_type,
    payload.effect_value,
    payload.event_title,
    payload.event_body,
    payload.guide_content,
    JSON.stringify(payload.tile_meta || {}),
    payload.is_active
  ];
  if (existing.length > 0) {
    await conn.execute(
      `UPDATE board_tiles
       SET tile_name = ?, tile_type = ?, latitude = ?, longitude = ?, radius_meters = ?, task_id = ?, effect_type = ?, effect_value = ?, event_title = ?, event_body = ?, guide_content = ?, tile_meta = ?, is_active = ?
       WHERE id = ?`,
      [...values, existing[0].id]
    );
    return existing[0].id;
  }
  const [result] = await conn.execute(
    `INSERT INTO board_tiles
     (board_map_id, tile_index, tile_name, tile_type, latitude, longitude, radius_meters, task_id, effect_type, effect_value, event_title, event_body, guide_content, tile_meta, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.board_map_id, payload.tile_index, ...values]
  );
  return result.insertId;
}

async function seed() {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    console.log('🌱 開始建立沙丘內容包...');

    const storyChainId = await upsertQuestChain(conn, {
      title: '沙丘｜海底大作戰：濱海守護線',
      description: '一條以濱海守護與現地觀察為主的劇情主線。',
      chain_points: 120,
      badge_name: '濱海守護員',
      badge_image: '/images/mascot.png',
      created_by: 'admin',
      mode_type: 'story_campaign',
      is_active: true,
      cover_image: '/images/banner.png',
      short_description: '跟著 AI 關主在濱海場域完成觀察、定位、拍攝與守護任務。',
      entry_order: 1,
      entry_button_text: '開始守護線',
      entry_scene_label: '劇情主線',
      play_style: null,
      game_rules: { session_mode: 'single_story', ui_shell: 'ai_lab' },
      content_blueprint: {
        roles: ['host', 'judge', 'guide', 'hint', 'rescue'],
        templates: ['landmark', 'identify', 'rule_check', 'score']
      }
    });

    const boardChainId = await upsertQuestChain(conn, {
      title: '沙丘｜濱海大富翁：終點競走',
      description: '以擲骰、移動、挑戰與事件格推進的濱海棋盤玩法。',
      chain_points: 200,
      badge_name: '沙丘探險家',
      badge_image: '/images/mascot.png',
      created_by: 'admin',
      mode_type: 'board_game',
      is_active: true,
      cover_image: '/images/banner.png',
      short_description: '在濱海路線上一路擲骰、闖格、完成 AI 任務，向終點前進。',
      entry_order: 2,
      entry_button_text: '進入大富翁',
      entry_scene_label: '棋盤冒險',
      play_style: 'fixed_track_race',
      game_rules: {
        dice_min: 1,
        dice_max: 6,
        success_move_mode: 'forward_by_roll',
        failure_move: -1,
        exact_finish_required: false
      },
      content_blueprint: {
        tile_templates: ['challenge', 'event', 'reward', 'penalty', 'story', 'finish'],
        ai_roles: ['host', 'judge', 'guide', 'rescue']
      }
    });

    const taskDefs = [
      {
        name: '守護線 01｜找到海與欄杆的視角',
        offset: [0, 0],
        radius: 180,
        stage_template: 'landmark_match',
        validation_mode: 'ai_reference_match',
        description: '找到能同時看見海面與欄杆的觀景位置，拍下一張與參考視角相近的畫面。',
        stage_intro: '第一關先暖身，請找到濱海視角的起點。',
        hint_text: '留意視野較開闊、能看見欄杆線條的地方。',
        story_context: '你收到第一段航海線索，必須先找到正確的觀景點。',
        guide_content: '這一關重點不是完全一樣，而是找到場域中關鍵的構圖特徵。',
        rescue_content: '如果一直找不到，可以往空曠、靠外側的視野點移動。',
        ai_config: {
          user_prompt: '請比對參考照片與玩家照片是否為相近的濱海觀景視角，重點觀察海面、欄杆與開闊構圖。',
          system_prompt: '你是景點比對裁判，請用 JSON 回傳判定結果。',
          target_label: 'coastal_view'
        },
        pass_criteria: { target_label: 'coastal_view', min_confidence: 0.55 },
        failure_message: '視角還不夠接近，試著讓海面與欄杆更明顯一點。',
        success_message: '成功找到起始視角，守護線正式展開！'
      },
      {
        name: '守護線 02｜找到現地自然元素',
        offset: [0.00015, 0.00008],
        radius: 180,
        stage_template: 'identify_target',
        validation_mode: 'ai_identify',
        description: '找到現地能代表海岸環境的自然元素，拍照給 AI 判定。',
        stage_intro: '第二關要你真正開始觀察環境。',
        hint_text: '可以留意植物、漂流木、石頭紋理或其他明顯自然元素。',
        story_context: '你必須理解這片海岸的個性，才能繼續前進。',
        guide_content: '現地觀察是這條主線的重要能力，AI 會協助你確認焦點。',
        rescue_content: '如果 AI 看不清楚，靠近主體、讓背景更乾淨會更穩定。',
        ai_config: {
          user_prompt: '請判斷照片是否清楚呈現一個可被視為海岸自然元素的主體，例如植物、漂流木、石頭地景等。',
          system_prompt: '你是現地觀察裁判，請用 JSON 回傳判定結果。',
          target_label: 'coastal_nature'
        },
        pass_criteria: { target_label: 'coastal_nature', min_confidence: 0.5 },
        failure_message: '主體還不夠明確，請再靠近一點重新拍攝。',
        success_message: '你已經掌握現地觀察的節奏了。'
      },
      {
        name: '守護線 03｜海與夥伴同框',
        offset: [0.00028, 0.0001],
        radius: 180,
        stage_template: 'rule_check',
        validation_mode: 'ai_rule_check',
        description: '拍一張同時包含海景與夥伴的照片，證明你不是獨自冒險。',
        stage_intro: '第三關是合作關，讓夥伴一起進入畫面。',
        hint_text: '至少要有人物與明顯海景元素同時出現。',
        story_context: '真正的守護任務永遠不是單打獨鬥。',
        guide_content: '這關會檢查畫面裡是否同時具備海景與人物存在。',
        rescue_content: '如果海不夠明顯，試著往更開闊的位置退後拍。',
        ai_config: {
          user_prompt: '請檢查照片中是否同時出現海景與至少一位人物，若有則通過。',
          system_prompt: '你是條件檢查裁判，請用 JSON 回傳判定結果。',
          target_label: 'sea_and_people'
        },
        pass_criteria: { target_label: 'sea_and_people', all_rules_must_pass: true, min_confidence: 0.5 },
        failure_message: '目前畫面還沒有完整拍到海景與人物同框。',
        success_message: '團隊合流成功，接下來進入挑戰高潮。'
      },
      {
        name: '守護線 04｜拍出探險感',
        offset: [0.0004, 0.00018],
        radius: 180,
        stage_template: 'photo_score',
        validation_mode: 'ai_score',
        description: '拍一張有濱海探險感的收尾照片，分數達標即可通關。',
        stage_intro: '最後一關，用一張照片替這段冒險留下結尾。',
        hint_text: '讓畫面有主體、有空間感，也保留場域氣氛。',
        story_context: '這張照片將成為你的守護線結尾紀錄。',
        guide_content: '評分會看整體完成度、主題氛圍與畫面清晰度。',
        rescue_content: '若分數不夠，先確認照片不模糊，再重新構圖。',
        ai_config: {
          user_prompt: '請以濱海探險感、構圖完整度與主題呈現度為主，為照片打 0 到 10 分。',
          system_prompt: '你是照片評審裁判，請用 JSON 回傳判定結果。',
          target_label: 'coastal_adventure_photo'
        },
        pass_criteria: { target_label: 'coastal_adventure_photo', min_score: 7.5 },
        failure_message: '氣氛還差一點，再拍一張更有探險感的畫面。',
        success_message: '恭喜完成整條守護線，海底大作戰通關！'
      }
    ];

    const storyTaskIds = [];
    for (let i = 0; i < taskDefs.length; i += 1) {
      const taskDef = taskDefs[i];
      const taskId = await upsertTask(conn, {
        name: taskDef.name,
        lat: BASE_LAT + taskDef.offset[0],
        lng: BASE_LNG + taskDef.offset[1],
        radius: taskDef.radius,
        description: taskDef.description,
        photoUrl: '/images/banner.png',
        iconUrl: '/images/flag-red.png',
        points: 20 + i * 5,
        task_type: 'photo',
        type: 'quest',
        quest_chain_id: storyChainId,
        quest_order: i + 1,
        created_by: 'admin',
        submission_type: 'image',
        validation_mode: taskDef.validation_mode,
        ai_config: taskDef.ai_config,
        pass_criteria: taskDef.pass_criteria,
        failure_message: taskDef.failure_message,
        success_message: taskDef.success_message,
        max_attempts: 5,
        location_required: true,
        cover_image_url: '/images/banner.png',
        stage_template: taskDef.stage_template,
        stage_intro: taskDef.stage_intro,
        hint_text: taskDef.hint_text,
        story_context: taskDef.story_context,
        guide_content: taskDef.guide_content,
        rescue_content: taskDef.rescue_content,
        event_config: { role_pack: ['host', 'judge', 'guide', 'hint', 'rescue'] },
        is_active: true
      });
      storyTaskIds.push(taskId);
    }

    const boardMapId = await upsertBoardMap(conn, {
      quest_chain_id: boardChainId,
      name: '沙丘濱海大富翁｜終點競走地圖',
      description: '沿著濱海路線前進，透過擲骰與任務判定一路向終點前進。',
      play_style: 'fixed_track_race',
      cover_image: '/images/banner.png',
      center_lat: BASE_LAT,
      center_lng: BASE_LNG,
      max_rounds: 12,
      start_tile: 1,
      finish_tile: 8,
      dice_min: 1,
      dice_max: 6,
      failure_move: -1,
      exact_finish_required: false,
      reward_points: 200,
      is_active: true,
      rules_json: {
        success_move_mode: 'forward_by_roll',
        failure_move: -1,
        finish_reward_badge: '沙丘探險家'
      },
      created_by: 'admin'
    });

    const boardTiles = [
      { tile_index: 1, tile_name: '起點營地', tile_type: 'story', event_title: '任務開始', event_body: '主持人宣布濱海大富翁正式開始。', guide_content: '起點是規劃與熱身的地方。'},
      { tile_index: 2, tile_name: '觀景挑戰', tile_type: 'challenge', task_id: storyTaskIds[0], latitude: BASE_LAT, longitude: BASE_LNG, radius_meters: 180 },
      { tile_index: 3, tile_name: '海風補給', tile_type: 'reward', effect_type: 'gain_points', effect_value: 15, event_title: '獲得補給', event_body: '你發現了一處補給點，獲得額外積分。'},
      { tile_index: 4, tile_name: '自然觀察', tile_type: 'challenge', task_id: storyTaskIds[1], latitude: BASE_LAT + 0.00015, longitude: BASE_LNG + 0.00008, radius_meters: 180 },
      { tile_index: 5, tile_name: '突發海流', tile_type: 'penalty', effect_type: 'move_backward', effect_value: 1, event_title: '退後一格', event_body: '海流打亂節奏，你被迫退後一步。'},
      { tile_index: 6, tile_name: '夥伴集結', tile_type: 'challenge', task_id: storyTaskIds[2], latitude: BASE_LAT + 0.00028, longitude: BASE_LNG + 0.0001, radius_meters: 180 },
      { tile_index: 7, tile_name: '最終構圖', tile_type: 'challenge', task_id: storyTaskIds[3], latitude: BASE_LAT + 0.0004, longitude: BASE_LNG + 0.00018, radius_meters: 180 },
      { tile_index: 8, tile_name: '終點燈塔', tile_type: 'finish', event_title: '終點達成', event_body: '你已經穿越整條棋盤線，完成濱海大富翁。', guide_content: '終點不是結束，而是整段場域體驗的收束。' }
    ];

    for (const tile of boardTiles) {
      await upsertBoardTile(conn, {
        board_map_id: boardMapId,
        tile_index: tile.tile_index,
        tile_name: tile.tile_name,
        tile_type: tile.tile_type,
        latitude: tile.latitude || null,
        longitude: tile.longitude || null,
        radius_meters: tile.radius_meters || null,
        task_id: tile.task_id || null,
        effect_type: tile.effect_type || null,
        effect_value: tile.effect_value || null,
        event_title: tile.event_title || null,
        event_body: tile.event_body || null,
        guide_content: tile.guide_content || null,
        tile_meta: {
          role_pack: tile.tile_type === 'challenge' ? ['host', 'judge', 'hint'] : ['host', 'guide'],
          template: tile.tile_type
        },
        is_active: true
      });
    }

    console.log('✅ 沙丘內容包已建置完成');
  } catch (err) {
    console.error('❌ 建置沙丘內容包失敗:', err);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

seed();
