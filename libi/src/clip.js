/* ליבי – מלכת האותיות | האות ב׳
 * Canvas clip engine (1080x1920). Every frame is a pure function of time t,
 * so frames can be rendered in any order / in parallel.
 *
 * Edit the TIMELINE section near the bottom to change shots, captions,
 * transitions or timing. Times are in seconds and are snapped to the
 * song's detected beats (src/beats.js).
 */
(function () {
  'use strict';
  const W = 1080, H = 1920;
  const C = window.CLIP = { W, H, FPS: 30, DUR: 182.16 };
  const BEATS = window.CLIP_BEATS || [];

  // ---------- palette ----------
  const PAL = {
    powder: '#f6c9d6', baby: '#fadadd', cream: '#fff6ec', pearl: '#fbf8f3',
    gold: '#e2b54f', goldDeep: '#b8862b', lilac: '#c9a7e0', rose: '#e0447c',
    plum: '#7a2e5c',
  };
  const LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת';
  const FLOAT_COLORS = ['#f48fb1', '#ce93d8', '#e2b54f', '#90caf9', '#a5d6a7', '#ffab91', '#f8bbd0'];

  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const eOutCubic = p => 1 - Math.pow(1 - p, 3);
  const eInOut = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const eOutBack = (p, s = 1.6) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
  const eOutElastic = p => p === 0 ? 0 : p === 1 ? 1 : Math.pow(2, -9 * p) * Math.sin((p * 10 - 0.75) * (2 * Math.PI / 3.2)) + 1;
  const hash = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------- beats ----------
  function beatIndex(t) {
    let lo = 0, hi = BEATS.length - 1;
    if (!BEATS.length || t < BEATS[0]) return -1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (BEATS[m] <= t) lo = m; else hi = m - 1; }
    return lo;
  }
  const snap = (t) => {
    let best = t, bd = 1e9;
    for (const b of BEATS) { const d = Math.abs(b - t); if (d < bd) { bd = d; best = b; } }
    return bd < 0.25 ? best : t;
  };
  const pulse = (t, k = 7) => { const i = beatIndex(t); return i < 0 ? 0 : Math.exp(-(t - BEATS[i]) * k); };
  const BAR0 = beatIndex(6.93) % 4;
  const barPulse = (t, k = 5) => {
    let i = beatIndex(t); if (i < 0) return 0;
    while (i >= 0 && (i % 4) !== BAR0) i--;
    return i < 0 ? 0 : Math.exp(-(t - BEATS[i]) * k);
  };
  const HIGH = [[85.4, 111.5], [130.8, 151.2], [158, 181]];
  const isHigh = t => HIGH.some(([a, b]) => t >= a && t < b);

  // ---------- assets ----------
  const PHOTOS = ['body-letter-bet', 'class-craft-1', 'class-craft-2', 'class-craft-3', 'class-train-flag',
    'class-train-items', 'libi-alphabet-pointer', 'libi-baalei-chaim', 'libi-bakbuk', 'libi-barvaz', 'libi-bayit',
    'libi-beigele', 'libi-box-flag', 'libi-buba-bamba', 'libi-buot-back', 'libi-buot-sharing', 'libi-display-table',
    'libi-sitting-flag', 'three-girls-bet-craft'];
  const IMG = {}, BG = {};
  function loadImg(src) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(src)); im.src = src; });
  }
  let bufA, bufB, vignette;
  C.load = async (base = '') => {
    await Promise.all([
      document.fonts.load('700 100px Fredoka', 'אבג!'), document.fonts.load('500 100px Fredoka', 'אבג!'),
    ]);
    await Promise.all(PHOTOS.map(async n => {
      IMG[n] = await loadImg(base + 'assets/photos/' + n + '.jpg');
      BG[n] = await loadImg(base + 'assets/bg/' + n + '.jpg');
    }));
    bufA = mk(); bufB = mk();
    vignette = mk(); const v = vignette.getContext('2d');
    const g = v.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
    g.addColorStop(0, 'rgba(120,30,80,0)'); g.addColorStop(1, 'rgba(120,30,80,0.28)');
    v.fillStyle = g; v.fillRect(0, 0, W, H);
  };
  function mk() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }

  // ---------- drawing primitives ----------
  const FONT = (w, s) => `${w} ${s}px Fredoka, sans-serif`;

  function goldGrad(ctx, y0, y1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#fff6cf'); g.addColorStop(0.35, '#f3d27a'); g.addColorStop(0.6, '#d9a640');
    g.addColorStop(0.82, '#c08a2a'); g.addColorStop(1, '#f6dc8c');
    return g;
  }

  function sparkle(ctx, x, y, r, a, color = '#fff') {
    if (a <= 0.01 || r <= 0.5) return;
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
    g.addColorStop(0, 'rgba(255,240,200,0.75)'); g.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(0, -r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.quadraticCurveTo(0, 0, 0, r);
    ctx.quadraticCurveTo(0, 0, -r, 0); ctx.quadraticCurveTo(0, 0, 0, -r); ctx.fill();
    ctx.restore();
  }

  function heartPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(-s * 0.9, -s * 0.25, -s * 0.45, -s * 0.95, 0, -s * 0.45);
    ctx.bezierCurveTo(s * 0.45, -s * 0.95, s * 0.9, -s * 0.25, 0, s * 0.35);
    ctx.closePath();
  }
  function heart(ctx, x, y, s, color, a = 1, rot = 0) {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.translate(x, y); ctx.rotate(rot);
    heartPath(ctx, s); ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = clamp(a) * 0.5; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-s * 0.3, -s * 0.38, s * 0.1, s * 0.06, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function crown(ctx, x, y, w, rot = 0, t = 0, a = 1) {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(w, w);
    const tips = [[-0.48, -0.5], [-0.25, -0.6], [0, -0.7], [0.25, -0.6], [0.48, -0.5]];
    const val = [-0.37, -0.125, 0.125, 0.37];
    const path = () => {
      ctx.beginPath(); ctx.moveTo(-0.5, -0.12); ctx.lineTo(tips[0][0], tips[0][1]);
      for (let i = 0; i < 4; i++) { ctx.quadraticCurveTo(val[i], -0.2, tips[i + 1][0], tips[i + 1][1]); }
      ctx.lineTo(0.5, -0.12); ctx.closePath();
    };
    // soft shadow
    ctx.save(); ctx.translate(0.015, 0.03); path(); ctx.fillStyle = 'rgba(120,50,20,0.18)'; ctx.fill(); ctx.restore();
    path(); ctx.fillStyle = goldGrad(ctx, -0.7, 0); ctx.fill();
    ctx.lineWidth = 0.014; ctx.strokeStyle = '#a8761c'; ctx.stroke();
    // sheen
    ctx.save(); path(); ctx.clip();
    const sx = ((t * 0.45) % 1.6) - 0.8;
    const sg = ctx.createLinearGradient(sx - 0.15, -0.7, sx + 0.15, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(-0.6, -0.8, 1.2, 0.9); ctx.restore();
    // band
    ctx.beginPath(); ctx.roundRect(-0.53, -0.18, 1.06, 0.2, 0.05);
    ctx.fillStyle = goldGrad(ctx, -0.18, 0.02); ctx.fill(); ctx.stroke();
    // jewels
    [[-0.3, '#b98be0'], [0, '#f06a9b'], [0.3, '#b98be0']].forEach(([jx, col]) => {
      ctx.beginPath(); ctx.ellipse(jx, -0.08, 0.06, 0.045, 0, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = 0.01; ctx.strokeStyle = '#fff3d0'; ctx.stroke();
      ctx.beginPath(); ctx.arc(jx - 0.02, -0.095, 0.012, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    });
    // pearls
    tips.forEach(([px, py]) => {
      const g = ctx.createRadialGradient(px - 0.012, py - 0.015, 0.004, px, py, 0.05);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#f2d9e4');
      ctx.beginPath(); ctx.arc(px, py, 0.045, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 0.006; ctx.strokeStyle = '#d8b25a'; ctx.stroke();
    });
    ctx.restore();
    // twinkles on crown
    const tw = Math.pow(Math.max(0, Math.sin(t * 3.1)), 6);
    sparkle(ctx, x + w * 0.22, y - w * 0.55, w * 0.07, tw * a);
    sparkle(ctx, x - w * 0.3, y - w * 0.1, w * 0.05, Math.pow(Math.max(0, Math.sin(t * 2.3 + 2)), 6) * a);
  }

  /* 3D extruded gold letter. rotY spins around the vertical axis but the
   * letter is never mirrored (only its width shrinks), so ב always reads correctly. */
  function letter3D(ctx, ch, x, y, size, rotY = 0, tilt = 0, a = 1, glow = 1) {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.translate(x, y);
    if (glow > 0) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.85);
      g.addColorStop(0, `rgba(255,236,170,${0.55 * glow})`); g.addColorStop(1, 'rgba(255,220,170,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, size * 0.85, 0, Math.PI * 2); ctx.fill();
    }
    ctx.rotate(tilt);
    const c = Math.cos(rotY), s = Math.sin(rotY);
    ctx.scale(Math.max(0.05, Math.abs(c)), 1);
    ctx.font = FONT(700, size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    const depth = Math.max(6, Math.round(size * 0.06));
    const ox = 0.55 + s * 1.6, oy = 0.9;
    const k = size / 160;
    for (let i = depth; i >= 1; i--) {
      const f = i / depth;
      ctx.fillStyle = `rgb(${Math.round(lerp(196, 130, f))},${Math.round(lerp(140, 82, f))},${Math.round(lerp(50, 22, f))})`;
      ctx.fillText(ch, i * ox * k, i * oy * k);
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.05; ctx.strokeStyle = '#fff7e0'; ctx.strokeText(ch, 0, 0);
    ctx.lineWidth = size * 0.022; ctx.strokeStyle = '#b07d1e'; ctx.strokeText(ch, 0, 0); // outer half only (fill covers inner seams)
    ctx.fillStyle = goldGrad(ctx, -size * 0.45, size * 0.45); ctx.fillText(ch, 0, 0);
    ctx.restore();
  }

  function shadowRect(ctx, x, y, w, h, r, n = 6, a = 0.035) {
    for (let k = 0; k < n; k++) {
      const e = 4 + k * 7;
      ctx.beginPath(); ctx.roundRect(x - e, y - e + 16, w + 2 * e, h + 2 * e, r + e);
      ctx.fillStyle = `rgba(110,30,70,${a})`; ctx.fill();
    }
  }

  function drawCover(ctx, im, bx, by, bw, bh, focus = [0.5, 0.5], zoom = 1, panX = 0, panY = 0) {
    const sc = Math.max(bw / im.width, bh / im.height) * zoom;
    const dw = im.width * sc, dh = im.height * sc;
    let dx = bx + bw / 2 - focus[0] * dw + panX, dy = by + bh / 2 - focus[1] * dh + panY;
    dx = clamp(dx, bx + bw - dw, bx); dy = clamp(dy, by + bh - dh, by);
    ctx.drawImage(im, dx, dy, dw, dh);
  }

  function framed(ctx, name, cx, cy, w, h, o = {}) {
    const im = IMG[name];
    const b = o.border ?? 16, r = o.radius ?? 34;
    ctx.save(); ctx.globalAlpha = o.alpha ?? 1; ctx.translate(cx, cy); ctx.rotate(o.rot || 0);
    if (o.scale) ctx.scale(o.scale, o.scale);
    shadowRect(ctx, -w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b, r + b);
    const pg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    pg.addColorStop(0, '#fffdf9'); pg.addColorStop(1, '#f5ece3');
    ctx.beginPath(); ctx.roundRect(-w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b, r + b); ctx.fillStyle = pg; ctx.fill();
    ctx.beginPath(); ctx.roundRect(-w / 2 - b * 0.5, -h / 2 - b * 0.5, w + b, h + b, r + b * 0.5);
    ctx.lineWidth = 3; ctx.strokeStyle = goldGrad(ctx, -h / 2, h / 2); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, r); ctx.clip();
    drawCover(ctx, im, -w / 2, -h / 2, w, h, o.focus, o.zoom || 1, o.panX || 0, o.panY || 0);
    ctx.restore();
    ctx.restore();
  }

  function polaroid(ctx, name, cx, cy, w, h, rot, a = 1, scale = 1, focus) {
    ctx.save(); ctx.globalAlpha = clamp(a); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(scale, scale);
    const m = 22, mb = 90;
    shadowRect(ctx, -w / 2 - m, -h / 2 - m, w + 2 * m, h + m + mb, 6, 5, 0.05);
    ctx.fillStyle = '#fffdfa'; ctx.fillRect(-w / 2 - m, -h / 2 - m, w + 2 * m, h + m + mb);
    drawCover(ctx, IMG[name], -w / 2, -h / 2, w, h, focus);
    heart(ctx, 0, h / 2 + mb / 2 - 4, 34, '#f06a9b', 0.9);
    ctx.restore();
  }

  // Draws RTL text made of coloured segments, centred on cx.
  function segText(ctx, segs, cx, cy, size, weight = 700, stroke = null, sw = 0) {
    ctx.font = FONT(weight, size); ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ws = segs.map(s => ctx.measureText(s.t).width);
    const tw = ws.reduce((a, b) => a + b, 0);
    let x = cx + tw / 2;
    segs.forEach((s, i) => {
      if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = sw; ctx.strokeStyle = stroke; ctx.strokeText(s.t, x, cy); }
      ctx.fillStyle = s.c === 'gold' ? goldGrad(ctx, cy - size * 0.5, cy + size * 0.5) : s.c; ctx.fillText(s.t, x, cy);
      x -= ws[i];
    });
    return tw;
  }
  function textWidth(ctx, s, size, weight = 700) { ctx.font = FONT(weight, size); return ctx.measureText(s).width; }

  /* Caption pill. lines: array of lines; each line a string or segment array. */
  function pill(ctx, lines, cx, cy, size, p, o = {}) {
    if (p <= 0) return;
    lines = lines.map(l => typeof l === 'string' ? [{ t: l, c: o.color || PAL.plum }] : l);
    const sc = eOutBack(clamp(p), 1.4), a = clamp(p * 3);
    const lh = size * 1.32;
    const tw = Math.max(...lines.map(l => l.reduce((s, g) => s + textWidth(ctx, g.t, size), 0)));
    const pw = tw + size * 1.3, ph = lh * lines.length + size * 0.55;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(sc, sc);
    shadowRect(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2 > 80 ? 60 : ph / 2, 4, 0.05);
    ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, Math.min(ph / 2, 70));
    ctx.fillStyle = 'rgba(255,250,244,0.95)'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = goldGrad(ctx, -ph / 2, ph / 2); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-pw / 2 + 10, -ph / 2 + 10, pw - 20, ph - 20, Math.min(ph / 2, 70) - 10);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(240,140,180,0.55)'; ctx.stroke();
    // reveal wipe (right -> left)
    const rv = o.reveal == null ? 1 : clamp(o.reveal);
    ctx.save();
    if (rv < 1) { ctx.beginPath(); ctx.rect(pw / 2 - pw * rv, -ph / 2, pw * rv, ph); ctx.clip(); }
    lines.forEach((l, i) => segText(ctx, l, 0, (i - (lines.length - 1) / 2) * lh + size * 0.04, size));
    ctx.restore();
    ctx.restore();
    const tw2 = Math.pow(Math.max(0, Math.sin(p * 9 + cx)), 4);
    sparkle(ctx, cx + pw / 2 * sc - 8, cy - ph / 2 * sc + 6, 18, a * (0.5 + 0.5 * tw2));
    sparkle(ctx, cx - pw / 2 * sc + 10, cy + ph / 2 * sc - 8, 13, a * 0.8);
  }

  function title(ctx, text, cx, cy, size, p, style = 'gold') {
    if (p <= 0) return;
    const a = clamp(p * 2.5), sc = eOutBack(clamp(p), 1.5), dy = (1 - eOutCubic(clamp(p))) * 40;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy + dy); ctx.scale(sc, sc);
    ctx.font = FONT(700, size); ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(150,40,90,0.22)'; ctx.fillText(text, 4, 8);
    ctx.lineWidth = size * 0.16; ctx.strokeStyle = '#fffaf2'; ctx.strokeText(text, 0, 0);
    if (style === 'gold') {
      ctx.lineWidth = size * 0.045; ctx.strokeStyle = '#a8761c'; ctx.strokeText(text, 0, 0);
      ctx.fillStyle = goldGrad(ctx, -size * 0.5, size * 0.5); ctx.fillText(text, 0, 0);
    } else {
      ctx.fillStyle = style === 'rose' ? PAL.rose : PAL.plum; ctx.fillText(text, 0, 0);
    }
    ctx.restore();
  }

  // ---------- backgrounds & particles ----------
  function dreamBG(ctx, t, o = {}) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fbd9e5'); g.addColorStop(0.5, '#fff3ea'); g.addColorStop(1, '#f6cfe0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H * 0.42, 900);
    rg.addColorStop(0, 'rgba(255,248,225,0.9)'); rg.addColorStop(1, 'rgba(255,248,225,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    bokeh(ctx, t, o.bokeh ?? 1);
    if (o.letters !== false) floatLetters(ctx, t, o.letterAlpha ?? 0.32);
    twinkles(ctx, t, o.twinkle ?? 1);
  }
  function bokeh(ctx, t, amt = 1) {
    const cols = ['255,190,215', '255,226,160', '214,180,240', '255,255,255'];
    for (let i = 0; i < 16; i++) {
      const r = 40 + hash(i, 1) * 120, sp = 14 + hash(i, 2) * 26;
      const x = hash(i, 3) * W + Math.sin(t * 0.25 + i) * 50;
      const y = ((hash(i, 4) * (H + 400) - t * sp) % (H + 400) + H + 400) % (H + 400) - 200;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = cols[i % 4];
      gr.addColorStop(0, `rgba(${c},${0.32 * amt})`); gr.addColorStop(0.7, `rgba(${c},${0.18 * amt})`); gr.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  function floatLetters(ctx, t, alpha) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    for (let i = 0; i < 22; i++) {
      const size = 56 + hash(i, 5) * 60, sp = 22 + hash(i, 6) * 30;
      const x = 60 + hash(i, 7) * (W - 120) + Math.sin(t * 0.5 + i * 1.7) * 30;
      const y = ((hash(i, 8) * (H + 300) - t * sp) % (H + 300) + H + 300) % (H + 300) - 150;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.6 + i) * 0.35);
      ctx.globalAlpha = alpha; ctx.font = FONT(700, size);
      ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(LETTERS[i], 0, 0);
      ctx.fillStyle = FLOAT_COLORS[i % FLOAT_COLORS.length]; ctx.fillText(LETTERS[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
  function twinkles(ctx, t, amt = 1, n = 24) {
    for (let i = 0; i < n; i++) {
      const x = hash(i, 9) * W, y = hash(i, 10) * H;
      const a = Math.pow(Math.max(0, Math.sin(t * (1.2 + hash(i, 11) * 2) + i * 2.1)), 4) * amt;
      sparkle(ctx, x, y, 10 + hash(i, 12) * 16, a);
    }
  }
  function burst(ctx, x, y, p, n = 14, R = 380, seed = 0) {
    if (p <= 0 || p >= 1) return;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + hash(i, seed) * 0.5;
      const d = eOutCubic(p) * R * (0.6 + hash(i, seed + 1) * 0.6);
      const a = (1 - p) * 1.2;
      if (i % 3 === 0) heart(ctx, x + Math.cos(ang) * d, y + Math.sin(ang) * d, 26 * (1 - p * 0.5), i % 2 ? '#f48fb1' : '#f06a9b', a, ang);
      else sparkle(ctx, x + Math.cos(ang) * d, y + Math.sin(ang) * d, 22 * (1 - p * 0.4), a);
    }
  }
  function risingHearts(ctx, t, lt, n = 10, seed = 50) {
    for (let i = 0; i < n; i++) {
      const sp = 120 + hash(i, seed) * 120;
      const life = (H + 200) / sp;
      const off = hash(i, seed + 1) * life;
      const y = H + 100 - ((lt + off) % life) * sp;
      const x = hash(i, seed + 2) * W + Math.sin(lt * 2 + i) * 40;
      heart(ctx, x, y, 22 + hash(i, seed + 3) * 22, FLOAT_COLORS[i % 3], 0.75, Math.sin(lt + i) * 0.3);
    }
  }
  function soapBubbles(ctx, lt, n = 14, seed = 70, small = false) {
    for (let i = 0; i < n; i++) {
      const sp = (small ? 160 : 90) + hash(i, seed) * 90;
      const life = (H + 300) / sp, off = hash(i, seed + 1) * life;
      const y = H + 150 - ((lt + off) % life) * sp;
      const x = hash(i, seed + 2) * W + Math.sin(lt * 1.5 + i * 2) * 50;
      const r = small ? 6 + hash(i, seed + 3) * 10 : 24 + hash(i, seed + 3) * 46;
      ctx.save();
      const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, 'rgba(255,170,220,0.85)'); g.addColorStop(0.5, 'rgba(170,220,255,0.85)'); g.addColorStop(1, 'rgba(255,240,160,0.85)');
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.08); ctx.strokeStyle = g; ctx.stroke();
      ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
      ctx.restore();
    }
  }
  function cornerDeco(ctx, t) {
    // soft top & bottom gradients so captions read on photos
    let g = ctx.createLinearGradient(0, H - 620, 0, H);
    g.addColorStop(0, 'rgba(120,30,80,0)'); g.addColorStop(1, 'rgba(120,30,80,0.42)');
    ctx.fillStyle = g; ctx.fillRect(0, H - 620, W, 620);
    g = ctx.createLinearGradient(0, 0, 0, 260);
    g.addColorStop(0, 'rgba(255,230,240,0.55)'); g.addColorStop(1, 'rgba(255,230,240,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 260);
    twinkles(ctx, t, 0.8, 10);
  }

  // ---------- shot builders ----------
  // Full-screen photo with Ken Burns.
  function photoShot(name, o = {}) {
    return {
      kind: 'photo', name, caption: o.caption,
      draw(ctx, lt, d, t) {
        const p = eInOut(clamp(lt / d));
        const z = lerp(o.z0 ?? 1.02, o.z1 ?? 1.12, p);
        const im = IMG[name];
        if (im.width / im.height > 0.7) { // landscape: blurred backdrop + card
          drawCover(ctx, BG[name], 0, 0, W, H, [0.5, 0.5], 1.05 + p * 0.05);
          framed(ctx, name, W / 2, 900, 980, 551, { zoom: z, focus: o.focus });
        } else {
          drawCover(ctx, im, 0, 0, W, H, o.focus || [0.5, 0.45], z, lerp(o.px0 || 0, o.px1 || 0, p), 0);
        }
        cornerDeco(ctx, t);
        if (o.extra) o.extra(ctx, lt, d, t);
        if (o.caption) pill(ctx, o.caption, W / 2, o.capY || 1690, o.capSize || 78, prog(lt, o.capAt ?? 0.35, (o.capAt ?? 0.35) + 0.6));
      },
    };
  }

  // Photo inside a pearl frame over its own blurred, tinted backdrop (parallax).
  function frameShot(name, o = {}) {
    return {
      kind: 'frame', name, caption: o.caption, heading: o.heading,
      draw(ctx, lt, d, t) {
        const p = eInOut(clamp(lt / d));
        const im = IMG[name];
        const land = im.width > im.height;
        const drift = lerp(-1, 1, p);
        drawCover(ctx, BG[name], 0, 0, W, H, [0.5 + drift * 0.03, 0.5], 1.12);
        ctx.fillStyle = 'rgba(255,240,245,0.18)'; ctx.fillRect(0, 0, W, H);
        floatLetters(ctx, t, 0.28);
        const fw = land ? 960 : 760, fh = land ? 540 : 1351;
        const cy = land ? 930 : 860;
        const bob = Math.sin(lt * 1.3) * 8;
        framed(ctx, name, W / 2 + drift * 26, cy + bob, fw, fh, {
          rot: (o.rot ?? 0.012) * Math.sin(lt * 0.9), zoom: lerp(1.0, 1.08, p), focus: o.focus,
        });
        // foreground sparkles move faster (parallax)
        for (let i = 0; i < 8; i++) {
          const x = ((hash(i, 30) * W - drift * 120 * (1 + hash(i, 31))) % W + W) % W;
          const y = hash(i, 32) * H;
          sparkle(ctx, x, y, 14 + hash(i, 33) * 14, Math.pow(Math.max(0, Math.sin(t * 2 + i * 1.3)), 3));
        }
        if (o.heading) title(ctx, o.heading, W / 2, land ? 440 : 120, land ? 96 : 84, prog(lt, 0.2, 0.8), 'gold');
        if (o.caption) pill(ctx, o.caption, W / 2, land ? 1420 : 1690, o.capSize || 76, prog(lt, o.capAt ?? 0.45, (o.capAt ?? 0.45) + 0.6));
        if (o.extra) o.extra(ctx, lt, d, t);
      },
    };
  }

  // "ב׳ – word" object scene: 3D ב flies into a badge, word wipes in.
  function objectShot(name, word, o = {}) {
    const first = word.match(/^.[֑-ׇֽֿׁׂׅׄ]*/)[0];
    const rest = word.slice(first.length);
    const segs = [{ t: 'ב׳ – ', c: PAL.rose }, { t: first, c: PAL.rose }, { t: rest, c: PAL.plum }];
    return {
      kind: 'object', name, word,
      draw(ctx, lt, d, t) {
        const p = eInOut(clamp(lt / d));
        drawCover(ctx, IMG[name], 0, 0, W, H, o.focus || [0.5, 0.42], lerp(1.0, o.z1 ?? 1.08, p), lerp(0, o.px || 0, p), 0);
        cornerDeco(ctx, t);
        if (o.extra) o.extra(ctx, lt, d, t);
        // flying letter -> badge
        const fp = prog(lt, 0.05, 1.05), fe = eOutCubic(fp);
        const bx = W / 2, by = 1470;
        const lx = lerp(W / 2, bx, fe), ly = lerp(820, by, fe);
        const ls = lerp(520, 150, fe);
        if (fp > 0.6) {
          const bp = prog(lt, 0.65, 1.1);
          const pr = 104 * eOutBack(bp) * (1 + 0.06 * pulse(t));
          ctx.save();
          shadowRect(ctx, bx - pr, by - pr, pr * 2, pr * 2, pr, 3, 0.05);
          ctx.beginPath(); ctx.arc(bx, by, pr, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,250,244,0.96)'; ctx.fill();
          ctx.lineWidth = 7; ctx.strokeStyle = goldGrad(ctx, by - pr, by + pr); ctx.stroke();
          ctx.restore();
        }
        const rotY = (1 - fe) * Math.PI * 4;
        letter3D(ctx, 'ב', lx, ly, ls * (1 + 0.05 * pulse(t)), rotY, 0, clamp(fp * 4), fp < 1 ? 1 : 0.4);
        burst(ctx, bx, by, prog(lt, 0.9, 1.7), 12, 240, 3);
        pill(ctx, [segs], W / 2, 1690, o.size || 84, prog(lt, 0.8, 1.3), { reveal: eInOut(prog(lt, 1.0, 1.7)) });
      },
    };
  }

  // ---------- special shots ----------
  const opening = {
    kind: 'opening',
    draw(ctx, lt, d, t) {
      dreamBG(ctx, t, { letterAlpha: 0.3 * prog(lt, 0, 1.5) });
      ctx.fillStyle = `rgba(255,246,236,${1 - prog(lt, 0, 1.0)})`; ctx.fillRect(0, 0, W, H);
      // crown drops in
      const cp = prog(lt, 0.3, 2.1);
      const cy = lerp(-200, 470, eOutElastic(cp));
      crown(ctx, W / 2, cy + Math.sin(lt * 1.6) * 6, 380, Math.sin(lt * 1.2) * 0.03, t, clamp(cp * 4));
      if (cp > 0.35 && cp < 1) burst(ctx, W / 2, 400, prog(lt, 1.0, 2.2), 14, 320, 1);
      // 3D ב spins in
      const bp = prog(lt, 1.95, 3.6);
      const sc = eOutBack(bp, 1.3);
      letter3D(ctx, 'ב', W / 2, 860 + Math.sin(lt * 1.4) * 10, 520 * sc * (1 + 0.04 * pulse(t)),
        (1 - eOutCubic(bp)) * Math.PI * 4 + Math.sin(lt * 1.1) * 0.25 * bp, Math.sin(lt) * 0.04, clamp(bp * 3));
      burst(ctx, W / 2, 860, prog(lt, 3.4, 4.6), 16, 420, 2);
      title(ctx, 'ליבי שלנו', W / 2, 1290, 150, prog(lt, 3.6, 4.3), 'gold');
      title(ctx, 'מלכת האותיות', W / 2, 1460, 112, prog(lt, 4.4, 5.1), 'rose');
      pill(ctx, [[{ t: 'האות ', c: PAL.plum }, { t: 'ב׳', c: PAL.rose }]], W / 2, 1640, 84, prog(lt, 5.25, 5.9));
    },
  };

  const letterCard = {
    kind: 'letter',
    draw(ctx, lt, d, t) {
      dreamBG(ctx, t, { letterAlpha: 0.4 });
      const p = prog(lt, 0, 1.2);
      // ring of small ב letters orbiting
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + lt * 0.5;
        const R = 410 * eOutCubic(p);
        ctx.save(); ctx.globalAlpha = p * 0.9; ctx.translate(W / 2 + Math.cos(a) * R, 860 + Math.sin(a) * R);
        ctx.font = FONT(700, 64); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.strokeText('ב', 0, 0);
        ctx.fillStyle = FLOAT_COLORS[i % FLOAT_COLORS.length]; ctx.fillText('ב', 0, 0);
        ctx.restore();
      }
      letter3D(ctx, 'ב', W / 2, 860, 600 * eOutBack(p, 1.3) * (1 + 0.05 * pulse(t)), (1 - eOutCubic(p)) * Math.PI * 2 + Math.sin(lt * 1.3) * 0.3, 0, clamp(p * 3));
      crown(ctx, W / 2, 460 + Math.sin(lt * 1.5) * 8, 240, Math.sin(lt * 1.6) * 0.06, t, prog(lt, 0.4, 0.9));
      title(ctx, 'הָאוֹת ב׳', W / 2, 1400, 140, prog(lt, 0.6, 1.2), 'gold');
      pill(ctx, ['ליבי לומדת את האות ב׳'], W / 2, 1620, 74, prog(lt, 1.3, 1.9));
    },
  };

  const CAROUSEL = [
    ['libi-bakbuk', 'בַּקְבּוּק', [0.45, 0.35]], ['libi-beigele', 'בֵּייגָלֶה', [0.5, 0.38]],
    ['libi-barvaz', 'בַּרְוָז', [0.5, 0.4]], ['libi-baalei-chaim', 'בַּעֲלֵי חַיִּים', [0.5, 0.45]],
    ['libi-bayit', 'בַּיִת', [0.5, 0.45]], ['libi-buba-bamba', 'בֻּבַּת בַּמְבָּה', [0.5, 0.38]],
  ];
  function carouselShot() {
    return {
      kind: 'carousel',
      draw(ctx, lt, d, t) {
        dreamBG(ctx, t, { letterAlpha: 0.3 });
        const step = 1.579; // one bar
        const k = Math.floor(lt / step), f = clamp((lt - k * step) / 0.55);
        const rot = (k + eInOut(f)) * (Math.PI * 2 / CAROUSEL.length);
        const items = CAROUSEL.map((c, i) => {
          const th = i * Math.PI * 2 / CAROUSEL.length - rot;
          return { c, x: W / 2 + Math.sin(th) * 360, z: Math.cos(th) };
        }).sort((a, b) => a.z - b.z);
        items.forEach(it => {
          const s = 0.5 + 0.5 * (it.z + 1) / 2;
          const w = 560 * s, h = 996 * s;
          ctx.save(); ctx.globalAlpha = 0.45 + 0.55 * (it.z + 1) / 2;
          framed(ctx, it.c[0], it.x, 900 + (1 - s) * -60, w, h, { focus: it.c[2], border: 12 * s + 4, radius: 28 * s });
          ctx.restore();
          if (it.z < 0.98) { ctx.fillStyle = `rgba(255,230,240,${0.35 * (1 - (it.z + 1) / 2)})`; }
        });
        crown(ctx, W / 2, 230 + Math.sin(lt * 2) * 6, 200, 0, t, prog(lt, 0, 0.5));
        title(ctx, 'כל האוצרות של ב׳', W / 2, 330, 92, prog(lt, 0.2, 0.8), 'gold');
        const front = ((Math.round(rot / (Math.PI * 2 / CAROUSEL.length)) % CAROUSEL.length) + CAROUSEL.length) % CAROUSEL.length;
        const w = CAROUSEL[front][1];
        const first = w.match(/^.[֑-ׇ]*/)[0];
        const lp = f >= 1 ? 1 : (k === 0 ? prog(lt, 0.4, 0.9) : prog(f, 0.6, 1));
        pill(ctx, [[{ t: first, c: PAL.rose }, { t: w.slice(first.length), c: PAL.plum }]], W / 2, 1640, 84, lp);
        if (isHigh(t)) burst(ctx, W / 2, 900, clamp((lt - k * step) / 1.2), 10, 520, k);
      },
    };
  }

  const POLAROIDS = [
    ['libi-box-flag', 290, 560, -0.12, false, [0.5, 0.4]], ['class-train-items', 700, 470, 0.08, true, [0.5, 0.5]],
    ['libi-bayit', 780, 1060, 0.1, false, [0.5, 0.42]], ['body-letter-bet', 300, 1180, -0.06, false, [0.5, 0.5]],
    ['libi-alphabet-pointer', 560, 1530, -0.04, true, [0.5, 0.5]], ['libi-buba-bamba', 560, 900, 0.03, false, [0.5, 0.38]],
  ];
  function polaroidShot() {
    return {
      kind: 'polaroids',
      draw(ctx, lt, d, t) {
        dreamBG(ctx, t, { letterAlpha: 0.25 });
        const step = 1.579;
        POLAROIDS.forEach(([n, x, y, r, land, focus], i) => {
          const p = prog(lt, i * step * 0.95, i * step * 0.95 + 0.5);
          if (p <= 0) return;
          const s = lerp(1.7, 1, eOutCubic(p));
          const w = land ? 520 : 380, h = land ? 292 : 560;
          polaroid(ctx, n, x, y + Math.sin(lt + i) * 4, w, h, r + (1 - p) * 0.4, clamp(p * 3), s, focus);
          burst(ctx, x, y, prog(lt, i * step * 0.95 + 0.4, i * step * 0.95 + 1.3), 8, 260, i + 10);
        });
        title(ctx, 'רגעים של מלכה', W / 2, 130, 96, prog(lt, 0.1, 0.7), 'gold');
      },
    };
  }

  const ringShot = {
    kind: 'ring',
    draw(ctx, lt, d, t) {
      dreamBG(ctx, t, { letters: false, bokeh: 1.3 });
      const cx = W / 2, cy = 860, R = 410;
      for (let i = 0; i < 22; i++) {
        const a = -Math.PI / 2 + i / 22 * Math.PI * 2 - lt * 0.12;
        const p = prog(lt, i * 0.06, i * 0.06 + 0.5);
        const isB = LETTERS[i] === 'ב';
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        ctx.save(); ctx.globalAlpha = p; ctx.translate(x, y); ctx.scale(eOutBack(p) * (isB ? 1.35 + 0.15 * pulse(t) : 1), eOutBack(p) * (isB ? 1.35 + 0.15 * pulse(t) : 1));
        ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI * 2); ctx.fillStyle = isB ? '#fff4d6' : 'rgba(255,255,255,0.85)'; ctx.fill();
        ctx.lineWidth = isB ? 6 : 3; ctx.strokeStyle = isB ? goldGrad(ctx, -50, 50) : 'rgba(240,150,190,0.8)'; ctx.stroke();
        ctx.font = FONT(700, 56); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
        ctx.fillStyle = isB ? PAL.rose : FLOAT_COLORS[i % FLOAT_COLORS.length]; ctx.fillText(LETTERS[i], 0, 2);
        ctx.restore();
      }
      letter3D(ctx, 'ב', cx, cy, 480 * (1 + 0.04 * pulse(t)), Math.sin(lt * 0.9) * 0.4, 0, prog(lt, 0.3, 1.2));
      crown(ctx, cx, 330 + Math.sin(lt * 1.4) * 6, 220, Math.sin(lt * 1.3) * 0.05, t, prog(lt, 0.8, 1.4));
      title(ctx, 'מלכת האותיות', W / 2, 1460, 120, prog(lt, 1.4, 2.1), 'rose');
      pill(ctx, [[{ t: 'מ־א׳ ועד ת׳ – ', c: PAL.plum }, { t: 'ליבי!', c: PAL.rose }]], W / 2, 1640, 72, prog(lt, 2.4, 3.0));
    },
  };

  const COLLAGE = [
    ['libi-sitting-flag', [0.55, 0.3]], ['libi-barvaz', [0.5, 0.38]], ['libi-beigele', [0.48, 0.32]],
    ['libi-bakbuk', [0.42, 0.3]], ['libi-baalei-chaim', [0.5, 0.4]], ['libi-buba-bamba', [0.5, 0.35]],
  ];
  const collageShot = {
    kind: 'collage',
    draw(ctx, lt, d, t) {
      dreamBG(ctx, t, { letterAlpha: 0.25 });
      const beat = 0.395;
      COLLAGE.forEach(([n, f], i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = col ? 290 : 790, y = 480 + row * 590;
        const p = prog(lt, i * beat * 2, i * beat * 2 + 0.45);
        if (p <= 0) return;
        framed(ctx, n, x, y + Math.sin(lt * 1.2 + i) * 5, 440, 540, {
          focus: f, scale: eOutBack(p, 1.5) * (1 + 0.025 * barPulse(t)), rot: (col ? 0.03 : -0.03) + Math.sin(lt + i) * 0.01, border: 12,
          zoom: 1.0 + 0.06 * prog(lt, 0, d),
        });
      });
      crown(ctx, W / 2, 150 + Math.sin(lt * 1.6) * 6, 190, 0, t, prog(lt, 0, 0.6));
      // central medallion with ב
      const mp = prog(lt, 12 * beat + 0.2, 12 * beat + 0.9);
      if (mp > 0) {
        ctx.save(); ctx.translate(W / 2, 1070); ctx.scale(eOutBack(mp), eOutBack(mp));
        shadowRect(ctx, -120, -120, 240, 240, 120, 3, 0.05);
        ctx.beginPath(); ctx.arc(0, 0, 120, 0, Math.PI * 2); ctx.fillStyle = '#fff8ee'; ctx.fill();
        ctx.lineWidth = 8; ctx.strokeStyle = goldGrad(ctx, -120, 120); ctx.stroke(); ctx.restore();
        letter3D(ctx, 'ב', W / 2, 1066, 180 * eOutBack(mp) * (1 + 0.06 * pulse(t)), (1 - mp) * Math.PI * 2, 0, mp, 0.5);
      }
    },
  };

  const endingShot = {
    kind: 'ending',
    draw(ctx, lt, d, t) {
      dreamBG(ctx, t, { letterAlpha: 0.32, twinkle: 1.4 });
      risingHearts(ctx, t, lt, 12, 90);
      const mp = prog(lt, 0.2, 1.1), cx = W / 2, cy = 760, R = 290;
      if (mp > 0) {
        const s = eOutBack(mp, 1.3);
        ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
        shadowRect(ctx, -R - 20, -R - 20, 2 * R + 40, 2 * R + 40, R + 20, 5, 0.04);
        ctx.beginPath(); ctx.arc(0, 0, R + 20, 0, Math.PI * 2); ctx.fillStyle = '#fffaf3'; ctx.fill();
        ctx.lineWidth = 8; ctx.strokeStyle = goldGrad(ctx, -R, R); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.clip();
        drawCover(ctx, IMG['libi-sitting-flag'], -R, -R, 2 * R, 2 * R, [0.6, 0.28], 1.9 + 0.08 * prog(lt, 0, d));
        ctx.restore(); ctx.restore();
      }
      crown(ctx, cx, cy - R - 10 + Math.sin(lt * 1.5) * 6, 300, Math.sin(lt * 1.2) * 0.04, t, prog(lt, 0.8, 1.3));
      // orbiting 3D ב
      const op = prog(lt, 1.2, 2.0);
      [[-1, 0], [1, 1.5]].forEach(([side, ph]) => {
        letter3D(ctx, 'ב', cx + side * 400, cy + 220 + Math.sin(lt * 1.6 + ph) * 18, 170 * eOutBack(op), Math.sin(lt * 1.3 + ph) * 0.5, side * 0.1, op, 0.6);
      });
      title(ctx, 'כל הכבוד לליבי שלנו!', W / 2, 1250, 96, prog(lt, 1.6, 2.3), 'rose');
      title(ctx, 'מלכת האותיות ב׳', W / 2, 1420, 124, prog(lt, 2.4, 3.1), 'gold');
      crown(ctx, W / 2, 1610, 120, 0, t, prog(lt, 3.2, 3.6));
      burst(ctx, W / 2, 1420, prog(lt, 2.6, 3.8), 18, 520, 7);
      // soft fade to cream at the very end
      const fo = prog(t, C.DUR - 1.6, C.DUR - 0.1);
      if (fo > 0) { ctx.fillStyle = `rgba(255,246,236,${eInOut(fo)})`; ctx.fillRect(0, 0, W, H); }
    },
  };

  // ---------- transitions ----------
  const TR = {
    dissolve(ctx, A, B, p) { ctx.drawImage(A, 0, 0); ctx.globalAlpha = eInOut(p); ctx.drawImage(B, 0, 0); ctx.globalAlpha = 1; },
    sparkleZoom(ctx, A, B, p, t) {
      const e = eInOut(p);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1 + 0.25 * e, 1 + 0.25 * e); ctx.drawImage(A, -W / 2, -H / 2); ctx.restore();
      ctx.save(); ctx.globalAlpha = e; ctx.translate(W / 2, H / 2); ctx.scale(1.18 - 0.18 * e, 1.18 - 0.18 * e); ctx.drawImage(B, -W / 2, -H / 2); ctx.restore();
      const f = Math.sin(Math.PI * p);
      ctx.fillStyle = `rgba(255,248,232,${0.6 * f * f})`; ctx.fillRect(0, 0, W, H);
      burst(ctx, W / 2, H / 2, p, 22, 700, 4);
    },
    lightWipe(ctx, A, B, p) {
      const e = eInOut(p);
      ctx.drawImage(A, 0, 0);
      const sl = 500; // diagonal slant
      const x = lerp(W + sl + 80, -80, e); // moves right -> left (RTL)
      ctx.save(); ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(W + 10, 0); ctx.lineTo(W + 10, H); ctx.lineTo(x - sl, H); ctx.closePath(); ctx.clip();
      ctx.drawImage(B, 0, 0); ctx.restore();
      // glowing edge
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - sl, H);
        ctx.lineWidth = [90, 40, 10][k]; ctx.strokeStyle = `rgba(255,${[200, 225, 250][k]},${[150, 190, 235][k]},${[0.18, 0.35, 0.8][k]})`; ctx.stroke();
      }
      ctx.restore();
      for (let i = 0; i < 8; i++) { const yy = hash(i, 40) * H; sparkle(ctx, x - sl * yy / H + (hash(i, 41) - 0.5) * 60, yy, 18 + hash(i, 42) * 14, Math.sin(Math.PI * p)); }
    },
    pageFlip(ctx, A, B, p) {
      ctx.drawImage(B, 0, 0);
      const e = eInOut(p);
      const c = Math.cos(e * Math.PI / 2); // page folds onto the right-hand spine (Hebrew book)
      if (c > 0.01) {
        ctx.save();
        ctx.setTransform(c, -0.12 * (1 - c), 0, 1, W * (1 - c), 0.12 * (1 - c) * W * 0.5);
        ctx.drawImage(A, 0, 0);
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, `rgba(80,20,50,${0.45 * (1 - c)})`); g.addColorStop(1, 'rgba(80,20,50,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.restore();
        const sg = ctx.createLinearGradient(W * (1 - c) - 80, 0, W * (1 - c), 0);
        sg.addColorStop(0, 'rgba(60,10,40,0)'); sg.addColorStop(1, `rgba(60,10,40,${0.3 * (1 - c)})`);
        ctx.fillStyle = sg; ctx.fillRect(W * (1 - c) - 80, 0, 80, H);
      }
    },
    doors(ctx, A, B, p) {
      const e = eInOut(p);
      ctx.save(); ctx.translate(W / 2, H / 2); const z = 1.12 - 0.12 * e; ctx.scale(z, z); ctx.drawImage(B, -W / 2, -H / 2); ctx.restore();
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 600);
      g.addColorStop(0, `rgba(255,240,200,${0.7 * Math.sin(Math.PI * p)})`); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const c = Math.cos(e * Math.PI / 2);
      if (c > 0.01) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W / 2 * c, H); ctx.clip();
        ctx.setTransform(c, 0.06 * (1 - c), 0, 1, 0, 0); ctx.drawImage(A, 0, 0, W / 2, H, 0, 0, W / 2, H);
        ctx.fillStyle = `rgba(80,30,40,${0.35 * (1 - c)})`; ctx.fillRect(0, 0, W / 2, H); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(W - W / 2 * c, 0, W / 2 * c, H); ctx.clip();
        ctx.setTransform(c, -0.06 * (1 - c), 0, 1, W - W / 2 * c, 0.06 * (1 - c) * W / 2); ctx.drawImage(A, W / 2, 0, W / 2, H, 0, 0, W / 2, H);
        ctx.fillStyle = `rgba(80,30,40,${0.35 * (1 - c)})`; ctx.fillRect(0, 0, W / 2, H); ctx.restore();
        // gold door edges
        ctx.fillStyle = goldGrad(ctx, 0, H); ctx.fillRect(W / 2 * c - 6, 0, 6, H); ctx.fillRect(W - W / 2 * c, 0, 6, H);
      }
    },
    slideBounce(ctx, A, B, p) {
      const e = eInOut(p), b = eOutBack(clamp(p * 1.1), 1.3);
      ctx.save(); ctx.translate(-W * e * 0.9, 0); ctx.globalAlpha = 1 - e * 0.5;
      ctx.translate(W / 2, H / 2); ctx.rotate(-0.06 * e); ctx.drawImage(A, -W / 2, -H / 2); ctx.restore();
      ctx.save(); ctx.translate(W * (1 - b), 0); ctx.translate(W / 2, H / 2); ctx.rotate(0.05 * (1 - b)); ctx.drawImage(B, -W / 2, -H / 2); ctx.restore();
    },
    heartIris(ctx, A, B, p) {
      ctx.drawImage(A, 0, 0);
      const e = eInOut(p); const s = 30 + e * 3400;
      ctx.save(); ctx.translate(W / 2, H / 2 + s * 0.05); heartPath(ctx, s); ctx.save(); ctx.clip();
      ctx.translate(-W / 2, -H / 2 - s * 0.05); ctx.drawImage(B, 0, 0); ctx.restore();
      ctx.lineWidth = 14; ctx.strokeStyle = goldGrad(ctx, -s, s); heartPath(ctx, s); ctx.stroke();
      ctx.restore();
    },
  };

  // =====================================================================
  // TIMELINE — edit here.  [start(s), shot, transitionIn, transitionSeconds]
  // Section boundaries come from the song's structure analysis
  // (novelty peaks at ~6.9, 40.8, 85.6, 111.5, 130.8, 151.3, 158.0, 173.0 s).
  // =====================================================================
  const objX = (start, i) => 40.75 + i * (85.57 - 40.75) / 7;
  const fizz = (ctx, lt) => soapBubbles(ctx, lt, 22, 80, true);
  const orbitBet = (ctx, lt, d, t) => {
    for (let i = 0; i < 14; i++) {
      const u = ((i / 14 + lt * 0.08) % 1);
      const per = 2 * (W - 120) + 2 * (H - 160);
      let s = u * per, x, y;
      const w = W - 120, h = H - 160;
      if (s < w) { x = 60 + s; y = 80; } else if ((s -= w) < h) { x = W - 60; y = 80 + s; } else if ((s -= h) < w) { x = W - 60 - s; y = H - 80; } else { s -= w; x = 60; y = H - 80 - s; }
      letter3D(ctx, 'ב', x, y, 70, 0, Math.sin(lt * 2 + i) * 0.2, prog(lt, 0.2, 1) * 0.95, 0);
    }
  };
  const hearts = (ctx, lt, d, t) => risingHearts(ctx, t, lt, 9, 60);
  const wobbleHearts = (ctx, lt, d, t) => { risingHearts(ctx, t, lt, 6, 20); burst(ctx, 700, 800, prog(lt, 1.2, 2.2), 10, 300, 9); };
  const bubbles = (ctx, lt) => soapBubbles(ctx, lt, 14, 75);
  const lettersFront = (ctx, lt, d, t) => floatLetters(ctx, t, 0.5);

  const RAW = [
    [0, opening],
    [6.92, photoShot('libi-sitting-flag', { focus: [0.55, 0.35], caption: ['היום ליבי היא', [{ t: 'מלכת האותיות!', c: PAL.rose }]], capAt: 0.5, z0: 1.0, z1: 1.1 }), 'sparkleZoom', 0.8],
    [13.24, frameShot('libi-box-flag', { focus: [0.5, 0.42], caption: ['תיבת האוצרות של ב׳'] }), 'lightWipe', 0.7],
    [18.83, frameShot('class-train-flag', { heading: 'כל הגן חוגג!', caption: [[{ t: 'המלכה מובילה את הרכבת', c: PAL.plum }]] }), 'dissolve', 0.8],
    [25.19, letterCard, 'sparkleZoom', 0.7],
    [30.16, frameShot('libi-alphabet-pointer', { heading: 'מ־א׳ ועד ת׳', caption: ['לומדת את כל האותיות'] }), 'slideBounce', 0.6],
    [34.2, frameShot('three-girls-bet-craft', { focus: [0.5, 0.45], caption: [[{ t: 'יצרנו את האות ', c: PAL.plum }, { t: 'ב׳', c: PAL.rose }]] }), 'lightWipe', 0.7],
    // ---- the ב objects ----
    [objX(0, 0), objectShot('libi-bakbuk', 'בַּקְבּוּק', { focus: [0.45, 0.32], extra: fizz }), 'sparkleZoom', 0.7],
    [objX(0, 1), objectShot('libi-beigele', 'בֵּייגָלֶה', { focus: [0.52, 0.36], extra: orbitBet }), 'lightWipe', 0.7],
    [objX(0, 2), objectShot('libi-barvaz', 'בַּרְוָז', { focus: [0.5, 0.38], extra: wobbleHearts }), 'slideBounce', 0.6],
    [objX(0, 3), objectShot('libi-baalei-chaim', 'בַּעֲלֵי חַיִּים', { focus: [0.5, 0.45], size: 78 }), 'pageFlip', 0.9],
    [objX(0, 4), objectShot('libi-bayit', 'בַּיִת', { focus: [0.5, 0.45] }), 'doors', 1.0],
    [objX(0, 5), objectShot('libi-buba-bamba', 'בֻּבַּת בַּמְבָּה', { focus: [0.52, 0.36], extra: hearts, size: 78 }), 'heartIris', 0.9],
    [objX(0, 6), objectShot('libi-buot-sharing', 'בּוּעוֹת', { focus: [0.5, 0.45], extra: bubbles }), 'dissolve', 0.8],
    // ---- chorus energy ----
    [85.57, carouselShot(), 'sparkleZoom', 0.8],
    [98.2, frameShot('libi-display-table', { heading: 'שולחן האות ב׳', caption: ['כל החפצים מתחילים ב־ב׳!'] }), 'lightWipe', 0.7],
    [104.92, frameShot('class-train-items', { heading: 'רכבת המלכה', caption: ['כולנו יחד בשמחה!'] }), 'dissolve', 0.7],
    // ---- breakdown: making the letter ----
    [111.5, frameShot('class-craft-1', { heading: 'יוצרות את ב׳', caption: ['מדביקות ומקשטות'] }), 'dissolve', 1.0],
    [117.93, frameShot('class-craft-3', { heading: 'ידיים קטנות', caption: ['עבודה מלכותית!'] }), 'dissolve', 1.0],
    [123.97, frameShot('body-letter-bet', { focus: [0.5, 0.5], caption: [[{ t: 'עושות ', c: PAL.plum }, { t: 'ב׳', c: PAL.rose }, { t: ' עם הגוף!', c: PAL.plum }]] }), 'lightWipe', 0.9],
    // ---- second energy ----
    [130.82, polaroidShot(), 'sparkleZoom', 0.7],
    [140.9, frameShot('class-craft-2', { heading: 'כל ילדה – אמנית', caption: ['האות ב׳ שלנו'] }), 'heartIris', 0.8],
    [146.2, photoShot('libi-sitting-flag', { focus: [0.55, 0.3], z0: 1.12, z1: 1.25, extra: lettersFront }), 'slideBounce', 0.6],
    [151.25, ringShot, 'dissolve', 1.0],
    // ---- finale ----
    [157.99, collageShot, 'sparkleZoom', 0.8],
    [166.7, photoShot('libi-box-flag', { focus: [0.5, 0.33], caption: [[{ t: 'ליבי, את ', c: PAL.plum }, { t: 'מלכה אמיתית!', c: PAL.rose }]], z0: 1.04, z1: 1.18, extra: hearts }), 'lightWipe', 0.7],
    [173.04, endingShot, 'heartIris', 1.0],
  ];
  const SHOTS = RAW.map(([s, shot, tr, td], i) => ({ start: i === 0 ? 0 : snap(s), shot, tr, td: td || 0 }));
  SHOTS.forEach((s, i) => { s.end = i + 1 < SHOTS.length ? SHOTS[i + 1].start : C.DUR; });
  C.SHOTS = SHOTS;

  function drawShot(ctx, i, t) {
    const s = SHOTS[i];
    ctx.save(); s.shot.draw(ctx, t - s.start, s.end - s.start, t); ctx.restore();
  }

  function overlay(ctx, t) {
    if (isHigh(t)) {
      const bp = barPulse(t, 3);
      const i = beatIndex(t);
      if (bp > 0.05) {
        for (let k = 0; k < 6; k++) {
          const x = hash(i, k + 100) * W, y = hash(i, k + 120) * H * 0.8 + 100;
          sparkle(ctx, x, y, 18 + 16 * hash(i, k + 140), bp);
        }
      }
    }
    ctx.drawImage(vignette, 0, 0);
  }

  C.render = (ctx, t) => {
    t = clamp(t, 0, C.DUR - 1e-3);
    let i = SHOTS.length - 1;
    while (i > 0 && SHOTS[i].start > t) i--;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // transition window around a boundary: [start - td/2, start + td/2]
    let a = -1, b = -1, p = 0, type;
    const nxt = SHOTS[i + 1];
    if (nxt && nxt.td && t >= nxt.start - nxt.td / 2) { a = i; b = i + 1; p = (t - (nxt.start - nxt.td / 2)) / nxt.td; type = nxt.tr; }
    else if (SHOTS[i].td && t < SHOTS[i].start + SHOTS[i].td / 2 && i > 0) { a = i - 1; b = i; p = (t - (SHOTS[i].start - SHOTS[i].td / 2)) / SHOTS[i].td; type = SHOTS[i].tr; }
    if (a >= 0) {
      const ca = bufA.getContext('2d'), cb = bufB.getContext('2d');
      ca.setTransform(1, 0, 0, 1, 0, 0); cb.setTransform(1, 0, 0, 1, 0, 0);
      drawShot(ca, a, t); drawShot(cb, b, t);
      ctx.save(); TR[type](ctx, bufA, bufB, clamp(p), t); ctx.restore();
    } else {
      drawShot(ctx, i, t);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    overlay(ctx, t);
  };

  C.timeline = () => SHOTS.map((s, i) => ({
    n: i + 1, start: +s.start.toFixed(2), end: +s.end.toFixed(2), kind: s.shot.kind,
    photo: s.shot.name || null, word: s.shot.word || null, transitionIn: s.tr || null,
  }));
})();
