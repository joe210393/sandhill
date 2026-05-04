// ── Asset Tabs ────────────────────────────────────────────────
function syncAssetPrimaryLabel(tab) {
  const el = document.getElementById('assetPrimaryLabel');
  if (!el) return;
  const map = {
    models: '目前主操作：上傳 3D 模型',
    items: '目前主操作：新增道具素材',
    bgm: '目前主操作：上傳背景音樂',
    videos: '目前主操作：上傳影片素材',
    npc: '目前主操作：新增 NPC（僅平台管理員）'
  };
  el.textContent = map[tab] || '';
}

function switchAssetTab(tab, el) {
  document.querySelectorAll('.asset-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.asset-section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('assetSection-' + tab).classList.add('active');

  // Toggle action buttons
  document.getElementById('btnAssetAdd').style.display = tab === 'models' ? 'inline-flex' : 'none';
  document.getElementById('btnItemAdd').style.display = tab === 'items' ? 'inline-flex' : 'none';
  const btnBgm = document.getElementById('btnBgmAdd');
  const btnVideo = document.getElementById('btnVideoAdd');
  if (btnBgm) {
    btnBgm.style.display = tab === 'bgm' && ['admin', 'shop', 'staff'].includes(loginUser.role) ? 'inline-flex' : 'none';
  }
  if (btnVideo) {
    btnVideo.style.display = tab === 'videos' && ['admin', 'shop', 'staff'].includes(loginUser.role) ? 'inline-flex' : 'none';
  }
  const btnNpc = document.getElementById('btnNpcAdd');
  if (btnNpc) {
    btnNpc.style.display = tab === 'npc' && loginUser.role === 'admin' ? 'inline-flex' : 'none';
  }
  if (tab === 'npc') loadNpcs();
  if (tab === 'bgm') loadBgmAssets();
  if (tab === 'videos') loadVideoAssets();
  loadAssetStorageOverview();
  syncAssetPrimaryLabel(tab);
}

let globalNpcs = [];

function loadNpcs() {
  const container = document.getElementById('npcListContainer');
  if (!container) return;
  fetch(`${API_BASE}/api/game-npcs`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        container.innerHTML = '<div class="empty-state">載入 NPC 失敗</div>';
        return;
      }
      globalNpcs = data.npcs || [];
      renderNpcList(globalNpcs);
    })
    .catch(() => {
      container.innerHTML = '<div class="empty-state">載入失敗</div>';
    });
}

function renderNpcList(npcs) {
  const container = document.getElementById('npcListContainer');
  if (!container) return;
  if (!npcs.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎭</div>尚無 NPC</div>';
    return;
  }
  const isAdmin = loginUser.role === 'admin';
  container.innerHTML = npcs.map(n => `
    <div style="background:white; padding:16px; border-radius:10px; border:1px solid #e2e8f0; text-align:center;">
      <div style="font-size:3rem; margin-bottom:8px;">${escHtml(n.portrait_emoji || '🧭')}</div>
      <div style="font-weight:600;">${escHtml(n.display_name)}</div>
      <div style="font-size:0.82rem; color:#64748b;">${escHtml(n.npc_key)}</div>
      ${n.role_line ? `<div style="font-size:0.82rem; color:#94a3b8; margin-top:6px;">${escHtml(n.role_line)}</div>` : ''}
      ${isAdmin ? `<div style="display:flex; gap:6px; justify-content:center; margin-top:10px; flex-wrap:wrap;">
        <button type="button" class="btn-sm btn-secondary-v2" onclick="openNpcDrawer(true, '${n.id}')">編輯</button>
        <button type="button" class="btn-sm btn-danger-v2" onclick="deleteNpc('${n.id}')">刪除</button>
      </div>` : ''}
    </div>
  `).join('');
}

