#!/usr/bin/env node
/* Renders the video: headless Chromium draws each frame on a canvas, FFmpeg encodes.
 *   node tools/render.cjs                    -> out/zvi-melech-hei.mp4 (+ out/zvi-cover.jpg)
 *   node tools/render.cjs --stills 3,21,27   -> out/qa/frame-XX.XX.jpg only
 *   node tools/render.cjs --workers 3        (parallel segments, default 3)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const FPS = Number(opt('fps', 30));
const WORKERS = Number(opt('workers', 3));
const STILLS = opt('stills', null);
const OUT = path.resolve(root, opt('out', 'out/zvi-melech-hei.mp4'));
const QA = path.join(root, 'out', 'qa');
const WORK = path.join(root, 'out', 'work');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

function run(cmd, a) { return new Promise((res, rej) => { const p = spawn(cmd, a, { stdio: ['ignore', 'inherit', 'inherit'] }); p.on('close', (c) => (c ? rej(new Error(cmd + ' ' + c)) : res())); }); }

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exit(1); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(url);
  await page.evaluate(() => window.__ready);
  return page;
}

async function renderSegment(page, f0, f1, file) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error('ffmpeg ' + c)) : res())));
  for (let f = f0; f < f1; f++) {
    const data = await page.evaluate((t) => window.__frame(t), f / FPS);
    const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - f0) % 150 === 0) console.log(`  ${path.basename(file)}: frame ${f}/${f1}`);
  }
  ff.stdin.end();
  await done;
}

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/render.html`;
  const browser = await chromium.launch({ args: ['--disable-web-security'] });
  fs.mkdirSync(QA, { recursive: true });

  if (STILLS) {
    const page = await openPage(browser, url);
    for (const s of STILLS.split(',').map(Number)) {
      const t0 = Date.now();
      const d = await page.evaluate((t) => window.__frame(t, 'image/jpeg', 0.9), s);
      const f = path.join(QA, `frame-${s.toFixed(2).padStart(6, '0')}.jpg`);
      fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64')); console.log(f, (Date.now() - t0) + 'ms');
    }
    await browser.close(); server.close(); return;
  }

  const probe = await openPage(browser, url);
  const DUR = await probe.evaluate(() => ZVI.DUR);
  const song = await probe.evaluate(() => window.ZVI_CONFIG.song);
  const cover = await probe.evaluate(() => window.__cover());
  fs.writeFileSync(path.join(root, 'out', 'zvi-cover.jpg'), Buffer.from(cover.split(',')[1], 'base64'));
  await probe.close();

  const total = Math.round(DUR * FPS);
  fs.mkdirSync(WORK, { recursive: true });
  const per = Math.ceil(total / WORKERS), segs = [];
  const t0 = Date.now();
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    const f0 = w * per, f1 = Math.min(total, f0 + per); if (f0 >= f1) return;
    const file = path.join(WORK, `seg${w}.mp4`); segs[w] = file;
    const page = await openPage(browser, url);
    await renderSegment(page, f0, f1, file);
    await page.close();
  }));
  console.log(`frames done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await browser.close(); server.close();

  const list = path.join(WORK, 'list.txt');
  fs.writeFileSync(list, segs.filter(Boolean).map((f) => `file '${f}'`).join('\n'));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', path.join(root, song),
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '4500k', '-bufsize', '9000k', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', String(DUR), '-movflags', '+faststart', OUT]);
  console.log('wrote', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
