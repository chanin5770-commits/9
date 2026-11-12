#!/usr/bin/env node
/* Renders the Libi clip (src/clip.js) to MP4 with headless Chromium + ffmpeg.
 *
 *   node tools/render.cjs                         -> dist/libi-malkat-haotiyot.mp4
 *   node tools/render.cjs --workers 4             (parallel Chromium instances)
 *   node tools/render.cjs --stills 3,7.5,40 --stills-dir dist/stills   (PNG frames only)
 *   node tools/render.cjs --cover                 -> dist/cover.png
 *   node tools/render.cjs --timeline              -> dist/timeline.json
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const FPS = 30, DUR = 204.74;
const WORKERS = Number(opt('workers', 4));
const OUT = path.resolve(root, opt('out', 'dist/libi-malkat-haotiyot.mp4'));
const WORK = path.join(root, 'dist/work');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(r);
    }).listen(0, '127.0.0.1', () => res(s));
  });
}
const run = (cmd, a, o = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, a, { stdio: ['pipe', 'inherit', 'inherit'], ...o });
  p.on('exit', c => c === 0 ? res() : rej(new Error(cmd + ' exited ' + c)));
  if (o.onSpawn) o.onSpawn(p);
});

async function openPage(port) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(`http://127.0.0.1:${port}/render.html`);
  await page.evaluate(() => window.__ready);
  return { browser, page };
}

async function main() {
  const server = await serve();
  const port = server.address().port;
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

  if (args.includes('--timeline')) {
    const { browser, page } = await openPage(port);
    const tl = await page.evaluate(() => window.__timeline());
    fs.writeFileSync(path.join(root, 'dist/timeline.json'), JSON.stringify(tl, null, 2));
    console.log(tl.map(s => `${s.n}\t${s.start}\t${s.end}\t${s.kind}\t${s.photo || ''}\t${s.word || ''}\t${s.transitionIn || ''}`).join('\n'));
    await browser.close(); server.close(); return;
  }
  const stills = opt('stills', null);
  if (stills || args.includes('--cover')) {
    const dir = path.resolve(root, opt('stills-dir', 'dist/stills'));
    fs.mkdirSync(dir, { recursive: true });
    const { browser, page } = await openPage(port);
    const list = stills ? stills.split(',').map(Number) : [198.4];
    for (const t of list) {
      const url = await page.evaluate(tt => window.__frame(tt, 'image/png'), t);
      const f = args.includes('--cover') ? path.join(root, 'dist/cover.png') : path.join(dir, `t${t.toFixed(2).padStart(7, '0')}.png`);
      fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
      console.log('wrote', f);
    }
    await browser.close(); server.close(); return;
  }

  fs.mkdirSync(WORK, { recursive: true });
  const N = Math.round(DUR * FPS);
  const per = Math.ceil(N / WORKERS);
  const t0 = Date.now();
  let done = 0;
  const segs = [];
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    const a = w * per, b = Math.min(N, a + per);
    if (a >= b) return;
    const seg = path.join(WORK, `seg${w}.mp4`); segs[w] = seg;
    const { browser, page } = await openPage(port);
    let ff;
    const fin = run('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), seg], { onSpawn: p => { ff = p; } });
    for (let f = a; f < b; f++) {
      const url = await page.evaluate(tt => window.__frame(tt), f / FPS);
      const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (++done % 150 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`frames ${done}/${N}  ${(done / el).toFixed(1)} fps  eta ${Math.round((N - done) / (done / el))}s`);
      }
    }
    ff.stdin.end(); await fin; await browser.close();
  }));
  server.close();
  const list = path.join(WORK, 'segs.txt');
  fs.writeFileSync(list, segs.filter(Boolean).map(s => `file '${s}'`).join('\n'));
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', path.join(root, 'assets/song.mp3'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
    '-movflags', '+faststart', '-metadata', 'title=ליבי – מלכת האותיות | האות ב׳', '-t', String(DUR), OUT]);
  console.log('wrote', OUT, `in ${Math.round((Date.now() - t0) / 1000)}s`);
}
main().catch(e => { console.error(e); process.exit(1); });
