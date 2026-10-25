/* The 15-second vertical (9:16) launch teaser for the "מלך ומלכת האותיות" kit.
 * A separate film from the clip and the first teaser: it brings the King and the
 * Queen of the Letters together (their original footage), gives a short look at the
 * real kit (cover, giant cards and game covers, as supplied), and ends on
 * "בקרוב...". Every Hebrew word and letter is set in a real font.
 * Soundtrack: assets/launch-music.wav (tools/make_music.py), the instrumental break
 * of the Queen's song at 147 BPM. */
'use strict';

const DURATION = 15;
const END_FADE = 0; // the end card holds to the last frame

// One bar of the music is 4 beats of 0.408 s.
const BEAT = 60 / 146.95, BAR = BEAT * 4;
const bar = (n) => n * BAR;
const STOP = bar(7), CHIME = 12.25;
setBeats(Array.from({ length: 28 }, (_, i) => i * BEAT));

const PINK = '#f4d3d8', CREAM = '#fff6e9', SKY = '#cfe8f7', PLUM = '#4a2c4a', ROSE = '#9b3b6a';
FACES.rose = { stops: ['#fff2f6', '#ffbfd1', '#e0708f', '#a83a62'], side: '#6e1f40', rim: '#fff4f8', glow: 'rgba(255,160,190,' };
const ARC_FACES = ['gold', 'sky', 'rose', 'gold'];

// Kit pages and covers, cropped from the supplied images (assets/kit).
const KIT = {};
['cover', 'card-aleph', 'card-bet', 'lotto', 'memory', 'bingo', 'kings', 'queens'].forEach((k) => {
  const img = new Image();
  img.src = 'assets/kit/' + k + '.jpg';
  KIT[k] = img;
});
const kitReady = Promise.all(Object.values(KIT).map((i) => i.decode()));

// ---------------------------------------------------------------- helpers

// Soft cream space with powder-pink and light-blue glows drifting slowly.
function dreamBG(ctx, t, tint) {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  const a = tint === 'sky' ? [SKY, SKY, PINK, SKY] : tint === 'pink' ? [PINK, PINK, SKY, PINK] : [PINK, SKY, PINK, SKY];
  [[0.15, 0.25, 900], [0.9, 0.6, 850], [0.3, 0.92, 800], [0.75, 0.08, 700]].forEach(([x, y, r], i) => {
    const cx = W * x + Math.sin(t * 0.4 + i) * 60, cy = H * y + Math.cos(t * 0.3 + i) * 60;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, a[i]); g.addColorStop(1, 'rgba(255,246,233,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  });
}

// Golden (or coloured) Hebrew text rising into place.
function goldText(ctx, text, x, y, size, k, o = {}) {
  if (k <= 0) return;
  letter3D(ctx, text, x, y + (1 - ease.out(k)) * 40, size, Object.assign({ font: TITLE_FONT, weight: 400, depth: size * 0.07, glow: 0.5, alpha: clamp(k * 1.6) }, o));
}

// Footage cover-fitted into a box; cam.fx/fy is the image point at the box centre.
function drawClipIn(ctx, clip, ct, box, cam = {}) {
  const f = clamp(ct, 0, (CLIP_FRAMES - 1) / CLIP_FPS) * CLIP_FPS + 1;
  const i0 = Math.floor(f), frac = f - i0;
  const sc = Math.max(box.w / 1920, box.h / 1080) * (cam.zoom || 1);
  const dw = 1920 * sc, dh = 1080 * sc;
  const x = clamp(box.x + box.w / 2 - (cam.fx == null ? 0.5 : cam.fx) * dw, box.x + box.w - dw, box.x);
  const y = clamp(box.y + box.h / 2 - (cam.fy == null ? 0.5 : cam.fy) * dh, box.y + box.h - dh, box.y);
  const a = Frames.get(clip, i0), b = frac > 0.05 ? Frames.get(clip, i0 + 1) : null;
  if (!a || (frac > 0.05 && !b)) return;
  ctx.drawImage(a, x, y, dw, dh);
  if (b) { ctx.save(); ctx.globalAlpha = frac; ctx.drawImage(b, x, y, dw, dh); ctx.restore(); }
}

function archPath(ctx, cx, cy, w, h) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy + h / 2); ctx.lineTo(cx - r, cy - h / 2 + r); ctx.arc(cx, cy - h / 2 + r, r, Math.PI, 0); ctx.lineTo(cx + r, cy + h / 2); ctx.closePath();
}

