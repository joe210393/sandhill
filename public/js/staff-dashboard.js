// ============================================================
// staff-dashboard-v2.js — 沙丘內容控制台 V2
// Sidebar + Drill-down + Right Drawer architecture
// Backend API unchanged — only presentation layer refactored
// ============================================================

let loginUser = window.loginUser || JSON.parse(localStorage.getItem('loginUser') || 'null');

const API_BASE = '';
window.SandhillApi.installStaffFetchPatch();
const withActorHeaders = window.SandhillApi.withActorHeaders;
const apiJson = window.SandhillApi.apiJson;
const {
  formatCurrency,
  formatBytes,
  formatTokenPricingRule,
  formatTokenPricingDetail,
  formatTokenCount,
  formatDateTime,
  formatDayLabel
} = window.SandhillFormat;
const {
  showToast,
  escHtml,
  setInlineMessage
} = window.SandhillDom;
const staffDashboardState = window.StaffDashboardState.state;
const staffFormUtils = window.StaffDashboardFormUtils;
const staffNavigation = window.StaffDashboardNavigation;
const staffDrawer = window.StaffDashboardDrawer;
const {
  TASK_WIZARD_TOTAL_STEPS,
  ADMIN_SHARED_SHOP_VALUE,
  DRAWER_FORM_ID_MAP
} = window.StaffDashboardState.constants;


function wireLatLngPaste(inputEl, latEl, lngEl) {
  staffFormUtils.wireLatLngPaste(inputEl, latEl, lngEl, { showToast });
}

function selectInitialStaffView() {
  staffNavigation.selectInitialStaffView({ switchView });
}

function switchView(viewId, opts = {}) {
  staffNavigation.switchView(viewId, {
    ...opts,
    lazyLoad: {
      loadBillingDashboard,
      loadShopManagement,
      loadPlanManagement,
      loadProducts,
      loadRedemptions,
      loadIssuedCoupons,
      loadPosHistory,
      loadUsers
    }
  });
}

function ensureRewardShopIframe() {
  staffNavigation.ensureRewardShopIframe();
}

staffNavigation.wireSidebarNavigation({ switchView });
