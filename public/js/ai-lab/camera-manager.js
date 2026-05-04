/**
 * camera-manager.js
 * 處理核心的相機串流、Zoom 控制與裝置權限
 */
window.AiLabCameraManager = (function() {
    let stream = null;
    let facingMode = 'environment';
    
    let refs = {
        video: null,
        zoomControl: null,
        zoomValue: null,
        zoomButtons: [],
        shouldSuppressCameraAlert: () => false,
        onCameraStartSuccess: null,
        onCameraStartFail: null
    };

    function init(config) {
        refs = { ...refs, ...config };
    }

    function setFacingMode(mode) {
        facingMode = mode;
    }

    function getFacingMode() {
        return facingMode;
    }

    function toggleFacingMode() {
        facingMode = facingMode === 'environment' ? 'user' : 'environment';
        return facingMode;
    }

    function getStream() {
        return stream;
    }

    function attachStreamToVideo(videoEl, mediaStream) {
        if (!videoEl || !mediaStream) return;
        videoEl.muted = true;
        videoEl.defaultMuted = true;
        videoEl.playsInline = true;
        videoEl.setAttribute('playsinline', '');
        videoEl.setAttribute('webkit-playsinline', '');
        videoEl.srcObject = mediaStream;

        const tryPlay = () => {
            const p = videoEl.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => {});
            }
        };

        tryPlay();
        if (videoEl.readyState < 2) {
            videoEl.addEventListener('loadeddata', tryPlay, { once: true });
        }
        videoEl.addEventListener('canplay', tryPlay, { once: true });
    }

    async function startCamera() {
        const { video, shouldSuppressCameraAlert, onCameraStartSuccess, onCameraStartFail } = refs;
        
        try {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            
            console.log('正在啟動相機...');
            
            const highQualityConstraints = {
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            };

            try {
                stream = await navigator.mediaDevices.getUserMedia(highQualityConstraints);
            } catch (err1) {
                console.log('高畫質模式失敗，嘗試標準設定: ' + err1.name);
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            facingMode: facingMode,
                            width: { ideal: 1280 },
                            height: { ideal: 720 }
                        },
                        audio: false
                    });
                } catch (err2) {
                    console.log('標準設定也失敗，使用最基本設定');
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
                }
            }
            
            if (video) {
                attachStreamToVideo(video, stream);
                try {
                    await video.play();
                    console.log('相機啟動成功');
                } catch (playErr) {
                    console.log('播放失敗: ' + playErr.message);
                }
            }

            setupZoomControl();
            if (typeof onCameraStartSuccess === 'function') onCameraStartSuccess(stream);
            
        } catch (err) {
            if (shouldSuppressCameraAlert()) {
                console.warn('教學模式略過相機啟動失敗:', err);
            } else {
                console.error('相機啟動失敗:', err);
            }
            
            let msg = '無法存取相機，請確認權限';
            let showRetry = false;
            
            if (err.name === 'NotAllowedError') {
                msg = '您拒絕了相機權限';
                showRetry = true;
            } else if (err.name === 'NotFoundError') {
                msg = '找不到相機裝置';
            }

            if (shouldSuppressCameraAlert()) {
                console.log(`${msg}（教學模式可繼續體驗）`);
                return;
            }
            
            if (window.Swal) {
                const result = await window.Swal.fire({
                    icon: 'error',
                    title: '相機錯誤',
                    text: `${msg} (${err.name})`,
                    confirmButtonText: showRetry ? '重新請求權限' : '確定',
                    showCancelButton: showRetry,
                    cancelButtonText: '取消'
                });
                
                if (result.isConfirmed && showRetry) {
                    setTimeout(startCamera, 500);
                }
            }
            if (typeof onCameraStartFail === 'function') onCameraStartFail(err);
        }
    }

    function setZoomLevel(track, targetZoom, caps) {
        const minZoom = caps.zoom.min;
        const maxZoom = caps.zoom.max;
        const zoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));
        if (refs.zoomValue) refs.zoomValue.textContent = `${Number(zoom).toFixed(1)}x`;
        refs.zoomButtons.forEach(btn => {
            btn.classList.toggle('active', Number(btn.dataset.zoom) === Math.round(zoom));
        });
        return track.applyConstraints({ advanced: [{ zoom }] }).catch((err) => {
            console.warn('Zoom 設定失敗', err);
        });
    }

    function setupZoomControl() {
        const { zoomControl, zoomValue, zoomButtons } = refs;
        if (!stream || !zoomControl || !zoomValue || !zoomButtons.length) return;
        const [track] = stream.getVideoTracks();
        if (!track || !track.getCapabilities) {
            zoomControl.classList.add('hidden');
            return;
        }
        const caps = track.getCapabilities();
        if (!caps.zoom) {
            zoomControl.classList.add('hidden');
            return;
        }
        zoomControl.classList.remove('hidden');
        const settings = track.getSettings();
        const currentZoom = settings.zoom || caps.zoom.min;
        zoomValue.textContent = `${Number(currentZoom).toFixed(1)}x`;
        zoomButtons.forEach((btn) => {
            btn.onclick = () => setZoomLevel(track, Number(btn.dataset.zoom), caps);
        });
    }

    return {
        init,
        startCamera,
        getStream,
        setFacingMode,
        getFacingMode,
        toggleFacingMode
    };
})();
