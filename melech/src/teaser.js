/* The 15-second vertical (9:16) launch teaser: "משהו קסום מתעורר בעולם האותיות..."
 * Built from the clip's own pieces: the King of the Letters footage, the golden
 * gate, the 3D letters and the end-card styling, recoloured in powder pink, cream,
 * light blue and gold. Soundtrack: assets/teaser-music.wav (tools/teaser/make_music.py). */
'use strict';

const DURATION = 15;
const END_FADE = 0; // the end card holds to the last frame

// The soundtrack is the song's intro (from its first beat at 0.07 s) cut on a beat
// into the instrumental chorus at 7.825 s, so its beats map straight from the song's.
const CUT = 7.825, STOP = 13.49, CHIME = 13.89;
setBeats(ANALYSIS.beats.filter((b) => b < 7.89).map((b) => b - 0.07)
  .concat(ANALYSIS.beats.filter((b) => b >= 25.68 && b < 31.35).map((b) => b - 25.681 + CUT)));

const PINK = '#f4d3d8', CREAM = '#fff6e9', SKY = '#cfe8f7';

// Soft cream space with powder-pink and light-blue glows drifting slowly.
function dreamBG(ctx, t) {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  const blobs = [[0.15, 0.25, PINK, 900], [0.9, 0.6, SKY, 850], [0.3, 0.9, PINK, 800], [0.75, 0.08, SKY, 700]];
  blobs.forEach(([x, y, c, r], i) => {
    const cx = W * x + Math.sin(t * 0.4 + i) * 60, cy = H * y + Math.cos(t * 0.3 + i) * 60;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, c); g.addColorStop(1, 'rgba(255,246,233,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  });
}

// Golden letters floating at different depths; each one lights up on its beat.
// Placed so that no two letters line up into something that reads like a word.
const FLOAT = [
  { ch: 'א', x: 0, y: -40, z: 1.0, t: 0.45 },
  { ch: 'ב', x: -420, y: -700, z: 1.9, t: 1.18 },
  { ch: 'ג', x: 360, y: 430, z: 1.6, t: 1.57 },
  { ch: 'ד', x: 700, y: -800, z: 2.6, t: 1.97 },
  { ch: 'ה', x: -380, y: 900, z: 2.2, t: 2.36 },
  { ch: 'ש', x: 150, y: -1700, z: 3.4, t: 2.76 },
  { ch: 'ל', x: 1000, y: 300, z: 2.9, t: 3.15 },
  { ch: 'מ', x: -1100, y: 200, z: 3.1, t: 3.15 },
  { ch: 'ת', x: 120, y: 1900, z: 3.3, t: 3.55 },
];

SCENES.tAwaken = (ctx, lt, s, t) => {
  dreamBG(ctx, t);
  sparkles(ctx, t, { n: 50, seed: 61, alpha: 0.75, size: 8 });
  const push = 1 + 0.18 * ease.inOut(clamp(lt / 4)), roll = -0.05 * ease.inOut(clamp(lt / 4));
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.rotate(roll); ctx.scale(push, push);
  // Far letters first.
  [...FLOAT].sort((a, b) => b.z - a.z).forEach((f, i) => {
    const k = prog(t, f.t - 0.15, f.t + 0.35);
    if (k <= 0) return;
    const drift = Math.sin(t * 0.9 + i * 1.7) * 18;
    const size = (f.ch === 'א' ? 560 : 420) / f.z;
    const flash = Math.max(0, 1 - Math.abs(t - f.t - 0.05) / 0.25);
    if (f.ch === 'א') glowSpot(ctx, f.x, f.y, 520 * k, 'rgba(255,230,160,A)', 0.8 * (1 - k * 0.5));
    letter3D(ctx, f.ch, f.x / f.z * 1.0 + drift, f.y / f.z * 1.0 - drift, size * (0.2 + 0.8 * ease.back(k)), {
      face: 'gold', alpha: clamp(k * 3) * (f.z > 3 ? 0.75 : 1), rotY: Math.sin(t * 1.1 + i) * 0.3, glow: 0.8, flash: flash * 0.8,
    });
  });
  ctx.restore();
  // The point of light that becomes the first letter.
  const p = prog(t, 0.0, 0.45);
  if (p > 0 && t < 0.8) glowSpot(ctx, W / 2, H / 2 - 40, 60 + 260 * ease.in(p), 'rgba(255,240,190,A)', 0.9 * (1 - prog(t, 0.45, 0.8)));
  burst(ctx, t, 0.45, W / 2, H / 2 - 40, { radius: 360, n: 30, seed: 3, dur: 1.1 });
  // A big near letter sweeps across the lens into the next shot.
  const w = prog(lt, s.end - s.start - 0.55, s.end - s.start + 0.1);
  if (w > 0) letter3D(ctx, 'ק', lerp(W + 500, -500, ease.inOut(w)), H * 0.52, 1500, { face: 'gold', alpha: 0.95, glow: 0.4, rotY: 0.3 });
};

SCENES.tGate = (ctx, lt, s, t) => {
  const dur = s.end - s.start;
  skyBG(ctx, t, { top: '#f2c9d2', mid: '#fbe6ea', bottom: CREAM, sunY: 900, cloudY: 0.78 });
  const push = 1 + 0.9 * ease.in(clamp(lt / dur));
  ctx.save();
  ctx.translate(W / 2, 1000); ctx.scale(push * 1.3, push * 1.3); ctx.translate(-W / 2, -1000 + 440);
  // The gate opens only a narrow gap: a peek, not a reveal.
  drawGate(ctx, 0.2 * ease.inOut(prog(lt, 0.9, 2.6)), t);
  ctx.restore();
  // Powder-pink tint over the stonework.
  ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(244,190,205,0.45)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  rays(ctx, W / 2, 1000, t, { alpha: 0.22 * prog(lt, 1.0, 2.4), n: 16, spin: 0.05, len: 1600 });
  // Letters drifting past the camera on both sides.
  for (let i = 0; i < 8; i++) {
    const k = ((lt / 3.2 + i / 8) % 1);
    const z = lerp(6, 0.8, ease.in(k));
    const side = i % 2 ? -1 : 1;
    letter3D(ctx, ALEFBET[(i * 5 + 3) % 22], W / 2 + side * (520 + 80 * hash(i)) / z * 1.2, 1000 + (hash(i * 3) - 0.5) * 900 / z, 260 / z, { face: 'gold', alpha: clamp(k * 5) * clamp((1 - k) * 6), glow: 0.6, rotY: side * 0.4 });
  }
  sparkles(ctx, t, { n: 40, seed: 62, alpha: 0.8 });
  // Light from the gate blooms over the frame into the peek.
  glowSpot(ctx, W / 2, 1000, 1300, 'rgba(255,246,225,A)', 0.9 * ease.in(prog(lt, dur - 0.9, dur)));
  fill(ctx, CREAM, ease.in(prog(lt, dur - 0.35, dur)));
};

/* The King of the Letters seen from behind, through an arch-shaped window: a peek
 * into the kingdom without showing everything. */
function archPath(ctx, cx, cy, w, h) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy + h / 2); ctx.lineTo(cx - r, cy - h / 2 + r); ctx.arc(cx, cy - h / 2 + r, r, Math.PI, 0); ctx.lineTo(cx + r, cy + h / 2); ctx.closePath();
}

