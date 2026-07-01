window.AiLabVisionQuestion = (function() {
    async function analyzeVisionQuestion(photoDataUrl, systemPrompt, userPrompt, gpsData) {
        const dataUrlToBlob = window.AiLabDataUrl?.dataUrlToBlob;
        if (typeof dataUrlToBlob !== 'function') {
            throw new Error('圖片轉換模組尚未載入，請重新整理頁面');
        }

        const blob = await dataUrlToBlob(photoDataUrl);
        const formData = new FormData();
        formData.append('image', blob, 'voice-capture.jpg');
        formData.append('systemPrompt', systemPrompt);
        formData.append('userPrompt', userPrompt);
        formData.append('simpleMode', 'true');
        formData.append('skipRag', 'true');
        if (gpsData) {
            formData.append('latitude', gpsData.latitude);
            formData.append('longitude', gpsData.longitude);
        }

        const apiRes = await fetch('/api/vision-test', {
            method: 'POST',
            body: formData
        });
        if (!apiRes.ok) {
            let message = '視覺提問失敗';
            try {
                const errData = await apiRes.json();
                message = errData.message || errData.error || message;
            } catch (_) {
                const errText = await apiRes.text();
                if (errText) message = errText.slice(0, 200);
            }
            throw new Error(message);
        }
        return await apiRes.json();
    }

    return { analyzeVisionQuestion };
})();
