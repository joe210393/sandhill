// ── Delete Task ───────────────────────────────────────────────
function deleteTask(taskId) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再刪除關卡', 'error');
    return;
  }
  if (!confirm('確定要刪除這個關卡嗎？')) return;
  fetch(`${API_BASE}/api/tasks/${taskId}`, {
    method: 'DELETE', headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast('已刪除');
        if (currentQuestChainId) {
          if (currentQuestChainMode === 'board_game') loadBoardContent(currentQuestChainId);
          else loadTasksForQuest(currentQuestChainId);
        }
      } else showToast(d.message || '刪除失敗', 'error');
    });
}

function renderAssetStorageOverview(data = null) {
  const container = document.getElementById('assetStorageSummary');
  if (!container) return;
  if (!data?.summary) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗂️</div>尚無素材庫使用量資料</div>';
    return;
  }

  const { summary, scope, shop_breakdown: shopBreakdown = [] } = data;
  const isAdmin = loginUser?.role === 'admin';
  const scopeLabel = isAdmin
    ? '平台管理員視角'
    : `${scope?.shop_name || '我的商店'} 專屬素材庫`;
  const limitLabel = summary.unlimited
    ? '無限制'
    : `${formatBytes(summary.total_bytes)} / ${formatBytes(summary.limit_bytes)}`;
  const usageLabel = summary.unlimited
    ? 'admin 不受空間限制'
    : `剩餘 ${formatBytes(summary.remaining_bytes)}，已使用 ${Number(summary.usage_percent || 0).toFixed(1)}%`;
  const filterBanner = loginUser?.role === 'admin' && currentAssetShopFilter
    ? `
      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:12px 14px; display:flex; justify-content:space-between; gap:12px; align-items:center;">
        <div style="color:#1d4ed8;">目前只顯示 <strong>${escHtml(currentAssetShopName || scope?.shop_name || `商店 #${currentAssetShopFilter}`)}</strong> 的素材庫內容。</div>
        <button type="button" class="btn-sm btn-secondary-v2" onclick="resetAssetLibraryScope()">顯示全部素材</button>
      </div>
    `
    : '';

  const summaryCards = [
    ['目前範圍', scopeLabel],
    ['素材總量', formatBytes(summary.total_bytes)],
    ['空間規則', limitLabel],
    ['模型數', `${Number(summary.model_count || 0).toLocaleString('zh-TW')} 個`],
    ['道具數', `${Number(summary.item_count || 0).toLocaleString('zh-TW')} 個`],
    ['背景音樂', `${Number(summary.bgm_count || 0).toLocaleString('zh-TW')} 首`],
    ['影片素材', `${Number(summary.video_count || 0).toLocaleString('zh-TW')} 部`]
  ];

  let adminBreakdownHtml = '';
  if (isAdmin) {
    adminBreakdownHtml = `
      <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
        <div style="font-weight:700; margin-bottom:8px;">各商店素材庫用量</div>
        ${shopBreakdown.length ? `
          <div style="overflow:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>範圍</th>
                  <th>總空間</th>
                  <th>總檔案</th>
                  <th>模型</th>
                  <th>道具</th>
                  <th>背景音樂</th>
                  <th>影片</th>
                </tr>
              </thead>
              <tbody>
                ${shopBreakdown.map((row) => `
                  <tr>
                    <td>${escHtml(row.shop_name || (row.shop_id == null ? 'admin 公益共用' : `商店 #${row.shop_id}`))}</td>
                    <td><strong>${formatBytes(row.total_bytes || 0)}</strong></td>
                    <td>${Number(row.total_files || 0).toLocaleString('zh-TW')}</td>
                    <td>${Number(row.model_count || 0).toLocaleString('zh-TW')}</td>
                    <td>${Number(row.item_count || 0).toLocaleString('zh-TW')}</td>
                    <td>${Number(row.bgm_count || 0).toLocaleString('zh-TW')}</td>
                    <td>${Number(row.video_count || 0).toLocaleString('zh-TW')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="subtle-note">目前尚無素材資料。</div>'}
      </div>
    `;
  }

  container.innerHTML = `
    <div style="display:grid; gap:12px;">
      ${filterBanner}
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
        ${summaryCards.map(([label, value]) => `
          <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
            <div class="subtle-note" style="margin-bottom:6px;">${escHtml(label)}</div>
            <div style="font-weight:800; color:#0f172a;">${escHtml(value)}</div>
          </div>
        `).join('')}
      </div>
      <div style="background:${summary.unlimited ? '#eff6ff' : '#fffbeb'}; border:1px solid ${summary.unlimited ? '#bfdbfe' : '#fde68a'}; border-radius:12px; padding:14px; color:${summary.unlimited ? '#1d4ed8' : '#92400e'};">
        ${escHtml(usageLabel)}
      </div>
      ${adminBreakdownHtml}
    </div>
  `;
}

function loadAssetStorageOverview() {
  const qs = new URLSearchParams();
  if (currentAssetShopFilter) qs.set('shop_id', currentAssetShopFilter);
  return fetch(`${API_BASE}/api/assets/storage-summary${qs.toString() ? `?${qs.toString()}` : ''}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      currentAssetStorageOverview = data;
      renderAssetStorageOverview(data);
    })
    .catch(() => {
      renderAssetStorageOverview(null);
    });
}