SCENES.tPeek = (ctx, lt, s, t) => {
  dreamBG(ctx, t);
  sparkles(ctx, t, { n: 40, seed: 63, alpha: 0.7 });
  const k = ease.out(prog(lt, 0, 0.6));
  const aw = lerp(700, 860, ease.inOut(clamp(lt / (s.end - s.start)))) * (0.92 + 0.08 * k), ah = aw * 1.62;
  const cx = W / 2, cy = 930;
  // Window into the footage.
  ctx.save();
  archPath(ctx, cx, cy, aw, ah);
  ctx.clip();
  const z = s.cam ? lerp(s.cam[0].zoom, s.cam[1].zoom, ease.inOut(clamp(lt / (s.end - s.start)))) : 1;
  drawClip(ctx, s.clip, s.from + lt * (s.speed || 1), { zoom: z, fx: lerp(s.cam[0].fx, s.cam[1].fx, clamp(lt / (s.end - s.start))), fy: s.cam[0].fy == null ? 0.5 : s.cam[0].fy });
  ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(244,200,212,0.35)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  // Inner edge glow so the window melts into the light.
  const eg = ctx.createRadialGradient(cx, cy, aw * 0.35, cx, cy, ah * 0.62);
  eg.addColorStop(0, 'rgba(255,246,233,0)'); eg.addColorStop(1, 'rgba(255,240,225,0.75)');
  ctx.fillStyle = eg; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // Gold rim.
  ctx.save();
  const g = ctx.createLinearGradient(0, cy - ah / 2, 0, cy + ah / 2);
  g.addColorStop(0, '#fff2b8'); g.addColorStop(0.5, '#e2b04a'); g.addColorStop(1, '#b8862a');
  ctx.strokeStyle = g; ctx.lineWidth = 18; ctx.shadowColor = 'rgba(255,210,120,0.8)'; ctx.shadowBlur = 40;
  archPath(ctx, cx, cy, aw + 18, ah + 18); ctx.stroke();
  ctx.restore();
  crown(ctx, cx, cy - ah / 2 - 60, 120, '#ffd54f');
  // A real-font golden letter lighting up on the beat, beside the window.
  (s.pops || []).forEach((p, i) => {
    const kk = prog(t, p.t - 0.1, p.t + 0.3);
    if (kk <= 0) return;
    letter3D(ctx, p.ch, p.x, p.y - (1 - bounce(kk)) * 60 + Math.sin(t * 2 + i) * 8, 170 * ease.back(kk), { face: 'gold', glow: 0.8, flash: Math.max(0, 1 - (t - p.t) / 0.3) * 0.7, alpha: clamp(kk * 3), rotY: Math.sin(t * 1.5 + i) * 0.25 });
    burst(ctx, t, p.t, p.x, p.y, { radius: 200, n: 16, seed: 70 + i, dur: 0.7 });
  });
};

