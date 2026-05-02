# Normalization Audit

最後更新：2026-05-02（ai-lab 第十三輪：本機端對端驗證 + 修 `window.SandhillAssistant` latent bug + 接上 `AiLabAssistant` controller + 清 `cameraFlash` orphan UI，主檔 1635 行）

本文件從第三者角度檢視 Sandhill 正規化現況。結論：Phase 1 到 Phase 6 的第一輪骨架整理已讓專案進入可控狀態。`public/js/ai-lab.js` 連續做了十三輪瘦身：第一輪（3787 → 3605）抽 geo-watch 並砍 plant/RAG legacy；第二輪（3605 → 3360）刪 0-call wrappers 與壞 DOM ref；第三輪（3360 → 3324）刪死 typeof 防守、單呼叫 wrapper、zoom orphan UI 與破損 API；第四輪（3324 → 3286）新增 `runtime-state.js`；第五輪（3286 → 3033）新增 `nearby-tasks.js`；第六輪（3033 → 2721）新增 `board-session.js`；第七輪（2721 → 2455）新增 `task-flow.js`；第八輪（2455 → 2194）新增 `story-shell.js`；第九輪（2194 → 1772）新增 `event-bindings.js`；第十輪（1772 → 1682）新增 `analyze-flow.js`；第十一輪新增 `photo-share.js` 把 `event-bindings.js` 的 46 行 share/download 搬出；第十二輪把 `task-submit.js` 的 420 行 monolith 重構成 1 調度器 + 9 helper；第十三輪在本機實際跑起 server 做端對端 HTTP/JSDOM 雙向驗證，發現並修復 `window.SandhillAssistant` 從未被任何檔案定義（NPC 對話全部會 throw `TypeError`）— 改用正式的 `AiLabAssistant.createController` 並把 `assistant.js` 載入到 HTML；同時把只剩 CSS 的 `cameraFlash` orphan UI 與對應 `@keyframes cameraFlashPulse` 清乾淨。主檔累計從 3787 → 1635 行（淨砍 2152 行，-56.8%）。

## 目前完成度

已高度正規化：

