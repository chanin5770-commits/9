/* Canvas engine for the ChaniLi Hanukkah ads (1080x1920, deterministic: every frame is a pure function of t). */
'use strict';
const W = 1080, H = 1920;
const IMG = {};
const ROOT = 'assets/img/';

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const ease = {
  out: (x) => 1 - Math.pow(1 - x, 3),
  in: (x) => x * x * x,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  back: (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  sine: (x) => 0.5 - Math.cos(Math.PI * x) / 2,
  expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
};
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- assets ----------
function loadImages(names) {
  return Promise.all(names.map((n) => new Promise((res, rej) => {
    if (IMG[n]) return res();
    const im = new Image();
    im.onload = () => { IMG[n] = im; res(); };
    im.onerror = () => rej(new Error('missing image ' + n));
    im.src = ROOT + n + '.webp';
  })));
}
const img = (n) => { const i = IMG[n]; if (!i) throw new Error('not loaded: ' + n); return i; };

// ---------- shapes ----------
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function cover(ctx, im, x, y, w, h, zoom = 1, px = 0.5, py = 0.5) {
  const s = Math.max(w / im.width, h / im.height) * zoom;
  const iw = im.width * s, ih = im.height * s;
  ctx.drawImage(im, x + (w - iw) * px, y + (h - ih) * py, iw, ih);
}

// ---------- backgrounds ----------
const THEMES = {
  night: ['#16307a', '#0a1748', '#040a26'],
  royal: ['#1d4aa8', '#0e2565', '#061238'],
  dusk: ['#3a2a7a', '#151a55', '#060a2a'],
};
function background(ctx, t, theme = 'night', glow = 0.5) {
  const c = THEMES[theme] || THEMES.night;
  const g = ctx.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H * 0.5, H * 0.75);
  g.addColorStop(0, c[0]); g.addColorStop(0.5, c[1]); g.addColorStop(1, c[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // drifting bokeh
  const r = rng(7);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const bx = r() * W, by = r() * H, rad = 40 + r() * 140, sp = 8 + r() * 22, ph = r() * 6.28;
    const x = (bx + Math.sin(t * 0.2 + ph) * 40) % W;
    const y = ((by - t * sp) % (H + 300) + H + 300) % (H + 300) - 150;
    const gold = r() < 0.6;
    const a = (0.05 + r() * 0.08) * (0.6 + 0.4 * Math.sin(t * 0.8 + ph)) * (0.5 + glow);
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, gold ? `rgba(255,200,90,${a})` : `rgba(120,190,255,${a})`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.restore();
  stars(ctx, t, 90, 3);
}
function star4(ctx, x, y, s, a, col = '255,224,140') {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2.2);
  g.addColorStop(0, `rgba(${col},0.9)`); g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g; ctx.fillRect(-s * 2.2, -s * 2.2, s * 4.4, s * 4.4);
  ctx.fillStyle = '#fffbe8';
  ctx.beginPath();
  ctx.moveTo(0, -s * 2); ctx.quadraticCurveTo(s * 0.18, -s * 0.18, s * 2, 0); ctx.quadraticCurveTo(s * 0.18, s * 0.18, 0, s * 2);
  ctx.quadraticCurveTo(-s * 0.18, s * 0.18, -s * 2, 0); ctx.quadraticCurveTo(-s * 0.18, -s * 0.18, 0, -s * 2); ctx.fill();
  ctx.restore();
}
function stars(ctx, t, n, seed, region = [0, 0, W, H], k = 1) {
  const r = rng(seed);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = region[0] + r() * region[2], y = region[1] + r() * region[3], s = (2 + r() * 7) * k, ph = r() * 6.28, f = 0.6 + r() * 2;
    const a = Math.pow(0.5 + 0.5 * Math.sin(t * f * 2 + ph), 3);
    if (a > 0.04) star4(ctx, x, y, s, a * 0.9);
  }
  ctx.restore();
}
// rising gold dust
function dust(ctx, t, n = 70, seed = 11, k = 1) {
  const r = rng(seed);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const bx = r() * W, sp = 30 + r() * 90, ph = r() * 100, s = 1.5 + r() * 4;
    const y = H + 50 - ((t * sp + ph * 40) % (H + 100));
    const x = bx + Math.sin(t * 0.9 + ph) * 30;
    const a = (0.35 + 0.65 * Math.abs(Math.sin(t * 1.7 + ph))) * k;
    ctx.fillStyle = `rgba(255,${200 + (i % 3) * 20},120,${a * 0.8})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}
function burst(ctx, t, t0, x, y, seed = 3, power = 1) {
  const p = (t - t0) / 1.1; if (p < 0 || p > 1) return;
  const r = rng(seed);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const a = r() * 6.283, v = (250 + r() * 650) * power, s = 3 + r() * 9;
    const d = ease.out(p) * v;
    star4(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d + p * p * 120, s * (1 - p * 0.6), (1 - p) * 0.95);
  }
  ctx.restore();
}
function flash(ctx, t, t0, strength = 1, dur = 0.55) {
  const d = Math.abs(t - t0); if (d > dur) return;
  const a = Math.pow(1 - d / dur, 2) * strength;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.8);
  g.addColorStop(0, `rgba(255,236,170,${a})`); g.addColorStop(0.5, `rgba(255,190,80,${a * 0.6})`); g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
// diagonal light leak sweeping across the frame
function sweep(ctx, t, t0, dur = 0.9, a = 0.55) {
  const p = (t - t0) / dur; if (p < 0 || p > 1) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const x = lerp(-W, W * 2, ease.inOut(p));
  ctx.translate(x, H / 2); ctx.rotate(-0.35);
  const g = ctx.createLinearGradient(-300, 0, 300, 0);
  const k = Math.sin(p * Math.PI) * a;
  g.addColorStop(0, 'rgba(255,210,120,0)'); g.addColorStop(0.5, `rgba(255,232,170,${k})`); g.addColorStop(1, 'rgba(255,210,120,0)');
  ctx.fillStyle = g; ctx.fillRect(-300, -H * 1.5, 600, H * 3);
  ctx.restore();
}
function vignette(ctx, a = 0.55) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(2,5,25,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ---------- cards ----------
/* Draws an image as a framed card centred on (x,y). w = outer width. */
function card(ctx, im, o) {
  const { x, y, w, rot = 0, alpha = 1, scale = 1, radius = 22, border = 10, shadow = 1, shine = -1, glow = 0, frame = '#fffaf0', sx = 1 } = o;
  if (alpha <= 0.003 || scale <= 0.001) return;
  const iw = w - border * 2, ih = iw * (o.ratio || im.height / im.width);
  const h = ih + border * 2;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale * sx, scale); ctx.globalAlpha *= alpha;
  if (glow > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, w * 0.2, 0, 0, w * 0.95);
    g.addColorStop(0, `rgba(255,200,90,${0.45 * glow})`); g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g; ctx.fillRect(-w, -h, w * 2, h * 2); ctx.restore();
  }
  if (shadow) { ctx.shadowColor = `rgba(0,0,20,${0.55 * shadow})`; ctx.shadowBlur = 50; ctx.shadowOffsetY = 26; }
  if (border > 0) { ctx.fillStyle = frame; rrect(ctx, -w / 2, -h / 2, w, h, radius); ctx.fill(); }
  ctx.shadowColor = 'transparent';
  ctx.save();
  rrect(ctx, -iw / 2, -ih / 2, iw, ih, Math.max(4, radius - border));
  ctx.clip();
  if (o.ratio) cover(ctx, im, -iw / 2, -ih / 2, iw, ih, o.zoom || 1, o.px ?? 0.5, o.py ?? 0.5);
  else ctx.drawImage(im, -iw / 2, -ih / 2, iw, ih);
  if (shine >= 0 && shine <= 1) {
    ctx.globalCompositeOperation = 'lighter';
    const sx2 = lerp(-iw, iw, shine);
    const g = ctx.createLinearGradient(sx2 - 160, -ih / 2, sx2 + 160, ih / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,250,220,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-iw / 2, -ih / 2, iw, ih);
  }
  ctx.restore();
  if (o.gold) { ctx.strokeStyle = goldGrad(ctx, -w / 2, -h / 2, w, h); ctx.lineWidth = 6; rrect(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, radius); ctx.stroke(); }
  ctx.restore();
  return h;
}
function cardH(im, w, border = 10) { return (w - border * 2) * (im.height / im.width) + border * 2; }
function goldGrad(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#fff2b8'); g.addColorStop(0.35, '#f6c84e'); g.addColorStop(0.6, '#fff0b0'); g.addColorStop(1, '#d9961c');
  return g;
}
/* transparent cut-out (characters) with soft glow */
function cutout(ctx, im, o) {
  const { x, y, h, alpha = 1, rot = 0, glow = 0.6, flip = false, scale = 1 } = o;
  const w = h * im.width / im.height;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(flip ? -scale : scale, scale); ctx.globalAlpha *= alpha;
  if (glow) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -h * 0.45, 10, 0, -h * 0.45, h * 0.6);
    g.addColorStop(0, `rgba(255,210,120,${0.35 * glow})`); g.addColorStop(1, 'rgba(255,210,120,0)');
    ctx.fillStyle = g; ctx.fillRect(-h * 0.6, -h * 1.05, h * 1.2, h * 1.2); ctx.restore();
  }
  ctx.shadowColor = 'rgba(0,0,30,0.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
  ctx.drawImage(im, -w / 2, -h, w, h);
  ctx.restore();
}

/* 3D page turn. Pages turn around the RIGHT edge (Hebrew books open to the left).
   p in [0,1]. `back` is drawn on the reverse once the page passes 90deg. */
function pageTurn(ctx, front, next, o, p) {
  const { x, y, w } = o; const h = w * front.height / front.width;
  const left = x - w / 2, top = y - h / 2, spine = left + w;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,25,0.55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
  ctx.fillStyle = '#fffaf0'; rrect(ctx, left - 12, top - 12, w + 24, h + 24, 22); ctx.fill();
  ctx.restore();
  ctx.save(); rrect(ctx, left, top, w, h, 12); ctx.clip();
  if (next && p > 0) ctx.drawImage(next, left, top, w, h); else ctx.drawImage(front, left, top, w, h);
  ctx.restore();
  if (!next || p <= 0) return;
  const th = ease.inOut(clamp(p)) * Math.PI;
  const N = 48, D = 2600;
  ctx.save();
  // shadow cast on the next page
  const sh = Math.sin(th) * 0.45;
  if (th < Math.PI / 2) {
    const ex = spine - w * Math.cos(th);
    const g = ctx.createLinearGradient(ex - 140, 0, ex + 40, 0);
    g.addColorStop(0, 'rgba(0,0,30,0)'); g.addColorStop(1, `rgba(0,0,30,${sh})`);
    ctx.save(); rrect(ctx, left, top, w, h, 12); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(ex - 140, top, 180, h); ctx.restore();
  }
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N; // u: 0 at the free (left) edge, 1 at the spine
    const pt = (u) => { const d = (1 - u) * w; const X = -d * Math.cos(th), Z = d * Math.sin(th); const f = D / (D - Z * 0.6); return [spine + X * f, f]; };
    const [xa, fa] = pt(u0), [xb, fb] = pt(u1);
    const sx0 = Math.min(xa, xb), sw = Math.abs(xb - xa) + 0.8, f = (fa + fb) / 2, hh = h * f;
    const showBack = th > Math.PI / 2;
    const srcU = showBack ? 1 - u1 : u0;
    ctx.save();
    ctx.beginPath(); ctx.rect(sx0, y - hh / 2 - 2, sw, hh + 4); ctx.clip();
    if (showBack) { ctx.fillStyle = '#fbf3e2'; ctx.fillRect(sx0, y - hh / 2, sw, hh); }
    else ctx.drawImage(front, srcU * front.width, 0, front.width / N + 1, front.height, sx0, y - hh / 2, sw, hh);
    const shade = showBack ? 0.25 * Math.sin(th) * (1 - u0) : 0.5 * (1 - Math.cos(th)) * 0.5 * (0.4 + u0 * 0.6);
    ctx.fillStyle = `rgba(20,10,0,${shade})`; ctx.fillRect(sx0, y - hh / 2, sw, hh);
    ctx.restore();
  }
  ctx.restore();
}

/* tablet frame for on-screen games */
function tablet(ctx, im, o) {
  const { x, y, w, rot = 0, alpha = 1, scale = 1, tilt = 0 } = o;
  const iw = w - 56, ih = iw * im.height / im.width, h = ih + 56;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale * (1 - Math.abs(tilt) * 0.08)); ctx.globalAlpha *= alpha; const A0 = ctx.globalAlpha;
  ctx.shadowColor = 'rgba(0,0,20,0.6)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 34;
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, '#2b2f45'); g.addColorStop(0.5, '#141726'); g.addColorStop(1, '#2b2f45');
  ctx.fillStyle = g; rrect(ctx, -w / 2, -h / 2, w, h, 46); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,220,150,0.5)'; ctx.lineWidth = 3; rrect(ctx, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 44); ctx.stroke();
  ctx.save(); rrect(ctx, -iw / 2, -ih / 2, iw, ih, 18); ctx.clip();
  if (o.prev && o.mix > 0 && o.mix < 1) { ctx.drawImage(o.prev, -iw / 2, -ih / 2, iw, ih); ctx.globalAlpha = A0 * o.mix; }
  ctx.drawImage(im, -iw / 2, -ih / 2, iw, ih);
  ctx.globalAlpha = A0;
  // glass reflection
  const r = ctx.createLinearGradient(-iw / 2, -ih / 2, iw / 2, ih / 2);
  r.addColorStop(0, 'rgba(255,255,255,0.12)'); r.addColorStop(0.45, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = r; ctx.fillRect(-iw / 2, -ih / 2, iw, ih);
  ctx.restore();
  ctx.fillStyle = '#3a3f58'; ctx.beginPath(); ctx.arc(0, -h / 2 + 15, 6, 0, 6.283); ctx.fill();
  ctx.restore();
  return h;
}
function tap(ctx, t, t0, x, y) {
  const p = (t - t0) / 0.7; if (p < 0 || p > 1) return;
  ctx.save();
  ctx.strokeStyle = `rgba(255,236,170,${1 - p})`; ctx.lineWidth = 8 * (1 - p) + 2;
  ctx.beginPath(); ctx.arc(x, y, 20 + ease.out(p) * 70, 0, 6.283); ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - p)})`; ctx.beginPath(); ctx.arc(x, y, 24, 0, 6.283); ctx.fill();
  ctx.restore();
}

