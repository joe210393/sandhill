
window.AiLabQueryUi = (function() {
    let ctx = {};
    let answerToastTimer = null;

    function init(config) {
        ctx = { ...ctx, ...config };
    }

    function setQueryTransitText(message) {
            const { queryTransitLabel } = ctx;
            if (!queryTransitLabel) return;
            const text = message || '已將問題用紙飛機寄出去囉，請等候回應';
            const mainText = queryTransitLabel.querySelector('.qp-text-main');
            if (mainText) mainText.textContent = text;
        }

    function showQueryTransit(message) {
            const { queryTransit } = ctx;
            setQueryTransitText(message);
            if (queryTransit) {
                queryTransit.classList.remove('hidden');
                queryTransit.classList.remove('returning');
                queryTransit.classList.add('sending');
            }
        }

    function hideQueryTransit() {
            const { queryTransit } = ctx;
            if (queryTransit) {
                queryTransit.classList.add('hidden');
                queryTransit.classList.remove('sending', 'returning');
            }
        }

    async function playQueryReturnAnimation(message) {
            const { queryTransit } = ctx;
            setQueryTransitText(message);
            if (!queryTransit) return;
            queryTransit.classList.remove('hidden', 'sending');
            queryTransit.classList.add('returning');
            await new Promise((resolve) => setTimeout(resolve, 850));
            hideQueryTransit();
        }

    function showAnswerToast(text) {
            const { answerToast, answerToastText, syncCompactUxState } = ctx;
            if (!answerToast || !answerToastText) return;
            answerToastText.textContent = text || '';
            answerToast.classList.remove('hidden');
            if (typeof syncCompactUxState === 'function') syncCompactUxState();
            if (answerToastTimer) clearTimeout(answerToastTimer);
            answerToastTimer = setTimeout(() => {
                answerToast.classList.add('hidden');
                if (typeof syncCompactUxState === 'function') syncCompactUxState();
            }, 12000);
        }

    function hideAnswerToast() {
            const { answerToast, syncCompactUxState } = ctx;
            if (answerToastTimer) clearTimeout(answerToastTimer);
            if (answerToast) answerToast.classList.add('hidden');
            if (typeof syncCompactUxState === 'function') syncCompactUxState();
        }

    function collapseResultPanel() {
            const { resultPanel, selectionInstruction } = ctx;
            if (resultPanel) {
                resultPanel.classList.remove('active');
                resultPanel.style.display = 'none';
            }
            if (selectionInstruction) {
                selectionInstruction.style.opacity = '1';
                selectionInstruction.style.display = '';
            }
        }


    return {
        init,
        setQueryTransitText,
        showQueryTransit,
        hideQueryTransit,
        playQueryReturnAnimation,
        showAnswerToast,
        hideAnswerToast,
        collapseResultPanel
    };
})();
