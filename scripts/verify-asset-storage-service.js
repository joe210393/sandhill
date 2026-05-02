const assert = require('assert/strict');
const {
  SHOP_SHARED_ASSET_LIMIT_BYTES,
  buildBytesLabel,
  createAssetStorageService
} = require('../src/services/asset-storage');
const { assertActorHasShopScope } = require('../src/services/shop-scope');

function createConn(statsByTable) {
  return {
    async execute(sql, params = []) {
      if (sql.includes('FROM ar_models')) return [[statsByTable.ar_models || { asset_count: 0, total_bytes: 0 }]];
      if (sql.includes('FROM items')) return [[statsByTable.items || { asset_count: 0, total_bytes: 0 }]];
      if (sql.includes('FROM bgm_library')) return [[statsByTable.bgm_library || { asset_count: 0, total_bytes: 0 }]];
      if (sql.includes('FROM video_library')) return [[statsByTable.video_library || { asset_count: 0, total_bytes: 0 }]];
      throw new Error(`Unexpected query: ${sql} ${JSON.stringify(params)}`);
    }
  };
}

async function main() {
  assert.equal(SHOP_SHARED_ASSET_LIMIT_BYTES, 500 * 1024 * 1024);
  assert.equal(buildBytesLabel(0), '0 B');
  assert.equal(buildBytesLabel(1024), '1.00 KB');
  assert.equal(buildBytesLabel(1024 * 1024), '1.00 MB');
  assert.equal(buildBytesLabel(1536), '1.50 KB');

  const service = createAssetStorageService({ assertActorHasShopScope });
  const conn = createConn({
    ar_models: { asset_count: 2, total_bytes: 100 },
    items: { asset_count: 3, total_bytes: 200 },
    bgm_library: { asset_count: 1, total_bytes: 300 },
    video_library: { asset_count: 4, total_bytes: 400 }
  });

  const summary = await service.getSharedAssetStorageSummary(conn, { shopId: 9 });
  assert.deepEqual(summary, {
    total_files: 10,
    total_bytes: 1000,
    model_count: 2,
    item_count: 3,
    bgm_count: 1,
    video_count: 4
  });

  const adminResult = await service.assertSharedAssetStorageAvailable(
    conn,
    { role: 'admin' },
    SHOP_SHARED_ASSET_LIMIT_BYTES * 10,
    '模型素材'
  );
  assert.deepEqual(adminResult, {
    total_bytes: 0,
    remaining_bytes: null,
    limit_bytes: null,
    unlimited: true
  });

  const shopResult = await service.assertSharedAssetStorageAvailable(
    conn,
    { role: 'shop', shop_id: 9 },
    1000,
    '模型素材'
  );
  assert.equal(shopResult.total_bytes, 1000);
  assert.equal(shopResult.limit_bytes, SHOP_SHARED_ASSET_LIMIT_BYTES);
  assert.equal(shopResult.unlimited, false);

  const almostFullConn = createConn({
    ar_models: { asset_count: 1, total_bytes: SHOP_SHARED_ASSET_LIMIT_BYTES - 10 },
    items: { asset_count: 0, total_bytes: 0 },
    bgm_library: { asset_count: 0, total_bytes: 0 },
    video_library: { asset_count: 0, total_bytes: 0 }
  });
  await assert.rejects(
    () => service.assertSharedAssetStorageAvailable(almostFullConn, { role: 'shop', shop_id: 9 }, 11, '影片素材'),
    (err) => err.code === 'ASSET_STORAGE_LIMIT_EXCEEDED' && err.statusCode === 400
  );

  console.log('Asset storage service verification passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
