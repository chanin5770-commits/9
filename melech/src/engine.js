/* Drawing toolkit for the clip: maths helpers, the clip frame cache, 3D letters,
 * sparkles, light, and the shared backgrounds. Everything is a pure function of
 * the time it is given, so any frame can be rendered on its own. */
'use strict';

const W = 1920, H = 1080;
const ALEFBET = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק', 'ר', 'ש', 'ת'];
const LETTER_FONT = '"Frank Ruhl Libre"';
const TITLE_FONT = '"Secular One"';
const ROUND_FONT = '"Rubik"';

// ---------------------------------------------------------------- maths

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const ease = {
  in: (k) => k * k * k,
  out: (k) => 1 - Math.pow(1 - k, 3),
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  back: (k) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
  sine: (k) => 0.5 - Math.cos(Math.PI * k) / 2,
};
// Damped bounce that settles at 1.
const bounce = (k) => (k >= 1 ? 1 : 1 - Math.cos(k * Math.PI * 2.5) * Math.exp(-k * 5.5));
function hash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// ---------------------------------------------------------------- beats

// Beat grid detected from the song (seconds); filled in by timeline.js.
let BEATS = [];
function setBeats(b) { BEATS = b; }
// Beat pulse: 1 right on a beat, decaying to 0 by `len` seconds later.
function beatPulse(t, len = 0.22) {
  let lo = 0, hi = BEATS.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (BEATS[m] <= t) lo = m; else hi = m - 1; }
  const d = t - BEATS[lo];
  return d >= 0 && d < len ? Math.pow(1 - d / len, 2) : 0;
}
function beatIndex(t) { let i = 0; while (i < BEATS.length - 1 && BEATS[i + 1] <= t) i++; return i; }

// ---------------------------------------------------------------- clip frames

const CLIP_FPS = 24, CLIP_FRAMES = 192;
const Frames = {
  cache: new Map(),
  need: new Set(),
  key(clip, i) { return clip + '/' + String(clamp(i, 1, CLIP_FRAMES) | 0).padStart(4, '0'); },
  get(clip, i) {
    const k = this.key(clip, i);
    const img = this.cache.get(k);
    if (img) return img;
    this.need.add(k);
    return null;
  },
  async load() {
    const ks = [...this.need];
    this.need.clear();
    await Promise.all(ks.map(async (k) => {
      const img = new Image();
      img.src = 'build/frames/' + k + '.jpg';
      await img.decode();
      this.cache.set(k, img);
    }));
    if (this.cache.size > 260) {
      const drop = [...this.cache.keys()].slice(0, this.cache.size - 200);
      drop.forEach((k) => this.cache.delete(k));
    }
  },
};

/* Draws a clip at clip-time `ct` (seconds) filling the screen.
 * cam: { zoom, fx, fy } — zoom >= 1 and the image point (fx, fy) in 0..1 that sits
 * at the centre of the screen. Fractional frames are cross-blended so slowed-down
 * shots stay smooth. */
function drawClip(ctx, clip, ct, cam = {}, alpha = 1) {
  const z = cam.zoom || 1;
  const f = clamp(ct, 0, (CLIP_FRAMES - 1) / CLIP_FPS) * CLIP_FPS + 1;
  const i0 = Math.floor(f), frac = f - i0;
  const dw = W * z, dh = H * z;
  const fx = cam.fx == null ? 0.5 : cam.fx, fy = cam.fy == null ? 0.5 : cam.fy;
  const x = clamp(W / 2 - fx * dw, W - dw, 0), y = clamp(H / 2 - fy * dh, H - dh, 0);
  const a = Frames.get(clip, i0), b = frac > 0.05 ? Frames.get(clip, i0 + 1) : null;
  if (!a || (frac > 0.05 && !b)) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (cam.filter) ctx.filter = cam.filter;
  ctx.drawImage(a, x, y, dw, dh);
  if (b) { ctx.globalAlpha = alpha * frac; ctx.drawImage(b, x, y, dw, dh); }
  ctx.restore();
}

// ---------------------------------------------------------------- letters