// ---------- typography ----------
const FONT = '"Fredoka", "Rubik", "Noto Sans Hebrew", sans-serif';
function fitSize(ctx, lines, size, maxW, weight) {
  let s = size;
  for (; s > 30; s -= 2) { ctx.font = `${weight} ${s}px ${FONT}`; if (lines.every((l) => ctx.measureText(l).width <= maxW)) break; }
  return s;
}
/* Animated caption. a = appear time, b = disappear time. style: gold | cream | navy */
function caption(ctx, t, text, o) {
  const { a, b = 1e9, y, x = W / 2, size = 96, style = 'gold', maxW = 960, weight = 700, pill = false, lh = 1.18, anim = 'pop' } = o;
  if (t < a || t > b + 0.45) return;
  const pin = clamp((t - a) / 0.55), pout = clamp((t - b) / 0.4);
  const lines = text.split('\n');
  const s = fitSize(ctx, lines, size, maxW, weight);
  ctx.save();
  ctx.font = `${weight} ${s}px ${FONT}`;
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const k = anim === 'pop' ? lerp(0.7, 1, ease.back(pin)) : 1;
  const alpha = ease.out(pin) * (1 - ease.in(pout));
  const dy = (1 - ease.out(pin)) * 40 - ease.in(pout) * 30;
  ctx.globalAlpha = alpha;
  ctx.translate(x, y + dy); ctx.scale(k, k);
  const total = lines.length * s * lh;
  if (pill) {
    let mw = 0; lines.forEach((l) => { mw = Math.max(mw, ctx.measureText(l).width); });
    const pw = mw + s * 1.1, ph = total + s * 0.55;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,20,0.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
    ctx.fillStyle = pill === 'cream' ? 'rgba(255,250,238,0.94)' : 'rgba(8,20,70,0.82)';
    rrect(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2 > 70 ? 46 : ph / 2); ctx.fill(); ctx.restore();
    ctx.strokeStyle = goldGrad(ctx, -pw / 2, -ph / 2, pw, ph); ctx.lineWidth = 4; rrect(ctx, -pw / 2 + 2, -ph / 2 + 2, pw - 4, ph - 4, ph / 2 > 70 ? 44 : ph / 2 - 2); ctx.stroke();
  }
  lines.forEach((l, i) => {
    const ly = -total / 2 + s * lh * (i + 0.5);
    const fill = style === 'gold' ? (() => { const g = ctx.createLinearGradient(0, ly - s / 2, 0, ly + s / 2); g.addColorStop(0, '#fff7d1'); g.addColorStop(0.45, '#ffd45a'); g.addColorStop(1, '#e9a020'); return g; })()
      : style === 'navy' ? '#122a78' : '#fffaf0';
    if (style !== 'navy') {
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(6,14,52,0.92)'; ctx.lineWidth = s * 0.16; ctx.strokeText(l, 0, ly);
      ctx.save(); ctx.shadowColor = style === 'gold' ? 'rgba(255,190,70,0.75)' : 'rgba(150,200,255,0.5)'; ctx.shadowBlur = s * 0.35;
      ctx.fillStyle = fill; ctx.fillText(l, 0, ly); ctx.restore();
    }
    ctx.fillStyle = fill; ctx.fillText(l, 0, ly);
  });
  ctx.restore();
}
/* small label chip under a card */
function chip(ctx, text, x, y, o = {}) {
  const { size = 44, alpha = 1, scale = 1, bg = 'rgba(255,250,238,0.96)', fg = '#122a78' } = o;
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.font = `700 ${size}px ${FONT}`; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + size * 1.1, h = size * 1.55;
  ctx.shadowColor = 'rgba(0,0,20,0.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = bg; rrect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.strokeStyle = goldGrad(ctx, -w / 2, -h / 2, w, h); ctx.lineWidth = 4; rrect(ctx, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, h / 2 - 2); ctx.stroke();
  ctx.fillStyle = fg; ctx.fillText(text, 0, 2);
  ctx.restore();
}

