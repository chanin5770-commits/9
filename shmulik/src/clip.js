/* שמוליק — מלך האות ד׳
 * Deterministic canvas renderer: CLIP.render(ctx, t) draws frame at time t (seconds).
 * Every scene time is snapped to the song's detected beat grid (audio/beats.json). */
'use strict';
(function () {
  const W = 1080, H = 1920;
  const C = {
    navy: '#0a1a4a', deep: '#06102e', royal: '#1d4fd8', sky: '#8fd3ff',
    gold: '#f7c948', gold2: '#ffe9a0', goldD: '#b8860b', pearl: '#fdfaf2', cream: '#fff4dc',
  };
  const FONT = 'Heebo, sans-serif';
  const CLIP = { W, H, DUR: 165.72 };
  let BEATS = [];
  const IMG = {};

  // ---------- helpers ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, d) => clamp((t - a) / d);
  const eOut = (k) => 1 - Math.pow(1 - k, 3);
  const eInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const eBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  const eBounce = (x) => {
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  };
  function rnd(seed) { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  const S = (t) => { // snap to nearest beat
    let best = t, bd = 1e9;
    for (const b of BEATS) { const d = Math.abs(b - t); if (d < bd) { bd = d; best = b; } }
    return best;
  };
  function lastBeat(t) { let lb = -10; for (const b of BEATS) { if (b <= t) lb = b; else break; } return lb; }
  const pulse = (t) => Math.exp(-(t - lastBeat(t)) * 7);

  // ---------- drawing primitives ----------
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function goldGrad(ctx, x0, y0, x1, y1, shift = 0) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    const s = ((shift % 1) + 1) % 1;
    const stops = [[0, '#a8730a'], [0.25, '#ffe38a'], [0.45, '#f5b82e'], [0.6, '#fff6c8'], [0.8, '#d99a1c'], [1, '#8a5a06']];
    for (const [o, c] of stops) g.addColorStop((o + s) % 1, c);
    // keep gradient valid when offsets wrap: add edge stops
    g.addColorStop(0, '#d99a1c'); g.addColorStop(1, '#d99a1c');
    return g;
  }

  function star(ctx, x, y, r, a) {
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y);
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const rad = i % 2 ? r * 0.22 : r; const an = i * Math.PI / 4; ctx.lineTo(Math.cos(an) * rad, Math.sin(an) * rad); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Royal background: gradient + rays + twinkling stars + drifting gold dust
  function background(ctx, t, opt = {}) {
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H * 0.5, H * 0.85);
    g.addColorStop(0, opt.light ? '#2a5fd6' : '#1b3f9e'); g.addColorStop(0.5, '#0d2468'); g.addColorStop(1, C.deep);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    rays(ctx, W / 2, opt.rayY ?? H * 0.45, t, opt.rays ?? 0.18);
    // stars
    for (let i = 0; i < 90; i++) {
      const x = rnd(i) * W, y = rnd(i + 100) * H;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.8 + rnd(i + 7) * 2) + i));
      const r = 1.2 + rnd(i + 3) * 2.6;
      ctx.fillStyle = `rgba(255,248,220,${0.25 + 0.6 * tw})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (i % 11 === 0) star(ctx, x, y, 10 + 10 * tw, 0.8 * tw);
    }
    dust(ctx, t, 50, 1);
  }
  function rays(ctx, cx, cy, t, a) {
    if (a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(cx, cy); ctx.rotate(t * 0.08);
    const n = 14;
    for (let i = 0; i < n; i++) {
      ctx.rotate(Math.PI * 2 / n);
      const g = ctx.createLinearGradient(0, 0, 0, -1500);
      g.addColorStop(0, `rgba(255,220,120,${a})`); g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-70, -1500); ctx.lineTo(70, -1500); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function dust(ctx, t, n, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const sp = 30 + rnd(i + 50) * 70;
      const x = (rnd(i + 20) * W + Math.sin(t * 0.7 + i) * 40);
      const y = ((rnd(i + 30) * H - t * sp) % H + H) % H;
      const r = 1.5 + rnd(i + 40) * 3.5;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i * 1.7));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, `rgba(255,215,110,${0.7 * tw * a})`); g.addColorStop(1, 'rgba(255,215,110,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    }
    ctx.restore();
  }
  // radial sparkle burst at time t0
  function burst(ctx, t, t0, x, y, n = 40, spread = 520, seed = 1) {
    const k = (t - t0) / 1.4;
    if (k < 0 || k > 1) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const an = rnd(seed * 97 + i) * Math.PI * 2;
      const sp = spread * (0.35 + 0.65 * rnd(seed * 31 + i));
      const d = eOut(k) * sp;
      const px = x + Math.cos(an) * d, py = y + Math.sin(an) * d + k * k * 160;
      const a = (1 - k);
      if (i % 3 === 0) star(ctx, px, py, 16 * (1 - k * 0.5), a);
      else { ctx.fillStyle = i % 2 ? `rgba(255,214,90,${a})` : `rgba(180,225,255,${a})`; ctx.beginPath(); ctx.arc(px, py, 5 * (1 - k * 0.5), 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }
  function flash(ctx, t, t0, d = 0.7, color = '255,240,200') {
    const k = (t - t0) / d; if (k < 0 || k > 1) return;
    ctx.save(); ctx.fillStyle = `rgba(${color},${Math.pow(1 - k, 2) * 0.95})`; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  // diagonal gold light sweep (transition accent)
  function sweep(ctx, t, t0, d = 0.6) {
    const k = (t - t0) / d; if (k < 0 || k > 1) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const x = lerp(-700, W + 700, eInOut(k));
    ctx.translate(x, H / 2); ctx.rotate(-0.35);
    const g = ctx.createLinearGradient(-220, 0, 220, 0);
    g.addColorStop(0, 'rgba(255,215,120,0)'); g.addColorStop(0.5, `rgba(255,235,170,${0.55 * Math.sin(k * Math.PI)})`); g.addColorStop(1, 'rgba(255,215,120,0)');
    ctx.fillStyle = g; ctx.fillRect(-220, -H, 440, H * 2);
    ctx.restore();
  }

  // ---------- crown ----------
  function crown(ctx, x, y, w, t, opt = {}) {
    const h = w * 0.62;
    ctx.save(); ctx.translate(x, y); ctx.rotate(opt.rot || 0);
    ctx.shadowColor = 'rgba(255,200,80,0.8)'; ctx.shadowBlur = w * 0.15;
    ctx.beginPath();
    const pts = [[-0.5, 0.5], [-0.5, -0.05], [-0.38, 0.18], [-0.25, -0.32], [-0.12, 0.12], [0, -0.5], [0.12, 0.12], [0.25, -0.32], [0.38, 0.18], [0.5, -0.05], [0.5, 0.5]];
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * w, py * h) : ctx.moveTo(px * w, py * h)));
    ctx.closePath();
    ctx.fillStyle = goldGrad(ctx, -w / 2, -h / 2, w / 2, h / 2, t * 0.25);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = w * 0.025; ctx.strokeStyle = '#7a4b00'; ctx.stroke();
    // band
    rr(ctx, -w * 0.52, h * 0.3, w * 1.04, h * 0.26, h * 0.06);
    ctx.fillStyle = goldGrad(ctx, -w / 2, 0, w / 2, h, t * 0.25 + 0.3); ctx.fill(); ctx.stroke();
    // jewels
    const jew = [[-0.33, 0.43, '#2f6bff'], [0, 0.43, '#e0283c'], [0.33, 0.43, '#2fbf5b']];
    for (const [jx, jy, c] of jew) {
      ctx.beginPath(); ctx.arc(jx * w, jy * h, w * 0.055, 0, 7); ctx.fillStyle = c; ctx.fill();
      ctx.lineWidth = w * 0.012; ctx.strokeStyle = '#fff3b0'; ctx.stroke();
      ctx.beginPath(); ctx.arc(jx * w - w * 0.018, jy * h - w * 0.018, w * 0.016, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    }
    for (const [px, py] of [[-0.5, -0.05], [-0.25, -0.32], [0, -0.5], [0.25, -0.32], [0.5, -0.05]]) {
      ctx.beginPath(); ctx.arc(px * w, py * h, w * 0.045, 0, 7); ctx.fillStyle = '#fff8dc'; ctx.fill();
      ctx.lineWidth = w * 0.01; ctx.strokeStyle = '#b8860b'; ctx.stroke();
    }
    // glint
    const gk = ((t * 0.5) % 1.6) - 0.3;
    if (gk > 0 && gk < 1) star(ctx, lerp(-w * 0.4, w * 0.4, gk), -h * 0.1, w * 0.09, Math.sin(gk * Math.PI));
    ctx.restore();
  }

  // ---------- 3D letters ----------
  // Custom ד path (unit box 0..1, roof extends past the stem to the right — the corner that tells ד from ר)
  function daletPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0.0 * s, 0.0 * s); ctx.lineTo(1.0 * s, 0.0 * s); ctx.lineTo(1.0 * s, 0.2 * s);
    ctx.lineTo(0.86 * s, 0.2 * s); ctx.lineTo(0.86 * s, 1.08 * s); ctx.lineTo(0.64 * s, 1.08 * s);
    ctx.lineTo(0.64 * s, 0.2 * s); ctx.lineTo(0.03 * s, 0.2 * s);
    ctx.quadraticCurveTo(0.0 * s, 0.2 * s, 0.0 * s, 0.16 * s);
    ctx.closePath();
  }
  function bigDalet(ctx, x, y, size, t, opt = {}) {
    const turn = opt.turn || 0; // radians around Y
    const sx = Math.cos(turn);
    ctx.save(); ctx.translate(x, y); ctx.scale(sx * (opt.scale || 1), opt.scale || 1);
    ctx.translate(-size / 2, -size * 0.54);
    const depth = size * 0.09;
    // extrusion
    for (let i = Math.round(depth / 3); i >= 1; i--) {
      ctx.save(); ctx.translate(i * 3 * 0.55 * Math.sign(sx || 1), i * 3);
      daletPath(ctx, size); ctx.fillStyle = i < 3 ? '#8a5a06' : '#0b2a78'; ctx.fill(); ctx.restore();
    }
    // glow
    ctx.shadowColor = 'rgba(120,190,255,0.9)'; ctx.shadowBlur = size * 0.12;
    daletPath(ctx, size);
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#79c2ff'); g.addColorStop(0.45, '#2a66e8'); g.addColorStop(1, '#123a9e');
    ctx.fillStyle = g; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = size * 0.035; ctx.lineJoin = 'round';
    ctx.strokeStyle = goldGrad(ctx, 0, 0, size, size, t * 0.3); ctx.stroke();
    // gloss
    ctx.save(); daletPath(ctx, size); ctx.clip();
    const gl = ctx.createLinearGradient(0, 0, 0, size * 0.25);
    gl.addColorStop(0, 'rgba(255,255,255,0.55)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, size, size * 0.2);
    const sk = ((t * 0.45) % 1.8) - 0.4; // moving shine
    ctx.translate(sk * size * 1.5, 0); ctx.rotate(0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(-size * 0.06, -size, size * 0.12, size * 3);
    ctx.restore();
    ctx.restore();
  }
  // Font-based 3D glyph (for א ב ג)
  function glyph3D(ctx, ch, x, y, size, t, opt = {}) {
    const sx = Math.cos(opt.turn || 0);
    ctx.save(); ctx.translate(x, y); ctx.scale(sx * (opt.scale || 1), opt.scale || 1);
    ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    const depth = Math.round(size * 0.07 / 3);
    for (let i = depth; i >= 1; i--) { ctx.fillStyle = i < 2 ? '#8a5a06' : (opt.side || '#0b2a78'); ctx.fillText(ch, i * 3 * 0.55, i * 3); }
    ctx.shadowColor = opt.glow || 'rgba(255,210,100,0.9)'; ctx.shadowBlur = size * 0.12;
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    (opt.face || [['#ffffff', 0], ['#cfe6ff', 0.5], ['#7fb2ff', 1]]).forEach(([c, o]) => g.addColorStop(o, c));
    ctx.fillStyle = g; ctx.fillText(ch, 0, 0);
    ctx.shadowBlur = 0;
    ctx.lineWidth = size * 0.03; ctx.strokeStyle = goldGrad(ctx, -size / 2, -size / 2, size / 2, size / 2, t * 0.3); ctx.strokeText(ch, 0, 0);
    ctx.restore();
  }
  function smallDalet(ctx, x, y, s, a, rot) {
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(rot); ctx.translate(-s / 2, -s / 2);
    daletPath(ctx, s); ctx.fillStyle = 'rgba(255,215,110,0.85)'; ctx.fill();
    ctx.lineWidth = s * 0.05; ctx.strokeStyle = 'rgba(255,250,220,0.9)'; ctx.stroke();
    ctx.restore();
  }
  function floatingDalets(ctx, t, n = 7, a = 0.5) {
    for (let i = 0; i < n; i++) {
      const sp = 40 + rnd(i + 300) * 50;
      const x = rnd(i + 310) * W;
      const y = ((rnd(i + 320) * (H + 300) - t * sp) % (H + 300) + H + 300) % (H + 300) - 150;
      smallDalet(ctx, x + Math.sin(t + i) * 30, y, 40 + rnd(i + 330) * 50, a * (0.5 + 0.5 * Math.sin(t * 1.3 + i)), Math.sin(t * 0.8 + i) * 0.4);
    }
  }

  // ---------- text ----------
  function title(ctx, text, x, y, size, t, opt = {}) {
    const k = opt.k ?? 1; if (k <= 0) return;
    const sc = opt.noPop ? 1 : (k < 1 ? eBack(k) : 1);
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha *= clamp(k * 2);
    ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.2; ctx.strokeStyle = 'rgba(6,16,46,0.85)'; ctx.strokeText(text, 0, 0);
    ctx.shadowColor = opt.glow || 'rgba(255,200,80,0.85)'; ctx.shadowBlur = size * 0.25;
    ctx.fillStyle = opt.white ? '#ffffff' : goldGrad(ctx, -size * 2, -size / 2, size * 2, size / 2, t * 0.2);
    ctx.fillText(text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.lineWidth = size * 0.035; ctx.strokeStyle = opt.white ? 'rgba(255,215,110,0.9)' : 'rgba(255,250,225,0.7)';
    ctx.strokeText(text, 0, 0);
    ctx.restore();
  }
  // caption ribbon (pearl banner with gold edges)
  function ribbon(ctx, text, y, t, k, size = 64) {
    size *= 1.15;
    if (k <= 0) return;
    ctx.save();
    ctx.font = `800 ${size}px ${FONT}`; ctx.direction = 'rtl';
    const w = Math.min(W - 60, ctx.measureText(text).width + 120), h = size * 1.7;
    const e = eBack(clamp(k));
    ctx.translate(W / 2, y); ctx.scale(e, e); ctx.globalAlpha *= clamp(k * 2);
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    rr(ctx, -w / 2, -h / 2, w, h, h / 2);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#fffdf6'); g.addColorStop(1, '#f6ead0');
    ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 8; ctx.strokeStyle = goldGrad(ctx, -w / 2, 0, w / 2, 0, t * 0.3); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.navy; ctx.fillText(text, 0, size * 0.04);
    ctx.restore();
  }
  // word card with the leading ד highlighted (like the gan's word cards)
  function wordCard(ctx, word, x, y, size, t, k) {
    if (k <= 0) return;
    ctx.save();
    ctx.font = `900 ${size}px ${FONT}`; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(word).width;
    const w = tw + size * 0.9, h = size * 1.45;
    const e = eBack(clamp(k));
    ctx.translate(x, y); ctx.rotate((1 - clamp(k)) * -0.3); ctx.scale(e, e); ctx.globalAlpha *= clamp(k * 2);
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    rr(ctx, -w / 2, -h / 2, w, h, 36);
    ctx.fillStyle = C.pearl; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.lineWidth = 12; ctx.strokeStyle = goldGrad(ctx, -w / 2, -h / 2, w / 2, h / 2, t * 0.3); ctx.stroke();
    const xr = tw / 2;
    ctx.fillStyle = C.navy; ctx.fillText(word, xr, size * 0.05);
    // overdraw first letter (rightmost in RTL) as glowing royal-blue ד with highlight
    const dw = ctx.measureText('ד').width;
    ctx.fillStyle = 'rgba(255,230,60,0.75)';
    rr(ctx, xr - dw - size * 0.06, -size * 0.42, dw + size * 0.12, size * 0.84, 14); ctx.fill();
    ctx.shadowColor = 'rgba(40,110,255,0.8)'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#1d4fd8'; ctx.fillText('ד', xr, size * 0.05);
    ctx.restore();
  }

  // ---------- photo frame ----------
  // spec: {img, crop:[x,y,w,h] (0..1), focus:[fx,fy], zoom:[z0,z1]}
  function photoRect(spec) {
    const im = IMG[spec.img]; const c = spec.crop || [0, 0, 1, 1];
    return { im, sx: c[0] * im.width, sy: c[1] * im.height, sw: c[2] * im.width, sh: c[3] * im.height };
  }
  function aspect(spec) { const p = photoRect(spec); return p.sw / p.sh; }
  function framedPhoto(ctx, spec, cx, cy, w, h, t, lt, opt = {}) {
    const p = photoRect(spec);
    const z = lerp((spec.zoom || [1.0, 1.07])[0], (spec.zoom || [1.0, 1.07])[1], clamp(lt / (opt.dur || 6)));
    const [fx, fy] = spec.focus || [0.5, 0.45];
    const sw = p.sw / z, sh = p.sh / z;
    const sx = clamp(p.sx + fx * p.sw - sw / 2, p.sx, p.sx + p.sw - sw);
    const sy = clamp(p.sy + fy * p.sh - sh / 2, p.sy, p.sy + p.sh - sh);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(opt.rot || 0);
    const x = -w / 2, y = -h / 2, b = opt.border ?? 16;
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
    rr(ctx, x - b, y - b, w + 2 * b, h + 2 * b, 30);
    ctx.fillStyle = goldGrad(ctx, x, y, x + w, y + h, t * 0.15); ctx.fill();
    ctx.shadowColor = 'transparent';
    rr(ctx, x - 3, y - 3, w + 6, h + 6, 20); ctx.fillStyle = C.pearl; ctx.fill();
    ctx.save(); rr(ctx, x, y, w, h, 18); ctx.clip();
    ctx.drawImage(p.im, sx, sy, sw, sh, x, y, w, h);
    ctx.restore();
    if (b >= 12) for (const [jx, jy] of [[x - b / 2, y - b / 2], [x + w + b / 2, y - b / 2], [x - b / 2, y + h + b / 2], [x + w + b / 2, y + h + b / 2]]) {
      ctx.beginPath(); ctx.arc(jx, jy, b * 1.05, 0, 7); ctx.fillStyle = '#1d4fd8'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffe38a'; ctx.stroke();
      ctx.beginPath(); ctx.arc(jx - 4, jy - 4, b * 0.3, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    }
    ctx.restore();
  }
  function photoBg(ctx, img, a) {
    if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a; ctx.drawImage(IMG[img + '-bg'], 0, 0, W, H); ctx.restore();
  }
  // enter/exit transform for a card
  function cardTx(kind, lt, len) {
    const ki = clamp(lt / 0.55), ko = clamp((lt - (len - 0.35)) / 0.35);
    let dx = 0, dy = 0, sc = 1, rot = 0, a = 1, sx = 1;
    const e = eBack(ki);
    if (kind === 'zoom') { sc = lerp(0.55, 1, e); a = clamp(ki * 2); }
    else if (kind === 'right') { dx = (1 - eOut(ki)) * 1200; rot = (1 - eOut(ki)) * 0.12; }
    else if (kind === 'left') { dx = -(1 - eOut(ki)) * 1200; rot = -(1 - eOut(ki)) * 0.12; }
    else if (kind === 'drop') { dy = -(1 - eBounce(ki)) * 1500; }
    else if (kind === 'flip') { sx = Math.max(0.02, eOut(ki)); a = clamp(ki * 3); }
    else if (kind === 'spin') { sc = lerp(0.3, 1, e); rot = (1 - eOut(ki)) * -0.6; a = clamp(ki * 2); }
    sc *= 1 + ko * 0.12; a *= 1 - ko;
    return { dx, dy, sc, rot, a, sx };
  }

  // ---------- scenes ----------
  const scenes = [];
  function add(t0, t1, draw, opt = {}) { scenes.push({ t0, t1, draw, ...opt }); }

  function photoScene(t0, t1, spec, o = {}) {
    add(t0, t1, (ctx, t, lt, len) => {
      background(ctx, t, { rays: 0.12 });
      photoBg(ctx, spec.img, 0.75 * clamp(lt / 0.4) * (1 - clamp((lt - len + 0.3) / 0.3)));
      floatingDalets(ctx, t, 6, 0.4);
      const tx = cardTx(o.enter || 'zoom', lt, len);
      const ar = aspect(spec);
      const maxW = o.maxW || 900, maxH = o.maxH || 1300;
      let w = maxW, h = w / ar; if (h > maxH) { h = maxH; w = h * ar; }
      const bp = o.beat ? 1 + 0.012 * pulse(t) : 1;
      const cy = (o.cy || 960) + Math.sin(lt * 0.9) * 8;
      ctx.save(); ctx.globalAlpha *= tx.a;
      ctx.translate(W / 2 + tx.dx, cy + tx.dy); ctx.rotate(tx.rot); ctx.scale(tx.sc * tx.sx * bp, tx.sc * bp);
      framedPhoto(ctx, spec, 0, 0, w, h, t, lt, { dur: len });
      if (o.crownTop) crown(ctx, 0, -h / 2 - 70, 190, t);
      ctx.restore();
      if (o.caption) ribbon(ctx, o.caption, o.capY || (cy + h / 2 + 130 > H - 80 ? H - 150 : cy + h / 2 + 120), t, prog(lt, o.capAt ?? 0.5, 0.45) * (1 - clamp((lt - len + 0.3) / 0.3)), o.capSize || 62);
      if (o.title) title(ctx, o.title, W / 2, o.titleY || 200, o.titleSize || 110, t, { k: prog(lt, o.titleAt ?? 0.3, 0.5) * (1 - clamp((lt - len + 0.3) / 0.3)) });
      burst(ctx, t, t0 + 0.35, W / 2, cy - h / 2, 26, 420, Math.round(t0 * 10));
      sweep(ctx, t, t0, 0.6);
    });
  }
  // vertical stack of 2–3 photos entering on successive beats
  function stackScene(t0, t1, specs, o = {}) {
    add(t0, t1, (ctx, t, lt, len) => {
      background(ctx, t, { rays: 0.14 });
      photoBg(ctx, specs[0].img, 0.5 * clamp(lt / 0.4) * (1 - clamp((lt - len + 0.3) / 0.3)));
      floatingDalets(ctx, t, 5, 0.35);
      const n = specs.length, gap = 60;
      const top = o.top ?? (n === 3 ? 210 : 330);
      const avail = (o.bottom ?? (n === 3 ? 1700 : 1650)) - top - gap * (n - 1);
      const hs = specs.map((s) => Math.min(avail / n, (o.maxW || 960) / aspect(s)));
      let y = top + (avail - hs.reduce((a, b) => a + b, 0)) / 2;
      const beatGap = o.stagger ?? 0.79;
      specs.forEach((s, i) => {
        const h = hs[i], w = h * aspect(s);
        const lti = lt - i * beatGap;
        if (lti < 0) { y += h + gap; return; }
        const tx = cardTx(i % 2 ? 'left' : 'right', lti, len - i * beatGap);
        const bp = o.beat ? 1 + 0.01 * pulse(t) : 1;
        ctx.save(); ctx.globalAlpha *= tx.a;
        ctx.translate(W / 2 + tx.dx, y + h / 2 + tx.dy); ctx.rotate(tx.rot + (i % 2 ? 0.015 : -0.015)); ctx.scale(tx.sc * bp, tx.sc * bp);
        framedPhoto(ctx, s, 0, 0, w, h, t, lti, { dur: len, border: 12 });
        ctx.restore();
        burst(ctx, t, t0 + i * beatGap + 0.3, W / 2, y + h / 2, 18, 380, Math.round(t0 * 10) + i);
        y += h + gap;
      });
      const fade = 1 - clamp((lt - len + 0.3) / 0.3);
      if (o.title) title(ctx, o.title, W / 2, o.titleY || 130, o.titleSize || 96, t, { k: prog(lt, 0.2, 0.5) * fade });
      if (o.caption) ribbon(ctx, o.caption, o.capY || 1800, t, prog(lt, o.capAt ?? 0.6, 0.45) * fade, o.capSize || 58);
      sweep(ctx, t, t0, 0.6);
    });
  }
  // object with ד: photo on top, word card underneath
  function objectScene(t0, t1, spec, word, o = {}) {
    add(t0, t1, (ctx, t, lt, len) => {
      background(ctx, t, { rays: 0.2, rayY: 1600 });
      floatingDalets(ctx, t, 6, 0.45);
      const tx = cardTx(o.enter || 'zoom', lt, len);
      const ar = aspect(spec);
      let w = 860, h = w / ar; if (h > 1180) { h = 1180; w = h * ar; }
      const cy = 110 + 590 + Math.sin(lt * 1.1) * 6;
      const bp = 1 + 0.012 * pulse(t);
      ctx.save(); ctx.globalAlpha *= tx.a;
      ctx.translate(W / 2 + tx.dx, cy + tx.dy); ctx.rotate(tx.rot); ctx.scale(tx.sc * tx.sx * bp, tx.sc * bp);
      framedPhoto(ctx, spec, 0, 0, w, h, t, lt, { dur: len });
      ctx.restore();
      const fade = 1 - clamp((lt - len + 0.3) / 0.3);
      const wk = prog(lt, o.wordAt ?? 0.79, 0.5) * fade;
      wordCard(ctx, word, W / 2, 1530, 210, t, wk);
      ribbon(ctx, 'מתחיל באות ד׳', 1790, t, prog(lt, (o.wordAt ?? 0.79) + 0.4, 0.4) * fade, 50);
      burst(ctx, t, t0 + (o.wordAt ?? 0.79) + 0.2, W / 2, 1530, 34, 520, Math.round(t0 * 10));
      sweep(ctx, t, t0, 0.6);
    });
  }
  // "מלך, מלך, מלך האותיות!" chorus hook card
  function hookScene(t0, t1, beats, o = {}) {
    add(t0, t1, (ctx, t, lt, len) => {
      background(ctx, t, { rays: 0.3, light: true, rayY: 900 });
      floatingDalets(ctx, t, 10, 0.55);
      const fade = 1 - clamp((lt - len + 0.3) / 0.3);
      crown(ctx, W / 2, 470 + Math.sin(t * 2) * 10, 380 * (1 + 0.04 * pulse(t)), t, { rot: Math.sin(t * 1.5) * 0.04 });
      const words = ['מלך,', 'מלך,', 'מלך'];
      words.forEach((wd, i) => title(ctx, wd, W / 2 + (i - 1) * -320, 900, 135, t, { k: prog(t, beats[i], 0.35) * fade, white: true }));
      title(ctx, 'האותיות!', W / 2, 1130, 190, t, { k: prog(t, beats[3], 0.45) * fade });
      for (let i = 0; i < 4; i++) burst(ctx, t, beats[i], W / 2 + (i < 3 ? (i - 1) * -320 : 0), i < 3 ? 900 : 1130, 26, 380, i + 7);
      if (o.photos) o.photos.forEach((p, i) => {
        const k = prog(t, beats[3] + 0.3 + i * 0.4, 0.5) * fade;
        if (k <= 0) return;
        const ar = aspect(p), h = 380, w = h * ar;
        const x = W / 2 + (i - (o.photos.length - 1) / 2) * 330;
        ctx.save(); ctx.globalAlpha *= clamp(k * 2); ctx.translate(x, 1520 + (1 - eBack(k)) * 400); ctx.rotate((i - 1) * 0.08);
        framedPhoto(ctx, p, 0, 0, w, h, t, lt, { dur: len, border: 10 }); ctx.restore();
      });
      flash(ctx, t, t0, 0.5);
    });
  }
  // fast montage: one photo per cut on the beat grid
  function montageScene(t0, t1, specs, cuts, o = {}) {
    add(t0, t1, (ctx, t, lt, len) => {
      let i = 0; while (i < cuts.length - 1 && t >= cuts[i + 1]) i++;
      const s = specs[i % specs.length], ci = cuts[i];
      background(ctx, t, { rays: 0.22, light: true });
      photoBg(ctx, s.img, 0.6);
      floatingDalets(ctx, t, 8, 0.5);
      const k = clamp((t - ci) / 0.25);
      const ar = aspect(s); let w = 940, h = w / ar; if (h > 1250) { h = 1250; w = h * ar; }
      const sc = lerp(1.18, 1, eOut(k)) * (1 + 0.015 * pulse(t));
      ctx.save(); ctx.translate(W / 2, 1020); ctx.rotate((i % 2 ? 1 : -1) * 0.025); ctx.scale(sc, sc);
      framedPhoto(ctx, s, 0, 0, w, h, t, t - ci, { dur: 2 });
      ctx.restore();
      flash(ctx, t, ci, 0.25, '255,245,215');
      const fade = 1 - clamp((lt - len + 0.3) / 0.3);
      if (o.title) title(ctx, o.title, W / 2, 190, 112, t, { k: prog(lt, 0.2, 0.5) * fade, white: true });
      if (o.title2) title(ctx, o.title2, W / 2, 1810, 120, t, { k: prog(lt, 0.6, 0.5) * fade });
    });
  }
  // polaroid wall — photos pin in one by one
  function wallScene(t0, t1, specs, o = {}) {
    add(t0, t1, (ctx, t, lt, len) => {
      background(ctx, t, { rays: 0.18 });
      floatingDalets(ctx, t, 6, 0.4);
      const fade = 1 - clamp((lt - len + 0.4) / 0.4);
      const cols = 2, cw = 470, chh = 420, x0 = W / 2 - cw / 2 - 20, y0 = 520;
      specs.forEach((s, i) => {
        const k = prog(lt, 0.2 + i * 0.79, 0.45);
        if (k <= 0) return;
        const c = i % cols, r = Math.floor(i / cols);
        const x = c ? x0 + cw + 40 - cw : x0 + cw + 40; // RTL: first item on the right
        const xx = c === 0 ? W / 2 + cw / 2 + 10 : W / 2 - cw / 2 - 10;
        const y = y0 + r * (chh + 30);
        const ar = aspect(s); let w = cw - 30, h = w / ar; if (h > chh - 30) { h = chh - 30; w = h * ar; }
        const rot = (rnd(i + 900) - 0.5) * 0.12;
        ctx.save(); ctx.globalAlpha *= clamp(k * 2) * fade;
        ctx.translate(xx, y + (1 - eBack(k)) * -300); ctx.rotate(rot); ctx.scale(lerp(1.6, 1, eOut(k)), lerp(1.6, 1, eOut(k)));
        framedPhoto(ctx, s, 0, 0, w, h, t, lt, { dur: len, border: 9 });
        ctx.restore();
        void x;
      });
      if (o.title) title(ctx, o.title, W / 2, 190, 96, t, { k: prog(lt, 0.3, 0.5) * fade });
      sweep(ctx, t, t0, 0.6);
    });
  }

  // ---------- build timeline (needs BEATS) ----------
  function build() {
    scenes.length = 0;
    const b = (i) => BEATS[i];
    const P = (img, extra = {}) => ({ img, ...extra });

    // INTRO 0 – 18.46: the journey of the letters → ד → crown → Shmulik
    const tA = b(6), tB = b(12), tC = b(18), tNow = b(24), tD = b(28), tCrown = b(32), tReveal = b(36);
    add(0, tReveal + 0.8, (ctx, t) => {
      background(ctx, t, { rays: t > tD ? 0.32 : 0.1, rayY: 1000 });
      const fadeIn = clamp(t / 0.8);
      // "למדנו את האותיות..."
      const k0 = prog(t, b(0), 0.9) * (1 - prog(t, tD - 0.6, 0.5));
      ctx.save(); ctx.globalAlpha = fadeIn;
      title(ctx, 'למדנו את האותיות...', W / 2, 420 - (1 - eOut(clamp(k0 * 1.5))) * 40, 96, t, { k: k0, white: true, noPop: true });
      // camera pull-back on the lineup
      const pull = eInOut(prog(t, tC + 1.0, 2.4));
      const toTop = eInOut(prog(t, tD, 0.6));
      const ly = lerp(lerp(980, 820, pull), 300, toTop), ls = lerp(lerp(1, 0.78, pull), 0.42, toTop);
      const letters = [['א', 800, tA, 'right'], ['ב', 540, tB, 'hop'], ['ג', 280, tC, 'zoom']];
      for (const [ch, x0, ti, kind] of letters) {
        const k = prog(t, ti, 0.7); if (k <= 0) continue;
        let x = lerp(W / 2, x0, ls / 1) , y = ly, sc = ls, turn = 0;
        x = W / 2 + (x0 - W / 2) * ls;
        if (kind === 'right') x += (1 - eOut(k)) * 900;
        if (kind === 'hop') { y -= Math.sin(clamp(k) * Math.PI) * 260; turn = (1 - eOut(k)) * Math.PI * 2; }
        if (kind === 'zoom') sc *= eBack(k);
        const bob = Math.sin(t * 2.2 + x0) * 10 * (1 - toTop);
        glyph3D(ctx, ch, x, y + bob, 300, t, { scale: sc, turn });
        burst(ctx, t, ti + 0.45, x, y, 30, 340, x0);
      }
      // "ועכשיו..."
      title(ctx, 'ועכשיו...', W / 2, 1300, 130, t, { k: prog(t, tNow, 0.5) * (1 - prog(t, tD - 0.15, 0.2)) });
      // big ד
      if (t >= tD - 0.05) {
        const k = prog(t, tD, 0.9);
        const away = eInOut(prog(t, tReveal, 0.7));
        const x = lerp(W / 2, 150, away), y = lerp(1060, 150, away), sc = lerp(eBack(k) * (1 + 0.03 * pulse(t)), 0.16, away);
        ctx.globalAlpha = fadeIn * (1 - prog(t, tReveal + 0.4, 0.4));
        rays(ctx, x, y, t, 0.25 * (1 - away));
        bigDalet(ctx, x, y, 600, t, { scale: sc, turn: (1 - eOut(k)) * Math.PI * 1.5 });
        // crown descends
        const ck = prog(t, tCrown - 0.9, 0.9);
        if (ck > 0) crown(ctx, x - 20 * sc / 1, y - lerp(1500, 470, eBounce(ck)) * sc, 420 * sc, t, { rot: (1 - ck) * 0.3 });
        ctx.globalAlpha = fadeIn;
        burst(ctx, t, tD + 0.05, W / 2, 1060, 70, 800, 3);
        burst(ctx, t, tCrown, W / 2, 1060 - 470, 50, 600, 4);
      }
      ctx.restore();
      flash(ctx, t, tD, 0.8);
      flash(ctx, t, tCrown, 0.4, '255,230,150');
    });

    // REVEAL: Shmulik, king of ד (to end of first verse line)
    const vL2 = S(24.7);
    add(tReveal, vL2, (ctx, t, lt, len) => {
      background(ctx, t, { rays: 0.3, light: true, rayY: 950 });
      floatingDalets(ctx, t, 8, 0.5);
      const spec = P('09', { focus: [0.5, 0.35], zoom: [1.0, 1.06] });
      const k = prog(t, tReveal + 0.15, 0.8), out = clamp((lt - len + 0.35) / 0.35);
      const h = 1180, w = h * aspect(spec);
      ctx.save(); ctx.globalAlpha *= 1 - out;
      ctx.translate(W / 2, 1010); ctx.scale(lerp(0.2, 1, eBack(k)) * (1 + out * 0.1), lerp(0.2, 1, eBack(k)) * (1 + out * 0.1)); ctx.rotate((1 - eOut(k)) * 0.5);
      framedPhoto(ctx, spec, 0, 0, w, h, t, lt, { dur: len });
      ctx.restore();
      const tn = b(38), tk = b(40);
      ctx.save(); ctx.globalAlpha *= 1 - out;
      crown(ctx, W / 2, 105, 150, t);
      title(ctx, 'שמוליק', W / 2, 255, 165, t, { k: prog(t, tn, 0.55) });
      title(ctx, 'מלך האות ד׳!', W / 2, 1765, 140, t, { k: prog(t, tk, 0.55), white: true, glow: 'rgba(90,170,255,0.95)' });
      ctx.restore();
      burst(ctx, t, tn + 0.1, W / 2, 255, 40, 520, 11);
      burst(ctx, t, tk + 0.1, W / 2, 1765, 40, 560, 12);
      sweep(ctx, t, tk, 0.7);
    });

    // VERSE 1 — "לומד אותיות ושמח עד מאוד" / "כל אות היא אוצר" / "מאירה את הלב"
    const v1 = [vL2, S(27.9), S(31.0), S(34.2), S(37.4), b(106)];
    photoScene(v1[0], v1[1] + 0.35, P('01', { focus: [0.5, 0.4], zoom: [1.0, 1.05] }), { enter: 'right', caption: 'לומדים אותיות', beat: true });
    photoScene(v1[1], v1[2] + 0.35, P('08', { focus: [0.55, 0.45] }), { enter: 'flip', caption: 'מכינים כתר מלכותי', beat: true });
    photoScene(v1[2], v1[3] + 0.35, P('16', { focus: [0.5, 0.35] }), { enter: 'drop', caption: 'מה יש בתיבת האוצר?', beat: true, crownTop: true });
    photoScene(v1[3], v1[4] + 0.35, P('14', { focus: [0.45, 0.35] }), { enter: 'left', beat: true, crownTop: true });
    photoScene(v1[4], v1[5] + 0.35, P('19', { focus: [0.45, 0.35], zoom: [1.0, 1.1] }), { enter: 'zoom', beat: true, crownTop: true });

    // CHORUS 1 — hook + the things that start with ד
    const c1 = b(106);
    hookScene(c1, S(46.9) + 0.35, [c1, BEATS[107], BEATS[108], BEATS[110]]);
    const ob = [S(46.9), S(50.05), S(53.2), S(56.4), S(59.55), S(62.7)];
    objectScene(ob[0], ob[1] + 0.35, P('14', { crop: [0.0, 0.25, 1.0, 0.55], focus: [0.4, 0.5] }), 'דף', { enter: 'right' });
    objectScene(ob[1], ob[2] + 0.35, P('10', { crop: [0.05, 0.12, 0.9, 0.6], focus: [0.4, 0.5] }), 'דבק', { enter: 'left' });
    objectScene(ob[2], ob[3] + 0.35, P('06', { crop: [0.39, 0.66, 0.19, 0.22], focus: [0.5, 0.5], zoom: [1, 1.05] }), 'דשא', { enter: 'zoom' });
    objectScene(ob[3], ob[4] + 0.35, P('09', { crop: [0.1, 0.25, 0.8, 0.5], focus: [0.5, 0.5] }), 'דולר', { enter: 'right' });
    objectScene(ob[4], ob[5] + 0.35, P('11', { crop: [0.0, 0.15, 1.0, 0.65], focus: [0.4, 0.45] }), 'דג', { enter: 'left' });
    // table: all the ד words
    add(ob[5], b(169) + 0.35, (ctx, t, lt, len) => {
      background(ctx, t, { rays: 0.2 });
      photoBg(ctx, '06', 0.6);
      floatingDalets(ctx, t, 6, 0.4);
      const fade = 1 - clamp((lt - len + 0.35) / 0.35);
      const tx = cardTx('zoom', lt, len);
      const spec = P('06', { focus: [0.5, 0.6], zoom: [1, 1.04] });
      const w = 980, h = w / aspect(spec);
      ctx.save(); ctx.globalAlpha *= tx.a; ctx.translate(W / 2, 800); ctx.scale(tx.sc, tx.sc);
      framedPhoto(ctx, spec, 0, 0, w, h, t, lt, { dur: len }); ctx.restore();
      title(ctx, 'כל המילים', W / 2, 240, 110, t, { k: prog(lt, 0.3, 0.5) * fade, white: true });
      title(ctx, 'מתחילות באות ד׳!', W / 2, 380, 110, t, { k: prog(lt, 0.7, 0.5) * fade });
      const words = ['דף', 'דבק', 'דשא', 'דולר', 'דג'];
      const pos = [[810, 1290], [540, 1290], [270, 1290], [700, 1540], [380, 1540]];
      words.forEach((wd, i) => {
        const at = 1.2 + i * 0.79;
        wordCard(ctx, wd, pos[i][0], pos[i][1] + Math.sin(t * 2 + i) * 6, 110, t, prog(lt, at, 0.4) * fade);
        burst(ctx, t, ob[5] + at + 0.1, pos[i][0], pos[i][1], 16, 240, 40 + i);
      });
      sweep(ctx, t, ob[5], 0.6);
    });

    // VERSE 2
    const v2 = [b(169), S(75.5), S(81.8), S(88.1), b(232)];
    stackScene(v2[0], v2[1] + 0.35, [P('12', { focus: [0.45, 0.5] }), P('12', { crop: [0.28, 0.3, 0.42, 0.5], focus: [0.4, 0.5], zoom: [1, 1.1] })], { caption: 'כל החברים מקשטים את האות ד׳', capSize: 54 });
    stackScene(v2[1], v2[2] + 0.35, [P('15', { focus: [0.45, 0.45] }), P('17', { focus: [0.45, 0.45] })], { caption: 'שמוליק מחלק מטבעות לחברים', capSize: 54 });
    stackScene(v2[2], v2[3] + 0.35, [P('07', { focus: [0.4, 0.4] }), P('13', { focus: [0.4, 0.4] }), P('18', { focus: [0.4, 0.4] })], { title: 'המלך מחלק דג דג', titleY: 120, titleSize: 92, caption: 'לכל החברים!', capY: 1820 });
    photoScene(v2[3], v2[4] + 0.35, P('02', { focus: [0.5, 0.35] }), { enter: 'spin', caption: 'יוצרים את האות ד׳ עם הגוף!', capSize: 56, maxH: 1340, cy: 900 });

    // CHORUS 2 — hook, the royal parade, the wall
    const c2 = b(232);
    hookScene(c2, S(97.6) + 0.35, [c2, BEATS[233], BEATS[234], BEATS[236]], { photos: [P('05'), P('04'), P('03')] });
    const p2 = [S(97.6), S(103.9), S(110.2), b(295)];
    stackScene(p2[0], p2[1] + 0.35, [P('04', { focus: [0.6, 0.45] }), P('05', { focus: [0.3, 0.45] })], { title: 'תהלוכת המלך!', titleY: 170, caption: 'כולם הולכים אחרי המלך', beat: true });
    stackScene(p2[1], p2[2] + 0.35, [P('03', { focus: [0.6, 0.45] }), P('03', { crop: [0.58, 0.2, 0.36, 0.8], focus: [0.5, 0.4], zoom: [1, 1.08] })], { title: 'הדגל של האות ד׳', titleY: 170, beat: true });
    wallScene(p2[2], p2[3] + 0.35, [P('09'), P('16'), P('11'), P('19'), P('01'), P('08')], { title: 'איזה כיף ללמוד ולגלות!' });

    // BRIDGE (quiet) — letters reprise + a gentle moment
    const br = [b(295), S(126.1), b(328)];
    add(br[0], br[1] + 0.35, (ctx, t, lt, len) => {
      background(ctx, t, { rays: 0.22, rayY: 1000 });
      floatingDalets(ctx, t, 5, 0.3);
      const fade = clamp(lt / 0.6) * (1 - clamp((lt - len + 0.4) / 0.4));
      ctx.save(); ctx.globalAlpha = fade;
      const L = [['א', 840], ['ב', 640], ['ג', 440]];
      L.forEach(([ch, x], i) => glyph3D(ctx, ch, x, 620 + Math.sin(t * 1.4 + i) * 22, 200, t, { scale: eBack(prog(lt, 0.3 + i * 0.6, 0.6)) }));
      const dk = prog(lt, 2.4, 0.9);
      if (dk > 0) {
        bigDalet(ctx, 220, 640 + Math.sin(t * 1.4 + 3) * 22, 220, t, { scale: eBack(dk) });
        crown(ctx, 215, 470 + Math.sin(t * 1.4 + 3) * 22, 160 * eBack(dk), t);
      }
      title(ctx, 'כל אות היא אוצר', W / 2, 1050, 110, t, { k: prog(lt, 3.6, 0.6), white: true });
      title(ctx, 'כל אות היא מתנה', W / 2, 1220, 110, t, { k: prog(lt, 4.6, 0.6) });
      ctx.restore();
      burst(ctx, t, br[0] + 2.6, 220, 640, 40, 500, 21);
    });
    stackScene(br[1], br[2] + 0.35, [P('18', { focus: [0.4, 0.45], zoom: [1, 1.08] }), P('18', { crop: [0.25, 0.2, 0.45, 0.8], focus: [0.5, 0.5], zoom: [1, 1.1] })], { stagger: 1.2, caption: 'לומדים ביחד בשמחה' });

    // FINAL CHORUS — fast montage cut on every second beat
    const fc0 = b(328), fc1 = b(369);
    const cuts = []; for (let i = 328; i < 369; i += 2) cuts.push(BEATS[i]);
    const order = ['09', '16', '05', '19', '07', '11', '04', '08', '13', '14', '03', '10', '18', '01', '12', '02', '15', '17', '06', '09', '16'];
    montageScene(fc0, fc1 + 0.35, order.map((x) => P(x)), cuts, { title: 'מלך, מלך, מלך', title2: 'האותיות!' });

    // FINALE
    add(fc1, CLIP.DUR + 1, (ctx, t, lt) => {
      background(ctx, t, { rays: 0.3, light: true, rayY: 960 });
      floatingDalets(ctx, t, 10, 0.5);
      const cam = lerp(1.08, 0.9, eInOut(prog(lt, 4, 12)));
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(cam, cam); ctx.translate(-W / 2, -H / 2);
      const ring = ['09', '16', '19', '11', '05', '07'];
      const slots = [[250, 560], [830, 560], [170, 990], [910, 990], [260, 1390], [820, 1390]];
      ring.forEach((im, i) => {
        const k = prog(lt, 0.2 + i * 0.4, 0.6); if (k <= 0) return;
        const s = P(im), ar = aspect(s); let h = 310, w = h * ar; if (w > 360) { w = 360; h = w / ar; }
        ctx.save(); ctx.globalAlpha *= clamp(k * 2);
        ctx.translate(slots[i][0] + Math.sin(t + i) * 12, slots[i][1] + Math.cos(t * 0.9 + i) * 12); ctx.rotate((rnd(i + 70) - 0.5) * 0.2); ctx.scale(eBack(k), eBack(k));
        framedPhoto(ctx, s, 0, 0, w, h, t, lt, { dur: 16, border: 9 }); ctx.restore();
      });
      const dk = prog(lt, 0.4, 0.9);
      rays(ctx, W / 2, 1000, t, 0.25 * dk);
      bigDalet(ctx, W / 2, 1040, 380, t, { scale: eBack(dk) * (1 + 0.02 * pulse(t)) });
      crown(ctx, W / 2 - 10, 1040 - 300, 300 * eBack(prog(lt, 1.2, 0.8)), t);
      ctx.restore();
      title(ctx, 'כל הכבוד לשמוליק!', W / 2, 260, 112, t, { k: prog(t, fc1 + 0.3, 0.6) });
      title(ctx, 'מלך האות ד׳', W / 2, 1640, 130, t, { k: prog(t, S(152.5), 0.6), white: true, glow: 'rgba(90,170,255,0.95)' });
      title(ctx, 'איזה מלך של אותיות!', W / 2, 1800, 84, t, { k: prog(t, S(156), 0.6) });
      burst(ctx, t, fc1 + 0.4, W / 2, 260, 50, 600, 31);
      burst(ctx, t, S(152.5) + 0.1, W / 2, 1640, 50, 600, 32);
      burst(ctx, t, S(156) + 0.1, W / 2, 1800, 40, 500, 33);
      for (let i = 0; i < 6; i++) burst(ctx, t, S(158 + i * 1.2), 200 + rnd(i + 5) * 680, 500 + rnd(i + 9) * 900, 30, 420, 50 + i);
      flash(ctx, t, fc1, 0.6);
      // closing fade
      const fo = prog(t, CLIP.DUR - 2.4, 2.3);
      if (fo > 0) { ctx.fillStyle = `rgba(6,16,46,${eInOut(fo)})`; ctx.fillRect(0, 0, W, H); }
    });
  }

  // ---------- public ----------
  CLIP.load = async function (base = '') {
    BEATS = await (await fetch(base + 'audio/beats.json')).json();
    const names = []; for (let i = 1; i <= 19; i++) { const n = String(i).padStart(2, '0'); names.push(n, n + '-bg'); }
    await Promise.all(names.map((n) => new Promise((res, rej) => { const im = new Image(); im.onload = () => { IMG[n] = im; res(); }; im.onerror = rej; im.src = base + 'photos/' + n + '.jpg'; })));
    await document.fonts.load(`900 100px Heebo`, 'אבגד׳'); await document.fonts.load(`800 100px Heebo`, 'אבגד׳');
    build();
    return scenes.map((s) => [s.t0, s.t1]);
  };
  CLIP.render = function (ctx, t) {
    ctx.save();
    ctx.fillStyle = C.deep; ctx.fillRect(0, 0, W, H);
    // draw all active scenes; later scenes paint over earlier ones, so overlaps crossfade naturally
    for (const s of scenes) {
      if (t < s.t0 || t >= s.t1) continue;
      ctx.save(); ctx.globalAlpha = s.t0 > 0 ? clamp((t - s.t0) / 0.35) : 1;
      s.draw(ctx, t, t - s.t0, s.t1 - s.t0);
      ctx.restore();
    }
    ctx.restore();
  };
  window.CLIP = CLIP;
})();