/* An arch-shaped gold-framed window into a piece of footage. */
function archWindow(ctx, t, lt, dur, a) {
  const k = ease.out(prog(lt, 0, 0.5));
  const aw = a.w * (0.9 + 0.1 * k), ah = aw * a.ratio;
  const p = ease.inOut(clamp(lt / dur));
  ctx.save();
  ctx.globalAlpha = clamp(k * 2);
  ctx.save();
  archPath(ctx, a.cx, a.cy, aw, ah);
  ctx.clip();
  drawClipIn(ctx, a.clip, a.from + lt * (a.speed || 1), { x: a.cx - aw / 2, y: a.cy - ah / 2, w: aw, h: ah },
    { zoom: lerp(a.cam[0].zoom, a.cam[1].zoom, p), fx: lerp(a.cam[0].fx, a.cam[1].fx, p), fy: a.cam[0].fy == null ? 0.5 : a.cam[0].fy });
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = a.tint; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  // Inner edge glow so the window melts into the light.
  const eg = ctx.createRadialGradient(a.cx, a.cy, aw * 0.4, a.cx, a.cy, ah * 0.64);
  eg.addColorStop(0, 'rgba(255,246,233,0)'); eg.addColorStop(1, 'rgba(255,240,225,0.6)');
  ctx.fillStyle = eg; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // Gold rim.
  const g = ctx.createLinearGradient(0, a.cy - ah / 2, 0, a.cy + ah / 2);
  g.addColorStop(0, '#fff2b8'); g.addColorStop(0.5, '#e2b04a'); g.addColorStop(1, '#b8862a');
  ctx.strokeStyle = g; ctx.lineWidth = a.rim || 16; ctx.shadowColor = 'rgba(255,210,120,0.8)'; ctx.shadowBlur = 36;
  archPath(ctx, a.cx, a.cy, aw + 16, ah + 16); ctx.stroke();
  ctx.restore();
  if (k > 0) crown(ctx, a.cx, a.cy - ah / 2 - a.crown * 0.45, a.crown * k, '#ffd54f');
}

/* A kit page as a floating card: white border, soft shadow, slight tilt. */
function kitCard(ctx, img, x, y, w, k, o = {}) {
  if (k <= 0 || !img.complete) return;
  const h = w * img.height / img.width;
  ctx.save();
  ctx.globalAlpha = clamp(k * 2) * (o.alpha == null ? 1 : o.alpha);
  ctx.translate(x, y + (1 - ease.out(k)) * 160);
  ctx.rotate((o.rot || 0) * (0.4 + 0.6 * ease.out(k)));
  const s = 0.85 + 0.15 * ease.back(k);
  ctx.scale(s, s);
  ctx.shadowColor = 'rgba(120,80,40,0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  ctx.fillStyle = '#fffdf8';
  roundRect(ctx, -w / 2 - 10, -h / 2 - 10, w + 20, h + 20, 18); ctx.fill();
  ctx.shadowColor = 'transparent';
  if (o.blur) ctx.filter = `blur(${o.blur}px)`;
  ctx.save(); roundRect(ctx, -w / 2, -h / 2, w, h, 10); ctx.clip();
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.filter = 'none';
  ctx.strokeStyle = '#d9b25a'; ctx.lineWidth = 4;
  roundRect(ctx, -w / 2 - 10, -h / 2 - 10, w + 20, h + 20, 18); ctx.stroke();
  ctx.restore();
}

// ב״ה in the corner on every frame, as on all the brand's materials (below the status bar).
function POST(ctx) {
  ctx.save();
  ctx.font = `400 38px ${TITLE_FONT}`; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8a6a3a'; ctx.globalAlpha = 0.85;
  ctx.fillText('ב״ה', W - 56, 290);
  ctx.restore();
}