const FACES = {
  gold: { stops: ['#fffbe0', '#ffe27a', '#f2b93b', '#c98a1b'], side: '#94600f', rim: '#fff6c9', glow: 'rgba(255,205,90,' },
  royal: { stops: ['#d9ecff', '#6ea8ff', '#2f63d6', '#1d3f99'], side: '#132a66', rim: '#e8f3ff', glow: 'rgba(120,170,255,' },
  mint: { stops: ['#f0fff8', '#a5f0cf', '#4fc79b', '#2b9a73'], side: '#1b6b4f', rim: '#f2fff9', glow: 'rgba(130,240,195,' },
  sky: { stops: ['#f2fbff', '#a9dcff', '#5bb2ef', '#2f86c9'], side: '#1d5a8a', rim: '#f2fbff', glow: 'rgba(140,210,255,' },
  cream: { stops: ['#ffffff', '#fff6e2', '#f3e2bd', '#dcc395'], side: '#a8895a', rim: '#ffffff', glow: 'rgba(255,240,200,' },
};
const FACE_CYCLE = ['gold', 'royal', 'mint', 'sky'];

const metricsCache = new Map();
function glyphBox(ctx, text, font) {
  const k = font + '|' + text;
  if (!metricsCache.has(k)) {
    ctx.save(); ctx.font = font; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text);
    ctx.restore();
    // Offsets that put the visual centre of the ink at (0, 0).
    metricsCache.set(k, { dx: (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2, dy: (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2, w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent });
  }
  return metricsCache.get(k);
}

/* A letter (or a short string) as a solid extruded 3D object built from real font
 * outlines. o.rotY turns it around the vertical axis (kept under 80° so the letter
 * never shows mirrored), o.flash adds a white-hot highlight. */
function letter3D(ctx, text, x, y, size, o = {}) {
  const face = FACES[o.face || 'gold'];
  const rotY = clamp(o.rotY || 0, -1.35, 1.35), rotZ = o.rotZ || 0;
  const depth = o.depth == null ? size * 0.075 : o.depth;
  const alpha = o.alpha == null ? 1 : o.alpha;
  const glow = o.glow == null ? 0.6 : o.glow;
  const flash = o.flash || 0;
  if (alpha <= 0.003 || size < 2) return;
  const font = `${o.weight || 900} ${size}px ${o.font || LETTER_FONT}`;
  const box = glyphBox(ctx, text, font);
  const c = Math.cos(rotY), s = Math.sin(rotY);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotZ);
  ctx.globalAlpha = alpha;
  ctx.font = font; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // The extrusion goes back and down; its horizontal direction follows the turn.
  const ex = -s * depth * 1.2 + depth * 0.25, ey = depth * 0.9;
  const steps = Math.max(2, Math.ceil(Math.hypot(ex, ey) / 1.6));
  const cs = Math.max(0.06, c);
  // Extrusion layers are offset in screen space, then squeezed for the turn.
  for (let i = steps; i >= 1; i--) {
    const k = i / steps;
    ctx.save();
    ctx.translate(ex * k, ey * k);
    ctx.scale(cs, 1);
    if (i === steps && glow > 0) {
      ctx.shadowColor = face.glow + (0.85 * glow + flash * 0.15) + ')';
      ctx.shadowBlur = size * (0.18 + 0.25 * glow + flash * 0.4);
    }
    ctx.fillStyle = i > steps * 0.5 ? face.side : shade(face.side, 1.25);
    ctx.fillText(text, box.dx, box.dy);
    ctx.restore();
  }
  ctx.save();
  ctx.scale(cs, 1);
  // Face with a vertical metallic gradient.
  const g = ctx.createLinearGradient(0, -box.h / 2, 0, box.h / 2);
  face.stops.forEach((col, i) => g.addColorStop(i / (face.stops.length - 1), col));
  ctx.fillStyle = g;
  ctx.fillText(text, box.dx, box.dy);
  // Rim light on the edge.
  ctx.lineWidth = Math.max(1, size * 0.012);
  ctx.strokeStyle = face.rim;
  ctx.globalAlpha = alpha * 0.55;
  ctx.strokeText(text, box.dx, box.dy);
  // Moving sheen while turning, and the flash.
  const sheen = 0.25 * Math.abs(s) + flash;
  if (sheen > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * clamp(sheen);
    ctx.fillStyle = '#fff3c4';
    ctx.fillText(text, box.dx, box.dy);
  }
  ctx.restore();
  ctx.restore();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * k, 0, 255) | 0, g = clamp(((n >> 8) & 255) * k, 0, 255) | 0, b = clamp((n & 255) * k, 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------- light & sparkles

function glowSpot(ctx, x, y, r, color, a) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', String(a)));
  g.addColorStop(1, color.replace('A', '0'));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

function star(ctx, x, y, r, a) {
  if (a <= 0.01 || r < 0.5) return;
  ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/* Floating golden sparkles. Each one drifts upward and twinkles. */
function sparkles(ctx, t, o = {}) {
  const n = o.n || 70, seed = o.seed || 1, a = o.alpha == null ? 1 : o.alpha;
  const area = o.area || [0, 0, W, H];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const h1 = hash(i + seed * 101), h2 = hash(i * 3.1 + seed), h3 = hash(i * 7.7 + seed * 3);
    const speed = 20 + 60 * h3;
    const x = area[0] + ((h1 * area[2] + Math.sin(t * 0.7 + i) * 30) % area[2] + area[2]) % area[2];
    const y = area[1] + (((h2 * area[3] - t * speed) % area[3]) + area[3]) % area[3];
    const tw = 0.5 + 0.5 * Math.sin(t * (2 + 4 * h3) + i * 1.7);
    const r = (o.size || 9) * (0.4 + h2) * (0.6 + 0.6 * tw);
    const glowR = r * 3.2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    g.addColorStop(0, `rgba(255,226,140,${0.35 * tw * a})`);
    g.addColorStop(1, 'rgba(255,226,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - glowR, y - glowR, glowR * 2, glowR * 2);
    ctx.fillStyle = '#fff8dc';
    star(ctx, x, y, r, tw * a);
  }
  ctx.restore();
}

/* A burst of sparkles flying out from (x, y), starting at t0. */
function burst(ctx, t, t0, x, y, o = {}) {
  const k = (t - t0) / (o.dur || 0.9);
  if (k < 0 || k > 1) return;
  const n = o.n || 26, R = o.radius || 260;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = o.color || '#fff4c8';
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + hash(i + (o.seed || 0)) * 0.6;
    const d = R * ease.out(k) * (0.6 + 0.5 * hash(i * 9 + (o.seed || 0)));
    star(ctx, x + Math.cos(ang) * d, y + Math.sin(ang) * d - 40 * k * k, (o.size || 12) * (1 - k * 0.6), (1 - k) * 0.95);
  }
  ctx.restore();
}

function rays(ctx, x, y, t, o = {}) {
  const n = o.n || 14, a = o.alpha == null ? 0.25 : o.alpha, len = o.len || 1400;
  if (a <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * (o.spin == null ? 0.08 : o.spin));
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    ctx.rotate((Math.PI * 2) / n);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, `rgba(255,236,170,${a})`);
    g.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, -len * 0.06); ctx.lineTo(len, len * 0.06); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- backgrounds

