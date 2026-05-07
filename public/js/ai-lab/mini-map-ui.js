(function(global) {
    const DEFAULT_STORAGE_KEY = 'aiLabMiniMapCollapsed';
    const FLOATING_UI_PREFIX = 'aiLabFloatingUi:';
    const LONG_PRESS_MS = 520;
    const MIN_SCALE = 0.55;
    const MAX_SCALE = 1.8;

    function ensureMiniMapElements({ miniMapEl, locationInfoEl, cameraContainer, log } = {}) {
        if (miniMapEl && locationInfoEl) return null;
        if (!cameraContainer) {
            if (typeof log === 'function') log('找不到 camera-container，無法建立地圖容器');
            return null;
        }

        const wrap = global.document.createElement('div');
        wrap.className = 'mini-map-wrap';

        const toggleBtn = global.document.createElement('button');
        toggleBtn.id = 'miniMapToggle';
        toggleBtn.className = 'mini-map-toggle';
        toggleBtn.title = '切換地圖';
        toggleBtn.textContent = '🗺️';

        const refreshBtn = global.document.createElement('button');
        refreshBtn.id = 'miniMapRefresh';
        refreshBtn.className = 'mini-map-refresh';
        refreshBtn.title = '定位更新';
        refreshBtn.textContent = '📍';

        const mapDiv = global.document.createElement('div');
        mapDiv.id = 'miniMap';
        mapDiv.className = 'mini-map';

        const infoDiv = global.document.createElement('div');
        infoDiv.id = 'locationInfo';
        infoDiv.className = 'location-info';
        infoDiv.textContent = '定位中...';

        const indicatorDiv = global.document.createElement('div');
        indicatorDiv.id = 'miniMapTaskIndicators';
        indicatorDiv.className = 'mini-map-task-indicators';

        wrap.appendChild(toggleBtn);
        wrap.appendChild(refreshBtn);
        wrap.appendChild(mapDiv);
        wrap.appendChild(indicatorDiv);
        wrap.appendChild(infoDiv);
        cameraContainer.appendChild(wrap);

        return {
            miniMapEl: mapDiv,
            locationInfoEl: infoDiv,
            miniMapWrap: wrap,
            miniMapToggle: toggleBtn,
            miniMapRefresh: refreshBtn,
            miniMapTaskIndicators: indicatorDiv
        };
    }

    function initMiniMapToggle({
        miniMapToggle,
        miniMapWrap,
        miniMapRefresh,
        storageKey = DEFAULT_STORAGE_KEY,
        onBeforeToggle,
        onExpand,
        onRefresh
    } = {}) {
        if (!miniMapToggle || !miniMapWrap) return;

        const saved = global.localStorage.getItem(storageKey);
        if (saved === '1') miniMapWrap.classList.add('collapsed');

        miniMapToggle.addEventListener('click', () => {
            if (typeof onBeforeToggle === 'function') onBeforeToggle();
            miniMapWrap.classList.toggle('collapsed');
            const isCollapsed = miniMapWrap.classList.contains('collapsed');
            global.localStorage.setItem(storageKey, isCollapsed ? '1' : '0');
            if (!isCollapsed && typeof onExpand === 'function') onExpand();
        });

        if (miniMapRefresh) {
            miniMapRefresh.addEventListener('click', () => {
                if (typeof onRefresh === 'function') onRefresh();
            });
        }
    }

    function updateLocationText(text, { locationInfoEl, locationBar } = {}) {
        if (locationInfoEl) locationInfoEl.textContent = text;
        if (locationBar) locationBar.textContent = `目前位置：${text}`;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function readFloatingState(storageKey) {
        try {
            return JSON.parse(global.localStorage.getItem(FLOATING_UI_PREFIX + storageKey) || 'null') || {};
        } catch (_err) {
            return {};
        }
    }

    function writeFloatingState(storageKey, state) {
        try {
            global.localStorage.setItem(FLOATING_UI_PREFIX + storageKey, JSON.stringify(state));
        } catch (_err) {
            // localStorage may be unavailable in private browsing; dragging still works for this session.
        }
    }

    function ensureEditHandles(target) {
        let resizeHandle = target.querySelector('.floating-ui-resize-handle');
        if (!resizeHandle) {
            resizeHandle = global.document.createElement('button');
            resizeHandle.type = 'button';
            resizeHandle.className = 'floating-ui-resize-handle';
            resizeHandle.setAttribute('aria-label', '拖曳縮放 UI');
            target.appendChild(resizeHandle);
        }
        return { resizeHandle };
    }

    function applyFloatingState(target, state = {}) {
        if (!target) return;
        target.classList.add('floating-ui-customizable');
        const scale = Number.isFinite(state.scale) ? clamp(state.scale, MIN_SCALE, MAX_SCALE) : 1;
        target.style.setProperty('--floating-ui-scale', scale);
        if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
            target.style.left = `${state.x}px`;
            target.style.top = `${state.y}px`;
            target.style.right = 'auto';
            target.style.bottom = 'auto';
            target.style.transform = 'scale(var(--floating-ui-scale, 1))';
            target.style.transformOrigin = 'top left';
        }
    }

    function normalizeFloatingPosition(target) {
        const rect = target.getBoundingClientRect();
        const margin = 8;
        const x = clamp(rect.left, margin, Math.max(margin, global.innerWidth - rect.width - margin));
        const y = clamp(rect.top, margin, Math.max(margin, global.innerHeight - rect.height - margin));
        target.style.left = `${x}px`;
        target.style.top = `${y}px`;
        target.style.right = 'auto';
        target.style.bottom = 'auto';
        target.style.transform = 'scale(var(--floating-ui-scale, 1))';
        target.style.transformOrigin = 'top left';
        return { x, y };
    }

    function activateFloatingTarget(target) {
        global.document.querySelectorAll('.floating-ui-editing').forEach((node) => {
            if (node !== target) node.classList.remove('floating-ui-editing');
        });
        target.classList.add('floating-ui-editing');
        normalizeFloatingPosition(target);
    }

    function deactivateFloatingTarget(target) {
        target.classList.remove('floating-ui-editing', 'floating-ui-dragging', 'floating-ui-resizing');
    }

    function initFloatingUiControls({
        target,
        storageKey,
        onChange
    } = {}) {
        if (!target || !storageKey) return null;
        const state = readFloatingState(storageKey);
        const handles = ensureEditHandles(target);
        applyFloatingState(target, state);

        let activePointerId = null;
        let resizePointerId = null;
        let longPressTimer = null;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        let startScale = 1;
        let startDistance = 1;
        let moved = false;

        function savePosition() {
            const nextPosition = normalizeFloatingPosition(target);
            const currentScale = Number.parseFloat(target.style.getPropertyValue('--floating-ui-scale')) || 1;
            const nextState = {
                ...readFloatingState(storageKey),
                ...nextPosition,
                scale: clamp(currentScale, MIN_SCALE, MAX_SCALE)
            };
            writeFloatingState(storageKey, nextState);
            if (typeof onChange === 'function') onChange(nextState);
        }

        function clearLongPressTimer() {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }

        function onPointerMove(event) {
            if (activePointerId !== event.pointerId) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
            const rect = target.getBoundingClientRect();
            const margin = 8;
            const nextLeft = clamp(startLeft + dx, margin, Math.max(margin, global.innerWidth - rect.width - margin));
            const nextTop = clamp(startTop + dy, margin, Math.max(margin, global.innerHeight - rect.height - margin));
            target.style.left = `${nextLeft}px`;
            target.style.top = `${nextTop}px`;
            target.style.right = 'auto';
            target.style.bottom = 'auto';
            target.style.transform = 'none';
            event.preventDefault();
        }

        function onPointerUp(event) {
            if (activePointerId !== event.pointerId) return;
            activePointerId = null;
            target.releasePointerCapture?.(event.pointerId);
            target.classList.remove('floating-ui-dragging');
            global.removeEventListener('pointermove', onPointerMove, { passive: false });
            global.removeEventListener('pointerup', onPointerUp);
            savePosition();
            if (moved) {
                if (event.cancelable) event.preventDefault();
                event.stopPropagation();
            }
        }

        function startDrag(event) {
            if (event.button != null && event.button !== 0) return;
            const rect = target.getBoundingClientRect();
            activePointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            moved = false;
            target.classList.add('floating-ui-dragging');
            try { target.setPointerCapture?.(event.pointerId); } catch (_err) {}
            normalizeFloatingPosition(target);
            global.addEventListener('pointermove', onPointerMove, { passive: false });
            global.addEventListener('pointerup', onPointerUp);
            if (event.cancelable) event.preventDefault();
        }

        function onResizeMove(event) {
            if (resizePointerId !== event.pointerId) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            const nextDistance = Math.max(24, startDistance + Math.max(dx, dy));
            const nextScale = clamp(startScale * (nextDistance / startDistance), MIN_SCALE, MAX_SCALE);
            target.style.setProperty('--floating-ui-scale', nextScale);
            event.preventDefault();
        }

        function onResizeUp(event) {
            if (resizePointerId !== event.pointerId) return;
            resizePointerId = null;
            handles.resizeHandle.releasePointerCapture?.(event.pointerId);
            target.classList.remove('floating-ui-resizing');
            global.removeEventListener('pointermove', onResizeMove, { passive: false });
            global.removeEventListener('pointerup', onResizeUp);
            savePosition();
            if (event.cancelable) event.preventDefault();
        }

        target.addEventListener('pointerdown', (event) => {
            if (event.button != null && event.button !== 0) return;
            if (target.classList.contains('floating-ui-editing')) return;
            if (event.target === handles.resizeHandle) return;
            clearLongPressTimer();
            startX = event.clientX;
            startY = event.clientY;
            longPressTimer = setTimeout(() => {
                activateFloatingTarget(target);
                startDrag(event);
            }, LONG_PRESS_MS);
        }, { passive: true, capture: true });

        target.addEventListener('pointermove', (event) => {
            if (!longPressTimer) return;
            if (Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY) > 10) {
                clearLongPressTimer();
            }
        }, { passive: true, capture: true });

        target.addEventListener('pointerup', clearLongPressTimer, { passive: true, capture: true });
        target.addEventListener('pointercancel', clearLongPressTimer, { passive: true, capture: true });

        target.addEventListener('pointerdown', (event) => {
            if (!target.classList.contains('floating-ui-editing')) return;
            if (event.target === handles.resizeHandle) return;
            startDrag(event);
        });

        handles.resizeHandle.addEventListener('pointerdown', (event) => {
            activateFloatingTarget(target);
            const rect = target.getBoundingClientRect();
            resizePointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            startScale = Number.parseFloat(target.style.getPropertyValue('--floating-ui-scale')) || 1;
            startDistance = Math.max(rect.width, rect.height, 24);
            target.classList.add('floating-ui-resizing');
            try { handles.resizeHandle.setPointerCapture?.(event.pointerId); } catch (_err) {}
            global.addEventListener('pointermove', onResizeMove, { passive: false });
            global.addEventListener('pointerup', onResizeUp);
            if (event.cancelable) event.preventDefault();
            event.stopPropagation();
        });

        global.document.addEventListener('pointerdown', (event) => {
            if (!target.classList.contains('floating-ui-editing')) return;
            if (target.contains(event.target)) return;
            deactivateFloatingTarget(target);
        }, { passive: true });

        global.addEventListener('resize', () => {
            const nextPosition = normalizeFloatingPosition(target);
            writeFloatingState(storageKey, { ...readFloatingState(storageKey), ...nextPosition });
        });

        return { savePosition };
    }

    global.AiLabMiniMapUi = {
        ensureMiniMapElements,
        initFloatingUiControls,
        initMiniMapToggle,
        updateLocationText
    };
})(window);
