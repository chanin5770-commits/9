/* The scenes. Each one is draw(ctx, lt, shot, t): lt is the time since the shot
 * started, t the song time. Clip scenes use the supplied character footage;
 * the rest are drawn entirely in code. */
'use strict';

const SCENES = {};

// ---------------------------------------------------------------- footage

/* shot: { clip, from, speed, cam: [{zoom,fx,fy}, {zoom,fx,fy}], filter, fx: [...] }
 * The camera eases between the two framings over the length of the shot, and
 * every beat adds a tiny zoom punch when shot.punch is set. */
SCENES.clip = (ctx, lt, s, t) => {
  const k = ease.inOut(clamp(lt / (s.end - s.start)));
  const c0 = s.cam ? s.cam[0] : {}, c1 = s.cam ? s.cam[1] || s.cam[0] : {};
  const punch = s.punch ? beatPulse(t) * s.punch : 0;
  const cam = {
    zoom: lerp(c0.zoom || 1.04, c1.zoom || 1.04, k) * (1 + punch),
    fx: lerp(c0.fx == null ? 0.5 : c0.fx, c1.fx == null ? 0.5 : c1.fx, k),
    fy: lerp(c0.fy == null ? 0.5 : c0.fy, c1.fy == null ? 0.5 : c1.fy, k),
    filter: s.filter,
  };
  drawClip(ctx, s.clip, (s.from || 0) + lt * (s.speed || 1), cam);
};

// ---------------------------------------------------------------- opening gate

function drawGate(ctx, open, t) {
  const cx = W / 2, top = 170, bot = 900, half = 250, archR = half;
  const springY = top + archR;
  // Light behind the gate.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - half, bot); ctx.lineTo(cx - half, springY); ctx.arc(cx, springY, archR, Math.PI, 0); ctx.lineTo(cx + half, bot); ctx.closePath();
  ctx.clip();
  const lg = ctx.createRadialGradient(cx, 560, 20, cx, 560, 520);
  lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.35, '#fff3c6'); lg.addColorStop(1, '#ffd36b');
  ctx.fillStyle = lg; ctx.fillRect(cx - half, top, half * 2, bot - top);
  rays(ctx, cx, 560, t, { alpha: 0.35 * open, n: 18 });
  // Doors swinging towards the viewer: the free edge slides back to the hinge and
  // grows taller as it comes closer.
  const ang = open * 1.45;
  for (const side of [-1, 1]) {
    const hingeX = cx + side * half;
    const wv = half * Math.cos(ang);
    const grow = 1 + 0.35 * Math.sin(ang);
    const freeX = hingeX - side * wv;
    const fy0 = springY - (springY - top) * 0.2 - 60 * (grow - 1) * 3, fy1 = bot + 50 * (grow - 1) * 3;
    ctx.beginPath();
    ctx.moveTo(hingeX, top + 40); ctx.lineTo(freeX, fy0 - archR * 0.6 * Math.cos(ang)); ctx.lineTo(freeX, fy1); ctx.lineTo(hingeX, bot);
    ctx.closePath();
    const dg = ctx.createLinearGradient(hingeX, 0, freeX, 0);
    dg.addColorStop(0, '#f6e7c4'); dg.addColorStop(1, shade('#e9cf94', 1 - 0.25 * Math.sin(ang)));
    ctx.fillStyle = dg; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#c99a33'; ctx.stroke();
    // Gold panels on the door.
    ctx.save();
    ctx.globalAlpha = Math.cos(ang) * 0.9 + 0.1;
    ctx.strokeStyle = '#d4a63c'; ctx.lineWidth = 5;
    for (const [a, b] of [[0.2, 0.48], [0.56, 0.9]]) {
      const x0 = lerp(hingeX, freeX, 0.18), x1 = lerp(hingeX, freeX, 0.82);
      const y0 = lerp(top + 140, bot, a), y1 = lerp(top + 140, bot, b);
      ctx.strokeRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0);
    }
    // Round gold knob.
    ctx.fillStyle = '#e3b444';
    ctx.beginPath(); ctx.arc(lerp(hingeX, freeX, 0.85), 610, 12 * Math.cos(ang) + 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // Golden frame, columns and steps.
  ctx.save();
  const fg = ctx.createLinearGradient(0, top - 60, 0, bot);
  fg.addColorStop(0, '#fff2b8'); fg.addColorStop(0.5, '#e8b53e'); fg.addColorStop(1, '#b07a17');
  ctx.strokeStyle = fg; ctx.lineWidth = 46;
  ctx.shadowColor = 'rgba(255,210,100,0.7)'; ctx.shadowBlur = 40;
  ctx.beginPath(); ctx.moveTo(cx - half - 23, bot); ctx.lineTo(cx - half - 23, springY); ctx.arc(cx, springY, archR + 23, Math.PI, 0); ctx.lineTo(cx + half + 23, bot); ctx.stroke();
  ctx.shadowBlur = 0;
  for (const side of [-1, 1]) {
    const x = cx + side * (half + 150);
    const cg = ctx.createLinearGradient(x - 50, 0, x + 50, 0);
    cg.addColorStop(0, '#efe3c8'); cg.addColorStop(0.5, '#fffaf0'); cg.addColorStop(1, '#d9c8a4');
    ctx.fillStyle = cg; ctx.fillRect(x - 46, 300, 92, bot - 300);
    ctx.fillStyle = fg; ctx.fillRect(x - 64, 270, 128, 40); ctx.fillRect(x - 64, bot - 30, 128, 34);
  }
  // Small crown on the keystone.
  crown(ctx, cx, top - 70, 110, '#ffd54f');
  ctx.fillStyle = '#f5ecd9';
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#efe2c6' : '#f8f0df'; ctx.fillRect(cx - 520 - i * 70, bot + i * 45, 1040 + i * 140, 45); }
  ctx.restore();
}

