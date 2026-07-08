(function (global) {
  function buildFriendlyNetworkError(actionLabel = '連線') {
    return new Error(`冒險艙目前無法完成「${actionLabel}」。請確認網路或稍後再試。`);
  }

  async function requestJson(url, options = {}, actionLabel = '請求資料') {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 25000;
    const { timeoutMs: _ignored, ...fetchOptions } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, {
        credentials: 'include',
        ...fetchOptions,
        signal: controller.signal
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error(`冒險艙在「${actionLabel}」時等待過久，請確認網路後再試。`);
      }
      throw buildFriendlyNetworkError(actionLabel);
    } finally {
      clearTimeout(timeoutId);
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
