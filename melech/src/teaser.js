/* The 15-second vertical (9:16) launch teaser, cut entirely from the finished
 * "מלך האותיות" clip: every picture is a moment of the clip (reframed to 9:16),
 * and the only additions are the end-card lines, set in the clip's own fonts and
 * colours. The soundtrack (assets/teaser-music.wav) is cut from the song itself.
 *
 * The clip's frames are read from build/frames/orig/ (tools/teaser/extract_clip_frames.sh). */
'use strict';

const DURATION = 15;
const END_FADE = 0; // the end card holds to the last frame
const CLIP_FPS_ORIG = 30;

// The soundtrack is the song's intro (from its first beat at 0.07 s) cut on a beat
// into the instrumental chorus at 7.825 s, so its beats map straight from the song's.
const CUT = 7.825, CHIME = 13.89;
setBeats(ANALYSIS.beats.filter((b) => b < 7.89).map((b) => b - 0.07)
  .concat(ANALYSIS.beats.filter((b) => b >= 25.68 && b < 31.35).map((b) => b - 25.681 + CUT)));

// Each excerpt: teaser start/end, and the clip time it starts from. Starts are on
// beats of the song and cuts on beats of the teaser, so the clip's own beat-synced
// motion stays in step with the music.
const EXCERPTS = [
  { start: 0, end: 3.993, src: 52.802, focus: 0.5 }, // golden letters flying (0:52.8)
  { start: 3.993, end: CUT, src: 1.649, focus: 0.5, fade: 0.3 }, // the golden gate opens (0:01.6)
  { start: CUT, end: 9.451, src: 26.099, focus: 0.53, flash: 0.3 }, // the King, letters circling him (0:26.1)
  { start: 9.451, end: 10.658, src: 111.758, focus: 0.5 }, // up the stairs to the door of light (1:51.8)
  { start: 10.658, end: 11.866, src: 118.561, focus: 0.5 }, // looking up to the light (1:58.6)
];
const END_SRC = 99.498; // all 22 letters together (1:39.5), behind the end card

function origFrame(t) {
  const k = 'orig/' + String(Math.round(t * CLIP_FPS_ORIG) + 1).padStart(5, '0');
  const img = Frames.cache.get(k);
  if (img) return img;
  Frames.need.add(k);
  return null;
}

// 9:16 window onto the 16:9 clip frame, centred on focus (0..1 across the frame).
function drawCrop(ctx, t, focus, filter) {
  const img = origFrame(t);
  if (!img) return;
  const s = H / 1080, dw = 1920 * s;
  const x = clamp(W / 2 - focus * dw, W - dw, 0);
  ctx.save();
  if (filter) ctx.filter = filter;
  ctx.drawImage(img, x, 0, dw, H);
  ctx.restore();
}

SCENES.excerpt = (ctx, lt, s) => drawCrop(ctx, s.src + lt, s.focus);

/* End card: the clip's 22-letter moment, whole, over a soft blur of itself, and the
 * lines underneath. "בקרוב" lands on the chime, its dots on the half-beats. */
function goldText(ctx, text, x, y, size, k) {
  if (k <= 0) return;
  letter3D(ctx, text, x, y + (1 - ease.out(k)) * 40, size, { font: TITLE_FONT, weight: 400, depth: size * 0.07, glow: 0.55, alpha: clamp(k * 1.6) });
}

SCENES.endCard = (ctx, lt, s, t) => {
  const st = END_SRC + lt;
  drawCrop(ctx, st, 0.5, 'blur(28px) brightness(1.12)');
  fill(ctx, '#fff6e9', 0.55);
  const img = origFrame(st);
  if (img) {
    const h = W * 1080 / 1920, y = 300;
    ctx.save();
    ctx.shadowColor = 'rgba(160,120,60,0.35)'; ctx.shadowBlur = 40;
    ctx.drawImage(img, 0, y, W, h);
    ctx.restore();
  }
  goldText(ctx, '22 אותיות. שנה שלמה.', W / 2, 1080, 84, prog(t, s.lines[0], s.lines[0] + 0.45));
  goldText(ctx, 'אינסוף חוויות חסידיות!', W / 2, 1195, 84, prog(t, s.lines[1], s.lines[1] + 0.45));
  const kb = prog(t, CHIME - 0.04, CHIME + 0.3);
  if (kb > 0) {
    const size = 140, y = 1385;
    const dots = (t >= CHIME + 0.2 ? '.' : '') + (t >= CHIME + 0.4 ? '.' : '') + (t >= CHIME + 0.6 ? '.' : '');
    const wbox = glyphBox(ctx, 'בקרוב', `900 ${size}px ${LETTER_FONT}`);
    letter3D(ctx, 'בקרוב', W / 2 + 40, y, size * (0.7 + 0.3 * ease.back(kb)), { face: 'royal', depth: 9, glow: 0.5, alpha: clamp(kb * 3), flash: Math.max(0, 1 - (t - CHIME) / 0.35) * 0.6 });
    if (dots) {
      // Dots sit to the left of the word (RTL); the word stays put as they appear.
      ctx.save(); ctx.fillStyle = '#2f5fc4'; ctx.font = `900 ${size}px ${LETTER_FONT}`; ctx.textAlign = 'left'; ctx.direction = 'ltr';
      ctx.fillText(dots.replace(/\./g, '. ').trim(), W / 2 + 40 - wbox.w / 2 - 140, y + wbox.h / 2);
      ctx.restore();
    }
  }
  const ks = prog(t, s.studio, s.studio + 0.5);
  if (ks > 0) {
    // Same styling as the clip's own end card.
    ctx.save();
    ctx.globalAlpha = ease.out(ks);
    ctx.font = `800 72px ${ROUND_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    ctx.fillStyle = '#1f4fa8'; ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 18;
    ctx.fillText('ChaniLi Studio', W / 2, 1570);
    ctx.restore();
  }
};

const SHOTS = EXCERPTS.map((e) => Object.assign({ scene: 'excerpt' }, e)).concat([
  // 11.9–15: the end card. Music stops on the beat at 13.49; "בקרוב..." lands on the chime.
  { start: 11.866, end: DURATION, scene: 'endCard', fade: 0.4, lines: [12.3, 12.75], studio: 12.6 },
]);
