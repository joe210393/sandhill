window.AiLabPhotoCaptureUtils = (function() {
    function createController(config) {
        const ctx = config || {};

        function captureSelectionDataUrlFromRect(minX, minY, maxX, maxY) {
            const width = maxX - minX;
            const height = maxY - minY;
            if (width < 10 || height < 10) return null;
            if (!ctx.video.videoWidth || !ctx.video.videoHeight) {
                throw new Error('相機畫面尚未就緒');
            }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = ctx.video.videoWidth;
            tempCanvas.height = ctx.video.videoHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(ctx.video, 0, 0, ctx.video.videoWidth, ctx.video.videoHeight);

            const screenRatio = ctx.canvas.width / ctx.canvas.height;
            const videoRatio = ctx.video.videoWidth / ctx.video.videoHeight;
            let renderWidth;
            let renderHeight;
            let offsetX;
            let offsetY;
            if (screenRatio > videoRatio) {
                renderWidth = ctx.canvas.width;
                renderHeight = ctx.canvas.width / videoRatio;
                offsetX = 0;
                offsetY = (ctx.canvas.height - renderHeight) / 2;
            } else {
                renderHeight = ctx.canvas.height;
                renderWidth = ctx.canvas.height * videoRatio;
                offsetX = (ctx.canvas.width - renderWidth) / 2;
                offsetY = 0;
            }

            const sourceX = (minX - offsetX) * (ctx.video.videoWidth / renderWidth);
            const sourceY = (minY - offsetY) * (ctx.video.videoHeight / renderHeight);
            const sourceW = width * (ctx.video.videoWidth / renderWidth);
            const sourceH = height * (ctx.video.videoHeight / renderHeight);

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = width;
            finalCanvas.height = height;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.drawImage(tempCanvas, sourceX, sourceY, sourceW, sourceH, 0, 0, width, height);
            return finalCanvas.toDataURL('image/jpeg', 0.95);
        }

        function captureCurrentReticleDataUrl() {
            const rect = ctx.getReticleRect();
            return captureSelectionDataUrlFromRect(rect.minX, rect.minY, rect.maxX, rect.maxY);
        }

        function processSelectionFromRect(minX, minY, maxX, maxY) {
            try {
                const dataUrl = captureSelectionDataUrlFromRect(minX, minY, maxX, maxY);
                if (!dataUrl) return;
                ctx.addPhotoToCollection(dataUrl);
            } catch (error) {
                console.error('截圖失敗', error);
                ctx.showCaptureError(error);
                ctx.showResultPanel();
            }
        }

        return {
            captureCurrentReticleDataUrl,
            captureSelectionDataUrlFromRect,
            processSelectionFromRect
        };
    }

    return { createController };
})();
