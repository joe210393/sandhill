(function(global) {
    function createController(deps = {}) {
        const {
            runtimeState,
            calculateBearing,
            haversineDistance,
            getLoginUser = () => null,
            loadTaskBGM = () => {},
            setMode = () => {},
            showTaskContext = () => {},
            startTaskNavigation = () => {},
            syncTaskEncounterVisibility = () => {},
            taskUsesGps = () => false,
            taskHasNavigationTarget = () => false,
            updateTaskMapViewport = () => {},
            getMiniMapTaskIndicators = () => null
        } = deps;

        function get(key) {
            return runtimeState.get(key);
        }

        function set(key, value) {
            return runtimeState.set(key, value);
        }

        function isIndependentVisibleTask(task) {
            return task
                && task.lat != null
                && task.lng != null
                && !task.quest_chain_id
                && String(task.id) !== String(get('currentTaskId'));
        }

        function normalizeVisibleTasks(tasks, progressMap) {
            return [
                ...tasks
                    .filter(isIndependentVisibleTask)
                    .map((task) => ({
                        ...task,
                        _visibleTaskType: 'single',
                        lat: Number(task.lat),
                        lng: Number(task.lng)
                    })),
                ...getVisibleQuestTasks(tasks, progressMap)
            ].filter((task) => Number.isFinite(task.lat) && Number.isFinite(task.lng));
        }

        async function fetchInProgressTasks() {
            try {
                const res = await fetch('/api/user-tasks', { credentials: 'include' });
                if (!res.ok) return [];
                const data = await res.json();
                return data.success && Array.isArray(data.tasks) ? data.tasks : [];
            } catch (err) {
                console.warn('取得進行中任務失敗', err);
                return [];
            }
        }

        async function getQuickCurrentPosition() {
            if (!navigator.geolocation) return null;
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2500, enableHighAccuracy: false });
                });
                return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            } catch (err) {
                return null;
            }
        }

        function pickNearestTask(tasks, reference) {
            if (!reference || !tasks.length) return tasks[0] || null;
            return tasks
                .map((task) => ({
                    task,
                    distance: haversineDistance(reference.latitude, reference.longitude, task.lat, task.lng)
                }))
                .sort((a, b) => a.distance - b.distance)[0]?.task || null;
        }

        async function fetchQuestProgressMap() {
            try {
                if (!getLoginUser()) return {};
                const res = await fetch('/api/user/quest-progress', { credentials: 'include' });
                if (res.status === 401 || res.status === 403) return {};
                if (!res.ok) return {};
                const data = await res.json();
                if (!data.success || !data.progress || typeof data.progress !== 'object') return {};
                return data.progress;
            } catch (err) {
                console.warn('取得劇情進度失敗', err);
                return {};
            }
        }

        function getVisibleQuestTasks(tasks, progressMap) {
            const grouped = new Map();
            tasks.forEach((task) => {
                if (!task || !task.quest_chain_id || task.lat == null || task.lng == null) return;
                const chainId = String(task.quest_chain_id);
                if (!grouped.has(chainId)) grouped.set(chainId, []);
                grouped.get(chainId).push({
                    ...task,
                    lat: Number(task.lat),
                    lng: Number(task.lng),
                    quest_order: Number(task.quest_order || 0)
                });
            });

            const visibleQuestTasks = [];
            grouped.forEach((chainTasks, chainId) => {
                const sortedTasks = chainTasks
                    .filter((task) => Number.isFinite(task.lat) && Number.isFinite(task.lng))
                    .sort((a, b) => a.quest_order - b.quest_order);
                if (!sortedTasks.length) return;

                const progressOrder = Number(progressMap?.[chainId]);
                let visibleTask = null;
                if (Number.isFinite(progressOrder) && progressOrder > 0) {
                    visibleTask = sortedTasks.find((task) => task.quest_order === progressOrder) || null;
                } else {
                    visibleTask = sortedTasks[0] || null;
                }

                if (visibleTask && String(visibleTask.id) !== String(get('currentTaskId'))) {
                    visibleQuestTasks.push({
                        ...visibleTask,
                        _visibleTaskType: 'quest'
                    });
                }
            });
            return visibleQuestTasks;
        }

        async function loadNearbyVisibleTasks() {
            try {
                if (get('currentQuestChainId') || get('isShellExperience')) {
                    set('nearbyVisibleTasks', []);
                    renderNearbyTaskMarkers();
                    updateMiniMapTaskIndicators();
                    return;
                }
                const [taskRes, questProgress] = await Promise.all([
                    fetch('/api/tasks'),
                    fetchQuestProgressMap()
                ]);
                const data = await taskRes.json();
                if (!data.success || !Array.isArray(data.tasks)) return;
                const targetLat = get('targetLat');
                const targetLng = get('targetLng');
                const reference = get('lastLatLng') || (targetLat && targetLng ? { latitude: targetLat, longitude: targetLng } : null);
                const visibleTasks = normalizeVisibleTasks(data.tasks, questProgress)
                    .filter((task) => {
                        if (!reference) return true;
                        return haversineDistance(reference.latitude, reference.longitude, task.lat, task.lng) <= 1000;
                    });
                set('nearbyVisibleTasks', visibleTasks);
                renderNearbyTaskMarkers();
                updateMiniMapTaskIndicators();
            } catch (err) {
                console.warn('載入附近任務失敗', err);
            }
        }

        function renderNearbyTaskMarkers() {
            const mapInstance = get('mapInstance');
            if (!mapInstance || !global.L) return;
            let nearbyTaskLayer = get('nearbyTaskLayer');
            if (!nearbyTaskLayer) {
                nearbyTaskLayer = global.L.layerGroup().addTo(mapInstance);
                set('nearbyTaskLayer', nearbyTaskLayer);
            }
            nearbyTaskLayer.clearLayers();
            get('nearbyVisibleTasks').forEach((task) => {
                const marker = global.L.circleMarker([task.lat, task.lng], {
                    radius: 6,
                    color: task._visibleTaskType === 'quest' ? '#a855f7' : '#38bdf8',
                    weight: 2,
                    fillColor: task._visibleTaskType === 'quest' ? '#c084fc' : '#0ea5e9',
                    fillOpacity: 0.92
                }).addTo(nearbyTaskLayer);
                const tooltipLabel = (task._visibleTaskType === 'quest' ? '劇情任務' : '單題任務') + '：' + (task.name || '任務地點');
                marker.bindTooltip(tooltipLabel, { permanent: false, direction: 'top' });
                marker.on('click', () => {
                    selectTaskForAiLab(task);
                });
            });
        }

        function updateTaskMarker(targetLat, targetLng) {
            const mapInstance = get('mapInstance');
            let taskMapMarker = get('taskMapMarker');
            if (mapInstance && Number.isFinite(targetLat) && Number.isFinite(targetLng)) {
                if (!taskMapMarker) {
                    taskMapMarker = global.L.circleMarker([targetLat, targetLng], {
                        radius: 8,
                        color: '#ef4444',
                        weight: 3,
                        fillColor: '#f97316',
                        fillOpacity: 0.95
                    }).addTo(mapInstance);
                    taskMapMarker.bindTooltip('任務地點', { permanent: false, direction: 'top' });
                    set('taskMapMarker', taskMapMarker);
                } else {
                    taskMapMarker.setLatLng([targetLat, targetLng]);
                }
                updateTaskMapViewport();
            } else if (taskMapMarker && mapInstance) {
                mapInstance.removeLayer(taskMapMarker);
                set('taskMapMarker', null);
            }
        }

        function applyTaskSelection(task, options = {}) {
            if (!task) return;
            if (String(get('currentTaskId')) !== String(task.id)) {
                set('currentUserTaskId', null);
            }
            syncTaskEncounterVisibility();
            set('currentTask', task);
            set('currentTaskId', task.id);
            const hasNavTarget = taskHasNavigationTarget(task);
            const targetLat = hasNavTarget ? Number(task.lat) : null;
            const targetLng = hasNavTarget ? Number(task.lng) : null;
            set('targetLat', targetLat);
            set('targetLng', targetLng);
            loadTaskBGM(task);
            showTaskContext(task);
            updateTaskMarker(targetLat, targetLng);
            if (options.updateUrl !== false) {
                const newUrl = new URL(global.location.href);
                if (get('currentQuestChainId')) newUrl.searchParams.set('questChainId', get('currentQuestChainId'));
                if (get('currentEntryMode')) newUrl.searchParams.set('mode', get('currentEntryMode'));
                newUrl.searchParams.set('taskId', task.id);
                if (Number.isFinite(targetLat)) newUrl.searchParams.set('lat', targetLat);
                else newUrl.searchParams.delete('lat');
                if (Number.isFinite(targetLng)) newUrl.searchParams.set('lng', targetLng);
                else newUrl.searchParams.delete('lng');
                global.history.replaceState({}, '', newUrl);
            }
            if (!options.skipNearbyReload) {
                loadNearbyVisibleTasks();
            }
            setMode('mission', false);
            startTaskNavigation();
        }

        async function selectTaskForAiLab(taskLike) {
            try {
                const res = await fetch('/api/tasks/' + encodeURIComponent(taskLike.id));
                const data = await res.json();
                if (!data.success || !data.task) return;
                applyTaskSelection(data.task);
            } catch (err) {
                console.error('切換 AI-LAB 任務失敗', err);
            }
        }

        async function loadDefaultVisibleTaskForUser() {
            try {
                if (get('isShellExperience')) return;
                if (!getLoginUser()) return;
                const [taskRes, questProgress, inProgressTasks, quickPos] = await Promise.all([
                    fetch('/api/tasks'),
                    fetchQuestProgressMap(),
                    fetchInProgressTasks(),
                    getQuickCurrentPosition()
                ]);
                const data = await taskRes.json();
                if (!data.success || !Array.isArray(data.tasks)) return;
                const visibleTasks = normalizeVisibleTasks(data.tasks, questProgress);
                if (!visibleTasks.length) return;
                const activeIds = new Set(inProgressTasks.map((task) => String(task.id)));
                const activeVisibleTasks = visibleTasks.filter((task) => activeIds.has(String(task.id)));
                const selectedTask = activeVisibleTasks.length
                    ? pickNearestTask(activeVisibleTasks, quickPos || get('lastLatLng'))
                    : pickNearestTask(visibleTasks, quickPos || get('lastLatLng'));
                if (selectedTask) {
                    applyTaskSelection(selectedTask);
                }
            } catch (err) {
                console.error('載入預設任務失敗', err);
            }
        }

        function updateMiniMapTaskIndicators() {
            const miniMapTaskIndicators = getMiniMapTaskIndicators();
            if (!miniMapTaskIndicators) return;
            miniMapTaskIndicators.innerHTML = '';
            const mapInstance = get('mapInstance');
            const nearbyVisibleTasks = get('nearbyVisibleTasks');
            if (!mapInstance || !nearbyVisibleTasks.length) return;
            const bounds = mapInstance.getBounds();
            const center = mapInstance.getCenter();
            const indicators = nearbyVisibleTasks
                .filter((task) => !bounds.contains([task.lat, task.lng]))
                .slice(0, 3);

            indicators.forEach((task) => {
                const bearing = calculateBearing(center.lat, center.lng, task.lat, task.lng);
                const lastLatLng = get('lastLatLng');
                const distance = lastLatLng
                    ? haversineDistance(lastLatLng.latitude, lastLatLng.longitude, task.lat, task.lng)
                    : haversineDistance(center.lat, center.lng, task.lat, task.lng);
                const item = document.createElement('div');
                item.className = 'mini-map-task-indicator';
                const arrow = document.createElement('span');
                arrow.className = 'mini-map-task-arrow';
                arrow.style.transform = 'rotate(' + bearing + 'deg)';
                arrow.textContent = '➤';
                const label = document.createElement('span');
                label.textContent = (task._visibleTaskType === 'quest' ? '劇情' : '單題') + ' · ' + (task.name || '附近任務') + ' · ' + Math.round(distance) + 'm';
                item.appendChild(arrow);
                item.appendChild(label);
                miniMapTaskIndicators.appendChild(item);
            });
        }

        return {
            applyTaskSelection,
            fetchInProgressTasks,
            fetchQuestProgressMap,
            getQuickCurrentPosition,
            getVisibleQuestTasks,
            isIndependentVisibleTask,
            loadDefaultVisibleTaskForUser,
            loadNearbyVisibleTasks,
            normalizeVisibleTasks,
            pickNearestTask,
            renderNearbyTaskMarkers,
            selectTaskForAiLab,
            updateMiniMapTaskIndicators
        };
    }

    global.AiLabNearbyTasks = {
        createController
    };
})(window);