function openNpcDrawer(isEdit, npcId) {
  openDrawer(isEdit ? '編輯 NPC' : '新增 NPC', 'form-npc');
  const form = document.getElementById('npcForm');
  const msg = document.getElementById('npcFormMsg');
  const keyInput = document.getElementById('npc_key_input');
  msg.textContent = '';

  if (isEdit && npcId != null) {
    const n = globalNpcs.find(x => String(x.id) === String(npcId));
    if (!n) return;
    document.getElementById('npc_form_id').value = n.id;
    keyInput.value = n.npc_key;
    keyInput.readOnly = true;
    keyInput.removeAttribute('required');
    form.display_name.value = n.display_name || '';
    form.portrait_emoji.value = n.portrait_emoji || '';
    form.role_line.value = n.role_line || '';
    form.description.value = n.description || '';
    form.sort_order.value = n.sort_order ?? 0;
  } else {
    form.reset();
    document.getElementById('npc_form_id').value = '';
    keyInput.readOnly = false;
    keyInput.setAttribute('required', 'required');
    keyInput.value = '';
    form.sort_order.value = 0;
    form.portrait_emoji.value = '🧭';
  }
}

function deleteNpc(id) {
  showConfirm('確定刪除此 NPC？若遊戲劇本仍引用該 npc_key，前端可能無法對應角色。', () => {
    fetch(`${API_BASE}/api/game-npcs/${id}`, {
      method: 'DELETE',
      headers: { 'x-username': loginUser.username },
      credentials: 'include'
    })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          showToast('已刪除');
          loadNpcs();
        } else showToast(d.message || '刪除失敗', 'error');
      });
  });
}

document.getElementById('npcForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const form = this;
  const msg = document.getElementById('npcFormMsg');
  msg.textContent = '';
  const fid = document.getElementById('npc_form_id').value;
  const headers = { 'Content-Type': 'application/json', 'x-username': loginUser.username };

  try {
    if (fid) {
      const body = {
        display_name: form.display_name.value.trim(),
        portrait_emoji: form.portrait_emoji.value.trim(),
        role_line: form.role_line.value.trim(),
        description: form.description.value.trim(),
        sort_order: Number(form.sort_order.value) || 0
      };
      const res = await fetch(`${API_BASE}/api/game-npcs/${fid}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const d = await res.json();
      if (d.success) {
        showToast('NPC 已更新');
        closeDrawer();
        loadNpcs();
      } else msg.textContent = d.message || '更新失敗';
    } else {
      const body = {
        npc_key: form.npc_key.value.trim(),
        display_name: form.display_name.value.trim(),
        portrait_emoji: form.portrait_emoji.value.trim() || '🧭',
        role_line: form.role_line.value.trim(),
        description: form.description.value.trim(),
        sort_order: Number(form.sort_order.value) || 0
      };
      const res = await fetch(`${API_BASE}/api/game-npcs`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const d = await res.json();
      if (d.success) {
        showToast('NPC 已建立');
        closeDrawer();
        loadNpcs();
      } else msg.textContent = d.message || '建立失敗';
    }
  } catch {
    msg.textContent = '連線失敗';
  }
});



// ── Load AR Models ────────────────────────────────────────────
function loadARModels() {
  const qs = new URLSearchParams();
  if (currentAssetShopFilter) qs.set('shop_id', currentAssetShopFilter);
  return fetch(`${API_BASE}/api/ar-models${qs.toString() ? `?${qs.toString()}` : ''}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      globalModelsMap = {};
      data.models.forEach(m => { globalModelsMap[m.id] = m; });

      // Update task form model selects
      document.querySelectorAll('select[name="ar_model_id"]').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = '<option value="">-- 選填 --</option>';
        data.models.forEach(m => { sel.innerHTML += `<option value="${m.id}">${escHtml(m.name)}</option>`; });
        sel.value = cur;
      });

      // Update item form model URL selects
      document.querySelectorAll('.ar-model-url-select').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = '<option value="">-- 無 --</option>';
        data.models.forEach(m => { sel.innerHTML += `<option value="${m.url}">${escHtml(m.name)}</option>`; });
        sel.value = cur;
      });

      // Render model list in assets view
      renderModelList(data.models);
    })
    .catch(() => {});
}

