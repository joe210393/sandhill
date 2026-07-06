
window.AiLabTaskSubmit = (function() {

    async function dataUrlToBlob(dataUrl) {
        const convert = window.AiLabDataUrl?.dataUrlToBlob;
        if (typeof convert !== 'function') {
            throw new Error('圖片轉換模組尚未載入，請重新整理頁面');
        }
        return convert(dataUrl);
    }

    function triggerShakeError() {
        document.body.classList.remove('shake-error');
        void document.body.offsetWidth;
        document.body.classList.add('shake-error');
        setTimeout(() => document.body.classList.remove('shake-error'), 500);
    }

    function resolveChoiceAnswer(ctx) {
        const selected = document.querySelector('.answer-choice.selected');
        if (!selected) {
            ctx.answerMessage.textContent = '❌ 請選擇一個答案';
            if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
            return null;
        }
        const raw = selected.dataset.value || selected.dataset.choiceKey || selected.textContent || '';
        const answer = String(raw).trim();
        if (!answer) {
            ctx.answerMessage.textContent = '❌ 選項資料異常，請重新選擇一次';
            if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
            return null;
        }
        return answer;
    }

    function resolveTextAnswer(ctx, textInput) {
        const answer = textInput?.value?.trim() || '';
        if (!answer) {
            ctx.answerMessage.textContent = '❌ 請輸入答案';
            if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
            return null;
        }
        return answer;
    }

    async function uploadAttachedPhoto(ctx, { photoInput, hasPhotoDraft }) {
        const fd = new FormData();
        if (hasPhotoDraft) {
            const draftBlob = await dataUrlToBlob(ctx.currentAnswerPhotoDataUrl);
            fd.append('photo', draftBlob, 'reticle-capture.jpg');
        } else {
            fd.append('photo', photoInput.files[0]);
        }
        ctx.answerMessage.textContent = '📤 上傳照片中...';
        ctx.showQueryTransit('正在將照片上傳至冒險艙資料庫...');
        let uploadData;
        try {
            uploadData = await ctx.requestJson('/api/upload', { method: 'POST', body: fd }, '上傳照片');
        } catch (err) {
            ctx.hideQueryTransit();
            ctx.answerMessage.textContent = `❌ ${err.message}`;
            if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
            return null;
        }
        ctx.hideQueryTransit();
        if (!uploadData.success) {
            ctx.answerMessage.textContent = '❌ 上傳失敗';
            if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
            return null;
        }
        return uploadData.url;
    }

    async function submitAiPhotoAnswer(ctx, { photoInput, hasPhotoDraft, tutorialPassMode, tutorialGuestMode }) {
        const fd = new FormData();
        if (hasPhotoDraft) {
            const draftBlob = await dataUrlToBlob(ctx.currentAnswerPhotoDataUrl);
            fd.append('image', draftBlob, 'reticle-capture.jpg');
        } else {
            fd.append('image', photoInput.files[0]);
        }
        ctx.answerMessage.textContent = tutorialPassMode ? '⏳ 正在整理教學判定...' : '⏳ AI 判定中...';
        ctx.showQueryTransit(tutorialPassMode ? '教學模式判定中，請稍候...' : '潮汐裁判・鯨語正在仔細檢查你的照片...');
        const endpoint = tutorialPassMode
            ? `/api/tutorial/ai-tasks/${ctx.currentTask.id}/submit`
            : `/api/ai-tasks/${ctx.currentTask.id}/submit`;
        let aiData;
        try {
            aiData = await ctx.requestJson(endpoint, { method: 'POST', body: fd }, '送出 AI 圖片判定');
        } catch (err) {
            ctx.hideQueryTransit();
            ctx.answerMessage.textContent = `❌ ${err.message}`;
            await ctx.showNpcDialog({
                speakerKey: 'rescue',
                mood: '連線中斷',
                text: `海羽偵測到冒險艙目前沒有成功送出這張照片。\n\n${err.message}\n\n先確認網路或重新整理後再試一次。`
            });
            ctx.btnAnswerSubmit.disabled = false;
            return;
        }
        ctx.hideQueryTransit();
        const judgeSummary = ctx.normalizeUiText(aiData.reason, '') || ctx.normalizeUiText(aiData.message, 'AI 已完成判定。');
        const retrySummary = ctx.normalizeUiText(aiData.retry_advice, '');
        ctx.answerMessage.textContent = judgeSummary ? `🤖 ${judgeSummary}` : '🤖 AI 已完成判定';

        if (aiData.success && aiData.passed) {
            const nextUserTaskId = aiData.user_task_id || ctx.currentUserTaskId;
            if (ctx.setCurrentUserTaskId) ctx.setCurrentUserTaskId(nextUserTaskId);
            ctx.resetPhotoCaptureState();
            ctx.answerModal.classList.add('hidden');
            if (ctx.setTutorialFlowStarted) ctx.setTutorialFlowStarted(false);
            ctx.renderTutorialModeUi();
            const successText = tutorialPassMode
                ? `鯨語已經看完你上傳的畫面。\n\n${judgeSummary}\n\n教學模式先替你放行，讓你可以把整段流程順順走完。`
                : `${judgeSummary}${retrySummary ? `\n\n補充：${retrySummary}` : ''}`;
            const storyJudgeAutoClose = tutorialPassMode ? null : (ctx.currentEntryMode === 'board_game' ? 2800 : null);
            if (ctx.currentEntryMode === 'board_game' && ctx.currentBoardRun?.pendingTargetTile) {
                await ctx.completeBoardTurn(true, {
                    speakerKey: 'judge',
                    mood: tutorialPassMode ? '教學判定' : 'AI 通關',
                    text: successText,
                    autoCloseMs: tutorialPassMode ? null : 2800
                });
            } else {
                if (tutorialGuestMode) ctx.completeTutorialGuestTask(ctx.currentTask);
                await ctx.showNpcDialog({
                    speakerKey: 'judge',
                    mood: tutorialPassMode ? '教學判定' : 'AI 通關',
                    text: successText,
                    buttonLabel: tutorialPassMode ? '我知道了' : null,
                    autoCloseMs: storyJudgeAutoClose,
                    blocking: tutorialPassMode
                });
            }
            ctx.scheduleStoryReloadAfterCompletion();
            const tutorialCompletionText = judgeSummary
                ? `🤖 鯨語判定：${judgeSummary}\n✅ 教學模式已完成這一步`
                : '✅ 教學模式已完成這一步';
            ctx.showCompletionModal(
                aiData.earnedItemName
                    ? `🎁 獲得：${aiData.earnedItemName}`
                    : (tutorialPassMode ? tutorialCompletionText : (aiData.message || '✅ AI 驗證通過'))
            );
            return;
        }

        triggerShakeError();
        const failText = judgeSummary || retrySummary || 'AI 驗證未通過，請再試一次';
        const tutorialWrongTargetText = tutorialPassMode
            ? `鯨語看完這張照片後說：\n\n${judgeSummary || '不是這個喔。'}\n\n因為現在是教學模式，所以海羽還是先讓你往下走，正式關卡時就需要拍到指定物件才會通過。`
            : null;
        if (ctx.currentEntryMode === 'board_game' && ctx.currentBoardRun?.pendingTargetTile) {
            ctx.resetPhotoCaptureState();
            ctx.answerModal.classList.add('hidden');
            if (tutorialPassMode) {
                await ctx.completeBoardTurn(true, {
                    speakerKey: 'judge',
                    mood: '教學判定',
                    text: tutorialWrongTargetText,
                    autoCloseMs: null,
                    buttonLabel: '我知道了',
                    blocking: true
                });
            } else {
                await ctx.completeBoardTurn(false, {
                    speakerKey: 'judge',
                    mood: '未通過',
                    text: retrySummary ? `${judgeSummary || '這次還沒通過。'}\n\n海羽建議：${retrySummary}` : failText,
                    autoCloseMs: 2800
                });
            }
            return;
        }
        if (tutorialPassMode) {
            ctx.answerMessage.textContent = `🤖 ${judgeSummary || '不是這個喔，但教學模式會先放行'}`;
            ctx.resetPhotoCaptureState();
            ctx.answerModal.classList.add('hidden');
            if (ctx.setTutorialFlowStarted) ctx.setTutorialFlowStarted(false);
            ctx.renderTutorialModeUi();
            if (tutorialGuestMode) ctx.completeTutorialGuestTask(ctx.currentTask);
            await ctx.showNpcDialog({
                speakerKey: 'judge',
                mood: '教學判定',
                text: tutorialWrongTargetText,
                buttonLabel: '我知道了',
                blocking: true
            });
            ctx.scheduleStoryReloadAfterCompletion();
            ctx.showCompletionModal(aiData.earnedItemName ? `🎁 獲得：${aiData.earnedItemName}` : '✅ 教學模式已完成這一步');
            return;
        }
        ctx.answerMessage.textContent = `❌ ${failText}`;
        if (ctx.setPhotoCaptureModeActive) ctx.setPhotoCaptureModeActive(true);
        ctx.setImmersiveCameraMode(true);
        ctx.renderTutorialModeUi();
        await ctx.showNpcDialog({
            speakerKey: 'rescue',
            mood: '裁定未通過',
            text: retrySummary
                ? `鯨語的裁定是：${judgeSummary || '這次還沒通過。'}\n\n海羽補充：${retrySummary}`
                : `鯨語的裁定是：${failText}\n\n海羽建議你再整理一下畫面，重新挑戰。`,
            buttonLabel: '重新挑戰'
        });
        ctx.btnAnswerSubmit.disabled = false;
    }

    async function handleChoiceTutorialPassThrough(ctx, answer, tutorialGuestMode) {
        ctx.answerModal.classList.add('hidden');
        if (ctx.setTutorialFlowStarted) ctx.setTutorialFlowStarted(false);
        ctx.renderTutorialModeUi();
        if (ctx.currentEntryMode === 'board_game' && ctx.currentBoardRun?.pendingTargetTile) {
            await ctx.completeBoardTurn(true, {
                speakerKey: 'lore',
                mood: '教學選擇',
                text: `潮聲已記住你的選擇：「${answer}」。\n\n教學模式先替你通過這一格，讓你把完整流程走完。`,
                autoCloseMs: 2400
            });
        } else {
            if (tutorialGuestMode) {
                ctx.completeTutorialGuestTask(ctx.currentTask);
            } else if (ctx.getLoginUser()) {
                await ctx.completeTutorialLoggedInTask(ctx.currentTask, answer);
            }
            await ctx.showNpcDialog({
                speakerKey: 'lore',
                mood: '教學選擇',
                text: `潮聲已記住你的選擇：「${answer}」。\n\n教學模式先替你通過這一關，讓你把完整流程走完。`,
                buttonLabel: '繼續前進'
            });
            ctx.scheduleStoryReloadAfterCompletion();
        }
        ctx.showCompletionModal('✅ 教學模式已完成這一步');
        if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
    }

    async function handleGenericTutorialPassThrough(ctx, answer, tutorialGuestMode) {
        if (ctx.currentTask.task_type === 'photo') ctx.resetPhotoCaptureState();
        ctx.answerModal.classList.add('hidden');
        if (ctx.setTutorialFlowStarted) ctx.setTutorialFlowStarted(false);
        ctx.renderTutorialModeUi();
        if (ctx.currentEntryMode === 'board_game' && ctx.currentBoardRun?.pendingTargetTile) {
            await ctx.completeBoardTurn(true, {
                speakerKey: ctx.currentTask.task_type === 'number' ? 'judge' : 'lore',
                mood: '教學模式通關',
                text: `樂樂園已記錄你的操作：「${answer || '已提交'}」。\n\n教學模式先替你通過這一步，讓你繼續往下走。`,
                autoCloseMs: 2400
            });
        } else {
            if (tutorialGuestMode) {
                ctx.completeTutorialGuestTask(ctx.currentTask);
            } else if (ctx.getLoginUser()) {
                await ctx.completeTutorialLoggedInTask(ctx.currentTask, answer);
            }
            await ctx.showNpcDialog({
                speakerKey: 'judge',
                mood: '教學模式通關',
                text: `樂樂園已記錄你的操作：「${answer || '已提交'}」。\n\n教學模式先替你通過這一步，讓你繼續往下走。`,
                buttonLabel: '繼續前進'
            });
            ctx.scheduleStoryReloadAfterCompletion();
        }
        ctx.showCompletionModal('✅ 教學模式已完成這一步');
        if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
    }

    async function resolveUserTaskId(ctx) {
        if (ctx.currentUserTaskId) return ctx.currentUserTaskId;
        let id = await ctx.fetchCurrentUserTaskId();
        if (id) {
            ctx.currentUserTaskId = id;
            return id;
        }
        id = await ctx.createCurrentUserTaskRecord();
        if (id) {
            ctx.currentUserTaskId = id;
            return id;
        }
        return null;
    }

    async function ensureUserTaskIdOrFail(ctx) {
        try {
            await resolveUserTaskId(ctx);
        } catch (err) {
            const message = err?.message || '無法建立關卡紀錄，請稍後再試';
            ctx.answerMessage.textContent = `❌ ${message}`;
            if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
            return false;
        }
        if (!ctx.currentUserTaskId) {
            ctx.answerMessage.textContent = '❌ 無法建立關卡紀錄，請重新整理後再試';
            if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
            return false;
        }
        return true;
    }

    async function dispatchAnswerViaApi(ctx, answer, hasChoiceField) {
        const ok = await ensureUserTaskIdOrFail(ctx);
        if (!ok) return;

        ctx.btnAnswerSubmit.disabled = true;
        ctx.answerMessage.textContent = hasChoiceField ? '✅ 已送出答案，資料確認中...' : '⏳ 驗證中...';
        ctx.showQueryTransit(hasChoiceField ? '已收到你的答案，正在確認是否通關...' : '正在將結果送回樂樂園...');
        let data;
        try {
            data = await ctx.requestJson(`/api/user-tasks/${ctx.currentUserTaskId}/answer`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answer })
            }, '送出答案');
        } catch (err) {
            ctx.hideQueryTransit();
            ctx.answerMessage.textContent = `❌ ${err.message}`;
            await ctx.showNpcDialog({
                speakerKey: 'rescue',
                mood: '送出失敗',
                text: `海羽沒能把這份答案成功送進冒險艙。\n\n${err.message}\n\n請稍後再試一次。`
            });
            ctx.btnAnswerSubmit.disabled = false;
            return;
        }
        ctx.hideQueryTransit();

        if (data.success && (data.isCompleted || (data.message && data.message.includes('已完成')))) {
            if (ctx.currentTask.task_type === 'photo') ctx.resetPhotoCaptureState();
            ctx.answerModal.classList.add('hidden');
            if (ctx.setTutorialFlowStarted) ctx.setTutorialFlowStarted(false);
            ctx.renderTutorialModeUi();
            const judgeText = ctx.normalizeUiText(data.message, '這一關已完成，下一段劇情正在展開。');
            if (ctx.currentEntryMode === 'board_game' && ctx.currentBoardRun?.pendingTargetTile) {
                await ctx.completeBoardTurn(true, {
                    speakerKey: 'judge',
                    mood: '規則通關',
                    text: judgeText,
                    autoCloseMs: 2200
                });
            } else {
                await ctx.showNpcDialog({
                    speakerKey: 'judge',
                    mood: ctx.isCurrentQuestTutorialMode() ? '教學模式通關' : (ctx.isCurrentQuestDemoMode() ? '體驗模式通關' : '規則通關'),
                    text: judgeText,
                    autoCloseMs: 2200
                });
            }
            ctx.scheduleStoryReloadAfterCompletion();
            ctx.showCompletionModal(data.earnedItemName ? `🎁 獲得：${data.earnedItemName}` : '✅ 任務已完成');
            if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
            return;
        }

        triggerShakeError();
        const failText = data.message || '答案錯誤，請重試';
        if (ctx.currentEntryMode === 'board_game' && ctx.currentBoardRun?.pendingTargetTile) {
            if (ctx.currentTask.task_type === 'photo') ctx.resetPhotoCaptureState();
            ctx.answerModal.classList.add('hidden');
            await ctx.completeBoardTurn(false, {
                speakerKey: 'rescue',
                mood: '規則未通過',
                text: `${failText}，這一步會依棋盤規則回退後重新展開。`,
                autoCloseMs: 2400
            });
            if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
            return;
        }

        ctx.answerMessage.textContent = '❌ ' + failText;
        if (ctx.currentTask.task_type === 'photo') {
            if (ctx.setPhotoCaptureModeActive) ctx.setPhotoCaptureModeActive(true);
            ctx.setImmersiveCameraMode(true);
            ctx.renderTutorialModeUi();
        }
        ctx.btnAnswerSubmit.disabled = false;
        ctx.showNpcDialog({
            speakerKey: 'rescue',
            mood: '規則未通過',
            text: `這一題還沒有通過。\n\n海羽提醒：${failText}`,
            autoCloseMs: 2200,
            blocking: false
        });
    }

    async function submitPhotoAnswer(ctx, { photoInput, hasPhotoDraft, tutorialPassMode, tutorialGuestMode }) {
        if (!hasPhotoDraft && !photoInput?.files?.[0]) {
            ctx.answerMessage.textContent = ctx.isPhotoTaskCaptureActive() ? '❌ 請先拍下一張畫面' : '❌ 請先選擇一張照片';
            if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = false;
            return { handled: true };
        }
        const isAiPhotoTask = ctx.currentTask.validation_mode && ctx.currentTask.validation_mode.startsWith('ai_');
        if (isAiPhotoTask) {
            await submitAiPhotoAnswer(ctx, { photoInput, hasPhotoDraft, tutorialPassMode, tutorialGuestMode });
            return { handled: true };
        }
        const uploadedUrl = await uploadAttachedPhoto(ctx, { photoInput, hasPhotoDraft });
        if (uploadedUrl === null) return { handled: true };
        return { answer: uploadedUrl };
    }

    async function submitChoiceAnswer(ctx, { tutorialPassMode, tutorialGuestMode }) {
        const answer = resolveChoiceAnswer(ctx);
        if (!answer) return { handled: true };
        if (!tutorialPassMode) {
            if (ctx.setAnswerChoicePendingState) ctx.setAnswerChoicePendingState(true);
            ctx.answerMessage.textContent = '✅ 已送出答案，系統正在確認中...';
        } else {
            await handleChoiceTutorialPassThrough(ctx, answer, tutorialGuestMode);
            return { handled: true };
        }
        return { answer };
    }

    function submitTextAnswer(ctx, textInput) {
        const answer = resolveTextAnswer(ctx, textInput);
        if (!answer) return { handled: true };
        return { answer };
    }

    async function submitTaskAnswer(ctx) {
        if (!ctx.currentTask) return;
        if (ctx.btnAnswerSubmit) ctx.btnAnswerSubmit.disabled = true;
        ctx.setAnswerSubmitLoadingState(true, '系統確認中...');

        try {
            const photoInput = document.getElementById('answerPhotoInput');
            const textInput = document.getElementById('answerTextInput');
            const choiceNodes = Array.from(document.querySelectorAll('.answer-choice'));
            const hasChoiceField = choiceNodes.length > 0;
            const hasPhotoDraft = Boolean(ctx.currentAnswerPhotoDataUrl);
            const tutorialPassMode = ctx.isCurrentQuestDemoMode() || ctx.isCurrentQuestTutorialMode();
            const tutorialGuestMode = ctx.isTutorialGuestMode();

            let answer = '';
            if (ctx.currentTask.task_type === 'photo') {
                const result = await submitPhotoAnswer(ctx, { photoInput, hasPhotoDraft, tutorialPassMode, tutorialGuestMode });
                if (result.handled) return;
                answer = result.answer;
            } else if (hasChoiceField) {
                const result = await submitChoiceAnswer(ctx, { tutorialPassMode, tutorialGuestMode });
                if (result.handled) return;
                answer = result.answer;
            } else {
                const result = submitTextAnswer(ctx, textInput);
                if (result.handled) return;
                answer = result.answer;
            }

            if (tutorialPassMode) {
                await handleGenericTutorialPassThrough(ctx, answer, tutorialGuestMode);
                return;
            }

            await dispatchAnswerViaApi(ctx, answer, hasChoiceField);
        } finally {
            ctx.resetAnswerSubmitUi();
        }
    }

    async function submitLockCode(ctx) {
        const tutorialPassMode = ctx.isCurrentQuestDemoMode() || ctx.isCurrentQuestTutorialMode();
        if (tutorialPassMode) {
            ctx.lockOverlay.classList.add('hidden');
            if (ctx.setTutorialFlowStarted) ctx.setTutorialFlowStarted(false);
            ctx.renderTutorialModeUi();
            if (ctx.currentEntryMode === 'board_game' && ctx.currentBoardRun?.pendingTargetTile) {
                await ctx.completeBoardTurn(true, {
                    speakerKey: 'judge',
                    mood: '教學解鎖',
                    text: `樂樂園已記錄這組密碼：「${ctx.getLockCode()}」。\n\n教學模式先替你通過這一格，讓你繼續往前。`,
                    autoCloseMs: 2400
                });
            } else {
                if (ctx.isTutorialGuestMode()) {
                    ctx.completeTutorialGuestTask(ctx.currentTask);
                } else if (ctx.getLoginUser()) {
                    await ctx.completeTutorialLoggedInTask(ctx.currentTask, ctx.getLockCode());
                }
                await ctx.showNpcDialog({
                    speakerKey: 'judge',
                    mood: '教學解鎖',
                    text: `樂樂園已記錄這組密碼：「${ctx.getLockCode()}」。\n\n教學模式先替你通過這一關，讓你繼續往下走。`,
                    buttonLabel: '繼續前進'
                });
                ctx.scheduleStoryReloadAfterCompletion();
            }
            ctx.showCompletionModal('✅ 教學模式已完成這一步');
            return;
        }

        try {
            await resolveUserTaskId(ctx);
        } catch (err) {
            const setLockMsg = (text) => { if (ctx.lockMsg) ctx.lockMsg.textContent = text; };
            setLockMsg(err?.message || '無法建立關卡紀錄');
            return;
        }
        const setLockMsg = (text) => { if (ctx.lockMsg) ctx.lockMsg.textContent = text; };
        if (!ctx.currentUserTaskId) {
            setLockMsg('無法建立關卡紀錄');
            return;
        }
        setLockMsg('驗證中...');
        let data;
        ctx.showQueryTransit('正在將密碼送回樂樂園...');
        try {
            data = await ctx.requestJson(`/api/user-tasks/${ctx.currentUserTaskId}/answer`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answer: ctx.getLockCode() })
            }, '送出密碼答案');
        } catch (err) {
            ctx.hideQueryTransit();
            triggerShakeError();
            setLockMsg(err.message);
            await ctx.showNpcDialog({
                speakerKey: 'rescue',
                mood: '送出失敗',
                text: `海羽無法把密碼結果送回冒險艙。\n\n${err.message}`
            });
            return;
        }
        ctx.hideQueryTransit();

        if (data.success && data.isCompleted) {
            ctx.lockOverlay.classList.add('hidden');
            if (ctx.setTutorialFlowStarted) ctx.setTutorialFlowStarted(false);
            ctx.renderTutorialModeUi();
            if (ctx.currentEntryMode === 'board_game' && ctx.currentBoardRun?.pendingTargetTile) {
                await ctx.completeBoardTurn(true, {
                    speakerKey: 'judge',
                    mood: '密碼通關',
                    text: data.message || '密碼鎖已解除，棋盤正在推進。',
                    autoCloseMs: 2200
                });
            } else {
                await ctx.showNpcDialog({
                    speakerKey: 'judge',
                    mood: '密碼通關',
                    text: data.message || '鎖陣已解除，前路已為你打開。',
                    autoCloseMs: 2200
                });
            }
            ctx.showCompletionModal(data.earnedItemName ? `🎁 獲得：${data.earnedItemName}` : '✅ 任務已完成');
            return;
        }

        triggerShakeError();
        const failText = data.message || '答案錯誤';
        if (ctx.currentEntryMode === 'board_game' && ctx.currentBoardRun?.pendingTargetTile) {
            ctx.lockOverlay.classList.add('hidden');
            await ctx.completeBoardTurn(false, {
                speakerKey: 'rescue',
                mood: '密碼失誤',
                text: `${failText}，這一步會依棋盤規則退回並重新整隊。`,
                autoCloseMs: 2400
            });
        } else {
            setLockMsg(failText);
            await ctx.showNpcDialog({
                speakerKey: 'rescue',
                mood: '密碼失誤',
                text: `鎖陣還沒解除。\n\n海羽提醒：${failText}`
            });
        }
    }

    return {
        submitTaskAnswer,
        submitLockCode
    };
})();
