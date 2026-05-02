(function(global) {
    function createController(deps = {}) {
        const {
            runtimeState,
            boardAnimations,
            closeDockPanels = () => {},
            closePassiveNpcDialog = () => {},
            getBoardTileByIndex: getBoardTileByIndexDep = () => null,
            getBoardTileMeta = () => ({}),
            getLoginUser = () => null,
            inferBoardChallengeType = () => null,
            isCurrentQuestDemoMode = () => false,
            isCurrentQuestTutorialMode = () => false,
            loadPlayerHudStats = () => {},
            renderBoardPanel = () => {},
            renderGameShellEntries = () => {},
            renderHudSummary = () => {},
            showNpcDialog = () => Promise.resolve(),
            startTaskInteraction = () => Promise.resolve(),
            tutorialProgress,
            updateGameShellProgress = () => {},
            applyTaskSelection = () => {}
        } = deps;

        function get(key) {
            return runtimeState.get(key);
        }

        function set(key, value) {
            return runtimeState.set(key, value);
        }

        function getLoginStorageKey() {
            const user = getLoginUser();
            return user?.username || user?.email || user?.id || 'guest';
        }

        function getBoardRunStorageKey() {
            return `sandhill-board-run:${getLoginStorageKey()}:${get('currentQuestChainId') || 'none'}`;
        }

        function getBoardTileByIndex(tileIndex) {
            return getBoardTileByIndexDep(tileIndex);
        }

        function syncBoardMapQuery(boardMapId) {
            const url = new URL(global.location.href);
            if (boardMapId) url.searchParams.set('boardMapId', String(boardMapId));
            else url.searchParams.delete('boardMapId');
            global.history.replaceState({}, '', url);
        }

        function persistBoardRunState() {
            if (!get('currentBoardRun') || get('currentEntryMode') !== 'board_game' || get('useRemoteBoardSession')) return;
            localStorage.setItem(getBoardRunStorageKey(), JSON.stringify(get('currentBoardRun')));
        }

        function hydrateBoardRunStateLocally() {
            if (get('currentEntryMode') !== 'board_game' || !get('currentBoardMap')) return;
            let saved = null;
            try {
                saved = JSON.parse(localStorage.getItem(getBoardRunStorageKey()) || 'null');
            } catch (err) {
                saved = null;
            }

            const currentBoardMap = get('currentBoardMap');
            const startTile = Number(currentBoardMap.start_tile || 1);
            set('currentBoardRun', {
                currentTile: Number(saved?.currentTile || startTile),
                round: Number(saved?.round || 0),
                pendingRoll: saved?.pendingRoll ? Number(saved.pendingRoll) : null,
                pendingTargetTile: saved?.pendingTargetTile ? Number(saved.pendingTargetTile) : null,
                gainedPoints: Number(saved?.gainedPoints || 0)
            });
            persistBoardRunState();
            renderBoardPanel();
            renderHudSummary();
        }

        function updateBoardRunFromSession(session) {
            if (!session) return;
            set('currentBoardSessionId', session.id);
            const currentBoardMap = get('currentBoardMap');
            const lastResult = session.last_result || null;
            let lastResultText = '';
            if (lastResult?.phase === 'rolled') {
                lastResultText = lastResult.message || `剛擲出 ${lastResult.rollValue}，目標前往第 ${lastResult.targetTileIndex} 格。`;
            } else if (lastResult?.phase === 'resolved') {
                lastResultText = lastResult.message || (lastResult.success
                    ? `挑戰成功，已推進到第 ${lastResult.nextTile} 格。`
                    : `挑戰失敗，目前退回到第 ${lastResult.nextTile} 格。`);
            }
            set('currentBoardRun', {
                currentTile: Number(session.current_tile || currentBoardMap?.start_tile || 1),
                round: Number(session.round_count || 0),
                pendingRoll: session.pending_roll == null ? null : Number(session.pending_roll),
                pendingTargetTile: session.pending_target_tile == null ? null : Number(session.pending_target_tile),
                gainedPoints: Number(session.gained_points || 0),
                lastResultText
            });
            renderBoardPanel();
            renderHudSummary();
        }

        async function hydrateBoardRunState() {
            if (get('currentEntryMode') !== 'board_game' || !get('currentBoardMap')) return;
            const previewMode = new URLSearchParams(global.location.search).get('preview') === '1';
            if (!getLoginUser()) {
                set('useRemoteBoardSession', false);
                set('currentBoardSessionId', null);
                hydrateBoardRunStateLocally();
                return;
            }

            try {
                const res = await fetch('/api/board/session/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        questChainId: get('currentQuestChainId'),
                        boardMapId: get('currentBoardMap')?.id || null,
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
                set('useRemoteBoardSession', true);
                updateBoardRunFromSession(data.session);
            } catch (err) {
                console.warn('啟動遠端大富翁 session 失敗，改用本地暫存', err);
                set('useRemoteBoardSession', false);
                set('currentBoardSessionId', null);
                hydrateBoardRunStateLocally();
            }
        }

        function getResolvedBoardTargetTile(rollValue) {
            const currentBoardRun = get('currentBoardRun');
            const currentBoardMap = get('currentBoardMap');
            const currentBoardTiles = get('currentBoardTiles') || [];
            const start = Number(currentBoardRun?.currentTile || currentBoardMap?.start_tile || 1);
            const finishTile = Number(currentBoardMap?.finish_tile || currentBoardTiles.length || start);
            const exactFinishRequired = Boolean(currentBoardMap?.exact_finish_required);
            const desired = start + rollValue;
            if (!exactFinishRequired) return Math.min(desired, finishTile);
            return desired > finishTile ? start : desired;
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
            const currentBoardRun = get('currentBoardRun');
            if (get('currentEntryMode') !== 'board_game' || !currentBoardRun?.pendingTargetTile) return;
            const pendingTile = getBoardTileByIndex(currentBoardRun.pendingTargetTile);
            const tutorialLikeMode = isCurrentQuestTutorialMode() || isCurrentQuestDemoMode();
            const {
                speakerKey = success ? 'judge' : 'rescue',
                mood = success ? '通關判定' : '補救判定',
                text = null,
                autoCloseMs = 2200,
                skipDialog = false,
                bonusPoints = 0,
                advanceExtra = 0,
                buttonLabel = null,
                blocking = null
            } = options;

            if (get('useRemoteBoardSession') && get('currentBoardSessionId')) {
                const res = await fetch(`/api/board/session/${get('currentBoardSessionId')}/resolve`, {
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
                        autoCloseMs: tutorialLikeMode ? null : autoCloseMs,
                        buttonLabel: buttonLabel || (tutorialLikeMode ? '我知道了' : null),
                        blocking: typeof blocking === 'boolean' ? blocking : tutorialLikeMode
                    });
                }
                if (data.session.pending_target_tile == null) {
                    const focusTile = getBoardTileByIndex(data.session.current_tile);
                    if (focusTile) {
                        set('currentBoardActiveTileId', focusTile.id);
                        renderGameShellEntries(get('currentBoardTiles'), focusTile.id);
                        updateGameShellProgress(focusTile);
                    }
                }
                return;
            }

            if (success) {
                const currentBoardMap = get('currentBoardMap');
                const currentBoardTiles = get('currentBoardTiles') || [];
                const finishTile = Number(currentBoardMap?.finish_tile || currentBoardTiles.length || currentBoardRun.pendingTargetTile);
                const nextTile = Math.min(finishTile, Number(currentBoardRun.pendingTargetTile) + Number(advanceExtra || 0));
                currentBoardRun.currentTile = nextTile;
                const currentTask = get('currentTask');
                const turnPoints = Number(currentTask?.points || pendingTile?.effect_value || 0) + Number(bonusPoints || 0);
                currentBoardRun.gainedPoints += turnPoints;
                currentBoardRun.lastResultText = text || `「${pendingTile?.tile_name || '這一格'}」通過判定，已推進到第 ${currentBoardRun.currentTile} 格。${turnPoints > 0 ? ` 本回合獲得 ${turnPoints} 點旅程積分。` : ''}`;
            } else {
                const currentBoardMap = get('currentBoardMap');
                const failureMove = Number(currentBoardMap?.failure_move || -1);
                currentBoardRun.currentTile = Math.max(Number(currentBoardMap?.start_tile || 1), Number(currentBoardRun.currentTile || 1) + failureMove);
                currentBoardRun.lastResultText = text || `「${pendingTile?.tile_name || '這一格'}」未通過，依棋盤規則退回到第 ${currentBoardRun.currentTile} 格。`;
            }
            currentBoardRun.round = Number(currentBoardRun.round || 0) + 1;
            currentBoardRun.pendingRoll = null;
            currentBoardRun.pendingTargetTile = null;
            set('currentBoardRun', currentBoardRun);
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
                    autoCloseMs: tutorialLikeMode ? null : autoCloseMs,
                    buttonLabel: buttonLabel || (tutorialLikeMode ? '我知道了' : null),
                    blocking: typeof blocking === 'boolean' ? blocking : tutorialLikeMode
                });
            }
            const focusTile = getBoardTileByIndex(currentBoardRun.currentTile);
            if (focusTile) {
                set('currentBoardActiveTileId', focusTile.id);
                renderGameShellEntries(get('currentBoardTiles'), focusTile.id);
                updateGameShellProgress(focusTile);
            }
        }

        async function startBoardTurn() {
            const currentBoardRun = get('currentBoardRun');
            const currentBoardMap = get('currentBoardMap');
            if (get('currentEntryMode') !== 'board_game' || !currentBoardMap || currentBoardRun?.pendingTargetTile) return;
            closeDockPanels();
            closePassiveNpcDialog();
            if (get('useRemoteBoardSession') && get('currentBoardSessionId')) {
                const res = await fetch(`/api/board/session/${get('currentBoardSessionId')}/roll`, {
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
                        await boardAnimations.playDiceRollAnimation(data.session.pending_roll, focusTile);
                        await focusBoardTile(focusTile);
                    }
                }
                return;
            }

            const diceMin = Number(currentBoardMap.dice_min || 1);
            const diceMax = Number(currentBoardMap.dice_max || 6);
            const tutorialRoll = tutorialProgress?.getTutorialBoardRollValue(currentBoardRun?.round || 0);
            const rollValue = tutorialRoll && tutorialRoll >= diceMin && tutorialRoll <= diceMax
                ? tutorialRoll
                : (Math.floor(Math.random() * (diceMax - diceMin + 1)) + diceMin);
            const targetTileIndex = getResolvedBoardTargetTile(rollValue);
            const targetTile = getBoardTileByIndex(targetTileIndex);
            currentBoardRun.pendingRoll = rollValue;
            currentBoardRun.pendingTargetTile = targetTileIndex;
            currentBoardRun.lastResultText = `剛擲出 ${rollValue}，目標前往第 ${targetTileIndex} 格。`;
            set('currentBoardRun', currentBoardRun);
            persistBoardRunState();
            renderBoardPanel();
            if (targetTile) {
                await boardAnimations.playDiceRollAnimation(rollValue, targetTile);
                await focusBoardTile(targetTile);
            }
        }

        async function focusBoardTile(tile) {
            if (!tile) return;
            closeDockPanels();
            set('currentBoardActiveTileId', tile.id);
            renderGameShellEntries(get('currentBoardTiles'), tile.id);
            updateGameShellProgress(tile);
            const gameShellObjective = deps.getGameShellObjective ? deps.getGameShellObjective() : null;
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
                    const currentBoardRun = get('currentBoardRun');
                    const shouldAutoStartTutorialBoardTask = get('currentEntryMode') === 'board_game'
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
            const currentBoardRun = get('currentBoardRun');
            const isResolvingPendingEvent = get('currentEntryMode') === 'board_game'
                && currentBoardRun?.pendingTargetTile
                && Number(currentBoardRun.pendingTargetTile) === Number(tile.tile_index);
            if (isResolvingPendingEvent) {
                let boardEventOutcome = null;
                if (tileMeta.card_type) {
                    boardEventOutcome = await boardAnimations.playBoardDrawCardAnimation(tile);
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
                    autoCloseMs: 2600,
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

        return {
            completeBoardTurn,
            focusBoardTile,
            getResolvedBoardTargetTile,
            hydrateBoardRunState,
            hydrateBoardRunStateLocally,
            persistBoardRunState,
            showBoardTilePreview,
            startBoardTurn,
            syncBoardMapQuery,
            updateBoardRunFromSession
        };
    }

    global.AiLabBoardSession = {
        createController
    };
})(window);
