/**
 * Admin / Shop / Staff 範圍提示（僅 UI 層，不重複 API 權限）。
 * 供 bootstrap、計費頁與列表 placeholder 共用，避免散落在各 view。
 */
(function attachStaffRoleContext(global) {
  const ROLE_LABELS = {
    admin: '平台管理員',
    shop: '建置廠商',
    staff: '廠商員工',
    user: '玩家'
  };

  function resolveShopDisplayName(user) {
    if (!user || user.shop_id == null || user.shop_id === '') return '';
    const sm = global.globalShopsMap || {};
    const row = sm[String(user.shop_id)];
    return (row && row.name) || user.shop_name || '';
  }

  /** 計費區塊頂部說明（與後台頂欄範圍一致） */
  function getBillingScopeHintText(user) {
    if (!user) return '';
    if (user.role === 'admin') {
      return '目前為平台管理視角，可查看全部商家的用量、收費狀態與公益代付數據。';
    }
    const shopName = resolveShopDisplayName(user) || user.shop_name || '你的商家';
    return `目前為 ${shopName} 視角，只顯示自己商家的入口資料與使用量。`;
  }

  function applySidebarScopeClasses(user) {
    const aside = global.document.getElementById('mainSidebar');
    if (!aside || !user) return;
    aside.classList.toggle('v2-sidebar--platform', user.role === 'admin');
    aside.classList.toggle('v2-sidebar--tenant', user.role === 'shop' || user.role === 'staff');
  }

  function applyQuestChainViewNote(user) {
    const note = global.document.getElementById('questChainsScopeNote');
    if (!note || !user) return;
    note.style.display = 'block';
    if (user.role === 'admin') {
      note.textContent =
        '全平台視角：列表與搜尋可涵蓋所有商家；新增入口時請選擇商家。';
    } else if (user.role === 'shop') {
      note.textContent = '商家視角：僅顯示與管理你所屬商家的入口與關卡。';
    } else if (user.role === 'staff') {
      note.textContent = '員工視角：僅顯示雇主商店範圍內的入口與關卡。';
    } else {
      note.style.display = 'none';
    }
  }

  function applyListUiTweaks(user) {
    if (!user) return;
    const qcSearch = global.document.getElementById('questChainSearchInput');
    if (qcSearch) {
      qcSearch.placeholder =
        user.role === 'admin'
          ? '搜尋標題、商家、方案…'
          : '搜尋標題、方案…（僅你的商家範圍）';
    }
  }

  function applyHeaderScope(user) {
    const badge = global.document.getElementById('staffScopeBadge');
    const sub = global.document.getElementById('staffScopeSubline');
    if (!user) {
      if (badge) {
        badge.style.display = 'none';
        badge.textContent = '';
      }
      if (sub) {
        sub.style.display = 'none';
        sub.textContent = '';
      }
      return;
    }

    if (user.role === 'admin') {
      if (badge) {
        badge.style.display = 'inline-flex';
        badge.className = 'staff-scope-badge staff-scope-badge--platform';
        badge.textContent = '平台 · 全部商家';
      }
      if (sub) {
        sub.style.display = 'block';
        sub.textContent = '資料範圍為全平台；建立入口／商品／素材時請指定商家。';
      }
    } else if (user.role === 'shop') {
      const name = resolveShopDisplayName(user) || user.shop_name || '我的商家';
      if (badge) {
        badge.style.display = 'inline-flex';
        badge.className = 'staff-scope-badge staff-scope-badge--tenant';
        badge.textContent = `商家 · ${name}`;
      }
      if (sub) {
        sub.style.display = 'block';
        sub.textContent = '資料範圍僅限貴公司；無法查看其他商家。';
      }
    } else if (user.role === 'staff') {
      const name = resolveShopDisplayName(user) || user.shop_name || '所屬商家';
      if (badge) {
        badge.style.display = 'inline-flex';
        badge.className = 'staff-scope-badge staff-scope-badge--tenant';
        badge.textContent = `員工 · ${name}`;
      }
      if (sub) {
        sub.style.display = 'block';
        sub.textContent = '資料範圍依雇主商店與帳號權限。';
      }
    } else {
      if (badge) badge.style.display = 'none';
      if (sub) sub.style.display = 'none';
    }
  }

  function refreshStaffScopeChrome() {
    const user = global.loginUser;
    applyHeaderScope(user);
    applySidebarScopeClasses(user);
    applyListUiTweaks(user);
    applyQuestChainViewNote(user);
  }

  global.StaffDashboardRoleContext = {
    ROLE_LABELS,
    refreshStaffScopeChrome,
    getBillingScopeHintText,
    resolveShopDisplayName
  };
})(window);
