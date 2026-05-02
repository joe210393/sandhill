(function (global) {
  function getBoardTileMeta(tile) {
    if (!tile) return {};
    if (tile.tile_meta && typeof tile.tile_meta === 'object') return tile.tile_meta;
    if (typeof tile.tile_meta === 'string') {
      try {
        return JSON.parse(tile.tile_meta);
      } catch (err) {
        return {};
      }
    }
    return {};
  }

  function inferBoardChallengeType(tile) {
    const explicitType = tile?.task_type || tile?.linked_task_type;
    if (explicitType) return explicitType;
    const joinedLabel = `${tile?.tile_name || ''} ${tile?.task_name || ''}`.toLowerCase();
    if (joinedLabel.includes('選擇') || joinedLabel.includes('抉擇')) return 'multiple_choice';
    if (joinedLabel.includes('口令') || joinedLabel.includes('輸入') || joinedLabel.includes('找的東西')) return 'keyword';
    if (joinedLabel.includes('密碼') || joinedLabel.includes('解鎖')) return 'number';
    if (joinedLabel.includes('拍') || joinedLabel.includes('留影') || joinedLabel.includes('觀測')) return 'photo';
    return null;
  }

  function getCircledStepLabel(index) {
    const labels = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
    return labels[Number(index)] || String(index);
  }

  global.AiLabBoardUtils = {
    getBoardTileMeta,
    inferBoardChallengeType,
    getCircledStepLabel
  };
})(window);
