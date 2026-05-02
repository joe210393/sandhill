(function(global) {
  const STAFF_DASH_HASH_BY_VIEW = {
    'view-quest-chains': 'quests',
    'view-billing': 'billing',
    'view-shops': 'shops',
    'view-plans': 'plans',
    'view-assets': 'assets',
    'view-products': 'products',
    'view-reward-shop': 'reward-shop',
    'view-redemptions': 'redemptions',
    'view-coupon-issue': 'coupon-issue',
    'view-pos': 'pos',
    'view-users': 'users',
    'view-roles': 'roles'
  };

  const STAFF_DASH_NAV_BY_VIEW = {
    'view-quest-chains': 'view-quest-chains',
    'view-quest-detail': 'view-quest-chains',
    'view-billing': 'view-billing',
    'view-shops': 'view-shops',
    'view-plans': 'view-plans',
    'view-assets': 'view-assets',
    'view-products': 'view-products',
    'view-reward-shop': 'view-reward-shop',
    'view-redemptions': 'view-redemptions',
    'view-coupon-issue': 'view-coupon-issue',
    'view-pos': 'view-pos',
    'view-users': 'view-users',
    'view-roles': 'view-roles'
  };

  function normalizeViewId(viewId) {
    return viewId === 'view-review' ? 'view-quest-chains' : viewId;
  }

  function setStaffViewHash(viewId) {
    const hash = STAFF_DASH_HASH_BY_VIEW[viewId];
    if (!hash || typeof global.history === 'undefined' || !global.history.replaceState) return;
    const next = `${global.location.pathname}${global.location.search}#${hash}`;
    if (global.location.hash !== `#${hash}`) global.history.replaceState(null, '', next);
  }

  function getViewIdFromHash() {
    const raw = (global.location.hash || '').replace(/^#\/?/, '').toLowerCase();
    const normalizedHash = raw === 'review' ? 'quests' : raw;
    return normalizedHash
      ? Object.keys(STAFF_DASH_HASH_BY_VIEW).find((key) => STAFF_DASH_HASH_BY_VIEW[key] === normalizedHash)
      : null;
  }

  function ensureRewardShopIframe() {
    const iframe = global.document.getElementById('rewardShopIframe');
    if (!iframe) return;
    if (!iframe.getAttribute('src') || iframe.getAttribute('src') === 'about:blank') {
      iframe.src = '/products.html?embed=1';
    }
  }

  function switchView(viewId, { skipHash = false, lazyLoad = {} } = {}) {
    const normalizedViewId = normalizeViewId(viewId);
    global.document.querySelectorAll('.v2-view').forEach((element) => element.classList.remove('active'));
    global.document.getElementById(normalizedViewId)?.classList.add('active');

    const targetNav = STAFF_DASH_NAV_BY_VIEW[normalizedViewId] || normalizedViewId;
    global.document.querySelectorAll('.v2-nav-item').forEach((element) => {
      element.classList.toggle('active', element.dataset.view === targetNav);
    });

    if (!skipHash) setStaffViewHash(normalizedViewId);

    if (normalizedViewId === 'view-billing') lazyLoad.loadBillingDashboard?.();
    if (normalizedViewId === 'view-shops') lazyLoad.loadShopManagement?.();
    if (normalizedViewId === 'view-plans') lazyLoad.loadPlanManagement?.();
    if (normalizedViewId === 'view-reward-shop') ensureRewardShopIframe();
    if (normalizedViewId === 'view-products') lazyLoad.loadProducts?.();
    if (normalizedViewId === 'view-redemptions') lazyLoad.loadRedemptions?.();
    if (normalizedViewId === 'view-coupon-issue') lazyLoad.loadIssuedCoupons?.();
    if (normalizedViewId === 'view-pos') lazyLoad.loadPosHistory?.();
    if (normalizedViewId === 'view-users') lazyLoad.loadUsers?.(1);
  }

  function selectInitialStaffView({ switchView: switchViewFn } = {}) {
    const fromHash = getViewIdFromHash();
    if (fromHash) {
      const nav = global.document.querySelector(`.v2-nav-item[data-view="${fromHash}"]`);
      if (nav && nav.style.display !== 'none') {
        global.document.querySelectorAll('.v2-nav-item').forEach((item) => item.classList.remove('active'));
        nav.classList.add('active');
        switchViewFn(fromHash, { skipHash: true });
        return;
      }
    }

    let pick = null;
    global.document.querySelectorAll('.v2-nav-item[data-roles]').forEach((item) => {
      if (!pick && item.style.display !== 'none') pick = item;
    });
    if (pick) {
      global.document.querySelectorAll('.v2-nav-item').forEach((item) => item.classList.remove('active'));
      pick.classList.add('active');
      switchViewFn(pick.dataset.view);
    }
  }

  function wireSidebarNavigation({ switchView: switchViewFn } = {}) {
    global.document.querySelectorAll('.v2-nav-item').forEach((item) => {
      item.addEventListener('click', () => switchViewFn(item.dataset.view));
    });
  }

  global.StaffDashboardNavigation = {
    STAFF_DASH_HASH_BY_VIEW,
    switchView,
    selectInitialStaffView,
    wireSidebarNavigation,
    ensureRewardShopIframe
  };
})(window);
