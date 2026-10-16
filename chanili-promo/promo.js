/* CHANI LI studio Ai — 30-second promo for architectural visualisation.
 * Everything is drawn on a canvas as a pure function of time, so the same code
 * plays live in the browser and renders frame-exact to MP4 (tools/render.cjs).
 *
 * Timeline (100 BPM, every cut on a beat of 0.6 s):
 *   0.0  Revit model on a card + hook          3.0  card opens, wipe to the render (3.9–5.0)
 *   6.6  front    9.6 corner   12.0 aerial    14.4 street      (the beat drops at 6.6)
 *  16.8  interactive 3D tour on a phone (day → night)
 *  22.8  collage + promise                    25.8 logo, phone, call to action → 30.0      */
(function (global) {
  'use strict';
  const P = global.PROMO;
  const DUR = 30, BEAT = 0.6;
  const C = { bg: '#140d11', bg2: '#22141b', cream: '#fbefe9', rose1: '#ffe0d2', rose2: '#eab09a', rose3: '#bd7a62', lav: '#b9a3e6', sky: '#9cc7f2', wine: '#8a1730' };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const eo = (x) => 1 - Math.pow(1 - x, 3);
  const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eback = (x) => { const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  const SHOT_T = [6.6, 9.6, 12.0, 14.4, 16.8];
  const T_TOUR = 16.8, T_COLLAGE = 22.8, T_END = 25.8;

  /* ---------- assets ---------- */
  const IMG = {};
  function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('missing ' + src)); i.src = src; }); }
  async function load() {
    const list = new Set([P.brand.logo, P.before, P.reveal, ...P.shots.map((s) => s.img), ...P.collage]);
    await Promise.all([...list].map(async (s) => { IMG[s] = await loadImage(s); }));
    IMG.tour = await Promise.all(Array.from({ length: P.tour.frames }, (_, i) => loadImage(P.tour.dir + String(i).padStart(3, '0') + '.jpg').catch(() => null)));
    for (let i = 1; i < IMG.tour.length; i++) if (!IMG.tour[i]) IMG.tour[i] = IMG.tour[i - 1]; // tolerate a partial capture
    const faces = [['assets/heebo-hebrew.woff2', 'U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F'], ['assets/heebo-latin.woff2', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD']];
    for (const [url, range] of faces) { const f = new FontFace('Heebo', `url(${url})`, { weight: '100 900', unicodeRange: range }); await f.load(); document.fonts.add(f); }
    await document.fonts.ready;
  }

  /* ---------- drawing helpers ---------- */
  let ctx, W, H, S, V; // S = unit scale (1 at 1080 short side), V = vertical layout
  function cover(img, x, y, w, h, zoom = 1, px = 0, py = 0) {
    const sc = Math.max(w / img.width, h / img.height) * zoom; const dw = img.width * sc, dh = img.height * sc;
    ctx.drawImage(img, x - (dw - w) / 2 + px * (dw - w) / 2, y - (dh - h) / 2 + py * (dh - h) / 2, dw, dh);
  }
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function roseGrad(x0, y0, x1, y1) { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, C.rose1); g.addColorStop(0.5, C.rose2); g.addColorStop(1, C.rose3); return g; }
  // RTL line that wipes in from the right while rising into place
  function text(str, x, y, size, { weight = 700, color = C.cream, grad = false, reveal = 1, alpha = 1, shadow = 0.5, track = 0 } = {}) {
    if (!str || reveal <= 0 || alpha <= 0) return 0;
    ctx.save(); ctx.font = `${weight} ${size}px Heebo`; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (track) ctx.letterSpacing = `${track}px`;
    const w = ctx.measureText(str).width; const r = eo(clamp(reveal));
    ctx.beginPath(); ctx.rect(x + w / 2 + size - (w + size * 2) * r, y - size * 1.2, (w + size * 2) * r, size * 2.4); ctx.clip();
    ctx.globalAlpha = alpha; ctx.translate(0, (1 - r) * size * 0.35);
    if (shadow) { ctx.shadowColor = `rgba(0,0,0,${shadow})`; ctx.shadowBlur = size * 0.6; ctx.shadowOffsetY = size * 0.06; }
    ctx.fillStyle = grad ? roseGrad(x - w / 2, y - size / 2, x + w / 2, y + size / 2) : color;
    ctx.fillText(str, x, y); ctx.restore(); return w;
  }
  function fitSize(str, size, maxW, weight = 700) { ctx.font = `${weight} ${size}px Heebo`; const w = ctx.measureText(str).width; return w > maxW ? size * maxW / w : size; }
  function pill(str, x, y, size, k) {
    if (!str || k <= 0) return;
    ctx.save(); ctx.font = `600 ${size}px Heebo`; ctx.direction = 'rtl';
    const w = ctx.measureText(str).width + size * 1.6, h = size * 2.1; const a = eo(clamp(k));
    ctx.globalAlpha = a; ctx.translate(0, (1 - a) * size * 0.8);
    rrect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fillStyle = 'rgba(20,13,17,0.62)'; ctx.fill();
    ctx.lineWidth = Math.max(1, 1.6 * S); ctx.strokeStyle = roseGrad(x - w / 2, 0, x + w / 2, 0); ctx.stroke();
    ctx.fillStyle = C.cream; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(str, x, y + size * 0.04);
    ctx.restore();
  }
  function shade(top, bottom) {
    if (top) { const g = ctx.createLinearGradient(0, 0, 0, H * 0.42); g.addColorStop(0, `rgba(12,7,10,${top})`); g.addColorStop(1, 'rgba(12,7,10,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.42); }
    if (bottom) { const g = ctx.createLinearGradient(0, H, 0, H * 0.6); g.addColorStop(0, `rgba(12,7,10,${bottom})`); g.addColorStop(1, 'rgba(12,7,10,0)'); ctx.fillStyle = g; ctx.fillRect(0, H * 0.6, W, H * 0.4); }
  }
  // Silk ribbon: the flowing pink-to-lavender band from the CHANI LI logo
  function ribbon(t, cy, amp, alpha, thick = 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#f39ac0'); g.addColorStop(0.45, '#ffc6a8'); g.addColorStop(0.7, C.lav); g.addColorStop(1, C.sky);
      ctx.strokeStyle = g; ctx.globalAlpha = alpha * (0.5 - i * 0.1); ctx.lineWidth = (26 - i * 6) * S * thick; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) {
        const x = -0.1 * W + 1.2 * W * k / 60; const ph = x / W * Math.PI * 2.1 + t * 0.9 + i * 0.55;
        const y = cy + Math.sin(ph) * amp + Math.sin(ph * 0.5 + t * 0.4) * amp * 0.35 + i * 7 * S;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  let grainCanvas = null, sweepCanvas = null;
  function grain(t) {
    if (!grainCanvas) { grainCanvas = document.createElement('canvas'); grainCanvas.width = grainCanvas.height = 256; const g = grainCanvas.getContext('2d'); const d = g.createImageData(256, 256); let s = 9; for (let i = 0; i < d.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = s >>> 24; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); }
    const f = Math.floor(t * 30); ctx.save(); ctx.globalAlpha = 0.045; ctx.globalCompositeOperation = 'overlay';
    const pat = ctx.createPattern(grainCanvas, 'repeat'); ctx.translate((f * 97) % 256, (f * 61) % 256); ctx.fillStyle = pat; ctx.fillRect(-256, -256, W + 512, H + 512); ctx.restore();
  }
  function vignette(k = 0.55) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(8,4,6,${k})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  function darkBg(t) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.hypot(W, H) * 0.6); g.addColorStop(0, C.bg2); g.addColorStop(1, C.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function watermark(a) {
    if (a <= 0) return; const img = IMG[P.brand.logo]; const w = (V ? 300 : 300) * S, h = w * img.height / img.width;
    ctx.save(); ctx.globalAlpha = a; ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18 * S;
    ctx.drawImage(img, W - w - 40 * S, 40 * S, w, h); ctx.restore();
  }
  function flash(k, color = '255,236,226') { if (k <= 0) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${color},${k})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }

  /* ---------- scenes ---------- */
  function cardRect(t) {
    const cw = V ? W * 0.84 : W * 0.4, img = IMG[P.before]; const ch = cw * img.height / img.width;
    const cx = W / 2, cy = V ? H * 0.56 : H * 0.64;
    const open = eio(seg(t, 3.0, 3.75));
    return { x: lerp(cx - cw / 2, 0, open), y: lerp(cy - ch / 2, 0, open), w: lerp(cw, W, open), h: lerp(ch, H, open), r: lerp(26 * S, 0, open), open };
  }
  function sceneIntro(t) {
    darkBg(t); ribbon(t, V ? H * 0.2 : H * 0.18, 60 * S, 0.9 * seg(t, 0, 1.2) * (1 - seg(t, 3.0, 3.6)));
    const r = cardRect(t); const push = 1 + 0.05 * seg(t, 0, 3.0);
    const before = IMG[P.before], after = IMG[P.reveal];
    ctx.save();
    if (r.open < 1) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 60 * S; ctx.shadowOffsetY = 20 * S; rrect(r.x, r.y, r.w, r.h, r.r); ctx.fillStyle = '#ddd'; ctx.fill(); ctx.shadowColor = 'transparent'; }
    rrect(r.x, r.y, r.w, r.h, r.r); ctx.clip();
    ctx.globalAlpha = seg(t, 0.15, 0.8);
    const wipe = eio(seg(t, 3.9, 5.0)); const lineX = lerp(W + 40 * S, -40 * S, wipe);
    // render revealed from the right edge (Hebrew reading direction)
    if (wipe > 0) { const z = lerp(1.12, 1.04, seg(t, 3.9, 6.6)); cover(after, r.x, r.y, r.w, r.h, z, 0, 0); }
    ctx.save(); if (wipe > 0) { ctx.beginPath(); ctx.rect(0, 0, Math.max(0, lineX), H); ctx.clip(); }
    cover(before, r.x, r.y, r.w, r.h, push * (r.open ? 1 + 0.02 * r.open : 1)); ctx.restore();
    if (wipe > 0 && wipe < 1) {
      const g = ctx.createLinearGradient(lineX - 40 * S, 0, lineX + 40 * S, 0); g.addColorStop(0, 'rgba(255,214,196,0)'); g.addColorStop(0.5, 'rgba(255,226,212,0.95)'); g.addColorStop(1, 'rgba(255,214,196,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(lineX - 40 * S, 0, 80 * S, H); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = C.rose1; ctx.fillRect(lineX - 2 * S, 0, 4 * S, H);
    }
    ctx.restore();
    if (r.open > 0) shade(0.75 * r.open, 0.55 * r.open);
    // before / after tags during the wipe
    const tagK = seg(t, 3.75, 4.0) * (1 - seg(t, 5.2, 5.6));
    if (tagK > 0) { pill('לפני · Revit', V ? W * 0.27 : W * 0.2, H * 0.86, 30 * S, tagK); pill('אחרי · הדמיה', V ? W * 0.73 : W * 0.8, H * 0.86, 30 * S, tagK * seg(t, 4.3, 4.7)); }
    // copy
    const out1 = 1 - seg(t, 2.8, 3.2);
    const hookSize = fitSize(P.hook, 92 * S, W * 0.86, 800);
    text(P.eyebrow, W / 2, V ? H * 0.235 : H * 0.12, 34 * S, { weight: 500, color: C.rose1, reveal: seg(t, 0.3, 1.0), alpha: out1, track: 1 * S });
    text(P.hook, W / 2, V ? H * 0.3 : H * 0.22, hookSize, { weight: 800, reveal: seg(t, 0.6, 1.5), alpha: out1 });
    const rv = seg(t, 4.5, 5.3), rv2 = seg(t, 4.9, 5.7), out2 = 1 - seg(t, 6.35, 6.6);
    const s1 = fitSize(P.revealLine, 86 * S, W * 0.88, 800), s2 = fitSize(P.revealLine2, 86 * S, W * 0.88, 800);
    text(P.revealLine, W / 2, V ? H * 0.17 : H * 0.15, s1, { weight: 800, reveal: rv, alpha: out2 });
    text(P.revealLine2, W / 2, V ? H * 0.17 + s1 * 1.2 : H * 0.15 + s1 * 1.2, s2, { weight: 800, grad: true, reveal: rv2, alpha: out2 });
    watermark(seg(t, 4.0, 4.6));
  }
  function shotState(i, t) {
    const t0 = SHOT_T[i], t1 = SHOT_T[i + 1]; const p = seg(t, t0 - 0.25, t1 + 0.25);
    const dirX = i % 2 ? -1 : 1;
    return { zoom: 1.05 + 0.09 * p + 0.05 * (1 - eo(seg(t, t0 - 0.2, t0 + 0.5))), px: V ? lerp(0.85, -0.85, p) * dirX : lerp(0.4, -0.4, p) * dirX, py: V ? 0 : lerp(0.3, -0.2, p) };
  }
  function sceneShots(t) {
    let i = SHOT_T.findIndex((x, k) => t >= x && t < SHOT_T[k + 1]); if (i < 0) i = SHOT_T.length - 2;
    const draw = (k, a) => { if (k < 0 || k >= P.shots.length) return; const s = shotState(k, t); ctx.save(); ctx.globalAlpha = a; cover(IMG[P.shots[k].img], 0, 0, W, H, s.zoom, s.px, s.py); ctx.restore(); };
    const t1 = SHOT_T[i + 1]; const xf = seg(t, t1 - 0.22, t1); // crossfade into the next shot
    draw(i, 1); if (xf > 0 && i + 1 < P.shots.length) draw(i + 1, eio(xf));
    // incoming from the reveal scene
    if (i === 0 && t < 6.8) { ctx.save(); ctx.globalAlpha = 1 - seg(t, 6.6, 6.8); cover(IMG[P.reveal], 0, 0, W, H, 1.04); ctx.restore(); }
    shade(0.55, 0.7);
    for (const x of SHOT_T.slice(1, 4)) flash(0.22 * (1 - seg(t, x, x + 0.35)) * (t >= x ? 1 : 0));
    flash(0.3 * (1 - seg(t, 6.6, 7.0)) * (t >= 6.6 ? 1 : 0));
    // headline over the first shot, caption pill per shot
    const hk = seg(t, 6.8, 7.5) * (1 - seg(t, 9.3, 9.6));
    if (hk > 0) { const sz = fitSize('הדמיות ברמה של צילום', 84 * S, W * 0.88, 800); text('הדמיות ברמה של צילום', W / 2, V ? H * 0.16 : H * 0.15, sz, { weight: 800, reveal: seg(t, 6.8, 7.6), alpha: 1 - seg(t, 9.3, 9.6) }); }
    const t0 = SHOT_T[i]; const ck = seg(t, t0 + 0.3, t0 + 0.75) * (1 - seg(t, t1 - 0.3, t1 - 0.05));
    pill(P.shots[i].caption, W / 2, V ? H * 0.82 : H * 0.84, (V ? 40 : 38) * S, ck);
    watermark(1);
  }
  function phone(t, cx, cy, h) {
    const w = h * 0.462, r = h * 0.075, b = h * 0.018;
    const f = clamp(Math.floor(seg(t, T_TOUR + 0.4, T_COLLAGE - 0.2) * P.tour.frames), 0, P.tour.frames - 1);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 80 * S; ctx.shadowOffsetY = 30 * S;
    rrect(cx - w / 2, cy - h / 2, w, h, r); ctx.fillStyle = '#0c0a0b'; ctx.fill(); ctx.restore();
    ctx.save(); rrect(cx - w / 2, cy - h / 2, w, h, r); ctx.lineWidth = 3 * S; ctx.strokeStyle = roseGrad(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2); ctx.stroke();
    rrect(cx - w / 2 + b, cy - h / 2 + b, w - 2 * b, h - 2 * b, r - b); ctx.clip();
    cover(IMG.tour[f], cx - w / 2 + b, cy - h / 2 + b, w - 2 * b, h - 2 * b);
    // glass reflection
    const g = ctx.createLinearGradient(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.35, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
    ctx.fillStyle = '#0c0a0b'; rrect(cx - w * 0.16, cy - h / 2 + b * 1.6, w * 0.32, h * 0.03, h * 0.015); ctx.fill();
    return f;
  }
  function sceneTour(t) {
    const k = seg(t, T_TOUR, T_TOUR + 0.6);
    darkBg(t);
    ctx.save(); ctx.globalAlpha = 0.28; ctx.filter = `blur(${30 * S}px)`; cover(IMG[P.shots[3].img], 0, 0, W, H, 1.2); ctx.restore(); ctx.filter = 'none';
    ctx.fillStyle = 'rgba(20,13,17,0.55)'; ctx.fillRect(0, 0, W, H);
    ribbon(t, V ? H * 0.9 : H * 0.88, 50 * S, 0.7);
    const rise = (1 - eback(clamp(k))) * H * 0.25;
    let f;
    if (V) {
      f = phone(t, W / 2, H * 0.6 + rise, H * 0.6);
      const ts = fitSize(P.tourTitle, 80 * S, W * 0.88, 800);
      text(P.tourTitle, W / 2, H * 0.12, ts, { weight: 800, reveal: seg(t, T_TOUR + 0.2, T_TOUR + 0.9) });
      text(P.tourSub, W / 2, H * 0.12 + ts * 1.05, fitSize(P.tourSub, 40 * S, W * 0.9, 500), { weight: 500, color: C.rose1, reveal: seg(t, T_TOUR + 0.6, T_TOUR + 1.3) });
    } else {
      f = phone(t, W * 0.32, H * 0.53 + rise, H * 0.86);
      const x = W * 0.68, ts = fitSize(P.tourTitle, 76 * S, W * 0.52, 800);
      text(P.tourTitle, x, H * 0.4, ts, { weight: 800, reveal: seg(t, T_TOUR + 0.2, T_TOUR + 0.9) });
      text(P.tourSub, x, H * 0.4 + ts * 1.1, fitSize(P.tourSub, 38 * S, W * 0.5, 500), { weight: 500, color: C.rose1, reveal: seg(t, T_TOUR + 0.6, T_TOUR + 1.3) });
    }
    const night = f >= P.tour.nightFrom; const tn = T_TOUR + 0.4 + (P.tour.nightFrom / P.tour.frames) * (T_COLLAGE - T_TOUR - 0.6);
    const px = V ? W / 2 : W * 0.68, py = V ? H * 0.255 : H * 0.62;
    pill(night ? '☾  לילה' : '☀  יום', px, py, 34 * S, seg(t, T_TOUR + 1.0, T_TOUR + 1.4));
    flash(0.35 * (1 - seg(t, tn, tn + 0.45)) * (t >= tn ? 1 : 0), '200,190,255');
    flash(0.25 * (1 - seg(t, T_TOUR, T_TOUR + 0.35)));
  }
  function sceneCollage(t) {
    darkBg(t);
    const cols = V ? 2 : 3, rows = V ? 3 : 2, gap = 14 * S, pad = 40 * S;
    const cw = (W - pad * 2 - gap * (cols - 1)) / cols, chh = (H - pad * 2 - gap * (rows - 1)) / rows;
    P.collage.forEach((src, i) => {
      const c = i % cols, r = Math.floor(i / cols); const order = V ? [0, 1, 2, 3, 4, 5] : [0, 2, 4, 1, 3, 5];
      const k = eo(seg(t, T_COLLAGE + order[i] * 0.09, T_COLLAGE + order[i] * 0.09 + 0.5));
      const x = pad + c * (cw + gap), y = pad + r * (chh + gap);
      ctx.save(); ctx.globalAlpha = k; const sc = lerp(0.85, 1, k);
      ctx.translate(x + cw / 2, y + chh / 2); ctx.scale(sc, sc); rrect(-cw / 2, -chh / 2, cw, chh, 18 * S); ctx.clip();
      cover(IMG[src], -cw / 2, -chh / 2, cw, chh, 1.08 + 0.06 * seg(t, T_COLLAGE, T_END)); ctx.restore();
    });
    ctx.fillStyle = `rgba(16,9,13,${0.5 * seg(t, T_COLLAGE + 0.5, T_COLLAGE + 1.0)})`; ctx.fillRect(0, 0, W, H);
    const bandH = V ? 380 * S : 300 * S, k = seg(t, T_COLLAGE + 0.6, T_COLLAGE + 1.1);
    const g = ctx.createLinearGradient(0, H / 2 - bandH / 2, 0, H / 2 + bandH / 2); g.addColorStop(0, 'rgba(20,13,17,0)'); g.addColorStop(0.25, 'rgba(20,13,17,0.9)'); g.addColorStop(0.75, 'rgba(20,13,17,0.9)'); g.addColorStop(1, 'rgba(20,13,17,0)');
    ctx.globalAlpha = k; ctx.fillStyle = g; ctx.fillRect(0, H / 2 - bandH / 2, W, bandH); ctx.globalAlpha = 1;
    const s1 = fitSize(P.collageLine, 84 * S, W * 0.9, 800), s2 = fitSize(P.collageLine2, 84 * S, W * 0.9, 800);
    text(P.collageLine, W / 2, H / 2 - s1 * 0.62, s1, { weight: 800, reveal: seg(t, T_COLLAGE + 0.7, T_COLLAGE + 1.4) });
    text(P.collageLine2, W / 2, H / 2 + s2 * 0.62, s2, { weight: 800, grad: true, reveal: seg(t, T_COLLAGE + 1.1, T_COLLAGE + 1.8) });
    flash(0.3 * (1 - seg(t, T_COLLAGE, T_COLLAGE + 0.3)));
    watermark(1 - seg(t, T_END - 0.3, T_END));
  }
  function sceneEnd(t) {
    darkBg(t);
    ribbon(t, V ? H * 0.3 : H * 0.24, 70 * S, seg(t, T_END, T_END + 1.0), 1.3);
    const logo = IMG[P.brand.logo]; const lw = V ? W * 0.86 : W * 0.5, lh = lw * logo.height / logo.width;
    const k = eback(seg(t, T_END + 0.1, T_END + 0.9)); const ly = V ? H * 0.4 : H * 0.36;
    { const gr = ctx.createRadialGradient(W / 2, ly, 0, W / 2, ly, lw * 0.6); gr.addColorStop(0, `rgba(255,214,200,${0.22 * seg(t, T_END, T_END + 0.8)})`); gr.addColorStop(1, 'rgba(255,214,200,0)'); ctx.fillStyle = gr; ctx.fillRect(0, ly - lw, W, lw * 2); }
    ctx.save(); ctx.globalAlpha = seg(t, T_END + 0.1, T_END + 0.5); ctx.translate(W / 2, ly); ctx.scale(lerp(0.82, 1, k), lerp(0.82, 1, k));
    ctx.shadowColor = 'rgba(255,170,150,0.35)'; ctx.shadowBlur = 60 * S; ctx.drawImage(logo, -lw / 2, -lh / 2, lw, lh); ctx.restore();
    // light sweep across the logo
    const sw = seg(t, T_END + 0.9, T_END + 2.0);
    if (sw > 0 && sw < 1) {
      // the shine only touches the logo's own pixels
      const oc = sweepCanvas || (sweepCanvas = document.createElement('canvas')); oc.width = Math.ceil(lw); oc.height = Math.ceil(lh);
      const o = oc.getContext('2d'); o.drawImage(logo, 0, 0, lw, lh); o.globalCompositeOperation = 'source-in';
      const x = lerp(-lw * 0.3, lw * 1.3, sw); const g = o.createLinearGradient(x - 140 * S, 0, x + 140 * S, lh * 0.4); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,244,236,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      o.fillStyle = g; o.fillRect(0, 0, lw, lh);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(oc, W / 2 - lw / 2, ly - lh / 2); ctx.restore();
    }
    const by = ly + lh / 2 + (V ? 110 : 80) * S;
    text(P.brand.services, W / 2, by, fitSize(P.brand.services, 46 * S, W * 0.9, 600), { weight: 600, color: C.cream, reveal: seg(t, T_END + 0.8, T_END + 1.5) });
    const ps = V ? 120 * S : 104 * S;
    text(P.brand.phone, W / 2, by + (V ? 150 : 120) * S, ps, { weight: 800, grad: true, reveal: seg(t, T_END + 1.1, T_END + 1.9), track: 2 * S });
    text(P.cta, W / 2, by + (V ? 270 : 220) * S, fitSize(P.cta, 38 * S, W * 0.9, 500), { weight: 500, color: C.rose1, reveal: seg(t, T_END + 1.6, T_END + 2.3) });
    text(P.brand.rights, W / 2, H - 70 * S, 26 * S, { weight: 400, color: 'rgba(251,239,233,0.6)', reveal: seg(t, T_END + 2.0, T_END + 2.6), shadow: 0 });
    flash(0.55 * (1 - seg(t, T_END, T_END + 0.45)));
  }

  function draw(c, t) {
    ctx = c.getContext('2d'); W = c.width; H = c.height; S = Math.min(W, H) / 1080; V = H > W;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    if (t < 6.6) sceneIntro(t);
    else if (t < T_TOUR) sceneShots(t);
    else if (t < T_COLLAGE) sceneTour(t);
    else if (t < T_END) sceneCollage(t);
    else sceneEnd(t);
    vignette(t >= T_END ? 0.4 : 0.5); grain(t);
    const fade = Math.max(1 - seg(t, 0, 0.4), seg(t, DUR - 0.6, DUR));
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  }

  /* ---------- score: 100 BPM in D major, cuts and hits on the beat ---------- */
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // [bass, voicing] per bar of 4 beats; bars start at 0.6 s
  const PROG = [[43, [59, 62, 66, 69]], [45, [57, 61, 64, 66]], [42, [57, 61, 64, 69]], [47, [57, 62, 66, 69]]]; // Gmaj7 · A6 · F#m7 · Bm7
  const BAR = BEAT * 4, BAR0 = 0.6;
  const chordAt = (t) => (t >= T_END ? [38, [57, 62, 64, 66, 69]] : PROG[((Math.floor((t - BAR0) / BAR) % 4) + 4) % 4]);
  function buildAudio(ac) {
    let seed = 77; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const master = ac.createGain(); master.gain.setValueAtTime(0.7, 0); master.gain.setValueAtTime(0.7, DUR - 1.4); master.gain.linearRampToValueAtTime(0, DUR);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ac.destination);
    const ir = ac.createBuffer(2, ac.sampleRate * 3, ac.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / d.length, 3.2); }
    const verb = ac.createConvolver(); verb.buffer = ir; const verbGain = ac.createGain(); verbGain.gain.value = 0.32; verb.connect(verbGain); verbGain.connect(master);
    const noise = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
    const bus = (g, wet = 0) => { const n = ac.createGain(); n.gain.value = g; n.connect(master); if (wet) { const s = ac.createGain(); s.gain.value = wet; n.connect(s); s.connect(verb); } return n; };
    const padBus = bus(0.16, 0.7), keyBus = bus(0.2, 0.55), drumBus = bus(0.55, 0.08), bassBus = bus(0.32), fxBus = bus(0.3, 0.6);
    const env = (g, t, a, peak, d, sustain = 0) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(sustain, t + a, d); };
    const voice = (type, f, t, dur, out, a, peak, d, cut = 0, detune = 0) => {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; const g = ac.createGain(); env(g, t, a, peak, d);
      let n = o; if (cut) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cut; o.connect(fl); n = fl; }
      n.connect(g); g.connect(out); o.start(t); o.stop(t + dur);
    };
    const noiseHit = (t, dur, type, f, q, peak, out, f1 = 0) => {
      const s = ac.createBufferSource(); s.buffer = noise; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
      if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + Math.min(0.01, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      s.connect(fl); fl.connect(g); g.connect(out); s.start(t, rnd() * 1.5); s.stop(t + dur + 0.05);
    };
    const swell = (t0, t1, peak) => { // filtered noise rising into a cut
      const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 1.2; fl.frequency.setValueAtTime(300, t0); fl.frequency.exponentialRampToValueAtTime(7000, t1);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1);
      s.connect(fl); fl.connect(g); g.connect(fxBus); s.start(t0); s.stop(t1 + 0.05);
    };
    const bell = (t, m, peak) => { [1, 2.76, 5.4].forEach((r, i) => voice('sine', mtof(m) * r, t, 3, fxBus, 0.004, peak / (i + 1.5), 0.6 / (i + 1))); };
    const kick = (t, g) => { const o = ac.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); const a = ac.createGain(); a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.001, t + 0.38); o.connect(a); a.connect(drumBus); o.start(t); o.stop(t + 0.4); };
    const boom = (t, g) => { kick(t, g); const o = ac.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.6); const a = ac.createGain(); a.gain.setValueAtTime(g * 0.8, t); a.gain.exponentialRampToValueAtTime(0.001, t + 1.8); o.connect(a); a.connect(drumBus); o.start(t); o.stop(t + 1.9); noiseHit(t, 1.2, 'lowpass', 1200, 0.5, g * 0.25, fxBus); };

    // pad: whole piece, chord per bar
    const starts = [0]; for (let t = BAR0; t < T_END - 0.01; t += BAR) starts.push(t); starts.push(T_END);
    starts.forEach((t, i) => {
      const len = (starts[i + 1] ?? DUR) - t; const [, v] = chordAt(t + 0.01);
      for (const m of v) for (const dt of [-8, 8]) voice('sawtooth', mtof(m), t, len + 1.2, padBus, 0.5, 0.05, 0.8, 1800, dt);
    });
    // piano: sparse in the intro, broken chords later
    for (let b = 0; b < Math.round(DUR / BEAT); b++) {
      const t = b * BEAT; if (t >= T_END + 3) break; const [, v] = chordAt(t + 0.01);
      if (t < 6.6) { if (b % 2 === 0) voice('triangle', mtof(v[(b / 2) % v.length] + 12), t, 2.5, keyBus, 0.005, 0.5, 0.5, 3200); }
      else if (t < T_END) {
        for (const h of [0, 0.5]) { const m = v[(b * 2 + h * 2) % v.length] + 12 + ((b % 4 === 3 && h) ? 12 : 0); voice('triangle', mtof(m), t + h * BEAT, 1.2, keyBus, 0.004, 0.32, 0.25, 4200); }
      }
    }
    // bass + drums from the drop, with a half-time feel in the tour section
    for (let b = 11; b < Math.round(T_END / BEAT); b++) {
      const t = b * BEAT; const [root] = chordAt(t + 0.01); const tour = t >= T_TOUR && t < T_COLLAGE;
      voice('sine', mtof(root), t, BEAT * 0.9, bassBus, 0.01, 0.8, 0.3); voice('triangle', mtof(root + 12), t, BEAT * 0.5, bassBus, 0.005, 0.18, 0.12, 900);
      if (!tour || b % 2 === 0) kick(t, 0.9);
      if (b % 2 === 1) noiseHit(t, 0.18, 'bandpass', 1800, 0.8, tour ? 0.25 : 0.4, drumBus);
      noiseHit(t + BEAT / 2, 0.05, 'highpass', 8000, 0.7, 0.12, drumBus); noiseHit(t, 0.04, 'highpass', 9000, 0.7, 0.06, drumBus);
    }
    // sound design on the cuts
    swell(2.2, 3.0, 0.25); noiseHit(3.0, 0.9, 'bandpass', 900, 0.8, 0.25, fxBus, 200);
    swell(3.3, 3.9, 0.12); noiseHit(3.9, 1.3, 'bandpass', 2400, 0.9, 0.3, fxBus, 500); bell(4.0, 81, 0.25); bell(4.6, 86, 0.18);
    swell(5.4, 6.6, 0.35); boom(6.6, 1.0); bell(6.6, 74, 0.2);
    for (const x of [9.6, 12.0, 14.4]) { swell(x - 0.6, x, 0.16); noiseHit(x, 0.5, 'bandpass', 3000, 1.0, 0.18, fxBus, 900); }
    swell(15.6, T_TOUR, 0.28); boom(T_TOUR, 0.7); bell(T_TOUR + 0.05, 78, 0.18);
    const nightT = T_TOUR + 0.4 + (P.tour.nightFrom / P.tour.frames) * (T_COLLAGE - T_TOUR - 0.6); bell(nightT, 90, 0.16); bell(nightT + 0.15, 85, 0.12);
    swell(21.6, T_COLLAGE, 0.3); boom(T_COLLAGE, 0.8);
    swell(24.0, T_END, 0.45); boom(T_END, 1.1); [74, 78, 81, 86].forEach((m, i) => bell(T_END + 0.9 + i * 0.3, m, 0.2));
    for (const m of [38, 50]) voice('sine', mtof(m), T_END, 4.2, bassBus, 0.02, 0.7, 1.5);
  }
  function encodeWav(buf) {
    const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate; const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { out.setInt16(o, clamp(data[c][i], -1, 1) * 32767, true); o += 2; }
    return out.buffer;
  }
  async function renderAudio() {
    const ac = new OfflineAudioContext(2, 48000 * DUR, 48000); buildAudio(ac); const buf = await ac.startRendering(); return encodeWav(buf);
  }

  global.PROMO_APP = { DUR, load, draw, buildAudio, renderAudio };
})(window);
