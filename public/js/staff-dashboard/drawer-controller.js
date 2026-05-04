(function(global) {
  function getTaskWizardStepElement(step) {
    return global.document.querySelector(`.task-wizard-step[data-task-step="${step}"]`);
  }

  function resolveActiveForm({ drawer, formIdMap, setActiveFormId } = {}) {
    const activeSection = drawer?.dataset.activeSection
      ? global.document.getElementById(drawer.dataset.activeSection)
      : global.document.querySelector('.drawer-form-section.active');
    if (!activeSection) return null;
    const fallbackFormId = activeSection.dataset.formId || formIdMap[activeSection.id] || '';
    const form = fallbackFormId ? global.document.getElementById(fallbackFormId) : activeSection.querySelector('form');
    if (form?.id && typeof setActiveFormId === 'function') setActiveFormId(form.id);
    return form || null;
  }

  function scrollToFirstInvalid(scope) {
    if (!scope) return;
    const firstInvalid = scope.querySelector(':invalid');
    if (firstInvalid && typeof firstInvalid.scrollIntoView === 'function') {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof firstInvalid.focus === 'function') firstInvalid.focus();
    }
  }

  function syncDrawerFooter({
    drawer,
    formIdMap,
    activeFormId,
    taskWizardStep,
    totalSteps,
    setActiveFormId
  } = {}) {
    const note = global.document.getElementById('drawerFooterNote');
    const backBtn = global.document.getElementById('drawerBackBtn');
    const nextBtn = global.document.getElementById('drawerNextBtn');
    const submitBtn = global.document.getElementById('drawerSubmitBtn');
    const form = activeFormId
      ? global.document.getElementById(activeFormId)
      : resolveActiveForm({ drawer, formIdMap, setActiveFormId });
    const currentFormId = activeFormId || form?.id || '';
    const isTaskWizard = currentFormId === 'taskForm';
    const hasActiveForm = Boolean(form);

    backBtn?.classList.toggle('hidden', !isTaskWizard || taskWizardStep === 1);
    nextBtn?.classList.toggle('hidden', !isTaskWizard || taskWizardStep === totalSteps);
    submitBtn?.classList.toggle('hidden', isTaskWizard && taskWizardStep !== totalSteps);

    if (submitBtn) {
      submitBtn.disabled = !hasActiveForm;
      submitBtn.style.opacity = hasActiveForm ? '1' : '0.55';
      submitBtn.style.cursor = hasActiveForm ? 'pointer' : 'not-allowed';
    }

    if (!note) return;
    if (isTaskWizard) {
      const copy = global.StaffDashboardTaskFormCopy;
      note.textContent = typeof copy?.getFooterNote === 'function'
        ? copy.getFooterNote(taskWizardStep, totalSteps)
        : `新增關卡流程：第 ${taskWizardStep} / ${totalSteps} 步`;
    }
    else if (currentFormId === 'tileForm') note.textContent = '大富翁格子會直接歸屬在目前這張棋盤底下。';
    else if (currentFormId === 'questChainForm') note.textContent = '入口未發布前僅能後台預覽；勾選正式發布後會自動鎖定核心結構。';
    else note.textContent = '';
  }

  function syncTaskWizardUI({ taskWizardStep, totalSteps, syncDrawerFooter: syncFooter } = {}) {
    global.document.querySelectorAll('.task-wizard-step[data-task-step]').forEach((element) => {
      element.classList.toggle('active', Number(element.dataset.taskStep) === taskWizardStep);
    });
    global.document.querySelectorAll('[data-step-chip]').forEach((chip) => {
      const step = Number(chip.dataset.stepChip);
      chip.classList.toggle('active', step === taskWizardStep);
      chip.classList.toggle('done', step < taskWizardStep);
    });
    if (typeof syncFooter === 'function') syncFooter();
  }

  function validateTaskWizardStep(step) {
    const stepEl = getTaskWizardStepElement(step);
    if (!stepEl) return true;
    if (step === 2) {
      const form = global.document.getElementById('taskForm');
      const typeSel = global.document.getElementById('taskTypeSelect');
      const gpsToggle = global.document.getElementById('taskLocationRequiredToggle');
      const gpsRequired = Boolean((typeSel && typeSel.value === 'location') || (gpsToggle && gpsToggle.checked));
      const lat = form?.elements?.lat?.value?.trim() || '';
      const lng = form?.elements?.lng?.value?.trim() || '';
      const radius = form?.elements?.radius?.value?.trim() || '';
      const hasAllLocationValues = Boolean(lat && lng && radius);

      if (gpsRequired && !hasAllLocationValues) {
        const target = !lat ? form.elements.lat : (!lng ? form.elements.lng : form.elements.radius);
        if (target) {
          target.setCustomValidity('啟用 GPS 位置限制時，請完整填寫緯度、經度與觸發半徑。');
          target.reportValidity();
          target.setCustomValidity('');
        }
        scrollToFirstInvalid(stepEl);
        return false;
      }
    }

    if (step === 3) {
      const aiPanel = global.document.getElementById('taskAiAdvancedPanel');
      const aiWrap = global.document.getElementById('taskAiAdvancedWrap');
      if (aiPanel && aiWrap && aiWrap.style.display !== 'none') {
        aiPanel.open = true;
      }
    }

    const inputs = Array.from(stepEl.querySelectorAll('input, select, textarea')).filter((element) => {
      if (element.disabled) return false;
      if (element.closest('[style*="display:none"]')) return false;
      return true;
    });
    for (const input of inputs) {
      if (typeof input.reportValidity === 'function' && !input.reportValidity()) {
        scrollToFirstInvalid(stepEl);
        return false;
      }
    }
    return true;
  }

  function initializeTaskWizardDOM() {
    const form = global.document.getElementById('taskForm');
    if (!form || form.dataset.wizardReady === '1') return;
    const shell = form.querySelector('.wizard-shell');
    const taskLockedContext = global.document.getElementById('taskLockedContext');
    const blueprintInfo = form.querySelector('.blueprint-info');
    const byAnchor = (key) => form.querySelector(`.section-title[data-wizard-anchor="${key}"]`);
    const gamePositionTitle = byAnchor('game')
      || Array.from(form.querySelectorAll('.section-title')).find((element) => element.textContent.includes('遊戲定位'));
    const fieldAreaTitle = byAnchor('field')
      || Array.from(form.querySelectorAll('.section-title')).find((element) => element.textContent.includes('場域與目標'));
    const interactionTitle = byAnchor('interact')
      || Array.from(form.querySelectorAll('.section-title')).find((element) => element.textContent.includes('互動方式'));
    const playerContentTitle = byAnchor('player')
      || Array.from(form.querySelectorAll('.section-title')).find((element) => element.textContent.includes('玩家感受到的內容'));
    const taskFormMsg = global.document.getElementById('taskFormMsg');
    if (!shell || !taskLockedContext || !blueprintInfo || !gamePositionTitle || !fieldAreaTitle || !interactionTitle || !playerContentTitle || !taskFormMsg) return;

    const children = Array.from(form.children);
    const beforeStep1 = children.indexOf(taskLockedContext);
    const start2 = children.indexOf(fieldAreaTitle);
    const start3 = children.indexOf(interactionTitle);
    const start4 = children.indexOf(playerContentTitle);
    const end4 = children.indexOf(taskFormMsg);
    if ([beforeStep1, start2, start3, start4, end4].some((idx) => idx < 0)) return;

    const makeStep = (stepNo) => {
      const wrapper = global.document.createElement('div');
      wrapper.className = `task-wizard-step${stepNo === 1 ? ' active' : ''}`;
      wrapper.dataset.taskStep = String(stepNo);
      return wrapper;
    };
    const steps = [makeStep(1), makeStep(2), makeStep(3), makeStep(4)];
    shell.insertAdjacentElement('afterend', steps[0]);
    steps[0].after(steps[1]);
    steps[1].after(steps[2]);
    steps[2].after(steps[3]);

    children.slice(beforeStep1, start2).forEach((node) => steps[0].appendChild(node));
    children.slice(start2, start3).forEach((node) => steps[1].appendChild(node));
    children.slice(start3, start4).forEach((node) => steps[2].appendChild(node));
    children.slice(start4, end4 + 1).forEach((node) => steps[3].appendChild(node));
    form.dataset.wizardReady = '1';
  }

  function openDrawer({
    title,
    formSectionId,
    data,
    opts = {},
    drawer,
    overlay,
    drawerTitle,
    setActiveFormId,
    setTaskWizardStep,
    fillForm,
    onAfterOpen,
    syncDrawerFooter: syncFooter
  } = {}) {
    drawerTitle.textContent = title;
    global.document.querySelectorAll('.drawer-form-section').forEach((element) => element.classList.remove('active'));
    const section = global.document.getElementById(formSectionId);
    section.classList.add('active');
    drawer.dataset.activeSection = formSectionId;

    const form = section.querySelector('form');
    const nextActiveFormId = section.dataset.formId || (form ? form.id : null);
    setActiveFormId(nextActiveFormId);
    setTaskWizardStep(1);

    if (data && form) {
      fillForm(form, data);
    } else if (form && !opts.skipReset) {
      form.reset();
      const idField = form.querySelector('input[name="id"]');
      if (idField) idField.value = '';
      const preview = form.querySelector('img[id$="Preview"]');
      if (preview) preview.style.display = 'none';
    }

    if (typeof onAfterOpen === 'function') onAfterOpen({ activeFormId: nextActiveFormId, form });
    drawer.classList.add('open');
    overlay.classList.add('open');
    syncFooter();
  }

  function closeDrawer({ drawer, overlay, setActiveFormId, setTaskWizardStep, syncDrawerFooter: syncFooter } = {}) {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    setActiveFormId(null);
    delete drawer.dataset.activeSection;
    setTaskWizardStep(1);
    syncFooter();
  }

  function submitActiveForm({
    activeFormId,
    taskWizardStep,
    totalSteps,
    drawer,
    formIdMap,
    setActiveFormId,
    goTaskWizardStep,
    syncDrawerFooter: syncFooter,
    showToast
  } = {}) {
    let form = activeFormId ? global.document.getElementById(activeFormId) : null;
    if (!form) form = resolveActiveForm({ drawer, formIdMap, setActiveFormId });
    if (!form) {
      showToast('目前沒有可儲存的表單', 'error');
      syncFooter();
      return;
    }
    if (activeFormId === 'taskForm' && taskWizardStep < totalSteps) {
      goTaskWizardStep(1);
      return;
    }
    if (typeof form.reportValidity === 'function' && form.reportValidity()) {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    } else {
      scrollToFirstInvalid(activeFormId === 'taskForm' ? getTaskWizardStepElement(taskWizardStep) : form);
    }
  }

  global.StaffDashboardDrawer = {
    getTaskWizardStepElement,
    resolveActiveForm,
    scrollToFirstInvalid,
    syncDrawerFooter,
    syncTaskWizardUI,
    validateTaskWizardStep,
    initializeTaskWizardDOM,
    openDrawer,
    closeDrawer,
    submitActiveForm
  };
})(window);