// ---------------------------------------------------------------- scenes

// 0–3.27: something magical wakes up: a crown, golden letters on the beat, the line.
const AWAKE = [
  { ch: 'א', x: 0, y: -60, s: 420, t: BEAT },
  { ch: 'ב', x: -330, y: -330, s: 170, t: BEAT * 2, face: 'sky' },
  { ch: 'ג', x: 340, y: -300, s: 170, t: BEAT * 3, face: 'rose' },
  { ch: 'ד', x: -380, y: 230, s: 140, t: BEAT * 4 },
  { ch: 'ה', x: 380, y: 250, s: 140, t: BEAT * 5, face: 'sky' },
  { ch: 'ש', x: -150, y: -560, s: 110, t: BEAT * 6, face: 'rose' },
  { ch: 'ת', x: 170, y: -580, s: 110, t: BEAT * 6 },
];
SCENES.lAwaken = (ctx, lt, s, t) => {
  const dur = s.end - s.start;
  dreamBG(ctx, t);
  rays(ctx, W / 2, 760, t, { alpha: 0.1 * prog(t, 0.3, 1.5), n: 16, spin: 0.04, len: 1200 });
  sparkles(ctx, t, { n: 55, seed: 81, alpha: 0.8, size: 8 });
  const push = 1 + 0.12 * ease.inOut(clamp(lt / dur));
  ctx.save();
  ctx.translate(W / 2, 820); ctx.scale(push, push);
  // The point of light that becomes the first letter.
  const p = prog(t, 0, BEAT);
  if (t < BEAT + 0.4) glowSpot(ctx, 0, -60, 60 + 240 * ease.in(p), 'rgba(255,240,190,A)', 0.7 * (1 - prog(t, BEAT, BEAT + 0.4)));
  AWAKE.forEach((f, i) => {
    const k = prog(t, f.t - 0.1, f.t + 0.35);
    if (k <= 0) return;
    if (i === 0) glowSpot(ctx, f.x, f.y, 420 * k, 'rgba(255,230,160,A)', 0.3);
    const d = Math.sin(t * 1.2 + i * 1.7) * 12;
    letter3D(ctx, f.ch, f.x + d, f.y - d, f.s * (0.2 + 0.8 * ease.back(k)), {
      face: f.face || 'gold', alpha: clamp(k * 3) * (i ? 0.92 : 1), rotY: Math.sin(t * 1.1 + i) * 0.28, glow: 0.8, flash: Math.max(0, 1 - Math.abs(t - f.t) / 0.25) * 0.8,
    });
    burst(ctx, t, f.t, f.x, f.y, { radius: i ? 160 : 340, n: i ? 12 : 28, seed: 90 + i, dur: 0.9 });
  });
  ctx.restore();
  crown(ctx, W / 2, 380 + (1 - ease.out(prog(t, 0.2, 1.0))) * -60, 140, '#ffd54f');
  goldText(ctx, 'משהו קסום מתעורר', W / 2, 1300, 96, prog(t, BEAT * 3, BEAT * 3 + 0.45));
  goldText(ctx, 'בעולם האותיות...', W / 2, 1430, 96, prog(t, BEAT * 5, BEAT * 5 + 0.45), { face: 'rose' });
  // Light blooms into the first window.
  glowSpot(ctx, W / 2, 860, 1300, 'rgba(255,246,225,A)', 0.9 * ease.in(prog(lt, dur - 0.45, dur)));
};

