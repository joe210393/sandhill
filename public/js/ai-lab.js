// ==========================================
// 全域工具函數 (Global Utils)
// ==========================================
const debugEl = document.getElementById('debugConsole');
const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
function log(msg) {
    console.log(msg);
    if (!debugEl) return;
    const previous = typeof debugEl.innerText === 'string' ? debugEl.innerText : '';
    debugEl.innerText = msg + '\n' + previous.substring(0, 100);
}

function normalizeUiText(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    return String(value).trim() || fallback;
}

// ==========================================
// 主程式 (Main Application)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 包裹在 try-catch 中以捕獲初始化錯誤
    try {
        log('DOM Ready - 初始化開始');

        const { initLockWheels, getLockCode, setAnswerChoicePendingState, setAnswerSubmitLoadingState, renderAnswerModal } = window.AiLabAnswerUi || {};
        const {
            updateGameShellProgress: renderGameShellProgressView,
            renderGameShellEntries: renderGameShellEntriesView
        } = window.AiLabBoardRenderer || {};
        const { getBoardTileMeta, inferBoardChallengeType } = window.AiLabBoardUtils || {};
        const { playCameraFeedback, captureFullFrameDataUrl } = window.AiLabCameraCapture || {};
        const { haversineDistance, calculateBearing } = window.AiLabGeo || {};
        const { toYouTubeEmbedUrl, setYouTubeFrameSource, pauseYouTubeFrame, getTaskVideoUrl } = window.AiLabMedia || {};
        const { requestJson } = window.AiLabNetwork || {};
        const { PROMPTS } = window.AiLabPrompts || {};
        const { taskUsesGps, getRequiredShots } = window.AiLabTaskRules || {};
        const { combinePhotosToGrid, analyzePhotos } = window.AiLabVisionClient || {};

        // ------------------------------------------------
        // 1. 設定與劇本 (Configuration & Prompts)
        // ------------------------------------------------
        // 任務劇本已移除，改為使用「新增任務」API 的任務（承接任務後由 currentTask 提供）

        // 覆寫自由探索模式的系統提示：改為單純介紹用，避免多步驟結構化輸出
        PROMPTS.free.system = `你是一位友善的自然與生活解說員。

你的任務：根據使用者提供的圖片，用簡單、好懂的中文介紹圈選區域裡的主要東西是什麼。

請遵守以下原則：
1. 先用 1～2 句話說明「這看起來是什麼」。
2. 接著最多再用 1～2 個短段落，補充外觀特徵、可能的用途、生活小知識或有趣的背景。
3. 回答只使用一般段落文字，不要使用任何 XML 標籤、JSON、程式碼區塊，也不要分步驟（不要寫「第一步」、「第二步」）。
4. 如果無法確定精確名稱，就用「看起來像是某種……」的方式描述，不要硬猜學名。

語氣請保持自然、親切、適合一般大眾閱讀。`;

        PROMPTS.free.user = "請用簡單、好懂的方式介紹這張照片圈選的東西，不需要列出分析步驟或結構化分析，只要直接說明是什麼以及一些有趣的小介紹。";

        // ------------------------------------------------
        // 2. 狀態變數 (State Variables) - 必須在函數前宣告
        // ------------------------------------------------
        const runtimeState = window.AiLabRuntimeState.createController();
        runtimeState.bindGlobals(window);
        // 注意：navigationWatchId / navigationPollTimer / deviceHeading /
        // lastHeading / headingSource / lastHeadingUpdateAt / lastGpsUpdateAt /
        // lastTaskDistance / lastTaskBearing / taskObjectVisible / taskReached /
        // bgmAutoStarted / orientationPermissionState 已搬入 AiLabGeoWatch controller，
        // 不要再在主檔重新宣告，請透過 geoWatch.* getter/setter 存取。
        let geoWatch = null;

        // ------------------------------------------------
        // 3. DOM 元素選取 (DOM Elements)
        // ------------------------------------------------
        const video = document.getElementById('cameraFeed');
        const canvas = document.getElementById('drawingCanvas');
        const ctx = canvas.getContext('2d');
        const instruction = document.querySelector('.instruction');
        const selectionInstruction = document.getElementById('selectionInstruction');
        const instructionText = document.getElementById('instructionText');
        const reticleOverlay = document.getElementById('reticleOverlay');
        const reticleCenterHint = document.getElementById('reticleCenterHint');
        const reticleCaptureHotspot = document.getElementById('reticleCaptureHotspot');
        const cameraCaptureBar = document.getElementById('cameraCaptureBar');
        const cameraModeTaskBtn = document.getElementById('cameraModeTaskBtn');
        const cameraModeSceneBtn = document.getElementById('cameraModeSceneBtn');
        const cameraTaskReopenBtn = document.getElementById('cameraTaskReopenBtn');
        const shutterBtn = document.getElementById('shutterBtn');
        const photoBasket = document.getElementById('photoBasket');
        const photoBasketThumb = document.getElementById('photoBasketThumb');
        const photoBasketCount = document.getElementById('photoBasketCount');
        const resultPanel = document.getElementById('resultPanel');
        const previewArea = document.getElementById('previewArea');
        const backBtn = document.getElementById('backBtn');
        const switchCameraBtn = document.getElementById('switchCameraBtn');
        const captureBtn = document.getElementById('captureBtn');
        const micBtn = document.getElementById('micBtn');
        const retryBtn = document.getElementById('retryBtn');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const addPhotoBtn = document.getElementById('addPhotoBtn');
        const aiLoading = document.getElementById('aiLoading');
        const loadingText = document.getElementById('loadingText');
        const aiResult = document.getElementById('aiResult');
        const rawOutput = document.getElementById('rawOutput');

        // 綁定 Thinking 控制器
        const {
            start: startThinkingAnimation,
            setStage: setThinkingStage,
            stop: stopThinkingAnimation,
            updateMessage: updateLoadingMessage
        } = window.AiLabThinking ? window.AiLabThinking.createThinkingController({
            loadingText
        }) : {};
        const photoSlots = document.querySelectorAll('.photo-slot');
        const photoHint = document.getElementById('photoHint');

        // Multi-photo state（後端為 LM-only / skip_rag，沒有需要補拍 RAG 流程）
        const capturedPhotos = [];
        const MIN_PHOTOS_TO_ANALYZE = 1;
        const MAX_PHOTOS = 3;
        // Director Panel Elements
        const directorToggle = document.getElementById('directorToggle');
        const directorPanel = document.getElementById('directorPanel');
        const systemPromptInput = document.getElementById('systemPrompt');
        const userPromptInput = document.getElementById('userPrompt');
        const modeBtns = document.querySelectorAll('.mode-btn');
        const uiLayer = document.querySelector('.ui-layer');
        const gameHud = document.querySelector('.game-hud');
        let langSelect = document.getElementById('langSelect');
        const voicePanel = document.getElementById('voicePanel');
        const floatingMicBtn = document.getElementById('floatingMicBtn');
        const voiceDraftInput = document.getElementById('voiceDraftInput');
        const voiceRecordBtn = document.getElementById('voiceRecordBtn');
        const voiceSendBtn = document.getElementById('voiceSendBtn');
        const voiceCloseBtn = document.getElementById('voiceCloseBtn');
        const voiceUser = document.getElementById('voiceUser');
        const voiceAi = document.getElementById('voiceAi');
        const voiceStatus = document.getElementById('voiceStatus');
        const voiceSpeakToggle = document.getElementById('voiceSpeakToggle');
        const queryTransit = document.getElementById('queryTransit');
        const queryTransitLabel = document.getElementById('queryTransitLabel');
        const answerToast = document.getElementById('answerToast');
        const answerToastText = document.getElementById('answerToastText');
        const answerToastClose = document.getElementById('answerToastClose');
        const cameraContainer = document.querySelector('.camera-container');
        const featureDock = document.getElementById('featureDock');
        const featureDockToggle = document.getElementById('featureDockToggle');
        const featureDockMenu = document.getElementById('featureDockMenu');
        const featureDrawerPanel = document.getElementById('featureDrawerPanel');
        const dockModeBtn = document.getElementById('dockModeBtn');
        const dockLangBtn = document.getElementById('dockLangBtn');
        const dockModePanel = document.getElementById('dockModePanel');
        const dockLangPanel = document.getElementById('dockLangPanel');
        let miniMapEl = document.getElementById('miniMap');
        let locationInfoEl = document.getElementById('locationInfo');
        let miniMapWrap = document.querySelector('.mini-map-wrap');
        let miniMapToggle = document.getElementById('miniMapToggle');
        let miniMapRefresh = document.getElementById('miniMapRefresh');
        let miniMapTaskIndicators = document.getElementById('miniMapTaskIndicators');
        const locationBar = document.getElementById('locationBar');
        const gameShellPanel = document.getElementById('gameShellPanel');
        const gameShellToggle = document.getElementById('gameShellToggle');
        const gameShellBtn = document.getElementById('gameShellBtn');
        const gameShellMode = document.getElementById('gameShellMode');
        const gameShellTitle = document.getElementById('gameShellTitle');
        const gameShellSummary = document.getElementById('gameShellSummary');
        const gameShellObjective = document.getElementById('gameShellObjective');
        const gameShellVideoWrap = document.getElementById('gameShellVideoWrap');
        const gameShellVideo = document.getElementById('gameShellVideo');
        const gameShellVideoFrame = document.getElementById('gameShellVideoFrame');
        const gameShellVideoError = document.getElementById('gameShellVideoError');
        const gameShellProgress = document.getElementById('gameShellProgress');
        const gameShellEntries = document.getElementById('gameShellEntries');
        const gameShellStartBtn = document.getElementById('gameShellStartBtn');
        const gameShellProgressBlock = document.getElementById('gameShellProgressBlock');
        const gameShellEntriesBlock = document.getElementById('gameShellEntriesBlock');
        const hudModeValue = document.getElementById('hudModeValue');
        const hudStageValue = document.getElementById('hudStageValue');
        const hudPointsValue = document.getElementById('hudPointsValue');
        const hudBadgesValue = document.getElementById('hudBadgesValue');
        const boardStatusCard = document.getElementById('boardStatusCard');
        const boardHudRound = document.getElementById('boardHudRound');
        const boardHudTile = document.getElementById('boardHudTile');
        const boardHudSession = document.getElementById('boardHudSession');
        const boardHudResult = document.getElementById('boardHudResult');
        const hudPanelBtn = document.getElementById('hudPanelBtn');
        const boardPanelBtn = document.getElementById('boardPanelBtn');
        const dockHudPanel = document.getElementById('dockHudPanel');
        const dockBoardPanel = document.getElementById('dockBoardPanel');
        const hudPanelSummary = document.getElementById('hudPanelSummary');
        const hudPanelNext = document.getElementById('hudPanelNext');
        const hudPanelRescue = document.getElementById('hudPanelRescue');
        const hudPanelStages = document.getElementById('hudPanelStages');
        const hudPanelBadges = document.getElementById('hudPanelBadges');
        const boardPanelAction = document.getElementById('boardPanelAction');
        const boardPanelTrack = document.getElementById('boardPanelTrack');
        const boardMapSelector = document.getElementById('boardMapSelector');
        const boardMapSelectorStatus = document.getElementById('boardMapSelectorStatus');
        const floatingDiceBtn = document.getElementById('floatingDiceBtn');
        const boardFocusBtn = document.getElementById('boardFocusBtn');
        const boardMiniMap = document.getElementById('boardMiniMap');
        const boardMiniMapDots = document.getElementById('boardMiniMapDots');
        const taskBgmBtn = document.getElementById('taskBgmBtn');
        const taskIntroBtn = document.getElementById('taskIntroBtn');
        const taskIntroPanel = document.getElementById('taskIntroPanel');
        const taskIntroTitle = document.getElementById('taskIntroTitle');
        const taskIntroCover = document.getElementById('taskIntroCover');
        const taskIntroDescription = document.getElementById('taskIntroDescription');
        const taskIntroVideoWrap = document.getElementById('taskIntroVideoWrap');
        const taskIntroVideo = document.getElementById('taskIntroVideo');
        const taskIntroVideoFrame = document.getElementById('taskIntroVideoFrame');
        const taskIntroVideoError = document.getElementById('taskIntroVideoError');
        const taskIntroSkip = document.getElementById('taskIntroSkip');
        const taskIntroClose = document.getElementById('taskIntroClose');
        const taskBgm = document.getElementById('taskBgm');
        const taskHudDock = document.getElementById('taskHudDock');
        const taskHudToggle = document.getElementById('taskHudToggle');
        const taskStatusBox = document.getElementById('taskStatusBox');
        const taskBearingValue = document.getElementById('taskBearingValue');
        const taskDistanceValue = document.getElementById('taskDistanceValue');
        const taskAngleValue = document.getElementById('taskAngleValue');
        const taskCoordsValue = document.getElementById('taskCoordsValue');
        const taskStatusLabel = document.getElementById('taskStatusLabel');
        const taskGuideArrow = document.getElementById('taskGuideArrow');
        const taskTargetObj = document.getElementById('taskTargetObj');
        const taskTargetImg = document.getElementById('taskTargetImg');
        const taskEncounterModal = document.getElementById('taskEncounterModal');
        const taskEncounterCover = document.getElementById('taskEncounterCover');
        const taskEncounterTitle = document.getElementById('taskEncounterTitle');
        const taskEncounterClose = document.getElementById('taskEncounterClose');
        const taskEncounterStart = document.getElementById('taskEncounterStart');
        const answerModal = document.getElementById('answerModal');
        const answerTaskName = document.getElementById('answerTaskName');
        const answerTaskDescription = document.getElementById('answerTaskDescription');
        const answerInputContainer = document.getElementById('answerInputContainer');
        const answerMessage = document.getElementById('answerMessage');
        const btnAnswerCancel = document.getElementById('btnAnswerCancel');
        const btnAnswerSubmit = document.getElementById('btnAnswerSubmit');
        const lockOverlay = document.getElementById('lockOverlay');
        const lockWheels = document.getElementById('lockWheels');
        const lockMsg = document.getElementById('lockMsg');
        const btnLockCancel = document.getElementById('btnLockCancel');
        const btnLockSubmit = document.getElementById('btnLockSubmit');
        const completionModal = document.getElementById('completionModal');
        const completionReward = document.getElementById('completionReward');
        const btnCompletionClose = document.getElementById('btnCompletionClose');
        const diceOverlay = document.getElementById('diceOverlay');
        const diceCube = document.getElementById('diceCube');
        const diceOverlayText = document.getElementById('diceOverlayText');
        const boardCardOverlay = document.getElementById('boardCardOverlay');
        const boardCardBadge = document.getElementById('boardCardBadge');
        const boardCardTitle = document.getElementById('boardCardTitle');
        const boardCardSubtitle = document.getElementById('boardCardSubtitle');
        const slotMachine = document.getElementById('slotMachine');
        const slotReelA = document.getElementById('slotReelA');
        const slotReelB = document.getElementById('slotReelB');
        const slotReelC = document.getElementById('slotReelC');
        const fortuneWheelWrap = document.getElementById('fortuneWheelWrap');
        const fortuneWheel = document.getElementById('fortuneWheel');
        const boardCardResult = document.getElementById('boardCardResult');
        const npcDialog = document.getElementById('npcDialog');
        const npcDialogPortrait = document.getElementById('npcDialogPortrait');
        const npcDialogSpeaker = document.getElementById('npcDialogSpeaker');
        const npcDialogMood = document.getElementById('npcDialogMood');
        const npcDialogText = document.getElementById('npcDialogText');
        const npcDialogClose = document.getElementById('npcDialogClose');

        const NPC_PROFILES = {
            guide: { name: '引路人・史蛋', portrait: '🥚', button: '知道了', theme: 'guide' },
            gatekeeper: { name: '潮汐關主・巴布', portrait: '🦀', button: '接受挑戰', theme: 'gatekeeper' },
            judge: { name: '潮汐裁判・鯨老', portrait: '🐋', button: '聽判定', theme: 'judge' },
            host: { name: '事件主持人・史蛋', portrait: '🥚', button: '繼續前進', theme: 'host' },
            rescue: { name: '救援員・巴布', portrait: '🦀', button: '重新整隊', theme: 'rescue' },
            lore: { name: '導覽員・鯨老', portrait: '🐋', button: '繼續聽', theme: 'lore' }
        };

        // 任務情境（來自 AR-VIEW／新增任務 API：由 URL taskId 載入；進入後先見相機，再自行找地點）
        // currentTask / currentBoardRun / currentEntryMode / lastLatLng 等共享狀態
        // 已由 AiLabRuntimeState 擁有。主檔保留同名 accessors 作為過渡層，
        // 後續拆 nearby-tasks / board-session / task-flow 時直接改讀 runtimeState。

        if (!video || !canvas) throw new Error('關鍵 DOM 元素遺失');

        // ------------------------------------------------
        // 4. 功能函數 (Functions)
        // ------------------------------------------------

        // 畫布調整
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            if (reticleRadius === 0) {
                reticleCenter.x = canvas.width / 2;
                reticleCenter.y = canvas.height / 2;
            }
            reticleRadius = Math.floor(0.35 * Math.min(canvas.width, canvas.height));
            updateReticlePosition();
            syncCompactUxState();
        }

        // 單手框選：更新取景框位置與大小
        function updateReticlePosition() {
            if (!reticleOverlay || !reticleRadius) return;
            const r = reticleRadius;
            reticleOverlay.style.width = (2 * r) + 'px';
            reticleOverlay.style.height = (2 * r) + 'px';
            reticleOverlay.style.left = reticleCenter.x + 'px';
            reticleOverlay.style.top = reticleCenter.y + 'px';
            reticleOverlay.style.transform = 'translate(-50%, -50%)';
        }

        // 取景框的邊界矩形（用於裁切）
        function getReticleRect() {
            return {
                minX: reticleCenter.x - reticleRadius,
                minY: reticleCenter.y - reticleRadius,
                maxX: reticleCenter.x + reticleRadius,
                maxY: reticleCenter.y + reticleRadius
            };
        }

        // ---------- 任務情境（AR-VIEW 整合：任務封面＋景點說明＋背景音樂）----------

        function buildHudContext() {
            return {
                featureDockMenu, featureDrawerPanel, taskStatusBox, voicePanel, answerToast,
                hudModeValue, hudStageValue, hudPointsValue, hudBadgesValue, boardStatusCard,
                boardHudRound, boardHudTile, boardHudSession, boardHudResult, hudPanelSummary,
                hudPanelNext, hudPanelRescue, hudPanelStages, hudPanelBadges, gameShellStartBtn,
                taskIntroTitle, taskIntroCover, taskIntroDescription, taskIntroBtn, taskTargetImg,
                gameShellObjective, taskIntroPanel, taskIntroVideo,
                currentEntryMode, currentTask, currentBoardRun, playerHudStats, currentStoryCompleted, currentStoryCompletedTaskIds,
                currentStoryTasks, useRemoteBoardSession, currentBoardSessionId, getBoardTileByIndex: window.AiLabBoardUtils ? window.AiLabBoardUtils.getBoardTileMeta : null,
                currentBoardMap, photoCaptureModeActive, resetPhotoCaptureState,
                loadTaskVideo: (task) => taskMediaController.loadTaskVideo(task),
                tryAutoPlayTaskBgm: (distance, options) => geoWatch.tryAutoPlayTaskBgm(distance, options),
                getTaskVideoUrl: window.AiLabMedia ? window.AiLabMedia.getTaskVideoUrl : null,
                exitFormalStoryIntroMode,
                pauseTaskMedia: () => taskMediaController.pauseTaskMedia(),
                isCurrentQuestTutorialMode, isCurrentQuestDemoMode, taskUsesGps: window.AiLabTaskRules ? window.AiLabTaskRules.taskUsesGps : null,
                deviceHeading: geoWatch ? geoWatch.getDeviceHeading() : 0,
                lastHeadingUpdateAt: geoWatch ? geoWatch.getLastHeadingUpdateAt() : 0,
                getTutorialMockBearing, getTutorialMockDistance, lastLatLng,
                taskHudDock, taskBearingValue, taskDistanceValue, taskAngleValue, taskCoordsValue, taskStatusLabel
            };
        }

        const AiLabHudManager = window.AiLabHudManager;
        function syncCompactUxState() { AiLabHudManager.init(buildHudContext()); return AiLabHudManager.syncCompactUxState(); }
        function renderHudSummary() { AiLabHudManager.init(buildHudContext()); return AiLabHudManager.renderHudSummary(); }
        function showTaskContext(task) { AiLabHudManager.init(buildHudContext()); return AiLabHudManager.showTaskContext(task); }
        function renderTaskMetrics(dist, bear) { AiLabHudManager.init(buildHudContext()); return AiLabHudManager.renderTaskMetrics(dist, bear); }
        function openTaskIntroPanel(opts) { AiLabHudManager.init(buildHudContext()); return AiLabHudManager.openTaskIntroPanel(opts); }
        function closeTaskIntroPanel(opts) { AiLabHudManager.init(buildHudContext()); return AiLabHudManager.closeTaskIntroPanel(opts); }
        function maybeAutoOpenTaskIntro(task) { AiLabHudManager.init(buildHudContext()); return AiLabHudManager.maybeAutoOpenTaskIntro(task); }
        function showStorySummaryPage() { AiLabHudManager.init(buildHudContext()); return AiLabHudManager.showStorySummaryPage(); }

        const AiLabBoardRenderer = window.AiLabBoardRenderer;
        function buildBoardRendererContext() {
            const pendingTargetTileIndex = currentBoardRun?.pendingTargetTile;
            return {
                elements: {
                    boardPanelAction, boardPanelTrack, floatingDiceBtn, boardFocusBtn,
                    boardMapSelector, boardMapSelectorStatus, boardMiniMap, boardMiniMapDots
                },
                currentEntryMode,
                currentBoardMap,
                currentBoardMaps,
                currentBoardTiles,
                currentBoardRun,
                pendingTile: pendingTargetTileIndex ? getBoardTileByIndex(pendingTargetTileIndex) : null,
                tutorialBoardMode: isCurrentQuestTutorialMode() && currentEntryMode === 'board_game',
                deps: { getBoardTileMeta, inferBoardChallengeType, getCircledStepLabel: window.AiLabBoardUtils?.getCircledStepLabel }
            };
        }
        function renderBoardPanel() { return AiLabBoardRenderer.renderBoardPanel(buildBoardRendererContext()); }
        function renderBoardMapSelector() {
            return AiLabBoardRenderer.renderBoardMapSelector({
                boardMapSelector, boardMapSelectorStatus, currentEntryMode, currentBoardMaps, currentBoardMap
            });
        }
        function updateGameShellProgress(activeEntry) {
            return renderGameShellProgressView({
                gameShellProgress,
                currentEntryMode,
                currentStoryTasks,
                currentStoryCompleted,
                currentBoardTiles,
                currentBoardMap,
                activeEntry
            });
        }
        function renderGameShellEntries(entries = [], activeId = null) {
            return renderGameShellEntriesView({
                gameShellEntries,
                entries,
                activeId,
                completedStoryIds: currentStoryCompletedTaskIds
            });
        }

        const taskMediaController = window.AiLabTaskMedia.createController({
            closeTaskIntroPanel,
            gameShellPanel,
            gameShellVideo,
            gameShellVideoError,
            gameShellVideoFrame,
            gameShellVideoWrap,
            getTaskVideoUrl,
            pauseYouTubeFrame,
            setBgmAutoStarted: (value) => { if (geoWatch) geoWatch.setBgmAutoStarted(value); },
            setYouTubeFrameSource,
            taskBgm,
            taskBgmBtn,
            taskIntroDescription,
            taskIntroPanel,
            taskIntroSkip,
            taskIntroVideo,
            taskIntroVideoError,
            taskIntroVideoFrame,
            taskIntroVideoWrap,
            toYouTubeEmbedUrl
        });
        const bindTaskVideoStatus = (...args) => taskMediaController.bindTaskVideoStatus(...args);
        const boardAnimations = window.AiLabBoardAnimations.createController({
            boardCardBadge,
            boardCardOverlay,
            boardCardResult,
            boardCardSubtitle,
            boardCardTitle,
            diceCube,
            diceOverlay,
            diceOverlayText,
            fortuneWheel,
            fortuneWheelWrap,
            getBoardTileMeta,
            slotMachine,
            slotReelA,
            slotReelB,
            slotReelC
        });
        const tutorialProgress = window.AiLabTutorialProgress.createController({
            getCurrentBoardMap: () => currentBoardMap,
            getCurrentEntryMode: () => currentEntryMode,
            getCurrentQuestChainId: () => currentQuestChainId,
            getCurrentStoryTasks: () => currentStoryTasks,
            getLoginUser: () => getLoginUser(),
            isTutorialGuestMode: () => isTutorialGuestMode(),
            requestJson,
            setCurrentStoryCompletedTaskIds: (value) => { currentStoryCompletedTaskIds = value; }
        });
        const completeTutorialGuestTask = (task) => tutorialProgress.completeTutorialGuestTask(task);
        const completeTutorialLoggedInTask = (task, answer) => tutorialProgress.completeTutorialLoggedInTask(task, answer);

        geoWatch = window.AiLabGeoWatch.createController({
            taskBgm,
            taskBgmBtn,
            taskGuideArrow,
            taskTargetObj,
            locationBar,
            taskCoordsValue,
            taskDistanceValue,
            taskStatusLabel,
            isCurrentQuestTutorialMode: () => isCurrentQuestTutorialMode(),
            isCurrentQuestDemoMode: () => isCurrentQuestDemoMode(),
            getTutorialMockDistance: (task) => getTutorialMockDistance(task),
            getTutorialMockBearing: (task) => getTutorialMockBearing(task),
            taskUsesGps: (task) => taskUsesGps(task),
            haversineDistance,
            calculateBearing,
            renderTaskMetrics: (...args) => renderTaskMetrics(...args),
            getCurrentTask: () => currentTask,
            getCurrentEntryMode: () => currentEntryMode,
            getLastLatLng: () => lastLatLng,
            setLastLatLng: (value) => { lastLatLng = value; },
            getTargetLat: () => targetLat,
            getTargetLng: () => targetLng,
            onPositionUpdate: (latitude, longitude) => {
                if (mapInstance) {
                    if (!mapMarker) {
                        mapMarker = L.marker([latitude, longitude]).addTo(mapInstance);
                    } else {
                        mapMarker.setLatLng([latitude, longitude]);
                    }
                    updateTaskMapViewport();
                }
            },
            closeTaskEncounter: () => closeTaskEncounter(),
            onDebugChange: () => renderTaskDebug()
        });
        const ensureOrientationPermission = () => geoWatch.ensureOrientationPermission();

        const assistantController = window.AiLabAssistant.createController({
            elements: {
                npcDialog,
                npcDialogText,
                npcDialogPortrait,
                npcDialogSpeaker,
                npcDialogMood,
                npcDialogClose,
                featureDockMenu,
                featureDockToggle,
                gameShellPanel,
                miniMapWrap,
                taskStatusBox,
                taskIntroPanel,
                taskHudToggle
            },
            isCurrentQuestTutorialMode: () => isCurrentQuestTutorialMode(),
            isCurrentQuestDemoMode: () => isCurrentQuestDemoMode(),
            isFormalStoryEntryMode: () => isFormalStoryEntryMode(),
            clearFormalStoryIntroMode: () => { formalStoryIntroMode = false; },
            renderTutorialUi: () => renderTutorialModeUi(),
            closeDockPanels: () => closeDockPanels(),
            getCurrentTask: () => currentTask,
            getTaskVideoUrl: (task) => getTaskVideoUrl(task),
            maybeAutoOpenTaskIntro: (task) => maybeAutoOpenTaskIntro(task)
        });
        const showNpcDialog = (opts) => assistantController.showNpcDialog(opts);
        const closeNpcDialog = (options) => assistantController.closeNpcDialog(options);
        const isNpcDialogBlocking = () => assistantController.isNpcDialogBlocking();









        function buildQuestContext() {
            return {
                currentQuestChainData,
                currentTask,
                getLoginUser
            };
        }

        const AiLabQuestContext = window.AiLabQuestContext;
        const isCurrentQuestDemoMode = () => { AiLabQuestContext.init(buildQuestContext()); return AiLabQuestContext.isCurrentQuestDemoMode(); }
        const isCurrentQuestTutorialMode = () => { AiLabQuestContext.init(buildQuestContext()); return AiLabQuestContext.isCurrentQuestTutorialMode(); }
        const isTutorialGuestMode = () => { AiLabQuestContext.init(buildQuestContext()); return AiLabQuestContext.isTutorialGuestMode(); }
        const getTutorialMockDistance = (task = currentTask) => { AiLabQuestContext.init(buildQuestContext()); return AiLabQuestContext.getTutorialMockDistance(task); }
        const getTutorialMockBearing = (task = currentTask) => { AiLabQuestContext.init(buildQuestContext()); return AiLabQuestContext.getTutorialMockBearing(task); }
        function isGuidedReticleLockMode() {
            return Boolean(
                selectionMode === 'reticle'
                && isCurrentQuestTutorialMode()
                && currentTask?.task_type === 'photo'
            );
        }

        function isPhotoTaskCaptureActive() {
            return Boolean(photoCaptureModeActive && currentTask?.task_type === 'photo');
        }


        function shouldShowPhotoBasket() {
            return isPhotoTaskCaptureActive() && getRequiredShots(currentTask) > 1;
        }


        function updatePhotoBasketUi() {
            if (!photoBasket || !photoBasketThumb || !photoBasketCount) return;
            const requiredShots = getRequiredShots(currentTask);
            const count = capturedPhotos.length;
            photoBasket.classList.toggle('hidden', !shouldShowPhotoBasket());
            photoBasketCount.textContent = `${Math.min(count, requiredShots)}/${requiredShots}`;
            if (count > 0) {
                photoBasketThumb.classList.add('has-photo');
                photoBasketThumb.style.backgroundImage = `url("${capturedPhotos[count - 1]}")`;
                photoBasketThumb.textContent = '';
            } else {
                photoBasketThumb.classList.remove('has-photo');
                photoBasketThumb.style.backgroundImage = '';
                photoBasketThumb.textContent = '＋';
            }
        }

        function setImmersiveCameraMode(active) {
            window.AiLabCameraCapture.setImmersiveCameraMode(active, {
                cameraCaptureBar,
                cameraTaskReopenBtn,
                photoBasket,
                updatePhotoBasketUi
            });
        }

        function setCameraCaptureMode(mode = 'task') {
            cameraCaptureMode = window.AiLabCameraCapture.setCameraCaptureMode(mode, {
                cameraCaptureBar,
                cameraModeSceneBtn,
                cameraModeTaskBtn,
                instructionText,
                isPhotoTaskCaptureActive,
                reticleCaptureHotspot,
                reticleCenterHint,
                reticleOverlay,
                setSelectionMode: (nextMode) => { selectionMode = nextMode; }
            });
        }

        async function buildPhotoSubmissionDataUrl() {
            if (capturedPhotos.length > 1) {
                return await combinePhotosToGrid(capturedPhotos);
            }
            return capturedPhotos[0] || currentAnswerPhotoDataUrl || null;
        }

        function resetPhotoCaptureState({ keepActive = false } = {}) {
            capturedPhotos.length = 0;
            currentAnswerPhotoDataUrl = null;
            pendingPhotoDataUrl = null;
            const preview = document.getElementById('answerPhotoPreview');
            if (preview) {
                preview.removeAttribute('src');
                preview.style.display = 'none';
            }
            const input = document.getElementById('answerPhotoInput');
            if (input) {
                input.value = '';
            }
            if (!keepActive) {
                photoCaptureModeActive = false;
                tutorialBoardPhotoCaptureArmed = false;
                setImmersiveCameraMode(false);
            }
            updatePhotoBasketUi();
        }

        function isFormalStoryEntryMode() {
            return currentEntryMode === 'story_campaign'
                && !isCurrentQuestTutorialMode()
                && !isCurrentQuestDemoMode();
        }

        function setFormalStoryIntroMode(active) {
            formalStoryIntroMode = Boolean(active) && isFormalStoryEntryMode();
            if (formalStoryIntroMode) {
                closeDockPanels();
                featureDockMenu?.classList.add('hidden');
                if (featureDockToggle) featureDockToggle.textContent = '☰';
                gameShellPanel?.classList.add('collapsed');
                miniMapWrap?.classList.add('collapsed');
                taskStatusBox?.classList.add('hidden');
                taskIntroPanel?.classList.add('hidden');
                if (taskHudToggle) taskHudToggle.setAttribute('aria-expanded', 'false');
            }
            renderTutorialModeUi();
        }

        function exitFormalStoryIntroMode() {
            if (!formalStoryIntroMode) return;
            formalStoryIntroMode = false;
            renderTutorialModeUi();
        }

        function renderTutorialModeUi() {
            const isTutorialStory = currentEntryMode === 'story_campaign' && isCurrentQuestTutorialMode();
            const isTutorialBoard = currentEntryMode === 'board_game' && isCurrentQuestTutorialMode();
            const shouldHideTutorialChrome = isTutorialStory || isTutorialBoard;
            const shouldHideFormalStoryChrome = formalStoryIntroMode && isFormalStoryEntryMode();
            const isPhotoCapture = isPhotoTaskCaptureActive();
            const shouldHideFormalStoryTaskCard = (
                currentEntryMode === 'story_campaign'
                && !isCurrentQuestTutorialMode()
                && !isCurrentQuestDemoMode()
                && isPhotoCapture
            );
            const shouldHidePrimaryCard = shouldHideTutorialChrome && (
                tutorialFlowStarted
                || isNpcDialogBlocking()
                || !answerModal?.classList.contains('hidden')
                || !completionModal?.classList.contains('hidden')
                || !lockOverlay?.classList.contains('hidden')
                || tutorialBoardPhotoCaptureArmed
            );
            gameShellPanel?.classList.toggle('tutorial-mode', shouldHideTutorialChrome);
            gameShellPanel?.classList.toggle('tutorial-hidden-card', shouldHidePrimaryCard);
            if (gameShellPanel && isTutorialBoard) {
                const shouldCompactBoardShell = Boolean(currentBoardRun?.round || currentBoardRun?.pendingTargetTile || currentBoardActiveTileId);
                gameShellPanel.classList.toggle('collapsed', shouldCompactBoardShell);
            }
            if (gameShellPanel) {
                gameShellPanel.setAttribute('aria-hidden', shouldHidePrimaryCard ? 'true' : 'false');
            }
            miniMapWrap?.classList.toggle('tutorial-hidden', isTutorialStory);
            featureDock?.classList.toggle('tutorial-hidden', isTutorialStory);
            selectionInstruction?.classList.toggle('tutorial-hidden', isTutorialStory);
            floatingMicBtn?.classList.toggle('tutorial-hidden', shouldHideTutorialChrome);
            gameHud?.classList.toggle('tutorial-hidden', isTutorialStory);
            document.querySelector('.game-shell-board-status')?.classList.toggle('tutorial-hidden', isTutorialBoard);
            document.querySelector('.mini-selection-toolbar')?.classList.toggle('tutorial-hidden', shouldHideTutorialChrome);
            document.body.classList.toggle('tutorial-board-clean', isTutorialBoard);
            document.body.classList.toggle('tutorial-story-clean', isTutorialStory);
            document.body.classList.toggle('formal-story-clean', shouldHideFormalStoryChrome);
            document.body.classList.toggle('formal-story-capture-clean', shouldHideFormalStoryTaskCard);
            featureDockMenu?.classList.toggle('hidden', !isTutorialBoard);
            setImmersiveCameraMode(isPhotoCapture);
            if (shouldHideFormalStoryTaskCard) {
                closeDockPanels();
                taskStatusBox?.classList.add('hidden');
                taskIntroPanel?.classList.add('hidden');
                if (taskHudToggle) taskHudToggle.setAttribute('aria-expanded', 'false');
            }
            if (selectionInstruction) {
                if (!isPhotoCapture) {
                    selectionInstruction.style.display = 'none';
                } else if (isTutorialStory) {
                    selectionInstruction.style.display = 'none';
                } else if (currentTask?.task_type === 'photo') {
                    selectionInstruction.style.display = '';
                } else if (isTutorialBoard) {
                    selectionInstruction.style.display = 'none';
                } else {
                    selectionInstruction.style.display = '';
                }
                selectionInstruction.style.opacity = currentTask?.task_type === 'photo' && isPhotoCapture
                    ? '1'
                    : (shouldHideTutorialChrome ? '0' : '1');
            }
            if (reticleCenterHint) {
                reticleCenterHint.classList.toggle('hidden', !(isPhotoCapture && cameraCaptureMode === 'task'));
            }
            if (reticleCaptureHotspot) {
                reticleCaptureHotspot.classList.toggle('hidden', !(isPhotoCapture && cameraCaptureMode === 'task'));
            }
            if (reticleOverlay) {
                reticleOverlay.classList.toggle('hidden', !(isPhotoCapture && cameraCaptureMode === 'task'));
            }
            if (locationBar) {
                locationBar.style.display = (shouldHideTutorialChrome || shouldHideFormalStoryChrome) ? 'none' : '';
            }

            if (isTutorialBoard && tutorialBoardPhotoCaptureArmed) {
                closeDockPanels();
            }

            if (isGuidedReticleLockMode() && canvas?.width && canvas?.height) {
                reticleCenter.x = canvas.width / 2;
                reticleCenter.y = canvas.height / 2;
                updateReticlePosition();
            }

            if (canvas) {
                canvas.style.pointerEvents = isGuidedReticleLockMode() || isPhotoTaskCaptureActive() ? 'none' : '';
            }

            if (gameShellProgressBlock) {
                gameShellProgressBlock.style.display = shouldHideTutorialChrome ? 'none' : '';
            }
            if (gameShellEntriesBlock) {
                gameShellEntriesBlock.style.display = shouldHideTutorialChrome ? 'none' : '';
            }
            if (gameShellToggle) {
                gameShellToggle.textContent = shouldHideTutorialChrome ? '教學' : '任務';
            }

            const shouldShowExitBtn = (currentEntryMode === 'story_campaign' || currentEntryMode === 'board_game') && isPhotoCapture;
            let exitBtn = document.getElementById('shellExitBtn');
            if (shouldShowExitBtn && !exitBtn) {
                exitBtn = document.createElement('button');
                exitBtn.id = 'shellExitBtn';
                exitBtn.className = 'tutorial-exit-btn';
                exitBtn.addEventListener('click', () => {
                    const modeLabel = isCurrentQuestTutorialMode()
                        ? '教學模式'
                        : currentEntryMode === 'board_game'
                            ? '目前玩法'
                            : '目前劇情';
                    if (confirm(`確定要退出${modeLabel}嗎？`)) {
                        window.location.href = '/index.html';
                    }
                });
                (cameraContainer || document.body).appendChild(exitBtn);
            }
            if (shouldShowExitBtn && exitBtn) {
                exitBtn.textContent = isCurrentQuestTutorialMode()
                    ? '退出教學'
                    : currentEntryMode === 'board_game'
                        ? '退出玩法'
                        : '退出劇情';
            } else if (!shouldShowExitBtn && exitBtn) {
                exitBtn.remove();
            }
            syncCompactUxState();
        }


        function getStoryIntroSpeaker(task) {
            if (!task) return 'guide';
            if (task.task_type === 'location') return 'host';
            if (task.task_type === 'photo') return 'gatekeeper';
            if (task.task_type === 'multiple_choice' || task.task_type === 'keyword' || task.task_type === 'number') return 'lore';
            return 'guide';
        }

        function buildStoryIntroDialogue(task) {
            if (!task) return '新的冒險正在成形。';
            const parts = [];
            if (task.stage_intro) parts.push(task.stage_intro);
            else if (task.description) parts.push(task.description);
            else parts.push(`第 ${task.quest_order || '?'} 關已展開，請準備進入下一段旅程。`);

            if (task.hint_text) {
                parts.push(`線索：${task.hint_text}`);
            }
            if (isCurrentQuestTutorialMode() || isCurrentQuestDemoMode()) {
                if (task.quest_order === 1 || task.quest_order === '1') {
                    parts.push('你現在進入的是教學模式，所有關卡都會自動通過，正式遊玩時需要實際完成挑戰。');
                }
            }
            return parts.join('\n\n');
        }

        async function loadPlayerHudStats() {
            if (!getLoginUser()) {
                playerHudStats = { points: null, badges: [] };
                renderHudSummary();
                return;
            }
            try {
                const [pointsRes, badgesRes] = await Promise.all([
                    fetch('/api/user/points', { credentials: 'include' }),
                    fetch('/api/user/badges', { credentials: 'include' })
                ]);

                if (pointsRes.ok) {
                    const pointsData = await pointsRes.json();
                    if (pointsData.success) {
                        playerHudStats.points = Number(pointsData.totalPoints || 0);
                    }
                }

                if (badgesRes.ok) {
                    const badgesData = await badgesRes.json();
                    if (badgesData.success && Array.isArray(badgesData.badges)) {
                        playerHudStats.badges = badgesData.badges;
                    }
                }
            } catch (err) {
                console.warn('讀取玩家 HUD 資訊失敗', err);
            } finally {
                renderHudSummary();
            }
        }

        function getBoardTileByIndex(tileIndex) {
            return currentBoardTiles.find((tile) => Number(tile.tile_index) === Number(tileIndex)) || null;
        }

        const boardSession = window.AiLabBoardSession.createController({
            applyTaskSelection: (task, options) => applyTaskSelection(task, options),
            boardAnimations,
            closeDockPanels,
            closePassiveNpcDialog: () => {
                if (npcDialog && npcDialog.classList.contains('passive') && !npcDialog.classList.contains('hidden')) {
                    closeNpcDialog();
                }
            },
            getBoardTileByIndex,
            getBoardTileMeta,
            getGameShellObjective: () => gameShellObjective,
            getLoginUser,
            inferBoardChallengeType,
            isCurrentQuestDemoMode,
            isCurrentQuestTutorialMode,
            loadPlayerHudStats,
            renderBoardPanel,
            renderGameShellEntries,
            renderHudSummary,
            runtimeState,
            showNpcDialog,
            startTaskInteraction: () => startTaskInteraction(),
            tutorialProgress,
            updateGameShellProgress
        });
        const hydrateBoardRunState = () => boardSession.hydrateBoardRunState();
        const syncBoardMapQuery = (boardMapId) => boardSession.syncBoardMapQuery(boardMapId);
        const showBoardTilePreview = (tile) => boardSession.showBoardTilePreview(tile);
        const completeBoardTurn = (success, options) => boardSession.completeBoardTurn(success, options);
        const startBoardTurn = () => boardSession.startBoardTurn();
        const focusBoardTile = (tile) => boardSession.focusBoardTile(tile);



        function updateShellModeUi() {
            syncTaskEncounterVisibility();
            if (!dockModeBtn) return;
            dockModeBtn.classList.toggle('hidden', isShellExperience);
            if (dockModePanel) {
                dockModePanel.classList.toggle('hidden', isShellExperience);
            }
            if (boardPanelBtn) {
                boardPanelBtn.classList.toggle('hidden', currentEntryMode !== 'board_game');
            }
            if (isShellExperience) {
                modeBtns.forEach((btn) => {
                    btn.disabled = true;
                });
            } else {
                modeBtns.forEach((btn) => {
                    btn.disabled = false;
                });
            }
        }

        function getLoginUser() {
            try { return JSON.parse(localStorage.getItem('loginUser') || 'null'); } catch (e) {}
            try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) {}
            return null;
        }

        let taskFlow = null;
        const createCurrentUserTaskRecord = () => taskFlow.createCurrentUserTaskRecord();
        const fetchCurrentUserTaskId = () => taskFlow.fetchCurrentUserTaskId();



        function renderTaskDebug() {
            if (!debugMode) return;
            console.log('Task debug state', {
                currentTaskId,
                currentUserTaskId,
                currentQuestChainId,
                orientationPermissionState: geoWatch ? geoWatch.getOrientationPermissionState() : 'idle',
                currentMode
            });
        }

        function closeDockPanels() {
            if (featureDrawerPanel) featureDrawerPanel.classList.add('hidden');
            if (dockModePanel) dockModePanel.classList.add('hidden');
            if (dockLangPanel) dockLangPanel.classList.add('hidden');
            if (dockHudPanel) dockHudPanel.classList.add('hidden');
            if (dockBoardPanel) dockBoardPanel.classList.add('hidden');
            syncCompactUxState();
        }

        function toggleDockPanel(panelName) {
            const panels = {
                mode: dockModePanel,
                lang: dockLangPanel,
                hud: dockHudPanel,
                board: dockBoardPanel
            };
            const panel = panels[panelName];
            if (!panel || !featureDrawerPanel) return;
            const willOpen = panel.classList.contains('hidden');
            closeDockPanels();
            if (willOpen) {
                featureDrawerPanel.classList.remove('hidden');
                panel.classList.remove('hidden');
            }
            syncCompactUxState();
        }


        function updateTaskMapViewport() {
            if (!mapInstance) return;
            const points = [];
            if (lastLatLng && Number.isFinite(lastLatLng.latitude) && Number.isFinite(lastLatLng.longitude)) {
                points.push([lastLatLng.latitude, lastLatLng.longitude]);
            }
            if (targetLat && targetLng) {
                points.push([targetLat, targetLng]);
            }
            nearbyVisibleTasks.slice(0, 8).forEach((task) => {
                if (Number.isFinite(task.lat) && Number.isFinite(task.lng)) {
                    points.push([task.lat, task.lng]);
                }
            });
            if (!points.length) return;
            const bounds = L.latLngBounds(points[0], points[0]);
            for (let i = 1; i < points.length; i += 1) {
                bounds.extend(points[i]);
            }
            mapInstance.fitBounds(bounds, { padding: [28, 28], maxZoom: points.length === 1 ? 17 : 16 });
        }

        function loadTaskFromUrl() {
            const params = new URLSearchParams(window.location.search);
            const taskId = params.get('taskId');
            if (!taskId) {
                loadDefaultVisibleTaskForUser();
                return;
            }
            currentTaskId = taskId;
            targetLat = parseFloat(params.get('lat'));
            targetLng = parseFloat(params.get('lng'));
            fetch(`/api/tasks/${taskId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.task) {
                        applyTaskSelection(data.task, { updateUrl: false });
                    }
                })
                .catch(err => console.error('載入任務失敗:', err));
        }

        function openTaskEncounter() {
            if (!currentTask || !taskEncounterModal) return;
            if (currentEntryMode !== 'board_game') return;
            if (taskEncounterCover) {
                const coverSrc = currentTask.ar_image_url || currentTask.photoUrl || currentTask.photo_url || '/images/mascot.png';
                taskEncounterCover.onerror = () => {
                    taskEncounterCover.onerror = null;
                    taskEncounterCover.src = '/images/mascot.png';
                };
                taskEncounterCover.src = coverSrc;
            }
            if (taskEncounterTitle) {
                taskEncounterTitle.textContent = currentTask.name || '任務';
            }
            if (taskEncounterStart) {
                if (currentTask.task_type === 'location') taskEncounterStart.textContent = '📍 開始打卡';
                else if (currentTask.task_type === 'number') taskEncounterStart.textContent = '🔒 開始解鎖';
                else taskEncounterStart.textContent = '✍️ 開始答題';
            }
            taskEncounterModal.classList.remove('hidden');
        }

        function closeTaskEncounter() {
            if (taskEncounterModal) taskEncounterModal.classList.add('hidden');
            if (taskEncounterCover) taskEncounterCover.onerror = null;
        }

        function syncTaskEncounterVisibility() {
            if (currentEntryMode !== 'board_game') {
                closeTaskEncounter();
                if (geoWatch) geoWatch.setTaskObjectVisible(false);
                if (taskTargetObj) taskTargetObj.classList.add('hidden');
                if (taskGuideArrow) taskGuideArrow.classList.add('hidden');
            }
        }



        function showCompletionModal(message) {
            if (!completionModal) return;
            if (npcDialog && !npcDialog.classList.contains('hidden')) {
                closeNpcDialog();
            }
            if (completionReward) completionReward.innerHTML = message || '✅ 任務已完成';
            completionModal.classList.remove('hidden');
            
            const card = completionModal.querySelector('.completion-card');
            if (card) {
                card.classList.remove('stamp-success');
                void card.offsetWidth; // trigger reflow
                card.classList.add('stamp-success');
            }

            renderTutorialModeUi();
            loadPlayerHudStats();
        }

        function scheduleStoryReloadAfterCompletion() {
            pendingStoryReloadAfterCompletion = Boolean(currentEntryMode === 'story_campaign' && currentQuestChainId);
        }

        const createTutorialFallbackCapture = () => taskFlow.createTutorialFallbackCapture();
        const refreshAnswerPhotoFromReticle = () => taskFlow.refreshAnswerPhotoFromReticle();
        const applyAnswerSubmitLoadingState = (isLoading, pendingLabel) => taskFlow.applyAnswerSubmitLoadingState(isLoading, pendingLabel);
        const resetAnswerSubmitUi = () => taskFlow.resetAnswerSubmitUi();
        const showAnswerModal = (task) => taskFlow.showAnswerModal(task);
        const buildSubmitContext = () => taskFlow.buildSubmitContext();
        const submitTaskAnswer = () => taskFlow.submitTaskAnswer();
        const submitLockCode = () => taskFlow.submitLockCode();
        const enterPhotoCaptureFlow = () => taskFlow.enterPhotoCaptureFlow();
        const reopenTaskFromCaptureMode = () => taskFlow.reopenTaskFromCaptureMode();
        const startTaskInteraction = () => taskFlow.startTaskInteraction();

        const photoCaptureUtils = window.AiLabPhotoCaptureUtils.createController({
            addPhotoToCollection: (dataUrl) => photoWorkflow.addPhotoToCollection(dataUrl),
            aiResult,
            canvas,
            getReticleRect,
            showCaptureError: (error) => {
                aiResult.innerHTML = '<span style="color:red">截圖失敗: ' + error.message + '</span>';
            },
            showResultPanel: () => photoWorkflow.showResultPanel(),
            video
        });
        const captureCurrentReticleDataUrl = () => photoCaptureUtils.captureCurrentReticleDataUrl();
        const processSelectionFromRect = (...args) => photoCaptureUtils.processSelectionFromRect(...args);
        taskFlow = window.AiLabTaskFlow.createController({
            answerElements: {
                answerInputContainer,
                answerMessage,
                answerModal,
                answerTaskDescription,
                answerTaskName,
                btnAnswerSubmit
            },
            buildStoryIntroDialogue,
            capturedPhotos,
            captureCurrentReticleDataUrl,
            closeDockPanels,
            closeNpcDialog: () => {
                if (npcDialog && !npcDialog.classList.contains('hidden')) closeNpcDialog();
            },
            closeTaskEncounter,
            closeTaskIntroPanel,
            completeBoardTurn,
            completeTutorialGuestTask,
            completeTutorialLoggedInTask,
            expandGameShellPanel: () => gameShellPanel?.classList.remove('collapsed'),
            getLoginUser,
            getRequiredShots,
            getStoryIntroSpeaker,
            haversineDistance,
            hideQueryTransit,
            hideSelectionInstruction: () => {
                if (selectionInstruction) selectionInstruction.style.display = 'none';
            },
            hideTaskTargetObject: () => taskTargetObj?.classList.add('hidden'),
            initLockWheels,
            isCurrentQuestDemoMode,
            isCurrentQuestTutorialMode,
            isTutorialGuestMode,
            lockElements: {
                getLockCode,
                lockMsg,
                lockOverlay,
                lockWheels
            },
            normalizeUiText,
            openTaskEncounter,
            renderAnswerModal,
            renderTutorialModeUi,
            requestJson,
            runtimeState,
            scheduleStoryReloadAfterCompletion,
            setAnswerChoicePendingState,
            setAnswerSubmitLoadingState,
            setCameraCaptureMode,
            setImmersiveCameraMode,
            setTaskObjectVisible: (visible) => geoWatch?.setTaskObjectVisible(visible),
            showCompletionModal,
            showNpcDialog,
            showQueryTransit,
            taskUsesGps,
            updatePhotoBasketUi
        });

        const languageController = window.AiLabLanguage.createController({
            getCurrentMode: () => currentMode,
            getCurrentTask: () => currentTask,
            langSelect,
            prompts: PROMPTS,
            systemPromptInput,
            userPromptInput
        });
        const getActiveScript = () => languageController.getActiveScript();
        const getLanguageInstruction = () => languageController.getLanguageInstruction();
        const getSpeechLocale = () => languageController.getSpeechLocale();

        function setMode(mode, showIntro = true) {
            currentMode = mode === 'mission' ? 'mission' : 'free';
            modeBtns.forEach((btn) => {
                const active = btn.dataset.mode === currentMode;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            languageController.applyScript(getActiveScript(), showIntro);
            syncCompactUxState();
        }

        function buildQueryUiContext() {
            return {
                queryTransit,
                queryTransitLabel,
                answerToast,
                answerToastText,
                resultPanel,
                selectionInstruction,
                syncCompactUxState
            };
        }

        const AiLabQueryUi = window.AiLabQueryUi;
        function showQueryTransit(message) { AiLabQueryUi.init(buildQueryUiContext()); return AiLabQueryUi.showQueryTransit(message); }
        function hideQueryTransit() { AiLabQueryUi.init(buildQueryUiContext()); return AiLabQueryUi.hideQueryTransit(); }
        async function playQueryReturnAnimation(message) { AiLabQueryUi.init(buildQueryUiContext()); return AiLabQueryUi.playQueryReturnAnimation(message); }
        function showAnswerToast(text) { AiLabQueryUi.init(buildQueryUiContext()); return AiLabQueryUi.showAnswerToast(text); }
        function hideAnswerToast() { AiLabQueryUi.init(buildQueryUiContext()); return AiLabQueryUi.hideAnswerToast(); }
        function collapseResultPanel() { AiLabQueryUi.init(buildQueryUiContext()); return AiLabQueryUi.collapseResultPanel(); }
        const analyzeVisionQuestion = (...args) => window.AiLabVisionQuestion.analyzeVisionQuestion(...args);

        const voiceChatController = window.AiLabVoiceChat.createController({
            micBtn,
            floatingMicBtn,
            voicePanel,
            voiceDraftInput,
            voiceRecordBtn,
            voiceSendBtn,
            voiceCloseBtn,
            voiceUser,
            voiceAi,
            voiceStatus,
            voiceSpeakToggle,
            systemPromptInput,
            normalizeUiText,
            syncCompactUxState,
            getSpeechLocale,
            getLanguageInstruction,
            getActiveScript,
            captureCurrentReticleDataUrl,
            analyzeVisionQuestion,
            showQueryTransit,
            hideQueryTransit,
            playQueryReturnAnimation,
            showAnswerToast,
            hideAnswerToast,
            getLocationText: () => lastLocationText || (lastLatLng ? '緯度 ' + lastLatLng.latitude.toFixed(5) + '，經度 ' + lastLatLng.longitude.toFixed(5) : ''),
            setLastLatLng: (value) => { lastLatLng = value; }
        });
        function stopVoiceRecognition() { return voiceChatController.stopVoiceRecognition(); }

        // 位置與地圖

        
        const AiLabMiniMapUi = window.AiLabMiniMapUi;
        function ensureMiniMapElements() {
            const els = AiLabMiniMapUi.ensureMiniMapElements({ miniMapEl, locationInfoEl, cameraContainer, log: console.log });
            if (els) {
                miniMapEl = els.miniMapEl;
                locationInfoEl = els.locationInfoEl;
                miniMapWrap = els.miniMapWrap;
                miniMapToggle = els.miniMapToggle;
                miniMapRefresh = els.miniMapRefresh;
                miniMapTaskIndicators = els.miniMapTaskIndicators;
            }
        }
        function updateLocationText(text) { return AiLabMiniMapUi.updateLocationText(text, { locationInfoEl, locationBar }); }
        const nearbyTasks = window.AiLabNearbyTasks.createController({
            calculateBearing,
            getMiniMapTaskIndicators: () => miniMapTaskIndicators,
            getLoginUser,
            haversineDistance,
            loadTaskBGM: (task) => taskMediaController.loadTaskBGM(task),
            runtimeState,
            setMode,
            showTaskContext,
            startTaskNavigation: () => geoWatch.startTaskNavigation(),
            syncTaskEncounterVisibility,
            taskUsesGps,
            updateTaskMapViewport
        });
        const fetchQuestProgressMap = () => nearbyTasks.fetchQuestProgressMap();
        const loadNearbyVisibleTasks = () => nearbyTasks.loadNearbyVisibleTasks();
        const applyTaskSelection = (task, options) => nearbyTasks.applyTaskSelection(task, options);
        const loadDefaultVisibleTaskForUser = () => nearbyTasks.loadDefaultVisibleTaskForUser();
        const updateMiniMapTaskIndicators = () => nearbyTasks.updateMiniMapTaskIndicators();

        const storyShell = window.AiLabStoryShell.createController({
            applyTaskSelection: (task, options) => applyTaskSelection(task, options),
            buildStoryIntroDialogue,
            elements: { gameShellEntries, gameShellMode, gameShellObjective, gameShellPanel, gameShellProgress, gameShellSummary, gameShellTitle },
            fetchQuestProgressMap,
            focusBoardTile,
            getBoardTileByIndex,
            getStoryIntroSpeaker,
            hydrateBoardRunState,
            isCurrentQuestDemoMode,
            isCurrentQuestTutorialMode,
            loadPlayerHudStats,
            renderBoardMapSelector,
            renderGameShellEntries,
            renderHudSummary,
            renderTutorialModeUi,
            runtimeState,
            setFormalStoryIntroMode,
            showNpcDialog,
            syncBoardMapQuery,
            tutorialProgress,
            updateGameShellProgress,
            updateShellModeUi
        });
        const focusStoryTask = (task) => storyShell.focusStoryTask(task);
        const loadStoryShell = (questChainId, previewMode) => storyShell.loadStoryShell(questChainId, previewMode);
        const loadBoardShell = (questChainId, preferredBoardMapId, previewMode) => storyShell.loadBoardShell(questChainId, preferredBoardMapId, previewMode);
        const loadGameShellFromUrl = () => storyShell.loadGameShellFromUrl();
        const startTutorialHelper = () => storyShell.startTutorialHelper();

        function initMiniMap() {
            ensureMiniMapElements();
            if (!miniMapEl) {
                log('找不到地圖容器，略過地圖顯示');
                return;
            }
            if (miniMapWrap && miniMapToggle) {
                AiLabMiniMapUi.initMiniMapToggle({ miniMapToggle, miniMapWrap, miniMapRefresh });
            }
            updateLocationText('定位中...');
            requestLocation();
            if (!window.L) {
                log('Leaflet 未載入，僅顯示位置文字');
                return;
            }

            // 先用較合理的預設中心：玩家位置 > 任務位置 > 台北市
            let initialCenter = [25.0330, 121.5654];
            let initialZoom = 13;
            if (lastLatLng && Number.isFinite(lastLatLng.latitude) && Number.isFinite(lastLatLng.longitude)) {
                initialCenter = [lastLatLng.latitude, lastLatLng.longitude];
                initialZoom = 15;
            } else if (targetLat && targetLng) {
                initialCenter = [targetLat, targetLng];
                initialZoom = 15;
            }

            mapInstance = L.map(miniMapEl, {
                zoomControl: false,
                attributionControl: false,
                dragging: true,
                scrollWheelZoom: false,
                doubleClickZoom: true,
                boxZoom: false,
                keyboard: false,
                tap: true,
                touchZoom: true
            }).setView(initialCenter, initialZoom);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 18
            }).addTo(mapInstance);

            // 玩家定位 marker 僅在取得真實 GPS 後才建立，避免誤導顯示在台北市
            if (lastLatLng && Number.isFinite(lastLatLng.latitude) && Number.isFinite(lastLatLng.longitude)) {
                mapMarker = L.marker([lastLatLng.latitude, lastLatLng.longitude]).addTo(mapInstance);
            } else {
                mapMarker = null;
            }
            if (targetLat && targetLng) {
                taskMapMarker = L.circleMarker([targetLat, targetLng], {
                    radius: 8,
                    color: '#ef4444',
                    weight: 3,
                    fillColor: '#f97316',
                    fillOpacity: 0.95
                }).addTo(mapInstance);
                taskMapMarker.bindTooltip('任務地點', { permanent: false, direction: 'top' });
            }
            mapInstance.on('moveend zoomend', updateMiniMapTaskIndicators);
            loadNearbyVisibleTasks();
            updateLocationText('定位中...');
            requestLocation();
        }


        async function reverseGeocode(lat, lng) {
            try {
                const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
                const res = await fetch(url, { headers: { 'Accept-Language': 'zh-TW' } });
                if (!res.ok) throw new Error('reverse geocode failed');
                const data = await res.json();
                const name = data.name || '';
                const address = data.address || {};
                const city = address.city || address.town || address.village || '';
                const suburb = address.suburb || address.neighbourhood || address.hamlet || '';
                const road = address.road || address.street || '';
                const display = [name, city, suburb, road].filter(Boolean).join(' ');
                return display || data.display_name || '';
            } catch (err) {
                console.warn('反向地理編碼失敗', err);
                return '';
            }
        }

        async function requestLocation() {
            const hasQuestChainInUrl = Boolean(new URLSearchParams(window.location.search).get('questChainId'));
            if (hasQuestChainInUrl) {
                updateLocationText('劇本載入中...');
                return;
            }
            if (isCurrentQuestTutorialMode() || isCurrentQuestDemoMode()) {
                lastLatLng = null;
                updateLocationText(`模擬距離 ${getTutorialMockDistance()}m（GPS 已關閉）`);
                return;
            }
            if (!navigator.geolocation) {
                updateLocationText('裝置不支援定位');
                return;
            }
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 4000, enableHighAccuracy: false
                    });
                });
                const { latitude, longitude } = pos.coords;
                lastLatLng = { latitude, longitude };
                if (mapInstance) {
                    if (!mapMarker) {
                        mapMarker = L.marker([latitude, longitude]).addTo(mapInstance);
                    } else {
                        mapMarker.setLatLng([latitude, longitude]);
                    }
                    updateTaskMapViewport();
                }
                loadNearbyVisibleTasks();
                const display = await reverseGeocode(latitude, longitude);
                updateLocationText(display || `緯度 ${latitude.toFixed(5)}，經度 ${longitude.toFixed(5)}`);
            } catch (err) {
                console.warn('定位失敗', err);
                updateLocationText('定位失敗');
            }
        }

        const photoWorkflow = window.AiLabPhotoWorkflow.createController({
            addPhotoBtn,
            aiResult,
            analyzeBtn,
            canvas,
            canvasCtx: ctx,
            capturedPhotos,
            getIsDrawing: () => isDrawing,
            getPoints: () => points,
            getReticleCenter: () => reticleCenter,
            getReticleRadius: () => reticleRadius,
            getSelectionMode: () => selectionMode,
            getTapStart: () => tapStart,
            isGuidedReticleLockMode,
            isPhotoTaskCaptureActive,
            maxPhotos: MAX_PHOTOS,
            minPhotosToAnalyze: MIN_PHOTOS_TO_ANALYZE,
            photoHint,
            previewArea,
            processSelectionFromRect,
            rawOutput,
            resultPanel,
            selectionInstruction,
            setIsDrawing: (value) => { isDrawing = value; },
            setPoints: (value) => { points = value; },
            setTapStart: (value) => { tapStart = value; },
            stopVoiceRecognition,
            updatePhotoBasketUi,
            updateReticlePosition
        });
        const retry = () => photoWorkflow.retry();

        // ------------------------------------------------
        // 5. 事件監聽 (Event Bindings)
        // ------------------------------------------------
        const eventBindings = window.AiLabEventBindings.createController({
            runtimeState,
            capturedPhotos,
            photoWorkflow,
            taskMediaController,
            geoWatch,
            elements: {
                addPhotoBtn,
                aiResult,
                answerMessage,
                answerModal,
                answerToastClose,
                backBtn,
                boardFocusBtn,
                boardMapSelector,
                boardMiniMap,
                boardPanelBtn,
                boardPanelTrack,
                btnAnswerCancel,
                btnAnswerSubmit,
                btnCompletionClose,
                btnLockCancel,
                btnLockSubmit,
                cameraModeSceneBtn,
                cameraModeTaskBtn,
                cameraTaskReopenBtn,
                canvas,
                canvasCtx: ctx,
                captureBtn,
                completionModal,
                directorPanel,
                directorToggle,
                dockLangBtn,
                dockModeBtn,
                featureDockMenu,
                featureDockToggle,
                floatingDiceBtn,
                gameShellBtn,
                gameShellEntries,
                gameShellPanel,
                gameShellStartBtn,
                gameShellToggle,
                gameShellVideo,
                gameShellVideoError,
                hudPanelBtn,
                instructionText,
                lockMsg,
                lockOverlay,
                modeBtns,
                npcDialog,
                npcDialogClose,
                photoConfirmBtn: document.getElementById('photoConfirmBtn'),
                photoConfirmOverlay: document.getElementById('photoConfirmOverlay'),
                photoConfirmPreview: document.getElementById('photoConfirmPreview'),
                photoRetakeBtn: document.getElementById('photoRetakeBtn'),
                resultPanel,
                reticleCaptureHotspot,
                reticleOverlay,
                retryBtn,
                selectionInstruction,
                shutterBtn,
                switchCameraBtn,
                taskBgm,
                taskBgmBtn,
                taskEncounterClose,
                taskEncounterStart,
                taskHudToggle,
                taskIntroBtn,
                taskIntroClose,
                taskIntroPanel,
                taskIntroSkip,
                taskIntroVideo,
                taskIntroVideoError,
                taskStatusBox,
                taskTargetObj,
                video
            },
            bindTaskVideoStatus,
            buildPhotoSubmissionDataUrl,
            captureCurrentReticleDataUrl,
            captureFullFrameDataUrl,
            closeDockPanels,
            closeNpcDialog,
            closeTaskEncounter,
            closeTaskIntroPanel,
            createTutorialFallbackCapture,
            ensureOrientationPermission,
            exitFormalStoryIntroMode,
            focusBoardTile,
            focusStoryTask,
            getBoardTileByIndex,
            getRequiredShots,
            getReticleRect,
            hideAnswerToast,
            hideQueryTransit,
            isCurrentQuestTutorialMode,
            isPhotoTaskCaptureActive,
            loadBoardShell,
            loadGameShellFromUrl,
            loadStoryShell,
            loadTaskFromUrl,
            openTaskEncounter,
            openTaskIntroPanel,
            playCameraFeedback,
            processSelectionFromRect,
            renderBoardPanel,
            renderGameShellEntries,
            renderHudSummary,
            renderTutorialModeUi,
            reopenTaskFromCaptureMode,
            resetAnswerSubmitUi,
            resetPhotoCaptureState,
            resizeCanvas,
            setCameraCaptureMode,
            setMode,
            showBoardTilePreview,
            showNpcDialog,
            showQueryTransit,
            showStorySummaryPage,
            startBoardTurn,
            startTaskInteraction,
            submitLockCode,
            submitTaskAnswer,
            syncCompactUxState,
            toggleDockPanel,
            updateGameShellProgress,
            updatePhotoBasketUi
        });
        eventBindings.bind();

        // AI 辨識按鈕（自由探索照片分析；統一走 LM-only / skip_rag 路徑）
        const analyzeFlow = window.AiLabAnalyzeFlow.createController({
            elements: {
                analyzeBtn,
                addPhotoBtn,
                aiResult,
                aiLoading,
                rawOutput,
                systemPromptInput,
                userPromptInput
            },
            capturedPhotos,
            runtimeState,
            getActiveScript,
            getLanguageInstruction,
            combinePhotosToGrid,
            analyzePhotos,
            startThinkingAnimation,
            setThinkingStage,
            stopThinkingAnimation,
            updateLoadingMessage,
            stopVoiceRecognition,
            hideAnswerToast,
            showAnswerToast,
            showQueryTransit,
            hideQueryTransit,
            collapseResultPanel,
            playQueryReturnAnimation,
            updatePreviewArea: () => photoWorkflow.updatePreviewArea(),
            retry
        });
        analyzeFlow.bind();

        // ------------------------------------------------
        // 6. 初始化 (Initialization)
        // ------------------------------------------------
        const initParams = new URLSearchParams(window.location.search);
        const hasShellLaunch = Boolean(initParams.get('questChainId') && initParams.get('mode'));
        resizeCanvas();
        languageController.initLanguageSelector();
        voiceChatController.initSpeechChat();
        updateShellModeUi();
        if (!hasShellLaunch) {
            setMode('free');
        }
        renderHudSummary();
        renderBoardPanel();
        initMiniMap();
        window.AiLabCameraManager.startCamera();
        
        log('初始化完成');

    } catch (criticalErr) {
        console.error('致命錯誤:', criticalErr);
        log('FATAL: ' + criticalErr.message);
        alert('程式啟動失敗，請重新整理頁面: ' + criticalErr.message);
    }
});