- `index.js` 已是薄入口，只載入 `src/server.js`。
- `src/server.js` / `src/server/startup.js` / `src/app.js` 已分開 HTTP 啟動、啟動檢查與 Express app 組裝。
- config、middleware、DB pool、static assets、upload middleware 已從入口檔抽離。
- 核心 API 已移到 `src/routes/`，包含 auth、billing、shops、assets、tasks、quest chains、board、products、coupons、push、AI、AI tasks、user tasks、uploads。
- 核心規則已移到 `src/services/`，包含 auth、shop scope、billing、asset storage、board、task validation、AI client、AI task evaluator、player progress、uploads。
- `src/repositories/core.repository.js` 已建立第一層資料存取 helper，但還不是完整 repository layer。
- runtime schema patch 已改由 startup migration 管理，migration manifest 與 schema ownership 已文件化並可驗證。
- GPS-TASK / RAG / embedding 舊功能已隔離刪除，legacy 邊界有測試守住。
- `public/js/staff-dashboard.js` 已縮到約 66 行，主體移入 `public/js/staff-dashboard/views/`、state、navigation、drawer controller、form utils。
- `public/css/ai-lab.css` 已拆成 `public/css/ai-lab/` 下的功能 CSS：core、camera、hud、board、tasks、mini-map、assistant、voice、result、director、animations、responsive。
- 一次性拆檔與修補腳本已從 root 移除，避免未來被誤用。
- `public/js/ai-lab.js` 累計從 3787 → 3605 → 3460 → 3360 → 3324 → 3286 → 3033 → 2721 → 2455 → 2194 → 1772 → 1682 行（連續 10 輪，-55.6%）。另外第十一輪改的是 `event-bindings.js`（632 → 592）、第十二輪改的是 `task-submit.js`（574 → 547 行，但內部結構從 2 個 420 行 monolith 變為 1 調度器 + 9 helper，每個 < 80 行）。每一輪都加了 `scripts/verify-phase3-frontend.js` 守門，禁止已抽出的 token 回流。
- `public/js/ai-lab/runtime-state.js` 已集中共享 runtime state，並以過渡 accessor 維持主檔既有閉包函式可運作；`scripts/verify-phase3-frontend.js` 已禁止這 40+ 個 `let` state 宣告回到 `ai-lab.js`。
- `public/js/ai-lab/nearby-tasks.js` 已集中附近任務資料流：`normalizeVisibleTasks`、`fetchQuestProgressMap`、`fetchInProgressTasks`、`loadNearbyVisibleTasks`、`renderNearbyTaskMarkers`、`applyTaskSelection`、`selectTaskForAiLab`、`loadDefaultVisibleTaskForUser`、`updateMiniMapTaskIndicators`。`ai-lab.js` 只保留 thin wrappers 供 story/board/mini-map 現有流程呼叫。
- `public/js/ai-lab/board-session.js` 已集中棋盤 session 與回合流程：本地/遠端 session hydrate、localStorage run state、擲骰、遠端 `/roll` / `/resolve`、本地回合結算、格子 focus、事件/機會/命運卡結算與 tile preview。`ai-lab.js` 只保留 thin wrappers 供既有事件與 `task-submit.js` ctx 呼叫。
- `public/js/ai-lab/task-flow.js` 已集中玩家任務流程：建立/查詢 user-task record、開始任務、GPS 到點檢查、教學 location 通關、數字鎖開啟、答題 modal、拍照作答入口、reticle answer capture、submit ctx 組裝與 task-submit delegation。`currentAnswerPhotoDataUrl`、`pendingPhotoDataUrl`、`photoCaptureModeActive` 已納入 `AiLabRuntimeState`。
- `public/js/ai-lab/story-shell.js` 已集中劇情/棋盤 shell 載入流程：`focusStoryTask`、`loadStoryShell`、`loadBoardShell`、`loadGameShellFromUrl`、教學 helper、首次擲骰提示與 shell 載入失敗 UI。`ai-lab.js` 只保留 thin wrappers 供事件與完成後 reload 呼叫。
- `public/js/ai-lab/event-bindings.js` 已集中前台事件接線：resize、answer toast、切換鏡頭、儲存照片、返回、canvas 繪圖、導演面板、模式切換、game shell entry/start、NPC dialog、拍照確認、shutter/reticle capture、board panel、camera mode、BGM/intro media、feature dock、HUD/board dock、棋盤切換/擲骰/聚焦、任務互動 modal、答案/密碼/完成 modal、orientation 與 pointerdown BGM listener。
- `public/js/ai-lab/analyze-flow.js` 已集中自由探索 LM 分析流程：`stopVoiceRecognition / hideAnswerToast / showQueryTransit / collapseResultPanel` 進場收斂、`startThinkingAnimation / setThinkingStage / updateLoadingMessage` 思考階段、system/user prompt fallback、拍攝地點與輸出語言注入、2 秒低精度 GPS、`combinePhotosToGrid` 多角度拼接、`analyzePhotos` LM 呼叫、`<reply>...</reply>` 解析、`playQueryReturnAnimation` 紙飛機動畫、錯誤訊息分類（fetch / timeout / 其他）與 `retry()` 重設。`ai-lab.js` 只保留 `analyzeFlow.bind()` 一行綁定。
- `public/js/ai-lab/photo-share.js`（Round 11）已集中全景照片 share/download：iOS 走 `window.open` + Swal 提示、支援 Web Share API 時走 `navigator.share({ files: [file] })`、其它走 `<a download>`。`event-bindings.js` 只保留 `AiLabPhotoShare.handleCaptureClick({ video, captureFullFrameDataUrl })` 一行呼叫，46 行的 share/download 邏輯完全下放到 `photo-share.js`。
- `public/js/ai-lab/task-submit.js`（Round 12）已按子流程切分：`submitTaskAnswer` 只負責 `task_type` 路由與 `try/finally` 收尾（30 行），`submitPhotoAnswer / submitChoiceAnswer / submitTextAnswer` 是答案收集子流程（回傳 `{ handled, answer }`），`submitAiPhotoAnswer / uploadAttachedPhoto` 是兩條照片上傳路徑，`handleChoiceTutorialPassThrough / handleGenericTutorialPassThrough / dispatchAnswerViaApi / triggerShakeError / ensureUserTaskIdOrFail` 是共享 helper。同時順手修掉 `lockMsg` 與 `setAnswerChoicePendingState` 兩個在 submit 函式內是 free variable 的 latent ReferenceError（正式模式擲鎖或選項答題時會 throw）。