function renderModelList(models) {
  const container = document.getElementById('modelListContainer');
  if (!container) return;
  if (!models.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧊</div>尚無模型</div>';
    return;
  }
  container.innerHTML = models.map(m => `
    <div style="background:white; padding:14px; border-radius:10px; border:1px solid #e2e8f0;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <span style="font-size:1.3rem;">🧊</span>
        <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(m.name)}</div>
      </div>
      <div style="font-size:0.8rem; color:#64748b;">Scale: ${m.scale || 1.0}</div>
      <div style="font-size:0.8rem; color:#64748b; margin-top:4px;">${loginUser?.role === 'admin' ? escHtml(m.shop_name || 'admin 公益共用') + '｜' : ''}${formatBytes(m.file_size || 0)}</div>
      <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:8px;">
        <a href="${escHtml(m.url)}" target="_blank" class="btn-sm btn-secondary-v2" style="text-decoration:none; font-size:0.8rem;">下載</a>
        <button class="btn-sm btn-danger-v2" onclick="deleteModel('${m.id}')" style="font-size:0.8rem;">刪除</button>
      </div>
    </div>
  `).join('');
}

function deleteModel(id) {
  if (!confirm('確定要刪除這個模型嗎？')) return;
  fetch(`${API_BASE}/api/ar-models/${id}`, {
    method: 'DELETE', headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) { showToast('模型已刪除'); loadARModels(); loadAssetStorageOverview(); }
      else showToast(d.message || '刪除失敗', 'error');
    });
}

function copyAssetUrl(url, successMessage = '已複製素材 URL') {
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => showToast(successMessage)).catch(() => showToast('複製失敗', 'error'));
}

function syncTaskVideoPreview(url = '') {
  const previewWrap = document.getElementById('taskVideoPreview');
  const player = document.getElementById('taskVideoPreviewPlayer');
  if (!previewWrap || !player) return;
  const normalizedUrl = String(url || '').trim();
  if (normalizedUrl) {
    player.src = normalizedUrl;
    previewWrap.style.display = 'block';
    return;
  }
  player.removeAttribute('src');
  player.load();
  previewWrap.style.display = 'none';
}

function populateTaskVideoLibrarySelect() {
  const sel = document.getElementById('taskVideoLibrarySelect');
  if (!sel) return;
  const assets = Object.values(globalVideoLibraryMap).sort((a, b) => b.id - a.id);
  sel.innerHTML = '<option value="">— 從共用素材庫選擇影片 —</option>';
  assets.forEach((video) => {
    const opt = document.createElement('option');
    opt.value = video.url;
    opt.textContent = video.name;
    sel.appendChild(opt);
  });
}

function populateTaskBgmLibrarySelect() {
  const sel = document.getElementById('taskBgmLibrarySelect');
  if (!sel) return;
  const assets = Object.values(globalBgmLibraryMap).sort((a, b) => b.id - a.id);
  sel.innerHTML = '<option value="">— 從共用素材庫選擇背景音樂 —</option>';
  assets.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.url;
    opt.textContent = b.name;
    sel.appendChild(opt);
  });
}

function renderBgmList(assets) {
  const container = document.getElementById('bgmListContainer');
  if (!container) return;
  if (!assets.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎵</div>尚無背景音樂，點右上角上傳</div>';
    return;
  }
  container.innerHTML = assets.map(b => `
    <div style="background:white; padding:14px; border-radius:10px; border:1px solid #e2e8f0;">
      <div style="font-weight:600; margin-bottom:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(b.name)}</div>
      <div style="font-size:0.8rem; color:#64748b; margin-bottom:6px;">${loginUser?.role === 'admin' ? escHtml(b.shop_name || 'admin 公益共用') + '｜' : ''}${formatBytes(b.file_size || 0)}</div>
      <audio controls preload="none" src="${escHtml(b.url)}" style="width:100%; margin:8px 0;"></audio>
      <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end;">
        <button type="button" class="btn-sm btn-secondary-v2" onclick="copyAssetUrl(${JSON.stringify(b.url)}, '已複製音樂 URL')" style="font-size:0.8rem;">複製 URL</button>
        <button type="button" class="btn-sm btn-danger-v2" onclick="deleteBgmAsset(${b.id})" style="font-size:0.8rem;">刪除</button>
      </div>
    </div>
  `).join('');
}

