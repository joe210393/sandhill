(function attachSandhillDom(global) {
  function showToast(msg, type = 'success') {
    const toast = global.document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast toast-${type} show`;
    global.setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function escHtml(str) {
    const element = global.document.createElement('div');
    element.textContent = str || '';
    return element.innerHTML;
  }

  function setInlineMessage(elOrId, message = '', type = 'error') {
    const element = typeof elOrId === 'string' ? global.document.getElementById(elOrId) : elOrId;
    if (!element) return;
    element.textContent = message;
    element.className = `inline-form-msg${message ? ` ${type}` : ''}`;
  }

  global.SandhillDom = {
    showToast,
    escHtml,
    setInlineMessage
  };

  global.showToast = global.showToast || showToast;
  global.escHtml = global.escHtml || escHtml;
  global.setInlineMessage = global.setInlineMessage || setInlineMessage;
})(window);