本輪刪除/修正清單（皆已加守門，禁止回流）：

- 同 closure 死防守：`typeof loadTaskVideo === 'function'`、`typeof tryAutoPlayTaskBgm === 'function'`、`typeof exitFormalStoryIntroMode === 'function'`、`typeof pauseTaskMedia === 'function'`、`typeof closeTaskEncounter === 'function'`、`typeof getLoginUser === 'function'`、`typeof showQueryTransit === 'function'`、`typeof hideQueryTransit === 'function'`、`typeof closeNpcDialog === 'function'` 共 9 個在 `ai-lab.js` 的同 closure 內 typeof 防守，加上 `task-submit.js` 內的 4 個 `typeof showQueryTransit/hideQueryTransit === 'function'` 區塊全部刪除。所有這些變數都是同一 closure 內 `function` 宣告或 `const` 賦值，永遠是 function。`scripts/verify-phase3-frontend.js` 加上「`ai-lab.js` 的 typeof function 防守上限 = 1（只允許 `getLockCode`）」與「`task-submit.js` 不得 gate `showQueryTransit / hideQueryTransit` 防守」的守門。
- 單呼叫 wrapper inline：`handleTaskIntroVideoEnded`、`loadTaskBGM`、`loadTaskVideo`、`pauseTaskMedia`、`playBoardDrawCardAnimation`、`getTutorialBoardRollValue`、`isTutorialGuestStoryMode`、`getTutorialGuestState`、`startTaskNavigation`、`tryAutoPlayTaskBgm`、`applyScript`、`initLanguageSelector`、`addPhotoToCollection`、`updatePreviewArea`、`showResultPanel`、`function initSpeechChat()`、`function initMiniMapToggle()` 共 17 個只在主檔被呼叫一次的 wrapper inline 為直接呼叫對應 controller / 模組。同時把死 destructure 中的 `buildTaskChoiceOptions`（從未在 `ai-lab.js` 直接呼叫）一併拿掉。
- 整片 zoom 面板 orphan UI：`getElementById('zoomControl' / 'dockZoomBtn' / 'dockZoomPanel')`、`querySelectorAll('.zoom-btn')` 等 4 個 DOM lookup；`toggleDockPanel('zoom')` 的綁定與 `dockZoomBtn.addEventListener('click', ...)` 整段 click handler；`closeDockPanels()` 的 zoom 收合；`toggleDockPanel` panels 對映表的 zoom 鍵；`ai-lab.html` 的 `<button id="dockZoomBtn">` 與整個 `<div id="dockZoomPanel">...</div>` 區塊（含 4 個 `class="zoom-btn"` 與 `<span id="zoomValue">`）；`public/css/ai-lab/core.css` 的 `.zoom-control / .zoom-btn / .zoom-btn.active` rule；`public/css/ai-lab/voice.css` 的 `body.tutorial-board-clean .feature-dock-menu #dockZoomBtn` selector。整個 zoom UI 完全沒有任何 click 事件接線，按下去什麼都不會發生，是純 orphan UI。
- `captureFullFrameDataUrl()` 兩處破損呼叫：`camera-capture.js` 的 `captureFullFrameDataUrl(video, quality = 0.95)` 期望第一參數是 video 元素，但 `ai-lab.js` 的 `captureBtn` click handler 與 `handleTaskPhotoShutter` 都以零參數呼叫 → `if (!video?.videoWidth)` 為 true → 直接 throw `'相機尚未就緒'`。本輪改為 `captureFullFrameDataUrl(video)`，按下「📸 儲存照片」按鈕真的能存成功。
- `playCameraFeedback()` 破損呼叫：`camera-capture.js` 的 `playCameraFeedback({ shutterBtn, reticleCaptureHotspot, cameraFlash })` 需要 DOM 元素以掛 `is-firing` class，但 `ai-lab.js` 在 `handleTaskPhotoShutter` 以零參數呼叫 → 完全不觸發任何視覺/震動回饋。本輪改為 `playCameraFeedback({ shutterBtn, reticleCaptureHotspot })`（cameraFlash 已於上一輪移除，故不傳）。
- `renderTaskDebug` 內的 `missionMode` 引用：`missionMode` 在主檔從未宣告，`{ missionMode }` 是 shorthand 物件 property，當使用者開 `?debug=1` 時 `console.log` 會直接 throw `ReferenceError`。本輪移除這個引用。
- `dataUrlToBlob` 從 `ai-lab.js` 移入 `task-submit.js`：原本 `ai-lab.js` 宣告一個 4 行 helper 然後透過 `buildSubmitContext()` 經 ctx 傳給 `task-submit.js`（task-submit 是它唯一的消費者），這完全沒必要繞 ctx。本輪把 `dataUrlToBlob` 直接搬進 `task-submit.js` 的 IIFE，並從 `ai-lab.js` 與 `task-submit.js` 的 ctx destructure 同步移除，去掉跨模組耦合。

