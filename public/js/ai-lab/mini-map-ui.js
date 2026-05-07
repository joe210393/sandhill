(function(global) {
    const DEFAULT_STORAGE_KEY = 'aiLabMiniMapCollapsed';
    const FLOATING_UI_PREFIX = 'aiLabFloatingUi:';
    const SIZE_STEPS = ['sm', 'md', 'lg'];

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

    function ensureFloatingControls(target, { label = '移動', showResize = true } = {}) {
        if (!target) return {};
        let controls = Array.from(target.children)
            .find((child) => child.classList && child.classList.contains('floating-ui-controls'));
        if (!controls) {
            controls = global.document.createElement('div');
            controls.className = 'floating-ui-controls';
            target.insertBefore(controls, target.firstChild);
        }

        let handle = controls.querySelector('.floating-ui-drag-handle');
        if (!handle) {
            handle = global.document.createElement('button');
            handle.type = 'button';
            handle.className = 'floating-ui-drag-handle';
            handle.textContent = label;
            handle.setAttribute('aria-label', '拖曳移動 UI');
            controls.appendChild(handle);
        }

        let resizeBtn = controls.querySelector('.floating-ui-resize-btn');
        if (showResize && !resizeBtn) {
            resizeBtn = global.document.createElement('button');
            resizeBtn.type = 'button';
            resizeBtn.className = 'floating-ui-resize-btn';
            resizeBtn.textContent = '大小';
            resizeBtn.setAttribute('aria-label', '切換 UI 大小');
            controls.appendChild(resizeBtn);
        }
        return { controls, handle, resizeBtn };
    }

    function applyFloatingState(target, state = {}) {
        if (!target) return;
        target.classList.add('floating-ui-customizable');
        SIZE_STEPS.forEach((size) => target.classList.toggle(`floating-ui-size-${size}`, state.size === size));
        if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
            target.style.left = `${state.x}px`;
            target.style.top = `${state.y}px`;
            target.style.right = 'auto';
            target.style.bottom = 'auto';
            target.style.transform = 'none';
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
        target.style.transform = 'none';
        return { x, y };
    }

    function initFloatingUiControls({
        target,
        storageKey,
        label = '移動',
        showResize = true,
        onChange
    } = {}) {
        if (!target || !storageKey) return null;
        const state = readFloatingState(storageKey);
        const controls = ensureFloatingControls(target, { label, showResize });
        applyFloatingState(target, state);

        let activePointerId = null;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        let moved = false;

        function savePosition() {
            const nextPosition = normalizeFloatingPosition(target);
            const nextState = { ...readFloatingState(storageKey), ...nextPosition };
            writeFloatingState(storageKey, nextState);
            if (typeof onChange === 'function') onChange(nextState);
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
            controls.handle.releasePointerCapture?.(event.pointerId);
            target.classList.remove('floating-ui-dragging');
            global.removeEventListener('pointermove', onPointerMove, { passive: false });
            global.removeEventListener('pointerup', onPointerUp);
            savePosition();
            if (moved) {
                event.preventDefault();
                event.stopPropagation();
            }
        }

        controls.handle.addEventListener('pointerdown', (event) => {
            if (event.button != null && event.button !== 0) return;
            const rect = target.getBoundingClientRect();
            activePointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            moved = false;
            target.classList.add('floating-ui-dragging');
            controls.handle.setPointerCapture?.(event.pointerId);
            normalizeFloatingPosition(target);
            global.addEventListener('pointermove', onPointerMove, { passive: false });
            global.addEventListener('pointerup', onPointerUp);
            event.preventDefault();
        });

        if (controls.resizeBtn) {
            controls.resizeBtn.addEventListener('click', () => {
                const current = readFloatingState(storageKey);
                const currentSize = current.size || state.size || 'md';
                const nextSize = SIZE_STEPS[(SIZE_STEPS.indexOf(currentSize) + 1) % SIZE_STEPS.length];
                const nextState = { ...current, size: nextSize };
                writeFloatingState(storageKey, nextState);
                applyFloatingState(target, nextState);
                requestAnimationFrame(savePosition);
            });
        }

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
