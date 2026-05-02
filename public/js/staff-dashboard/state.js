(function attachStaffDashboardState(global) {
  const state = {
    globalQuestChainsMap: {},
    globalShopsMap: {},
    globalEntryPlansMap: {},
    globalTaskRecords: [],
    globalBoardMaps: [],
    globalModelsMap: {},
    globalItemsMap: {},
    globalBgmLibraryMap: {},
    globalVideoLibraryMap: {},
    currentAssetStorageOverview: null,
    currentAssetShopFilter: '',
    currentAssetShopName: '',
    currentStructureMap: null,
    currentStructureSelection: null,
    taskWizardStep: 1,
    currentBillingDailyData: null,
    currentBillingDailyScope: 'platform',
    currentQuestChainId: null,
    currentQuestChainTitle: '',
    currentQuestChainMode: '',
    currentShopDetailId: '',
    activeFormId: null,
    currentQuestChainSearchTerm: '',
    questChainSearchBootstrapped: false
  };

  const constants = {
    TASK_WIZARD_TOTAL_STEPS: 4,
    ADMIN_SHARED_SHOP_VALUE: '__admin__',
    DRAWER_FORM_ID_MAP: {
      'form-quest-chain': 'questChainForm',
      'form-board-map': 'boardMapForm',
      'form-task': 'taskForm',
      'form-tile': 'tileForm',
      'form-item': 'itemForm',
      'form-bgm-asset': 'bgmAssetForm',
      'form-video-asset': 'videoAssetForm',
      'form-asset': 'assetForm',
      'form-npc': 'npcForm',
      'form-product': 'productForm',
      'form-import-users': 'importUsersForm',
      'form-shop': 'shopForm',
      'form-plan': 'planForm'
    }
  };

  global.StaffDashboardState = {
    state,
    constants
  };

  // Classic view scripts (forms.js, quest-chains.js, …) expect these as bare globals — not only via StaffDashboardState.constants.
  global.ADMIN_SHARED_SHOP_VALUE = constants.ADMIN_SHARED_SHOP_VALUE;
  global.TASK_WIZARD_TOTAL_STEPS = constants.TASK_WIZARD_TOTAL_STEPS;
  global.DRAWER_FORM_ID_MAP = constants.DRAWER_FORM_ID_MAP;

  Object.keys(state).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(global, key)) return;
    Object.defineProperty(global, key, {
      configurable: true,
      enumerable: true,
      get() {
        return state[key];
      },
      set(value) {
        state[key] = value;
      }
    });
  });
})(window);