仍需收斂：

- `public/js/ai-lab.js` 約 1682 行，已不再是「胖客戶端」的門檻（自 3787 起縮了 55%）。剩下內容主要是 controller/ctx 組裝、1000+ 行 DOM lookup 與 helper 閉包、mini-map 初始化、`captureBtn` 的 50 行 share/download 與 `showAnswerModal` 包裝等。下一輪應優先抽 `photo-share`（`captureBtn` click handler）與收斂 `task-submit.js` 內部子流程，不再新增大型 controller。
- `public/js/ai-lab/task-submit.js` 約 547 行：已切成 1 調度器 + 9 個 helper（3 個答案收集子流程、2 個上傳子流程、4 個共享 helper），外加 `submitLockCode`。每個 helper 都 < 80 行，dispatcher 只 30 行。若仍要進一步降載，可把 `submitAiPhotoAnswer`（目前 110 行）再拆成「送出」與「回應渲染（pass / fail × 棋盤 / 一般）」兩段，但風險對比收益已不高。
- `src/app.js` 約 496 行，已移除重複 helper 實作，主要保留 app 組裝、route 註冊與少量相容接線；後續新增功能不得回塞。
- staff dashboard 已薄入口化，但個別 view 還偏大，例如 `quest-chains.js` 約 1205 行、`tasks.js` 約 726 行、`board-maps.js` 約 661 行。
- repository layer 目前只有 core helper，route/service 仍有不少直接 SQL；下一輪應依資料域建立 repositories，而不是只把 SQL 從 A 搬到 B。
- 前端缺少真正的瀏覽器視覺 smoke，CSS 拆分雖有載入順序測試，但還需要確認 ai-lab / staff-dashboard 首屏不空白、不重疊。
- `selectionMode` 變數仍實質上只會是 `'reticle'`（其它值的 code path 都已移除），但 `photo-workflow.js` 仍 3 處檢查 `getSelectionMode() === 'reticle'`。屬於「邏輯已死、邊界尚未收斂」的灰區，下一輪拆 photo-workflow 內部時應一併刪除這個常量檢查。
- ~~`public/ai-lab.html` 還有 `<button id="captureBtn">` 「儲存整張照片」按鈕的 50 行 share/download handler~~ **第十一輪已抽到 `photo-share.js`**。

