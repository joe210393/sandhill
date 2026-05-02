window.AiLabBoardAnimations = (function() {
    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function playTone(type, notes) {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.type = type;
            notes.forEach((note, index) => {
                const method = index === 0 ? 'setValueAtTime' : 'exponentialRampToValueAtTime';
                osc.frequency[method](note.frequency, audioCtx.currentTime + note.at);
            });
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + notes[notes.length - 1].duration);
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + notes[notes.length - 1].duration);
        } catch (error) {
            // Browser audio can fail before the user interacts with the page.
        }
    }

    function createDefaultDrawPool() {
        return [
            { label: '獲得 5 點旅程積分', effect_type: 'gain_points', effect_value: 5, icon: '🌊', flavor: '海流替你送來一點順風。' },
            { label: '獲得 8 點旅程積分', effect_type: 'gain_points', effect_value: 8, icon: '🎁', flavor: '補給箱剛好漂到你腳邊。' },
            { label: '順風前進 1 格', effect_type: 'move_forward', effect_value: 1, icon: '🧭', flavor: '命運把你往前推了一小段。' },
            { label: '保持原地穩穩前進', effect_type: 'narrative', effect_value: 0, icon: '✨', flavor: '這一步沒有額外效果，但節奏依舊漂亮。' }
        ];
    }

    function createController(config) {
        const ctx = config || {};

        async function playDiceRollAnimation(rollValue, targetTile = null) {
            const { diceOverlay, diceCube, diceOverlayText } = ctx;
            if (!diceOverlay || !diceCube || !diceOverlayText) return;

            diceOverlay.classList.remove('hidden');
            diceCube.classList.remove('rolling');
            diceCube.textContent = '🎲';
            diceOverlayText.textContent = '命運之骰正在翻滾，請稍候...';
            void diceCube.offsetWidth;
            diceCube.classList.add('rolling');

            playTone('triangle', [
                { frequency: 400, at: 0, duration: 0.3 },
                { frequency: 800, at: 0.1, duration: 0.3 },
                { frequency: 300, at: 0.2, duration: 0.3 },
                { frequency: 600, at: 0.3, duration: 0.3 }
            ]);

            await wait(400);
            diceCube.classList.remove('rolling');
            diceCube.textContent = String(rollValue);
            diceOverlayText.textContent = targetTile
                ? `你擲出了 ${rollValue}，接下來前往第 ${targetTile.tile_index} 格「${targetTile.tile_name}」。`
                : `你擲出了 ${rollValue}。`;

            playTone('sine', [
                { frequency: 880, at: 0, duration: 0.5 }
            ]);

            await wait(800);
            diceOverlay.classList.add('hidden');
        }

        function hideBoardCardOverlay() {
            if (ctx.boardCardOverlay) ctx.boardCardOverlay.classList.add('hidden');
            if (ctx.slotMachine) ctx.slotMachine.classList.add('hidden');
            if (ctx.fortuneWheelWrap) ctx.fortuneWheelWrap.classList.add('hidden');
            if (ctx.fortuneWheel) ctx.fortuneWheel.style.transform = 'rotate(0deg)';
        }

        async function playBoardDrawCardAnimation(tile) {
            const meta = ctx.getBoardTileMeta ? ctx.getBoardTileMeta(tile) : {};
            const cardType = meta.card_type || (tile.tile_type === 'reward' ? 'chance' : 'fate');
            const drawPool = Array.isArray(meta.draw_pool) && meta.draw_pool.length
                ? meta.draw_pool
                : createDefaultDrawPool();
            const outcome = drawPool[Math.floor(Math.random() * drawPool.length)];

            if (!ctx.boardCardOverlay || !ctx.boardCardBadge || !ctx.boardCardTitle || !ctx.boardCardSubtitle || !ctx.boardCardResult) {
                return outcome;
            }

            ctx.boardCardBadge.textContent = cardType === 'chance' ? '機會卡' : '命運卡';
            ctx.boardCardTitle.textContent = tile.tile_name || (cardType === 'chance' ? '抽取機會卡' : '抽取命運卡');
            ctx.boardCardSubtitle.textContent = cardType === 'chance'
                ? '吃角子老虎機正在替你翻出這一張卡。'
                : '命運轉盤正在轉動，請等待落點。';
            ctx.boardCardResult.textContent = '抽取結果中...';
            ctx.boardCardOverlay.classList.remove('hidden');

            if (cardType === 'chance') {
                await playChanceAnimation(outcome);
            } else {
                await playFateAnimation(drawPool, outcome);
            }

            ctx.boardCardResult.textContent = `${outcome.label}\n${outcome.flavor || ''}`.trim();
            await wait(1250);
            hideBoardCardOverlay();
            return outcome;
        }

        async function playChanceAnimation(outcome) {
            const symbols = ['🌊', '🧭', '🎁', '✨', '🐚', '🐟'];
            ctx.slotMachine?.classList.remove('hidden');
            ctx.fortuneWheelWrap?.classList.add('hidden');
            [ctx.slotReelA, ctx.slotReelB, ctx.slotReelC].forEach((reel) => {
                reel?.parentElement?.classList.add('spinning');
            });

            for (let index = 0; index < 16; index += 1) {
                if (ctx.slotReelA) ctx.slotReelA.textContent = symbols[(index + 1) % symbols.length];
                if (ctx.slotReelB) ctx.slotReelB.textContent = symbols[(index + 3) % symbols.length];
                if (ctx.slotReelC) ctx.slotReelC.textContent = symbols[(index + 5) % symbols.length];
                await wait(85);
            }

            if (ctx.slotReelA) ctx.slotReelA.textContent = outcome.icon || '🌊';
            if (ctx.slotReelB) ctx.slotReelB.textContent = outcome.icon || '🌊';
            if (ctx.slotReelC) ctx.slotReelC.textContent = outcome.icon || '🌊';
            [ctx.slotReelA, ctx.slotReelB, ctx.slotReelC].forEach((reel) => {
                reel?.parentElement?.classList.remove('spinning');
            });
        }

        async function playFateAnimation(drawPool, outcome) {
            ctx.slotMachine?.classList.add('hidden');
            ctx.fortuneWheelWrap?.classList.remove('hidden');
            if (ctx.fortuneWheel) {
                const spins = 5 + Math.floor(Math.random() * 2);
                const sectors = drawPool.length;
                const chosenIndex = Math.max(0, drawPool.findIndex((item) => item.label === outcome.label));
                const sectorAngle = 360 / sectors;
                const stopAngle = 360 - (chosenIndex * sectorAngle) - sectorAngle / 2;
                ctx.fortuneWheel.style.transform = `rotate(${spins * 360 + stopAngle}deg)`;
            }
            await wait(2100);
        }

        return {
            hideBoardCardOverlay,
            playBoardDrawCardAnimation,
            playDiceRollAnimation
        };
    }

    return { createController };
})();
