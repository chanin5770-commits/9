/* CHANILI Studio — 40-second cinematic ad: "אל תציגו רק את הפרויקט. תנו ללקוחות שלכם להיכנס אליו."
 * Drawn on a canvas as a pure function of time (frame-exact MP4 via tools/render.cjs).
 * Score: 120 BPM, trailer kit from src/audio.js (braams, impacts, risers, taiko).
 *
 *  0–6   line drawing traced from the real render, fast dolly-in, lines start to glow
 *  6–13  the render appears through the drawing ("the wow"), slow push
 * 13–21  "drone": orbit · detail close-up · street · aerial pull-back, whip transitions
 * 21–29  the real interactive tour on a laptop: rotate, front view, zoom, point of interest, night
 * 29–33  fast montage + "ראוי להרבה יותר מתמונה"
 * 33–40  original logo in rose-gold light, slogan, services, phone                         */
(function (global) {
  'use strict';
  const P = global.CINE, DUR = P.dur;
  const C = { ink: '#07070a', cream: '#fbefe9', rose1: '#ffe0d2', rose2: '#eab09a', rose3: '#bd7a62', pink: '#f39ac0', lav: '#b9a3e6', sky: '#9cc7f2' };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const eo = (x) => 1 - Math.pow(1 - x, 3);
  const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eback = (x) => { const c = 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const T = { blueprint: 0, wow: 6, drone: 13, detail: 15.5, street: 17.5, aerial: 19.3, ui: 21, montage: 29, end: 33 };

  /* ---------- assets ---------- */
  const IMG = {}; const VO = P.vo.map((v, i) => ({ ...v, file: null, dur: 0, i }));
  const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('missing ' + src)); i.src = src; });
  let lineRose, lineGlow;
  async function load() {
    const list = new Set([P.logo, P.lines, P.hero, P.orbit.img, P.detail.img, P.street.img, P.aerial.img, ...P.montage]);
    await Promise.all([...list].map(async (s) => { IMG[s] = await loadImage(s).catch((e) => { if (P.montage.includes(s)) return null; throw e; }); }));
    P.montage.forEach((s) => { if (!IMG[s]) IMG[s] = IMG[P.hero]; }); // e.g. a capture frame not rendered yet
    IMG.ui = await Promise.all(Array.from({ length: P.ui.frames }, (_, i) => loadImage(P.ui.dir + String(i).padStart(3, '0') + '.jpg').catch(() => null)));
    for (let i = 1; i < IMG.ui.length; i++) if (!IMG.ui[i]) IMG.ui[i] = IMG.ui[i - 1];
    if (!IMG.ui[0]) IMG.ui = IMG.ui.map(() => IMG[P.hero]);
    const faces = [['assets/heebo-hebrew.woff2', 'U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F'], ['assets/heebo-latin.woff2', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD']];
    for (const [url, range] of faces) { const f = new FontFace('Heebo', `url(${url})`, { weight: '100 900', unicodeRange: range }); await f.load(); document.fonts.add(f); }
    await document.fonts.ready;
    // tinted line layers: crisp rose-gold strokes, and a soft pink-violet glow
    const L = IMG[P.lines];
    const tint = (color, blur) => { const c = document.createElement('canvas'); c.width = L.width; c.height = L.height; const x = c.getContext('2d'); if (blur) x.filter = `blur(${blur}px)`; x.drawImage(L, 0, 0); x.filter = 'none'; x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c; };
    lineRose = tint(C.rose1, 0);
    lineGlow = (() => { const g = tint('#000', 0); const x = g.getContext('2d'); x.globalCompositeOperation = 'source-in'; const gr = x.createLinearGradient(0, 0, g.width, g.height); gr.addColorStop(0, C.pink); gr.addColorStop(0.5, C.rose2); gr.addColorStop(1, C.lav); x.fillStyle = gr; x.fillRect(0, 0, g.width, g.height); const b = document.createElement('canvas'); b.width = g.width; b.height = g.height; const y = b.getContext('2d'); y.filter = 'blur(10px)'; y.drawImage(g, 0, 0); y.drawImage(g, 0, 0); return b; })();
    // narration recordings (optional)
    const dac = new OfflineAudioContext(1, 1, 48000);
    await Promise.all(VO.map(async (v) => {
      for (const ext of ['wav', 'mp3', 'm4a']) {
        const url = `vo/${String(v.i + 1).padStart(2, '0')}.${ext}`;
        try { const r = await fetch(url); if (!r.ok) continue; const buf = await dac.decodeAudioData(await r.arrayBuffer()); v.file = buf; v.dur = buf.duration; return; } catch (e) { /* not recorded yet */ }
      }
    }));
    VO.forEach((v, i) => {
      const next = VO[i + 1] ? VO[i + 1].t : DUR; const words = v.text.split(/\s+/).length;
      v.show = Math.min(v.dur || 0.6 + words * 0.33, next - v.t - 0.08);
    });
  }

  /* ---------- drawing helpers ---------- */
  let ctx, W, H, S;
  // place image so focus point (fx,fy) sits at screen (cx,cy), scaled to cover × zoom
  function cam(img, zoom, fx, fy, cx = W / 2, cy = H / 2, alpha = 1, src = img) {
    const sc = Math.max(W / img.width, H / img.height) * zoom;
    ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(src, cx - fx * img.width * sc, cy - fy * img.height * sc, img.width * sc, img.height * sc); ctx.restore();
  }
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function roseGrad(x0, y0, x1, y1) { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, C.rose1); g.addColorStop(0.5, C.rose2); g.addColorStop(1, C.rose3); return g; }
  function fit(str, size, maxW, weight = 800) { ctx.font = `${weight} ${size}px Heebo`; const w = ctx.measureText(str).width; return w > maxW ? size * maxW / w : size; }
  // title line: wipes in from the right (Hebrew reading direction) while rising
  function title(str, x, y, size, { weight = 800, grad = false, reveal = 1, alpha = 1, color = C.cream, track = 0 } = {}) {
    if (!str || reveal <= 0 || alpha <= 0) return;
    ctx.save(); ctx.font = `${weight} ${size}px Heebo`; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; if (track) ctx.letterSpacing = `${track}px`;
    const w = ctx.measureText(str).width, r = eo(clamp(reveal));
    ctx.beginPath(); ctx.rect(x + w / 2 + size - (w + size * 2) * r, y - size * 1.3, (w + size * 2) * r, size * 2.6); ctx.clip();
    ctx.globalAlpha = alpha; ctx.translate(0, (1 - r) * size * 0.35);
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = size * 0.6; ctx.shadowOffsetY = size * 0.05;
    ctx.fillStyle = grad ? roseGrad(x - w / 2, y - size / 2, x + w / 2, y + size / 2) : color; ctx.fillText(str, x, y); ctx.restore();
  }
  function wrap(str, size, maxW, weight) {
    ctx.font = `${weight} ${size}px Heebo`; const words = str.split(' '), lines = []; let cur = '';
    for (const w of words) { const n = cur ? cur + ' ' + w : w; if (ctx.measureText(n).width > maxW && cur) { lines.push(cur); cur = w; } else cur = n; }
    if (cur) lines.push(cur); return lines;
  }
  function subtitles(t) {
    for (const v of VO) {
      if (v.big || t < v.t || t > v.t + v.show) continue;
      const a = Math.min(seg(t, v.t, v.t + 0.15), 1 - seg(t, v.t + v.show - 0.15, v.t + v.show));
      const size = 50 * S, lines = wrap(v.text, size, W * 0.82, 600), lh = size * 1.32;
      ctx.save(); ctx.font = `600 ${size}px Heebo`; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = a;
      const y0 = H * 0.845 - (lines.length - 1) * lh / 2;
      lines.forEach((l, i) => {
        const w = ctx.measureText(l).width + size * 1.0, y = y0 + i * lh;
        rrect(W / 2 - w / 2, y - lh / 2 + 4 * S, w, lh - 8 * S, 12 * S); ctx.fillStyle = 'rgba(10,6,9,0.62)'; ctx.fill();
        ctx.fillStyle = C.cream; ctx.fillText(l, W / 2, y + size * 0.04);
      });
      ctx.restore();
    }
  }
  const bigLine = (i) => VO[i];
  function shade(top, bottom) {
    if (top) { const g = ctx.createLinearGradient(0, 0, 0, H * 0.4); g.addColorStop(0, `rgba(7,5,8,${top})`); g.addColorStop(1, 'rgba(7,5,8,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.4); }
    if (bottom) { const g = ctx.createLinearGradient(0, H, 0, H * 0.58); g.addColorStop(0, `rgba(7,5,8,${bottom})`); g.addColorStop(1, 'rgba(7,5,8,0)'); ctx.fillStyle = g; ctx.fillRect(0, H * 0.58, W, H * 0.42); }
  }
  function flash(k, rgb = '255,236,226') { if (k <= 0) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${rgb},${k})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  function hitFlash(t, at, k, dur = 0.35, rgb) { if (t >= at) flash(k * (1 - seg(t, at, at + dur)), rgb); }
  function vignette(k) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(5,3,4,${k})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  let grainC = null, shineC = null;
  function grain(t) {
    if (!grainC) { grainC = document.createElement('canvas'); grainC.width = grainC.height = 256; const g = grainC.getContext('2d'), d = g.createImageData(256, 256); let s = 5; for (let i = 0; i < d.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = s >>> 24; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); }
    const f = Math.floor(t * 30); ctx.save(); ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay'; ctx.translate((f * 97) % 256, (f * 61) % 256); ctx.fillStyle = ctx.createPattern(grainC, 'repeat'); ctx.fillRect(-256, -256, W + 512, H + 512); ctx.restore();
  }
  function lightLeak(t, k, cx = 0.85, cy = 0.15) {
    if (k <= 0) return; ctx.save(); ctx.globalCompositeOperation = 'screen';
    const x = W * (cx + Math.sin(t * 0.5) * 0.08), y = H * (cy + Math.cos(t * 0.4) * 0.05), r = Math.max(W, H) * 0.55;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,170,190,${0.35 * k})`); g.addColorStop(0.5, `rgba(185,140,230,${0.12 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  function watermark(a) {
    if (a <= 0) return; const img = IMG[P.logo], w = 250 * S, h = w * img.height / img.width;
    ctx.save(); ctx.globalAlpha = a * 0.92; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 16 * S; ctx.drawImage(img, W - w - 36 * S, 40 * S, w, h); ctx.restore();
  }
  // whip pan: smear the frame sideways around a cut
  function whip(t, at, draw) {
    const k = 1 - Math.abs(t - at) / 0.2; if (k <= 0) { draw(0); return; }
    const off = (t < at ? -1 : 1) * eio(k) * W * 0.35;
    for (let i = 0; i < 6; i++) { ctx.save(); ctx.globalAlpha = i ? 0.22 : 1; ctx.translate(off * (1 + i * 0.12), 0); draw(off); ctx.restore(); }
  }

  /* ---------- scenes ---------- */
  function heroCam(t) { // one camera for drawing and render, so they stay registered
    const z = t < T.wow ? 0.62 + 0.38 * eo(seg(t, 0, T.wow)) : 1.0 + 0.16 * eio(seg(t, T.wow, T.drone));
    return [z, P.heroFocus[0], P.heroFocus[1]];
  }
  function grid(t, z, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    for (const [step, al] of [[60 * S, 0.05], [300 * S, 0.1]]) {
      ctx.strokeStyle = `rgba(150,170,255,${al})`; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = -W; x < W * 2; x += step) { ctx.moveTo(x, -H); ctx.lineTo(x, H * 2); }
      for (let y = -H; y < H * 2; y += step) { ctx.moveTo(-W, y); ctx.lineTo(W * 2, y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  function sceneBlueprint(t) {
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
    const [z, fx, fy] = heroCam(t), img = IMG[P.lines];
    grid(t, z, 1 - seg(t, 6.6, 8.4));
    // photo appears through an opening circle from the building's centre (the wow)
    const open = eio(seg(t, T.wow, 7.9)), R = Math.hypot(W, H) * 0.62 * open;
    if (open > 0) {
      ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.max(1, R), 0, Math.PI * 2); ctx.clip();
      cam(IMG[P.hero], z, fx, fy); ctx.restore();
      if (open < 1) { const g = ctx.createRadialGradient(W / 2, H / 2, R * 0.92, W / 2, H / 2, R * 1.04); g.addColorStop(0, 'rgba(255,220,205,0)'); g.addColorStop(0.7, 'rgba(255,214,200,0.55)'); g.addColorStop(1, 'rgba(255,220,205,0)'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    }
    // lines: drawn outward from the centre over the first 2.2 s, then glow on the beat
    const draw = eo(seg(t, 0.1, 2.4)), lineOut = 1 - seg(t, 6.8, 8.8);
    if (lineOut > 0) {
      ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H) * 0.65 * draw + 1, 0, Math.PI * 2); ctx.clip();
      const pulse = t > 2 && t < T.wow ? Math.pow(1 - ((t - 2) % 0.5) / 0.5, 3) : 0;
      const glow = (0.25 + 0.75 * seg(t, 1.5, 5.8)) * (0.75 + 0.5 * pulse) * lineOut;
      ctx.globalCompositeOperation = 'lighter'; cam(img, z, fx, fy, W / 2, H / 2, glow, lineGlow);
      ctx.globalCompositeOperation = 'source-over'; cam(img, z, fx, fy, W / 2, H / 2, (open > 0 ? 0.55 : 0.95) * lineOut, lineRose);
      ctx.restore();
    }
    lightLeak(t, seg(t, 8.0, 9.5) * (1 - seg(t, 12.6, 13)));
    shade(0.55 * seg(t, 6.5, 8), 0.6 * seg(t, 6.5, 8));
    // titles
    const h1 = bigLine(0), out1 = 1 - seg(t, 3.0, 3.3);
    title(h1.text, W / 2, H * 0.14, fit(h1.text, 104 * S, W * 0.88), { reveal: seg(t, h1.t, h1.t + 0.6), alpha: out1 });
    const q = 'רק תמונות סטטיות?', qs = fit(q, 120 * S, W * 0.9);
    title(q, W / 2, H * 0.14, qs, { grad: true, reveal: seg(t, 3.25, 3.85), alpha: 1 - seg(t, 5.7, 6.0) });
    const b = bigLine(3); title(b.text, W / 2, H * 0.15, fit(b.text, 108 * S, W * 0.9), { grad: true, reveal: seg(t, b.t, b.t + 0.7), alpha: 1 - seg(t, 12.6, 12.9) });
    watermark(seg(t, 8.6, 9.2));
    hitFlash(t, 0, 0.0); hitFlash(t, T.wow, 0.55, 0.5); hitFlash(t, 3.25, 0.18, 0.3);
  }
  function droneShot(shot, t, t0, t1, z0, z1, rot = 0) {
    const p = seg(t, t0 - 0.2, t1 + 0.2), img = IMG[shot.img];
    const fx = lerp(shot.from[0], shot.to[0], eio(p)), fy = lerp(shot.from[1], shot.to[1], eio(p)), z = lerp(z0, z1, eio(p));
    ctx.save(); if (rot) { ctx.translate(W / 2, H / 2); ctx.rotate(lerp(rot, -rot, p)); ctx.transform(1, 0, lerp(rot, -rot, p) * 0.6, 1, 0, 0); ctx.translate(-W / 2, -H / 2); }
    cam(img, z, fx, fy); ctx.restore();
  }
  function sceneDrone(t) {
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
    const shots = [
      [T.drone, T.detail, () => droneShot(P.orbit, t, T.drone, T.detail, 1.12, 1.26, 0.018)],
      [T.detail, T.street, () => droneShot(P.detail, t, T.detail, T.street, 2.25, 2.7)],
      [T.street, T.aerial, () => droneShot(P.street, t, T.street, T.aerial, 1.1, 1.24)],
      [T.aerial, T.ui, () => droneShot(P.aerial, t, T.aerial, T.ui, 1.4, 1.08)],
    ];
    const i = Math.max(0, shots.findIndex(([a, b]) => t >= a && t < b));
    const cut = [T.street, T.aerial].find((b) => Math.abs(t - b) < 0.2); // whip pans on these two cuts
    if (cut) { const k = shots.findIndex(([a]) => a === cut); whip(t, cut, () => shots[t < cut ? k - 1 : k][2]()); }
    else shots[i][2]();
    // hard cuts with a flash into the orbit and the detail close-up
    hitFlash(t, T.drone, 0.45, 0.3); hitFlash(t, T.detail, 0.35, 0.3);
    shade(0.5, 0.6); watermark(1);
    const w1 = 'מכל זווית', w2 = 'לכל פרט';
    title(w1, W / 2, H * 0.15, fit(w1, 132 * S, W * 0.9), { reveal: seg(t, 13.3, 13.9), alpha: 1 - seg(t, 15.2, 15.5) });
    title(w2, W / 2, H * 0.15, fit(w2, 132 * S, W * 0.9), { grad: true, reveal: seg(t, 15.6, 16.2), alpha: 1 - seg(t, 17.2, 17.5) });
  }
  function laptop(t, cx, cy, sw) {
    const sh = sw * 0.625, bez = sw * 0.03, r = sw * 0.03;
    const k = clamp(Math.floor((t - T.ui) * P.ui.fps), 0, P.ui.frames - 1);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 90 * S; ctx.shadowOffsetY = 40 * S;
    rrect(cx - sw / 2 - bez, cy - sh / 2 - bez, sw + bez * 2, sh + bez * 2, r); ctx.fillStyle = '#0d0b0d'; ctx.fill(); ctx.restore();
    ctx.save(); rrect(cx - sw / 2 - bez, cy - sh / 2 - bez, sw + bez * 2, sh + bez * 2, r); ctx.lineWidth = 2.5 * S; ctx.strokeStyle = roseGrad(cx - sw / 2, cy - sh / 2, cx + sw / 2, cy + sh / 2); ctx.stroke(); ctx.restore();
    ctx.drawImage(IMG.ui[k], cx - sw / 2, cy - sh / 2, sw, sh);
    const g = ctx.createLinearGradient(cx - sw / 2, cy - sh / 2, cx + sw / 2, cy + sh / 2); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(0.4, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
    // base / hinge
    const by = cy + sh / 2 + bez; ctx.beginPath(); ctx.moveTo(cx - sw * 0.62, by + sw * 0.045); ctx.lineTo(cx + sw * 0.62, by + sw * 0.045); ctx.lineTo(cx + sw * 0.56, by); ctx.lineTo(cx - sw * 0.56, by); ctx.closePath();
    ctx.fillStyle = roseGrad(cx - sw * 0.6, by, cx + sw * 0.6, by + 20 * S); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    return k;
  }
  function sceneUI(t) {
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.35; ctx.filter = `blur(${28 * S}px)`; cam(IMG[P.hero], 1.3, 0.5, 0.5); ctx.restore(); ctx.filter = 'none';
    ctx.fillStyle = 'rgba(10,6,9,0.55)'; ctx.fillRect(0, 0, W, H); lightLeak(t, 0.8, 0.15, 0.85);
    const enter = eback(seg(t, T.ui, T.ui + 0.7)), dolly = eio(seg(t, T.ui + 0.5, T.montage));
    const sw = W * lerp(0.9, 1.22, dolly) * lerp(0.85, 1, enter), cy = H * 0.47 + (1 - enter) * H * 0.2;
    ctx.save(); ctx.globalAlpha = seg(t, T.ui, T.ui + 0.3); laptop(t, W / 2, cy, sw); ctx.restore();
    const [c1, c2] = P.concept;
    title(c1, W / 2, H * 0.12, fit(c1, 76 * S, W * 0.9), { reveal: seg(t, 21.3, 22.0), alpha: 1 - seg(t, 24.8, 25.1) });
    title(c2, W / 2, H * 0.12, fit(c2, 76 * S, W * 0.9), { grad: true, reveal: seg(t, 25.1, 25.9), alpha: 1 - seg(t, 28.7, 29) });
    hitFlash(t, T.ui, 0.4, 0.35);
    const night = T.ui + P.ui.clicks[2] / P.ui.fps; hitFlash(t, night, 0.25, 0.4, '190,180,255');
    watermark(1);
  }
  function sceneMontage(t) {
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
    const n = P.montage.length, step = (T.end - T.montage) / n, i = clamp(Math.floor((t - T.montage) / step), 0, n - 1);
    const p = (t - T.montage - i * step) / step, img = IMG[P.montage[i]];
    cam(img, lerp(1.22, 1.08, eo(p)), 0.5, 0.48);
    ctx.fillStyle = `rgba(8,5,7,${0.45 * seg(t, 29.2, 29.6)})`; ctx.fillRect(0, 0, W, H);
    hitFlash(t, T.montage + i * step, i ? 0.22 : 0.5, 0.18);
    const l1 = 'כי התכנון שלכם', l2 = 'ראוי להרבה יותר מתמונה';
    const s2 = fit(l2, 110 * S, W * 0.92), s1 = fit(l1, 84 * S, W * 0.9);
    title(l1, W / 2, H * 0.44, s1, { reveal: seg(t, 29.3, 29.9) });
    title(l2, W / 2, H * 0.44 + s1 * 0.75 + s2 * 0.75, s2, { grad: true, reveal: seg(t, 29.9, 30.7) });
    watermark(1 - seg(t, 32.6, 33));
  }
  function bokeh(t, k) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 28; i++) {
      const s1 = Math.sin(i * 12.9898) * 43758.5453, r1 = s1 - Math.floor(s1), s2 = Math.sin(i * 78.233) * 12345.678, r2 = s2 - Math.floor(s2);
      const x = W * r1 + Math.sin(t * 0.3 + i) * 30 * S, y = H * ((r2 + t * 0.012 * (0.5 + r1)) % 1), r = (8 + 26 * r2) * S;
      const col = [C.pink, C.rose2, C.lav, C.rose1][i % 4]; const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = 0.18 * k * (0.5 + 0.5 * Math.sin(t * 1.3 + i)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  function sceneEnd(t) {
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
    const k = seg(t, T.end, T.end + 1.2);
    // moving rose-gold, pink and violet light
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [col, ox, oy, rr, sp] of [['rgba(243,154,192,', 0.25, 0.3, 0.7, 0.35], ['rgba(234,176,154,', 0.75, 0.42, 0.65, 0.28], ['rgba(185,163,230,', 0.5, 0.72, 0.8, 0.22]]) {
      const x = W * (ox + 0.12 * Math.sin(t * sp * 2)), y = H * (oy + 0.05 * Math.cos(t * sp * 1.7)), r = Math.max(W, H) * rr * 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col + (0.22 * k) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore(); bokeh(t, k);
    // the original logo: out of a soft blur, settling into place, with a backlight
    const logo = IMG[P.logo], lw = W * 0.9, lh = lw * logo.height / logo.width, ly = H * 0.34;
    const e = seg(t, T.end + 0.05, T.end + 1.3), sc = lerp(1.12, 1, eo(e));
    { const g = ctx.createRadialGradient(W / 2, ly, 0, W / 2, ly, lw * 0.62); g.addColorStop(0, `rgba(255,200,190,${0.28 * e})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, ly - lw, W, lw * 2); }
    ctx.save(); ctx.globalAlpha = eo(e); ctx.filter = `blur(${(1 - eo(e)) * 22 * S}px)`; ctx.translate(W / 2, ly); ctx.scale(sc, sc); ctx.drawImage(logo, -lw / 2, -lh / 2, lw, lh); ctx.restore(); ctx.filter = 'none';
    const sw = seg(t, T.end + 1.2, T.end + 2.4);
    if (sw > 0 && sw < 1) {
      const oc = shineC || (shineC = document.createElement('canvas')); oc.width = Math.ceil(lw); oc.height = Math.ceil(lh);
      const o = oc.getContext('2d'); o.drawImage(logo, 0, 0, lw, lh); o.globalCompositeOperation = 'source-in';
      const x = lerp(-lw * 0.3, lw * 1.3, sw), g = o.createLinearGradient(x - 150 * S, 0, x + 150 * S, lh * 0.4); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,244,236,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      o.fillStyle = g; o.fillRect(0, 0, lw, lh); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(oc, W / 2 - lw / 2, ly - lh / 2); ctx.restore();
    }
    const sl = P.slogan, ss = fit(sl, 92 * S, W * 0.9);
    title(sl, W / 2, H * 0.53, ss, { grad: true, reveal: seg(t, VO[12].t, VO[12].t + 0.8) });
    title(P.services, W / 2, H * 0.53 + ss * 1.15, fit(P.services, 44 * S, W * 0.9, 600), { weight: 600, reveal: seg(t, 35.3, 35.9) });
    title(P.phone, W / 2, H * 0.53 + ss * 1.15 + 120 * S, 124 * S, { reveal: seg(t, 35.8, 36.6), track: 2 * S });
    title(P.rights, W / 2, H * 0.955, 26 * S, { weight: 400, color: 'rgba(251,239,233,0.6)', reveal: seg(t, 36.8, 37.4) });
    hitFlash(t, T.end, 0.7, 0.6);
  }

  function draw(canvas, t) {
    ctx = canvas.getContext('2d'); W = canvas.width; H = canvas.height; S = Math.min(W, H) / 1080;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingQuality = 'high'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    if (t < T.drone) sceneBlueprint(t);
    else if (t < T.ui) sceneDrone(t);
    else if (t < T.montage) sceneUI(t);
    else if (t < T.end) sceneMontage(t);
    else sceneEnd(t);
    subtitles(t); vignette(t < T.end ? 0.55 : 0.35); grain(t);
    const fade = 1 - seg(t, 0, 0.25); if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  }

  /* ---------- score ---------- */
  const B = 0.5; // 120 BPM
  const CH = [[38, [50, 53, 57, 62]], [34, [46, 50, 53, 58]], [41, [53, 57, 60, 65]], [36, [48, 52, 55, 60]]]; // Dm Bb F C
  const chordAt = (t) => { if (t >= T.end) return [t, 38, [50, 54, 57, 62, 66]]; const c = CH[((Math.floor(t / 2) % 4) + 4) % 4]; return [t, c[0], c[1]]; };
  function buildAudio(ac, startAt = 0, stem = null) {
    const AD = global.AD;
    const K = AD.createKit(ac, { startAt, dur: DUR, fadeAt: DUR - 0.7, gaps: [[5.82, 6.0], [28.82, 29.0], [32.84, 33.0]] });
    const { at, music, seq, narrate, out, osc, filt, whoosh, riser, boom, impact, braam, reverseSwell, subDrop, kick, snare, hat, taiko, bass, bell, tick, blip } = K;
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const sq = seq(B, chordAt);
    function pad(t, dur, notes, g, cut = 1400) {
      for (const m of notes) for (const det of [-7, 7]) {
        const o = osc('sawtooth', mtof(m), t, dur + 1.2); o.detune.value = det; const lp = filt('lowpass', cut), e = ac.createGain();
        e.gain.setValueAtTime(0.0001, at(t)); e.gain.linearRampToValueAtTime(g, at(t + 0.6)); e.gain.setValueAtTime(g, at(t + dur)); e.gain.linearRampToValueAtTime(0.0001, at(t + dur + 1.1));
        o.connect(lp); lp.connect(e); out(e, 0.6, music);
      }
    }
    // 0–6 tension: drone, clock, the hook hits
    impact(0.02, 0.5, 0.35); bass(0, 26, 6, 0.08, 160); pad(0.4, 5.4, [50, 57, 62], 0.012, 900);
    for (let t = 0.5; t < 5.8; t += B) tick(t, 0.07, 2600, (t * 2) % 2 ? 0.4 : -0.4);
    whoosh(1.45, 0.5, 400, 3000, 0.12); boom(3.25, 0.5, 0.32); braam(3.25, 38, 1.0, 0.05);
    riser(4.0, 1.82, 0.14); reverseSwell(5.82, 1.2, 0.18);
    // 6 the wow
    impact(6.0, 1.1, 0.7); braam(6.0, 38, 2.4, 0.12); bell(6.9, 74, 0.08); bell(7.3, 81, 0.07); bell(7.7, 86, 0.06);
    pad(6.0, 7.0, [50, 53, 57, 62], 0.016);
    for (let t = 8.0; t < 13; t += B) kick(t, t % 1 === 0 ? 0.3 : 0.16);
    boom(10.25, 0.4, 0.16); braam(10.25, 34, 0.9, 0.035); riser(11.8, 1.2, 0.1); reverseSwell(13.0, 0.9, 0.22);
    // 13–21 drums, bass and arpeggio
    for (let bar = 13; bar < 21; bar += 2) {
      sq.bassBar(bar, 0.08, 4, 520); sq.arpBar(bar, 0.032); taiko(bar, 0.34);
      for (let n = 0; n < 4; n++) { kick(bar + n * B, 0.42); if (n % 2) snare(bar + n * B, 0.16); hat(bar + n * B + B / 2, 0.05); }
    }
    for (const x of [T.street, T.aerial]) whoosh(x - 0.25, 0.5, 500, 5000, 0.16);
    boom(T.detail, 0.4, 0.25); tick(T.detail, 0.12, 1500);
    // 21–29 the interface: lighter, half-time, clicks where the cursor clicks
    impact(T.ui, 0.8, 0.45);
    for (let bar = 21; bar < 29; bar += 2) { sq.arpBar(bar, 0.028); for (let n = 0; n < 4; n++) { if (n % 2 === 0) kick(bar + n * B, 0.3); hat(bar + n * B, 0.035); hat(bar + n * B + B / 2, 0.05); } pad(bar, 2, chordAt(bar)[2], 0.01); }
    P.ui.clicks.forEach((c, i) => { const t = T.ui + c / P.ui.fps; tick(t, 0.2, 2500); blip(t, 1400 + i * 300, 0.06, 0); });
    { const tn = T.ui + P.ui.clicks[2] / P.ui.fps; bell(tn, 86, 0.08); subDrop(tn, 0.15, 0.9); }
    riser(28.05, 0.95, 0.08);
    // 29–33 montage: a hit on every cut
    impact(T.montage, 0.6, 0.5); braam(T.montage, 38, 0.6, 0.07);
    const step = (T.end - T.montage) / P.montage.length;
    for (let i = 1; i < P.montage.length; i++) { const t = T.montage + i * step, under = t < VO[10].t + VO[10].dur; taiko(t, under ? 0.12 : 0.3); kick(t, under ? 0.14 : 0.35); whoosh(t - 0.12, 0.25, 800, 4000, under ? 0.025 : 0.06); }
    for (let i = 0; i < 8; i++) snare(32.0 + i * 0.1, 0.04 + i * 0.014); reverseSwell(33.0, 1.0, 0.3);
    // 33–40 the brand: final hit resolving to D major
    impact(T.end, 1.0, 0.7); braam(T.end, 38, 1.3, 0.1); pad(T.end, DUR - T.end, [50, 54, 57, 62, 66], 0.016, 1800);
    [74, 78, 81, 86].forEach((m, i) => bell(VO[12].t + i * 0.22, m, 0.035)); bell(36.95, 90, 0.06); bell(37.1, 86, 0.04); [81, 86, 90].forEach((m, i) => bell(VO[14].t + VO[14].dur + 0.1 + i * 0.18, m, 0.06));
    for (const m of [26, 38]) { const o = osc('sine', mtof(m), T.end, 6), e = ac.createGain(); e.gain.setValueAtTime(0.0001, at(T.end)); e.gain.linearRampToValueAtTime(0.07, at(T.end + 0.05)); e.gain.exponentialRampToValueAtTime(0.0001, at(DUR)); o.connect(e); out(e, 0.2, music); }
    // narration: lines laid end to end in one buffer, each placed at its start time
    const rec = VO.filter((v) => v.file);
    if (rec.length) {
      const sr = ac.sampleRate, total = rec.reduce((s, v) => s + v.file.duration + 0.1, 0), voice = ac.createBuffer(1, Math.ceil(total * sr), sr), list = [];
      let off = 0; for (const v of rec) { const d = voice.getChannelData(0), src = v.file.getChannelData(0), n = Math.min(src.length, Math.round(v.file.duration * sr)); for (let i = 0; i < n; i++) d[Math.round(off * sr) + i] = src[Math.floor(i * v.file.sampleRate / sr)] || 0; list.push([off, off + v.file.duration, v.t]); off += v.file.duration + 0.1; }
      narrate(list, voice);
    }
    K.voiceBus.gain.value = 2.2; // voice sits clearly above the score
    // stems for checking the mix: 'voice' or 'music' (music + effects, ducked as in the mix)
    if (stem === 'music') K.voiceBus.disconnect();
    if (stem === 'voice') { K.music.disconnect(); K.sfx.disconnect(); }
  }
  async function renderAudio(stem = null) {
    const ac = new OfflineAudioContext(2, Math.ceil(48000 * DUR), 48000); buildAudio(ac, 0, stem); const buf = await ac.startRendering();
    const n = buf.length, ch = 2, view = new DataView(new ArrayBuffer(44 + n * ch * 2)); const ws = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); view.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, ch, true); view.setUint32(24, 48000, true); view.setUint32(28, 48000 * ch * 2, true); view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true); ws(36, 'data'); view.setUint32(40, n * ch * 2, true);
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1); let o = 44; for (let i = 0; i < n; i++) { view.setInt16(o, clamp(L[i], -1, 1) * 32767, true); view.setInt16(o + 2, clamp(Rr[i], -1, 1) * 32767, true); o += 4; }
    return view.buffer;
  }
  global.CINE_APP = { DUR, load, draw, buildAudio, renderAudio };
})(window);
