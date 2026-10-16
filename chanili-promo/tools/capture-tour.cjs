#!/usr/bin/env node
/* Captures an orbit of the 3D tour (ovadia-11/index.html) on a phone-sized screen,
 * day then night, into chanili-promo/assets/tour/NNN.jpg.
 *   node chanili-promo/tools/capture-tour.cjs [path-to-three@0.160.0-package]
 * Without network access to the CDN, pass a local `three` package to serve instead. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '../..');
const OUT = path.join(root, 'chanili-promo/assets/tour');
const THREE_DIR = process.argv[2];
const DAY = 72, NIGHT = 60;

const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
server.listen(0, '127.0.0.1', async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2.5, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
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
  await page.addStyleTag({ content: '#hs-layer,#loader,#toast{display:none!important}' });
  await page.waitForTimeout(3000);
  fs.mkdirSync(OUT, { recursive: true });
  const shoot = async (i, ang, r, h) => {
    if (fs.existsSync(path.join(OUT, String(i).padStart(3, '0') + '.jpg'))) return; // resume a partial capture
    await page.evaluate(([ang, r, h]) => {
      const { camera, controls } = window.__app; controls.autoRotate = false;
      controls.target.set(0, 7.5, 0); camera.position.set(Math.sin(ang) * r, h, Math.cos(ang) * r); controls.update();
    }, [ang, r, h]);
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
    await page.screenshot({ path: path.join(OUT, String(i).padStart(3, '0') + '.jpg'), type: 'jpeg', quality: 90 });
  };
  let i = 0;
  for (let k = 0; k < DAY; k++) await shoot(i++, -0.95 + 0.85 * k / (DAY - 1), 68, 22 - 4 * k / DAY);
  await page.evaluate(() => window.__app.setTime('night'));
  await page.waitForTimeout(1500);
  for (let k = 0; k < NIGHT; k++) await shoot(i++, -0.1 + 0.7 * k / (NIGHT - 1), 64, 18 + 8 * k / NIGHT);
  console.log('frames:', i);
  await browser.close(); server.close();
});
