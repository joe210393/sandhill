// ==========================================
// 全域工具函數 (Global Utils)
// ==========================================
const debugEl = document.getElementById('debugConsole');
const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
function log(msg) {
    console.log(msg);
    if (debugEl) debugEl.innerText = msg + '\n' + debugEl.innerText.substring(0, 100);
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

        // ------------------------------------------------
        // 1. 設定與劇本 (Configuration & Prompts)
        // ------------------------------------------------
        // 任務劇本已移除，改為使用「新增任務」API 的任務（承接任務後由 currentTask 提供）

        const PROMPTS = {
            free: {
                title: "📷 鏡頭待命模式",
                intro: "這裡是沙丘的鏡頭待命區，你可以先熟悉畫面、測試取景，或隨手拍攝讓 AI 幫你觀察眼前的物件與場景。",
                system: `你是一位專業的植物形態學家與生態研究員。

**重要：你必須按照以下步驟進行分析，絕對不能跳過任何步驟！**

請依照以下 XML 格式回答，並在最後輸出結構化的 traits JSON：

<analysis>
**第一步：尺寸判斷（必須完成，用於驗證生活型）**

**請透過以下方式估算尺寸：**
1. **畫面比例推估：** 觀察物體在畫面中佔據的比例
   - 如果物體佔畫面高度約 1/3，且畫面是標準手機拍攝（約 50-100 公分距離），可推估物體高度
   - 如果物體佔畫面很小（< 10%），可能是大型物體（喬木）的局部
   - 如果物體佔畫面很大（> 50%），可能是小型物體（草本）的特寫

2. **視覺經驗推估：** 根據常見物體的視覺大小經驗
   - 葉片：一般草本葉片 2-10 公分，灌木葉片 3-15 公分，喬木葉片 5-30 公分
   - 花朵：一般小花 0.5-2 公分，中型花 2-5 公分，大花 5-15 公分
   - 整體：草本通常 < 50 公分，灌木 50-300 公分，喬木 > 300 公分

3. **結構特徵推估：** 觀察植物的結構特徵
   - 如果能看到明顯的主幹且粗壯 → 可能是喬木
   - 如果多分枝且無明顯主幹 → 可能是灌木
   - 如果莖細軟且低矮 → 可能是草本

**估算物體的實際尺寸範圍（必須具體）：**
- 整體高度：約 X 公分（或 X 公尺）
- 葉片長度：約 X 公分
- 花朵直徑：約 X 公分

**尺寸判斷的重要性：**
- 喬木：通常高度 > 3 公尺，主幹明顯
- 灌木：通常高度 0.5-3 公尺，多分枝
- 草本：通常高度 < 0.5 公尺，莖柔軟
- 如果判斷為「灌木」但高度只有 10 公分，請重新檢查為「草本」！

**第二步：詳細描述圖片細節（必須完成）**

**如果是植物，必須使用專業的植物形態學術語描述，絕對不能用「葉子形狀」「顏色」這種模糊詞彙！**

植物描述必須包含以下專業術語（根據圖片可見特徵選擇）：

**一、形態（整體外觀與生活型）**
- 生活型：喬木、灌木、草本、藤本、半灌木（必須與尺寸判斷一致！）
- 生長型：直立、匍匐、攀緣、纏繞、蔓生、叢生、浮水、沉水
- 壽命型：一年生、二年生、多年生
- 表面特徵：光滑、有毛、有刺、有蠟質、粗糙、黏性
- **整體尺寸：** 高度、寬度、葉片大小、花朵大小（必須具體描述）

**二、葉（Leaf）**
- 葉的構造：單葉、複葉、退化葉
- 葉序：互生、對生、輪生
- 葉形：披針形、卵形、橢圓形、心形、線形、圓形、腎形、倒卵形、針形、戟形、楔形、扇形
- 葉緣：全緣、鋸齒緣、波狀緣、裂緣、鈍齒緣、重鋸齒
- **葉片尺寸：** 長度、寬度（必須具體描述）

**三、根與莖（Root & Stem）- 非常重要！**
- **根的類型：** 直根、鬚根、氣生根、儲藏根、支柱根、板根、呼吸根
- **莖的類型：** 地上莖、地下莖、匍匐莖、直立莖、肉質莖、木質莖、攀緣莖
- **地下莖細分：** 根莖、球莖、鱗莖、塊莖、塊根
- **莖的特徵：** 中空、實心、有節、有稜、有刺、有毛、光滑

**四、花（Flower）- 特別注意花序類型！**
- 花的性別：單性花、雙性花、無性花
- **花序（必須仔細觀察，這是識別關鍵）：**
  - **總狀花序：** 花軸上有多朵花，每朵花有花梗，從下往上開花（如：油菜花）
  - **穗狀花序：** 花軸上有多朵花，但花無梗或極短（如：小麥）
  - **繖形花序：** 花軸頂端有多朵花，花梗長度相近，呈傘狀（如：繡球花、蔥）
  - **圓錐花序：** 總狀花序的分枝版，呈圓錐形（如：稻米）
  - **頭狀花序：** 花軸頂端膨大，多朵小花密集排列（如：向日葵）
  - **聚繖花序：** 多個繖形花序組合，呈球狀或半球狀（如：繡球花、八仙花）
  - **佛焰花序：** 特殊結構，有佛焰苞包裹（如：芋頭）
  - **單生花：** 只有一朵花
- 花對稱性：放射對稱、左右對稱、不對稱
- **花朵尺寸：** 直徑、長度（必須具體描述）

**五、果實（Fruit）**
- 乾果：裂果、不裂果、翅果、堅果、蒴果、瘦果
- 肉果：漿果、核果、梨果、聚合果
- 果實來源：單果、聚合果、多花果
- **果實顏色：** 綠色、紅色、黃色、黑色、棕色、紫色等（必須描述）

**六、種子（Seed）- 如果可見，必須描述！**
- **種子類型：** 有翅種子、無翅種子、具毛種子、具刺種子
- **種子顏色：** 黑色、棕色、紅色、黃色、白色等
- **種子大小：** 大、中、小（可估算直徑或長度）
- **種子形狀：** 圓形、橢圓形、扁平、長條形等

**範例（正確）：**
「這是一種灌木植物，整體高度約 50-80 公分。葉序為對生，葉形為橢圓形，葉緣為鋸齒緣，葉片長約 5-8 公分。具有聚繖花序，花朵密集排列成球狀，花朵直徑約 2-3 公分，花色為粉紅色。」

**範例（錯誤）：**
「這是一種綠色植物，葉子長長的，邊緣有鋸齒，開白色小花。」（不能用這種描述！）

**如果是動物：** 描述體型、顏色、特徵部位、行為等
**如果是物品：** 描述形狀、顏色、材質、大小、用途等

**圈選範圍內的主體與背景：**
使用者圈選的區域可能同時包含主體（焦點）與背景。請判斷「主要焦點」是什麼：若主體是動物、昆蟲或人造物而植物僅在背景，第三步請判斷為「動物」或「人造物」，並輸出空 JSON。只有當主體是植物時，才在第四步提取植物特徵。

**第三步：判斷類別（必須完成）**
明確指出「圈選範圍內的主要焦點」是：植物 / 動物 / 人造物 / 其他

**第四步：提取生物特徵（僅限植物）**
如果是植物，請用上述專業術語提取關鍵識別特徵，例如：
- 生活型：灌木（必須與尺寸判斷一致！）
- 葉序：對生
- 葉形：橢圓形
- 葉緣：鋸齒緣
- **葉片顏色：** 綠色、紫色、斑葉等（必須描述，特別是雙色葉或特殊顏色）
- 花序：聚繖花序（必須仔細觀察！）
- **花色：** 粉紅色（注意：只有花朵的顏色才是花色，葉子的顏色不是花色！）
- **果實類型：** 漿果、核果、莢果等（如果可見）
- **果實顏色：** 紅色、黑色等（如果可見）
- **根莖類型：** 直根、鬚根、氣生根、地下莖等（如果可見）
- **種子類型：** 有翅、無翅等（如果可見）
- **種子顏色：** 黑色、棕色等（如果可見）
- 尺寸：高度 50-80 公分，花朵直徑 2-3 公分
- 其他：有刺、氣生根等

**重要：葉片顏色和花色是不同特徵！**
- **葉片顏色（leaf_color）**：描述葉子的顏色，如「綠色」、「紫色」、「上綠下紫」
- **花色（flower_color）**：只描述花朵的顏色，如「粉紅色」、「白色」
- 如果照片中沒有花朵，請將 flower_color 設為 "unknown"

**第五步：尺寸驗證（僅限植物）**
檢查生活型與尺寸是否一致：
- 如果判斷為「喬木」但高度只有 30 公分 → 重新判斷為「灌木」或「草本」
- 如果判斷為「灌木」但高度只有 10 公分 → 重新判斷為「草本」
- 如果判斷為「草本」但高度有 2 公尺 → 重新判斷為「灌木」

**第六步：初步猜測（僅限植物）**
根據你觀察到的特徵，猜測可能是什麼植物（給 1-3 個候選名稱，中文為主）

**注意：絕對不要直接給出最終答案！你只能描述細節和猜測，最終答案需要透過資料庫比對後才能確定。**
</analysis>

**第七步：輸出結構化特徵（僅限植物，必須輸出 JSON）**
如果第三步判斷為「植物」，請在 </reply> 之後輸出以下 JSON 格式的特徵資料（不要加其他文字）：

\`\`\`json
{
  "life_form": {"value":"shrub","confidence":0.8,"evidence":"植株呈木質分枝"},
  "phenology": {"value":"evergreen","confidence":0.7,"evidence":"葉片全年保持綠色"},
  "leaf_arrangement": {"value":"opposite","confidence":0.9,"evidence":"葉片對生排列"},
  "leaf_shape": {"value":"ovate","confidence":0.8,"evidence":"葉片呈卵形"},
  "leaf_margin": {"value":"serrate","confidence":0.85,"evidence":"葉緣有明顯鋸齒"},
  "leaf_texture": {"value":"chartaceous_thick","confidence":0.6,"evidence":"葉片質地厚紙質"},
  "inflorescence": {"value":"corymb_cyme","confidence":0.9,"evidence":"聚繖花序，花朵密集排列成球狀"},
  "flower_color": {"value":"pink","confidence":0.9,"evidence":"花朵呈粉紅色"},
  "leaf_color": {"value":"green_purple","confidence":0.8,"evidence":"葉片上表面綠色，下表面或新葉呈紫紅色"},
  "fruit_type": {"value":"berry","confidence":0.8,"evidence":"照片可見漿果"},
  "fruit_color": {"value":"red","confidence":0.9,"evidence":"果實呈紅色"},
  "root_type": {"value":"fibrous","confidence":0.7,"evidence":"鬚根系"},
  "stem_type": {"value":"woody","confidence":0.8,"evidence":"木質莖"},
  "seed_type": {"value":"winged","confidence":0.6,"evidence":"種子具翅"},
  "seed_color": {"value":"brown","confidence":0.7,"evidence":"種子呈棕色"},
  "surface_hair": {"value":"glabrous","confidence":0.7,"evidence":"葉片表面光滑無毛"}
}
\`\`\`

**注意：**
- 如果看不到果實，請回傳 "fruit_type": {"value":"unknown","confidence":0.1,"evidence":"照片未見果實"}
- 如果看不到種子，請回傳 "seed_type": {"value":"unknown","confidence":0.1,"evidence":"照片未見種子"}
- 如果看不到根莖，請回傳 "root_type": {"value":"unknown","confidence":0.1,"evidence":"照片未見根部"}
- **根莖類型非常重要，如果照片中可見根部或地下莖，必須描述！**

**重要規則：**
1. 每個 trait 都要有 value、confidence(0~1)、evidence
2. 如果看不到或無法判斷，請回傳 value = "unknown" 並給低 confidence (0.1-0.3)
3. 只填寫能清楚觀察到的特徵，不確定就不要填或填 unknown
4. 如果第三步判斷為「動物」或「人造物」，請輸出空的 JSON：{}

<reply>
用親切、專業但通俗的語氣向玩家介紹這個東西。
- 如果是植物/動物：介紹學名、別名、冷知識或用途。
- 如果是物品：介紹它的用途，或是提供一個相關的生活小撇步。

**重要：在 <reply> 中，你只能根據 <analysis> 中描述的細節來介紹，不要直接猜測名稱。**
</reply>`,
                user: "請詳細分析這張圖片，描述所有可見的細節特徵，然後判斷這是什麼類別（植物/動物/人造物）。"
            },
            mission: null
        };

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
        let isDrawing = false;
        let points = [];
        let selectionMode = 'reticle';  // 'reticle' = 單手框選
        let cameraCaptureMode = 'task'; // 'task' = 任務取景, 'scene' = 全景紀錄
        let reticleCenter = { x: 0, y: 0 };
        let reticleRadius = 0;
        let tapStart = null;           // 用於區分「點擊移動框」與「手繪」
        let stream = null;
        let facingMode = 'environment'; // 預設使用後鏡頭
        let currentMode = 'free';       // 預設模式
        let mapInstance = null;
        let mapMarker = null;
        let taskMapMarker = null;
        let nearbyTaskLayer = null;
        let nearbyVisibleTasks = [];
        let lastLocationText = '';
        let lastLatLng = null;
        let lastTaskDistance = null;
        let lastTaskBearing = null;
        let lastHeading = 0;
        let headingSource = 'none';
        let lastHeadingUpdateAt = 0;
        let lastGpsUpdateAt = 0;
        let taskObjectVisible = false;

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
        const shutterBtn = document.getElementById('shutterBtn');
        const cameraFlash = document.getElementById('cameraFlash');
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
        const photoStrip = document.getElementById('photoStrip');
        const photoSlots = document.querySelectorAll('.photo-slot');
        const photoHint = document.getElementById('photoHint');

        // Multi-photo state（兩段式：1 張即可辨識，不清楚再補拍）
        const capturedPhotos = [];
        const MIN_PHOTOS_TO_ANALYZE = 1;
        const MAX_PHOTOS = 3;
        const CONFIDENCE_HIGH = 0.85;
        const CONFIDENCE_MEDIUM = 0.40;
        let needMorePhotosSession = null; // 補拍時儲存 session_data
        let currentAnswerPhotoDataUrl = null;
        let photoCaptureModeActive = false;
        let shutterBusy = false;
        
        // Director Panel Elements
        const directorToggle = document.getElementById('directorToggle');
        const directorPanel = document.getElementById('directorPanel');
        const systemPromptInput = document.getElementById('systemPrompt');
        const userPromptInput = document.getElementById('userPrompt');
        const modeBtns = document.querySelectorAll('.mode-btn');
        const uiLayer = document.querySelector('.ui-layer');
        let langSelect = document.getElementById('langSelect');
        const zoomControl = document.getElementById('zoomControl');
        const zoomValue = document.getElementById('zoomValue');
        const zoomButtons = document.querySelectorAll('.zoom-btn');
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
        const dockZoomBtn = document.getElementById('dockZoomBtn');
        const dockModePanel = document.getElementById('dockModePanel');
        const dockLangPanel = document.getElementById('dockLangPanel');
        const dockZoomPanel = document.getElementById('dockZoomPanel');
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
        const boardPanelStatus = document.getElementById('boardPanelStatus');
        const boardPanelMeta = document.getElementById('boardPanelMeta');
        const boardPanelAction = document.getElementById('boardPanelAction');
        const boardPanelTrack = document.getElementById('boardPanelTrack');
        const boardMapSelector = document.getElementById('boardMapSelector');
        const boardMapSelectorStatus = document.getElementById('boardMapSelectorStatus');
        const floatingDiceBtn = document.getElementById('floatingDiceBtn');
        const rollDiceBtn = document.getElementById('rollDiceBtn');
        const boardFocusBtn = document.getElementById('boardFocusBtn');
        const boardMiniMap = document.getElementById('boardMiniMap');
        const boardMiniMapDots = document.getElementById('boardMiniMapDots');
        const taskBgmBtn = document.getElementById('taskBgmBtn');
        const taskIntroBtn = document.getElementById('taskIntroBtn');
        const taskIntroPanel = document.getElementById('taskIntroPanel');
        const taskIntroTitle = document.getElementById('taskIntroTitle');
        const taskIntroCover = document.getElementById('taskIntroCover');
        const taskIntroDescription = document.getElementById('taskIntroDescription');
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

        function buildFriendlyNetworkError(actionLabel = '連線') {
            return new Error(`探索艙目前無法完成「${actionLabel}」。請確認網路或稍後再試。`);
        }

        async function requestJson(url, options = {}, actionLabel = '請求資料') {
            let res;
            try {
                res = await fetch(url, options);
            } catch (err) {
                throw buildFriendlyNetworkError(actionLabel);
            }

            let data = null;
            try {
                data = await res.json();
            } catch (err) {
                if (!res.ok) {
                    throw new Error(`探索艙在「${actionLabel}」時收到異常回應。`);
                }
                return null;
            }

            if (!res.ok) {
                throw new Error(data?.message || `探索艙在「${actionLabel}」時失敗。`);
            }

            return data;
        }

        // 任務情境（來自 AR-VIEW／新增任務 API：由 URL taskId 載入；進入後先見相機，再自行找地點）
        let currentTask = null;
        let currentTaskId = null;
        let currentUserTaskId = null;
        let currentQuestChainId = null;
        let currentQuestChainData = null;
        let currentEntryMode = null;
        let currentStoryTasks = [];
        let currentStoryCompleted = false;
        let currentStoryCompletedTaskIds = new Set();
        let currentBoardMaps = [];
        let currentBoardTiles = [];
        let currentBoardMap = null;
        let currentBoardActiveTileId = null;
        let isShellExperience = false;
        let playerHudStats = { points: null, badges: [] };
        let currentBoardRun = null;
        let currentBoardSessionId = null;
        let useRemoteBoardSession = false;
        let tutorialBoardPhotoCaptureArmed = false;
        let pendingStoryReloadAfterCompletion = false;
        let currentNpcDialogResolver = null;
        let currentNpcDialogAutoCloseTimer = null;
        let lastStoryDialogueKey = null;
        let tutorialFlowStarted = false;
        let tutorialIntroTaskId = null;
        let targetLat = null;
        let targetLng = null;
        let navigationWatchId = null;
        let navigationPollTimer = null;
        let deviceHeading = 0;
        let taskReached = false;
        let bgmAutoStarted = false;
        let orientationPermissionState = 'idle';

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
        function loadTaskBGM(task) {
            if (!taskBgm) return;
            const musicUrl = task?.bgm_url || task?.audio_url || null;
            if (musicUrl) {
                taskBgm.src = musicUrl;
                taskBgm.load();
                taskBgm.volume = 0.5;
                if (taskBgmBtn) {
                    taskBgmBtn.classList.remove('hidden');
                    taskBgmBtn.title = '任務背景音樂';
                }
            } else {
                taskBgm.src = '';
                if (taskBgmBtn) taskBgmBtn.classList.add('hidden');
            }
        }

        function showTaskContext(task) {
            if (currentTask && task && currentTask.id !== task.id && photoCaptureModeActive) {
                resetPhotoCaptureState();
            }
            currentTask = task;
            const statusPill = document.querySelector('.status-pill');
            if (statusPill) statusPill.textContent = task.name || '任務';
            if (taskIntroTitle) taskIntroTitle.textContent = task.name || '任務';
            if (taskIntroCover) {
                const photo = task.photoUrl || task.photo_url || '';
                taskIntroCover.src = photo;
                taskIntroCover.style.display = photo ? 'block' : 'none';
            }
            if (taskIntroDescription) {
                taskIntroDescription.textContent = task.description || '';
            }
            if (taskIntroBtn) taskIntroBtn.classList.remove('hidden');
            if (taskTargetImg) {
                taskTargetImg.src = task.ar_image_url || task.photoUrl || task.photo_url || '/images/mascot.png';
            }
            if (gameShellObjective) {
                gameShellObjective.textContent = task.stage_intro || task.description || task.name || '請前往完成當前關卡';
            }
            renderHudSummary();
            // 不自動彈出景點介紹：與 AR-VIEW 一致，進入後先看到相機畫面，由使用者自行點 📋 查看
        }

        function getLoginStorageKey() {
            const user = getLoginUser();
            return user?.username || user?.email || user?.id || 'guest';
        }

        function getBoardRunStorageKey() {
            return `sandhill-board-run:${getLoginStorageKey()}:${currentQuestChainId || 'none'}`;
        }

        function renderHudSummary() {
            if (hudModeValue) {
                if (currentEntryMode === 'story_campaign') hudModeValue.textContent = '劇情主線';
                else if (currentEntryMode === 'board_game') hudModeValue.textContent = '大富翁';
                else hudModeValue.textContent = '鏡頭待命';
            }

            if (hudStageValue) {
                if (currentEntryMode === 'story_campaign' && currentTask?.quest_order) {
                    hudStageValue.textContent = `第 ${currentTask.quest_order} 關`;
                } else if (currentEntryMode === 'board_game' && currentBoardRun?.currentTile) {
                    hudStageValue.textContent = `第 ${currentBoardRun.currentTile} 格`;
                } else {
                    hudStageValue.textContent = '等待載入';
                }
            }

            if (hudPointsValue) {
                const boardPoints = Number(currentBoardRun?.gainedPoints || 0);
                if (playerHudStats.points === null) hudPointsValue.textContent = boardPoints ? `+${boardPoints}` : '--';
                else hudPointsValue.textContent = String(Number(playerHudStats.points || 0) + boardPoints);
            }

            if (hudBadgesValue) {
                hudBadgesValue.textContent = String(playerHudStats.badges?.length || 0);
            }

            if (boardStatusCard) {
                const isBoard = currentEntryMode === 'board_game';
                boardStatusCard.classList.toggle('hidden', !isBoard);
                if (isBoard) {
                    if (boardHudRound) boardHudRound.textContent = `${Number(currentBoardRun?.round || 0)} 回`;
                    if (boardHudTile) boardHudTile.textContent = `第 ${Number(currentBoardRun?.currentTile || 1)} 格`;
                    if (boardHudSession) boardHudSession.textContent = useRemoteBoardSession && currentBoardSessionId ? `#${currentBoardSessionId}` : '本機';
                    if (boardHudResult) {
                        boardHudResult.textContent = currentBoardRun?.lastResultText || '等待擲骰';
                    }
                }
            }

            if (hudPanelSummary) {
                const modeText = currentEntryMode === 'board_game'
                    ? `目前在大富翁模式，第 ${currentBoardRun?.currentTile || 1} 格。`
                    : currentEntryMode === 'story_campaign'
                        ? (currentStoryCompleted
                            ? '目前這條劇情主線已完成。'
                            : `目前在劇情主線，第 ${currentTask?.quest_order || 1} 關。`)
                        : '尚未進入正式玩法。';
                const pointsText = playerHudStats.points === null
                    ? '玩家積分讀取中。'
                    : `目前累積積分 ${Number(playerHudStats.points || 0) + Number(currentBoardRun?.gainedPoints || 0)} 點。`;
                hudPanelSummary.textContent = `${modeText} ${pointsText}`;
            }

            if (hudPanelNext) {
                if (currentEntryMode === 'story_campaign') {
                    const currentOrder = Number(currentTask?.quest_order || 0);
                    const nextTask = currentStoryTasks.find((task) => Number(task.quest_order || 0) === currentOrder + 1);
                    hudPanelNext.textContent = currentStoryCompleted
                        ? '這條主線已完成，可以回首頁切換別的劇情，或直接進入大富翁模式。'
                        : currentTask?.stage_intro
                        || currentTask?.description
                        || (nextTask ? `完成本關後，將解鎖下一關「${nextTask.name || '未命名關卡'}」。` : '完成目前關卡後，就會進入這條主線的下一步。');
                } else if (currentEntryMode === 'board_game') {
                    const pendingTile = currentBoardRun?.pendingTargetTile ? getBoardTileByIndex(currentBoardRun.pendingTargetTile) : null;
                    hudPanelNext.textContent = pendingTile
                        ? `本回合請前往第 ${pendingTile.tile_index} 格「${pendingTile.tile_name}」，完成挑戰後會由 AI 或事件自動結算。`
                        : '按下「擲骰前進」開始下一步，系統會把焦點切到目標格。';
                } else {
                    hudPanelNext.textContent = '從首頁選擇一條劇情或一場大富翁活動後，這裡會顯示下一步。';
                }
            }

            if (hudPanelRescue) {
                if (currentEntryMode === 'story_campaign') {
                    hudPanelRescue.textContent = currentStoryCompleted
                        ? '主線已完成，若要再次體驗，建議回首頁選擇其他玩法入口。'
                        : currentTask?.hint_text
                        || currentTask?.failure_message
                        || '如果這一關卡住了，系統會根據目前關卡目標給你提示與補救方式。';
                } else if (currentEntryMode === 'board_game') {
                    const failureMove = Number(currentBoardMap?.failure_move || -1);
                    hudPanelRescue.textContent = useRemoteBoardSession
                        ? `目前由後端 session 接管棋盤進度。若本回合失敗，系統會自動套用 ${failureMove} 格的失敗規則。`
                        : `目前使用本機暫存模式。若本回合失敗，會套用 ${failureMove} 格的退步規則。`;
                } else {
                    hudPanelRescue.textContent = '進入玩法後，這裡會顯示目前可用的提示或救援資訊。';
                }
            }

            if (hudPanelStages) {
                if (currentEntryMode === 'story_campaign' && currentStoryTasks.length) {
                    hudPanelStages.innerHTML = currentStoryTasks.map((task) => {
                        const taskOrder = Number(task.quest_order || 0);
                        const currentOrder = Number(currentTask?.quest_order || 0);
                        let cls = '';
                        let prefix = '待解鎖';
                        if (currentStoryCompleted) {
                            cls = 'completed';
                            prefix = '已完成';
                        } else if (taskOrder && currentOrder && taskOrder < currentOrder) {
                            cls = 'completed';
                            prefix = '已完成';
                        } else if (String(task.id) === String(currentTask?.id)) {
                            cls = 'current';
                            prefix = '目前關卡';
                        }
                        return `<div class="hud-stage ${cls}">${prefix}｜${task.name || '未命名關卡'}</div>`;
                    }).join('');
                } else if (currentEntryMode === 'board_game') {
                    hudPanelStages.innerHTML = '<div class="hud-stage muted">大富翁模式請從棋盤面板查看每一步狀態。</div>';
                } else {
                    hudPanelStages.innerHTML = '<div class="hud-stage muted">尚未載入關卡</div>';
                }
            }

            if (hudPanelBadges) {
                const badges = Array.isArray(playerHudStats.badges) ? playerHudStats.badges : [];
                if (!badges.length) {
                    hudPanelBadges.innerHTML = '<span class="hud-badge muted">尚未取得徽章</span>';
                } else {
                    hudPanelBadges.innerHTML = badges
                        .slice(0, 6)
                        .map((badge) => `<span class="hud-badge">${badge.name || '未命名徽章'}</span>`)
                        .join('');
                }
            }

            if (gameShellStartBtn) {
                if (currentEntryMode === 'story_campaign') {
                    gameShellStartBtn.textContent = currentStoryCompleted
                        ? '主線已完成'
                        : (currentTask?.task_type === 'location' ? '開始報到' : '開始這一關');
                    gameShellStartBtn.disabled = !currentTask || currentStoryCompleted;
                    gameShellStartBtn.classList.remove('hidden');
                } else if (currentEntryMode === 'board_game') {
                    const hasPendingBoardTask = Boolean(currentBoardRun?.pendingTargetTile);
                    gameShellStartBtn.textContent = hasPendingBoardTask ? '等待本回合完成' : '擲骰';
                    gameShellStartBtn.disabled = hasPendingBoardTask;
                    gameShellStartBtn.setAttribute('aria-label', hasPendingBoardTask ? '本回合尚未完成，暫時不能擲骰' : '擲骰');
                    gameShellStartBtn.classList.remove('hidden');
                } else {
                    gameShellStartBtn.textContent = '開始遊戲';
                    gameShellStartBtn.disabled = true;
                }
            }
        }

        function closeNpcDialog() {
            if (currentNpcDialogAutoCloseTimer) {
                clearTimeout(currentNpcDialogAutoCloseTimer);
                currentNpcDialogAutoCloseTimer = null;
            }
            if (npcDialog) {
                delete npcDialog.dataset.blocking;
                npcDialog.classList.remove('passive');
            }
            if (npcDialog) npcDialog.classList.add('hidden');
            renderTutorialModeUi();
            if (currentNpcDialogResolver) {
                currentNpcDialogResolver();
                currentNpcDialogResolver = null;
            }
        }

        function isNpcDialogBlocking() {
            return Boolean(npcDialog && !npcDialog.classList.contains('hidden') && npcDialog.dataset.blocking === 'true');
        }

        function showNpcDialog({ speaker = '沙丘引導員', speakerKey = null, mood = '提示', text = '', buttonLabel = null, autoCloseMs = null, blocking = null } = {}) {
            if (!npcDialog || !npcDialogText) return Promise.resolve();
            if (currentNpcDialogAutoCloseTimer) {
                clearTimeout(currentNpcDialogAutoCloseTimer);
                currentNpcDialogAutoCloseTimer = null;
            }
            const shouldBlock = typeof blocking === 'boolean'
                ? blocking
                : !(isCurrentQuestTutorialMode() || isCurrentQuestDemoMode());
            const profile = speakerKey ? NPC_PROFILES[speakerKey] : null;
            if (npcDialogPortrait) npcDialogPortrait.textContent = profile?.portrait || '🧭';
            if (npcDialog) npcDialog.dataset.speaker = profile?.theme || 'guide';
            if (npcDialog) npcDialog.dataset.blocking = shouldBlock ? 'true' : 'false';
            if (npcDialog) npcDialog.classList.toggle('passive', !shouldBlock);
            if (npcDialogSpeaker) npcDialogSpeaker.textContent = profile?.name || speaker;
            if (npcDialogMood) npcDialogMood.textContent = mood;
            if (npcDialogClose) npcDialogClose.textContent = buttonLabel || (shouldBlock ? (profile?.button || '繼續') : '收起');
            npcDialogText.textContent = text || '……';
            npcDialog.classList.remove('hidden');
            renderTutorialModeUi();
            if (currentNpcDialogResolver) currentNpcDialogResolver();
            const dialogPromise = shouldBlock
                ? new Promise((resolve) => {
                    currentNpcDialogResolver = resolve;
                })
                : Promise.resolve();
            return dialogPromise;
        }

        function getCurrentQuestRules() {
            return currentQuestChainData?.game_rules || currentQuestChainData?.content_blueprint || {};
        }

        function isCurrentQuestDemoMode() {
            const rules = getCurrentQuestRules();
            return Boolean(rules && (rules.demo_autopass || rules.demoAutoPass));
        }

        function isCurrentQuestTutorialMode() {
            const rules = getCurrentQuestRules();
            return Boolean(
                (rules && (rules.tutorial_mode || rules.tutorialMode))
                || currentQuestChainData?.play_style === 'tutorial_story'
                || currentQuestChainData?.play_style === 'tutorial_board'
                || currentQuestChainData?.play_style === 'demo_story'
            );
        }

        function isTutorialGuestMode() {
            return isCurrentQuestTutorialMode() && !getLoginUser();
        }

        function taskUsesGps(task = currentTask) {
            if (!task) return false;
            const gpsEnabled = Boolean(task.location_required || task.task_type === 'location');
            const hasCoords = Number.isFinite(Number(task.lat)) && Number.isFinite(Number(task.lng));
            return gpsEnabled && hasCoords;
        }

        function getTutorialMockDistance(task = currentTask) {
            const questOrder = Number(task?.quest_order) || 1;
            const radius = Number(task?.radius) || 24;
            return Math.max(8, Math.round(radius + questOrder * 7));
        }

        function getTutorialMockBearing(task = currentTask) {
            const questOrder = Number(task?.quest_order) || 1;
            return (questOrder * 37) % 360;
        }

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

        function getRequiredShots() {
            const aiConfig = currentTask?.ai_config && typeof currentTask.ai_config === 'object' ? currentTask.ai_config : {};
            const passCriteria = currentTask?.pass_criteria && typeof currentTask.pass_criteria === 'object' ? currentTask.pass_criteria : {};
            const raw = Number(
                currentTask?.required_shots
                || aiConfig.required_shots
                || passCriteria.required_shots
                || 1
            );
            return Math.max(1, Math.min(3, Number.isFinite(raw) ? raw : 1));
        }

        function shouldShowPhotoBasket() {
            return isPhotoTaskCaptureActive() && getRequiredShots() > 1;
        }

        function playCameraFeedback() {
            if (shutterBtn) {
                shutterBtn.classList.add('is-firing');
                setTimeout(() => shutterBtn.classList.remove('is-firing'), 140);
            }
            if (reticleCaptureHotspot) {
                reticleCaptureHotspot.classList.add('is-firing');
                setTimeout(() => reticleCaptureHotspot.classList.remove('is-firing'), 140);
            }
            if (cameraFlash) {
                cameraFlash.classList.remove('hidden');
                void cameraFlash.offsetWidth;
                cameraFlash.classList.remove('hidden');
                setTimeout(() => cameraFlash.classList.add('hidden'), 180);
            }
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }

        function updatePhotoBasketUi() {
            if (!photoBasket || !photoBasketThumb || !photoBasketCount) return;
            const requiredShots = getRequiredShots();
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
            document.body.classList.toggle('immersive-camera-mode', Boolean(active));
            if (cameraCaptureBar) {
                cameraCaptureBar.classList.toggle('hidden', !active);
            }
            if (!active) {
                photoBasket?.classList.add('hidden');
            }
            updatePhotoBasketUi();
        }

        function setCameraCaptureMode(mode = 'task') {
            cameraCaptureMode = mode === 'scene' ? 'scene' : 'task';
            selectionMode = 'reticle';
            const shouldShowTaskReticle = cameraCaptureMode === 'task' && isPhotoTaskCaptureActive();
            if (cameraModeTaskBtn) cameraModeTaskBtn.classList.toggle('active', cameraCaptureMode === 'task');
            if (cameraModeSceneBtn) cameraModeSceneBtn.classList.toggle('active', cameraCaptureMode === 'scene');
            if (cameraCaptureBar) cameraCaptureBar.classList.toggle('task-primary', cameraCaptureMode === 'task');
            if (reticleOverlay) reticleOverlay.classList.toggle('hidden', !shouldShowTaskReticle);
            if (reticleCenterHint) {
                reticleCenterHint.classList.toggle('hidden', !shouldShowTaskReticle);
            }
            if (reticleCaptureHotspot) {
                reticleCaptureHotspot.classList.toggle('hidden', !shouldShowTaskReticle);
            }
            if (instructionText) {
                instructionText.textContent = shouldShowTaskReticle
                    ? '把目標放進黃色圓框，直接點圓框中央拍照'
                    : '按底部快門拍下整個畫面，作為全景紀錄';
            }
        }

        async function buildPhotoSubmissionDataUrl() {
            if (capturedPhotos.length > 1) {
                return await combinePhotosToGrid(capturedPhotos);
            }
            return capturedPhotos[0] || currentAnswerPhotoDataUrl || null;
        }

        function resetPhotoCaptureState({ keepActive = false } = {}) {
            capturedPhotos.length = 0;
            needMorePhotosSession = null;
            currentAnswerPhotoDataUrl = null;
            if (!keepActive) {
                photoCaptureModeActive = false;
                tutorialBoardPhotoCaptureArmed = false;
                setImmersiveCameraMode(false);
            }
            updatePhotoBasketUi();
        }

        function getTutorialBoardRollValue(round = 0) {
            const sequence = currentBoardMap?.rules_json?.tutorial_roll_sequence;
            if (!Array.isArray(sequence) || !sequence.length) return null;
            const values = sequence
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value > 0);
            if (!values.length) return null;
            return values[Number(round || 0) % values.length];
        }

        function isTutorialGuestStoryMode() {
            return currentEntryMode === 'story_campaign' && isTutorialGuestMode();
        }

        function getTutorialGuestProgressKey(questChainId = currentQuestChainId) {
            return `sandhill:tutorial-guest-progress:${questChainId || 'unknown'}`;
        }

        function getTutorialGuestState(questChainId = currentQuestChainId) {
            if (!questChainId) return { currentOrder: 1, completed: false, completedTaskIds: [] };
            try {
                const raw = sessionStorage.getItem(getTutorialGuestProgressKey(questChainId));
                if (!raw) return { currentOrder: 1, completed: false, completedTaskIds: [] };
                const parsed = JSON.parse(raw);
                return {
                    currentOrder: Number(parsed.currentOrder || 1),
                    completed: Boolean(parsed.completed),
                    completedTaskIds: Array.isArray(parsed.completedTaskIds)
                        ? parsed.completedTaskIds.map((id) => Number(id))
                        : []
                };
            } catch (err) {
                console.warn('讀取教學模式本地進度失敗', err);
                return { currentOrder: 1, completed: false, completedTaskIds: [] };
            }
        }

        function saveTutorialGuestState(nextState, questChainId = currentQuestChainId) {
            if (!questChainId) return;
            try {
                sessionStorage.setItem(getTutorialGuestProgressKey(questChainId), JSON.stringify({
                    currentOrder: Number(nextState.currentOrder || 1),
                    completed: Boolean(nextState.completed),
                    completedTaskIds: Array.isArray(nextState.completedTaskIds)
                        ? nextState.completedTaskIds.map((id) => Number(id))
                        : []
                }));
            } catch (err) {
                console.warn('保存教學模式本地進度失敗', err);
            }
        }

        function completeTutorialGuestTask(task) {
            if (!task || !currentQuestChainId) return;
            const state = getTutorialGuestState(currentQuestChainId);
            const completedTaskIds = new Set(state.completedTaskIds || []);
            completedTaskIds.add(Number(task.id));
            const sortedTasks = [...currentStoryTasks].sort((a, b) => Number(a.quest_order || 0) - Number(b.quest_order || 0));
            const nextTask = sortedTasks.find((item) => Number(item.quest_order || 0) > Number(task.quest_order || 0));
            const nextState = {
                currentOrder: nextTask ? Number(nextTask.quest_order || 1) : Number(task.quest_order || 1) + 1,
                completed: !nextTask,
                completedTaskIds: Array.from(completedTaskIds)
            };
            currentStoryCompletedTaskIds = new Set(nextState.completedTaskIds);
            saveTutorialGuestState(nextState, currentQuestChainId);
        }

        async function completeTutorialLoggedInTask(task, answer) {
            if (!task || !getLoginUser()) return;
            try {
                await requestJson(`/api/tutorial/tasks/${task.id}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ answer: answer || 'tutorial_pass' })
                }, '教學模式完成任務');
            } catch (err) {
                console.warn('教學模式已登入任務完成失敗:', err.message);
            }
        }

        function shouldSuppressCameraAlert() {
            const params = new URLSearchParams(window.location.search);
            const urlMode = params.get('mode');
            const questChainId = Number(params.get('questChainId') || 0);
            return (
                isCurrentQuestTutorialMode()
                || questChainId === 9
                || questChainId === 10
                || urlMode === 'story_campaign'
                || urlMode === 'board_game'
            );
        }

        function renderTutorialModeUi() {
            const isTutorialStory = currentEntryMode === 'story_campaign' && isCurrentQuestTutorialMode();
            const isTutorialBoard = currentEntryMode === 'board_game' && isCurrentQuestTutorialMode();
            const shouldHideTutorialChrome = isTutorialStory || isTutorialBoard;
            const isPhotoCapture = isPhotoTaskCaptureActive();
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
            document.querySelector('.game-hud')?.classList.toggle('tutorial-hidden', isTutorialStory);
            document.querySelector('.game-shell-board-status')?.classList.toggle('tutorial-hidden', isTutorialBoard);
            document.querySelector('.mini-selection-toolbar')?.classList.toggle('tutorial-hidden', shouldHideTutorialChrome);
            document.body.classList.toggle('tutorial-board-clean', isTutorialBoard);
            document.body.classList.toggle('tutorial-story-clean', isTutorialStory);
            featureDockMenu?.classList.toggle('hidden', !isTutorialBoard);
            setImmersiveCameraMode(isPhotoCapture);
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
                locationBar.style.display = shouldHideTutorialChrome ? 'none' : '';
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

            let exitBtn = document.getElementById('tutorialExitBtn');
            if (shouldHideTutorialChrome && !exitBtn) {
                exitBtn = document.createElement('button');
                exitBtn.id = 'tutorialExitBtn';
                exitBtn.className = 'tutorial-exit-btn';
                exitBtn.textContent = '退出教學';
                exitBtn.addEventListener('click', () => {
                    if (confirm('確定要退出教學模式嗎？')) {
                        window.location.href = '/index.html';
                    }
                });
                document.body.appendChild(exitBtn);
            } else if (!shouldHideTutorialChrome && exitBtn) {
                exitBtn.remove();
            }
        }

        function getBoardTileMeta(tile) {
            if (!tile) return {};
            if (tile.tile_meta && typeof tile.tile_meta === 'object') return tile.tile_meta;
            if (typeof tile.tile_meta === 'string') {
                try {
                    return JSON.parse(tile.tile_meta);
                } catch (err) {
                    return {};
                }
            }
            return {};
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

        async function playDiceRollAnimation(rollValue, targetTile = null) {
            if (!diceOverlay || !diceCube || !diceOverlayText) return;
            diceOverlay.classList.remove('hidden');
            diceCube.classList.remove('rolling');
            diceCube.textContent = '🎲';
            diceOverlayText.textContent = '命運之骰正在翻滾，請稍候...';
            void diceCube.offsetWidth;
            diceCube.classList.add('rolling');
            
            // 播放骰子音效
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(400, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
                osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.2);
                osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.3);
                gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                osc.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.3);
            } catch (e) {
                // ignore audio error
            }

            await new Promise((resolve) => setTimeout(resolve, 400));
            diceCube.classList.remove('rolling');
            diceCube.textContent = String(rollValue);
            diceOverlayText.textContent = targetTile
                ? `你擲出了 ${rollValue}，接下來前往第 ${targetTile.tile_index} 格「${targetTile.tile_name}」。`
                : `你擲出了 ${rollValue}。`;
            
            // 播放結果音效
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                osc.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.5);
            } catch (e) {
                // ignore audio error
            }

            await new Promise((resolve) => setTimeout(resolve, 800));
            diceOverlay.classList.add('hidden');
        }

        function hideBoardCardOverlay() {
            if (boardCardOverlay) boardCardOverlay.classList.add('hidden');
            if (slotMachine) slotMachine.classList.add('hidden');
            if (fortuneWheelWrap) fortuneWheelWrap.classList.add('hidden');
            if (fortuneWheel) fortuneWheel.style.transform = 'rotate(0deg)';
        }

        async function playBoardDrawCardAnimation(tile) {
            const meta = getBoardTileMeta(tile);
            const cardType = meta.card_type || (tile.tile_type === 'reward' ? 'chance' : 'fate');
            const drawPool = Array.isArray(meta.draw_pool) && meta.draw_pool.length
                ? meta.draw_pool
                : [
                    { label: '獲得 5 點旅程積分', effect_type: 'gain_points', effect_value: 5, icon: '🌊', flavor: '海流替你送來一點順風。' },
                    { label: '獲得 8 點旅程積分', effect_type: 'gain_points', effect_value: 8, icon: '🎁', flavor: '補給箱剛好漂到你腳邊。' },
                    { label: '順風前進 1 格', effect_type: 'move_forward', effect_value: 1, icon: '🧭', flavor: '命運把你往前推了一小段。' },
                    { label: '保持原地穩穩前進', effect_type: 'narrative', effect_value: 0, icon: '✨', flavor: '這一步沒有額外效果，但節奏依舊漂亮。' }
                ];
            const outcome = drawPool[Math.floor(Math.random() * drawPool.length)];
            if (!boardCardOverlay || !boardCardBadge || !boardCardTitle || !boardCardSubtitle || !boardCardResult) {
                return outcome;
            }

            boardCardBadge.textContent = cardType === 'chance' ? '機會卡' : '命運卡';
            boardCardTitle.textContent = tile.tile_name || (cardType === 'chance' ? '抽取機會卡' : '抽取命運卡');
            boardCardSubtitle.textContent = cardType === 'chance'
                ? '吃角子老虎機正在替你翻出這一張卡。'
                : '命運轉盤正在轉動，請等待落點。';
            boardCardResult.textContent = '抽取結果中...';
            boardCardOverlay.classList.remove('hidden');

            if (cardType === 'chance') {
                const symbols = ['🌊', '🧭', '🎁', '✨', '🐚', '🐟'];
                slotMachine?.classList.remove('hidden');
                fortuneWheelWrap?.classList.add('hidden');
                [slotReelA, slotReelB, slotReelC].forEach((reel) => {
                    reel?.parentElement?.classList.add('spinning');
                });
                for (let index = 0; index < 16; index += 1) {
                    if (slotReelA) slotReelA.textContent = symbols[(index + 1) % symbols.length];
                    if (slotReelB) slotReelB.textContent = symbols[(index + 3) % symbols.length];
                    if (slotReelC) slotReelC.textContent = symbols[(index + 5) % symbols.length];
                    await new Promise((resolve) => setTimeout(resolve, 85));
                }
                if (slotReelA) slotReelA.textContent = outcome.icon || '🌊';
                if (slotReelB) slotReelB.textContent = outcome.icon || '🌊';
                if (slotReelC) slotReelC.textContent = outcome.icon || '🌊';
                [slotReelA, slotReelB, slotReelC].forEach((reel) => {
                    reel?.parentElement?.classList.remove('spinning');
                });
            } else {
                slotMachine?.classList.add('hidden');
                fortuneWheelWrap?.classList.remove('hidden');
                if (fortuneWheel) {
                    const spins = 5 + Math.floor(Math.random() * 2);
                    const sectors = drawPool.length;
                    const chosenIndex = Math.max(0, drawPool.findIndex((item) => item.label === outcome.label));
                    const sectorAngle = 360 / sectors;
                    const stopAngle = 360 - (chosenIndex * sectorAngle) - sectorAngle / 2;
                    fortuneWheel.style.transform = `rotate(${spins * 360 + stopAngle}deg)`;
                }
                await new Promise((resolve) => setTimeout(resolve, 2100));
            }

            boardCardResult.textContent = `${outcome.label}\n${outcome.flavor || ''}`.trim();
            await new Promise((resolve) => setTimeout(resolve, 1250));
            hideBoardCardOverlay();
            return outcome;
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

        function inferBoardChallengeType(tile) {
            const explicitType = tile?.task_type || tile?.linked_task_type;
            if (explicitType) return explicitType;
            const joinedLabel = `${tile?.tile_name || ''} ${tile?.task_name || ''}`.toLowerCase();
            if (joinedLabel.includes('選擇') || joinedLabel.includes('抉擇')) return 'multiple_choice';
            if (joinedLabel.includes('口令') || joinedLabel.includes('輸入') || joinedLabel.includes('找的東西')) return 'keyword';
            if (joinedLabel.includes('密碼') || joinedLabel.includes('解鎖')) return 'number';
            if (joinedLabel.includes('拍') || joinedLabel.includes('留影') || joinedLabel.includes('觀測')) return 'photo';
            return null;
        }

        function syncBoardMapQuery(boardMapId) {
            const url = new URL(window.location.href);
            if (boardMapId) url.searchParams.set('boardMapId', String(boardMapId));
            else url.searchParams.delete('boardMapId');
            window.history.replaceState({}, '', url);
        }

        function renderBoardMapSelector() {
            if (!boardMapSelector) return;

            if (currentEntryMode !== 'board_game' || !currentBoardMaps.length) {
                boardMapSelector.innerHTML = '<option value="">目前沒有可切換的棋盤</option>';
                boardMapSelector.disabled = true;
                if (boardMapSelectorStatus) boardMapSelectorStatus.textContent = '進入大富翁模式後，這裡會列出同入口下的可遊玩棋盤。';
                return;
            }

            boardMapSelector.innerHTML = currentBoardMaps.map((boardMap) => {
                const tileCount = Number(boardMap.tile_count || 0);
                return `<option value="${boardMap.id}">${boardMap.name}${tileCount ? `｜${tileCount} 格` : ''}</option>`;
            }).join('');
            boardMapSelector.value = String(currentBoardMap?.id || currentBoardMaps[0]?.id || '');
            boardMapSelector.disabled = currentBoardMaps.length <= 1;

            if (boardMapSelectorStatus) {
                const challengeCount = Number(currentBoardMap?.challenge_tile_count || 0);
                const eventCount = Number(currentBoardMap?.event_tile_count || 0);
                boardMapSelectorStatus.textContent = [
                    currentBoardMap?.name ? `目前棋盤：${currentBoardMap.name}` : null,
                    challengeCount ? `${challengeCount} 個挑戰格` : null,
                    eventCount ? `${eventCount} 個事件格` : null
                ].filter(Boolean).join('｜') || '目前沒有可用的棋盤摘要。';
            }
        }

        function persistBoardRunState() {
            if (!currentBoardRun || currentEntryMode !== 'board_game' || useRemoteBoardSession) return;
            localStorage.setItem(getBoardRunStorageKey(), JSON.stringify(currentBoardRun));
        }

        function hydrateBoardRunStateLocally() {
            if (currentEntryMode !== 'board_game' || !currentBoardMap) return;
            let saved = null;
            try {
                saved = JSON.parse(localStorage.getItem(getBoardRunStorageKey()) || 'null');
            } catch (err) {
                saved = null;
            }

            const startTile = Number(currentBoardMap.start_tile || 1);
            currentBoardRun = {
                currentTile: Number(saved?.currentTile || startTile),
                round: Number(saved?.round || 0),
                pendingRoll: saved?.pendingRoll ? Number(saved.pendingRoll) : null,
                pendingTargetTile: saved?.pendingTargetTile ? Number(saved.pendingTargetTile) : null,
                gainedPoints: Number(saved?.gainedPoints || 0)
            };
            persistBoardRunState();
            renderBoardPanel();
            renderHudSummary();
        }

        function updateBoardRunFromSession(session) {
            if (!session) return;
            currentBoardSessionId = session.id;
            const lastResult = session.last_result || null;
            let lastResultText = '';
            if (lastResult?.phase === 'rolled') {
                lastResultText = lastResult.message || `剛擲出 ${lastResult.rollValue}，目標前往第 ${lastResult.targetTileIndex} 格。`;
            } else if (lastResult?.phase === 'resolved') {
                lastResultText = lastResult.message || (lastResult.success
                    ? `挑戰成功，已推進到第 ${lastResult.nextTile} 格。`
                    : `挑戰失敗，目前退回到第 ${lastResult.nextTile} 格。`);
            }
            currentBoardRun = {
                currentTile: Number(session.current_tile || currentBoardMap?.start_tile || 1),
                round: Number(session.round_count || 0),
                pendingRoll: session.pending_roll == null ? null : Number(session.pending_roll),
                pendingTargetTile: session.pending_target_tile == null ? null : Number(session.pending_target_tile),
                gainedPoints: Number(session.gained_points || 0),
                lastResultText
            };
            renderBoardPanel();
            renderHudSummary();
        }

        async function hydrateBoardRunState() {
            if (currentEntryMode !== 'board_game' || !currentBoardMap) return;
            const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
            if (!getLoginUser()) {
                useRemoteBoardSession = false;
                currentBoardSessionId = null;
                hydrateBoardRunStateLocally();
                return;
            }

            try {
                const res = await fetch('/api/board/session/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        questChainId: currentQuestChainId,
                        boardMapId: currentBoardMap?.id || null,
                        preview: previewMode
                    })
                });
                if (!res.ok) {
                    throw new Error('board session start failed');
                }
                const data = await res.json();
                if (!data.success || !data.session) {
                    throw new Error(data.message || 'board session start failed');
                }
                useRemoteBoardSession = true;
                updateBoardRunFromSession(data.session);
            } catch (err) {
                console.warn('啟動遠端大富翁 session 失敗，改用本地暫存', err);
                useRemoteBoardSession = false;
                currentBoardSessionId = null;
                hydrateBoardRunStateLocally();
            }
        }

        function getResolvedBoardTargetTile(rollValue) {
            const start = Number(currentBoardRun?.currentTile || currentBoardMap?.start_tile || 1);
            const finishTile = Number(currentBoardMap?.finish_tile || currentBoardTiles.length || start);
            const exactFinishRequired = Boolean(currentBoardMap?.exact_finish_required);
            const desired = start + rollValue;
            if (!exactFinishRequired) return Math.min(desired, finishTile);
            return desired > finishTile ? start : desired;
        }

        function renderBoardPanel() {
            if (currentEntryMode !== 'board_game') {
                renderBoardMapSelector();
                if (boardPanelStatus) boardPanelStatus.textContent = '目前未進入大富翁模式。';
                if (boardPanelMeta) boardPanelMeta.textContent = '請先從首頁選擇一場大富翁活動。';
                if (boardPanelAction) boardPanelAction.textContent = '請先從首頁選擇大富翁活動。';
                if (boardPanelTrack) boardPanelTrack.innerHTML = '<div class="board-track-chip muted">請先進入大富翁模式。</div>';
                if (floatingDiceBtn) floatingDiceBtn.classList.add('hidden');
                if (boardFocusBtn) boardFocusBtn.disabled = true;
                return;
            }

            const finishTile = Number(currentBoardMap?.finish_tile || currentBoardTiles.length || 1);
            const pendingTile = currentBoardRun?.pendingTargetTile ? getBoardTileByIndex(currentBoardRun.pendingTargetTile) : null;
            const tileCount = Number(currentBoardMap?.tile_count || currentBoardTiles.length || 0);
            renderBoardMapSelector();

            if (boardPanelStatus) {
                boardPanelStatus.textContent = `目前在第 ${currentBoardRun?.currentTile || 1} 格，本局已行動 ${currentBoardRun?.round || 0} 次，終點是第 ${finishTile} 格。這張棋盤共有 ${tileCount} 格。`;
            }

            if (boardPanelMeta) {
                const modeText = useRemoteBoardSession && currentBoardSessionId
                    ? `已接上後端 session #${currentBoardSessionId}，棋盤狀態會跟著帳號保存。`
                    : '目前使用本機暫存模式，重新登入或換裝置不會同步。';
                const lastResultText = currentBoardRun?.lastResultText ? ` 上一個結果：${currentBoardRun.lastResultText}` : '';
                boardPanelMeta.textContent = `${modeText}${lastResultText}`;
            }

            if (boardPanelAction) {
                if (pendingTile) {
                    const pendingTaskType = inferBoardChallengeType(pendingTile);
                    const pendingModeText = pendingTaskType === 'multiple_choice'
                        ? '這是一題選擇題，任選答案都會先放行。'
                        : (pendingTaskType === 'keyword'
                            ? '這是一題文字輸入，任意輸入內容都能先通關。'
                            : (pendingTaskType === 'number'
                                ? '這是一題數字解鎖，任意密碼都會先放行。'
                                : '這是一題拍照挑戰，會直接用黃色圓框拍照作答。'));
                    boardPanelAction.textContent = pendingTile.task_id
                        ? `你剛擲出 ${currentBoardRun.pendingRoll}，本回合目標是第 ${pendingTile.tile_index} 格「${pendingTile.tile_name}」。${pendingModeText}`
                        : `你剛擲出 ${currentBoardRun.pendingRoll}，本回合目標是第 ${pendingTile.tile_index} 格「${pendingTile.tile_name}」。事件觸發後會自動結算這一步。`;
                } else {
                    boardPanelAction.textContent = '按下「擲骰前進」開始本回合，系統會把你帶到對應格子的焦點內容。';
                }
            }

            if (boardPanelTrack) {
                const tutorialBoardMode = currentEntryMode === 'board_game' && isCurrentQuestTutorialMode();
                boardPanelTrack.innerHTML = currentBoardTiles.map((tile) => {
                    let cls = 'board-track-chip';
                    let prefix = `第 ${tile.tile_index} 格`;
                    if (Number(tile.tile_index) === Number(currentBoardRun?.currentTile)) {
                        cls += ' current';
                        prefix = '目前位置';
                    } else if (Number(tile.tile_index) === Number(currentBoardRun?.pendingTargetTile)) {
                        cls += ' pending';
                        prefix = '本回合目標';
                    }
                    if (Number(tile.tile_index) === Number(currentBoardMap?.start_tile || 1)) {
                        cls += ' start';
                    }
                    if (Number(tile.tile_index) === Number(currentBoardMap?.finish_tile || currentBoardTiles.length || 1)) {
                        cls += ' finish';
                    }
                    const tileTaskType = inferBoardChallengeType(tile);
                    const modeTag = tile.task_id
                        ? (tileTaskType === 'multiple_choice'
                            ? '問題關卡'
                            : (tileTaskType === 'keyword'
                                ? '文字關卡'
                                : (tileTaskType === 'number'
                                    ? '數字關卡'
                                    : '挑戰關卡')))
                        : (getBoardTileMeta(tile).card_type === 'chance'
                            ? '機會關卡'
                            : (getBoardTileMeta(tile).card_type === 'fate'
                                ? '命運關卡'
                                : '事件關卡'));
                    const stepLabel = tutorialBoardMode
                        ? getCircledStepLabel(tile.tile_index)
                        : String(tile.tile_index);
                    return `<button type="button" class="${cls}" data-tile-index="${tile.tile_index}" aria-label="${prefix} ${tile.tile_name || '未命名格子'} ${modeTag}">
                        <span class="tile-name">${tile.tile_name || '未命名格子'}</span>
                        <span class="tile-index">${stepLabel}</span>
                        <span class="tile-meta">${modeTag}</span>
                    </button>`;
                }).join('');
            }

            if (floatingDiceBtn) {
                const isFinished = Number(currentBoardRun?.currentTile) === finishTile;
                if (isFinished) {
                    floatingDiceBtn.classList.add('hidden');
                } else {
                    floatingDiceBtn.classList.toggle('hidden', Boolean(currentBoardRun?.pendingTargetTile) || currentEntryMode !== 'board_game');
                }
            }
            if (boardFocusBtn) boardFocusBtn.disabled = !currentBoardRun?.pendingTargetTile;
            renderBoardMiniMap();
        }

        function renderBoardMiniMap() {
            if (!boardMiniMap || !boardMiniMapDots) return;
            if (currentEntryMode !== 'board_game' || !currentBoardTiles.length) {
                boardMiniMap.classList.add('hidden');
                return;
            }
            boardMiniMap.classList.remove('hidden');
            const currentTile = Number(currentBoardRun?.currentTile || 1);
            const pendingTile = Number(currentBoardRun?.pendingTargetTile || 0);
            boardMiniMapDots.innerHTML = currentBoardTiles.map((tile) => {
                const idx = Number(tile.tile_index);
                let cls = 'mini-dot';
                if (idx === currentTile) cls += ' current';
                else if (idx === pendingTile) cls += ' pending';
                else if (idx < currentTile) cls += ' visited';
                return `<span class="${cls}" data-tile-index="${idx}"></span>`;
            }).join('');
        }

        function getCircledStepLabel(index) {
            const labels = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
            return labels[Number(index)] || String(index);
        }

        function showBoardTilePreview(tile) {
            if (!tile) return;
            const tileMeta = getBoardTileMeta(tile);
            const tileTaskType = inferBoardChallengeType(tile);
            const modeText = tile.task_id
                ? (tileTaskType === 'multiple_choice'
                    ? '這一格是選擇題挑戰。'
                    : (tileTaskType === 'keyword'
                        ? '這一格是文字輸入挑戰。'
                        : (tileTaskType === 'number'
                            ? '這一格是數字解鎖挑戰。'
                            : '這一格是拍照挑戰。')))
                : (tileMeta.card_type === 'chance'
                    ? '這一格會抽出機會卡。'
                    : (tileMeta.card_type === 'fate'
                        ? '這一格會轉出命運卡。'
                        : '這一格是事件或劇情格。'));
            const detailText = tile.event_body || tile.task_description || tile.guide_content || '這一格會在輪到時展開內容。';
            showNpcDialog({
                speakerKey: tileMeta.card_type === 'chance'
                    ? 'host'
                    : tileMeta.card_type === 'fate'
                        ? 'lore'
                        : tile.task_id
                            ? 'gatekeeper'
                            : 'guide',
                mood: `第 ${tile.tile_index} 格`,
                text: `${tile.tile_name || '未命名格子'}\n\n${modeText}\n\n${detailText}`,
                blocking: false,
                autoCloseMs: 2400
            });
        }

        async function completeBoardTurn(success, options = {}) {
            if (currentEntryMode !== 'board_game' || !currentBoardRun?.pendingTargetTile) return;
            const pendingTile = getBoardTileByIndex(currentBoardRun.pendingTargetTile);
            const {
                speakerKey = success ? 'judge' : 'rescue',
                mood = success ? '通關判定' : '補救判定',
                text = null,
                autoCloseMs = 2200,
                skipDialog = false,
                bonusPoints = 0,
                advanceExtra = 0
            } = options;
            if (useRemoteBoardSession && currentBoardSessionId) {
                const res = await fetch(`/api/board/session/${currentBoardSessionId}/resolve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ success })
                });
                const data = await res.json();
                if (!data.success || !data.session) {
                    throw new Error(data.message || '結算回合失敗');
                }
                updateBoardRunFromSession(data.session);
                loadPlayerHudStats();
                if (!skipDialog) {
                    const finalMsg = (text
                            || (success
                                ? (data.session?.last_result?.message || `挑戰成功，你已正式推進到第 ${data.session.current_tile} 格。`)
                                : (data.session?.last_result?.message || `這回合未通過，目前回退到第 ${data.session.current_tile} 格，調整後再出發。`))) + '\n\n按下骰子繼續前進';
                    await showNpcDialog({
                        speakerKey,
                        mood,
                        text: finalMsg,
                        autoCloseMs
                    });
                }
                if (data.session.pending_target_tile == null) {
                    const focusTile = getBoardTileByIndex(data.session.current_tile);
                    if (focusTile) {
                        currentBoardActiveTileId = focusTile.id;
                        renderGameShellEntries(currentBoardTiles, focusTile.id);
                        updateGameShellProgress(focusTile);
                    }
                }
                return;
            }

            if (success) {
                const finishTile = Number(currentBoardMap?.finish_tile || currentBoardTiles.length || currentBoardRun.pendingTargetTile);
                const nextTile = Math.min(finishTile, Number(currentBoardRun.pendingTargetTile) + Number(advanceExtra || 0));
                currentBoardRun.currentTile = nextTile;
                const turnPoints = Number(currentTask?.points || pendingTile?.effect_value || 0) + Number(bonusPoints || 0);
                currentBoardRun.gainedPoints += turnPoints;
                currentBoardRun.lastResultText = text || `「${pendingTile?.tile_name || '這一格'}」通過判定，已推進到第 ${currentBoardRun.currentTile} 格。${turnPoints > 0 ? ` 本回合獲得 ${turnPoints} 點旅程積分。` : ''}`;
            } else {
                const failureMove = Number(currentBoardMap?.failure_move || -1);
                currentBoardRun.currentTile = Math.max(Number(currentBoardMap?.start_tile || 1), Number(currentBoardRun.currentTile || 1) + failureMove);
                currentBoardRun.lastResultText = text || `「${pendingTile?.tile_name || '這一格'}」未通過，依棋盤規則退回到第 ${currentBoardRun.currentTile} 格。`;
            }
            currentBoardRun.round = Number(currentBoardRun.round || 0) + 1;
            currentBoardRun.pendingRoll = null;
            currentBoardRun.pendingTargetTile = null;
            persistBoardRunState();
            renderBoardPanel();
            renderHudSummary();
            loadPlayerHudStats();
            if (!skipDialog) {
                const finalMsg = (text || currentBoardRun.lastResultText || (success ? '挑戰成功。' : '挑戰失敗，請重新調整。')) + '\n\n按下骰子繼續前進';
                await showNpcDialog({
                    speakerKey,
                    mood,
                    text: finalMsg,
                    autoCloseMs
                });
            }
            const focusTile = getBoardTileByIndex(currentBoardRun.currentTile);
            if (focusTile) {
                currentBoardActiveTileId = focusTile.id;
                renderGameShellEntries(currentBoardTiles, focusTile.id);
                updateGameShellProgress(focusTile);
            }
        }

        async function startBoardTurn() {
            if (currentEntryMode !== 'board_game' || !currentBoardMap || currentBoardRun?.pendingTargetTile) return;
            closeDockPanels();
            if (npcDialog && npcDialog.classList.contains('passive') && !npcDialog.classList.contains('hidden')) {
                closeNpcDialog();
            }
            if (useRemoteBoardSession && currentBoardSessionId) {
                const res = await fetch(`/api/board/session/${currentBoardSessionId}/roll`, {
                    method: 'POST',
                    credentials: 'include'
                });
                const data = await res.json();
                if (!data.success || !data.session) {
                    throw new Error(data.message || '擲骰失敗');
                }
                updateBoardRunFromSession(data.session);
                if (data.targetTile) {
                    const focusTile = getBoardTileByIndex(data.targetTile.tile_index);
                    if (focusTile) {
                        await playDiceRollAnimation(data.session.pending_roll, focusTile);
                        await focusBoardTile(focusTile);
                    }
                }
                return;
            }
            const diceMin = Number(currentBoardMap.dice_min || 1);
            const diceMax = Number(currentBoardMap.dice_max || 6);
            const tutorialRoll = getTutorialBoardRollValue(currentBoardRun?.round || 0);
            const rollValue = tutorialRoll && tutorialRoll >= diceMin && tutorialRoll <= diceMax
                ? tutorialRoll
                : (Math.floor(Math.random() * (diceMax - diceMin + 1)) + diceMin);
            const targetTileIndex = getResolvedBoardTargetTile(rollValue);
            const targetTile = getBoardTileByIndex(targetTileIndex);
            currentBoardRun.pendingRoll = rollValue;
            currentBoardRun.pendingTargetTile = targetTileIndex;
            currentBoardRun.lastResultText = `剛擲出 ${rollValue}，目標前往第 ${targetTileIndex} 格。`;
            persistBoardRunState();
            renderBoardPanel();
            if (targetTile) {
                await playDiceRollAnimation(rollValue, targetTile);
                await focusBoardTile(targetTile);
            }
        }

        function updateGameShellProgress(activeEntry = null) {
            if (!gameShellProgress) return;
            if (currentEntryMode === 'story_campaign') {
                if (!currentStoryTasks.length) {
                    gameShellProgress.textContent = '目前沒有可進行的關卡';
                    return;
                }
                if (currentStoryCompleted) {
                    gameShellProgress.textContent = `劇情主線已完成｜共 ${currentStoryTasks.length} 關`;
                    return;
                }
                const activeOrder = Number(activeEntry?.quest_order || 1);
                gameShellProgress.textContent = `目前進度：第 ${activeOrder} 關 / 共 ${currentStoryTasks.length} 關`;
                return;
            }
            if (currentEntryMode === 'board_game') {
                if (!currentBoardTiles.length) {
                    gameShellProgress.textContent = '等待棋盤資料';
                    return;
                }
                const activeIndex = Number(activeEntry?.tile_index || 1);
                const finishTile = currentBoardMap?.finish_tile ? `｜終點：第 ${currentBoardMap.finish_tile} 格` : '';
                gameShellProgress.textContent = `目前焦點：第 ${activeIndex} 格 / 共 ${currentBoardTiles.length} 格${finishTile}`;
                return;
            }
            gameShellProgress.textContent = '等待載入';
        }

        function renderGameShellEntries(entries = [], activeId = null) {
            if (!gameShellEntries) return;
            if (!entries.length) {
                gameShellEntries.innerHTML = '<div class="game-shell-entry muted">目前沒有可顯示的內容。</div>';
                return;
            }
            gameShellEntries.innerHTML = entries.map((entry) => {
                const isActive = String(activeId) === String(entry.id);
                const isCompletedStoryEntry = !entry.tile_index && currentStoryCompletedTaskIds.has(Number(entry.id));
                const title = entry.name || entry.tile_name || '未命名內容';
                const subtitle = entry.stage_intro || entry.description || entry.event_body || entry.task_description || '';
                const badge = entry.quest_order ? `第 ${entry.quest_order} 關` : (entry.tile_index ? `第 ${entry.tile_index} 格` : '');
                const entryType = entry.tile_index ? 'board' : 'story';
                return `
                    <button class="game-shell-entry ${isActive ? 'active' : ''} ${isCompletedStoryEntry ? 'completed' : ''}" type="button" data-entry-id="${entry.id}" data-entry-type="${entryType}">
                        <strong>${badge ? `${badge}｜` : ''}${title}</strong>
                        <span>${isCompletedStoryEntry ? `已完成｜${subtitle || '這一步已通過。'}` : (subtitle || '等待內容補充。')}</span>
                    </button>
                `;
            }).join('');
        }

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

        async function focusStoryTask(task) {
            if (!task) return;
            renderGameShellEntries(currentStoryTasks, task.id);
            updateGameShellProgress(task);
            applyTaskSelection(task, { updateUrl: false, skipNearbyReload: true });
            renderHudSummary();
            if (isCurrentQuestTutorialMode() && !tutorialFlowStarted) {
                return;
            }
            const dialogueKey = `${currentQuestChainId || 'quest'}:${task.id}:${currentStoryCompleted ? 'done' : 'active'}`;
            if (lastStoryDialogueKey !== dialogueKey) {
                lastStoryDialogueKey = dialogueKey;
                await showNpcDialog({
                    speakerKey: currentStoryCompleted ? 'host' : getStoryIntroSpeaker(task),
                    mood: currentStoryCompleted ? '劇情完結' : `第 ${task.quest_order || '?'} 關`,
                    text: currentStoryCompleted
                        ? '這條劇情主線已經完整收束。你可以留在探索艙回味剛才的旅程，或回首頁切換其他玩法。'
                        : buildStoryIntroDialogue(task)
                });
            }
        }

        async function focusBoardTile(tile) {
            if (!tile) return;
            closeDockPanels();
            currentBoardActiveTileId = tile.id;
            renderGameShellEntries(currentBoardTiles, tile.id);
            updateGameShellProgress(tile);
            if (gameShellObjective) {
                gameShellObjective.textContent = tile.event_body || tile.task_description || '請前往指定格子，完成這一步的挑戰。';
            }
            renderBoardPanel();
            renderHudSummary();
            if (tile.task_id) {
                const res = await fetch(`/api/tasks/${tile.task_id}`);
                const data = await res.json();
                if (data.success && data.task) {
                    applyTaskSelection(data.task, { updateUrl: false, skipNearbyReload: true });
                    const shouldAutoStartTutorialBoardTask = currentEntryMode === 'board_game'
                        && isCurrentQuestTutorialMode()
                        && currentBoardRun?.pendingTargetTile
                        && Number(currentBoardRun.pendingTargetTile) === Number(tile.tile_index);
                    await showNpcDialog({
                        speakerKey: tile.tile_type === 'challenge' ? 'gatekeeper' : 'lore',
                        mood: tile.tile_type === 'challenge' ? '挑戰開始' : '關卡提示',
                        text: data.task.stage_intro || data.task.description || `第 ${tile.tile_index} 格的挑戰已展開，請讓 AI 裁判檢查你的表現。`,
                        autoCloseMs: shouldAutoStartTutorialBoardTask ? 1400 : 2200,
                        blocking: !shouldAutoStartTutorialBoardTask
                    });
                    if (shouldAutoStartTutorialBoardTask) {
                        await startTaskInteraction();
                    }
                }
                return;
            }
            const eventText = tile.event_body || tile.guide_content || tile.description || `你來到第 ${tile.tile_index} 格，這裡有新的事件等待觸發。`;
            const tileMeta = getBoardTileMeta(tile);
            const isResolvingPendingEvent = currentEntryMode === 'board_game'
                && currentBoardRun?.pendingTargetTile
                && Number(currentBoardRun.pendingTargetTile) === Number(tile.tile_index);
            if (isResolvingPendingEvent) {
                let boardEventOutcome = null;
                if (tileMeta.card_type) {
                    boardEventOutcome = await playBoardDrawCardAnimation(tile);
                }
                const bonusPoints = boardEventOutcome?.effect_type === 'gain_points'
                    ? Number(boardEventOutcome.effect_value || 0)
                    : 0;
                const advanceExtra = boardEventOutcome?.effect_type === 'move_forward'
                    ? Number(boardEventOutcome.effect_value || 0)
                    : 0;
                const resolvedText = boardEventOutcome
                    ? `${eventText}\n\n抽卡結果：${boardEventOutcome.label}。${boardEventOutcome.flavor || ''}`
                    : `${eventText}\n命運已記錄這一步，你的隊伍會繼續向前推進。`;
                await completeBoardTurn(true, {
                    speakerKey: tile.tile_type === 'event'
                        ? (tileMeta.card_type === 'chance' ? 'host' : 'lore')
                        : 'lore',
                    mood: tileMeta.card_type === 'chance'
                        ? '機會卡結算'
                        : tileMeta.card_type === 'fate'
                            ? '命運卡結算'
                            : (tile.tile_type === 'event' ? '事件觸發' : '場景提示'),
                    text: resolvedText,
                    autoCloseMs: 2600
                    ,
                    bonusPoints,
                    advanceExtra
                });
                return;
            }
            await showNpcDialog({
                speakerKey: tile.tile_type === 'event' ? 'host' : 'lore',
                mood: tile.tile_type === 'event' ? '事件觸發' : '場景提示',
                text: eventText,
                autoCloseMs: 2600
            });
        }

        async function loadStoryShell(questChainId) {
            Swal.fire({
                title: '正在為你準備教學場景...',
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            try {
                const [contentRes, progressMap] = await Promise.all([
                    fetch(`/api/quest-chains/${questChainId}/public-content`),
                    fetchQuestProgressMap()
                ]);
                const contentData = await contentRes.json();
                if (!contentData.success) {
                    throw new Error(contentData.message || '載入劇情失敗');
                }
                currentQuestChainId = questChainId;
                currentQuestChainData = contentData.questChain || null;
                currentEntryMode = 'story_campaign';
                currentStoryTasks = Array.isArray(contentData.tasks) ? contentData.tasks : [];
                currentStoryCompleted = false;
                currentStoryCompletedTaskIds = new Set();
                lastStoryDialogueKey = null;
                tutorialFlowStarted = false;
                tutorialIntroTaskId = null;
                isShellExperience = true;
                updateShellModeUi();
                renderTutorialModeUi();
                loadPlayerHudStats();
                const tutorialGuestState = isTutorialGuestStoryMode() ? getTutorialGuestState(questChainId) : null;
                if (tutorialGuestState) {
                    currentStoryCompletedTaskIds = new Set(tutorialGuestState.completedTaskIds || []);
                }
                const progressOrder = tutorialGuestState
                    ? Number(tutorialGuestState.currentOrder || 1)
                    : Number(progressMap?.[String(questChainId)]);
                const maxStoryOrder = currentStoryTasks.reduce((max, task) => Math.max(max, Number(task.quest_order || 0)), 0);
                currentStoryCompleted = tutorialGuestState
                    ? Boolean(tutorialGuestState.completed)
                    : (Number.isFinite(progressOrder) && progressOrder > maxStoryOrder && maxStoryOrder > 0);
                const activeTask = currentStoryCompleted
                    ? currentStoryTasks.find(task => Number(task.quest_order) === maxStoryOrder) || currentStoryTasks[currentStoryTasks.length - 1] || null
                    : ((Number.isFinite(progressOrder) && progressOrder > 0)
                        ? currentStoryTasks.find(task => Number(task.quest_order) === progressOrder) || currentStoryTasks[0]
                        : currentStoryTasks[0]);

                if (gameShellMode) gameShellMode.textContent = isCurrentQuestTutorialMode() ? '教學模式' : (isCurrentQuestDemoMode() ? '劇情體驗' : '劇情主線');
                if (gameShellTitle) gameShellTitle.textContent = contentData.questChain.title || contentData.questChain.name || '劇情主線';
                if (gameShellSummary) gameShellSummary.textContent = contentData.questChain.short_description || contentData.questChain.description || '跟著劇情節奏完成一連串 AI 關卡。';
                updateGameShellProgress(activeTask);
                renderGameShellEntries(currentStoryTasks, activeTask?.id);
                if (activeTask) {
                    await focusStoryTask(activeTask);
                    if (currentStoryCompleted && gameShellObjective) {
                        gameShellObjective.textContent = '這條劇情主線已完成，現在可以回首頁切換其他劇情，或直接進入大富翁模式。';
                    }
                }
                Swal.close();
            } catch (err) {
                Swal.close();
                throw err;
            }
        }

        async function loadBoardShell(questChainId, preferredBoardMapId = null, previewMode = false) {
            Swal.fire({
                title: '正在為你準備教學場景...',
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            try {
                const params = new URLSearchParams();
                if (preferredBoardMapId) params.set('boardMapId', String(preferredBoardMapId));
                if (previewMode) params.set('preview', '1');
                const boardApi = `/api/board-maps/by-quest-chain/${questChainId}${params.toString() ? `?${params.toString()}` : ''}`;
                const boardRes = await fetch(boardApi);
                const boardData = await boardRes.json();
                if (!boardData.success) {
                    throw new Error(boardData.message || '載入大富翁內容失敗');
                }
                currentQuestChainId = questChainId;
                currentQuestChainData = boardData.questChain || null;
                currentEntryMode = 'board_game';
                currentStoryCompleted = false;
                currentBoardMaps = Array.isArray(boardData.boardMaps) ? boardData.boardMaps : [];
                currentBoardMap = boardData.boardMap || null;
                currentBoardTiles = Array.isArray(boardData.tiles) ? boardData.tiles : [];
                isShellExperience = true;
                tutorialFlowStarted = false;
                tutorialIntroTaskId = null;
                updateShellModeUi();
                renderTutorialModeUi();
                loadPlayerHudStats();
                await hydrateBoardRunState();
                syncBoardMapQuery(currentBoardMap?.id || null);
                renderBoardMapSelector();
                const activeTile = currentBoardRun?.pendingTargetTile
                    ? getBoardTileByIndex(currentBoardRun.pendingTargetTile)
                    : getBoardTileByIndex(currentBoardRun?.currentTile)
                        || currentBoardTiles.find(tile => tile.task_id)
                        || currentBoardTiles[0]
                        || null;

                if (gameShellMode) gameShellMode.textContent = '大富翁模式';
                if (gameShellTitle) gameShellTitle.textContent = currentBoardMap?.name || '濱海大富翁';
                if (gameShellSummary) gameShellSummary.textContent = currentBoardMap?.description || '擲骰、前進、觸發事件，讓史蛋、巴布與鯨老陪你一起闖關。';
                updateGameShellProgress(activeTile);
                renderGameShellEntries(currentBoardTiles, activeTile?.id);
                if (activeTile) {
                    await focusBoardTile(activeTile);
                }
                Swal.close();
            } catch (err) {
                Swal.close();
                throw err;
            }
        }

        async function loadGameShellFromUrl() {
            const params = new URLSearchParams(window.location.search);
            const questChainId = params.get('questChainId');
            const mode = params.get('mode');
            const boardMapId = params.get('boardMapId');
            const previewMode = params.get('preview') === '1';
            if (!questChainId || !mode) return false;
            
            if (gameShellPanel) gameShellPanel.classList.remove('collapsed');
            try {
                if (mode === 'board_game') {
                    await loadBoardShell(questChainId, boardMapId, previewMode);
                    
                    // Monopoly first dice prompt
                    if (!localStorage.getItem('monopoly_first_dice_prompt_shown')) {
                        const diceBtn = document.getElementById('gameShellStartBtn');
                        if (diceBtn) {
                            const tooltip = document.createElement('div');
                            tooltip.textContent = '點這裡開始擲骰';
                            tooltip.style.position = 'absolute';
                            tooltip.style.bottom = '100%';
                            tooltip.style.left = '50%';
                            tooltip.style.transform = 'translateX(-50%) translateY(-10px)';
                            tooltip.style.background = '#ff3b30';
                            tooltip.style.color = '#fff';
                            tooltip.style.padding = '6px 12px';
                            tooltip.style.borderRadius = '8px';
                            tooltip.style.fontSize = '14px';
                            tooltip.style.fontWeight = 'bold';
                            tooltip.style.whiteSpace = 'nowrap';
                            tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                            tooltip.style.pointerEvents = 'none';
                            tooltip.style.zIndex = '100';
                            tooltip.style.animation = 'bounce 1s infinite';
                            
                            const arrow = document.createElement('div');
                            arrow.style.position = 'absolute';
                            arrow.style.top = '100%';
                            arrow.style.left = '50%';
                            arrow.style.transform = 'translateX(-50%)';
                            arrow.style.borderWidth = '6px';
                            arrow.style.borderStyle = 'solid';
                            arrow.style.borderColor = '#ff3b30 transparent transparent transparent';
                            tooltip.appendChild(arrow);
                            
                            diceBtn.style.position = 'relative';
                            diceBtn.appendChild(tooltip);
                            
                            diceBtn.addEventListener('click', () => {
                                tooltip.remove();
                                localStorage.setItem('monopoly_first_dice_prompt_shown', 'true');
                            }, { once: true });
                        }
                    }
                } else {
                    await loadStoryShell(questChainId);
                }
                
                if (isCurrentQuestTutorialMode()) {
                    Swal.fire({
                        icon: 'info',
                        title: '權限提示',
                        text: '正式遊玩需要相機和定位權限',
                        confirmButtonText: '我知道了'
                    });
                }
                
                startTutorialHelper();
                
                return true;
            } catch (err) {
                console.error('載入遊戲殼失敗', err);
                isShellExperience = false;
                updateShellModeUi();
                if (gameShellObjective) gameShellObjective.textContent = '玩法內容載入失敗，請返回首頁重新選擇。';
                if (gameShellProgress) gameShellProgress.textContent = '目前無法取得進度';
                if (gameShellEntries) gameShellEntries.innerHTML = '<div class="game-shell-entry muted">暫時無法載入玩法內容。</div>';
                return false;
            }
        }

        async function startTutorialHelper() {
            if (localStorage.getItem('tutorial_helper_shown')) return;
            localStorage.setItem('tutorial_helper_shown', 'true');
            
            const steps = [
                {
                    title: '歡迎來到沙丘',
                    text: '這是一個結合 AI 與實境的探索遊戲。讓我來為你介紹畫面上的功能吧！',
                    icon: 'info'
                },
                {
                    title: '任務面板',
                    text: '畫面左上角的面板會顯示你當前的任務目標與進度。',
                    icon: 'info'
                },
                {
                    title: '迷你地圖',
                    text: '右下角的迷你地圖可以幫助你確認目前的位置與接下來的路線。',
                    icon: 'info'
                },
                {
                    title: '功能選單',
                    text: '點擊右側的功能按鈕，可以展開更多選項，例如切換視角、查看背包等。',
                    icon: 'info'
                },
                {
                    title: '語音助理',
                    text: '如果遇到困難，可以點擊右下角的麥克風按鈕呼叫 AI 助理。',
                    icon: 'info'
                },
                {
                    title: '準備出發',
                    text: '現在，請點擊下方的「開始遊戲」或「擲骰」按鈕，開始你的冒險吧！',
                    icon: 'success'
                }
            ];
            
            for (let i = 0; i < steps.length; i++) {
                await Swal.fire({
                    title: steps[i].title,
                    text: steps[i].text,
                    icon: steps[i].icon,
                    confirmButtonText: i === steps.length - 1 ? '出發！' : '下一步',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                });
            }
        }

        function getLoginUser() {
            try { return JSON.parse(localStorage.getItem('loginUser') || 'null'); } catch (e) {}
            try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) {}
            return null;
        }

        async function createCurrentUserTaskRecord() {
            if (!currentTaskId) return null;
            const data = await requestJson('/api/user-tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ task_id: currentTaskId })
            }, '建立關卡紀錄');
            if (data.success && data.userTaskId) {
                currentUserTaskId = data.userTaskId;
                return currentUserTaskId;
            }
            return null;
        }

        async function fetchCurrentUserTaskId() {
            if (!currentTaskId) return null;
            const loginUser = getLoginUser();
            if (!loginUser || !loginUser.username) return null;
            try {
                const loadTasks = async () => {
                    return requestJson(`/api/user-tasks?username=${encodeURIComponent(loginUser.username)}`, {
                        credentials: 'include'
                    }, '取得關卡紀錄');
                };

                let data = await loadTasks();
                if (!data.success || !Array.isArray(data.tasks)) return null;
                let t = data.tasks.find((x) => String(x.id) === String(currentTaskId));
                if (!t) {
                    await createCurrentUserTaskRecord();
                    data = await loadTasks();
                    if (!data.success || !Array.isArray(data.tasks)) return null;
                    t = data.tasks.find((x) => String(x.id) === String(currentTaskId));
                }
                if (!t) return null;
                currentUserTaskId = t.user_task_id;
                return currentUserTaskId;
            } catch (err) {
                console.warn('取得進行中任務失敗', err);
                return null;
            }
        }

        function haversineDistance(lat1, lon1, lat2, lon2) {
            const toRad = (v) => v * Math.PI / 180;
            const R = 6371e3;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        function calculateBearing(startLat, startLng, destLat, destLng) {
            const toRad = (v) => v * Math.PI / 180;
            const toDeg = (v) => v * 180 / Math.PI;
            const y = Math.sin(toRad(destLng - startLng)) * Math.cos(toRad(destLat));
            const x = Math.cos(toRad(startLat)) * Math.sin(toRad(destLat))
                - Math.sin(toRad(startLat)) * Math.cos(toRad(destLat)) * Math.cos(toRad(destLng - startLng));
            return (toDeg(Math.atan2(y, x)) + 360) % 360;
        }

        function renderTaskDebug() {
            if (!debugMode) return;
            console.log('Task debug state', {
                currentTaskId,
                currentUserTaskId,
                currentQuestChainId,
                orientationPermissionState,
                currentMode,
                missionMode
            });
        }

        async function ensureOrientationPermission() {
            if (orientationPermissionState === 'granted' || orientationPermissionState === 'unsupported') {
                return orientationPermissionState;
            }
            if (orientationPermissionState === 'requesting') {
                return orientationPermissionState;
            }
            try {
                if (typeof DeviceOrientationEvent !== 'undefined'
                    && typeof DeviceOrientationEvent.requestPermission === 'function') {
                    orientationPermissionState = 'requesting';
                    const permission = await DeviceOrientationEvent.requestPermission();
                    orientationPermissionState = permission;
                    if (permission !== 'granted') {
                        console.warn('方向權限未授權');
                    }
                } else {
                    orientationPermissionState = 'unsupported';
                }
            } catch (err) {
                orientationPermissionState = 'error';
                console.warn('請求方向權限失敗', err);
            }
            renderTaskDebug();
            return orientationPermissionState;
        }

        function closeDockPanels() {
            if (featureDrawerPanel) featureDrawerPanel.classList.add('hidden');
            if (dockModePanel) dockModePanel.classList.add('hidden');
            if (dockLangPanel) dockLangPanel.classList.add('hidden');
            if (dockZoomPanel) dockZoomPanel.classList.add('hidden');
            if (dockHudPanel) dockHudPanel.classList.add('hidden');
            if (dockBoardPanel) dockBoardPanel.classList.add('hidden');
        }

        function toggleDockPanel(panelName) {
            const panels = {
                mode: dockModePanel,
                lang: dockLangPanel,
                zoom: dockZoomPanel,
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
        }

        function renderTaskMetrics(distanceMeters = lastTaskDistance, bearing = lastTaskBearing) {
            const tutorialLikeMode = isCurrentQuestTutorialMode() || isCurrentQuestDemoMode();
            const gpsRequired = taskUsesGps(currentTask);
            const angle = (Number.isFinite(bearing) && lastHeadingUpdateAt)
                ? ((bearing - deviceHeading + 540) % 360) - 180
                : null;
            if (taskHudDock) {
                taskHudDock.classList.toggle('hidden', tutorialLikeMode);
            }
            if (taskBearingValue) {
                taskBearingValue.textContent = tutorialLikeMode
                    ? `${Math.round(Number.isFinite(bearing) ? bearing : getTutorialMockBearing())}°`
                    : (!gpsRequired ? '--°' : (Number.isFinite(bearing) ? `${Math.round(bearing)}°` : '--°'));
            }
            if (taskDistanceValue) {
                taskDistanceValue.textContent = tutorialLikeMode
                    ? `${Math.round(Number.isFinite(distanceMeters) ? distanceMeters : getTutorialMockDistance())}m`
                    : (!gpsRequired ? '--' : (Number.isFinite(distanceMeters) ? `${Math.max(0, Math.round(distanceMeters))}m` : '--m'));
            }
            if (taskAngleValue) {
                taskAngleValue.textContent = tutorialLikeMode
                    ? '--'
                    : (!gpsRequired ? '--' : (angle != null ? `${Math.round(angle)}°` : '--°'));
            }
            if (taskCoordsValue) {
                taskCoordsValue.textContent = tutorialLikeMode
                    ? '教學模式'
                    : (!gpsRequired ? 'GPS 未啟用' : (lastLatLng
                    ? `${lastLatLng.latitude.toFixed(5)}, ${lastLatLng.longitude.toFixed(5)}`
                    : '--, --'));
            }
            if (taskStatusLabel) {
                if (tutorialLikeMode) {
                    taskStatusLabel.textContent = `模擬距離 ${Math.round(Number.isFinite(distanceMeters) ? distanceMeters : getTutorialMockDistance())}m｜不啟用 GPS`;
                } else if (!gpsRequired) {
                    taskStatusLabel.textContent = '未啟用 GPS｜任何地方都可開啟任務';
                } else if (!lastHeadingUpdateAt) {
                    taskStatusLabel.textContent = '點一下畫面啟用方向';
                } else if (Number.isFinite(distanceMeters)) {
                    taskStatusLabel.textContent = `距離任務 ${Math.max(0, Math.round(distanceMeters))}m`;
                } else {
                    taskStatusLabel.textContent = '等待任務導航...';
                }
            }
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

        function refreshTaskNavigationFromCache() {
            if (!Number.isFinite(lastTaskDistance) || !Number.isFinite(lastTaskBearing)) {
                renderTaskMetrics();
                return;
            }
            updateTaskNavigationUI(lastTaskDistance, lastTaskBearing);
        }

        function handleOrientationEvent(event) {
            let currentHeading = null;
            if (typeof event.webkitCompassHeading === 'number' && !Number.isNaN(event.webkitCompassHeading)) {
                currentHeading = event.webkitCompassHeading;
                headingSource = 'webkitCompassHeading';
            } else if (event.alpha != null && !Number.isNaN(event.alpha)) {
                currentHeading = (360 - event.alpha + 360) % 360;
                headingSource = 'alpha';
            }
            if (currentHeading == null) {
                return;
            }
            let headingDiff = currentHeading - lastHeading;
            if (headingDiff > 180) headingDiff -= 360;
            if (headingDiff < -180) headingDiff += 360;
            lastHeading += headingDiff * 0.15;
            deviceHeading = (lastHeading + 360) % 360;
            lastHeadingUpdateAt = Date.now();
            if (orientationPermissionState === 'requesting' || orientationPermissionState === 'idle' || orientationPermissionState === 'error') {
                orientationPermissionState = 'granted';
            }
            refreshTaskNavigationFromCache();
        }

        function updateTaskNavigationUI(distanceMeters, bearing) {
            lastTaskDistance = distanceMeters;
            lastTaskBearing = bearing;
            const allowFloatingTarget = currentEntryMode === 'board_game' && !isCurrentQuestTutorialMode();
            const hasHeading = lastHeadingUpdateAt > 0;
            const diff = ((bearing - deviceHeading + 540) % 360) - 180;
            renderTaskMetrics(distanceMeters, bearing);

            if (!allowFloatingTarget) {
                taskObjectVisible = false;
                if (taskGuideArrow) taskGuideArrow.classList.add('hidden');
                if (taskTargetObj) taskTargetObj.classList.add('hidden');
                closeTaskEncounter();
                return;
            }

            const revealDistance = Math.max(8, currentTask?.radius || 30);
            const interactionDistance = Math.max(6, (currentTask?.radius || 30) / 2);
            const activeFovDeg = taskObjectVisible ? 50 : 30;
            const isInView = hasHeading && Math.abs(diff) < activeFovDeg;
            const canRevealObject = distanceMeters <= revealDistance;
            const shouldShowObject = canRevealObject && isInView;

            if (taskGuideArrow) {
                taskGuideArrow.style.transform = `rotate(${hasHeading ? diff : 0}deg) translate(0, -100px)`;
                taskGuideArrow.classList.toggle('hidden', shouldShowObject && distanceMeters <= revealDistance);
            }
            if (taskTargetObj) {
                if (shouldShowObject) {
                    taskObjectVisible = true;
                    taskTargetObj.classList.remove('hidden');
                    const xOffset = (diff / 40) * (window.innerWidth / 2);
                    let scale = 1.2 - (Math.min(distanceMeters, 50) / 60);
                    if (scale < 0.4) scale = 0.4;
                    const topPercent = distanceMeters <= interactionDistance ? 52 : 56;
                    taskTargetObj.style.left = '50%';
                    taskTargetObj.style.top = `${topPercent}%`;
                    taskTargetObj.style.transform = `translate(-50%, -50%) translateX(${xOffset}px) scale(${scale})`;
                    taskTargetObj.style.opacity = '1';
                } else {
                    taskObjectVisible = false;
                    taskTargetObj.classList.add('hidden');
                }
            }

        }

        function tryAutoPlayTaskBgm(distanceMeters) {
            if (!taskBgm || !taskBgm.src || bgmAutoStarted) return;
            const triggerDistance = Math.max(8, currentTask?.radius || 30);
            if (distanceMeters > triggerDistance) return;
            taskBgm.play().then(() => {
                bgmAutoStarted = true;
                if (taskBgmBtn) taskBgmBtn.textContent = '🔊';
            }).catch(() => {
                // iOS/Safari 常會擋自動播放，保留手動按鈕即可
            });
        }

        function startTaskNavigation() {
            if (targetLat == null || targetLng == null) return;
            const tutorialLikeMode = isCurrentQuestTutorialMode() || isCurrentQuestDemoMode();
            if (navigationWatchId !== null) {
                navigator.geolocation.clearWatch(navigationWatchId);
            }
            if (navigationPollTimer) {
                clearInterval(navigationPollTimer);
                navigationPollTimer = null;
            }
            if (tutorialLikeMode) {
                lastGpsUpdateAt = Date.now();
                lastLatLng = null;
                taskReached = true;
                const mockDistance = getTutorialMockDistance();
                const mockBearing = getTutorialMockBearing();
                updateTaskNavigationUI(mockDistance, mockBearing);
                if (locationBar) {
                    locationBar.textContent = `目前位置：模擬距離任務 ${mockDistance}m（GPS 已關閉）`;
                }
                if (taskCoordsValue) {
                    taskCoordsValue.textContent = '教學 / Demo 模式';
                }
                return;
            }
            if (!taskUsesGps(currentTask)) {
                taskReached = true;
                lastTaskDistance = null;
                lastTaskBearing = null;
                renderTaskMetrics();
                if (locationBar) {
                    locationBar.textContent = '目前位置：此關卡未啟用 GPS 限制';
                }
                if (taskCoordsValue) {
                    taskCoordsValue.textContent = 'GPS 未啟用';
                }
                if (taskStatusLabel) {
                    taskStatusLabel.textContent = '任何地方都可開啟任務';
                }
                if (taskDistanceValue) {
                    taskDistanceValue.textContent = '--';
                }
                return;
            }
            if (!navigator.geolocation) return;
            navigationWatchId = navigator.geolocation.watchPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                lastLatLng = { latitude, longitude };
                lastGpsUpdateAt = Date.now();
                renderTaskMetrics();
                if (mapInstance) {
                    if (!mapMarker) {
                        mapMarker = L.marker([latitude, longitude]).addTo(mapInstance);
                    } else {
                        mapMarker.setLatLng([latitude, longitude]);
                    }
                    updateTaskMapViewport();
                }
                const distanceMeters = haversineDistance(latitude, longitude, targetLat, targetLng);
                const bearing = calculateBearing(latitude, longitude, targetLat, targetLng);
                updateTaskNavigationUI(distanceMeters, bearing);
                tryAutoPlayTaskBgm(distanceMeters);
                if (locationBar) {
                    locationBar.textContent = (isCurrentQuestTutorialMode() || isCurrentQuestDemoMode())
                        ? '目前位置：教學 / Demo 模式不限 GPS'
                        : `目前位置：距離任務 ${Math.round(distanceMeters)}m`;
                }
                taskReached = distanceMeters <= Math.max(6, currentTask?.radius || 30);
            }, (err) => {
                console.warn('任務導航定位失敗', err);
                if (taskCoordsValue) taskCoordsValue.textContent = '定位失敗';
                if (taskDistanceValue) taskDistanceValue.textContent = '--m';
                if (taskStatusLabel) taskStatusLabel.textContent = '定位失敗';
            }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });

            // iPhone/Safari 有時 watchPosition 更新不穩，補一層定時輪詢
            navigationPollTimer = setInterval(() => {
                navigator.geolocation.getCurrentPosition((pos) => {
                    const { latitude, longitude } = pos.coords;
                    lastLatLng = { latitude, longitude };
                    lastGpsUpdateAt = Date.now();
                    renderTaskMetrics();
                    if (mapInstance) {
                        if (!mapMarker) {
                            mapMarker = L.marker([latitude, longitude]).addTo(mapInstance);
                        } else {
                            mapMarker.setLatLng([latitude, longitude]);
                        }
                        updateTaskMapViewport();
                    }
                    const distanceMeters = haversineDistance(latitude, longitude, targetLat, targetLng);
                    const bearing = calculateBearing(latitude, longitude, targetLat, targetLng);
                    updateTaskNavigationUI(distanceMeters, bearing);
                    if (locationBar) {
                        locationBar.textContent = (isCurrentQuestTutorialMode() || isCurrentQuestDemoMode())
                            ? '目前位置：教學 / Demo 模式不限 GPS'
                            : `目前位置：距離任務 ${Math.round(distanceMeters)}m`;
                    }
                }, () => {}, { enableHighAccuracy: true, maximumAge: 1500, timeout: 6000 });
            }, 2500);
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
                taskObjectVisible = false;
                if (taskTargetObj) taskTargetObj.classList.add('hidden');
                if (taskGuideArrow) taskGuideArrow.classList.add('hidden');
            }
        }

        function initLockWheels(digits = 4) {
            if (!lockWheels) return;
            lockWheels.innerHTML = '';
            for (let i = 0; i < digits; i += 1) {
                const wheel = document.createElement('div');
                wheel.className = 'wheel';
                wheel.dataset.value = '0';
                wheel.innerHTML = '<button class="btn-up" type="button">▲</button><div class="digit">0</div><button class="btn-down" type="button">▼</button>';
                const digitEl = wheel.querySelector('.digit');
                const setVal = (v) => {
                    const nv = (v + 10) % 10;
                    wheel.dataset.value = String(nv);
                    digitEl.textContent = String(nv);
                };
                wheel.querySelector('.btn-up').onclick = () => setVal(Number(wheel.dataset.value) + 1);
                wheel.querySelector('.btn-down').onclick = () => setVal(Number(wheel.dataset.value) - 1);
                let startY = null;
                wheel.addEventListener('pointerdown', (ev) => { startY = ev.clientY; wheel.setPointerCapture(ev.pointerId); });
                wheel.addEventListener('pointermove', (ev) => {
                    if (startY == null) return;
                    const dy = ev.clientY - startY;
                    if (Math.abs(dy) > 18) {
                        setVal(Number(wheel.dataset.value) + (dy < 0 ? 1 : -1));
                        startY = ev.clientY;
                    }
                });
                wheel.addEventListener('pointerup', () => { startY = null; });
                wheel.addEventListener('pointercancel', () => { startY = null; });
                lockWheels.appendChild(wheel);
            }
        }

        function getLockCode() {
            return Array.from(lockWheels.querySelectorAll('.wheel')).map((w) => w.dataset.value || '0').join('');
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

        async function dataUrlToBlob(dataUrl) {
            const response = await fetch(dataUrl);
            return await response.blob();
        }

        function createTutorialFallbackCapture() {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 960;
            tempCanvas.height = 960;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.fillStyle = '#07111f';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.strokeStyle = '#f3c84b';
            tempCtx.lineWidth = 12;
            tempCtx.beginPath();
            tempCtx.arc(tempCanvas.width / 2, tempCanvas.height / 2, 260, 0, Math.PI * 2);
            tempCtx.stroke();
            tempCtx.fillStyle = '#ffffff';
            tempCtx.font = 'bold 56px sans-serif';
            tempCtx.textAlign = 'center';
            tempCtx.fillText('沙丘教學模式', tempCanvas.width / 2, 420);
            tempCtx.font = '36px sans-serif';
            tempCtx.fillStyle = 'rgba(255,255,255,0.82)';
            tempCtx.fillText('工作室環境沒有相機，已改用教學快照。', tempCanvas.width / 2, 490);
            tempCtx.fillText('這張圖片會直接拿去做教學裁判與通關。', tempCanvas.width / 2, 545);
            return tempCanvas.toDataURL('image/jpeg', 0.92);
        }

        function refreshAnswerPhotoFromReticle() {
            const preview = document.getElementById('answerPhotoPreview');
            try {
                const dataUrl = captureCurrentReticleDataUrl();
                if (!dataUrl) throw new Error('目前無法擷取圓框畫面');
                currentAnswerPhotoDataUrl = dataUrl;
                if (preview) {
                    preview.src = dataUrl;
                    preview.style.display = 'block';
                }
                btnAnswerSubmit.disabled = false;
                answerMessage.textContent = '✅ 已使用圓框鏡頭捕捉目前畫面';
            } catch (err) {
                currentAnswerPhotoDataUrl = null;
                if (preview) {
                    preview.removeAttribute('src');
                    preview.style.display = 'none';
                }
                btnAnswerSubmit.disabled = true;
                answerMessage.textContent = `❌ ${err.message}`;
            }
        }

        function showAnswerModal(task) {
            if (!answerModal || !task) return;
            closeTaskEncounter();
            taskObjectVisible = false;
            if (taskTargetObj) taskTargetObj.classList.add('hidden');
            answerTaskName.textContent = task.name || '任務';
            const descriptionParts = [task.description || '請根據提示完成任務'];
            if (isCurrentQuestDemoMode()) {
                if (task.task_type === 'photo') {
                    descriptionParts.push('教學模式：任意拍攝一張照片就能通過，先讓你把整段流程走完。');
                } else if (task.task_type === 'multiple_choice') {
                    descriptionParts.push('教學模式：任意選一個選項都會先通關，先讓你熟悉對話與流程。');
                } else {
                    descriptionParts.push('教學模式：這一關會先放行，讓你能直接往下體驗。');
                }
            }
            answerTaskDescription.textContent = descriptionParts.join('\n\n');
            answerInputContainer.innerHTML = '';
            answerMessage.textContent = '';
            btnAnswerSubmit.disabled = true;
            currentAnswerPhotoDataUrl = null;

            if (task.task_type === 'multiple_choice') {
                const choicesDiv = document.createElement('div');
                choicesDiv.className = 'answer-choices';
                let choices = [];
                if (Array.isArray(task.options)) choices = task.options;
                else if (typeof task.options === 'string') {
                    try { choices = JSON.parse(task.options || '[]'); } catch (e) { choices = []; }
                }
                choices.forEach((choice) => {
                    const node = document.createElement('div');
                    node.className = 'answer-choice';
                    node.textContent = choice;
                    node.dataset.value = choice;
                    node.onclick = () => {
                        choicesDiv.querySelectorAll('.answer-choice').forEach((c) => c.classList.remove('selected'));
                        node.classList.add('selected');
                        btnAnswerSubmit.disabled = false;
                    };
                    choicesDiv.appendChild(node);
                });
                answerInputContainer.appendChild(choicesDiv);
            } else if (task.task_type === 'photo') {
                const group = document.createElement('div');
                group.className = 'answer-input-group';
                if (isShellExperience) {
                    group.innerHTML = `
                        <label>📸 使用圓框鏡頭作答</label>
                        <div class="camera-answer-helper">直接用目前黃色圓框裡的畫面作答，不需要再跳去上傳檔案。</div>
                        <div class="camera-answer-actions">
                            <button type="button" id="answerCaptureFromReticle" class="btn secondary">使用目前圓框拍照</button>
                            <button type="button" id="answerRetakeFromReticle" class="btn secondary">重新取景</button>
                        </div>
                        <img id="answerPhotoPreview" style="display:none;max-width:100%;margin-top:10px;border-radius:12px;">
                    `;
                } else {
                    group.innerHTML = '<label>📸 上傳照片</label><input type="file" id="answerPhotoInput" accept="image/*" capture="environment"><img id="answerPhotoPreview" style="display:none;max-width:100%;margin-top:10px;border-radius:8px;">';
                }
                answerInputContainer.appendChild(group);
                const preview = document.getElementById('answerPhotoPreview');
                const input = document.getElementById('answerPhotoInput');
                const answerCaptureFromReticle = document.getElementById('answerCaptureFromReticle');
                const answerRetakeFromReticle = document.getElementById('answerRetakeFromReticle');
                if (input) {
                    input.addEventListener('change', (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            currentAnswerPhotoDataUrl = ev.target.result;
                            preview.src = currentAnswerPhotoDataUrl;
                            preview.style.display = 'block';
                            btnAnswerSubmit.disabled = false;
                            setTimeout(() => {
                                btnAnswerSubmit.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                            }, 60);
                        };
                        reader.readAsDataURL(file);
                    });
                }
                if (answerCaptureFromReticle) {
                    answerCaptureFromReticle.addEventListener('click', () => {
                        refreshAnswerPhotoFromReticle();
                    });
                    setTimeout(() => refreshAnswerPhotoFromReticle(), 120);
                }
                if (answerRetakeFromReticle) {
                    answerRetakeFromReticle.addEventListener('click', () => {
                        refreshAnswerPhotoFromReticle();
                    });
                }
            } else {
                const group = document.createElement('div');
                group.className = 'answer-input-group';
                group.innerHTML = '<label>✍️ 請輸入答案</label><input type="text" id="answerTextInput" autocomplete="off" placeholder="請輸入您的答案...">';
                answerInputContainer.appendChild(group);
                const input = document.getElementById('answerTextInput');
                input.addEventListener('input', () => {
                    btnAnswerSubmit.disabled = input.value.trim() === '';
                });
                setTimeout(() => input.focus(), 150);
            }
            answerModal.classList.remove('hidden');
            answerInputContainer.scrollTop = 0;
        }

        async function submitTaskAnswer() {
            if (!currentTask) return;
            if (btnAnswerSubmit) btnAnswerSubmit.disabled = true;
            let answer = '';
            const photoInput = document.getElementById('answerPhotoInput');
            const hasPhotoField = Boolean(photoInput);
            const textInput = document.getElementById('answerTextInput');
            const choiceNodes = Array.from(document.querySelectorAll('.answer-choice'));
            const hasChoiceField = choiceNodes.length > 0;
            const hasPhotoDraft = Boolean(currentAnswerPhotoDataUrl);
            const isAiPhotoTask = currentTask.task_type === 'photo' && currentTask.validation_mode && currentTask.validation_mode.startsWith('ai_');
            const tutorialPassMode = isCurrentQuestDemoMode() || isCurrentQuestTutorialMode();
            const tutorialGuestMode = isTutorialGuestMode();

            if (currentTask.task_type === 'photo') {
                if (!hasPhotoDraft && !photoInput?.files?.[0]) {
                    answerMessage.textContent = isPhotoTaskCaptureActive() ? '❌ 請先拍下一張畫面' : '❌ 請先選擇一張照片';
                    if (btnAnswerSubmit) btnAnswerSubmit.disabled = false;
                    return;
                }
                if (isAiPhotoTask) {
                    const fd = new FormData();
                    if (hasPhotoDraft) {
                        const draftBlob = await dataUrlToBlob(currentAnswerPhotoDataUrl);
                        fd.append('image', draftBlob, 'reticle-capture.jpg');
                    } else {
                        fd.append('image', photoInput.files[0]);
                    }
                    answerMessage.textContent = tutorialPassMode ? '⏳ 正在整理教學判定...' : '⏳ AI 判定中...';
                    if (typeof showQueryTransit === 'function') {
                        showQueryTransit(tutorialPassMode ? '教學模式判定中，請稍候...' : '潮汐裁判・鯨語正在仔細檢查你的照片...');
                    }
                    let aiData;
                    try {
                        aiData = await requestJson(`${tutorialPassMode ? `/api/tutorial/ai-tasks/${currentTask.id}/submit` : `/api/ai-tasks/${currentTask.id}/submit`}`, {
                            method: 'POST',
                            body: fd
                        }, '送出 AI 圖片判定');
                    } catch (err) {
                        if (typeof hideQueryTransit === 'function') hideQueryTransit();
                        answerMessage.textContent = `❌ ${err.message}`;
                        await showNpcDialog({
                            speakerKey: 'rescue',
                            mood: '連線中斷',
                            text: `海羽偵測到探索艙目前沒有成功送出這張照片。\n\n${err.message}\n\n先確認網路或重新整理後再試一次。`
                        });
                        btnAnswerSubmit.disabled = false;
                        return;
                    }
                    if (typeof hideQueryTransit === 'function') hideQueryTransit();
                    const judgeSummary = normalizeUiText(aiData.reason, '') || normalizeUiText(aiData.message, 'AI 已完成判定。');
                    const retrySummary = normalizeUiText(aiData.retry_advice, '');
                    answerMessage.textContent = judgeSummary ? `🤖 ${judgeSummary}` : '🤖 AI 已完成判定';
                    if (aiData.success && aiData.passed) {
                        currentUserTaskId = aiData.user_task_id || currentUserTaskId;
                        resetPhotoCaptureState();
                        answerModal.classList.add('hidden');
                        tutorialFlowStarted = false;
                        renderTutorialModeUi();
                        const successText = tutorialPassMode
                            ? `鯨語已經看完你上傳的畫面。\n\n${judgeSummary}\n\n教學模式先替你放行，讓你可以把整段流程順順走完。`
                            : `${judgeSummary}${retrySummary ? `\n\n補充：${retrySummary}` : ''}`;
                        const storyJudgeAutoClose = tutorialPassMode ? null : (currentEntryMode === 'board_game' ? 2800 : null);
                        if (currentEntryMode === 'board_game' && currentBoardRun?.pendingTargetTile) {
                            await completeBoardTurn(true, {
                                speakerKey: 'judge',
                                mood: tutorialPassMode ? '教學判定' : 'AI 通關',
                                text: successText,
                                autoCloseMs: tutorialPassMode ? null : 2800
                            });
                        } else {
                            if (tutorialGuestMode) {
                                completeTutorialGuestTask(currentTask);
                            }
                            await showNpcDialog({
                                speakerKey: 'judge',
                                mood: tutorialPassMode ? '教學判定' : 'AI 通關',
                                text: successText,
                                buttonLabel: tutorialPassMode ? '看懂了' : null,
                                autoCloseMs: storyJudgeAutoClose
                            });
                        }
                        scheduleStoryReloadAfterCompletion();
                        const tutorialCompletionText = judgeSummary
                            ? `🤖 鯨語判定：${judgeSummary}\n✅ 教學模式已完成這一步`
                            : '✅ 教學模式已完成這一步';
                        showCompletionModal(aiData.earnedItemName ? `🎁 獲得：${aiData.earnedItemName}` : (tutorialPassMode ? tutorialCompletionText : (aiData.message || '✅ AI 驗證通過')));
                    } else {
                        document.body.classList.remove('shake-error');
                        void document.body.offsetWidth;
                        document.body.classList.add('shake-error');
                        setTimeout(() => document.body.classList.remove('shake-error'), 500);

                        const failText = judgeSummary || retrySummary || 'AI 驗證未通過，請再試一次';
                        if (currentEntryMode === 'board_game' && currentBoardRun?.pendingTargetTile) {
                            resetPhotoCaptureState();
                            answerModal.classList.add('hidden');
                            await completeBoardTurn(false, {
                                speakerKey: 'judge',
                                mood: '未通過',
                                text: retrySummary
                                    ? `${judgeSummary || '這次還沒通過。'}\n\n海羽建議：${retrySummary}`
                                    : failText,
                                autoCloseMs: tutorialPassMode ? null : 2800
                            });
                        } else {
                            answerMessage.textContent = `❌ ${failText}`;
                            photoCaptureModeActive = true;
                            setImmersiveCameraMode(true);
                            renderTutorialModeUi();
                            await showNpcDialog({
                                speakerKey: 'rescue',
                                mood: '裁定未通過',
                                text: retrySummary
                                    ? `鯨語的裁定是：${judgeSummary || '這次還沒通過。'}\n\n海羽補充：${retrySummary}`
                                    : `鯨語的裁定是：${failText}\n\n海羽建議你再整理一下畫面，重新挑戰。`,
                                buttonLabel: '重新挑戰'
                            });
                            btnAnswerSubmit.disabled = false;
                        }
                    }
                    return;
                }
                const fd = new FormData();
                if (hasPhotoDraft) {
                    const draftBlob = await dataUrlToBlob(currentAnswerPhotoDataUrl);
                    fd.append('photo', draftBlob, 'reticle-capture.jpg');
                } else {
                    fd.append('photo', photoInput.files[0]);
                }
                answerMessage.textContent = '📤 上傳照片中...';
                if (typeof showQueryTransit === 'function') {
                    showQueryTransit('正在將照片上傳至探索艙資料庫...');
                }
                let uploadData;
                try {
                    uploadData = await requestJson('/api/upload', { method: 'POST', body: fd }, '上傳照片');
                } catch (err) {
                    if (typeof hideQueryTransit === 'function') hideQueryTransit();
                    answerMessage.textContent = `❌ ${err.message}`;
                    btnAnswerSubmit.disabled = false;
                    return;
                }
                if (typeof hideQueryTransit === 'function') hideQueryTransit();
                if (!uploadData.success) {
                    answerMessage.textContent = '❌ 上傳失敗';
                    if (btnAnswerSubmit) btnAnswerSubmit.disabled = false;
                    return;
                }
                answer = uploadData.url;
            } else if (hasChoiceField) {
                const selected = document.querySelector('.answer-choice.selected');
                if (!selected) {
                    answerMessage.textContent = '❌ 請選擇一個答案';
                    if (btnAnswerSubmit) btnAnswerSubmit.disabled = false;
                    return;
                }
                answer = selected.dataset.value;
                if (tutorialPassMode) {
                    answerModal.classList.add('hidden');
                    tutorialFlowStarted = false;
                    renderTutorialModeUi();
                    if (currentEntryMode === 'board_game' && currentBoardRun?.pendingTargetTile) {
                        await completeBoardTurn(true, {
                            speakerKey: 'lore',
                            mood: '教學選擇',
                            text: `潮聲已記住你的選擇：「${answer}」。\n\n教學模式先替你通過這一格，讓你把完整流程走完。`,
                            autoCloseMs: 2400
                        });
                    } else {
                        if (tutorialGuestMode) {
                            completeTutorialGuestTask(currentTask);
                        } else if (getLoginUser()) {
                            await completeTutorialLoggedInTask(currentTask, answer);
                        }
                        await showNpcDialog({
                            speakerKey: 'lore',
                            mood: '教學選擇',
                            text: `潮聲已記住你的選擇：「${answer}」。\n\n教學模式先替你通過這一關，讓你把完整流程走完。`,
                            buttonLabel: '繼續前進'
                        });
                        scheduleStoryReloadAfterCompletion();
                    }
                    showCompletionModal('✅ 教學模式已完成這一步');
                    if (btnAnswerSubmit) btnAnswerSubmit.disabled = false;
                    return;
                }
            } else {
                answer = textInput?.value?.trim() || '';
                if (!answer) {
                    answerMessage.textContent = '❌ 請輸入答案';
                    if (btnAnswerSubmit) btnAnswerSubmit.disabled = false;
                    return;
                }
            }

            if (tutorialPassMode) {
                if (currentTask.task_type === 'photo') {
                    resetPhotoCaptureState();
                }
                answerModal.classList.add('hidden');
                tutorialFlowStarted = false;
                renderTutorialModeUi();
                if (currentEntryMode === 'board_game' && currentBoardRun?.pendingTargetTile) {
                    await completeBoardTurn(true, {
                        speakerKey: currentTask.task_type === 'number' ? 'judge' : 'lore',
                        mood: '教學模式通關',
                        text: `沙丘已記錄你的操作：「${answer || '已提交'}」。\n\n教學模式先替你通過這一步，讓你繼續往下走。`,
                        autoCloseMs: 2400
                    });
                } else {
                    if (tutorialGuestMode) {
                        completeTutorialGuestTask(currentTask);
                    } else if (getLoginUser()) {
                        await completeTutorialLoggedInTask(currentTask, answer);
                    }
                    await showNpcDialog({
                        speakerKey: 'judge',
                        mood: '教學模式通關',
                        text: `沙丘已記錄你的操作：「${answer || '已提交'}」。\n\n教學模式先替你通過這一步，讓你繼續往下走。`,
                        buttonLabel: '繼續前進'
                    });
                    scheduleStoryReloadAfterCompletion();
                }
                showCompletionModal('✅ 教學模式已完成這一步');
                if (btnAnswerSubmit) btnAnswerSubmit.disabled = false;
                return;
            }

            if (!currentUserTaskId) await fetchCurrentUserTaskId();
            if (!currentUserTaskId) await createCurrentUserTaskRecord();
            if (!currentUserTaskId) {
                answerMessage.textContent = '❌ 無法建立關卡紀錄，請重新整理後再試';
                if (btnAnswerSubmit) btnAnswerSubmit.disabled = false;
                return;
            }
            btnAnswerSubmit.disabled = true;
            answerMessage.textContent = '⏳ 驗證中...';
            let data;
            if (typeof showQueryTransit === 'function') {
                showQueryTransit('正在將結果送回沙丘...');
            }
            try {
                data = await requestJson(`/api/user-tasks/${currentUserTaskId}/answer`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ answer })
                }, '送出答案');
            } catch (err) {
                if (typeof hideQueryTransit === 'function') hideQueryTransit();
                answerMessage.textContent = `❌ ${err.message}`;
                await showNpcDialog({
                    speakerKey: 'rescue',
                    mood: '送出失敗',
                    text: `海羽沒能把這份答案成功送進探索艙。\n\n${err.message}\n\n請稍後再試一次。`
                });
                btnAnswerSubmit.disabled = false;
                return;
            }
            if (typeof hideQueryTransit === 'function') hideQueryTransit();
            if (data.success && (data.isCompleted || (data.message && data.message.includes('已完成')))) {
                if (currentTask.task_type === 'photo') {
                    resetPhotoCaptureState();
                }
                answerModal.classList.add('hidden');
                tutorialFlowStarted = false;
                renderTutorialModeUi();
                const judgeText = normalizeUiText(data.message, '這一關已完成，下一段劇情正在展開。');
                if (currentEntryMode === 'board_game' && currentBoardRun?.pendingTargetTile) {
                    await completeBoardTurn(true, {
                        speakerKey: 'judge',
                        mood: '規則通關',
                        text: judgeText,
                        autoCloseMs: 2200
                    });
                } else {
                    await showNpcDialog({
                        speakerKey: 'judge',
                        mood: isCurrentQuestTutorialMode() ? '教學模式通關' : (isCurrentQuestDemoMode() ? '體驗模式通關' : '規則通關'),
                        text: judgeText,
                        autoCloseMs: 2200
                    });
                }
                    scheduleStoryReloadAfterCompletion();
                    showCompletionModal(data.earnedItemName ? `🎁 獲得：${data.earnedItemName}` : '✅ 任務已完成');
                    if (btnAnswerSubmit) btnAnswerSubmit.disabled = false;
            } else {
                document.body.classList.remove('shake-error');
                void document.body.offsetWidth;
                document.body.classList.add('shake-error');
                setTimeout(() => document.body.classList.remove('shake-error'), 500);

                const failText = data.message || '答案錯誤，請重試';
                if (currentEntryMode === 'board_game' && currentBoardRun?.pendingTargetTile) {
                    if (currentTask.task_type === 'photo') {
                        resetPhotoCaptureState();
                    }
                    answerModal.classList.add('hidden');
                    await completeBoardTurn(false, {
                        speakerKey: 'rescue',
                        mood: '規則未通過',
                        text: `${failText}，這一步會依棋盤規則回退後重新展開。`,
                        autoCloseMs: 2400
                    });
                    if (btnAnswerSubmit) btnAnswerSubmit.disabled = false;
                } else {
                    answerMessage.textContent = '❌ ' + failText;
                    if (currentTask.task_type === 'photo') {
                        photoCaptureModeActive = true;
                        setImmersiveCameraMode(true);
                        renderTutorialModeUi();
                    }
                    await showNpcDialog({
                        speakerKey: 'rescue',
                        mood: '規則未通過',
                        text: `這一題還沒有通過。\n\n海羽提醒：${failText}`
                    });
                    btnAnswerSubmit.disabled = false;
                }
            }
        }

        async function submitLockCode() {
            const tutorialPassMode = isCurrentQuestDemoMode() || isCurrentQuestTutorialMode();
            if (tutorialPassMode) {
                lockOverlay.classList.add('hidden');
                tutorialFlowStarted = false;
                renderTutorialModeUi();
                if (currentEntryMode === 'board_game' && currentBoardRun?.pendingTargetTile) {
                    await completeBoardTurn(true, {
                        speakerKey: 'judge',
                        mood: '教學解鎖',
                        text: `沙丘已記錄這組密碼：「${getLockCode()}」。\n\n教學模式先替你通過這一格，讓你繼續往前。`,
                        autoCloseMs: 2400
                    });
                } else {
                    if (isTutorialGuestMode()) {
                        completeTutorialGuestTask(currentTask);
                    } else if (getLoginUser()) {
                        await completeTutorialLoggedInTask(currentTask, getLockCode());
                    }
                    await showNpcDialog({
                        speakerKey: 'judge',
                        mood: '教學解鎖',
                        text: `沙丘已記錄這組密碼：「${getLockCode()}」。\n\n教學模式先替你通過這一關，讓你繼續往下走。`,
                        buttonLabel: '繼續前進'
                    });
                    scheduleStoryReloadAfterCompletion();
                }
                showCompletionModal('✅ 教學模式已完成這一步');
                return;
            }
            if (!currentUserTaskId) await fetchCurrentUserTaskId();
            if (!currentUserTaskId) await createCurrentUserTaskRecord();
            if (!currentUserTaskId) {
                lockMsg.textContent = '無法建立關卡紀錄';
                return;
            }
            lockMsg.textContent = '驗證中...';
            let data;
            if (typeof showQueryTransit === 'function') {
                showQueryTransit('正在將密碼送回沙丘...');
            }
            try {
                data = await requestJson(`/api/user-tasks/${currentUserTaskId}/answer`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ answer: getLockCode() })
                }, '送出密碼答案');
            } catch (err) {
                if (typeof hideQueryTransit === 'function') hideQueryTransit();
                document.body.classList.remove('shake-error');
                void document.body.offsetWidth;
                document.body.classList.add('shake-error');
                setTimeout(() => document.body.classList.remove('shake-error'), 500);

                lockMsg.textContent = err.message;
                await showNpcDialog({
                    speakerKey: 'rescue',
                    mood: '送出失敗',
                    text: `海羽無法把密碼結果送回探索艙。\n\n${err.message}`
                });
                return;
            }
            if (typeof hideQueryTransit === 'function') hideQueryTransit();
            if (data.success && data.isCompleted) {
                lockOverlay.classList.add('hidden');
                tutorialFlowStarted = false;
                renderTutorialModeUi();
                if (currentEntryMode === 'board_game' && currentBoardRun?.pendingTargetTile) {
                    await completeBoardTurn(true, {
                        speakerKey: 'judge',
                        mood: '密碼通關',
                        text: data.message || '密碼鎖已解除，棋盤正在推進。',
                        autoCloseMs: 2200
                    });
                } else {
                    await showNpcDialog({
                        speakerKey: 'judge',
                        mood: '密碼通關',
                        text: data.message || '鎖陣已解除，前路已為你打開。',
                        autoCloseMs: 2200
                    });
                }
                showCompletionModal(data.earnedItemName ? `🎁 獲得：${data.earnedItemName}` : '✅ 任務已完成');
            } else {
                document.body.classList.remove('shake-error');
                void document.body.offsetWidth;
                document.body.classList.add('shake-error');
                setTimeout(() => document.body.classList.remove('shake-error'), 500);

                const failText = data.message || '答案錯誤';
                if (currentEntryMode === 'board_game' && currentBoardRun?.pendingTargetTile) {
                    lockOverlay.classList.add('hidden');
                    await completeBoardTurn(false, {
                        speakerKey: 'rescue',
                        mood: '密碼失誤',
                        text: `${failText}，這一步會依棋盤規則退回並重新整隊。`,
                        autoCloseMs: 2400
                    });
                } else {
                    lockMsg.textContent = failText;
                    await showNpcDialog({
                        speakerKey: 'rescue',
                        mood: '密碼失誤',
                        text: `鎖陣還沒解除。\n\n海羽提醒：${failText}`
                    });
                }
            }
        }

        async function enterPhotoCaptureFlow() {
            photoCaptureModeActive = true;
            tutorialBoardPhotoCaptureArmed = currentEntryMode === 'board_game' && isCurrentQuestTutorialMode();
            capturedPhotos.length = 0;
            currentAnswerPhotoDataUrl = null;
            needMorePhotosSession = null;
            answerModal.classList.add('hidden');
            closeDockPanels();
            if (npcDialog && !npcDialog.classList.contains('hidden')) {
                closeNpcDialog();
            }
            setCameraCaptureMode('task');
            setImmersiveCameraMode(true);
            renderTutorialModeUi();
            await showNpcDialog({
                speakerKey: 'gatekeeper',
                mood: currentEntryMode === 'board_game' ? '圓框拍照挑戰' : '鏡頭挑戰開始',
                text: `${currentTask?.stage_intro || currentTask?.description || '請先對準畫面。'}\n\n把目標放進黃色圓框後，直接按底部快門拍照；如果想留下完整環境，再切到全景紀錄。`,
                buttonLabel: '開始拍照',
                blocking: false,
                autoCloseMs: 4000
            });
        }

        async function startTaskInteraction() {
            closeTaskEncounter();
            if (!currentTask) return;
            const tutorialMode = isCurrentQuestTutorialMode();
            const tutorialGuestMode = isTutorialGuestMode();
            const gpsRequired = taskUsesGps(currentTask);
            tutorialFlowStarted = true;
            tutorialBoardPhotoCaptureArmed = false;
            renderTutorialModeUi();
            if (tutorialMode && tutorialIntroTaskId !== currentTask.id) {
                tutorialIntroTaskId = currentTask.id;
                await showNpcDialog({
                    speakerKey: getStoryIntroSpeaker(currentTask),
                    mood: `第 ${currentTask.quest_order || '?'} 關教學`,
                    text: buildStoryIntroDialogue(currentTask),
                    buttonLabel: '開始操作'
                });
            }
            const demoMode = isCurrentQuestDemoMode() || isCurrentQuestTutorialMode();
            if (gpsRequired) {
                if (!lastLatLng && !demoMode) {
                    Swal.fire({ icon: 'info', title: '尚未取得位置', text: '請先靠近任務地點後再試' });
                    return;
                }
                const dist = lastLatLng
                    ? haversineDistance(lastLatLng.latitude, lastLatLng.longitude, targetLat, targetLng)
                    : Number.MAX_SAFE_INTEGER;
                if (!demoMode && dist > Math.max(6, currentTask.radius || 30)) {
                    Swal.fire({ icon: 'warning', title: '還沒到任務地點', text: `目前距離約 ${Math.round(dist)}m` });
                    return;
                }
            }
            if (currentTask.task_type === 'location') {
                if (tutorialGuestMode) {
                    completeTutorialGuestTask(currentTask);
                    tutorialFlowStarted = false;
                    renderTutorialModeUi();
                    await showNpcDialog({
                        speakerKey: 'host',
                        mood: '教學模式通關',
                        text: '沙丘已替你完成這一步報到，現在直接前往下一段劇情。',
                        buttonLabel: '前往下一關'
                    });
                    scheduleStoryReloadAfterCompletion();
                    showCompletionModal('✅ 教學模式已完成這一步');
                    return;
                }
                if (isCurrentQuestTutorialMode() && getLoginUser()) {
                    await completeTutorialLoggedInTask(currentTask, 'checked_in');
                    tutorialFlowStarted = false;
                    renderTutorialModeUi();
                    await showNpcDialog({
                        speakerKey: 'host',
                        mood: '教學模式通關',
                        text: '沙丘已替你完成這一步報到，現在直接前往下一段劇情。',
                        buttonLabel: '前往下一關'
                    });
                    scheduleStoryReloadAfterCompletion();
                    showCompletionModal('✅ 教學模式已完成這一步');
                    return;
                }
                if (!currentUserTaskId) await fetchCurrentUserTaskId();
                if (!currentUserTaskId) await createCurrentUserTaskRecord();
                if (!currentUserTaskId) {
                    Swal.fire({ icon: 'error', title: '無法建立關卡紀錄', text: tutorialMode ? '教學模式的關卡紀錄建立失敗，請重新整理後再試一次。' : '請重新整理後再試一次。' });
                    return;
                }
                const data = await requestJson(`/api/user-tasks/${currentUserTaskId}/answer`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ answer: 'checked_in' })
                }, '送出報到結果');
                if (data.success && data.isCompleted) {
                    tutorialFlowStarted = false;
                    renderTutorialModeUi();
                    if (demoMode && currentEntryMode === 'story_campaign') {
                        await showNpcDialog({
                            speakerKey: 'host',
                            mood: '教學模式通關',
                            text: '教學模式已替你完成這一步報到，現在直接前往下一段劇情。',
                            autoCloseMs: 2200
                        });
                    }
                    if (currentEntryMode === 'board_game' && currentBoardRun?.pendingTargetTile) {
                        await completeBoardTurn(true, {
                            speakerKey: 'judge',
                            mood: '到點判定',
                            text: data.message || '已完成報到，棋盤將推進到下一格。',
                            autoCloseMs: 2200
                        });
                    }
                    scheduleStoryReloadAfterCompletion();
                    showCompletionModal(data.earnedItemName ? `🎁 獲得：${data.earnedItemName}` : '📍 打卡成功');
                } else {
                    Swal.fire({ icon: 'warning', title: '打卡失敗', text: data.message || '請再試一次' });
                }
            } else if (currentTask.task_type === 'number') {
                const digits = Math.max(2, Math.min(8, String(currentTask.correct_answer || '').trim().length || 4));
                initLockWheels(digits);
                lockMsg.textContent = '';
                lockOverlay.classList.remove('hidden');
            } else {
                if (currentTask.task_type === 'photo') {
                    await enterPhotoCaptureFlow();
                    return;
                }
                if (selectionInstruction) {
                    selectionInstruction.style.display = currentTask.task_type === 'photo' ? '' : 'none';
                }
                showAnswerModal(currentTask);
            }
        }

        function captureSelectionDataUrlFromRect(minX, minY, maxX, maxY) {
            const width = maxX - minX;
            const height = maxY - minY;
            if (width < 10 || height < 10) return null;
            if (!video.videoWidth || !video.videoHeight) {
                throw new Error('相機畫面尚未就緒');
            }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

            const screenRatio = canvas.width / canvas.height;
            const videoRatio = video.videoWidth / video.videoHeight;
            let renderWidth, renderHeight, offsetX, offsetY;
            if (screenRatio > videoRatio) {
                renderWidth = canvas.width;
                renderHeight = canvas.width / videoRatio;
                offsetX = 0;
                offsetY = (canvas.height - renderHeight) / 2;
            } else {
                renderHeight = canvas.height;
                renderWidth = canvas.height * videoRatio;
                offsetX = (canvas.width - renderWidth) / 2;
                offsetY = 0;
            }

            const sourceX = (minX - offsetX) * (video.videoWidth / renderWidth);
            const sourceY = (minY - offsetY) * (video.videoHeight / renderHeight);
            const sourceW = width * (video.videoWidth / renderWidth);
            const sourceH = height * (video.videoHeight / renderHeight);

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = width;
            finalCanvas.height = height;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.drawImage(tempCanvas, sourceX, sourceY, sourceW, sourceH, 0, 0, width, height);
            return finalCanvas.toDataURL('image/jpeg', 0.95);
        }

        function captureCurrentReticleDataUrl() {
            const rect = getReticleRect();
            return captureSelectionDataUrlFromRect(rect.minX, rect.minY, rect.maxX, rect.maxY);
        }

        // 依矩形裁切並加入照片（供框選與手繪共用）
        function processSelectionFromRect(minX, minY, maxX, maxY) {
            try {
                const dataUrl = captureSelectionDataUrlFromRect(minX, minY, maxX, maxY);
                if (!dataUrl) return;
                addPhotoToCollection(dataUrl);
            } catch (e) {
                console.error('截圖失敗', e);
                aiResult.innerHTML = '<span style="color:red">截圖失敗: ' + e.message + '</span>';
                showResultPanel();
            }
        }

        // 取得當前劇本（任務模式使用 API 任務 currentTask，否則為鏡頭待命）
        function getActiveScript() {
            if (currentMode === 'mission' && currentTask) {
                const name = currentTask.name || '任務';
                const desc = currentTask.description || '';
                return {
                    title: name,
                    intro: desc || '請根據任務說明與景點介紹進行互動。',
                    system: `你是此景點的導覽者。請根據以下任務說明，用簡潔、友善的方式回答玩家的提問或介紹圈選的內容。\n\n【任務】${name}\n${desc ? '【說明】' + desc : ''}`,
                    user: '請根據這個任務的景點介紹，說明我圈選的內容。'
                };
            }
            return PROMPTS.free;
        }

        function applyScript(script, showIntro = true) {
            if (!script) return;
            if (systemPromptInput) systemPromptInput.value = script.system;
            if (userPromptInput) userPromptInput.value = script.user;
            
            if (systemPromptInput) {
                systemPromptInput.style.transition = 'background 0.3s';
                systemPromptInput.style.background = '#333';
                setTimeout(() => { systemPromptInput.style.background = ''; }, 300);
            }

            if (showIntro) {
                Swal.fire({
                    title: script.title,
                    text: script.intro,
                    icon: currentMode === 'mission' ? 'warning' : 'info',
                    confirmButtonText: '開始',
                    backdrop: `rgba(0,0,0,0.8)`
                });
            }
        }

        function getLanguageInstruction() {
            const lang = langSelect ? langSelect.value : 'zh';
            switch (lang) {
                case 'en':
                    return 'Please reply in English.';
                case 'ja':
                    return '日本語で回答してください。';
                case 'ko':
                    return '한국어로 답변해 주세요.';
                default:
                    return '請用繁體中文回答。';
            }
        }

        function getSpeechLocale() {
            const lang = langSelect ? langSelect.value : 'zh';
            switch (lang) {
                case 'en':
                    return 'en-US';
                case 'ja':
                    return 'ja-JP';
                case 'ko':
                    return 'ko-KR';
                default:
                    return 'zh-TW';
            }
        }

        function initLanguageSelector() {
            if (!langSelect) return;
            const saved = localStorage.getItem('aiLabLang');
            if (saved) langSelect.value = saved;
            langSelect.addEventListener('change', () => {
                localStorage.setItem('aiLabLang', langSelect.value);
            });
        }

        function updateVoicePanel(userText, aiText, statusText) {
            if (!voicePanel) return;
            voicePanel.classList.remove('hidden');
            if (voiceUser && userText !== undefined) voiceUser.textContent = userText || '—';
            if (voiceAi && aiText !== undefined) voiceAi.textContent = aiText || '—';
            if (voiceStatus && statusText !== undefined) voiceStatus.textContent = statusText;
        }

        function openVoicePanel() {
            if (voicePanel) voicePanel.classList.remove('hidden');
        }

        function setVoiceButtonsRecordingState(active) {
            if (micBtn) micBtn.classList.toggle('active', active);
            if (floatingMicBtn) floatingMicBtn.classList.toggle('active', active);
            if (voiceRecordBtn) {
                voiceRecordBtn.classList.toggle('active', active);
                voiceRecordBtn.textContent = active ? '⏹️ 停止收音' : '🎙️ 開始說話';
            }
        }

        function closeVoicePanel() {
            stopVoiceRecognition();
            if (voicePanel) voicePanel.classList.add('hidden');
        }

        function extractReplyText(rawText) {
            const cleanedText = String(rawText || '').replace(/```(?:xml|json)?|```/gi, '').trim();
            const replyMatch = cleanedText.match(/<reply>([\s\S]*?)<\/reply>/i);
            const analysisMatch = cleanedText.match(/<analysis>([\s\S]*?)<\/analysis>/i);
            return replyMatch
                ? replyMatch[1].trim()
                : (cleanedText || (analysisMatch ? analysisMatch[1].trim() : ''));
        }

        let speechRecognition = null;
        let isRecording = false;
        let speechRecognitionSupported = false;
        let answerToastTimer = null;

        function stopVoiceRecognition() {
            if (speechRecognition && isRecording) {
                try {
                    speechRecognition.stop();
                } catch (err) {
                    console.warn('停止語音辨識失敗', err);
                    try {
                        speechRecognition.abort();
                    } catch (abortErr) {
                        console.warn('中止語音辨識失敗', abortErr);
                    }
                }
            }
            isRecording = false;
            setVoiceButtonsRecordingState(false);
            if (voiceStatus) voiceStatus.textContent = '可送出提問';
        }

        function resetVoiceComposer() {
            if (voiceDraftInput) voiceDraftInput.value = '';
            if (voiceUser) voiceUser.textContent = '—';
            if (voiceAi) voiceAi.textContent = '—';
            if (voiceStatus) voiceStatus.textContent = '語音待命';
        }

        function setQueryTransitText(message) {
            if (!queryTransitLabel) return;
            const text = message || '已將問題用紙飛機寄出去囉，請等候回應';
            queryTransitLabel.querySelector('.qp-text-main').textContent = text;
        }

        function showQueryTransit(message) {
            setQueryTransitText(message);
            if (queryTransit) {
                queryTransit.classList.remove('hidden');
                queryTransit.classList.remove('returning');
                queryTransit.classList.add('sending');
            }
        }

        function hideQueryTransit() {
            if (queryTransit) {
                queryTransit.classList.add('hidden');
                queryTransit.classList.remove('sending', 'returning');
            }
        }

        async function playQueryReturnAnimation(message) {
            setQueryTransitText(message);
            if (!queryTransit) return;
            queryTransit.classList.remove('hidden', 'sending');
            queryTransit.classList.add('returning');
            await new Promise((resolve) => setTimeout(resolve, 850));
            hideQueryTransit();
        }

        function showAnswerToast(text) {
            if (!answerToast || !answerToastText) return;
            answerToastText.textContent = text || '';
            answerToast.classList.remove('hidden');
            if (answerToastTimer) clearTimeout(answerToastTimer);
            answerToastTimer = setTimeout(() => {
                answerToast.classList.add('hidden');
            }, 12000);
        }

        function hideAnswerToast() {
            if (answerToastTimer) clearTimeout(answerToastTimer);
            if (answerToast) answerToast.classList.add('hidden');
        }

        function collapseResultPanel() {
            if (resultPanel) {
                resultPanel.classList.remove('active');
                resultPanel.style.display = 'none';
            }
            if (selectionInstruction) {
                selectionInstruction.style.opacity = '1';
                selectionInstruction.style.display = '';
            }
        }

        async function analyzeVisionQuestion(photoDataUrl, systemPrompt, userPrompt, gpsData) {
            const response = await fetch(photoDataUrl);
            const blob = await response.blob();
            const formData = new FormData();
            formData.append('image', blob, 'voice-capture.jpg');
            formData.append('systemPrompt', systemPrompt);
            formData.append('userPrompt', userPrompt);
            formData.append('simpleMode', 'true');
            formData.append('skipRag', 'true');
            if (gpsData) {
                formData.append('latitude', gpsData.latitude);
                formData.append('longitude', gpsData.longitude);
            }

            const apiRes = await fetch('/api/vision-test', {
                method: 'POST',
                body: formData
            });
            if (!apiRes.ok) {
                const errText = await apiRes.text();
                throw new Error(errText || '視覺提問失敗');
            }
            return await apiRes.json();
        }

        async function sendVoiceChat(userText) {
            try {
                hideAnswerToast();
                showQueryTransit('問題已摺成紙飛機送出...');
                if (voiceSendBtn) voiceSendBtn.disabled = true;
                const snapshot = captureCurrentReticleDataUrl();
                if (!snapshot) {
                    throw new Error('無法擷取圈內畫面');
                }

                let finalSystemPrompt = systemPromptInput && systemPromptInput.value ? systemPromptInput.value : '';
                if (!finalSystemPrompt || finalSystemPrompt.length < 10) {
                    const fallbackScript = getActiveScript();
                    finalSystemPrompt = fallbackScript ? fallbackScript.system : finalSystemPrompt;
                }

                const locationTextForPrompt = lastLocationText
                    || (lastLatLng
                        ? `緯度 ${lastLatLng.latitude.toFixed(5)}，經度 ${lastLatLng.longitude.toFixed(5)}`
                        : '');
                if (locationTextForPrompt) {
                    finalSystemPrompt += `\n\n【拍攝地點資訊】${locationTextForPrompt}`;
                }
                finalSystemPrompt += `\n\n【輸出語言】${getLanguageInstruction()}`;
                finalSystemPrompt += `\n\n【回答規範】你是即時視覺導覽助手。請根據取景框截圖與使用者提問，用自然、直接的口吻回答 2 到 4 句。不要輸出 XML、JSON、analysis、步驟清單。若看不清楚，就坦白說並給出重新拍攝建議。不要提到你是根據座標推斷。`;

                let gpsData = null;
                try {
                    const pos = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000, enableHighAccuracy: false });
                    });
                    gpsData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                    lastLatLng = gpsData;
                } catch (gpsErr) {
                    console.warn('語音提問略過 GPS', gpsErr);
                }

                const finalUserPrompt = `這是使用者目前在手機取景框中看到的畫面。請先理解畫面主體，再回答這個問題：${userText}${locationTextForPrompt ? `\n\n背景位置資訊：${locationTextForPrompt}` : ''}`;
                if (voicePanel) voicePanel.classList.add('hidden');
                resetVoiceComposer();
                const data = await analyzeVisionQuestion(snapshot, finalSystemPrompt, finalUserPrompt, gpsData);
                if (!data.success) throw new Error(data.message || 'AI 回覆失敗');

                const replyText = extractReplyText(data.description || '');
                await playQueryReturnAnimation('AI 紙飛機回來了');
                showAnswerToast(replyText);

                const shouldSpeak = voiceSpeakToggle ? voiceSpeakToggle.checked : true;
                if (shouldSpeak && 'speechSynthesis' in window && replyText) {
                    const utter = new SpeechSynthesisUtterance(replyText);
                    utter.lang = getSpeechLocale();
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(utter);
                }
            } catch (err) {
                console.error('語音聊天錯誤', err);
                await playQueryReturnAnimation('紙飛機帶回了錯誤訊息');
                showAnswerToast(err.message || '語音回覆失敗，請再試一次');
            } finally {
                hideQueryTransit();
                if (voiceSendBtn) voiceSendBtn.disabled = false;
                resetVoiceComposer();
            }
        }

        function initSpeechChat() {
            if (!micBtn && !floatingMicBtn) return;
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const preferKeyboardDictation = isIOS;
            speechRecognitionSupported = !!SpeechRecognition;

            const openComposerFromLauncher = (statusText) => {
                openVoicePanel();
                if (voiceDraftInput) {
                    requestAnimationFrame(() => voiceDraftInput.focus());
                }
                if (!speechRecognitionSupported || preferKeyboardDictation) {
                    updateVoicePanel(
                        voiceDraftInput ? voiceDraftInput.value.trim() : '',
                        '',
                        statusText || (isIOS
                            ? '請直接使用 iPhone 鍵盤的麥克風輸入文字，完成後按送出'
                            : '此裝置不支援語音轉文字，可直接輸入文字後送出')
                    );
                }
            };

            const startVoiceRecognition = () => {
                if (!speechRecognitionSupported || !speechRecognition || preferKeyboardDictation) {
                    openComposerFromLauncher();
                    return;
                }
                openVoicePanel();
                if (!isRecording) {
                    speechRecognition.lang = getSpeechLocale();
                    updateVoicePanel(voiceDraftInput ? voiceDraftInput.value.trim() : '', '', '聆聽中...');
                    speechRecognition.start();
                    isRecording = true;
                    setVoiceButtonsRecordingState(true);
                } else {
                    stopVoiceRecognition();
                }
            };

            [micBtn, floatingMicBtn].forEach((btn) => {
                if (!btn) return;
                btn.addEventListener('click', startVoiceRecognition);
            });
            if (voiceRecordBtn) {
                voiceRecordBtn.addEventListener('click', startVoiceRecognition);
            }
            if (voiceCloseBtn) {
                voiceCloseBtn.addEventListener('click', closeVoicePanel);
            }
            if (answerToastClose) {
                answerToastClose.addEventListener('click', hideAnswerToast);
            }
            if (voiceDraftInput) {
                voiceDraftInput.addEventListener('input', () => {
                    openVoicePanel();
                    if (voiceUser) voiceUser.textContent = voiceDraftInput.value.trim() || '—';
                });
            }
            if (voiceSendBtn) {
                voiceSendBtn.addEventListener('click', () => {
                    const text = voiceDraftInput ? voiceDraftInput.value.trim() : '';
                    if (!text) {
                        Swal.fire({ icon: 'info', title: '請先說話或輸入文字', text: '送出時會自動搭配圈內畫面一起提問' });
                        return;
                    }
                    stopVoiceRecognition();
                    sendVoiceChat(text);
                });
            }

            if (voiceRecordBtn) {
                voiceRecordBtn.textContent = preferKeyboardDictation ? '⌨️ 鍵盤語音輸入' : '🎙️ 開始說話';
            }

            if (!SpeechRecognition) {
                return;
            }

            const recognition = new SpeechRecognition();
            speechRecognition = recognition;
            recognition.lang = getSpeechLocale();
            recognition.interimResults = true;
            recognition.continuous = false;

            recognition.onstart = () => {
                updateVoicePanel(voiceDraftInput ? voiceDraftInput.value.trim() : '', '', '聆聽中...');
            };

            recognition.onresult = (event) => {
                let finalTranscript = '';
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i += 1) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interim += transcript;
                    }
                }
                const transcriptText = (finalTranscript || interim).trim();
                if (voiceDraftInput) voiceDraftInput.value = transcriptText;
                updateVoicePanel(transcriptText, voiceAi ? voiceAi.textContent : '', finalTranscript ? '已轉成文字，可送出' : '辨識中...');
                if (finalTranscript) {
                    stopVoiceRecognition();
                }
            };

            recognition.onerror = (event) => {
                console.warn('語音辨識錯誤', event);
                const reason = event.error || 'unknown';
                updateVoicePanel(voiceDraftInput ? voiceDraftInput.value.trim() : '', '語音辨識失敗', '失敗');
                isRecording = false;
                setVoiceButtonsRecordingState(false);
                if (preferKeyboardDictation) {
                    openComposerFromLauncher('請改用 iPhone 鍵盤的麥克風輸入文字，完成後按送出');
                } else if (voiceStatus) {
                    voiceStatus.textContent = `語音辨識失敗：${reason}`;
                }
            };

            recognition.onend = () => {
                isRecording = false;
                setVoiceButtonsRecordingState(false);
                if (voiceStatus && voiceStatus.textContent === '聆聽中...') {
                    voiceStatus.textContent = '可送出提問';
                }
            };
        }

        function initMiniMapToggle() {
            if (!miniMapToggle || !miniMapWrap) return;
            const saved = localStorage.getItem('aiLabMiniMapCollapsed');
            if (saved === '1') {
                miniMapWrap.classList.add('collapsed');
            }
            miniMapToggle.addEventListener('click', () => {
                miniMapWrap.classList.toggle('collapsed');
                const isCollapsed = miniMapWrap.classList.contains('collapsed');
                localStorage.setItem('aiLabMiniMapCollapsed', isCollapsed ? '1' : '0');
                if (!isCollapsed && mapInstance) {
                    setTimeout(() => {
                        mapInstance.invalidateSize();
                        updateTaskMapViewport();
                    }, 200);
                }
            });
            if (miniMapRefresh) {
                miniMapRefresh.addEventListener('click', () => {
                    requestLocation();
                });
            }
        }

        // 切換模式
        function setMode(mode, showIntro = true) {
            log(`切換模式: ${mode}`);
            if (mode === 'mission' && !currentTask) {
                Swal.fire({
                    icon: 'info',
                    title: '尚未承接任務',
                    text: '請先從關卡簡報進入海底探索艙，或先用鏡頭待命模式熟悉環境。'
                });
                mode = 'free';
            }
            currentMode = mode;

            // UI 按鈕狀態更新
            modeBtns.forEach(btn => {
                if (btn.dataset.mode === mode) {
                    btn.classList.add('active');
                    btn.setAttribute('aria-pressed', 'true');
                } else {
                    btn.classList.remove('active');
                    btn.setAttribute('aria-pressed', 'false');
                }
            });

            // Body class 更新 (CSS特效用)
            document.body.className = `mode-${mode}`;

            const script = getActiveScript();
            applyScript(script, showIntro);
        }

        // 啟動相機
        async function startCamera() {
            try {
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                }
                
                log('正在啟動相機...');
                
                // 高畫質相機設定（iOS/Android 優化）
                const highQualityConstraints = {
                    video: {
                        facingMode: facingMode,
                        width: { ideal: 1920, min: 1280 },
                        height: { ideal: 1080, min: 720 },
                        aspectRatio: { ideal: 16/9 },
                        // iOS 需要這些設定來獲得更好畫質
                        advanced: [
                            { width: 1920, height: 1080 },
                            { width: 1280, height: 720 }
                        ]
                    },
                    audio: false
                };

                try {
                    stream = await navigator.mediaDevices.getUserMedia(highQualityConstraints);
                    log(`相機解析度: ${stream.getVideoTracks()[0]?.getSettings()?.width || '?'}x${stream.getVideoTracks()[0]?.getSettings()?.height || '?'}`);
                } catch (err1) {
                    log('高畫質模式失敗，嘗試標準設定: ' + err1.name);
                    // 降級到標準設定
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: {
                                facingMode: facingMode,
                                width: { ideal: 1280 },
                                height: { ideal: 720 }
                            },
                            audio: false
                        });
                    } catch (err2) {
                        log('標準設定也失敗，使用最基本設定');
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: true,
                            audio: false
                        });
                    }
                }
                
                video.srcObject = stream;
                try {
                    await video.play();
                    log('相機啟動成功');
                } catch (playErr) {
                    log('播放失敗: ' + playErr.message);
                }

                setupZoomControl();
                
            } catch (err) {
                if (shouldSuppressCameraAlert()) {
                    console.warn('教學模式略過相機啟動失敗:', err);
                } else {
                    console.error('相機啟動失敗:', err);
                }
                log('相機錯誤: ' + err.name);
                
                let msg = '無法存取相機，請確認權限';
                let showRetry = false;
                
                if (err.name === 'NotAllowedError') {
                    msg = '您拒絕了相機權限';
                    showRetry = true;
                } else if (err.name === 'NotFoundError') {
                    msg = '找不到相機裝置';
                }

                if (shouldSuppressCameraAlert()) {
                    log(`${msg}（教學模式可繼續體驗）`);
                    return;
                }
                
                const result = await Swal.fire({
                    icon: 'error',
                    title: '相機錯誤',
                    text: `${msg} (${err.name})`,
                    confirmButtonText: showRetry ? '重新請求權限' : '確定',
                    showCancelButton: showRetry,
                    cancelButtonText: '取消'
                });
                
                if (result.isConfirmed && showRetry) {
                    setTimeout(startCamera, 500);
                }
            }
        }

        function setZoomLevel(track, targetZoom, caps) {
            const minZoom = caps.zoom.min;
            const maxZoom = caps.zoom.max;
            const zoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));
            if (zoomValue) zoomValue.textContent = `${Number(zoom).toFixed(1)}x`;
            zoomButtons.forEach(btn => {
                btn.classList.toggle('active', Number(btn.dataset.zoom) === Math.round(zoom));
            });
            return track.applyConstraints({ advanced: [{ zoom }] }).catch((err) => {
                console.warn('Zoom 設定失敗', err);
            });
        }

        function setupZoomControl() {
            if (!stream || !zoomControl || !zoomValue || !zoomButtons.length) return;
            const [track] = stream.getVideoTracks();
            if (!track || !track.getCapabilities) {
                zoomControl.classList.add('hidden');
                return;
            }
            const caps = track.getCapabilities();
            if (!caps.zoom) {
                zoomControl.classList.add('hidden');
                return;
            }
            zoomControl.classList.remove('hidden');
            const settings = track.getSettings();
            const currentZoom = settings.zoom || caps.zoom.min;
            zoomValue.textContent = `${Number(currentZoom).toFixed(1)}x`;
            zoomButtons.forEach((btn) => {
                btn.onclick = () => setZoomLevel(track, Number(btn.dataset.zoom), caps);
            });
        }

        // 位置與地圖
        function ensureMiniMapElements() {
            if (miniMapEl && locationInfoEl) return;
            if (!cameraContainer) {
                log('找不到 camera-container，無法建立地圖容器');
                return;
            }
            const wrap = document.createElement('div');
            wrap.className = 'mini-map-wrap';

            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'miniMapToggle';
            toggleBtn.className = 'mini-map-toggle';
            toggleBtn.title = '切換地圖';
            toggleBtn.textContent = '🗺️';

            const refreshBtn = document.createElement('button');
            refreshBtn.id = 'miniMapRefresh';
            refreshBtn.className = 'mini-map-refresh';
            refreshBtn.title = '定位更新';
            refreshBtn.textContent = '📍';

            const mapDiv = document.createElement('div');
            mapDiv.id = 'miniMap';
            mapDiv.className = 'mini-map';

            const infoDiv = document.createElement('div');
            infoDiv.id = 'locationInfo';
            infoDiv.className = 'location-info';
            infoDiv.textContent = '定位中...';

            const indicatorDiv = document.createElement('div');
            indicatorDiv.id = 'miniMapTaskIndicators';
            indicatorDiv.className = 'mini-map-task-indicators';

            wrap.appendChild(toggleBtn);
            wrap.appendChild(refreshBtn);
            wrap.appendChild(mapDiv);
            wrap.appendChild(indicatorDiv);
            wrap.appendChild(infoDiv);
            cameraContainer.appendChild(wrap);

            miniMapEl = mapDiv;
            locationInfoEl = infoDiv;
            miniMapWrap = wrap;
            miniMapToggle = toggleBtn;
            miniMapRefresh = refreshBtn;
            miniMapTaskIndicators = indicatorDiv;
        }

        function isIndependentVisibleTask(task) {
            return task
                && task.lat != null
                && task.lng != null
                && !task.quest_chain_id
                && String(task.id) !== String(currentTaskId);
        }

        function normalizeVisibleTasks(tasks, progressMap) {
            return [
                ...tasks
                    .filter(isIndependentVisibleTask)
                    .map((task) => ({
                        ...task,
                        _visibleTaskType: 'single',
                        lat: Number(task.lat),
                        lng: Number(task.lng)
                    })),
                ...getVisibleQuestTasks(tasks, progressMap)
            ].filter((task) => Number.isFinite(task.lat) && Number.isFinite(task.lng));
        }

        async function fetchInProgressTasks() {
            try {
                const res = await fetch('/api/user-tasks', { credentials: 'include' });
                if (!res.ok) return [];
                const data = await res.json();
                return data.success && Array.isArray(data.tasks) ? data.tasks : [];
            } catch (err) {
                console.warn('取得進行中任務失敗', err);
                return [];
            }
        }

        async function getQuickCurrentPosition() {
            if (!navigator.geolocation) return null;
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2500, enableHighAccuracy: false });
                });
                return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            } catch (err) {
                return null;
            }
        }

        function pickNearestTask(tasks, reference) {
            if (!reference || !tasks.length) return tasks[0] || null;
            return tasks
                .map((task) => ({
                    task,
                    distance: haversineDistance(reference.latitude, reference.longitude, task.lat, task.lng)
                }))
                .sort((a, b) => a.distance - b.distance)[0]?.task || null;
        }

        async function fetchQuestProgressMap() {
            try {
                if (!getLoginUser()) return {};
                const res = await fetch('/api/user/quest-progress', { credentials: 'include' });
                if (res.status === 401 || res.status === 403) return {};
                if (!res.ok) return {};
                const data = await res.json();
                if (!data.success || !data.progress || typeof data.progress !== 'object') return {};
                return data.progress;
            } catch (err) {
                console.warn('取得劇情進度失敗', err);
                return {};
            }
        }

        function getVisibleQuestTasks(tasks, progressMap) {
            const grouped = new Map();
            tasks.forEach((task) => {
                if (!task || !task.quest_chain_id || task.lat == null || task.lng == null) return;
                const chainId = String(task.quest_chain_id);
                if (!grouped.has(chainId)) grouped.set(chainId, []);
                grouped.get(chainId).push({
                    ...task,
                    lat: Number(task.lat),
                    lng: Number(task.lng),
                    quest_order: Number(task.quest_order || 0)
                });
            });

            const visibleQuestTasks = [];
            grouped.forEach((chainTasks, chainId) => {
                const sortedTasks = chainTasks
                    .filter((task) => Number.isFinite(task.lat) && Number.isFinite(task.lng))
                    .sort((a, b) => a.quest_order - b.quest_order);
                if (!sortedTasks.length) return;

                const progressOrder = Number(progressMap?.[chainId]);
                let visibleTask = null;
                if (Number.isFinite(progressOrder) && progressOrder > 0) {
                    visibleTask = sortedTasks.find((task) => task.quest_order === progressOrder) || null;
                } else {
                    visibleTask = sortedTasks[0] || null;
                }

                if (visibleTask && String(visibleTask.id) !== String(currentTaskId)) {
                    visibleQuestTasks.push({
                        ...visibleTask,
                        _visibleTaskType: 'quest'
                    });
                }
            });
            return visibleQuestTasks;
        }

        async function loadNearbyVisibleTasks() {
            try {
                if (currentQuestChainId || isShellExperience) {
                    nearbyVisibleTasks = [];
                    renderNearbyTaskMarkers();
                    updateMiniMapTaskIndicators();
                    return;
                }
                const [taskRes, questProgress] = await Promise.all([
                    fetch('/api/tasks'),
                    fetchQuestProgressMap()
                ]);
                const data = await taskRes.json();
                if (!data.success || !Array.isArray(data.tasks)) return;
                const reference = lastLatLng || (targetLat && targetLng ? { latitude: targetLat, longitude: targetLng } : null);
                nearbyVisibleTasks = normalizeVisibleTasks(data.tasks, questProgress)
                    .filter((task) => {
                        if (!reference) return true;
                        return haversineDistance(reference.latitude, reference.longitude, task.lat, task.lng) <= 1000;
                    });
                renderNearbyTaskMarkers();
                updateMiniMapTaskIndicators();
            } catch (err) {
                console.warn('載入附近任務失敗', err);
            }
        }

        function renderNearbyTaskMarkers() {
            if (!mapInstance || !window.L) return;
            if (!nearbyTaskLayer) {
                nearbyTaskLayer = L.layerGroup().addTo(mapInstance);
            }
            nearbyTaskLayer.clearLayers();
            nearbyVisibleTasks.forEach((task) => {
                const marker = L.circleMarker([task.lat, task.lng], {
                    radius: 6,
                    color: task._visibleTaskType === 'quest' ? '#a855f7' : '#38bdf8',
                    weight: 2,
                    fillColor: task._visibleTaskType === 'quest' ? '#c084fc' : '#0ea5e9',
                    fillOpacity: 0.92
                }).addTo(nearbyTaskLayer);
                marker.bindTooltip(
                    `${task._visibleTaskType === 'quest' ? '劇情任務' : '單題任務'}：${task.name || '任務地點'}`,
                    { permanent: false, direction: 'top' }
                );
                marker.on('click', () => {
                    selectTaskForAiLab(task);
                });
            });
        }

        function applyTaskSelection(task, options = {}) {
            if (!task) return;
            if (String(currentTaskId) !== String(task.id)) {
                currentUserTaskId = null;
            }
            syncTaskEncounterVisibility();
            currentTaskId = task.id;
            targetLat = taskUsesGps(task) ? Number(task.lat) : null;
            targetLng = taskUsesGps(task) ? Number(task.lng) : null;
            loadTaskBGM(task);
            showTaskContext(task);
            if (mapInstance && Number.isFinite(targetLat) && Number.isFinite(targetLng)) {
                if (!taskMapMarker) {
                    taskMapMarker = L.circleMarker([targetLat, targetLng], {
                        radius: 8,
                        color: '#ef4444',
                        weight: 3,
                        fillColor: '#f97316',
                        fillOpacity: 0.95
                    }).addTo(mapInstance);
                    taskMapMarker.bindTooltip('任務地點', { permanent: false, direction: 'top' });
                } else {
                    taskMapMarker.setLatLng([targetLat, targetLng]);
                }
                updateTaskMapViewport();
            } else if (taskMapMarker && mapInstance) {
                mapInstance.removeLayer(taskMapMarker);
                taskMapMarker = null;
            }
            if (options.updateUrl !== false) {
                const newUrl = new URL(window.location.href);
                if (currentQuestChainId) newUrl.searchParams.set('questChainId', currentQuestChainId);
                if (currentEntryMode) newUrl.searchParams.set('mode', currentEntryMode);
                newUrl.searchParams.set('taskId', task.id);
                if (Number.isFinite(targetLat)) newUrl.searchParams.set('lat', targetLat);
                else newUrl.searchParams.delete('lat');
                if (Number.isFinite(targetLng)) newUrl.searchParams.set('lng', targetLng);
                else newUrl.searchParams.delete('lng');
                window.history.replaceState({}, '', newUrl);
            }
            if (!options.skipNearbyReload) {
                loadNearbyVisibleTasks();
            }
            setMode('mission', false);
            startTaskNavigation();
        }

        async function selectTaskForAiLab(taskLike) {
            try {
                const res = await fetch(`/api/tasks/${taskLike.id}`);
                const data = await res.json();
                if (!data.success || !data.task) return;
                applyTaskSelection(data.task);
            } catch (err) {
                console.error('切換 AI-LAB 任務失敗', err);
            }
        }

        async function loadDefaultVisibleTaskForUser() {
            try {
                if (isShellExperience) return;
                if (!getLoginUser()) return;
                const [taskRes, questProgress, inProgressTasks, quickPos] = await Promise.all([
                    fetch('/api/tasks'),
                    fetchQuestProgressMap(),
                    fetchInProgressTasks(),
                    getQuickCurrentPosition()
                ]);
                const data = await taskRes.json();
                if (!data.success || !Array.isArray(data.tasks)) return;
                const visibleTasks = normalizeVisibleTasks(data.tasks, questProgress);
                if (!visibleTasks.length) return;
                const activeIds = new Set(inProgressTasks.map((task) => String(task.id)));
                const activeVisibleTasks = visibleTasks.filter((task) => activeIds.has(String(task.id)));
                const selectedTask = activeVisibleTasks.length
                    ? pickNearestTask(activeVisibleTasks, quickPos || lastLatLng)
                    : pickNearestTask(visibleTasks, quickPos || lastLatLng);
                if (selectedTask) {
                    applyTaskSelection(selectedTask);
                }
            } catch (err) {
                console.error('載入預設任務失敗', err);
            }
        }

        function updateMiniMapTaskIndicators() {
            if (!miniMapTaskIndicators) return;
            miniMapTaskIndicators.innerHTML = '';
            if (!mapInstance || !nearbyVisibleTasks.length) return;
            const bounds = mapInstance.getBounds();
            const center = mapInstance.getCenter();
            const indicators = nearbyVisibleTasks
                .filter((task) => !bounds.contains([task.lat, task.lng]))
                .slice(0, 3);

            indicators.forEach((task) => {
                const bearing = calculateBearing(center.lat, center.lng, task.lat, task.lng);
                const distance = lastLatLng
                    ? haversineDistance(lastLatLng.latitude, lastLatLng.longitude, task.lat, task.lng)
                    : haversineDistance(center.lat, center.lng, task.lat, task.lng);
                const item = document.createElement('div');
                item.className = 'mini-map-task-indicator';
                item.innerHTML = `
                    <span class="mini-map-task-arrow" style="transform: rotate(${bearing}deg)">➤</span>
                    <span>${task._visibleTaskType === 'quest' ? '劇情' : '單題'} · ${task.name || '附近任務'} · ${Math.round(distance)}m</span>
                `;
                miniMapTaskIndicators.appendChild(item);
            });
        }

        function initMiniMap() {
            ensureMiniMapElements();
            if (!miniMapEl) {
                log('找不到地圖容器，略過地圖顯示');
                return;
            }
            if (miniMapWrap && miniMapToggle) {
                initMiniMapToggle();
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

        function updateLocationText(text) {
            lastLocationText = text;
            if (locationInfoEl) {
                locationInfoEl.textContent = text;
            }
            if (locationBar) {
                locationBar.textContent = `目前位置：${text}`;
            }
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

        // 繪圖相關函數
        function getPos(e) {
            if (e.touches && e.touches[0]) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            if (e.changedTouches && e.changedTouches[0]) {
                return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        }

        function startDraw(e) {
            stopVoiceRecognition();
            if (resultPanel.style.display === 'flex') return;
            const pos = getPos(e);
            if (selectionMode === 'reticle') {
                if (isGuidedReticleLockMode() || isPhotoTaskCaptureActive()) {
                    tapStart = null;
                    return;
                }
                tapStart = { x: pos.x, y: pos.y };
                return;
            }
            isDrawing = true;
            points = [];
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            points.push(pos);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#ffd700';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (selectionInstruction) selectionInstruction.style.opacity = '0';
        }

        function moveDraw(e) {
            if (selectionMode === 'reticle') {
                if (isGuidedReticleLockMode() || isPhotoTaskCaptureActive()) return;
                if (tapStart) {
                    const pos = getPos(e);
                    const dx = pos.x - tapStart.x, dy = pos.y - tapStart.y;
                    if (Math.sqrt(dx * dx + dy * dy) > 15) tapStart = null;
                }
                return;
            }
            if (!isDrawing) return;
            e.preventDefault();
            const pos = getPos(e);
            points.push(pos);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        }

        function endDraw(e) {
            if (selectionMode === 'reticle') {
                if (isGuidedReticleLockMode() || isPhotoTaskCaptureActive()) {
                    tapStart = null;
                    return;
                }
                if (tapStart && e) {
                    const pos = getPos(e);
                    const dx = pos.x - tapStart.x, dy = pos.y - tapStart.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 15) {
                        const r = reticleRadius;
                        reticleCenter.x = Math.max(r, Math.min(canvas.width - r, pos.x));
                        reticleCenter.y = Math.max(r, Math.min(canvas.height - r, pos.y));
                        updateReticlePosition();
                    }
                }
                tapStart = null;
                return;
            }
            if (!isDrawing) return;
            isDrawing = false;
            ctx.closePath();
            if (points.length > 5) {
                processSelection();
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (selectionInstruction) selectionInstruction.style.opacity = '1';
            }
        }

        // 截圖處理（手繪圈選：從 points 算邊界後呼叫共用裁切）
        function processSelection() {
            let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
            points.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            });
            const padding = 20;
            minX = Math.max(0, minX - padding);
            minY = Math.max(0, minY - padding);
            maxX = Math.min(canvas.width, maxX + padding);
            maxY = Math.min(canvas.height, maxY + padding);
            processSelectionFromRect(minX, minY, maxX, maxY);
        }

        function captureFullFrameDataUrl() {
            if (!video.videoWidth || !video.videoHeight) {
                throw new Error('相機尚未就緒');
            }
            const photoCanvas = document.createElement('canvas');
            photoCanvas.width = video.videoWidth;
            photoCanvas.height = video.videoHeight;
            const photoCtx = photoCanvas.getContext('2d');
            photoCtx.drawImage(video, 0, 0, photoCanvas.width, photoCanvas.height);
            return photoCanvas.toDataURL('image/jpeg', 0.95);
        }

        // 添加照片到集合
        function addPhotoToCollection(dataUrl) {
            if (capturedPhotos.length >= MAX_PHOTOS) {
                capturedPhotos[MAX_PHOTOS - 1] = dataUrl;
            } else {
                capturedPhotos.push(dataUrl);
            }

            // 更新 UI
            updatePhotoStrip();
            updatePreviewArea();
            updatePhotoBasketUi();
            if (!isPhotoTaskCaptureActive()) {
                showResultPanel();
            }
        }

        // 更新照片條（每次從 DOM 取得 slot，確保顯示在結果面板內的縮圖正確）
        function updatePhotoStrip() {
            const strip = document.getElementById('photoStrip');
            const slots = strip ? strip.querySelectorAll('.photo-slot') : [];
            slots.forEach((slot, index) => {
                slot.classList.remove('filled', 'active');
                const existingImg = slot.querySelector('img');
                if (existingImg) existingImg.remove();

                if (capturedPhotos[index]) {
                    slot.classList.add('filled');
                    const img = document.createElement('img');
                    img.src = capturedPhotos[index];
                    img.alt = `第 ${index + 1} 張`;
                    img.setAttribute('loading', 'eager');
                    slot.appendChild(img);
                }
            });

            const nextIndex = Math.min(capturedPhotos.length, MAX_PHOTOS - 1);
            if (capturedPhotos.length < MAX_PHOTOS && slots[nextIndex]) {
                slots[nextIndex].classList.add('active');
            }

            const count = capturedPhotos.length;
            if (count >= MIN_PHOTOS_TO_ANALYZE) {
                analyzeBtn.disabled = false;
                if (photoHint) {
                    if (count >= MAX_PHOTOS) {
                        photoHint.innerHTML = `✓ 已拍攝 ${MAX_PHOTOS} 張，可開始辨識`;
                    } else if (count === 1) {
                        photoHint.innerHTML = [
                            '若此物品並非「生物」請直接辨識。',
                            '若是生物類（例如植物）建議補上第二、三張：',
                            '請拍攝特寫花朵、果實、葉片等位置，越多細節推測出的結論越準確。'
                        ].join('<br>');
                    } else {
                        photoHint.innerHTML = `已拍 ${count} 張，可辨識或再補 1 張（建議：花朵／果實／葉片特寫）。`;
                    }
                    photoHint.classList.toggle('complete', count >= MAX_PHOTOS);
                }
                if (addPhotoBtn) {
                    addPhotoBtn.disabled = count >= MAX_PHOTOS;
                    addPhotoBtn.textContent = count >= MAX_PHOTOS ? '已完成' : `拍攝第 ${count + 1} 張`;
                }
            } else {
                if (photoHint) photoHint.textContent = `請拍攝至少 ${MIN_PHOTOS_TO_ANALYZE} 張照片`;
                analyzeBtn.disabled = true;
                if (addPhotoBtn) {
                    addPhotoBtn.disabled = false;
                    addPhotoBtn.textContent = '拍攝第 1 張';
                }
            }
        }

        // 預覽區：依 1/2/3 張顯示，不裁切、不空白
        function updatePreviewArea() {
            if (!previewArea) return;
            previewArea.innerHTML = '';
            previewArea.className = 'preview-area';
            const count = capturedPhotos.length;
            if (count === 0) return;
            previewArea.classList.add('preview-count-' + Math.min(count, 3));
            for (let i = 0; i < count; i++) {
                const img = document.createElement('img');
                img.src = capturedPhotos[i];
                img.alt = `第 ${i + 1} 張`;
                img.loading = 'eager';
                previewArea.appendChild(img);
            }
        }

        function showResultPanel() {
            resultPanel.style.display = 'flex';
            resultPanel.classList.add('active');
            if (selectionInstruction) selectionInstruction.style.display = 'none';

            const count = capturedPhotos.length;
            if (count < MIN_PHOTOS_TO_ANALYZE) {
                aiResult.innerHTML = `<div style="text-align:center; color:#666;">
                    <div style="font-size:24px; margin-bottom:8px;">📷</div>
                    <div>請拍攝一張照片</div>
                    <div style="font-size:13px; color:#999; margin-top:4px;">不清楚時可再補拍不同角度</div>
                </div>`;
            } else {
                aiResult.innerHTML = '準備就緒，點擊「AI 辨識」開始分析';
            }
            if(rawOutput) rawOutput.style.display = 'none';
            analyzeBtn.textContent = 'AI 辨識';
            // 面板顯示後再刷新照片條與預覽區，確保縮圖與大圖在可見時正確繪製
            requestAnimationFrame(() => {
                updatePhotoStrip();
                updatePreviewArea();
            });
        }

        function retry() {
            capturedPhotos.length = 0;
            needMorePhotosSession = null;
            updatePhotoStrip();
            updatePreviewArea();

            resultPanel.classList.remove('active');
            resultPanel.style.display = 'none';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (selectionInstruction) selectionInstruction.style.opacity = '1';
            if (selectionInstruction) selectionInstruction.style.display = '';
            aiResult.innerHTML = '';
            points = [];
        }

        // ------------------------------------------------
        // 5. 事件監聽 (Event Listeners)
        // ------------------------------------------------

        // 視窗大小改變與初始尺寸
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // 相機切換
        switchCameraBtn.addEventListener('click', () => {
            facingMode = facingMode === 'environment' ? 'user' : 'environment';
            startCamera();
        });

        // 拍照
        captureBtn.addEventListener('click', () => {
            try {
                const dataUrl = captureFullFrameDataUrl();
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                if (navigator.canShare && !isIOS) {
                    fetch(dataUrl)
                        .then(res => res.blob())
                        .then(blob => {
                            const file = new File([blob], `ai-lab-${Date.now()}.jpg`, { type: 'image/jpeg' });
                            return navigator.share({ files: [file], title: 'AI Lab Photo' });
                        })
                        .catch(() => {
                            const link = document.createElement('a');
                            link.href = dataUrl;
                            link.download = `ai-lab-${Date.now()}.jpg`;
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                        });
                } else if (isIOS) {
                    const win = window.open();
                    if (win) {
                        win.document.write(`<img src="${dataUrl}" style="width:100%"/>`);
                    }
                    Swal.fire({
                        icon: 'info',
                        title: '已開啟照片',
                        text: '請長按圖片儲存'
                    });
                } else {
                    const link = document.createElement('a');
                    link.href = dataUrl;
                    link.download = `ai-lab-${Date.now()}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                }
            } catch (err) {
                console.error('拍照失敗', err);
                Swal.fire({
                    icon: 'error',
                    title: '拍照失敗',
                    text: err.message
                });
            }
        });

        // 返回（有 taskId 時回任務詳情，與 AR-VIEW 一致）
        backBtn.addEventListener('click', () => {
            const params = new URLSearchParams(window.location.search);
            const taskId = params.get('taskId');
            const questChainId = params.get('questChainId');
            const mode = params.get('mode');
            if (questChainId || mode) window.location.href = '/';
            else if (taskId) window.location.href = `/task-detail.html?id=${taskId}`;
            else window.location.href = '/';
        });

        // 繪圖事件
        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', moveDraw);
        canvas.addEventListener('mouseup', endDraw);
        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', moveDraw, { passive: false });
        canvas.addEventListener('touchend', (e) => { e.preventDefault(); endDraw(e); }, { passive: false });
        canvas.addEventListener('touchcancel', endDraw);

        // 導演面板開關
        if (directorToggle && directorPanel) {
            directorToggle.addEventListener('click', () => {
                directorPanel.classList.toggle('open');
            });
        }

        // 模式按鈕
        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (isShellExperience) return;
                setMode(btn.dataset.mode);
            });
        });

        if (gameShellEntries) {
            gameShellEntries.addEventListener('click', async (event) => {
                const entryBtn = event.target.closest('.game-shell-entry[data-entry-id]');
                if (!entryBtn) return;
                const entryId = entryBtn.dataset.entryId;
                const entryType = entryBtn.dataset.entryType;
                if (entryType === 'board') {
                    const tile = currentBoardTiles.find((item) => String(item.id) === String(entryId));
                    if (tile) await focusBoardTile(tile);
                    return;
                }
                const task = currentStoryTasks.find((item) => String(item.id) === String(entryId));
                if (task) await focusStoryTask(task);
            });
        }

        if (gameShellStartBtn) {
            gameShellStartBtn.addEventListener('touchstart', () => {
                gameShellStartBtn.style.animation = 'none';
            }, { passive: true });
            
            gameShellStartBtn.addEventListener('click', () => {
                if (currentEntryMode === 'board_game') {
                    if (currentBoardRun?.pendingTargetTile) {
                        const focusTile = currentBoardTiles.find((tile) => Number(tile.tile_index) === Number(currentBoardRun.pendingTargetTile));
                        if (focusTile) {
                            if (focusTile.task_id) {
                                focusBoardTile(focusTile)
                                    .then(() => startTaskInteraction())
                                    .catch(console.error);
                            } else {
                                focusBoardTile(focusTile).catch(console.error);
                            }
                        }
                    } else {
                        startBoardTurn().catch((err) => {
                            console.error('開始大富翁回合失敗', err);
                        });
                    }
                    return;
                }
                startTaskInteraction().catch((err) => {
                    console.error('從遊戲殼開始關卡失敗', err);
                    Swal.fire({ icon: 'error', title: '無法開始這一關', text: err.message || '請稍後再試' });
                });
            });
        }

        // 重試按鈕
        retryBtn.addEventListener('click', retry);

        if (npcDialogClose) {
            npcDialogClose.addEventListener('click', closeNpcDialog);
        }
        if (npcDialog) {
            npcDialog.addEventListener('click', (e) => {
                // 如果點擊的不是按鈕本身，也允許點擊對話框來關閉
                if (e.target !== npcDialogClose) {
                    closeNpcDialog();
                }
            });
        }

        // 拍攝下一張按鈕
        if (addPhotoBtn) {
            addPhotoBtn.addEventListener('click', () => {
                // 關閉結果面板，回到拍攝模式
                resultPanel.classList.remove('active');
                resultPanel.style.display = 'none';
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (selectionInstruction) {
                    selectionInstruction.style.opacity = '1';
                    selectionInstruction.style.display = '';  // 讓「框內拍照」按鈕再次顯示，才能拍第二、三張
                }
            });
        }

        const photoConfirmOverlay = document.getElementById('photoConfirmOverlay');
        const photoConfirmPreview = document.getElementById('photoConfirmPreview');
        const photoRetakeBtn = document.getElementById('photoRetakeBtn');
        const photoConfirmBtn = document.getElementById('photoConfirmBtn');

        let pendingPhotoDataUrl = null;

        if (photoRetakeBtn) {
            photoRetakeBtn.addEventListener('click', () => {
                pendingPhotoDataUrl = null;
                if (photoConfirmOverlay) photoConfirmOverlay.classList.add('hidden');
                shutterBusy = false;
            });
        }

        if (photoConfirmBtn) {
            photoConfirmBtn.addEventListener('click', async () => {
                if (!pendingPhotoDataUrl) return;
                if (photoConfirmOverlay) photoConfirmOverlay.classList.add('hidden');
                
                const dataUrl = pendingPhotoDataUrl;
                pendingPhotoDataUrl = null;

                if (typeof showQueryTransit === 'function') {
                    showQueryTransit('正在整理照片與傳送資料...');
                }
                
                try {
                    const requiredShots = getRequiredShots();
                    if (capturedPhotos.length >= requiredShots) {
                        capturedPhotos.length = requiredShots - 1;
                    }
                    capturedPhotos.push(dataUrl);
                    currentAnswerPhotoDataUrl = dataUrl;
                    updatePhotoBasketUi();

                    if (capturedPhotos.length < requiredShots) {
                        if (typeof hideQueryTransit === 'function') hideQueryTransit();
                        await showNpcDialog({
                            speakerKey: 'guide',
                            mood: '收進探索袋',
                            text: `這張畫面已經收進探索袋，目前 ${capturedPhotos.length}/${requiredShots} 張。\n\n再拍 ${requiredShots - capturedPhotos.length} 張，就能交給潮汐裁判判定。`,
                            autoCloseMs: 1800,
                            blocking: false
                        });
                        shutterBusy = false;
                        return;
                    }

                    currentAnswerPhotoDataUrl = await buildPhotoSubmissionDataUrl();
                    await submitTaskAnswer();
                } catch (err) {
                    if (typeof hideQueryTransit === 'function') hideQueryTransit();
                    console.error('提交照片失敗', err);
                    await showNpcDialog({
                        speakerKey: 'rescue',
                        mood: '拍攝失敗',
                        text: `海羽沒有成功收下這張畫面。\n\n${err.message || '請再試一次。'}`,
                        buttonLabel: '知道了'
                    });
                } finally {
                    shutterBusy = false;
                }
            });
        }

        async function handleTaskPhotoShutter() {
            if (!isPhotoTaskCaptureActive() || shutterBusy) return;
            shutterBusy = true;
            try {
                // 關閉任何可能遮擋的 NPC 對話框
                if (typeof closeNpcDialog === 'function') closeNpcDialog();
                
                playCameraFeedback();
                const dataUrl = video.videoWidth && video.videoHeight
                    ? (cameraCaptureMode === 'scene' ? captureFullFrameDataUrl() : captureCurrentReticleDataUrl())
                    : (isCurrentQuestTutorialMode() ? createTutorialFallbackCapture() : null);
                if (!dataUrl) {
                    throw new Error('相機尚未就緒，請稍後再試一次');
                }
                
                // 顯示預覽與確認按鈕
                pendingPhotoDataUrl = dataUrl;
                if (photoConfirmPreview) photoConfirmPreview.src = dataUrl;
                if (photoConfirmOverlay) {
                    photoConfirmOverlay.classList.remove('hidden');
                } else {
                    shutterBusy = false;
                }

            } catch (err) {
                console.error('拍照失敗', err);
                await showNpcDialog({
                    speakerKey: 'rescue',
                    mood: '拍攝失敗',
                    text: `海羽沒有成功收下這張畫面。\n\n${err.message || '請再試一次。'}`,
                    buttonLabel: '知道了'
                });
                shutterBusy = false;
            }
        }

        // 框內拍照（單手模式）
        async function handleReticleCaptureAction() {
                if (selectionMode !== 'reticle') return;
                if (isPhotoTaskCaptureActive()) {
                    await handleTaskPhotoShutter();
                    return;
                }
                if (!video.videoWidth || !video.videoHeight) {
                    aiResult.innerHTML = '<span style="color:red">相機尚未就緒</span>';
                    showResultPanel();
                    return;
                }
                const rect = getReticleRect();
                processSelectionFromRect(rect.minX, rect.minY, rect.maxX, rect.maxY);
        }

        if (shutterBtn) {
            shutterBtn.addEventListener('click', () => {
                if (isPhotoTaskCaptureActive()) {
                    handleTaskPhotoShutter();
                    return;
                }
                handleReticleCaptureAction();
            });
        }

        if (reticleCaptureHotspot) {
            reticleCaptureHotspot.addEventListener('click', () => {
                if (!isPhotoTaskCaptureActive()) return;
                handleTaskPhotoShutter();
            });
        }

        if (boardPanelTrack) {
            boardPanelTrack.addEventListener('click', (event) => {
                const tileButton = event.target.closest('.board-track-chip[data-tile-index]');
                if (!tileButton) return;
                const tileIndex = Number(tileButton.dataset.tileIndex);
                if (!Number.isFinite(tileIndex)) return;
                const tile = getBoardTileByIndex(tileIndex);
                if (!tile) return;
                currentBoardActiveTileId = tile.id;
                renderGameShellEntries(currentBoardTiles, tile.id);
                updateGameShellProgress(tile);
                showBoardTilePreview(tile);
            });
        }

        // 切換框選 / 手繪模式
        function setSelectionMode(mode) {
            selectionMode = 'reticle';
            if (reticleOverlay) reticleOverlay.classList.toggle('hidden', cameraCaptureMode === 'scene');
            if (instructionText && !isPhotoTaskCaptureActive()) {
                instructionText.textContent = '把目標放進黃色圓框，直接點圓框中央拍照';
            }
        }
        if (cameraModeTaskBtn) cameraModeTaskBtn.addEventListener('click', () => setCameraCaptureMode('task'));
        if (cameraModeSceneBtn) cameraModeSceneBtn.addEventListener('click', () => setCameraCaptureMode('scene'));
        setSelectionMode('reticle');
        loadGameShellFromUrl().then((loaded) => {
            if (!loaded) loadTaskFromUrl();
        });

        if (taskBgmBtn && taskBgm) {
            taskBgmBtn.addEventListener('click', () => {
                if (taskBgm.paused) {
                    taskBgm.play().catch(() => {});
                    taskBgmBtn.textContent = '🔊';
                } else {
                    taskBgm.pause();
                    taskBgmBtn.textContent = '🎵';
                }
            });
        }
        if (taskIntroBtn && taskIntroPanel) {
            taskIntroBtn.addEventListener('click', () => {
                taskIntroPanel.classList.remove('hidden');
            });
        }
        if (taskIntroClose && taskIntroPanel) {
            taskIntroClose.addEventListener('click', () => {
                taskIntroPanel.classList.add('hidden');
            });
        }
        if (featureDockToggle && featureDockMenu) {
            featureDockToggle.addEventListener('click', async () => {
                await ensureOrientationPermission();
                const willOpen = featureDockMenu.classList.contains('hidden');
                featureDockMenu.classList.toggle('hidden');
                if (!willOpen) {
                    closeDockPanels();
                }
                featureDockToggle.textContent = willOpen ? '×' : '☰';
            });
        }
        if (gameShellToggle && gameShellPanel) {
            gameShellToggle.addEventListener('click', () => {
                gameShellPanel.classList.toggle('collapsed');
            });
        }
        if (gameShellBtn && gameShellPanel) {
            gameShellBtn.addEventListener('click', () => {
                gameShellPanel.classList.toggle('collapsed');
            });
        }
        if (taskHudToggle && taskStatusBox) {
            taskHudToggle.addEventListener('click', () => {
                const willOpen = taskStatusBox.classList.contains('hidden');
                taskStatusBox.classList.toggle('hidden');
                taskHudToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            });
        }
        if (dockModeBtn) {
            dockModeBtn.addEventListener('click', async () => {
                await ensureOrientationPermission();
                toggleDockPanel('mode');
            });
        }
        if (dockLangBtn) {
            dockLangBtn.addEventListener('click', async () => {
                await ensureOrientationPermission();
                toggleDockPanel('lang');
            });
        }
        if (dockZoomBtn) {
            dockZoomBtn.addEventListener('click', async () => {
                await ensureOrientationPermission();
                toggleDockPanel('zoom');
            });
        }
        if (hudPanelBtn) {
            hudPanelBtn.addEventListener('click', () => {
                toggleDockPanel('hud');
                renderHudSummary();
            });
        }
        if (boardPanelBtn) {
            boardPanelBtn.addEventListener('click', () => {
                toggleDockPanel('board');
                renderBoardPanel();
            });
        }
        if (boardMiniMap) {
            boardMiniMap.addEventListener('click', () => {
                toggleDockPanel('board');
                renderBoardPanel();
            });
        }
        if (boardMapSelector) {
            boardMapSelector.addEventListener('change', async () => {
                const nextBoardMapId = boardMapSelector.value;
                if (!nextBoardMapId || String(nextBoardMapId) === String(currentBoardMap?.id || '')) return;
                const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
                if (boardPanelStatus) boardPanelStatus.textContent = '正在切換棋盤...';
                try {
                    await loadBoardShell(currentQuestChainId, nextBoardMapId, previewMode);
                    toggleDockPanel('board');
                } catch (err) {
                    console.error('切換棋盤失敗', err);
                    if (boardPanelStatus) boardPanelStatus.textContent = '切換棋盤失敗，請稍後再試。';
                }
            });
        }
        if (rollDiceBtn) {
            rollDiceBtn.addEventListener('click', () => {
                startBoardTurn().catch((err) => {
                    console.error('大富翁擲骰失敗', err);
                    Swal.fire({ icon: 'error', title: '擲骰失敗', text: err.message || '請稍後再試' });
                });
            });
        }
        if (floatingDiceBtn) {
            floatingDiceBtn.addEventListener('touchstart', () => {
                floatingDiceBtn.style.animation = 'none';
            }, { passive: true });
            
            floatingDiceBtn.addEventListener('click', () => {
                startBoardTurn().catch((err) => {
                    console.error('大富翁擲骰失敗', err);
                    Swal.fire({ icon: 'error', title: '擲骰失敗', text: err.message || '請稍後再試' });
                });
            });
        }
        if (boardFocusBtn) {
            boardFocusBtn.addEventListener('click', () => {
                const focusTile = currentBoardRun?.pendingTargetTile
                    ? currentBoardTiles.find((tile) => Number(tile.tile_index) === Number(currentBoardRun.pendingTargetTile))
                    : null;
                if (!focusTile) return;
                focusBoardTile(focusTile).catch((err) => {
                    console.error('聚焦大富翁目標失敗', err);
                    Swal.fire({ icon: 'error', title: '無法聚焦目標', text: err.message || '請稍後再試' });
                });
            });
        }
        if (taskTargetObj) {
            taskTargetObj.addEventListener('click', () => {
                openTaskEncounter();
            });
        }
        if (taskEncounterClose) {
            taskEncounterClose.addEventListener('click', closeTaskEncounter);
        }
        if (taskEncounterStart) {
            taskEncounterStart.addEventListener('click', () => {
                startTaskInteraction().catch((err) => {
                    console.error('開始任務互動失敗', err);
                    Swal.fire({ icon: 'error', title: '任務互動失敗', text: err.message || '請稍後再試' });
                });
            });
        }
        if (btnAnswerCancel) {
            btnAnswerCancel.addEventListener('click', () => {
                answerModal.classList.add('hidden');
                resetPhotoCaptureState();
                renderTutorialModeUi();
            });
        }
        if (btnAnswerSubmit) {
            btnAnswerSubmit.addEventListener('click', () => {
                submitTaskAnswer().catch((err) => {
                    console.error('提交任務答案失敗', err);
                    answerMessage.textContent = '❌ 送出失敗';
                    btnAnswerSubmit.disabled = false;
                });
            });
        }
        if (btnLockCancel) {
            btnLockCancel.addEventListener('click', () => {
                lockOverlay.classList.add('hidden');
            });
        }
        if (btnLockSubmit) {
            btnLockSubmit.addEventListener('click', () => {
                submitLockCode().catch((err) => {
                    console.error('送出密碼失敗', err);
                    lockMsg.textContent = '連線失敗';
                });
            });
        }
        function showStorySummaryPage() {
            let totalTasks = 0;
            let earnedPoints = 0;

            if (currentStoryTasks) {
                if (currentStoryCompleted) {
                    // If completed, all tasks are done
                    totalTasks = currentStoryTasks.length;
                    currentStoryTasks.forEach(task => {
                        earnedPoints += Number(task.points || 0);
                    });
                } else if (currentStoryCompletedTaskIds) {
                    totalTasks = currentStoryCompletedTaskIds.size;
                    currentStoryTasks.forEach(task => {
                        if (currentStoryCompletedTaskIds.has(task.id)) {
                            earnedPoints += Number(task.points || 0);
                        }
                    });
                }
            }
            
            Swal.fire({
                title: '🎉 旅程完成！',
                html: `你完成了 <b>${totalTasks}</b> 個關卡！<br>本輪獲得 <b>${earnedPoints}</b> 積分`,
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: '前往大富翁',
                cancelButtonText: '回首頁',
                confirmButtonColor: '#ff9f1c',
                cancelButtonColor: '#6b7280',
                allowOutsideClick: false,
                allowEscapeKey: false
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        const res = await fetch('/api/quest-chains/public-entries');
                        const data = await res.json();
                        if (data.success && data.entries) {
                            const boardEntry = data.entries.find(e => e.play_style === 'tutorial_board' || e.mode_type === 'board_game');
                            if (boardEntry) {
                                window.location.href = `/ai-lab.html?mode=board_game&questChainId=${boardEntry.id}`;
                                return;
                            }
                        }
                    } catch (err) {
                        console.error('Failed to fetch board entry', err);
                    }
                    // Fallback if not found
                    window.location.href = '/index.html';
                } else {
                    // Navigate to home
                    window.location.href = '/index.html';
                }
            });
        }

        if (btnCompletionClose) {
            btnCompletionClose.addEventListener('click', async () => {
                completionModal.classList.add('hidden');
                renderTutorialModeUi();
                if (pendingStoryReloadAfterCompletion && currentQuestChainId) {
                    pendingStoryReloadAfterCompletion = false;
                    await loadStoryShell(currentQuestChainId);
                    
                    if (currentStoryCompleted) {
                        showStorySummaryPage();
                    }
                }
            });
        }

        window.addEventListener('deviceorientation', handleOrientationEvent, true);
        window.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
        window.addEventListener('pointerdown', async () => {
            await ensureOrientationPermission();
            if (taskReached) {
                tryAutoPlayTaskBgm(0);
            }
        });

        const AI_THINKING_STAGES = {
            upload: [
                '📤 正在上傳照片...',
                '📷 讀取圖片資料中...',
                '🔄 準備傳送至 AI...'
            ],
            analyze: [
                '🔍 AI 正在觀察圖片...',
                '🧠 辨識物體輪廓中...',
                '👀 分析色彩與紋理...',
                '🎯 鎖定主要特徵...',
                '📐 測量比例關係...'
            ],
            plant: [
                '🌿 這看起來像植物...',
                '🍃 分析葉片形狀...',
                '🌸 檢查花朵特徵...',
                '🌳 判斷生長型態...',
                '📋 提取關鍵特徵...'
            ],
            search: [
                '📚 搜尋植物資料庫...',
                '🔎 比對 9000+ 種植物...',
                '⚖️ 計算相似度分數...',
                '🏆 排序最佳候選...'
            ],
            finalize: [
                '✨ 整理辨識結果...',
                '📊 計算信心度...',
                '✅ 準備顯示答案...'
            ]
        };

        let thinkingInterval = null;
        let currentStage = 'upload';
        let stageMessageIndex = 0;

        // 開始 AI 思考動畫
        function startThinkingAnimation() {
            stopThinkingAnimation();
            currentStage = 'upload';
            stageMessageIndex = 0;

            // 立即顯示第一個訊息（不使用延遲）
            if (loadingText) {
                loadingText.textContent = AI_THINKING_STAGES[currentStage][0];
                loadingText.style.opacity = '1';
            }

            console.log('🎬 思考動畫開始:', AI_THINKING_STAGES[currentStage][0]);

            thinkingInterval = setInterval(() => {
                const messages = AI_THINKING_STAGES[currentStage];
                if (messages) {
                    stageMessageIndex = (stageMessageIndex + 1) % messages.length;
                    updateLoadingMessage(messages[stageMessageIndex]);
                }
            }, 1500); // 每 1.5 秒換一個訊息
        }

        // 切換到下一個思考階段
        function setThinkingStage(stage) {
            if (AI_THINKING_STAGES[stage]) {
                currentStage = stage;
                stageMessageIndex = 0;
                console.log('🔄 切換思考階段:', stage, AI_THINKING_STAGES[stage][0]);
                // 立即更新（不使用淡入效果避免延遲）
                if (loadingText) {
                    loadingText.textContent = AI_THINKING_STAGES[stage][0];
                }
            }
        }

        // 停止思考動畫
        function stopThinkingAnimation() {
            if (thinkingInterval) {
                clearInterval(thinkingInterval);
                thinkingInterval = null;
                console.log('⏹️ 思考動畫停止');
            }
        }

        // 更新載入訊息（帶淡入效果）
        function updateLoadingMessage(message) {
            if (loadingText && message) {
                loadingText.style.transition = 'opacity 0.15s ease';
                loadingText.style.opacity = '0.5';
                setTimeout(() => {
                    loadingText.textContent = message;
                    loadingText.style.opacity = '1';
                }, 150);
            }
        }

        // 合併多張照片成一張格子圖
        async function combinePhotosToGrid(photos) {
            return new Promise((resolve) => {
                const count = photos.length;
                if (count === 0) {
                    resolve(null);
                    return;
                }
                if (count === 1) {
                    resolve(photos[0]);
                    return;
                }

                // 創建格子圖 canvas
                const gridCanvas = document.createElement('canvas');
                const ctx = gridCanvas.getContext('2d');

                // 根據照片數量決定排列方式（高解析度 1920x1080 每格）
                const cols = count <= 2 ? count : 2;
                const rows = Math.ceil(count / cols);
                const cellWidth = 1920;
                const cellHeight = 1080;

                gridCanvas.width = cellWidth * cols;
                gridCanvas.height = cellHeight * rows;

                // 填充白色背景
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);

                // 載入並繪製每張照片
                let loaded = 0;
                photos.forEach((photoUrl, index) => {
                    const img = new Image();
                    img.onload = () => {
                        const col = index % cols;
                        const row = Math.floor(index / cols);
                        const x = col * cellWidth;
                        const y = row * cellHeight;

                        // 保持比例繪製
                        const scale = Math.min(cellWidth / img.width, cellHeight / img.height);
                        const drawWidth = img.width * scale;
                        const drawHeight = img.height * scale;
                        const offsetX = x + (cellWidth - drawWidth) / 2;
                        const offsetY = y + (cellHeight - drawHeight) / 2;

                        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

                        // 添加照片編號標籤
                        ctx.fillStyle = 'rgba(0,0,0,0.6)';
                        ctx.fillRect(x + 5, y + 5, 30, 25);
                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'bold 16px sans-serif';
                        ctx.fillText(`${index + 1}`, x + 12, y + 23);

                        loaded++;
                        if (loaded === count) {
                            resolve(gridCanvas.toDataURL('image/jpeg', 0.9));
                        }
                    };
                    img.onerror = () => {
                        loaded++;
                        if (loaded === count) {
                            resolve(gridCanvas.toDataURL('image/jpeg', 0.9));
                        }
                    };
                    img.src = photoUrl;
                });
            });
        }

        // 發送照片進行分析（支援補圖 previous_session）
        async function analyzePhotos(photoDataUrl, systemPrompt, userPrompt, gpsData, opts) {
            const response = await fetch(photoDataUrl);
            const blob = await response.blob();
            const formData = new FormData();
            formData.append('image', blob, 'capture.jpg');
            formData.append('systemPrompt', systemPrompt);
            formData.append('userPrompt', userPrompt);
            formData.append('skipRag', 'true'); // 只使用 LM 回覆，不進行植物 RAG / 資料庫比對

            if (gpsData) {
                formData.append('latitude', gpsData.latitude);
                formData.append('longitude', gpsData.longitude);
            }
            if (opts?.previousSession) {
                formData.append('previous_session', JSON.stringify(opts.previousSession));
            }

            const apiRes = await fetch('/api/vision-test', {
                method: 'POST',
                body: formData
            });

            if (!apiRes.ok) {
                throw new Error('照片分析失敗');
            }

            return await apiRes.json();
        }

        // AI 辨識按鈕 (核心邏輯 - 多照片版本)
        analyzeBtn.addEventListener('click', async () => {
            stopVoiceRecognition();
            analyzeBtn.disabled = true;
            if (addPhotoBtn) addPhotoBtn.disabled = true;
            hideAnswerToast();
            showQueryTransit('照片問題已摺成紙飛機送出...');
            collapseResultPanel();

            // 立即顯示載入動畫（確保在任何 async 之前）
            aiResult.innerHTML = '';
            if(rawOutput) rawOutput.style.display = 'none';
            aiLoading.classList.remove('hidden');

            // 開始 AI 思考動畫
            startThinkingAnimation();

            // 強制渲染更新
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            try {

                // 1. 準備 Prompt
                let finalSystemPrompt = systemPromptInput && systemPromptInput.value ? systemPromptInput.value : '';
                let finalUserPrompt = userPromptInput && userPromptInput.value ? userPromptInput.value : '';

                if (!finalSystemPrompt || finalSystemPrompt.length < 10) {
                    const fallbackScript = getActiveScript();
                    finalSystemPrompt = fallbackScript ? fallbackScript.system : finalSystemPrompt;
                    if (systemPromptInput) systemPromptInput.value = finalSystemPrompt;
                }

                if (!finalUserPrompt) {
                    const fallbackScript = getActiveScript();
                    finalUserPrompt = fallbackScript ? fallbackScript.user : finalUserPrompt;
                }

                const locationTextForPrompt = lastLocationText
                    || (lastLatLng ? `緯度 ${lastLatLng.latitude.toFixed(5)}，經度 ${lastLatLng.longitude.toFixed(5)}` : '');
                if (locationTextForPrompt) {
                    finalSystemPrompt += `\n\n【拍攝地點資訊】${locationTextForPrompt}`;
                    finalUserPrompt += `\n\n拍攝地點：${locationTextForPrompt}`;
                }
                finalSystemPrompt += `\n\n【輸出語言】${getLanguageInstruction()}`;

                // 2. 取得 GPS
                let gpsData = null;
                try {
                    const pos = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000, enableHighAccuracy: false });
                    });
                    gpsData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                    lastLatLng = gpsData;
                } catch (gpsErr) {
                    console.warn('GPS 略過', gpsErr);
                }

                // 3. 兩段式多圖：補拍時只送新圖 + previous_session；首次則送單張或格子圖
                setThinkingStage('upload');
                const isFollowUp = !!needMorePhotosSession;
                const imageToSend = isFollowUp
                    ? capturedPhotos[capturedPhotos.length - 1]
                    : await combinePhotosToGrid(capturedPhotos);
                if (!imageToSend) throw new Error('無法處理照片');
                updatePreviewArea();

                if (!isFollowUp && capturedPhotos.length > 1) {
                    finalUserPrompt += `\n\n【注意】這是從 ${capturedPhotos.length} 個不同角度拍攝的照片組合，請綜合分析所有角度的特徵。`;
                }

                setThinkingStage('analyze');
                updateLoadingMessage(isFollowUp ? '🔍 正在比對第二張圖...' : '🔍 正在分析圖片...');

                // 未使用 RAG 時不呼叫快速特徵提取（省一次 API，直接由 LM 回覆）
                let quickFeatures = null;

                const result = await analyzePhotos(imageToSend, finalSystemPrompt, finalUserPrompt, gpsData, needMorePhotosSession ? { previousSession: needMorePhotosSession } : null);

                console.log('🤖 API 回應:', result);

                // 跳過 RAG 模式：只顯示 LM 回覆，不處理植物資料庫結果
                if (result.skip_rag) {
                    stopThinkingAnimation();
                    if (quickFeatures) aiResult.innerHTML = '';
                    let displayText = result.description || '';
                    const replyMatch = displayText.match(/<reply>([\s\S]*?)<\/reply>/i);
                    if (replyMatch) displayText = replyMatch[1].trim();
                    await playQueryReturnAnimation('AI 紙飛機帶回了答案');
                    showAnswerToast(displayText);
                    aiLoading.classList.add('hidden');
                    analyzeBtn.disabled = false;
                    analyzeBtn.textContent = '再次辨識';
                    if (addPhotoBtn) addPhotoBtn.disabled = false;
                    retry();
                    return;
                }

                // 兩段式多圖：需要補拍時儲存 session，顯示提示
                if (result.need_more_photos && result.session_data) {
                    needMorePhotosSession = result.session_data;
                    const nextPhotoNum = (result.session_data.photo_count ?? 1) + 1;
                    aiResult.innerHTML = `
                        <div class="need-more-photos" style="text-align:center; padding:20px;">
                            <div style="font-size:28px; margin-bottom:12px;">📷</div>
                            <div style="font-size:16px; font-weight:600; color:#f57c00;">${result.need_more_photos_message || '請從不同角度再拍一張'}</div>
                            <div style="font-size:13px; color:#666; margin-top:8px;">特別是花朵或花序，可提高辨識準確度</div>
                            <div style="margin-top:16px;">
                                <span style="font-size:13px; color:#999;">點「拍攝第 ${nextPhotoNum} 張」補拍後，再點「AI 辨識」</span>
                            </div>
                        </div>
                    `;
                    if (addPhotoBtn) {
                        addPhotoBtn.disabled = false;
                        addPhotoBtn.textContent = `拍攝第 ${nextPhotoNum} 張`;
                    }
                    analyzeBtn.textContent = '補拍後再辨識';
                    await playQueryReturnAnimation('AI 紙飛機請你再補一張');
                    showAnswerToast((result.need_more_photos_message || '請從不同角度再拍一張').replace(/\s+/g, ' ').trim());
                    stopThinkingAnimation();
                    aiLoading.classList.add('hidden');
                    analyzeBtn.disabled = false;
                    return;
                }
                needMorePhotosSession = null;

                // 處理結果
                const allPlants = [];
                let avgConfidence = 0;
                let hasPlantResult = false;

                // 檢查是否有植物 RAG 結果
                if (result.plant_rag?.is_plant && result.plant_rag?.plants?.length > 0) {
                    hasPlantResult = true;
                    setThinkingStage('plant');
                    await new Promise(r => setTimeout(r, 300));

                    result.plant_rag.plants.forEach(p => {
                        // 如果有調整後分數（LM 與 RAG 匹配），使用調整後分數；否則使用原始分數
                        allPlants.push({
                            ...p,
                            displayScore: p.adjusted_score !== undefined ? p.adjusted_score : p.score
                        });
                    });

                    // 使用「最佳匹配」的分數作為信心度（不用平均，避免稀釋）
                    // 例：三色堇 90%、香堇菜 82% → 顯示 90%，而非平均 86%
                    const scores = allPlants.map(p => p.displayScore || p.score);
                    avgConfidence = scores.length > 0 ? Math.max(...scores) : 0;
                    
                    // 如果有 LM 信心度加成，在日誌中顯示
                    if (result.plant_rag.lm_confidence_boost) {
                        console.log(`📈 LM 與 RAG 匹配，信心度加成: ${(result.plant_rag.lm_confidence_boost * 100).toFixed(0)}%`);
                    }

                    setThinkingStage('search');
                    await new Promise(r => setTimeout(r, 500));
                    console.log(`🌿 植物結果: ${allPlants.length} 個, 最佳信心度: ${Math.round(avgConfidence * 100)}%`);
                } else {
                    // 非植物情況也要顯示動畫進度
                    setThinkingStage('analyze');
                    await new Promise(r => setTimeout(r, 500));
                    console.log('📦 非植物結果，類別:', result.plant_rag?.category || 'unknown');
                }

                setThinkingStage('finalize');
                await new Promise(r => setTimeout(r, 300));

                // 停止思考動畫
                stopThinkingAnimation();

                // 將單一結果包裝成陣列格式（兼容後續處理）
                const allResults = [result];

                // 依分數排序植物（使用顯示分數）
                allPlants.sort((a, b) => (b.displayScore || b.score) - (a.displayScore || a.score));

                // 5. 根據結果類型顯示不同內容
                // 如果有快速特徵已顯示，清除它並顯示最終結果
                if (quickFeatures) {
                    // 清除快速特徵顯示區域，準備顯示最終結果
                    aiResult.innerHTML = '';
                }
                
                if (hasPlantResult && avgConfidence >= CONFIDENCE_HIGH) {
                    // 高信心度植物 (≥85%)：直接顯示答案
                    showHighConfidenceResult(allResults, allPlants, avgConfidence);
                } else if (hasPlantResult && avgConfidence >= CONFIDENCE_MEDIUM) {
                    // 中等信心度植物：請求補拍
                    showMediumConfidenceResult(allResults, allPlants, avgConfidence);
                } else if (hasPlantResult && allPlants.length > 0) {
                    // 低信心度但有植物結果：請重新拍攝
                    showLowConfidenceResult(allResults, allPlants, avgConfidence);
                } else {
                    // 沒有植物結果或是其他物品：顯示一般 AI 回應
                    showNonPlantResult(allResults);
                }

                await playQueryReturnAnimation('AI 紙飛機帶回了答案');
                showAnswerToast((aiResult.textContent || '').replace(/\s+/g, ' ').trim());
                retry();

            } catch (err) {
                console.error('API 錯誤:', err);
                stopThinkingAnimation();

                // 根據錯誤類型顯示不同訊息
                let errorMessage = '系統錯誤';
                if (err.message.includes('fetch') || err.message.includes('Failed')) {
                    errorMessage = 'AI 服務暫時無法連線';
                } else if (err.message.includes('timeout')) {
                    errorMessage = 'AI 回應超時';
                } else {
                    errorMessage = err.message;
                }

                aiResult.innerHTML = `
                    <div style="text-align: center; padding: 16px;">
                        <div style="font-size: 28px; margin-bottom: 8px;">⚠️</div>
                        <div style="color: #c62828; font-weight: 500;">${errorMessage}</div>
                        <div style="color: #666; font-size: 13px; margin-top: 8px;">請稍後再試</div>
                    </div>
                `;
                await playQueryReturnAnimation('紙飛機帶回了錯誤訊息');
                showAnswerToast(errorMessage);
            } finally {
                hideQueryTransit();
                stopThinkingAnimation();
                aiLoading.classList.add('hidden');
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = '再次辨識';
                if (addPhotoBtn) addPhotoBtn.disabled = false;
            }
        });

        // 顯示第一階段結果（快速特徵提取）
        function showQuickFeatures(features) {
            // 格式化特徵文字（將列表格式轉換為更易讀的格式）
            let formattedFeatures = features;
            
            // 如果是列表格式（*   **生活型:** ...），轉換為更易讀的格式
            if (features.includes('*') && features.includes('**')) {
                formattedFeatures = features
                    .split('\n')
                    .filter(line => line.trim().startsWith('*'))
                    .map(line => {
                        // 移除 * 和 ** 標記，保留內容
                        return line.replace(/^\*\s*\*\*/, '•').replace(/\*\*/g, '').trim();
                    })
                    .join('\n');
            }
            
            aiResult.innerHTML = `
                <div style="background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #81c784;">
                    <div style="display: flex; align-items: center; margin-bottom: 12px;">
                        <div style="font-size: 24px; margin-right: 8px;">🔍</div>
                        <div style="font-size: 16px; font-weight: 600; color: #2e7d32;">圖片細節分析</div>
                    </div>
                    <div style="background: white; border-radius: 8px; padding: 12px; font-size: 14px; line-height: 1.8; color: #333; white-space: pre-wrap;">${formattedFeatures}</div>
                    <div style="margin-top: 12px; text-align: center; font-size: 12px; color: #666;">
                        <div style="display: inline-flex; align-items: center;">
                            <div style="width: 12px; height: 12px; border-radius: 50%; background: #4caf50; margin-right: 6px; animation: pulse 1.5s infinite;"></div>
                            正在比對資料庫，請稍候...
                        </div>
                    </div>
                </div>
            `;
            
            // 確保結果區域可見
            aiResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // 高信心度結果 (>85%)
        function showHighConfidenceResult(allResults, plants, confidence) {
            const topPlant = plants[0];
            const confidencePercent = Math.round(confidence * 100);

            let html = `
                <div style="text-align: center; margin-bottom: 12px;">
                    <div style="font-size: 28px; margin-bottom: 8px;">🌿</div>
                    <div style="font-size: 18px; font-weight: 600; color: #2e7d32;">辨識結果</div>
                    <div class="confidence-bar" style="margin: 12px auto; max-width: 200px;">
                        <div class="confidence-fill high" style="width: ${confidencePercent}%"></div>
                    </div>
                    <div style="font-size: 13px; color: #4caf50;">信心度: ${confidencePercent}%</div>
                </div>
            `;

            // 主要植物
            html += `
                <div style="padding: 16px; background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); border-radius: 12px; border: 2px solid #4caf50; margin-bottom: 12px;">
                    <div style="font-size: 20px; font-weight: 600; color: #1b5e20; margin-bottom: 4px;">
                        ${topPlant.chinese_name || topPlant.scientific_name}
                    </div>
                    <div style="font-size: 14px; color: #558b2f; font-style: italic; margin-bottom: 8px;">
                        ${topPlant.scientific_name}
                    </div>
                    <div style="font-size: 13px; color: #666;">
                        科: ${topPlant.family || '-'} | 型態: ${topPlant.life_form || '-'}
                    </div>
                    ${topPlant.summary ? `<div style="font-size: 13px; color: #555; margin-top: 8px; line-height: 1.5;">${topPlant.summary}</div>` : ''}
                </div>
            `;

            // 其他可能
            if (plants.length > 1) {
                html += `<div style="font-size: 13px; color: #666; margin-top: 8px;">其他可能: `;
                html += plants.slice(1, 3).map(p => p.chinese_name || p.scientific_name).join('、');
                html += `</div>`;
            }

            aiResult.innerHTML = html;
        }

        // 中等信心度結果 (40-85%)
        function showMediumConfidenceResult(allResults, plants, confidence) {
            const confidencePercent = Math.round(confidence * 100);

            let html = `
                <div class="need-more-photos">
                    <div class="icon">🤔</div>
                    <div class="message">需要更多角度確認</div>
                    <div class="hint">目前信心度 ${confidencePercent}%，請再拍攝一個不同角度</div>
                </div>
            `;

            // 顯示目前猜測（使用 displayScore = LM 加成後的調整分數）
            if (plants.length > 0) {
                html += `
                    <div style="margin-top: 12px; padding: 12px; background: #fff8e1; border-radius: 8px; border: 1px solid #ffe082;">
                        <div style="font-size: 13px; color: #f57c00; margin-bottom: 8px;">目前推測:</div>
                        ${plants.slice(0, 2).map(p => {
                            const score = (p.displayScore !== undefined ? p.displayScore : p.score) * 100;
                            return `
                            <div style="font-size: 14px; color: #333;">
                                • ${p.chinese_name || p.scientific_name} <span style="color:#999">(${Math.round(score)}%)</span>
                            </div>
                        `}).join('')}
                    </div>
                `;
            }

            aiResult.innerHTML = html;

            // 允許補拍一張
            if (addPhotoBtn) {
                addPhotoBtn.disabled = false;
                addPhotoBtn.textContent = '補拍一張';
            }
            analyzeBtn.textContent = '重新分析';
        }

        // 低信心度結果 (<40%)
        function showLowConfidenceResult(allResults, plants, confidence) {
            const confidencePercent = Math.round(confidence * 100);

            aiResult.innerHTML = `
                <div class="retry-message">
                    <div class="icon">📷</div>
                    <div class="message">無法確認辨識結果</div>
                    <div class="hint">信心度僅 ${confidencePercent}%，建議重新拍攝</div>
                </div>
                <div style="margin-top: 12px; text-align: center;">
                    <div style="font-size: 13px; color: #666; margin-bottom: 8px;">拍攝建議:</div>
                    <div style="font-size: 12px; color: #888; line-height: 1.6;">
                        • 確保光線充足<br>
                        • 拍攝葉片、花朵等特徵<br>
                        • 避免過度晃動
                    </div>
                </div>
            `;

            // 重置照片
            retryBtn.textContent = '重新拍攝';
        }

        // 非植物結果
        function showNonPlantResult(allResults) {
            // 使用第一張照片的 AI 回應
            const firstResult = allResults[0];
            console.log('📋 showNonPlantResult called:', firstResult);

            if (!firstResult?.success) {
                aiResult.innerHTML = '<span style="color:red">辨識失敗，請重試</span>';
                return;
            }

            let fullText = firstResult.description || '';

            if (!fullText) {
                aiResult.innerHTML = '<span style="color:red">AI 回應為空，請再試一次</span>';
                return;
            }

            // 移除 markdown 代碼區塊標記 (```xml ... ``` 或 ```json ... ```)
            fullText = fullText.replace(/^```(?:xml|json)?\s*/i, '').replace(/\s*```$/i, '');

            // XML 解析邏輯
            function extractTag(text, tag) {
                // 使用非貪婪匹配，但確保匹配到正確的結束標籤
                // 先找到所有可能的標籤位置
                const openTag = `<${tag}>`;
                const closeTag = `</${tag}>`;
                const openIndex = text.indexOf(openTag);
                if (openIndex === -1) return null;
                
                // 從開始標籤之後開始搜尋結束標籤
                const startPos = openIndex + openTag.length;
                const closeIndex = text.indexOf(closeTag, startPos);
                if (closeIndex === -1) return null;
                
                return text.substring(startPos, closeIndex).trim();
            }

            let finalReplyText = extractTag(fullText, 'reply');

            // 如果沒有 <reply> 標籤，嘗試其他方式
            if (!finalReplyText) {
                // 嘗試提取 </analysis> 後的內容（<reply> 通常在 </analysis> 之後）
                // 先找到最後一個 </analysis> 的位置（因為可能有多個）
                let analysisEndIndex = -1;
                let searchIndex = 0;
                while (true) {
                    const found = fullText.indexOf('</analysis>', searchIndex);
                    if (found === -1) break;
                    analysisEndIndex = found;
                    searchIndex = found + 11;
                }
                
                if (analysisEndIndex !== -1) {
                    // 從 </analysis> 之後提取內容
                    let afterAnalysis = fullText.substring(analysisEndIndex + 11).trim();
                    
                    // 🔥 關鍵修復：移除 JSON 區塊 (```json ... ```)
                    // 很多時候模型會在 </analysis> 後面接 JSON，然後才是 <reply> 或直接結束
                    // 我們需要把 JSON 區塊移除，以免它被當成回覆顯示
                    const jsonBlockStart = afterAnalysis.indexOf('```json');
                    if (jsonBlockStart !== -1) {
                        const jsonBlockEnd = afterAnalysis.indexOf('```', jsonBlockStart + 7);
                        if (jsonBlockEnd !== -1) {
                            // 移除 JSON 區塊，保留前後內容
                            afterAnalysis = afterAnalysis.substring(0, jsonBlockStart) + afterAnalysis.substring(jsonBlockEnd + 3);
                        } else {
                            // 如果 JSON 區塊沒閉合，直接截斷
                            afterAnalysis = afterAnalysis.substring(0, jsonBlockStart);
                        }
                    }
                    
                    // 移除可能的結尾 ``` 標記
                    afterAnalysis = afterAnalysis.replace(/\s*```$/i, '');
                    // 移除 <reply> 和 </reply> 標記如果存在
                    afterAnalysis = afterAnalysis.replace(/<\/?reply>/gi, '').trim();
                    
                    // 如果還有內容，使用它
                    if (afterAnalysis && afterAnalysis.length > 10) {
                        finalReplyText = afterAnalysis;
                    }
                }
            }

            // 如果還是沒有內容，嘗試使用 <analysis> 內容
            if (!finalReplyText) {
                finalReplyText = extractTag(fullText, 'analysis');
            }

            // 最後嘗試：使用整個回應（移除 XML 標籤）
            if (!finalReplyText) {
                finalReplyText = fullText
                    .replace(/<\/?(?:analysis|reply|result)>/gi, '')
                    .replace(/\s*```$/i, '')
                    .trim();
            }

            // 移除可能殘留的 XML/markdown 標記
            finalReplyText = finalReplyText.replace(/<\/?reply>/gi, '').trim();

            console.log('📝 Final reply text:', finalReplyText.substring(0, 100) + '...');

            if (finalReplyText) {
                // 決定顯示的類別圖標
                let categoryInfo = '';
                if (firstResult.plant_rag) {
                    const cat = firstResult.plant_rag.category || '一般物品';
                    const categoryIcons = {
                        'animal': '🐾 動物',
                        'artifact': '🔧 人造物',
                        'food': '🍴 食物',
                        'other': '📦 其他',
                        'plant': '🌿 植物'
                    };
                    categoryInfo = categoryIcons[cat] || `📝 ${cat}`;
                }

                aiResult.innerHTML = `
                    <div style="text-align: center; margin-bottom: 10px;">
                        <span style="font-size: 24px;">${categoryInfo.split(' ')[0] || '🔍'}</span>
                    </div>
                    <div style="padding: 12px; background: #f5f5f5; border-radius: 8px; line-height: 1.6;">
                        ${finalReplyText.replace(/\n/g, '<br>')}
                    </div>
                `;

                // 顯示識別類別
                if (categoryInfo) {
                    aiResult.innerHTML += `
                        <div style="margin-top: 8px; font-size: 12px; color: #666; text-align: center;">
                            ${categoryInfo}
                        </div>
                    `;
                }
            } else {
                aiResult.innerHTML = '<span style="color:red">AI 回應為空，請再試一次</span>';
            }
        }

        // ------------------------------------------------
        // 6. 初始化 (Initialization)
        // ------------------------------------------------
        const initParams = new URLSearchParams(window.location.search);
        const hasShellLaunch = Boolean(initParams.get('questChainId') && initParams.get('mode'));
        resizeCanvas();
        initLanguageSelector();
        initSpeechChat();
        updateShellModeUi();
        if (!hasShellLaunch) {
            setMode('free');
        }
        renderHudSummary();
        renderBoardPanel();
        initMiniMap();
        startCamera();
        
        log('初始化完成');

    } catch (criticalErr) {
        console.error('致命錯誤:', criticalErr);
        log('FATAL: ' + criticalErr.message);
        alert('程式啟動失敗，請重新整理頁面: ' + criticalErr.message);
    }
});
