#!/usr/bin/env node
/* Renders "מלך האותיות" to MP4 (H.264 + the original song as AAC) with headless
 * Chromium + ffmpeg.
 *
 *   node tools/render.cjs                         -> dist/melech-haotiyot.mp4
 *   node tools/render.cjs --workers 4             (parallel pages, default 3)
 *   node tools/render.cjs --from 38 --to 52 --out dist/part.mp4   (a section only)
 *   node tools/render.cjs --stills 3,40.1,170 --stills-dir dist/stills
 *   node tools/render.cjs --page teaser.html --audio assets/teaser-music.wav --out dist/teaser.mp4
 *
 * Run tools/extract-frames.sh once first: it unpacks the footage into build/frames.
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
const WORKERS = Number(opt('workers', 3));
const OUT = path.resolve(root, opt('out', 'dist/melech-haotiyot.mp4'));
const STILLS = opt('stills', null);
const STILLS_DIR = path.resolve(root, opt('stills-dir', 'dist/stills'));
const PAGE = opt('page', 'render.html');
const SONG = path.join(root, opt('audio', 'assets/song.mp3'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wav': 'audio/wav' };

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

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(url);
  const dur = await page.evaluate(() => window.__ready);
  return { page, dur };
}

async function renderRange(browser, url, f0, f1, file, progress) {
  const { page } = await openPage(browser, url);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  for (let i = f0; i < f1; i++) {
    const data = await page.evaluate((t) => window.__frame(t), i / FPS);
    if (!ff.stdin.write(Buffer.from(data.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    progress();
  }
  ff.stdin.end();
  await done;
  await page.close();
}

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/${PAGE}`;
  const browser = await chromium.launch();

  if (STILLS) {
    const { page } = await openPage(browser, url);
    fs.mkdirSync(STILLS_DIR, { recursive: true });
    for (const s of STILLS.split(',').map(Number)) {
      const data = await page.evaluate((t) => window.__frame(t, 'image/jpeg', 0.9), s);
      const file = path.join(STILLS_DIR, `frame-${s.toFixed(2).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
      console.log(file);
    }
    await browser.close(); server.close();
    return;
  }

  const { page: probe, dur } = await openPage(browser, url);
  await probe.close();
  const from = Number(opt('from', 0)), to = Math.min(dur, Number(opt('to', dur)));
  const F0 = Math.round(from * FPS), F1 = Math.round(to * FPS);
  const work = path.join(root, 'build/segments');
  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  console.log(`rendering ${F1 - F0} frames (${from}s–${to}s) @ ${FPS}fps on ${WORKERS} workers…`);
  let doneFrames = 0;
  const t0 = Date.now();
  const tick = () => {
    doneFrames++;
    if (doneFrames % 30 === 0) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`\r  ${doneFrames}/${F1 - F0} frames, ${el.toFixed(0)}s elapsed, ~${((F1 - F0 - doneFrames) * el / doneFrames).toFixed(0)}s left   `);
    }
  };
  const per = Math.ceil((F1 - F0) / WORKERS);
  const parts = [];
  for (let w = 0; w < WORKERS; w++) {
    const a = F0 + w * per, b = Math.min(F1, a + per);
    if (a < b) parts.push({ a, b, file: path.join(work, `part-${w}.mp4`) });
  }
  await Promise.all(parts.map((p) => renderRange(browser, url, p.a, p.b, p.file, tick)));
  process.stdout.write('\n');
  await browser.close();
  server.close();

  const list = path.join(work, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p.file}'`).join('\n'));
  await new Promise((res, rej) => {
    const ff = spawn('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', list,
      '-ss', String(from), '-t', String(to - from), '-i', SONG,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
      '-shortest', '-movflags', '+faststart', OUT,
    ], { stdio: 'inherit' });
    ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))));
  });
  console.log('wrote', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
