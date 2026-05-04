const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const staffHtml = fs.readFileSync(path.join(root, 'public/staff-dashboard.html'), 'utf8');
const staffJs = fs.readFileSync(path.join(root, 'public/js/staff-dashboard.js'), 'utf8');
const staffStateJs = fs.readFileSync(path.join(root, 'public/js/staff-dashboard/state.js'), 'utf8');
const staffFormUtilsJs = fs.readFileSync(path.join(root, 'public/js/staff-dashboard/form-utils.js'), 'utf8');
const staffTaskFormCopyJs = fs.readFileSync(path.join(root, 'public/js/staff-dashboard/task-form-copy.js'), 'utf8');
const staffNavigationJs = fs.readFileSync(path.join(root, 'public/js/staff-dashboard/navigation.js'), 'utf8');
const staffDrawerJs = fs.readFileSync(path.join(root, 'public/js/staff-dashboard/drawer-controller.js'), 'utf8');
const staffRoleContextJs = fs.readFileSync(path.join(root, 'public/js/staff-dashboard/role-context.js'), 'utf8');
const billingViewJs = fs.readFileSync(path.join(root, 'public/js/staff-dashboard/views/billing.js'), 'utf8');
const opsOverviewViewJs = fs.readFileSync(path.join(root, 'public/js/staff-dashboard/views/ops-overview.js'), 'utf8');
const formsViewJs = fs.readFileSync(path.join(root, 'public/js/staff-dashboard/views/forms.js'), 'utf8');
const dataServicesJs = fs.readFileSync(path.join(root, 'public/js/staff-dashboard/views/data-services.js'), 'utf8');
const aiLabHtml = fs.readFileSync(path.join(root, 'public/ai-lab.html'), 'utf8');
const aiLabJs = fs.readFileSync(path.join(root, 'public/js/ai-lab.js'), 'utf8');
const aiLabNetworkJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/network.js'), 'utf8');
const aiLabMediaJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/media.js'), 'utf8');
const aiLabRuntimeStateJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/runtime-state.js'), 'utf8');
const aiLabTaskRulesJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/task-rules.js'), 'utf8');
const aiLabBoardUtilsJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/board-utils.js'), 'utf8');
const aiLabBoardRendererJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/board-renderer.js'), 'utf8');
const aiLabBoardAnimationsJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/board-animations.js'), 'utf8');
const aiLabBoardSessionJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/board-session.js'), 'utf8');
const aiLabGeoJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/geo.js'), 'utf8');
const aiLabGeoWatchJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/geo-watch.js'), 'utf8');
const aiLabMiniMapUiJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/mini-map-ui.js'), 'utf8');
const aiLabNearbyTasksJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/nearby-tasks.js'), 'utf8');
const aiLabCameraCaptureJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/camera-capture.js'), 'utf8');
const aiLabPhotoCaptureUtilsJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/photo-capture-utils.js'), 'utf8');
const aiLabAnswerUiJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/answer-ui.js'), 'utf8');
const aiLabQueryUiJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/query-ui.js'), 'utf8');
const aiLabVoiceChatJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/voice-chat.js'), 'utf8');
const aiLabPhotoWorkflowJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/photo-workflow.js'), 'utf8');
const aiLabPromptsJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/prompts.js'), 'utf8');
const aiLabLanguageJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/language.js'), 'utf8');
const aiLabThinkingJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/thinking.js'), 'utf8');
const aiLabVisionClientJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/vision-client.js'), 'utf8');
const aiLabVisionQuestionJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/vision-question.js'), 'utf8');
const aiLabCameraManagerJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/camera-manager.js'), 'utf8');
const aiLabTaskMediaJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/task-media.js'), 'utf8');
const aiLabTaskSubmitJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/task-submit.js'), 'utf8');
const aiLabTaskFlowJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/task-flow.js'), 'utf8');
const aiLabStoryShellJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/story-shell.js'), 'utf8');
const aiLabEventBindingsJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/event-bindings.js'), 'utf8');
const aiLabAnalyzeFlowJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/analyze-flow.js'), 'utf8');
const aiLabPhotoShareJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/photo-share.js'), 'utf8');
const aiLabAssistantJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/assistant.js'), 'utf8');
const aiLabHudManagerJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/hud-manager.js'), 'utf8');
const aiLabTaskUtilsJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/task-utils.js'), 'utf8');
const aiLabQuestContextJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/quest-context.js'), 'utf8');
const aiLabTutorialProgressJs = fs.readFileSync(path.join(root, 'public/js/ai-lab/tutorial-progress.js'), 'utf8');

const syntaxCheckedFrontendFiles = [
  'public/js/ai-lab.js',
  'public/js/ai-lab/runtime-state.js',
  'public/js/ai-lab/query-ui.js',
  'public/js/ai-lab/voice-chat.js',
  'public/js/ai-lab/photo-workflow.js',
  'public/js/ai-lab/task-media.js',
  'public/js/ai-lab/board-animations.js',
  'public/js/ai-lab/board-session.js',
  'public/js/ai-lab/task-flow.js',
  'public/js/ai-lab/story-shell.js',
  'public/js/ai-lab/event-bindings.js',
  'public/js/ai-lab/analyze-flow.js',
  'public/js/ai-lab/photo-share.js',
  'public/js/ai-lab/assistant.js',
  'public/js/ai-lab/tutorial-progress.js',
  'public/js/ai-lab/language.js',
  'public/js/ai-lab/photo-capture-utils.js',
  'public/js/ai-lab/vision-question.js',
  'public/js/ai-lab/task-submit.js',
  'public/js/ai-lab/hud-manager.js',
  'public/js/ai-lab/geo-watch.js',
  'public/js/ai-lab/nearby-tasks.js',
  'public/js/staff-dashboard.js',
  'public/js/staff-dashboard/role-context.js',
  'public/js/staff-dashboard/task-form-copy.js',
  'public/js/staff-dashboard/views/ops-overview.js'
];

for (const relativePath of syntaxCheckedFrontendFiles) {
  execFileSync(process.execPath, ['--check', path.join(root, relativePath)], { stdio: 'pipe' });
}

const apiScriptIndex = staffHtml.indexOf('/js/shared/api.js');
const formatScriptIndex = staffHtml.indexOf('/js/shared/format.js');
const domScriptIndex = staffHtml.indexOf('/js/shared/dom.js');
const stateScriptIndex = staffHtml.indexOf('/js/staff-dashboard/state.js');
const formUtilsScriptIndex = staffHtml.indexOf('/js/staff-dashboard/form-utils.js');
const taskFormCopyScriptIndex = staffHtml.indexOf('/js/staff-dashboard/task-form-copy.js');
const navigationScriptIndex = staffHtml.indexOf('/js/staff-dashboard/navigation.js');
const drawerScriptIndex = staffHtml.indexOf('/js/staff-dashboard/drawer-controller.js');
const roleContextScriptIndex = staffHtml.indexOf('/js/staff-dashboard/role-context.js');
const billingScriptIndex = staffHtml.indexOf('/js/staff-dashboard/views/billing.js');
const opsOverviewScriptIndex = staffHtml.indexOf('/js/staff-dashboard/views/ops-overview.js');
const formsScriptIndex = staffHtml.indexOf('/js/staff-dashboard/views/forms.js');
const questChainsScriptIndex = staffHtml.indexOf('/js/staff-dashboard/views/quest-chains.js');
const initScriptIndex = staffHtml.indexOf('/js/staff-dashboard/views/init.js');
const dashboardScriptIndex = staffHtml.indexOf('/js/staff-dashboard.js');

