
window.AiLabHudManager = (function() {
    let ctx = {};
    let lastAutoOpenedTaskVideoTaskId = null;

    function init(config) {
        ctx = { ...ctx, ...config };
    }

        function isCompactViewport() {
        const {
            featureDockMenu, featureDrawerPanel, taskStatusBox, voicePanel, answerToast,
            hudModeValue, hudStageValue, hudPointsValue, hudBadgesValue, boardStatusCard,
            boardHudRound, boardHudTile, boardHudSession, boardHudResult, hudPanelSummary,
            hudPanelNext, hudPanelRescue, hudPanelStages, hudPanelBadges, gameShellStartBtn,
            taskIntroTitle, taskIntroCover, taskIntroDescription, taskIntroBtn, taskTargetImg,
            gameShellObjective, taskIntroPanel, taskIntroVideo,
            currentEntryMode, currentTask, currentBoardRun, playerHudStats, currentStoryCompleted,
            currentStoryTasks, useRemoteBoardSession, currentBoardSessionId, getBoardTileByIndex,
            currentBoardMap, photoCaptureModeActive, resetPhotoCaptureState, loadTaskVideo,
            tryAutoPlayTaskBgm, getTaskVideoUrl, exitFormalStoryIntroMode,
            isCurrentQuestTutorialMode, isCurrentQuestDemoMode, taskUsesGps, deviceHeading,
            lastHeadingUpdateAt, getTutorialMockBearing, getTutorialMockDistance, lastLatLng,
            taskHudDock, taskBearingValue, taskDistanceValue, taskAngleValue, taskCoordsValue, taskStatusLabel
        } = ctx;

            return window.matchMedia('(max-width: 768px)').matches;
        }

        function syncCompactUxState() {
        const {
            featureDockMenu, featureDrawerPanel, taskStatusBox, voicePanel, answerToast,
            hudModeValue, hudStageValue, hudPointsValue, hudBadgesValue, boardStatusCard,
            boardHudRound, boardHudTile, boardHudSession, boardHudResult, hudPanelSummary,
            hudPanelNext, hudPanelRescue, hudPanelStages, hudPanelBadges, gameShellStartBtn,
            taskIntroTitle, taskIntroCover, taskIntroDescription, taskIntroBtn, taskTargetImg,
            gameShellObjective, taskIntroPanel, taskIntroVideo,
            currentEntryMode, currentTask, currentBoardRun, playerHudStats, currentStoryCompleted,
            currentStoryTasks, useRemoteBoardSession, currentBoardSessionId, getBoardTileByIndex,
            currentBoardMap, photoCaptureModeActive, resetPhotoCaptureState, loadTaskVideo,
            tryAutoPlayTaskBgm, getTaskVideoUrl, exitFormalStoryIntroMode,
            isCurrentQuestTutorialMode, isCurrentQuestDemoMode, taskUsesGps, deviceHeading,
            lastHeadingUpdateAt, getTutorialMockBearing, getTutorialMockDistance, lastLatLng,
            taskHudDock, taskBearingValue, taskDistanceValue, taskAngleValue, taskCoordsValue, taskStatusLabel
        } = ctx;

            const compact = isCompactViewport();
            document.body.classList.toggle('compact-ux', compact);

            const dockMenuOpen = Boolean(featureDockMenu && !featureDockMenu.classList.contains('hidden'));
            const drawerOpen = Boolean(featureDrawerPanel && !featureDrawerPanel.classList.contains('hidden'));
            const taskHudOpen = Boolean(taskStatusBox && !taskStatusBox.classList.contains('hidden'));
            const voiceOpen = Boolean(voicePanel && !voicePanel.classList.contains('hidden'));
            const toastOpen = Boolean(answerToast && !answerToast.classList.contains('hidden'));

            document.body.classList.toggle('ux-dock-menu-open', compact && dockMenuOpen);
            document.body.classList.toggle('ux-drawer-open', compact && drawerOpen);
            document.body.classList.toggle('ux-taskhud-open', compact && taskHudOpen);
            document.body.classList.toggle('ux-voice-open', compact && voiceOpen);
            document.body.classList.toggle('ux-toast-open', compact && toastOpen);
        }

        function renderHudSummary() {
        const {
            featureDockMenu, featureDrawerPanel, taskStatusBox, voicePanel, answerToast,
            hudModeValue, hudStageValue, hudPointsValue, hudBadgesValue, boardStatusCard,
            boardHudRound, boardHudTile, boardHudSession, boardHudResult, hudPanelSummary,
            hudPanelNext, hudPanelRescue, hudPanelStages, hudPanelBadges, gameShellStartBtn,
            taskIntroTitle, taskIntroCover, taskIntroDescription, taskIntroBtn, taskTargetImg,
            gameShellObjective, taskIntroPanel, taskIntroVideo,
            currentEntryMode, currentTask, currentBoardRun, playerHudStats, currentStoryCompleted,
            currentStoryTasks, useRemoteBoardSession, currentBoardSessionId, getBoardTileByIndex,
            currentBoardMap, photoCaptureModeActive, resetPhotoCaptureState, loadTaskVideo,
            tryAutoPlayTaskBgm, getTaskVideoUrl, exitFormalStoryIntroMode,
            isCurrentQuestTutorialMode, isCurrentQuestDemoMode, taskUsesGps, deviceHeading,
            lastHeadingUpdateAt, getTutorialMockBearing, getTutorialMockDistance, lastLatLng,
            taskHudDock, taskBearingValue, taskDistanceValue, taskAngleValue, taskCoordsValue, taskStatusLabel
        } = ctx;

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

        function showTaskContext(task) {
        const {
            featureDockMenu, featureDrawerPanel, taskStatusBox, voicePanel, answerToast,
            hudModeValue, hudStageValue, hudPointsValue, hudBadgesValue, boardStatusCard,
            boardHudRound, boardHudTile, boardHudSession, boardHudResult, hudPanelSummary,
            hudPanelNext, hudPanelRescue, hudPanelStages, hudPanelBadges, gameShellStartBtn,
            taskIntroTitle, taskIntroCover, taskIntroDescription, taskIntroBtn, taskTargetImg,
            gameShellObjective, taskIntroPanel, taskIntroVideo,
            currentEntryMode, currentTask, currentBoardRun, playerHudStats, currentStoryCompleted,
            currentStoryTasks, useRemoteBoardSession, currentBoardSessionId, getBoardTileByIndex,
            currentBoardMap, photoCaptureModeActive, resetPhotoCaptureState, loadTaskVideo,
            tryAutoPlayTaskBgm, getTaskVideoUrl, exitFormalStoryIntroMode,
            isCurrentQuestTutorialMode, isCurrentQuestDemoMode, taskUsesGps, deviceHeading,
            lastHeadingUpdateAt, getTutorialMockBearing, getTutorialMockDistance, lastLatLng,
            taskHudDock, taskBearingValue, taskDistanceValue, taskAngleValue, taskCoordsValue, taskStatusLabel
        } = ctx;

            if (currentTask && task && currentTask.id !== task.id && photoCaptureModeActive) {
                resetPhotoCaptureState();
            }
            // currentTask is already runtimeState via ctx; callers (e.g. applyTaskSelection) set it before this runs.
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
            loadTaskVideo(task);
            if (taskIntroBtn) taskIntroBtn.classList.remove('hidden');
            if (taskTargetImg) {
                taskTargetImg.src = task.ar_image_url || task.photoUrl || task.photo_url || '/images/mascot.png';
            }
            if (gameShellObjective) {
                gameShellObjective.textContent = task.stage_intro || task.description || task.name || '請前往完成當前關卡';
            }
            tryAutoPlayTaskBgm(0, { force: true });
            renderHudSummary();
            if (getTaskVideoUrl(task)) {
                maybeAutoOpenTaskIntro(task);
            } else {
                closeTaskIntroPanel();
            }
            // 不自動彈出景點介紹：與 AR-VIEW 一致，進入後先看到相機畫面，由使用者自行點 📋 查看
        }

        function renderTaskMetrics(distanceMeters = lastTaskDistance, bearing = lastTaskBearing) {
        const {
            featureDockMenu, featureDrawerPanel, taskStatusBox, voicePanel, answerToast,
            hudModeValue, hudStageValue, hudPointsValue, hudBadgesValue, boardStatusCard,
            boardHudRound, boardHudTile, boardHudSession, boardHudResult, hudPanelSummary,
            hudPanelNext, hudPanelRescue, hudPanelStages, hudPanelBadges, gameShellStartBtn,
            taskIntroTitle, taskIntroCover, taskIntroDescription, taskIntroBtn, taskTargetImg,
            gameShellObjective, taskIntroPanel, taskIntroVideo,
            currentEntryMode, currentTask, currentBoardRun, playerHudStats, currentStoryCompleted,
            currentStoryTasks, useRemoteBoardSession, currentBoardSessionId, getBoardTileByIndex,
            currentBoardMap, photoCaptureModeActive, resetPhotoCaptureState, loadTaskVideo,
            tryAutoPlayTaskBgm, getTaskVideoUrl, exitFormalStoryIntroMode,
            isCurrentQuestTutorialMode, isCurrentQuestDemoMode, taskUsesGps, deviceHeading,
            lastHeadingUpdateAt, getTutorialMockBearing, getTutorialMockDistance, lastLatLng,
            taskHudDock, taskBearingValue, taskDistanceValue, taskAngleValue, taskCoordsValue, taskStatusLabel
        } = ctx;

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

        function openTaskIntroPanel({ autoPlay = false } = {}) {
        const {
            taskIntroPanel, taskIntroVideo, exitFormalStoryIntroMode
        } = ctx;

            if (!taskIntroPanel) return;
            if (typeof exitFormalStoryIntroMode === 'function') exitFormalStoryIntroMode();
            taskIntroPanel.classList.remove('hidden');
            document.body.classList.add('task-intro-open');
            if (autoPlay && taskIntroVideo && taskIntroPanel.classList.contains('has-video')) {
                const playPromise = taskIntroVideo.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {});
                }
            }
        }

        function closeTaskIntroPanel({ pauseVideo = true } = {}) {
        const {
            taskIntroPanel, pauseTaskMedia
        } = ctx;

            if (!taskIntroPanel) return;
            taskIntroPanel.classList.add('hidden');
            document.body.classList.remove('task-intro-open');
            if (pauseVideo && typeof pauseTaskMedia === 'function') {
                pauseTaskMedia();
            }
        }

        function maybeAutoOpenTaskIntro(task) {
        const {
            featureDockMenu, featureDrawerPanel, taskStatusBox, voicePanel, answerToast,
            hudModeValue, hudStageValue, hudPointsValue, hudBadgesValue, boardStatusCard,
            boardHudRound, boardHudTile, boardHudSession, boardHudResult, hudPanelSummary,
            hudPanelNext, hudPanelRescue, hudPanelStages, hudPanelBadges, gameShellStartBtn,
            taskIntroTitle, taskIntroCover, taskIntroDescription, taskIntroBtn, taskTargetImg,
            gameShellObjective, taskIntroPanel, taskIntroVideo,
            currentEntryMode, currentTask, currentBoardRun, playerHudStats, currentStoryCompleted,
            currentStoryTasks, useRemoteBoardSession, currentBoardSessionId, getBoardTileByIndex,
            currentBoardMap, photoCaptureModeActive, resetPhotoCaptureState, loadTaskVideo,
            tryAutoPlayTaskBgm, getTaskVideoUrl, exitFormalStoryIntroMode,
            isCurrentQuestTutorialMode, isCurrentQuestDemoMode, taskUsesGps, deviceHeading,
            lastHeadingUpdateAt, getTutorialMockBearing, getTutorialMockDistance, lastLatLng,
            taskHudDock, taskBearingValue, taskDistanceValue, taskAngleValue, taskCoordsValue, taskStatusLabel
        } = ctx;

            const taskVideoUrl = getTaskVideoUrl(task);
            const taskKey = String(task?.id || '');
            if (!taskVideoUrl || !taskKey || !isCompactViewport()) return;
            if (lastAutoOpenedTaskVideoTaskId === taskKey && !taskIntroPanel?.classList.contains('hidden')) return;
            lastAutoOpenedTaskVideoTaskId = taskKey;
            openTaskIntroPanel();
        }

        function showStorySummaryPage() {
        const {
            featureDockMenu, featureDrawerPanel, taskStatusBox, voicePanel, answerToast,
            hudModeValue, hudStageValue, hudPointsValue, hudBadgesValue, boardStatusCard,
            boardHudRound, boardHudTile, boardHudSession, boardHudResult, hudPanelSummary,
            hudPanelNext, hudPanelRescue, hudPanelStages, hudPanelBadges, gameShellStartBtn,
            taskIntroTitle, taskIntroCover, taskIntroDescription, taskIntroBtn, taskTargetImg,
            gameShellObjective, taskIntroPanel, taskIntroVideo,
            currentEntryMode, currentTask, currentBoardRun, playerHudStats, currentStoryCompleted,
            currentStoryTasks, useRemoteBoardSession, currentBoardSessionId, getBoardTileByIndex,
            currentBoardMap, photoCaptureModeActive, resetPhotoCaptureState, loadTaskVideo,
            tryAutoPlayTaskBgm, getTaskVideoUrl, exitFormalStoryIntroMode,
            isCurrentQuestTutorialMode, isCurrentQuestDemoMode, taskUsesGps, deviceHeading,
            lastHeadingUpdateAt, getTutorialMockBearing, getTutorialMockDistance, lastLatLng,
            taskHudDock, taskBearingValue, taskDistanceValue, taskAngleValue, taskCoordsValue, taskStatusLabel
        } = ctx;

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


    return {
        init,
        isCompactViewport,
        syncCompactUxState,
        renderHudSummary,
        showTaskContext,
        renderTaskMetrics,
        openTaskIntroPanel,
        closeTaskIntroPanel,
        maybeAutoOpenTaskIntro,
        showStorySummaryPage
    };
})();
