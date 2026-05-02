(function attachSandhillApi(global) {
  const nativeFetch = global.fetch.bind(global);

  function getLoginUser() {
    return global.loginUser || JSON.parse(global.localStorage.getItem('loginUser') || 'null');
  }

  function withActorHeaders(extra = {}) {
    const loginUser = getLoginUser();
    return loginUser?.username && !extra['x-username']
      ? { ...extra, 'x-username': loginUser.username }
      : extra;
  }

  function installStaffFetchPatch() {
    if (global.__sandhillStaffFetchPatched) return;
    global.__sandhillStaffFetchPatched = true;
    global.fetch = async function patchedStaffFetch(input, options = {}) {
      const mergedOptions = {
        credentials: 'same-origin',
        ...options,
        headers: withActorHeaders(options.headers || {})
      };

      try {
        const res = await nativeFetch(input, mergedOptions);
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json') || res.status === 204) {
          return res;
        }

        const text = await res.text();
        const message =
          res.status === 401 ? '登入已失效，請重新登入' :
          res.status === 502 ? '伺服器暫時無法回應（Bad Gateway），請稍後再試' :
          (text || `HTTP ${res.status}`);

        return new Response(JSON.stringify({ success: false, message }), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          message: '網路連線失敗，請稍後再試'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    };
  }

  async function apiJson(url, options = {}) {
    const res = await global.fetch(url, options);
    let data = null;
    try {
      data = await res.json();
    } catch (error) {
      throw new Error('伺服器回應格式異常');
    }

    if (res.status === 401) {
      global.localStorage.removeItem('loginUser');
      global.location.href = '/login.html';
      throw new Error(data?.message || '登入已失效，請重新登入');
    }

    return data;
  }

  global.SandhillApi = {
    nativeFetch,
    getLoginUser,
    withActorHeaders,
    installStaffFetchPatch,
    apiJson
  };
})(window);