## 風險排名

1. `public/js/ai-lab.js`：仍是玩家流程的核心組裝檔，但 `analyze-flow` 已切出，風險比前幾輪明顯下降。剩下真正需要守住的是 `captureBtn` 的 share/download 與 `showAnswerModal` 包裝這類還沒模組化的 UI 片段——下一輪拆 `photo-share` 時要守住沒有 orphan handler、也沒有回塞 `analyzeBtn` 或 `submitTaskAnswer` 的封閉 handler。
2. 直接 SQL 分散：目前服務分層已改善，但資料存取還沒有依 domain 收斂。應先處理 user tasks、AI tasks、billing usage、board session 這些跨 route 查詢。
3. staff dashboard view 大檔：主入口已乾淨，但 view 內仍可再拆 service/render/form 子模組。優先拆 `quest-chains` 與 `tasks`。
4. legacy compatibility：redirect shim 仍保留；plant/RAG 相容層已於第一輪刪除完畢，剩下的 redirect shim 刪除前需要確認入口流量與使用者影響。
5. 視覺回歸：CSS 已拆，但目前主要靠架構測試；需要加一個能啟動 SKIP_DB server 並載入頁面的 smoke。
6. 又一個 orphan UI 風險：本輪揭露的 zoom 面板（HTML 與 CSS 完整、JS 完全沒接線）說明 HTML 與 JS 行為的同步並沒有 lint guard。下一輪可考慮加一個輕量級的 `verify-html-js-binding.js`，掃 `getElementById('X')` 與 `<button id="X">` 的對映表並挑出 orphan ID。

## 守門規則

每次改到架構、前端載入順序、DB、legacy 邊界或 AI/LM 流程，至少執行：

```bash
npm run test:normalization
```

改到核心 service 時加跑：

```bash
npm run test:services
```

完整基準線：

```bash
npm test
```

`scripts/verify-phase3-frontend.js` 累計守門（Round 1 / 2 / 3）：

