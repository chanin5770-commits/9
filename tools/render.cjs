#!/usr/bin/env node
/* Renders the commercial to MP4 (H.264 + AAC) using headless Chromium + ffmpeg.
 *
 *   node tools/render.cjs                      -> dist/heshmali-ad-30s.mp4
 *   node tools/render.cjs --clean              -> dist/heshmali-ad-30s-clean.mp4 (no subtitles)
 *   node tools/render.cjs --fps 25 --out x.mp4
 *   node tools/render.cjs --stills 3,7.5,27.9 --stills-dir out/   (PNG frames only)
 *
 * Needs: playwright (npm i -D playwright, or a global install) and ffmpeg on PATH.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };

const FPS = Number(opt('fps', 30));
const CLEAN = args.includes('--clean');
const OUT = path.resolve(root, opt('out', CLEAN ? 'dist/heshmali-ad-30s-clean.mp4' : 'dist/heshmali-ad-30s.mp4'));
const STILLS = opt('stills', null);
const STILLS_DIR = path.resolve(root, opt('stills-dir', 'dist/stills'));
const DUR = 30;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/render.html`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto(url);
  await page.evaluate(() => window.__ready);

  if (STILLS) {
    fs.mkdirSync(STILLS_DIR, { recursive: true });
    for (const s of STILLS.split(',').map(Number)) {
      const data = await page.evaluate(([t, subs]) => window.__frame(t, 'image/png', 1, subs), [s, !CLEAN]);
      const file = path.join(STILLS_DIR, `frame-${s.toFixed(2).padStart(5, '0')}.png`);
      fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
      console.log(file);
    }
    await browser.close();
    server.close();
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const wav = path.resolve(root, 'dist/heshmali-ad-30s.wav');
  console.log('rendering audio…');
  const b64 = await page.evaluate(() => window.__audio());
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));

  console.log(`rendering ${DUR * FPS} frames @ ${FPS}fps…`);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-tune', 'film',
    '-c:a', 'aac', '-b:a', '256k',
    '-shortest', '-movflags', '+faststart', OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));

  const total = DUR * FPS;
  for (let i = 0; i < total; i++) {
    const data = await page.evaluate(([t, subs]) => window.__frame(t, 'image/jpeg', 0.95, subs), [i / FPS, !CLEAN]);
    if (!ff.stdin.write(Buffer.from(data.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % FPS === 0) process.stdout.write(`\r  ${i / FPS}s / ${DUR}s`);
  }
  ff.stdin.end();
  await done;
  process.stdout.write('\n');
  console.log('wrote', OUT);
  console.log('wrote', wav);
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
