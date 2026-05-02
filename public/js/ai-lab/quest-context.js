
window.AiLabQuestContext = (function() {
    let ctx = {};

    function init(config) {
        ctx = { ...ctx, ...config };
    }

        function getCurrentQuestRules() {
        const { currentQuestChainData, currentTask, getLoginUser } = ctx;

            return currentQuestChainData?.game_rules || currentQuestChainData?.content_blueprint || {};
        }

        function getCurrentExperienceMode() {
        const { currentQuestChainData, currentTask, getLoginUser } = ctx;

            const explicit = typeof currentQuestChainData?.experience_mode === 'string'
                ? currentQuestChainData.experience_mode.trim().toLowerCase()
                : '';
            if (['formal', 'tutorial', 'demo'].includes(explicit)) {
                return explicit;
            }
            const rules = getCurrentQuestRules();
            if (rules && (rules.demo_autopass || rules.demoAutoPass)) return 'demo';
            if (
                (rules && (rules.tutorial_mode || rules.tutorialMode))
                || currentQuestChainData?.play_style === 'tutorial_story'
                || currentQuestChainData?.play_style === 'tutorial_board'
                || currentQuestChainData?.play_style === 'demo_story'
            ) {
                return 'tutorial';
            }
            return 'formal';
        }

        function isCurrentQuestDemoMode() {
        const { currentQuestChainData, currentTask, getLoginUser } = ctx;

            return getCurrentExperienceMode() === 'demo';
        }

        function isCurrentQuestTutorialMode() {
        const { currentQuestChainData, currentTask, getLoginUser } = ctx;

            return getCurrentExperienceMode() === 'tutorial';
        }

        function isTutorialGuestMode() {
        const { currentQuestChainData, currentTask, getLoginUser } = ctx;

            return isCurrentQuestTutorialMode() && !getLoginUser();
        }

        function getTutorialMockDistance(task = currentTask) {
        const { currentQuestChainData, currentTask, getLoginUser } = ctx;

            const questOrder = Number(task?.quest_order) || 1;
            const radius = Number(task?.radius) || 24;
            return Math.max(8, Math.round(radius + questOrder * 7));
        }

        function getTutorialMockBearing(task = currentTask) {
        const { currentQuestChainData, currentTask, getLoginUser } = ctx;

            const questOrder = Number(task?.quest_order) || 1;
            return (questOrder * 37) % 360;
        }


    return {
        init,
        getCurrentQuestRules,
        getCurrentExperienceMode,
        isCurrentQuestDemoMode,
        isCurrentQuestTutorialMode,
        isTutorialGuestMode,
        getTutorialMockDistance,
        getTutorialMockBearing
    };
})();
