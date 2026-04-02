// const API_BASE = 'http://localhost:3001'; // 本地開發環境 - 生產環境使用相對路徑

document.getElementById('registerForm').onsubmit = async function(e) {
  e.preventDefault();
  const username = this.username.value.trim();
  if (!/^09[0-9]{8}$/.test(username)) {
    document.getElementById('registerMsg').textContent = '請輸入正確的手機門號';
    return;
  }
  const messageEl = document.getElementById('registerMsg');

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, role: 'user' })
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json() : null;

    if (!res.ok) {
      messageEl.textContent = data?.message || '伺服器暫時異常，請稍後再試';
      return;
    }

    if (data?.success) {
      window.location.href = '/login.html?username=' + encodeURIComponent(username);
      return;
    }

    messageEl.textContent = data?.message || '註冊失敗';
  } catch (error) {
    console.error('Register request failed:', error);
    messageEl.textContent = '目前無法連線到伺服器，請稍後再試';
  }
};
