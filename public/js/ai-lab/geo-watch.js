// AiLabGeoWatch：集中 GPS watch、輪詢、裝置方位事件、任務導航 UI、任務 BGM 觸發。
// 主檔（ai-lab.js）不應再直接持有 navigationWatchId / navigationPollTimer / deviceHeading
// / orientationPermissionState / lastTaskDistance / lastTaskBearing / taskObjectVisible 等狀態。
(function (global) {
    function createController(deps = {}) {
        const {
            taskBgm,
            taskBgmBtn,
            taskGuideArrow,
            taskTargetObj,
            locationBar,
            taskCoordsValue,
            taskDistanceValue,
            taskStatusLabel,
            isCurrentQuestTutorialMode = () => false,
            isCurrentQuestDemoMode = () => false,
            getTutorialMockDistance = () => 0,
            getTutorialMockBearing = () => 0,
            taskUsesGps = () => false,
            haversineDistance,
            calculateBearing,
            renderTaskMetrics = () => {},
            getCurrentTask = () => null,
            getCurrentEntryMode = () => null,
            getLastLatLng = () => null,
            setLastLatLng = () => {},
            getTargetLat = () => null,
            getTargetLng = () => null,
            onPositionUpdate = () => {},
            onTaskMetricsRefresh = null,
            closeTaskEncounter = () => {},
            onDebugChange = () => {}
        } = deps;

        let navigationWatchId = null;
        let navigationPollTimer = null;
        let deviceHeading = 0;
        let lastHeading = 0;
        let headingSource = 'none';
        let lastHeadingUpdateAt = 0;
        let lastGpsUpdateAt = 0;
        let lastTaskDistance = null;
        let lastTaskBearing = null;
        let taskObjectVisible = false;
        let bgmAutoStarted = false;
        let orientationPermissionState = 'idle';
        let taskReached = false;

        async function ensureOrientationPermission() {
            if (orientationPermissionState === 'granted' || orientationPermissionState === 'unsupported') {
                return orientationPermissionState;
            }
            if (orientationPermissionState === 'requesting') {
                return orientationPermissionState;
            }
            try {
                if (typeof DeviceOrientationEvent !== 'undefined'
                    && typeof DeviceOrientationEvent.requestPermission === 'function') {
                    orientationPermissionState = 'requesting';
                    const permission = await DeviceOrientationEvent.requestPermission();
                    orientationPermissionState = permission;
                    if (permission !== 'granted') {
                        console.warn('方向權限未授權');
                    }
                } else {
                    orientationPermissionState = 'unsupported';
                }
            } catch (err) {
                orientationPermissionState = 'error';
                console.warn('請求方向權限失敗', err);
            }
            try { onDebugChange(); } catch (_err) { /* ignore */ }
            return orientationPermissionState;
        }

        function refreshTaskNavigationFromCache() {
            if (!Number.isFinite(lastTaskDistance) || !Number.isFinite(lastTaskBearing)) {
                if (typeof onTaskMetricsRefresh === 'function') {
                    onTaskMetricsRefresh();
                } else {
                    renderTaskMetrics();
                }
                return;
            }
            updateTaskNavigationUI(lastTaskDistance, lastTaskBearing);
        }

        function handleOrientationEvent(event) {
            let currentHeading = null;
            if (typeof event.webkitCompassHeading === 'number' && !Number.isNaN(event.webkitCompassHeading)) {
                currentHeading = event.webkitCompassHeading;
                headingSource = 'webkitCompassHeading';
            } else if (event.alpha != null && !Number.isNaN(event.alpha)) {
                currentHeading = (360 - event.alpha + 360) % 360;
                headingSource = 'alpha';
            }
            if (currentHeading == null) return;
            let headingDiff = currentHeading - lastHeading;
            if (headingDiff > 180) headingDiff -= 360;
            if (headingDiff < -180) headingDiff += 360;
            lastHeading += headingDiff * 0.15;
            deviceHeading = (lastHeading + 360) % 360;
            lastHeadingUpdateAt = Date.now();
            if (orientationPermissionState === 'requesting'
                || orientationPermissionState === 'idle'
                || orientationPermissionState === 'error') {
                orientationPermissionState = 'granted';
            }
            refreshTaskNavigationFromCache();
        }

        function updateTaskNavigationUI(distanceMeters, bearing) {
            lastTaskDistance = distanceMeters;
            lastTaskBearing = bearing;
            const currentTask = getCurrentTask();
            const allowFloatingTarget = getCurrentEntryMode() === 'board_game' && !isCurrentQuestTutorialMode();
            const hasHeading = lastHeadingUpdateAt > 0;
            const diff = ((bearing - deviceHeading + 540) % 360) - 180;
            renderTaskMetrics(distanceMeters, bearing);

            if (!allowFloatingTarget) {
                taskObjectVisible = false;
                if (taskGuideArrow) taskGuideArrow.classList.add('hidden');
                if (taskTargetObj) taskTargetObj.classList.add('hidden');
                if (typeof closeTaskEncounter === 'function') closeTaskEncounter();
                return;
            }

            const revealDistance = Math.max(8, currentTask?.radius || 30);
            const interactionDistance = Math.max(6, (currentTask?.radius || 30) / 2);
            const activeFovDeg = taskObjectVisible ? 50 : 30;
            const isInView = hasHeading && Math.abs(diff) < activeFovDeg;
            const canRevealObject = distanceMeters <= revealDistance;
            const shouldShowObject = canRevealObject && isInView;

            if (taskGuideArrow) {
                taskGuideArrow.style.transform = `rotate(${hasHeading ? diff : 0}deg) translate(0, -100px)`;
                taskGuideArrow.classList.toggle('hidden', shouldShowObject && distanceMeters <= revealDistance);
            }
            if (taskTargetObj) {
                if (shouldShowObject) {
                    taskObjectVisible = true;
                    taskTargetObj.classList.remove('hidden');
                    const xOffset = (diff / 40) * (window.innerWidth / 2);
                    let scale = 1.2 - (Math.min(distanceMeters, 50) / 60);
                    if (scale < 0.4) scale = 0.4;
                    const topPercent = distanceMeters <= interactionDistance ? 52 : 56;
                    taskTargetObj.style.left = '50%';
                    taskTargetObj.style.top = `${topPercent}%`;
                    taskTargetObj.style.transform = `translate(-50%, -50%) translateX(${xOffset}px) scale(${scale})`;
                    taskTargetObj.style.opacity = '1';
                } else {
                    taskObjectVisible = false;
                    taskTargetObj.classList.add('hidden');
                }
            }
        }

        function tryAutoPlayTaskBgm(distanceMeters, { force = false } = {}) {
            if (!taskBgm || !taskBgm.src || bgmAutoStarted) return;
            const triggerDistance = Math.max(8, getCurrentTask()?.radius || 30);
            if (!force && distanceMeters > triggerDistance) return;
            taskBgm.play().then(() => {
                bgmAutoStarted = true;
                if (taskBgmBtn) taskBgmBtn.textContent = '🔊';
            }).catch(() => {
                // iOS/Safari 常會擋自動播放，保留手動按鈕即可
            });
        }

        function stopTaskNavigation() {
            if (navigationWatchId !== null) {
                navigator.geolocation.clearWatch(navigationWatchId);
                navigationWatchId = null;
            }
            if (navigationPollTimer) {
                clearInterval(navigationPollTimer);
                navigationPollTimer = null;
            }
        }

        function applyPositionUpdate(latitude, longitude, targetLat, targetLng, { triggerBgm } = {}) {
            setLastLatLng({ latitude, longitude });
            lastGpsUpdateAt = Date.now();
            if (typeof onTaskMetricsRefresh === 'function') {
                onTaskMetricsRefresh();
            } else {
                renderTaskMetrics();
            }
            try { onPositionUpdate(latitude, longitude); } catch (_err) { /* ignore */ }
            const distanceMeters = haversineDistance(latitude, longitude, targetLat, targetLng);
            const bearing = calculateBearing(latitude, longitude, targetLat, targetLng);
            updateTaskNavigationUI(distanceMeters, bearing);
            if (triggerBgm) tryAutoPlayTaskBgm(distanceMeters);
            if (locationBar) {
                locationBar.textContent = (isCurrentQuestTutorialMode() || isCurrentQuestDemoMode())
                    ? '目前位置：教學 / Demo 模式不限 GPS'
                    : `目前位置：距離任務 ${Math.round(distanceMeters)}m`;
            }
            return distanceMeters;
        }

        function startTaskNavigation() {
            const targetLat = getTargetLat();
            const targetLng = getTargetLng();
            if (targetLat == null || targetLng == null) return;
            const tutorialLikeMode = isCurrentQuestTutorialMode() || isCurrentQuestDemoMode();
            stopTaskNavigation();
            const currentTask = getCurrentTask();
            if (tutorialLikeMode) {
                lastGpsUpdateAt = Date.now();
                setLastLatLng(null);
                taskReached = true;
                const mockDistance = getTutorialMockDistance();
                const mockBearing = getTutorialMockBearing();
                updateTaskNavigationUI(mockDistance, mockBearing);
                if (locationBar) {
                    locationBar.textContent = `目前位置：模擬距離任務 ${mockDistance}m（GPS 已關閉）`;
                }
                if (taskCoordsValue) {
                    taskCoordsValue.textContent = '教學 / Demo 模式';
                }
                return;
            }
            if (!taskUsesGps(currentTask)) {
                taskReached = true;
                lastTaskDistance = null;
                lastTaskBearing = null;
                renderTaskMetrics();
                if (locationBar) {
                    locationBar.textContent = '目前位置：此關卡未啟用 GPS 限制';
                }
                if (taskCoordsValue) {
                    taskCoordsValue.textContent = 'GPS 未啟用';
                }
                if (taskStatusLabel) {
                    taskStatusLabel.textContent = '任何地方都可開啟任務';
                }
                if (taskDistanceValue) {
                    taskDistanceValue.textContent = '--';
                }
                return;
            }
            if (!navigator.geolocation) return;
            navigationWatchId = navigator.geolocation.watchPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                const distanceMeters = applyPositionUpdate(latitude, longitude, targetLat, targetLng, { triggerBgm: true });
                taskReached = distanceMeters <= Math.max(6, currentTask?.radius || 30);
            }, (err) => {
                console.warn('任務導航定位失敗', err);
                if (taskCoordsValue) taskCoordsValue.textContent = '定位失敗';
                if (taskDistanceValue) taskDistanceValue.textContent = '--m';
                if (taskStatusLabel) taskStatusLabel.textContent = '定位失敗';
            }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });

            // iPhone/Safari 有時 watchPosition 更新不穩，補一層定時輪詢
            navigationPollTimer = setInterval(() => {
                navigator.geolocation.getCurrentPosition((pos) => {
                    const { latitude, longitude } = pos.coords;
                    applyPositionUpdate(latitude, longitude, targetLat, targetLng, { triggerBgm: false });
                }, () => {}, { enableHighAccuracy: true, maximumAge: 1500, timeout: 6000 });
            }, 2500);
        }

        function attachOrientationListeners(target = (typeof window !== 'undefined' ? window : null)) {
            if (!target || typeof target.addEventListener !== 'function') return;
            target.addEventListener('deviceorientation', handleOrientationEvent, true);
            target.addEventListener('deviceorientationabsolute', handleOrientationEvent, true);
        }

        return {
            ensureOrientationPermission,
            handleOrientationEvent,
            attachOrientationListeners,
            refreshTaskNavigationFromCache,
            updateTaskNavigationUI,
            tryAutoPlayTaskBgm,
            stopTaskNavigation,
            startTaskNavigation,
            getDeviceHeading: () => deviceHeading,
            getLastHeadingUpdateAt: () => lastHeadingUpdateAt,
            getOrientationPermissionState: () => orientationPermissionState,
            getHeadingSource: () => headingSource,
            getTaskObjectVisible: () => taskObjectVisible,
            setTaskObjectVisible: (value) => { taskObjectVisible = Boolean(value); },
            getTaskReached: () => taskReached,
            setTaskReached: (value) => { taskReached = Boolean(value); },
            getBgmAutoStarted: () => bgmAutoStarted,
            setBgmAutoStarted: (value) => { bgmAutoStarted = Boolean(value); },
            getLastGpsUpdateAt: () => lastGpsUpdateAt,
            getLastTaskDistance: () => lastTaskDistance,
            getLastTaskBearing: () => lastTaskBearing
        };
    }

    global.AiLabGeoWatch = { createController };
}(typeof window !== 'undefined' ? window : globalThis));
