// ── Load Items ────────────────────────────────────────────────
function loadItems() {
  const qs = new URLSearchParams();
  if (currentAssetShopFilter) qs.set('shop_id', currentAssetShopFilter);
  return fetch(`${API_BASE}/api/items${qs.toString() ? `?${qs.toString()}` : ''}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      globalItemsMap = {};
      data.items.forEach(item => { globalItemsMap[item.id] = item; });

      // Update item selects in task form
      document.querySelectorAll('.item-select').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = '<option value="">-- 無 --</option>';
        data.items.forEach(item => {
          sel.innerHTML += `<option value="${item.id}">${escHtml(item.name)}</option>`;
        });
        sel.value = cur;
      });

      // Render items in assets view
      renderItemList(data.items);
    })
    .catch(() => {});
}

function renderItemList(items) {
  const container = document.getElementById('itemListContainer');
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎒</div>尚無道具，點右上角新增</div>';
    return;
  }
  container.innerHTML = items.map(item => `
    <div style="background:white; padding:14px; border-radius:10px; border:1px solid #e2e8f0;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        ${item.image_url ? `<img src="${escHtml(item.image_url)}" style="width:40px; height:40px; object-fit:contain; border-radius:6px;">` : '<span style="font-size:1.5rem;">🎒</span>'}
        <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(item.name)}</div>
      </div>
      <div style="font-size:0.82rem; color:#64748b; margin-bottom:8px;">${escHtml(item.description || '無描述')}</div>
      <div style="font-size:0.8rem; color:#64748b; margin-bottom:8px;">${loginUser?.role === 'admin' ? escHtml(item.shop_name || 'admin 公益共用') + '｜' : ''}${formatBytes(item.file_size || 0)}</div>
      <div style="display:flex; gap:6px; justify-content:flex-end;">
        <button class="btn-sm btn-secondary-v2" onclick="editItem('${item.id}')" style="font-size:0.8rem;">編輯</button>
        <button class="btn-sm btn-danger-v2" onclick="deleteItem('${item.id}')" style="font-size:0.8rem;">刪除</button>
      </div>
    </div>
  `).join('');
}

function editItem(id) {
  const item = globalItemsMap[id];
  if (!item) return;
  openDrawer('編輯道具', 'form-item');
  const form = document.getElementById('itemForm');
  form.elements.id.value = item.id;
  form.elements.name.value = item.name;
  form.elements.description.value = item.description || '';
  document.getElementById('itemImageUrl').value = item.image_url || '';
  const preview = document.getElementById('itemImagePreview');
  if (item.image_url) { preview.src = item.image_url; preview.style.display = 'block'; }
  else preview.style.display = 'none';
  const modelSel = form.querySelector('.ar-model-url-select');
  if (modelSel) modelSel.value = item.model_url || '';
}

function deleteItem(id) {
  if (!confirm('確定要刪除這個道具嗎？')) return;
  fetch(`${API_BASE}/api/items/${id}`, {
    method: 'DELETE', headers: { 'x-username': loginUser.username }
  })
    .then(r => r.json())
    .then(d => {
      if (d.success) { showToast('道具已刪除'); loadItems(); loadAssetStorageOverview(); }
      else showToast(d.message || '刪除失敗', 'error');
    });
}

// ── RBAC Sidebar Control ──────────────────────────────────────
function applySidebarRBAC() {
  const role = loginUser?.role || '';
  document.querySelectorAll('.v2-nav-item[data-roles]').forEach(item => {
    const allowed = item.dataset.roles.split(',');
    item.style.display = allowed.includes(role) ? 'flex' : 'none';
  });
  // Hide section labels if all items below are hidden
  document.querySelectorAll('.v2-sidebar-label').forEach(label => {
    let next = label.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('v2-sidebar-label')) {
      if (next.style.display !== 'none') hasVisible = true;
      next = next.nextElementSibling;
    }
    label.style.display = hasVisible ? 'block' : 'none';
  });
  // Hide create account section for shop role
  const createSection = document.getElementById('roleSection_createAccount');
  if (createSection) createSection.style.display = role === 'admin' ? 'block' : 'none';
  const assignSection = document.getElementById('roleSection_assignStaff');
  if (assignSection) assignSection.style.display = role === 'admin' ? 'block' : 'none';
  const subtitle = document.getElementById('rolesViewSubtitle');
  if (subtitle) {
    subtitle.textContent = role === 'admin'
      ? '僅限平台管理員。管理後台帳號與 staff 指派規則。'
      : '此頁僅保留帳號安全設定；商店與會員管理由平台管理員統一處理。';
  }
}

function hydrateLoginHeader() {
  const info = document.getElementById('loginUserInfo');
  const roles = { admin: '平台管理員', shop: '建置廠商', staff: '廠商員工', user: '玩家' };
  if (info && loginUser) {
    info.textContent = `${roles[loginUser.role] || ''}：${loginUser.username}`;
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.style.display = loginUser ? 'inline-block' : 'none';
    logoutBtn.onclick = async () => {
      try {
        await apiJson(`${API_BASE}/api/logout`, { method: 'POST' });
      } catch (error) {
        // ignore logout API errors; local cleanup below is sufficient
      }
      localStorage.removeItem('loginUser');
      window.location.href = '/login.html';
    };
  }
}

async function bootstrapSession() {
  try {
    window.StaffDashboardDrawer?.initializeTaskWizardDOM?.();
    syncDrawerFooter();
    const billingMonthInput = document.getElementById('billingMonthInput');
    if (billingMonthInput && !billingMonthInput.value) {
      billingMonthInput.value = getDefaultBillingMonth();
    }
    if (billingMonthInput && !billingMonthInput.dataset.bound) {
      billingMonthInput.dataset.bound = '1';
      billingMonthInput.addEventListener('change', () => {
        if (document.getElementById('view-billing')?.classList.contains('active')) {
          loadBillingDashboard();
        }
      });
    }
    const billingScopeSelect = document.getElementById('billingDailyScopeSelect');
    if (billingScopeSelect && !billingScopeSelect.dataset.bound) {
      billingScopeSelect.dataset.bound = '1';
      billingScopeSelect.addEventListener('change', (event) => {
        currentBillingDailyScope = event.target.value || 'platform';
        renderBillingDailyCharts(currentBillingDailyData);
      });
    }
    const data = await apiJson(`${API_BASE}/api/me`);
    loginUser = data.user;
    window.loginUser = data.user;
    localStorage.setItem('loginUser', JSON.stringify(data.user));
    ensureQuestChainSearchStartsBlank();
    hydrateLoginHeader();
    applySidebarRBAC();
    window.selectInitialStaffView?.();

    const role = loginUser?.role || '';
    const initLoads = [];
    if (['admin', 'shop', 'staff'].includes(role)) {
      initLoads.push(loadShops(), loadEntryPlans(), loadQuestChains(), loadItems(), loadARModels(), loadBgmAssets(), loadVideoAssets(), loadAssetStorageOverview());
      if (role === 'admin' || role === 'shop') {
        initLoads.push(loadProducts());
      }
    } else {
      throw new Error('僅限管理員、商店或工作人員使用');
    }

    await Promise.all(initLoads);
  } catch (error) {
    alert(error.message || '請先以管理員或工作人員登入內容控制台');
    localStorage.removeItem('loginUser');
    window.location.href = '/login.html';
  }
}

// ── Mobile Sidebar Toggle ─────────────────────────────────────
const sidebarToggle = document.getElementById('sidebarToggle');
const mainSidebar = document.getElementById('mainSidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
if (sidebarToggle && mainSidebar) {
  sidebarToggle.addEventListener('click', () => {
    mainSidebar.classList.toggle('mobile-open');
    sidebarBackdrop.classList.toggle('open');
  });
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', () => {
      mainSidebar.classList.remove('mobile-open');
      sidebarBackdrop.classList.remove('open');
    });
  }
  // Close sidebar on nav click (mobile)
  document.querySelectorAll('.v2-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      mainSidebar.classList.remove('mobile-open');
      sidebarBackdrop.classList.remove('open');
    });
  });
}

// ── Confirm Dialog ────────────────────────────────────────────
let confirmCallback = null;
function showConfirm(msg, onOk) {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmDialog').style.display = 'block';
  confirmCallback = onOk;
}
function closeConfirm() {
  document.getElementById('confirmDialog').style.display = 'none';
  confirmCallback = null;
}
document.getElementById('confirmOkBtn').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  closeConfirm();
});