function renderVideoList(assets) {
  const container = document.getElementById('videoListContainer');
  if (!container) return;
  if (!assets.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎬</div>尚無影片素材，點右上角上傳</div>';
    return;
  }
  container.innerHTML = assets.map((video) => `
    <div style="background:white; padding:14px; border-radius:10px; border:1px solid #e2e8f0;">
      <div style="font-weight:600; margin-bottom:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(video.name)}</div>
      <div style="font-size:0.8rem; color:#64748b; margin-bottom:6px;">${loginUser?.role === 'admin' ? escHtml(video.shop_name || 'admin 公益共用') + '｜' : ''}${formatBytes(video.file_size || 0)}</div>
      <video controls preload="metadata" src="${escHtml(video.url)}" style="width:100%; margin:8px 0; border-radius:8px; background:#0f172a;"></video>
      <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end;">
        <button type="button" class="btn-sm btn-secondary-v2" onclick="copyAssetUrl(${JSON.stringify(video.url)}, '已複製影片 URL')" style="font-size:0.8rem;">複製 URL</button>
        <button type="button" class="btn-sm btn-danger-v2" onclick="deleteVideoAsset(${video.id})" style="font-size:0.8rem;">刪除</button>
      </div>
    </div>
  `).join('');
}

function deleteVideoAsset(id) {
  if (!confirm('確定從素材庫移除此影片？')) return;
  fetch(`${API_BASE}/api/video-assets/${id}`, {
    method: 'DELETE',
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) { showToast('已刪除'); loadVideoAssets(); loadAssetStorageOverview(); }
      else showToast(d.message || '刪除失敗', 'error');
    });
}

function loadVideoAssets() {
  const qs = new URLSearchParams();
  if (currentAssetShopFilter) qs.set('shop_id', currentAssetShopFilter);
  return fetch(`${API_BASE}/api/video-assets${qs.toString() ? `?${qs.toString()}` : ''}`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      globalVideoLibraryMap = {};
      (data.assets || []).forEach(v => { globalVideoLibraryMap[v.id] = v; });
      renderVideoList(data.assets || []);
      populateTaskVideoLibrarySelect();
    })
    .catch(() => {});
}

function deleteBgmAsset(id) {
  if (!confirm('確定從素材庫移除此音樂？（若關卡仍使用此 URL，請先改關卡設定）')) return;
  fetch(`${API_BASE}/api/bgm-assets/${id}`, {
    method: 'DELETE',
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) { showToast('已刪除'); loadBgmAssets(); loadAssetStorageOverview(); }
      else showToast(d.message || '刪除失敗', 'error');
    });
}

function loadBgmAssets() {
  const qs = new URLSearchParams();
  if (currentAssetShopFilter) qs.set('shop_id', currentAssetShopFilter);
  return fetch(`${API_BASE}/api/bgm-assets${qs.toString() ? `?${qs.toString()}` : ''}`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      globalBgmLibraryMap = {};
      (data.assets || []).forEach(b => { globalBgmLibraryMap[b.id] = b; });
      renderBgmList(data.assets || []);
      populateTaskBgmLibrarySelect();
    })
    .catch(() => {});
}

