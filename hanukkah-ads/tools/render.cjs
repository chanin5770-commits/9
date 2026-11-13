#!/usr/bin/env node
/* node tools/render.cjs v1 [--stills 1,2,3] [--fps 30]   -> dist/<name>.mp4  */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2); const id = args[0];
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const FPS = Number(opt('fps', 30)); const STILLS = opt('stills', null);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
server.listen(0, '127.0.0.1', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exit(1); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/render.html`);
  const info = await page.evaluate((v) => window.__init(v), id);
  if (STILLS) {
    const dir = path.join(root, 'dist/stills'); fs.mkdirSync(dir, { recursive: true });
    for (const s of STILLS.split(',').map(Number)) {
      const d = await page.evaluate((t) => window.__frame(t, 'image/jpeg', 0.9), s);
      const f = path.join(dir, `${id}-${s.toFixed(1).padStart(5, '0')}.jpg`); fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64')); console.log(f);
    }
    await browser.close(); server.close(); return;
  }
  const out = path.join(root, 'dist', `${info.name}.mp4`); const wav = path.join(root, 'assets/audio', id + '.wav');
  const total = Math.round(info.dur * FPS);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', wav,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg ' + c)))));
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const d = await page.evaluate((t) => window.__frame(t), i / FPS);
    if (!ff.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % (FPS * 5) === 0) console.log(`${id} ${(i / FPS).toFixed(0)}s/${info.dur.toFixed(0)}s  ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
  }
  ff.stdin.end(); await done; console.log('wrote', out); await browser.close(); server.close();
});
