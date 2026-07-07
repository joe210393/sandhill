(function(global) {
    function createDefaultState() {
        return {
            isDrawing: false,
            points: [],
            selectionMode: 'reticle',
            cameraCaptureMode: 'task',
            reticleCenter: { x: 0, y: 0 },
            reticleRadius: 0,
            tapStart: null,
            currentMode: 'free',
            mapInstance: null,
            mapMarker: null,
            taskMapMarker: null,
            nearbyTaskLayer: null,
            nearbyVisibleTasks: [],
            lastLocationText: '',
            lastLatLng: null,
            currentTask: null,
            currentTaskId: null,
            currentUserTaskId: null,
            currentQuestChainId: null,
            currentQuestChainData: null,
            currentEntryMode: null,
            currentStoryTasks: [],
            currentStoryCompleted: false,
            currentStoryCompletedTaskIds: new Set(),
            currentBoardMaps: [],
            currentBoardTiles: [],
            currentBoardMap: null,
            currentBoardActiveTileId: null,
            isShellExperience: false,
            playerHudStats: { points: null, badges: [] },
            currentBoardRun: null,
            currentBoardSessionId: null,
            useRemoteBoardSession: false,
            photoCaptureModeActive: false,
            currentAnswerPhotoDataUrl: null,
            pendingPhotoDataUrl: null,
            tutorialBoardPhotoCaptureArmed: false,
            pendingStoryReloadAfterCompletion: false,
            currentNpcDialogResolver: null,
            currentNpcDialogAutoCloseTimer: null,
            lastStoryDialogueKey: null,
            formalStoryIntroMode: false,
            tutorialFlowStarted: false,
            tutorialIntroTaskId: null,
            targetLat: null,
            targetLng: null,
            questProgressCache: null,
            questProgressCacheAt: 0
        };
    }

    function createController(initialState = {}) {
        const values = { ...createDefaultState(), ...initialState };
        const keys = Object.keys(values);

        function get(key) {
            return values[key];
        }

        function set(key, value) {
            values[key] = value;
            return value;
        }

        function assign(nextValues = {}) {
            Object.keys(nextValues).forEach((key) => {
                if (keys.includes(key)) values[key] = nextValues[key];
            });
            return values;
        }

        function snapshot() {
            return { ...values };
        }

        function bindGlobals(target = global) {
            keys.forEach((key) => {
                const descriptor = Object.getOwnPropertyDescriptor(target, key);
                if (descriptor && descriptor.configurable === false) return;
                Object.defineProperty(target, key, {
                    configurable: true,
                    enumerable: false,
                    get() {
                        return values[key];
                    },
                    set(value) {
                        values[key] = value;
                    }
                });
            });
            return values;
        }

        return {
            assign,
            bindGlobals,
            get,
            keys: Object.freeze([...keys]),
            set,
            snapshot,
            values
        };
    }

    global.AiLabRuntimeState = {
        createController,
        createDefaultState
    };
})(window);
