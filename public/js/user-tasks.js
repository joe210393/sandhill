document.addEventListener('DOMContentLoaded', () => {
  // 使用全局的 window.loginUser
  if (!window.loginUser || !window.loginUser.username) {
    document.getElementById('userProgressSection').style.display = '';
    document.getElementById('userTasks').innerHTML = '<li>請先登入</li>';
    return;
  }

  // const API_BASE = 'http://localhost:3001'; // 本地開發環境 - 生產環境使用相對路徑
  const API_BASE = '';

  if (window.loginUser.role === 'shop' || window.loginUser.role === 'admin' || window.loginUser.role === 'staff') {
    document.getElementById('staffReviewSection').style.display = '';
    document.getElementById('userProgressSection').style.display = 'none';

    const staffCardGrid = document.getElementById('staffCardGrid');
    const staffPagination = document.getElementById('staffPagination');
    const staffResultCount = document.getElementById('staffResultCount');
    if (staffResultCount) staffResultCount.textContent = '自動判定模式已啟用';
    if (staffPagination) staffPagination.innerHTML = '';
    if (staffCardGrid) {
      staffCardGrid.innerHTML = `<div class="review-card empty-state" style="text-align:center;">
        <h3>平台已改為 AI / 系統自動判定</h3>
        <p style="color:var(--text-secondary);margin:0 0 12px;">新的關卡不再需要人工介入，玩家提交後會由 AI 或系統規則直接完成判定。</p>
        <a class="btn btn-primary" href="/staff-dashboard.html#quests" style="display:inline-block;">回內容控制台</a>
      </div>`;
    }
    const searchForm = document.getElementById('searchForm');
    if (searchForm) searchForm.style.display = 'none';
  } else {
    document.getElementById('userProgressSection').style.display = '';
    document.getElementById('staffReviewSection').style.display = 'none';
    fetch(`${API_BASE}/api/user-tasks/all?username=${encodeURIComponent(window.loginUser.username)}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) return;
        const ul = document.getElementById('userTasks');
        if (data.tasks.length === 0) {
          ul.innerHTML = '<li>目前沒有任何任務紀錄</li>';
          return;
        }
        data.tasks.forEach(task => {
          const li = document.createElement('li');
          const { markup: answerBlock } = buildAnswerMarkup(task, {
            textLabel: '猜謎 / 答案：',
            photoLabel: '我上傳的照片：',
            showPlaceholder: true
          });
          li.innerHTML = `
            <strong>${task.name}</strong> <span style="color:${task.status==='完成'?'green':'orange'};">${task.status}</span><br>
            <img src="${task.photoUrl}" alt="任務照片" style="max-width:120px;max-height:80px;"> <br>
            ${task.description}<br>
            ${answerBlock}
            開始：${toTWTime(task.started_at)}<br>
            完成：${toTWTime(task.finished_at)}<br>
            <b>RANK：</b>${task.rank || '-'}<br>
            <b>獲得積分：</b>${task.points || 0}<br>
            <a href="/task-detail.html?id=${task.id}">前往任務說明</a><br>
            <div style='margin:12px 0;'>
              <textarea id="answer_${task.user_task_id}" rows="3" style="width:90%;max-width:400px;border-radius:6px;padding:8px;" placeholder="若此題有猜謎，請在此輸入答案" ${task.status === '完成' ? 'disabled' : ''}>${task.answer || ''}</textarea>
              ${task.status === '完成'
                ? '<span style="margin-left:8px;color:#28a745;font-weight:bold;">答案已提交完成</span>'
                : `<button class="submitAnswerBtn" data-id="${task.user_task_id}" style="margin-left:8px;">送出答案</button>
                   <span class="answerMsg" id="msg_${task.user_task_id}" style="margin-left:8px;color:#007bff;"></span>`
              }
            </div>
          `;
          ul.appendChild(li);
        });
        ul.querySelectorAll('.submitAnswerBtn').forEach(btn => {
          btn.onclick = async function() {
            const id = this.dataset.id;
            const textarea = document.getElementById('answer_' + id);
            const msg = document.getElementById('msg_' + id);
            const answer = textarea.value.trim();
            if (!answer) { msg.textContent = '請輸入答案'; return; }
            msg.textContent = '儲存中...';
            const res = await fetch(`${API_BASE}/api/user-tasks/${id}/answer`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ answer })
            });
            const data = await res.json();
            if (data.success) msg.textContent = '答案已儲存';
            else msg.textContent = data.message || '儲存失敗';
          };
        });
      });
  }
});

function buildAnswerMarkup(task, options = {}) {
  const answerRaw = (task && typeof task.answer === 'string') ? task.answer.trim() : '';
  const hasAnswer = !!answerRaw;
  const isPhoto = hasAnswer && isPhotoAnswer(task?.task_type, answerRaw);
  const textLabel = options.textLabel || '答案：';
  const photoLabel = options.photoLabel || '上傳照片：';

  if (!hasAnswer) {
    const placeholder = options.showPlaceholder
      ? `<span style='color:#c00;'>（尚未提交）</span>`
      : `<span style='color:#c00;'>（尚未填寫）</span>`;
    return {
      markup: `<div style='margin:6px 0;'><b style='color:#7c3aed;'>${textLabel}</b>${placeholder}</div>`,
      hasAnswer: false
    };
  }

  if (isPhoto) {
    const safeUrl = escapeHTML(answerRaw);
    return {
      markup: `
        <div style="margin:8px 0;">
          <b style="color:#7c3aed;display:block;margin-bottom:4px;">${photoLabel}</b>
          <div style="border:1px solid #e5e7eb;padding:6px;border-radius:8px;max-width:260px;background:#f9fafb;">
            <img src="${safeUrl}" alt="使用者上傳照片" style="width:100%;max-height:240px;object-fit:contain;border-radius:6px;" onerror="this.src='/images/mascot.png'">
            <div style="text-align:right;margin-top:4px;">
              <a href="${safeUrl}" target="_blank" style="color:#6366f1;font-size:0.9rem;">在新視窗開啟原圖</a>
            </div>
          </div>
        </div>
      `,
      hasAnswer: true
    };
  }

  return {
    markup: `<b style='color:#7c3aed;'>${textLabel}</b><span style='background:#f3f3ff;padding:4px 8px;border-radius:6px;'>${escapeHTML(answerRaw)}</span><br>`,
    hasAnswer: true
  };
}

function isPhotoAnswer(taskType, answer) {
  if (!answer) return false;
  if (taskType === 'photo') return true;
  const normalized = answer.toLowerCase();
  if (normalized.startsWith('data:image/')) return true;
  if (normalized.startsWith('/images/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|heic)(\?|$)/i.test(normalized);
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toTWTime(str) {
  if (!str) return '-';
  const d = new Date(str);
  d.setHours(d.getHours() + 8);
  return d.toISOString().replace('T',' ').slice(0,19);
} 