function crown(ctx, x, y, w, color) {
  const h = w * 0.62;
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, '#fff6c2'); g.addColorStop(0.5, color); g.addColorStop(1, '#b8860b');
  ctx.fillStyle = g;
  ctx.shadowColor = 'rgba(255,215,100,0.8)'; ctx.shadowBlur = w * 0.25;
  ctx.beginPath();
  ctx.moveTo(-w / 2, h / 2); ctx.lineTo(-w / 2, -h * 0.25); ctx.lineTo(-w / 4, h * 0.05); ctx.lineTo(0, -h / 2);
  ctx.lineTo(w / 4, h * 0.05); ctx.lineTo(w / 2, -h * 0.25); ctx.lineTo(w / 2, h / 2); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff8dc';
  for (const [px, py] of [[-w / 2, -h * 0.25], [0, -h / 2], [w / 2, -h * 0.25]]) { ctx.beginPath(); ctx.arc(px, py, w * 0.07, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#3b6fd8'; ctx.beginPath(); ctx.arc(0, h * 0.22, w * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* Letters flying out of a point towards the camera (simple perspective). */
function letterStream(ctx, t, o) {
  const n = o.n || 30;
  for (let i = 0; i < n; i++) {
    const life = o.life || 3.2;
    const born = o.start + (i / n) * (o.span || 3);
    const k = (t - born) / life;
    if (k < 0 || k > 1) continue;
    const ang = hash(i + 5) * Math.PI * 2, spread = 0.35 + 0.65 * hash(i * 2 + 1);
    const z = lerp(9, 0.7, ease.in(k));
    const x = o.x + (Math.cos(ang) * 900 * spread) / z, y = o.y + (Math.sin(ang) * 560 * spread) / z;
    const size = 340 / z;
    letter3D(ctx, ALEFBET[(i * 7) % 22], x, y, size, { face: FACE_CYCLE[i % 4], rotY: Math.sin(t * 2 + i) * 0.5, alpha: clamp(k * 6) * clamp((1 - k) * 5), glow: 0.5 });
  }
}

SCENES.gate = (ctx, lt, s, t) => {
  const dur = s.end - s.start;
  const open = ease.inOut(prog(lt, 1.0, 3.6));
  const push = 1 + 1.4 * ease.in(prog(lt, 3.0, dur));
  skyBG(ctx, t, { sunY: 520 });
  sparkles(ctx, t, { n: 40, seed: 3, alpha: 0.7 });
  ctx.save();
  ctx.translate(W / 2, 560); ctx.scale(push, push); ctx.translate(-W / 2, -560);
  drawGate(ctx, open, t);
  ctx.restore();
  letterStream(ctx, t, { start: s.start + 1.8, x: W / 2, y: 560, n: 34, span: dur - 1.8, life: 2.6 });
  glowSpot(ctx, W / 2, 560, 700, 'rgba(255,248,220,A)', 0.5 * ease.in(prog(lt, dur - 1.2, dur)));
  fill(ctx, '#fffaf0', ease.in(prog(lt, dur - 0.5, dur)));
};

// ---------------------------------------------------------------- titles

function title3D(ctx, text, x, y, size, o = {}) {
  letter3D(ctx, text, x, y, size, Object.assign({ font: TITLE_FONT, weight: 400, depth: size * 0.09, glow: 0.7 }, o));
}

/* The song title over whatever is underneath, landing letter by letter. */
function titleCard(ctx, t, t0, o = {}) {
  const k = t - t0;
  if (k < 0) return;
  const size = o.size || 190, y = o.y || 230;
  const words = ['מלך', 'האותיות'];
  const out = o.out == null ? 1e9 : o.out;
  const a = clamp((out - t) / 0.4);
  if (a <= 0) return;
  glowSpot(ctx, W / 2, y, 900, 'rgba(255,240,190,A)', 0.45 * clamp(k * 2) * a);
  // Right-to-left: "מלך" first on the right.
  const gap = size * 0.35;
  const w0 = glyphBox(ctx, words[0], `400 ${size}px ${TITLE_FONT}`).w, w1 = glyphBox(ctx, words[1], `400 ${size}px ${TITLE_FONT}`).w;
  const total = w0 + gap + w1;
  const xs = [W / 2 + total / 2 - w0 / 2, W / 2 - total / 2 + w1 / 2];
  words.forEach((wd, i) => {
    const kk = prog(k, i * 0.3, i * 0.3 + 0.7);
    if (kk <= 0) return;
    title3D(ctx, wd, xs[i], y + (1 - bounce(kk)) * -80, size * (0.6 + 0.4 * ease.back(kk)), { alpha: clamp(kk * 3) * a, rotY: (1 - ease.out(kk)) * 0.9, flash: Math.max(0, 1 - kk * 2) * 0.6 });
  });
  crown(ctx, xs[0], y - size * 0.95 + (1 - bounce(prog(k, 0.8, 1.6))) * -60, size * 0.42, '#ffd54f');
  burst(ctx, t, t0 + 0.5, W / 2, y, { radius: 520, n: 34, seed: 2 });
}

SCENES.endTitle = (ctx, lt, s, t) => {
  skyBG(ctx, t, { sunY: 420, cloudY: 0.78 });
  rays(ctx, W / 2, 420, t, { alpha: 0.18, n: 20, spin: 0.05 });
  // Rainbow of letters behind the title.
  letterArc(ctx, t, { cx: W / 2, cy: 760, r: 820, size: 76, alpha: 0.9, settle: 1, wave: 1 });
  // The boy's last smile in a golden medallion.
  const mk = ease.back(prog(lt, 0.2, 1.1));
  if (mk > 0) {
    ctx.save();
    const r = 150 * mk;
    ctx.beginPath(); ctx.arc(W / 2, 330, r, 0, Math.PI * 2); ctx.save(); ctx.clip();
    ctx.translate(W / 2, 330); ctx.scale(mk, mk); ctx.translate(-W / 2, -330);
    // desk-aleph at 7.6 s: smiling at the camera; frame it on his face.
    const img = Frames.get('desk-aleph', Math.round(s.faceFrame || 183));
    if (img) ctx.drawImage(img, 360, 80, 520, 520, W / 2 - 150, 330 - 150, 300, 300);
    ctx.restore();
    ctx.lineWidth = 16 * mk; ctx.strokeStyle = '#e8b53e'; ctx.shadowColor = 'rgba(255,210,100,.9)'; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(W / 2, 330, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    crown(ctx, W / 2, 330 - r - 40 * mk, 120 * mk, '#ffd54f');
  }
  titleCard(ctx, t, s.start + 0.6, { size: 170, y: 640 });
  const sk = prog(lt, 1.8, 2.6);
  if (sk > 0) {
    ctx.save();
    ctx.globalAlpha = ease.out(sk);
    ctx.font = `800 64px ${ROUND_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    ctx.fillStyle = '#1f4fa8'; ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 18;
    ctx.fillText('ChaniLi Studio', W / 2, 830 + (1 - ease.out(sk)) * 30);
    ctx.restore();
  }
  sparkles(ctx, t, { n: 80, seed: 9 });
  fill(ctx, '#fffaf0', ease.in(prog(t, s.end - 1.4, s.end)) * (s.fadeOut ? 1 : 0));
};

// ---------------------------------------------------------------- word of letters

/* "אות ועוד אות": letters fly in on the beats and join into a word. */
SCENES.word = (ctx, lt, s, t) => {
  drawClip(ctx, s.bg, (s.bgFrom || 0) + lt * 0.5, { zoom: 1.15 + lt * 0.02, filter: 'blur(14px) brightness(1.08) saturate(1.1)' });
  fill(ctx, '#fff8e8', 0.25);
  const letters = [...s.text];
  const size = s.size || 300;
  const font = `900 ${size}px ${LETTER_FONT}`;
  const widths = letters.map((ch) => glyphBox(ctx, ch, font).w);
  const gap = size * 0.12, total = widths.reduce((a, b) => a + b, 0) + gap * (letters.length - 1);
  let x = W / 2 + total / 2;
  const slots = widths.map((w) => { const c = x - w / 2; x -= w + gap; return c; });
  const done = s.times[s.times.length - 1] - s.start;
  // Glowing ribbon joining the letters once they have all arrived.
  const rk = prog(lt, done + 0.1, done + 0.6);
  if (rk > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const x0 = W / 2 + total / 2 + 40, x1 = lerp(x0, W / 2 - total / 2 - 40, ease.out(rk));
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(255,220,120,0)'); g.addColorStop(0.5, 'rgba(255,230,150,0.9)'); g.addColorStop(1, 'rgba(255,255,230,1)');
    ctx.strokeStyle = g; ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) { const xx = lerp(x0, x1, i / 40); const yy = 560 + size * 0.42 + Math.sin(i / 40 * Math.PI * 3 + t * 4) * 14; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
    ctx.stroke();
    ctx.restore();
  }
  letters.forEach((ch, i) => {
    const ti = s.times[i] - s.start;
    const k = prog(lt, ti - 0.35, ti);
    if (k <= 0) return;
    const from = [[W + 300, 200], [W / 2, -300], [-300, 260], [W / 2, H + 300], [W + 300, H]][i % 5];
    const e = ease.out(k);
    const xx = lerp(from[0], slots[i], e), yy = lerp(from[1], 540, e) + Math.sin(t * 3 + i) * 8;
    const pulse = rk > 0 ? Math.sin(clamp((lt - done - 0.3 - i * 0.08) / 0.4) * Math.PI) : 0;
    letter3D(ctx, ch, xx, yy, size * (1 + 0.08 * pulse), { face: s.face || 'gold', rotY: (1 - e) * 1.1, flash: Math.max(0, 1 - (lt - ti) / 0.3) * (k >= 1 ? 0.7 : 0) + pulse * 0.4 });
    if (k >= 1) burst(ctx, t, s.times[i], slots[i], 540, { radius: 220, seed: i });
  });
  sparkles(ctx, t, { n: 40, seed: 4 });
};

// ---------------------------------------------------------------- orbit ring overlay

/* Letters circling around a point of the picture (used over footage). */
function orbit(ctx, t, o) {
  const n = o.n || 12, a = o.alpha == null ? 1 : o.alpha;
  const items = [];
  for (let i = 0; i < n; i++) {
    const ang = t * (o.speed || 1.4) + (i / n) * Math.PI * 2;
    items.push({ i, ang, depth: Math.sin(ang) });
  }
  items.sort((p, q) => p.depth - q.depth);
  for (const it of items) {
    const x = o.x + Math.cos(it.ang) * o.rx, y = o.y + Math.sin(it.ang) * o.ry;
    const sc = 0.75 + 0.3 * it.depth;
    letter3D(ctx, ALEFBET[(it.i * 2 + (o.offset || 0)) % 22], x, y, (o.size || 120) * sc, { face: FACE_CYCLE[it.i % 4], alpha: a * (0.55 + 0.45 * (it.depth + 1) / 2), rotY: -Math.cos(it.ang) * 0.7, glow: 0.6 });
  }
}

// ---------------------------------------------------------------- the alphabet

/* Tracks which letter is being sung: times[i] is when letter i starts. */
function currentLetter(times, t) {
  let i = -1;
  while (i < times.length - 1 && times[i + 1] <= t + 0.06) i++;
  return i;
}

/* Bottom strip with all 22 letters, right to left; sung ones light up. */
function alefbetStrip(ctx, times, t, o = {}) {
  const y = o.y || 985, size = o.size || 64, gapX = (W - 160) / 22;
  ctx.save();
  const bg = ctx.createLinearGradient(0, y - 70, 0, H);
  bg.addColorStop(0, 'rgba(255,248,230,0)'); bg.addColorStop(0.35, 'rgba(255,248,230,0.92)'); bg.addColorStop(1, 'rgba(255,244,220,0.98)');
  ctx.fillStyle = bg; ctx.fillRect(0, y - 90, W, H - y + 90);
  ctx.restore();
  const cur = currentLetter(times, t);
  for (let i = 0; i < 22; i++) {
    const x = W - 80 - gapX * (i + 0.5);
    const d = t - times[i];
    const hit = d >= -0.06 && d < 0.35 ? Math.sin(clamp((d + 0.06) / 0.41) * Math.PI) : 0;
    const sung = i <= cur;
    letter3D(ctx, ALEFBET[i], x, y - hit * 28, size * (1 + 0.45 * hit), {
      face: sung ? FACE_CYCLE[i % 4] : 'cream', alpha: sung ? 1 : 0.55, depth: size * 0.06, glow: sung ? 0.35 + hit : 0, flash: hit * 0.5,
    });
  }
}

/* One big letter per beat: bouncy entrance, gentle 3D turn, stops facing the
 * camera, flashes, then flies down into its place in the strip. */
function bigLetter(ctx, i, times, t, o) {
  const T = times[i];
  const next = i < 21 ? times[i + 1] : T + 0.6;
  const u = t - T;
  if (u < -0.03 || t > next - 0.02) return;
  const kin = prog(u, -0.03, 0.17);
  const kout = i < 21 ? prog(t, next - 0.15, next - 0.02) : 0;
  const size = o.size;
  const gapX = (W - 160) / 22;
  const slotX = W - 80 - gapX * (i + 0.5);
  const x = lerp(o.x, slotX, ease.inOut(kout)), y = lerp(o.y + (1 - bounce(kin)) * -140, 985, ease.inOut(kout));
  const sc = (0.25 + 0.75 * ease.back(kin)) * lerp(1, 0.18, ease.inOut(kout));
  const rot = (1 - ease.out(prog(u, -0.03, 0.24))) * 1.1 * (i % 2 ? -1 : 1);
  const flash = Math.max(0, 1 - Math.abs(u - 0.04) / 0.16);
  glowSpot(ctx, x, y, size * 1.1 * sc, 'rgba(255,244,200,A)', 0.55 * flash * (1 - kout));
  letter3D(ctx, ALEFBET[i], x, y, size * sc, { face: o.face ? o.face(i) : FACE_CYCLE[i % 4], rotY: rot, flash: flash * 0.75, alpha: clamp(kin * 4) * (1 - kout * kout), glow: 0.7 });
  if (u >= 0 && u < 0.6) burst(ctx, t, T, o.x, o.y, { radius: 300, n: 18, seed: i, dur: 0.6 });
}

/* All 22 letters in two rows (right to left), bouncing in a wave on the beat. */
function alefbetGrid(ctx, t, t0, o = {}) {
  const k = t - t0;
  if (k < 0) return;
  const size = o.size || 150, rows = [ALEFBET.slice(0, 11), ALEFBET.slice(11)];
  const gx = o.gapX || 158, y0 = o.y || 380, gy = o.gapY || 260;
  const a = o.alpha == null ? 1 : o.alpha;
  rows.forEach((row, r) => row.forEach((ch, j) => {
    const idx = r * 11 + j;
    const ki = prog(k, idx * 0.035, idx * 0.035 + 0.45);
    if (ki <= 0) return;
    const x = W / 2 + ((row.length - 1) / 2 - j) * gx;
    const wave = beatPulse(t - j * 0.03) * 22 * (o.dance == null ? 1 : o.dance);
    letter3D(ctx, ch, x, y0 + r * gy - wave + (1 - bounce(ki)) * -120, size * ease.back(ki), { face: FACE_CYCLE[idx % 4], alpha: a * clamp(ki * 3), glow: 0.5 + beatPulse(t) * 0.5, rotY: Math.sin(t * 2.2 + idx * 0.6) * 0.18 });
  }));
}

SCENES.chant1 = (ctx, lt, s, t) => {
  // The boy at his desk; he points to the right, where the letters appear.
  drawClip(ctx, 'desk-aleph', (s.from || 0) + lt * s.speed, { zoom: 1.08 + 0.04 * Math.sin(lt * 0.3), fx: 0.48, fy: 0.45 });
  const gridAt = s.gridAt;
  const toGrid = prog(t, gridAt - 0.2, gridAt + 0.5);
  // Soft cream glow that the big letter sits on.
  glowSpot(ctx, 1450, 430, 480, 'rgba(255,250,235,A)', 0.85 * (1 - toGrid));
  ctx.save(); ctx.globalAlpha = 0.75 * (1 - toGrid);
  const disc = ctx.createRadialGradient(1450, 430, 60, 1450, 430, 330);
  disc.addColorStop(0, 'rgba(255,252,240,0.95)'); disc.addColorStop(0.7, 'rgba(255,248,228,0.75)'); disc.addColorStop(1, 'rgba(255,248,228,0)');
  ctx.fillStyle = disc; ctx.fillRect(1050, 0, 870, 860);
  ctx.restore();
  if (toGrid < 1) {
    for (let i = 0; i < 22; i++) bigLetter(ctx, i, s.times, t, { x: 1450, y: 430, size: 400 });
  }
  fill(ctx, '#fff7e6', 0.82 * ease.inOut(toGrid));
  if (toGrid > 0) alefbetGrid(ctx, t, gridAt, { size: 150, y: 360 });
  alefbetStrip(ctx, s.times, t, { y: 985 });
  sparkles(ctx, t, { n: 36, seed: 6, alpha: 0.8 });
};

/* The second alphabet: letters stand along both sides of the golden path and
 * light up one by one as the boy walks towards the castle. */
SCENES.chant2 = (ctx, lt, s, t) => {
  drawClip(ctx, 'castle-path', (s.from || 0) + lt * s.speed, { zoom: 1.06, fx: 0.5, fy: 0.5 });
  const gridAt = s.gridAt;
  const toGrid = prog(t, gridAt - 0.2, gridAt + 0.6);
  const period = 0.398, D = 6, Z0 = 9, f = 1.0;
  // Camera position along the path: letter i reaches depth Z0 at its sung time.
  const T = s.times;
  let zc;
  if (t <= T[0]) zc = (t - T[0]) / period * D;
  else if (t >= T[21]) zc = 21 * D + (t - T[21]) / period * D;
  else { const i = currentLetter(T, t); const j = Math.min(21, i + 1); zc = lerp(i * D, j * D, clamp((t - T[i]) / (T[j] - T[i]))); }
  const horizon = 470, cx = W / 2;
  const items = [];
  for (let i = 0; i < 22; i++) {
    const z = i * D + Z0 - zc;
    if (z < 1.2 || z > 80) continue;
    items.push({ i, z });
  }
  items.sort((p, q) => q.z - p.z);
  ctx.save();
  ctx.globalAlpha = 1 - toGrid;
  for (const { i, z } of items) {
    const side = i % 2 ? -1 : 1; // first letter (א) on the right
    const sc = (Z0 / z) * f;
    const x = cx + side * 450 * sc, y = horizon + 150 * sc;
    const d = t - T[i];
    const lit = d >= -0.04;
    const flash = lit ? Math.max(0, 1 - d / 0.3) : 0;
    // A small glowing stone under each letter.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = lit ? 'rgba(255,214,110,0.55)' : 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.ellipse(x, y + 150 * sc, 120 * sc, 26 * sc, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (lit) glowSpot(ctx, x, y, 260 * sc, 'rgba(255,236,170,A)', 0.5 + flash * 0.4);
    letter3D(ctx, ALEFBET[i], x, y - flash * 30 * sc, 330 * sc * (1 + 0.25 * flash), { face: lit ? 'gold' : 'sky', alpha: lit ? clamp((80 - z) / 20) : 0.6 * clamp((60 - z) / 20), glow: lit ? 0.8 : 0.1, flash: flash * 0.8, rotY: side * -0.35 });
    if (lit && d < 0.7) burst(ctx, t, T[i], x, y, { radius: 220 * sc, n: 16, seed: i, dur: 0.7 });
  }
  ctx.restore();
  fill(ctx, '#fff7e6', 0.82 * ease.inOut(toGrid));
  if (toGrid > 0) alefbetGrid(ctx, t, gridAt, { size: 150, y: 400 });
  sparkles(ctx, t, { n: 50, seed: 7 });
};

// ---------------------------------------------------------------- the holy ark

SCENES.ark = (ctx, lt, s, t) => {
  const dur = s.end - s.start;
  const push = 1 + 0.12 * ease.inOut(clamp(lt / dur));
  ctx.save();
  ctx.translate(W / 2, 540); ctx.scale(push, push); ctx.translate(-W / 2, -540);
  // Wall and floor.
  const wg = ctx.createLinearGradient(0, 0, 0, H);
  wg.addColorStop(0, '#dcecff'); wg.addColorStop(0.7, '#f6eedd'); wg.addColorStop(1, '#e9d8b5');
  ctx.fillStyle = wg; ctx.fillRect(-200, -200, W + 400, H + 400);
  glowSpot(ctx, W / 2, 420, 1000, 'rgba(255,244,210,A)', 0.6);
  // Wooden steps.
  for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#c9a46a', '#b88f55', '#a67d45'][i]; ctx.fillRect(560 - i * 60, 900 + i * 40, 800 + i * 120, 40); }
  // Ark body.
  const x0 = 640, x1 = 1280, top = 230, bot = 900, r = (x1 - x0) / 2;
  const frame = ctx.createLinearGradient(x0 - 60, 0, x1 + 60, 0);
  frame.addColorStop(0, '#b98c3c'); frame.addColorStop(0.5, '#ffe7a0'); frame.addColorStop(1, '#b98c3c');
  ctx.fillStyle = frame;
  ctx.shadowColor = 'rgba(255,210,110,0.6)'; ctx.shadowBlur = 50;
  ctx.beginPath(); ctx.moveTo(x0 - 60, bot); ctx.lineTo(x0 - 60, top + r); ctx.arc(W / 2, top + r, r + 60, Math.PI, 0); ctx.lineTo(x1 + 60, bot); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  // Inside: deep blue velvet with the Torah scroll.
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x0, bot); ctx.lineTo(x0, top + r); ctx.arc(W / 2, top + r, r, Math.PI, 0); ctx.lineTo(x1, bot); ctx.closePath(); ctx.clip();
  const ig = ctx.createRadialGradient(W / 2, 520, 40, W / 2, 520, 520);
  ig.addColorStop(0, '#3d6fd0'); ig.addColorStop(1, '#14295e');
  ctx.fillStyle = ig; ctx.fillRect(x0, top, x1 - x0, bot - top);
  rays(ctx, W / 2, 470, t, { alpha: 0.12, n: 16, spin: 0.04, len: 700 });
  torahScroll(ctx, W / 2, 560);
  // The curtain opens to the sides.
  const open = ease.inOut(prog(lt, 0.15, 1.5));
  for (const side of [-1, 1]) {
    ctx.save();
    const wv = r * (1 - open * 0.82);
    const ex = side < 0 ? x0 : x1;
    const pg = ctx.createLinearGradient(ex, 0, ex - side * wv, 0);
    pg.addColorStop(0, '#1d3f99'); pg.addColorStop(0.5, '#2f5fc4'); pg.addColorStop(1, '#22479f');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.moveTo(ex, top); ctx.lineTo(ex - side * wv, top);
    for (let y = top; y <= bot; y += 20) ctx.lineTo(ex - side * wv + Math.sin(y / 30 + t * 2) * 6 * open, y);
    ctx.lineTo(ex, bot); ctx.closePath(); ctx.fill();
    // Folds.
    ctx.strokeStyle = 'rgba(10,25,70,0.35)'; ctx.lineWidth = 6;
    for (let f = 1; f < 5; f++) { const fx = ex - side * wv * f / 5; ctx.beginPath(); ctx.moveTo(fx, top); ctx.lineTo(fx, bot); ctx.stroke(); }
    ctx.fillStyle = '#e6b84a'; ctx.fillRect(Math.min(ex, ex - side * wv), bot - 46, wv, 18);
    ctx.restore();
  }
  // Embroidered crown and words on the closed curtain.
  const ca = 1 - prog(lt, 0.15, 0.7);
  if (ca > 0) {
    ctx.save(); ctx.globalAlpha = ca;
    crown(ctx, W / 2, 450, 170, '#f3c64e');
    ctx.font = `900 92px ${LETTER_FONT}`; ctx.fillStyle = '#f3c64e'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
    ctx.fillText('כתר תורה', W / 2, 640);
    ctx.restore();
  }
  ctx.restore();
  // Valance across the top.
  ctx.fillStyle = '#1d3f99';
  ctx.beginPath(); ctx.moveTo(x0, top + r * 0.55); ctx.arc(W / 2, top + r, r, Math.PI * 1.2, Math.PI * 1.8); ctx.closePath();
  // Eternal light above the ark.
  ctx.strokeStyle = '#c9a04a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(W / 2, -200); ctx.lineTo(W / 2, 90); ctx.stroke();
  ctx.fillStyle = '#e6b84a'; ctx.beginPath(); ctx.ellipse(W / 2, 110, 50, 26, 0, 0, Math.PI * 2); ctx.fill();
  glowSpot(ctx, W / 2, 120, 160, 'rgba(255,170,80,A)', 0.8 + 0.15 * Math.sin(t * 9));
  // Tablets on top of the ark.
  tablets(ctx, W / 2, top - 40, 1);
  ctx.restore();
  sparkles(ctx, t, { n: 46, seed: 12 });
  vignette(ctx, 0.25);
};

function torahScroll(ctx, cx, cy) {
  // Two wooden rollers with crowns, dressed in a blue mantle.
  for (const side of [-1, 1]) {
    const x = cx + side * 70;
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x - 9, cy - 330, 18, 80); ctx.fillRect(x - 9, cy + 250, 18, 60);
    ctx.fillStyle = '#e8c15a'; ctx.beginPath(); ctx.arc(x, cy - 340, 22, 0, Math.PI * 2); ctx.fill();
  }
  const mg = ctx.createLinearGradient(cx - 150, 0, cx + 150, 0);
  mg.addColorStop(0, '#1b3a8f'); mg.addColorStop(0.5, '#3f78e0'); mg.addColorStop(1, '#1b3a8f');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.moveTo(cx - 150, cy - 230); ctx.quadraticCurveTo(cx, cy - 300, cx + 150, cy - 230); ctx.lineTo(cx + 160, cy + 260); ctx.lineTo(cx - 160, cy + 260); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#f0c75a'; ctx.lineWidth = 10; ctx.stroke();
  ctx.fillStyle = '#f0c75a'; ctx.fillRect(cx - 160, cy + 220, 320, 14);
  crown(ctx, cx, cy - 60, 150, '#f3c64e');
  tablets(ctx, cx, cy + 110, 0.55);
}

function tablets(ctx, cx, cy, sc) {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(sc, sc);
  for (const side of [-1, 1]) {
    const x = side * 62;
    const g = ctx.createLinearGradient(0, -90, 0, 90);
    g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#e7dcc4');
    ctx.fillStyle = g; ctx.strokeStyle = '#d0a548'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x - 55, 90); ctx.lineTo(x - 55, -40); ctx.arc(x, -40, 55, Math.PI, 0); ctx.lineTo(x + 55, 90); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.font = `900 38px ${LETTER_FONT}`; ctx.fillStyle = '#2f5fc4'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
  ['א', 'ב', 'ג', 'ד', 'ה'].forEach((ch, i) => ctx.fillText(ch, 62, -30 + i * 30));
  ['ו', 'ז', 'ח', 'ט', 'י'].forEach((ch, i) => ctx.fillText(ch, -62, -30 + i * 30));
  ctx.restore();
}

// ---------------------------------------------------------------- bridge

SCENES.aleph = (ctx, lt, s, t) => {
  const g = ctx.createRadialGradient(W / 2, 520, 50, W / 2, 520, 1200);
  g.addColorStop(0, '#fff9ea'); g.addColorStop(0.45, '#bfe1ff'); g.addColorStop(1, '#2f5fc4');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  rays(ctx, W / 2, 520, t, { alpha: 0.3, n: 22, spin: 0.12 });
  const k = prog(lt, 0, 0.9);
  const size = 620 * (0.3 + 0.7 * ease.back(k));
  glowSpot(ctx, W / 2, 520, 600, 'rgba(255,240,190,A)', 0.7 * k);
  letter3D(ctx, 'א', W / 2, 520 + (1 - ease.out(k)) * 300 + Math.sin(t * 1.6) * 10, size, { face: 'gold', rotY: Math.sin(lt * 1.3) * 0.35, depth: 48, glow: 1, flash: Math.max(0, 1 - lt / 0.5) });
  orbit(ctx, t, { x: W / 2, y: 540, rx: 620, ry: 170, n: 10, size: 86, speed: 0.9, alpha: clamp(lt - 0.6), offset: 1 });
  burst(ctx, t, s.start + 0.5, W / 2, 520, { radius: 700, n: 40, seed: 5, dur: 1.2 });
  sparkles(ctx, t, { n: 70, seed: 15 });
};

/* Good deeds: a charity box with coins dropping in on the beat. */
SCENES.tzedakah = (ctx, lt, s, t) => {
  skyBG(ctx, t, { sunY: 380, cloudY: 0.85 });
  // Table.
  ctx.fillStyle = '#d6b07a'; ctx.fillRect(0, 820, W, 260);
  ctx.fillStyle = '#c49a62'; ctx.fillRect(0, 820, W, 18);
  const bx = W / 2, by = 560, bw = 460, bh = 560;
  // Coins falling on the beats.
  (s.coins || []).forEach((tc, i) => {
    const k = prog(t, tc - 0.45, tc);
    if (k <= 0 || t > tc + 0.05) return;
    const x = bx + (i % 2 ? -18 : 18), y = lerp(-80, by - bh / 2 - 10, ease.in(k));
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.cos(t * 12 + i), 1);
    ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  });
  // The box.
  ctx.save();
  const bob = beatPulse(t) * 8;
  ctx.translate(0, -bob);
  ctx.shadowColor = 'rgba(30,60,140,0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
  const g = ctx.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0);
  g.addColorStop(0, '#1d3f99'); g.addColorStop(0.5, '#3f78e0'); g.addColorStop(1, '#1d3f99');
  ctx.fillStyle = g;
  roundRect(ctx, bx - bw / 2, by - bh / 2, bw, bh, 34); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#0d1f4f'; roundRect(ctx, bx - 90, by - bh / 2 + 22, 180, 22, 11); ctx.fill();
  ctx.strokeStyle = '#f0c75a'; ctx.lineWidth = 10; roundRect(ctx, bx - bw / 2 + 24, by - bh / 2 + 70, bw - 48, bh - 100, 22); ctx.stroke();
  ctx.restore();
  letter3D(ctx, "צדקה", bx, by + 40 - bob, 150, { face: 'gold', depth: 8, glow: 0.6 });
  (s.coins || []).forEach((tc, i) => {
    burst(ctx, t, tc, bx, by - bh / 2 - bob, { radius: 200, n: 16, seed: i + 30, dur: 0.6 });
    // A little heart rising after each coin.
    const k = prog(t, tc, tc + 1.4);
    if (k > 0 && k < 1) heart(ctx, bx + (i % 2 ? 230 : -230), by - 120 - k * 300, 50 * ease.back(clamp(k * 3)), 1 - k);
  });
  sparkles(ctx, t, { n: 40, seed: 21 });
};

function heart(ctx, x, y, s, a) {
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s / 50, s / 50);
  ctx.fillStyle = '#ff8fb1'; ctx.shadowColor = 'rgba(255,150,180,0.8)'; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.moveTo(0, 30); ctx.bezierCurveTo(-60, -10, -30, -60, 0, -28); ctx.bezierCurveTo(30, -60, 60, -10, 0, 30); ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------------------------------------------------------------- finale

/* 22 letters on a rainbow arc, right (א) to left (ת). settle 0..1 moves them from
 * below the frame up to the arc. */
function letterArc(ctx, t, o) {
  const a = o.alpha == null ? 1 : o.alpha;
  for (let i = 0; i < 22; i++) {
    const th = lerp(0.12, Math.PI - 0.12, i / 21);
    const tx = o.cx + Math.cos(th) * o.r, ty = o.cy - Math.sin(th) * o.r * (o.squash || 0.62);
    const k = o.settle == null ? 1 : clamp(o.settle * 1.6 - (i / 21) * 0.6);
    const e = ease.out(k);
    const sx = o.cx + (hash(i * 3) - 0.5) * 900, sy = H + 150;
    const x = lerp(sx, tx, e), y = lerp(sy, ty, e) - (o.wave ? beatPulse(t - i * 0.025) * 16 : 0);
    letter3D(ctx, ALEFBET[i], x, y, o.size * (0.6 + 0.4 * e), { face: FACE_CYCLE[i % 4], alpha: a * clamp(k * 4), rotY: (1 - e) * 1.1 + Math.sin(t * 2 + i) * 0.12, glow: 0.55 });
  }
}

function rainbowBands(ctx, cx, cy, r, a) {
  if (a <= 0) return;
  const cols = ['#ffb3c7', '#ffd59e', '#fff1a8', '#bff0c8', '#bfe3ff', '#c9c4ff'];
  ctx.save();
  ctx.globalAlpha = a * 0.55;
  ctx.lineWidth = 40;
  cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.ellipse(cx, cy, r - i * 38, (r - i * 38) * 0.62, 0, Math.PI, Math.PI * 2); ctx.stroke(); });
  ctx.restore();
}

SCENES.finale = (ctx, lt, s, t) => {
  const dur = s.end - s.start;
  const pull = lerp(1.3, 1.0, ease.inOut(clamp(lt / dur)));
  ctx.save();
  ctx.translate(W / 2, 640); ctx.scale(pull, pull); ctx.translate(-W / 2, -640);
  drawClip(ctx, s.clip, (s.from || 0) + lt * (s.speed || 0.5), { zoom: 1.0, fx: 0.5, fy: 0.5 });
  ctx.restore();
  fill(ctx, '#fff6e0', 0.12);
  const settle = prog(lt, 0.2, 2.6);
  rainbowBands(ctx, W / 2, 900, 760 / pull, prog(lt, 1.6, 3));
  letterArc(ctx, t, { cx: W / 2, cy: 900, r: 820 / pull, size: 150 / pull, settle, wave: 1, squash: 0.7 });
  sparkles(ctx, t, { n: 70, seed: 33 });
  burst(ctx, t, s.start + 2.6, W / 2, 380, { radius: 800, n: 44, seed: 8, dur: 1.4 });
};

/* Letters flying past the camera over a soft, blurred background. */
SCENES.flythrough = (ctx, lt, s, t) => {
  drawClip(ctx, s.bg, (s.bgFrom || 0) + lt * 0.4, { zoom: 1.2, filter: 'blur(10px) brightness(1.1)' });
  fill(ctx, '#fff3dc', 0.2);
  const n = 40;
  const items = [];
  for (let i = 0; i < n; i++) {
    const zz = ((hash(i) * 20 - lt * 7) % 20 + 20) % 20 + 0.6;
    items.push({ i, z: zz });
  }
  items.sort((p, q) => q.z - p.z);
  for (const { i, z } of items) {
    const ang = hash(i * 4) * Math.PI * 2, rad = 0.3 + hash(i * 6);
    const x = W / 2 + (Math.cos(ang) * 1200 * rad) / z, y = H / 2 + (Math.sin(ang) * 700 * rad) / z;
    letter3D(ctx, ALEFBET[i % 22], x, y, 300 / z, { face: FACE_CYCLE[i % 4], rotY: Math.sin(t + i) * 0.6, alpha: clamp((20 - z) / 4) * clamp((z - 0.6) * 2), glow: 0.5 });
  }
  sparkles(ctx, t, { n: 50, seed: 41 });
};

/* The whole alef-bet at once ("מאלף ועד תו"), over a soft background. */
SCENES.grid = (ctx, lt, s, t) => {
  drawClip(ctx, s.bg, (s.bgFrom || 0) + lt * 0.5, { zoom: 1.12, filter: 'blur(12px) brightness(1.08)' });
  fill(ctx, '#fff7e6', 0.55);
  rays(ctx, W / 2, 520, t, { alpha: 0.12, n: 18 });
  alefbetGrid(ctx, t, s.start + 0.05, { size: 150, y: 400 });
  // א and ת get a golden halo: from the first letter to the last.
  const k = prog(lt, 1.0, 1.6);
  const xs = [W / 2 + 5 * 158, W / 2 - 5 * 158];
  glowSpot(ctx, xs[0], 400, 220, 'rgba(255,230,150,A)', 0.6 * k);
  glowSpot(ctx, xs[1], 660, 220, 'rgba(255,230,150,A)', 0.6 * prog(lt, 1.8, 2.4));
  sparkles(ctx, t, { n: 50, seed: 44 });
};