/* End card: 22 letters on an arch, the line, "בקרוב..." on the chime, the studio. */
function goldText(ctx, text, x, y, size, k, o = {}) {
  if (k <= 0) return;
  letter3D(ctx, text, x, y + (1 - ease.out(k)) * 40, size, Object.assign({ font: TITLE_FONT, weight: 400, depth: size * 0.07, glow: 0.55, alpha: clamp(k * 1.6) }, o));
}

SCENES.tEnd = (ctx, lt, s, t) => {
  dreamBG(ctx, t);
  rays(ctx, W / 2, 620, t, { alpha: 0.12, n: 18, spin: 0.04, len: 1300 });
  sparkles(ctx, t, { n: 70, seed: 64, alpha: 0.9 });
  // The alef-bet rises into an arch, right (א) to left (ת).
  letterArc(ctx, t, { cx: W / 2, cy: 780, r: 440, squash: 1.0, size: 82, settle: prog(lt, 0, 0.75), wave: 1 });
  glowSpot(ctx, W / 2, 1060, 700, 'rgba(255,236,190,A)', 0.35);
  goldText(ctx, '22 אותיות. שנה שלמה.', W / 2, 960, 84, prog(t, s.lines[0], s.lines[0] + 0.45));
  goldText(ctx, 'אינסוף חוויות חסידיות!', W / 2, 1080, 84, prog(t, s.lines[1], s.lines[1] + 0.45));
  // "בקרוב" lands on the chime; the three dots follow on the half-beats.
  const kb = prog(t, CHIME - 0.04, CHIME + 0.3);
  if (kb > 0) {
    const size = 150;
    glowSpot(ctx, W / 2, 1290, 460, 'rgba(255,240,200,A)', 0.6 * Math.max(0, 1 - (t - CHIME) / 0.8) + 0.2);
    const dots = (t >= CHIME + 0.2 ? '.' : '') + (t >= CHIME + 0.4 ? '.' : '') + (t >= CHIME + 0.6 ? '.' : '');
    // Dots sit to the left of the word (RTL); the word stays put as they appear.
    const wbox = glyphBox(ctx, 'בקרוב', `900 ${size}px ${LETTER_FONT}`);
    letter3D(ctx, 'בקרוב', W / 2 + 40, 1290, size * (0.7 + 0.3 * ease.back(kb)), { face: 'royal', depth: 9, glow: 0.5, alpha: clamp(kb * 3), flash: Math.max(0, 1 - (t - CHIME) / 0.35) * 0.6 });
    if (dots) {
      ctx.save(); ctx.fillStyle = '#2f5fc4'; ctx.font = `900 ${size}px ${LETTER_FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr';
      ctx.fillText(dots.replace(/\./g, '. ').trim(), W / 2 + 40 - wbox.w / 2 - 150, 1290 + wbox.h / 2);
      ctx.restore();
    }
    burst(ctx, t, CHIME, W / 2, 1290, { radius: 520, n: 36, seed: 9, dur: 1.1 });
  }
  // The studio at the bottom, above the status-bar safe area.
  const ks = prog(t, s.studio, s.studio + 0.5);
  if (ks > 0) {
    ctx.save();
    ctx.globalAlpha = ease.out(ks);
    ctx.font = `800 72px ${ROUND_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    ctx.fillStyle = '#1f4fa8'; ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 16;
    ctx.fillText('ChaniLi Studio', W / 2, 1560);
    ctx.strokeStyle = '#d9a93e'; ctx.lineWidth = 3; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(W / 2 - 280, 1615); ctx.lineTo(W / 2 + 280, 1615); ctx.stroke();
    crown(ctx, W / 2, 1478, 84, '#ffd54f');
    ctx.restore();
  }
};

const SHOTS = [
  // 0–4: a magical cream space, golden letters wake up one by one on the beat.
  { start: 0, end: 3.993, scene: 'tAwaken' },
  // 4–7.8: gliding towards the grand gate of the kingdom; it opens only a crack.
  { start: 3.993, end: CUT, scene: 'tGate' },
  // 7.8–11.9: a peek at the King of the Letters, from behind, through an arch.
  { start: CUT, end: 9.86, scene: 'tPeek', clip: 'grand-staircase', from: 0.3, cam: [{ zoom: 1.0, fx: 0.4, fy: 0.5 }, { zoom: 1.1, fx: 0.42 }], flash: 0.5,
    pops: [{ ch: 'א', x: 180, y: 1640, t: CUT + 0.42 }, { ch: 'ב', x: 900, y: 1640, t: CUT + 1.23 }] },
  { start: 9.86, end: 11.87, scene: 'tPeek', clip: 'castle-path', from: 3.4, cam: [{ zoom: 1.0, fx: 0.47, fy: 0.5 }, { zoom: 1.12, fx: 0.5 }], fade: 0.35,
    pops: [{ ch: 'ג', x: 180, y: 1640, t: 10.25 }, { ch: 'ד', x: 900, y: 1640, t: 11.05 }] },
  // 11.9–15: the end card. Music stops on the beat at 13.49; "בקרוב..." lands on the chime.
  { start: 11.87, end: DURATION, scene: 'tEnd', fade: 0.45, lines: [12.55, 12.95], studio: 12.75 },
];
