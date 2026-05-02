# Sandhill 架構備忘錄

最後更新：2026-05-02（ai-lab 第十三輪：端對端本機驗證 + 修 `window.SandhillAssistant` latent ReferenceError + 接上 `AiLabAssistant` controller + 移除 `cameraFlash` orphan UI，主檔 1635 行）

## 修改守則

每次修改前先讀本檔。若本次修改改到路由、資料表、主要頁面、啟動流程、LM/AI 判定、素材儲存、權限或檔案分層，必須同步更新本檔。
若要判斷目前正規化完成度，必須同時讀 `docs/NORMALIZATION_AUDIT.md`；不要把 Phase 1 到 Phase 5 的第一輪完成誤判成最終完成。

原則：

- 不把新功能塞回 `index.js`、`public/js/staff-dashboard.js`、`public/js/ai-lab.js` 這類大型檔案。
- 先抽外圍、再抽業務、最後才刪除。任何疑似廢棄功能先標記與隔離，確認沒有入口和資料依賴後再移除。
- GPS-TASK/RAG 舊功能不得接回 active path；恢復或刪除前先查 `docs/LEGACY_GPS_TASK_AUDIT.md` 並更新 `npm run test:legacy-boundaries`。
- API 行為、資料欄位、既有 URL 先保持相容；要改 URL 或欄位時先做轉接層。
- 資料庫 schema 只允許透過 migration 演進，不在 runtime route 裡臨時 `ALTER TABLE`。
- UI、UX 流程、LM 判定、資料存取、權限驗證分層維護。

## 目前架構

主專案是 Node.js / Express / MySQL：

- 啟動入口：`index.js`
- HTTP 啟動層：`src/server.js`
- Express app 組裝：`src/app.js`
- DB 設定：`db-config.js`
- DB pool：`src/db/pool.js`
- 素材路徑設定：`src/config/assets.js`
- 前端靜態頁：`public/*.html`
- 前端 JS：`public/js/*.js`
- 前端 CSS：`public/css/*.css`
- DB migration：`scripts/migrations/*.js`
- 歷史刪除紀錄：`docs/ARCHIVE_MANIFEST.json`、`docs/DELETE_ISOLATED_ITEMS_PLAN.md`
- 正規化完成度稽核：`docs/NORMALIZATION_AUDIT.md`
- 測試與執行輸出：`output/`
- 子專案：`cats_Sand/catlitter-mvp/`，目前看起來是獨立 MVP，不應混入主站重構。

## 現役功能

後台與營運：

- 登入、登出、`/api/me`
- 帳號、角色、商家與工作人員管理
- 商家方案、建置費與 LLM 用量帳務
- 玩法入口 `quest_chains`
- 關卡 `tasks`
- 大富翁/棋盤玩法 `board_maps`、`board_tiles`、`user_game_sessions`
- 素材庫：圖片、音樂、影片、AR 模型
- 商品兌換、點數、優惠券
- NPC 設定
- 匯入/匯出使用者

玩家端：

- 首頁入口選擇
- `ai-lab.html` 遊戲殼
- `task-detail.html` 任務細節
- `map.html` 探索地圖
- `products.html` 獎勵兌換
- `user-dashboard.html` 玩家中心
- `user-tasks.html` 任務紀錄/狀態
- 推播訂閱

AI / LM：

- `/api/ai-tasks/:taskId/submit`
- `/api/tutorial/ai-tasks/:taskId/submit`
- `/api/vision-test`
- `/api/chat-text`
- LLM 用量紀錄與月彙總

## 剩餘過度開發或廢棄候選

Phase 5 已完成第一輪高信心刪除；以下是仍需後續拆分或確認流量的項目：

- `src/app.js` 約 496 行，已移除重複 helper 實作，主要負責 app 組裝、route 註冊與少量相容接線；root `index.js` 已是薄入口。
- `public/js/ai-lab.js` 約 1682 行；語音、照片、任務媒體、玩家任務流程、劇情/棋盤 shell、棋盤動畫、棋盤 session、教學進度、事件接線、語言/LM、視覺問答、GPS watch / 裝置方位 / 任務 BGM 觸發、共享 runtime state、nearby task 資料流、自由探索 analyze-flow、相機 share/download (photo-share) 都已拆成獨立模組。`task-submit.js` 內部也已按 `submitPhotoAnswer / submitChoiceAnswer / submitTextAnswer` 三條子流程切分，並抽出 `dispatchAnswerViaApi / handleChoiceTutorialPassThrough / handleGenericTutorialPassThrough / triggerShakeError` 四個共享 helper。下一輪重點在 repository layer 與視覺回歸 smoke，不得再新增大型業務流程到主檔。
- `public/js/staff-dashboard.js` 已縮到約 66 行，現為薄入口；剩餘複雜度集中在 `public/js/staff-dashboard/views/`，尤其 `quest-chains.js`、`tasks.js`、`board-maps.js`。
- `public/css/ai-lab/`：已將原本 4k+ 行的巨型樣式表，依功能域分拆為 core、camera、hud、board、tasks 等獨立 CSS 檔案。
- `public/staff-dashboard-old.html`、`public/staff-dashboard-v2.html`、`public/admin-users.html`、`public/admin-user-tasks.html`、`public/redeem-tasks.html`、`public/role-management.html` 目前是 redirect shim；確認流量後可保留極薄 redirect 或移除 shim。舊 JS 已刪除，不得恢復載入。
- `package.json` 已移除不存在的 `scripts/rag/*` 指令，並以 `scripts/verify-legacy-boundaries.js` 防止回流。
- `Dockerfile.embedding`、`.venv-rag/`、`venv-embedding/`、`SCORING_ALGORITHM_DOCUMENTATION.md`、`CHANGELOG_RECENT.md` 與 RAG 文件已刪除；不得再由主啟動、部署或 npm scripts 引用。
- 舊 `server/seed.sql` 已刪除，不得再作為 active bootstrap。
- 舊 nested `server/` 殼已刪除，active app 只能從 root `index.js` 與 `src/*` 啟動。
- `_archive` 已完成 Phase 5 清空並移除。刪除紀錄在 `docs/ARCHIVE_MANIFEST.json` 與 `docs/DELETE_ISOLATED_ITEMS_PLAN.md`。
- runtime schema patch 已搬到 startup migration；不得再放回 `index.js`。
- `output/` 是本機輸出，不能進主架構。
- root 一次性拆檔/修補腳本已清除；未來需要重構時應以可保留的 module/test 方式前進，不再把臨時施工腳本留在 active root。

## 資料庫整理方向

目前資料表可先依責任切：

- Identity：`users`、`shops`
- Content：`quest_chains`、`tasks`、`board_maps`、`board_tiles`、`game_npcs`
- Player Progress：`user_tasks`、`task_attempts`、`user_quests`、`user_badges`、`user_game_sessions`
- Rewards：`items`、`user_inventory`、`products`、`product_redemptions`、`point_transactions`、`user_coupons`
- Assets：`ar_models`、`bgm_library`、`video_library`
- Billing / LM：`entry_plans`、`entry_billing_records`、`llm_usage_logs`、`llm_usage_monthly_summary`
- Notifications：`push_subscriptions`

資料庫工作順序：

1. 盤點實際 production 表與欄位，對照 migrations。
2. 把 runtime schema patch 移出 `index.js`。
3. 合併重複 migration，保留可重跑的 idempotent migration。
4. 建立 schema 備忘與 table ownership。
5. 最後才做欄位刪除或資料清理。

## 目標檔案結構

後端目標：

```text
src/
  app.js
  server.js
  config/
  db/
  middleware/
  routes/
    auth.routes.js
    shops.routes.js
    billing.routes.js
    questChains.routes.js
    tasks.routes.js
    board.routes.js
    assets.routes.js
    rewards.routes.js
    coupons.routes.js
    admin-users.routes.js
    admin.routes.js
    ai.routes.js
    push.routes.js
  services/
    auth.js
    billing.js
    shop-scope.js
    quest.service.js
    taskValidation.service.js
    aiTaskEvaluator.service.js
    asset-storage.js
  repositories/
  utils/
```

前端目標：

```text
public/
  js/
    shared/
      api.js
      auth.js
      dom.js
      format.js
      toast.js
    staff-dashboard/
      state.js
      views/
      forms/
      services/
    ai-lab/
      state.js
      shell.js
      board.js
      camera.js
      mini-map.js
      assistant.js
      task-flow.js
      event-bindings.js
  css/
    shared/
    staff-dashboard/
    ai-lab/
```