assert.ok(apiScriptIndex > -1, 'staff dashboard must load shared api.js');
assert.ok(formatScriptIndex > -1, 'staff dashboard must load shared format.js');
assert.ok(domScriptIndex > -1, 'staff dashboard must load shared dom.js');
assert.ok(stateScriptIndex > -1, 'staff dashboard must load staff-dashboard/state.js');
assert.ok(formUtilsScriptIndex > -1, 'staff dashboard must load staff-dashboard/form-utils.js');
assert.ok(taskFormCopyScriptIndex > -1, 'staff dashboard must load staff-dashboard/task-form-copy.js');
assert.ok(navigationScriptIndex > -1, 'staff dashboard must load staff-dashboard/navigation.js');
assert.ok(drawerScriptIndex > -1, 'staff dashboard must load staff-dashboard/drawer-controller.js');
assert.ok(roleContextScriptIndex > -1, 'staff dashboard must load staff-dashboard/role-context.js');
assert.ok(billingScriptIndex > -1, 'staff dashboard must load staff-dashboard/views/billing.js');
assert.ok(opsOverviewScriptIndex > -1, 'staff dashboard must load staff-dashboard/views/ops-overview.js');
assert.ok(dashboardScriptIndex > -1, 'staff dashboard must load staff-dashboard.js');
assert.ok(apiScriptIndex < dashboardScriptIndex, 'shared api.js must load before staff-dashboard.js');
assert.ok(formatScriptIndex < dashboardScriptIndex, 'shared format.js must load before staff-dashboard.js');
assert.ok(domScriptIndex < dashboardScriptIndex, 'shared dom.js must load before staff-dashboard.js');
assert.ok(stateScriptIndex < dashboardScriptIndex, 'staff-dashboard/state.js must load before staff-dashboard.js');
assert.ok(formUtilsScriptIndex < dashboardScriptIndex, 'staff-dashboard/form-utils.js must load before staff-dashboard.js');
assert.ok(navigationScriptIndex < dashboardScriptIndex, 'staff-dashboard/navigation.js must load before staff-dashboard.js');
assert.ok(drawerScriptIndex < dashboardScriptIndex, 'staff-dashboard/drawer-controller.js must load before staff-dashboard.js');
assert.ok(roleContextScriptIndex > drawerScriptIndex, 'role-context.js must load after drawer-controller.js');
assert.ok(roleContextScriptIndex < dashboardScriptIndex, 'role-context.js must load before staff-dashboard.js shell');
assert.ok(dashboardScriptIndex < billingScriptIndex, 'staff-dashboard.js shell must load before views/billing.js (global apiJson/staffDrawer/switchView)');
assert.ok(formsScriptIndex > -1, 'staff dashboard must load views/forms.js');
assert.ok(questChainsScriptIndex > -1, 'staff dashboard must load views/quest-chains.js');
assert.ok(initScriptIndex > -1, 'staff dashboard must load views/init.js');
assert.ok(dashboardScriptIndex < formsScriptIndex, 'staff-dashboard.js must load before views/forms.js');
assert.ok(billingScriptIndex < opsOverviewScriptIndex, 'views/billing.js must load before views/ops-overview.js');
assert.ok(opsOverviewScriptIndex < formsScriptIndex, 'views/ops-overview.js must load before views/forms.js');
assert.ok(dashboardScriptIndex < questChainsScriptIndex, 'staff-dashboard.js must load before views/quest-chains.js');
assert.ok(dashboardScriptIndex < initScriptIndex, 'staff-dashboard.js must load before views/init.js');
assert.ok(stateScriptIndex < billingScriptIndex, 'staff-dashboard/state.js must load before billing view');
assert.ok(stateScriptIndex < formUtilsScriptIndex, 'staff-dashboard/state.js must load before form-utils.js');
assert.ok(formUtilsScriptIndex < navigationScriptIndex, 'staff-dashboard/form-utils.js must load before navigation.js');
assert.ok(formUtilsScriptIndex < taskFormCopyScriptIndex, 'staff-dashboard/form-utils.js must load before task-form-copy.js');
assert.ok(taskFormCopyScriptIndex < navigationScriptIndex, 'staff-dashboard/task-form-copy.js must load before navigation.js');
assert.ok(taskFormCopyScriptIndex < dashboardScriptIndex, 'staff-dashboard/task-form-copy.js must load before staff-dashboard.js shell');
assert.ok(taskFormCopyScriptIndex < formsScriptIndex, 'staff-dashboard/task-form-copy.js must load before views/forms.js');
assert.ok(navigationScriptIndex < drawerScriptIndex, 'staff-dashboard/navigation.js must load before drawer-controller.js');

assert.ok(staffJs.includes('window.SandhillApi.installStaffFetchPatch()'), 'staff dashboard must install shared staff fetch patch');
assert.ok(staffJs.includes('window.SandhillFormat'), 'staff dashboard must use shared format helpers');
assert.ok(staffJs.includes('window.SandhillDom'), 'staff dashboard must use shared DOM helpers');
assert.ok(staffJs.includes('window.StaffDashboardState.state'), 'staff dashboard must use shared state container');
assert.ok(staffJs.includes('window.StaffDashboardFormUtils'), 'staff dashboard must use extracted form utilities');
assert.ok(staffJs.includes('window.StaffDashboardNavigation'), 'staff dashboard must use extracted navigation controller');
assert.ok(staffJs.includes('window.StaffDashboardDrawer'), 'staff dashboard must use extracted drawer controller');
assert.ok(staffJs.includes('window.switchView = switchView'), 'staff-dashboard.js must expose switchView on window for view modules / hash routing');
assert.ok(staffJs.includes('window.selectInitialStaffView = selectInitialStaffView'), 'staff-dashboard.js must expose selectInitialStaffView on window');
assert.ok(!staffJs.includes('with (staffDashboardState)'), 'staff dashboard must not hide global handlers inside a with block');
assert.ok(staffStateJs.includes('Object.defineProperty(global, key'), 'state.js must expose state-backed globals for inline handlers');
assert.ok(staffFormUtilsJs.includes('global.StaffDashboardFormUtils'), 'form-utils.js must expose StaffDashboardFormUtils');
assert.ok(staffTaskFormCopyJs.includes('global.StaffDashboardTaskFormCopy'), 'task-form-copy.js must expose StaffDashboardTaskFormCopy');
assert.ok(staffTaskFormCopyJs.includes('getAiJudgePlaceholders'), 'task-form-copy.js must expose AI judge placeholder helpers per validation mode');
assert.ok(staffNavigationJs.includes('global.StaffDashboardNavigation'), 'navigation.js must expose StaffDashboardNavigation');
assert.ok(staffNavigationJs.includes("'view-ops-overview': 'overview'"), 'navigation.js must register ops overview hash route');
assert.ok(staffDrawerJs.includes('global.StaffDashboardDrawer'), 'drawer-controller.js must expose StaffDashboardDrawer');
assert.ok(staffRoleContextJs.includes('global.StaffDashboardRoleContext'), 'role-context.js must expose StaffDashboardRoleContext');
assert.ok(billingViewJs.includes('global.loadBillingDashboard = loadBillingDashboard'), 'billing view must expose loadBillingDashboard for inline handlers');
assert.ok(opsOverviewViewJs.includes('global.loadOpsOverview = loadOpsOverview'), 'ops-overview view must expose loadOpsOverview for shell lazyLoad');
assert.ok(
  opsOverviewViewJs.includes('/api/dashboard/ops-snapshot'),
  'ops-overview v2 must call aggregated dashboard ops-snapshot API'
);
assert.ok(staffJs.includes('loadOpsOverview'), 'staff-dashboard.js must pass loadOpsOverview in navigation lazyLoad');
assert.ok(
  formsViewJs.includes('const sdDrawer = window.StaffDashboardDrawer')
    && formsViewJs.includes('const sdFormUtils = window.StaffDashboardFormUtils'),
  'forms view must bind sdDrawer/sdFormUtils (names must not duplicate staff-dashboard.js const staffDrawer/staffFormUtils in shared global lexical scope)'
);
assert.ok(formsViewJs.includes('window.applyTaskValidationModeUi = applyTaskValidationModeUi'), 'forms.js must expose applyTaskValidationModeUi for wizard / drawer resync');
assert.ok(!formsViewJs.includes('const staffFormUtils ='), 'forms.js must not redeclare const staffFormUtils (conflicts with staff-dashboard.js in same page)');

const forbiddenStaffDefinitions = [
  'function apiJson(',
  'function withActorHeaders(',
  'function formatCurrency(',
  'function formatBytes(',
  'function formatTokenCount(',
  'function formatDateTime(',
  'function formatDayLabel(',
  'function showToast(',
  'function escHtml(',
  'function setInlineMessage(',
  'function parseLatLngPaste(',
  'const STAFF_DASH_HASH_BY_VIEW =',
  'function validateTaskWizardStep(',
  'function initializeTaskWizardDOM('
];

