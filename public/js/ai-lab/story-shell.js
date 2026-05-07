(function(global) {
    function createController(deps = {}) {
        const {
            runtimeState,
            elements = {},
            applyTaskSelection = () => {},
            buildStoryIntroDialogue = () => '',
            fetchQuestProgressMap = async () => ({}),
            focusBoardTile = () => Promise.resolve(),
            getBoardTileByIndex = () => null,
            getStoryIntroSpeaker = () => 'guide',
            hydrateBoardRunState = () => Promise.resolve(),
            isCurrentQuestDemoMode = () => false,
            isCurrentQuestTutorialMode = () => false,
            loadPlayerHudStats = () => {},
            renderBoardMapSelector = () => {},
            renderGameShellEntries = () => {},
            renderHudSummary = () => {},
            renderTutorialModeUi = () => {},
            setFormalStoryIntroMode = () => {},
            showNpcDialog = () => Promise.resolve(),
            syncBoardMapQuery = () => {},
            tutorialProgress,
            updateGameShellProgress = () => {},
            updateShellModeUi = () => {}
        } = deps;

        function get(key) {
            return runtimeState.get(key);
        }

        function set(key, value) {
            return runtimeState.set(key, value);
        }

        async function focusStoryTask(task) {
            if (!task) return;
            renderGameShellEntries(get('currentStoryTasks'), task.id);
            updateGameShellProgress(task);
            applyTaskSelection(task, { updateUrl: false, skipNearbyReload: true });
            renderHudSummary();
            if (isCurrentQuestTutorialMode() && !get('tutorialFlowStarted')) {
                return;
            }
            const dialogueKey = `${get('currentQuestChainId') || 'quest'}:${task.id}:${get('currentStoryCompleted') ? 'done' : 'active'}`;
            if (get('lastStoryDialogueKey') !== dialogueKey) {
                set('lastStoryDialogueKey', dialogueKey);
                await showNpcDialog({
                    speakerKey: get('currentStoryCompleted') ? 'host' : getStoryIntroSpeaker(task),
                    mood: get('currentStoryCompleted') ? '劇情完結' : `第 ${task.quest_order || '?'} 關`,
                    text: get('currentStoryCompleted')
                        ? '這條劇情主線已經完整收束。你可以留在探索艙回味剛才的旅程，或回首頁切換其他玩法。'
                        : buildStoryIntroDialogue(task)
                });
            }
        }

        async function loadStoryShell(questChainId, previewMode = false) {
            Swal.fire({
                title: '正在載入劇情內容...',
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            try {
                const contentParams = new URLSearchParams();
                if (previewMode) contentParams.set('preview', '1');
                const contentApi = `/api/quest-chains/${questChainId}/public-content${contentParams.toString() ? `?${contentParams.toString()}` : ''}`;
                const contentRes = await fetch(contentApi, { credentials: 'include' });
                let progressMap = {};
                try {
                    progressMap = await Promise.resolve(fetchQuestProgressMap());
                    if (!progressMap || typeof progressMap !== 'object') progressMap = {};
                } catch (progErr) {
                    console.warn('取得劇情進度略過', progErr);
                    progressMap = {};
                }
                let contentData;
                try {
                    contentData = await contentRes.json();
                } catch (jsonErr) {
                    throw new Error(`劇情 API 回傳無法解析（HTTP ${contentRes.status}）`);
                }
                if (!contentRes.ok || !contentData.success) {
                    const code = contentData && contentData.code;
                    const base = (contentData && contentData.message) || `載入劇情失敗（HTTP ${contentRes.status}）`;
                    if (code === 'ENTRY_NOT_PUBLISHED') {
                        throw new Error(`${base}\n\n請確認後台「玩法入口」已勾選發布；預覽未發布入口請用後台預覽連結並帶 preview=1。`);
                    }
                    if (code === 'COUPON_REQUIRED') {
                        throw new Error(base);
                    }
                    throw new Error(base);
                }
                const currentStoryTasks = Array.isArray(contentData.tasks) ? contentData.tasks : [];
                set('currentQuestChainId', questChainId);
                set('currentQuestChainData', contentData.questChain || null);
                set('currentEntryMode', 'story_campaign');
                set('currentStoryTasks', currentStoryTasks);
                set('currentStoryCompleted', false);
                set('currentStoryCompletedTaskIds', new Set());
                set('lastStoryDialogueKey', null);
                set('tutorialFlowStarted', false);
                set('tutorialIntroTaskId', null);
                set('isShellExperience', true);
                updateShellModeUi();
                setFormalStoryIntroMode(true);
                loadPlayerHudStats();

                const tutorialGuestState = tutorialProgress?.isTutorialGuestStoryMode()
                    ? tutorialProgress.getTutorialGuestState(questChainId)
                    : null;
                if (tutorialGuestState) {
                    set('currentStoryCompletedTaskIds', new Set(tutorialGuestState.completedTaskIds || []));
                }
                const progressOrder = tutorialGuestState
                    ? Number(tutorialGuestState.currentOrder || 1)
                    : Number(progressMap?.[String(questChainId)]);
                const maxStoryOrder = currentStoryTasks.reduce((max, task) => Math.max(max, Number(task.quest_order || 0)), 0);
                const currentStoryCompleted = tutorialGuestState
                    ? Boolean(tutorialGuestState.completed)
                    : (Number.isFinite(progressOrder) && progressOrder > maxStoryOrder && maxStoryOrder > 0);
                set('currentStoryCompleted', currentStoryCompleted);
                if (!tutorialGuestState) {
                    const completed = new Set();
                    const cutoff = currentStoryCompleted
                        ? Number.MAX_SAFE_INTEGER
                        : (Number.isFinite(progressOrder) ? progressOrder : 1);
                    currentStoryTasks.forEach((task) => {
                        const order = Number(task?.quest_order || 0);
                        if (order > 0 && order < cutoff) completed.add(Number(task.id));
                    });
                    set('currentStoryCompletedTaskIds', completed);
                }
                const activeTask = currentStoryCompleted
                    ? currentStoryTasks.find(task => Number(task.quest_order) === maxStoryOrder) || currentStoryTasks[currentStoryTasks.length - 1] || null
                    : ((Number.isFinite(progressOrder) && progressOrder > 0)
                        ? currentStoryTasks.find(task => Number(task.quest_order) === progressOrder) || currentStoryTasks[0]
                        : currentStoryTasks[0]);

                if (elements.gameShellMode) elements.gameShellMode.textContent = isCurrentQuestTutorialMode() ? '教學模式' : (isCurrentQuestDemoMode() ? '劇情體驗' : '劇情主線');
                if (elements.gameShellTitle) elements.gameShellTitle.textContent = contentData.questChain.title || contentData.questChain.name || '劇情主線';
                if (elements.gameShellSummary) elements.gameShellSummary.textContent = contentData.questChain.short_description || contentData.questChain.description || '跟著劇情節奏完成一連串 AI 關卡。';
                updateGameShellProgress(activeTask);
                renderGameShellEntries(currentStoryTasks, activeTask?.id);
                Swal.close();
                if (!currentStoryTasks.length) {
                    await Swal.fire({
                        icon: 'warning',
                        title: '此入口尚無可玩關卡',
                        text: '玩法入口已載入，但查無「已啟用」的關卡。請到後台確認各關是否已建立並啟用。',
                        confirmButtonText: '知道了'
                    });
                }
                if (activeTask) {
                    await focusStoryTask(activeTask);
                    if (get('currentStoryCompleted') && elements.gameShellObjective) {
                        elements.gameShellObjective.textContent = '這條劇情主線已完成，現在可以回首頁切換其他劇情，或直接進入大富翁模式。';
                    }
                }
            } catch (err) {
                Swal.close();
                throw err;
            }
        }

        async function loadBoardShell(questChainId, preferredBoardMapId = null, previewMode = false) {
            Swal.fire({
                title: '正在載入棋盤內容...',
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
                set('currentQuestChainId', questChainId);
                set('currentQuestChainData', boardData.questChain || null);
                set('currentEntryMode', 'board_game');
                set('currentStoryCompleted', false);
                set('currentBoardMaps', Array.isArray(boardData.boardMaps) ? boardData.boardMaps : []);
                set('currentBoardMap', boardData.boardMap || null);
                set('currentBoardTiles', Array.isArray(boardData.tiles) ? boardData.tiles : []);
                set('isShellExperience', true);
                set('formalStoryIntroMode', false);
                set('tutorialFlowStarted', false);
                set('tutorialIntroTaskId', null);
                updateShellModeUi();
                renderTutorialModeUi();
                loadPlayerHudStats();
                await hydrateBoardRunState();
                syncBoardMapQuery(get('currentBoardMap')?.id || null);
                renderBoardMapSelector();
                const currentBoardRun = get('currentBoardRun');
                const currentBoardTiles = get('currentBoardTiles') || [];
                const activeTile = currentBoardRun?.pendingTargetTile
                    ? getBoardTileByIndex(currentBoardRun.pendingTargetTile)
                    : getBoardTileByIndex(currentBoardRun?.currentTile)
                        || currentBoardTiles.find(tile => tile.task_id)
                        || currentBoardTiles[0]
                        || null;

                if (elements.gameShellMode) elements.gameShellMode.textContent = '大富翁模式';
                if (elements.gameShellTitle) elements.gameShellTitle.textContent = get('currentBoardMap')?.name || '濱海大富翁';
                if (elements.gameShellSummary) elements.gameShellSummary.textContent = get('currentBoardMap')?.description || '擲骰、前進、觸發事件，讓史蛋、巴布與鯨老陪你一起闖關。';
                updateGameShellProgress(activeTile);
                renderGameShellEntries(currentBoardTiles, activeTile?.id);
                Swal.close();
                if (activeTile) {
                    await focusBoardTile(activeTile);
                }
            } catch (err) {
                Swal.close();
                throw err;
            }
        }

        function showFirstDicePrompt() {
            if (localStorage.getItem('monopoly_first_dice_prompt_shown')) return;
            const diceBtn = document.getElementById('gameShellStartBtn');
            if (!diceBtn) return;
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

        async function loadGameShellFromUrl() {
            const params = new URLSearchParams(global.location.search);
            const questChainId = params.get('questChainId');
            let mode = params.get('mode');
            const boardMapId = params.get('boardMapId');
            const previewMode = params.get('preview') === '1';
            if (!questChainId) return false;
            mode = mode ? String(mode).trim().toLowerCase() : '';
            if (!mode) mode = 'story_campaign';
            if (mode === 'story' || mode === 'campaign' || mode === 'story-campaign') mode = 'story_campaign';
            if (mode === 'board' || mode === 'monopoly') mode = 'board_game';

            if (elements.gameShellPanel && mode === 'board_game') elements.gameShellPanel.classList.remove('collapsed');
            try {
                if (mode === 'board_game') {
                    await loadBoardShell(questChainId, boardMapId, previewMode);
                    showFirstDicePrompt();
                } else {
                    await loadStoryShell(questChainId, previewMode);
                }

                if (isCurrentQuestTutorialMode()) {
                    Swal.fire({
                        icon: 'info',
                        title: '權限提示',
                        text: '教學模式建議開啟相機和定位權限，體驗會更完整。',
                        confirmButtonText: '我知道了'
                    });
                }

                if (isCurrentQuestTutorialMode() || isCurrentQuestDemoMode()) {
                    startTutorialHelper();
                }

                return true;
            } catch (err) {
                console.error('載入遊戲殼失敗', err);
                set('isShellExperience', false);
                updateShellModeUi();
                if (elements.gameShellObjective) elements.gameShellObjective.textContent = '玩法內容載入失敗，請返回首頁重新選擇。';
                if (elements.gameShellProgress) elements.gameShellProgress.textContent = '目前無法取得進度';
                if (elements.gameShellEntries) elements.gameShellEntries.innerHTML = '<div class="game-shell-entry muted">暫時無法載入玩法內容。</div>';
                if (String(err?.message || '').includes('Coupon')) {
                    Swal.fire({
                        icon: 'warning',
                        title: '需要專屬 Coupon',
                        text: err.message || '此入口需專屬 Coupon 才能遊玩。',
                        confirmButtonText: '我知道了'
                    });
                } else if (err?.message) {
                    Swal.fire({
                        icon: 'error',
                        title: '無法載入玩法',
                        text: String(err.message),
                        confirmButtonText: '確定'
                    });
                }
                return false;
            }
        }

        async function startTutorialHelper() {
            if (localStorage.getItem('tutorial_helper_shown')) return;
            localStorage.setItem('tutorial_helper_shown', 'true');
            const steps = [
                { title: '歡迎來到沙丘', text: '這是一個結合 AI 與實境的探索遊戲。讓我來為你介紹畫面上的功能吧！', icon: 'info' },
                { title: '任務面板', text: '畫面左上角的面板會顯示你當前的任務目標與進度。', icon: 'info' },
                { title: '迷你地圖', text: '右下角的迷你地圖可以幫助你確認目前的位置與接下來的路線。', icon: 'info' },
                { title: '功能選單', text: '點擊右側的功能按鈕，可以展開更多選項，例如切換視角、查看背包等。', icon: 'info' },
                { title: '語音助理', text: '如果遇到困難，可以點擊右下角的麥克風按鈕呼叫 AI 助理。', icon: 'info' },
                { title: '準備出發', text: '現在，請點擊下方的「開始遊戲」或「擲骰」按鈕，開始你的冒險吧！', icon: 'success' }
            ];
            for (let i = 0; i < steps.length; i += 1) {
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

        return {
            focusStoryTask,
            loadBoardShell,
            loadGameShellFromUrl,
            loadStoryShell,
            startTutorialHelper
        };
    }

    global.AiLabStoryShell = {
        createController
    };
})(window);
