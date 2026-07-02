(function (global) {
  function buildFriendlyNetworkError(actionLabel = '連線') {
    return new Error(`冒險艙目前無法完成「${actionLabel}」。請確認網路或稍後再試。`);
  }

  async function requestJson(url, options = {}, actionLabel = '請求資料') {
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      throw buildFriendlyNetworkError(actionLabel);
    }

    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      if (!res.ok) {
        throw new Error(`冒險艙在「${actionLabel}」時收到異常回應。`);
      }
      return null;
    }

    if (!res.ok) {
      throw new Error(data?.message || `冒險艙在「${actionLabel}」時失敗。`);
    }

    return data;
  }

  global.AiLabNetwork = {
    buildFriendlyNetworkError,
    requestJson
  };
})(window);
