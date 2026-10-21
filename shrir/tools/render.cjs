#!/usr/bin/env node
/* Renders build/timeline.json to the final MP4.
 *
 *   node tools/render.cjs                    -> dist/shrir-film.mp4 (subtitles burned in)
 *   node tools/render.cjs --clean            -> dist/...-clean.mp4 (no subtitles, for platform captions)
 *   node tools/render.cjs --stills 5,62.5    -> dist/stills/*.png, single frames for checking
 *   node tools/render.cjs --from 120 --to 150 --out dist/preview.mp4   (a section only)
 *
 * Chromium draws every frame of src/film.js; ffmpeg encodes H.264 + AAC with
 * build/mix.wav (made by tools/score.py). Needs playwright and ffmpeg.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const CLEAN = flag('--clean');

const tl = JSON.parse(fs.readFileSync(path.join(root, 'build/timeline.json'), 'utf8'));
const FPS = tl.fps;

// prefer the upscaled plates; fall back to the cleaned storyboard cells
const images = {};
for (const s of tl.shots) {
  const hd = `assets/scenes/hd/${s.img}.png`, clean = `assets/scenes/clean/${s.img}.png`;
  images[s.img] = fs.existsSync(path.join(root, hd)) ? hd : clean;
}

function serve() {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
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

const run = (cmd, a, feed) => new Promise((res, rej) => {
  const p = spawn(cmd, a, { stdio: ['pipe', 'inherit', 'inherit'] });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error(cmd + ' exit ' + c))));
  if (feed) feed(p); else p.stdin.end();
});

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/render.html`);
  const fontsOk = await page.evaluate(([t, i]) => window.__init(t, i), [tl, images]);
  if (!fontsOk) throw new Error('fonts failed to load');

  if (flag('--stills')) {
    const dir = path.join(root, opt('--stills-dir', 'dist/stills'));
    fs.mkdirSync(dir, { recursive: true });
    for (const s of opt('--stills').split(',').map(Number)) {
      const d = await page.evaluate(([t, o]) => window.__frame(t, o, 'image/png'), [s, { subtitles: !CLEAN }]);
      const f = path.join(dir, `t${s.toFixed(2).padStart(7, '0')}.png`);
      fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64'));
      console.log('wrote', path.relative(root, f));
    }
  } else {
    const from = Number(opt('--from', 0)), to = Number(opt('--to', tl.duration));
    const out = path.join(root, opt('--out', CLEAN ? 'dist/shrir-film-clean.mp4' : 'dist/shrir-film.mp4'));
    const wav = path.join(root, 'build/mix.wav');
    const audio = fs.existsSync(wav) ? ['-ss', String(from), '-t', String(to - from), '-i', wav] : [];
    const n = Math.round((to - from) * FPS);
    console.log(`rendering ${n} frames (${from}s–${to}s)${audio.length ? '' : ' — no build/mix.wav, silent'}`);
    const t0 = Date.now();
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', ...audio,
      '-map', '0:v', ...(audio.length ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000'] : []),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '3600k', '-bufsize', '7200k', '-tune', 'film', '-pix_fmt', 'yuv420p',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-r', String(FPS), '-t', String(to - from), '-movflags', '+faststart', out], async (p) => {
      for (let i = 0; i < n; i++) {
        const d = await page.evaluate(([t, o]) => window.__frame(t, o), [from + i / FPS, { subtitles: !CLEAN }]);
        if (!p.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise((r) => p.stdin.once('drain', r));
        if (i % FPS === 0) process.stdout.write(`\r  ${(i / FPS).toFixed(0)}s / ${(n / FPS).toFixed(0)}s  (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
      }
      p.stdin.end();
    });
    process.stdout.write('\n');
    console.log('wrote', path.relative(root, out));
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
