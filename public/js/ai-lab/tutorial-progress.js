window.AiLabTutorialProgress = (function() {
    function createController(config) {
        const ctx = config || {};

        function getTutorialBoardRollValue(round = 0) {
            const sequence = ctx.getCurrentBoardMap()?.rules_json?.tutorial_roll_sequence;
            if (!Array.isArray(sequence) || !sequence.length) return null;
            const values = sequence
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value > 0);
            if (!values.length) return null;
            return values[Number(round || 0) % values.length];
        }

        function isTutorialGuestStoryMode() {
            return ctx.getCurrentEntryMode() === 'story_campaign' && ctx.isTutorialGuestMode();
        }

        function getTutorialGuestProgressKey(questChainId = ctx.getCurrentQuestChainId()) {
            return `sandhill:tutorial-guest-progress:${questChainId || 'unknown'}`;
        }

        function getDefaultGuestState() {
            return { currentOrder: 1, completed: false, completedTaskIds: [] };
        }

        function getTutorialGuestState(questChainId = ctx.getCurrentQuestChainId()) {
            if (!questChainId) return getDefaultGuestState();
            try {
                const raw = sessionStorage.getItem(getTutorialGuestProgressKey(questChainId));
                if (!raw) return getDefaultGuestState();
                const parsed = JSON.parse(raw);
                return {
                    currentOrder: Number(parsed.currentOrder || 1),
                    completed: Boolean(parsed.completed),
                    completedTaskIds: Array.isArray(parsed.completedTaskIds)
                        ? parsed.completedTaskIds.map((id) => Number(id))
                        : []
                };
            } catch (err) {
                console.warn('讀取教學模式本地進度失敗', err);
                return getDefaultGuestState();
            }
        }

        function saveTutorialGuestState(nextState, questChainId = ctx.getCurrentQuestChainId()) {
            if (!questChainId) return;
            try {
                sessionStorage.setItem(getTutorialGuestProgressKey(questChainId), JSON.stringify({
                    currentOrder: Number(nextState.currentOrder || 1),
                    completed: Boolean(nextState.completed),
                    completedTaskIds: Array.isArray(nextState.completedTaskIds)
                        ? nextState.completedTaskIds.map((id) => Number(id))
                        : []
                }));
            } catch (err) {
                console.warn('保存教學模式本地進度失敗', err);
            }
        }

        function completeTutorialGuestTask(task) {
            const currentQuestChainId = ctx.getCurrentQuestChainId();
            if (!task || !currentQuestChainId) return;
            const state = getTutorialGuestState(currentQuestChainId);
            const completedTaskIds = new Set(state.completedTaskIds || []);
            completedTaskIds.add(Number(task.id));
            const sortedTasks = [...ctx.getCurrentStoryTasks()].sort((a, b) => Number(a.quest_order || 0) - Number(b.quest_order || 0));
            const nextTask = sortedTasks.find((item) => Number(item.quest_order || 0) > Number(task.quest_order || 0));
            const nextState = {
                currentOrder: nextTask ? Number(nextTask.quest_order || 1) : Number(task.quest_order || 1) + 1,
                completed: !nextTask,
                completedTaskIds: Array.from(completedTaskIds)
            };
            ctx.setCurrentStoryCompletedTaskIds(new Set(nextState.completedTaskIds));
            saveTutorialGuestState(nextState, currentQuestChainId);
        }

        async function completeTutorialLoggedInTask(task, answer) {
            if (!task || !ctx.getLoginUser()) return;
            try {
                await ctx.requestJson(`/api/tutorial/tasks/${task.id}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ answer: answer || 'tutorial_pass' })
                }, '教學模式完成任務');
            } catch (err) {
                console.warn('教學模式已登入任務完成失敗:', err.message);
            }
        }

        return {
            completeTutorialGuestTask,
            completeTutorialLoggedInTask,
            getTutorialBoardRollValue,
            getTutorialGuestProgressKey,
            getTutorialGuestState,
            isTutorialGuestStoryMode,
            saveTutorialGuestState
        };
    }

    return { createController };
})();
