/* CRI Lab — UI layer */
(function () {
  const M = window.CRIMath;
  const WL = M.WL, N = M.N;
  const $ = (s) => document.querySelector(s);

  const gauss = (l, p, f) => Math.exp(-0.5 * Math.pow((l - p) / (f / 2.3548), 2));
  const normArr = (a) => { const m = Math.max(...a, 1e-9); return a.map((v) => v / m); };

  /* ---------- 预设光谱 ---------- */
  const PRESETS = {
    led: () => normArr(WL.map((l) => 1.25 * gauss(l, 452, 18) + 1.05 * gauss(l, 558, 140) + 0.7 * gauss(l, 625, 70))),
    p2700: () => normArr(M.planck(2700)),
    p4000: () => normArr(M.planck(4000)),
    d65: () => normArr(M.cieD(6504)),
    fl2: () => [0.034,0.042,0.053,0.061,0.098,0.449,0.110,0.107,0.120,0.132,0.145,1.000,0.338,0.179,0.190,0.198,0.206,0.212,0.216,0.218,0.219,0.218,0.218,0.213,0.208,0.204,0.202,0.201,0.205,0.214,0.230,0.254,0.286,0.711,0.476,0.417,0.462,0.502,0.532,0.614,0.652,0.551,0.533,0.507,0.473,0.435,0.395,0.353,0.313,0.276,0.240,0.209,0.180,0.155,0.134,0.115,0.099,0.085,0.073,0.063,0.054,0.047,0.044,0.036,0.031,0.028,0.025,0.022,0.019,0.017,0.016,0.015,0.015,0.013,0.013,0.012,0.013,0.013,0.011,0.009,0.008],
    rgb: () => normArr(WL.map((l) => 1.0 * gauss(l, 450, 18) + 0.9 * gauss(l, 532, 22) + 0.8 * gauss(l, 630, 22))),
    photo: () => [0.148,0.148,0.218,0.290,0.348,0.390,0.423,0.455,0.499,0.562,0.642,0.728,0.800,0.844,0.854,0.838,0.814,0.790,0.777,0.773,0.779,0.786,0.796,0.807,0.821,0.837,0.851,0.865,0.880,0.900,0.921,0.942,0.962,0.980,0.994,1.000,0.996,0.982,0.961,0.931,0.899,0.866,0.838,0.814,0.789,0.766,0.742,0.723,0.706,0.693,0.685,0.676,0.669,0.663,0.658,0.654,0.651,0.648,0.645,0.642,0.637,0.625,0.604,0.573,0.532,0.483,0.430,0.375,0.320,0.272,0.230,0.200,0.183,0.177,0.177,0.183,0.192,0.206,0.221,0.241,0.241]
  };

  const state = {
    mode: 'spd',
    spd: PRESETS.led(),
    counts: null,
    residual: null,
    res: null,
    hover: null
  };

  /* ================= 画布 ================= */
  const cv = $('#chart');
  const ctx = cv.getContext('2d');
  const tip = $('#hover-tip');
  const PAD = { l: 44, r: 14, t: 14, b: 30 };
  const YMAX = 1.06;
  let W = 0, H = 0, DPR = 1;

  const xOf = (l) => PAD.l + ((l - 380) / 400) * (W - PAD.l - PAD.r);
  const yOf = (v) => H - PAD.b - (v / YMAX) * (H - PAD.t - PAD.b);
  const lamOf = (px) => 380 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * 400;
  const valOf = (py) => ((H - PAD.b - py) / (H - PAD.t - PAD.b)) * YMAX;

  function resizeCanvas() {
    const rect = cv.getBoundingClientRect();
    if (!rect.width) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    draw();
  }

  function draw() {
    if (!W) return;
    ctx.clearRect(0, 0, W, H);

    // 网格
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(70,95,120,.22)';
    ctx.fillStyle = '#5e7387';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const y = yOf(v);
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
      ctx.fillText(v.toFixed(2), PAD.l - 7, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let l = 400; l <= 750; l += 50) {
      const x = xOf(l);
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, H - PAD.b); ctx.stroke();
      ctx.fillText(String(l), x, H - PAD.b + 11);
    }

    // 波长色带
    const y0 = H - PAD.b + 1;
    const stepPx = 2;
    for (let x = PAD.l; x < W - PAD.r; x += stepPx) {
      ctx.fillStyle = M.specColor(lamOf(x));
      ctx.fillRect(x, y0, stepPx, 4);
    }

    // 面积
    const grad = ctx.createLinearGradient(0, PAD.t, 0, H - PAD.b);
    grad.addColorStop(0, 'rgba(92,200,255,.26)');
    grad.addColorStop(1, 'rgba(92,200,255,.015)');
    ctx.beginPath();
    ctx.moveTo(xOf(380), yOf(0));
    for (let i = 0; i < N; i++) ctx.lineTo(xOf(WL[i]), yOf(state.spd[i]));
    ctx.lineTo(xOf(780), yOf(0));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 曲线
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = xOf(WL[i]), y = yOf(state.spd[i]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = '#8fe0ff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 采样点
    if (W > 640) {
      ctx.fillStyle = 'rgba(180,225,250,.55)';
      for (let i = 0; i < N; i++) {
        ctx.beginPath();
        ctx.arc(xOf(WL[i]), yOf(state.spd[i]), 1.3, 0, 7);
        ctx.fill();
      }
    }

    // hover
    if (state.hover) {
      const { x } = state.hover;
      ctx.strokeStyle = 'rgba(167,139,250,.6)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, H - PAD.b); ctx.stroke();
      ctx.setLineDash([]);
      const lam = lamOf(x);
      const idx = Math.max(0, Math.min(N - 1, Math.round((lam - 380) / 5)));
      ctx.beginPath();
      ctx.arc(xOf(WL[idx]), yOf(state.spd[idx]), 3.2, 0, 7);
      ctx.fillStyle = '#c9b8ff';
      ctx.fill();
    }
  }

  /* ================= 交互 ================= */
  let drag = null;          // { y: 上次指针 y, x: 上次指针 x }
  let rafPending = false;

  function schedule() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      compute();
      draw();
      render();
    });
  }

  const idxOfPx = (px) => Math.max(0, Math.min(N - 1, Math.round((lamOf(px) - 380) / 5)));

  function nearestCurveY(px) {
    const idx = idxOfPx(px);
    return yOf(state.spd[idx]);
  }

  function dragTo(px, py) {
    if (!drag) return;
    const dv = (-(py - drag.y) * YMAX) / Math.max(1, H - PAD.t - PAD.b);
    const idx = idxOfPx(px);
    const w = [0.25, 0.6, 1, 0.6, 0.25];
    for (let d = -2; d <= 2; d++) {
      const j = idx + d;
      if (j < 0 || j >= N) continue;
      state.spd[j] = Math.max(0, Math.min(1.12, state.spd[j] + dv * w[d + 2]));
    }
    drag.y = py;
    drag.x = px;
    schedule();
  }

  function localXY(e) {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  cv.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'spd') return;
    const [x, y] = localXY(e);
    if (Math.abs(y - nearestCurveY(x)) > 36) return;   // 只有抓到曲线才开始拖
    drag = { y, x };
    cv.setPointerCapture(e.pointerId);
    cv.style.cursor = 'grabbing';
  });

  cv.addEventListener('pointermove', (e) => {
    const [x, y] = localXY(e);
    state.hover = { x };
    const lam = lamOf(x);
    if (lam >= 379 && lam <= 781) {
      const idx = idxOfPx(x);
      tip.classList.add('on');
      tip.style.left = x + 'px';
      tip.style.top = Math.max(28, y) + 'px';
      tip.textContent = WL[idx] + ' nm · ' + state.spd[idx].toFixed(3);
    } else {
      tip.classList.remove('on');
    }
    if (drag) dragTo(x, y);
    else {
      cv.style.cursor = state.mode === 'spd' && Math.abs(y - nearestCurveY(x)) < 36 ? 'grab' : 'default';
      schedule();
    }
  });

  const stopPaint = () => { drag = null; cv.style.cursor = 'default'; };
  cv.addEventListener('pointerup', stopPaint);
  cv.addEventListener('pointercancel', stopPaint);
  cv.addEventListener('pointerleave', () => { stopPaint(); state.hover = null; tip.classList.remove('on'); schedule(); });

  /* ================= 计算 ================= */
  function compute() {
    const mx = Math.max(...state.spd);
    if (!(mx > 0)) return;
    state.res = M.cri(state.spd);
  }

  /* ================= 渲染 ================= */
  const el = {
    ra: $('#ra'), cct: $('#cct'), duv: $('#duv'), refkind: $('#refkind'),
    warn: $('#duv-warn'), swTest: $('#sw-test'), swRef: $('#sw-ref'),
    rlist: $('#rlist'), residual: $('#residual-pill'), hint: $('#hint')
  };

  const swEls = { test: [], ref: [] };
  const rowEls = [];

  function buildDom() {
    for (const key of ['test', 'ref']) {
      const host = key === 'test' ? el.swTest : el.swRef;
      for (let i = 0; i < 12; i++) {
        const cell = document.createElement('div');
        cell.className = 'swcell';
        const d = document.createElement('div');
        d.className = 'sw';
        const s = document.createElement('span');
        s.className = 'swlbl';
        s.textContent = 'R' + (i + 1);
        cell.append(d, s);
        host.appendChild(cell);
        swEls[key].push(d);
      }
    }
    for (let i = 0; i < 12; i++) {
      if (i === 8) {
        const sep = document.createElement('div');
        sep.className = 'rrow sep';
        el.rlist.appendChild(sep);
      }
      const row = document.createElement('div');
      row.className = 'rrow' + (i >= 8 ? ' special' : '');
      const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = 'R' + (i + 1);
      const bar = document.createElement('div'); bar.className = 'bar';
      const fill = document.createElement('i');
      bar.appendChild(fill);
      const val = document.createElement('span'); val.className = 'val';
      const de = document.createElement('span'); de.className = 'de';
      row.append(lbl, bar, val, de);
      el.rlist.appendChild(row);
      rowEls.push({ fill, val, de });
    }
  }

  function colorFor(v) {
    if (v < 0) return 'linear-gradient(90deg,#7a2b2b,#e05c5c)';
    if (v < 60) return 'linear-gradient(90deg,#8a5a12,#f0a63c)';
    if (v < 80) return 'linear-gradient(90deg,#2b6f5a,#4ade80)';
    return 'linear-gradient(90deg,#2a7ea8,#5cc8ff)';
  }

  function render() {
    const r = state.res;
    if (!r) return;

    el.ra.textContent = r.Ra.toFixed(1);
    el.ra.className = 'ra-value' + (r.Ra < 60 ? ' bad' : r.Ra < 80 ? ' low' : '');
    el.cct.textContent = Math.round(r.cct).toLocaleString('en-US') + ' K';
    el.duv.textContent = (r.duv >= 0 ? '+' : '') + r.duv.toFixed(4);
    el.refkind.textContent = r.refKind + (r.refKind === 'CIE D' ? ' (日光)' : ' (黑体)');
    el.warn.hidden = Math.abs(r.duv) <= 0.0054;

    // 色块
    let maxY = 0;
    for (const X of r.XYZref) maxY = Math.max(maxY, X[1]);
    const scale = 72 / Math.max(maxY, 1e-6);
    for (let i = 0; i < 12; i++) {
      const t = M.swatchHex(r.XYZtest[i], r.whiteTest, scale);
      const f = M.swatchHex(r.XYZref[i], r.whiteRef, scale);
      swEls.test[i].style.background = t;
      swEls.ref[i].style.background = f;
      const dE = r.dE[i].toFixed(1);
      swEls.test[i].title = 'R' + (i + 1) + ' · ΔE = ' + dE;
    }

    // R 值
    for (let i = 0; i < 12; i++) {
      const v = r.samples[i];
      rowEls[i].val.textContent = v.toFixed(1);
      rowEls[i].de.textContent = 'ΔE ' + r.dE[i].toFixed(1);
      rowEls[i].fill.style.width = Math.max(0, Math.min(100, v)) + '%';
      rowEls[i].fill.style.background = colorFor(v);
      rowEls[i].val.style.color = v < 0 ? '#f08a8a' : v < 60 ? '#f0b45c' : '#d6e6f4';
    }

    if (state.residual != null && state.mode === 'counts') {
      el.residual.textContent = '重建残差 ' + (state.residual * 100).toFixed(1) + '%';
      el.residual.classList.toggle('warn', state.residual > 0.05);
    }
  }

  /* ================= counts 模式 ================= */
  const sliders = [];
  function buildSliders() {
    const host = $('#sliders');
    M.CHANNELS.forEach((ch, i) => {
      const row = document.createElement('div');
      row.className = 'slider';
      const lab = document.createElement('label');
      lab.textContent = ch.label;
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = '0'; inp.max = '1'; inp.step = '0.001'; inp.value = '0';
      const out = document.createElement('output');
      out.textContent = '0.000';
      inp.addEventListener('input', () => {
        state.counts[i] = parseFloat(inp.value);
        out.textContent = state.counts[i].toFixed(3);
        const rec = M.reconstruct(state.counts);
        state.spd = rec.spd;
        state.residual = rec.residual;
        schedule();
      });
      row.append(lab, inp, out);
      host.appendChild(row);
      sliders.push({ inp, out });
    });
  }

  function syncSliders() {
    state.counts.forEach((v, i) => {
      sliders[i].inp.value = v.toFixed(3);
      sliders[i].out.textContent = v.toFixed(3);
    });
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
    $('#counts-panel').hidden = mode !== 'counts';
    el.hint.textContent = mode === 'counts'
      ? '拖动滑杆改变 13 路通道计数，页面会用示例矩阵反解光谱后重算。'
      : '抓住曲线向上/向下拖动即可改写光谱；松手即完成计算。';
    if (mode === 'counts') {
      state.counts = M.countsFromSpd(state.spd);
      syncSliders();
      const rec = M.reconstruct(state.counts);
      state.spd = rec.spd;
      state.residual = rec.residual;
    } else {
      state.residual = null;
    }
    schedule();
  }

  /* ================= 导出 ================= */
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ================= AI 读图 ================= */
  const btnOcr = $('#btn-ocr');
  const fileInput = $('#file');
  const chartWrap = document.querySelector('.chart-wrap');

  function setHint(msg, cls) {
    el.hint.textContent = msg;
    el.hint.className = 'hint' + (cls ? ' ' + cls : '');
  }

  function spdFromPoints(points) {
    const out = new Array(N);
    const first = points[0], last = points[points.length - 1];
    for (let i = 0; i < N; i++) {
      const lam = WL[i];
      if (lam <= first[0]) out[i] = first[1];
      else if (lam >= last[0]) out[i] = last[1];
      else {
        let k = 0;
        while (k < points.length - 2 && points[k + 1][0] < lam) k++;
        const [x0, y0] = points[k], [x1, y1] = points[k + 1];
        const t = x1 > x0 ? (lam - x0) / (x1 - x0) : 0;
        out[i] = y0 + (y1 - y0) * t;
      }
    }
    const mx = Math.max(...out, 1e-9);
    return out.map((v) => Math.max(0, v / mx));
  }

  async function runOcr(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) return setHint('只支持图片文件（PNG / JPEG / WebP）', 'bad');
    if (file.size > 6 * 1024 * 1024) {
      return setHint(`图片 ${(file.size / 1048576).toFixed(1)} MB，超过 6 MB 上限`, 'bad');
    }
    let dataUrl;
    try {
      dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
    } catch (e) {
      return setHint('读不到这个文件', 'bad');
    }
    btnOcr.disabled = true;
    btnOcr.textContent = '解析中…';
    setHint('正在让 magpie 视觉模型读这张图…（不落盘，读完即弃）', 'busy');
    try {
      const r = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || ('HTTP ' + r.status));
      if (state.mode === 'counts') setMode('spd');
      state.spd = spdFromPoints(d.points);
      state.residual = null;
      compute(); draw(); render();
      const head = state.res ? 'Ra ' + state.res.Ra.toFixed(1) + ' · ' : '';
      setHint(`AI 描出 ${d.points.length} 个点 → ${head}${d.summary || ''}（${d.model}，${(d.ms / 1000).toFixed(1)}s，可直接拖动修正）`, 'good');
    } catch (e) {
      setHint('AI 读图失败：' + e.message, 'bad');
    } finally {
      btnOcr.disabled = false;
      btnOcr.innerHTML = '<span class="ocr-ico">◎</span> AI 读图';
      fileInput.value = '';
    }
  }

  btnOcr.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => runOcr(fileInput.files[0]));

  ['dragenter', 'dragover'].forEach((t) => chartWrap.addEventListener(t, (e) => {
    e.preventDefault();
    chartWrap.classList.add('dragover');
  }));
  ['dragleave', 'dragend'].forEach((t) => chartWrap.addEventListener(t, (e) => {
    e.preventDefault();
    chartWrap.classList.remove('dragover');
  }));
  chartWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    chartWrap.classList.remove('dragover');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) runOcr(f);
  });

  const logout = $('#logout');
  if (logout) logout.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await fetch('/api/logout', { method: 'POST' }); } catch (err) { /* ignore */ }
    location.href = '/login.html';
  });

  /* ================= 启动 ================= */
  window.__criState = state;  // debug hook

  buildDom();
  buildSliders();
  new ResizeObserver(resizeCanvas).observe(cv);
  window.addEventListener('resize', resizeCanvas);

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  const presetMap = { led: 'led', 2700: 'p2700', 4000: 'p4000', 6500: 'd65', fl2: 'fl2', rgb: 'rgb', photo: 'photo' };
  document.querySelectorAll('[data-preset]').forEach((b) => {
    b.addEventListener('click', () => {
      const key = presetMap[b.dataset.preset];
      state.spd = PRESETS[key]().slice();
      if (state.mode === 'counts') {
        state.counts = M.countsFromSpd(state.spd);
        syncSliders();
        const rec = M.reconstruct(state.counts);
        state.spd = rec.spd;
        state.residual = rec.residual;
      }
      schedule();
    });
  });

  $('#btn-reset').addEventListener('click', () => {
    state.spd = PRESETS.led().slice();
    state.residual = null;
    if (state.mode === 'counts') {
      state.counts = M.countsFromSpd(state.spd);
      syncSliders();
    }
    schedule();
  });

  $('#btn-smooth').addEventListener('click', () => {
    const s = state.spd.slice();
    for (let i = 1; i < N - 1; i++) state.spd[i] = (s[i - 1] + 2 * s[i] + s[i + 1]) / 4;
    schedule();
  });

  $('#btn-to-spd').addEventListener('click', () => setMode('spd'));

  $('#btn-csv').addEventListener('click', () => {
    const lines = ['wavelength_nm,value'];
    WL.forEach((l, i) => lines.push(l + ',' + state.spd[i].toFixed(5)));
    download('spd.csv', lines.join('\n') + '\n', 'text/csv;charset=utf-8');
  });

  $('#btn-json').addEventListener('click', () => {
    const r = state.res;
    const out = {
      CCT_K: Math.round(r.cct * 10) / 10,
      Duv: Math.round(r.duv * 10000) / 10000,
      reference: r.refKind,
      Ra: Math.round(r.Ra * 100) / 100,
      samples: Object.fromEntries(r.samples.slice(0, 12).map((v, i) => ['R' + (i + 1), Math.round(v * 10) / 10])),
      dE: Object.fromEntries(r.dE.slice(0, 12).map((v, i) => ['R' + (i + 1), Math.round(v * 1000) / 1000])),
      xy: Object.fromEntries(r.xy.slice(0, 12).map((v, i) => ['R' + (i + 1), [Math.round(v[0] * 1e4) / 1e4, Math.round(v[1] * 1e4) / 1e4]]))
    };
    download('cri-result.json', JSON.stringify(out, null, 2), 'application/json');
  });

  resizeCanvas();
  compute();
  render();
})();
