(function(global) {
    function createController(deps = {}) {
        const {
            elements = {},
            capturedPhotos = [],
            runtimeState,
            getActiveScript = () => null,
            getLanguageInstruction = () => '',
            combinePhotosToGrid,
            analyzePhotos,
            startThinkingAnimation = () => {},
            setThinkingStage = () => {},
            stopThinkingAnimation = () => {},
            updateLoadingMessage = () => {},
            stopVoiceRecognition = () => {},
            hideAnswerToast = () => {},
            showAnswerToast = () => {},
            showQueryTransit = () => {},
            hideQueryTransit = () => {},
            collapseResultPanel = () => {},
            playQueryReturnAnimation = async () => {},
            updatePreviewArea = () => {},
            retry = () => {}
        } = deps;

        const {
            analyzeBtn,
            addPhotoBtn,
            aiResult,
            aiLoading,
            rawOutput,
            systemPromptInput,
            userPromptInput
        } = elements;

        function getLastLocationText() {
            const text = runtimeState?.get('lastLocationText') || '';
            if (text) return text;
            const last = runtimeState?.get('lastLatLng');
            if (last) return `緯度 ${last.latitude.toFixed(5)}，經度 ${last.longitude.toFixed(5)}`;
            return '';
        }

        function resolveFinalPrompts() {
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

            const locationTextForPrompt = getLastLocationText();
            if (locationTextForPrompt) {
                finalSystemPrompt += `\n\n【拍攝地點資訊】${locationTextForPrompt}`;
                finalUserPrompt += `\n\n拍攝地點：${locationTextForPrompt}`;
            }
            finalSystemPrompt += `\n\n【輸出語言】${getLanguageInstruction()}`;

            if (capturedPhotos.length > 1) {
                finalUserPrompt += `\n\n【注意】這是從 ${capturedPhotos.length} 個不同角度拍攝的照片組合，請綜合分析所有角度的特徵。`;
            }

            return { finalSystemPrompt, finalUserPrompt };
        }

        async function tryQuickGps() {
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000, enableHighAccuracy: false });
                });
                const gpsData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                if (runtimeState) runtimeState.set('lastLatLng', gpsData);
                return gpsData;
            } catch (gpsErr) {
                console.warn('GPS 略過', gpsErr);
                return null;
            }
        }

        function extractDisplayText(result) {
            let text = result?.description || '';
            const replyMatch = text.match(/<reply>([\s\S]*?)<\/reply>/i);
            if (replyMatch) text = replyMatch[1].trim();
            return text;
        }

        function buildErrorMessage(err) {
            if (!err) return '系統錯誤';
            const msg = err.message || '';
            if (msg.includes('fetch') || msg.includes('Failed')) return 'AI 服務暫時無法連線';
            if (msg.includes('timeout')) return 'AI 回應超時';
            return msg || '系統錯誤';
        }

        function renderErrorPanel(message) {
            if (!aiResult) return;
            aiResult.innerHTML = `
                    <div style="text-align: center; padding: 16px;">
                        <div style="font-size: 28px; margin-bottom: 8px;">⚠️</div>
                        <div style="color: #c62828; font-weight: 500;">${message}</div>
                        <div style="color: #666; font-size: 13px; margin-top: 8px;">請稍後再試</div>
                    </div>
                `;
        }

        function setBusy(busy) {
            if (analyzeBtn) analyzeBtn.disabled = busy;
            if (addPhotoBtn) addPhotoBtn.disabled = busy;
        }

        async function handleAnalyze() {
            stopVoiceRecognition();
            setBusy(true);
            hideAnswerToast();
            showQueryTransit('照片問題已摺成紙飛機送出...');
            collapseResultPanel();

            if (aiResult) aiResult.innerHTML = '';
            if (rawOutput) rawOutput.style.display = 'none';
            if (aiLoading) aiLoading.classList.remove('hidden');

            startThinkingAnimation();
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

            try {
                const { finalSystemPrompt, finalUserPrompt } = resolveFinalPrompts();
                const gpsData = await tryQuickGps();

                setThinkingStage('upload');
                const imageToSend = await combinePhotosToGrid(capturedPhotos);
                if (!imageToSend) throw new Error('無法處理照片');
                updatePreviewArea();

                setThinkingStage('analyze');
                updateLoadingMessage('🔍 正在分析圖片...');

                const result = await analyzePhotos(imageToSend, finalSystemPrompt, finalUserPrompt, gpsData);
                console.log('🤖 API 回應:', result);

                setThinkingStage('finalize');
                await new Promise((r) => setTimeout(r, 200));
                stopThinkingAnimation();

                const displayText = extractDisplayText(result);
                await playQueryReturnAnimation('AI 紙飛機帶回了答案');
                showAnswerToast(displayText);
                if (aiLoading) aiLoading.classList.add('hidden');
                if (analyzeBtn) analyzeBtn.textContent = '再次辨識';
                retry();
            } catch (err) {
                console.error('API 錯誤:', err);
                stopThinkingAnimation();
                const errorMessage = buildErrorMessage(err);
                renderErrorPanel(errorMessage);
                await playQueryReturnAnimation('紙飛機帶回了錯誤訊息');
                showAnswerToast(errorMessage);
            } finally {
                hideQueryTransit();
                stopThinkingAnimation();
                if (aiLoading) aiLoading.classList.add('hidden');
                setBusy(false);
                if (analyzeBtn && analyzeBtn.textContent !== '再次辨識') {
                    analyzeBtn.textContent = '再次辨識';
                }
            }
        }

        function bind() {
            if (!analyzeBtn) return;
            analyzeBtn.addEventListener('click', handleAnalyze);
        }

        return {
            bind,
            handleAnalyze
        };
    }

    global.AiLabAnalyzeFlow = {
        createController
    };
})(window);
