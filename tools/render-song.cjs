#!/usr/bin/env node
/* Renders the music video (src/song.js) over the original track to MP4.
 *
 *   python3 tools/analyze-song.py              (once, or after replacing the song)
 *   node tools/render-song.cjs                 -> dist/adir-getz-empowering.mp4
 *   node tools/render-song.cjs --stills 5,55,101 --stills-dir dist/stills
 *   node tools/render-song.cjs --from 50 --to 60 --out dist/work/test.mp4   (a section only)
 *
 * Needs playwright and ffmpeg.
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
const OUT = path.resolve(root, opt('out', 'dist/adir-getz-empowering.mp4'));
const STILLS = opt('stills', null);
const STILLS_DIR = path.resolve(root, opt('stills-dir', 'dist/stills'));
const SONG = path.join(root, 'assets/song/song.mp3');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

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
  await page.goto(`http://127.0.0.1:${server.address().port}/song-render.html`);
  await page.evaluate(() => window.__ready);
  const DUR = await page.evaluate(() => window.__dur());

  if (STILLS) {
    fs.mkdirSync(STILLS_DIR, { recursive: true });
    for (const s of STILLS.split(',').map(Number)) {
      const data = await page.evaluate((t) => window.__frame(t, 'image/png', 1), s);
      const file = path.join(STILLS_DIR, `song-${s.toFixed(2).padStart(6, '0')}.png`);
      fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
      console.log(file);
    }
  } else {
    const from = Number(opt('from', 0)), to = Math.min(Number(opt('to', DUR)), DUR);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const ff = spawn('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-ss', String(from), '-t', String(to - from), '-i', SONG,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-tune', 'film',
      '-c:a', 'aac', '-b:a', '256k',
      '-shortest', '-movflags', '+faststart', OUT,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
    const total = Math.round((to - from) * FPS);
    console.log(`rendering ${total} frames @ ${FPS}fps…`);
    for (let i = 0; i < total; i++) {
      const data = await page.evaluate((t) => window.__frame(t), from + i / FPS);
      if (!ff.stdin.write(Buffer.from(data.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % FPS === 0) process.stdout.write(`\r  ${(from + i / FPS).toFixed(0)}s / ${to.toFixed(0)}s`);
    }
    ff.stdin.end();
    await done;
    process.stdout.write('\n');
    console.log('wrote', OUT);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
