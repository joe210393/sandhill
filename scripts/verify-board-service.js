const assert = require('assert');
const { createBoardService } = require('../src/services/board');

function parseJsonField(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

async function main() {
  const queries = [];
  const conn = {
    async execute(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('FROM board_maps')) {
        return [[{
          id: 7,
          shop_id: 3,
          tile_count: '5',
          challenge_tile_count: null,
          event_tile_count: '2',
          is_active: 1,
          exact_finish_required: 0,
          rules_json: '{"tutorial_roll_sequence":[1,2]}'
        }]];
      }
      if (sql.includes('FROM board_tiles')) {
        return [[{
          id: 11,
          board_map_id: 7,
          shop_id: 3,
          is_active: 1,
          tile_meta: '{"kind":"story"}'
        }]];
      }
      return [[]];
    }
  };
  const service = createBoardService({
    parseJsonField,
    actorCanAccessShop: (actor, shopId) => actor?.shop_id === shopId
  });

  const map = await service.assertBoardMapAccess(conn, { role: 'shop', shop_id: 3 }, 7);
  assert.strictEqual(map.tile_count, 5);
  assert.strictEqual(map.challenge_tile_count, 0);
  assert.deepStrictEqual(map.rules_json, { tutorial_roll_sequence: [1, 2] });

  const tile = await service.assertBoardTileAccess(conn, { role: 'shop', shop_id: 3 }, 11);
  assert.deepStrictEqual(tile.tile_meta, { kind: 'story' });

  await assert.rejects(
    () => service.assertBoardMapAccess(conn, { role: 'shop', shop_id: 9 }, 7),
    /無權限存取此棋盤/
  );

  const session = service.sanitizeBoardSessionRow({
    current_tile: '2',
    round_count: '4',
    pending_roll: null,
    pending_target_tile: '8',
    gained_points: '12',
    session_state: '{"ok":true}',
    last_result: ''
  });
  assert.strictEqual(session.current_tile, 2);
  assert.strictEqual(session.pending_roll, null);
  assert.strictEqual(session.pending_target_tile, 8);
  assert.deepStrictEqual(session.session_state, { ok: true });
  assert.strictEqual(session.last_result, null);
  assert.ok(queries.length >= 3);

  console.log('Board service verification passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
