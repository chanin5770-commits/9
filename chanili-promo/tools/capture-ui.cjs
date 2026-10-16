#!/usr/bin/env node
/* Screen capture of the interactive tour (ovadia-11/index.html) as a visitor uses it:
 * drag to rotate, click "חזית קדמית", zoom in, open a point of interest, switch to night.
 * Only features that exist in the product are shown. 120 frames at 15 fps (8 s) into
 * chanili-promo/assets/ui/NNN.jpg, 1280×800. Resumes a partial capture.
 *   node chanili-promo/tools/capture-ui.cjs [path-to-local-three@0.160.0] */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '../..');
const OUT = path.join(root, 'chanili-promo/assets/ui');
const THREE_DIR = process.argv[2];
const N = 120;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const seg = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const lerp = (a, b, t) => a + (b - a) * t;
const L3 = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

// Camera choreography per frame: [position, target]
const T0 = [0, 7.5, 1.5];
const orbit = (a, r = 46, h = 15) => [Math.sin(a) * r, h, Math.cos(a) * r + 1.5];
const A_END = orbit(-0.12);
const FRONT = [[0, 8.5, 38], [0, 8.5, 4]], CLOSE = [[-1, 8.2, 21], [-1, 7.6, 7]], NIGHT = [[-10, 10, 32], [0, 7.5, 3]];
function cam(k) {
  if (k < 45) { const a = lerp(-0.8, -0.12, ease(seg(k, 0, 44))); return [orbit(a), T0]; }
  if (k < 66) { const t = ease(seg(k, 50, 65)); return [L3(A_END, FRONT[0], t), L3(T0, FRONT[1], t)]; }
  if (k < 98) { const t = ease(seg(k, 66, 80)); return [L3(FRONT[0], CLOSE[0], t), L3(FRONT[1], CLOSE[1], t)]; }
  const t = ease(seg(k, 104, 119)); return [L3(CLOSE[0], NIGHT[0], t), L3(CLOSE[1], NIGHT[1], t)];
}

server.listen(0, '127.0.0.1', async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  if (THREE_DIR) await page.route('**/*', (r) => {
    const u = r.request().url(); const m = u.match(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)$/);
    if (m) return r.fulfill({ path: path.join(THREE_DIR, m[1]), contentType: 'application/javascript' });
    if (u.includes('tailwindcss')) return r.fulfill({ body: '', contentType: 'application/javascript' });
    if (u.includes('fonts.g')) return r.fulfill({ body: '', contentType: 'text/css' });
    return r.continue();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/ovadia-11/index.html`);
  await page.waitForFunction(() => window.__app, null, { timeout: 120000 });
  await page.addStyleTag({ content: `#loader,#toast{display:none!important}
    #fake-cursor{position:fixed;left:0;top:0;z-index:99;pointer-events:none;width:30px;height:30px;transform-origin:3px 3px}
    #fake-ring{position:fixed;z-index:98;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid rgba(255,214,196,.95);opacity:0}` });
  await page.evaluate(() => {
    const c = document.createElement('div'); c.id = 'fake-cursor';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l16 11-7 1.4 4 7.3-3 1.6-4-7.4L4 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const r = document.createElement('div'); r.id = 'fake-ring'; document.body.append(c, r);
  });
  await page.waitForTimeout(3000);
  const box = (sel) => page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
  const BTN_FRONT = await box('[data-view="front"]'), BTN_TIME = await box('[data-act="time"]');
  fs.mkdirSync(OUT, { recursive: true });

  let poiPos = [640, 400];
  for (let k = 0; k < N; k++) {
    const file = path.join(OUT, String(k).padStart(3, '0') + '.jpg');
    const [p, t] = cam(k);
    // where the cursor is and what it does on this frame
    let cur, pressed = false, ring = -1;
    if (k < 45) { cur = [lerp(560, 860, ease(seg(k, 0, 44))), 430 + Math.sin(k / 7) * 12]; pressed = k > 2 && k < 43; }
    else if (k < 66) { cur = L3([860, 430], BTN_FRONT, ease(seg(k, 45, 50))); if (k >= 50) ring = k - 50; }
    else if (k < 82) { cur = L3(BTN_FRONT, [640, 380], ease(seg(k, 66, 74))); }
    else if (k < 98) { cur = L3([640, 380], poiPos, ease(seg(k, 82, 90))); if (k >= 90) ring = k - 90; }
    else { cur = L3(poiPos, BTN_TIME, ease(seg(k, 98, 103))); if (k >= 104) ring = k - 104; }
    const state = await page.evaluate(([p, t, cur, pressed, ring, k]) => {
      const { camera, controls, setTime } = window.__app; controls.autoRotate = false;
      camera.position.set(...p); controls.target.set(...t); controls.update();
      const c = document.getElementById('fake-cursor'); c.style.transform = `translate(${cur[0]}px, ${cur[1]}px) scale(${pressed ? 0.88 : 1})`;
      const r = document.getElementById('fake-ring'); r.style.left = cur[0] + 'px'; r.style.top = cur[1] + 'px';
      r.style.opacity = ring >= 0 && ring < 8 ? String(1 - ring / 8) : '0'; r.style.transform = `scale(${0.5 + Math.max(0, ring) * 0.12})`;
      const set = (view, label) => { document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view))); if (label) document.getElementById('status-view').textContent = label; };
      if (k === 50) set('front', 'חזית קדמית');
      if (k === 90) { const el = document.querySelector('.hs[aria-label="מרפסות מדורגות"]'); el && el.click(); document.getElementById('status-view').textContent = 'מרפסות מדורגות'; }
      if (k === 104) { document.getElementById('poi-panel').hidden = true; setTime('night'); document.getElementById('time-lbl').textContent = 'לילה'; set('free', 'סיור חופשי'); }
      const hs = document.querySelector('.hs[aria-label="מרפסות מדורגות"]'); const b = hs.getBoundingClientRect();
      return [b.x + 11, b.y + b.height / 2];
    }, [p, t, cur, pressed, ring, k]);
    if (k === 81) poiPos = state; // aim at the point of interest where it sits once the zoom settles
    if (fs.existsSync(file)) continue;
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
    await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
    if (k % 10 === 0) console.log('frame', k);
  }
  console.log('frames:', N);
  await browser.close(); server.close();
});
