(function(global) {
    function normalizeChoiceOption(rawOption, index) {
        const fallbackKey = String.fromCharCode(65 + index);
        if (typeof rawOption === 'string') {
            const text = rawOption.trim();
            return text ? { key: fallbackKey, label: text, value: text } : null;
        }
        if (!rawOption || typeof rawOption !== 'object') return null;
        const labelCandidate = rawOption.label ?? rawOption.text ?? rawOption.title ?? rawOption.name ?? rawOption.value;
        const valueCandidate = rawOption.value ?? rawOption.answer ?? labelCandidate;
        const label = String(labelCandidate || '').trim();
        const value = String(valueCandidate || '').trim();
        if (!label && !value) return null;
        const key = String(rawOption.key || rawOption.option || fallbackKey).trim().toUpperCase();
        return {
            key: key || fallbackKey,
            label: label || value,
            value: value || label
        };
    }

    function buildTaskChoiceOptions(task) {
        let options = [];
        if (Array.isArray(task?.options)) {
            options = task.options;
        } else if (typeof task?.options === 'string') {
            try {
                const parsed = JSON.parse(task.options || '[]');
                if (Array.isArray(parsed)) options = parsed;
            } catch (err) {
                options = [];
            }
        }
        return options
            .map((opt, idx) => normalizeChoiceOption(opt, idx))
            .filter(Boolean);
    }

    function initLockWheels(lockWheels, digits = 4) {
        if (!lockWheels) return;
        lockWheels.innerHTML = '';
        for (let i = 0; i < digits; i += 1) {
            const wheel = global.document.createElement('div');
            wheel.className = 'wheel';
            wheel.dataset.value = '0';
            wheel.innerHTML = '<button class="btn-up" type="button">▲</button><div class="digit">0</div><button class="btn-down" type="button">▼</button>';
            const digitEl = wheel.querySelector('.digit');
            const setVal = (value) => {
                const nextValue = (value + 10) % 10;
                wheel.dataset.value = String(nextValue);
                digitEl.textContent = String(nextValue);
            };
            wheel.querySelector('.btn-up').onclick = () => setVal(Number(wheel.dataset.value) + 1);
            wheel.querySelector('.btn-down').onclick = () => setVal(Number(wheel.dataset.value) - 1);
            let startY = null;
            wheel.addEventListener('pointerdown', (event) => {
                startY = event.clientY;
                wheel.setPointerCapture(event.pointerId);
            });
            wheel.addEventListener('pointermove', (event) => {
                if (startY == null) return;
                const deltaY = event.clientY - startY;
                if (Math.abs(deltaY) > 18) {
                    setVal(Number(wheel.dataset.value) + (deltaY < 0 ? 1 : -1));
                    startY = event.clientY;
                }
            });
            wheel.addEventListener('pointerup', () => { startY = null; });
            wheel.addEventListener('pointercancel', () => { startY = null; });
            lockWheels.appendChild(wheel);
        }
    }

    function getLockCode(lockWheels) {
        if (!lockWheels) return '';
        return Array.from(lockWheels.querySelectorAll('.wheel'))
            .map((wheel) => wheel.dataset.value || '0')
            .join('');
    }

    function setAnswerChoicePendingState(isPending) {
        const choiceNodes = global.document.querySelectorAll('.answer-choice');
        choiceNodes.forEach((node) => {
            node.classList.toggle('pending', isPending);
            if (isPending) node.setAttribute('aria-disabled', 'true');
            else node.removeAttribute('aria-disabled');
        });
    }

    function setAnswerSubmitLoadingState({ btnAnswerSubmit, idleLabel, isLoading, pendingLabel = '系統確認中...' } = {}) {
        if (!btnAnswerSubmit) return;
        btnAnswerSubmit.classList.toggle('is-loading', Boolean(isLoading));
        btnAnswerSubmit.textContent = isLoading ? pendingLabel : idleLabel;
    }

    function renderAnswerModal({
        task,
        isDemoMode,
        isShellExperience,
        readOnly = false,
        prefillAnswer = '',
        elements = {},
        callbacks = {}
    } = {}) {
        const {
            answerModal,
            answerTaskName,
            answerTaskDescription,
            answerInputContainer,
            answerMessage,
            btnAnswerSubmit
        } = elements;
        const {
            resetAnswerSubmitUi,
            onPhotoSelected,
            refreshAnswerPhotoFromReticle
        } = callbacks;

        if (!answerModal || !task) return;
        answerTaskName.textContent = task.name || '任務';
        const descriptionParts = [task.description || '請根據提示完成任務'];
        if (isDemoMode) {
            if (task.task_type === 'photo') descriptionParts.push('教學模式：任意拍攝一張照片就能通過，先讓你把整段流程走完。');
            else if (task.task_type === 'multiple_choice') descriptionParts.push('教學模式：任意選一個選項都會先通關，先讓你熟悉對話與流程。');
            else descriptionParts.push('教學模式：這一關會先放行，讓你能直接往下體驗。');
        }
        answerTaskDescription.textContent = descriptionParts.join('\n\n');
        answerInputContainer.innerHTML = '';
        answerMessage.textContent = readOnly ? '✅ 此關卡已完成，答案已鎖定為唯讀模式。' : '';
        if (typeof resetAnswerSubmitUi === 'function') resetAnswerSubmitUi();
        btnAnswerSubmit.disabled = true;

        if (task.task_type === 'multiple_choice') {
            const choicesDiv = global.document.createElement('div');
            choicesDiv.className = 'answer-choices';
            const choices = buildTaskChoiceOptions(task);
            choices.forEach((choice) => {
                const node = global.document.createElement('div');
                node.className = 'answer-choice';
                node.textContent = choice.label;
                node.dataset.value = choice.value;
                node.dataset.choiceKey = choice.key;
                const normalizedPrefill = String(prefillAnswer || '').trim().toLowerCase();
                const normalizedValue = String(choice.value || '').trim().toLowerCase();
                const normalizedKey = String(choice.key || '').trim().toLowerCase();
                const normalizedLabel = String(choice.label || '').trim().toLowerCase();
                const shouldSelect = normalizedPrefill && (
                    normalizedPrefill === normalizedValue
                    || normalizedPrefill === normalizedLabel
                    || normalizedPrefill === normalizedKey
                    || normalizedPrefill.startsWith(normalizedKey + '.')
                    || normalizedPrefill.startsWith(normalizedKey + ' ')
                    || normalizedPrefill.startsWith(normalizedKey + '：')
                );
                if (shouldSelect) node.classList.add('selected');
                if (readOnly) {
                    node.setAttribute('aria-disabled', 'true');
                } else {
                    node.onclick = () => {
                        choicesDiv.querySelectorAll('.answer-choice').forEach((choiceNode) => choiceNode.classList.remove('selected'));
                        node.classList.add('selected');
                        btnAnswerSubmit.disabled = false;
                    };
                }
                choicesDiv.appendChild(node);
            });
            if (!choices.length) {
                const emptyHint = global.document.createElement('div');
                emptyHint.className = 'answer-message';
                emptyHint.textContent = '此關卡沒有可用選項，請通知工作人員檢查題目設定。';
                choicesDiv.appendChild(emptyHint);
            }
            answerInputContainer.appendChild(choicesDiv);
            if (readOnly) {
                btnAnswerSubmit.disabled = true;
            }
        } else if (task.task_type === 'photo') {
            const group = global.document.createElement('div');
            group.className = 'answer-input-group';
            if (isShellExperience) {
                group.innerHTML = `
                    <label>📸 使用圓框鏡頭作答</label>
                    <div class="camera-answer-helper">直接用目前黃色圓框裡的畫面作答，不需要再跳去上傳檔案。</div>
                    <div class="camera-answer-actions">
                        <button type="button" id="answerCaptureFromReticle" class="btn secondary">使用目前圓框拍照</button>
                        <button type="button" id="answerRetakeFromReticle" class="btn secondary">重新取景</button>
                    </div>
                    <img id="answerPhotoPreview" style="display:none;max-width:100%;margin-top:10px;border-radius:12px;">
                `;
            } else {
                group.innerHTML = '<label>📸 上傳照片</label><input type="file" id="answerPhotoInput" accept="image/*" capture="environment"><img id="answerPhotoPreview" style="display:none;max-width:100%;margin-top:10px;border-radius:8px;">';
            }
            answerInputContainer.appendChild(group);
            const preview = global.document.getElementById('answerPhotoPreview');
            const input = global.document.getElementById('answerPhotoInput');
            const answerCaptureFromReticle = global.document.getElementById('answerCaptureFromReticle');
            const answerRetakeFromReticle = global.document.getElementById('answerRetakeFromReticle');
            if (input) {
                input.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (readerEvent) => {
                        const dataUrl = readerEvent.target.result;
                        if (typeof onPhotoSelected === 'function') onPhotoSelected(dataUrl, preview);
                    };
                    reader.readAsDataURL(file);
                });
            }
            if (answerCaptureFromReticle) {
                if (!readOnly) {
                    answerCaptureFromReticle.addEventListener('click', () => refreshAnswerPhotoFromReticle());
                    setTimeout(() => refreshAnswerPhotoFromReticle(), 120);
                } else {
                    answerCaptureFromReticle.setAttribute('disabled', 'true');
                }
            }
            if (answerRetakeFromReticle) {
                if (!readOnly) {
                    answerRetakeFromReticle.addEventListener('click', () => refreshAnswerPhotoFromReticle());
                } else {
                    answerRetakeFromReticle.setAttribute('disabled', 'true');
                }
            }
        } else {
            const group = global.document.createElement('div');
            group.className = 'answer-input-group';
            group.innerHTML = '<label>✍️ 請輸入答案</label><input type="text" id="answerTextInput" autocomplete="off" placeholder="請輸入您的答案...">';
            answerInputContainer.appendChild(group);
            const input = global.document.getElementById('answerTextInput');
            if (readOnly) {
                input.value = String(prefillAnswer || '');
                input.setAttribute('readonly', 'true');
                btnAnswerSubmit.disabled = true;
            } else {
                input.addEventListener('input', () => {
                    btnAnswerSubmit.disabled = input.value.trim() === '';
                });
                setTimeout(() => input.focus(), 150);
            }
        }
        answerModal.classList.remove('hidden');
        answerInputContainer.scrollTop = 0;
    }

    global.AiLabAnswerUi = {
        normalizeChoiceOption,
        buildTaskChoiceOptions,
        initLockWheels,
        getLockCode,
        setAnswerChoicePendingState,
        setAnswerSubmitLoadingState,
        renderAnswerModal
    };
})(window);
