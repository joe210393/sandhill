window.AiLabVisionQuestion = (function() {
    async function analyzeVisionQuestion(photoDataUrl, systemPrompt, userPrompt, gpsData) {
        const response = await fetch(photoDataUrl);
        const blob = await response.blob();
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
            const errText = await apiRes.text();
            throw new Error(errText || '視覺提問失敗');
        }
        return await apiRes.json();
    }

    return { analyzeVisionQuestion };
})();
