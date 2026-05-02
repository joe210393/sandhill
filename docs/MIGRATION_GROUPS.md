# Startup Migration Groups

最後更新：2026-05-01

`npm start` 會透過 `scripts/migrations/run-startup-migrations.js` 依序執行 `scripts/migrations/startup-manifest.js` 裡的分組。調整 migration 前，必須同步更新 manifest、`scripts/verify-phase4-database.js`、`docs/DATABASE_SCHEMA_MEMO.md` 與本檔。

## Bootstrap Baseline

- `init-db.js`

建立最早期的基礎表與預設 admin。後續要收斂 baseline 前，必須先比對 production schema。

## Historical Core Patches

- `fix-db-schema.js`
- `migrate-ar-image.js`
- `migrate-task-system.js`
- `migrate-task-type.js`
- `migrate-user-roles.js`
- `migrate-quest-chain-owner.js`
- `migrate-item-system.js`
- `migrate-points-table.js`
- `fix-product-schema.js`
- `migrate-quest-final-step.js`
- `add-ai-task-support.js`

補齊早期任務、角色、道具、點數、商品、劇情結局與 AI 任務欄位。這組是歷史補丁層，仍要保留順序，避免舊資料庫升級時缺欄位。

## Sandhill Product Model

- `migrate-sandhill-blueprint.js`
- `migrate-quest-chain-experience-mode.js`
- `migrate-coupon-entry-access.js`
- `slim-sandhill-legacy-columns.js`

處理 Sandhill 玩法入口、劇情/棋盤模式、教學/demo/formal experience mode、coupon 入口授權與安全瘦身。

## Platform And Commercial Layer

- `migrate-shop-platform.js`

處理商家、多租戶歸屬、方案、帳務、LM 用量、商家外鍵與索引。這組依賴前面 content/reward/board 表已存在。

## Operational Current Patch

- `migrate-operational-schema.js`

集中原本 runtime 補表補欄位：AR/BGM/video/coupon/NPC/push 與素材容量欄位。必須維持最後執行。
