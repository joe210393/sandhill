// ── 會員搜尋 debounce ─────────────────────────────────────────
const userSearchInputEl = document.getElementById('userSearchInput');
if (userSearchInputEl) {
  userSearchInputEl.addEventListener('input', () => {
    clearTimeout(userSearchDebounceTimer);
    userSearchDebounceTimer = setTimeout(() => loadUsers(1), 360);
  });
}

const questChainSearchInputEl = document.getElementById('questChainSearchInput');
if (questChainSearchInputEl) {
  questChainSearchInputEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyQuestChainSearch();
  });
}

window.addEventListener('hashchange', () => {
  applySidebarRBAC();
  selectInitialStaffView();
});



// ── Roles ─────────────────────────────────────────────────────
function createAccount() {
  const role = document.getElementById('newAccountRole').value;
  const username = document.getElementById('newAccountUsername').value.trim();
  const password = document.getElementById('newAccountPassword').value;
  if (!username || !password) { showToast('請填寫帳號和密碼', 'error'); return; }
  if (password.length < 6) { showToast('密碼至少 6 位', 'error'); return; }
  fetch(`${API_BASE}/api/admin/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    credentials: 'include',
    body: JSON.stringify({ role, username, password })
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('帳號建立成功'); document.getElementById('newAccountUsername').value = ''; document.getElementById('newAccountPassword').value = ''; }
    else showToast(d.message || '建立失敗', 'error');
  });
}

function assignStaff() {
  const username = document.getElementById('staffPhoneInput').value.trim();
  const shopId = document.getElementById('staffShopSelect')?.value || '';
  if (!username) { showToast('請輸入玩家手機帳號', 'error'); return; }
  if (!shopId) { showToast('請先選擇商店', 'error'); return; }
  fetch(`${API_BASE}/api/staff/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    credentials: 'include',
    body: JSON.stringify({ username, shop_id: shopId })
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('已指派為工作人員'); document.getElementById('staffPhoneInput').value = ''; }
    else showToast(d.message || '指派失敗', 'error');
  });
}

function revokeStaff() {
  const username = document.getElementById('staffPhoneInput').value.trim();
  if (!username) { showToast('請輸入玩家手機帳號', 'error'); return; }
  showConfirm(`確定要撤銷 ${username} 的工作人員權限嗎？`, () => {
    fetch(`${API_BASE}/api/staff/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      credentials: 'include',
      body: JSON.stringify({ username })
    }).then(r => r.json()).then(d => {
      if (d.success) { showToast('已撤銷'); document.getElementById('staffPhoneInput').value = ''; }
      else showToast(d.message || '撤銷失敗', 'error');
    });
  });
}

document.getElementById('shopForm')?.addEventListener('submit', function(e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.shop_id.value;
  const msgEl = document.getElementById('shopFormMsg');
  setInlineMessage(msgEl, '');
  const payload = {
    shop_name: form.elements.shop_name.value.trim(),
    contact_name: form.elements.contact_name.value.trim(),
    contact_phone: form.elements.contact_phone.value.trim(),
    contact_email: form.elements.contact_email.value.trim(),
    shop_address: form.elements.shop_address.value.trim(),
    shop_description: form.elements.shop_description.value.trim(),
    status: form.elements.status.value
  };
  if (!payload.shop_name) {
    setInlineMessage(msgEl, '請填寫商店名稱');
    return;
  }

  const request = id
    ? fetch(`${API_BASE}/api/shop/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...withActorHeaders() },
        credentials: 'include',
        body: JSON.stringify({ ...payload, shop_id: id })
      })
    : fetch(`${API_BASE}/api/admin/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...withActorHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          role: 'shop',
          username: form.elements.username.value.trim(),
          password: form.elements.password.value,
          ...payload
        })
      });

  setInlineMessage(msgEl, id ? '商店資料更新中...' : '商店建立中...', 'info');
  request.then(r => r.json()).then(async (d) => {
    if (!d.success) {
      setInlineMessage(msgEl, d.message || '操作失敗');
      return;
    }
    showToast(id ? '商店資料已更新' : '商店已建立');
    closeDrawer();
    await loadShops();
    await loadShopManagement();
  }).catch(() => setInlineMessage(msgEl, '連線失敗'));
});

document.getElementById('planForm')?.addEventListener('submit', function(e) {
  e.preventDefault();
  const form = this;
  const id = form.elements.id.value;
  const msgEl = document.getElementById('planFormMsg');
  setInlineMessage(msgEl, '');
  const payload = {
    name: form.elements.name.value.trim(),
    task_limit: Number(form.elements.task_limit.value || 0),
    setup_fee: Number(form.elements.setup_fee.value || 0),
    monthly_base_fee: Number(form.elements.monthly_base_fee.value || 0),
    token_price_per_1k: Number(form.elements.token_price_per_1k.value || 0) / 10,
    is_active: form.elements.is_active.checked
  };
  if (!payload.name || !payload.task_limit) {
    setInlineMessage(msgEl, '請填寫方案名稱與關卡上限');
    return;
  }
  setInlineMessage(msgEl, id ? '方案更新中...' : '方案建立中...', 'info');
  fetch(`${API_BASE}/api/entry-plans${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json', ...withActorHeaders() },
    credentials: 'include',
    body: JSON.stringify(payload)
  }).then(r => r.json()).then(async (d) => {
    if (!d.success) {
      setInlineMessage(msgEl, d.message || '操作失敗');
      return;
    }
    showToast(id ? '方案已更新' : '方案已建立');
    closeDrawer();
    await loadEntryPlans();
    await loadPlanManagement();
  }).catch(() => setInlineMessage(msgEl, '連線失敗'));
});

