window.AiLabTaskMedia = (function() {
    function createController(config) {
        const ctx = { ...config };
        let taskIntroVideoLoadTimer = null;

        function setTaskVideoErrorState(videoEl, errorEl, failed) {
            if (!videoEl) return;
            videoEl.classList.toggle('video-load-failed', failed);
            videoEl.controls = !failed;
            if (errorEl) {
                errorEl.classList.toggle('hidden', !failed);
            }
        }

        function clearTaskIntroVideoLoadTimeout() {
            if (!taskIntroVideoLoadTimer) return;
            clearTimeout(taskIntroVideoLoadTimer);
            taskIntroVideoLoadTimer = null;
        }

        function scheduleTaskIntroVideoLoadTimeout(videoEl, errorEl) {
            clearTaskIntroVideoLoadTimeout();
            if (!videoEl || !errorEl) return;
            taskIntroVideoLoadTimer = window.setTimeout(() => {
                if (videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
                errorEl.textContent = '影片載入較慢，現場網路不穩時可先按「略過影片」繼續遊戲。';
                setTaskVideoErrorState(videoEl, errorEl, true);
            }, 8000);
        }

        function bindTaskVideoStatus(videoEl, errorEl) {
            if (!videoEl) return;
            videoEl.addEventListener('loadedmetadata', () => {
                clearTaskIntroVideoLoadTimeout();
                setTaskVideoErrorState(videoEl, errorEl, false);
            });
            videoEl.addEventListener('canplay', () => {
                clearTaskIntroVideoLoadTimeout();
                setTaskVideoErrorState(videoEl, errorEl, false);
            });
            videoEl.addEventListener('error', () => {
                clearTaskIntroVideoLoadTimeout();
                setTaskVideoErrorState(videoEl, errorEl, true);
            });
        }

        function handleTaskIntroVideoEnded() {
            const { taskIntroVideo } = ctx;
            if (!taskIntroVideo) return;
            if (document.fullscreenElement === taskIntroVideo && typeof document.exitFullscreen === 'function') {
                document.exitFullscreen().catch(() => {});
            }
            if (typeof taskIntroVideo.webkitExitFullscreen === 'function' && taskIntroVideo.webkitDisplayingFullscreen) {
                try {
                    taskIntroVideo.webkitExitFullscreen();
                } catch (err) {
                    console.warn('離開 iOS 全螢幕失敗', err);
                }
            }
            ctx.closeTaskIntroPanel({ pauseVideo: false });
            try {
                taskIntroVideo.pause();
                taskIntroVideo.currentTime = 0;
            } catch (err) {
                console.warn('重置景點影片狀態失敗', err);
            }
        }

        function loadTaskBGM(task) {
            const { taskBgm, taskBgmBtn } = ctx;
            if (!taskBgm) return;
            const musicUrl = task?.bgm_url || task?.audio_url || null;
            if (musicUrl) {
                try {
                    taskBgm.pause();
                    taskBgm.currentTime = 0;
                } catch (err) {
                    console.warn('重置任務背景音樂失敗', err);
                }
                taskBgm.src = musicUrl;
                taskBgm.load();
                taskBgm.volume = 0.5;
                ctx.setBgmAutoStarted(false);
                if (taskBgmBtn) {
                    taskBgmBtn.classList.remove('hidden');
                    taskBgmBtn.title = '任務背景音樂';
                    taskBgmBtn.textContent = '🎵';
                }
            } else {
                try {
                    taskBgm.pause();
                    taskBgm.currentTime = 0;
                } catch (err) {
                    console.warn('停止任務背景音樂失敗', err);
                }
                taskBgm.src = '';
                ctx.setBgmAutoStarted(false);
                if (taskBgmBtn) taskBgmBtn.classList.add('hidden');
            }
        }

        function loadTaskVideo(task) {
            const videoUrl = ctx.getTaskVideoUrl(task);
            const youtubeEmbedUrl = ctx.toYouTubeEmbedUrl(videoUrl);
            const isYouTubeVideo = Boolean(youtubeEmbedUrl);
            const hasVideo = Boolean(videoUrl);
            const coverUrl = task?.photoUrl || task?.photo_url || '';
            ctx.gameShellPanel?.classList.toggle('has-video', hasVideo);
            ctx.taskIntroPanel?.classList.toggle('has-video', hasVideo);
            ctx.taskIntroDescription?.classList.toggle('has-video', hasVideo);
            ctx.taskIntroPanel?.querySelector('.task-intro-body')?.classList.toggle('has-video', hasVideo);
            if (ctx.taskIntroSkip) {
                ctx.taskIntroSkip.classList.toggle('hidden', !hasVideo);
            }

            updateVideoTarget({
                frameEl: ctx.gameShellVideoFrame,
                isIntroVideo: false,
                isYouTubeVideo,
                videoEl: ctx.gameShellVideo,
                videoErrorEl: ctx.gameShellVideoError,
                videoUrl,
                wrapEl: ctx.gameShellVideoWrap,
                youtubeEmbedUrl,
                coverUrl
            });
            updateVideoTarget({
                frameEl: ctx.taskIntroVideoFrame,
                isIntroVideo: true,
                isYouTubeVideo,
                videoEl: ctx.taskIntroVideo,
                videoErrorEl: ctx.taskIntroVideoError,
                videoUrl,
                wrapEl: ctx.taskIntroVideoWrap,
                youtubeEmbedUrl,
                coverUrl
            });
        }

        function updateVideoTarget({ coverUrl, frameEl, isIntroVideo, isYouTubeVideo, videoEl, videoErrorEl, videoUrl, wrapEl, youtubeEmbedUrl }) {
            if (!wrapEl || !videoEl) return;
            if (videoUrl) {
                setTaskVideoErrorState(videoEl, videoErrorEl, false);
                if (videoErrorEl && isIntroVideo) {
                    videoErrorEl.textContent = isYouTubeVideo
                        ? 'YouTube 影片目前無法載入，請確認連結與網路狀態。'
                        : '影片素材目前無法載入，請通知工作人員重新上傳影片。';
                }
                if (isYouTubeVideo) {
                    if (isIntroVideo) clearTaskIntroVideoLoadTimeout();
                    try {
                        videoEl.pause();
                    } catch (err) {
                        console.warn(isIntroVideo ? '暫停景點影片失敗' : '暫停內建影片失敗', err);
                    }
                    videoEl.removeAttribute('src');
                    videoEl.removeAttribute('poster');
                    videoEl.load();
                    videoEl.classList.add('hidden');
                    ctx.setYouTubeFrameSource(frameEl, youtubeEmbedUrl);
                } else {
                    ctx.setYouTubeFrameSource(frameEl, null);
                    videoEl.classList.remove('hidden');
                    videoEl.preload = isIntroVideo ? 'auto' : 'none';
                    videoEl.poster = coverUrl || '';
                    videoEl.src = videoUrl;
                    videoEl.load();
                    if (isIntroVideo) scheduleTaskIntroVideoLoadTimeout(videoEl, videoErrorEl);
                }
                wrapEl.classList.remove('hidden');
                return;
            }

            if (isIntroVideo) clearTaskIntroVideoLoadTimeout();
            ctx.setYouTubeFrameSource(frameEl, null);
            videoEl.removeAttribute('src');
            videoEl.removeAttribute('poster');
            videoEl.load();
            videoEl.classList.remove('hidden');
            wrapEl.classList.add('hidden');
            setTaskVideoErrorState(videoEl, videoErrorEl, false);
        }

        function pauseTaskMedia() {
            [ctx.gameShellVideo, ctx.taskIntroVideo].forEach((mediaEl) => {
                if (!mediaEl) return;
                try {
                    mediaEl.pause();
                } catch (err) {
                    console.warn('暫停任務影片失敗', err);
                }
            });
            ctx.pauseYouTubeFrame(ctx.gameShellVideoFrame);
            ctx.pauseYouTubeFrame(ctx.taskIntroVideoFrame);
        }

        return {
            bindTaskVideoStatus,
            handleTaskIntroVideoEnded,
            loadTaskBGM,
            loadTaskVideo,
            pauseTaskMedia,
            setTaskVideoErrorState
        };
    }

    return { createController };
})();
