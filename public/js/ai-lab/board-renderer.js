(function(global) {
    function getBoardModeTag(tile, { getBoardTileMeta, inferBoardChallengeType } = {}) {
        const tileTaskType = inferBoardChallengeType(tile);
        if (tile?.task_id) {
            if (tileTaskType === 'multiple_choice') return '問題關卡';
            if (tileTaskType === 'keyword') return '文字關卡';
            if (tileTaskType === 'number') return '數字關卡';
            return '挑戰關卡';
        }
        const meta = getBoardTileMeta(tile);
        if (meta.card_type === 'chance') return '機會關卡';
        if (meta.card_type === 'fate') return '命運關卡';
        return '事件關卡';
    }

    function getPendingBoardModeText(tile, inferBoardChallengeType) {
        const pendingTaskType = inferBoardChallengeType(tile);
        if (pendingTaskType === 'multiple_choice') return '這是一題選擇題，任選答案都會先放行。';
        if (pendingTaskType === 'keyword') return '這是一題文字輸入，任意輸入內容都能先通關。';
        if (pendingTaskType === 'number') return '這是一題數字解鎖，任意密碼都會先放行。';
        return '這是一題拍照挑戰，會直接用黃色圓框拍照作答。';
    }

    function renderBoardMapSelector({
        boardMapSelector,
        boardMapSelectorStatus,
        currentEntryMode,
        currentBoardMaps = [],
        currentBoardMap
    } = {}) {
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

    function renderBoardMiniMap({
        boardMiniMap,
        boardMiniMapDots,
        currentEntryMode,
        currentBoardTiles = [],
        currentBoardRun
    } = {}) {
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

    function renderBoardPanel({
        elements = {},
        currentEntryMode,
        currentBoardMap,
        currentBoardMaps = [],
        currentBoardTiles = [],
        currentBoardRun,
        pendingTile,
        tutorialBoardMode,
        deps = {}
    } = {}) {
        const {
            boardPanelAction,
            boardPanelTrack,
            floatingDiceBtn,
            boardFocusBtn,
            boardMapSelector,
            boardMapSelectorStatus,
            boardMiniMap,
            boardMiniMapDots
        } = elements;
        const { getBoardTileMeta, inferBoardChallengeType, getCircledStepLabel } = deps;

        renderBoardMapSelector({
            boardMapSelector,
            boardMapSelectorStatus,
            currentEntryMode,
            currentBoardMaps,
            currentBoardMap
        });

        if (currentEntryMode !== 'board_game') {
            if (boardPanelAction) boardPanelAction.textContent = '請先從首頁選擇大富翁活動。';
            if (boardPanelTrack) boardPanelTrack.innerHTML = '<div class="board-track-chip muted">請先進入大富翁模式。</div>';
            if (floatingDiceBtn) floatingDiceBtn.classList.add('hidden');
            if (boardFocusBtn) boardFocusBtn.disabled = true;
            return;
        }

        if (boardPanelAction) {
            if (pendingTile) {
                const pendingModeText = getPendingBoardModeText(pendingTile, inferBoardChallengeType);
                boardPanelAction.textContent = pendingTile.task_id
                    ? `你剛擲出 ${currentBoardRun.pendingRoll}，本回合目標是第 ${pendingTile.tile_index} 格「${pendingTile.tile_name}」。${pendingModeText}`
                    : `你剛擲出 ${currentBoardRun.pendingRoll}，本回合目標是第 ${pendingTile.tile_index} 格「${pendingTile.tile_name}」。事件觸發後會自動結算這一步。`;
            } else {
                boardPanelAction.textContent = '按下「擲骰前進」開始本回合，系統會把你帶到對應格子的焦點內容。';
            }
        }

        if (boardPanelTrack) {
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
                if (Number(tile.tile_index) === Number(currentBoardMap?.start_tile || 1)) cls += ' start';
                if (Number(tile.tile_index) === Number(currentBoardMap?.finish_tile || currentBoardTiles.length || 1)) cls += ' finish';
                const modeTag = getBoardModeTag(tile, { getBoardTileMeta, inferBoardChallengeType });
                const stepLabel = tutorialBoardMode ? getCircledStepLabel(tile.tile_index) : String(tile.tile_index);
                return `<button type="button" class="${cls}" data-tile-index="${tile.tile_index}" aria-label="${prefix} ${tile.tile_name || '未命名格子'} ${modeTag}">
                    <span class="tile-name">${tile.tile_name || '未命名格子'}</span>
                    <span class="tile-index">${stepLabel}</span>
                    <span class="tile-meta">${modeTag}</span>
                </button>`;
            }).join('');
        }

        if (floatingDiceBtn) {
            const finishTile = Number(currentBoardMap?.finish_tile || currentBoardTiles.length || 1);
            const isFinished = Number(currentBoardRun?.currentTile) === finishTile;
            if (isFinished) floatingDiceBtn.classList.add('hidden');
            else floatingDiceBtn.classList.toggle('hidden', Boolean(currentBoardRun?.pendingTargetTile) || currentEntryMode !== 'board_game');
        }
        if (boardFocusBtn) boardFocusBtn.disabled = !currentBoardRun?.pendingTargetTile;

        renderBoardMiniMap({ boardMiniMap, boardMiniMapDots, currentEntryMode, currentBoardTiles, currentBoardRun });
    }

    function updateGameShellProgress({
        gameShellProgress,
        currentEntryMode,
        currentStoryTasks = [],
        currentStoryCompleted,
        currentBoardTiles = [],
        currentBoardMap,
        activeEntry
    } = {}) {
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

    function renderGameShellEntries({ gameShellEntries, entries = [], activeId = null, completedStoryIds = new Set() } = {}) {
        if (!gameShellEntries) return;
        if (!entries.length) {
            gameShellEntries.innerHTML = '<div class="game-shell-entry muted">目前沒有可顯示的內容。</div>';
            return;
        }
        gameShellEntries.innerHTML = entries.map((entry) => {
            const isActive = String(activeId) === String(entry.id);
            const isCompletedStoryEntry = !entry.tile_index && completedStoryIds.has(Number(entry.id));
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

    global.AiLabBoardRenderer = {
        renderBoardMapSelector,
        renderBoardPanel,
        updateGameShellProgress,
        renderGameShellEntries
    };
})(window);