- 禁止 `ai-lab.js` 出現 `AiLabLegacyPlantResults` / `showQuickFeatures` / `showHighConfidenceResult` / `showMediumConfidenceResult` / `showLowConfidenceResult` / `showNonPlantResult` / `plant_rag` / `need_more_photos` / `needMorePhotosSession` / `CONFIDENCE_HIGH` / `CONFIDENCE_MEDIUM`。
- 禁止 `public/js/ai-lab/legacy-plant-results.js` 重新出現在檔案系統。
- 鎖定 `src/routes/ai.routes.js` 必須維持 `skip_rag: true`。
- 禁止 `ai-lab.js` 重新引入 `thinkingInterval / stageMessageIndex / AI_THINKING_STAGES`。
- 禁止 `mini-map-ui.js` 重新 export `renderTaskIndicators`。
- 禁止 `hud-manager.js` / `ai-lab.js` 重新引入 `isStorySummaryShowing / renderStorySummaryPageContent / storySummaryPage`。
- 禁止 `ai-lab.js` 重新查找 `boardPanelStatus / boardPanelMeta / rollDiceBtn / cameraFlash / photoStrip / zoomValue` 這 6 個沒有對應 HTML 的死 DOM id；HTML 也禁止再宣告 `boardPanelStatus / boardPanelMeta / rollDiceBtn`。
- 禁止 `ai-lab.js` 重新出現 round 2 的 18 個 0-call wrapper（`setQueryTransitText` / `closeVoicePanel` / `isCompactViewport` / `shouldSuppressCameraAlert` / `setSelectionMode` / `setTaskVideoErrorState` / `hideBoardCardOverlay` / `getTutorialGuestProgressKey` / `saveTutorialGuestState` / `stopTaskNavigation` / `updateTaskNavigationUI` / `handleOrientationEvent` / `getCurrentQuestRules` / `getCurrentExperienceMode` / `captureSelectionDataUrlFromRect` / `getPos` / `processSelection` / `updatePhotoStrip`）。
- 強制 `showAnswerModal` 必須 delegate 到 `renderAnswerModal({...})`，且禁止再 inline `<label>📸 上傳照片</label>` / `<label>✍️ 請輸入答案</label>` 兩段重複表單 HTML。
- 強制 `initLockWheels(lockWheels, ...)` 必須帶上 `lockWheels` 元素。
- 強制 `getRequiredShots(currentTask)` 必須帶上 task 參數。
- 強制 `setAnswerSubmitLoadingState` 必須透過 `applyAnswerSubmitLoadingState` 包裝，並帶上 `idleLabel: ANSWER_SUBMIT_LABEL_IDLE`。
- 強制 `answerToastClose` 必須掛上 `hideAnswerToast()` 的 click listener。
- 強制 `board-renderer.js` 不得再 export `buildBoardTilePreviewDialog`，也不得在 `global.AiLabBoardRenderer = {...}` 中包含 `renderBoardMiniMap`。
- 強制 `ai-lab.js` 必須以 `AiLabBoardRenderer.renderBoardPanel(buildBoardRendererContext())` 形式呼叫，避免再退化成傳空 args 的 zombie 呼叫。
- **Round 3 新增**：`ai-lab.js` 內 `typeof X === 'function'` 防守上限 = 1（只允許 `getLockCode`）；`task-submit.js` 不得 gate `showQueryTransit / hideQueryTransit`；`captureFullFrameDataUrl(...)` 必須帶 `video` 或 `elements.video`；`playCameraFeedback({ shutterBtn, reticleCaptureHotspot })` 必須帶物件參數；`missionMode` 不得回流；17 個 inline 過的單呼叫 wrapper 不得回流；`zoomControl / dockZoomBtn / dockZoomPanel / .zoom-btn / toggleDockPanel('zoom')` 在 `ai-lab.js`、`id="zoomControl" / id="dockZoomBtn" / id="dockZoomPanel" / class="zoom-btn"` 在 `ai-lab.html` 都禁止回流；`dataUrlToBlob` 必須由 `task-submit.js` 自管，不得回到 `ai-lab.js`，也不得透過 ctx 傳遞。
- **Round 4-9 新增**：runtime state 不得以 `let` 形式回到 `ai-lab.js`，必須走 `AiLabRuntimeState`；nearby task 必須走 `AiLabNearbyTasks`；board session 必須走 `AiLabBoardSession`；task-flow 必須走 `AiLabTaskFlow`；story shell 的 `focusStoryTask`、`loadStoryShell`、`loadBoardShell`、`loadGameShellFromUrl`、`startTutorialHelper` 不得回流到 `ai-lab.js`，必須走 `AiLabStoryShell`；事件接線必須走 `AiLabEventBindings`，`handleTaskPhotoShutter`、`handleReticleCaptureAction` 與 `shutterBusy` 不得回流到 `ai-lab.js`。
- **Round 10 新增**：`public/js/ai-lab/analyze-flow.js` 必須存在、必須 export `AiLabAnalyzeFlow.createController`、必須 syntax ok；載入順序必須是 `vision-client.js < analyze-flow.js < ai-lab.js`；`ai-lab.js` 必須以 `window.AiLabAnalyzeFlow.createController({...}).bind()` 呼叫，不得再 inline `analyzeBtn.addEventListener('click', async ...)`；原本 inline handler 的 5 個特徵字串（`showQueryTransit('照片問題已摺成紙飛機送出...')`、`const imageToSend = await combinePhotosToGrid(capturedPhotos)`、`const result = await analyzePhotos(imageToSend, finalSystemPrompt, finalUserPrompt, gpsData)`、`playQueryReturnAnimation('AI 紙飛機帶回了答案')`、`playQueryReturnAnimation('紙飛機帶回了錯誤訊息')`）不得回到主檔。
- **Round 11 新增**：`public/js/ai-lab/photo-share.js` 必須存在並 export `AiLabPhotoShare.handleCaptureClick` 與 `shareOrDownloadDataUrl`；載入順序必須在 `ai-lab.js` 之前；`event-bindings.js` 的 `captureBtn` click handler 必須走 `AiLabPhotoShare.handleCaptureClick`；`event-bindings.js` 不得再 inline `navigator.share({ files: [file]`、`'ai-lab-${Date.now()}'`、`'image/jpeg'`、`win.document.write(\`<img src=`、`style="width:100%"` 這 5 個特徵字串。
- **Round 12 新增**：`public/js/ai-lab/task-submit.js` 必須同時存在 `submitPhotoAnswer`、`submitChoiceAnswer`、`submitTextAnswer`、`submitAiPhotoAnswer`、`uploadAttachedPhoto`、`dispatchAnswerViaApi`、`handleChoiceTutorialPassThrough`、`handleGenericTutorialPassThrough`、`triggerShakeError` 九個函式（缺一視為結構退化）；`task-submit.js` 不得再以 bare reference 方式使用 `setAnswerChoicePendingState(` 或 `lockMsg.textContent =`（必須透過 `ctx.setAnswerChoicePendingState` / `ctx.lockMsg`）。

