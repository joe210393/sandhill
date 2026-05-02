(function(global) {
    function createController(deps = {}) {
        const {
            runtimeState,
            elements = {},
            capturedPhotos = [],
            photoWorkflow,
            taskMediaController,
            geoWatch,
            bindTaskVideoStatus = () => {},
            buildPhotoSubmissionDataUrl = async () => null,
            captureCurrentReticleDataUrl = () => null,
            captureFullFrameDataUrl = () => null,
            closeDockPanels = () => {},
            closeNpcDialog = () => {},
            closeTaskEncounter = () => {},
            closeTaskIntroPanel = () => {},
            createTutorialFallbackCapture = () => null,
            ensureOrientationPermission = async () => {},
            exitFormalStoryIntroMode = () => {},
            focusBoardTile = () => Promise.resolve(),
            focusStoryTask = () => Promise.resolve(),
            getBoardTileByIndex = () => null,
            getRequiredShots = () => 1,
            getReticleRect = () => null,
            hideAnswerToast = () => {},
            hideQueryTransit = () => {},
            isCurrentQuestTutorialMode = () => false,
            isPhotoTaskCaptureActive = () => false,
            loadBoardShell = () => Promise.resolve(),
            loadGameShellFromUrl = () => Promise.resolve(false),
            loadStoryShell = () => Promise.resolve(),
            loadTaskFromUrl = () => {},
            openTaskEncounter = () => {},
            openTaskIntroPanel = () => {},
            playCameraFeedback = () => {},
            processSelectionFromRect = () => {},
            renderBoardPanel = () => {},
            renderGameShellEntries = () => {},
            renderHudSummary = () => {},
            renderTutorialModeUi = () => {},
            reopenTaskFromCaptureMode = () => {},
            resetAnswerSubmitUi = () => {},
            resetPhotoCaptureState = () => {},
            resizeCanvas = () => {},
            setCameraCaptureMode = () => {},
            setMode = () => {},
            showBoardTilePreview = () => {},
            showNpcDialog = () => Promise.resolve(),
            showQueryTransit = () => {},
            showStorySummaryPage = () => {},
            startBoardTurn = () => Promise.resolve(),
            startTaskInteraction = () => Promise.resolve(),
            submitLockCode = () => Promise.resolve(),
            submitTaskAnswer = () => Promise.resolve(),
            syncCompactUxState = () => {},
            toggleDockPanel = () => {},
            updateGameShellProgress = () => {},
            updatePhotoBasketUi = () => {}
        } = deps;

        let shutterBusy = false;

        function get(key) {
            return runtimeState.get(key);
        }

        function set(key, value) {
            return runtimeState.set(key, value);
        }

        async function handleTaskPhotoShutter() {
            if (!isPhotoTaskCaptureActive() || shutterBusy) return;
            shutterBusy = true;
            try {
                closeNpcDialog();
                playCameraFeedback({
                    shutterBtn: elements.shutterBtn,
                    reticleCaptureHotspot: elements.reticleCaptureHotspot
                });
                const dataUrl = elements.video.videoWidth && elements.video.videoHeight
                    ? (get('cameraCaptureMode') === 'scene'
                        ? captureFullFrameDataUrl(elements.video)
                        : captureCurrentReticleDataUrl())
                    : (isCurrentQuestTutorialMode() ? createTutorialFallbackCapture() : null);
                if (!dataUrl) {
                    throw new Error('相機尚未就緒，請稍後再試一次');
                }

                set('pendingPhotoDataUrl', dataUrl);
                if (elements.photoConfirmPreview) elements.photoConfirmPreview.src = dataUrl;
                if (elements.photoConfirmOverlay) {
                    elements.photoConfirmOverlay.classList.remove('hidden');
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

        async function handleReticleCaptureAction() {
            if (get('selectionMode') !== 'reticle') return;
            if (isPhotoTaskCaptureActive()) {
                await handleTaskPhotoShutter();
                return;
            }
            if (!elements.video.videoWidth || !elements.video.videoHeight) {
                elements.aiResult.innerHTML = '<span style="color:red">相機尚未就緒</span>';
                photoWorkflow.showResultPanel();
                return;
            }
            const rect = getReticleRect();
            processSelectionFromRect(rect.minX, rect.minY, rect.maxX, rect.maxY);
        }

        function bindPhotoConfirmation() {
            if (elements.photoRetakeBtn) {
                elements.photoRetakeBtn.addEventListener('click', () => {
                    set('pendingPhotoDataUrl', null);
                    if (elements.photoConfirmOverlay) elements.photoConfirmOverlay.classList.add('hidden');
                    shutterBusy = false;
                });
            }

            if (!elements.photoConfirmBtn) return;
            elements.photoConfirmBtn.addEventListener('click', async () => {
                const pendingPhotoDataUrl = get('pendingPhotoDataUrl');
                if (!pendingPhotoDataUrl) return;
                if (elements.photoConfirmOverlay) elements.photoConfirmOverlay.classList.add('hidden');

                const dataUrl = pendingPhotoDataUrl;
                set('pendingPhotoDataUrl', null);
                showQueryTransit('正在整理照片與傳送資料...');

                try {
                    const requiredShots = getRequiredShots(get('currentTask'));
                    if (capturedPhotos.length >= requiredShots) {
                        capturedPhotos.length = requiredShots - 1;
                    }
                    capturedPhotos.push(dataUrl);
                    set('currentAnswerPhotoDataUrl', dataUrl);
                    updatePhotoBasketUi();

                    if (capturedPhotos.length < requiredShots) {
                        hideQueryTransit();
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

                    set('currentAnswerPhotoDataUrl', await buildPhotoSubmissionDataUrl());
                    await submitTaskAnswer();
                } catch (err) {
                    hideQueryTransit();
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

        function bind() {
            window.addEventListener('resize', resizeCanvas);
            resizeCanvas();

            if (elements.answerToastClose) {
                elements.answerToastClose.addEventListener('click', () => hideAnswerToast());
            }

            if (elements.switchCameraBtn) {
                elements.switchCameraBtn.addEventListener('click', () => {
                    global.AiLabCameraManager.toggleFacingMode();
                    global.AiLabCameraManager.startCamera();
                });
            }

            if (elements.captureBtn) {
                elements.captureBtn.addEventListener('click', () => {
                    global.AiLabPhotoShare.handleCaptureClick({
                        video: elements.video,
                        captureFullFrameDataUrl
                    });
                });
            }

            if (elements.backBtn) {
                elements.backBtn.addEventListener('click', () => {
                    const params = new URLSearchParams(window.location.search);
                    const taskId = params.get('taskId');
                    const questChainId = params.get('questChainId');
                    const mode = params.get('mode');
                    if (questChainId || mode) window.location.href = '/';
                    else if (taskId) window.location.href = `/task-detail.html?id=${taskId}`;
                    else window.location.href = '/';
                });
            }

            if (elements.canvas) {
                elements.canvas.addEventListener('mousedown', photoWorkflow.startDraw);
                elements.canvas.addEventListener('mousemove', photoWorkflow.moveDraw);
                elements.canvas.addEventListener('mouseup', photoWorkflow.endDraw);
                elements.canvas.addEventListener('touchstart', photoWorkflow.startDraw, { passive: false });
                elements.canvas.addEventListener('touchmove', photoWorkflow.moveDraw, { passive: false });
                elements.canvas.addEventListener('touchend', (e) => { e.preventDefault(); photoWorkflow.endDraw(e); }, { passive: false });
                elements.canvas.addEventListener('touchcancel', photoWorkflow.endDraw);
            }

            if (elements.directorToggle && elements.directorPanel) {
                elements.directorToggle.addEventListener('click', () => {
                    elements.directorPanel.classList.toggle('open');
                });
            }

            elements.modeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (get('isShellExperience')) return;
                    setMode(btn.dataset.mode);
                });
            });

            if (elements.gameShellEntries) {
                elements.gameShellEntries.addEventListener('click', async (event) => {
                    const entryBtn = event.target.closest('.game-shell-entry[data-entry-id]');
                    if (!entryBtn) return;
                    const entryId = entryBtn.dataset.entryId;
                    const entryType = entryBtn.dataset.entryType;
                    if (entryType === 'board') {
                        const tile = get('currentBoardTiles').find((item) => String(item.id) === String(entryId));
                        if (tile) await focusBoardTile(tile);
                        return;
                    }
                    const task = get('currentStoryTasks').find((item) => String(item.id) === String(entryId));
                    if (task) await focusStoryTask(task);
                });
            }

            if (elements.gameShellStartBtn) {
                elements.gameShellStartBtn.addEventListener('touchstart', () => {
                    elements.gameShellStartBtn.style.animation = 'none';
                }, { passive: true });

                elements.gameShellStartBtn.addEventListener('click', () => {
                    if (get('currentEntryMode') === 'board_game') {
                        if (get('currentBoardRun')?.pendingTargetTile) {
                            const focusTile = get('currentBoardTiles').find((tile) => Number(tile.tile_index) === Number(get('currentBoardRun').pendingTargetTile));
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

            if (elements.retryBtn) elements.retryBtn.addEventListener('click', photoWorkflow.retry);

            if (elements.npcDialogClose) {
                elements.npcDialogClose.addEventListener('click', closeNpcDialog);
            }
            if (elements.npcDialog) {
                elements.npcDialog.addEventListener('click', (e) => {
                    if (e.target !== elements.npcDialogClose) {
                        closeNpcDialog();
                    }
                });
            }

            if (elements.addPhotoBtn) {
                elements.addPhotoBtn.addEventListener('click', () => {
                    elements.resultPanel.classList.remove('active');
                    elements.resultPanel.style.display = 'none';
                    elements.canvasCtx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
                    if (elements.selectionInstruction) {
                        elements.selectionInstruction.style.opacity = '1';
                        elements.selectionInstruction.style.display = '';
                    }
                });
            }

            bindPhotoConfirmation();

            if (elements.shutterBtn) {
                elements.shutterBtn.addEventListener('click', () => {
                    if (isPhotoTaskCaptureActive()) {
                        handleTaskPhotoShutter();
                        return;
                    }
                    handleReticleCaptureAction();
                });
            }

            if (elements.reticleCaptureHotspot) {
                elements.reticleCaptureHotspot.addEventListener('click', () => {
                    if (!isPhotoTaskCaptureActive()) return;
                    handleTaskPhotoShutter();
                });
            }

            if (elements.boardPanelTrack) {
                elements.boardPanelTrack.addEventListener('click', (event) => {
                    const tileButton = event.target.closest('.board-track-chip[data-tile-index]');
                    if (!tileButton) return;
                    const tileIndex = Number(tileButton.dataset.tileIndex);
                    if (!Number.isFinite(tileIndex)) return;
                    const tile = getBoardTileByIndex(tileIndex);
                    if (!tile) return;
                    set('currentBoardActiveTileId', tile.id);
                    renderGameShellEntries(get('currentBoardTiles'), tile.id);
                    updateGameShellProgress(tile);
                    showBoardTilePreview(tile);
                });
            }

            if (elements.cameraModeTaskBtn) elements.cameraModeTaskBtn.addEventListener('click', () => setCameraCaptureMode('task'));
            if (elements.cameraModeSceneBtn) elements.cameraModeSceneBtn.addEventListener('click', () => setCameraCaptureMode('scene'));
            if (elements.reticleOverlay) elements.reticleOverlay.classList.toggle('hidden', get('cameraCaptureMode') === 'scene');
            if (elements.instructionText && !isPhotoTaskCaptureActive()) {
                elements.instructionText.textContent = '把目標放進黃色圓框，直接點圓框中央拍照';
            }
            loadGameShellFromUrl().then((loaded) => {
                if (!loaded) loadTaskFromUrl();
            });

            if (elements.taskBgmBtn && elements.taskBgm) {
                elements.taskBgmBtn.addEventListener('click', () => {
                    if (elements.taskBgm.paused) {
                        elements.taskBgm.play().then(() => {
                            if (geoWatch) geoWatch.setBgmAutoStarted(true);
                            elements.taskBgmBtn.textContent = '🔊';
                        }).catch(() => {});
                    } else {
                        elements.taskBgm.pause();
                        if (geoWatch) geoWatch.setBgmAutoStarted(true);
                        elements.taskBgmBtn.textContent = '🎵';
                    }
                });
            }
            if (elements.taskIntroBtn && elements.taskIntroPanel) {
                elements.taskIntroBtn.addEventListener('click', () => {
                    openTaskIntroPanel();
                });
            }
            bindTaskVideoStatus(elements.gameShellVideo, elements.gameShellVideoError);
            bindTaskVideoStatus(elements.taskIntroVideo, elements.taskIntroVideoError);
            if (elements.gameShellVideo) {
                elements.gameShellVideo.addEventListener('ended', () => {
                    try {
                        elements.gameShellVideo.currentTime = 0;
                    } catch (err) {
                        console.warn('重置關卡影片狀態失敗', err);
                    }
                });
            }
            if (elements.taskIntroVideo) {
                elements.taskIntroVideo.addEventListener('ended', () => taskMediaController.handleTaskIntroVideoEnded());
            }
            if (elements.taskIntroClose && elements.taskIntroPanel) {
                elements.taskIntroClose.addEventListener('click', () => {
                    closeTaskIntroPanel();
                });
            }
            if (elements.taskIntroSkip && elements.taskIntroPanel) {
                elements.taskIntroSkip.addEventListener('click', () => {
                    closeTaskIntroPanel();
                });
            }
            if (elements.cameraTaskReopenBtn) {
                elements.cameraTaskReopenBtn.addEventListener('click', () => {
                    reopenTaskFromCaptureMode();
                });
            }
            if (elements.featureDockToggle && elements.featureDockMenu) {
                elements.featureDockToggle.addEventListener('click', async () => {
                    await ensureOrientationPermission();
                    const willOpen = elements.featureDockMenu.classList.contains('hidden');
                    elements.featureDockMenu.classList.toggle('hidden');
                    if (!willOpen) {
                        closeDockPanels();
                    }
                    elements.featureDockToggle.textContent = willOpen ? '×' : '☰';
                    syncCompactUxState();
                });
            }
            if (elements.gameShellToggle && elements.gameShellPanel) {
                elements.gameShellToggle.addEventListener('click', () => {
                    exitFormalStoryIntroMode();
                    elements.gameShellPanel.classList.toggle('collapsed');
                });
            }
            if (elements.gameShellBtn && elements.gameShellPanel) {
                elements.gameShellBtn.addEventListener('click', () => {
                    exitFormalStoryIntroMode();
                    elements.gameShellPanel.classList.toggle('collapsed');
                });
            }
            if (elements.taskHudToggle && elements.taskStatusBox) {
                elements.taskHudToggle.addEventListener('click', () => {
                    exitFormalStoryIntroMode();
                    const willOpen = elements.taskStatusBox.classList.contains('hidden');
                    elements.taskStatusBox.classList.toggle('hidden');
                    elements.taskHudToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
                    syncCompactUxState();
                });
            }
            if (elements.dockModeBtn) {
                elements.dockModeBtn.addEventListener('click', async () => {
                    await ensureOrientationPermission();
                    toggleDockPanel('mode');
                });
            }
            if (elements.dockLangBtn) {
                elements.dockLangBtn.addEventListener('click', async () => {
                    await ensureOrientationPermission();
                    toggleDockPanel('lang');
                });
            }
            if (elements.hudPanelBtn) {
                elements.hudPanelBtn.addEventListener('click', () => {
                    exitFormalStoryIntroMode();
                    toggleDockPanel('hud');
                    renderHudSummary();
                });
            }
            if (elements.boardPanelBtn) {
                elements.boardPanelBtn.addEventListener('click', () => {
                    toggleDockPanel('board');
                    renderBoardPanel();
                });
            }
            if (elements.boardMiniMap) {
                elements.boardMiniMap.addEventListener('click', () => {
                    toggleDockPanel('board');
                    renderBoardPanel();
                });
            }
            if (elements.boardMapSelector) {
                elements.boardMapSelector.addEventListener('change', async () => {
                    const nextBoardMapId = elements.boardMapSelector.value;
                    if (!nextBoardMapId || String(nextBoardMapId) === String(get('currentBoardMap')?.id || '')) return;
                    const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
                    try {
                        await loadBoardShell(get('currentQuestChainId'), nextBoardMapId, previewMode);
                        toggleDockPanel('board');
                    } catch (err) {
                        console.error('切換棋盤失敗', err);
                    }
                });
            }
            if (elements.floatingDiceBtn) {
                elements.floatingDiceBtn.addEventListener('touchstart', () => {
                    elements.floatingDiceBtn.style.animation = 'none';
                }, { passive: true });

                elements.floatingDiceBtn.addEventListener('click', () => {
                    startBoardTurn().catch((err) => {
                        console.error('大富翁擲骰失敗', err);
                        Swal.fire({ icon: 'error', title: '擲骰失敗', text: err.message || '請稍後再試' });
                    });
                });
            }
            if (elements.boardFocusBtn) {
                elements.boardFocusBtn.addEventListener('click', () => {
                    const focusTile = get('currentBoardRun')?.pendingTargetTile
                        ? get('currentBoardTiles').find((tile) => Number(tile.tile_index) === Number(get('currentBoardRun').pendingTargetTile))
                        : null;
                    if (!focusTile) return;
                    focusBoardTile(focusTile).catch((err) => {
                        console.error('聚焦大富翁目標失敗', err);
                        Swal.fire({ icon: 'error', title: '無法聚焦目標', text: err.message || '請稍後再試' });
                    });
                });
            }
            if (elements.taskTargetObj) {
                elements.taskTargetObj.addEventListener('click', () => {
                    openTaskEncounter();
                });
            }
            if (elements.taskEncounterClose) {
                elements.taskEncounterClose.addEventListener('click', closeTaskEncounter);
            }
            if (elements.taskEncounterStart) {
                elements.taskEncounterStart.addEventListener('click', () => {
                    startTaskInteraction().catch((err) => {
                        console.error('開始任務互動失敗', err);
                        Swal.fire({ icon: 'error', title: '任務互動失敗', text: err.message || '請稍後再試' });
                    });
                });
            }
            if (elements.btnAnswerCancel) {
                elements.btnAnswerCancel.addEventListener('click', () => {
                    elements.answerModal.classList.add('hidden');
                    resetAnswerSubmitUi();
                    resetPhotoCaptureState();
                    renderTutorialModeUi();
                });
            }
            if (elements.btnAnswerSubmit) {
                elements.btnAnswerSubmit.addEventListener('click', () => {
                    submitTaskAnswer().catch((err) => {
                        console.error('提交任務答案失敗', err);
                        elements.answerMessage.textContent = `❌ ${err?.message || '送出失敗'}`;
                        resetAnswerSubmitUi();
                        elements.btnAnswerSubmit.disabled = false;
                    });
                });
            }
            if (elements.btnLockCancel) {
                elements.btnLockCancel.addEventListener('click', () => {
                    elements.lockOverlay.classList.add('hidden');
                });
            }
            if (elements.btnLockSubmit) {
                elements.btnLockSubmit.addEventListener('click', () => {
                    submitLockCode().catch((err) => {
                        console.error('送出密碼失敗', err);
                        elements.lockMsg.textContent = '連線失敗';
                    });
                });
            }

            if (elements.btnCompletionClose) {
                elements.btnCompletionClose.addEventListener('click', async () => {
                    elements.completionModal.classList.add('hidden');
                    renderTutorialModeUi();
                    if (get('pendingStoryReloadAfterCompletion') && get('currentQuestChainId')) {
                        set('pendingStoryReloadAfterCompletion', false);
                        const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
                        await loadBoardOrStoryShell(previewMode);

                        if (get('currentStoryCompleted')) {
                            showStorySummaryPage();
                        }
                    }
                });
            }

            geoWatch.attachOrientationListeners();
            window.addEventListener('pointerdown', async () => {
                await ensureOrientationPermission();
                geoWatch.tryAutoPlayTaskBgm(0, { force: true });
            });
        }

        async function loadBoardOrStoryShell(previewMode) {
            await loadStoryShell(get('currentQuestChainId'), previewMode);
        }

        return {
            bind,
            handleReticleCaptureAction,
            handleTaskPhotoShutter
        };
    }

    global.AiLabEventBindings = {
        createController
    };
})(window);