// ── Photo preview ─────────────────────────────────────────────
const taskPhotoInput = document.getElementById('taskPhotoInput');
if (taskPhotoInput) {
  taskPhotoInput.addEventListener('change', function () {
    const file = this.files[0];
    const preview = document.getElementById('taskPhotoPreview');
    if (file) {
      const r = new FileReader();
      r.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
      r.readAsDataURL(file);
    }
  });
}

(function bindLatLngPasteFromFormUtils() {
  const { wireLatLngPaste } = window.StaffDashboardFormUtils || {};
  const showToast = window.SandhillDom?.showToast;
  if (typeof wireLatLngPaste !== 'function') return;
  wireLatLngPaste(
    document.getElementById('taskLatLngPaste'),
    document.getElementById('taskLatInput'),
    document.getElementById('taskLngInput'),
    { showToast }
  );
  wireLatLngPaste(
    document.getElementById('tileLatLngPaste'),
    document.getElementById('tileLatInput'),
    document.getElementById('tileLngInput'),
    { showToast }
  );
})();

// BGM manual preview
const bgmUrlInputEl = document.getElementById('bgmUrlInput');
if (bgmUrlInputEl) {
  bgmUrlInputEl.addEventListener('input', () => {
    const preview = document.getElementById('bgmPreview');
    const audio = document.getElementById('bgmPreviewAudio');
    if (bgmUrlInputEl.value.trim()) {
      preview.style.display = 'block';
      audio.src = bgmUrlInputEl.value.trim();
    } else {
      preview.style.display = 'none';
    }
  });
}