function skyBG(ctx, t, o = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, o.top || '#9fd4ff');
  g.addColorStop(0.55, o.mid || '#d8efff');
  g.addColorStop(1, o.bottom || '#fff4dc');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  glowSpot(ctx, o.sunX || W * 0.5, o.sunY || H * 0.35, 900, 'rgba(255,240,200,A)', 0.55);
  clouds(ctx, t, o.cloudY || 0.72, o.cloudAlpha == null ? 1 : o.cloudAlpha);
}

function clouds(ctx, t, baseY, a) {
  ctx.save();
  for (let layer = 0; layer < 3; layer++) {
    const y0 = H * (baseY + layer * 0.1), sp = 8 + layer * 10;
    ctx.globalAlpha = a * (0.55 + layer * 0.18);
    ctx.fillStyle = layer === 2 ? '#ffffff' : layer === 1 ? '#fbfdff' : '#eef6ff';
    for (let i = 0; i < 9; i++) {
      const cx = (((hash(i + layer * 20) * 2400 + t * sp) % 2600) + 2600) % 2600 - 340;
      const r = 120 + 110 * hash(i * 5 + layer);
      ctx.beginPath();
      ctx.arc(cx, y0, r, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.9, y0 + r * 0.15, r * 0.75, 0, Math.PI * 2);
      ctx.arc(cx - r * 0.9, y0 + r * 0.2, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function vignette(ctx, a = 0.35) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(20,30,70,0)');
  g.addColorStop(1, `rgba(20,30,70,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function fill(ctx, color, a = 1) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore();
}