## 排程

Phase 0：2026-04-30，已開始

- 建立架構備忘錄。
- 抽出 DB pool 與素材路徑設定。
- 盤點大檔、redirect shim、RAG/embedding 殘留與 DB migration 問題。

Phase 1：2026-05-01 至 2026-05-03，已完成

- 把 `index.js` 的安全設定、CORS、auth middleware、upload middleware 拆到 `src/config` / `src/middleware`。
- 建立 routes 分組，但先保持原 API URL。
- 把 runtime schema patch 搬到新 migration。

Phase 2：2026-05-04 至 2026-05-07，後端路由標準化已完成

- 拆 `tasks`、`quest_chains`、`board`、`assets`、`rewards`、`coupons` routes。
- 抽出目前最容易重複出錯的 service：auth、shop scope、billing、asset storage、board、task validation。
- 建立 Phase 2 架構守門與最小 API smoke test。
- 剩餘大型區塊：玩家任務進度/兌換、AI/LM 判定、通用 upload route。這些進入下一輪 service/repository 與 Phase 3 前端拆分前處理，不回塞到已拆出的 route。

Phase 3：2026-05-08 至 2026-05-12，前端責任拆分已完成

- 拆 `staff-dashboard.js`：先抽 API client、state、render helpers，再依 view 拆檔。
- 拆 `ai-lab.js`：先抽 task-flow、camera、mini-map、board、assistant。
- CSS 依 shared / dashboard / ai-lab 分層。
- 前端拆分規則：先抽可測的 shared helper，確認 script 載入順序與 smoke test 通過後，才拆 view/form；不得一次大搬動互相依賴的 UI 流程。
- Phase 3 完成標準：dashboard shared helper/state/billing view，以及 ai-lab prompts、network、media、runtime-state、nearby-tasks、board-session、task-flow、story-shell、event-bindings、analyze-flow、task rules、board utils、board renderer、board animations、geo、geo-watch、camera capture、photo capture utils、mini-map UI、answer UI、query UI、voice chat、photo workflow、task media、tutorial progress、language、thinking、vision client、vision question 已從主檔切出並有守門測試（legacy plant result renderer 已刪除，因後端固定 LM-only / `skip_rag=true`，不再需要相容層）。後續若繼續拆細節，優先拆 `photo-share`（`captureBtn` 的 share/download）與 `task-submit.js` 內部 `submitPhotoAnswer / submitChoiceAnswer / submitNumberAnswer`，但不得把已抽出的 module 回塞主檔，也不得回塞 plant/RAG 相容流程。

Phase 4：2026-05-13 至 2026-05-15，已完成第一輪收斂，準備 Phase 5 隔離刪除

- 資料庫 migrations 收斂與 schema 文件化。
- 確認 redirect shim 與舊 JS 是否仍有流量。
- 清理 `_archive`、`output`、RAG/embedding 歷史檔的主路徑引用；GPS-TASK/RAG 項目先依 `docs/LEGACY_GPS_TASK_AUDIT.md` 隔離，再刪除。
- 建立 `docs/ARCHIVE_MANIFEST.json` 與 `docs/DELETE_ISOLATED_ITEMS_PLAN.md`，把可刪除候選、危險隔離檔、暫留參考檔分清楚。
- 建立 `scripts/verify-archive-readiness.js` 與 `npm run test:archive-readiness`，Phase 5 刪除前後都必須執行。

Phase 5：2026-05-16 之後，第一輪隔離刪除已完成

- 做刪除 PR/commit：只刪已證明無入口、無資料依賴、無部署引用的項目。
- 補 E2E 或 smoke test，避免重構後回歸。
- Phase 5 第一批只處理 `docs/ARCHIVE_MANIFEST.json` 標示為 `ready_for_deletion_review` 或 `quarantine_do_not_execute` 的路徑；不刪資料表、不刪 production data。
- 第一輪已刪除：舊 GPS-TASK/RAG 檔、舊 DB migrations、舊 seed、舊 nested server shell、舊手動測試、危險清理腳本、舊歷史安全封存、`.venv-rag/`、`venv-embedding/`。redirect shim 保留。

Phase 6：2026-05-01，已開始

- 建立薄入口：`index.js` 只載入 `src/server.js`。
- 建立 `src/app.js` 作為 Express app 組裝層，HTTP listen 留在 `src/server.js` / `src/server/startup.js`。
- 拆出 `src/routes/ai.routes.js` 與 `src/services/ai-client.js`，讓 `/api/vision-test`、`/api/chat-text`、停用的 `/api/plant-vision-prompt` 相容 endpoint，以及 AI config/retry 不再留在 app 組裝檔。
- 拆出 `src/routes/ai-tasks.routes.js`，讓 `/api/tutorial/ai-tasks/:taskId/submit` 與 `/api/ai-tasks/:taskId/submit` 不再留在 app 組裝檔。
- 拆出 `src/services/ai-task-evaluator.js`，集中 AI 任務 prompt、LM 回覆 JSON extraction、AI 任務結果 normalization、圖片/文字任務評分。
- 拆出 `src/services/player-progress.js`，集中 LLM usage 記錄、user task 建立、任務完成、道具/點數/劇情完成獎勵推進。
- 拆出 `src/routes/user-tasks.routes.js`，讓 `/api/user-tasks/*`、`/api/user/quest-progress`、`/api/user/badges` 離開 app 組裝檔。
- 拆出 `src/middleware/role-auth.js`，集中 admin/staff/shop/reviewer role middleware。
- 建立 `scripts/verify-phase6-normalization.js` 與 `npm run test:phase6-normalization`，鎖定薄入口與 AI/LM route/service 邊界。
- `npm test` 已改為完整基準線：先跑 `npm run test:normalization`，再跑 `npm run test:services`。新增架構或 service 守門測試時必須接入這兩個集合之一。

## 本次已完成

