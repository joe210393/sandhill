const SHOP_SHARED_ASSET_LIMIT_BYTES = 500 * 1024 * 1024;

function buildBytesLabel(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function createAssetStorageService({ assertActorHasShopScope }) {
  async function getSharedAssetStorageSummary(conn, { shopId = null } = {}) {
    const scopeSql = shopId == null ? '' : ' WHERE shop_id = ?';
    const scopeParams = shopId == null ? [] : [shopId];
    const [[modelStats]] = await conn.execute(
      `SELECT COUNT(*) AS asset_count, COALESCE(SUM(file_size), 0) AS total_bytes
         FROM ar_models${scopeSql}`,
      scopeParams
    );
    const [[itemStats]] = await conn.execute(
      `SELECT COUNT(*) AS asset_count, COALESCE(SUM(file_size), 0) AS total_bytes
         FROM items${scopeSql}`,
      scopeParams
    );
    const [[bgmStats]] = await conn.execute(
      `SELECT COUNT(*) AS asset_count, COALESCE(SUM(file_size), 0) AS total_bytes
         FROM bgm_library${scopeSql}`,
      scopeParams
    );
    const [[videoStats]] = await conn.execute(
      `SELECT COUNT(*) AS asset_count, COALESCE(SUM(file_size), 0) AS total_bytes
         FROM video_library${scopeSql}`,
      scopeParams
    );

    const modelCount = Number(modelStats?.asset_count || 0);
    const itemCount = Number(itemStats?.asset_count || 0);
    const bgmCount = Number(bgmStats?.asset_count || 0);
    const videoCount = Number(videoStats?.asset_count || 0);
    const totalBytes =
      Number(modelStats?.total_bytes || 0) +
      Number(itemStats?.total_bytes || 0) +
      Number(bgmStats?.total_bytes || 0) +
      Number(videoStats?.total_bytes || 0);

    return {
      total_files: modelCount + itemCount + bgmCount + videoCount,
      total_bytes: totalBytes,
      model_count: modelCount,
      item_count: itemCount,
      bgm_count: bgmCount,
      video_count: videoCount
    };
  }

  async function getSharedAssetStorageBreakdown(conn) {
    const [rows] = await conn.execute(`
      SELECT scoped.shop_id,
             COALESCE(s.name, 'admin 公益共用') AS shop_name,
             SUM(scoped.asset_count) AS total_files,
             SUM(scoped.total_bytes) AS total_bytes,
             SUM(scoped.model_count) AS model_count,
             SUM(scoped.item_count) AS item_count,
             SUM(scoped.bgm_count) AS bgm_count,
             SUM(scoped.video_count) AS video_count
        FROM (
          SELECT shop_id,
                 COUNT(*) AS asset_count,
                 COALESCE(SUM(file_size), 0) AS total_bytes,
                 COUNT(*) AS model_count,
                 0 AS item_count,
                 0 AS bgm_count,
                 0 AS video_count
            FROM ar_models
           GROUP BY shop_id
          UNION ALL
          SELECT shop_id,
                 COUNT(*) AS asset_count,
                 COALESCE(SUM(file_size), 0) AS total_bytes,
                 0 AS model_count,
                 COUNT(*) AS item_count,
                 0 AS bgm_count,
                 0 AS video_count
            FROM items
           GROUP BY shop_id
          UNION ALL
          SELECT shop_id,
                 COUNT(*) AS asset_count,
                 COALESCE(SUM(file_size), 0) AS total_bytes,
                 0 AS model_count,
                 0 AS item_count,
                 COUNT(*) AS bgm_count,
                 0 AS video_count
            FROM bgm_library
           GROUP BY shop_id
          UNION ALL
          SELECT shop_id,
                 COUNT(*) AS asset_count,
                 COALESCE(SUM(file_size), 0) AS total_bytes,
                 0 AS model_count,
                 0 AS item_count,
                 0 AS bgm_count,
                 COUNT(*) AS video_count
            FROM video_library
           GROUP BY shop_id
        ) scoped
        LEFT JOIN shops s ON s.id = scoped.shop_id
       GROUP BY scoped.shop_id, s.name
       ORDER BY total_bytes DESC, total_files DESC
    `);

    return rows.map((row) => ({
      shop_id: row.shop_id == null ? null : Number(row.shop_id),
      shop_name: row.shop_name || (row.shop_id == null ? 'admin 公益共用' : `商店 #${row.shop_id}`),
      total_files: Number(row.total_files || 0),
      total_bytes: Number(row.total_bytes || 0),
      model_count: Number(row.model_count || 0),
      item_count: Number(row.item_count || 0),
      bgm_count: Number(row.bgm_count || 0),
      video_count: Number(row.video_count || 0)
    }));
  }

  async function assertSharedAssetStorageAvailable(conn, actor, incomingBytes, scopeLabel = '素材') {
    if (actor?.role === 'admin') {
      return {
        total_bytes: 0,
        remaining_bytes: null,
        limit_bytes: null,
        unlimited: true
      };
    }
    const shopId = assertActorHasShopScope(actor);
    const summary = await getSharedAssetStorageSummary(conn, { shopId });
    const limitBytes = SHOP_SHARED_ASSET_LIMIT_BYTES;
    const nextBytes = Number(summary.total_bytes || 0) + Number(incomingBytes || 0);
    if (nextBytes > limitBytes) {
      const err = new Error(
        `${scopeLabel}上傳後會超出商店素材庫 500MB 上限，目前已使用 ${buildBytesLabel(summary.total_bytes)}，本次檔案 ${buildBytesLabel(incomingBytes)}。`
      );
      err.statusCode = 400;
      err.code = 'ASSET_STORAGE_LIMIT_EXCEEDED';
      throw err;
    }
    return {
      ...summary,
      remaining_bytes: Math.max(limitBytes - nextBytes, 0),
      limit_bytes: limitBytes,
      unlimited: false
    };
  }

  return {
    getSharedAssetStorageSummary,
    getSharedAssetStorageBreakdown,
    assertSharedAssetStorageAvailable
  };
}

module.exports = {
  SHOP_SHARED_ASSET_LIMIT_BYTES,
  buildBytesLabel,
  createAssetStorageService
};