// BGM upload button
const uploadBgmBtnEl = document.getElementById('uploadBgmBtn');
const taskBgmLibrarySelectEl = document.getElementById('taskBgmLibrarySelect');
if (taskBgmLibrarySelectEl) {
  taskBgmLibrarySelectEl.addEventListener('change', () => {
    const v = taskBgmLibrarySelectEl.value.trim();
    if (!v) return;
    const inp = document.getElementById('bgmUrlInput');
    if (inp) {
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    taskBgmLibrarySelectEl.value = '';
  });
}

const taskVideoLibrarySelectEl = document.getElementById('taskVideoLibrarySelect');
if (taskVideoLibrarySelectEl) {
  taskVideoLibrarySelectEl.addEventListener('change', () => {
    const value = taskVideoLibrarySelectEl.value.trim();
    const input = document.getElementById('taskVideoUrlInput');
    if (input) {
      input.value = value;
      syncTaskVideoPreview(value);
    }
    taskVideoLibrarySelectEl.value = '';
  });
}

const taskVideoUrlInputEl = document.getElementById('taskVideoUrlInput');
if (taskVideoUrlInputEl) {
  taskVideoUrlInputEl.addEventListener('input', () => {
    syncTaskVideoPreview(taskVideoUrlInputEl.value.trim());
  });
}

if (uploadBgmBtnEl) {
  uploadBgmBtnEl.addEventListener('click', async () => {
    const fileInput = document.getElementById('bgmFileInput');
    if (!fileInput.files[0]) { alert('請先選擇音樂檔'); return; }
    uploadBgmBtnEl.disabled = true;
    uploadBgmBtnEl.textContent = '上傳中...';
    try {
      const url = await uploadBgmWithProgress(fileInput.files[0]);
      document.getElementById('bgmUrlInput').value = url;
      const preview = document.getElementById('bgmPreview');
      const audio = document.getElementById('bgmPreviewAudio');
      preview.style.display = 'block';
      audio.src = url;
      showToast('音樂上傳成功');
    } catch (err) {
      showToast('音樂上傳失敗: ' + err.message, 'error');
    }
    uploadBgmBtnEl.disabled = false;
    uploadBgmBtnEl.textContent = '上傳';
  });
}



// ── BGM Upload with progress ──────────────────────────────────
function uploadBgmWithProgress(file) {
  return new Promise((resolve, reject) => {
    const progressContainer = document.getElementById('bgmUploadProgress');
    const progressBar = document.getElementById('bgmUploadProgressBar');
    const percentText = document.getElementById('bgmUploadPercent');

    if (progressContainer) {
      progressContainer.style.display = 'block';
      progressBar.style.width = '0%';
      percentText.textContent = '0%';
    }

    const fd = new FormData();
    fd.append('audio', file);
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable && progressContainer) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = pct + '%';
        percentText.textContent = pct + '%';
      }
    });

    xhr.addEventListener('load', () => {
      if (progressContainer) progressContainer.style.display = 'none';
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success) resolve(data.url);
          else reject(new Error(data.message || '上傳失敗'));
        } catch { reject(new Error('解析回應失敗')); }
      } else { reject(new Error('HTTP ' + xhr.status)); }
    });

    xhr.addEventListener('error', () => {
      if (progressContainer) progressContainer.style.display = 'none';
      reject(new Error('網路失敗'));
    });

    xhr.open('POST', `${API_BASE}/api/upload-audio`);
    xhr.setRequestHeader('x-username', loginUser.username);
    xhr.withCredentials = true;
    xhr.send(fd);
  });
}