for (const forbidden of forbiddenStaffDefinitions) {
  assert.ok(!staffJs.includes(forbidden), `staff-dashboard.js must not redefine ${forbidden}`);
}

const forbiddenBillingDefinitions = [
  'function loadBillingDashboard(',
  'function renderBillingOverview(',
  'function renderBillingEntries(',
  'function renderBillingDailyCharts(',
  'function setBillingLoadingState('
];

for (const forbidden of forbiddenBillingDefinitions) {
  assert.ok(!staffJs.includes(forbidden), `staff-dashboard.js must not redefine billing view function ${forbidden}`);
}

const forbiddenStateDefinitions = [
  'let globalQuestChainsMap',
  'let globalShopsMap',
  'let globalEntryPlansMap',
  'let globalTaskRecords',
  'let currentQuestChainId',
  'let activeFormId'
];

for (const forbidden of forbiddenStateDefinitions) {
  assert.ok(!staffJs.includes(forbidden), `staff-dashboard.js must not redefine state variable ${forbidden}`);
}

const networkScriptIndex = aiLabHtml.indexOf('/js/ai-lab/network.js');
const mediaScriptIndex = aiLabHtml.indexOf('/js/ai-lab/media.js');
const runtimeStateScriptIndex = aiLabHtml.indexOf('/js/ai-lab/runtime-state.js');
const taskRulesScriptIndex = aiLabHtml.indexOf('/js/ai-lab/task-rules.js');
const boardUtilsScriptIndex = aiLabHtml.indexOf('/js/ai-lab/board-utils.js');
const boardRendererScriptIndex = aiLabHtml.indexOf('/js/ai-lab/board-renderer.js');
const boardAnimationsScriptIndex = aiLabHtml.indexOf('/js/ai-lab/board-animations.js');
const boardSessionScriptIndex = aiLabHtml.indexOf('/js/ai-lab/board-session.js');
const geoScriptIndex = aiLabHtml.indexOf('/js/ai-lab/geo.js');
const geoWatchScriptIndex = aiLabHtml.indexOf('/js/ai-lab/geo-watch.js');
const miniMapUiScriptIndex = aiLabHtml.indexOf('/js/ai-lab/mini-map-ui.js');
const nearbyTasksScriptIndex = aiLabHtml.indexOf('/js/ai-lab/nearby-tasks.js');
const cameraCaptureScriptIndex = aiLabHtml.indexOf('/js/ai-lab/camera-capture.js');
const photoCaptureUtilsScriptIndex = aiLabHtml.indexOf('/js/ai-lab/photo-capture-utils.js');
const answerUiScriptIndex = aiLabHtml.indexOf('/js/ai-lab/answer-ui.js');
const queryUiScriptIndex = aiLabHtml.indexOf('/js/ai-lab/query-ui.js');
const voiceChatScriptIndex = aiLabHtml.indexOf('/js/ai-lab/voice-chat.js');
const photoWorkflowScriptIndex = aiLabHtml.indexOf('/js/ai-lab/photo-workflow.js');
const promptsScriptIndex = aiLabHtml.indexOf('/js/ai-lab/prompts.js');
const languageScriptIndex = aiLabHtml.indexOf('/js/ai-lab/language.js');
const thinkingScriptIndex = aiLabHtml.indexOf('/js/ai-lab/thinking.js');
const visionClientScriptIndex = aiLabHtml.indexOf('/js/ai-lab/vision-client.js');
const visionQuestionScriptIndex = aiLabHtml.indexOf('/js/ai-lab/vision-question.js');
const cameraManagerScriptIndex = aiLabHtml.indexOf('/js/ai-lab/camera-manager.js');
const taskMediaScriptIndex = aiLabHtml.indexOf('/js/ai-lab/task-media.js');
const taskSubmitScriptIndex = aiLabHtml.indexOf('/js/ai-lab/task-submit.js');
const taskFlowScriptIndex = aiLabHtml.indexOf('/js/ai-lab/task-flow.js');
const storyShellScriptIndex = aiLabHtml.indexOf('/js/ai-lab/story-shell.js');
const eventBindingsScriptIndex = aiLabHtml.indexOf('/js/ai-lab/event-bindings.js');
const analyzeFlowScriptIndex = aiLabHtml.indexOf('/js/ai-lab/analyze-flow.js');
const photoShareScriptIndex = aiLabHtml.indexOf('/js/ai-lab/photo-share.js');
const assistantScriptIndex = aiLabHtml.indexOf('/js/ai-lab/assistant.js');
const hudManagerScriptIndex = aiLabHtml.indexOf('/js/ai-lab/hud-manager.js');
const taskUtilsScriptIndex = aiLabHtml.indexOf('/js/ai-lab/task-utils.js');
const questContextScriptIndex = aiLabHtml.indexOf('/js/ai-lab/quest-context.js');
const tutorialProgressScriptIndex = aiLabHtml.indexOf('/js/ai-lab/tutorial-progress.js');
const aiLabScriptIndex = aiLabHtml.indexOf('js/ai-lab.js');