## 下一輪建議

1. 前端 `ai-lab` controller 拆分已告一段落（runtime-state、nearby-tasks、board-session、task-flow、story-shell、event-bindings、analyze-flow、photo-share 都完成）。剩下要做的是：(a) 視覺回歸 smoke；(b) `ai-lab.html` 與 `ai-lab.js` 140+ `getElementById` 的映射 lint（撈 orphan id）；(c) 繼續拆 `task-submit.js` 的 `submitAiPhotoAnswer` 成 pass/fail 兩段（選做，風險收益不高）。不再新增大型 controller。
2. 拆 `ai-lab` 時以可替換邊界為單位：analyze-flow、assistant orchestration、mini-map setup。共享 runtime state 已集中在 `runtime-state.js`，新 controller 應直接使用它的 getter/setter 或 values，而不是新增平行 state。
3. 拆 photo-workflow 時順便把 `selectionMode === 'reticle'` 的常量 dead branch 收掉，並考慮把 `cameraCaptureMode` 的 `'task' | 'scene'` 改為枚舉常數。
4. 建立 domain repositories：`user-tasks.repository.js`、`ai-tasks.repository.js`、`board.repository.js`、`billing.repository.js`。
5. staff dashboard 只針對大型 view 做內部分層，不再動薄入口。
6. 補瀏覽器 smoke：確認 `ai-lab.html`、`staff-dashboard.html`、主要 CSS/JS module 可載入且首屏不空白。
7. 加一個輕量級的 `verify-html-js-binding.js`，掃描 `getElementById('X')` 與 `<button id="X">` 的對映表並挑出 orphan ID（zoom 面板就是這類問題的典型）。
8. 把 `captureBtn` click handler 的 50 行 share/download 邏輯抽到 `camera-capture.js` 或新的 `photo-share.js`。

## 判定

目前不是「全部正規化完成」，而是「主要骨架已正規化，胖客戶端持續以 controller 邊界降載，且 runtime state、nearby task、board session、task-flow、story-shell、event-bindings、analyze-flow、photo-share 八條邊界已建立，`task-submit.js` 內部也已子流程化」。剩下明確下一刀是 repository layer 與視覺回歸 smoke。這是健康狀態：可以繼續升級，但必須守住備忘錄與測試入口，避免再回到補丁式開發。
