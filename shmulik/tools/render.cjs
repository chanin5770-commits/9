#!/usr/bin/env node
/* Render the clip: headless Chromium draws frames, ffmpeg encodes, the song is muxed in.
 *   node tools/render.cjs                      -> out/shmulik-king-dalet.mp4
 *   node tools/render.cjs --stills 1,12,16     -> out/stills/*.png
 *   node tools/render.cjs --from 40 --to 60 --out out/test.mp4   (partial, for previews)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const FPS = Number(opt('fps', 30)), DUR = 165.72;
const FROM = Number(opt('from', 0)), TO = Number(opt('to', DUR));
const OUT = path.resolve(root, opt('out', 'out/shmulik-king-dalet.mp4'));
const WORKERS = Number(opt('workers', 4));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2' };
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, r) => {
      const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}
async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(url); await page.evaluate(() => window.__ready); return page;
}
function run(cmd, a) { return new Promise((res, rej) => { const p = spawn(cmd, a, { stdio: 'inherit' }); p.on('close', (c) => (c ? rej(new Error(cmd + ' ' + c)) : res())); }); }
(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/render.html`;
  const browser = await chromium.launch();
  const stills = opt('stills', null);
  if (stills) {
    const dir = path.resolve(root, opt('stills-dir', 'out/stills')); fs.mkdirSync(dir, { recursive: true });
    const page = await openPage(browser, url);
    for (const s of stills.split(',').map(Number)) {
      const d = await page.evaluate((t) => window.__frame(t, 'image/jpeg', 0.9), s);
      const f = path.join(dir, `f-${s.toFixed(2).padStart(6, '0')}.jpg`); fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64')); console.log(f);
    }
    await browser.close(); server.close(); return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const work = path.resolve(root, 'out/work'); fs.mkdirSync(work, { recursive: true });
  const f0 = Math.round(FROM * FPS), f1 = Math.round(TO * FPS), per = Math.ceil((f1 - f0) / WORKERS);
  const t0 = Date.now(); let done = 0;
  const segs = await Promise.all([...Array(WORKERS)].map(async (_, w) => {
    const a = f0 + w * per, b = Math.min(f1, a + per), seg = path.join(work, `seg${w}.mp4`);
    if (a >= b) return null;
    const page = await openPage(browser, url);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
    const closed = new Promise((r) => ff.on('close', r));
    for (let f = a; f < b; f++) {
      const d = await page.evaluate((t) => window.__frame(t), f / FPS);
      if (!ff.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
      if (++done % 150 === 0) console.log(`${done}/${f1 - f0} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end(); await closed; await page.close(); return seg;
  }));
  await browser.close(); server.close();
  const list = path.join(work, 'list.txt'); fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-ss', String(FROM), '-t', String(TO - FROM), '-i', path.join(root, 'audio/song.mp3'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-af', `afade=t=out:st=${Math.max(0, TO - FROM - 0.8)}:d=0.8`, '-shortest', '-movflags', '+faststart', OUT]);
  console.log('wrote', OUT, `in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})().catch((e) => { console.error(e); process.exit(1); });