assert.ok(networkScriptIndex > -1, 'ai-lab must load ai-lab/network.js');
assert.ok(mediaScriptIndex > -1, 'ai-lab must load ai-lab/media.js');
assert.ok(runtimeStateScriptIndex > -1, 'ai-lab must load ai-lab/runtime-state.js');
assert.ok(taskRulesScriptIndex > -1, 'ai-lab must load ai-lab/task-rules.js');
assert.ok(boardUtilsScriptIndex > -1, 'ai-lab must load ai-lab/board-utils.js');
assert.ok(boardRendererScriptIndex > -1, 'ai-lab must load ai-lab/board-renderer.js');
assert.ok(boardAnimationsScriptIndex > -1, 'ai-lab must load ai-lab/board-animations.js');
assert.ok(boardSessionScriptIndex > -1, 'ai-lab must load ai-lab/board-session.js');
assert.ok(geoScriptIndex > -1, 'ai-lab must load ai-lab/geo.js');
assert.ok(geoWatchScriptIndex > -1, 'ai-lab must load ai-lab/geo-watch.js');
assert.ok(miniMapUiScriptIndex > -1, 'ai-lab must load ai-lab/mini-map-ui.js');
assert.ok(nearbyTasksScriptIndex > -1, 'ai-lab must load ai-lab/nearby-tasks.js');
assert.ok(cameraCaptureScriptIndex > -1, 'ai-lab must load ai-lab/camera-capture.js');
assert.ok(photoCaptureUtilsScriptIndex > -1, 'ai-lab must load ai-lab/photo-capture-utils.js');
assert.ok(answerUiScriptIndex > -1, 'ai-lab must load ai-lab/answer-ui.js');
assert.ok(queryUiScriptIndex > -1, 'ai-lab must load ai-lab/query-ui.js');
assert.ok(voiceChatScriptIndex > -1, 'ai-lab must load ai-lab/voice-chat.js');
assert.ok(photoWorkflowScriptIndex > -1, 'ai-lab must load ai-lab/photo-workflow.js');
assert.ok(promptsScriptIndex > -1, 'ai-lab must load ai-lab/prompts.js');
assert.ok(languageScriptIndex > -1, 'ai-lab must load ai-lab/language.js');
assert.ok(thinkingScriptIndex > -1, 'ai-lab must load ai-lab/thinking.js');
assert.ok(visionClientScriptIndex > -1, 'ai-lab must load ai-lab/vision-client.js');
assert.ok(visionQuestionScriptIndex > -1, 'ai-lab must load ai-lab/vision-question.js');
assert.ok(cameraManagerScriptIndex > -1, 'ai-lab must load ai-lab/camera-manager.js');
assert.ok(aiLabHtml.indexOf('/js/ai-lab/legacy-plant-results.js') === -1, 'ai-lab.html must not load the deleted legacy-plant-results.js');
assert.ok(taskMediaScriptIndex > -1, 'ai-lab must load ai-lab/task-media.js');
assert.ok(taskSubmitScriptIndex > -1, 'ai-lab must load ai-lab/task-submit.js');
assert.ok(taskFlowScriptIndex > -1, 'ai-lab must load ai-lab/task-flow.js');
assert.ok(storyShellScriptIndex > -1, 'ai-lab must load ai-lab/story-shell.js');
assert.ok(eventBindingsScriptIndex > -1, 'ai-lab must load ai-lab/event-bindings.js');
assert.ok(analyzeFlowScriptIndex > -1, 'ai-lab must load ai-lab/analyze-flow.js');
assert.ok(photoShareScriptIndex > -1, 'ai-lab must load ai-lab/photo-share.js');
assert.ok(assistantScriptIndex > -1, 'ai-lab must load ai-lab/assistant.js (NPC dialog controller — prevents window.AiLabAssistant undefined regression)');
assert.ok(hudManagerScriptIndex > -1, 'ai-lab must load ai-lab/hud-manager.js');
assert.ok(taskUtilsScriptIndex > -1, 'ai-lab must load ai-lab/task-utils.js');
assert.ok(questContextScriptIndex > -1, 'ai-lab must load ai-lab/quest-context.js');
assert.ok(tutorialProgressScriptIndex > -1, 'ai-lab must load ai-lab/tutorial-progress.js');
assert.ok(aiLabScriptIndex > -1, 'ai-lab must load ai-lab.js');
assert.ok(networkScriptIndex < aiLabScriptIndex, 'ai-lab/network.js must load before ai-lab.js');
assert.ok(mediaScriptIndex < aiLabScriptIndex, 'ai-lab/media.js must load before ai-lab.js');
assert.ok(runtimeStateScriptIndex < aiLabScriptIndex, 'ai-lab/runtime-state.js must load before ai-lab.js');
assert.ok(mediaScriptIndex < runtimeStateScriptIndex, 'ai-lab/media.js must load before runtime-state.js');
assert.ok(taskRulesScriptIndex < aiLabScriptIndex, 'ai-lab/task-rules.js must load before ai-lab.js');
assert.ok(boardUtilsScriptIndex < aiLabScriptIndex, 'ai-lab/board-utils.js must load before ai-lab.js');
assert.ok(boardRendererScriptIndex < aiLabScriptIndex, 'ai-lab/board-renderer.js must load before ai-lab.js');
assert.ok(boardAnimationsScriptIndex < aiLabScriptIndex, 'ai-lab/board-animations.js must load before ai-lab.js');
assert.ok(geoScriptIndex < aiLabScriptIndex, 'ai-lab/geo.js must load before ai-lab.js');
assert.ok(geoWatchScriptIndex < aiLabScriptIndex, 'ai-lab/geo-watch.js must load before ai-lab.js');
assert.ok(geoScriptIndex < geoWatchScriptIndex, 'ai-lab/geo.js must load before geo-watch.js');
assert.ok(miniMapUiScriptIndex < aiLabScriptIndex, 'ai-lab/mini-map-ui.js must load before ai-lab.js');
assert.ok(nearbyTasksScriptIndex < aiLabScriptIndex, 'ai-lab/nearby-tasks.js must load before ai-lab.js');
assert.ok(runtimeStateScriptIndex < nearbyTasksScriptIndex, 'ai-lab/runtime-state.js must load before nearby-tasks.js');
assert.ok(miniMapUiScriptIndex < nearbyTasksScriptIndex, 'ai-lab/mini-map-ui.js must load before nearby-tasks.js');
assert.ok(cameraCaptureScriptIndex < aiLabScriptIndex, 'ai-lab/camera-capture.js must load before ai-lab.js');
assert.ok(photoCaptureUtilsScriptIndex < aiLabScriptIndex, 'ai-lab/photo-capture-utils.js must load before ai-lab.js');
assert.ok(answerUiScriptIndex < aiLabScriptIndex, 'ai-lab/answer-ui.js must load before ai-lab.js');
assert.ok(queryUiScriptIndex < aiLabScriptIndex, 'ai-lab/query-ui.js must load before ai-lab.js');
assert.ok(voiceChatScriptIndex < aiLabScriptIndex, 'ai-lab/voice-chat.js must load before ai-lab.js');
assert.ok(photoWorkflowScriptIndex < aiLabScriptIndex, 'ai-lab/photo-workflow.js must load before ai-lab.js');
assert.ok(promptsScriptIndex < aiLabScriptIndex, 'ai-lab/prompts.js must load before ai-lab.js');
assert.ok(languageScriptIndex < aiLabScriptIndex, 'ai-lab/language.js must load before ai-lab.js');
assert.ok(promptsScriptIndex < languageScriptIndex, 'ai-lab/prompts.js must load before language.js');
assert.ok(boardUtilsScriptIndex < boardRendererScriptIndex, 'ai-lab/board-utils.js must load before board-renderer.js');
assert.ok(boardUtilsScriptIndex < boardAnimationsScriptIndex, 'ai-lab/board-utils.js must load before board-animations.js');
assert.ok(boardAnimationsScriptIndex < boardSessionScriptIndex, 'ai-lab/board-animations.js must load before board-session.js');
assert.ok(boardSessionScriptIndex < aiLabScriptIndex, 'ai-lab/board-session.js must load before ai-lab.js');
assert.ok(thinkingScriptIndex < aiLabScriptIndex, 'ai-lab/thinking.js must load before ai-lab.js');
assert.ok(visionClientScriptIndex < aiLabScriptIndex, 'ai-lab/vision-client.js must load before ai-lab.js');
assert.ok(visionQuestionScriptIndex < aiLabScriptIndex, 'ai-lab/vision-question.js must load before ai-lab.js');
assert.ok(cameraManagerScriptIndex < aiLabScriptIndex, 'ai-lab/camera-manager.js must load before ai-lab.js');
assert.ok(taskMediaScriptIndex < aiLabScriptIndex, 'ai-lab/task-media.js must load before ai-lab.js');
assert.ok(taskSubmitScriptIndex < aiLabScriptIndex, 'ai-lab/task-submit.js must load before ai-lab.js');
assert.ok(taskSubmitScriptIndex < taskFlowScriptIndex, 'ai-lab/task-submit.js must load before task-flow.js');
assert.ok(taskFlowScriptIndex < aiLabScriptIndex, 'ai-lab/task-flow.js must load before ai-lab.js');
assert.ok(storyShellScriptIndex < aiLabScriptIndex, 'ai-lab/story-shell.js must load before ai-lab.js');
assert.ok(eventBindingsScriptIndex < aiLabScriptIndex, 'ai-lab/event-bindings.js must load before ai-lab.js');
assert.ok(analyzeFlowScriptIndex < aiLabScriptIndex, 'ai-lab/analyze-flow.js must load before ai-lab.js');
assert.ok(visionClientScriptIndex < analyzeFlowScriptIndex, 'ai-lab/vision-client.js must load before analyze-flow.js');
assert.ok(photoShareScriptIndex < aiLabScriptIndex, 'ai-lab/photo-share.js must load before ai-lab.js');
assert.ok(assistantScriptIndex < aiLabScriptIndex, 'ai-lab/assistant.js must load before ai-lab.js');
assert.ok(hudManagerScriptIndex < aiLabScriptIndex, 'ai-lab/hud-manager.js must load before ai-lab.js');
assert.ok(taskUtilsScriptIndex < aiLabScriptIndex, 'ai-lab/task-utils.js must load before ai-lab.js');
assert.ok(questContextScriptIndex < aiLabScriptIndex, 'ai-lab/quest-context.js must load before ai-lab.js');
assert.ok(tutorialProgressScriptIndex < aiLabScriptIndex, 'ai-lab/tutorial-progress.js must load before ai-lab.js');
assert.ok(questContextScriptIndex < tutorialProgressScriptIndex, 'ai-lab/quest-context.js must load before tutorial-progress.js');

