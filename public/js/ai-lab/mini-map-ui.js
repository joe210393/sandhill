(function(global) {
    const DEFAULT_STORAGE_KEY = 'aiLabMiniMapCollapsed';

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

    global.AiLabMiniMapUi = {
        ensureMiniMapElements,
        initMiniMapToggle,
        updateLocationText
    };
})(window);
