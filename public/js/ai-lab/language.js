window.AiLabLanguage = (function() {
    function createController(config) {
        const ctx = config || {};

        function getActiveScript() {
            const currentTask = ctx.getCurrentTask();
            if (ctx.getCurrentMode() === 'mission' && currentTask) {
                const name = currentTask.name || '任務';
                const desc = currentTask.description || '';
                return {
                    title: name,
                    intro: desc || '請根據任務說明與景點介紹進行互動。',
                    system: `你是此景點的導覽者。請根據以下任務說明，用簡潔、友善的方式回答玩家的提問或介紹圈選的內容。\n\n【任務】${name}\n${desc ? '【說明】' + desc : ''}`,
                    user: '請根據這個任務的景點介紹，說明我圈選的內容。'
                };
            }
            return ctx.prompts.free;
        }

        function applyScript(script, showIntro = true) {
            if (!script) return;
            if (ctx.systemPromptInput) ctx.systemPromptInput.value = script.system;
            if (ctx.userPromptInput) ctx.userPromptInput.value = script.user;

            if (ctx.systemPromptInput) {
                ctx.systemPromptInput.style.transition = 'background 0.3s';
                ctx.systemPromptInput.style.background = '#333';
                setTimeout(() => { ctx.systemPromptInput.style.background = ''; }, 300);
            }

            if (showIntro) {
                Swal.fire({
                    title: script.title,
                    text: script.intro,
                    icon: ctx.getCurrentMode() === 'mission' ? 'warning' : 'info',
                    confirmButtonText: '開始',
                    backdrop: 'rgba(0,0,0,0.8)'
                });
            }
        }

        function getCurrentLanguage() {
            return ctx.langSelect ? ctx.langSelect.value : 'zh';
        }

        function getLanguageInstruction() {
            switch (getCurrentLanguage()) {
                case 'en':
                    return 'Please reply in English.';
                case 'ja':
                    return '日本語で回答してください。';
                case 'ko':
                    return '한국어로 답변해 주세요.';
                default:
                    return '請用繁體中文回答。';
            }
        }

        function getSpeechLocale() {
            switch (getCurrentLanguage()) {
                case 'en':
                    return 'en-US';
                case 'ja':
                    return 'ja-JP';
                case 'ko':
                    return 'ko-KR';
                default:
                    return 'zh-TW';
            }
        }

        function initLanguageSelector() {
            if (!ctx.langSelect) return;
            const saved = localStorage.getItem('aiLabLang');
            if (saved) ctx.langSelect.value = saved;
            ctx.langSelect.addEventListener('change', () => {
                localStorage.setItem('aiLabLang', ctx.langSelect.value);
            });
        }

        return {
            applyScript,
            getActiveScript,
            getLanguageInstruction,
            getSpeechLocale,
            initLanguageSelector
        };
    }

    return { createController };
})();
