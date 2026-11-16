/* CRI Lab server — static files + single-secret auth + magpie vision OCR.
   No database, no image storage: uploads are parsed in memory and dropped. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const PUBLIC_DIR = path.join(__dirname, 'public');
const APP_SECRET = process.env.APP_SECRET || '';
const MAGPIE_BASE = (process.env.MAGPIE_BASE_URL || 'https://magpie.answer42.xyz/v1').replace(/\/+$/, '');
const MAGPIE_KEY = (process.env.MAGPIE_API_KEY || '').replace(/^Bearer\s+/i, '').trim();
const MAGPIE_MODEL = process.env.MAGPIE_MODEL || 'group/never-stuck';
const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB || 6);
const MAX_BODY = Math.ceil(MAX_IMAGE_MB * 1.4 * 1024 * 1024) + 65536;
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 90000);

if (!APP_SECRET) console.warn('[cri] APP_SECRET is empty: every login will be rejected');
if (!MAGPIE_KEY) console.warn('[cri] MAGPIE_API_KEY is empty: /api/ocr will fail');

/* ---------------- auth (stateless cookie) ---------------- */
const TOKEN = crypto.createHmac('sha256', APP_SECRET || 'unset').update('cri-lab-v1').digest();
const COOKIE = 'cri_session';

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function authed(req) {
  if (!APP_SECRET) return false;
  const raw = parseCookies(req.headers.cookie)[COOKIE];
  if (!raw) return false;
  const buf = Buffer.from(raw, 'hex');
  return buf.length === TOKEN.length && crypto.timingSafeEqual(buf, TOKEN);
}

function checkSecret(input) {
  if (!APP_SECRET || typeof input !== 'string' || !input) return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(APP_SECRET).digest();
  return crypto.timingSafeEqual(a, b);
}

function cookieHeader(req) {
  const secure = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  return `${COOKIE}=${TOKEN.toString('hex')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}` +
    (secure ? '; Secure' : '');
}

/* ---------------- static files ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};
const PUBLIC_FILES = new Set(['/login.html', '/login.js', '/style.css']);

function sendFile(res, rel, cache) {
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found');
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': cache || 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  });
}

function send(res, code, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': buf.length, ...headers });
  res.end(buf);
}

function sendJson(res, code, obj, headers = {}) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length, ...headers });
  res.end(buf);
}

/* ---------------- body helpers ---------------- */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req, limit) {
  const text = await readBody(req, limit || 64 * 1024);
  if (!text) return {};
  return JSON.parse(text);
}

/* ---------------- rate limit (in memory) ---------------- */
const hits = new Map();
function rateLimited(ip, max = 15, windowMs = 60 * 1000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

/* ---------------- OCR ---------------- */
const PROMPT = `You are reading a photo of a spectrometer / light-meter screen that shows a spectral curve
(intensity versus wavelength). Digitize the plotted curve.

Reply with ONLY minified JSON, no markdown fences, no commentary:
{"ok":true,"x_min":380,"x_max":900,"summary":"<one short sentence: what light source this looks like>","points":[[380,0.12],[420,0.55],...]}
Rules:
- ~20-25 points, ascending wavelength, covering the whole plotted x axis
- values are relative intensity normalized so the highest point is 1.0
- use the axis' own wavelength unit (nm) and read x_min / x_max from the axis labels
- ignore grid lines, the rainbow color strip and UI text; follow the curve itself
- if there is no spectrum curve in the image, reply {"ok":false,"reason":"<short reason>"}`;

function stripFences(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return t;
}

function validatePoints(raw) {
  if (!raw || raw.ok === false) throw new Error(raw && raw.reason ? String(raw.reason).slice(0, 200) : '模型没有找到光谱曲线');
  const pts = Array.isArray(raw.points) ? raw.points : [];
  const clean = pts
    .map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p && p.wl), Number(p && p.v)]))
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 200 && x <= 2000)
    .sort((a, b) => a[0] - b[0]);
  if (clean.length < 5) throw new Error('模型返回的点太少，无法重建曲线');
  const max = Math.max(...clean.map((p) => p[1]));
  if (!(max > 0)) throw new Error('模型返回的强度全为 0');
  return clean.map(([x, y]) => [Math.round(x * 10) / 10, Math.max(0, Math.round((y / max) * 1000) / 1000)]);
}