// ── Task Form Submit (Create or Update) ───────────────────────
document.getElementById('taskForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.id.value;
  const msgEl = document.getElementById('taskFormMsg');
  msgEl.textContent = '';

  const aiPayload = buildAiTaskPayload(form);
  const task_type = form.elements.task_type.value;

  // Validate
  if (!validateAiPayload(form, aiPayload, msgEl)) return;

  // Multiple choice / standard answer
  let options = null;
  let correct_answer = null;
  if (task_type === 'multiple_choice') {
    const optA = form.optionA.value.trim();
    const optB = form.optionB.value.trim();
    const optC = form.optionC.value.trim();
    const optD = form.optionD.value.trim();
    if (!optA || !optB || !optC || !optD) { msgEl.textContent = '請填寫所有選項'; return; }
    options = [optA, optB, optC, optD];
    const sel = form.correct_answer_select.value;
    correct_answer = sel === 'A' ? optA : sel === 'B' ? optB : sel === 'C' ? optC : optD;
  } else if (task_type === 'number' || task_type === 'keyword') {
    correct_answer = form.correct_answer_text.value.trim();
    if (!correct_answer) { msgEl.textContent = '請輸入標準答案'; return; }
  }

  // Quest chain id: prefer locked context, then form select
  const quest_chain_id = form.elements.quest_chain_id?.value
    || document.getElementById('questChainSelect')?.value || null;

  try {
    // Upload photo if new file
    let photoUrl = document.getElementById('taskPhotoUrl').value;
    const photoFile = form.photo?.files[0];

    if (!id && !photoFile && !photoUrl) { msgEl.textContent = '請選擇封面圖或保留複製的封面網址'; return; }

    if (photoFile) {
      if (photoFile.size > 5 * 1024 * 1024) { msgEl.textContent = '圖片超過 5MB'; return; }
      msgEl.textContent = '封面圖上傳中...';
      const fd = new FormData();
      fd.append('photo', photoFile);
      const uploadRes = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST', headers: { 'x-username': loginUser.username }, body: fd
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) { msgEl.textContent = uploadData.message || '圖片上傳失敗'; return; }
      photoUrl = uploadData.url;
    }

    // Upload AR image if provided
    let arImageUrl = document.getElementById('taskArImageUrl').value || null;
    const arImageFile = form.arImage?.files[0];
    if (arImageFile) {
      msgEl.textContent = '場景圖上傳中...';
      const arFd = new FormData();
      arFd.append('photo', arImageFile);
      const arRes = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST', headers: { 'x-username': loginUser.username }, body: arFd
      });
      const arData = await arRes.json();
      if (arData.success) arImageUrl = arData.url;
    }

    // Upload BGM if provided
    let bgmUrl = form.bgm_url?.value.trim() || null;
    const bgmFile = form.bgmFile?.files[0];
    if (bgmFile) {
      msgEl.textContent = '音樂上傳中...';
      bgmUrl = await uploadBgmWithProgress(bgmFile);
    }

    // Build payload
    const payload = {
      name: form.name.value.trim(),
      lat: form.lat.value,
      lng: form.lng.value,
      radius: form.radius.value,
      points: form.points.value,
      description: form.description.value.trim(),
      photoUrl,
      youtubeUrl: form.youtubeUrl.value.trim() || null,
      video_url: form.video_url?.value.trim() || null,
      ar_image_url: arImageUrl,
      ar_model_id: form.ar_model_id?.value || null,
      ar_order_model: form.ar_order_model.value || null,
      ar_order_image: form.ar_order_image.value || null,
      ar_order_youtube: form.ar_order_youtube.value || null,
      task_type,
      options,
      correct_answer,
      ...aiPayload,
      type: form.type.value,
      quest_chain_id,
      quest_order: form.quest_order?.value || null,
      time_limit_start: form.time_limit_start?.value || null,
      time_limit_end: form.time_limit_end?.value || null,
      max_participants: form.max_participants?.value || null,
      is_final_step: form.is_final_step?.checked || false,
      required_item_id: form.required_item_id?.value || null,
      reward_item_id: form.reward_item_id?.value || null,
      bgm_url: bgmUrl
    };

    msgEl.textContent = id ? '更新中...' : '建立中...';
    const url = id ? `${API_BASE}/api/tasks/${id}` : `${API_BASE}/api/tasks`;
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      if (!id && result.id && typeof afterTaskCreateHook === 'function') {
        const hook = afterTaskCreateHook;
        afterTaskCreateHook = null;
        await hook(result.id);
        msgEl.textContent = '';
        return;
      }
      showToast(id ? '關卡更新成功' : '關卡建立成功');
      closeDrawer();
      if (currentQuestChainId) {
        if (currentQuestChainMode === 'board_game') loadBoardContent(currentQuestChainId);
        else loadTasksForQuest(currentQuestChainId);
      }
    } else {
      msgEl.textContent = result.message || '操作失敗';
    }
  } catch (err) {
    console.error(err);
    msgEl.textContent = '伺服器連線失敗';
  }
});