assert.ok(aiLabNetworkJs.includes('global.AiLabNetwork'), 'network.js must expose AiLabNetwork');
assert.ok(aiLabMediaJs.includes('global.AiLabMedia'), 'media.js must expose AiLabMedia');
assert.ok(aiLabRuntimeStateJs.includes('AiLabRuntimeState'), 'runtime-state.js must expose AiLabRuntimeState');
assert.ok(aiLabTaskRulesJs.includes('global.AiLabTaskRules'), 'task-rules.js must expose AiLabTaskRules');
assert.ok(aiLabBoardUtilsJs.includes('global.AiLabBoardUtils'), 'board-utils.js must expose AiLabBoardUtils');
assert.ok(aiLabBoardRendererJs.includes('global.AiLabBoardRenderer'), 'board-renderer.js must expose AiLabBoardRenderer');
assert.ok(aiLabBoardAnimationsJs.includes('AiLabBoardAnimations'), 'board-animations.js must expose AiLabBoardAnimations');
assert.ok(aiLabBoardSessionJs.includes('AiLabBoardSession'), 'board-session.js must expose AiLabBoardSession');
assert.ok(aiLabBoardSessionJs.includes('createController'), 'board-session.js must expose a controller factory');
assert.ok(aiLabGeoJs.includes('global.AiLabGeo'), 'geo.js must expose AiLabGeo');
assert.ok(aiLabGeoWatchJs.includes('global.AiLabGeoWatch'), 'geo-watch.js must expose AiLabGeoWatch');
assert.ok(aiLabGeoWatchJs.includes('createController'), 'geo-watch.js must expose a controller factory');
assert.ok(aiLabMiniMapUiJs.includes('global.AiLabMiniMapUi'), 'mini-map-ui.js must expose AiLabMiniMapUi');
assert.ok(aiLabNearbyTasksJs.includes('AiLabNearbyTasks'), 'nearby-tasks.js must expose AiLabNearbyTasks');
assert.ok(aiLabNearbyTasksJs.includes('createController'), 'nearby-tasks.js must expose a controller factory');
assert.ok(aiLabCameraCaptureJs.includes('global.AiLabCameraCapture'), 'camera-capture.js must expose AiLabCameraCapture');
assert.ok(aiLabPhotoCaptureUtilsJs.includes('AiLabPhotoCaptureUtils'), 'photo-capture-utils.js must expose AiLabPhotoCaptureUtils');
assert.ok(aiLabAnswerUiJs.includes('global.AiLabAnswerUi'), 'answer-ui.js must expose AiLabAnswerUi');
assert.ok(aiLabQueryUiJs.includes('AiLabQueryUi'), 'query-ui.js must expose AiLabQueryUi');
assert.ok(aiLabVoiceChatJs.includes('AiLabVoiceChat'), 'voice-chat.js must expose AiLabVoiceChat');
assert.ok(aiLabPhotoWorkflowJs.includes('AiLabPhotoWorkflow'), 'photo-workflow.js must expose AiLabPhotoWorkflow');
assert.ok(aiLabPromptsJs.includes('global.AiLabPrompts'), 'prompts.js must expose AiLabPrompts');
assert.ok(aiLabLanguageJs.includes('AiLabLanguage'), 'language.js must expose AiLabLanguage');
assert.ok(aiLabThinkingJs.includes('global.AiLabThinking'), 'thinking.js must expose AiLabThinking');
assert.ok(aiLabVisionClientJs.includes('global.AiLabVisionClient'), 'vision-client.js must expose AiLabVisionClient');
assert.ok(aiLabVisionQuestionJs.includes('AiLabVisionQuestion'), 'vision-question.js must expose AiLabVisionQuestion');
assert.ok(aiLabCameraManagerJs.includes('AiLabCameraManager'), 'camera-manager.js must expose AiLabCameraManager');
assert.ok(aiLabTaskMediaJs.includes('AiLabTaskMedia'), 'task-media.js must expose AiLabTaskMedia');
assert.ok(aiLabTaskSubmitJs.includes('AiLabTaskSubmit'), 'task-submit.js must expose AiLabTaskSubmit');
assert.ok(aiLabTaskFlowJs.includes('AiLabTaskFlow'), 'task-flow.js must expose AiLabTaskFlow');
assert.ok(aiLabTaskFlowJs.includes('createController'), 'task-flow.js must expose a controller factory');
assert.ok(aiLabStoryShellJs.includes('AiLabStoryShell'), 'story-shell.js must expose AiLabStoryShell');
assert.ok(aiLabStoryShellJs.includes('createController'), 'story-shell.js must expose a controller factory');
assert.ok(aiLabEventBindingsJs.includes('AiLabEventBindings'), 'event-bindings.js must expose AiLabEventBindings');
assert.ok(aiLabEventBindingsJs.includes('createController'), 'event-bindings.js must expose a controller factory');
assert.ok(aiLabAnalyzeFlowJs.includes('AiLabAnalyzeFlow'), 'analyze-flow.js must expose AiLabAnalyzeFlow');
assert.ok(aiLabAnalyzeFlowJs.includes('createController'), 'analyze-flow.js must expose a controller factory');
assert.ok(aiLabPhotoShareJs.includes('AiLabPhotoShare'), 'photo-share.js must expose AiLabPhotoShare');
assert.ok(aiLabPhotoShareJs.includes('handleCaptureClick'), 'photo-share.js must expose handleCaptureClick');
assert.ok(aiLabAssistantJs.includes('AiLabAssistant'), 'assistant.js must expose AiLabAssistant');
assert.ok(aiLabAssistantJs.includes('createController'), 'assistant.js must expose a controller factory');
assert.ok(aiLabJs.includes('window.AiLabAssistant.createController'), 'ai-lab.js must wire AiLabAssistant via createController (not the legacy window.SandhillAssistant.init surface)');
assert.ok(!aiLabJs.includes('window.SandhillAssistant'), 'ai-lab.js must not reference window.SandhillAssistant (legacy latent ReferenceError — use AiLabAssistant controller)');
assert.ok(aiLabTaskSubmitJs.includes('function submitPhotoAnswer('), 'task-submit.js must split submitTaskAnswer into submitPhotoAnswer sub-flow');
assert.ok(aiLabTaskSubmitJs.includes('function submitChoiceAnswer('), 'task-submit.js must split submitTaskAnswer into submitChoiceAnswer sub-flow');
assert.ok(aiLabTaskSubmitJs.includes('function submitTextAnswer('), 'task-submit.js must split submitTaskAnswer into submitTextAnswer sub-flow');
assert.ok(aiLabTaskSubmitJs.includes('function submitAiPhotoAnswer('), 'task-submit.js must expose submitAiPhotoAnswer sub-flow');
assert.ok(aiLabTaskSubmitJs.includes('function uploadAttachedPhoto('), 'task-submit.js must expose uploadAttachedPhoto sub-flow');
assert.ok(aiLabTaskSubmitJs.includes('function dispatchAnswerViaApi('), 'task-submit.js must expose dispatchAnswerViaApi shared helper');
assert.ok(aiLabTaskSubmitJs.includes('function handleChoiceTutorialPassThrough('), 'task-submit.js must expose handleChoiceTutorialPassThrough shared helper');
assert.ok(aiLabTaskSubmitJs.includes('function handleGenericTutorialPassThrough('), 'task-submit.js must expose handleGenericTutorialPassThrough shared helper');
assert.ok(aiLabTaskSubmitJs.includes('function triggerShakeError('), 'task-submit.js must consolidate shake-error into a helper');
const forbiddenTaskSubmitBareRefs = [
  '\n            setAnswerChoicePendingState(',
  '\n            lockMsg.textContent ='
];
for (const token of forbiddenTaskSubmitBareRefs) {
  assert.ok(!aiLabTaskSubmitJs.includes(token), `task-submit.js must not reference closure-free variable "${token.trim()}" (use ctx.* instead)`);
}
assert.ok(aiLabEventBindingsJs.includes('AiLabPhotoShare.handleCaptureClick'), 'event-bindings.js must delegate captureBtn to AiLabPhotoShare.handleCaptureClick');
const forbiddenEventBindingsShareTokens = [
  "navigator.share({ files: [file]",
  "'ai-lab-${Date.now()}'",
  "'image/jpeg'",
  "win.document.write(`<img src=",
  "style=\"width:100%\""
];
for (const token of forbiddenEventBindingsShareTokens) {
  assert.ok(!aiLabEventBindingsJs.includes(token), `event-bindings.js must not inline photo-share token "${token}" (must delegate to AiLabPhotoShare)`);
}
assert.ok(aiLabHudManagerJs.includes('AiLabHudManager'), 'hud-manager.js must expose AiLabHudManager');
assert.ok(aiLabTaskUtilsJs.includes('SandhillAiLabTaskUtils'), 'task-utils.js must expose SandhillAiLabTaskUtils');
assert.ok(aiLabQuestContextJs.includes('AiLabQuestContext'), 'quest-context.js must expose AiLabQuestContext');
assert.ok(aiLabTutorialProgressJs.includes('AiLabTutorialProgress'), 'tutorial-progress.js must expose AiLabTutorialProgress');
assert.ok(aiLabJs.includes('window.AiLabNetwork'), 'ai-lab.js must use extracted network client');
assert.ok(aiLabJs.includes('window.AiLabMedia'), 'ai-lab.js must use extracted media helpers');
assert.ok(aiLabJs.includes('window.AiLabRuntimeState'), 'ai-lab.js must use extracted runtime state');
assert.ok(aiLabJs.includes('window.AiLabTaskRules'), 'ai-lab.js must use extracted task rules');
assert.ok(aiLabJs.includes('window.AiLabBoardUtils'), 'ai-lab.js must use extracted board utils');
assert.ok(aiLabJs.includes('window.AiLabBoardRenderer'), 'ai-lab.js must use extracted board renderer');
assert.ok(aiLabJs.includes('window.AiLabBoardAnimations'), 'ai-lab.js must use extracted board animations controller');
assert.ok(aiLabJs.includes('window.AiLabBoardSession.createController'), 'ai-lab.js must use extracted board session controller');
assert.ok(aiLabJs.includes('window.AiLabGeo'), 'ai-lab.js must use extracted geo helpers');
assert.ok(aiLabJs.includes('window.AiLabMiniMapUi'), 'ai-lab.js must use extracted mini-map UI helpers');
assert.ok(aiLabJs.includes('window.AiLabNearbyTasks.createController'), 'ai-lab.js must use extracted nearby-tasks controller');
assert.ok(aiLabJs.includes('window.AiLabCameraCapture'), 'ai-lab.js must use extracted camera capture helpers');
assert.ok(aiLabJs.includes('window.AiLabPhotoCaptureUtils'), 'ai-lab.js must use extracted photo capture utilities');
assert.ok(aiLabJs.includes('window.AiLabAnswerUi'), 'ai-lab.js must use extracted answer UI helpers');
assert.ok(aiLabJs.includes('window.AiLabVoiceChat'), 'ai-lab.js must use extracted voice chat controller');
assert.ok(aiLabJs.includes('window.AiLabPhotoWorkflow'), 'ai-lab.js must use extracted photo workflow controller');
assert.ok(aiLabJs.includes('window.AiLabPrompts'), 'ai-lab.js must use extracted prompts');
assert.ok(aiLabJs.includes('window.AiLabLanguage'), 'ai-lab.js must use extracted language controller');
assert.ok(aiLabJs.includes('window.AiLabThinking.createThinkingController'), 'ai-lab.js must use extracted thinking controller');
assert.ok(aiLabJs.includes('window.AiLabVisionClient'), 'ai-lab.js must use extracted vision client');
assert.ok(aiLabJs.includes('window.AiLabVisionQuestion'), 'ai-lab.js must use extracted vision question client');
assert.ok(aiLabJs.includes('window.AiLabTaskMedia'), 'ai-lab.js must use extracted task media controller');
assert.ok(aiLabJs.includes('window.AiLabTaskFlow.createController'), 'ai-lab.js must use extracted task flow controller');
assert.ok(aiLabJs.includes('window.AiLabStoryShell.createController'), 'ai-lab.js must use extracted story shell controller');
assert.ok(aiLabJs.includes('window.AiLabEventBindings.createController'), 'ai-lab.js must use extracted event bindings controller');
assert.ok(aiLabJs.includes('window.AiLabAnalyzeFlow.createController'), 'ai-lab.js must use extracted analyze flow controller');
assert.ok(aiLabJs.includes('window.AiLabTutorialProgress'), 'ai-lab.js must use extracted tutorial progress controller');
assert.ok(aiLabJs.includes('window.AiLabGeoWatch.createController'), 'ai-lab.js must use extracted geo-watch controller');
assert.ok(aiLabEventBindingsJs.includes('geoWatch.attachOrientationListeners'), 'event-bindings.js must register orientation listeners through the geo-watch controller');

