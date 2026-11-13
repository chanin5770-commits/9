/* The five ads. Every visual is an original file from the kit; every claim is taken from the site. */
'use strict';
(() => {
const E = window.ENGINE;
const { W, H, img, clamp, lerp, prog, ease, card, cutout, caption, chip, background, dust, flash, burst, sweep, vignette, pageTurn, tablet, tap, wall, fan, stars, rrect, goldGrad, FONT } = E;

const GAMES = {
  bingo: 'בינגו חנוכה', letters: 'סביבון האותיות', diff: 'מצאו את ההבדלים', puzzle: 'פאזל חנוכה', seek: 'חפשו ומצאו',
  memory: 'זיכרון חנוכה', count: 'סופרים נרות', build: 'בונים חנוכייה', belongs: 'מה שייך לחנוכה?', maze: 'מבוך אל פך השמן',
  shadow: 'התאמת צלליות', shapes: 'צורות בחנוכה', numbers: 'מספרים וחנוכה', initial: 'אות פותחת', pattern: 'דגם הסביבונים',
  missing: 'מי חסר בתמונה?', jugs: 'כמה פכים?', colors: 'התאמת צבעים', sequence: 'סדר נכון', order: 'סדר הדלקת הנרות',
  bigsmall: 'גדול וקטן', firstlast: 'ראשון ואחרון', dreidel: 'סביבון דיגיטלי',
};
const SONGS = ['אור של חנוכה', 'סביבון קטן', 'בואו נכין סופגנייה', 'חנוכה הגיעה', 'חנוכה הגיעה – גרסה 2'];
const pad = (n) => String(n).padStart(2, '0');
const P = (book, n) => `book/${book}-${pad(n)}`;
const WALL = ['kit-shared/3', 'workbook/3', 'act/keter-mixed', 'kit-shared/14', 'workbook/14', 'act/chanukiah', 'kit-shared/26', 'games/4',
  'kit-shared/12', 'workbook/22', 'act/sevivon', 'kit-shared/29', 'workbook/8', 'act/kad', 'kit-shared/16', 'games/1', 'kit-shared/7', 'workbook/19',
  'act/misgeret', 'kit-shared/24', 'workbook/5', 'act/shirshert', 'kit-shared/13', 'workbook/26'];

/* fade helper: 0..1..0 over [a,b] */
const vis = (t, a, b, fi = 0.4, fo = 0.4) => Math.min(ease.out(prog(t, a, a + fi)), 1 - ease.in(prog(t, b - fo, b)));
const float = (t, k = 1, ph = 0) => Math.sin(t * 1.3 + ph) * 10 * k;

/* deal pages one by one onto a pile */
function deal(ctx, t, names, a, step, o = {}) {
  const { x = W / 2, y = 1020, w = 640, seed = 4, from = 1 } = o;
  const r = E.rng(seed);
  names.forEach((n, i) => {
    const t0 = a + i * step; const rot = (r() - 0.5) * 0.22, ox = (r() - 0.5) * 70, oy = (r() - 0.5) * 50;
    if (t < t0) return;
    const p = ease.out(prog(t, t0, t0 + step * 0.8));
    const sx = lerp(from * W * 1.1, 0, p), sr = lerp(from * 0.5, 0, p);
    card(ctx, img(n), { x: x + ox + sx, y: y + oy, w: w * (i === names.length - 1 ? 1 : 1), rot: rot + sr, border: 10, shine: prog(t, t0 + step * 0.5, t0 + step * 1.3) });
  });
}

/* one big card at a time, cross-zooming on each step */
function slideshow(ctx, t, names, a, step, o = {}) {
  const { x = W / 2, y = 1000 } = o;
  const i = Math.floor((t - a) / step); if (i < 0) return;
  const k = Math.min(i, names.length - 1), lt = t - a - k * step;
  const im0 = img(names[k]); const w = im0.height / im0.width < 0.9 ? 1010 : (o.w || 860);
  if (k > 0 && lt < 0.35) { const pp = lt / 0.35; card(ctx, img(names[k - 1]), { x: x - ease.in(pp) * 200, y, w, alpha: 1 - pp, scale: 1 + pp * 0.1, rot: -0.05 * pp }); }
  const pin = ease.back(clamp(lt / 0.45));
  card(ctx, img(names[k]), { x, y: y + float(t, 0.6), w, scale: lerp(0.82, 1, pin) + lt * 0.015, alpha: clamp(lt / 0.25), rot: (k % 2 ? 0.025 : -0.025), shine: prog(lt, 0.3, 1.1), glow: 0.5 });
}

/* tablet cycling through game screens */
function gameShow(ctx, t, keys, a, step, o = {}) {
  const { x = W / 2, y = 1000, w = 1000, label = true, labelY } = o;
  const i = clamp(Math.floor((t - a) / step), 0, keys.length - 1), lt = t - a - i * step;
  const mix = clamp(lt / 0.25);
  const pin = ease.back(prog(t, a, a + 0.6));
  const h = tablet(ctx, img('play/' + keys[i]), { x, y: y + float(t, 0.5), w, scale: lerp(0.6, 1, pin) * (1 + 0.012 * Math.sin(lt * 3)), alpha: clamp((t - a) / 0.3), prev: i > 0 ? img('play/' + keys[i - 1]) : null, mix });
  const r = E.rng(i * 13 + 5);
  tap(ctx, t, a + i * step + step * 0.45, x + (r() - 0.5) * w * 0.5, y + (r() - 0.3) * h * 0.4);
  if (label) chip(ctx, GAMES[keys[i]], x, labelY || y + h / 2 + 70, { size: 50, scale: lerp(0.8, 1, ease.back(clamp(lt / 0.35))) });
}

/* book flipping through pages */
function book(ctx, t, pages, a, step, o = {}) {
  const { x = W / 2, y = 1000, w = 980, turn = 0.85, alpha = 1, scale = 1 } = o;
  const i = Math.floor((t - a) / step); const lt = t - a - Math.max(0, i) * step;
  const k = clamp(i, 0, pages.length - 1);
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale, scale); ctx.translate(-x, -y);
  if (i >= pages.length - 1 || i < 0) pageTurn(ctx, img(pages[clamp(i, 0, pages.length - 1)]), null, { x, y, w }, 0);
  else {
    const p = clamp((lt - (step - turn)) / turn);
    pageTurn(ctx, img(pages[k]), img(pages[k + 1]), { x, y, w }, p);
  }
  ctx.restore();
}

function musicNote(ctx, x, y, s, a) {
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.fillStyle = goldGrad(ctx, -s, -s, 2 * s, 2 * s);
  ctx.beginPath(); ctx.ellipse(0, s * 0.7, s * 0.42, s * 0.3, -0.4, 0, 6.283); ctx.fill();
  ctx.fillRect(s * 0.3, -s * 0.9, s * 0.13, s * 1.6);
  ctx.beginPath(); ctx.moveTo(s * 0.43, -s * 0.9); ctx.quadraticCurveTo(s * 1.0, -s * 0.5, s * 0.8, s * 0.05); ctx.quadraticCurveTo(s * 0.8, -s * 0.4, s * 0.43, -s * 0.45); ctx.fill();
  ctx.restore();
}
function eq(ctx, t, x, y, w, h, beats) {
  const n = 18; const bw = w / n;
  let pulse = 0; for (const b of beats) { const d = t - b; if (d >= 0 && d < 0.5) pulse = Math.max(pulse, 1 - d / 0.5); }
  for (let i = 0; i < n; i++) {
    const v = 0.25 + 0.45 * Math.abs(Math.sin(t * (3 + (i % 5)) + i)) + 0.3 * pulse * Math.abs(Math.sin(i * 1.7));
    const bh = h * v;
    ctx.fillStyle = goldGrad(ctx, 0, y - bh, 0, bh); rrect(ctx, x - w / 2 + i * bw + 4, y - bh, bw - 8, bh, 6); ctx.fill();
  }
}

/* shared ending: wall of materials -> site hero -> call to action */
function outro(ctx, t, a, b, lines) {
  const s = t - a;
  const wz = lerp(1.35, 0.85, ease.inOut(prog(s, 0, 7)));
  const wa = s < 6.4 ? 1 : lerp(1, 0.22, prog(s, 6.4, 7.4));
  wall(ctx, t, WALL, { zoom: wz, alpha: wa, angle: -0.18, speed: 70 });
  if (s < 7.4) { ctx.fillStyle = `rgba(4,10,40,${0.35 * prog(s, 3.2, 4)})`; ctx.fillRect(0, 0, W, H); }
  caption(ctx, t, lines[0], { a: a + 0.25, b: a + 3.1, y: 330, size: 92, pill: true });
  caption(ctx, t, lines[1], { a: a + 3.3, b: a + 6.3, y: 330, size: 90, pill: true });
  const hp = ease.back(prog(s, 6.4, 7.3));
  if (s > 6.3) {
    card(ctx, img('ui/hero'), { x: W / 2, y: 930 + float(t, 0.4), w: 1000, scale: lerp(0.5, 1, hp) + (s - 6.4) * 0.006, alpha: clamp((s - 6.3) / 0.4), glow: 0.9, gold: true, shine: prog(s, 7.2, 8.4) });
    burst(ctx, t, a + 6.5, W / 2, 930, 21, 1.1);
  }
  caption(ctx, t, lines[2] || 'הגן שלך מוכן לחנוכה?', { a: a + 6.6, b: a + 8.9, y: 330, size: 92, pill: true });
  caption(ctx, t, lines[3] || 'הצטרפי עכשיו\nלעולם החנוכה!', { a: a + 9.0, b: 1e9, y: 320, size: 104, pill: true });
  const up = ease.back(prog(s, 7.2, 7.8));
  if (s > 7.2) chip(ctx, 'chanili-hanukkah.sites.tab.bot', W / 2, 1450, { size: 46, scale: up, bg: 'rgba(8,20,70,0.92)', fg: '#ffe9a6' });
  const lp = ease.back(prog(s, 7.6, 8.3));
  if (s > 7.6) {
    const lg = img('ui/logo-hdr'); const lw = 560, lh = lw * lg.height / lg.width;
    ctx.save(); ctx.translate(W / 2, 1690); ctx.scale(lp, lp);
    ctx.shadowColor = 'rgba(0,0,20,0.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    ctx.fillStyle = 'rgba(255,250,240,0.97)'; rrect(ctx, -lw / 2 - 30, -lh / 2 - 22, lw + 60, lh + 44, 40); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = goldGrad(ctx, -lw / 2, -lh / 2, lw, lh); ctx.lineWidth = 5; rrect(ctx, -lw / 2 - 27, -lh / 2 - 19, lw + 54, lh + 38, 38); ctx.stroke();
    ctx.drawImage(lg, -lw / 2, -lh / 2, lw, lh); ctx.restore();
  }
  stars(ctx, t, 30, 77, [0, 0, W, H], 1.4);
  // final fade
  ctx.fillStyle = `rgba(2,5,22,${ease.in(prog(t, b - 0.5, b))})`; ctx.fillRect(0, 0, W, H);
}

/* ================= VIDEO 1 — the whole kit (the master storyboard) ================= */
const v1 = {
  id: 'v1', name: 'chanukah-world-full-kit', title: 'כל עולם החנוכה – הערכה המלאה', audio: 'v1', theme: 'night',
  cuts: [5, 13, 23, 33, 44, 53, 61],
  draw(ctx, t, S) {
    const c = this.cuts.map(S);
    // S1 hook
    if (t < c[0] + 0.3) {
      const items = [['kit-shared/14', 540, 1030, 640, -0.03, 0.15], ['act/chanukiah', 250, 1420, 400, -0.13, 0.45], ['kit-shared/26', 830, 1440, 400, 0.12, 0.7], [P('pach', 1), 540, 720, 0, 0, 9]];
      items.forEach(([n, x, y, w, r, d], i) => {
        if (!w) return; const p = ease.back(prog(t, d, d + 0.7)); const out = prog(t, c[0] - 0.3, c[0] + 0.3);
        card(ctx, img(n), { x, y: y + float(t, 1, i), w, rot: r, scale: p * (1 + out * 0.4), alpha: clamp(p * 2) * (1 - out), shine: prog(t, d + 0.6, d + 1.6) });
      });
      burst(ctx, t, 0.15, W / 2, 1030, 2);
      caption(ctx, t, 'גננת,\nחנוכה שלך עומד\nלהיראות אחרת!', { a: 0.25, b: 2.75, y: 380, size: 104 });
      caption(ctx, t, 'כל מה שאת צריכה לחנוכה –\nבמקום אחד!', { a: 2.9, b: c[0] - 0.1, y: 380, size: 92 });
    }
    // S2 reveal the world
    if (t >= c[0] - 0.3 && t < c[1] + 0.3) {
      const s = t - c[0];
      const zoomIn = ease.in(prog(t, c[1] - 1.4, c[1]));
      const hp = ease.back(prog(s, 0, 0.8));
      card(ctx, img('ui/hero'), { x: W / 2, y: 960 + zoomIn * 200, w: 1000, scale: hp * (1 + s * 0.012) * (1 + zoomIn * 2.6), alpha: clamp(s / 0.3) * (1 - prog(t, c[1] - 0.25, c[1])), ratio: 0.9, zoom: 1.05 + s * 0.01, glow: 0.8, gold: true, shine: prog(s, 0.7, 1.7) });
      const cp = ease.back(prog(s, 1.0, 1.8)), co = 1 - zoomIn;
      cutout(ctx, img('ui/uri'), { x: 220 - (1 - cp) * 400, y: 1880, h: 720, alpha: co, rot: Math.sin(t * 2) * 0.02 });
      cutout(ctx, img('ui/uriya'), { x: 860 + (1 - cp) * 400, y: 1880, h: 700, alpha: co, rot: -Math.sin(t * 2) * 0.02 });
      caption(ctx, t, 'ברוכה הבאה\nלעולם החנוכה!', { a: c[0] + 0.3, b: c[0] + 3.9, y: 300, size: 108 });
      caption(ctx, t, 'עולם שלם של\nלמידה, חוויה ואור!', { a: c[0] + 4.0, b: c[1] - 0.6, y: 300, size: 100 });
    }
    // S3 richness of content
    if (t >= c[1] && t < c[2] + 0.3) {
      const s = t - c[1]; const mid = c[1] + (c[2] - c[1]) * 0.47;
      if (t < mid + 0.3) {
        const ims = ['kit-shared/3', 'kit-shared/6', 'kit-shared/12', 'kit-shared/14', 'kit-shared/16'].map(img);
        const sp = ease.out(prog(s, 0.2, 2.2)); const o = 1 - prog(t, mid - 0.2, mid + 0.3);
        fan(ctx, ims, { x: W / 2, y: 900, w: 420, spread: 0.17 * sp, radius: 1500, alpha: clamp(s / 0.3) * o, scale: lerp(0.7, 1, sp) });
        chip(ctx, 'דפי תוכן והמחשה', W / 2, 1640, { alpha: clamp((s - 1.2) / 0.3) * o, size: 52 });
      } else {
        deal(ctx, t, ['workbook/2', 'workbook/3', 'workbook/8', 'workbook/12', 'workbook/14', 'workbook/22'], mid, (c[2] - mid - 0.4) / 6, { y: 1030, w: 680 });
        chip(ctx, 'חוברות עבודה בשלוש רמות גיל', W / 2, 1700, { alpha: clamp((t - mid - 0.6) / 0.3), size: 48 });
      }
      caption(ctx, t, 'תוכן לימודי עשיר\nומוכן לגן!', { a: c[1] + 0.3, b: mid - 0.1, y: 310, size: 104 });
      caption(ctx, t, 'בלי להתחיל להכין\nהכול מאפס!', { a: mid + 0.2, b: c[2] - 0.2, y: 310, size: 104 });
    }
    // S4 books and songs
    if (t >= c[2] && t < c[3] + 0.3) {
      const s = t - c[2]; const mid = c[2] + 5.3;
      const bOut = prog(t, mid - 0.2, mid + 0.6);
      book(ctx, t, [1, 2, 3, 6, 7].map((n) => P('pach', n)), c[2] + 0.2, 1.15, { y: lerp(1000, 760, ease.inOut(bOut)), w: 980, scale: lerp(1, 0.78, ease.inOut(bOut)), alpha: clamp(s / 0.3) });
      if (t > mid) {
        SONGS.slice(0, 4).forEach((n, i) => {
          const p = ease.back(prog(t, mid + 0.3 + i * 0.55, mid + 0.8 + i * 0.55));
          chip(ctx, n, W / 2 + (i % 2 ? -150 : 150), 1240 + i * 120 + float(t, 0.4, i), { scale: p, size: 54 });
          musicNote(ctx, W / 2 + (i % 2 ? 210 : -210) + (i % 2 ? -150 : 150) * 1.6, 1235 + i * 120, 32, p);
        });
      }
      caption(ctx, t, 'סיפורים שמכניסים את\nהילדים לאווירת החג', { a: c[2] + 0.3, b: mid - 0.1, y: 300, size: 92 });
      caption(ctx, t, 'ושירים שהופכים\nכל רגע לחוויה!', { a: mid + 0.15, b: c[3] - 0.15, y: 300, size: 100 });
    }
    // S5 games and crafts
    if (t >= c[3] && t < c[4] + 0.3) {
      const mid = c[3] + 6.2;
      if (t < mid + 0.2) gameShow(ctx, t, ['bingo', 'letters', 'diff', 'puzzle', 'seek'], c[3] + 0.1, 1.22, { y: 980, w: 1000 });
      else {
        const crafts = ['act/chanukiah', 'act/keter-mixed', 'act/sevivon', 'act/kad'];
        slideshow(ctx, t, crafts, mid, (c[4] - mid) / 4, { y: 1010, w: 820 });
      }
      caption(ctx, t, 'משחקים • יצירות • פעילויות', { a: c[3] + 0.2, b: mid - 0.1, y: 300, size: 84 });
      caption(ctx, t, 'כל כך הרבה דרכים\nללמוד וליהנות!', { a: mid + 0.1, b: c[4] - 0.2, y: 300, size: 100 });
    }
    // S6 party kit
    if (t >= c[4] && t < c[5] + 0.3) {
      const order = [1, 4, 7, 5, 3];
      const step = (c[5] - c[4]) / order.length; const i = clamp(Math.floor((t - c[4]) / step), 0, order.length - 1), lt = t - c[4] - i * step;
      const sl = ease.inOut(clamp(lt / 0.55));
      if (i > 0) card(ctx, img('party/backdrop-' + order[i - 1]), { x: W / 2 - sl * W, y: 1000, w: 1000, rot: -0.03 * sl, alpha: 1 - sl * 0.6 });
      card(ctx, img('party/backdrop-' + order[i]), { x: W / 2 + (1 - sl) * W * (i ? 1 : 0), y: 1000 + float(t, 0.4), w: 1000, scale: i ? 1 : ease.back(prog(t, c[4], c[4] + 0.7)), glow: 0.7, shine: prog(lt, 0.5, 1.4), ratio: 0.62, zoom: 1 + lt * 0.03 });
      chip(ctx, 'רקעים למסיבה – להדפסה בכל גודל', W / 2, 1460, { size: 48, alpha: clamp((t - c[4] - 0.8) / 0.3) });
      caption(ctx, t, 'ואפילו מסיבת החנוכה\nכבר מחכה לך!', { a: c[4] + 0.3, b: c[5] - 0.2, y: 320, size: 100 });
      burst(ctx, t, c[4] + 0.2, W / 2, 1000, 9);
    }
    // S7 three tracks
    if (t >= c[5] && t < c[6] + 0.3) {
      const s = t - c[5];
      const p1 = ease.back(prog(s, 0.2, 0.9)), p2 = ease.back(prog(s, 0.6, 1.3)), p3 = ease.back(prog(s, 1.0, 1.7));
      card(ctx, img(P('uri', 1)), { x: 790, y: 830 + float(t, 0.5), w: 400, scale: p1, rot: 0.04, shine: prog(s, 1, 2) });
      chip(ctx, 'לבנים', 790, 1150, { scale: p1, size: 56 });
      card(ctx, img(P('oriya', 1)), { x: 290, y: 830 + float(t, 0.5, 2), w: 400, scale: p2, rot: -0.04, shine: prog(s, 1.4, 2.4) });
      chip(ctx, 'לבנות', 290, 1150, { scale: p2, size: 56 });
      card(ctx, img(P('pach', 1)), { x: W / 2, y: 1440 + float(t, 0.5, 4), w: 660, scale: p3, shine: prog(s, 1.8, 2.8) });
      chip(ctx, 'לגן מעורב', W / 2, 1715, { scale: p3, size: 56 });
      caption(ctx, t, 'לבנים • לבנות • לגן מעורב', { a: c[5] + 0.2, b: c[5] + 3.9, y: 330, size: 84 });
      caption(ctx, t, 'מעטפת חנוכה שלמה –\nבאתר אחד!', { a: c[5] + 4.0, b: c[6] - 0.15, y: 330, size: 98 });
    }
    if (t >= c[6]) outro(ctx, t, c[6], this.dur, ['במקום שעות\nשל הכנות...', 'יותר זמן לילדים.\nיותר חוויות. יותר אור!']);
  },
};

/* ================= VIDEO 2 — stories & songs ================= */
const v2 = {
  id: 'v2', name: 'chanukah-world-stories-songs', title: 'סיפורים ושירים', audio: 'v2', theme: 'dusk',
  cuts: [6.4, 22, 31, 40, 51],
  draw(ctx, t, S) {
    const c = this.cuts.map(S);
    if (t < c[0] + 0.3) {
      const p = ease.out(prog(t, 0.2, 2.6)); const out = prog(t, c[0] - 0.3, c[0] + 0.3);
      card(ctx, img(P('pach', 1)), { x: W / 2, y: lerp(1500, 1040, p) + float(t, 0.6), w: lerp(600, 960, p), alpha: clamp(t / 0.6) * (1 - out), glow: 1.2, shine: prog(t, 2.2, 3.4) });
      cutout(ctx, img('z/chanukiah-m'), { x: W / 2, y: 1760, h: 260, alpha: clamp((t - 1.5) / 0.6) * (1 - out), glow: 1.4 });
      caption(ctx, t, 'יש סיפור שהילדים\nיבקשו לשמוע שוב ושוב...', { a: 0.6, b: c[0] - 0.15, y: 360, size: 92, style: 'cream' });
    }
    if (t >= c[0] && t < c[1] + 0.3) {
      const pages = [1, 2, 3, 4, 5, 6, 7, 8, 10].map((n) => P('pach', n));
      book(ctx, t, pages, c[0], (c[1] - c[0]) / pages.length, { y: 1010, w: 1000, alpha: clamp((t - c[0]) / 0.3) * (1 - prog(t, c[1] - 0.2, c[1] + 0.3)) });
      caption(ctx, t, '״פך השמן הקטן״', { a: c[0] + 0.3, b: c[0] + 7, y: 330, size: 112 });
      caption(ctx, t, 'ספר מאויר\nלדפדוף ולהדפסה', { a: c[0] + 7.2, b: c[1] - 0.2, y: 330, size: 100 });
      chip(ctx, 'סיפור חנוכה עם אורי ואוריה', W / 2, 1520, { size: 48, alpha: vis(t, c[0] + 0.8, c[1] - 0.1) });
    }
    if (t >= c[1] && t < c[2] + 0.3) {
      const mid = (c[1] + c[2]) / 2;
      if (t < mid + 0.2) book(ctx, t, [1, 2, 3, 4].map((n) => P('uri', n)), c[1], (mid - c[1]) / 4, { y: 1030, w: 760, alpha: clamp((t - c[1]) / 0.3) });
      else book(ctx, t, [1, 2, 3, 4].map((n) => P('oriya', n)), mid, (c[2] - mid) / 4, { y: 1030, w: 760 });
      flash(ctx, t, mid, 0.8);
      caption(ctx, t, '״האור של אורי״\nלבנים', { a: c[1] + 0.3, b: mid - 0.15, y: 300, size: 100 });
      caption(ctx, t, '״האור של אוריה״\nלבנות', { a: mid + 0.15, b: c[2] - 0.15, y: 300, size: 100 });
      chip(ctx, 'לכל מסלול – ספר משלו', W / 2, 1640, { size: 50, alpha: vis(t, c[1] + 0.7, c[2] - 0.1) });
    }
    if (t >= c[2] && t < c[3] + 0.3) {
      const s = t - c[2]; const p = ease.back(prog(s, 0, 0.7));
      const h = tablet(ctx, img(P('pach', 8)), { x: W / 2, y: 940 + float(t, 0.5), w: 1000, scale: lerp(0.6, 1, p), alpha: clamp(s / 0.3) });
      // play badge (the site offers a video of each book)
      const pp = 1 + 0.06 * Math.sin(t * 6);
      ctx.save(); ctx.translate(W / 2, 940); ctx.scale(pp, pp); ctx.globalAlpha = clamp((s - 0.8) / 0.4) * (1 - prog(s, 3.5, 4));
      ctx.fillStyle = 'rgba(255,250,240,0.92)'; ctx.beginPath(); ctx.arc(0, 0, 80, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#d0408a'; ctx.beginPath(); ctx.moveTo(-26, -40); ctx.lineTo(44, 0); ctx.lineTo(-26, 40); ctx.closePath(); ctx.fill(); ctx.restore();
      eq(ctx, t, W / 2, 1520, 760, 160, this.beats);
      caption(ctx, t, 'כל ספר מגיע גם\nכסרטון וכסיפור שמע', { a: c[2] + 0.3, b: c[3] - 0.15, y: 320, size: 96 });
      chip(ctx, 'להאזנה בגן ולהורדה', W / 2, 1650, { size: 50, alpha: vis(t, c[2] + 1, c[3] - 0.1) });
    }
    if (t >= c[3] && t < c[4] + 0.3) {
      const s = t - c[3]; const step = (c[4] - c[3] - 2.2) / SONGS.length;
      SONGS.forEach((n, i) => {
        const p = ease.back(prog(s, 1.2 + i * step, 1.7 + i * step));
        chip(ctx, n, W / 2, 640 + i * 150 + float(t, 0.3, i), { scale: p, size: 60 });
        musicNote(ctx, 150 + (i % 2) * 780, 640 + i * 150, 34, p * (0.6 + 0.4 * Math.sin(t * 4 + i)));
      });
      const bob = Math.abs(Math.sin(t * Math.PI * 136 / 60)) * 18;
      cutout(ctx, img('ui/uri'), { x: 830, y: 1900 - bob, h: 560, alpha: clamp(s / 0.5) });
      cutout(ctx, img('ui/uriya'), { x: 250, y: 1900 - (18 - bob), h: 540, alpha: clamp(s / 0.5) });
      eq(ctx, t, W / 2, 1720, 300, 170, this.beats);
      caption(ctx, t, '5 שירים מקוריים\nשל חני לי', { a: c[3] + 0.2, b: c[4] - 0.15, y: 320, size: 104 });
    }
    if (t >= c[4]) outro(ctx, t, c[4], this.dur, ['סיפורים, שירים\nוחוויה אחת שלמה', 'הכול מוכן –\nרק ללחוץ ולהתחיל!']);
  },
};

/* ================= VIDEO 3 — on-screen games ================= */
const v3 = {
  id: 'v3', name: 'chanukah-world-games', title: 'משחקים על המסך', audio: 'v3', theme: 'royal',
  cuts: [5.6, 30.5, 40.5, 50.5, 56.5],
  draw(ctx, t, S) {
    const c = this.cuts.map(S);
    if (t < c[0] + 0.3) {
      const n = Math.round(ease.out(prog(t, 0.4, 2.6)) * 23); const out = prog(t, c[0] - 0.3, c[0] + 0.3);
      const keys = Object.keys(GAMES);
      keys.slice(0, 10).forEach((k, i) => {
        const a = i / 10 * 6.283 + t * 0.35; const r = 420 + 30 * Math.sin(t + i);
        card(ctx, img('play/' + k), { x: W / 2 + Math.cos(a) * r, y: 1000 + Math.sin(a) * r * 1.25, w: 330, rot: Math.cos(a) * 0.15, border: 6, alpha: clamp((t - 0.2 - i * 0.08) / 0.4) * (1 - out) * 0.95 });
      });
      ctx.save(); ctx.globalAlpha = 1 - out; ctx.font = `700 ${430}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const k = 1 + 0.05 * Math.sin(t * 6) * prog(t, 2.6, 3);
      ctx.translate(W / 2, 1000); ctx.scale(k, k);
      ctx.lineJoin = 'round'; ctx.lineWidth = 50; ctx.strokeStyle = 'rgba(6,14,52,0.95)'; ctx.strokeText(String(n), 0, 0);
      ctx.shadowColor = 'rgba(255,190,70,0.9)'; ctx.shadowBlur = 80; ctx.fillStyle = goldGrad(ctx, -200, -200, 400, 400); ctx.fillText(String(n), 0, 0); ctx.restore();
      burst(ctx, t, 2.6, W / 2, 1000, 5, 1.3);
      caption(ctx, t, 'משחקים דיגיטליים\nעל המסך!', { a: 0.4, b: c[0] - 0.15, y: 330, size: 104 });
      caption(ctx, t, 'הילדים יתלהבו!', { a: 2.8, b: c[0] - 0.15, y: 1640, size: 96, style: 'cream' });
    }
    if (t >= c[0] && t < c[1] + 0.3) {
      const keys = ['bingo', 'letters', 'diff', 'puzzle', 'memory', 'count', 'build', 'seek', 'maze', 'shadow', 'shapes', 'numbers', 'initial', 'pattern', 'missing', 'jugs', 'belongs', 'colors', 'sequence'];
      gameShow(ctx, t, keys, c[0], (c[1] - c[0]) / keys.length, { y: 1000, w: 1010 });
      const t1 = c[0] + (c[1] - c[0]) / 3, t2 = c[0] + 2 * (c[1] - c[0]) / 3;
      caption(ctx, t, 'לומדים דרך משחק', { a: c[0] + 0.2, b: t1 - 0.1, y: 330, size: 104 });
      caption(ctx, t, 'אותיות • מספרים • צורות', { a: t1 + 0.1, b: t2 - 0.1, y: 330, size: 88 });
      caption(ctx, t, 'זיכרון • ריכוז • חשיבה', { a: t2 + 0.1, b: c[1] - 0.15, y: 330, size: 92 });
    }
    if (t >= c[1] && t < c[2] + 0.3) {
      const s = t - c[1]; const keys = Object.keys(GAMES);
      const z = lerp(2.6, 0.92, ease.inOut(prog(s, 0, 3.2)));
      ctx.save(); ctx.translate(W / 2, 1050); ctx.rotate(-0.08 * (1 - prog(s, 0, 3.2)) + 0.02); ctx.scale(z, z);
      const cw = 320, chh = cw * 0.625, gap = 18;
      keys.forEach((k, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const x = (col - 1) * (cw + gap), y = (row - 3.5) * (chh + gap);
        const pop = ease.back(prog(s, 0.1 + i * 0.05, 0.5 + i * 0.05));
        card(ctx, img('play/' + k), { x, y, w: cw, border: 5, radius: 12, scale: pop, shadow: 0.6, shine: prog(s, 3 + (i % 6) * 0.15, 4 + (i % 6) * 0.15) });
      });
      ctx.restore();
      ctx.fillStyle = `rgba(4,10,40,${0.45 * prog(s, 3.2, 3.8)})`; ctx.fillRect(0, 0, W, H);
      caption(ctx, t, '3 רמות קושי\nבכל משחק', { a: c[1] + 3.3, b: c[1] + 6.4, y: 960, size: 120, pill: true });
      caption(ctx, t, 'גם למשחק קבוצתי\nמול המסך', { a: c[1] + 6.5, b: c[2] - 0.15, y: 960, size: 108, pill: true });
    }
    if (t >= c[2] && t < c[3] + 0.3) {
      const s = t - c[2];
      const ims = ['games/1', 'games/3', 'games/4', 'games/5'].map(img);
      const sp = ease.out(prog(s, 0.2, 2));
      fan(ctx, ims, { x: W / 2, y: 940, w: 480, spread: 0.2 * sp, radius: 1700, alpha: clamp(s / 0.3), scale: lerp(0.7, 1, sp) });
      chip(ctx, 'משחק יחד בחנוכה – להדפסה', W / 2, 1640, { size: 50, alpha: vis(t, c[2] + 1.2, c[3]) });
      caption(ctx, t, 'וגם משחקים להדפסה –\nלשחק יחד בגן!', { a: c[2] + 0.3, b: c[3] - 0.15, y: 320, size: 96 });
    }
    if (t >= c[3] && t < c[4] + 0.3) {
      const s = t - c[3];
      ['memory', 'bingo', 'puzzle', 'seek'].forEach((k, i) => {
        const a = i / 4 * 6.283 + s * 0.6; const p = ease.back(prog(s, i * 0.15, 0.6 + i * 0.15));
        tablet(ctx, img('play/' + k), { x: W / 2 + Math.cos(a) * 330, y: 820 + Math.sin(a) * 230, w: 480, scale: p * (0.85 + 0.15 * Math.sin(a)), rot: Math.cos(a) * 0.08 });
      });
      const bob = Math.abs(Math.sin(t * Math.PI * 96 / 60)) * 22;
      cutout(ctx, img('ui/uri'), { x: 800, y: 1910 - bob, h: 620, alpha: clamp(s / 0.4) });
      cutout(ctx, img('ui/uriya'), { x: 280, y: 1910 - (22 - bob), h: 600, alpha: clamp(s / 0.4) });
      caption(ctx, t, 'הילדים לומדים\nבלי לשים לב!', { a: c[3] + 0.2, b: c[4] - 0.15, y: 300, size: 104 });
    }
    if (t >= c[4]) outro(ctx, t, c[4], this.dur, ['פחות שעות הכנה...', 'יותר זמן ליהנות\nעם הילדים!']);
  },
};

/* ================= VIDEO 4 — ready to print ================= */
const v4 = {
  id: 'v4', name: 'chanukah-world-ready-to-print', title: 'הכול מוכן להדפסה', audio: 'v4', theme: 'night',
  cuts: [6, 20, 34, 41, 55, 61],
  draw(ctx, t, S) {
    const c = this.cuts.map(S);
    if (t < c[0] + 0.3) {
      const out = prog(t, c[0] - 0.3, c[0] + 0.3);
      const p = ease.back(prog(t, 3.0, 3.7));
      card(ctx, img('workbook/1'), { x: W / 2, y: 1060 + float(t, 0.6), w: 700, scale: p * (1 + out * 0.3), alpha: clamp((t - 3) / 0.2) * (1 - out), rot: -0.03, glow: 1, shine: prog(t, 3.6, 4.6) });
      burst(ctx, t, 3.05, W / 2, 1060, 8, 1.2);
      if (t < 3.1) { const k = clamp(t / 0.5); cutout(ctx, img('z/jug'), { x: W / 2, y: 1250, h: 420 * k, alpha: k * (1 - prog(t, 2.6, 3.0)), glow: 1.4 }); }
      caption(ctx, t, 'גננת, כמה שעות\nאת מכינה לחנוכה?', { a: 0.3, b: 2.9, y: 360, size: 100, style: 'cream' });
      caption(ctx, t, 'הפעם –\nהכול כבר מוכן!', { a: 3.05, b: c[0] - 0.15, y: 360, size: 112 });
    }
    if (t >= c[0] && t < c[1] + 0.3) {
      const pages = ['workbook/2', 'workbook/3', 'workbook/5', 'workbook/6', 'workbook/8', 'workbook/11', 'workbook/13', 'workbook/17', 'workbook/19', 'workbook/22'];
      deal(ctx, t, pages, c[0], (c[1] - c[0] - 0.8) / pages.length, { y: 1040, w: 700, seed: 9 });
      const mid = c[0] + 6.6;
      caption(ctx, t, 'חוברות עבודה\nבשלוש רמות גיל', { a: c[0] + 0.3, b: mid - 0.1, y: 300, size: 104 });
      ['צעירים 3–4', 'בינוניים 4–5', 'בוגרים 5–6'].forEach((l, i) => chip(ctx, l, W / 2, 250 + i * 110, { size: 56, scale: ease.back(prog(t, mid + i * 0.4, mid + 0.5 + i * 0.4)) * (1 - prog(t, c[1] - 0.3, c[1])) }));
    }
    if (t >= c[1] && t < c[2] + 0.3) {
      const ims = ['kit-shared/1', 'kit-shared/3', 'kit-shared/4', 'kit-shared/9', 'kit-shared/12', 'kit-shared/13', 'kit-shared/14', 'kit-shared/15', 'kit-shared/16', 'kit-shared/29'];
      slideshow(ctx, t, ims, c[1], (c[2] - c[1]) / ims.length, { y: 1060, w: 820 });
      const mid = (c[1] + c[2]) / 2;
      caption(ctx, t, 'דפי תוכן והמחשה\nלסיפור החג', { a: c[1] + 0.3, b: mid - 0.1, y: 300, size: 104 });
      caption(ctx, t, 'סיפור החנוכה –\nתמונה אחר תמונה', { a: mid + 0.1, b: c[2] - 0.15, y: 300, size: 100 });
    }
    if (t >= c[2] && t < c[3] + 0.3) {
      const s = t - c[2];
      const ks = [25, 26, 27, 28, 29, 31, 32, 33, 34];
      ks.forEach((k, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const p = ease.back(prog(s, 0.15 + i * 0.32, 0.6 + i * 0.32));
        card(ctx, img('kit-shared/' + k), { x: W / 2 + (1 - col) * 320, y: 720 + row * 430 + float(t, 0.3, i), w: 300, border: 7, radius: 14, scale: p, rot: (col - 1) * 0.03, shine: prog(s, 3.5 + i * 0.1, 4.5 + i * 0.1) });
      });
      caption(ctx, t, 'כרטיסי המחשה\nצבעוניים', { a: c[2] + 0.2, b: c[3] - 0.15, y: 280, size: 100 });
    }
    if (t >= c[3] && t < c[4] + 0.3) {
      const crafts = ['act/chanukiah', 'act/keter-mixed', 'act/sevivon', 'act/kad', 'act/misgeret', 'act/orbi', 'act/shirshert', 'act/sefron', 'act/tmuna', 'act/puzzle'];
      slideshow(ctx, t, crafts, c[3], (c[4] - c[3]) / crafts.length, { y: 1040, w: 840 });
      const mid = (c[3] + c[4]) / 2;
      caption(ctx, t, 'יוצרים ומאירים –\nיצירות לגן', { a: c[3] + 0.3, b: mid - 0.1, y: 300, size: 104 });
      caption(ctx, t, 'וגם קישוטים\nשמאירים את הגן!', { a: mid + 0.1, b: c[4] - 0.15, y: 300, size: 104 });
    }
    if (t >= c[4] && t < c[5] + 0.3) {
      const s = t - c[4];
      const pairs = [['kit-shared/20', 'workbook/7'], ['kit-shared/21', 'workbook/8']];
      const k = 0; const ls = s;
      const p1 = ease.back(prog(ls, 0.1, 0.6)), p2 = ease.back(prog(ls, 0.4, 0.9));
      card(ctx, img(pairs[k][0]), { x: 780, y: 1010, w: 470, rot: 0.04, scale: p1 });
      card(ctx, img(pairs[k][1]), { x: 300, y: 1010, w: 470, rot: -0.04, scale: p2 });
      chip(ctx, 'צבעוני', 780, 1400, { scale: p1, size: 52 });
      chip(ctx, 'שחור-לבן', 300, 1400, { scale: p2, size: 52 });
      caption(ctx, t, 'הכול כ־PDF להדפסה', { a: c[4] + 0.2, b: c[5] - 0.15, y: 320, size: 100 });
      caption(ctx, t, 'רבים מהקבצים –\nבצבע וגם בשחור-לבן', { a: c[4] + 0.6, b: c[5] - 0.15, y: 1640, size: 78, style: 'cream' });
    }
    if (t >= c[5]) outro(ctx, t, c[5], this.dur, ['במקום שעות\nשל הכנות...', 'מדפיסים –\nומתחילים לחגוג!']);
  },
};

/* ================= VIDEO 5 — party & three tracks ================= */
const v5 = {
  id: 'v5', name: 'chanukah-world-party-tracks', title: 'מסיבה ושלושה מסלולים', audio: 'v5', theme: 'royal',
  cuts: [5.5, 19, 27, 35, 52],
  draw(ctx, t, S) {
    const c = this.cuts.map(S);
    const coverflow = (list, a, b, y) => {
      const step = (b - a) / list.length; const f = clamp((t - a) / step, 0, list.length - 1);
      const base = Math.floor(f), fr = ease.inOut(clamp((f - base) / 0.35));
      for (let d = 2; d >= -2; d--) {
        for (const j of [base + d]) {
          if (j < 0 || j >= list.length) continue;
          const pos = j - base - fr; const ap = Math.abs(pos);
          if (ap > 1.6) continue;
          card(ctx, img(list[j]), { x: W / 2 + pos * 760, y: y + ap * 60, w: 960, scale: 1 - ap * 0.28, alpha: 1 - ap * 0.45, rot: pos * 0.06, glow: ap < 0.3 ? 0.8 : 0, shine: ap < 0.2 ? prog(t, a + j * step + 0.3, a + j * step + 1.2) : -1 });
        }
      }
    };
    if (t < c[0] + 0.3) {
      const out = prog(t, c[0] - 0.3, c[0] + 0.3);
      card(ctx, img('party/backdrop-4'), { x: W / 2, y: 1020 + float(t, 0.6), w: 1000, scale: ease.back(prog(t, 0.1, 0.8)) * (1 + t * 0.02), alpha: 1 - out, glow: 1, ratio: 0.75, zoom: 1.1 + t * 0.02, shine: prog(t, 0.8, 1.8) });
      burst(ctx, t, 0.3, W / 2, 1020, 4, 1.2); burst(ctx, t, 2.4, 300, 800, 6); burst(ctx, t, 3.6, 800, 1300, 7);
      caption(ctx, t, 'מסיבת החנוכה\nשל הגן כבר מוכנה!', { a: 0.3, b: c[0] - 0.15, y: 340, size: 100 });
    }
    if (t >= c[0] && t < c[1] + 0.3) {
      coverflow([1, 2, 3, 4, 5, 6, 7].map((n) => 'party/backdrop-' + n), c[0], c[1], 1000);
      const mid = c[0] + 6.4;
      caption(ctx, t, '7 רקעים\nלמסיבת חנוכה', { a: c[0] + 0.3, b: mid - 0.1, y: 330, size: 108 });
      caption(ctx, t, 'להדפסה בכל גודל –\nאפילו עד 3 מטר!', { a: mid + 0.1, b: c[1] - 0.15, y: 330, size: 100 });
    }
    if (t >= c[1] && t < c[2] + 0.3) {
      const s = t - c[1];
      card(ctx, img('party/ani-haor'), { x: W / 2, y: 1010 + float(t, 0.5), w: 1000, scale: ease.back(prog(s, 0, 0.7)) * (1 + s * 0.012), glow: 1, gold: true, shine: prog(s, 0.8, 1.8) });
      caption(ctx, t, 'מסגרת ״אני האור״\nעם תמונת הילד', { a: c[1] + 0.3, b: c[2] - 0.15, y: 330, size: 100 });
      chip(ctx, 'מכניסים תמונה – ומדפיסים או שולחים להורים', W / 2, 1530, { size: 42, alpha: vis(t, c[1] + 1, c[2] - 0.1) });
    }
    if (t >= c[2] && t < c[3] + 0.3) {
      gameShow(ctx, t, ['bingo', 'letters', 'missing', 'seek'], c[2], (c[3] - c[2]) / 4, { y: 1000, w: 1010 });
      caption(ctx, t, 'משחקים קבוצתיים\nעל המסך', { a: c[2] + 0.2, b: c[3] - 0.15, y: 320, size: 104 });
    }
    if (t >= c[3] && t < c[4] + 0.3) {
      const seg = (c[4] - c[3]) / 3;
      const tracks = [
        { who: ['ui/uri'], books: [P('uri', 1), P('uri', 3)], cap: '״האור של אורי״\nלבנים' },
        { who: ['ui/uriya'], books: [P('oriya', 1), P('oriya', 3)], cap: '״האור של אוריה״\nלבנות' },
        { who: ['ui/uri', 'ui/uriya'], books: [P('pach', 1), P('pach', 2)], cap: '״האור של אורי ואוריה״\nלגן מעורב' },
      ];
      const i = clamp(Math.floor((t - c[3]) / seg), 0, 2), ls = t - c[3] - i * seg, tr = tracks[i];
      const pin = ease.back(clamp(ls / 0.6)), pout = prog(ls, seg - 0.35, seg);
      const land = i === 2;
      card(ctx, img(tr.books[1]), { x: land ? 560 : 360, y: land ? 1180 : 900, w: land ? 760 : 480, rot: land ? 0.06 : -0.08, scale: pin * (1 - pout * 0.2), alpha: 1 - pout });
      card(ctx, img(tr.books[0]), { x: land ? 520 : 690, y: land ? 820 : 860, w: land ? 800 : 520, rot: land ? -0.04 : 0.05, scale: pin * (1 - pout * 0.2), alpha: 1 - pout, glow: 0.8, shine: prog(ls, 0.6, 1.6) });
      if (tr.who.length === 1) cutout(ctx, img(tr.who[0]), { x: i === 0 ? 820 : 260, y: 1900, h: 640, alpha: 1 - pout, scale: lerp(0.6, 1, pin) });
      else { cutout(ctx, img(tr.who[0]), { x: 830, y: 1900, h: 560, alpha: 1 - pout, scale: lerp(0.6, 1, pin) }); cutout(ctx, img(tr.who[1]), { x: 250, y: 1900, h: 540, alpha: 1 - pout, scale: lerp(0.6, 1, pin) }); }
      flash(ctx, t, c[3] + i * seg, 0.6, 0.35);
      if (i < 2) caption(ctx, t, tr.cap, { a: c[3] + i * seg + 0.2, b: c[3] + (i + 1) * seg - 0.15, y: 300, size: 100 });
      else {
        caption(ctx, t, tr.cap, { a: c[3] + 2 * seg + 0.2, b: c[3] + 2 * seg + seg * 0.55, y: 300, size: 92 });
        caption(ctx, t, 'ברכישה אחת –\nכל שלושת המסלולים!', { a: c[3] + 2 * seg + seg * 0.55 + 0.1, b: c[4] - 0.15, y: 300, size: 96 });
      }
    }
    if (t >= c[4]) outro(ctx, t, c[4], this.dur, ['מסיבה, סיפורים, משחקים\nויצירות – הכול כאן!', 'יותר זמן לילדים.\nיותר חוויות. יותר אור!']);
  },
};

const VIDEOS = { v1, v2, v3, v4, v5 };

/* collect every image a video needs by dry-running its draw over a stub context */
function imagesFor() {
  const all = new Set(['ui/hero', 'ui/logo-hdr', 'ui/uri', 'ui/uriya', 'z/chanukiah-m', 'z/jug', 'party/ani-haor']);
  WALL.forEach((n) => all.add(n));
  Object.keys(GAMES).forEach((k) => all.add('play/' + k));
  for (const b of ['pach', 'uri', 'oriya']) for (let i = 1; i <= 14; i++) all.add(P(b, i));
  for (let i = 1; i <= 7; i++) all.add('party/backdrop-' + i);
  for (let i = 1; i <= 35; i++) all.add('kit-shared/' + i);
  for (let i = 1; i <= 26; i++) all.add('workbook/' + i);
  for (let i = 1; i <= 6; i++) all.add('games/' + i);
  ['chanukiah', 'keter-mixed', 'sevivon', 'kad', 'misgeret', 'orbi', 'shirshert', 'sefron', 'tmuna', 'puzzle'].forEach((n) => all.add('act/' + n));
  return [...all];
}

let CUR = null, SNAP = (x) => x;
async function init(id, beats) {
  CUR = VIDEOS[id]; CUR.beats = beats.beats; CUR.dur = beats.dur;
  SNAP = (x) => { let best = x, bd = 0.3; for (const b of beats.beats) { const d = Math.abs(b - x); if (d < bd) { bd = d; best = b; } } return best; };
  await E.loadImages(imagesFor());
  return { dur: CUR.dur, title: CUR.title, name: CUR.name };
}
function draw(ctx, t) {
  const v = CUR;
  background(ctx, t, v.theme, 0.6);
  v.draw(ctx, t, SNAP);
  dust(ctx, t, 60, 11, 0.8);
  v.cuts.map(SNAP).forEach((c, i) => { flash(ctx, t, c, 0.75); sweep(ctx, t, c - 0.2, 0.9, 0.45); });
  vignette(ctx, 0.5);
  if (t < 0.35) { ctx.fillStyle = `rgba(2,5,22,${1 - t / 0.35})`; ctx.fillRect(0, 0, W, H); }
}
window.ADS = { VIDEOS, init, draw };
})();