function changePassword() {
  const oldPw = document.getElementById('oldPasswordInput').value;
  const newPw = document.getElementById('newPasswordInput').value;
  if (!oldPw || !newPw) { showToast('請填寫密碼', 'error'); return; }
  if (newPw.length < 6) { showToast('新密碼至少 6 位', 'error'); return; }
  fetch(`${API_BASE}/api/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    credentials: 'include',
    body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('密碼已更新'); document.getElementById('oldPasswordInput').value = ''; document.getElementById('newPasswordInput').value = ''; }
    else showToast(d.message || '更新失敗', 'error');
  });
}



// ── Users ─────────────────────────────────────────────────────
let currentUserPage = 1;
let userSearchDebounceTimer = null;

function loadUsers(page) {
  currentUserPage = page || 1;
  const q = document.getElementById('userSearchInput')?.value.trim() || '';
  const qs = new URLSearchParams({ page: String(currentUserPage), limit: '50' });
  if (q) qs.set('search', q);
  fetch(`${API_BASE}/api/admin/users?${qs}`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json()).then(data => {
      if (!data.success) return;
      const total = data.pagination?.totalUsers ?? data.total ?? data.users?.length ?? 0;
      document.getElementById('totalUserCount').textContent = total;
      const c = document.getElementById('userListContainer');
      if (!data.users?.length) {
        c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div>尚無符合的會員</div>';
        document.getElementById('userPagination').innerHTML = '';
        return;
      }
      c.innerHTML = data.users.map(u => `
        <div class="task-item">
          <div class="task-item-body">
            <div class="task-item-title">👤 ${escHtml(u.username)}</div>
            <div style="display:flex; gap:4px; flex-wrap:wrap;">
              <span class="tag tag-gray">${escHtml(u.role || 'user')}</span>
              <span class="tag tag-amber">💰 ${u.total_points || 0} 分</span>
              <span class="tag tag-green">✅ ${u.completed_tasks || 0} 完成</span>
              <span class="tag tag-blue">🔄 ${u.in_progress_tasks || 0} 進行中</span>
            </div>
          </div>
        </div>
      `).join('');
      const totalPages = data.pagination?.totalPages ?? Math.max(1, Math.ceil(total / 50));
      const pag = document.getElementById('userPagination');
      if (totalPages <= 1) { pag.innerHTML = ''; return; }
      pag.innerHTML = Array.from({ length: totalPages }, (_, i) =>
        `<button class="btn-sm ${i + 1 === currentUserPage ? 'btn-primary-v2' : 'btn-secondary-v2'}" onclick="loadUsers(${i + 1})">${i + 1}</button>`
      ).join('');
    });
}

function exportUsers() {
  window.open(`${API_BASE}/api/admin/users/export`, '_blank');
}

// Import users form
document.getElementById('importUsersForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const form = this; const msgEl = document.getElementById('importFormMsg');
  const fd = new FormData();
  if (form.file.files[0]) fd.append('file', form.file.files[0]);
  if (form.simulateActivity.checked) {
    fd.append('simulateActivity', 'true');
    fd.append('startDate', form.startDate.value);
    fd.append('endDate', form.endDate.value);
  }
  msgEl.textContent = '匯入中...';
  fetch(`${API_BASE}/api/admin/import-users`, {
    method: 'POST',
    headers: { 'x-username': loginUser.username },
    credentials: 'include',
    body: fd
  })
    .then(r => r.json()).then(d => {
      if (d.success) { showToast(d.message || '匯入成功'); closeDrawer(); loadUsers(1); }
      else msgEl.textContent = d.message || '匯入失敗';
    }).catch(() => { msgEl.textContent = '連線失敗'; });
});

// Simulate activity toggle
const simCheck = document.querySelector('#importUsersForm input[name="simulateActivity"]');
if (simCheck) {
  simCheck.addEventListener('change', () => {
    document.getElementById('importSimFields').style.display = simCheck.checked ? 'block' : 'none';
  });
}

