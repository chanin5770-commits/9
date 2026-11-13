/* Video 6: how to use the site (for buyers). Videos 7-8: ads for parents (holiday at home).
   Screens are real mobile screenshots of the site; tap targets come from the live page layout. */
'use strict';
(() => {
const E = window.ENGINE, A = window.ADS, Hh = A.H;
const { W, img, clamp, lerp, prog, ease, card, cutout, caption, chip, burst, flash, phone, highlight, badge, bubble, tap, tablet, wall, stars, rrect, goldGrad } = E;
const { slideshow, gameShow, book, eq, musicNote, vis, float, SONGS, WALL, P } = Hh;
const M = (n) => 'mob/' + n;

/* final card shared by the new videos */
function endCard(ctx, t, a, b, lines, o = {}) {
  const s = t - a;
  wall(ctx, t, WALL, { zoom: lerp(1.1, 0.85, ease.inOut(prog(s, 0, 6))), alpha: 0.28, angle: -0.18, speed: 60 });
  const hp = ease.back(prog(s, 0, 0.8));
  card(ctx, img('ui/hero'), { x: W / 2, y: 1000 + float(t, 0.4), w: 1000, scale: lerp(0.5, 1, hp) + s * 0.006, alpha: clamp(s / 0.35), glow: 0.9, gold: true, shine: prog(s, 0.8, 2) });
  burst(ctx, t, a + 0.15, W / 2, 1000, 31, 1.1);
  const step = (b - a - 0.6) / lines.length;
  lines.forEach((l, i) => caption(ctx, t, l, { a: a + 0.2 + i * step, b: i === lines.length - 1 ? 1e9 : a + (i + 1) * step - 0.05, y: 320, size: l.length > 22 ? 88 : 100, pill: true }));
  if (o.digital) chip(ctx, 'ערכה דיגיטלית – מורידים ומדפיסים בבית', W / 2, 1390, { size: 42, scale: ease.back(prog(s, 0.9, 1.4)) });
  if (o.url !== false) chip(ctx, 'chanili-hanukkah.sites.tab.bot', W / 2, o.digital ? 1500 : 1450, { size: 46, scale: ease.back(prog(s, 0.6, 1.1)), bg: 'rgba(28,47,102,0.94)', fg: '#FFE9A6' });
  const lp = ease.back(prog(s, 1.0, 1.6));
  const lg = img('ui/logo-hdr'); const lw = 520, lh = lw * lg.height / lg.width;
  ctx.save(); ctx.translate(W / 2, 1715); ctx.scale(lp, lp);
  ctx.shadowColor = 'rgba(0,0,20,0.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
  ctx.fillStyle = 'rgba(255,249,242,0.97)'; rrect(ctx, -lw / 2 - 30, -lh / 2 - 20, lw + 60, lh + 40, 40); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = goldGrad(ctx, -lw / 2, -lh / 2, lw, lh); ctx.lineWidth = 5; rrect(ctx, -lw / 2 - 27, -lh / 2 - 17, lw + 54, lh + 34, 38); ctx.stroke();
  ctx.drawImage(lg, -lw / 2, -lh / 2, lw, lh); ctx.restore();
  stars(ctx, t, 30, 77, [0, 0, W, 1920], 1.4);
  ctx.fillStyle = `rgba(2,5,22,${ease.in(prog(t, b - 0.5, b))})`; ctx.fillRect(0, 0, W, 1920);
}

/* ================= VIDEO 6 — how to use the site ================= */
/* each step: screen, scroll keyframes [[t,scroll]], taps [[t, x, y, w, h]] in css px of the 390px-wide page */
const STEPS = [
  { n: 1, title: 'כניסה לאתר', sub: 'מזינים מייל וסיסמה ולוחצים ״כניסה״', scr: [['login', [[0, 0]]]], taps: [[0.9, 33, 352, 324, 63], [2.0, 33, 456, 324, 63], [3.3, 33, 533, 324, 48]] },
  { n: 2, title: 'האזור האישי', sub: 'כאן רואים שכל שלושת המסלולים פתוחים', scr: [['account', [[0, 0], [2.5, 180]]]], taps: [[3.4, 270, 598, 52, 23]] },
  { n: 3, title: 'בוחרים מסלול', sub: 'לבנים, לבנות או לגן מעורב', scr: [['home', [[0, 0], [1.6, 380]]]], taps: [[2.4, 261, 713, 117, 88], [3.6, 12, 713, 117, 88]] },
  { n: 4, title: 'סרגל הקטגוריות', sub: 'סיפורים, שירים, משחקים, יצירות ועוד', scr: [['t_mixed', [[0, 0]]], ['t_mixed_menu', [[0, 0]], 3.4]], taps: [[0.9, 0, 161, 390, 56], [2.6, 168, 9, 44, 44]] },
  { n: 5, title: 'סיפורים', sub: 'ספר מאויר לדפדוף, סרטון וסיפור שמע', scr: [['t_mixed_c_stories', [[0, 0], [1.2, 220]]], ['t_mixed_book_pach', [[0, 0], [5, 330]], 2.6]], taps: [[1.8, 62, 448, 266, 188]] },
  { n: 6, title: 'שירים', sub: 'מאזינים בגן או מורידים קובץ MP3', scr: [['t_mixed_c_audio', [[0, 0], [1.2, 240]]]], taps: [[2.0, 31, 512, 328, 54], [3.5, 199, 584, 160, 40]] },
  { n: 7, title: 'משחקים על המסך', sub: 'בוחרים רמה ולוחצים ״מתחילים!״', scr: [['t_mixed_play_bingo', [[0, 0]]], ['t_mixed_play_bingo_start', [[0, 0]], 3.3]], taps: [[0.9, 51, 694, 288, 66], [2.2, 115, 775, 161, 56], [4.4, 26, 288, 44, 44]] },
  { n: 8, title: 'דפי עבודה על המסך', sub: 'אפשר למלא גם ישירות על המסך', scr: [['t_mixed_ws_wb10', [[0, 0], [5, 300]]]], taps: [] },
  { n: 9, title: 'ספריית ההורדות', sub: 'מחפשים, צופים ומורידים PDF', scr: [['t_mixed_dl', [[0, 0], [1.6, 0], [3.4, 1100]]]], taps: [[0.8, 12, 779, 366, 57], [4.2, 212, 1548, 74, 44]] },
  { n: 10, title: 'מדפיסים', sub: 'מומלץ A4, ב״התאמה לדף״', scr: [['t_mixed_doc_workbook', [[0, 0], [5, 420]]]], taps: [] },
  { n: 11, title: 'מסע החנוכה', sub: '8 תחנות – תחנה לכל יום, ובסוף תעודה', scr: [['t_mixed_c_journey', [[0, 0], [1.2, 150], [2.3, 150], [2.7, 520]]], ['t_mixed_cert', [[0, 0]], 4.0]], taps: [[1.5, 261, 464, 61, 42], [3.0, 133, 1156, 124, 49]] },
  { n: 12, title: 'צריכה עזרה?', sub: 'כפתור ״עזרה ופנייה לחני״ בכל עמוד', scr: [['faq', [[0, 0], [1.6, 1000]]]], taps: [[2.6, 126, 1692, 139, 44]] },
];
function scrollAt(keys, lt) {
  if (lt <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (lt < keys[i][0]) { const p = ease.inOut((lt - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])); return lerp(keys[i - 1][1], keys[i][1], p); }
  return keys[keys.length - 1][1];
}
const v6 = {
  id: 'v6', name: 'chanukah-world-how-to-use', title: 'איך משתמשים באתר', audio: 'v6', theme: 'royal',
  images: STEPS.flatMap((s) => s.scr.map((x) => M(x[0]))),
  get cuts() { const c = [6.2]; const step = (85 - 6.2) / STEPS.length; for (let i = 1; i <= STEPS.length; i++) c.push(6.2 + i * step); return c; },
  draw(ctx, t, S) {
    const c = this.cuts.map(S);
    if (t < c[0] + 0.3) {
      const out = prog(t, c[0] - 0.3, c[0] + 0.3);
      cutout(ctx, img('ui/uri'), { x: 790, y: 1880, h: 760 * ease.back(prog(t, 0.3, 1.1)), alpha: 1 - out });
      cutout(ctx, img('ui/uriya'), { x: 300, y: 1880, h: 740 * ease.back(prog(t, 0.5, 1.3)), alpha: 1 - out });
      burst(ctx, t, 0.3, 300, 700, 3, 1.2); burst(ctx, t, 0.6, 780, 900, 4, 1.2); burst(ctx, t, 1.0, 540, 600, 5, 1.2);
      caption(ctx, t, 'איזה כיף שרכשת!', { a: 0.3, b: 3.0, y: 520, size: 120 });
      caption(ctx, t, 'ברוכה הבאה לעולם החנוכה\nבואי נראה איך משתמשים באתר', { a: 3.1, b: c[0] - 0.15, y: 520, size: 88 });
    }
    STEPS.forEach((st, i) => {
      const a = c[i], b = c[i + 1]; if (t < a - 0.3 || t > b + 0.3) return;
      const lt = t - a, inP = ease.out(prog(t, a - 0.1, a + 0.45)), outP = prog(t, b - 0.25, b + 0.15);
      let k = 0; for (let j = 1; j < st.scr.length; j++) if (lt >= st.scr[j][2]) k = j;
      const [name, keys, from = 0] = st.scr[k];
      const sc = scrollAt(keys, lt - from);
      const x = W / 2 + (1 - inP) * W * 0.9 - outP * W * 0.9, y = 1150 + float(t, 0.4);
      phone(ctx, img(M(name)), { x, y, w: 560, scroll: sc, rot: (1 - inP) * 0.12 - outP * 0.12, overlay: (map, kk) => {
        st.taps.forEach(([tt, bx, by, bw, bh]) => {
          if (lt < tt - 0.05 || lt > tt + 1.3) return;
          const [px, py] = map(bx, by);
          highlight(ctx, lt, tt, px, py, bw * kk, bh * kk);
          tap(ctx, lt, tt + 0.25, px + bw * kk / 2, py + bh * kk / 2);
        });
      } });
      if (k > 0 && lt - st.scr[k][2] < 0.35) flash(ctx, lt, st.scr[k][2], 0.35, 0.3);
      badge(ctx, st.n, W / 2, 205, 62, ease.back(prog(t, a + 0.05, a + 0.5)) * (1 - outP));
      caption(ctx, t, st.title, { a: a + 0.15, b: b - 0.2, y: 345, size: 96 });
      caption(ctx, t, st.sub, { a: a + 0.35, b: b - 0.2, y: 450, size: 54, style: 'body', maxW: 1000 });
    });
    if (t >= c[STEPS.length]) endCard(ctx, t, c[STEPS.length], this.dur, ['זהו, אפשר להתחיל!', 'חנוכה שמח\nומאיר לכולם!']);
  },
};

/* ================= VIDEO 7 — parents, emotional ================= */
function v7draw(ctx, t, S, price) {
  const c = this.cuts.map(S);
  if (t < c[0] + 0.3) {
    const out = prog(t, c[0] - 0.3, c[0] + 0.3);
    ['workbook/18', 'act/keter-mixed', P('pach', 2), 'play/memory'].forEach((n, i) => {
      const a = i / 4 * 6.283 + t * 0.2;
      card(ctx, img(n), { x: W / 2 + Math.cos(a) * 330, y: 1150 + Math.sin(a) * 380, w: 380, rot: Math.cos(a) * 0.1, alpha: 0.45 * clamp(t / 0.8) * (1 - out) });
    });
    ctx.fillStyle = 'rgba(4,10,40,0.35)'; ctx.fillRect(0, 0, W, 1920);
    bubble(ctx, t, 'אמאאא,\nמה עושים היום?', { a: 0.35, b: 2.9, y: 820, size: 104 });
    caption(ctx, t, 'חופשת חנוכה התחילה...\nושוב מחפשים תעסוקה לילדים?', { a: 3.0, b: c[0] - 0.15, y: 900, size: 84, pill: true });
  }
  if (t >= c[0] - 0.2 && t < c[1] + 0.3) {
    const s = t - c[0];
    card(ctx, img('ui/hero'), { x: W / 2, y: 980, w: 1000, scale: ease.back(prog(s, 0, 0.8)) * (1 + s * 0.012), alpha: clamp(s / 0.3) * (1 - prog(t, c[1] - 0.2, c[1] + 0.2)), glow: 1, gold: true, ratio: 0.9, zoom: 1.05 + s * 0.01, shine: prog(s, 0.7, 1.7) });
    const cp = ease.back(prog(s, 0.9, 1.7));
    cutout(ctx, img('ui/uri'), { x: 220 - (1 - cp) * 400, y: 1890, h: 680 });
    cutout(ctx, img('ui/uriya'), { x: 860 + (1 - cp) * 400, y: 1890, h: 660 });
    burst(ctx, t, c[0] + 0.1, W / 2, 980, 12, 1.2);
    caption(ctx, t, 'השנה החופשה\nיכולה להיראות אחרת!', { a: c[0] + 0.25, b: c[0] + 3.0, y: 320, size: 100 });
    caption(ctx, t, 'עולם שלם של חוויות\nמחכה לילדים שלך!', { a: c[0] + 3.1, b: c[1] - 0.15, y: 320, size: 96 });
  }
  if (t >= c[1] && t < c[2] + 0.3) {
    const s = t - c[1]; const mid = c[1] + (c[2] - c[1]) * 0.5;
    if (t < mid + 0.25) {
      phone(ctx, img(M('t_mixed_c_journey')), { x: W / 2, y: 1130 + float(t, 0.4), w: 540, scroll: lerp(0, 200, ease.inOut(prog(s, 0.8, 3.5))), scale: ease.back(prog(s, 0, 0.6)), alpha: 1 - prog(t, mid - 0.2, mid + 0.25) });
      caption(ctx, t, 'בכל יום מגלים\nמשהו חדש!', { a: c[1] + 0.2, b: mid - 0.1, y: 300, size: 100 });
      chip(ctx, 'מסע החנוכה – תחנה לכל יום', W / 2, 470, { size: 46, alpha: vis(t, c[1] + 0.8, mid) });
    } else {
      slideshow(ctx, t, ['act/chanukiah', P('pach', 7), 'workbook/19', 'act/sevivon', 'kit-shared/30'], mid, (c[2] - mid) / 5, { y: 1060, w: 820 });
      caption(ctx, t, 'לומדים, משחקים,\nיוצרים ונהנים!', { a: mid + 0.1, b: c[2] - 0.15, y: 300, size: 100 });
    }
  }
  if (t >= c[2] && t < c[3] + 0.3) {
    const s = t - c[2];
    const items = [['games/1', 290, 760, 400, -0.07], ['games/2', 790, 740, 400, 0.06], ['deeds/1', 540, 1180, 430, 0.0], ['workbook/25', 250, 1500, 380, 0.07], ['act/keter-mixed', 800, 1530, 470, -0.05]];
    items.forEach(([n, x, y, w, r], i) => card(ctx, img(n), { x, y: y + float(t, 1, i), w, rot: r, scale: ease.back(prog(s, 0.15 + i * 0.3, 0.7 + i * 0.3)), shine: prog(s, 2 + i * 0.2, 3 + i * 0.2) }));
    const n3 = (c[3] - c[2]) / 3;
    caption(ctx, t, 'פחות זמן בחיפוש\nאחר רעיונות...', { a: c[2] + 0.2, b: c[2] + n3 - 0.05, y: 300, size: 96, pill: true });
    caption(ctx, t, 'יותר זמן איכות\nעם הילדים!', { a: c[2] + n3 + 0.05, b: c[2] + 2 * n3 - 0.05, y: 300, size: 100, pill: true });
    caption(ctx, t, 'ותוכן חינוכי שמתאים\nלאווירת החג!', { a: c[2] + 2 * n3 + 0.05, b: c[3] - 0.15, y: 300, size: 92, pill: true });
    chip(ctx, 'משחקים יחד בחנוכה – לבית', W / 2, 1830, { size: 44, alpha: vis(t, c[2] + 1.2, c[3]) });
  }
  if (t >= c[3]) endCard(ctx, t, c[3], this.dur, ['כל החוויות\nבמקום אחד!', 'חופשת חנוכה\nמלאה באור!', 'עולם החנוכה של\nChaniLi Studio', price ? 'מחיר מיוחד:\n49 ₪ בלבד!' : 'מורידים, מדפיסים\nומתחילים ליהנות!', 'רוכשים עכשיו\nומתחילים ליהנות!'], { digital: true });
}
const v7base = { audio: 'v7', theme: 'dusk', cuts: [6.3, 12.3, 24.3, 36.7], images: [M('t_mixed_c_journey'), 'games/2', 'deeds/1', 'workbook/25', 'kit-shared/30'] };
const v7 = Object.assign({ id: 'v7', name: 'parents-what-do-we-do-today', title: 'אמא, מה עושים היום? (בלי מחיר)', draw(ctx, t, S) { v7draw.call(this, ctx, t, S, false); } }, v7base);
const v7p = Object.assign({ id: 'v7p', name: 'parents-what-do-we-do-today-49', title: 'אמא, מה עושים היום? (עם מחיר)', draw(ctx, t, S) { v7draw.call(this, ctx, t, S, true); } }, v7base);

/* ================= VIDEO 8 — parents & kids, energetic ================= */
function v8draw(ctx, t, S, price) {
  const c = this.cuts.map(S);
  if (t < c[0] + 0.3) {
    const out = prog(t, c[0] - 0.3, c[0] + 0.3);
    const flashes = ['act/keter-mixed', 'play/bingo', P('pach', 1), 'kit-shared/30', 'act/sevivon', 'play/puzzle'];
    const step = (c[0] - 0.3) / flashes.length; const i = clamp(Math.floor(t / step), 0, flashes.length - 1), lt = t - i * step;
    card(ctx, img(flashes[i]), { x: W / 2 + (i % 2 ? 40 : -40), y: 1120, w: 760, rot: i % 2 ? 0.06 : -0.06, scale: lerp(1.25, 1, ease.out(clamp(lt / 0.25))), alpha: 1 - out });
    flash(ctx, t, i * step, 0.5, 0.18);
    caption(ctx, t, 'מי אמר שחופשת חנוכה\nחייבת להיות משעממת?!', { a: 0.2, b: c[0] - 0.1, y: 360, size: 92 });
  }
  if (t >= c[0] && t < c[1] + 0.3) {
    const s = t - c[0]; const bob = Math.abs(Math.sin(t * Math.PI * 92 / 60)) * 30;
    card(ctx, img('ui/hero'), { x: W / 2, y: 900, w: 1000, scale: ease.back(prog(s, 0, 0.6)), alpha: 0.95 * (1 - prog(t, c[1] - 0.2, c[1] + 0.2)), glow: 1, ratio: 0.75, zoom: 1.2 + s * 0.03 });
    cutout(ctx, img('ui/uri'), { x: 790, y: 1900 - bob, h: 760 * ease.back(prog(s, 0.2, 0.8)) });
    cutout(ctx, img('ui/uriya'), { x: 290, y: 1900 - (30 - bob), h: 740 * ease.back(prog(s, 0.4, 1.0)) });
    burst(ctx, t, c[0] + 0.1, 540, 900, 41, 1.3);
    caption(ctx, t, 'ברוכים הבאים\nלעולם החנוכה!', { a: c[0] + 0.15, b: c[0] + 2.6, y: 300, size: 104 });
    caption(ctx, t, 'איפה שכל יום\nהוא הרפתקה חדשה!', { a: c[0] + 2.7, b: c[1] - 0.1, y: 300, size: 98 });
  }
  if (t >= c[1] && t < c[2] + 0.3) {
    const words = ['משחקים!', 'יוצרים!', 'מגלים!', 'שרים!', 'ונהנים!'];
    const seg = (c[2] - c[1]) / words.length; const i = clamp(Math.floor((t - c[1]) / seg), 0, 4), a = c[1] + i * seg, ls = t - a;
    if (i === 0) gameShow(ctx, t, ['bingo', 'puzzle', 'seek'], a, seg / 3, { y: 1080, w: 1000, label: false });
    if (i === 1) slideshow(ctx, t, ['act/keter-mixed', 'act/sevivon', 'act/chanukiah'], a, seg / 3, { y: 1080, w: 820 });
    if (i === 2) book(ctx, t, [2, 3, 7, 8].map((n) => P('pach', n)), a, seg / 4, { y: 1080, w: 1000, turn: 0.45 });
    if (i === 3) {
      SONGS.slice(0, 4).forEach((n, j) => chip(ctx, n, W / 2, 820 + j * 140, { size: 58, scale: ease.back(prog(ls, 0.1 + j * 0.25, 0.5 + j * 0.25)) }));
      eq(ctx, t, W / 2, 1620, 760, 180, this.beats);
      musicNote(ctx, 180, 700, 44, 1); musicNote(ctx, 900, 1450, 40, 1);
    }
    if (i === 4) {
      card(ctx, img('games/4'), { x: 330, y: 1080 + float(t), w: 480, rot: -0.07, scale: ease.back(prog(ls, 0, 0.4)) });
      tablet(ctx, img('play/maze'), { x: 740, y: 1180 + float(t, 1, 2), w: 560, rot: 0.06, scale: ease.back(prog(ls, 0.25, 0.65)) });
    }
    flash(ctx, t, a, 0.55, 0.22); burst(ctx, t, a + 0.05, W / 2, 330, 50 + i, 0.8);
    caption(ctx, t, words[i], { a: a + 0.02, b: a + seg - 0.1, y: 330, size: 150 });
  }
  if (t >= c[2] && t < c[3] + 0.3) {
    const s = t - c[2];
    wall(ctx, t, WALL, { zoom: lerp(1.9, 0.62, ease.inOut(prog(s, 0, 4.5))), angle: -0.2, speed: 90 });
    ctx.fillStyle = `rgba(4,10,40,${0.3 * prog(s, 2, 3)})`; ctx.fillRect(0, 0, W, 1920);
    const half = (c[3] - c[2]) / 2;
    caption(ctx, t, 'כל כך הרבה חוויות!', { a: c[2] + 0.2, b: c[2] + half - 0.05, y: 960, size: 112, pill: true });
    caption(ctx, t, 'והכול במקום אחד!', { a: c[2] + half + 0.05, b: c[3] - 0.1, y: 960, size: 112, pill: true });
  }
  if (t >= c[3]) endCard(ctx, t, c[3], this.dur, ['הופכים את חופשת חנוכה\nלחוויה!', price ? 'עולם החנוכה –\nרק 49 ₪!' : 'ערכה דיגיטלית –\nמורידים ומדפיסים!', 'מצטרפים עכשיו!'], { digital: price });
}
const v8base = { audio: 'v8', theme: 'royal', cuts: [4.4, 10.2, 24.0, 31.0], images: ['games/4', 'kit-shared/30'] };
const v8 = Object.assign({ id: 'v8', name: 'parents-holiday-adventure', title: 'חופשת חנוכה הופכת להרפתקה (בלי מחיר)', draw(ctx, t, S) { v8draw.call(this, ctx, t, S, false); } }, v8base);
const v8p = Object.assign({ id: 'v8p', name: 'parents-holiday-adventure-49', title: 'חופשת חנוכה הופכת להרפתקה (עם מחיר)', draw(ctx, t, S) { v8draw.call(this, ctx, t, S, true); } }, v8base);

Object.assign(A.VIDEOS, { v6, v7, v7p, v8, v8p });
})();
