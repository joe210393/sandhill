(function(global) {
    function toggleClass(element, className, active) {
        if (element) element.classList.toggle(className, Boolean(active));
    }

    function playCameraFeedback({ shutterBtn, reticleCaptureHotspot } = {}) {
        if (shutterBtn) {
            shutterBtn.classList.add('is-firing');
            setTimeout(() => shutterBtn.classList.remove('is-firing'), 140);
        }
        if (reticleCaptureHotspot) {
            reticleCaptureHotspot.classList.add('is-firing');
            setTimeout(() => reticleCaptureHotspot.classList.remove('is-firing'), 140);
        }
        if (global.navigator?.vibrate) {
            global.navigator.vibrate(50);
        }
    }

    function setImmersiveCameraMode(active, {
        cameraCaptureBar,
        cameraTaskReopenBtn,
        photoBasket,
        updatePhotoBasketUi
    } = {}) {
        const enabled = Boolean(active);
        global.document.body.classList.toggle('immersive-camera-mode', enabled);
        toggleClass(cameraCaptureBar, 'hidden', !enabled);
        toggleClass(cameraTaskReopenBtn, 'hidden', !enabled);
        if (!enabled) photoBasket?.classList.add('hidden');
        if (typeof updatePhotoBasketUi === 'function') updatePhotoBasketUi();
    }

    function setCameraCaptureMode(mode = 'task', {
        isPhotoTaskCaptureActive,
        setSelectionMode,
        cameraModeTaskBtn,
        cameraModeSceneBtn,
        cameraCaptureBar,
        reticleOverlay,
        reticleCenterHint,
        reticleCaptureHotspot,
        instructionText
    } = {}) {
        const cameraCaptureMode = mode === 'scene' ? 'scene' : 'task';
        if (typeof setSelectionMode === 'function') setSelectionMode('reticle');

        const taskCaptureActive = typeof isPhotoTaskCaptureActive === 'function'
            ? isPhotoTaskCaptureActive()
            : false;
        const shouldShowTaskReticle = cameraCaptureMode === 'task' && taskCaptureActive;

        toggleClass(cameraModeTaskBtn, 'active', cameraCaptureMode === 'task');
        toggleClass(cameraModeSceneBtn, 'active', cameraCaptureMode === 'scene');
        toggleClass(cameraCaptureBar, 'task-primary', cameraCaptureMode === 'task');
        toggleClass(reticleOverlay, 'hidden', !shouldShowTaskReticle);
        toggleClass(reticleCenterHint, 'hidden', !shouldShowTaskReticle);
        toggleClass(reticleCaptureHotspot, 'hidden', !shouldShowTaskReticle);

        if (instructionText) {
            instructionText.textContent = shouldShowTaskReticle
                ? '把目標放進黃色圓框，直接點圓框中央拍照'
                : '按底部快門拍下整個畫面，作為全景紀錄';
        }

        return cameraCaptureMode;
    }

    function captureFullFrameDataUrl(video, quality = 0.95) {
        if (!video?.videoWidth || !video?.videoHeight) {
            throw new Error('相機尚未就緒');
        }
        const photoCanvas = global.document.createElement('canvas');
        photoCanvas.width = video.videoWidth;
        photoCanvas.height = video.videoHeight;
        const photoCtx = photoCanvas.getContext('2d');
        photoCtx.drawImage(video, 0, 0, photoCanvas.width, photoCanvas.height);
        return photoCanvas.toDataURL('image/jpeg', quality);
    }

    global.AiLabCameraCapture = {
        playCameraFeedback,
        setImmersiveCameraMode,
        setCameraCaptureMode,
        captureFullFrameDataUrl
    };
})(window);
