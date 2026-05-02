# Phase 5 隔離刪除完成紀錄

最後更新：2026-05-01

本文件從 Phase 4 收斂結果延伸為 Phase 5 刪除紀錄。每次刪除前後，先確認 `docs/ARCHIVE_MANIFEST.json`、`docs/LEGACY_GPS_TASK_AUDIT.md`、`docs/DATABASE_SCHEMA_MEMO.md` 與 `docs/ARCHITECTURE_MEMO.md`，並執行：

```bash
npm run test:phase1-architecture
npm run test:phase2-architecture
npm run test:phase3-frontend
npm run test:phase4-database
npm run test:legacy-boundaries
npm run test:archive-readiness
```

## Phase 4 收斂狀態

- `_archive` 已完成清空並移除；歷史隔離物不再保留在 repo。
- `docs/ARCHIVE_MANIFEST.json` 已記錄已刪除批次與暫留參考批次。

## 第一批已刪除

刪除日期：2026-05-01

- `delete-ready-legacy-gps-task`：刪除 `_archive/legacy-gps-task/`
- `delete-ready-legacy-db-migrations`：刪除 `_archive/legacy-db-migrations/`
- `delete-ready-legacy-db-seeds`：刪除 `_archive/legacy-db-seeds/`
- `delete-ready-legacy-server-shell`：刪除 `_archive/legacy-server-shell/`
- `legacy-ad-hoc-tests`：刪除 `_archive/legacy-ad-hoc-tests/`
- `quarantined-dangerous-scripts`：刪除 `_archive/legacy-dangerous-scripts/cleanup-legacy-content.js`
- `historical-security-reference`：刪除 `_archive/historical-security/`
- `delete-ready-legacy-python-envs`：刪除 `.venv-rag/`、`venv-embedding/`

保留 redirect shim：

- `public/staff-dashboard-old.html`
- `public/staff-dashboard-v2.html`
- `public/admin-users.html`
- `public/admin-user-tasks.html`
- `public/redeem-tasks.html`
- `public/role-management.html`

上述 HTML 目前是相容入口，不載入舊 JS。要刪除這些 shim，必須先確認外部書籤、部署流量或使用者入口已不再依賴。

## 現在保留的相容層

只有 HTML redirect shim 暫留，因為它們是外部入口相容，不是舊功能本體。若未來要刪，必須先確認外部書籤、部署流量或使用者入口已不再依賴。

## 刪除規則

- 只刪 `docs/ARCHIVE_MANIFEST.json` 標示為 `ready_for_deletion_review` 或 `quarantine_do_not_execute` 的路徑；已刪除後改為 `deleted` 並保留紀錄。
- 刪除後必須同步更新 `docs/ARCHIVE_MANIFEST.json` 與本文件。
- 若測試發現 active code 還引用 archive 路徑，先修引用或保留 shim，不直接刪。
- 不刪資料表、不刪 production data；資料庫刪除要另開 migration，並先備份。
- `.venv-rag/` 與 `venv-embedding/` 不得回到 repo；若未來需要 AI/RAG Python 能力，必須另開新 Sandhill 模組設計。