const forbiddenAiLabDefinitions = [
  'const AI_THINKING_STAGES',
  'function startThinkingAnimation(',
  'function setThinkingStage(',
  'function stopThinkingAnimation(',
  'function updateLoadingMessage(',
  'function combinePhotosToGrid(',
  'function analyzePhotos(',
  'function showHighConfidenceResult(',
  'function showMediumConfidenceResult(',
  'function showLowConfidenceResult(',
  'function showNonPlantResult(',
  'function buildFriendlyNetworkError(',
  'function requestJson(',
  'function parseYouTubeStartSeconds(',
  'function toYouTubeEmbedUrl(',
  'function setYouTubeFrameSource(',
  'function pauseYouTubeFrame(',
  'function getTaskVideoUrl(',
  'function taskUsesGps(',
  'function getRequiredShots(',
  'function getBoardTileMeta(',
  'function inferBoardChallengeType(',
  'function getCircledStepLabel(',
  'function haversineDistance(',
  'function calculateBearing(',
  'function playCameraFeedback(',
  'function captureFullFrameDataUrl(',
  'function normalizeChoiceOption(',
  'function buildBoardTilePreviewDialog(',
  'function getCurrentQuestRules(',
  'function getCurrentExperienceMode(',
  'function isCurrentQuestDemoMode(',
  'function isCurrentQuestTutorialMode(',
  'function isTutorialGuestMode(',
  'function getTutorialMockDistance(',
  'function getTutorialMockBearing(',
  'function updateVoicePanel(',
  'function setVoiceButtonsRecordingState(',
  'async function sendVoiceChat(',
  'function addPhotoToCollection(',
  'function updatePhotoStrip(',
  'function updatePreviewArea(',
  'function showResultPanel()',
  'function retry()',
  'function startDraw(',
  'function moveDraw(',
  'function endDraw(',
  'function loadTaskBGM(',
  'function loadTaskVideo(',
  'function pauseTaskMedia(',
  'function bindTaskVideoStatus(',
  'function handleTaskIntroVideoEnded(',
  'async function playDiceRollAnimation(',
  'function hideBoardCardOverlay(',
  'async function playBoardDrawCardAnimation(',
  'function getTutorialBoardRollValue(',
  'function isTutorialGuestStoryMode(',
  'function getTutorialGuestProgressKey(',
  'function getTutorialGuestState(',
  'function saveTutorialGuestState(',
  'function completeTutorialGuestTask(',
  'async function completeTutorialLoggedInTask(',
  'function getActiveScript(',
  'function applyScript(',
  'function getLanguageInstruction(',
  'function getSpeechLocale(',
  'function initLanguageSelector(',
  'function captureSelectionDataUrlFromRect(',
  'function captureCurrentReticleDataUrl(',
  'function processSelectionFromRect(',
  'async function analyzeVisionQuestion(',
  'async function ensureOrientationPermission(',
  'function refreshTaskNavigationFromCache(',
  'function handleOrientationEvent(',
  'function updateTaskNavigationUI(',
  'function tryAutoPlayTaskBgm(',
  'function startTaskNavigation(',
  'function isIndependentVisibleTask(',
  'function normalizeVisibleTasks(',
  'async function fetchInProgressTasks(',
  'async function getQuickCurrentPosition(',
  'function pickNearestTask(',
  'async function fetchQuestProgressMap(',
  'function getVisibleQuestTasks(',
  'async function loadNearbyVisibleTasks(',
  'function renderNearbyTaskMarkers(',
  'function applyTaskSelection(',
  'async function selectTaskForAiLab(',
  'async function loadDefaultVisibleTaskForUser(',
  'function updateMiniMapTaskIndicators(',
  'function getLoginStorageKey(',
  'function getBoardRunStorageKey(',
  'function syncBoardMapQuery(',
  'function persistBoardRunState(',
  'function hydrateBoardRunStateLocally(',
  'function updateBoardRunFromSession(',
  'async function hydrateBoardRunState(',
  'function getResolvedBoardTargetTile(',
  'function showBoardTilePreview(',
  'async function completeBoardTurn(',
  'async function startBoardTurn(',
  'async function focusBoardTile(',
  'const playDiceRollAnimation =',
  'async function createCurrentUserTaskRecord(',
  'async function fetchCurrentUserTaskId(',
  'function createTutorialFallbackCapture(',
  'function refreshAnswerPhotoFromReticle(',
  'function applyAnswerSubmitLoadingState(',
  'function showAnswerModal(',
  'function buildSubmitContext(',
  'async function enterPhotoCaptureFlow(',
  'function reopenTaskFromCaptureMode(',
  'async function startTaskInteraction(',
  'async function focusStoryTask(',
  'async function loadStoryShell(',
  'async function loadBoardShell(',
  'async function loadGameShellFromUrl(',
  'async function startTutorialHelper(',
  'async function handleTaskPhotoShutter(',
  'async function handleReticleCaptureAction(',
  "showQueryTransit('照片問題已摺成紙飛機送出...')",
  'const imageToSend = await combinePhotosToGrid(capturedPhotos)',
  "const result = await analyzePhotos(imageToSend, finalSystemPrompt, finalUserPrompt, gpsData)",
  "playQueryReturnAnimation('AI 紙飛機帶回了答案')",
  "playQueryReturnAnimation('紙飛機帶回了錯誤訊息')"
];