async function ocrWithMagpie(dataUrl) {
  if (!MAGPIE_KEY) throw new Error('server missing MAGPIE_API_KEY');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  const started = Date.now();
  try {
    const resp = await fetch(`${MAGPIE_BASE}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${MAGPIE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MAGPIE_MODEL,
        temperature: 0,
        max_tokens: 900,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }]
      })
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`magpie ${resp.status}: ${text.slice(0, 240)}`);
    const payload = JSON.parse(text);
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(stripFences(content));
    const points = validatePoints(parsed);
    return {
      points,
      x_min: Number(parsed.x_min) || points[0][0],
      x_max: Number(parsed.x_max) || points[points.length - 1][0],
      summary: String(parsed.summary || '').slice(0, 160),
      model: payload.model || MAGPIE_MODEL,
      ms: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- router ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname === '/healthz') return send(res, 200, 'ok');

    if (pathname === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress || '?';
      if (rateLimited(ip)) return sendJson(res, 429, { ok: false, error: '尝试太频繁，请稍后再试' });
      let body;
      try { body = await readJson(req); } catch { return sendJson(res, 400, { ok: false, error: 'bad json' }); }
      if (!checkSecret(body.secret)) {
        await new Promise((r) => setTimeout(r, 250));
        return sendJson(res, 401, { ok: false, error: '口令不对' });
      }
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req) });
    }

    if (pathname === '/api/me' && req.method === 'GET') {
      return sendJson(res, authed(req) ? 200 : 401, { ok: authed(req) });
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Max-Age=0` });
    }

    if (pathname === '/api/ocr' && req.method === 'POST') {
      if (!authed(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
      const ip = req.socket.remoteAddress || '?';
      if (rateLimited(ip, 12)) return sendJson(res, 429, { ok: false, error: '解析太频繁，请稍后再试' });
      let body;
      try { body = await readJson(req, MAX_BODY); } catch (e) {
        return sendJson(res, 413, { ok: false, error: '图片太大（上限 ' + MAX_IMAGE_MB + ' MB）' });
      }
      const image = String(body.image || '');
      const m = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,([A-Za-z0-9+/=]+)$/.exec(image);
      if (!m) return sendJson(res, 400, { ok: false, error: '请上传 PNG/JPEG/WebP 图片' });
      const bytes = Buffer.from(m[2], 'base64').length;
      if (bytes > MAX_IMAGE_MB * 1024 * 1024) {
        return sendJson(res, 413, { ok: false, error: `图片 ${(bytes / 1048576).toFixed(1)} MB，超过 ${MAX_IMAGE_MB} MB 上限` });
      }
      try {
        const result = await ocrWithMagpie(image);
        console.log(`[cri] ocr ok model=${result.model} pts=${result.points.length} bytes=${bytes} ms=${result.ms}`);
        return sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        console.log(`[cri] ocr fail: ${err.message}`);
        const msg = /abort/i.test(err.name || '') ? '解析超时，请重试' : String(err.message || err);
        return sendJson(res, 502, { ok: false, error: msg.slice(0, 300) });
      }
    }

    if (pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: 'not found' });

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');

    // 登录页及其资源不需要口令
    if (PUBLIC_FILES.has(pathname)) return sendFile(res, pathname.slice(1), 'no-cache');

    const logged = authed(req);
    if (!logged) {
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(302, { Location: '/login.html' });
        return res.end();
      }
      if (pathname === '/favicon.ico') return send(res, 204, '');
      res.writeHead(302, { Location: '/login.html' });
      return res.end();
    }

    if (pathname === '/' || pathname === '/index.html') return sendFile(res, 'index.html', 'no-cache');
    const rel = pathname.replace(/^\/+/, '');
    if (!rel || rel.includes('..')) return send(res, 404, 'not found');
    return sendFile(res, rel, rel.endsWith('.js') || rel.endsWith('.css') ? 'public, max-age=300' : 'no-cache');
  } catch (err) {
    console.error('[cri] unhandled', err);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[cri] listening on :${PORT}  model=${MAGPIE_MODEL}  magpie=${MAGPIE_BASE}`);
});