// ── Task Drawer: Open for create ──────────────────────────────
function openTaskDrawerForCreate() {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再新增關卡', 'error');
    return;
  }
  openDrawer('新增關卡', 'form-task');
  resetTaskWizard();
  const form = document.getElementById('taskForm');
  if (form.elements.location_required) form.elements.location_required.checked = false;

  // Auto-lock quest chain context
  if (currentQuestChainId) {
    document.getElementById('task_quest_chain_id').value = currentQuestChainId;
    document.getElementById('task_locked_quest_name').textContent = currentQuestChainTitle;
    document.getElementById('taskLockedContext').style.display = 'block';

    if (currentQuestChainMode === 'story_campaign') {
      const catSel = document.getElementById('taskCategorySelect');
      catSel.value = 'quest';
      catSel.dispatchEvent(new Event('change'));

      const qcSel = document.getElementById('questChainSelect');
      if (qcSel) qcSel.value = currentQuestChainId;
    } else if (currentQuestChainMode === 'board_game') {
      const catSel = document.getElementById('taskCategorySelect');
      catSel.value = 'single';
      catSel.dispatchEvent(new Event('change'));
      const qcSel = document.getElementById('questChainSelect');
      if (qcSel && currentQuestChainId) qcSel.value = currentQuestChainId;
    }
  }

  // Reset photo state
  document.getElementById('taskPhotoUrl').value = '';
  document.getElementById('taskPhotoPreview').style.display = 'none';
  document.getElementById('taskFormMsg').textContent = '';

  const bpSel = document.getElementById('taskBlueprintSelect');
  if (currentQuestChainMode === 'board_game') {
    bpSel.value = 'board_ai_identify';
    applyBlueprint('board_ai_identify', false);
  } else {
    bpSel.value = 'story_ai_identify';
    applyBlueprint('story_ai_identify', false);
  }
  syncTaskLocationRequirementUi();
  syncTaskWizardUI();
  applyTaskStructureLockUi(null, globalQuestChainsMap[String(currentQuestChainId)] || null);
}