// 3.27–6.53: the King, then the Queen, each through an arch window, named.
SCENES.lSolo = (ctx, lt, s, t) => {
  const dur = s.end - s.start;
  dreamBG(ctx, t, s.tint);
  rays(ctx, W / 2, 820, t, { alpha: 0.1, n: 16, spin: 0.05, len: 1300 });
  sparkles(ctx, t, { n: 45, seed: s.seed, alpha: 0.75 });
  archWindow(ctx, t, lt, dur, Object.assign({ cx: W / 2, cy: 880, w: 740, ratio: 1.58, crown: 120 }, s.win));
  goldText(ctx, s.name, W / 2, 1565, 112, prog(lt, 0.15, 0.6), { face: s.face });
  // Letters lighting up on the beat beside the window.
  (s.pops || []).forEach((pp, i) => {
    const tt = s.start + pp.b * BEAT, kk = prog(t, tt - 0.1, tt + 0.3);
    if (kk <= 0) return;
    letter3D(ctx, pp.ch, pp.x, pp.y - (1 - bounce(kk)) * 50 + Math.sin(t * 2 + i) * 8, 120 * ease.back(kk), { face: pp.face || 'gold', glow: 0.8, flash: Math.max(0, 1 - (t - tt) / 0.3) * 0.7, alpha: clamp(kk * 3), rotY: Math.sin(t * 1.5 + i) * 0.25 });
    burst(ctx, t, tt, pp.x, pp.y, { radius: 160, n: 14, seed: 70 + i, dur: 0.7 });
  });
};

