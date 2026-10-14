#!/usr/bin/env node
/* Renders the "יומי" app promo to MP4 (H.264 + AAC) with headless Chromium + ffmpeg.
 *
 *   node tools/render-promo.cjs                                  -> dist/yomi-promo-30s.mp4
 *   node tools/render-promo.cjs --stills 3,9,19 --stills-dir dist/stills
 *
 * Needs: playwright (npm i -D playwright, or a global install) and ffmpeg on PATH.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };

const FPS = Number(opt('fps', 30));
const OUT = path.resolve(root, opt('out', 'dist/yomi-promo-30s.mp4'));
const WAV = path.resolve(root, 'dist/yomi-promo-30s.wav');
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
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('console:', m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/promo/render.html`);
  await page.evaluate(() => window.__ready);

  if (STILLS) {
    fs.mkdirSync(STILLS_DIR, { recursive: true });
    for (const s of STILLS.split(',').map(Number)) {
      const data = await page.evaluate((t) => window.__frame(t, 'image/jpeg', 0.85), s);
      const file = path.join(STILLS_DIR, `promo-${s.toFixed(2).padStart(5, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
      console.log(file);
    }
    await browser.close();
    server.close();
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  console.log('rendering audio…');
  const raw = WAV.replace(/\.wav$/, '.raw.wav');
  fs.writeFileSync(raw, Buffer.from(await page.evaluate(() => window.__audio()), 'base64'));
  // brickwall limiter so the big hits never clip
  require('child_process').execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'alimiter=limit=0.89:attack=1:release=60:level=disabled', '-c:a', 'pcm_s16le', WAV]);
  fs.unlinkSync(raw);

  console.log(`rendering ${DUR * FPS} frames @ ${FPS}fps…`);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', WAV,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '256k',
    '-shortest', '-movflags', '+faststart', OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));

  const total = DUR * FPS;
  for (let i = 0; i < total; i++) {
    const data = await page.evaluate((t) => window.__frame(t, 'image/jpeg', 0.95), i / FPS);
    if (!ff.stdin.write(Buffer.from(data.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % FPS === 0) process.stdout.write(`\r  ${i / FPS}s / ${DUR}s`);
  }
  ff.stdin.end();
  await done;
  process.stdout.write('\n');
  console.log('wrote', OUT);
  console.log('wrote', WAV);
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
