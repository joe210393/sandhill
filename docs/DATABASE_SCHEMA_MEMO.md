# Sandhill Database Schema Memo

最後更新：2026-05-01

本檔是 Phase 4 的資料庫備忘錄。修改資料表、欄位、索引、外鍵或 migration 順序前，必須先確認本檔與 `docs/ARCHITECTURE_MEMO.md`。

機器可驗證的 table ownership manifest：`docs/SCHEMA_OWNERSHIP.json`。新增資料表時必須同步更新 manifest 與 `npm run test:phase4-database`。

## Migration 原則

- schema 只能透過 `scripts/migrations/*.js` 演進，不得在 route handler 或 runtime request path 裡臨時 `ALTER TABLE`。
- migration 必須可重跑：新增欄位前先 `SHOW COLUMNS`，新增索引前先 `SHOW INDEX`，新增外鍵前先查 `information_schema`。
- `npm start` 透過 `scripts/migrations/run-startup-migrations.js` 執行 `scripts/migrations/startup-manifest.js` 裡的順序；調整順序時必須同步更新本檔與 Phase 4 守門測試。
- 刪欄位或刪表只能在確認沒有 route、service、前端與資料依賴後進行。第一步先標記與隔離，不直接刪 production 資料。

## 資料表 Ownership

Identity：

- `users`：帳號、角色、商家歸屬。
- `shops`：商家資料、平台租戶邊界。

Content：

- `quest_chains`：玩法入口、劇情主線、大富翁入口、方案與鎖定資訊。
- `tasks`：關卡內容、題型、GPS 限制、AI 判定設定、素材關聯。
- `board_maps`、`board_tiles`：大富翁棋盤與格子。
- `game_npcs`：NPC 顯示設定。

Player Progress：

- `user_tasks`：玩家任務承接與完成狀態。
- `task_attempts`：AI/系統判定嘗試紀錄。
- `user_quests`：劇情進度。
- `user_badges`：玩家徽章。
- `user_game_sessions`：大富翁 session。

Rewards：

- `items`、`user_inventory`：道具與背包。
- `products`、`product_redemptions`：商品與兌換審核。
- `redemptions`：早期兌換紀錄表，保留為 legacy reward table；現役商品審核使用 `product_redemptions`。
- `point_transactions`：點數交易。
- `user_coupons`：優惠券。

Assets：

- `ar_models`：AR/3D 模型。
- `bgm_library`：背景音樂素材。
- `video_library`：影片素材。

Billing / LM：

- `entry_plans`：入口方案。
- `entry_billing_records`：建置費與入口帳務紀錄。
- `llm_usage_logs`：LM request token 明細。
- `llm_usage_monthly_summary`：月彙總。

Notifications：

- `push_subscriptions`：Web Push 訂閱。

## Migration 分層

Bootstrap：

- `scripts/migrations/init-db.js`：早期基本表與預設 admin。仍包含較舊的初始 schema，Phase 4 後續可逐步收斂成 bootstrap baseline。
- `scripts/migrations/startup-manifest.js`：正式啟動 migration 順序與分組的唯一清單。
- `scripts/migrations/run-startup-migrations.js`：逐一執行 startup manifest，任一 migration 失敗時停止啟動。
- `docs/MIGRATION_GROUPS.md`：startup migration 分組說明。

Historical patches：

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

Sandhill product model：

- `migrate-sandhill-blueprint.js`
- `migrate-quest-chain-experience-mode.js`
- `migrate-coupon-entry-access.js`
- `slim-sandhill-legacy-columns.js`

Platform / commercial layer：

- `migrate-shop-platform.js`

Operational current patch：

- `scripts/migrations/migrate-operational-schema.js`
- `src/db/operational-schema-migration.js`

這組集中 AR/BGM/video/coupon/NPC/push 等舊 runtime 補表補欄位，已接入 `npm start`，不得再搬回 `index.js` 啟動流程。

Deleted legacy DB scripts：

- `fix-password-null.js`
- `hash-plaintext-passwords.js`
- `migrate-ar-system.js`
- `migrate-db.js`
- `migrate-quest-chain-creator.js`
- `migrate-task-types.js`

以上是未接入 startup manifest、無 active 引用的一次性或重複歷史 migration，已在 Phase 5 刪除。需要恢復時，只能從 git history 查，必須先重新審核 idempotency 與 production 風險，再放回 `scripts/migrations` 並更新 manifest / tests。

Deleted legacy seeds and dangerous scripts：

- `server/seed.sql`：舊 SQL seed，schema 已落後，Phase 5 已刪除，不能再作為 active bootstrap。
- `scripts/cleanup-legacy-content.js`：舊內容清理腳本，含硬編碼遠端 DB fallback，Phase 5 已刪除，禁止恢復到 active scripts。

恢復任何 seed/cleanup 腳本前，必須先移除硬編碼連線資訊、改用 `db-config.js`、加入 dry-run/confirmation 機制，並更新 Phase 4 守門測試。

Active seed scripts：

- `scripts/seed-sandhill-tutorial-modes.js`
- `scripts/seed-sandhill-demo-experience.js`
- `scripts/reset-and-seed-sandhill-demo-world.js`

以上仍可用於 demo/tutorial seed，但必須統一使用 `db-config.js`，不得內建遠端 DB fallback 或密碼。

## 已刪除 Legacy

- RAG/embedding 文件與 `Dockerfile.embedding` 已在 Phase 5 刪除。
- `zeabur.yaml` 不再啟動 `embedding-api`。
- `package.json` 不再提供不存在的 `scripts/rag/*` 指令。
- `server/seed.sql` 已在 Phase 5 刪除。
- `scripts/cleanup-legacy-content.js` 已在 Phase 5 刪除。
- 舊 `server/` 空殼已在 Phase 5 刪除；現役 server 啟動碼在 `src/server/`。

## Phase 5 後續順序

1. 維持 Phase 4/5 守門測試，避免 runtime schema patch 與 legacy RAG 檔案回流。
2. `npm start` 必須持續使用 manifest + runner，讓啟動順序集中管理。
3. 已刪除的 legacy DB scripts 不得回到 active path。
4. 盤點 production 實際 schema，對照本檔與 migrations。
5. 將 bootstrap 與 historical patches 收斂為更清晰的 migration 分組。
6. 清查 redirect shim 與舊 JS 是否仍有入口；無入口後才刪除。
7. 最後處理欄位/表刪除與資料清理。
