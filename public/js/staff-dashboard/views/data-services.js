function loadShops() {
  return apiJson(`${API_BASE}/api/shops`, {
    headers: withActorHeaders()
  }).then((data) => {
    globalShopsMap = {};
    (data.shops || []).forEach((shop) => {
      globalShopsMap[String(shop.id)] = shop;
    });
    populateQuestChainShopOptions();
    syncQuestChainCommercialFields();
    if (Object.keys(globalQuestChainsMap).length) {
      renderQuestChainList(applyQuestChainListFilters(Object.values(globalQuestChainsMap)));
    }
    renderShopList(Object.values(globalShopsMap));
  });
}

function loadEntryPlans() {
  const suffix = loginUser?.role === 'admin' ? '?include_inactive=1' : '';
  return apiJson(`${API_BASE}/api/entry-plans${suffix}`, {
    headers: withActorHeaders()
  }).then((data) => {
    globalEntryPlansMap = {};
    (data.plans || []).forEach((plan) => {
      globalEntryPlansMap[String(plan.id)] = plan;
    });
    populateQuestChainPlanOptions();
    syncQuestChainCommercialFields();
    if (Object.keys(globalQuestChainsMap).length) {
      renderQuestChainList(applyQuestChainListFilters(Object.values(globalQuestChainsMap)));
    }
    renderPlanList(Object.values(globalEntryPlansMap));
  });
}
