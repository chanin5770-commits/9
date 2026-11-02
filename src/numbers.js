/* ממלכת המספרים — teaser trailer (9:16, 72 s).
 * Edit decision list, on-screen narration titles, overlay (curtain, flashes,
 * sparkles, titles) and the score, all on one clock.
 *
 * Music runs at 120 BPM: one beat = 0.5 s, and every cut sits on a beat. */
(function (global) {
  'use strict';

  const AD = global.AD;
  const N = (AD.NUMBERS = {});
  const W = (N.W = 1080), H = (N.H = 1920);

  N.DUR = 72;
  N.BPM = 120;
  N.BEAT = 60 / N.BPM;

  N.CLIPS = {
    A: 'footage/numbers/a-young-kingdom.mp4',     // title card, 0 and the crown, 1 walks into the light
    B: 'footage/numbers/b-big-kingdom.mp4',       // big kingdom, 10, units -> a ten, 14, tens/units board
    C: 'footage/numbers/c-ten-meets-eleven.mp4',  // gates, 10 meets 11
    D: 'footage/numbers/d-teaser-parade.mp4',     // characters 1–9 parade, golden gate, path to 100
    E: 'footage/numbers/e-products.mp4',          // series, songs, worksheets, games, 19/59/99, 100
  };

  // Edit decision list: [outStart, outEnd, clip, srcIn, srcOut, label]
  // clip 'BLACK' = black frame (under the curtain). Longer slot than source = slow motion.
  N.SHOTS = [
    // 0–8 · the opening: darkness and a royal curtain
    [0.0, 8.0, 'BLACK', 0, 0, 'curtain'],
    // 8–18 · the reveal
    [8.0, 10.0, 'D', 6.85, 7.55, 'the golden gate opens'],
    [10.0, 12.0, 'D', 2.0, 3.6, 'parade 1–5'],
    [12.0, 14.0, 'D', 4.0, 5.9, 'parade 5–0'],
    [14.0, 16.0, 'A', 2.0, 4.0, 'zero and the fallen crown'],
    [16.0, 18.0, 'A', 14.0, 16.6, 'one walks into the light'],
    // 18–35 · for kindergarten teachers
    [18.0, 20.0, 'E', 3.0, 5.0, 'the series'],
    [20.0, 22.0, 'E', 5.0, 7.0, 'a song for every number'],
    [22.0, 24.0, 'B', 22.0, 24.5, 'counting on the tens/units board'],
    [24.0, 26.0, 'B', 13.2, 15.8, 'ten units make a ten'],
    [26.0, 28.0, 'E', 7.0, 9.0, '165 activity pages'],
    [28.0, 30.0, 'E', 9.0, 10.0, 'colouring page'],
    [30.0, 32.5, 'E', 10.0, 11.0, 'printable memory game'],
    [32.5, 35.0, 'E', 11.0, 13.0, 'the phone game'],
    // 35–47 · for parents
    [35.0, 37.5, 'C', 7.0, 9.0, 'ten meets eleven'],
    [37.5, 40.0, 'B', 7.0, 9.5, '"hello children, I am ten!"'],
    [40.0, 42.5, 'C', 16.0, 18.5, 'eleven = a ten and a one'],
    [42.5, 45.0, 'B', 25.0, 28.0, '1 and 4 make fourteen'],
    [45.0, 47.0, 'C', 29.0, 32.0, 'off through the gates together'],
    // 47–62 · the climax: 0 to 100
    [47.0, 48.5, 'A', 4.6, 5.8, 'zero — the first number'],
    [48.5, 49.25, 'D', 2.2, 2.95, 'parade, fast'],
    [49.25, 50.0, 'D', 4.0, 4.75, 'parade, fast'],
    [50.0, 51.0, 'E', 13.0, 14.0, '19 -> 20'],
    [51.0, 52.0, 'D', 8.0, 9.0, '39 -> 40'],
    [52.0, 53.0, 'E', 14.6, 15.6, '99 -> 100'],
    [53.0, 54.5, 'A', 0.0, 1.5, 'the young kingdom'],
    [54.5, 56.0, 'B', 0.0, 1.5, 'the big kingdom'],
    [56.0, 57.0, 'C', 2.0, 3.0, 'the gates'],
    [57.0, 58.0, 'A', 10.0, 11.0, 'one with the crown'],
    [58.0, 59.0, 'B', 17.2, 18.2, 'fourteen'],
    [59.0, 62.0, 'E', 16.0, 17.0, 'one hundred'],
    // 62–72 · the ending
    [62.0, 65.0, 'A', 13.8, 16.6, 'into the light'],
    [65.0, 72.0, 'A', 0.0, 1.7, 'the kingdom title card'],
  ];

  // Flashes over the picture: [time, strength]
  N.FLASHES = [
    [8.0, 0.9], [10.0, 0.25], [14.0, 0.25], [18.0, 0.45], [22.0, 0.2], [26.0, 0.2], [30.0, 0.2],
    [35.0, 0.4], [42.5, 0.2], [47.0, 0.5], [50.0, 0.3], [53.0, 0.4], [54.5, 0.3], [56.0, 0.25],
    [59.0, 0.55], [62.0, 0.3], [65.0, 1.0],
  ];

  // ---------------------------------------------------------------------
  // On-screen narration (the script, word for word)
  //   line  : words rise in one after another   [t0, t1, 'line', text, {y, size}]
  //   punch : one big word/phrase per hit       [t0, t1, 'punch', text, {y, size}]
  //   tag   : gold label above a section        [t0, t1, 'tag', text, {y}]
  // ---------------------------------------------------------------------
  N.TITLES = [
    // opening, over the curtain
    [0.7, 2.75, 'line', 'זו לא עוד ערכה...', { y: 900, size: 92 }],
    [2.85, 4.95, 'line', 'וזו בטח לא סתם עוד חוברת לימוד...', { y: 900, size: 84 }],
    [5.05, 6.15, 'line', 'זה משהו...', { y: 900, size: 104 }],
    [6.15, 7.75, 'punch', 'אחר לגמרי!', { y: 900, size: 150 }],
    // reveal
    [8.15, 10.0, 'hero', 'זו מעטפת שנתית שלמה!', { y: 1470, size: 104 }],
    [10.0, 14.0, 'line', 'עולם קסום שבו המספרים מתעוררים לחיים!', { y: 1530, size: 88 }],
    [14.0, 14.5, 'punch', 'סיפורים', { y: 1560, size: 132 }],
    [14.5, 15.0, 'punch', 'שירים', { y: 1560, size: 132 }],
    [15.0, 15.5, 'punch', 'הרפתקאות', { y: 1560, size: 132 }],
    [15.5, 16.0, 'punch', 'משחקים', { y: 1560, size: 132 }],
    [16.0, 18.0, 'line', 'ולמידה שהופכת לחוויה!', { y: 1560, size: 100 }],
    // for kindergarten teachers
    [18.0, 35.0, 'tag', 'לגננות', { y: 1385 }],
    [18.15, 22.0, 'line', 'שרוצות להפוך כל רגע בגן להזדמנות ללמידה!', { y: 1560, size: 84 }],
    [22.0, 23.0, 'punch', 'במפגש הבוקר', { y: 1560, size: 112 }],
    [23.0, 24.0, 'punch', 'בזמן הארוחה', { y: 1560, size: 112 }],
    [24.0, 25.0, 'punch', 'במעברים', { y: 1560, size: 112 }],
    [25.0, 26.0, 'punch', 'בפעילות בקבוצה', { y: 1560, size: 112 }],
    [26.0, 27.0, 'punch', 'או במשחק חופשי', { y: 1560, size: 112 }],
    [27.0, 29.0, 'line', 'שירים שאפשר להשמיע,', { y: 1560, size: 92 }],
    [29.0, 31.5, 'line', 'סרטונים שהילדים מחכים להם,', { y: 1560, size: 92 }],
    [31.5, 35.0, 'line', 'פעילויות ומשחקים שגורמים להם ללמוד בלי להרגיש!', { y: 1560, size: 84 }],
    // for parents
    [35.0, 47.0, 'tag', 'להורים', { y: 1385 }],
    [35.15, 38.5, 'line', 'שרוצים לתת לילדים שלהם יותר!', { y: 1560, size: 92 }],
    [38.5, 40.5, 'line', 'לא רק להכיר מספרים...', { y: 1560, size: 96 }],
    [40.5, 42.5, 'line', 'אלא להתאהב בהם!', { y: 1560, size: 116 }],
    [42.5, 43.0, 'punch', 'לגלות', { y: 1560, size: 132 }],
    [43.0, 43.5, 'punch', 'לספור', { y: 1560, size: 132 }],
    [43.5, 44.0, 'punch', 'לחשוב', { y: 1560, size: 132 }],
    [44.0, 45.0, 'punch', 'להצליח!', { y: 1560, size: 140 }],
    [45.0, 47.0, 'line', 'ולבקש לשחק שוב ושוב!', { y: 1560, size: 100 }],
    // climax
    [47.0, 50.0, 'line', 'מהמספר הראשון...', { y: 1560, size: 104 }],
    [50.0, 53.0, 'hero', 'ועד מאה!', { y: 1560, size: 150 }],
    [53.0, 54.5, 'punch', 'ממלכת הצעירים', { y: 1560, size: 112 }],
    [54.5, 56.0, 'punch', 'וממלכת הבוגרים!', { y: 1560, size: 112 }],
    [56.0, 57.5, 'line', 'לכל מספר עולם משלו.', { y: 1560, size: 96 }],
    [57.5, 59.0, 'line', 'לכל שלב הרפתקה חדשה.', { y: 1560, size: 96 }],
    [59.0, 59.75, 'punch', 'מעטפת אחת.', { y: 1500, size: 120 }],
    [59.75, 60.5, 'punch', 'שנה שלמה.', { y: 1500, size: 120 }],
    [60.5, 62.0, 'line', 'אינסוף רגעים של גילוי!', { y: 1500, size: 104 }],
    // ending
    [62.2, 65.0, 'line', 'מוכנות להיכנס לעולם שבו לומדים אחרת?', { y: 1520, size: 88 }],
    [66.0, 71.6, 'line', 'בקרוב...', { y: 1450, size: 72 }],
    [66.75, 71.6, 'hero', 'השערים נפתחים!', { y: 1640, size: 108 }],
    [67.5, 71.6, 'studio', 'ChaniLi Studio', { y: 1790 }],
  ];

  // Curtain: closed until CURTAIN_OPEN, fully open at CURTAIN_GONE
  N.CURTAIN_OPEN = 7.8;
  N.CURTAIN_GONE = 8.75;

  // ---------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const inv = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const backOut = (k) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const FONT = 'Heebo, Arial, sans-serif';

  function goldFill(ctx, y, size) {
    const g = ctx.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.5);
    g.addColorStop(0, '#fffbe6');
    g.addColorStop(0.4, '#ffe27a');
    g.addColorStop(0.7, '#ffbe3b');
    g.addColorStop(1, '#e8901c');
    return g;
  }

  // Wrap words into lines no wider than maxW (RTL order is handled when drawing)
  function wrap(ctx, words, maxW) {
    const lines = [];
    let cur = [];
    for (const w of words) {
      const test = cur.concat(w).join(' ');
      if (cur.length && ctx.measureText(test).width > maxW) { lines.push(cur); cur = [w]; } else cur.push(w);
    }
    if (cur.length) lines.push(cur);
    // balance a lonely last word
    if (lines.length > 1 && lines[lines.length - 1].length === 1 && lines[lines.length - 2].length > 2) {
      lines[lines.length - 1].unshift(lines[lines.length - 2].pop());
    }
    return lines;
  }

  // Soft royal-purple glow plate behind the words so they read on any shot
  // Behind the words: a soft glow on the curtain, a royal band over the footage
  // (the band also hides the dialogue captions burned into the clips).
  function plate(ctx, cx, cy, w, h, a) {
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    if (N._t < 8) {
      ctx.translate(cx, cy);
      ctx.scale(w / 2, h / 2);
      const r = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      r.addColorStop(0, 'rgba(30,4,40,0.75)');
      r.addColorStop(1, 'rgba(30,4,40,0)');
      ctx.fillStyle = r;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const hh = h / 2 + 100;
      const g = ctx.createLinearGradient(0, cy - hh, 0, cy + hh);
      g.addColorStop(0, 'rgba(46,10,78,0)');
      g.addColorStop(0.24, 'rgba(46,10,78,0.94)');
      g.addColorStop(0.76, 'rgba(46,10,78,0.94)');
      g.addColorStop(1, 'rgba(46,10,78,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, cy - hh, W, hh * 2);
      // thin gold rules
      ctx.fillStyle = 'rgba(255,205,90,0.85)';
      ctx.fillRect(W * 0.12, cy - hh * 0.62, W * 0.76, 3);
      ctx.fillRect(W * 0.12, cy + hh * 0.62, W * 0.76, 3);
    }
    ctx.restore();
  }

  function crown(ctx, x, y, s, a) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(-50, 26);
    ctx.lineTo(-56, -22);
    ctx.lineTo(-28, 2);
    ctx.lineTo(0, -34);
    ctx.lineTo(28, 2);
    ctx.lineTo(56, -22);
    ctx.lineTo(50, 26);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -34, 0, 26);
    g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, '#ffc93c'); g.addColorStop(1, '#d1861a');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(255,200,80,0.9)';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff5fa2';
    for (const [px, py, r] of [[-56, -22, 6], [0, -34, 7], [56, -22, 6]]) { ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#7b3cff';
    ctx.beginPath(); ctx.arc(0, 12, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function star(ctx, x, y, r, a, rot = 0) {
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = '#fff6d6';
    ctx.shadowColor = 'rgba(255,214,110,1)';
    ctx.shadowBlur = r * 2.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? r * 0.18 : r, ang = (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // titles
  // ---------------------------------------------------------------------
  function drawWords(ctx, t, t0, t1, text, o, style) {
    const size = o.size || 90;
    ctx.font = `800 ${size}px ${FONT}`;
    const words = text.split(' ');
    const lines = wrap(ctx, words, W - 150);
    const lh = size * 1.18;
    const y0 = o.y - ((lines.length - 1) * lh) / 2;
    const fout = 1 - inv(t1 - 0.22, t1, t);
    // plate
    const pw = Math.min(W * 1.15, Math.max(...lines.map((l) => ctx.measureText(l.join(' ')).width)) + 260);
    plate(ctx, W / 2, o.y, pw, lines.length * lh + size * 1.6, inv(t0, t0 + 0.2, t) * fout);
    let k = 0;
    lines.forEach((line, li) => {
      const y = y0 + li * lh;
      const space = ctx.measureText(' ').width;
      const widths = line.map((w) => ctx.measureText(w).width);
      const total = widths.reduce((a, b) => a + b, 0) + space * (line.length - 1);
      let x = W / 2 + total / 2; // RTL: start at the right edge
      line.forEach((w, wi) => {
        const ws = style === 'hero' ? t0 : t0 + k * 0.075;
        k++;
        const p = inv(ws, ws + 0.32, t);
        const a = easeOut(p) * fout;
        const cx = x - widths[wi] / 2;
        x -= widths[wi] + space;
        if (a <= 0.01) return;
        ctx.save();
        ctx.globalAlpha = a;
        const sc = style === 'hero' ? lerp(1.5, 1, backOut(inv(t0, t0 + 0.4, t))) : lerp(0.82, 1, backOut(p));
        const dy = style === 'hero' ? 0 : (1 - easeOut(p)) * 40;
        ctx.translate(style === 'hero' ? W / 2 : cx, y + dy);
        ctx.scale(sc, sc);
        if (style === 'hero') ctx.translate(cx - W / 2, 0);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(120,40,200,0.95)';
        ctx.shadowBlur = 30;
        ctx.lineWidth = size * 0.12;
        ctx.strokeStyle = '#4a1580';
        ctx.strokeText(w, 0, 0);
        ctx.shadowBlur = 0;
        ctx.fillStyle = goldFill(ctx, 0, size);
        ctx.fillText(w, 0, 0);
        ctx.restore();
      });
    });
    // shine sweep across hero words
    if (style === 'hero') {
      const sp = inv(t0 + 0.35, t0 + 1.0, t);
      if (sp > 0 && sp < 1) {
        const sx = lerp(W + 200, -200, sp);
        ctx.save();
        ctx.globalAlpha = 0.5 * fout;
        const g = ctx.createLinearGradient(sx - 90, 0, sx + 90, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,240,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - 90, o.y - size * 0.7, 180, size * 1.4);
        ctx.restore();
      }
    }
  }

  function drawPunch(ctx, t, t0, t1, text, o) {
    const size = o.size || 120;
    const p = inv(t0, t0 + 0.18, t);
    const fout = 1 - inv(t1 - 0.08, t1, t);
    const a = easeOut(p) * fout;
    if (a <= 0.01) return;
    ctx.font = `900 ${size}px ${FONT}`;
    const w = ctx.measureText(text).width;
    plate(ctx, W / 2, o.y, w + 300, size * 2.3, a);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, o.y);
    const sc = lerp(1.55, 1, easeOut(p)) * (1 + 0.04 * inv(t0 + 0.18, t1, t));
    ctx.scale(sc, sc);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255,190,80,0.9)';
    ctx.shadowBlur = 40 * (1 - p) + 18;
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = '#4a1580';
    ctx.strokeText(text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillStyle = goldFill(ctx, 0, size);
    ctx.fillText(text, 0, 0);
    // white hit on the landing
    ctx.globalAlpha = a * (1 - inv(t0, t0 + 0.25, t)) * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 0, 0);
    ctx.restore();
    // sparkles bursting from the word
    for (let i = 0; i < 6; i++) {
      const ang = hash(t0 * 10 + i) * Math.PI * 2, d = 60 + easeOut(inv(t0, t0 + 0.5, t)) * (w / 2 + 90);
      star(ctx, W / 2 + Math.cos(ang) * d, o.y + Math.sin(ang) * d * 0.45, 14, (1 - inv(t0 + 0.1, t0 + 0.55, t)) * a, ang);
    }
  }

  function drawTag(ctx, t, t0, t1, text, o) {
    const a = easeOut(inv(t0, t0 + 0.3, t)) * (1 - inv(t1 - 0.25, t1, t));
    if (a <= 0.01) return;
    ctx.save();
    ctx.font = `800 64px ${FONT}`;
    const w = ctx.measureText(text).width + 120, h = 96;
    const sc = lerp(0.6, 1, backOut(inv(t0, t0 + 0.35, t)));
    ctx.translate(W / 2, o.y);
    ctx.scale(sc, sc);
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#fff0b8'); g.addColorStop(0.5, '#ffc93c'); g.addColorStop(1, '#e09a20');
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#fff8e0';
    ctx.stroke();
    ctx.fillStyle = '#4a1580';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText(text, 0, 4);
    ctx.restore();
    crown(ctx, W / 2, o.y - 82, 0.62 * sc, a);
  }

  function drawStudio(ctx, t, t0, t1, text, o) {
    const a = easeOut(inv(t0, t0 + 0.5, t)) * (1 - inv(t1 - 0.3, t1, t));
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `700 50px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    ctx.shadowColor = 'rgba(60,10,100,0.9)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, W / 2, o.y);
    ctx.restore();
  }

  function drawTitles(ctx, t) {
    for (const [t0, t1, style, text, o = {}] of N.TITLES) {
      if (t < t0 || t > t1) continue;
      ctx.save();
      ctx.direction = 'rtl';
      if (style === 'punch') drawPunch(ctx, t, t0, t1, text, o);
      else if (style === 'tag') drawTag(ctx, t, t0, t1, text, o);
      else if (style === 'studio') drawStudio(ctx, t, t0, t1, text, o);
      else drawWords(ctx, t, t0, t1, text, o, style);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------
  // the royal curtain (0–8.75)
  // ---------------------------------------------------------------------
  let velvet = null;
  function makeVelvet() {
    const c = document.createElement('canvas');
    c.width = W / 2 + 60; c.height = H;
    const g = c.getContext('2d');
    const folds = 7, fw = c.width / folds;
    for (let i = 0; i < folds; i++) {
      const lg = g.createLinearGradient(i * fw, 0, (i + 1) * fw, 0);
      lg.addColorStop(0, '#2a0418');
      lg.addColorStop(0.35, '#7a1438');
      lg.addColorStop(0.55, '#9c2149');
      lg.addColorStop(0.8, '#4c0a26');
      lg.addColorStop(1, '#22030f');
      g.fillStyle = lg;
      g.fillRect(i * fw, 0, fw + 1, H);
    }
    // top shading and bottom gold fringe
    const top = g.createLinearGradient(0, 0, 0, H);
    top.addColorStop(0, 'rgba(0,0,0,0.6)'); top.addColorStop(0.25, 'rgba(0,0,0,0)');
    top.addColorStop(0.8, 'rgba(0,0,0,0)'); top.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = top;
    g.fillRect(0, 0, c.width, H);
    const fr = g.createLinearGradient(0, H - 70, 0, H - 30);
    fr.addColorStop(0, '#ffe08a'); fr.addColorStop(1, '#a8661a');
    g.fillStyle = fr;
    g.fillRect(0, H - 70, c.width, 22);
    for (let x = 0; x < c.width; x += 14) g.fillRect(x, H - 50, 6, 34);
    return c;
  }

  function drawCurtain(ctx, t) {
    if (t > N.CURTAIN_GONE) return;
    if (!velvet) velvet = makeVelvet();
    const open = easeInOut(inv(N.CURTAIN_OPEN, N.CURTAIN_GONE, t));
    const shift = open * (W / 2 + 80);
    // light behind the slit, growing towards the reveal
    const glow = 0.25 + 0.75 * inv(5.0, 7.8, t) + 0.15 * Math.sin(t * 3.1) * (1 - inv(5, 7.8, t));
    ctx.save();
    ctx.fillStyle = '#000';
    if (open < 1) {
      ctx.globalAlpha = 1 - open;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // left half
    ctx.save();
    ctx.translate(-shift, 0);
    ctx.drawImage(velvet, -60, 0);
    ctx.restore();
    // right half (mirrored)
    ctx.save();
    ctx.translate(W + shift, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(velvet, -60, 0);
    ctx.restore();
    // golden valance on top
    const vg = ctx.createLinearGradient(0, 0, 0, 170);
    vg.addColorStop(0, '#3a0620'); vg.addColorStop(0.75, '#7a1438'); vg.addColorStop(1, '#c48a2a');
    ctx.globalAlpha = 1 - open;
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 130);
    for (let i = 6; i >= 0; i--) ctx.quadraticCurveTo(W * (i + 0.5) / 7, 210, W * i / 7, 130);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // the light slit
    const sw = 6 + shift * 2;
    const lg = ctx.createLinearGradient(W / 2 - sw / 2 - 160, 0, W / 2 + sw / 2 + 160, 0);
    lg.addColorStop(0, 'rgba(255,200,90,0)');
    lg.addColorStop(0.5, `rgba(255,232,160,${0.55 * glow * (1 - open)})`);
    lg.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(W / 2 - sw / 2 - 160, 0, sw + 320, H);
    // dim the velvet so the words read, then lift it as the light grows
    ctx.fillStyle = `rgba(0,0,0,${0.45 * (1 - inv(6.5, 7.8, t))})`;
    ctx.fillRect(0, 0, W, H);
    // fade in from black at the very start
    const fin = 1 - inv(0, 0.9, t);
    if (fin > 0) { ctx.fillStyle = `rgba(0,0,0,${fin})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // gold dust and sparkles
  // ---------------------------------------------------------------------
  function sparkleLevel(t) {
    if (t < 8) return 0.5;
    if (t < 18) return 0.8;
    if (t < 47) return 0.35;
    if (t < 62) return 1;
    if (t < 65) return 0.5;
    return 1;
  }
  function drawSparkles(ctx, t) {
    const lvl = sparkleLevel(t);
    const n = 46;
    for (let i = 0; i < n; i++) {
      const life = 2.2 + hash(i) * 2.5, phase = hash(i + 50) * life;
      const cyc = Math.floor((t + phase) / life), k = ((t + phase) % life) / life;
      const x = hash(i * 7 + cyc * 13) * W;
      const y0 = hash(i * 3 + cyc * 17) * H;
      const y = y0 - k * 160;
      const a = Math.sin(k * Math.PI) * lvl * (0.35 + 0.65 * hash(i + cyc));
      if (i % 4 === 0) star(ctx, x, y, 10 + hash(i) * 12, a * 0.9, t * 0.6 + i);
      else {
        ctx.save();
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = '#ffe9a8';
        ctx.shadowColor = 'rgba(255,210,110,1)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, 2 + hash(i + 9) * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------------
  // overlay drawn over the footage (transparent canvas)
  // ---------------------------------------------------------------------
  let vignette = null;
  N.renderOverlay = function (ctx, t) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    N._t = t;
    if (!vignette) {
      vignette = document.createElement('canvas');
      vignette.width = W; vignette.height = H;
      const g = vignette.getContext('2d'), r = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.72);
      r.addColorStop(0, 'rgba(20,0,40,0)');
      r.addColorStop(1, 'rgba(20,0,40,0.5)');
      g.fillStyle = r;
      g.fillRect(0, 0, W, H);
    }
    ctx.drawImage(vignette, 0, 0);

    drawCurtain(ctx, t);
    drawSparkles(ctx, t);

    // the glint across the real logo on the end card
    if (t > 65.4 && t < 67.2) {
      const sp = inv(65.5, 66.6, t), sx = lerp(-260, W + 260, sp);
      ctx.save();
      ctx.globalAlpha = 0.55 * Math.sin(sp * Math.PI);
      ctx.translate(sx, 300);
      ctx.rotate(0.35);
      const g = ctx.createLinearGradient(-70, 0, 70, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,235,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-70, -260, 140, 520);
      ctx.restore();
      star(ctx, W * 0.5, 120, 34 * Math.sin(inv(65.6, 66.6, t) * Math.PI), 1, t);
    }
    // lift the bottom of the end card so the closing words read
    if (t > 65.5) {
      const a = easeOut(inv(65.6, 66.4, t));
      const g = ctx.createLinearGradient(0, H * 0.66, 0, H);
      g.addColorStop(0, 'rgba(38,8,64,0)');
      g.addColorStop(0.35, `rgba(38,8,64,${0.75 * a})`);
      g.addColorStop(1, `rgba(20,2,36,${0.95 * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.66, W, H * 0.34);
    }

    drawTitles(ctx, t);

    // flashes (warm gold-white)
    let fl = 0;
    for (const [t0, k] of N.FLASHES) if (t >= t0) fl = Math.max(fl, k * Math.exp(-(t - t0) * 7));
    if (fl > 0.003) { ctx.fillStyle = `rgba(255,246,222,${fl})`; ctx.fillRect(0, 0, W, H); }
    // the pause before the logo: dip to black
    const dip = inv(64.6, 64.95, t) * (1 - inv(64.95, 65.0, t));
    if (dip > 0) { ctx.fillStyle = `rgba(0,0,0,${dip})`; ctx.fillRect(0, 0, W, H); }
    // fade out
    const fout = inv(N.DUR - 0.8, N.DUR, t);
    if (fout > 0) { ctx.fillStyle = `rgba(0,0,0,${fout})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  };

  // ---------------------------------------------------------------------
  // score + sound design — D minor mystery, opening into D major at the reveal
  // ---------------------------------------------------------------------
  const CHORDS = [
    [0.0, 38, [50, 57, 62, 64]],   // Dm add9 (no 3rd) — darkness
    [4.0, 34, [46, 53, 58, 62]],   // Bb
    [6.0, 33, [45, 52, 57, 61]],   // A — the curtain trembles
    // reveal — D major
    [8.0, 38, [50, 54, 57, 62]],   // D
    [10.0, 45, [52, 57, 61, 64]],  // A
    [12.0, 35, [50, 54, 59, 62]],  // Bm
    [14.0, 43, [50, 55, 59, 62]],  // G
    [16.0, 38, [50, 54, 57, 62]],  // D
    [17.0, 45, [52, 57, 61, 64]],  // A
    // for teachers
    [18.0, 43, [50, 55, 59, 62]],  // G
    [20.0, 38, [50, 54, 57, 62]],  // D
    [22.0, 45, [52, 57, 61, 64]],  // A
    [24.0, 35, [50, 54, 59, 62]],  // Bm
    [26.0, 43, [50, 55, 59, 62]],  // G
    [28.0, 38, [50, 54, 57, 62]],  // D
    [30.0, 45, [52, 57, 61, 64]],  // A
    [32.0, 35, [50, 54, 59, 62]],  // Bm
    [33.0, 43, [50, 55, 59, 62]],  // G
    [34.0, 45, [52, 57, 61, 64]],  // A
    // for parents
    [35.0, 43, [50, 55, 59, 62]],  // G
    [37.0, 38, [50, 54, 57, 62]],  // D
    [39.0, 42, [49, 54, 57, 61]],  // F#m
    [41.0, 35, [50, 54, 59, 62]],  // Bm
    [42.5, 43, [50, 55, 59, 62]],  // G
    [44.0, 45, [52, 57, 61, 64]],  // A
    [45.0, 43, [50, 55, 59, 62]],  // G
    [46.0, 45, [52, 57, 61, 64]],  // A
    // climax
    [47.0, 38, [50, 54, 57, 62]],  // D
    [49.0, 45, [52, 57, 61, 64]],  // A
    [50.0, 35, [50, 54, 59, 62]],  // Bm
    [52.0, 43, [50, 55, 59, 62]],  // G
    [53.0, 38, [50, 54, 57, 62]],  // D
    [54.5, 45, [52, 57, 61, 64]],  // A
    [56.0, 35, [50, 54, 59, 62]],  // Bm
    [57.5, 43, [50, 55, 59, 62]],  // G
    [59.0, 38, [50, 54, 57, 62]],  // D
    [60.5, 45, [52, 57, 61, 64]],  // A — dominant build
    // ending
    [62.0, 43, [50, 55, 59, 64]],  // G add6 — hush
    [63.5, 45, [52, 57, 62, 64]],  // Asus4
    [65.0, 38, [50, 57, 62, 66]],  // D major add9 — the logo
  ];
  const chordAt = (t) => { let c = CHORDS[0]; for (const x of CHORDS) if (x[0] <= t + 1e-6) c = x; return c; };

  // Lead melody [time, midi, beats]
  const MELODY = [
    // reveal theme
    [8.0, 69, 1], [8.5, 74, 2], [9.5, 76, 1],
    [10.0, 78, 1.5], [10.75, 76, 0.5], [11.0, 73, 2],
    [12.0, 74, 1], [12.5, 78, 1], [13.0, 81, 2],
    [14.0, 79, 1.5], [14.75, 78, 0.5], [15.0, 76, 2],
    [16.0, 78, 1], [16.5, 76, 1], [17.0, 76, 1], [17.5, 73, 1],
    // climax — the theme, an octave of energy
    [47.0, 69, 1], [47.5, 74, 2], [48.5, 76, 1],
    [49.0, 78, 2], [50.0, 81, 2], [51.0, 79, 1], [51.5, 78, 1],
    [52.0, 79, 2], [53.0, 81, 1.5], [53.75, 83, 0.5], [54.0, 81, 1],
    [54.5, 76, 3],
    [56.0, 78, 1], [56.5, 81, 1], [57.0, 83, 1], [57.5, 83, 1], [58.0, 81, 1], [58.5, 79, 1],
    [59.0, 78, 1.5], [59.75, 81, 1.5], [60.5, 86, 3],
  ];
  // Music-box melody (bells) [time, midi]
  const BOX = [
    [0.9, 74], [1.25, 77], [1.6, 81], [2.3, 79], [3.0, 74], [3.35, 77], [3.7, 81], [4.4, 82],
    [5.1, 81], [5.45, 79], [5.8, 77], [6.5, 76],
    // teachers: playful pizzicato motif
    ...[18, 20, 26, 28].flatMap((s) => [[s, 81], [s + 0.25, 78], [s + 0.5, 74], [s + 0.75, 78], [s + 1.0, 81], [s + 1.5, 83]]),
    // parents: tender
    [35.5, 78], [36.0, 81], [36.5, 83], [37.0, 81], [38.0, 78], [39.5, 78], [40.0, 81], [40.5, 85], [41.0, 86],
    // ending
    [62.3, 74], [62.65, 78], [63.0, 81], [63.35, 86], [63.9, 85], [64.25, 81],
  ];

  AD.buildNumbersAudio = function (ac, opts = {}) {
    const B = N.BEAT;
    const K = AD.createKit(ac, { ...opts, dur: N.DUR, fadeAt: 70.6, gaps: [[7.7, 8.0], [62.0, 62.25], [64.62, 65.0]] });
    const { at, music, seq, osc, filt, out, crackle, whoosh, riser, ting, metalHit, subDrop, reverseSwell, chargeUp,
      passby, thunder, impact, kick, snare, hat, taiko, bass, pluck, lead, bell, braam } = K;
    const { beat, arpBar, bassBar, hats } = seq(B, chordAt);
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

    // ---------- string pad following the chords, the whole way ----------
    {
      const lp = filt('lowpass', 300, 0.9), g = ac.createGain();
      for (let v = 0; v < 4; v++) {
        for (const det of [-10, 10]) {
          const o = osc('sawtooth', mtof(CHORDS[0][2][v]), 0, N.DUR);
          o.detune.value = det;
          for (const [ct, , voicing] of CHORDS) o.frequency.setTargetAtTime(mtof(voicing[v]), at(ct), 0.04);
          const vg = ac.createGain(); vg.gain.value = 0.15;
          o.connect(vg); vg.connect(lp);
        }
      }
      lp.connect(g); out(g, 0.6, music);
      const f = lp.frequency, p = g.gain;
      f.setValueAtTime(240, at(0));
      f.exponentialRampToValueAtTime(900, at(7.7));
      f.setTargetAtTime(2600, at(8.0), 0.1);
      f.setTargetAtTime(1500, at(18.0), 0.5);
      f.setTargetAtTime(1300, at(35.0), 0.5);
      f.setTargetAtTime(2800, at(47.0), 0.3);
      f.setTargetAtTime(500, at(62.0), 0.1);
      f.setTargetAtTime(1300, at(63.5), 0.5);
      f.setTargetAtTime(3000, at(65.0), 0.1);
      f.setTargetAtTime(1200, at(67.0), 1.5);
      p.setValueAtTime(0.0001, at(0));
      p.exponentialRampToValueAtTime(0.06, at(1.5));
      p.linearRampToValueAtTime(0.1, at(7.7));
      p.setTargetAtTime(0.13, at(8.0), 0.05);
      p.setTargetAtTime(0.08, at(18.0), 0.3);
      p.setTargetAtTime(0.1, at(35.0), 0.4);
      p.setTargetAtTime(0.14, at(47.0), 0.1);
      p.setTargetAtTime(0.07, at(62.25), 0.1);
      p.setTargetAtTime(0.11, at(63.5), 0.5);
      p.setTargetAtTime(0.15, at(65.0), 0.05);
      p.setTargetAtTime(0.08, at(67.0), 1.5);
    }

    // ---------- 0–8: darkness, the curtain ----------
    subDrop(0.2, 0.08, 2.5);
    for (let i = 0; i < 7; i++) { kick(0.5 + i, 0.28 + i * 0.03); kick(0.75 + i, 0.18 + i * 0.02); }   // heartbeat
    bass(0.5, 26, 3.4, 0.06, 180);
    bass(4.0, 22, 2.0, 0.06, 200);
    bass(6.0, 21, 1.7, 0.07, 240);
    whoosh(0.6, 1.3, 200, 2000, 0.08, -0.6, 0.6);
    whoosh(2.75, 1.3, 200, 2200, 0.08, 0.6, -0.6);
    whoosh(4.95, 1.0, 200, 2400, 0.09, -0.6, 0.6);
    impact(6.15, 0.9, 0.55);          // "אחר לגמרי!"
    taiko(6.15, 0.35);
    crackle(5.0, 18, 0.05, 2.5);
    riser(5.4, 2.3, 0.14, 250, 8000);
    for (let i = 0; i < 12; i++) snare(6.6 + i * 0.09, 0.03 + i * 0.012);
    chargeUp(7.7, 1.6, 0.05);
    reverseSwell(8.0, 1.2, 0.2);

    // ---------- 8–18: the reveal — D major, full band ----------
    impact(8.0, 1.6, 1.0);
    braam(8.0, 38, 1.8, 0.13);
    thunder(8.05, 0.1, 2.4);
    metalHit(8.02, 0.22);
    bell(8.0, 74, 0.08); bell(8.0, 78, 0.06); bell(8.0, 81, 0.06);
    for (let s = 8.0; s < 18.0; s += 2) {
      for (let n = 0; n < 4; n++) kick(beat(s, n), 0.48);
      for (const n of [1, 3]) snare(beat(s, n), 0.22);
      bassBar(s, 0.1, 4, 900);
      hats(s, 0.055, 4, 2);
      arpBar(s, 0.04, 4);
    }
    taiko(10.0, 0.3); taiko(12.0, 0.3); taiko(14.0, 0.34); taiko(16.0, 0.3);
    passby(10.0, 0.7, 0.07, 1); passby(12.0, 0.7, 0.07, -1);
    for (const h of [14.0, 14.5, 15.0, 15.5]) { metalHit(h, 0.1, (h - 14.75) * 1.2); ting(h + 0.01, 0.04); }
    impact(16.0, 0.8, 0.45);
    riser(16.6, 1.4, 0.1);
    reverseSwell(18.0, 0.8, 0.14);

    // ---------- 18–35: for teachers — bouncy and bright ----------
    impact(18.0, 0.9, 0.5);
    bell(18.0, 86, 0.05);
    for (let s = 18.0; s < 35.0 - 0.01; s += 2) {
      const len = Math.min(4, (35.0 - s) / B);
      kick(beat(s, 0), 0.42); kick(beat(s, 2), 0.42);
      if (len > 2.5) kick(beat(s, 2.5), 0.25);
      for (const n of [1, 3]) if (n < len) { snare(beat(s, n), 0.13); snare(beat(s, n) + 0.012, 0.08); }   // clap
      hats(s, 0.045, len, 4);
      bassBar(s, 0.08, len, 700);
      if (s >= 22) arpBar(s, 0.03, len);
    }
    for (const h of [22.0, 23.0, 24.0, 25.0, 26.0]) { taiko(h, 0.26); ting(h + 0.01, 0.05); }   // the moments of the day
    whoosh(26.9, 0.6, 400, 2600, 0.06, -0.7, 0.7);
    whoosh(28.9, 0.6, 400, 2600, 0.06, 0.7, -0.7);
    whoosh(31.4, 0.6, 400, 2600, 0.06, -0.7, 0.7);
    riser(33.5, 1.5, 0.1);
    reverseSwell(35.0, 0.8, 0.14);

    // ---------- 35–47: for parents — warm, lifting ----------
    impact(35.0, 0.9, 0.5);
    for (let s = 35.0; s < 42.5 - 0.01; s += 2) {
      const len = Math.min(4, (42.5 - s) / B);
      kick(beat(s, 0), 0.38); if (len > 2) kick(beat(s, 2), 0.32);
      if (len > 1) snare(beat(s, 1), 0.12); if (len > 3) snare(beat(s, 3), 0.12);
      hats(s, 0.04, len, 2);
      bassBar(s, 0.07, len, 600);
    }
    for (const [h, m] of [[38.5, 74], [40.5, 78]]) bell(h, m, 0.05);
    impact(40.5, 0.7, 0.35);
    // "לגלות · לספור · לחשוב · להצליח!" — a hit on each word, then the groove returns
    for (const [h, k] of [[42.5, 0.8], [43.0, 0.85], [43.5, 0.9], [44.0, 1.1]]) {
      impact(h, k, 0.5); taiko(h, 0.32); bell(h, 74 + Math.round((h - 42.5) * 6), 0.05);
    }
    braam(44.0, 45, 0.9, 0.08);
    for (let s = 45.0; s < 47.0; s += 2) {
      for (let n = 0; n < 4; n++) kick(beat(s, n), 0.42);
      for (const n of [1, 3]) snare(beat(s, n), 0.2);
      hats(s, 0.05, 4, 4);
      bassBar(s, 0.09, 4, 900);
      arpBar(s, 0.04, 4);
    }
    riser(45.6, 1.4, 0.13);
    for (let i = 0; i < 8; i++) snare(46.2 + i * 0.1, 0.05 + i * 0.02);
    reverseSwell(47.0, 0.8, 0.18);

    // ---------- 47–62: the climax — 0 to 100 ----------
    impact(47.0, 1.3, 0.8);
    braam(47.0, 38, 1.4, 0.12);
    for (let s = 47.0; s < 62.0 - 0.01; s += 2) {
      const len = Math.min(4, (62.0 - s) / B);
      for (let n = 0; n < len; n++) kick(beat(s, n), 0.5);
      for (const n of [1, 3]) if (n < len) snare(beat(s, n), 0.24);
      hats(s, 0.06, len, 4);
      bassBar(s, 0.11, len, 1200, true);
      arpBar(s, 0.045, len);
    }
    for (const h of [48.5, 49.25, 50.0, 51.0, 52.0, 53.0, 54.5, 56.0, 57.0, 58.0]) { impact(h, 0.6, 0.3); passby(h, 0.5, 0.05, h % 2 ? 1 : -1); }
    braam(50.0, 35, 1.0, 0.1);
    for (const h of [53.0, 54.5]) { braam(h, chordAt(h)[1], 1.2, 0.11); taiko(h, 0.36); thunder(h + 0.02, 0.06, 1.6); }
    for (const [h, m] of [[59.0, 74], [59.75, 78]]) { impact(h, 1.0, 0.6); bell(h, m, 0.06); taiko(h, 0.34); }
    riser(60.0, 2.0, 0.17, 300, 9000);
    for (let i = 0; i < 16; i++) snare(60.5 + i * 0.09, 0.05 + i * 0.016);
    reverseSwell(62.0, 0.9, 0.18);

    // ---------- 62–65: the hush — "מוכנות להיכנס...?" ----------
    impact(62.25, 0.9, 0.4);
    subDrop(62.25, 0.1, 1.8);
    thunder(62.3, 0.06, 2.2);
    for (const n of [0, 1, 2, 3, 4]) kick(62.5 + n * 0.5, 0.22);   // heartbeat
    riser(63.4, 1.25, 0.14, 300, 9000);
    chargeUp(64.6, 1.2, 0.05);
    reverseSwell(65.0, 1.0, 0.2);

    // ---------- 65–72: FLASH — the kingdom ----------
    impact(65.0, 1.9, 1.0);
    braam(65.0, 38, 2.6, 0.13);
    thunder(65.05, 0.12, 3.0);
    metalHit(65.02, 0.25);
    ting(65.02, 0.12);
    bass(65.0, 38, 3.0, 0.1, 500);
    for (const [h, m] of [[65.0, 74], [65.25, 78], [65.5, 81], [65.75, 86], [66.75, 85], [67.0, 86], [67.5, 90], [68.5, 86]]) bell(h, m, 0.06);
    impact(66.75, 0.9, 0.45);          // "השערים נפתחים!"
    taiko(66.75, 0.3);
    crackle(65.4, 30, 0.06, 4.0);
    subDrop(69.0, 0.08, 1.8);

    for (const [t, m, beats] of MELODY) lead(t, m, beats * B, t < 47 ? 0.04 : 0.05);
    for (const [t, m] of BOX) { bell(t, m, t < 8 || t > 62 ? 0.06 : 0.04); pluck(t, m - 12, 0.02, 0); }

    return K.master;
  };
})(typeof window !== 'undefined' ? window : globalThis);
