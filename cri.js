/* CRI Lab — CIE 13.3-1995 core, shared by the browser and node tests.
   Depends on data.js which defines globalThis.CRI_DATA. */
(function (root) {
  const D = root.CRI_DATA;
  const WL = D.wl, N = WL.length, DL = 5;

  /* ---------- 光谱基函数 ---------- */
  function planck(T) {
    const out = new Array(N);
    for (let i = 0; i < N; i++) {
      const lm = WL[i] * 1e-9;
      out[i] = 1 / (Math.pow(lm, 5) * (Math.exp(1.4388e-2 / (lm * T)) - 1));
    }
    return out;
  }

  function cieD(T) {
    let x;
    if (T <= 7000) x = 0.244063 + 99.11 / T + 2.9678e6 / (T * T) - 4.6070e9 / (T * T * T);
    else x = 0.237040 + 247.48 / T + 1.9018e6 / (T * T) - 2.0064e9 / (T * T * T);
    const y = -3 * x * x + 2.87 * x - 0.275;
    const den = 0.0241 + 0.2562 * x - 0.7341 * y;
    const M1 = (-1.3515 - 1.7703 * x + 5.9114 * y) / den;
    const M2 = (0.0300 - 31.4424 * x + 30.0717 * y) / den;
    const s0 = D.d.s0, s1 = D.d.s1, s2 = D.d.s2, out = new Array(N);
    for (let i = 0; i < N; i++) out[i] = s0[i] + M1 * s1[i] + M2 * s2[i];
    return out;
  }

  /* ---------- 色度 ---------- */
  function kOf(s) {
    let y = 0;
    for (let i = 0; i < N; i++) y += s[i] * D.cmf.y[i] * DL;
    return 100 / y;
  }
  function xyzOf(s, k) {
    let X = 0, Y = 0, Z = 0;
    for (let i = 0; i < N; i++) {
      const v = s[i] * k * DL;
      X += v * D.cmf.x[i]; Y += v * D.cmf.y[i]; Z += v * D.cmf.z[i];
    }
    return [X, Y, Z];
  }
  function uvOf(XYZ) {
    const [X, Y, Z] = XYZ, d = X + 15 * Y + 3 * Z;
    return [4 * X / d, 6 * Y / d];
  }

  function cctDuv(s) {
    const target = uvOf(xyzOf(s, 1));
    let a = Math.log(1000), b = Math.log(100000);
    const gr = (Math.sqrt(5) - 1) / 2;
    const dist = (T) => {
      const uv = uvOf(xyzOf(planck(T), 1));
      return Math.hypot(uv[0] - target[0], uv[1] - target[1]);
    };
    let c = b - gr * (b - a), d = a + gr * (b - a);
    let fc = dist(Math.exp(c)), fd = dist(Math.exp(d));
    for (let i = 0; i < 80; i++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = dist(Math.exp(c)); }
      else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = dist(Math.exp(d)); }
    }
    const T = Math.exp((a + b) / 2);
    const uvP = uvOf(xyzOf(planck(T), 1));
    let duv = Math.hypot(target[0] - uvP[0], target[1] - uvP[1]);
    if (target[1] < uvP[1]) duv = -duv;
    return [T, duv];
  }

  /* ---------- CRI ---------- */
  function cri(spd) {
    const kt = kOf(spd);
    const XYZt = xyzOf(spd, kt);
    const uvt = uvOf(XYZt);
    const [T, duv] = cctDuv(spd);
    const Tc = Math.min(Math.max(T, 1000), 25000);
    const isPlanck = T < 5000;
    const ref = isPlanck ? planck(Tc) : cieD(Tc);
    const kr = kOf(ref);
    const XYZr = xyzOf(ref, kr);
    const uvr = uvOf(XYZr);

    const cd = (u, v) => [(4 - u - 10 * v) / v, (1.708 * v + 0.404 - 1.481 * u) / v];
    const [ct_, dt_] = cd(uvt[0], uvt[1]);
    const [cr, dr] = cd(uvr[0], uvr[1]);
    const cc = cr / ct_, dd = dr / dt_;

    const samples = [], dE = [], xy = [], XYZtest = [], XYZref = [];
    for (let i = 0; i < 14; i++) {
      const rho = D.tcs[i];
      const st = new Array(N), sr = new Array(N);
      for (let j = 0; j < N; j++) { st[j] = spd[j] * rho[j]; sr[j] = ref[j] * rho[j]; }
      const Xs = xyzOf(st, kt), Xr = xyzOf(sr, kr);
      const uvs = uvOf(Xs), uvr2 = uvOf(Xr);

      const Wr = 25 * Math.cbrt(Xr[1]) - 17;
      const Ur = 13 * Wr * (uvr2[0] - uvr[0]);
      const Vr = 13 * Wr * (uvr2[1] - uvr[1]);

      const [sc, sd] = cd(uvs[0], uvs[1]);
      const den = 16.518 + 1.481 * cc * sc - dd * sd;
      const u = (10.872 + 0.404 * cc * sc - 4 * dd * sd) / den;
      const v = 5.520 / den;
      const W = 25 * Math.cbrt(Xs[1]) - 17;
      const U = 13 * W * (u - uvr[0]);
      const V = 13 * W * (v - uvr[1]);

      const e = Math.hypot(U - Ur, V - Vr, W - Wr);
      dE.push(e);
      samples.push(100 - 4.6 * e);
      const sum = Xs[0] + Xs[1] + Xs[2];
      xy.push([Xs[0] / sum, Xs[1] / sum]);
      XYZtest.push(Xs); XYZref.push(Xr);
    }
    const Ra = samples.slice(0, 8).reduce((a, b) => a + b, 0) / 8;
    return {
      cct: T, duv, refKind: isPlanck ? 'Planckian' : 'CIE D',
      Ra, samples, dE, xy,
      whiteTest: XYZt, whiteRef: XYZr, XYZtest, XYZref, spd: spd
    };
  }

  /* ---------- 14 通道响应（示例矩阵：数据手册峰值/FWHM 的高斯模型） ---------- */
  const CHANNELS = [
    { id: 'F1', label: 'F1', peak: 407, fwhm: 28 },
    { id: 'F2', label: 'F2', peak: 424, fwhm: 29 },
    { id: 'FZ', label: 'FZ', peak: 450, fwhm: 67 },
    { id: 'F3', label: 'F3', peak: 473, fwhm: 38 },
    { id: 'F4', label: 'F4', peak: 516, fwhm: 48 },
    { id: 'F5', label: 'F5', peak: 546, fwhm: 44 },
    { id: 'FY', label: 'FY', peak: 560, fwhm: 123 },
    { id: 'FXL', label: 'FXL', peak: 596, fwhm: 93 },
    { id: 'F6', label: 'F6', peak: 636, fwhm: 58 },
    { id: 'F7', label: 'F7', peak: 687, fwhm: 63 },
    { id: 'F8', label: 'F8', peak: 748, fwhm: 77 },
    { id: 'NIR', label: 'NIR', peak: 855, fwhm: 61 },
    { id: 'VIS', label: 'VIS', peak: 555, fwhm: 170 }
  ];
  const NC = CHANNELS.length;
  const MATRIX = CHANNELS.map((c) => {
    const sigma = c.fwhm / 2.3548, row = new Array(N);
    for (let i = 0; i < N; i++) {
      const d = (WL[i] - c.peak) / sigma;
      row[i] = Math.exp(-0.5 * d * d);
    }
    return row;
  }); // MATRIX[ch][wl]

  function countsFromSpd(spd) {
    const n = new Array(NC).fill(0);
    for (let j = 0; j < NC; j++) {
      let s = 0;
      for (let i = 0; i < N; i++) s += MATRIX[j][i] * spd[i] * DL;
      n[j] = s;
    }
    const mx = Math.max(...n);
    return n.map((v) => v / mx);
  }

  /* ---------- NNLS (Lawson–Hanson) ---------- */
  function solveSPD(A, b) { // A: n x n symmetric positive definite
    const n = b.length, M = A.map((r) => r.slice()), x = b.slice();
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = M[i][j];
        for (let k = 0; k < j; k++) s -= M[i][k] * M[j][k];
        if (i === j) M[i][j] = Math.sqrt(s);
        else M[i][j] = s / M[j][j];
      }
    }
    for (let i = 0; i < n; i++) {
      let s = x[i];
      for (let k = 0; k < i; k++) s -= M[i][k] * x[k];
      x[i] = s / M[i][i];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let k = i + 1; k < n; k++) s -= M[k][i] * x[k];
      x[i] = s / M[i][i];
    }
    return x;
  }

  function lsq(A, b) { // A: m x n, b: m  ->  normal equations
    const m = A.length, n = A[0].length;
    const G = Array.from({ length: n }, () => new Array(n).fill(0));
    const rhs = new Array(n).fill(0);
    for (let k = 0; k < m; k++) {
      const row = A[k];
      for (let i = 0; i < n; i++) {
        rhs[i] += row[i] * b[k];
        for (let j = 0; j <= i; j++) G[i][j] += row[i] * row[j];
      }
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) G[i][j] = G[j][i];
    for (let i = 0; i < n; i++) G[i][i] += 1e-12;
    return solveSPD(G, rhs);
  }

  function nnls(A, b, maxIter = 400) {
    const m = A.length, n = A[0].length;
    const x = new Array(n).fill(0);
    const passive = new Array(n).fill(false);
    const AtA = Array.from({ length: n }, () => new Array(n).fill(0));
    const Atb = new Array(n).fill(0);
    for (let k = 0; k < m; k++) {
      const r = A[k];
      for (let i = 0; i < n; i++) {
        Atb[i] += r[i] * b[k];
        for (let j = 0; j <= i; j++) AtA[i][j] += r[i] * r[j];
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) AtA[i][j] = AtA[j][i];
      AtA[i][i] += 1e-12;
    }
    const grad = () => {
      const g = new Array(n);
      for (let i = 0; i < n; i++) {
        let s = Atb[i];
        for (let j = 0; j < n; j++) s -= AtA[i][j] * x[j];
        g[i] = s;
      }
      return g;
    };
    const tol = 1e-10 * Math.max(1, Math.max(...Atb.map(Math.abs)));
    for (let iter = 0; iter < maxIter; iter++) {
      const w = grad();
      let jMax = -1, best = tol;
      for (let j = 0; j < n; j++) if (!passive[j] && w[j] > best) { best = w[j]; jMax = j; }
      if (jMax < 0) break;
      passive[jMax] = true;
      for (let inner = 0; inner < 100; inner++) {
        const idx = [];
        for (let j = 0; j < n; j++) if (passive[j]) idx.push(j);
        const sub = Array.from({ length: m }, () => new Array(idx.length));
        for (let k = 0; k < m; k++) for (let t = 0; t < idx.length; t++) sub[k][t] = A[k][idx[t]];
        const z = lsq(sub, b);
        let ok = true;
        for (const v of z) if (v <= 0) { ok = false; break; }
        if (ok) { idx.forEach((j, t) => { x[j] = z[t]; }); break; }
        let alpha = Infinity;
        idx.forEach((j, t) => { if (z[t] <= 0) alpha = Math.min(alpha, x[j] / (x[j] - z[t])); });
        if (!isFinite(alpha)) alpha = 0;
        idx.forEach((j, t) => { x[j] = x[j] + alpha * (z[t] - x[j]); });
        idx.forEach((j) => { if (x[j] <= 1e-12) { x[j] = 0; passive[j] = false; } });
      }
    }
    return x;
  }

  /* ---------- 光谱重建：counts = B·Mᵀ·w，加二阶差分平滑先验 ---------- */
  function reconstruct(countsRaw, lambda = 0.35, smooth = 0) {
    const counts = countsRaw.slice();
    const rows = [], rhs = [];
    // 观测方程：13 个通道
    for (let k = 0; k < NC; k++) {
      const row = new Array(NC).fill(0);
      for (let j = 0; j < NC; j++) {
        let s = 0;
        for (let i = 0; i < N; i++) s += MATRIX[k][i] * MATRIX[j][i] * DL;
        row[j] = s;
      }
      rows.push(row); rhs.push(counts[k]);
    }
    // 平滑先验：D2 · Mᵀ
    const w2 = lambda * 2.0;
    for (let i = 1; i < N - 1; i++) {
      const row = new Array(NC).fill(0);
      for (let j = 0; j < NC; j++) {
        row[j] = w2 * (MATRIX[j][i - 1] - 2 * MATRIX[j][i] + MATRIX[j][i + 1]);
      }
      rows.push(row); rhs.push(0);
    }
    const w = nnls(rows, rhs);
    let spd = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = 0; j < NC; j++) s += MATRIX[j][i] * w[j];
      spd[i] = Math.max(0, s);
    }
    if (smooth > 0) {
      const k = [-3, 12, 17, 12, -3].map((v) => v / 35);
      const sm = spd.slice();
      for (let i = 2; i < N - 2; i++) {
        let s = 0;
        for (let t = -2; t <= 2; t++) s += k[t + 2] * spd[i + t];
        sm[i] = spd[i] * (1 - smooth) + s * smooth;
      }
      spd = sm;
    }
    const mx = Math.max(...spd, 1e-9);
    const spdN = spd.map((v) => v / mx);
    // 残差：把预测 counts 按最小二乘缩放后与实测比较
    const pred = new Array(NC).fill(0);
    for (let k = 0; k < NC; k++) {
      for (let i = 0; i < N; i++) pred[k] += MATRIX[k][i] * spdN[i] * DL;
    }
    let dot = 0, pp = 0;
    for (let k = 0; k < NC; k++) { dot += pred[k] * counts[k]; pp += pred[k] * pred[k]; }
    const sc = pp > 0 ? dot / pp : 1;
    let num = 0, den = 0;
    for (let k = 0; k < NC; k++) {
      num += (pred[k] * sc - counts[k]) ** 2;
      den += counts[k] ** 2;
    }
    return { spd: spdN, residual: Math.sqrt(num / Math.max(den, 1e-12)) };
  }

  /* ---------- 颜色：XYZ -> sRGB（Bradford 适应到 D65） ---------- */
  const BRAD = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
  const BRADINV = [[0.9869929, -0.1470543, 0.1599627], [0.4323053, 0.5183603, 0.0492912], [-0.0085287, 0.0400428, 0.9684867]];
  const M_SRGB = [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]];

  function mul(M, v) { return M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]); }

  function adaptToD65(XYZ, white) {
    const D65 = [95.047, 100.0, 108.883];
    const src = mul(BRAD, white), dst = mul(BRAD, D65), lms = mul(BRAD, XYZ);
    const out = [lms[0] * dst[0] / src[0], lms[1] * dst[1] / src[1], lms[2] * dst[2] / src[2]];
    return mul(BRADINV, out);
  }

  function srgb(XYZ) {
    const lin = mul(M_SRGB, XYZ).map((v) => v / 100);
    const enc = lin.map((v) => {
      v = Math.max(0, Math.min(1, v));
      return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    });
    const hex = enc.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    return '#' + hex;
  }

  function swatchHex(XYZ, white, lumScale) {
    const xyz = adaptToD65([XYZ[0] * lumScale, XYZ[1] * lumScale, XYZ[2] * lumScale], white);
    return srgb(xyz);
  }

  function specColor(lam) {
    const i = Math.max(0, Math.min(N - 1.001, (lam - 380) / 5));
    const i0 = Math.floor(i), t = i - i0;
    const lerp = (a) => a[i0] * (1 - t) + a[i0 + 1] * t;
    let X = lerp(D.cmf.x), Y = lerp(D.cmf.y), Z = lerp(D.cmf.z);
    const m = Math.max(X, Y, Z, 1e-6);
    X /= m; Y /= m; Z /= m;
    const lin = mul(M_SRGB, [X * 100, Y * 100, Z * 100]).map((v) => v / 100);
    const enc = lin.map((v) => {
      v = Math.max(0, Math.min(1, v * 0.92 + 0.08));
      return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    });
    return 'rgb(' + enc.map((v) => Math.round(v * 255)).join(',') + ')';
  }

  root.CRIMath = {
    WL, N, DL, CHANNELS, MATRIX, NC, data: D, specColor,
    planck, cieD, kOf, xyzOf, uvOf, cctDuv, cri,
    countsFromSpd, reconstruct, nnls, swatchHex, adaptToD65
  };
})(typeof window !== 'undefined' ? window : globalThis);
