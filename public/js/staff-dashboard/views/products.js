// ── Redemptions ───────────────────────────────────────────────
function loadRedemptions() {
  const status = document.getElementById('redemptionStatusFilter')?.value || '';
  const search = document.getElementById('redemptionSearch')?.value.trim() || '';
  fetch(`${API_BASE}/api/product-redemptions/admin`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json()).then(data => {
      if (!data.success) return;
      let records = data.redemptions || [];
      if (status) records = records.filter(r => r.status === status);
      if (search) records = records.filter(r => (r.username || '').includes(search) || (r.product_name || '').includes(search));
      const c = document.getElementById('redemptionListContainer');
      if (!records.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧾</div>沒有符合的紀錄</div>'; return; }
      c.innerHTML = records.map(r => {
        const statusColors = { pending: 'tag-amber', completed: 'tag-green', cancelled: 'tag-red' };
        const statusLabels = { pending: '待處理', completed: '已完成', cancelled: '已取消' };
        const redeemedAt = r.redeemed_at ? new Date(r.redeemed_at).toLocaleString('zh-TW') : '';
        const actions = r.status === 'pending' ? `
          <button class="btn-sm btn-primary-v2" onclick="completeRedemption('${r.id}')">完成兌換</button>
          <button class="btn-sm btn-danger-v2" onclick="cancelRedemption('${r.id}')">取消</button>
        ` : '';
        return `<div class="task-item">
          <div class="task-item-body">
            <div class="task-item-title">${escHtml(r.product_name || '商品')}</div>
            <div style="display:flex; gap:4px; flex-wrap:wrap;">
              <span class="tag tag-gray">👤 ${escHtml(r.username || '')}</span>
              <span class="tag ${statusColors[r.status] || 'tag-gray'}">${statusLabels[r.status] || r.status}</span>
              <span class="tag tag-gray">💰 ${r.points_used ?? 0} 分</span>
              ${redeemedAt ? `<span class="tag tag-gray">申請 ${redeemedAt}</span>` : ''}
            </div>
          </div>
          <div class="task-item-actions">${actions}</div>
        </div>`;
      }).join('');
    });
}

function completeRedemption(id) {
  showConfirm('確定完成此兌換？', () => {
    fetch(`${API_BASE}/api/product-redemptions/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      credentials: 'include',
      body: JSON.stringify({ status: 'completed' })
    }).then(r => r.json()).then(d => { if (d.success) { showToast('兌換已完成'); loadRedemptions(); } else showToast(d.message || '失敗', 'error'); });
  });
}

function cancelRedemption(id) {
  showConfirm('確定取消此兌換？', () => {
    fetch(`${API_BASE}/api/product-redemptions/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      credentials: 'include',
      body: JSON.stringify({ status: 'cancelled' })
    }).then(r => r.json()).then(d => { if (d.success) { showToast('兌換已取消'); loadRedemptions(); } else showToast(d.message || '失敗', 'error'); });
  });
}



// ── Products ──────────────────────────────────────────────────
let globalProducts = [];
let lastProductsAdminRole = null;

function loadProducts() {
  return fetch(`${API_BASE}/api/products/admin`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      globalProducts = data.products || [];
      lastProductsAdminRole = data.userRole || null;
      const banner = document.getElementById('shopOpsBanner');
      if (banner) {
        banner.style.display = lastProductsAdminRole === 'shop' ? 'block' : 'none';
      }
      renderProducts();
    })
    .catch(() => {});
}

function renderProducts() {
  const c = document.getElementById('productListContainer');
  if (!c) return;
  if (!globalProducts.length) { c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div>尚無商品</div>'; return; }
  c.innerHTML = globalProducts.map(p => `
    <div style="background:white; padding:16px; border-radius:12px; border:1px solid #e2e8f0;">
      ${p.image_url ? `<img src="${escHtml(p.image_url)}" style="width:100%; height:120px; object-fit:cover; border-radius:8px; margin-bottom:10px;" onerror="this.style.display='none'">` : ''}
      <div style="font-weight:600; margin-bottom:4px;">${escHtml(p.name)}</div>
      <div style="font-size:0.82rem; color:#64748b; margin-bottom:8px;">${escHtml(p.description || '')}</div>
      <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
        <span class="tag tag-amber">💰 ${p.points_required} 分</span>
        <span class="tag tag-gray">庫存 ${p.stock ?? '∞'}</span>
        <span class="tag ${p.is_active ? 'tag-green' : 'tag-red'}">${p.is_active ? '上架中' : '已下架'}</span>
        ${loginUser.role === 'admin' && p.created_by ? `<span class="tag tag-blue">🏪 ${escHtml(p.created_by)}</span>` : ''}
      </div>
      <div style="display:flex; gap:6px; justify-content:flex-end;">
        <button class="btn-sm btn-secondary-v2" onclick="editProduct('${p.id}')">編輯</button>
        <button class="btn-sm btn-danger-v2" onclick="deleteProduct('${p.id}')">刪除</button>
      </div>
    </div>
  `).join('');
}

function editProduct(id) {
  const p = globalProducts.find(x => String(x.id) === String(id));
  if (!p) return;
  openDrawer('編輯商品', 'form-product');
  const form = document.getElementById('productForm');
  form.elements.id.value = p.id;
  form.elements.name.value = p.name;
  form.elements.description.value = p.description || '';
  form.elements.points_required.value = p.points_required;
  form.elements.stock.value = p.stock ?? 0;
  document.getElementById('productImageUrl').value = p.image_url || '';
  const preview = document.getElementById('productImagePreview');
  if (p.image_url) { preview.src = p.image_url; preview.style.display = 'block'; } else preview.style.display = 'none';
}

function deleteProduct(id) {
  showConfirm('確定要刪除這個商品嗎？', () => {
    fetch(`${API_BASE}/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'x-username': loginUser.username },
      credentials: 'include'
    })
      .then(r => r.json()).then(d => {
        if (d.success) { showToast('商品已刪除'); loadProducts(); } else showToast(d.message || '刪除失敗', 'error');
      });
  });
}

// Product form submit
document.getElementById('productForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const form = this; const id = form.elements.id.value;
  const msgEl = document.getElementById('productFormMsg'); msgEl.textContent = '';
  const fd = new FormData();
  fd.append('name', form.name.value.trim());
  fd.append('description', form.description.value.trim());
  fd.append('points_required', form.points_required.value);
  fd.append('stock', form.stock.value);
  const imgFile = form.image?.files[0];
  if (imgFile) fd.append('image', imgFile);
  else if (id) fd.append('image_url', document.getElementById('productImageUrl').value);
  const url = id ? `${API_BASE}/api/products/${id}` : `${API_BASE}/api/products`;
  const method = id ? 'PUT' : 'POST';
  fetch(url, {
    method,
    headers: { 'x-username': loginUser.username },
    credentials: 'include',
    body: fd
  })
    .then(r => r.json()).then(d => {
      if (d.success) { showToast(id ? '商品已更新' : '商品已建立'); closeDrawer(); loadProducts(); }
      else msgEl.textContent = d.message || '操作失敗';
    }).catch(() => { msgEl.textContent = '連線失敗'; });
});

const productImageInput = document.getElementById('productImageInput');
if (productImageInput) {
  productImageInput.addEventListener('change', function() {
    const file = this.files[0]; const preview = document.getElementById('productImagePreview');
    if (file) { const r = new FileReader(); r.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; }; r.readAsDataURL(file); }
  });
}

