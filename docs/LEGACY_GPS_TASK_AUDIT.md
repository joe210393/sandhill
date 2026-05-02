# Legacy GPS-TASK / RAG Audit

最後更新：2026-04-30

本檔是 Sandhill 的舊功能隔離清單。任何項目要重新接回主線，必須先證明它是 Sandhill 現役功能，並同步更新 `docs/ARCHITECTURE_MEMO.md` 與 `npm run test:legacy-boundaries`。

## Active Sandhill 主線

- `index.js`、`src/routes/*`、`src/services/*`：現役 API 與服務分層。
- `public/staff-dashboard.html`、`public/js/staff-dashboard.js` 與 `public/js/staff-dashboard/*`：現役後台。
- `public/ai-lab.html`、`public/js/ai-lab.js`：現役玩家遊戲殼，仍需繼續拆分。
- `public/task-detail.html`、`public/map.html`、`public/products.html`、`public/user-dashboard.html`、`public/user-tasks.html`：現役或相容玩家入口，刪除前必須查流量與連結。

## 已從 Active Path 切出

- `package.json` 已移除不存在的 `scripts/rag/*` 指令：
  - `clean:plant-data`
  - `dedup:plant-data`
  - `enrich:plant-data`
  - `build:plant-mapping`
  - `verify:tlpg`
- `src/middleware/core.js` 預設 CORS 不再包含 `https://gpstask.zeabur.app`。
- `env.example` 不再把 `https://gpstask.zeabur.app` 放進 `ALLOWED_ORIGINS`。
- `zeabur.yaml` 已改為單一 `sandhill-app` service，不再預設部署 `embedding-api`。

## 高優先隔離候選

這些項目不應再被新功能引用；Phase 5 已完成刪除，後續只能從 git history 查舊脈絡，不得恢復到 active path。

- `Dockerfile.embedding`：舊植物向量搜尋服務的 Dockerfile，已刪除。
- `.venv-rag/`、`venv-embedding/`：本機舊 RAG/embedding Python 環境，已刪除。
- `CHANGELOG_RECENT.md`：舊 RAG 改動紀錄，不屬於 Sandhill 產品備忘錄，已刪除。
- `SCORING_ALGORITHM_DOCUMENTATION.md`、`RAG_TUNING_GUIDE.md`、`FLOWER_COLOR_DESIGN.md`：植物 RAG scoring/feature 文件，已刪除。
- `staff-dashboard-old.js`、`admin-users.js`、`role-management.js`：對應頁面目前已導向新版 dashboard，舊 JS 已刪除。

## 暫時保留的相容層

- `public/staff-dashboard-old.html`
- `public/staff-dashboard-v2.html`
- `public/admin-users.html`
- `public/admin-user-tasks.html`
- `public/redeem-tasks.html`
- `public/role-management.html`

以上目前只是 redirect shim。它們可以保護舊書籤與外部連結，但不得載入舊 JS 或新增業務邏輯。

## 需要小心拆的舊流程

- `public/js/ai-lab.js` 仍有植物/RAG 顯示分支，但現行 `analyzePhotos()` 送出 `skipRag=true`，主流程只使用 LM 回覆。下一步應把 plant/RAG UI 分支抽到 legacy module，確認無回傳依賴後移除。
- `/api/vision-test` 仍保留植物/RAG 歷史欄位相容；若要改回傳格式，必須先確認 `ai-lab.js` 與任何外部客戶端不依賴舊欄位。
- `/api/embedding-health`、`/api/embedding-stats` 目前集中在 `src/routes/system.routes.js` 回傳停用狀態。它們是相容 endpoint，不是現役 embedding 功能。

## 邊界規則

- 新功能不得引用 `scripts/rag/*`、`Dockerfile.embedding`、`embedding-api`、`gpstask.zeabur.app`。
- Redirect shim 只能做導向，不能載入舊 dashboard/admin JS。
- 植物 RAG 若要恢復，必須以新 Sandhill 模組重新設計，不得直接把 GPS-TASK 舊服務接回主線。
- 每次清理 legacy 項目後都要跑：
  - `npm run test:legacy-boundaries`
  - `npm run test:phase2-architecture`
  - `npm run test:phase3-frontend`
