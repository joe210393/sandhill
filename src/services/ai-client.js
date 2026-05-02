async function fetchAIWithRetry(url, init, { timeoutMs = 180000, maxRetries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const opts = { ...init, signal: controller.signal };
    try {
      const response = await fetch(url, opts);
      clearTimeout(timeoutId);
      if (response.ok) return response;

      const errText = await response.text();
      const isTransient =
        response.status === 502 ||
        response.status === 503 ||
        /channel\s*error|crashed|exit\s*code\s*null/i.test(errText);

      if (attempt < maxRetries && isTransient) {
        console.warn(`[AI] 暫時性錯誤 (${response.status})，2s 後重試 (${attempt + 1}/${maxRetries})...`, errText.slice(0, 200));
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      if (/channel\s*error/i.test(errText)) throw new Error('AI 連線中斷 (Channel Error)，請稍後再試');
      if (/crashed|exit\s*code\s*null/i.test(errText)) throw new Error('AI 模型暫時異常，請稍後再試');
      throw new Error(`AI 回應錯誤: ${response.status}. ${errText.slice(0, 150)}`);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error('AI 請求逾時，請稍後再試');
      if (attempt < maxRetries && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('fetch'))) {
        console.warn(`[AI] 連線錯誤，2s 後重試 (${attempt + 1}/${maxRetries})...`, err.message);
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error('AI 請求失敗');
}

function getAiConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const apiUrlRaw = env.AI_API_URL || (isProduction ? null : 'http://localhost:1234/v1');
  const model = env.AI_MODEL || (isProduction ? null : 'google/gemma-3-27b');
  const apiKey = env.AI_API_KEY || 'lm-studio';

  if (!apiUrlRaw) {
    throw new Error('AI_API_URL 未設定：請在部署環境設定 AI_API_URL / AI_API_KEY / AI_MODEL');
  }

  if (!model) {
    throw new Error('AI_MODEL 未設定：請在部署環境設定 AI_MODEL（例如：google/gemma-3-27b）');
  }

  const apiUrl = String(apiUrlRaw).replace(/\/$/, '');

  if (isProduction && /^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?(\/|$)/i.test(apiUrl)) {
    throw new Error('AI_API_URL 在 production 不能指向 localhost/127.0.0.1/::1，請改成可從 Zeabur 存取的公開 URL');
  }

  return { AI_API_URL: apiUrl, AI_MODEL: model, AI_API_KEY: apiKey };
}

module.exports = {
  fetchAIWithRetry,
  getAiConfig
};