- `src/db/pool.js`：集中 DB pool 建立與 `SKIP_DB` 判斷。
- `src/config/assets.js`：集中 upload/static asset 路徑與媒體副檔名設定。
- `src/config/web-push.js`：集中 VAPID/Web Push 初始化與金鑰狀態。
- `src/middleware/core.js`：集中 trust proxy、Helmet、rate limit、CORS、cookie、JSON body、API charset/referrer header。
- `src/middleware/static-assets.js`：集中 `/images` 多路徑 fallback 與 `public/` static serving。
- `src/services/uploads.js`：集中圖片、音訊、影片、AI 圖片、Excel、暫存上傳設定與影片 ffmpeg 最佳化。
- `src/db/operational-schema-migration.js`：集中原本 runtime schema patch 的 migration 邏輯，僅供正式 migration entry 使用，不在 `index.js` 啟動時直接執行。
- `scripts/migrations/migrate-operational-schema.js`：正式 operational schema migration entry，已接入 `npm start`，負責 AR/BGM/video/coupon/NPC/push 等歷史補表補欄位。
- `src/routes/system.routes.js`：集中 `/api/health`、RAG/embedding 停用狀態與 SPA fallback。
- `src/routes/game-npcs.routes.js`：第一個業務 route 模組，集中 NPC CRUD。
- `src/routes/coupons.routes.js`：集中優惠券發放、列表、查詢、核銷、今日核銷紀錄。
- `src/routes/products.routes.js`：集中商品管理、玩家點數、玩家兌換、後台兌換審核。
- `src/routes/push.routes.js`：集中 Web Push public key、訂閱、取消訂閱與內部推播發送器。
- `src/routes/admin-users.routes.js`：集中後台會員列表、會員任務詳情、會員 Excel 匯出、會員 Excel 匯入與模擬活動資料建立。
- `src/routes/auth.routes.js`：集中登入、登出、目前使用者、一般註冊、admin 建立帳號、staff 指派/撤銷、admin/shop 修改密碼。
- `src/services/auth.js`：集中 JWT 產生/驗證、登入者商家範圍載入、`authenticateToken`、`authenticateTokenCompat`、`getOptionalTokenUser`、`requireRole`；route 不得自行解析 token 或複製 RBAC 判斷。
- `src/services/shop-scope.js`：集中商家 scope 判斷、`shop_id` 解析、商家存在檢查與 admin/shop/staff 的 shop_id resolution。注意：目前 `actorCanAccessShop` 沿用既有語意，只比對 admin 或 `shop_id`，不是 role guard；需要收緊時必須獨立變更並更新測試。
- `src/routes/shops.routes.js`：集中商家 profile 查詢/更新與商家列表；保留原本資產與 LLM 帳務摘要欄位。
- `src/routes/billing.routes.js`：集中商家總帳、入口方案 CRUD、計費總覽、入口月報、LM 用量明細、每日用量圖表與建置費紀錄。
- `src/services/billing.js`：集中計費月份、月份範圍、金額四捨五入、公益/商業政策、token 計費金額計算；route 不得自行複製計費公式。
- `src/services/asset-storage.js`：集中素材庫容量統計、商家 500MB 上限、容量文字格式與超量錯誤；素材/道具/影音 route 不得自行複製容量計算。
- `src/routes/assets.routes.js`：集中 AR 模型、素材容量摘要、背景音樂、影片素材、道具 CRUD、admin 發放道具與玩家背包。此模組仍保留原 URL 與原回傳格式；容量判斷必須透過 `src/services/asset-storage.js`，商家範圍必須透過 `src/services/shop-scope.js`。
- `src/routes/quest-chains.routes.js`：集中玩法入口 CRUD、結構鎖、公開入口列表、公開內容、刪除影響範圍、結構地圖與入口刪除。此模組保留原 URL 與原回傳格式；結構鎖與 coupon access 邏輯不得回塞 `index.js`。
- `src/routes/tasks.routes.js`：集中任務列表、後台任務列表、任務建立/查詢/編輯/複製/刪除影響範圍/刪除。任務 validation mode 與 AI 設定必須透過 `src/services/task-validation.js`。
- `src/services/board.js`：集中棋盤 session/map/tile row sanitizer 與棋盤/格子 scope access guard。後續拆 `board.routes.js` 時不得重新在 route 內複製棋盤權限與 JSON 清洗規則。
- `src/routes/board.routes.js`：集中棋盤地圖公開讀取、後台棋盤地圖 CRUD、格子 CRUD、玩家棋盤 session start/roll/resolve。此模組保留原 URL 與原回傳格式；棋盤資料清洗與 access guard 必須透過 `src/services/board.js`。
- `src/services/task-validation.js`：集中任務題型、AI/系統判定模式、`ai_config`、`pass_criteria` 與最大嘗試次數驗證。後續拆 `tasks.routes.js` 或 LM 判定時不得複製 validation mode 對應邏輯。
- `scripts/verify-auth-service.js`：鎖定 JWT、未登入、角色權限規則；修改認證流程時必須同步更新此測試。
- `scripts/verify-billing-service.js`：鎖定計費規則的輕量驗證；修改計費公式時必須同步更新此測試。
- `scripts/verify-shop-scope-service.js`：鎖定商家 scope 解析與既有存取語意；調整多商家權限時必須同步更新此測試。
- `scripts/verify-asset-storage-service.js`：鎖定素材容量格式、admin 無上限、shop 容量計算與超量錯誤；修改素材容量政策時必須同步更新此測試。
- `scripts/verify-board-service.js`：鎖定棋盤 row sanitizer、棋盤/格子商家權限與 JSON 欄位清洗；修改棋盤資料形狀或權限時必須同步更新此測試。
- `scripts/verify-task-validation-service.js`：鎖定任務驗證模式轉換、AI 任務必要欄位與錯誤訊息；修改任務判定規則時必須同步更新此測試。
- `src/server/startup.js`：集中環境摘要輸出、DB 連線啟動檢查與 `app.listen`；不再做 schema migration。
- `index.js`：薄入口，只載入 `src/server.js`。禁止新增業務邏輯。
- `src/server.js`：HTTP 啟動入口，載入 `src/app.js` 並呼叫 `startServer`。
- `src/app.js`：Express app 組裝檔，未改 API URL 與主要業務流程；目前約 496 行。禁止新增大型業務 route 回此檔；新增功能必須進 `src/routes`、`src/services` 或後續 `src/repositories`。
- `scripts/verify-phase1-architecture.js`：鎖定 Phase 1 架構邊界，確認啟動流程不再引用 runtime schema patch，且 `npm start` 會先跑 operational schema migration。
- `scripts/verify-phase2-architecture.js`：鎖定 Phase 2 route 邊界，確認 assets/quest/tasks/board/products/coupons 不得回到 `index.js` inline route。
- `src/routes/ai.routes.js`：集中 `/api/vision-test`、`/api/chat-text` 與停用的 `/api/plant-vision-prompt` 相容 endpoint。
- `src/routes/ai-tasks.routes.js`：集中 AI 任務圖片提交與教學模式匿名 AI 任務提交。此檔目前仍注入 app 內的 evaluator/player-progress helper，下一步應拆到 service/repository。
- `src/routes/user-tasks.routes.js`：集中玩家任務接取、查詢、答案提交、任務紀錄、兌換相容入口、劇情進度與稱號查詢。
- `src/routes/uploads.routes.js`：集中檔案上傳 API（圖片與音頻）。
- `src/utils/app-helpers.js`：集中核心的輔助函式與解析邏輯，避免堆積在 app 組裝檔。
- `src/repositories/core.repository.js`：集中基礎的資料庫查詢邏輯與通用 helper。
- `src/middleware/role-auth.js`：集中 role-based middleware。route 或 app 組裝檔不得重新 inline admin/staff/shop/reviewer middleware。
- `src/services/ai-client.js`：集中 AI API config 與 fetch retry/timeout 邏輯。AI/LM route 或 evaluator 不得自行複製 `getAiConfig` / `fetchAIWithRetry`。
- `src/services/ai-task-evaluator.js`：集中 AI 任務圖片/文字評分、prompt 與結果 normalization。route 不得自行複製 evaluator 邏輯。
- `src/services/player-progress.js`：集中玩家任務進度與完成獎勵推進，也集中 LLM usage 寫入與月彙總更新。route 不得自行複製完成任務與點數/道具/劇情推進邏輯。
- `scripts/verify-phase6-normalization.js`：鎖定 Phase 6 薄入口與 AI/LM route/service 邊界。
- `package.json`：`npm test` 是完整架構與 service 基準線；`npm run test:normalization` 鎖定 Phase 1-6、legacy、archive 與 cleanup 邊界；`npm run test:services` 鎖定 auth、billing、shop scope、asset storage、board、task validation。
- `public/js/shared/api.js`：集中後台 fetch patch、actor header、JSON API wrapper 與 401 重新登入處理。後續 dashboard view/form 不得重新定義 `apiJson` 或 `withActorHeaders`。
- `public/js/shared/format.js`：集中金額、容量、token、日期與日標籤格式化。後續 billing/dashboard view 不得重新定義同名格式化工具。
- `public/js/shared/dom.js`：集中 toast、HTML escape、inline form message。後續 dashboard view/form 不得重新定義 `showToast`、`escHtml`、`setInlineMessage`。
- `public/js/staff-dashboard/state.js`：集中 dashboard 全域狀態與常數，並提供 state-backed globals 給現有 inline handler 過渡使用。後續拆 view/form 時優先改成明確讀寫 `StaffDashboardState.state`，但不得重新在 `staff-dashboard.js` 宣告同名 state。
- `public/js/staff-dashboard/form-utils.js`：集中後台表單工具，包括座標貼上解析、AI validation mode 正規化、AI task payload 組裝與 AI payload 檢查。後續 form/view 不得重新宣告 `parseLatLngPaste`。
- `public/js/staff-dashboard/navigation.js`：集中後台 view/hash 切換、sidebar wiring 與 reward shop iframe lazy init。`staff-dashboard.js` 只保留 lazy-load callback 對接，不得重新宣告 `STAFF_DASH_HASH_BY_VIEW`。
- `public/js/staff-dashboard/drawer-controller.js`：集中右側 drawer、active form resolve、task wizard DOM 分組、wizard footer 與 submit 轉發。`staff-dashboard.js` 只保留各表單 after-open 業務接線，不得重新宣告 `validateTaskWizardStep` 或 `initializeTaskWizardDOM`。
- `public/js/staff-dashboard/views/billing.js`：集中後台計費 dashboard render/load/chart 邏輯，並保留 `loadBillingDashboard` 全域入口給既有 HTML inline handler 使用。後續 billing UI 修改應在此檔，不得回塞 `staff-dashboard.js`。
- `public/js/staff-dashboard/views/forms.js`：集中 drawer logic、填表輔助、blueprint 系統、AI payload 產生器。
- `public/js/staff-dashboard/views/data-services.js`：集中 `loadShops` 與 `loadEntryPlans` API 邏輯。
- `public/js/staff-dashboard.js`：已大幅抽離所有視圖與資料邏輯，縮減至 66 行，現僅作為路由與主程式載入的薄入口。
- `public/staff-dashboard.html`：先載入 `shared/api.js`、`shared/format.js`、`shared/dom.js`、`staff-dashboard/state.js`、`staff-dashboard/form-utils.js`、`staff-dashboard/navigation.js`、`staff-dashboard/drawer-controller.js`、`staff-dashboard/views/billing.js`、`staff-dashboard/views/forms.js`、`staff-dashboard/views/data-services.js`，再載入 `staff-dashboard.js`。修改 script 順序時必須跑 `npm run test:phase3-frontend`。
- `public/js/ai-lab/thinking.js`：集中 AI 上傳/分析/legacy plant/search/finalize 思考階段與 loading message 控制。`ai-lab.js` 不得重新宣告 `AI_THINKING_STAGES` 或思考動畫函式。
- `public/js/ai-lab/vision-client.js`：集中照片 grid 合成與 `/api/vision-test` 呼叫，固定 `skipRag=true`，維持 Sandhill 現役 LM-only 流程。`ai-lab.js` 不得重新宣告 `combinePhotosToGrid` 或 `analyzePhotos`。
- `public/js/ai-lab/legacy-plant-results.js`：**已於本輪刪除**。後端 `/api/vision-test` 固定回 `skip_rag: true`，前端 `analyzeBtn` 也已縮成 LM-only 流程，不再需要 plant 結果/信心度/非植物相容顯示。`ai-lab.js` 不得再 reference `AiLabLegacyPlantResults`、`showHighConfidenceResult`、`showMediumConfidenceResult`、`showLowConfidenceResult`、`showNonPlantResult`、`showQuickFeatures`、`plant_rag`、`need_more_photos`、`needMorePhotosSession`、`CONFIDENCE_HIGH`、`CONFIDENCE_MEDIUM`，亦不得恢復 `legacy-plant-results.js` 檔案。`scripts/verify-phase3-frontend.js` 已加入守門。
- `public/js/ai-lab/prompts.js`：集中 LM prompt 與自由探索模式 prompt 覆寫。`ai-lab.js` 不得重新 inline `PROMPTS`。
- `public/js/ai-lab/network.js`：集中 friendly network error 與 JSON request wrapper。`ai-lab.js` 不得重新宣告 `requestJson`。
- `public/js/ai-lab/media.js`：集中 YouTube embed URL、iframe 控制與 task video URL 解析。
- `public/js/ai-lab/runtime-state.js`：集中 `currentTask`、`currentBoardRun`、`currentEntryMode`、`lastLatLng`、`currentAnswerPhotoDataUrl`、`pendingPhotoDataUrl`、`photoCaptureModeActive`、棋盤/session、NPC dialog、相機選取與 nearby task 相關共享 runtime state。`ai-lab.js` 不得重新宣告這些 `let` state；後續 `nearby-tasks` / `board-session` / `task-flow` / `story-shell` controller 應直接以此為 state owner。
- `public/js/ai-lab/task-rules.js`：集中 GPS 任務判斷與拍照張數規則。
- `public/js/ai-lab/board-utils.js`：集中棋盤格 meta 解析、挑戰類型推斷與圓圈步數標籤。
- `public/js/ai-lab/board-renderer.js`：集中棋盤選單、棋盤軌道、棋盤 mini-map、格子預覽文字、game shell 進度與 entry renderer。棋盤回合業務不得放在 renderer，也不得回塞 `ai-lab.js`。
- `public/js/ai-lab/geo.js`：集中距離與方位角計算。
- `public/js/ai-lab/mini-map-ui.js`：集中 mini-map 容器建立、收合按鈕、定位文字同步。`ai-lab.js` 保留 GPS watch、Leaflet marker 與任務資料流，不得回塞純 UI helper。原本的 `renderTaskIndicators` 已於本輪刪除（從未被任何呼叫端使用），不得恢復。
- `public/js/ai-lab/nearby-tasks.js`：集中附近任務資料流、quest progress 查詢、進行中任務查詢、mini-map 附近任務 marker、地圖外任務 indicator、任務切換、預設任務選擇與 `applyTaskSelection`。此 controller 直接讀寫 `AiLabRuntimeState`，`ai-lab.js` 不得重新宣告 `normalizeVisibleTasks`、`fetchQuestProgressMap`、`loadNearbyVisibleTasks`、`renderNearbyTaskMarkers`、`applyTaskSelection`、`selectTaskForAiLab`、`loadDefaultVisibleTaskForUser`、`updateMiniMapTaskIndicators` 等資料流函式。
- `public/js/ai-lab/board-session.js`：集中棋盤 session 與回合流程，包含本地/遠端 run hydrate、localStorage key、`/api/board/session/start`、`/roll`、`/resolve`、本地擲骰、回合結算、格子 focus、事件/機會/命運卡結算與 tile preview。此 controller 直接讀寫 `AiLabRuntimeState`，並透過 callback 呼叫 NPC、HUD、renderer、task selection 與 task-flow；`ai-lab.js` 不得重新宣告 `hydrateBoardRunState`、`persistBoardRunState`、`updateBoardRunFromSession`、`getResolvedBoardTargetTile`、`showBoardTilePreview`、`completeBoardTurn`、`startBoardTurn`、`focusBoardTile` 等大型棋盤函式。
- `public/js/ai-lab/task-flow.js`：集中玩家任務流程，包含 `createCurrentUserTaskRecord` / `fetchCurrentUserTaskId`、GPS 到點檢查、location 任務通關、數字鎖開啟、答題 modal、reticle 作答、拍照作答入口、`buildSubmitContext`、`submitTaskAnswer` / `submitLockCode` delegation，以及 `getLoginUser` ctx 注入給 `task-submit.js`。`ai-lab.js` 不得重新宣告 `startTaskInteraction`、`enterPhotoCaptureFlow`、`showAnswerModal`、`buildSubmitContext` 等大型玩家任務流程。
- `public/js/ai-lab/story-shell.js`：集中劇情/棋盤 shell 載入流程，包含 `focusStoryTask`、`loadStoryShell`、`loadBoardShell`、`loadGameShellFromUrl`、教學 helper、Monopoly 首次擲骰提示與 shell 載入失敗 UI。此 controller 直接讀寫 `AiLabRuntimeState`，並依賴 `nearby-tasks` 的 `fetchQuestProgressMap / applyTaskSelection`，因此在 `ai-lab.js` 中必須於 `AiLabNearbyTasks` 建立後才初始化。`ai-lab.js` 不得重新宣告這些大型 shell 函式。
- `public/js/ai-lab/camera-capture.js`：集中相機快門回饋、沉浸式相機 UI、任務/全景拍攝模式切換，以及全景 frame 擷取。`ai-lab.js` 只保留任務狀態接線，不得重新宣告 `playCameraFeedback` 或 `captureFullFrameDataUrl`。
- `public/js/ai-lab/answer-ui.js`：集中選擇題 option 正規化、答案 modal 表單、密碼輪與 submit/loading UI 狀態。`submitTaskAnswer` 仍留在主檔負責 API 與任務流程。
- `public/js/ai-lab/assistant.js`：集中處理 NPC 對話（引導員）顯示與隱藏狀態，並封裝 Blocking 判斷。`ai-lab.js` 不得重新 inline NPC 對話。
- `public/js/ai-lab/camera-manager.js`：集中相機硬體存取、裝置設定、前後鏡頭切換與啟動串流，並保留介面提供 `ai-lab.js` 取用相機實體物件與尺寸重算。
- `public/js/ai-lab/hud-manager.js`：集中玩家介面的呈現邏輯，包含總覽資料渲染、Compact 顯示模式的切換，以及導航相關數據的介面更新。本輪同步移除每個函式入口的 `storySummaryPage / isStorySummaryShowing / renderStorySummaryPageContent` 三個 destructure（皆從未被函式 body 使用，且 `isStorySummaryShowing` 在主檔不存在會直接 throw `ReferenceError`）。`ai-lab.js` 的 `buildHudContext()` 不得再傳入這三個 token，`scripts/verify-phase3-frontend.js` 已加入守門。
- `public/js/ai-lab/task-submit.js`：集中任務答案送出（包含照片、選項、文字）與密碼鎖的檢查及 API 提交邏輯，減輕主檔的業務負擔。
- `public/js/ai-lab/task-utils.js`：集中獨立且無副作用的任務屬性判斷工具，包含 `inferTaskCategory`、`isAiPhotoTask` 等判斷邏輯。
- `public/js/ai-lab/voice-chat.js`：集中語音面板、SpeechRecognition、語音/文字提問送出、AI 回覆朗讀與語音提問狀態。`ai-lab.js` 只保留 controller 建立與 `stopVoiceRecognition` / `initSpeechChat` wrappers，不得重新 inline 語音辨識流程。
- `public/js/ai-lab/photo-workflow.js`：集中手繪/準星選取、照片集合、預覽列與結果面板基本狀態。`ai-lab.js` 只保留任務狀態接線。
- `public/js/ai-lab/task-media.js`：集中任務影片/BGM/Youtube frame 載入、錯誤狀態、播放暫停與 intro video 結束處理。`ai-lab.js` 不得重新管理 `taskIntroVideoLoadTimer`。
- `public/js/ai-lab/board-animations.js`：集中擲骰、機會卡、命運卡動畫與音效。棋盤 session / 回合判定已移入 `board-session.js`，動畫模組不得承擔 session state。
- `public/js/ai-lab/tutorial-progress.js`：集中教學模式訪客進度、教學骰子序列與已登入教學完成 API。`ai-lab.js` 不得重新 inline 教學進度 sessionStorage 規則。
- `public/js/ai-lab/language.js`：集中任務/free script、輸出語言 instruction、語音 locale 與語言 selector persistence。`ai-lab.js` 不得重新 inline 語言 switch。
- `public/js/ai-lab/photo-capture-utils.js`：集中 video/canvas 裁切、準星截圖與矩形截圖錯誤處理。`ai-lab.js` 不得重新計算裁切比例。
- `public/js/ai-lab/vision-question.js`：集中語音視覺提問的 `/api/vision-test` FormData 呼叫。照片辨識主流程仍由 `vision-client.js` 管理。
- `public/js/ai-lab/photo-share.js`：集中全景照片 share/download 邏輯，提供 `AiLabPhotoShare.handleCaptureClick({ video, captureFullFrameDataUrl })` 與 `shareOrDownloadDataUrl(dataUrl)`。`event-bindings.js` 的 `captureBtn` click handler 必須 delegate 到 `handleCaptureClick`，不得再 inline `navigator.share({ files: [file]` / `'ai-lab-${Date.now()}'` / `'image/jpeg'` / `win.document.write(` / `style="width:100%"` 這 5 個特徵字串；整個 iOS/Web Share/download 分支判斷只存在於 `photo-share.js`。
- `public/js/ai-lab/task-submit.js`：由原本 2 個 420 行的 monolith 函式重構為「1 個調度器 + 3 個輸入子流程 + 4 個共享 helper」：`submitTaskAnswer` 只做 `task_type` 判斷與 `try/finally`；`submitPhotoAnswer / submitChoiceAnswer / submitTextAnswer` 負責收集答案（回傳 `{ handled, answer }`）；`submitAiPhotoAnswer` 與 `uploadAttachedPhoto` 處理兩種照片上傳；`handleChoiceTutorialPassThrough / handleGenericTutorialPassThrough / dispatchAnswerViaApi / triggerShakeError` 集中教學短路、共通 API dispatch 與 shake 動畫。同時修掉原本 `lockMsg` 與 `setAnswerChoicePendingState` 兩個 bare reference（都是 closure 外的 free variable，實際會 throw `ReferenceError`），改走 `ctx.lockMsg` 與 `ctx.setAnswerChoicePendingState`；`buildSubmitContext` 已同步補傳。`scripts/verify-phase3-frontend.js` 守門：`submitPhotoAnswer / submitChoiceAnswer / submitTextAnswer / submitAiPhotoAnswer / uploadAttachedPhoto / dispatchAnswerViaApi / handleChoiceTutorialPassThrough / handleGenericTutorialPassThrough / triggerShakeError` 必須同時存在，且不得再以 bare reference 方式使用 `setAnswerChoicePendingState(` 或 `lockMsg.textContent =`。
- `public/js/ai-lab/analyze-flow.js`：集中自由探索 `analyzeBtn` 的 LM 分析流程，包含 prompt 組裝（含 system/user fallback、地點資訊注入、輸出語言指令、多角度提示）、GPS 快速取得（2 秒超時、低精度）、`combinePhotosToGrid` 拼接、`analyzePhotos` LM 呼叫、思考階段動畫（upload / analyze / finalize）、錯誤訊息分類（fetch / timeout / 其他）、答案 toast 與 `retry()` 觸發。`ai-lab.js` 不得再 inline `analyzeBtn.addEventListener('click', async ...)`；必須透過 `window.AiLabAnalyzeFlow.createController({...}).bind()` 註冊；`showQueryTransit('照片問題已摺成紙飛機送出...')`、`const imageToSend = await combinePhotosToGrid(capturedPhotos)`、`const result = await analyzePhotos(imageToSend, finalSystemPrompt, finalUserPrompt, gpsData)`、`playQueryReturnAnimation('AI 紙飛機帶回了答案')`、`playQueryReturnAnimation('紙飛機帶回了錯誤訊息')` 五個特徵字串不得回到主檔。
- `public/js/ai-lab/geo-watch.js`：集中 GPS `watchPosition`、定位輪詢、`deviceorientation` 監聽、任務導航 UI（距離 / 方位 / 偏角 / 任務目標 chip）、自動播放任務 BGM 的觸發條件，以及 `navigationWatchId`、`navigationPollTimer`、`deviceHeading`、`lastHeading`、`headingSource`、`lastHeadingUpdateAt`、`lastGpsUpdateAt`、`lastTaskDistance`、`lastTaskBearing`、`taskObjectVisible`、`taskReached`、`bgmAutoStarted`、`orientationPermissionState` 全套 runtime 狀態。`ai-lab.js` 不得重新宣告這些變數，也不得自行 `addEventListener('deviceorientation', ...)` 或開啟 `navigator.geolocation.watchPosition`，必須一律走 `geoWatch` controller 的 `attachOrientationListeners`、`startTaskNavigation`、`tryAutoPlayTaskBgm`、`setTaskObjectVisible`、`setBgmAutoStarted`。
- `public/ai-lab.html`：先載入 `ai-lab/network.js`、`media.js`、`runtime-state.js`、`task-rules.js`、`board-utils.js`、`board-renderer.js`、`board-animations.js`、`board-session.js`、`geo.js`、`geo-watch.js`、`mini-map-ui.js`、`nearby-tasks.js`、`task-utils.js`、`quest-context.js`、`tutorial-progress.js`、`camera-manager.js`、`hud-manager.js`、`task-media.js`、`task-submit.js`、`task-flow.js`、`story-shell.js`、`camera-capture.js`、`photo-capture-utils.js`、`answer-ui.js`、`query-ui.js`、`voice-chat.js`、`photo-workflow.js`、`prompts.js`、`language.js`、`thinking.js`、`vision-client.js`、`vision-question.js`、`analyze-flow.js`、`photo-share.js`，再載入 `ai-lab.js`。`analyze-flow.js` 必須排在 `vision-client.js` 之後（依賴 `combinePhotosToGrid / analyzePhotos`）、`ai-lab.js` 之前；`photo-share.js` 必須在 `ai-lab.js` 之前，因為 `event-bindings` 於 `DOMContentLoaded` 時會用 `global.AiLabPhotoShare.handleCaptureClick` 綁 `captureBtn`。`board-session.js` 必須排在 `board-animations.js` 之後、`ai-lab.js` 之前；`task-flow.js` 必須排在 `task-submit.js` 之後、`ai-lab.js` 之前；`story-shell.js` 必須排在 `ai-lab.js` 之前，且 `ai-lab.js` 內的 story-shell controller 必須在 `nearbyTasks` 初始化後建立；`geo-watch.js` 必須排在 `geo.js` 之後（依賴 `haversineDistance` / `calculateBearing`），`nearby-tasks.js` 必須排在 `runtime-state.js` 與 `mini-map-ui.js` 之後。`legacy-plant-results.js` 的 `<script>` 標籤已移除，不得恢復。修改 script 順序時必須跑 `npm run test:phase3-frontend`。
- root 一次性施工腳本：`extract-*`、`fix-*`、`split-*`、`refactor*.js`、`replace-assistant.js`、`restore-ai-lab.js`、`test-loop.js`、`update-verify.js` 與 `src/app.js.refactored` 已刪除。它們只屬於過渡施工，不是 Sandhill 正式架構；未來不得依賴這類腳本作為重構流程。
- `scripts/verify-phase3-frontend.js`：鎖定 Phase 3 前端 shared helper、state script、billing view、ai-lab modules 載入順序，避免 helper/state/billing/ai-lab modules 回流到主檔，並禁止用 `with` 包住 dashboard 主檔造成 inline handler 失效。
- `docs/LEGACY_GPS_TASK_AUDIT.md`：集中 GPS-TASK/RAG 舊功能隔離清單，標明 active path、已切出項目、高優先刪除候選、相容層與邊界規則。
- `scripts/verify-legacy-boundaries.js`：鎖定 legacy 邊界，確認舊 RAG npm scripts、舊 gpstask domain、Zeabur embedding service 與舊 dashboard JS 不會回到 active path。
- `zeabur.yaml`：已改為單一 `sandhill-app` service，不再預設部署 `embedding-api` 或引用 `Dockerfile.embedding`。
- `env.example`：預設 `ALLOWED_ORIGINS` 只保留 Sandhill 與 local dev，不再列出 `gpstask.zeabur.app` 或植物 RAG flags。
- `README.md` 與 `public/sw.js`：移除 active 文案/通知 tag 的 GPS-TASK 命名。
- `docs/DATABASE_SCHEMA_MEMO.md`：Phase 4 資料庫 ownership、migration 分層與後續收斂順序。修改 schema 前必須先讀。
- `docs/SCHEMA_OWNERSHIP.json`：機器可驗證的 table ownership manifest。新增資料表時必須更新此檔與 `scripts/verify-phase4-database.js`。
- `docs/MIGRATION_GROUPS.md`：startup migration 分組說明，與 `scripts/migrations/startup-manifest.js`、`scripts/verify-phase4-database.js` 必須同步。
- `scripts/verify-phase4-database.js`：鎖定 database/legacy 隔離邊界，確認 schema patch 不回 `index.js`、operational migration 維持在 `npm start`、RAG/embedding 高信心 legacy 檔不回 active path。
- `scripts/migrations/startup-manifest.js`：集中 `npm start` 的正式 migration 順序與分組。新增、移除、調整 startup migration 時只改 manifest，並同步更新 `docs/DATABASE_SCHEMA_MEMO.md`、`docs/MIGRATION_GROUPS.md` 與 `scripts/verify-phase4-database.js`。
- `scripts/migrations/run-startup-migrations.js`：依 manifest 逐一執行 migration，任何 migration 失敗即停止啟動，避免半套 schema 啟動應用。
- 第一批隔離刪除已移除舊 DB scripts、舊 SQL seed、危險清理腳本與舊 `server/` 空殼。active bootstrap 只能走 startup migrations；現役 server 啟動碼是 `src/server/startup.js`。
- `scripts/seed-sandhill-tutorial-modes.js`、`scripts/seed-sandhill-demo-experience.js`、`scripts/reset-and-seed-sandhill-demo-world.js`：仍是 active demo/tutorial seed，但必須使用 `db-config.js`，不得內建遠端 DB host/password fallback。
- 第一輪隔離刪除已移除舊 RAG 文件、`Dockerfile.embedding`、舊 dashboard/admin JS、`.venv-rag/` 與 `venv-embedding/`。若未來需要查舊脈絡，只能從 git history 查，不得恢復到 active path。
- 驗證：`node --check index.js src/config/assets.js src/config/web-push.js src/db/pool.js src/db/operational-schema-migration.js src/middleware/core.js src/middleware/static-assets.js src/routes/admin-users.routes.js src/routes/assets.routes.js src/routes/auth.routes.js src/routes/billing.routes.js src/routes/board.routes.js src/routes/coupons.routes.js src/routes/game-npcs.routes.js src/routes/products.routes.js src/routes/push.routes.js src/routes/quest-chains.routes.js src/routes/shops.routes.js src/routes/system.routes.js src/routes/tasks.routes.js src/routes/uploads.routes.js src/server/startup.js src/services/asset-storage.js src/services/auth.js src/services/billing.js src/services/board.js src/services/shop-scope.js src/services/task-validation.js src/services/uploads.js src/utils/app-helpers.js src/repositories/core.repository.js scripts/migrations/migrate-operational-schema.js scripts/verify-asset-storage-service.js scripts/verify-auth-service.js scripts/verify-billing-service.js scripts/verify-board-service.js scripts/verify-shop-scope-service.js scripts/verify-task-validation-service.js scripts/verify-phase1-architecture.js scripts/verify-phase2-architecture.js` 通過。
- 驗證：`npm run test:phase1-architecture` 通過。
- 驗證：`npm run test:phase2-architecture` 通過。
- 驗證：`npm run test:phase3-frontend` 通過（已新增 `geo-watch.js` 載入順序與 forbidden state declaration 守門）。
- 驗證：`npm run test:asset-storage-service` 通過。
- 驗證：`npm run test:auth-service` 通過。
- 驗證：`npm run test:billing-service` 通過。
- 驗證：`npm run test:shop-scope-service` 通過。
- 驗證：`npm run test:board-service` 通過。
- 驗證：`npm run test:task-validation-service` 通過。
- 驗證：`SKIP_DB=1 PORT=4326 node index.js` 可啟動，`/api/health`、`/login.html`、`/staff-dashboard.html` 回應正常；`/api/tasks/admin`、`/api/quest-chains`、`/api/board-maps/admin` 未登入時維持 `未提供認證令牌`。
- 驗證：`/js/shared/api.js?v=20260430a`、`/js/shared/format.js?v=20260430a`、`/js/shared/dom.js?v=20260430a`、`/js/staff-dashboard/state.js?v=20260430a`、`/js/staff-dashboard/views/billing.js?v=20260430a`、`/js/staff-dashboard.js?v=20260430a` 皆可由本機 server 正常載入。
- 驗證：`/js/ai-lab/geo-watch.js?v=20260501a` 可由 `SKIP_DB=1 PORT=4327 node index.js` 啟動的本機 server 以 HTTP 200 載入；`ai-lab.html` 已於 jsdom 環境確認 `window.AiLabGeoWatch` 在主檔 DOMContentLoaded 前就完成註冊。
- 驗證：`npm test` 通過完整 normalization 與 services 基準線。
- 驗證（本輪 ai-lab 死碼/legacy 清理）：`node --check public/js/ai-lab.js`、`node --check public/js/ai-lab/hud-manager.js`、`node --check public/js/ai-lab/mini-map-ui.js`、`node --check public/js/ai-lab/photo-workflow.js`、`node scripts/verify-phase3-frontend.js`、`npm run test:normalization`、`npm test` 全部通過；本機 `SKIP_DB=true` 啟動時 `/js/ai-lab.js`、`/js/ai-lab/mini-map-ui.js`、`/js/ai-lab/geo-watch.js` 維持 HTTP 200，且 `/js/ai-lab/legacy-plant-results.js` 正確回 HTTP 404；jsdom 載入 `ai-lab.html` 時 `window.AiLabGeoWatch / AiLabHudManager / AiLabPhotoWorkflow / AiLabMiniMapUi / AiLabVisionClient` 都已註冊，`AiLabMiniMapUi.renderTaskIndicators` 與 `AiLabLegacyPlantResults` 都正確消失，`buildHudContext` 不再因 `isStorySummaryShowing is not defined` 觸發 `ReferenceError`。
- 驗證（本輪 ai-lab 第二輪清理 / 修破損 API）：`node --check public/js/ai-lab.js`、`node --check public/js/ai-lab/board-renderer.js`、`npm run test:phase3-frontend`、`npm run test:normalization`、`npm test` 全部通過；jsdom 載入 28 個 ai-lab 模組與主檔後 `DOMContentLoaded` 跑到「初始化完成」，沒有新的 `TypeError / ReferenceError`，`window.AiLabAnswerUi.renderAnswerModal` 是函式、`AiLabBoardRenderer.buildBoardTilePreviewDialog` 與 `AiLabBoardRenderer.renderBoardMiniMap` 已從 export surface 拿掉。`scripts/verify-phase3-frontend.js` 新增的 round-2 守門已生效：`getElementById('boardPanelStatus' / 'boardPanelMeta' / 'rollDiceBtn' / 'cameraFlash' / 'photoStrip' / 'zoomValue')` 不會出現在 `ai-lab.js`，HTML 也不再宣告這些 id；`function setQueryTransitText(`、`function closeVoicePanel(`、`function isCompactViewport(`、`function shouldSuppressCameraAlert(`、`function setSelectionMode(`、`const setTaskVideoErrorState =`、`const hideBoardCardOverlay =`、`const getTutorialGuestProgressKey =`、`const saveTutorialGuestState =`、`const stopTaskNavigation =`、`const updateTaskNavigationUI =`、`const handleOrientationEvent =`、`const getCurrentQuestRules =`、`const getCurrentExperienceMode =`、`const captureSelectionDataUrlFromRect =`、`const getPos =`、`const processSelection =`、`const updatePhotoStrip =` 等 0-call wrapper 不允許再回流；`showAnswerModal` 必須 delegate 到 `renderAnswerModal({...})` 且不允許再 inline 重複的 `<label>📸 上傳照片</label>` / `<label>✍️ 請輸入答案</label>` 表單字串；`initLockWheels(lockWheels, digits)`、`getRequiredShots(currentTask)`、`applyAnswerSubmitLoadingState(...)` 三個破損 API 已修正且有守門；`answerToastClose.addEventListener('click', () => hideAnswerToast())` 真的有掛上；棋盤 dock panel 透過新的 `buildBoardRendererContext()` 包裝走 `AiLabBoardRenderer.renderBoardPanel(buildBoardRendererContext())`，原本傳空 args 完全不渲染的 8 個 zombie 呼叫已活回來。
- 驗證（本輪 ai-lab 第三輪清理 / 死 typeof 防守 / zoom 面板 / 又一輪破損 API）：`node --check public/js/ai-lab.js`、`node --check public/js/ai-lab/task-submit.js`、`npm run test:phase3-frontend`、`npm run test:normalization`、`npm test` 全部通過；jsdom 重跑 28 個 ai-lab 模組與主檔，`DOMContentLoaded` 完整跑完到「初始化完成」沒有新例外。`public/js/ai-lab.js` 從 3360 行縮到 3324 行（-36 行；累計 3787 → 3324，淨砍 463 行），`public/js/ai-lab/task-submit.js` 從 579 行縮到 574 行，`public/ai-lab.html` 從 597 行縮到 586 行，`public/css/ai-lab/core.css` 與 `public/css/ai-lab/voice.css` 也順手清掉與 zoom 面板相關的死 CSS。本輪刪除/修正：(1) **死 `typeof X === 'function'` 防守**：刪掉 `loadTaskVideo / tryAutoPlayTaskBgm / exitFormalStoryIntroMode / pauseTaskMedia / closeTaskEncounter / getLoginUser / showQueryTransit / hideQueryTransit / closeNpcDialog` 在主檔的 typeof 防守，這些變數都是同一 closure 內的 `function` 宣告或 `const`，永遠是 function，typeof 檢查為純戲劇式防守碼。`task-submit.js` 內的 4 個 `typeof showQueryTransit/hideQueryTransit === 'function'` 區塊也一併刪除。只保留 `getLockCode` 一個 typeof 檢查，因為它真的可能因 `window.AiLabAnswerUi || {}` 取到 undefined。(2) **單呼叫 wrapper inline**：`handleTaskIntroVideoEnded`、`loadTaskBGM`、`loadTaskVideo`、`pauseTaskMedia`、`playBoardDrawCardAnimation`、`getTutorialBoardRollValue`、`isTutorialGuestStoryMode`、`getTutorialGuestState`、`startTaskNavigation`、`tryAutoPlayTaskBgm`、`applyScript`、`initLanguageSelector`、`addPhotoToCollection`、`updatePreviewArea`、`showResultPanel`、`initSpeechChat`、`initMiniMapToggle` 共 17 個只在主檔被呼叫一次的 wrapper 全部 inline 為直接呼叫對應 controller。(3) **整片 zoom 面板 UI**：`zoomControl / zoomButtons / dockZoomBtn / dockZoomPanel` 的 4 個 DOM lookup、`toggleDockPanel('zoom')` 的綁定與整段 click handler、`closeDockPanels()` 的 zoom 收合、`toggleDockPanel` 的 zoom 對應，加上 `ai-lab.html` 的 `<button id="dockZoomBtn">` 與整個 `<div id="dockZoomPanel">...</div>` 區塊（含 4 個 `class="zoom-btn"` 與 `<span id="zoomValue">`）、`core.css` 的 `.zoom-control / .zoom-btn / .zoom-btn.active` rule、`voice.css` 的 `body.tutorial-board-clean .feature-dock-menu #dockZoomBtn` 隱藏 selector 全部刪除。整個 zoom UI 從來就沒有任何 click handler，按鈕按下去什麼事都不會發生，是純粹的 orphan UI。(4) **`captureFullFrameDataUrl()` 兩處破損呼叫**：`camera-capture.js` 的 `captureFullFrameDataUrl(video, quality = 0.95)` 期望第一參數是 video 元素，但 `ai-lab.js` 的 `captureBtn` click handler 與 `handleTaskPhotoShutter` 都以零參數呼叫 → `if (!video?.videoWidth)` 為 true → 直接 throw `'相機尚未就緒'`。本輪改為 `captureFullFrameDataUrl(video)`。(5) **`playCameraFeedback()` 破損呼叫**：`camera-capture.js` 的 `playCameraFeedback({ shutterBtn, reticleCaptureHotspot, cameraFlash })` 需要 DOM 元素以掛 `is-firing` class，但 `ai-lab.js` 在 `handleTaskPhotoShutter` 以零參數呼叫 → 完全不觸發任何視覺/震動回饋。本輪改為 `playCameraFeedback({ shutterBtn, reticleCaptureHotspot })`（cameraFlash 已於上一輪移除，故不傳）。(6) **`renderTaskDebug` 內的 `missionMode` 引用**：`missionMode` 在主檔從未宣告，`{ missionMode }` 是 shorthand 物件 property，當 `?debug=1` 時 console.log 會直接 throw `ReferenceError`。本輪移除這個引用。(7) **`buildTaskChoiceOptions` 死 destructure**：從 `window.AiLabAnswerUi` destructure 出來但主檔從未呼叫，本輪移除。(8) **`dataUrlToBlob` 移入 task-submit.js**：原本 `ai-lab.js` 宣告一個 4 行 helper 然後透過 `buildSubmitContext()` 經 ctx 傳給 `task-submit.js`（task-submit 是它唯一的消費者），這完全沒必要繞 ctx。本輪把 `dataUrlToBlob` 直接搬進 `task-submit.js` 的 IIFE，並從 `ai-lab.js` 與 `task-submit.js` 的 ctx destructure 同步移除，去掉跨模組耦合。本輪所有改動都已加 `scripts/verify-phase3-frontend.js` 守門：`ai-lab.js` 的 typeof 防守數量上限 = 1（只允許 getLockCode），`task-submit.js` 不得 gate `showQueryTransit / hideQueryTransit`，`captureFullFrameDataUrl(...)` 必須帶 video，`playCameraFeedback({ shutterBtn, reticleCaptureHotspot })` 必須帶物件參數，`missionMode` 不得回流，17 個 inline 過的 wrapper 不得回流，整片 zoom UI 在 `ai-lab.js / ai-lab.html` 的 ID/selector 都不得回流，`dataUrlToBlob` 不得回到 `ai-lab.js` 也不得透過 ctx 傳遞。`public/ai-lab.html` 的 `<script src="js/ai-lab.js?v=42">` 已升至 `?v=43`。
- 驗證（本輪 ai-lab runtime-state / nearby-tasks / board-session / task-flow / story-shell）：`node --check public/js/ai-lab.js`、`node --check public/js/ai-lab/runtime-state.js`、`node --check public/js/ai-lab/nearby-tasks.js`、`node --check public/js/ai-lab/board-session.js`、`node --check public/js/ai-lab/task-flow.js`、`node --check public/js/ai-lab/story-shell.js`、`node --check public/js/ai-lab/task-submit.js`、`npm run test:phase3-frontend`、`npm test` 全部通過；`public/js/ai-lab.js` 從 3324 → 3286 → 3033 → 2721 → 2455 → 2194 行，`runtime-state.js` 接管 shared state 與 task-flow 狀態，`nearby-tasks.js` 接管附近任務資料流，`board-session.js` 接管棋盤 session，`task-flow.js` 接管玩家任務開始與 submit ctx，`story-shell.js` 接管劇情/棋盤 shell 載入與教學 helper。`scripts/verify-phase3-frontend.js` 已加入 script order、module exposure 與 forbidden function/state 回流守門。
- 驗證（本輪 ai-lab 第十一輪 + 第十二輪 / photo-share 拆出 + task-submit 子流程切分）：`node --check public/js/ai-lab/photo-share.js`、`node --check public/js/ai-lab/event-bindings.js`、`node --check public/js/ai-lab/task-submit.js`、`node --check public/js/ai-lab/task-flow.js`、`node scripts/verify-phase3-frontend.js`、`npm run test:normalization`、`npm test` 全部通過。`event-bindings.js` 從 632 → 592 行（-40 行），`task-submit.js` 從 574 → 547 行（-27 行；結構從 2 個 monolith 重構為 1 調度器 + 9 helper），新增 `photo-share.js` 82 行，`ai-lab.html` 多 1 條 `<script>` 並把 `?v=44` 升為 `?v=45`。守門：`AiLabPhotoShare` 必須 export、`event-bindings.js` 必須 delegate 到 `AiLabPhotoShare.handleCaptureClick` 且 5 個 share/download 特徵字串不得 inline；`task-submit.js` 必須同時存在 `submitPhotoAnswer / submitChoiceAnswer / submitTextAnswer / submitAiPhotoAnswer / uploadAttachedPhoto / dispatchAnswerViaApi / handleChoiceTutorialPassThrough / handleGenericTutorialPassThrough / triggerShakeError`，且不得 bare reference `setAnswerChoicePendingState(` 或 `lockMsg.textContent =`。JSDOM smoke 確認 `AiLabPhotoShare.handleCaptureClick / AiLabTaskSubmit.submitTaskAnswer / AiLabTaskSubmit.submitLockCode` 都是 function。同時順手修掉兩個原本的 latent ReferenceError（`lockMsg` 與 `setAnswerChoicePendingState` 在 task-submit 內是 free variable，實際會 throw）。
- 驗證（本輪 ai-lab 第十輪 / analyze-flow 拆分）：`node --check public/js/ai-lab.js`、`node --check public/js/ai-lab/analyze-flow.js`、`node scripts/verify-phase3-frontend.js`、`npm run test:normalization`、`npm test` 全部通過。`public/js/ai-lab.js` 從 1772 → 1682 行（-90 行；自第一輪 3787 起累計 -2105 行），`public/js/ai-lab/analyze-flow.js` 新檔 188 行集中 prompt 組裝、快速 GPS、LM 呼叫、思考階段、錯誤分類與答案 toast。`ai-lab.html` 新增 `<script src="/js/ai-lab/analyze-flow.js?v=20260502a">`（排在 `vision-client.js` / `vision-question.js` 之後、`ai-lab.js` 之前），並把 `ai-lab.js?v=43` 升為 `?v=44`。`scripts/verify-phase3-frontend.js` 新增五條守門：(1) `analyze-flow.js` 必須存在且 syntax ok；(2) 載入順序 `vision-client.js < analyze-flow.js < ai-lab.js`；(3) `AiLabAnalyzeFlow.createController` 必須 export；(4) `ai-lab.js` 必須使用 `window.AiLabAnalyzeFlow.createController`；(5) 原本 inline handler 的 5 個特徵字串（`showQueryTransit('照片問題已摺成紙飛機送出...')`、`const imageToSend = await combinePhotosToGrid(capturedPhotos)`、`const result = await analyzePhotos(imageToSend, finalSystemPrompt, finalUserPrompt, gpsData)`、`playQueryReturnAnimation('AI 紙飛機帶回了答案')`、`playQueryReturnAnimation('紙飛機帶回了錯誤訊息')`）不得回到主檔。jsdom 重跑 29 個 ai-lab 模組與主檔，`DOMContentLoaded` 跑完沒有新例外，`window.AiLabAnalyzeFlow` 正確註冊且 `createController` 是函式。
- 驗證（本輪 ai-lab 第十三輪 / 本機端對端驗證 + 接上 AiLabAssistant controller + 移除 cameraFlash orphan UI）：`SKIP_DB=1 PORT=4330 node index.js` 本機啟動成功；`/api/health`、所有 8 個前端 HTML 頁（`/login.html`、`/staff-dashboard.html`、`/ai-lab.html`、`/map.html`、`/products.html`、`/index.html`、`/user-tasks.html`、`/staff-dashboard-v2.html` 等 redirect shim）全回 200；12 個 `css/ai-lab/*.css` + 36 個 `/js/ai-lab/*.js` 模組（含本輪新加的 `assistant.js`）全回 HTTP 200；未登入 API（`/api/me`、`/api/tasks/admin`、`/api/quest-chains`、`/api/board-maps/admin`、`/api/shops`、`/api/user-tasks`）都維持 401 `未提供認證令牌`。**本輪修掉一個真實 latent bug**：`ai-lab.js` 在 6 處呼叫 `window.SandhillAssistant.init / showNpcDialog / closeNpcDialog / isNpcDialogBlocking`，但 codebase 中從來沒有任何檔案定義 `window.SandhillAssistant` — 這是之前抽 `assistant.js` 時 export surface 從 `SandhillAssistant` 改成 `AiLabAssistant` 但忘了對齊 call site 且忘了把 `<script>` 載入到 HTML。任何觸發 NPC 對話的流程（答題正確/錯誤、鎖碼正確/錯誤、棋盤事件、劇情進入、教學 NPC、任務 encounter）都會 throw `TypeError: Cannot read properties of undefined (reading 'init')`。本輪修法：(1) `ai-lab.html` 新增 `<script src="/js/ai-lab/assistant.js?v=20260502a">` 排在 `photo-share.js` 之後、`ai-lab.js` 之前；(2) `ai-lab.js` 刪掉 `buildAssistantContext()` + 3 個 `showNpcDialog / closeNpcDialog / isNpcDialogBlocking` wrapper function（總共 74 行），改用 `const assistantController = window.AiLabAssistant.createController({elements, isCurrentQuestTutorialMode, isCurrentQuestDemoMode, isFormalStoryEntryMode, clearFormalStoryIntroMode, renderTutorialUi, closeDockPanels, getCurrentTask, getTaskVideoUrl, maybeAutoOpenTaskIntro})` 一次性建立 controller，然後 `const showNpcDialog / closeNpcDialog / isNpcDialogBlocking` 三個 arrow 轉接到 controller，`formalStoryIntroMode` 狀態由 `clearFormalStoryIntroMode: () => { formalStoryIntroMode = false; }` 閉包；(3) `ai-lab.js?v=45` 升為 `?v=46`；(4) `cameraFlash` div 與對應 CSS（`.camera-flash` / `@keyframes cameraFlashPulse` / `camera-capture.js` 的 `cameraFlash` 參數與 `if (cameraFlash) { ... }` block）全部拔除，因為 `ai-lab.js` 之前已不再傳 `cameraFlash` 給 `playCameraFeedback`，該 div 完全無人觸發。`public/js/ai-lab.js` 從 1682 → 1635 行（-47 行；自第一輪 3787 起累計 -2152 行 / -56.8%）。`scripts/verify-phase3-frontend.js` 新增六條守門：(a) `assistant.js` 必須存在；(b) `ai-lab.html` 必須載入 `assistant.js` 且排在 `ai-lab.js` 之前；(c) `AiLabAssistant` 與 `createController` 必須 export；(d) `ai-lab.js` 必須走 `window.AiLabAssistant.createController` 路徑；(e) `ai-lab.js` 不得再出現 `window.SandhillAssistant`（防止 latent ReferenceError 回流）。JSDOM smoke 端對端載入 live server 的 `ai-lab.html`，確認 36 個 ai-lab 模組（`AiLabAssistant` 含在內）全部 `window.*` 註冊成功且沒有任何 runtime error；HTML/JS 綁定 audit 顯示主檔剩下的 orphan ID 都是合理的（CSS anchor `cameraModeSwitch / gameShellBody / gameShellObjectiveBlock`、紙飛機動畫 `qpPaper / qpPlane` 用 class selector、答案 modal 動態建立 `answerPhotoInput / answerTextInput / answerCaptureFromReticle / answerRetakeFromReticle / answerPhotoPreview`、dock shell 動態建立 `shellExitBtn`）。`npm test` 完整 14 個 suite 通過。