function populateTaskFormForEdit(t) {
  const form = document.getElementById('taskForm');

  // Fill basic fields
  form.elements.id.value = t.id;
  form.elements.name.value = t.name;
      form.elements.lat.value = t.lat;
      form.elements.lng.value = t.lng;
      form.elements.radius.value = t.radius;
      form.elements.points.value = t.points || 0;
      form.elements.description.value = t.description || '';

      // Photo
      document.getElementById('taskPhotoUrl').value = t.photoUrl || '';
      const preview = document.getElementById('taskPhotoPreview');
      if (t.photoUrl) { preview.src = t.photoUrl; preview.style.display = 'block'; }
      else preview.style.display = 'none';

      // AR media
      const modelSel = document.getElementById('taskArModelSelect');
      if (modelSel) modelSel.value = t.ar_model_id || '';
      form.elements.ar_order_model.value = t.ar_order_model || '';
      form.elements.ar_order_image.value = t.ar_order_image || '';
      form.elements.ar_order_youtube.value = t.ar_order_youtube || '';
      form.elements.youtubeUrl.value = t.youtubeUrl || '';
      if (form.elements.video_url) form.elements.video_url.value = t.video_url || '';
      syncTaskVideoPreview(t.video_url || '');
      document.getElementById('taskArImageUrl').value = t.ar_image_url || '';

      // BGM
      const bgmInput = document.getElementById('bgmUrlInput');
      if (bgmInput) bgmInput.value = t.bgm_url || '';
      const bgmPreview = document.getElementById('bgmPreview');
      const bgmAudio = document.getElementById('bgmPreviewAudio');
      if (t.bgm_url && bgmPreview && bgmAudio) {
        bgmPreview.style.display = 'block';
        bgmAudio.src = t.bgm_url;
      } else if (bgmPreview) {
        bgmPreview.style.display = 'none';
      }

      // Category
      const catSel = document.getElementById('taskCategorySelect');
      catSel.value = t.type || 'single';
      catSel.dispatchEvent(new Event('change'));

      // Quest fields
      if (t.type === 'quest') {
        const qcSel = document.getElementById('questChainSelect');
        if (qcSel) qcSel.value = t.quest_chain_id || '';
        form.elements.quest_order.value = t.quest_order || 1;
        if (form.elements.is_final_step) form.elements.is_final_step.checked = !!t.is_final_step;
      }

      // Timed fields
      if (t.type === 'timed') {
        const fmt = iso => iso ? new Date(iso).toISOString().slice(0, 16) : '';
        form.elements.time_limit_start.value = fmt(t.time_limit_start);
        form.elements.time_limit_end.value = fmt(t.time_limit_end);
        form.elements.max_participants.value = t.max_participants || 0;
      }

      // Task type
      const typeSel = document.getElementById('taskTypeSelect');
      typeSel.value = t.task_type || 'qa';
      typeSel.dispatchEvent(new Event('change'));

      // Multiple choice
      if (t.task_type === 'multiple_choice' && t.options) {
        const opts = typeof t.options === 'string' ? JSON.parse(t.options) : t.options;
        if (Array.isArray(opts) && opts.length >= 4) {
          form.elements.optionA.value = opts[0];
          form.elements.optionB.value = opts[1];
          form.elements.optionC.value = opts[2];
          form.elements.optionD.value = opts[3];
          if (t.correct_answer === opts[0]) form.elements.correct_answer_select.value = 'A';
          else if (t.correct_answer === opts[1]) form.elements.correct_answer_select.value = 'B';
          else if (t.correct_answer === opts[2]) form.elements.correct_answer_select.value = 'C';
          else if (t.correct_answer === opts[3]) form.elements.correct_answer_select.value = 'D';
        }
      } else if (t.task_type === 'number' || t.task_type === 'keyword') {
        form.elements.correct_answer_text.value = t.correct_answer || '';
      }

      // Validation mode
      const valSel = document.getElementById('validationModeSelect');
      const normalizedValidationMode = t.validation_mode === 'manual'
        ? (t.task_type === 'photo' ? 'ai_rule_check' : (t.task_type === 'qa' ? 'ai_text_check' : 'auto'))
        : (t.validation_mode || 'auto');
      valSel.value = normalizeValidationModeForTaskType(t.task_type || 'qa', normalizedValidationMode);
      valSel.dispatchEvent(new Event('change'));

      // AI fields
      const aiConfig = t.ai_config || {};
      const passCriteria = t.pass_criteria || {};
      form.elements.ai_target_label.value = aiConfig.target_label || passCriteria.target_label || '';
      form.elements.ai_target_count.value = passCriteria.target_count || '';
      form.elements.ai_min_score.value = passCriteria.min_score || '';
      form.elements.ai_min_confidence.value = passCriteria.min_confidence || '';
      form.elements.ai_system_prompt.value = aiConfig.system_prompt || '';
      form.elements.ai_user_prompt.value = aiConfig.user_prompt || '';
      form.elements.failure_message.value = t.failure_message || '';
      form.elements.success_message.value = t.success_message || '';
      form.elements.max_attempts.value = t.max_attempts || '';
      if (form.elements.location_required) form.elements.location_required.checked = !!t.location_required;
      syncTaskLocationRequirementUi();

      // Items
      const reqItemSel = form.querySelector('select[name="required_item_id"]');
      const rewItemSel = form.querySelector('select[name="reward_item_id"]');
      if (reqItemSel) reqItemSel.value = t.required_item_id || '';
      if (rewItemSel) rewItemSel.value = t.reward_item_id || '';

      // Lock context
      const chainId = t.quest_chain_id || currentQuestChainId;
      if (chainId) {
        document.getElementById('task_quest_chain_id').value = chainId;
        const chain = globalQuestChainsMap[chainId];
        document.getElementById('task_locked_quest_name').textContent = chain ? chain.title : `ID: ${chainId}`;
        document.getElementById('taskLockedContext').style.display = 'block';
      }

  // Blueprint
  const bp = inferBlueprintFromTask(t);
  document.getElementById('taskBlueprintSelect').value = bp;
  applyBlueprint(bp, true);

  document.getElementById('taskFormMsg').textContent = '';
  const chain = globalQuestChainsMap[String(t.quest_chain_id || currentQuestChainId)] || null;
  applyTaskStructureLockUi(t, chain);
}

