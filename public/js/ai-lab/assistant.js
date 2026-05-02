(function (global) {
    const NPC_PROFILES = {
        guide: { name: '引路人・史蛋', portrait: '🥚', button: '知道了', theme: 'guide' },
        gatekeeper: { name: '潮汐關主・巴布', portrait: '🦀', button: '接受挑戰', theme: 'gatekeeper' },
        judge: { name: '潮汐裁判・鯨老', portrait: '🐋', button: '聽判定', theme: 'judge' },
        host: { name: '事件主持人・史蛋', portrait: '🥚', button: '繼續前進', theme: 'host' },
        rescue: { name: '救援員・巴布', portrait: '🦀', button: '重新整隊', theme: 'rescue' },
        lore: { name: '導覽員・鯨老', portrait: '🐋', button: '繼續聽', theme: 'lore' }
    };

    function createController(deps = {}) {
        const {
            elements = {},
            isCurrentQuestTutorialMode = () => false,
            isCurrentQuestDemoMode = () => false,
            isFormalStoryEntryMode = () => false,
            clearFormalStoryIntroMode = () => {},
            renderTutorialUi = () => {},
            closeDockPanels = () => {},
            getCurrentTask = () => null,
            getTaskVideoUrl = () => '',
            maybeAutoOpenTaskIntro = () => {}
        } = deps;

        const {
            npcDialog,
            npcDialogText,
            npcDialogPortrait,
            npcDialogSpeaker,
            npcDialogMood,
            npcDialogClose,
            featureDockMenu,
            featureDockToggle,
            gameShellPanel,
            miniMapWrap,
            taskStatusBox,
            taskIntroPanel,
            taskHudToggle
        } = elements;

        let autoCloseTimer = null;
        let resolver = null;

        function clearAutoCloseTimer() {
            if (autoCloseTimer) {
                clearTimeout(autoCloseTimer);
                autoCloseTimer = null;
            }
        }

        function resolvePending() {
            if (resolver) {
                resolver();
                resolver = null;
            }
        }

        function revealFormalStoryShell() {
            clearFormalStoryIntroMode();
            closeDockPanels();
            featureDockMenu?.classList.add('hidden');
            if (featureDockToggle) featureDockToggle.textContent = '☰';
            gameShellPanel?.classList.remove('collapsed');
            miniMapWrap?.classList.add('collapsed');
            taskStatusBox?.classList.add('hidden');
            taskIntroPanel?.classList.add('hidden');
            if (taskHudToggle) taskHudToggle.setAttribute('aria-expanded', 'false');
            renderTutorialUi();
            const currentTask = getCurrentTask();
            if (getTaskVideoUrl(currentTask)) {
                window.setTimeout(() => maybeAutoOpenTaskIntro(currentTask), 120);
            }
        }

        function closeNpcDialog(options = {}) {
            clearAutoCloseTimer();
            if (npcDialog) {
                delete npcDialog.dataset.blocking;
                npcDialog.classList.remove('passive');
                npcDialog.classList.add('hidden');
            }

            const shouldRevealFormalStoryShell = !options.skipFormalStoryReveal
                && isFormalStoryEntryMode();
            if (shouldRevealFormalStoryShell) {
                revealFormalStoryShell();
            }
            resolvePending();
            if (!shouldRevealFormalStoryShell) {
                renderTutorialUi();
            }
        }

        function isNpcDialogBlocking() {
            return Boolean(npcDialog
                && !npcDialog.classList.contains('hidden')
                && npcDialog.dataset.blocking === 'true');
        }

        function showNpcDialog({
            speaker = '沙丘引導員',
            speakerKey = null,
            mood = '提示',
            text = '',
            buttonLabel = null,
            autoCloseMs = null,
            blocking = null
        } = {}) {
            if (!npcDialog || !npcDialogText) return Promise.resolve();

            clearAutoCloseTimer();
            const isTutorial = isCurrentQuestTutorialMode() || isCurrentQuestDemoMode();
            const shouldBlock = typeof blocking === 'boolean' ? blocking : !isTutorial;
            const profile = speakerKey ? NPC_PROFILES[speakerKey] : null;

            if (npcDialogPortrait) npcDialogPortrait.textContent = profile?.portrait || '🧭';
            npcDialog.dataset.speaker = profile?.theme || 'guide';
            npcDialog.dataset.blocking = shouldBlock ? 'true' : 'false';
            npcDialog.classList.toggle('passive', !shouldBlock);

            if (npcDialogSpeaker) npcDialogSpeaker.textContent = profile?.name || speaker;
            if (npcDialogMood) npcDialogMood.textContent = mood;
            if (npcDialogClose) npcDialogClose.textContent = buttonLabel || (shouldBlock ? (profile?.button || '繼續') : '收起');

            npcDialogText.textContent = text || '……';
            npcDialog.classList.remove('hidden');

            renderTutorialUi();
            resolvePending();

            const promise = shouldBlock
                ? new Promise((resolve) => { resolver = resolve; })
                : Promise.resolve();

            if (autoCloseMs && autoCloseMs > 0) {
                autoCloseTimer = setTimeout(() => closeNpcDialog(), autoCloseMs);
            }

            return promise;
        }

        return {
            showNpcDialog,
            closeNpcDialog,
            isNpcDialogBlocking
        };
    }

    global.AiLabAssistant = {
        NPC_PROFILES,
        createController
    };
})(window);
