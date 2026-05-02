(function(global) {
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    }

    function buildShareFilename() {
        return `ai-lab-${Date.now()}.jpg`;
    }

    function triggerDownload(dataUrl) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = buildShareFilename();
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    async function shareViaWebShareApi(dataUrl) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], buildShareFilename(), { type: 'image/jpeg' });
        return navigator.share({ files: [file], title: 'AI Lab Photo' });
    }

    function openIOSPreview(dataUrl) {
        const win = window.open();
        if (win) {
            win.document.write(`<img src="${dataUrl}" style="width:100%"/>`);
        }
        if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
            Swal.fire({
                icon: 'info',
                title: '已開啟照片',
                text: '請長按圖片儲存'
            });
        }
    }

    function showCaptureError(err) {
        if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
            Swal.fire({
                icon: 'error',
                title: '拍照失敗',
                text: err && err.message ? err.message : String(err)
            });
        }
    }

    function shareOrDownloadDataUrl(dataUrl) {
        if (!dataUrl) throw new Error('no-data-url');
        const iOS = isIOS();
        if (navigator.canShare && !iOS) {
            shareViaWebShareApi(dataUrl).catch(() => triggerDownload(dataUrl));
            return;
        }
        if (iOS) {
            openIOSPreview(dataUrl);
            return;
        }
        triggerDownload(dataUrl);
    }

    function handleCaptureClick(deps = {}) {
        const {
            video,
            captureFullFrameDataUrl
        } = deps;
        try {
            const dataUrl = captureFullFrameDataUrl(video);
            shareOrDownloadDataUrl(dataUrl);
        } catch (err) {
            console.error('拍照失敗', err);
            showCaptureError(err);
        }
    }

    global.AiLabPhotoShare = {
        handleCaptureClick,
        shareOrDownloadDataUrl
    };
})(window);