function editTask(taskId) {
  fetch(`${API_BASE}/api/tasks/${taskId}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      openDrawer('編輯關卡', 'form-task');
      resetTaskWizard();
      populateTaskFormForEdit(data.task);
      syncTaskWizardUI();
    });
}

function duplicateTask(taskId) {
  if (currentQuestChainLocked) {
    showToast('這個入口的結構已鎖定，無法再複製關卡', 'error');
    return;
  }
  fetch(`${API_BASE}/api/tasks/${taskId}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        showToast('無法載入關卡', 'error');
        return;
      }
      openDrawer('複製關卡', 'form-task');
      resetTaskWizard();
      populateTaskFormForEdit(data.task);
      const form = document.getElementById('taskForm');
      form.elements.id.value = '';
      form.elements.name.value = `${data.task.name || ''}（複製）`.trim();
      const photoIn = document.getElementById('taskPhotoInput');
      if (photoIn) photoIn.value = '';
      document.getElementById('taskFormMsg').textContent = '';
      syncTaskLocationRequirementUi();
      syncTaskWizardUI();
      applyTaskStructureLockUi(null, globalQuestChainsMap[String(currentQuestChainId)] || null);
    });
}



// ── Story mode: load tasks ────────────────────────────────────
function loadTasksForQuest(questChainId) {
  const container = document.getElementById('questDetailContentContainer');
  container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div>載入中...</div>';

  fetch(`${API_BASE}/api/tasks/admin`, {
    headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) { container.innerHTML = '<div class="empty-state">載入失敗</div>'; return; }

      globalTaskRecords = data.tasks || [];
      const tasks = globalTaskRecords.filter(t => String(t.quest_chain_id) === String(questChainId));
      tasks.sort((a, b) => (a.quest_order || 0) - (b.quest_order || 0));

      if (!tasks.length) {
        container.innerHTML = currentQuestChainLocked
          ? '<div class="empty-state"><div class="empty-state-icon">📦</div>此入口目前沒有關卡，而且結構已鎖定；若要補齊內容，請先建立草稿版入口再規劃後上線。</div>'
          : '<div class="empty-state"><div class="empty-state-icon">📦</div>此入口尚無關卡，點右上角新增</div>';
        return;
      }

      container.innerHTML = tasks.map(t => renderTaskItem(t)).join('');
    });
}

function renderTaskItem(t) {
  let typeLabel = '問答';
  if (t.validation_mode?.startsWith('ai_')) typeLabel = `AI (${t.validation_mode.replace('ai_', '')})`;
  else if (t.task_type === 'multiple_choice') typeLabel = '選擇題';
  else if (t.task_type === 'photo') typeLabel = '拍照';
  else if (t.task_type === 'number') typeLabel = '數字';
  else if (t.task_type === 'keyword') typeLabel = '關鍵字';
  else if (t.task_type === 'location') typeLabel = '打卡';

  const orderTag = t.quest_order ? `<span class="tag tag-blue">第 ${t.quest_order} 關</span>` : '';
  const finalTag = t.is_final_step ? '<span class="tag tag-amber">🏆 結局</span>' : '';
  const lat = Number(t.lat);
  const lng = Number(t.lng);
  const coordTag = Number.isFinite(lat) && Number.isFinite(lng)
    ? `<span class="tag tag-gray">📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>`
    : '<span class="tag tag-gray">📍 未設定</span>';
  const structureTag = currentQuestChainLocked
    ? '<span class="tag tag-red">結構已鎖定</span>'
    : '';
  const destructiveActions = currentQuestChainLocked
    ? ''
    : `<button class="btn-sm btn-secondary-v2" onclick="duplicateTask('${t.id}')">複製</button>
        <button class="btn-sm btn-danger-v2" onclick="deleteTask('${t.id}')">刪除</button>`;

  return `
    <div class="task-item">
      <img src="${escHtml(t.photoUrl || '/images/mascot.png')}" class="task-item-img" onerror="this.src='/images/mascot.png'">
      <div class="task-item-body">
        <div class="task-item-title">${escHtml(t.name)}</div>
        <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:4px;">
          ${orderTag} ${finalTag}
          <span class="tag tag-gray">${typeLabel}</span>
          <span class="tag tag-gray">💰 ${t.points || 0}</span>
          ${coordTag}
          ${structureTag}
        </div>
        <div class="task-item-desc">${escHtml(t.description || '')}</div>
      </div>
      <div class="task-item-actions">
        <button class="btn-sm btn-secondary-v2" onclick="editTask('${t.id}')">編輯</button>
        ${destructiveActions}
      </div>
    </div>
  `;
}