// 6.53–8.17: King and Queen side by side; boys, girls and mixed kindergartens.
SCENES.lDuo = (ctx, lt, s, t) => {
  const dur = s.end - s.start;
  dreamBG(ctx, t);
  rays(ctx, W / 2, 780, t, { alpha: 0.12, n: 18, spin: 0.05, len: 1300 });
  sparkles(ctx, t, { n: 55, seed: 84, alpha: 0.8 });
  const common = { cy: 820, w: 400, ratio: 1.62, crown: 96, rim: 12 };
  // Right to left: the King first.
  archWindow(ctx, t, lt, dur, Object.assign({}, common, { cx: W / 2 + 228, clip: 'hall-pointing', from: 6.0, tint: 'rgba(190,220,250,0.3)', cam: [{ zoom: 1.0, fx: 0.47 }, { zoom: 1.08, fx: 0.48 }] }));
  archWindow(ctx, t, Math.max(0, lt - 0.12), dur, Object.assign({}, common, { cx: W / 2 - 228, clip: 'first-letter', from: 0.3, tint: 'rgba(244,200,212,0.3)', cam: [{ zoom: 1.0, fx: 0.3 }, { zoom: 1.08, fx: 0.31 }] }));
  goldText(ctx, 'מלך האותיות', W / 2 + 228, 1240, 64, prog(lt, 0.1, 0.5), { face: 'sky' });
  goldText(ctx, 'מלכת האותיות', W / 2 - 228, 1240, 64, prog(lt, 0.22, 0.62), { face: 'rose' });
  // One word per beat, right to left.
  [['בנים', 'sky', 360], ['בנות', 'rose', 150], ['גנים מעורבים', 'gold', -235]].forEach(([w, face, dx], i) => {
    const tt = s.start + (i + 1) * BEAT;
    goldText(ctx, w, W / 2 + dx, 1440, 82, prog(t, tt - 0.05, tt + 0.35), { face, flash: Math.max(0, 1 - (t - tt) / 0.3) * 0.5 });
  });
  for (const x of [W / 2 + 255, W / 2 + 35]) {
    const k = prog(t, s.start + 1.5 * BEAT, s.start + 2 * BEAT);
    if (k > 0) { ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = '#d9a93e'; ctx.beginPath(); ctx.arc(x, 1442, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  }
};

// 8.17–11.43: a look at the real kit, one piece landing on each beat.
const KIT_LAYOUT = [
  // [image, x, y, width, beat, rotation, blur]  (back to front)
  ['card-bet', 250, 760, 330, 1, -0.16, 1.5],
  ['card-aleph', 830, 760, 330, 1, 0.16, 1.5],
  ['lotto', 200, 1190, 280, 3, -0.1, 1.2],
  ['memory', 880, 1190, 280, 4, 0.1, 1.2],
  ['queens', 270, 540, 360, 5, -0.07, 1.2],
  ['kings', 810, 540, 360, 6, 0.07, 1.2],
  ['cover', 540, 850, 520, 0, 0, 0],
];
const KIT_WORDS = [['דפי עבודה', 4, 210, 1500], ['משחקים', 5, -210, 1500], ['שירים', 6, 160, 1600], ['קליפים', 7, -160, 1600]];
SCENES.lKit = (ctx, lt, s, t) => {
  const dur = s.end - s.start;
  dreamBG(ctx, t);
  rays(ctx, W / 2, 850, t, { alpha: 0.16, n: 20, spin: 0.05, len: 1400 });
  glowSpot(ctx, W / 2, 850, 700, 'rgba(255,232,170,A)', 0.55);
  sparkles(ctx, t, { n: 60, seed: 85, alpha: 0.85 });
  const push = 1 + 0.06 * ease.inOut(clamp(lt / dur));
  ctx.save();
  ctx.translate(W / 2, 850); ctx.scale(push, push); ctx.translate(-W / 2, -850);
  KIT_LAYOUT.forEach(([img, x, y, w, b, rot, blur], i) => {
    const tt = s.start + b * BEAT;
    const k = prog(t, tt - 0.05, tt + 0.4);
    const bob = Math.sin(t * 1.3 + i * 1.9) * 8;
    // The pieces around the cover stay a little soft: a look, not the whole kit.
    kitCard(ctx, KIT[img], x, y + bob, w, k, { rot, blur, alpha: img === 'cover' ? 1 : 0.95 });
    if (img === 'cover') burst(ctx, t, tt + 0.2, x, y - 300, { radius: 420, n: 30, seed: 7, dur: 1.0 });
  });
  ctx.restore();
  // Caption band at the top and the kit contents at the bottom, on the beats.
  goldText(ctx, 'תוכנית שנתית לגני חב״ד', W / 2, 318, 76, prog(t, s.start + 0.2, s.start + 0.6), { font: TITLE_FONT, face: 'rose' });
  KIT_WORDS.forEach(([w, b, dx, y], i) => {
    const tt = s.start + b * BEAT;
    goldText(ctx, w, W / 2 + dx, y, 70, prog(t, tt - 0.05, tt + 0.35), { face: i % 2 ? 'sky' : 'gold', flash: Math.max(0, 1 - (t - tt) / 0.3) * 0.5 });
  });
  glowSpot(ctx, W / 2, 900, 1400, 'rgba(255,246,225,A)', 0.95 * ease.in(prog(lt, dur - 0.3, dur)));
};

// 11.43–15: the alef-bet arch, the lines, "בקרוב..." on the chime, the studio.
SCENES.lEnd = (ctx, lt, s, t) => {
  dreamBG(ctx, t);
  rays(ctx, W / 2, 700, t, { alpha: 0.12, n: 18, spin: 0.04, len: 1300 });
  sparkles(ctx, t, { n: 70, seed: 86, alpha: 0.9 });
  const settle = prog(lt, 0, 0.8);
  for (let i = 0; i < 22; i++) {
    const th = lerp(0.12, Math.PI - 0.12, i / 21);
    const tx = W / 2 + Math.cos(th) * 440, ty = 860 - Math.sin(th) * 440;
    const k = clamp(settle * 1.6 - (i / 21) * 0.6), e = ease.out(k);
    const x = lerp(W / 2 + (hash(i * 3) - 0.5) * 900, tx, e), y = lerp(H + 150, ty, e) - (t < STOP ? beatPulse(t - i * 0.025) * 14 : 0);
    letter3D(ctx, ALEFBET[i], x, y, 80 * (0.6 + 0.4 * e), { face: ARC_FACES[i % 4], alpha: clamp(k * 4), rotY: (1 - e) * 1.1 + Math.sin(t * 2 + i) * 0.12, glow: 0.55 });
  }
  glowSpot(ctx, W / 2, 1000, 700, 'rgba(255,236,190,A)', 0.35);
  goldText(ctx, 'מלך ומלכת האותיות', W / 2, 690, 80, prog(lt, 0.25, 0.7), { face: 'rose' });
  goldText(ctx, '22 אותיות. שנה שלמה.', W / 2, 960, 84, prog(t, s.lines[0], s.lines[0] + 0.45));
  goldText(ctx, 'אינסוף חוויות חסידיות!', W / 2, 1080, 84, prog(t, s.lines[1], s.lines[1] + 0.45));
  // "בקרוב" lands on the chime; the three dots follow, to its left (RTL).
  const kb = prog(t, CHIME - 0.04, CHIME + 0.3);
  if (kb > 0) {
    const size = 150;
    glowSpot(ctx, W / 2, 1280, 460, 'rgba(255,240,200,A)', 0.6 * Math.max(0, 1 - (t - CHIME) / 0.8) + 0.2);
    const n = (t >= CHIME + 0.2) + (t >= CHIME + 0.4) + (t >= CHIME + 0.6);
    const wbox = glyphBox(ctx, 'בקרוב', `900 ${size}px ${LETTER_FONT}`);
    letter3D(ctx, 'בקרוב', W / 2 + 40, 1280, size * (0.7 + 0.3 * ease.back(kb)), { face: 'rose', depth: 9, glow: 0.5, alpha: clamp(kb * 3), flash: Math.max(0, 1 - (t - CHIME) / 0.35) * 0.6 });
    if (n) {
      ctx.save(); ctx.fillStyle = ROSE; ctx.font = `900 ${size}px ${LETTER_FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr';
      ctx.fillText('. . .'.slice(0, n * 2 - 1), W / 2 + 40 - wbox.w / 2 - 14, 1280 + wbox.h / 2);
      ctx.restore();
    }
    burst(ctx, t, CHIME, W / 2, 1280, { radius: 520, n: 36, seed: 9, dur: 1.1 });
  }
  // The studio at the bottom, above the status-bar safe area.
  const ks = prog(t, s.studio, s.studio + 0.5);
  if (ks > 0) {
    ctx.save();
    ctx.globalAlpha = ease.out(ks);
    crown(ctx, W / 2, 1470, 80, '#ffd54f');
    ctx.font = `800 70px ${ROUND_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    ctx.fillStyle = PLUM; ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 16;
    ctx.fillText('ChaniLi Studio', W / 2, 1550);
    ctx.strokeStyle = '#d9a93e'; ctx.lineWidth = 3; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(W / 2 - 270, 1605); ctx.lineTo(W / 2 + 270, 1605); ctx.stroke();
    ctx.restore();
  }
};

const SHOTS = [
  { start: 0, end: bar(2), scene: 'lAwaken' },
  { start: bar(2), end: bar(3), scene: 'lSolo', flash: 0.4, tint: 'sky', seed: 82, name: 'מלך האותיות', face: 'sky',
    win: { clip: 'desk-aleph', from: 4.3, speed: 0.9, tint: 'rgba(190,220,250,0.3)', cam: [{ zoom: 1.0, fx: 0.33 }, { zoom: 1.1, fx: 0.36 }] },
    pops: [{ ch: 'א', x: 110, y: 1400, b: 1 }, { ch: 'ב', x: 970, y: 1400, b: 2, face: 'sky' }] },
  { start: bar(3), end: bar(4), scene: 'lSolo', fade: 0.2, tint: 'pink', seed: 83, name: 'מלכת האותיות', face: 'rose',
    win: { clip: 'letter-hall', from: 5.9, speed: 0.95, tint: 'rgba(244,200,212,0.3)', cam: [{ zoom: 1.0, fx: 0.5 }, { zoom: 1.1, fx: 0.55 }] },
    pops: [{ ch: 'ג', x: 970, y: 1400, b: 1, face: 'rose' }, { ch: 'ד', x: 110, y: 1400, b: 2 }] },
  { start: bar(4), end: bar(5), scene: 'lDuo', fade: 0.2 },
  { start: bar(5), end: STOP, scene: 'lKit', flash: 0.35 },
  { start: STOP, end: DURATION, scene: 'lEnd', flash: 0.5, lines: [STOP + 0.3, STOP + 0.3 + BEAT], studio: 12.75 },
];
