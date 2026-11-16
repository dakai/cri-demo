/* login page: single secret -> cookie, then straight into the app */
(function () {
  const form = document.getElementById('form');
  const secret = document.getElementById('secret');
  const err = document.getElementById('err');
  const go = document.getElementById('go');

  // 已登录就直接进
  fetch('/api/me', { credentials: 'same-origin' })
    .then((r) => { if (r.ok) location.replace('/'); })
    .catch(() => {});

  function fail(msg) {
    err.textContent = msg;
    err.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const value = secret.value;
    if (!value) return fail('请输入口令');
    go.disabled = true;
    go.textContent = '验证中…';
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ secret: value })
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        location.replace('/');
        return;
      }
      fail(data.error || '口令不对');
    } catch (ex) {
      fail('网络错误，稍后再试');
    }
    go.disabled = false;
    go.textContent = '进入';
    secret.select();
  });
})();
