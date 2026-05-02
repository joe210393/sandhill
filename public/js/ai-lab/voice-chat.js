window.AiLabVoiceChat = (function() {
    function createController(config) {
        const ctx = { ...config };
        let speechRecognition = null;
        let isRecording = false;
        let speechRecognitionSupported = false;

        function updateVoicePanel(userText, aiText, statusText) {
            const { voicePanel, voiceUser, voiceAi, voiceStatus, syncCompactUxState } = ctx;
            if (!voicePanel) return;
            voicePanel.classList.remove('hidden');
            if (voiceUser && userText !== undefined) voiceUser.textContent = userText || '—';
            if (voiceAi && aiText !== undefined) voiceAi.textContent = aiText || '—';
            if (voiceStatus && statusText !== undefined) voiceStatus.textContent = statusText;
            if (typeof syncCompactUxState === 'function') syncCompactUxState();
        }

        function openVoicePanel() {
            const { voicePanel, syncCompactUxState } = ctx;
            if (voicePanel) voicePanel.classList.remove('hidden');
            if (typeof syncCompactUxState === 'function') syncCompactUxState();
        }

        function setVoiceButtonsRecordingState(active) {
            const { micBtn, floatingMicBtn, voiceRecordBtn } = ctx;
            if (micBtn) micBtn.classList.toggle('active', active);
            if (floatingMicBtn) floatingMicBtn.classList.toggle('active', active);
            if (voiceRecordBtn) {
                voiceRecordBtn.classList.toggle('active', active);
                voiceRecordBtn.textContent = active ? '⏹️ 停止收音' : '🎙️ 開始說話';
            }
        }

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
            if (ctx.voiceStatus) ctx.voiceStatus.textContent = '可送出提問';
        }

        function closeVoicePanel() {
            stopVoiceRecognition();
            if (ctx.voicePanel) ctx.voicePanel.classList.add('hidden');
            if (typeof ctx.syncCompactUxState === 'function') ctx.syncCompactUxState();
        }

        function resetVoiceComposer() {
            if (ctx.voiceDraftInput) ctx.voiceDraftInput.value = '';
            if (ctx.voiceUser) ctx.voiceUser.textContent = '—';
            if (ctx.voiceAi) ctx.voiceAi.textContent = '—';
            if (ctx.voiceStatus) ctx.voiceStatus.textContent = '語音待命';
        }

        function extractReplyText(rawText) {
            const cleanedText = String(rawText || '').replace(/```(?:xml|json)?|```/gi, '').trim();
            const replyMatch = cleanedText.match(/<reply>([\s\S]*?)<\/reply>/i);
            const analysisMatch = cleanedText.match(/<analysis>([\s\S]*?)<\/analysis>/i);
            return replyMatch
                ? replyMatch[1].trim()
                : (cleanedText || (analysisMatch ? analysisMatch[1].trim() : ''));
        }

        async function sendVoiceChat(userText) {
            const normalizedQuestion = ctx.normalizeUiText(userText, '');
            if (!normalizedQuestion) {
                updateVoicePanel('', '', '請先輸入或說出問題');
                return;
            }
            try {
                ctx.hideAnswerToast();
                ctx.showQueryTransit('問題已摺成紙飛機送出...');
                if (ctx.voiceSendBtn) ctx.voiceSendBtn.disabled = true;
                updateVoicePanel(normalizedQuestion, '思考中...', '正在分析取景框');
                const snapshot = ctx.captureCurrentReticleDataUrl();
                if (!snapshot) {
                    throw new Error('無法擷取圈內畫面');
                }

                let finalSystemPrompt = ctx.systemPromptInput && ctx.systemPromptInput.value ? ctx.systemPromptInput.value : '';
                if (!finalSystemPrompt || finalSystemPrompt.length < 10) {
                    const fallbackScript = ctx.getActiveScript();
                    finalSystemPrompt = fallbackScript ? fallbackScript.system : finalSystemPrompt;
                }

                const locationTextForPrompt = ctx.getLocationText();
                if (locationTextForPrompt) {
                    finalSystemPrompt += '\n\n【拍攝地點資訊】' + locationTextForPrompt;
                }
                finalSystemPrompt += '\n\n【輸出語言】' + ctx.getLanguageInstruction();
                finalSystemPrompt += '\n\n【回答規範】你是即時視覺導覽助手。請根據取景框截圖與使用者提問，用自然、直接的口吻回答 2 到 4 句。不要輸出 XML、JSON、analysis、步驟清單。若看不清楚，就坦白說並給出重新拍攝建議。不要提到你是根據座標推斷。';

                let gpsData = null;
                try {
                    if (navigator.geolocation) {
                        const pos = await new Promise((resolve, reject) => {
                            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000, enableHighAccuracy: false });
                        });
                        gpsData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                        ctx.setLastLatLng(gpsData);
                    }
                } catch (gpsErr) {
                    console.warn('語音提問略過 GPS', gpsErr);
                }

                const finalUserPrompt = '這是使用者目前在手機取景框中看到的畫面。請先理解畫面主體，再回答這個問題：'
                    + normalizedQuestion
                    + (locationTextForPrompt ? '\n\n拍攝地點：' + locationTextForPrompt : '');
                const result = await ctx.analyzeVisionQuestion(snapshot, finalSystemPrompt, finalUserPrompt, gpsData);
                const answerText = extractReplyText(result.description || result.message || result.reply || '') || '我看到了畫面，但目前沒有足夠資訊回答。';
                await ctx.playQueryReturnAnimation('AI 紙飛機帶回了答案');
                ctx.showAnswerToast(answerText);
                updateVoicePanel(normalizedQuestion, answerText, '已回覆');
                if (ctx.voiceSpeakToggle?.checked && window.speechSynthesis) {
                    const utterance = new SpeechSynthesisUtterance(answerText);
                    utterance.lang = ctx.getSpeechLocale();
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(utterance);
                }
            } catch (err) {
                console.error('語音提問失敗:', err);
                const message = err?.message || '語音提問失敗，請稍後再試';
                await ctx.playQueryReturnAnimation('紙飛機帶回了錯誤訊息');
                ctx.showAnswerToast(message);
                updateVoicePanel(normalizedQuestion, message, '發送失敗');
            } finally {
                ctx.hideQueryTransit();
                if (ctx.voiceSendBtn) ctx.voiceSendBtn.disabled = false;
            }
        }

        function initSpeechChat() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            speechRecognitionSupported = Boolean(SpeechRecognition);
            if (SpeechRecognition) {
                speechRecognition = new SpeechRecognition();
                speechRecognition.lang = ctx.getSpeechLocale();
                speechRecognition.interimResults = true;
                speechRecognition.continuous = false;
                speechRecognition.onstart = () => {
                    isRecording = true;
                    setVoiceButtonsRecordingState(true);
                    updateVoicePanel(ctx.voiceDraftInput?.value || '', ctx.voiceAi?.textContent || '—', '正在聆聽...');
                };
                speechRecognition.onresult = (event) => {
                    const transcript = Array.from(event.results)
                        .map((result) => result[0]?.transcript || '')
                        .join('')
                        .trim();
                    if (ctx.voiceDraftInput) ctx.voiceDraftInput.value = transcript;
                    if (ctx.voiceUser) ctx.voiceUser.textContent = transcript || '—';
                    if (ctx.voiceStatus) ctx.voiceStatus.textContent = event.results[event.results.length - 1]?.isFinal ? '可送出提問' : '辨識中...';
                };
                speechRecognition.onerror = (event) => {
                    console.warn('語音辨識失敗', event.error);
                    isRecording = false;
                    setVoiceButtonsRecordingState(false);
                    if (ctx.voiceStatus) ctx.voiceStatus.textContent = '語音辨識失敗，可改用文字輸入';
                };
                speechRecognition.onend = () => {
                    isRecording = false;
                    setVoiceButtonsRecordingState(false);
                    if (ctx.voiceStatus) ctx.voiceStatus.textContent = '可送出提問';
                };
            }

            const startOrToggleRecording = () => {
                openVoicePanel();
                if (!speechRecognitionSupported || !speechRecognition) {
                    if (ctx.voiceStatus) ctx.voiceStatus.textContent = '此瀏覽器不支援語音辨識，可直接輸入文字';
                    ctx.voiceDraftInput?.focus();
                    return;
                }
                if (isRecording) {
                    stopVoiceRecognition();
                    return;
                }
                try {
                    speechRecognition.lang = ctx.getSpeechLocale();
                    speechRecognition.start();
                } catch (err) {
                    console.warn('啟動語音辨識失敗', err);
                    if (ctx.voiceStatus) ctx.voiceStatus.textContent = '語音啟動失敗，可直接輸入文字';
                }
            };

            const submitDraft = () => {
                const text = ctx.normalizeUiText(ctx.voiceDraftInput?.value, '');
                sendVoiceChat(text);
            };

            ctx.micBtn?.addEventListener('click', startOrToggleRecording);
            ctx.floatingMicBtn?.addEventListener('click', startOrToggleRecording);
            ctx.voiceRecordBtn?.addEventListener('click', startOrToggleRecording);
            ctx.voiceSendBtn?.addEventListener('click', submitDraft);
            ctx.voiceDraftInput?.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submitDraft();
                }
            });
            ctx.voiceCloseBtn?.addEventListener('click', closeVoicePanel);
            resetVoiceComposer();
        }

        return {
            closeVoicePanel,
            initSpeechChat,
            resetVoiceComposer,
            sendVoiceChat,
            stopVoiceRecognition
        };
    }

    return { createController };
})();
