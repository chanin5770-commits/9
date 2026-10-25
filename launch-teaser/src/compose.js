/* Puts a frame together: the current shot (cross-faded with the previous one when
 * the shot asks for it), its overlays, transition flashes and the final grade. */
'use strict';

const buf = document.createElement('canvas');
buf.width = W; buf.height = H;
const bctx = buf.getContext('2d');

function shotAt(t) {
  let i = 0;
  while (i < SHOTS.length - 1 && SHOTS[i + 1].start <= t) i++;
  return i;
}

function drawShot(ctx, s, t) {
  ctx.save();
  SCENES[s.scene || 'clip'](ctx, t - s.start, s, t);
  ctx.restore();
  for (const fx of s.fx || []) { ctx.save(); OVERLAYS[fx.type](ctx, t, fx, s); ctx.restore(); }
}

const OVERLAYS = {
  sparkles: (ctx, t, o) => sparkles(ctx, t, o),
  orbit: (ctx, t, o, s) => {
    const a = (o.alpha == null ? 1 : o.alpha) * prog(t, o.at || s.start, (o.at || s.start) + 0.5) * (1 - prog(t, s.end - 0.25, s.end));
    orbit(ctx, t, Object.assign({}, o, { alpha: a }));
  },
  title: (ctx, t, o, s) => titleCard(ctx, t, o.at, o),
  stream: (ctx, t, o) => letterStream(ctx, t, o),
  glow: (ctx, t, o, s) => {
    const k = o.at == null ? 1 : prog(t, o.at, o.at + (o.rise || 1));
    glowSpot(ctx, o.x, o.y, o.r || 800, 'rgba(255,236,170,A)', (o.alpha || 0.5) * ease.out(k) * (0.85 + 0.15 * Math.sin(t * 3)));
    if (o.rays) rays(ctx, o.x, o.y, t, { alpha: o.rays * k });
  },
  /* Real-font letters floating up out of a point (e.g. an open book). */
  rise: (ctx, t, o, s) => {
    const n = o.n || 10;
    for (let i = 0; i < n; i++) {
      const born = (o.at || s.start) + i * (o.every || 0.3);
      const k = (t - born) / (o.life || 2.4);
      if (k < 0 || k > 1) continue;
      const dir = (hash(i * 13 + (o.seed || 0)) - 0.5) * (o.spread || 900);
      const x = o.x + dir * ease.out(k) + Math.sin(t * 2 + i) * 20, y = o.y - (o.height || 520) * ease.out(k);
      letter3D(ctx, o.letters ? o.letters[i % o.letters.length] : ALEFBET[(i * 5 + (o.seed || 0)) % 22], x, y, (o.size || 110) * (0.4 + 0.6 * ease.back(clamp(k * 3))), { face: o.face || FACE_CYCLE[i % 4], alpha: clamp(k * 6) * clamp((1 - k) * 4), rotY: Math.sin(t * 2.5 + i) * 0.5, glow: 0.7 });
    }
  },
  /* Letters that drop in on given beats and bounce (e.g. pointing at letters). */
  pop: (ctx, t, o) => {
    o.items.forEach((it, i) => {
      const k = prog(t, it.t - 0.1, it.t + 0.35);
      if (k <= 0) return;
      const out = o.out ? 1 - prog(t, o.out - 0.3, o.out) : 1;
      letter3D(ctx, it.ch, it.x, it.y - (1 - bounce(k)) * 90 - beatPulse(t) * 10, (it.size || 150) * ease.back(k), { face: it.face || FACE_CYCLE[i % 4], alpha: clamp(k * 4) * out, glow: 0.7, flash: Math.max(0, 1 - (t - it.t) / 0.3) * 0.6, rotY: Math.sin(t * 2 + i) * 0.25 });
      burst(ctx, t, it.t, it.x, it.y, { radius: 180, n: 14, seed: i + 50, dur: 0.6 });
    });
  },
  /* Warm golden light washing over the picture. */
  wash: (ctx, t, o, s) => {
    const k = prog(t, o.at || s.start, (o.at || s.start) + (o.rise || 1.2));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(o.x || W / 2, o.y || H / 2, 0, o.x || W / 2, o.y || H / 2, (o.r || 1300) * ease.out(k) + 1);
    g.addColorStop(0, `rgba(255,220,140,${(o.alpha || 0.35) * k})`);
    g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
  /* Small hearts of light rising (used with the "light in the heart" lines). */
  hearts: (ctx, t, o, s) => {
    for (let i = 0; i < (o.n || 8); i++) {
      const k = ((t - s.start) / 2.6 + hash(i)) % 1;
      heart(ctx, o.x + (hash(i * 3) - 0.5) * (o.spread || 600), o.y - k * 400, 26 + 16 * hash(i * 7), Math.sin(k * Math.PI) * 0.8);
    }
  },
};

function renderFrame(ctx, t) {
  const i = shotAt(t);
  const s = SHOTS[i];
  const lt = t - s.start;
  if (s.fade && lt < s.fade && i > 0) {
    drawShot(ctx, SHOTS[i - 1], t);
    bctx.clearRect(0, 0, W, H);
    drawShot(bctx, s, t);
    ctx.save(); ctx.globalAlpha = ease.inOut(lt / s.fade); ctx.drawImage(buf, 0, 0); ctx.restore();
  } else {
    drawShot(ctx, s, t);
  }
  // Flash into the shot.
  if (s.flash) fill(ctx, '#fffaf0', Math.max(0, 1 - lt / s.flash) * 0.9);
  // Flash out of the shot when the next one asks for a "flash in" from white.
  const n = SHOTS[i + 1];
  if (n && n.flash && n.start - t < 0.12) fill(ctx, '#fffaf0', (1 - (n.start - t) / 0.12) * 0.9);
  if (typeof POST === 'function') POST(ctx, t);
  // Gentle global grade: warm lift and a soft vignette.
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(255,214,150,0.18)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  vignette(ctx, 0.22);
  // Fade in from and out to cream at the very start and end.
  fill(ctx, '#fffaf0', 1 - prog(t, 0, 0.6));
  const endFade = typeof END_FADE === 'number' ? END_FADE : 1.6;
  if (endFade > 0) fill(ctx, '#fffaf0', prog(t, DURATION - endFade, DURATION));
}

// Renders a frame, fetching any footage frames it needs first.
async function frame(ctx, t) {
  renderFrame(ctx, t);
  if (Frames.need.size) { await Frames.load(); renderFrame(ctx, t); }
  if (Frames.need.size) { await Frames.load(); renderFrame(ctx, t); }
}
