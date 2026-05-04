# Staff Dashboard 代辦工作流程清單

與正規化對齊：`README.md` → `docs/ARCHITECTURE_MEMO.md`、`docs/NORMALIZATION_AUDIT.md`。後台業務邏輯在 `public/js/staff-dashboard/views/*`，薄入口 `public/js/staff-dashboard.js` 不擴張；範圍語意集中 `public/js/staff-dashboard/role-context.js`；狀態在 `state.js`；載入順序變更須跑 `npm run test:phase3-frontend`。

## 守門（每次改動）

| 項 | 動作 |
|----|------|
| G1 | 改動前閱讀 ARCHITECTURE_MEMO（必要時 NORMALIZATION_AUDIT） |
| G2 | 動到 `staff-dashboard.html` script 順序或新增 shell 旁模組 → `npm run test:phase3-frontend` |
| G3 | 架構／路由／DB 邊界大改 → `npm run test:normalization` |

## 階段與檔案歸屬

| 階段 | 內容 | 主要檔案／約束 |
|------|------|----------------|
| P0 | 守門 | 上表 |
| P1 | Admin／Shop／Staff 範圍（頂欄、側欄、玩法入口） | `role-context.js`、`items.js`、`staff-dashboard.html` |
| P2 | 多頁範圍一行說明（素材／商品／兌換／會員／POS／發券） | `role-context.js` + 各 view 對應 DOM id |
| P3 | 計費：租戶僅單一圖表選項時簡化 UI | `views/billing.js` + HTML id |
| P4 | 兌換商品：營運捷徑摺疊 | `staff-dashboard.html`（結構） |
| P5 | 營運總覽 KPI（5～8 指標、Admin vs Shop） | 待產品定稿；UI 僅 `views/` + 路由；API 走 `src/routes` |
| P6 | 列表頁模板對齊（兌換／會員等） | 各 `views/*.js` |
| P7 | 文件同步 | `ARCHITECTURE_MEMO.md` |

## 狀態追蹤（實作對齊）

- [x] P1 玩法入口列表篩選與卡片（quest-chains + state）
- [x] P1 範圍頂欄／bootstrap（role-context + items + billing 共用提示）
- [x] P2 多頁 scope note（本輪：assets / products / redemptions / users / pos / coupon-issue）
- [x] P3 計費圖表範圍列：非 admin 且僅一選項時隱藏
- [x] P4 商品頁營運捷徑 `<details>` 摺疊
- [x] P5（階段性）玩法入口「載入範圍快照」條（`quest-chains.js`，無新 API；跨模組 KPI 總覽仍待產品定稿）
- [x] P6 列表工具列：`qc-toolbar-row`（兌換紀錄、會員）；素材庫主操作標籤（`assets.js`）
- [x] 鑽取頁 `questDetailScopeNote`（`quest-chains.js`）
- [x] 平台治理 scope 行：商店／方案／權限（`role-context.js` + HTML）

最後更新：2026-05-02（快照條、詳情 scope、素材標籤、治理頁 scope、列表工具列；完整 KPI 儀表仍待產品定稿）

## 正規化對齊聲明

- 未修改 `public/js/staff-dashboard.js` 薄入口。
- 計費行為變更僅 `views/billing.js`（UI 顯示／既有選項邏輯不變）。
- 範圍文案擴充僅 `role-context.js` + HTML 靜態 id 節點。
- 新增流程文件與 README 連結，符合「主要頁／流程變更同步文件」。