for (const forbidden of forbiddenAiLabDefinitions) {
  assert.ok(!aiLabJs.includes(forbidden), `ai-lab.js must not redefine extracted module function ${forbidden}`);
}

assert.ok(!aiLabJs.includes('const PROMPTS = {'), 'ai-lab.js must not inline LM prompt definitions');

const forbiddenAiLabGeoStateLines = [
  'let navigationWatchId = ',
  'let navigationPollTimer = ',
  'let deviceHeading = ',
  'let lastHeadingUpdateAt = ',
  'let orientationPermissionState = ',
  'let lastTaskDistance = ',
  'let lastTaskBearing = ',
  'let taskObjectVisible = ',
  'let bgmAutoStarted = ',
  'let taskReached = '
];

for (const forbidden of forbiddenAiLabGeoStateLines) {
  assert.ok(!aiLabJs.includes(forbidden), `ai-lab.js must not redeclare geo-watch state ${forbidden.trim()}`);
}

const forbiddenAiLabRuntimeStateLines = [
  'let isDrawing = ',
  'let points = ',
  'let selectionMode = ',
  'let cameraCaptureMode = ',
  'let reticleCenter = ',
  'let reticleRadius = ',
  'let tapStart = ',
  'let currentMode = ',
  'let mapInstance = ',
  'let mapMarker = ',
  'let taskMapMarker = ',
  'let nearbyTaskLayer = ',
  'let nearbyVisibleTasks = ',
  'let lastLocationText = ',
  'let lastLatLng = ',
  'let currentTask = ',
  'let currentTaskId = ',
  'let currentUserTaskId = ',
  'let currentQuestChainId = ',
  'let currentQuestChainData = ',
  'let currentEntryMode = ',
  'let currentStoryTasks = ',
  'let currentStoryCompleted = ',
  'let currentStoryCompletedTaskIds = ',
  'let currentBoardMaps = ',
  'let currentBoardTiles = ',
  'let currentBoardMap = ',
  'let currentBoardActiveTileId = ',
  'let isShellExperience = ',
  'let playerHudStats = ',
  'let currentBoardRun = ',
  'let currentBoardSessionId = ',
  'let useRemoteBoardSession = ',
  'let photoCaptureModeActive = ',
  'let currentAnswerPhotoDataUrl = ',
  'let pendingPhotoDataUrl = ',
  'let shutterBusy = ',
  'let tutorialBoardPhotoCaptureArmed = ',
  'let pendingStoryReloadAfterCompletion = ',
  'let currentNpcDialogResolver = ',
  'let currentNpcDialogAutoCloseTimer = ',
  'let lastStoryDialogueKey = ',
  'let formalStoryIntroMode = ',
  'let tutorialFlowStarted = ',
  'let tutorialIntroTaskId = ',
  'let targetLat = ',
  'let targetLng = '
];

for (const forbidden of forbiddenAiLabRuntimeStateLines) {
  assert.ok(!aiLabJs.includes(forbidden), `ai-lab.js must not redeclare runtime state ${forbidden.trim()}`);
}

