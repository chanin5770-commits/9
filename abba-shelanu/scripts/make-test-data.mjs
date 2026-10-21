// Generates test material (a synthetic 92 BPM song with quiet/loud sections and 150 placeholder
// photos in folders named after the kids) to exercise the pipeline without real family files.
//   node scripts/make-test-data.mjs <outdir>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const out = path.resolve(process.argv[2] || 'test-data');
fs.mkdirSync(out, { recursive: true });

// ---- song
const SR = 44100, BPM = 92, spb = 60 / BPM;
const plan = [ // [bars, level]
  [8, 0], [16, 1], [8, 2], [16, 1], [8, 2], [8, 1], [16, 3], [8, 0],
];
const bars = plan.reduce((a, [b]) => a + b, 0);
const dur = bars * 4 * spb + 3;
const N = Math.round(dur * SR);
const L = new Float32Array(N);
const chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 329.6]];
let bar0 = 0;
let rnd = 1;
const noise = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (const [nb, lv] of plan) {
  for (let b = 0; b < nb; b++) {
    const bar = bar0 + b, t0 = bar * 4 * spb;
    const ch = chords[bar % 4];
    const padAmp = [0.05, 0.07, 0.09, 0.1][lv];
    for (let i = Math.round(t0 * SR); i < Math.round((t0 + 4 * spb) * SR) && i < N; i++) {
      const t = i / SR;
      let v = 0;
      for (const f of ch) v += Math.sin(2 * Math.PI * f * t) * padAmp;
      L[i] += v;
    }
    for (let beat = 0; beat < 4; beat++) {
      const tb = t0 + beat * spb;
      const add = (fn, len) => { const s = Math.round(tb * SR); for (let k = 0; k < len * SR && s + k < N; k++) L[s + k] += fn(k / SR); };
      // piano-ish note on every beat
      const nf = ch[beat % 3] * 2;
      add((t) => Math.sin(2 * Math.PI * nf * t) * Math.exp(-t * 4) * (lv === 0 ? 0.12 : 0.1), 0.6);
      if (lv >= 1) add((t) => Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9) * (beat % 2 === 0 ? 0.5 : 0.25) * (lv >= 2 ? 1 : 0.6), 0.4);
      if (lv >= 2 && beat % 2 === 1) add((t) => noise() * Math.exp(-t * 18) * 0.28 * (lv === 3 ? 1.3 : 1), 0.3);
      if (lv >= 2) for (const h of [0, 0.5]) { const s = Math.round((tb + h * spb) * SR); for (let k = 0; k < 0.05 * SR && s + k < N; k++) L[s + k] += noise() * Math.exp(-k / SR * 80) * 0.08; }
    }
  }
  bar0 += nb;
}
let mx = 0; for (const v of L) mx = Math.max(mx, Math.abs(v));
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { const v = Math.round((L[i] / mx) * 0.85 * 32767); pcm.writeInt16LE(v, 44 + i * 4); pcm.writeInt16LE(v, 46 + i * 4); }
fs.writeFileSync(path.join(out, 'song.wav'), pcm);
console.log('song', dur.toFixed(1) + 's', BPM, 'BPM');

// ---- photos
const folders = ['משי', 'ליבי', 'הדר', 'שרי', 'יוני', 'משפחה', 'טיול לים', 'צחוקים', 'כללי'];
const sizes = [[4032, 3024], [3024, 4032], [1920, 1080], [1080, 1920], [3000, 3000], [800, 600]];
const hues = [[201, 160, 110], [120, 150, 170], [180, 120, 100], [110, 140, 100], [170, 150, 190]];
let n = 0;
for (let i = 0; i < 150; i++) {
  const folder = folders[i % folders.length];
  fs.mkdirSync(path.join(out, 'photos', folder), { recursive: true });
  const [w, h] = sizes[(i * 7) % (i % 25 === 0 ? 6 : 5)];
  const [r, g, b] = hues[i % hues.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgb(${r},${g},${b})"/><stop offset="1" stop-color="rgb(${r / 3},${g / 3},${b / 3})"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${w * 0.42}" cy="${h * 0.4}" r="${Math.min(w, h) * 0.09}" fill="#f1d3b5"/>
    <circle cx="${w * 0.6}" cy="${h * 0.45}" r="${Math.min(w, h) * 0.07}" fill="#e8c2a0"/>
    <text x="50%" y="80%" font-size="${Math.min(w, h) * 0.12}" text-anchor="middle" fill="#fff" font-family="sans-serif">${i + 1}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(path.join(out, 'photos', folder, `IMG_${String(i + 1).padStart(4, '0')}.jpg`));
  n++;
}
console.log('photos', n);
