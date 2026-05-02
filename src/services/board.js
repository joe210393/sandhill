function createBoardService({
  parseJsonField,
  actorCanAccessShop
}) {
  function sanitizeBoardSessionRow(row) {
    if (!row) return row;
    return {
      ...row,
      current_tile: Number(row.current_tile || 1),
      round_count: Number(row.round_count || 0),
      pending_roll: row.pending_roll == null ? null : Number(row.pending_roll),
      pending_target_tile: row.pending_target_tile == null ? null : Number(row.pending_target_tile),
      gained_points: Number(row.gained_points || 0),
      session_state: parseJsonField(row.session_state, null),
      last_result: parseJsonField(row.last_result, null)
    };
  }

  function sanitizeBoardMapRow(row) {
    if (!row) return row;
    return {
      ...row,
      tile_count: Number(row.tile_count || 0),
      challenge_tile_count: Number(row.challenge_tile_count || 0),
      event_tile_count: Number(row.event_tile_count || 0),
      is_active: Boolean(row.is_active),
      exact_finish_required: Boolean(row.exact_finish_required),
      rules_json: parseJsonField(row.rules_json, null)
    };
  }

  function sanitizeBoardTileRow(row) {
    if (!row) return row;
    return {
      ...row,
      is_active: Boolean(row.is_active),
      tile_meta: parseJsonField(row.tile_meta, null)
    };
  }

  async function getBoardMapByIdForScope(conn, boardMapId) {
    const [rows] = await conn.execute('SELECT * FROM board_maps WHERE id = ? LIMIT 1', [boardMapId]);
    return rows[0] ? sanitizeBoardMapRow(rows[0]) : null;
  }

  async function assertBoardMapAccess(conn, actor, boardMapId, { allowAdmin = true } = {}) {
    const boardMap = await getBoardMapByIdForScope(conn, boardMapId);
    if (!boardMap) {
      const err = new Error('找不到此棋盤');
      err.statusCode = 404;
      throw err;
    }
    if (allowAdmin && actor?.role === 'admin') return boardMap;
    if (!actorCanAccessShop(actor, boardMap.shop_id)) {
      const err = new Error('無權限存取此棋盤');
      err.statusCode = 403;
      throw err;
    }
    return boardMap;
  }

  async function getBoardTileByIdForScope(conn, boardTileId) {
    const [rows] = await conn.execute(
      `SELECT bt.*, bm.shop_id
       FROM board_tiles bt
       INNER JOIN board_maps bm ON bm.id = bt.board_map_id
       WHERE bt.id = ?
       LIMIT 1`,
      [boardTileId]
    );
    return rows[0] ? sanitizeBoardTileRow(rows[0]) : null;
  }

  async function assertBoardTileAccess(conn, actor, boardTileId, { allowAdmin = true } = {}) {
    const boardTile = await getBoardTileByIdForScope(conn, boardTileId);
    if (!boardTile) {
      const err = new Error('找不到此格子');
      err.statusCode = 404;
      throw err;
    }
    if (allowAdmin && actor?.role === 'admin') return boardTile;
    if (!actorCanAccessShop(actor, boardTile.shop_id)) {
      const err = new Error('無權限存取此格子');
      err.statusCode = 403;
      throw err;
    }
    return boardTile;
  }

  return {
    sanitizeBoardSessionRow,
    sanitizeBoardMapRow,
    sanitizeBoardTileRow,
    getBoardMapByIdForScope,
    assertBoardMapAccess,
    getBoardTileByIdForScope,
    assertBoardTileAccess
  };
}

module.exports = {
  createBoardService
};
