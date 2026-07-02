(function(global) {
    function createController(deps = {}) {
        const {
            runtimeState,
            capturedPhotos,
            answerElements = {},
            lockElements = {},
            captureCurrentReticleDataUrl = () => null,
            closeDockPanels = () => {},
            closeNpcDialog = () => {},
            closeTaskEncounter = () => {},
            closeTaskIntroPanel = () => {},
            completeBoardTurn = () => Promise.resolve(),
            completeTutorialGuestTask = () => {},
            completeTutorialLoggedInTask = () => Promise.resolve(),
            getLoginUser = () => null,
            getRequiredShots = () => 1,
            getStoryIntroSpeaker = () => 'guide',
            buildStoryIntroDialogue = () => '',
            haversineDistance = () => Number.MAX_SAFE_INTEGER,
            hideQueryTransit = () => {},
            initLockWheels = () => {},
            isCurrentQuestDemoMode = () => false,
            isCurrentQuestTutorialMode = () => false,
            isTutorialGuestMode = () => false,
            normalizeUiText = (value, fallback = '') => String(value || fallback || ''),
            openTaskEncounter = () => {},
            renderAnswerModal = () => {},
            renderTutorialModeUi = () => {},
            requestJson = () => Promise.reject(new Error('requestJson unavailable')),
            resetAnswerSubmitUi: resetAnswerSubmitUiDep = () => {},
            scheduleStoryReloadAfterCompletion = () => {},
            setAnswerChoicePendingState = () => {},
            setAnswerSubmitLoadingState = () => {},
            setCameraCaptureMode = () => {},
            setImmersiveCameraMode = () => {},
            showAnswerToast = () => {},
            showCompletionModal = () => {},
            showNpcDialog = () => Promise.resolve(),
            showQueryTransit = () => {},
            taskUsesGps = () => false
        } = deps;

        const ANSWER_SUBMIT_LABEL_IDLE = answerElements.btnAnswerSubmit?.textContent?.trim() || '送出答案';

        function get(key) {
            return runtimeState.get(key);
        }

        function set(key, value) {
            return runtimeState.set(key, value);
        }

        function isPhotoTaskCaptureActive() {
            return Boolean(get('photoCaptureModeActive') && get('currentTask')?.task_type === 'photo');
        }

        async function createCurrentUserTaskRecord() {
            const currentTaskId = get('currentTaskId');
            if (!currentTaskId) return null;
            const data = await requestJson('/api/user-tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ task_id: currentTaskId })
            }, '建立關卡紀錄');
            if (data && data.success === false) {
                throw new Error(data.message || '無法建立關卡紀錄');
            }
            if (data.success && data.userTaskId) {
                set('currentUserTaskId', data.userTaskId);
                return data.userTaskId;
            }
            return null;
        }

        async function fetchCurrentUserTaskId() {
            const currentTaskId = get('currentTaskId');
            if (!currentTaskId) return null;
            const loginUser = getLoginUser();
            if (!loginUser || !loginUser.username) return null;
            try {
                const loadTasks = async () => requestJson(`/api/user-tasks?username=${encodeURIComponent(loginUser.username)}`, {
                    credentials: 'include'
                }, '取得關卡紀錄');

                let data = await loadTasks();
                if (!data.success || !Array.isArray(data.tasks)) return null;
                let taskRecord = data.tasks.find((item) => String(item.id) === String(currentTaskId));
                if (!taskRecord) {
                    await createCurrentUserTaskRecord();
                    data = await loadTasks();
                    if (!data.success || !Array.isArray(data.tasks)) return null;
                    taskRecord = data.tasks.find((item) => String(item.id) === String(currentTaskId));
                }
                if (!taskRecord) return null;
                set('currentUserTaskId', taskRecord.user_task_id);
                return taskRecord.user_task_id;
            } catch (err) {
                console.warn('取得進行中任務失敗', err);
                return null;
            }
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
            tempCtx.fillText('樂樂園教學模式', tempCanvas.width / 2, 420);
            tempCtx.font = '36px sans-serif';
            tempCtx.fillStyle = 'rgba(255,255,255,0.82)';
            tempCtx.fillText('工作室環境沒有相機，已改用教學快照。', tempCanvas.width / 2, 490);
            tempCtx.fillText('這張圖片會直接拿去做教學裁判與通關。', tempCanvas.width / 2, 545);
            return tempCanvas.toDataURL('image/jpeg', 0.92);
        }

        function refreshAnswerPhotoFromReticle() {
            const { answerMessage, btnAnswerSubmit } = answerElements;
            const preview = document.getElementById('answerPhotoPreview');
            try {
                const dataUrl = captureCurrentReticleDataUrl();
                if (!dataUrl) throw new Error('目前無法擷取圓框畫面');
                set('currentAnswerPhotoDataUrl', dataUrl);
                if (preview) {
                    preview.src = dataUrl;
                    preview.style.display = 'block';
                }
                if (btnAnswerSubmit) btnAnswerSubmit.disabled = false;
                if (answerMessage) answerMessage.textContent = '✅ 已使用圓框鏡頭捕捉目前畫面';
            } catch (err) {
                set('currentAnswerPhotoDataUrl', null);
                if (preview) {
                    preview.removeAttribute('src');
                    preview.style.display = 'none';
                }
                if (btnAnswerSubmit) btnAnswerSubmit.disabled = true;
                if (answerMessage) answerMessage.textContent = `❌ ${err.message}`;
            }
        }

        function applyAnswerSubmitLoadingState(isLoading, pendingLabel) {
            setAnswerSubmitLoadingState({
                btnAnswerSubmit: answerElements.btnAnswerSubmit,
                idleLabel: ANSWER_SUBMIT_LABEL_IDLE,
                isLoading,
                pendingLabel: pendingLabel || '系統確認中...'
            });
        }

        function resetAnswerSubmitUi() {
            setAnswerChoicePendingState(false);
            applyAnswerSubmitLoadingState(false);
            resetAnswerSubmitUiDep();
        }

        async function buildPhotoSubmissionDataUrl(combinePhotosToGrid) {
            if (capturedPhotos.length > 1) {
                return await combinePhotosToGrid(capturedPhotos);
            }
            return capturedPhotos[0] || get('currentAnswerPhotoDataUrl') || null;
        }

        function resetPhotoCaptureState({ keepActive = false, updatePhotoBasketUi = () => {} } = {}) {
            capturedPhotos.length = 0;
            set('currentAnswerPhotoDataUrl', null);
            set('pendingPhotoDataUrl', null);
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
                set('photoCaptureModeActive', false);
                set('tutorialBoardPhotoCaptureArmed', false);
                setImmersiveCameraMode(false);
            }
            updatePhotoBasketUi();
        }

        function showAnswerModal(task, renderOptions = null) {
            const {
                answerModal,
                answerTaskName,
                answerTaskDescription,
                answerInputContainer,
                answerMessage,
                btnAnswerSubmit
            } = answerElements;
            if (!answerModal || !task) return;
            closeTaskEncounter();
            deps.setTaskObjectVisible?.(false);
            deps.hideTaskTargetObject?.();
            capturedPhotos.length = 0;
            set('currentAnswerPhotoDataUrl', null);
            set('pendingPhotoDataUrl', null);
            renderAnswerModal({
                task,
                isDemoMode: isCurrentQuestDemoMode(),
                isShellExperience: get('isShellExperience'),
                ...(renderOptions && typeof renderOptions === 'object' ? renderOptions : {}),
                elements: { answerModal, answerTaskName, answerTaskDescription, answerInputContainer, answerMessage, btnAnswerSubmit },
                callbacks: {
                    resetAnswerSubmitUi,
                    onPhotoSelected: (dataUrl, preview) => {
                        set('currentAnswerPhotoDataUrl', dataUrl);
                        if (preview) {
                            preview.src = dataUrl;
                            preview.style.display = 'block';
                        }
                        if (btnAnswerSubmit) {
                            btnAnswerSubmit.disabled = false;
                            setTimeout(() => btnAnswerSubmit.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
                        }
                    },
                    refreshAnswerPhotoFromReticle
                }
            });
        }

        function buildSubmitContext() {
            return {
                currentTask: get('currentTask'),
                btnAnswerSubmit: answerElements.btnAnswerSubmit,
                answerMessage: answerElements.answerMessage,
                currentAnswerPhotoDataUrl: get('currentAnswerPhotoDataUrl'),
                currentUserTaskId: get('currentUserTaskId'),
                answerModal: answerElements.answerModal,
                currentEntryMode: get('currentEntryMode'),
                currentBoardRun: get('currentBoardRun'),
                setCurrentUserTaskId: (value) => set('currentUserTaskId', value),
                setTutorialFlowStarted: (value) => set('tutorialFlowStarted', value),
                setPhotoCaptureModeActive: (value) => set('photoCaptureModeActive', value),
                setAnswerSubmitLoadingState: applyAnswerSubmitLoadingState,
                isCurrentQuestDemoMode,
                isCurrentQuestTutorialMode,
                isTutorialGuestMode,
                isPhotoTaskCaptureActive,
                showQueryTransit,
                hideQueryTransit,
                requestJson,
                showNpcDialog,
                normalizeUiText,
                resetPhotoCaptureState: (options) => resetPhotoCaptureState({ ...options, updatePhotoBasketUi: deps.updatePhotoBasketUi }),
                renderTutorialModeUi,
                completeBoardTurn,
                completeTutorialGuestTask,
                scheduleStoryReloadAfterCompletion,
                showCompletionModal,
                setImmersiveCameraMode,
                fetchCurrentUserTaskId,
                createCurrentUserTaskRecord,
                resetAnswerSubmitUi,
                lockOverlay: lockElements.lockOverlay,
                lockMsg: lockElements.lockMsg,
                getLockCode: () => (lockElements.getLockCode ? lockElements.getLockCode(lockElements.lockWheels) : ''),
                getLoginUser,
                completeTutorialLoggedInTask,
                setAnswerChoicePendingState
            };
        }

        async function submitTaskAnswer() {
            return global.AiLabTaskSubmit.submitTaskAnswer(buildSubmitContext());
        }

        async function submitLockCode() {
            return global.AiLabTaskSubmit.submitLockCode(buildSubmitContext());
        }

        async function enterPhotoCaptureFlow() {
            const currentTask = get('currentTask');
            set('photoCaptureModeActive', true);
            set('tutorialBoardPhotoCaptureArmed', get('currentEntryMode') === 'board_game' && isCurrentQuestTutorialMode());
            capturedPhotos.length = 0;
            set('currentAnswerPhotoDataUrl', null);
            answerElements.answerModal?.classList.add('hidden');
            closeDockPanels();
            closeNpcDialog();
            setCameraCaptureMode('task');
            setImmersiveCameraMode(true);
            renderTutorialModeUi();
            await showNpcDialog({
                speakerKey: 'gatekeeper',
                mood: get('currentEntryMode') === 'board_game' ? '圓框拍照挑戰' : '鏡頭挑戰開始',
                text: `${currentTask?.stage_intro || currentTask?.description || '請先對準畫面。'}\n\n把目標放進黃色圓框後，直接按底部快門拍照；如果想留下完整環境，再切到全景紀錄。`,
                buttonLabel: '開始拍照',
                blocking: false,
                autoCloseMs: 4000
            });
        }

        function reopenTaskFromCaptureMode() {
            if (!get('currentTask')) return;
            if (get('photoCaptureModeActive')) {
                set('photoCaptureModeActive', false);
                set('tutorialBoardPhotoCaptureArmed', false);
                setImmersiveCameraMode(false);
                renderTutorialModeUi();
            }
            deps.expandGameShellPanel?.();
            if (get('currentEntryMode') === 'board_game') {
                openTaskEncounter();
            }
        }

        async function startTaskInteraction() {
            const currentTask = get('currentTask');
            closeTaskEncounter();
            closeTaskIntroPanel();
            if (!currentTask) return;
            const tutorialMode = isCurrentQuestTutorialMode();
            const tutorialGuestMode = isTutorialGuestMode();
            const gpsRequired = taskUsesGps(currentTask);
            const completedIds = get('currentStoryCompletedTaskIds');
            const isCompletedStoryTask = Boolean(
                get('currentEntryMode') === 'story_campaign'
                && !isCurrentQuestDemoMode()
                && !isCurrentQuestTutorialMode()
                && completedIds
                && typeof completedIds.has === 'function'
                && completedIds.has(Number(currentTask.id))
            );
            if (isCompletedStoryTask) {
                if (currentTask.task_type === 'multiple_choice') {
                    showAnswerModal(currentTask, {
                        readOnly: true,
                        prefillAnswer: currentTask.correct_answer || ''
                    });
                } else {
                    await Swal.fire({
                        icon: 'info',
                        title: '此關卡已完成',
                        text: '你可以查看上一關內容，但不能再次作答或重玩。',
                        confirmButtonText: '知道了'
                    });
                }
                set('tutorialFlowStarted', false);
                renderTutorialModeUi();
                return;
            }
            set('tutorialFlowStarted', true);
            set('tutorialBoardPhotoCaptureArmed', false);
            renderTutorialModeUi();
            if (tutorialMode && get('tutorialIntroTaskId') !== currentTask.id) {
                set('tutorialIntroTaskId', currentTask.id);
                await showNpcDialog({
                    speakerKey: getStoryIntroSpeaker(currentTask),
                    mood: `第 ${currentTask.quest_order || '?'} 關教學`,
                    text: buildStoryIntroDialogue(currentTask),
                    buttonLabel: '開始操作'
                });
            }
            const demoMode = isCurrentQuestDemoMode() || isCurrentQuestTutorialMode();
            if (gpsRequired) {
                const lastLatLng = get('lastLatLng');
                if (!lastLatLng && !demoMode) {
                    Swal.fire({ icon: 'info', title: '尚未取得位置', text: '請先靠近任務地點後再試' });
                    return;
                }
                const dist = lastLatLng
                    ? haversineDistance(lastLatLng.latitude, lastLatLng.longitude, get('targetLat'), get('targetLng'))
                    : Number.MAX_SAFE_INTEGER;
                if (!demoMode && dist > Math.max(6, currentTask.radius || 30)) {
                    Swal.fire({
                        icon: 'info',
                        title: '前往任務地點',
                        text: `目前距離約 ${Math.round(dist)}m。\n\n請跟著畫面上的方向提示前進，或打開小地圖查看導引線。`,
                        confirmButtonText: '知道了'
                    });
                    return;
                }
            }
            if (currentTask.task_type === 'location') {
                if (tutorialGuestMode) {
                    completeTutorialGuestTask(currentTask);
                    set('tutorialFlowStarted', false);
                    renderTutorialModeUi();
                    await showNpcDialog({
                        speakerKey: 'host',
                        mood: '教學模式通關',
                        text: '樂樂園已替你完成這一步報到，現在直接前往下一段劇情。',
                        buttonLabel: '前往下一關'
                    });
                    scheduleStoryReloadAfterCompletion();
                    showCompletionModal('✅ 教學模式已完成這一步');
                    return;
                }
                if (isCurrentQuestTutorialMode() && getLoginUser()) {
                    await completeTutorialLoggedInTask(currentTask, 'checked_in');
                    set('tutorialFlowStarted', false);
                    renderTutorialModeUi();
                    await showNpcDialog({
                        speakerKey: 'host',
                        mood: '教學模式通關',
                        text: '樂樂園已替你完成這一步報到，現在直接前往下一段劇情。',
                        buttonLabel: '前往下一關'
                    });
                    scheduleStoryReloadAfterCompletion();
                    showCompletionModal('✅ 教學模式已完成這一步');
                    return;
                }
                if (!get('currentUserTaskId')) await fetchCurrentUserTaskId();
                if (!get('currentUserTaskId')) await createCurrentUserTaskRecord();
                if (!get('currentUserTaskId')) {
                    Swal.fire({ icon: 'error', title: '無法建立關卡紀錄', text: tutorialMode ? '教學模式的關卡紀錄建立失敗，請重新整理後再試一次。' : '請重新整理後再試一次。' });
                    return;
                }
                const data = await requestJson(`/api/user-tasks/${get('currentUserTaskId')}/answer`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ answer: 'checked_in' })
                }, '送出報到結果');
                if (data.success && data.isCompleted) {
                    set('tutorialFlowStarted', false);
                    renderTutorialModeUi();
                    if (demoMode && get('currentEntryMode') === 'story_campaign') {
                        await showNpcDialog({
                            speakerKey: 'host',
                            mood: '教學模式通關',
                            text: '教學模式已替你完成這一步報到，現在直接前往下一段劇情。',
                            autoCloseMs: 2200
                        });
                    }
                    if (get('currentEntryMode') === 'board_game' && get('currentBoardRun')?.pendingTargetTile) {
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
                initLockWheels(lockElements.lockWheels, digits);
                if (lockElements.lockMsg) lockElements.lockMsg.textContent = '';
                lockElements.lockOverlay?.classList.remove('hidden');
            } else {
                if (currentTask.task_type === 'photo') {
                    await enterPhotoCaptureFlow();
                    return;
                }
                deps.hideSelectionInstruction?.();
                showAnswerModal(currentTask);
            }
        }

        return {
            applyAnswerSubmitLoadingState,
            buildPhotoSubmissionDataUrl,
            buildSubmitContext,
            createCurrentUserTaskRecord,
            createTutorialFallbackCapture,
            enterPhotoCaptureFlow,
            fetchCurrentUserTaskId,
            isPhotoTaskCaptureActive,
            refreshAnswerPhotoFromReticle,
            reopenTaskFromCaptureMode,
            resetAnswerSubmitUi,
            resetPhotoCaptureState,
            showAnswerModal,
            startTaskInteraction,
            submitLockCode,
            submitTaskAnswer
        };
    }

    global.AiLabTaskFlow = {
        createController
    };
})(window);
