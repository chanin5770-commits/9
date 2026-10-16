#!/usr/bin/env node
/* Renders the promo to MP4 (H.264 + AAC) with headless Chromium + ffmpeg.
 *
 *   node chanili-promo/tools/render.cjs                 -> both formats
 *   node chanili-promo/tools/render.cjs --only vertical  (or horizontal)
 *   node chanili-promo/tools/render.cjs --stills 2,5,8,18,24,28
 *
 * Output in chanili-promo/dist/. Needs playwright and ffmpeg on PATH. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const dir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const FPS = 30, DUR = 30;
const FORMATS = { vertical: [1080, 1920], horizontal: [1920, 1080] };
const only = opt('only', null), stills = opt('stills', null);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});

server.listen(0, '127.0.0.1', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => window.__ready);
  await page.evaluate(() => window.__ready);
  const out = path.join(dir, 'dist'); fs.mkdirSync(out, { recursive: true });

  for (const [name, [w, h]] of Object.entries(FORMATS)) {
    if (only && only !== name) continue;
    await page.evaluate(([w, h]) => window.__size(w, h), [w, h]);
    if (stills) {
      for (const s of stills.split(',').map(Number)) {
        const d = await page.evaluate((t) => window.__frame(t, 'image/jpeg', 0.9), s);
        fs.writeFileSync(path.join(out, `still-${name}-${String(s).padStart(4, '0')}.jpg`), Buffer.from(d.split(',')[1], 'base64'));
      }
      continue;
    }
    const wav = path.join(out, 'chanili-promo.wav');
    if (!global.audioDone) { global.audioDone = true; console.log('rendering audio…'); fs.writeFileSync(wav, Buffer.from(await page.evaluate(() => window.__audio()), 'base64')); }
    const file = path.join(out, `chanili-promo-${name}-${w}x${h}.mp4`);
    console.log(`rendering ${name} ${w}x${h}…`);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', wav,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
    for (let i = 0; i < DUR * FPS; i++) {
      const d = await page.evaluate((t) => window.__frame(t, 'image/jpeg', 0.94), i / FPS);
      if (!ff.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % FPS === 0) process.stdout.write(`\r  ${i / FPS}s / ${DUR}s`);
    }
    ff.stdin.end(); await done; process.stdout.write('\n'); console.log('wrote', file);
  }
  await browser.close(); server.close();
});