// BGM 素材庫上傳
document.getElementById('bgmAssetForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const form = this;
  const msg = document.getElementById('bgmAssetFormMsg');
  const fileInput = form.querySelector('input[type="file"][name="audioFile"]');
  const file = fileInput?.files?.[0];
  if (!file) {
    msg.textContent = '請選擇音檔';
    return;
  }
  msg.textContent = '上傳中...';
  const fd = new FormData();
  fd.append('name', form.name.value.trim());
  fd.append('audio', file);
  fetch(`${API_BASE}/api/bgm-assets`, {
    method: 'POST',
    headers: { 'x-username': loginUser.username },
    credentials: 'include',
    body: fd
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast('背景音樂已加入素材庫');
        closeDrawer();
        msg.textContent = '';
        form.reset();
        loadBgmAssets();
        loadAssetStorageOverview();
      } else {
        msg.textContent = d.message || '上傳失敗';
      }
    })
    .catch(() => { msg.textContent = '連線失敗'; });
});

document.getElementById('videoAssetForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const form = this;
  const msg = document.getElementById('videoAssetFormMsg');
  const fileInput = form.querySelector('input[type="file"][name="videoFile"]');
  const file = fileInput?.files?.[0];
  if (!file) {
    msg.textContent = '請選擇影片檔';
    return;
  }
  msg.textContent = '上傳中...';
  const fd = new FormData();
  fd.append('name', form.name.value.trim());
  fd.append('video', file);
  fetch(`${API_BASE}/api/video-assets`, {
    method: 'POST',
    headers: { 'x-username': loginUser.username },
    credentials: 'include',
    body: fd
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast('影片已加入素材庫');
        closeDrawer();
        msg.textContent = '';
        form.reset();
        loadVideoAssets();
        loadAssetStorageOverview();
      } else {
        msg.textContent = d.message || '上傳失敗';
      }
    })
    .catch(() => { msg.textContent = '連線失敗'; });
});

// Asset upload form
document.getElementById('assetForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const form = this;
  const msg = document.getElementById('assetFormMsg');
  msg.textContent = '上傳中...';

  const fd = new FormData();
  fd.append('name', form.name.value.trim());
  fd.append('scale', form.scale.value);
  if (form.modelFile.files[0]) fd.append('model', form.modelFile.files[0]);

  fetch(`${API_BASE}/api/ar-models`, {
    method: 'POST', headers: { 'x-username': loginUser.username }, body: fd
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast('上傳成功');
        closeDrawer();
        msg.textContent = '';
        loadARModels();
        loadAssetStorageOverview();
      } else { msg.textContent = d.message || '上傳失敗'; }
    })
    .catch(() => { msg.textContent = '上傳失敗'; });
});

// Item form submit
document.getElementById('itemForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.id.value;
  const msgEl = document.getElementById('itemFormMsg');
  msgEl.textContent = '';

  const fd = new FormData();
  fd.append('name', form.name.value.trim());
  fd.append('description', form.description.value.trim());
  fd.append('model_url', form.model_url?.value || '');

  const imageFile = form.image?.files[0];
  if (imageFile) {
    fd.append('image', imageFile);
  } else if (id) {
    fd.append('image_url', document.getElementById('itemImageUrl').value);
  }

  const url = id ? `${API_BASE}/api/items/${id}` : `${API_BASE}/api/items`;
  const method = id ? 'PUT' : 'POST';

  fetch(url, { method, headers: { 'x-username': loginUser.username }, body: fd })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        showToast(id ? '道具更新成功' : '道具新增成功');
        closeDrawer();
        loadItems();
        loadAssetStorageOverview();
      } else { msgEl.textContent = d.message || '操作失敗'; }
    })
    .catch(() => { msgEl.textContent = '伺服器連線失敗'; });
});

// Item image preview
const itemImageInput = document.getElementById('itemImageInput');
if (itemImageInput) {
  itemImageInput.addEventListener('change', function() {
    const file = this.files[0];
    const preview = document.getElementById('itemImagePreview');
    if (file) {
      const r = new FileReader();
      r.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
      r.readAsDataURL(file);
    }
  });
}

syncAssetPrimaryLabel('models');