assert.ok(
  !/window\.addEventListener\(['"]deviceorientation['"]/.test(aiLabJs),
  'ai-lab.js must register deviceorientation through AiLabGeoWatch.attachOrientationListeners()'
);

const forbiddenLegacyPlantTokens = [
  'AiLabLegacyPlantResults',
  'showQuickFeatures',
  'showHighConfidenceResult',
  'showMediumConfidenceResult',
  'showLowConfidenceResult',
  'showNonPlantResult',
  'plant_rag',
  'need_more_photos',
  'needMorePhotosSession',
  'CONFIDENCE_HIGH',
  'CONFIDENCE_MEDIUM'
];

for (const token of forbiddenLegacyPlantTokens) {
  assert.ok(!aiLabJs.includes(token), `ai-lab.js must not reference removed plant/RAG token "${token}"`);
}

assert.ok(
  !fs.existsSync(path.join(root, 'public/js/ai-lab/legacy-plant-results.js')),
  'public/js/ai-lab/legacy-plant-results.js must remain deleted (legacy plant/RAG isolation layer is removed)'
);

const aiVisionRoute = fs.readFileSync(path.join(root, 'src/routes/ai.routes.js'), 'utf8');
assert.ok(
  aiVisionRoute.includes('skip_rag: true'),
  '/api/vision-test must keep returning skip_rag:true so the LM-only client path stays valid'
);

const aiLabIdleNoise = [
  'let thinkingInterval',
  'let stageMessageIndex',
  'AI_THINKING_STAGES'
];
for (const stale of aiLabIdleNoise) {
  assert.ok(!aiLabJs.includes(stale), `ai-lab.js must not keep stale thinking-animation residue "${stale}"`);
}

assert.ok(!aiLabMiniMapUiJs.includes('renderTaskIndicators'), 'mini-map-ui.js must not export the unused renderTaskIndicators helper');

const aiLabHudManagerSrc = fs.readFileSync(path.join(root, 'public/js/ai-lab/hud-manager.js'), 'utf8');
const forbiddenStorySummaryRefs = [
  'isStorySummaryShowing',
  'renderStorySummaryPageContent',
  'storySummaryPage'
];
for (const token of forbiddenStorySummaryRefs) {
  assert.ok(!aiLabHudManagerSrc.includes(token), `hud-manager.js must not destructure removed legacy token "${token}"`);
  assert.ok(!aiLabJs.includes(token), `ai-lab.js must not pass removed legacy token "${token}" through buildHudContext()`);
}

// === Round 2 cleanup: dead/broken DOM refs and zero-call wrappers ===
const removedAiLabDomIds = [
  "getElementById('boardPanelStatus')",
  "getElementById('boardPanelMeta')",
  "getElementById('rollDiceBtn')",
  "getElementById('cameraFlash')",
  "getElementById('photoStrip')",
  "getElementById('zoomValue')"
];
for (const token of removedAiLabDomIds) {
  assert.ok(!aiLabJs.includes(token), `ai-lab.js must not look up removed/dead DOM id (${token})`);
}

const removedAiLabHtmlIds = [
  'id="boardPanelStatus"',
  'id="boardPanelMeta"',
  'id="rollDiceBtn"'
];
for (const token of removedAiLabHtmlIds) {
  assert.ok(!aiLabHtml.includes(token), `ai-lab.html must not declare removed DOM id ${token}`);
}

const removedAiLabWrappers = [
  'function setQueryTransitText(',
  'function closeVoicePanel(',
  'function isCompactViewport(',
  'function shouldSuppressCameraAlert(',
  'function setSelectionMode(',
  'const setTaskVideoErrorState =',
  'const hideBoardCardOverlay =',
  'const getTutorialGuestProgressKey =',
  'const saveTutorialGuestState =',
  'const stopTaskNavigation =',
  'const updateTaskNavigationUI =',
  'const handleOrientationEvent =',
  'const getCurrentQuestRules =',
  'const getCurrentExperienceMode =',
  'const captureSelectionDataUrlFromRect =',
  'const getPos =',
  'const processSelection =',
  'const updatePhotoStrip ='
];
for (const token of removedAiLabWrappers) {
  assert.ok(!aiLabJs.includes(token), `ai-lab.js must not reintroduce removed dead wrapper "${token}"`);
}

// answer modal duplication: showAnswerModal must delegate to AiLabAnswerUi.renderAnswerModal
assert.ok(
  aiLabTaskFlowJs.includes('renderAnswerModal({') || aiLabTaskFlowJs.includes('renderAnswerModal({\n'),
  'task-flow.js showAnswerModal must delegate to AiLabAnswerUi.renderAnswerModal'
);
assert.ok(
  !aiLabJs.includes("group.innerHTML = '<label>📸 上傳照片</label>"),
  'ai-lab.js must not inline the photo-upload form HTML duplicated from answer-ui.js'
);
assert.ok(
  !aiLabJs.includes("group.innerHTML = '<label>✍️ 請輸入答案</label>"),
  'ai-lab.js must not inline the keyword-answer form HTML duplicated from answer-ui.js'
);

// real bug fixes: required functions must be called with the right shape
assert.ok(
  aiLabTaskFlowJs.includes('initLockWheels(lockElements.lockWheels,'),
  'task-flow.js must call initLockWheels with the lockWheels element as the first argument'
);
assert.ok(
  aiLabEventBindingsJs.includes("getRequiredShots(get('currentTask'))"),
  'event-bindings.js must pass currentTask to getRequiredShots so multi-shot capture works'
);
assert.ok(
  aiLabTaskFlowJs.includes('applyAnswerSubmitLoadingState') && aiLabTaskFlowJs.includes('idleLabel: ANSWER_SUBMIT_LABEL_IDLE'),
  'task-flow.js must wrap setAnswerSubmitLoadingState with the structured options the helper expects'
);
assert.ok(
  aiLabEventBindingsJs.includes("elements.answerToastClose.addEventListener('click', () => hideAnswerToast())"),
  'event-bindings.js must wire the answer toast close button to hideAnswerToast()'
);

// board-renderer must drop the dead exports we removed
const aiLabBoardRendererSrc = fs.readFileSync(path.join(root, 'public/js/ai-lab/board-renderer.js'), 'utf8');
assert.ok(
  !aiLabBoardRendererSrc.includes('buildBoardTilePreviewDialog'),
  'board-renderer.js must not export the unused buildBoardTilePreviewDialog helper'
);
assert.ok(
  !/global\.AiLabBoardRenderer\s*=\s*\{[^}]*renderBoardMiniMap/s.test(aiLabBoardRendererSrc),
  'board-renderer.js must not export renderBoardMiniMap (only used internally)'
);

// the broken `renderBoardPanel()` zero-arg calls must now go through a context wrapper
assert.ok(
  aiLabJs.includes('buildBoardRendererContext') && aiLabJs.includes('AiLabBoardRenderer.renderBoardPanel(buildBoardRendererContext()'),
  'ai-lab.js must invoke renderBoardPanel through a context wrapper so the dock board panel actually renders'
);

// === Round 3 cleanup: dead typeof checks, single-call wrapper inlining, broken API calls ===

// All same-closure `typeof X === 'function'` defensive checks were dead code (X always exists);
// only one is allowed: the `getLockCode` defensive check, because it lives behind a defensive
// destructure of `window.AiLabAnswerUi || {}` and is genuinely possibly undefined at boot.
const aiLabTypeofMatches = aiLabJs.match(/typeof\s+\w+\s*===\s*['\"]function['\"]/g) || [];
assert.ok(
  aiLabTypeofMatches.length <= 1,
  `ai-lab.js still has dead "typeof X === 'function'" guards (found ${aiLabTypeofMatches.length}); same-closure functions are always defined.`
);

// task-submit must not regress to defensive typeof checks now that ai-lab.js passes real refs
const aiLabTaskSubmitSrc = fs.readFileSync(path.join(root, 'public/js/ai-lab/task-submit.js'), 'utf8');
assert.ok(
  !/typeof\s+(showQueryTransit|hideQueryTransit)\s*===\s*['\"]function['\"]/.test(aiLabTaskSubmitSrc),
  'task-submit.js must not gate showQueryTransit / hideQueryTransit behind typeof checks (they are always passed in)'
);

// dataUrlToBlob must live inside task-submit.js (its only consumer) and no longer be passed via ctx
assert.ok(
  /async\s+function\s+dataUrlToBlob\s*\(/.test(aiLabTaskSubmitSrc),
  'task-submit.js must own dataUrlToBlob locally instead of receiving it through ctx'
);
assert.ok(
  !aiLabJs.includes('async function dataUrlToBlob'),
  'ai-lab.js must not redeclare dataUrlToBlob (moved into task-submit.js)'
);
assert.ok(
  !/buildSubmitContext[\s\S]*?dataUrlToBlob/.test(aiLabJs),
  'ai-lab.js buildSubmitContext must not pass dataUrlToBlob through ctx anymore'
);

// removed single-call wrappers must not come back
const removedRound3Wrappers = [
  'const handleTaskIntroVideoEnded =',
  'const loadTaskBGM =',
  'const loadTaskVideo =',
  'const pauseTaskMedia =',
  'const playBoardDrawCardAnimation =',
  'const getTutorialBoardRollValue =',
  'const isTutorialGuestStoryMode =',
  'const getTutorialGuestState =',
  'const startTaskNavigation =',
  'const tryAutoPlayTaskBgm =',
  'const applyScript =',
  'const initLanguageSelector =',
  'const addPhotoToCollection =',
  'const updatePreviewArea =',
  'const showResultPanel =',
  'function initSpeechChat(',
  'function initMiniMapToggle(',
  'function buildTaskChoiceOptions'
];
for (const token of removedRound3Wrappers) {
  assert.ok(!aiLabJs.includes(token), `ai-lab.js must not reintroduce removed single-call wrapper "${token}"`);
}

// zoom feature was orphaned UI: panel HTML existed but JS never wired the buttons.
const removedZoomTokens = [
  "getElementById('zoomControl')",
  "getElementById('dockZoomBtn')",
  "getElementById('dockZoomPanel')",
  "querySelectorAll('.zoom-btn')",
  "toggleDockPanel('zoom')"
];
for (const token of removedZoomTokens) {
  assert.ok(!aiLabJs.includes(token), `ai-lab.js must not look up the removed zoom UI (${token})`);
}
const removedZoomHtml = [
  'id="zoomControl"',
  'id="dockZoomBtn"',
  'id="dockZoomPanel"',
  'class="zoom-btn"'
];
for (const token of removedZoomHtml) {
  assert.ok(!aiLabHtml.includes(token), `ai-lab.html must not declare the removed zoom UI (${token})`);
}

// real bug fixes round 3: captureFullFrameDataUrl must always receive the video element
const captureCalls = `${aiLabJs}\n${aiLabEventBindingsJs}`.match(/captureFullFrameDataUrl\(([^)]*)\)/g) || [];
for (const call of captureCalls) {
  assert.ok(
    /captureFullFrameDataUrl\(\s*(video|elements\.video)\s*[,)]/.test(call),
    `frontend must always pass the video element to captureFullFrameDataUrl (got: ${call})`
  );
}

// playCameraFeedback must receive shutterBtn / reticleCaptureHotspot, otherwise the shutter
// flash never plays on the buttons (the original call was zero-arg and silently no-op'd).
assert.ok(
  /playCameraFeedback\(\s*\{[^}]*shutterBtn[^}]*reticleCaptureHotspot[^}]*\}\s*\)/.test(aiLabEventBindingsJs),
  'event-bindings.js must call playCameraFeedback({ shutterBtn, reticleCaptureHotspot }) so the shutter feedback actually fires'
);

// renderTaskDebug had a latent ReferenceError on `missionMode` (variable was never declared).
// The debug log must no longer reference missionMode.
assert.ok(
  !/missionMode/.test(aiLabJs),
  'ai-lab.js must not reference the never-declared missionMode (latent ReferenceError when ?debug=1)'
);

const cssModules = [
  'css/ai-lab/core.css',
  'css/ai-lab/camera.css',
  'css/ai-lab/hud.css',
  'css/ai-lab/board.css',
  'css/ai-lab/tasks.css',
  'css/ai-lab/mini-map.css',
  'css/ai-lab/assistant.css',
  'css/ai-lab/voice.css',
  'css/ai-lab/result.css',
  'css/ai-lab/director.css',
  'css/ai-lab/animations.css',
  'css/ai-lab/responsive.css'
];

for (const css of cssModules) {
  assert.ok(aiLabHtml.includes(css), `ai-lab.html must load modular CSS: ${css}`);
}

assert.ok(!aiLabHtml.includes('href="css/ai-lab.css'), 'ai-lab.html must not load the monolithic ai-lab.css anymore');

console.log('Phase 3 frontend verification passed');
