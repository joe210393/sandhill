// ── POS：Enter 查券 ────────────────────────────────────────────
const couponCodeInputEl = document.getElementById('couponCodeInput');
if (couponCodeInputEl) {
  couponCodeInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      lookupCoupon();
    }
  });
}



// ── POS Coupon ────────────────────────────────────────────────
function lookupCoupon() {
  const code = document.getElementById('couponCodeInput').value.trim();
  if (!code) { showToast('請輸入代碼', 'error'); return; }
  const result = document.getElementById('couponResult');
  result.style.display = 'none';
  fetch(`${API_BASE}/api/coupons/lookup/${encodeURIComponent(code)}`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json()).then(data => {
      if (!data.success) { showToast(data.message || '查無此券', 'error'); return; }
      const c = data.coupon;
      const canRedeem = c.status === 'active' && !c.is_used;
      result.innerHTML = `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700; font-size:1.1rem; margin-bottom:4px;">${escHtml(c.title || '優惠券')}</div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <span class="tag ${canRedeem ? 'tag-green' : 'tag-red'}">${canRedeem ? '可核銷' : (c.is_used ? '已使用' : c.status)}</span>
            <span class="tag tag-gray">👤 ${escHtml(c.username || '')}</span>
            ${c.discount ? `<span class="tag tag-amber">折扣 ${c.discount}</span>` : ''}
          </div>
        </div>
        ${canRedeem ? `<button class="btn-md btn-primary-v2" onclick="redeemCoupon('${c.id}')" style="width:100%;">確認核銷</button>` : '<div style="color:#dc2626; text-align:center;">此券無法核銷</div>'}
      `;
      result.style.display = 'block';
    }).catch(() => showToast('查詢失敗', 'error'));
}

function redeemCoupon(id) {
  fetch(`${API_BASE}/api/coupons/${id}/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
    credentials: 'include'
  }).then(r => r.json()).then(d => {
    if (d.success) { showToast('核銷成功！'); document.getElementById('couponResult').style.display = 'none'; document.getElementById('couponCodeInput').value = ''; loadPosHistory(); }
    else showToast(d.message || '核銷失敗', 'error');
  });
}

function loadPosHistory() {
  fetch(`${API_BASE}/api/coupons/redeem-history`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json()).then(data => {
      const c = document.getElementById('posHistoryContainer');
      if (!data.success || !data.history?.length) { c.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem;">今日尚無核銷紀錄</div>'; return; }
      c.innerHTML = data.history.map(h => `
        <div style="background:#f8fafc; padding:10px 14px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
          <div><span style="font-weight:500;">${escHtml(h.title || h.coupon_code)}</span> <span style="color:#64748b; font-size:0.82rem;">— ${escHtml(h.username || '')}</span></div>
          <span style="font-size:0.8rem; color:#94a3b8;">${h.redeemed_at ? new Date(h.redeemed_at).toLocaleTimeString('zh-TW') : ''}</span>
        </div>
      `).join('');
    }).catch(() => {});
}



// ── 發放兌換卷 ────────────────────────────────────────────────
function loadIssuedCoupons() {
  const c = document.getElementById('issuedCouponsContainer');
  if (!c) return;
  fetch(`${API_BASE}/api/coupons/issued?page=1&pageSize=40`, {
    headers: { 'x-username': loginUser.username },
    credentials: 'include'
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        c.innerHTML = '<div style="color:#94a3b8;">載入失敗</div>';
        return;
      }
      if (!data.coupons?.length) {
        c.innerHTML = '<div style="color:#94a3b8; font-size:0.9rem;">尚無發放紀錄</div>';
        return;
      }
      c.innerHTML = data.coupons.map(cp => `
        <div style="background:#f8fafc; padding:12px 14px; border-radius:8px; border:1px solid #e2e8f0;">
          <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="font-weight:600;">${escHtml(cp.title)}</div>
              <div style="font-size:0.85rem; color:#64748b; margin-top:4px;">代碼 <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;">${escHtml(cp.coupon_code)}</code> · ${escHtml(cp.username || '—')}</div>
              ${cp.quest_chain_title ? `<div style="font-size:0.82rem; color:#475569; margin-top:6px;">綁定入口：${escHtml(cp.quest_chain_title)}</div>` : ''}
            </div>
            <span class="tag ${cp.is_used ? 'tag-gray' : (cp.status === 'expired' ? 'tag-amber' : 'tag-green')}">${cp.is_used ? '已核銷' : (cp.status === 'expired' ? '已過期' : '未使用')}</span>
          </div>
          <div style="font-size:0.82rem; color:#64748b; margin-top:8px;">${cp.discount ? `折扣 ${escHtml(String(cp.discount))}` : ''}${cp.expiry_date ? ` · 到期 ${escHtml(String(cp.expiry_date))}` : ''}${cp.created_at ? ` · ${escHtml(new Date(cp.created_at).toLocaleString('zh-TW'))}` : ''}</div>
        </div>
      `).join('');
    })
    .catch(() => {
      c.innerHTML = '<div style="color:#94a3b8;">載入失敗</div>';
    });
}

function refreshCouponQuestChainOptions() {
  const select = document.getElementById('couponQuestChainSelect');
  if (!select) return;
  const currentValue = select.value;
  const options = Object.values(globalQuestChainsMap)
    .sort((a, b) => (Number(a.entry_order || 0) - Number(b.entry_order || 0)) || (Number(a.id) - Number(b.id)))
    .map((q) => `<option value="${q.id}">${escHtml(q.title)}${q.access_mode === 'coupon' ? '（需 Coupon）' : '（公開入口）'}</option>`)
    .join('');
  select.innerHTML = `<option value="">不綁定入口（一般折扣券）</option>${options}`;
  if ([...select.options].some(option => option.value === currentValue)) {
    select.value = currentValue;
  }
}

const couponIssueFormEl = document.getElementById('couponIssueForm');
if (couponIssueFormEl) {
  couponIssueFormEl.addEventListener('submit', e => {
    e.preventDefault();
    const msgEl = document.getElementById('couponIssueFormMsg');
    if (msgEl) msgEl.textContent = '';
    const fd = new FormData(couponIssueFormEl);
    const body = {
      username: (fd.get('username') || '').toString().trim(),
      title: (fd.get('title') || '').toString().trim(),
      quest_chain_id: (fd.get('quest_chain_id') || '').toString().trim(),
      discount_amount: fd.get('discount_amount') || '',
      discount_percent: fd.get('discount_percent') || '',
      expiry_date: fd.get('expiry_date') || '',
      coupon_code: (fd.get('coupon_code') || '').toString().trim()
    };
    fetch(`${API_BASE}/api/coupons/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-username': loginUser.username },
      credentials: 'include',
      body: JSON.stringify(body)
    })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const code = d.coupon?.coupon_code || '';
          showToast(code ? `已發放，代碼：${code}` : (d.message || '已發放'));
          couponIssueFormEl.reset();
          loadIssuedCoupons();
        } else if (msgEl) {
          msgEl.textContent = d.message || '發放失敗';
        } else {
          showToast(d.message || '發放失敗', 'error');
        }
      })
      .catch(() => {
        if (msgEl) msgEl.textContent = '連線失敗';
        else showToast('連線失敗', 'error');
      });
  });
}

