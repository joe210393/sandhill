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

  /** 各 view 一行的資料範圍說明（與頂欄一致，避免各 view 複製長文） */
  function applySecondaryViewNotes(user) {
    if (!user) return;
    const show = (id, text, { adminOnly = false, hideForAdmin = false } = {}) => {
      const el = global.document.getElementById(id);
      if (!el) return;
      if (adminOnly && user.role !== 'admin') {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      if (hideForAdmin && user.role === 'admin') {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      if (!text) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      el.textContent = text;
    };

    show('opsOverviewScopeNote', user.role === 'admin'
      ? '營運快照：全平台可見的入口、關卡、商店與兌換等彙總（依 API 範圍）。'
      : user.role === 'shop'
        ? '營運快照：僅你的商家相關入口、關卡、商品與兌換等彙總。'
        : '營運快照：工作人員可見玩法與營運量体；關卡總數等需商家主帳權限。');

    show('billingViewScopeNote', user.role === 'admin'
      ? '計費與圖表：含全平台與各商家；可切換「圖表範圍」比較每日 LM。'
      : '計費與圖表：僅你的商家；下方商店總帳與入口月報亦僅限自家。');

    show('assetsScopeNote', user.role === 'admin'
      ? '素材庫：列表含各商家上傳內容；建立／編輯時請確認所屬商家。'
      : '素材庫：僅顯示與管理上傳至你商家範圍的模型、道具、音樂與影片。');

    show('productsScopeNote', user.role === 'admin'
      ? '兌換商品：可含各商家建立之品項（列表若顯示商家請以此辨識）。'
      : '兌換商品：僅列出你商家建立之可兌換品項與相關紀錄。');

    show('redemptionsScopeNote', user.role === 'admin'
      ? '此頁為「積分兌換商品」佇列（全平台相關資料依 API 範圍）。優惠券請至「現場核銷」。'
      : '此頁為「積分兌換商品」佇列，僅你的商家相關申請。優惠券請至「現場核銷」。');

    show('couponIssueScopeNote', user.role === 'admin'
      ? '發券對象為玩家帳號；可綁定需 Coupon 的入口（全平台入口選項）。'
      : '發券對象為玩家帳號；可綁定需 Coupon 的入口（僅顯示你有權限的入口）。');

    show('posScopeNote', user.role === 'admin'
      ? '核銷對象為優惠券／兌換碼（全平台核銷紀錄依 API）。與「兌換紀錄」分頁不同。'
      : '核銷對象為優惠券／兌換碼；與「兌換紀錄」（積分換商品）不同。');

    show('usersScopeNote', user.role === 'admin'
      ? '會員列表：全平台玩家帳號；匯入／匯出影響面大，請謹慎操作。'
      : '',
      { adminOnly: true });

    show('shopsScopeNote', user.role === 'admin'
      ? '商店主檔：建立／編輯商店帳號與聯絡資料；與「玩法入口」分屬不同層級。'
      : '',
      { adminOnly: true });

    show('plansScopeNote', user.role === 'admin'
      ? '計價方案：影響新入口的費率與關卡上限；變更前請確認已上架入口的相容性。'
      : '',
      { adminOnly: true });

    show('rolesScopeNote', user.role === 'admin'
      ? '建立平台 admin、指派 staff；商店主帳號請至「商店管理」。'
      : '帳號安全與 staff 指派；建立商店主帳號請至「商店管理」。');
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
    applySecondaryViewNotes(user);
  }

  global.StaffDashboardRoleContext = {
    ROLE_LABELS,
    refreshStaffScopeChrome,
    getBillingScopeHintText,
    resolveShopDisplayName
  };
})(window);
