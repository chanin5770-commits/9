#!/usr/bin/env node
/* Renders the "ממלכת המספרים" teaser (src/numbers.js) to a vertical 9:16 MP4.
 *
 *   node tools/render-numbers.cjs                 -> dist/mamlechet-hamisparim-teaser.mp4
 *   node tools/render-numbers.cjs --base          (rebuild the cut footage first, after editing N.SHOTS)
 *   node tools/render-numbers.cjs --stills 8.5,22,66 --stills-dir dist/stills
 *
 * Steps: 1) ffmpeg cuts and retimes the clips into dist/work/numbers-base.mp4;
 * 2) Chromium renders the score and the transparent overlay (curtain, titles,
 * sparkles, flashes); 3) ffmpeg composites everything. Needs playwright and ffmpeg.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FPS = 30;
const OUT = path.join(root, 'dist/mamlechet-hamisparim-teaser.mp4');
const WORK = path.join(root, 'dist/work');
const BASE = path.join(WORK, 'numbers-base.mp4');
const WAV = path.join(root, 'dist/mamlechet-hamisparim-teaser.wav');

global.window = global;
require(path.join(root, 'src/timeline.js'));
const N = (() => { require(path.join(root, 'src/numbers.js')); return global.AD.NUMBERS; })();

const run = (cmd, a, opts = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, a, { stdio: ['pipe', 'inherit', 'inherit'], ...opts });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error(cmd + ' exit ' + c))));
  if (opts.feed) opts.feed(p); else p.stdin.end();
});

// 1) the cut
function buildBase() {
  const clips = Object.keys(N.CLIPS);
  const inputs = clips.flatMap((k) => ['-i', path.join(root, N.CLIPS[k])]);
  const parts = [];
  N.SHOTS.forEach(([o0, o1, clip, s0, s1], i) => {
    const out = o1 - o0, frames = Math.round(out * FPS);
    if (clip === 'BLACK') {
      parts.push(`color=c=black:s=${N.W}x${N.H}:r=${FPS}:d=${out},setsar=1,trim=end_frame=${frames}[v${i}]`);
      return;
    }
    const idx = clips.indexOf(clip), stretch = out / (s1 - s0);
    let f = `[${idx}:v]trim=start=${s0}:end=${s1},setpts=(PTS-STARTPTS)*${stretch.toFixed(5)},tpad=stop_mode=clone:stop_duration=${(0.3 * stretch).toFixed(3)}`;
    // big slow-downs get motion-interpolated frames; small ones just hold frames
    f += stretch > 1.6 ? `,minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1` : `,fps=${FPS}`;
    f += `,setpts=PTS-STARTPTS,trim=end_frame=${frames}`;
    f += `,scale=${N.W}:${N.H}:flags=lanczos,unsharp=5:5:0.5,eq=contrast=1.04:saturation=1.1,setsar=1[v${i}]`;
    parts.push(f);
  });
  const graph = parts.join(';') + ';' + N.SHOTS.map((_, i) => `[v${i}]`).join('') + `concat=n=${N.SHOTS.length}:v=1:a=0,format=yuv420p[out]`;
  fs.mkdirSync(WORK, { recursive: true });
  console.log('cutting footage…');
  return run('ffmpeg', ['-y', '-nostdin', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-r', String(FPS), '-t', String(N.DUR), BASE]);
}

function serve() {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
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
  if (!fs.existsSync(BASE) || args.includes('--base')) await buildBase();

  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: N.W, height: N.H } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto(`http://127.0.0.1:${server.address().port}/numbers-render.html`);
  await page.evaluate(() => window.__ready);

  if (opt('--stills')) {
    // composite single frames for checking: footage frame + overlay
    const dir = path.join(root, opt('--stills-dir') || 'dist/stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of opt('--stills').split(',').map(Number)) {
      const png = path.join(dir, `ov-${t}.png`);
      fs.writeFileSync(png, Buffer.from((await page.evaluate((x) => window.__overlay(x), t)).split(',')[1], 'base64'));
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', BASE, '-i', png, '-filter_complex',
        '[0:v][1:v]overlay=0:0,scale=540:-2', '-frames:v', '1', path.join(dir, `still-${t}.jpg`)]);
      fs.unlinkSync(png);
    }
    console.log('stills in', dir);
  } else {
    console.log('rendering score…');
    fs.writeFileSync(WAV, Buffer.from(await page.evaluate(() => window.__audio()), 'base64'));

    console.log('compositing…');
    const total = N.DUR * FPS;
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', BASE,
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-i', WAV,
      '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]', '-map', '[v]', '-map', '2:a',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k',
      '-t', String(N.DUR), '-movflags', '+faststart', OUT], {
      feed: async (p) => {
        for (let i = 0; i < total; i++) {
          const d = await page.evaluate((t) => window.__overlay(t), i / FPS);
          if (!p.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise((r) => p.stdin.once('drain', r));
          if (i % FPS === 0) process.stdout.write(`\r  ${i / FPS}s / ${N.DUR}s`);
        }
        p.stdin.end();
      },
    });
    process.stdout.write('\n');
    console.log('wrote', OUT);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
