#!/usr/bin/env node
/* Renders the live-footage cut (src/film.js) to MP4.
 *
 *   node tools/render-film.cjs            -> dist/heshmali-film-30s.mp4 (with subtitles)
 *   node tools/render-film.cjs --clean    -> dist/heshmali-film-30s-clean.mp4
 *   node tools/render-film.cjs --base-only   (just rebuild the cut footage)
 *
 * Steps: 1) ffmpeg cuts, slows (motion interpolation) and frames the clips into
 * dist/work/film-base.mp4; 2) Chromium renders the score + narration and the
 * transparent overlay (vignette, flashes, letterbox, subtitles); 3) ffmpeg
 * composites everything. Needs playwright and ffmpeg.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const CLEAN = args.includes('--clean');
const FPS = 30;
const OUT = path.join(root, CLEAN ? 'dist/heshmali-film-30s-clean.mp4' : 'dist/heshmali-film-30s.mp4');
const WORK = path.join(root, 'dist/work');
const BASE = path.join(WORK, 'film-base.mp4');
const WAV = path.join(root, 'dist/heshmali-film-30s.wav');

global.window = global;
require(path.join(root, 'src/timeline.js'));
const FILM = (() => { require(path.join(root, 'src/film.js')); return global.AD.FILM; })();

const run = (cmd, a, opts = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, a, { stdio: ['pipe', 'inherit', 'inherit'], ...opts });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error(cmd + ' exit ' + c))));
  if (opts.feed) opts.feed(p); else p.stdin.end();
});

// 1) the cut
function buildBase() {
  const clips = Object.keys(FILM.CLIPS);
  const inputs = clips.flatMap((k) => ['-i', path.join(root, FILM.CLIPS[k])]);
  const parts = [];
  FILM.SHOTS.forEach(([o0, o1, clip, s0, s1], i) => {
    const idx = clips.indexOf(clip), out = o1 - o0, src = s1 - s0, stretch = out / src;
    const frames = Math.round(out * FPS);
    // pad the source with its last frame, retime, then cut to an exact frame count
    let f = `[${idx}:v]trim=start=${s0}:end=${s1},setpts=(PTS-STARTPTS)*${stretch.toFixed(5)},tpad=stop_mode=clone:stop_duration=${(0.3 * stretch).toFixed(3)}`;
    if (clip === 'C') {
      // vertical card: sharp card over a blurred, darkened copy of itself
      f += `,fps=${FPS},setpts=PTS-STARTPTS,trim=end_frame=${frames},split[c${i}a][c${i}b];` +
        `[c${i}a]scale=1920:-2,crop=1920:1080,boxblur=40:3,eq=brightness=-0.38:saturation=0.7[c${i}bg];` +
        `[c${i}b]scale=-2:960:flags=lanczos[c${i}fg];` +
        `[c${i}bg][c${i}fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v${i}]`;
    } else {
      f += stretch > 1.2 ? `,minterpolate=fps=${FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1` : `,fps=${FPS}`;
      f += `,setpts=PTS-STARTPTS,trim=end_frame=${frames}`;
      f += `,scale=1920:1080:flags=lanczos,unsharp=5:5:0.6,eq=contrast=1.06:saturation=1.08,setsar=1[v${i}]`;
    }
    parts.push(f);
  });
  const graph = parts.join(';') + ';' + FILM.SHOTS.map((_, i) => `[v${i}]`).join('') + `concat=n=${FILM.SHOTS.length}:v=1:a=0,format=yuv420p[out]`;
  fs.mkdirSync(WORK, { recursive: true });
  console.log('cutting footage (motion-interpolated slow motion takes a few minutes)…');
  return run('ffmpeg', ['-y', '-nostdin', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-r', String(FPS), '-t', String(FILM.DUR), BASE]);
}

function serve() {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wav': 'audio/wav' };
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
  if (!fs.existsSync(BASE) || args.includes('--base') || args.includes('--base-only')) await buildBase();
  if (args.includes('--base-only')) return;

  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await page.goto(`http://127.0.0.1:${server.address().port}/film-render.html`);
  await page.evaluate(() => window.__ready);

  console.log('rendering score + narration…');
  fs.writeFileSync(WAV, Buffer.from(await page.evaluate(() => window.__audio()), 'base64'));

  console.log('compositing…');
  const total = FILM.DUR * FPS;
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', BASE,
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-i', WAV,
    '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]', '-map', '[v]', '-map', '2:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-tune', 'film', '-c:a', 'aac', '-b:a', '256k',
    '-t', String(FILM.DUR), '-movflags', '+faststart', OUT], {
    feed: async (p) => {
      for (let i = 0; i < total; i++) {
        const d = await page.evaluate(([t, s]) => window.__overlay(t, s), [i / FPS, !CLEAN]);
        if (!p.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise((r) => p.stdin.once('drain', r));
        if (i % FPS === 0) process.stdout.write(`\r  ${i / FPS}s / ${FILM.DUR}s`);
      }
      p.stdin.end();
    },
  });
  process.stdout.write('\n');
  console.log('wrote', OUT);
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
