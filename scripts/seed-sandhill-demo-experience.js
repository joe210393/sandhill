const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || '150.109.72.98',
  port: Number(process.env.MYSQL_PORT || 31591),
  user: process.env.MYSQL_USERNAME || 'root',
  password: process.env.MYSQL_PASSWORD || '4q7aRwS2d5G0czEL6bAPCmT8I9Zvp3H1',
  database: process.env.MYSQL_DATABASE || 'zeabur'
};

const QUEST_TITLE = '沙丘體驗版｜工作室快速通關';

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    await conn.beginTransaction();

    const [existingChains] = await conn.execute(
      'SELECT id FROM quest_chains WHERE title = ? OR name = ? ORDER BY id DESC LIMIT 1',
      [QUEST_TITLE, QUEST_TITLE]
    );

    let questChainId = existingChains[0]?.id || null;
    if (!questChainId) {
      const [insertQuest] = await conn.execute(
        `INSERT INTO quest_chains
          (name, title, description, short_description, mode_type, is_active, entry_order, entry_button_text,
           entry_scene_label, play_style, cover_image, created_by, game_rules, content_blueprint)
         VALUES (?, ?, ?, ?, 'story_campaign', TRUE, 0, ?, ?, ?, ?, ?, ?, ?)`,
        [
          QUEST_TITLE,
          QUEST_TITLE,
          '這是一條給手機現場快速體驗的沙丘主線。玩家在工作室也能一路從開場走到完結，先感受 RPG 對話、拍照、判定與通關節奏。',
          '工作室快速體驗線｜任意拍攝、任意選擇都會先通關，先讓你把完整流程走完。',
          '立即體驗',
          '工作室體驗線',
          'demo_story',
          '/images/banner.png',
          'codex',
          JSON.stringify({
            demo_autopass: true,
            rpg_dialog: true,
            mobile_single_hand: true
          }),
          JSON.stringify({
            demo_autopass: true,
            rpg_dialog: true
          })
        ]
      );
      questChainId = insertQuest.insertId;
    } else {
      await conn.execute(
        `UPDATE quest_chains
         SET name = ?, title = ?, description = ?, short_description = ?, mode_type = 'story_campaign',
             is_active = TRUE, entry_order = 0, entry_button_text = ?, entry_scene_label = ?, play_style = ?,
             cover_image = ?, game_rules = ?, content_blueprint = ?
         WHERE id = ?`,
        [
          QUEST_TITLE,
          QUEST_TITLE,
          '這是一條給手機現場快速體驗的沙丘主線。玩家在工作室也能一路從開場走到完結，先感受 RPG 對話、拍照、判定與通關節奏。',
          '工作室快速體驗線｜任意拍攝、任意選擇都會先通關，先讓你把完整流程走完。',
          '立即體驗',
          '工作室體驗線',
          'demo_story',
          '/images/banner.png',
          JSON.stringify({
            demo_autopass: true,
            rpg_dialog: true,
            mobile_single_hand: true
          }),
          JSON.stringify({
            demo_autopass: true,
            rpg_dialog: true
          }),
          questChainId
        ]
      );

      await conn.execute('DELETE FROM tasks WHERE quest_chain_id = ?', [questChainId]);
      await conn.execute('DELETE FROM user_quests WHERE quest_chain_id = ?', [questChainId]);
    }

    const tasks = [
      {
        name: '第 1 關｜啟動探索艙',
        description: '按下開始後，沙丘會先替你完成啟動儀式。這一關的重點不是正確定位，而是感受 RPG 式開場與主線節奏。',
        task_type: 'location',
        points: 10,
        cover_image_url: '/images/feature-map.png',
        photoUrl: '/images/feature-map.png',
        stage_template: 'story_intro',
        stage_intro: '引路人・砂舟已在艙門前等你。先啟動探索艙，讓整場冒險正式開始。',
        hint_text: '工作室體驗模式：直接開始就能前進。',
        story_context: '你剛踏入沙丘，海底艙門在眼前亮起。',
        guide_content: '這一關是讓玩家感受「進入遊戲」的節奏，先由 NPC 帶入氛圍。',
        rescue_content: '如果現場沒有定位，也會由體驗模式直接放行。',
        location_required: 0,
        lat: 24.6782946,
        lng: 121.7602662,
        radius: 30,
        validation_mode: 'manual',
        submission_type: 'answer',
        options: null,
        correct_answer: null,
        ai_config: null,
        pass_criteria: null
      },
      {
        name: '第 2 關｜拍下冒險起點',
        description: '請任意拍下一張你眼前的畫面。這一關在工作室體驗模式下會先直接通關，但你依然能看到 AI 裁判與劇情框如何演出。',
        task_type: 'photo',
        points: 15,
        cover_image_url: '/images/feature-community.png',
        photoUrl: '/images/feature-community.png',
        stage_template: 'photo_memory',
        stage_intro: '潮汐關主・巴布要你留下第一張冒險紀錄。把眼前任何畫面拍下來，讓鯨語裁判替你蓋章。',
        hint_text: '任意拍一張就好，體驗模式會先放行。',
        story_context: '第一張照片會成為你進入沙丘的起點印記。',
        guide_content: '這一關的目的，是讓玩家感受「拍照 -> AI 判定 -> 劇情推進」的節奏。',
        rescue_content: '就算畫面不是正式挑戰內容，體驗模式也會讓你前進。',
        location_required: 0,
        lat: 24.6782946,
        lng: 121.7602662,
        radius: 30,
        validation_mode: 'ai_score',
        submission_type: 'image',
        options: null,
        correct_answer: null,
        ai_config: JSON.stringify({
          score_subject: 'demo_memory',
          system_prompt: '你是沙丘體驗線的裁判。',
          user_prompt: '請查看玩家上傳的畫面。'
        }),
        pass_criteria: JSON.stringify({
          min_score: 1
        })
      },
      {
        name: '第 3 關｜選擇前進航線',
        description: '現在由導覽員・潮聲帶你做一個簡單選擇。工作室體驗模式下，任選一個選項都會通關，重點是感受 NPC 對話與流程推進。',
        task_type: 'multiple_choice',
        points: 15,
        cover_image_url: '/images/feature-culture.png',
        photoUrl: '/images/feature-culture.png',
        stage_template: 'choice_gate',
        stage_intro: '潮聲把三條航線鋪在你面前。你只要做出選擇，沙丘就會替你記錄這段旅程的節奏。',
        hint_text: '任選一條航線即可。',
        story_context: '真正的重點不是選對，而是讓玩家看見劇情如何繼續往下流動。',
        guide_content: '這關是用來展示選擇題、NPC 劇情框與通關回饋。',
        rescue_content: '體驗模式下，任何選擇都會被沙丘視為有效的前進決定。',
        location_required: 0,
        lat: 24.6782946,
        lng: 121.7602662,
        radius: 30,
        validation_mode: 'manual',
        submission_type: 'answer',
        options: JSON.stringify(['沿著潮光前進', '走向風的方向', '先記下這一刻']),
        correct_answer: '沿著潮光前進',
        ai_config: null,
        pass_criteria: null
      },
      {
        name: '第 4 關｜留下通關合照',
        description: '最後再任意拍一張照片，沙丘會把它當成你的通關紀念。完成後，你就能在手機上完整感受從開場到結尾的整條流程。',
        task_type: 'photo',
        points: 20,
        cover_image_url: '/images/feature-reward.png',
        photoUrl: '/images/feature-reward.png',
        stage_template: 'finale_photo',
        stage_intro: '終點就在眼前。拍下最後一張照片，讓主持人・史蛋為你的第一輪體驗蓋上結語。',
        hint_text: '任意拍一張，感受通關結尾即可。',
        story_context: '這一張照片是旅程的收束，也是玩家第一次完整走完沙丘流程的證明。',
        guide_content: '最終關保留拍照與裁判節奏，讓玩家感受完整收尾。',
        rescue_content: '體驗模式下，任何畫面都會先算作通關紀念。',
        location_required: 0,
        lat: 24.6782946,
        lng: 121.7602662,
        radius: 30,
        validation_mode: 'ai_score',
        submission_type: 'image',
        options: null,
        correct_answer: null,
        ai_config: JSON.stringify({
          score_subject: 'demo_finale',
          system_prompt: '你是沙丘體驗線的終點裁判。',
          user_prompt: '請查看玩家最後一張旅程紀錄。'
        }),
        pass_criteria: JSON.stringify({
          min_score: 1
        })
      }
    ];

    for (let i = 0; i < tasks.length; i += 1) {
      const task = tasks[i];
      await conn.execute(
        `INSERT INTO tasks
          (name, description, photoUrl, cover_image_url, points, task_type, options, correct_answer,
           quest_chain_id, quest_order, created_by, is_final_step, submission_type, validation_mode,
           ai_config, pass_criteria, failure_message, success_message, max_attempts, location_required,
           stage_template, stage_intro, hint_text, story_context, guide_content, rescue_content, is_active,
           lat, lng, radius)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'codex', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?)`,
        [
          task.name,
          task.description,
          task.photoUrl,
          task.cover_image_url,
          task.points,
          task.task_type,
          task.options,
          task.correct_answer,
          questChainId,
          i + 1,
          i === tasks.length - 1 ? 1 : 0,
          task.submission_type,
          task.validation_mode,
          task.ai_config,
          task.pass_criteria,
          '體驗模式會先放行，讓你直接往下走。',
          '體驗模式通關，下一段旅程已開啟。',
          9,
          task.location_required,
          task.stage_template,
          task.stage_intro,
          task.hint_text,
          task.story_context,
          task.guide_content,
          task.rescue_content,
          task.lat,
          task.lng,
          task.radius
        ]
      );
    }

    await conn.commit();
    console.log(JSON.stringify({ success: true, questChainId, title: QUEST_TITLE, taskCount: tasks.length }, null, 2));
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
