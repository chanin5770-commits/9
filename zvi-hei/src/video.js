/* צבי – מלך האות ה׳
 * Canvas engine for the whole video: one pure function render(ctx, t) draws frame t (seconds).
 * Everything is deterministic (seeded randomness), so any frame can be rendered on its own.
 * The timeline is expressed in bars of the soundtrack (ZVI_CONFIG.bar seconds each), so every
 * cut, letter entrance and caption lands on the music.
 */
(function () {
  'use strict';
  const W = 1080, H = 1920;
  const CFG = window.ZVI_CONFIG || { bar: 2, offset: 0, duration: 102 };
  const BAR = CFG.bar, OFF = CFG.offset;
  const T = (b) => OFF + b * BAR;          // bar -> seconds
  const B = (t) => (t - OFF) / BAR;        // seconds -> bar

  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const eOut = (p) => 1 - Math.pow(1 - clamp(p), 3);
  const eIn = (p) => Math.pow(clamp(p), 3);
  const eInOut = (p) => { p = clamp(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; };
  const eBack = (p) => { p = clamp(p); const c = 1.5; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  // damped spring 0 -> 1, s in seconds since start
  const spring = (s, k = 7, w = 12) => (s <= 0 ? 0 : 1 - Math.exp(-k * s) * Math.cos(w * s));
  const prog = (t, t0, dur) => clamp((t - t0) / dur);
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- palette ----------
  const C = { navy: '#071a4a', royal: '#1846a8', sky: '#7cc4ff', gold: '#ffd24a', goldD: '#b07a10', cream: '#fff5dc', pearl: '#fbf8f1' };

  // ---------- assets ----------
  const PHOTOS = ['p01_helicopter', 'p02_tzedaka1', 'p03_tzedaka2', 'p04_portrait', 'p05_hege', 'p06_train1', 'p07_train2',
    'p08_pointer', 'p09_coloring1', 'p10_coloring2', 'p11_group', 'p12_tiles', 'p13_floor_hei', 'p14_coloring3',
    'p15_treats1', 'p16_puzzle1', 'p17_puzzle2', 'p18_poster', 'p19_crown', 'p20_treats2'];
  const IMG = {}, BG = {};
  const SPR = {};

  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load ' + src)); i.src = src; }); }
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  async function loadAssets(base = '') {
    await Promise.all(PHOTOS.flatMap((n) => [
      loadImg(base + 'photos/enhanced/' + n + '.jpg').then((i) => (IMG[n] = i)),
      loadImg(base + 'photos/bg/' + n + '.jpg').then((i) => (BG[n] = i)),
    ]));
    await Promise.all([
      document.fonts.load('700 100px Fredoka', 'אבגדה הֶגֶה'), document.fonts.load('500 100px Fredoka', 'אבגדה'),
      document.fonts.load('700 100px Fredoka', 'abc'),
    ]);
    buildSprites();
  }

  function buildSprites() {
    // soft glow dot
    let c = mk(128, 128), g = c.getContext('2d');
    let gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,248,220,1)'); gr.addColorStop(0.25, 'rgba(255,215,110,0.55)'); gr.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); SPR.glow = c;
    // blue-white glow
    c = mk(128, 128); g = c.getContext('2d'); gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(240,250,255,1)'); gr.addColorStop(0.3, 'rgba(140,200,255,0.45)'); gr.addColorStop(1, 'rgba(120,180,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); SPR.glowB = c;
    // 4-point sparkle star
    c = mk(128, 128); g = c.getContext('2d'); g.translate(64, 64);
    g.drawImage(SPR.glow, -40, -40, 80, 80);
    g.fillStyle = 'rgba(255,253,235,1)';
    for (let k = 0; k < 2; k++) {
      g.save(); g.rotate(k * Math.PI / 2); g.beginPath();
      g.moveTo(0, -62); g.quadraticCurveTo(4, -4, 62, 0); g.quadraticCurveTo(4, 4, 0, 62); g.quadraticCurveTo(-4, 4, -62, 0); g.quadraticCurveTo(-4, -4, 0, -62);
      g.fill(); g.restore();
    }
    SPR.star = c;
    // vignette
    c = mk(W, H); g = c.getContext('2d'); gr = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.62);
    gr.addColorStop(0, 'rgba(3,10,40,0)'); gr.addColorStop(1, 'rgba(3,10,40,0.42)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); SPR.vignette = c;
    // full-screen gold frame overlay
    c = mk(W, H); g = c.getContext('2d');
    const fg = g.createLinearGradient(0, 0, W, H);
    fg.addColorStop(0, '#fff3b0'); fg.addColorStop(0.3, '#e4ac2a'); fg.addColorStop(0.55, '#fff0a0'); fg.addColorStop(0.8, '#c98f17'); fg.addColorStop(1, '#ffe98a');
    g.strokeStyle = fg; g.lineWidth = 9; rrect(g, 26, 26, W - 52, H - 52, 34); g.stroke();
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,240,190,0.85)'; rrect(g, 44, 44, W - 88, H - 88, 24); g.stroke();
    for (const [x, y] of [[44, 44], [W - 44, 44], [44, H - 44], [W - 44, H - 44]]) {
      g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = fg; g.fillRect(-13, -13, 26, 26);
      g.fillStyle = '#1846a8'; g.fillRect(-6, -6, 12, 12); g.restore();
    }
    SPR.frame = c;
    // velvet curtain half (royal blue folds + gold fringe)
    const cw = W / 2 + 80; c = mk(cw, H); g = c.getContext('2d');
    const folds = 7, fw = cw / folds;
    for (let k = 0; k < folds; k++) {
      const lg = g.createLinearGradient(k * fw, 0, (k + 1) * fw, 0);
      lg.addColorStop(0, '#061744'); lg.addColorStop(0.35, '#1f4fb8'); lg.addColorStop(0.55, '#3a6fd8'); lg.addColorStop(1, '#071a4a');
      g.fillStyle = lg; g.fillRect(k * fw, 0, fw + 1, H);
    }
    const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(0,0,20,0.35)'); sh.addColorStop(0.3, 'rgba(0,0,20,0)'); sh.addColorStop(1, 'rgba(0,0,20,0.3)');
    g.fillStyle = sh; g.fillRect(0, 0, cw, H);
    const fr = g.createLinearGradient(0, H - 90, 0, H); fr.addColorStop(0, '#fff0a0'); fr.addColorStop(0.5, '#d9a024'); fr.addColorStop(1, '#8a5a00');
    g.fillStyle = fr; g.fillRect(0, H - 90, cw, 26);
    for (let x = 4; x < cw; x += 14) { g.fillRect(x, H - 64, 6, 50); g.beginPath(); g.arc(x + 3, H - 12, 6, 0, 7); g.fill(); }
    SPR.curtain = c;
  }

  // ---------- drawing primitives ----------
  function rrect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function goldGrad(g, y0, y1) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.35, '#ffe07a'); gr.addColorStop(0.62, '#f0b429'); gr.addColorStop(0.85, '#d18f12'); gr.addColorStop(1, '#ffe48a');
    return gr;
  }

  const spr = (g, s, x, y, size, a = 1) => { if (a <= 0) return; g.globalAlpha = a; g.drawImage(s, x - size / 2, y - size / 2, size, size); g.globalAlpha = 1; };

  // Particles / stars layers are precomputed
  const PARTS = (() => { const r = rng(11); return Array.from({ length: 70 }, () => ({ x: r() * W, sp: 40 + r() * 90, sz: 14 + r() * 46, ph: r() * 1000, dr: 10 + r() * 30, a: 0.25 + r() * 0.6, blue: r() < 0.3 })); })();
  const STARS = (() => { const r = rng(5); return Array.from({ length: 42 }, () => ({ x: r() * W, y: r() * H, sz: 18 + r() * 36, w: 1 + r() * 3, ph: r() * 6.28 })); })();
  const FLOATH = (() => { const r = rng(21); return Array.from({ length: 7 }, () => ({ x: 80 + r() * (W - 160), sp: 25 + r() * 35, sz: 110 + r() * 110, ph: r() * 3000, rot: (r() - 0.5) * 0.6 })); })();

  function rays(g, cx, cy, t, a, n = 16, color = '255,215,110') {
    if (a <= 0) return;
    g.save(); g.translate(cx, cy); g.rotate(t * 0.06); g.globalCompositeOperation = 'lighter';
    const R = 1700, gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, `rgba(${color},${a})`); gr.addColorStop(0.5, `rgba(${color},${a * 0.35})`); gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr;
    for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a0 + Math.PI / n * 0.55); g.closePath(); g.fill(); }
    g.restore();
  }

  function particles(g, t, a = 1) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const p of PARTS) {
      const y = H + 60 - ((t * p.sp + p.ph) % (H + 120));
      const x = p.x + Math.sin((t + p.ph) * 0.6) * p.dr;
      spr(g, p.blue ? SPR.glowB : SPR.glow, x, y, p.sz, p.a * a);
    }
    g.restore();
  }

  function stars(g, t, a = 1) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const s of STARS) { const tw = 0.5 + 0.5 * Math.sin(t * s.w + s.ph); spr(g, SPR.star, s.x, s.y, s.sz * (0.6 + 0.5 * tw), a * tw * 0.8); }
    g.restore();
  }

  function royalBg(g, t, o = {}) {
    const cy = o.cy ?? H * 0.45;
    const gr = g.createRadialGradient(W / 2, cy, 40, W / 2, cy, H * 0.85);
    gr.addColorStop(0, '#3170d8'); gr.addColorStop(0.4, '#143f97'); gr.addColorStop(1, '#050f33');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    rays(g, W / 2, cy, t, o.rays ?? 0.09);
    stars(g, t, o.stars ?? 0.8);
    particles(g, t, o.parts ?? 0.8);
  }

  function photoBg(g, t, name, o = {}) {
    g.imageSmoothingQuality = 'high';
    const bi = BG[name]; const s = Math.max(W / bi.width, H / bi.height) * 1.12;
    const dx = Math.sin(t * 0.15) * 20;
    g.drawImage(bi, W / 2 - bi.width * s / 2 + dx, H / 2 - bi.height * s / 2, bi.width * s, bi.height * s);
    const ov = g.createLinearGradient(0, 0, 0, H); ov.addColorStop(0, 'rgba(6,22,70,0.72)'); ov.addColorStop(0.5, 'rgba(18,60,150,0.5)'); ov.addColorStop(1, 'rgba(5,15,50,0.78)');
    g.fillStyle = ov; g.fillRect(0, 0, W, H);
    rays(g, W / 2, H * 0.42, t, 0.07);
    floatingHei(g, t, o.hei ?? 0.16);
    particles(g, t, 0.7);
  }

  function floatingHei(g, t, a) {
    if (a <= 0) return;
    g.save(); g.font = '700 100px Fredoka'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const f of FLOATH) {
      const y = H + 150 - ((t * f.sp + f.ph) % (H + 300));
      g.save(); g.translate(f.x + Math.sin(t * 0.5 + f.ph) * 30, y); g.rotate(f.rot + Math.sin(t * 0.7 + f.ph) * 0.15);
      g.globalAlpha = a; g.font = `700 ${f.sz}px Fredoka`; g.fillStyle = goldGrad(g, -f.sz / 2, f.sz / 2); g.fillText('ה', 0, 0); g.restore();
    }
    g.restore();
  }

  // ---------- text ----------
  function fitSize(g, str, size, maxW, weight = 700) { g.font = `${weight} ${size}px Fredoka`; const w = g.measureText(str).width; return w > maxW ? size * maxW / w : size; }

  function goldText(g, str, x, y, size, o = {}) {
    const weight = o.weight ?? 700;
    g.save(); g.font = `${weight} ${size}px Fredoka`; g.textAlign = o.align ?? 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.lineJoin = 'round';
    if (o.glow !== 0) { g.shadowColor = o.glowColor ?? 'rgba(255,210,90,0.75)'; g.shadowBlur = size * (o.glow ?? 0.28); }
    g.strokeStyle = o.stroke ?? '#0a1f5c'; g.lineWidth = size * (o.strokeW ?? 0.16); g.strokeText(str, x, y);
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    g.fillStyle = o.fill === 'white' ? '#ffffff' : o.fill ?? goldGrad(g, y - size * 0.55, y + size * 0.45);
    g.fillText(str, x, y);
    g.restore();
  }

  // Word-by-word entrance, laid out right-to-left. Returns nothing; alpha handles fades.
  function wordsIn(g, str, cx, y, size, t, t0, o = {}) {
    const stag = o.stag ?? 0.12, dur = o.dur ?? 0.55;
    const fade = o.out != null ? 1 - prog(t, o.out, o.outDur ?? 0.35) : 1;
    if (fade <= 0 || t < t0) return;
    size = fitSize(g, str, size, o.maxW ?? 960);
    g.font = `700 ${size}px Fredoka`;
    const words = str.split(' ');
    const ws = words.map((w) => g.measureText(w).width), sp = size * 0.27;
    const total = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
    let x = cx + total / 2;
    words.forEach((w, i) => {
      const s = t - (t0 + i * stag);
      const wx = x - ws[i] / 2; x -= ws[i] + sp;
      if (s <= 0) return;
      const sc = lerp(0.35, 1, spring(s, 6, 11)), a = clamp(s / (dur * 0.5)) * fade;
      g.save(); g.globalAlpha = a; g.translate(wx, y + (1 - eOut(s / dur)) * 50); g.scale(sc, sc);
      goldText(g, w, 0, 0, size, o); g.restore();
    });
  }

  // ---------- 3D letter ----------
  function letter3D(g, ch, x, y, size, o = {}) {
    const rotY = o.rotY ?? 0, a = o.alpha ?? 1, glow = o.glow ?? 0.5;
    if (a <= 0 || size < 2) return;
    g.save(); g.globalAlpha = a; g.translate(x, y);
    const sx = Math.cos(rotY); g.scale(Math.abs(sx) < 0.02 ? 0.02 : sx, 1);
    g.font = `700 ${size}px Fredoka`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const depth = size * 0.075, steps = Math.max(6, Math.min(16, Math.round(size / 30)));
    const dx = 0.35 + Math.sin(rotY) * 0.8;
    for (let i = steps; i >= 1; i--) {
      const f = i / steps;
      g.fillStyle = `rgb(${Math.round(lerp(150, 70, f))},${Math.round(lerp(98, 40, f))},${Math.round(lerp(10, 0, f))})`;
      g.fillText(ch, depth * f * dx, depth * f);
    }
    g.lineJoin = 'round';
    if (glow > 0) { g.shadowColor = `rgba(255,214,100,${0.85 * glow})`; g.shadowBlur = size * 0.22 * glow; }
    g.fillStyle = goldGrad(g, -size * 0.45, size * 0.4); g.fillText(ch, 0, 0);
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    g.lineWidth = Math.max(2, size * 0.016); g.strokeStyle = 'rgba(255,253,235,0.95)'; g.strokeText(ch, 0, 0);
    // moving specular sheen (drawn as glyph fill so it never leaves the letter)
    if (o.sheen != null) {
      g.globalCompositeOperation = 'lighter';
      const sxp = lerp(-size * 1.2, size * 1.2, ((o.sheen % 1) + 1) % 1);
      const sg = g.createLinearGradient(sxp - size * 0.25, -size * 0.6, sxp + size * 0.25, size * 0.6);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,240,0.5)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sg; g.fillText(ch, 0, 0);
    }
    g.restore();
  }

  // ---------- crown ----------
  function crown(g, cx, cy, w, t, o = {}) {
    const a = o.alpha ?? 1; if (a <= 0) return;
    g.save(); g.globalAlpha = a; g.translate(cx, cy); g.rotate(o.rot ?? 0); g.scale(w, w);
    const tips = [[-0.5, -0.12], [-0.25, -0.34], [0, -0.48], [0.25, -0.34], [0.5, -0.12]];
    const val = [[-0.375, 0.1], [-0.125, 0.06], [0.125, 0.06], [0.375, 0.1]];
    g.beginPath(); g.moveTo(-0.46, 0.4); g.lineTo(...tips[0]);
    for (let i = 0; i < 4; i++) { g.lineTo(...val[i]); g.lineTo(...tips[i + 1]); }
    g.lineTo(0.46, 0.4); g.quadraticCurveTo(0, 0.47, -0.46, 0.4); g.closePath();
    g.shadowColor = 'rgba(255,200,60,0.8)'; g.shadowBlur = 0.12 * w;
    g.fillStyle = goldGrad(g, -0.5, 0.45); g.fill(); g.shadowBlur = 0; g.shadowColor = 'transparent';
    g.lineWidth = 0.018; g.strokeStyle = '#8a5a00'; g.stroke();
    // band
    g.beginPath(); g.moveTo(-0.47, 0.2); g.quadraticCurveTo(0, 0.27, 0.47, 0.2); g.lineTo(0.465, 0.36); g.quadraticCurveTo(0, 0.43, -0.465, 0.36); g.closePath();
    const bg = g.createLinearGradient(0, 0.2, 0, 0.42); bg.addColorStop(0, '#fff3b5'); bg.addColorStop(0.5, '#e2a51f'); bg.addColorStop(1, '#a8700c');
    g.fillStyle = bg; g.fill(); g.stroke();
    // tip pearls
    for (const [x, y] of tips) { g.beginPath(); g.arc(x, y - 0.03, 0.045, 0, 7); const pg = g.createRadialGradient(x - 0.015, y - 0.045, 0.005, x, y - 0.03, 0.05); pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#d9cbb0'); g.fillStyle = pg; g.fill(); }
    // jewels on band
    const jw = [[-0.3, 0.31, 0.045, '#5fb2ff', '#123a9c'], [0, 0.335, 0.065, '#8fd0ff', '#0e2f8a'], [0.3, 0.31, 0.045, '#5fb2ff', '#123a9c']];
    for (const [x, y, r, c1, c2] of jw) { g.beginPath(); g.ellipse(x, y, r * 1.15, r, 0, 0, 7); const jg = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.2); jg.addColorStop(0, '#ffffff'); jg.addColorStop(0.3, c1); jg.addColorStop(1, c2); g.fillStyle = jg; g.fill(); g.lineWidth = 0.012; g.strokeStyle = '#fff2b0'; g.stroke(); }
    // little sapphire on mid tip
    g.beginPath(); g.moveTo(0, -0.26); g.lineTo(0.05, -0.18); g.lineTo(0, -0.1); g.lineTo(-0.05, -0.18); g.closePath(); g.fillStyle = '#3d8ef5'; g.fill(); g.strokeStyle = '#fff2b0'; g.stroke();
    g.restore();
    // glints
    g.save(); g.globalCompositeOperation = 'lighter';
    tips.forEach(([x, y], i) => { const tw = Math.max(0, Math.sin(t * 3 + i * 1.7)); spr(g, SPR.star, cx + x * w, cy + (y - 0.03) * w, w * 0.32 * tw, a * tw); });
    g.restore();
  }

  // ---------- palace gates ----------
  function archPath(g, x, y, w, h) { const r = w / 2; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + r); g.arc(x + r, y + r, r, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); }

  function gates(g, cx, top, w, h, openP, glowP, t, alpha = 1) {
    if (alpha <= 0) return;
    g.save(); g.globalAlpha = alpha;
    const x0 = cx - w / 2;
    // outer arch (pearl stone with gold trim)
    archPath(g, x0 - 46, top - 46, w + 92, h + 46);
    const sg = g.createLinearGradient(0, top - 46, 0, top + h); sg.addColorStop(0, '#fffaf0'); sg.addColorStop(1, '#e6d3a6');
    g.fillStyle = sg; g.shadowColor = 'rgba(0,0,30,0.5)'; g.shadowBlur = 40; g.fill(); g.shadowBlur = 0; g.shadowColor = 'transparent';
    g.lineWidth = 10; g.strokeStyle = goldGrad(g, top - 50, top + h); g.stroke();
    // inner opening: light behind the doors
    g.save(); archPath(g, x0, top, w, h); g.clip();
    const lg = g.createRadialGradient(cx, top + h * 0.5, 10, cx, top + h * 0.5, h * 0.7);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.35, '#fff1b8'); lg.addColorStop(1, '#f2b53a');
    g.fillStyle = lg; g.fillRect(x0, top, w, h);
    // doors
    const ang = openP * 1.35, sx = Math.cos(ang);
    for (const side of [-1, 1]) {
      g.save();
      const hingeX = side < 0 ? x0 : x0 + w;
      g.translate(hingeX, 0); g.scale(sx * (side < 0 ? 1 : -1), 1);
      // door spans 0..w/2 in local coords
      const dg = g.createLinearGradient(0, 0, w / 2, 0); dg.addColorStop(0, '#0b2766'); dg.addColorStop(0.6, '#1d4fb5'); dg.addColorStop(1, '#163f96');
      g.fillStyle = dg; g.fillRect(0, top, w / 2, h);
      g.strokeStyle = goldGrad(g, top, top + h); g.lineWidth = 8;
      g.strokeRect(22, top + w / 2 * 0.55, w / 2 - 44, h * 0.32);
      g.strokeRect(22, top + h * 0.62, w / 2 - 44, h * 0.3);
      // medallion with a small hei
      g.beginPath(); g.arc(w / 4, top + h * 0.47, 58, 0, 7); g.fillStyle = goldGrad(g, top + h * 0.47 - 58, top + h * 0.47 + 58); g.fill();
      g.beginPath(); g.arc(w / 4, top + h * 0.47, 46, 0, 7); g.fillStyle = '#123a8c'; g.fill();
      g.save(); g.translate(w / 4, top + h * 0.47); g.scale(side < 0 ? 1 : -1, 1); g.font = '700 62px Fredoka'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = goldGrad(g, -30, 30); g.fillText('ה', 0, 4); g.restore();
      // handle ring near the seam
      g.beginPath(); g.arc(w / 2 - 38, top + h * 0.56, 18, 0, 7); g.lineWidth = 7; g.stroke();
      // darkening as the door turns
      g.fillStyle = `rgba(0,5,25,${openP * 0.55})`; g.fillRect(0, top, w / 2, h);
      g.restore();
    }
    // seam light leak
    if (glowP > 0 && openP < 0.3) {
      g.globalCompositeOperation = 'lighter';
      const sw = 8 + 70 * glowP, sl = g.createLinearGradient(cx - sw, 0, cx + sw, 0);
      sl.addColorStop(0, 'rgba(255,220,120,0)'); sl.addColorStop(0.5, `rgba(255,250,225,${0.95 * glowP * (1 - openP * 3)})`); sl.addColorStop(1, 'rgba(255,220,120,0)');
      g.fillStyle = sl; g.fillRect(cx - sw, top, sw * 2, h);
    }
    g.restore();
    // keystone + small crown on top of arch
    crown(g, cx, top - 70, 120, t, { alpha });
    g.restore();
  }

  // ---------- confetti & sparkles ----------
  const CONF_COL = ['#ffd24a', '#ffe98a', '#f0b429', '#ffffff', '#9fd2ff', '#fff3c4', '#e0a020'];
  function confetti(g, t, t0, ox, oy, n, seed, o = {}) {
    const life = o.life ?? 3.6, tau = t - t0; if (tau < 0 || tau > life) return;
    const r = rng(seed), gr = 1500, k = 1.4, spread = o.spread ?? 1.2;
    g.save();
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (r() - 0.5) * 2 * spread, sp = (o.speed ?? 1500) * (0.45 + r() * 0.75);
      const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp, e = 1 - Math.exp(-k * tau);
      const x = ox + (o.xs ?? 0) * (r() - 0.5) + vx * e / k + Math.sin(tau * (3 + r() * 4) + i) * 26;
      const y = oy + (vy - gr / k) * e / k + gr / k * tau * 0.55;
      const w = 12 + r() * 14, h = 7 + r() * 8, rot = r() * 6 + tau * (r() - 0.5) * 12, flip = Math.cos(tau * (5 + r() * 8) + i);
      const a = 1 - clamp((tau - (life - 0.8)) / 0.8);
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, flip); g.globalAlpha = a;
      g.fillStyle = CONF_COL[i % CONF_COL.length]; g.fillRect(-w / 2, -h / 2, w, h); g.restore();
    }
    g.restore();
  }

  function sparkBurst(g, t, t0, cx, cy, n, seed, radius = 380, dur = 1.4) {
    const s = t - t0; if (s < 0 || s > dur) return;
    const r = rng(seed); g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = radius * (0.3 + r() * 0.9) * eOut(s / dur), sz = 30 + r() * 60;
      const al = Math.sin(Math.PI * clamp(s / dur)) * (0.6 + 0.4 * Math.sin(s * 20 + i));
      spr(g, SPR.star, cx + Math.cos(a) * d, cy + Math.sin(a) * d, sz, al);
    }
    g.restore();
  }

  function flash(g, a, color = '255,246,215') { if (a <= 0) return; g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(${color},${a})`; g.fillRect(0, 0, W, H); g.restore(); }

  // ---------- photos ----------
  function srcRect(img, z, fx, fy) {
    const iw = img.width, ih = img.height, sw = iw / z, sh = ih / z;
    return [clamp(fx * iw - sw / 2, 0, iw - sw), clamp(fy * ih - sh / 2, 0, ih - sh), sw, sh];
  }

  function fullPhoto(g, name, z, fx, fy) {
    const img = IMG[name]; const [sx, sy, sw, sh] = srcRect(img, Math.max(1, z), fx, fy);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    return (u, v) => [(u * img.width - sx) / sw * W, (v * img.height - sy) / sh * H, W / sw];
  }

  function card(g, name, cx, cy, w, o = {}) {
    const img = IMG[name], h = w * img.height / img.width, b = o.border ?? 14, r = 22;
    const a = o.alpha ?? 1; if (a <= 0) return;
    g.save(); g.globalAlpha = a; g.translate(cx, cy); g.rotate(o.rot ?? 0); g.scale(o.scale ?? 1, o.scale ?? 1);
    g.shadowColor = 'rgba(0,4,30,0.55)'; g.shadowBlur = 38; g.shadowOffsetY = 16;
    rrect(g, -w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b, r + b * 0.6);
    const fg = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    fg.addColorStop(0, '#fff4b8'); fg.addColorStop(0.3, '#e1a828'); fg.addColorStop(0.55, '#fff0a0'); fg.addColorStop(0.8, '#c48a14'); fg.addColorStop(1, '#ffe48a');
    g.fillStyle = fg; g.fill();
    g.shadowBlur = 0; g.shadowOffsetY = 0; g.shadowColor = 'transparent';
    g.save(); rrect(g, -w / 2, -h / 2, w, h, r); g.clip();
    const [sx, sy, sw, sh] = srcRect(img, Math.max(1, o.z ?? 1), o.fx ?? 0.5, o.fy ?? 0.5);
    g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
    // glossy sweep
    if (o.sheen != null && o.sheen >= 0 && o.sheen <= 1) {
      g.globalCompositeOperation = 'lighter';
      const xs = lerp(-w * 1.2, w * 1.2, o.sheen), sg = g.createLinearGradient(xs - 160, -h / 2, xs + 160, h / 2);
      sg.addColorStop(0, 'rgba(255,240,200,0)'); sg.addColorStop(0.5, 'rgba(255,240,200,0.28)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = sg; g.fillRect(-w / 2, -h / 2, w, h);
    }
    g.restore();
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,250,225,0.9)'; rrect(g, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, r - 4); g.stroke();
    g.restore();
  }

  // Ribbon caption (glass navy pill, gold border, gold text)
  function ribbon(g, str, cy, t, t0, o = {}) {
    const s = t - t0; if (s < 0) return;
    const out = o.out != null ? 1 - prog(t, o.out, 0.3) : 1; if (out <= 0) return;
    const size = fitSize(g, str, o.size ?? 74, 840);
    g.font = `700 ${size}px Fredoka`; const tw = g.measureText(str).width;
    const w = tw + 120, h = size * 1.55, sc = lerp(0.6, 1, spring(s, 6, 10)), a = clamp(s / 0.25) * out;
    g.save(); g.globalAlpha = a; g.translate(W / 2, cy + (1 - eOut(s / 0.5)) * 60); g.scale(sc, sc);
    g.shadowColor = 'rgba(0,0,30,0.5)'; g.shadowBlur = 30; g.shadowOffsetY = 10;
    rrect(g, -w / 2, -h / 2, w, h, h / 2); g.fillStyle = 'rgba(8,26,82,0.82)'; g.fill();
    g.shadowBlur = 0; g.shadowOffsetY = 0; g.shadowColor = 'transparent';
    g.lineWidth = 5; g.strokeStyle = goldGrad(g, -h / 2, h / 2); g.stroke();
    // side diamonds
    for (const sx of [-w / 2 + 34, w / 2 - 34]) { g.save(); g.translate(sx, 0); g.rotate(Math.PI / 4); g.fillStyle = goldGrad(g, -9, 9); g.fillRect(-9, -9, 18, 18); g.restore(); }
    goldText(g, str, 0, size * 0.04, size, { glow: 0.15, strokeW: 0.1 });
    g.restore();
    // sparkle at the moment it lands
    sparkBurst(g, t, t0 + 0.05, W / 2, cy, 10, Math.round(t0 * 100), w * 0.55, 1.0);
  }

  // Big object caption with niqqud: first letter part (ה + its vowel) highlighted
  function objectCaption(g, first, rest, cy, t, t0) {
    const s = t - t0; if (s < 0) return;
    // panel
    const pa = clamp(s / 0.3), py = cy + (1 - eOut(s / 0.6)) * 260;
    g.save(); g.globalAlpha = pa;
    const pw = 960, ph = 400;
    g.shadowColor = 'rgba(0,0,30,0.55)'; g.shadowBlur = 40; rrect(g, W / 2 - pw / 2, py - ph / 2, pw, ph, 60);
    const pg = g.createLinearGradient(0, py - ph / 2, 0, py + ph / 2); pg.addColorStop(0, 'rgba(18,58,150,0.9)'); pg.addColorStop(1, 'rgba(6,22,70,0.92)');
    g.fillStyle = pg; g.fill(); g.shadowBlur = 0; g.shadowColor = 'transparent';
    g.lineWidth = 7; g.strokeStyle = goldGrad(g, py - ph / 2, py + ph / 2); g.stroke();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,240,190,0.7)'; rrect(g, W / 2 - pw / 2 + 14, py - ph / 2 + 14, pw - 28, ph - 28, 48); g.stroke();
    g.restore();
    // "צבי הביא:" label
    wordsIn(g, 'צבי הביא:', W / 2, py - 120, 64, t, t0 + 0.15, { fill: 'white', glow: 0, strokeW: 0.12, stag: 0.1 });
    // the word
    const s2 = t - (t0 + 0.4); if (s2 <= 0) return;
    let size = 200; g.font = `700 ${size}px Fredoka`;
    let w1 = g.measureText(first).width, w2 = g.measureText(rest).width;
    if (w1 + w2 > 860) { size *= 860 / (w1 + w2); g.font = `700 ${size}px Fredoka`; w1 = g.measureText(first).width; w2 = g.measureText(rest).width; }
    const total = w1 + w2, sc = lerp(0.3, 1, spring(s2, 5.5, 10)), a = clamp(s2 / 0.25), wy = py + 50;
    g.save(); g.globalAlpha = a; g.translate(W / 2, wy); g.scale(sc, sc);
    const xFirst = total / 2 - w1 / 2, xRest = total / 2 - w1 - w2 / 2;
    goldText(g, rest, xRest, 0, size, { fill: 'white', glow: 0.12, glowColor: 'rgba(140,200,255,0.8)', strokeW: 0.14 });
    const pulse = 1 + 0.06 * Math.max(0, Math.sin((t - t0) * Math.PI * 2 / BAR * 2));
    g.save(); g.translate(xFirst, 0); g.scale(pulse, pulse);
    goldText(g, first, 0, 0, size, { glow: 0.45, strokeW: 0.16 });
    g.restore(); g.restore();
    // halo + sparkles around the hei
    const hx = W / 2 + xFirst * sc;
    g.save(); g.globalCompositeOperation = 'lighter';
    spr(g, SPR.glow, hx, wy, size * 1.9, 0.35 * a);
    g.restore();
    sparkBurst(g, t, t0 + 0.45, hx, wy, 16, 77 + Math.round(t0), size * 0.9, 1.3);
  }

  function spotlight(g, x, y, r, t, a) {
    if (a <= 0) return;
    g.save(); g.globalAlpha = a;
    const vg = g.createRadialGradient(x, y, r * 0.9, x, y, r * 3.2);
    vg.addColorStop(0, 'rgba(3,10,40,0)'); vg.addColorStop(1, 'rgba(3,10,40,0.38)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.translate(x, y); g.rotate(t * 0.8);
    g.setLineDash([26, 18]); g.lineWidth = 7; g.strokeStyle = 'rgba(255,215,90,0.95)';
    g.shadowColor = 'rgba(255,210,90,0.9)'; g.shadowBlur = 20;
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
    g.setLineDash([]); g.lineWidth = 3; g.strokeStyle = 'rgba(255,250,220,0.8)'; g.beginPath(); g.arc(0, 0, r + 16, 0, 7); g.stroke();
    g.shadowBlur = 0; g.restore();
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { const an = t * 1.6 + i * 1.047; spr(g, SPR.star, x + Math.cos(an) * (r + 8), y + Math.sin(an) * (r + 8), 46 + 14 * Math.sin(t * 5 + i), a * 0.9); }
    g.restore();
  }

  // ======================= SCENES =======================
  const SLOT_X = [870, 650, 430, 210];      // א ב ג ד right-to-left
  const LET = ['א', 'ב', 'ג', 'ד'];
  const ROW_Y = 545, ROW_SIZE = 190;

  function drawOpening(g, t) {
    const b = B(t);
    // camera: slow push + tiny shake before the gates open
    const push = 1 + 0.05 * eInOut(b / 10) - 0.03 * eOut((b - 10) / 1.5);
    const shake = b > 9.4 && b < 10 ? (b - 9.4) * 6 : 0;
    g.save();
    g.translate(W / 2 + Math.sin(t * 47) * shake, H / 2 + Math.cos(t * 39) * shake); g.scale(push, push); g.translate(-W / 2, -H / 2);
    royalBg(g, t, { rays: 0.07 + 0.12 * eOut((b - 10) / 0.6), cy: 1180 });

    // gates
    const openP = eOut((b - 10) / 0.6), glowP = eIn((b - 8.5) / 1.5);
    const gateA = 1 - prog(b, 11.9, 0.35);
    gates(g, W / 2, 760, 800, 1050, openP, glowP, t, gateA);
    if (openP > 0) { // light pouring out of the open gate
      g.save(); g.globalCompositeOperation = 'lighter';
      spr(g, SPR.glow, W / 2, 1280, 1400 * (0.6 + 0.4 * openP), 0.65 * openP * gateA);
      g.restore();
      rays(g, W / 2, 1180, t * 2, 0.2 * openP * gateA, 20, '255,235,160');
    }
    g.restore();

    // titles
    wordsIn(g, 'עד עכשיו למדנו', W / 2, 250, 108, t, T(1.0), { stag: 0.25 * BAR / 2, out: T(8.3) });
    wordsIn(g, 'את האותיות...', W / 2, 375, 108, t, T(1.75), { stag: 0.25 * BAR / 2, out: T(8.3) });
    wordsIn(g, 'ועכשיו הגיע הזמן', W / 2, 250, 104, t, T(8.5), { stag: 0.2 * BAR / 2, out: T(10.0) });
    wordsIn(g, 'להכיר את האות...', W / 2, 372, 104, t, T(9.05), { stag: 0.2 * BAR / 2, out: T(10.0) });

    // letters א ב ג ד
    for (let i = 0; i < 4; i++) {
      const b0 = 4 + i, s = (b - b0) * BAR; if (s < -0.6) continue;
      const fly = eInOut((b - b0 - 0.62) / 0.33);
      // row settles; after the gates open the row lifts to the top and stays as context
      const up = eInOut((b - 10.1) / 0.5), gone = prog(b, 11.85, 0.3);
      const wave = Math.max(0, Math.sin(clamp((b - 8 - i * 0.1) / 0.35) * Math.PI)) * 40;
      const cx = 540, cy = 1300, big = 430;
      let x = lerp(cx, SLOT_X[i], fly), y = lerp(cy, ROW_Y, fly) - wave, size = lerp(big, ROW_SIZE, fly);
      x = lerp(x, lerp(330, 750, 1 - i / 3) + 0, up); y = lerp(y, 150, up); size = lerp(size, 120, up);
      let rotY = 0, alpha = 1 - gone, extra = 1;
      if (fly === 0) {
        if (i === 0) { // golden beam
          const p = clamp(s / 0.7); extra = lerp(0.6, 1, spring(s - 0.1, 6, 10)); alpha *= clamp((s - 0.05) / 0.3);
          if (s < 1.2) { g.save(); g.globalCompositeOperation = 'lighter'; const bw = 200 * (1 - p * 0.4), ba = Math.sin(Math.PI * clamp(s / 1.2)) * 0.85;
            const bgd = g.createLinearGradient(cx - bw, 0, cx + bw, 0); bgd.addColorStop(0, 'rgba(255,210,90,0)'); bgd.addColorStop(0.5, `rgba(255,248,215,${ba})`); bgd.addColorStop(1, 'rgba(255,210,90,0)');
            g.fillStyle = bgd; g.fillRect(cx - bw, 0, bw * 2, cy + 260); g.restore(); }
        } else if (i === 1) { // 3D jump
          const p = clamp(s / 0.75); y = cy + 700 * Math.pow(1 - p, 2) - Math.sin(p * Math.PI) * 260; rotY = (1 - eOut(p)) * Math.PI * 2;
          const land = s - 0.75; if (land > 0) { extra = 1 + Math.exp(-8 * land) * Math.sin(land * 22) * 0.12; }
          alpha *= clamp(s / 0.15);
        } else if (i === 2) { // magic stars
          extra = eBack(clamp((s - 0.35) / 0.5)); alpha *= clamp((s - 0.3) / 0.25);
          g.save(); g.globalCompositeOperation = 'lighter';
          for (let k = 0; k < 14; k++) { const an = k / 14 * 6.283 + s * 4, rr = 520 * (1 - eOut(s / 0.6)) + 40; if (s < 1.1) spr(g, SPR.star, cx + Math.cos(an) * rr, cy + Math.sin(an) * rr * 0.8, 70, clamp(1 - (s - 0.6) / 0.5)); }
          g.restore();
          sparkBurst(g, t, T(b0) + 0.55, cx, cy, 26, 300 + i, 420, 1.2);
        } else { // fly-in from depth (camera move)
          const p = eOut(clamp(s / 0.8)); extra = lerp(4.5, 1, p); alpha *= clamp(s / 0.35); rotY = (1 - p) * 0.6;
          x = lerp(cx + 300, cx, p); y = lerp(cy - 500, cy, p);
        }
        if (s >= 0 && s < 1.0) { g.save(); g.globalCompositeOperation = 'lighter'; spr(g, SPR.glow, x, y, 900, 0.45 * Math.sin(Math.PI * clamp(s / 1.0))); g.restore(); }
      }
      if (s < 0) continue;
      letter3D(g, LET[i], x, y, size * extra, { rotY, alpha, glow: 0.6, sheen: (t * 0.35 + i * 0.2) });
    }

    // ה emerges from the gate
    const hs = (b - 10.02) * BAR;
    const reveal = eInOut((b - 12) / 0.45);   // slides aside for Zvi
    if (hs > 0 && b < 12.6) {
      const sc = lerp(0.12, 1, spring(hs, 4.5, 7)), size = 660 * sc;
      let hx = lerp(540, -260, reveal), hy = lerp(1230, 1100, eOut(hs / 1.2));
      const rot = -0.5 * reveal;
      g.save(); g.globalCompositeOperation = 'lighter'; spr(g, SPR.glow, hx, hy, 1300 * sc, 0.55 * (1 - reveal)); g.restore();
      g.save(); g.translate(hx, hy); g.rotate(rot);
      letter3D(g, 'ה', 0, 0, size, { glow: 1, sheen: t * 0.45 });
      const cs = (b - 10.45) * BAR;
      if (cs > 0) crown(g, 0, -size * 0.55 - 40 - 300 * (1 - eOut(cs / 0.6)), 330 * sc, t, { alpha: clamp(cs / 0.2), rot: Math.sin(cs * 9) * Math.exp(-cs * 3) * 0.2 });
      g.restore();
      sparkBurst(g, t, T(10.05), 540, 1150, 40, 900, 620, 1.8);
      if (b < 12) wordsIn(g, 'האות ה׳', W / 2, 1690, 130, t, T(10.8), { stag: 0.15, out: T(11.95) });
    }
    confetti(g, t, T(10.02), 540, 1250, 150, 41, { speed: 1900, spread: 1.0 });
    flash(g, 0.85 * Math.exp(-Math.max(0, (b - 10) * BAR) * 3.5) * (b >= 10 ? 1 : 0));

    // Zvi reveal
    if (b >= 11.95) drawZviReveal(g, t, (b - 12) * BAR);
  }

  function drawZviReveal(g, t, s) {
    const p = spring(s - 0.05, 5, 8);
    const w = 720, img = IMG.p04_portrait, h = w * img.height / img.width, cy = 990;
    g.save(); g.globalCompositeOperation = 'lighter'; spr(g, SPR.glow, 540, cy, 1700, 0.5 * clamp(s / 0.4) * (0.7 + 0.3 * Math.sin(t * 2))); g.restore();
    rays(g, 540, cy, t * 1.5, 0.12 * clamp(s / 0.5), 18, '255,230,150');
    card(g, 'p04_portrait', lerp(820, 540, eOut(s / 0.6)), cy, w, { scale: lerp(0.25, 1, p), rot: lerp(0.25, 0, eOut(s / 0.7)) + Math.sin(t * 0.8) * 0.008, alpha: clamp(s / 0.2), z: 1 + 0.04 * clamp(s / 6), fx: 0.48, fy: 0.4, sheen: (s - 0.6) / 1.2, border: 18 });
    const cs = s - 0.55;
    if (cs > 0) crown(g, 540, cy - h / 2 - 82 - 400 * (1 - eOut(cs / 0.55)), 300, t, { alpha: clamp(cs / 0.15), rot: Math.sin(cs * 10) * Math.exp(-cs * 3.5) * 0.25 });
    wordsIn(g, 'צבי שלנו', W / 2, 1700, 128, t, T(12.5), { stag: 0.18 });
    wordsIn(g, 'מלך האות ה׳!', W / 2, 1832, 104, t, T(12.95), { stag: 0.16 });
    sparkBurst(g, t, T(12) + 0.6, 540, cy - h / 2 - 90, 24, 1201, 260, 1.6);
    confetti(g, t, T(12) + 0.05, 200, 1950, 90, 51, { speed: 2300, spread: 0.45 });
    confetti(g, t, T(12) + 0.05, 880, 1950, 90, 52, { speed: 2300, spread: 0.45 });
    confetti(g, t, T(13), 540, -60, 120, 53, { speed: 300, spread: 3.1, xs: 1100, life: 4 });
    flash(g, 0.6 * Math.exp(-Math.max(0, s) * 4) * (s >= 0 ? 1 : 0));
  }

  // ----- photo scene renderers -----
  function sceneFull(g, t, sc) {
    const p = clamp((t - sc.start) / (sc.end - sc.start));
    const z = lerp(sc.z0, sc.z1, eInOut(p));
    const fy = sc.fy1 != null ? lerp(sc.fy, sc.fy1, eInOut(p)) : sc.fy;
    fullPhoto(g, sc.img, z, sc.fx, fy);
    g.drawImage(SPR.vignette, 0, 0);
    g.drawImage(SPR.frame, 0, 0);
    if (sc.cap) ribbon(g, sc.cap, sc.capY ?? 1720, t, sc.start + 0.35);
  }

  function sceneObject(g, t, sc) {
    const p = clamp((t - sc.start) / (sc.end - sc.start));
    const z = lerp(1.0, sc.z, eInOut(p));
    const map = fullPhoto(g, sc.img, z, sc.fx, sc.fy);
    g.drawImage(SPR.vignette, 0, 0);
    const [ox, oy, k] = map(sc.ou, sc.ov);
    spotlight(g, ox, oy, sc.or * k, t, clamp((t - sc.start - 0.5) / 0.4));
    g.drawImage(SPR.frame, 0, 0);
    objectCaption(g, sc.first, sc.rest, 1655, t, sc.start + 0.25);
    confetti(g, t, sc.start + 0.6, 540, 1500, 70, Math.round(sc.start * 10), { speed: 1700, spread: 0.9 });
  }

  function scenePair(g, t, sc) {
    photoBg(g, t, sc.imgs[0]);
    const s = t - sc.start + 0.45, dur = sc.end - sc.start;
    const drift = Math.sin((s / dur) * Math.PI) * 14;
    const e1 = spring(s - 0.1, 5.5, 9), e2 = spring(s - 0.35, 5.5, 9);
    card(g, sc.imgs[0], lerp(1400, 300, e1), 900 - drift, 470, { rot: -0.06, z: lerp(1, 1.08, s / dur), fx: 0.45, fy: 0.4, sheen: (s - 0.6) / 1.2 });
    card(g, sc.imgs[1], lerp(-400, 785, e2), 1010 + drift, 470, { rot: 0.055, z: lerp(1.06, 1, s / dur), fx: 0.45, fy: 0.45, sheen: (s - 0.9) / 1.2 });
    if (sc.cap) ribbon(g, sc.cap, 1690, t, sc.start + 0.5);
  }

  function sceneStack(g, t, sc) {
    photoBg(g, t, sc.imgs[0]);
    const s = t - sc.start + 0.45, dur = sc.end - sc.start;
    const e1 = spring(s - 0.08, 5.5, 9), e2 = spring(s - 0.32, 5.5, 9);
    const z = (a) => lerp(a, a + 0.07, s / dur);
    card(g, sc.imgs[0], lerp(1500, 540, e1), 600, 960, { rot: -0.025 + Math.sin(t) * 0.004, z: z(1.0), fx: sc.f[0][0], fy: sc.f[0][1], sheen: (s - 0.5) / 1.3 });
    card(g, sc.imgs[1], lerp(-500, 540, e2), 1210, 960, { rot: 0.025 - Math.sin(t) * 0.004, z: z(1.02), fx: sc.f[1][0], fy: sc.f[1][1], sheen: (s - 0.8) / 1.3 });
    if (sc.cap) ribbon(g, sc.cap, 1690, t, sc.start + 0.45, { size: 78 });
  }

  function sceneSingle(g, t, sc) {
    photoBg(g, t, sc.img);
    const s = t - sc.start + 0.45, dur = sc.end - sc.start;
    const e = spring(s - 0.1, 5, 8);
    card(g, sc.img, 540, lerp(1300, 880, e), 1000, { scale: lerp(0.6, 1, e), rot: lerp(0.08, -0.015, e) + Math.sin(t * 0.7) * 0.006,
      alpha: clamp(s / 0.25), z: lerp(1, 1.12, clamp(s / dur)), fx: sc.fx ?? 0.5, fy: sc.fy ?? 0.5, sheen: (s - 0.7) / 1.4 });
    sparkBurst(g, t, sc.start + 0.2, 540, 880, 22, Math.round(sc.start), 600, 1.4);
    if (sc.cap) ribbon(g, sc.cap, 1560, t, sc.start + 0.5, { size: 78 });
  }

  function sceneCarousel(g, t, sc) {
    royalBg(g, t, { rays: 0.12, cy: 900 });
    floatingHei(g, t, 0.18);
    const s = t - sc.start + 0.4, dur = sc.end - sc.start, n = sc.imgs.length;
    // eased stepping: each photo comes to the front and rests
    const stepT = dur / n, k = Math.floor(s / stepT), f = (s - k * stepT) / stepT;
    const theta = -(k + eInOut(clamp((f - 0.55) / 0.45))) * (Math.PI * 2 / n);
    const items = sc.imgs.map((name, i) => {
      const a = theta + i * Math.PI * 2 / n;
      return { name, a, z: Math.cos(a), x: 540 + Math.sin(a) * 330 };
    }).sort((p, q) => p.z - q.z);
    const intro = spring(s, 4, 7);
    for (const it of items) {
      const scale = (0.55 + 0.45 * (it.z + 1) / 2) * lerp(0.4, 1, intro);
      card(g, it.name, it.x, 960 + (1 - it.z) * -60, 620, { scale, rot: Math.sin(it.a) * 0.08, alpha: (0.55 + 0.45 * (it.z + 1) / 2) * clamp(s / 0.3) });
    }
    if (sc.cap) ribbon(g, sc.cap, 1760, t, sc.start + 0.4);
  }

  // ----- finale -----
  const FIN = [
    { n: 'p04_portrait', x: 200, y: 640, w: 290, r: -0.09 },
    { n: 'p05_hege', x: 880, y: 640, w: 290, r: 0.09 },
    { n: 'p11_group', x: 540, y: 470, w: 450, r: 0.0 },
    { n: 'p01_helicopter', x: 190, y: 1330, w: 280, r: 0.07 },
    { n: 'p20_treats2', x: 890, y: 1330, w: 280, r: -0.07 },
    { n: 'p12_tiles', x: 540, y: 1430, w: 440, r: -0.03 },
  ];

  const FIN2 = ['p15_treats1', 'p19_crown', 'p07_train2', 'p08_pointer', 'p03_tzedaka2', 'p13_floor_hei'];

  function drawFinale(g, t, sc) {
    const s = t - sc.start, b = B(t), fb = sc.finaleBar;
    const FL = B(CFG.duration) - fb, hit = fb + Math.max(7, FL - 3), long = FL > 14;
    const swap = long ? fb + Math.round(FL * 0.45) : 1e9;
    const pull = 1 - 0.12 * eInOut((b - hit + 1) / 3), fadeOut = prog(b, hit + 1.6, Math.max(1, Math.min(1.4, B(CFG.duration) - hit - 1.7)));
    royalBg(g, t, { rays: 0.16, cy: 1000, stars: 1, parts: 1 });
    g.save(); g.translate(W / 2, H / 2); g.scale(pull, pull); g.translate(-W / 2, -H / 2);
    const out = eInOut((b - swap) / 0.6);
    FIN.forEach((c, i) => {
      const e = spring(s - 0.15 - i * BAR / 8, 5, 8) * (1 - out), ang = (i / FIN.length) * 6.283;
      if (e <= 0.001 && out > 0) return;
      const bob = Math.sin(t * 1.2 + i) * 10;
      card(g, c.n, lerp(540 + Math.cos(ang) * 1300, c.x, e), lerp(960 + Math.sin(ang) * 1500, c.y, e) + bob, c.w,
        { rot: c.r + Math.sin(t * 0.9 + i) * 0.02, scale: lerp(0.3, 1, e), alpha: clamp((s - i * BAR / 8) / 0.2), sheen: ((t * 0.25 + i * 0.17) % 1.6) - 0.3, border: 11 });
    });
    if (b > swap) FIN2.forEach((n, i) => {
      const c = FIN[i], e = spring(t - T(swap + 0.35) - i * BAR / 8, 5, 8), ang = (i / FIN.length) * 6.283 + 1.2;
      const bob = Math.sin(t * 1.2 + i + 2) * 10;
      card(g, n, lerp(540 + Math.cos(ang) * 1300, c.x, e), lerp(960 + Math.sin(ang) * 1500, c.y, e) + bob, c.w,
        { rot: -c.r + Math.sin(t * 0.9 + i) * 0.02, scale: lerp(0.3, 1, e), alpha: clamp((t - T(swap + 0.35) - i * BAR / 8) / 0.2), sheen: ((t * 0.25 + i * 0.17) % 1.6) - 0.3, border: 11 });
    });
    // central hei with crown
    const hs = s - 0.2, hsc = lerp(0.2, 1, spring(hs, 4.5, 7));
    g.save(); g.globalCompositeOperation = 'lighter'; spr(g, SPR.glow, 540, 1010, 1200 * hsc, 0.55); g.restore();
    rays(g, 540, 1010, t * 1.6, 0.14, 18, '255,230,150');
    if (hs > 0) {
      const beat = Math.exp(-((b * 4) % 1) * 4) * 0.025 * (b > fb && b < hit ? 1 : 0);
      letter3D(g, 'ה', 540, 1030, 470 * hsc * (1 + beat), { glow: 1, sheen: t * 0.4 });
      crown(g, 540, 1030 - 470 * hsc * 0.56 - 25, 250 * hsc, t, { alpha: clamp(hs / 0.3) });
    }
    wordsIn(g, 'כל הכבוד לצבי שלנו!', W / 2, 205, 98, t, T(fb + 0.5), { stag: 0.14 });
    wordsIn(g, 'מלך האות ה׳', W / 2, 1690, 132, t, T(fb + (long ? 2.5 : 2)), { stag: 0.2 });
    wordsIn(g, 'איזה מלך של אותיות!', W / 2, 1838, 82, t, T(fb + (long ? 5 : 4)), { stag: 0.14, fill: 'white', glowColor: 'rgba(140,200,255,0.8)' });
    confetti(g, t, T(fb) + 0.05, 540, 2000, 140, 61, { speed: 2600, spread: 0.5 });
    confetti(g, t, T(fb + (long ? 5 : 4)), 540, -60, 120, 62, { speed: 260, spread: 3.1, xs: 1100, life: 4.5 });
    confetti(g, t, T(hit), 150, 1980, 100, 63, { speed: 2500, spread: 0.4 });
    confetti(g, t, T(hit), 930, 1980, 100, 64, { speed: 2500, spread: 0.4 });
    if (long) { confetti(g, t, T(swap + 0.3), 540, -60, 130, 65, { speed: 260, spread: 3.1, xs: 1100, life: 4.5 }); sparkBurst(g, t, T(swap + 0.3), 540, 1010, 40, 4700, 650, 1.8); }
    sparkBurst(g, t, T(hit), 540, 1010, 50, 4800, 700, 2.0);
    g.restore();
    flash(g, 0.5 * Math.exp(-Math.max(0, (b - hit) * BAR) * 3) * (b >= hit ? 1 : 0));
    flash(g, 0.45 * Math.exp(-Math.max(0, s) * 4));
    if (fadeOut > 0) { g.fillStyle = `rgba(3,8,30,${eInOut(fadeOut)})`; g.fillRect(0, 0, W, H); }
  }

  // ======================= TIMELINE =======================
  // Photo section (bars 15..41). Lengths stretch automatically if a longer song is used.
  const PHOTO_SCENES = [
    { kind: 'full', bars: 2, img: 'p08_pointer', z0: 1.0, z1: 1.12, fx: 0.5, fy: 0.55, cap: 'המלך מצביע על האותיות', capY: 1760, trans: 'curtain' },
    { kind: 'full', bars: 2, img: 'p19_crown', z0: 1.04, z1: 1.14, fx: 0.72, fy: 0.42, fy1: 0.5, cap: 'מכינים כתר מלכותי', capY: 1740, trans: 'goldWipe' },
    { kind: 'stack', bars: 2, imgs: ['p18_poster', 'p14_coloring3'], f: [[0.5, 0.4], [0.4, 0.35]], cap: 'צובעים את האות ה׳', trans: 'album' },
    { kind: 'stack', bars: 2, imgs: ['p12_tiles', 'p13_floor_hei'], f: [[0.5, 0.5], [0.6, 0.45]], cap: 'בונים את האות ה׳', trans: 'sparkle' },
    { kind: 'object', bars: 3, img: 'p05_hege', z: 1.2, fx: 0.52, fy: 0.36, ou: 0.556, ov: 0.452, or: 255, first: 'הֶ', rest: 'גֶה', trans: 'portal' },
    { kind: 'object', bars: 3, img: 'p01_helicopter', z: 1.18, fx: 0.42, fy: 0.42, ou: 0.337, ov: 0.556, or: 170, first: 'הֶ', rest: 'לִיקוֹפְּטֶר', trans: 'zoom' },
    { kind: 'carousel', bars: 2, imgs: ['p09_coloring1', 'p10_coloring2', 'p16_puzzle1'], cap: 'כל הגן חוגג את האות ה׳', trans: 'goldWipe' },
    { kind: 'pair', bars: 2, imgs: ['p02_tzedaka1', 'p03_tzedaka2'], cap: 'נותנים צדקה', trans: 'sparkle' },
    { kind: 'stack', bars: 2, imgs: ['p06_train1', 'p07_train2'], f: [[0.45, 0.45], [0.6, 0.45]], cap: 'רכבת של שמחה!', trans: 'zoom' },
    { kind: 'stack', bars: 2, imgs: ['p11_group', 'p17_puzzle2'], f: [[0.4, 0.45], [0.5, 0.5]], cap: 'חברים טובים יחד', trans: 'album' },
    { kind: 'full', bars: 2, img: 'p15_treats1', z0: 1.15, z1: 1.02, fx: 0.35, fy: 0.4, cap: 'מחלקים כיבוד לחברים', capY: 1770, trans: 'portal' },
    { kind: 'full', bars: 2, img: 'p20_treats2', z0: 1.0, z1: 1.12, fx: 0.3, fy: 0.42, cap: 'שמחה לכל החברים', capY: 1770, trans: 'goldWipeL' },
  ];
  const BASE_BARS = 51;

  // Plan for the real song (152 BPM, 2:46): scene starts follow its sections
  // 27 = chorus (objects), 57 = dip, 60 = peak, 73 = break, 82 = final section -> finale
  const LONG_PLAN = [
    [4, { kind: 'full', img: 'p08_pointer', z0: 1.0, z1: 1.12, fx: 0.5, fy: 0.55, cap: 'המלך מצביע על האותיות', capY: 1760, trans: 'curtain' }],
    [4, { kind: 'full', img: 'p19_crown', z0: 1.04, z1: 1.14, fx: 0.72, fy: 0.42, fy1: 0.5, cap: 'מכינים כתר מלכותי', capY: 1740, trans: 'goldWipe' }],
    [4, { kind: 'stack', imgs: ['p18_poster', 'p14_coloring3'], f: [[0.5, 0.4], [0.4, 0.35]], cap: 'צובעים את האות ה׳', trans: 'album' }],
    [5, { kind: 'object', img: 'p05_hege', z: 1.2, fx: 0.52, fy: 0.36, ou: 0.556, ov: 0.452, or: 255, first: 'הֶ', rest: 'גֶה', trans: 'portal' }],
    [5, { kind: 'object', img: 'p01_helicopter', z: 1.18, fx: 0.42, fy: 0.42, ou: 0.337, ov: 0.556, or: 170, first: 'הֶ', rest: 'לִיקוֹפְּטֶר', trans: 'zoom' }],
    [4, { kind: 'stack', imgs: ['p12_tiles', 'p13_floor_hei'], f: [[0.5, 0.5], [0.6, 0.45]], cap: 'בונים את האות ה׳', trans: 'sparkle' }],
    [4, { kind: 'carousel', imgs: ['p09_coloring1', 'p10_coloring2', 'p16_puzzle1'], cap: 'כל הגן חוגג את האות ה׳', trans: 'goldWipe' }],
    [4, { kind: 'pair', imgs: ['p02_tzedaka1', 'p03_tzedaka2'], cap: 'נותנים צדקה', trans: 'sparkle' }],
    [4, { kind: 'stack', imgs: ['p06_train1', 'p07_train2'], f: [[0.45, 0.45], [0.6, 0.45]], cap: 'רכבת של שמחה!', trans: 'zoom' }],
    [4, { kind: 'single', img: 'p11_group', fx: 0.4, fy: 0.45, cap: 'חברים טובים יחד', trans: 'album' }],
    [3, { kind: 'full', img: 'p04_portrait', z0: 1.0, z1: 1.08, fx: 0.48, fy: 0.3, cap: 'צבי – מלך האות ה׳', capY: 1770, trans: 'dissolve' }],
    [4, { kind: 'full', img: 'p15_treats1', z0: 1.15, z1: 1.02, fx: 0.35, fy: 0.4, cap: 'מחלקים כיבוד לחברים', capY: 1770, trans: 'goldWipe' }],
    [4, { kind: 'full', img: 'p20_treats2', z0: 1.0, z1: 1.12, fx: 0.3, fy: 0.42, cap: 'שמחה לכל החברים', capY: 1770, trans: 'portal' }],
    [5, { kind: 'carousel', imgs: ['p05_hege', 'p01_helicopter', 'p04_portrait'], cap: 'צבי המלך שלנו', trans: 'zoom' }],
    [4, { kind: 'single', img: 'p17_puzzle2', cap: 'מרכיבים את האותיות', trans: 'dissolve' }],
    [5, { kind: 'pair', imgs: ['p08_pointer', 'p19_crown'], cap: 'יום מלכותי בגן', trans: 'album' }],
  ];

  function buildTimeline() {
    const totalBars = Math.floor((CFG.duration - OFF) / BAR + 1e-6);
    let extra = totalBars - BASE_BARS;
    let sc = PHOTO_SCENES.map((p) => ({ ...p }));
    if (totalBars >= 90) { sc = LONG_PLAN.map(([bars, p]) => ({ ...p, bars })); extra = 0; }
    for (let i = 0; extra !== 0 && i < 400; i++) {
      const s = sc[i % sc.length];
      if (extra > 0) { s.bars += 1; extra--; } else if (s.bars > 1) { s.bars -= 1; extra++; }
    }
    const scenes = [{ kind: 'opening', start: -1, end: T(15) }];
    let bar = 15;
    for (const s of sc) { s.start = T(bar); bar += s.bars; s.end = T(bar); scenes.push(s); }
    scenes.push({ kind: 'finale', start: T(bar), end: CFG.duration + 1, trans: 'portal', finaleBar: bar });
    return scenes;
  }
  const SCENES = buildTimeline();

  function drawScene(g, sc, t) {
    switch (sc.kind) {
      case 'opening': return drawOpening(g, t);
      case 'full': return sceneFull(g, t, sc);
      case 'object': return sceneObject(g, t, sc);
      case 'pair': return scenePair(g, t, sc);
      case 'stack': return sceneStack(g, t, sc);
      case 'carousel': return sceneCarousel(g, t, sc);
      case 'single': return sceneSingle(g, t, sc);
      case 'finale': return drawFinale(g, t, sc);
    }
  }

  // ======================= TRANSITIONS =======================
  const TR_DUR = { curtain: 1.7, goldWipe: 0.9, goldWipeL: 0.9, album: 1.0, sparkle: 0.9, portal: 1.0, zoom: 0.8, dissolve: 0.8 };

  const TRANS = {
    dissolve(g, A, Bc, p) { g.drawImage(A, 0, 0); g.globalAlpha = eInOut(p); g.drawImage(Bc, 0, 0); g.globalAlpha = 1; },
    sparkle(g, A, Bc, p, t) {
      g.drawImage(A, 0, 0); g.globalAlpha = eInOut(p); g.drawImage(Bc, 0, 0); g.globalAlpha = 1;
      flash(g, Math.sin(Math.PI * p) * 0.28);
      const r = rng(99); g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 46; i++) { const x = r() * W, y = r() * H, d = r() * 0.5; const a = Math.sin(Math.PI * clamp((p - d * 0.6) / 0.6)); spr(g, SPR.star, x, y - p * 120, 40 + r() * 80, a); }
      g.restore();
    },
    zoom(g, A, Bc, p) {
      const e = eInOut(p);
      g.save(); g.globalAlpha = 1 - e; g.translate(W / 2, H / 2); g.scale(1 + 0.4 * e, 1 + 0.4 * e); g.drawImage(A, -W / 2, -H / 2); g.restore();
      g.save(); g.globalAlpha = e; g.translate(W / 2, H / 2); const s = 1.18 - 0.18 * e; g.scale(s, s); g.drawImage(Bc, -W / 2, -H / 2); g.restore();
      flash(g, Math.sin(Math.PI * p) * 0.3);
    },
    goldWipe(g, A, Bc, p, t, dir = 1) {
      const e = eInOut(p), k = 0.35, band = 150;
      const span = W + H * k + band * 2, edge = (dir > 0 ? W + band - e * span : -band + e * span); // x of wipe edge at y = H/2
      g.drawImage(A, 0, 0);
      g.save(); g.beginPath();
      const x1 = edge - H / 2 * k, x2 = edge + H / 2 * k;  // edge at top / bottom
      if (dir > 0) { g.moveTo(x1, 0); g.lineTo(W + 2000, 0); g.lineTo(W + 2000, H); g.lineTo(x2, H); }
      else { g.moveTo(x1, 0); g.lineTo(-2000, 0); g.lineTo(-2000, H); g.lineTo(x2, H); }
      g.closePath(); g.clip(); g.drawImage(Bc, 0, 0); g.restore();
      g.save(); g.globalCompositeOperation = 'lighter'; g.translate(edge, H / 2); g.rotate(-Math.atan(k));
      const lg = g.createLinearGradient(-band, 0, band, 0);
      lg.addColorStop(0, 'rgba(255,200,80,0)'); lg.addColorStop(0.4, 'rgba(255,215,110,0.6)'); lg.addColorStop(0.5, 'rgba(255,252,235,0.95)'); lg.addColorStop(0.6, 'rgba(255,215,110,0.6)'); lg.addColorStop(1, 'rgba(255,200,80,0)');
      g.fillStyle = lg; g.fillRect(-band, -H, band * 2, H * 2);
      for (let i = 0; i < 9; i++) spr(g, SPR.star, Math.sin(i * 3.1 + t * 4) * 30, -H / 2 + (i + 0.5) * H / 9, 70 + 30 * Math.sin(t * 9 + i), 0.9);
      g.restore();
    },
    goldWipeL(g, A, Bc, p, t) { TRANS.goldWipe(g, A, Bc, p, t, -1); },
    portal(g, A, Bc, p, t) {
      const e = eInOut(p), R = e * Math.hypot(W, H) * 0.56, cx = W / 2, cy = H * 0.48;
      g.save(); g.translate(W / 2, H / 2); g.rotate(e * 0.08); g.scale(1 + e * 0.15, 1 + e * 0.15); g.drawImage(A, -W / 2, -H / 2); g.restore();
      g.save(); g.beginPath(); g.arc(cx, cy, Math.max(1, R), 0, 7); g.clip(); g.drawImage(Bc, 0, 0); g.restore();
      if (R > 2) {
        g.save(); g.globalCompositeOperation = 'lighter'; g.lineWidth = 22; g.shadowColor = 'rgba(255,210,90,1)'; g.shadowBlur = 40;
        g.strokeStyle = `rgba(255,220,120,${0.9 * (1 - e * 0.6)})`; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke(); g.shadowBlur = 0;
        for (let i = 0; i < 16; i++) { const an = i / 16 * 6.283 + t * 2; spr(g, SPR.star, cx + Math.cos(an) * R, cy + Math.sin(an) * R, 80, 1 - e * 0.5); }
        g.restore();
      }
    },
    album(g, A, Bc, p) {
      const e = eInOut(p);
      g.drawImage(Bc, 0, 0);
      g.fillStyle = `rgba(3,10,40,${0.5 * (1 - e)})`; g.fillRect(0, 0, W, H);
      const sx = Math.cos(e * Math.PI / 2);
      if (sx > 0.01) {
        g.save(); g.translate(W, 0); g.scale(sx, 1); g.translate(-W, 0);
        g.drawImage(A, 0, 0);
        const sh = g.createLinearGradient(0, 0, W, 0); sh.addColorStop(0, `rgba(0,0,0,${0.55 * e})`); sh.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sh; g.fillRect(0, 0, W, H);
        g.restore();
        // page edge shadow on B
        const ex = W - W * sx; const es = g.createLinearGradient(ex - 90, 0, ex, 0); es.addColorStop(0, 'rgba(0,0,20,0)'); es.addColorStop(1, `rgba(0,0,20,${0.45 * (1 - e)})`);
        g.fillStyle = es; g.fillRect(ex - 90, 0, 90, H);
        g.fillStyle = 'rgba(255,230,150,0.9)'; g.fillRect(ex - 3, 0, 6, H);
      }
    },
    curtain(g, A, Bc, p, t) {
      const close = eInOut(p / 0.42), open = eInOut((p - 0.58) / 0.42);
      const cover = p < 0.5 ? close : 1 - open;
      g.drawImage(p < 0.5 ? A : Bc, 0, 0);
      const cw = SPR.curtain.width;
      const sway = Math.sin(t * 3) * 6;
      g.save(); g.translate(lerp(-cw, 0, cover) + sway, 0); g.drawImage(SPR.curtain, 0, 0); g.restore();
      g.save(); g.translate(W - lerp(-cw, 0, cover) - sway, 0); g.scale(-1, 1); g.drawImage(SPR.curtain, 0, 0); g.restore();
      // pelmet
      const pa = Math.sin(Math.PI * clamp(p)) ;
      g.save(); g.globalAlpha = clamp(pa * 1.6);
      const pg = g.createLinearGradient(0, 0, 0, 170); pg.addColorStop(0, '#061744'); pg.addColorStop(1, '#1846a8');
      g.fillStyle = pg; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, 130);
      for (let i = 6; i >= 0; i--) { const x = i * W / 6; g.quadraticCurveTo(x + W / 12, 190, x, 130); }
      g.closePath(); g.fill(); g.lineWidth = 8; g.strokeStyle = goldGrad(g, 100, 190); g.stroke();
      crown(g, W / 2, 95, 150, t, { alpha: 1 });
      g.restore();
      if (cover > 0.98) { sparkBurst(g, t, t - (p - 0.45) * 1.7, W / 2, H / 2, 30, 7, 400, 1.2); }
    },
  };

  let bufA = null, bufB = null;
  function buffers() { if (!bufA) { bufA = mk(W, H); bufB = mk(W, H); } return [bufA.getContext('2d'), bufB.getContext('2d')]; }

  function render(g, t) {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#050f33'; g.fillRect(0, 0, W, H);
    let i = SCENES.findIndex((s) => t >= s.start && t < s.end); if (i < 0) i = SCENES.length - 1;
    let tr = null;
    const nx = SCENES[i + 1];
    if (nx && nx.trans) { const d = TR_DUR[nx.trans] ?? 0.8; if (t >= nx.start - d / 2) tr = [SCENES[i], nx, (t - (nx.start - d / 2)) / d, nx.trans]; }
    const cur = SCENES[i];
    if (!tr && cur.trans && i > 0) { const d = TR_DUR[cur.trans] ?? 0.8; if (t < cur.start + d / 2) tr = [SCENES[i - 1], cur, (t - (cur.start - d / 2)) / d, cur.trans]; }
    if (tr) {
      const [ga, gb] = buffers();
      ga.save(); drawScene(ga, tr[0], t); ga.restore();
      gb.save(); drawScene(gb, tr[1], t); gb.restore();
      TRANS[tr[3]](g, bufA, bufB, clamp(tr[2]), t);
    } else {
      drawScene(g, cur, t);
    }
    // ב״ה – small, top right, always
    g.save(); g.font = '700 42px Fredoka'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,30,0.7)'; g.shadowBlur = 8; g.fillStyle = '#ffe48a'; g.fillText('ב״ה', W - 62, 82); g.restore();
    // global fade-in
    const fi = 1 - prog(t, 0, 0.8); if (fi > 0) { g.fillStyle = `rgba(3,8,30,${fi})`; g.fillRect(0, 0, W, H); }
    g.restore();
  }

  // Cover / thumbnail
  function renderCover(g) {
    const t = 3.0;
    royalBg(g, t, { rays: 0.18, cy: 900, stars: 1, parts: 1 });
    g.save(); g.globalCompositeOperation = 'lighter'; spr(g, SPR.glow, 540, 900, 1700, 0.5); g.restore();
    const img = IMG.p04_portrait, w = 720, h = w * img.height / img.width;
    card(g, 'p04_portrait', 540, 900, w, { z: 1.04, fx: 0.48, fy: 0.25, border: 18 });
    crown(g, 540, 900 - h / 2 - 30, 320, 0.4);
    letter3D(g, 'ה', 900, 1420, 330, { glow: 1, rotY: -0.2 });
    goldText(g, 'צבי', W / 2, 1640, 150);
    goldText(g, 'מלך האות ה׳', W / 2, 1800, 118);
    g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(540 - w / 2 - 20, 900 - h / 2 - 20, w + 40, h + 40); g.clip('evenodd');
    confetti(g, 1.3, 0, 540, 1900, 140, 71, { speed: 2400, spread: 0.6 });
    sparkBurst(g, 0.8, 0, 540, 900, 40, 3, 900, 1.6);
    g.restore();
    g.save(); g.font = '700 42px Fredoka'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = '#ffe48a'; g.fillText('ב״ה', W - 62, 82); g.restore();
  }

  window.ZVI = { W, H, DUR: CFG.duration, SCENES, loadAssets, render, renderCover };
})();