// ---------- composite layouts ----------
/* tilted infinite wall of materials */
function wall(ctx, t, names, o = {}) {
  const { cols = 4, cw = 330, gap = 34, angle = -0.2, speed = 90, alpha = 1, zoom = 1, cx = W / 2, cy = H / 2, seed = 5 } = o;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.rotate(angle); ctx.scale(zoom, zoom);
  const colW = cw + gap;
  for (let c = -1; c <= cols; c++) {
    const dir = c % 2 ? 1 : -1;
    let yy = -H * 1.2 + ((t * speed * dir) % 2000);
    let k = (c * 7 + seed) % names.length; if (k < 0) k += names.length;
    const x = (c - (cols - 1) / 2) * colW;
    while (yy < H * 1.3) {
      const im = img(names[k % names.length]);
      const h = cardH(im, cw, 8);
      card(ctx, im, { x, y: yy + h / 2, w: cw, border: 8, radius: 16, shadow: 0.7 });
      yy += h + gap; k += 3;
    }
  }
  ctx.restore();
}

/* fan of cards around a pivot */
function fan(ctx, ims, o) {
  const { x, y, w, spread, radius = 1400, alpha = 1, lift = 0, scale = 1 } = o;
  const n = ims.length;
  ims.forEach((im, i) => {
    const k = i - (n - 1) / 2; const a = k * spread;
    const px = x + Math.sin(a) * radius, py = y + radius - Math.cos(a) * radius - (i === o.hi ? lift : 0);
    card(ctx, im, { x: px, y: py, w, rot: a, alpha, scale, border: 9, radius: 16 });
  });
}

window.ENGINE = { W, H, IMG, img, loadImages, clamp, lerp, prog, ease, rng, rrect, cover, background, stars, dust, burst, flash, sweep, vignette, card, cardH, cutout, pageTurn, tablet, tap, caption, chip, wall, fan, goldGrad, star4, FONT };
