const mysql = require('mysql2/promise');
const { getDbConfig } = require('../../db-config');

function normalizeBoolean(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(v);
  }
  return false;
}

function parseJsonField(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return fallback;
    }
  }
  return fallback;
}

function deriveExperienceMode(row) {
  const explicit = typeof row.experience_mode === 'string' ? row.experience_mode.trim().toLowerCase() : '';
  if (['formal', 'tutorial', 'demo'].includes(explicit)) {
    return explicit;
  }

  const gameRules = parseJsonField(row.game_rules, {}) || {};
  const blueprint = parseJsonField(row.content_blueprint, {}) || {};
  const playStyle = typeof row.play_style === 'string' ? row.play_style.trim().toLowerCase() : '';

  if (
    normalizeBoolean(gameRules.demo_autopass) ||
    normalizeBoolean(gameRules.demoAutoPass) ||
    normalizeBoolean(blueprint.demo_autopass) ||
    normalizeBoolean(blueprint.demoAutoPass) ||
    playStyle === 'demo_story'
  ) {
    return 'demo';
  }

  if (
    normalizeBoolean(gameRules.tutorial_mode) ||
    normalizeBoolean(gameRules.tutorialMode) ||
    normalizeBoolean(blueprint.tutorial_mode) ||
    normalizeBoolean(blueprint.tutorialMode) ||
    playStyle === 'tutorial_story' ||
    playStyle === 'tutorial_board'
  ) {
    return 'tutorial';
  }

  return 'formal';
}

async function migrate() {
  const conn = await mysql.createConnection(getDbConfig());
  try {
    console.log('🔄 回填 quest_chains.experience_mode ...');
    const [rows] = await conn.query('SELECT id, experience_mode, play_style, game_rules, content_blueprint FROM quest_chains');
    for (const row of rows) {
      const mode = deriveExperienceMode(row);
      await conn.execute('UPDATE quest_chains SET experience_mode = ? WHERE id = ?', [mode, row.id]);
    }
    console.log(`✅ 已回填 ${rows.length} 筆 quest_chains.experience_mode`);
  } catch (err) {
    console.error('❌ 回填 experience_mode 失敗:', err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

migrate();
