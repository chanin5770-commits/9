/* "יומי" — 30s launch promo for a daily-schedule app you commit to.
 * Procedural and deterministic: P.render(ctx, t) draws the frame at time t
 * (seconds) on a 1920x1080 canvas. Same t => same frame, always.
 * Music is 120 BPM (beat = 0.5 s, bar = 2 s); every cut and pop sits on the grid,
 * and promo/audio.js reads its sync points from the timeline below. */
(function (global) {
  'use strict';

  const P = global.P || (global.P = {});
  const W = (P.W = 1920), H = (P.H = 1080), TAU = Math.PI * 2;
  P.DUR = 30;
  P.BEAT = 0.5;

  // ---------- timeline ----------
  P.T = {
    chaos: 0.0,      // notes and reminders pile up
    night: 5.0,      // 23:47, nothing planned for tomorrow
    implode: 7.0,    // everything is sucked into one point
    reveal: 8.0,     // FLASH — the app icon
    name: 9.0,
    tagline: 10.0,
    plan: 11.0,      // phone: the day, hour by hour
    breaks: 14.5,    // breaks are planned too
    commit: 17.0,    // ticking tasks off
    done: 21.0,      // 100% — celebration
    tomorrow: 23.0,  // calm night, tomorrow is ready
    ready: 25.0,
    end: 26.0,       // final logo
    fade: 29.2,
  };
  const T = P.T;

  // Sticky notes / reminders that pop in on 8th notes during the chaos
  P.NOTES = [];
  const NOTE_TEXT = [
    ['note', 'לקום מוקדם!!'], ['remind', 'תזכורת', 'לשלם חשבון חשמל'], ['note', 'לקנות חלב'],
    ['remind', 'תזכורת', 'פגישה ב-10:00'], ['note', 'ספורט???'], ['note', 'לסיים את הפרויקט'],
    ['remind', 'תזכורת', 'להתקשר לבנק'], ['note', 'לסדר את החדר'], ['note', 'ללמוד למבחן'],
    ['remind', 'תזכורת', 'לענות למיילים'], ['note', 'מחר מתחיל!'], ['note', 'לשתות מים'],
    ['remind', 'תזכורת', 'יום הולדת לאמא'], ['note', 'לתקן את האופניים'], ['note', 'דחוף!!!'],
    ['remind', 'תזכורת', 'לקבוע תור'],
  ];
  NOTE_TEXT.forEach((n, i) => P.NOTES.push({ at: 0.5 + i * 0.25, kind: n[0], title: n[1], body: n[2] }));

  P.CHAOS_WORDS = [[1.0, 'פתקים.'], [2.0, 'תזכורות.'], [3.0, 'רשימות.'], [4.0, 'ושום דבר לא זז.']];

  // The day inside the app: [time, title, kind]
  P.ROWS = [
    ['06:30', 'קימה וכוס מים', 'sun'],
    ['07:00', 'אימון בוקר', 'run'],
    ['08:00', 'עבודה מרוכזת', 'focus'],
    ['10:30', 'הפסקה', 'break'],
    ['11:00', 'פגישות ושיחות', 'call'],
    ['13:00', 'ארוחת צהריים', 'break'],
    ['14:00', 'לימודים', 'study'],
    ['17:00', 'זמן משפחה', 'heart'],
    ['20:00', 'סידורים לבית', 'home'],
    ['22:30', 'תכנון מחר', 'moon'],
  ];
  P.ROW_IN = P.ROWS.map((_, i) => 11.5 + i * 0.25);
  P.CHECKS = [17.5, 18.0, 18.5, 19.0, 19.5, 19.75, 20.0, 20.25, 20.5, 20.75];
  P.TOMORROW = [['06:30', 'קימה'], ['07:00', 'ריצה'], ['08:30', 'עבודה מרוכזת'], ['12:00', 'הפסקה']];
  P.TOMORROW_IN = [23.75, 24.0, 24.25, 24.5];

  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, x) => clamp((x - a) / (b - a));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const back = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const elastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1);
  const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const win = (t, a, b, fi = 0.3, fo = 0.3) => Math.min(inv(a, a + fi, t), 1 - inv(b - fo, b, t));
  const pulse = (t, t0, fall) => (t < t0 ? 0 : Math.exp(-(t - t0) / fall));
  const beatPulse = (t, from, to) => (t < from || t > to ? 0 : Math.exp(-((t - from) % P.BEAT) / 0.12));

  // ---------- palette ----------
  const VIOLET = '124,92,255', CYAN = '34,211,238', MINT = '61,245,166', CORAL = '255,107,107', AMBER = '255,184,77', PINK = '255,92,170';
  const KIND = { sun: AMBER, run: CORAL, focus: VIOLET, break: MINT, call: CYAN, study: '160,140,255', heart: PINK, home: '120,200,255', moon: '180,170,255' };
  const NOTE_COLORS = ['#ffe066', '#ffadc6', '#9ee7ff', '#ffc078', '#b2f2bb'];

  // ---------- assets ----------
  const A = {};
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  P.loadAssets = function () {
    const g = mk(512, 512), gg = g.getContext('2d'), id = gg.createImageData(512, 512);
    let s = 1234567;
    for (let i = 0; i < id.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = (s >> 8) & 255;
      id.data[i + 3] = 255;
    }
    gg.putImageData(id, 0, 0);
    A.grain = g;
    const v = mk(W, H), vg = v.getContext('2d');
    const r = vg.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.1);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, 'rgba(0,0,0,0.7)');
    vg.fillStyle = r;
    vg.fillRect(0, 0, W, H);
    A.vignette = v;
    const ws = ['300', '400', '500', '600', '700', '800', '900'];
    return document.fonts ? Promise.all(ws.map((w) => document.fonts.load(`${w} 60px Heebo`, 'יומי Ab12'))) : Promise.resolve();
  };

  // ---------- primitives ----------
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  }
  function font(g, size, weight = 600) { g.font = `${weight} ${size}px Heebo`; }
  function text(g, s, x, y, size, weight, fill, align = 'center', dir = 'rtl') {
    font(g, size, weight);
    g.direction = dir;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillStyle = fill;
    g.fillText(s, x, y);
  }
  function brandGrad(g, x0, x1, y = 0) {
    const gr = g.createLinearGradient(x0, y, x1, y);
    gr.addColorStop(0, `rgb(${CYAN})`);
    gr.addColorStop(0.5, `rgb(${VIOLET})`);
    gr.addColorStop(1, `rgb(${PINK})`);
    return gr;
  }
  function glow(g, x, y, r, rgb, a) {
    if (a <= 0.003 || r <= 0) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(0.4, `rgba(${rgb},${a * 0.3})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  function checkPath(g, x, y, s, p = 1) {
    // check mark drawn progressively (p 0..1)
    const pts = [[-0.36, 0.02], [-0.1, 0.28], [0.4, -0.3]];
    const l1 = Math.hypot(0.26, 0.26), l2 = Math.hypot(0.5, 0.58), L = (l1 + l2) * p;
    g.beginPath();
    g.moveTo(x + pts[0][0] * s, y + pts[0][1] * s);
    if (L <= l1) { const k = L / l1; g.lineTo(x + lerp(pts[0][0], pts[1][0], k) * s, y + lerp(pts[0][1], pts[1][1], k) * s); }
    else {
      g.lineTo(x + pts[1][0] * s, y + pts[1][1] * s);
      const k = (L - l1) / l2;
      g.lineTo(x + lerp(pts[1][0], pts[2][0], k) * s, y + lerp(pts[1][1], pts[2][1], k) * s);
    }
  }
  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr2 = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
    }
    g.closePath();
  }
  function flame(g, x, y, s) {
    g.beginPath();
    g.moveTo(x, y + s * 0.5);
    g.bezierCurveTo(x - s * 0.45, y + s * 0.5, x - s * 0.5, y, x - s * 0.2, y - s * 0.25);
    g.bezierCurveTo(x - s * 0.15, y - s * 0.05, x - s * 0.05, y - s * 0.05, x - s * 0.05, y - s * 0.1);
    g.bezierCurveTo(x - s * 0.1, y - s * 0.35, x + s * 0.05, y - s * 0.5, x + s * 0.1, y - s * 0.6);
    g.bezierCurveTo(x + s * 0.15, y - s * 0.3, x + s * 0.5, y - s * 0.1, x + s * 0.42, y + s * 0.15);
    g.bezierCurveTo(x + s * 0.4, y + s * 0.4, x + s * 0.2, y + s * 0.5, x, y + s * 0.5);
    g.closePath();
  }

  // Words rise in one after another, right to left (Hebrew reading order).
  // Words wrapped in *stars* get the brand gradient.
  function words(g, s, cx, y, size, weight, t, t0, o = {}) {
    const stagger = o.stagger ?? 0.09, dur = o.dur ?? 0.5, alpha = o.alpha ?? 1, color = o.color || '#fff';
    const parts = s.split(' ');
    font(g, size, weight);
    g.direction = 'rtl';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    const space = size * 0.26;
    const ws = parts.map((p) => g.measureText(p.replace(/\*/g, '')).width);
    const total = ws.reduce((a, b) => a + b, 0) + space * (parts.length - 1);
    let x = o.align === 'right' ? cx : cx + total / 2;
    const gr = brandGrad(g, x - total, x);
    for (let i = 0; i < parts.length; i++) {
      const k = clamp((t - t0 - i * stagger) / dur);
      if (k > 0 && alpha > 0.003) {
        const e = easeOut(k);
        g.save();
        g.globalAlpha = alpha * Math.min(1, k * 1.6);
        if (k < 1) g.filter = `blur(${((1 - e) * 14).toFixed(1)}px)`;
        g.fillStyle = parts[i].includes('*') ? gr : color;
        if (o.shadow) { g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 30; }
        g.fillText(parts[i].replace(/\*/g, ''), x, y + (1 - e) * size * 0.45);
        g.restore();
      }
      x -= ws[i] + space;
    }
    return total;
  }

  // ---------- background ----------
  // Three moods, cross-faded: stress (chaos), night, brand.
  function moods(t) {
    const night = Math.max(win(t, T.night - 0.4, T.reveal, 0.6, 0.05), win(t, T.tomorrow - 0.2, T.end, 0.8, 0.2));
    const chaos = 1 - inv(T.night - 0.6, T.night + 0.6, t);
    const brand = clamp(1 - night - chaos);
    return { chaos, night, brand };
  }
  function blob(g, x, y, r, rgb, a) {
    if (a <= 0.003) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function background(g, t) {
    const m = moods(t);
    g.fillStyle = '#05060d';
    g.fillRect(0, 0, W, H);
    g.save();
    g.globalCompositeOperation = 'lighter';
    // chaos: hot, uneasy
    blob(g, 400 + Math.sin(t * 0.7) * 120, 300, 900, '255,70,50', 0.16 * m.chaos);
    blob(g, 1600, 800 + Math.cos(t * 0.5) * 100, 900, '255,150,40', 0.12 * m.chaos);
    // night: deep blue
    blob(g, 1500, 200, 1000, '40,70,190', 0.22 * m.night);
    blob(g, 300, 950, 900, '70,40,160', 0.16 * m.night);
    // brand: aurora
    const b = m.brand, bp = 1 + 0.25 * beatPulse(t, T.reveal, T.tomorrow);
    blob(g, 960 + Math.sin(t * 0.45) * 520, 260 + Math.cos(t * 0.3) * 120, 1000, VIOLET, 0.26 * b * bp);
    blob(g, 300 + Math.cos(t * 0.37) * 200, 850, 900, CYAN, 0.16 * b * bp);
    blob(g, 1650, 900 + Math.sin(t * 0.5) * 90, 850, PINK, 0.13 * b * bp);
    g.restore();
    // drifting dust / stars
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 140; i++) {
      const sp = 6 + rnd(i * 3.3) * 22;
      const x = (rnd(i) * W + t * sp * (rnd(i * 5.1) > 0.5 ? 1 : -0.6)) % W;
      const y = (rnd(i * 2.7) * H - t * sp * 0.4 + H * 4) % H;
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + rnd(i * 9) * 3) + i);
      const a = (0.1 + 0.35 * rnd(i * 7.3)) * (0.4 + 0.6 * tw) * (0.4 + m.night * 1.2 + m.brand * 0.5);
      g.fillStyle = `rgba(220,230,255,${a})`;
      g.fillRect(x, y, 1.6 + rnd(i * 4) * 1.6, 1.6 + rnd(i * 4) * 1.6);
    }
    g.restore();
  }

  // ---------- scene 1: chaos of notes ----------
  function notePos(i) {
    // scatter around the frame, leaving the very center for the words
    const ang = rnd(i * 4.1) * TAU, rad = 0.55 + rnd(i * 2.3) * 0.5;
    return [W / 2 + Math.cos(ang) * 780 * rad + (rnd(i * 8.8) - 0.5) * 300, H / 2 + Math.sin(ang) * 400 * rad, (rnd(i * 6.6) - 0.5) * 0.5];
  }
  function drawNote(g, n, i, t) {
    const k = clamp((t - n.at) / 0.35);
    if (k <= 0) return;
    let [x, y, rot] = notePos(i);
    const fallT = t - T.night;
    let a = 1;
    // nervous jitter grows with the pile
    const jit = inv(2, 5, t) * 5;
    x += Math.sin(t * 31 + i * 7) * jit;
    y += Math.cos(t * 27 + i * 3) * jit;
    if (fallT > 0) {
      const v = (rnd(i * 1.7) - 0.5) * 300;
      x += v * fallT;
      y += 900 * fallT * fallT + 80 * fallT;
      rot += (rnd(i * 3.9) - 0.5) * 3 * fallT;
      a = 1 - inv(0.3, 1.1, fallT);
    }
    if (a <= 0) return;
    const s = back(k);
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(s, s);
    g.globalAlpha = a * Math.min(1, k * 3);
    if (n.kind === 'note') {
      const w = 250, h = 200, c = NOTE_COLORS[i % NOTE_COLORS.length];
      g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 40; g.shadowOffsetY = 18;
      g.fillStyle = c;
      g.fillRect(-w / 2, -h / 2, w, h);
      g.shadowColor = 'transparent';
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(-w / 2, -h / 2, w, 26);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-36, -h / 2 - 14, 72, 28); // tape
      text(g, n.title, 0, 14, n.title.length > 10 ? 30 : 38, 700, '#2a2230');
    } else {
      const w = 420, h = 116;
      g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 40; g.shadowOffsetY = 14;
      rr(g, -w / 2, -h / 2, w, h, 28);
      g.fillStyle = 'rgba(38,40,52,0.92)';
      g.fill();
      g.shadowColor = 'transparent';
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1.5; g.stroke();
      rr(g, w / 2 - 74, -28, 52, 52, 13);
      g.fillStyle = '#ff5b5b'; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 4;
      g.beginPath(); g.arc(w / 2 - 48, -2, 14, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(w / 2 - 48, -10); g.lineTo(w / 2 - 48, -2); g.lineTo(w / 2 - 42, 3); g.stroke();
      text(g, n.title, w / 2 - 94, -22, 26, 700, 'rgba(255,255,255,0.6)', 'right');
      text(g, n.body, w / 2 - 94, 16, 32, 600, '#fff', 'right');
      text(g, 'עכשיו', -w / 2 + 26, -22, 22, 400, 'rgba(255,255,255,0.45)', 'left');
    }
    g.restore();
  }
  function sceneChaos(g, t) {
    if (t > T.night + 1.3) return;
    g.save();
    const shake = inv(3, 5, t) * 6 * (t < T.night ? 1 : 0);
    g.translate(Math.sin(t * 53) * shake, Math.cos(t * 47) * shake);
    // slow push-in feels claustrophobic
    const z = 1 + t * 0.012;
    g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-W / 2, -H / 2);
    P.NOTES.forEach((n, i) => drawNote(g, n, i, t));
    g.restore();
    if (t >= T.night) return;
    // a dark pool behind the words so they read over the pile
    const scr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 620);
    scr.addColorStop(0, `rgba(5,6,13,${0.85 * inv(0.6, 1.2, t)})`);
    scr.addColorStop(1, 'rgba(5,6,13,0)');
    g.fillStyle = scr;
    g.fillRect(0, 0, W, H);
    let cur = null;
    for (const w of P.CHAOS_WORDS) if (t >= w[0]) cur = w;
    if (cur) {
      const k = t - cur[0], last = cur === P.CHAOS_WORDS[3];
      const s = last ? 1 : 1 + 0.25 * Math.exp(-k / 0.08);
      g.save();
      g.translate(W / 2, H / 2); g.scale(s, s);
      g.globalAlpha = (last ? 1 : Math.min(1, k / 0.05)) * (1 - inv(4.75, 5.0, t));
      if (last) words(g, cur[1], 0, 0, 120, 800, t, cur[0], { stagger: 0.12 });
      else text(g, cur[1], 0, 0, 170, 900, '#fff');
      g.restore();
    }
  }

  // ---------- scene 2: night, nothing planned ----------
  function sceneNight(g, t) {
    if (t < T.night - 0.1 || t > T.reveal) return;
    const a = inv(T.night, T.night + 0.4, t);
    const imp = easeIn(inv(T.implode, T.reveal - 0.05, t));
    g.save();
    g.translate(W / 2, H / 2);
    const s = (1 + (t - T.night) * 0.03) * (1 - imp * 0.96);
    g.scale(s, s);
    g.rotate(imp * 0.6);
    g.globalAlpha = a * (1 - inv(0.7, 1, imp));
    // clock
    font(g, 300, 200);
    const blink = Math.floor((t - T.night) * 2) % 2 === 0;
    glow(g, 0, -110, 520, '90,120,255', 0.18);
    g.direction = 'ltr'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#dfe6ff';
    g.shadowColor = 'rgba(110,140,255,0.9)'; g.shadowBlur = 50;
    g.fillText('23', -150, -110);
    g.fillText('47', 150, -110);
    g.save();
    g.globalAlpha *= blink ? 1 : 0.35;
    g.fillText(':', 0, -125);
    g.restore();
    g.shadowColor = 'transparent';
    text(g, 'יום שלישי', 0, -330, 40, 400, 'rgba(200,210,255,0.5)');
    words(g, 'הולכים לישון', 0, 140, 76, 700, t, T.night + 0.5, { color: '#fff' });
    words(g, 'בלי לדעת מה עושים מחר.', 0, 240, 76, 300, t, T.night + 1.0, { color: 'rgba(225,230,255,0.85)' });
    g.restore();
    // streaks pulled into the center
    if (imp > 0) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 90; i++) {
        const ang = rnd(i * 3.7) * TAU, r0 = 300 + rnd(i * 1.9) * 1300;
        const r = r0 * (1 - easeIn(inv(rnd(i) * 0.4, 1, imp)));
        const len = 40 + 260 * imp;
        g.strokeStyle = `rgba(${[VIOLET, CYAN, '255,255,255'][i % 3]},${0.6 * imp})`;
        g.lineWidth = 2 + rnd(i * 5) * 3;
        g.beginPath();
        g.moveTo(W / 2 + Math.cos(ang) * r, H / 2 + Math.sin(ang) * r);
        g.lineTo(W / 2 + Math.cos(ang) * (r + len), H / 2 + Math.sin(ang) * (r + len));
        g.stroke();
      }
      glow(g, W / 2, H / 2, 40 + 260 * imp, '255,255,255', imp);
      g.restore();
    }
  }

  // ---------- app icon ----------
  function icon(g, x, y, size, t, ring = 1) {
    const r = size * 0.23;
    g.save();
    g.translate(x, y);
    g.shadowColor = `rgba(${VIOLET},0.7)`; g.shadowBlur = size * 0.35; g.shadowOffsetY = size * 0.08;
    rr(g, -size / 2, -size / 2, size, size, r);
    const gr = g.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
    gr.addColorStop(0, `rgb(${CYAN})`);
    gr.addColorStop(0.55, `rgb(${VIOLET})`);
    gr.addColorStop(1, `rgb(${PINK})`);
    g.fillStyle = gr;
    g.fill();
    g.shadowColor = 'transparent';
    // glossy top
    g.save();
    g.clip();
    const gl = g.createLinearGradient(0, -size / 2, 0, size * 0.1);
    gl.addColorStop(0, 'rgba(255,255,255,0.35)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.fillRect(-size / 2, -size / 2, size, size * 0.6);
    // light sweep
    const sw = ((t * 0.5) % 2) - 0.5;
    const sg = g.createLinearGradient(-size + sw * size * 2, 0, sw * size * 2, size);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg;
    g.fillRect(-size / 2, -size / 2, size, size);
    g.restore();
    // progress ring + check
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = size * 0.075;
    g.beginPath(); g.arc(0, 0, size * 0.29, 0, TAU); g.stroke();
    g.strokeStyle = '#fff';
    g.beginPath(); g.arc(0, 0, size * 0.29, -Math.PI / 2, -Math.PI / 2 + TAU * 0.78 * ring); g.stroke();
    g.lineWidth = size * 0.085;
    checkPath(g, 0, size * 0.01, size * 0.34, clamp(ring * 1.3 - 0.3));
    g.stroke();
    g.restore();
  }

  // ---------- scene 3: reveal ----------
  function sceneReveal(g, t) {
    if (t < T.reveal || t > T.plan) return;
    const lt = t - T.reveal;
    const out = easeIn(inv(T.plan - 0.4, T.plan, t));
    // shockwave rings
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const rt = lt - k * 0.12;
      if (rt <= 0) continue;
      const rad = easeOut(clamp(rt / 1.6)) * (900 + k * 200);
      g.strokeStyle = `rgba(${[CYAN, VIOLET, PINK][k]},${0.7 * (1 - clamp(rt / 1.6))})`;
      g.lineWidth = 6 - k * 1.5;
      g.beginPath(); g.arc(W / 2, H / 2 - 60, rad, 0, TAU); g.stroke();
    }
    // particle burst
    for (let i = 0; i < 160; i++) {
      const ang = rnd(i * 1.3) * TAU, sp = 300 + rnd(i * 2.9) * 1300;
      const d = sp * (1 - Math.exp(-lt * 2.2)) / 2.2 * 1.6;
      const a = (1 - clamp(lt / (1.2 + rnd(i) * 1.4))) * 0.9;
      if (a <= 0) continue;
      g.fillStyle = `rgba(${[CYAN, VIOLET, PINK, MINT, '255,255,255'][i % 5]},${a})`;
      const sz = 2 + rnd(i * 6.1) * 5;
      g.beginPath(); g.arc(W / 2 + Math.cos(ang) * d, H / 2 - 60 + Math.sin(ang) * d, sz, 0, TAU); g.fill();
    }
    g.restore();
    // icon
    const k = clamp(lt / 0.9);
    const beat = beatPulse(t, T.reveal + 1, T.plan) * 0.04;
    const size = 280 * elastic(k) * (1 + beat) * (1 - out * 0.4);
    const y = H / 2 - 110 - out * 260;
    g.save();
    g.globalAlpha = 1 - out;
    glow(g, W / 2, y, 420, VIOLET, 0.45 * Math.min(1, k * 2));
    g.translate(W / 2, y);
    g.rotate((1 - easeOut(k)) * -0.5);
    if (size > 1) icon(g, 0, 0, size, t, easeOut(inv(T.reveal + 0.2, T.reveal + 1.2, t)));
    g.restore();
    // name
    g.save();
    g.globalAlpha = 1 - out;
    const nk = easeOut(inv(T.name, T.name + 0.6, t));
    if (nk > 0) {
      font(g, 190, 900);
      g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save();
      g.translate(W / 2, H / 2 + 160 - out * 200);
      g.scale(lerp(1.25, 1, nk), lerp(1.25, 1, nk));
      g.globalAlpha *= nk;
      g.filter = `blur(${((1 - nk) * 16).toFixed(1)}px)`;
      g.shadowColor = `rgba(${VIOLET},0.8)`; g.shadowBlur = 60;
      g.fillStyle = '#fff';
      g.fillText('יומי', 0, 0);
      g.restore();
    }
    words(g, 'סדר יום *שמחייב.*', W / 2, H / 2 + 300 - out * 200, 66, 400, t, T.tagline, { alpha: 1 - out });
    g.restore();
  }

  // ---------- the phone ----------
  const PW = 470, PH = 960, SW = 442, SH = 932, ROW_H = 80, ROW_Y = 300;
  function rowIcon(g, kind, x, y) {
    const c = `rgb(${KIND[kind]})`;
    rr(g, x - 24, y - 24, 48, 48, 14);
    g.fillStyle = `rgba(${KIND[kind]},0.18)`;
    g.fill();
    g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    switch (kind) {
      case 'sun':
        g.arc(x, y, 7, 0, TAU); g.fill();
        for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; g.moveTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11); g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15); }
        g.stroke(); break;
      case 'break': // cup
        rr(g, x - 11, y - 8, 17, 18, 4); g.stroke();
        g.beginPath(); g.arc(x + 8, y, 5, -Math.PI / 2, Math.PI / 2); g.stroke();
        g.beginPath(); g.moveTo(x - 6, y - 13); g.lineTo(x - 6, y - 16); g.moveTo(x, y - 13); g.lineTo(x, y - 16); g.stroke(); break;
      case 'moon':
        g.arc(x, y, 12, 0.6, TAU - 0.6 + 0.0001); g.arc(x + 7, y - 4, 9, TAU - 0.9, 0.9, true); g.fill(); break;
      case 'heart':
        g.moveTo(x, y + 11); g.bezierCurveTo(x - 18, y - 2, x - 9, y - 16, x, y - 6); g.bezierCurveTo(x + 9, y - 16, x + 18, y - 2, x, y + 11); g.fill(); break;
      case 'run':
        g.moveTo(x - 12, y + 6); g.lineTo(x - 2, y - 4); g.lineTo(x + 4, y + 4); g.lineTo(x + 13, y - 8); g.stroke(); break;
      case 'focus':
        g.arc(x, y, 12, 0, TAU); g.stroke(); g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); break;
      case 'call':
        rr(g, x - 7, y - 13, 14, 26, 4); g.stroke(); break;
      case 'study':
        g.moveTo(x, y - 8); g.lineTo(x - 13, y - 12); g.lineTo(x - 13, y + 10); g.lineTo(x, y + 13); g.lineTo(x + 13, y + 10); g.lineTo(x + 13, y - 12); g.closePath(); g.moveTo(x, y - 8); g.lineTo(x, y + 13); g.stroke(); break;
      case 'home':
        g.moveTo(x - 12, y - 1); g.lineTo(x, y - 12); g.lineTo(x + 12, y - 1); g.moveTo(x - 9, y - 3); g.lineTo(x - 9, y + 11); g.lineTo(x + 9, y + 11); g.lineTo(x + 9, y - 3); g.stroke(); break;
    }
  }

  // state: {rows: shown count (float), scroll, checks: [per-row check progress 0..1], breaks: highlight 0..1, pts, pct}
  function appScreen(g, t, st) {
    // screen background
    const bg = g.createLinearGradient(0, 0, 0, SH);
    bg.addColorStop(0, '#12122a');
    bg.addColorStop(1, '#0a0b18');
    g.fillStyle = bg;
    g.fillRect(0, 0, SW, SH);
    glow(g, SW * 0.8, 40, 360, VIOLET, 0.35);
    glow(g, 0, SH, 380, CYAN, 0.18);
    // status bar
    text(g, '7:42', 58, 36, 24, 600, '#fff', 'center', 'ltr');
    rr(g, SW - 70, 28, 36, 16, 5); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#fff'; g.fillRect(SW - 67, 31, 24, 10);
    // header
    text(g, 'היום', SW - 30, 120, 52, 800, '#fff', 'right');
    text(g, 'יום רביעי · 14 באוקטובר', SW - 30, 168, 22, 400, 'rgba(255,255,255,0.55)', 'right');
    // progress ring
    const cx = 74, cy = 138, R = 46;
    g.lineCap = 'round';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    if (st.pct > 0.001) {
      const rg = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      rg.addColorStop(0, `rgb(${MINT})`); rg.addColorStop(1, `rgb(${CYAN})`);
      g.strokeStyle = rg;
      g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * st.pct); g.stroke();
    }
    text(g, `${Math.round(st.pct * 100)}%`, cx, cy + 2, 26, 800, '#fff', 'center', 'ltr');
    // points chip
    rr(g, 26, 210, 150, 46, 23);
    g.fillStyle = 'rgba(255,184,77,0.14)'; g.fill();
    g.fillStyle = `rgb(${AMBER})`; star(g, 54, 233, 13); g.fill();
    text(g, `${st.pts}`, 74, 234, 26, 800, `rgb(${AMBER})`, 'left', 'ltr');
    text(g, 'נק׳', 160, 234, 20, 500, 'rgba(255,184,77,0.8)', 'right');
    // streak chip
    rr(g, SW - 196, 210, 170, 46, 23);
    g.fillStyle = 'rgba(255,107,107,0.14)'; g.fill();
    g.fillStyle = `rgb(${CORAL})`; flame(g, SW - 52, 233, 26); g.fill();
    text(g, `${st.streak} ימים ברצף`, SW - 72, 234, 21, 600, `rgb(${CORAL})`, 'right');
    // rows (clipped list)
    g.save();
    g.beginPath(); g.rect(0, ROW_Y - 10, SW, SH - ROW_Y - 10); g.clip();
    P.ROWS.forEach((row, i) => {
      const k = clamp(st.rows - i);
      if (k <= 0) return;
      const e = back(clamp(k));
      const y = ROW_Y + i * ROW_H - st.scroll;
      if (y < ROW_Y - ROW_H || y > SH) return;
      const isBreak = row[2] === 'break';
      const ck = st.checks[i] || 0;
      g.save();
      g.globalAlpha = Math.min(1, k * 2);
      g.translate((1 - e) * 60, 0);
      rr(g, 18, y, SW - 36, ROW_H - 12, 20);
      const hl = isBreak ? st.breaks : 0;
      g.fillStyle = hl > 0 ? `rgba(${MINT},${0.06 + 0.12 * hl})` : 'rgba(255,255,255,0.055)';
      g.fill();
      if (hl > 0) { g.strokeStyle = `rgba(${MINT},${0.7 * hl})`; g.lineWidth = 2; g.stroke(); }
      if (ck > 0) { g.fillStyle = `rgba(${MINT},${0.07 * ck})`; g.fill(); }
      const my = y + (ROW_H - 12) / 2;
      text(g, row[0], SW - 40, my, 24, 700, 'rgba(200,205,240,0.7)', 'right', 'ltr');
      rowIcon(g, row[2], SW - 142, my);
      text(g, row[1], SW - 180, my, 27, 600, `rgba(255,255,255,${1 - 0.45 * ck})`, 'right');
      if (ck > 0) {
        // strike-through grows right to left
        font(g, 27, 600);
        const tw = g.measureText(row[1]).width;
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(SW - 180, my); g.lineTo(SW - 180 - tw * easeOut(ck), my); g.stroke();
      }
      // check circle
      const ccx = 60;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,0.3)';
      g.beginPath(); g.arc(ccx, my, 19, 0, TAU); g.stroke();
      if (ck > 0) {
        const pop = 1 + 0.35 * Math.sin(Math.PI * clamp(ck * 1.4));
        g.fillStyle = `rgb(${MINT})`;
        g.beginPath(); g.arc(ccx, my, 19 * easeOut(clamp(ck * 2)) * pop, 0, TAU); g.fill();
        g.strokeStyle = '#0a2a1e'; g.lineWidth = 4.5; g.lineCap = 'round'; g.lineJoin = 'round';
        checkPath(g, ccx, my + 1, 26, clamp(ck * 1.6 - 0.3));
        g.stroke();
      }
      g.restore();
    });
    // the "now" line
    if (st.now > 0) {
      const ny = ROW_Y + st.nowY - st.scroll;
      g.globalAlpha = st.now;
      g.strokeStyle = `rgb(${CORAL})`; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(30, ny); g.lineTo(SW - 22, ny); g.stroke();
      g.fillStyle = `rgb(${CORAL})`;
      g.beginPath(); g.arc(SW - 22, ny, 7, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
    g.restore();
    // fade list bottom + floating add button
    const fb = g.createLinearGradient(0, SH - 170, 0, SH);
    fb.addColorStop(0, 'rgba(10,11,24,0)'); fb.addColorStop(1, 'rgba(10,11,24,1)');
    g.fillStyle = fb; g.fillRect(0, SH - 170, SW, 170);
    g.save();
    g.shadowColor = `rgba(${VIOLET},0.8)`; g.shadowBlur = 30;
    g.fillStyle = brandGrad(g, SW / 2 - 40, SW / 2 + 40);
    g.beginPath(); g.arc(SW / 2, SH - 70, 38, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(SW / 2 - 13, SH - 70); g.lineTo(SW / 2 + 13, SH - 70); g.moveTo(SW / 2, SH - 83); g.lineTo(SW / 2, SH - 57); g.stroke();
  }

  function phone(g, x, y, s, rot, t, st) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(s, s);
    // shadow + body
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 90; g.shadowOffsetY = 50;
    rr(g, -PW / 2, -PH / 2, PW, PH, 74);
    const body = g.createLinearGradient(-PW / 2, -PH / 2, PW / 2, PH / 2);
    body.addColorStop(0, '#5b5e6e'); body.addColorStop(0.25, '#1d1f29'); body.addColorStop(0.7, '#2a2c38'); body.addColorStop(1, '#6a6d7c');
    g.fillStyle = body;
    g.fill();
    g.restore();
    rr(g, -PW / 2 + 3, -PH / 2 + 3, PW - 6, PH - 6, 71);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.stroke();
    // screen
    g.save();
    g.translate(-SW / 2, -SH / 2);
    rr(g, 0, 0, SW, SH, 60);
    g.clip();
    appScreen(g, t, st);
    // dynamic island
    rr(g, SW / 2 - 62, 18, 124, 36, 18);
    g.fillStyle = '#000'; g.fill();
    // glass reflection
    const gl = g.createLinearGradient(0, 0, SW, SH);
    gl.addColorStop(0, 'rgba(255,255,255,0.10)'); gl.addColorStop(0.35, 'rgba(255,255,255,0.0)');
    g.fillStyle = gl; g.fillRect(0, 0, SW, SH);
    g.restore();
    g.restore();
  }

  // Phone choreography across the plan / commit / done scenes
  function phoneState(t) {
    const st = { rows: 0, scroll: 0, checks: [], breaks: 0, pts: 0, pct: 0, streak: 6, now: 0, nowY: 0 };
    st.rows = P.ROW_IN.reduce((n, at) => n + clamp((t - at) / 0.35), 0);
    // scroll down as the list fills, back to top for the check-off run
    const fillScroll = Math.max(0, st.rows - 7.2) * ROW_H;
    let scroll = fillScroll;
    if (t > T.breaks) scroll = lerp(fillScroll, 1.2 * ROW_H, ease(inv(T.breaks, T.breaks + 0.6, t)));
    if (t > T.commit - 0.5) scroll = lerp(1.2 * ROW_H, 0, ease(inv(T.commit - 0.5, T.commit, t)));
    let done = 0;
    P.CHECKS.forEach((at, i) => { const k = clamp((t - at) / 0.4); st.checks[i] = k; if (t >= at) done++; });
    if (t > T.commit) scroll = Math.max(0, Math.min(3.6 * ROW_H, (P.CHECKS.reduce((n, at) => n + clamp((t - at) / 0.5), 0) - 4.5) * ROW_H));
    st.scroll = scroll;
    st.breaks = win(t, T.breaks + 0.2, T.commit - 0.2, 0.4, 0.4);
    st.pts = done * 10;
    st.pct = P.CHECKS.reduce((n, at) => n + easeOut(clamp((t - at) / 0.35)), 0) / P.ROWS.length;
    st.streak = t > T.done + 0.8 ? 7 : 6;
    st.now = win(t, 13.2, T.commit, 0.4, 0.3);
    st.nowY = lerp(1.5, 4.1, inv(13.2, T.commit, t)) * ROW_H;
    return st;
  }

  // ---------- scene 4+5: plan, breaks, commit, done ----------
  function headline(g, t, a, b, l1, l2, sub, o = {}) {
    // two-line headline living on the right half; fades out at b
    const out = inv(b - 0.3, b, t);
    if (t < a || out >= 1) return;
    const al = 1 - out;
    const x = o.x ?? 1700, y = o.y ?? 420;
    g.save();
    g.translate(0, -out * 40);
    words(g, l1, x, y, o.size ?? 118, 800, t, a, { align: 'right', alpha: al });
    if (l2) words(g, l2, x, y + (o.size ?? 118) * 1.12, o.size ?? 118, 800, t, a + 0.25, { align: 'right', alpha: al });
    if (sub) words(g, sub, x, y + (o.size ?? 118) * (l2 ? 2.15 : 1.1), 46, 400, t, a + 0.6, { align: 'right', alpha: al, color: 'rgba(225,230,255,0.75)', stagger: 0.05 });
    g.restore();
  }

  function scenePhone(g, t) {
    if (t < T.plan - 0.2 || t > T.tomorrow + 0.8) return;
    const st = phoneState(t);
    const enter = easeOut(inv(T.plan - 0.2, T.plan + 0.7, t));
    const leave = easeIn(inv(T.tomorrow - 0.1, T.tomorrow + 0.6, t));
    const zoom = ease(inv(T.commit - 0.4, T.commit + 0.3, t));
    let x = lerp(600, 640, zoom), y = lerp(540 + 1100, 560, enter) + leave * 1200;
    let s = lerp(0.98, 1.06, zoom) + 0.015 * Math.sin(t * 1.3);
    let rot = lerp(0.18, -0.035, enter) + 0.01 * Math.sin(t * 0.9) - leave * 0.25;
    // tiny bounce on each tick
    s += 0.012 * P.CHECKS.reduce((n, at) => n + pulse(t, at, 0.1), 0);
    glow(g, x, y, 640, VIOLET, 0.22 * enter * (1 - leave));
    phone(g, x, y, s, rot, t, st);
    // "+10" flying out of each checked row
    P.CHECKS.forEach((at, i) => {
      const k = (t - at) / 0.8;
      if (k <= 0 || k >= 1) return;
      const ry = ROW_Y + i * ROW_H - st.scroll + 34;
      const px = x + (60 - SW / 2) * s - 30, py = y + (ry - SH / 2) * s;
      g.save();
      g.globalAlpha = 1 - easeIn(k);
      text(g, '+10', px - 60 * easeOut(k), py - 110 * easeOut(k), 42, 900, `rgb(${AMBER})`, 'center', 'ltr');
      g.restore();
    });

    // right side copy
    headline(g, t, T.plan + 0.6, T.breaks, 'כל שעה —', 'במקום *שלה.*', 'בונים את היום מראש, שעה אחרי שעה.');
    headline(g, t, T.breaks + 0.1, T.commit, 'גם ההפסקות', '*מתוכננות.*', 'כדי שיהיה כוח להמשיך עד הסוף.');
    headline(g, t, T.commit + 0.2, T.done, 'לא רק לרשום.', null, null, { y: 380 });
    if (t >= 18.5 && t < T.done) {
      const k = t - 18.5, s2 = 1 + 0.35 * Math.exp(-k / 0.1);
      g.save();
      g.translate(1440, 600); g.scale(s2, s2);
      g.globalAlpha = Math.min(1, k / 0.06) * (1 - inv(T.done - 0.25, T.done, t));
      font(g, 230, 900); g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = `rgba(${VIOLET},0.7)`; g.shadowBlur = 60;
      g.fillStyle = brandGrad(g, -260, 260);
      g.fillText('לבצע.', 0, 0);
      g.restore();
    }
    // 100% celebration
    if (t >= T.done && t < T.tomorrow + 0.4) {
      const k = t - T.done, al = 1 - inv(T.tomorrow - 0.2, T.tomorrow + 0.3, t);
      const s2 = elastic(clamp(k / 0.9));
      g.save();
      g.globalAlpha = al;
      glow(g, 1400, 470, 520, MINT, 0.3 * Math.min(1, k * 3));
      g.translate(1400, 470); g.scale(s2, s2);
      font(g, 250, 900); g.direction = 'ltr'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const mg = g.createLinearGradient(-300, 0, 300, 0);
      mg.addColorStop(0, `rgb(${MINT})`); mg.addColorStop(1, `rgb(${CYAN})`);
      g.fillStyle = mg;
      g.shadowColor = `rgba(${MINT},0.6)`; g.shadowBlur = 60;
      g.fillText('100%', 0, 0);
      g.restore();
      g.save();
      g.globalAlpha = al;
      words(g, 'היום שלך — הושלם.', 1400, 650, 64, 600, t, T.done + 0.35);
      // streak badge
      const bk = back(clamp((t - (T.done + 0.8)) / 0.45));
      if (bk > 0) {
        g.translate(1400, 790); g.scale(bk, bk);
        rr(g, -200, -46, 400, 92, 46);
        g.fillStyle = 'rgba(255,107,107,0.16)'; g.fill();
        g.strokeStyle = `rgba(${CORAL},0.7)`; g.lineWidth = 2.5; g.stroke();
        g.fillStyle = `rgb(${CORAL})`; flame(g, 140, 0, 50); g.fill();
        text(g, '7 ימים ברצף', 100, 2, 42, 800, '#fff', 'right');
      }
      g.restore();
      confetti(g, t);
    }
  }

  function confetti(g, t) {
    const lt = t - T.done;
    if (lt < 0 || lt > 3) return;
    const cols = [CYAN, VIOLET, PINK, MINT, AMBER, '255,255,255'];
    for (let i = 0; i < 220; i++) {
      const fromLeft = i % 2 === 0;
      const ox = fromLeft ? 0 : W, oy = H * 0.85;
      const ang = (fromLeft ? -1 : -1) * (Math.PI / 2 - (0.15 + rnd(i * 3.3) * 0.75) * (fromLeft ? -1 : 1));
      const sp = 900 + rnd(i * 1.7) * 1300;
      const vx = Math.cos(ang) * sp * (fromLeft ? 1 : 1), vy = Math.sin(ang) * sp;
      const drag = 1.6, tt = lt;
      const f = (1 - Math.exp(-drag * tt)) / drag;
      const x = ox + vx * f + Math.sin(tt * 4 + i) * 30;
      const y = oy + vy * f + 420 * tt * tt * 0.6;
      const a = 1 - inv(1.8, 3, lt);
      if (a <= 0 || y > H + 40) continue;
      g.save();
      g.translate(x, y);
      g.rotate(tt * (4 + rnd(i) * 8) + i);
      g.scale(1, Math.cos(tt * (6 + rnd(i * 2) * 6) + i));
      g.globalAlpha = a;
      g.fillStyle = `rgb(${cols[i % cols.length]})`;
      g.fillRect(-7, -4, 14 + rnd(i * 5) * 8, 8);
      g.restore();
    }
  }

  // ---------- scene 6: tomorrow is ready ----------
  function sceneTomorrow(g, t) {
    if (t < T.tomorrow || t > T.end) return;
    const out = easeIn(inv(T.end - 0.5, T.end, t));
    // moon
    const mk2 = easeOut(inv(T.tomorrow, T.tomorrow + 1.2, t));
    g.save();
    g.globalAlpha = mk2 * (1 - out);
    glow(g, 1640, 190 + (1 - mk2) * 80, 300, '170,180,255', 0.35);
    g.fillStyle = '#e9ecff';
    g.beginPath(); g.arc(1640, 190 + (1 - mk2) * 80, 62, 0, TAU); g.fill();
    g.fillStyle = 'rgba(30,40,90,1)';
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(1668, 170 + (1 - mk2) * 80, 56, 0, TAU); g.fill();
    g.restore();

    g.save();
    const zs = 1 + out * 0.5;
    g.translate(W / 2, H / 2); g.scale(zs, zs); g.translate(-W / 2, -H / 2);
    g.globalAlpha = 1 - out;
    words(g, 'הולכים לישון *רגועים.*', W / 2, 190, 96, 800, t, T.tomorrow + 0.15);
    words(g, 'מחר כבר מחכה לך — מסודר.', W / 2, 300, 48, 300, t, T.tomorrow + 0.7, { color: 'rgba(225,230,255,0.8)', stagger: 0.06 });
    // tomorrow card
    const ck = back(clamp((t - (T.tomorrow + 0.4)) / 0.6));
    if (ck > 0) {
      const cw = 820, ch = 480, cx = W / 2, cy = 690 + (1 - ck) * 120;
      g.save();
      g.translate(cx, cy);
      g.globalAlpha *= clamp(ck);
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 80; g.shadowOffsetY = 30;
      rr(g, -cw / 2, -ch / 2, cw, ch, 40);
      g.fillStyle = 'rgba(28,30,58,0.82)'; g.fill();
      g.shadowColor = 'transparent';
      g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 2; g.stroke();
      text(g, 'מחר', cw / 2 - 50, -ch / 2 + 62, 48, 800, '#fff', 'right');
      text(g, 'יום חמישי', cw / 2 - 160, -ch / 2 + 66, 30, 400, 'rgba(255,255,255,0.55)', 'right');
      P.TOMORROW.forEach((r, i) => {
        const k = easeOut(clamp((t - P.TOMORROW_IN[i]) / 0.35));
        if (k <= 0) return;
        const y = -ch / 2 + 140 + i * 78;
        g.save();
        g.globalAlpha *= k;
        g.translate((1 - k) * 50, 0);
        rr(g, -cw / 2 + 40, y, cw - 80, 62, 18);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fill();
        text(g, r[0], cw / 2 - 70, y + 31, 28, 700, 'rgba(200,205,240,0.75)', 'right', 'ltr');
        text(g, r[1], cw / 2 - 200, y + 31, 32, 600, '#fff', 'right');
        g.restore();
      });
      // READY stamp
      const sk = clamp((t - T.ready) / 0.3);
      if (sk > 0) {
        const ss = lerp(2.2, 1, easeOut(sk));
        g.save();
        g.translate(-cw / 2 + 170, -ch / 2 + 64);
        g.rotate(-0.12);
        g.scale(ss, ss);
        g.globalAlpha *= sk;
        rr(g, -120, -40, 240, 80, 40);
        g.fillStyle = `rgba(${MINT},0.18)`; g.fill();
        g.strokeStyle = `rgb(${MINT})`; g.lineWidth = 4; g.stroke();
        g.strokeStyle = `rgb(${MINT})`; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
        checkPath(g, 70, 0, 50, 1); g.stroke();
        text(g, 'מוכן', -10, 3, 42, 900, `rgb(${MINT})`);
        g.restore();
      }
      g.restore();
    }
    g.restore();
  }

  // ---------- scene 7: end card ----------
  function storeBadge(g, x, y, label, kind) {
    const w = 330, h = 96;
    rr(g, x - w / 2, y - h / 2, w, h, 22);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2; g.stroke();
    // generic glyph: a play triangle or a store bag
    g.save();
    g.translate(x - w / 2 + 58, y);
    if (kind === 'play') {
      const gr = g.createLinearGradient(-20, -24, 24, 24);
      gr.addColorStop(0, `rgb(${CYAN})`); gr.addColorStop(0.5, `rgb(${MINT})`); gr.addColorStop(1, `rgb(${AMBER})`);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(-16, -24); g.lineTo(24, 0); g.lineTo(-16, 24); g.closePath(); g.fill();
    } else {
      g.fillStyle = '#fff';
      rr(g, -20, -12, 40, 36, 6); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 4;
      g.beginPath(); g.arc(0, -12, 11, Math.PI, 0); g.stroke();
    }
    g.restore();
    text(g, kind === 'play' ? 'GET IT ON' : 'Download on the', x - w / 2 + 104, y - 20, 20, 500, 'rgba(255,255,255,0.75)', 'left', 'ltr');
    text(g, label, x - w / 2 + 104, y + 16, 38, 700, '#fff', 'left', 'ltr');
  }
  function sceneEnd(g, t) {
    if (t < T.end) return;
    const lt = t - T.end;
    // flash rings
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const rt = lt - k * 0.15;
      if (rt <= 0) continue;
      const rad = easeOut(clamp(rt / 1.4)) * 1100;
      g.strokeStyle = `rgba(${[VIOLET, CYAN][k]},${0.6 * (1 - clamp(rt / 1.4))})`;
      g.lineWidth = 5;
      g.beginPath(); g.arc(W / 2, 360, rad, 0, TAU); g.stroke();
    }
    g.restore();
    const k = clamp(lt / 0.8);
    glow(g, W / 2, 360, 480, VIOLET, 0.5 * Math.min(1, k * 2));
    const ik = elastic(k);
    if (ik > 0.01) icon(g, W / 2, 360 - (1 - easeOut(k)) * 40, 250 * ik, t, easeOut(clamp(lt / 1.1)));
    const nk = easeOut(inv(T.end + 0.35, T.end + 0.9, t));
    if (nk > 0) {
      g.save();
      g.globalAlpha = nk;
      g.filter = `blur(${((1 - nk) * 12).toFixed(1)}px)`;
      g.shadowColor = `rgba(${VIOLET},0.7)`; g.shadowBlur = 50;
      text(g, 'יומי', W / 2, 615 + (1 - nk) * 30, 170, 900, '#fff');
      g.restore();
    }
    words(g, 'סדר יום *שמחייב.*', W / 2, 745, 64, 400, t, T.end + 0.9);
    const bk = easeOut(inv(T.end + 1.6, T.end + 2.2, t));
    if (bk > 0) {
      g.save();
      g.globalAlpha = bk;
      g.translate(0, (1 - bk) * 30);
      text(g, 'בקרוב', W / 2, 852, 32, 500, 'rgba(225,230,255,0.7)');
      storeBadge(g, W / 2 + 190, 945, 'App Store', 'apple');
      storeBadge(g, W / 2 - 190, 945, 'Google Play', 'play');
      g.restore();
    }
  }

  // ---------- frame ----------
  P.render = function (g, t) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    background(g, t);
    sceneChaos(g, t);
    sceneNight(g, t);
    sceneReveal(g, t);
    scenePhone(g, t);
    sceneTomorrow(g, t);
    sceneEnd(g, t);
    // flashes on the two big hits
    const fl = Math.max(pulse(t, T.reveal, 0.18), 0.85 * pulse(t, T.end, 0.15), 0.35 * pulse(t, T.done, 0.12));
    if (fl > 0.003) { g.fillStyle = `rgba(255,255,255,${fl})`; g.fillRect(0, 0, W, H); }
    // a beat of black before the reveal
    const blk = win(t, T.reveal - 0.12, T.reveal, 0.06, 0.0001);
    if (blk > 0) { g.fillStyle = `rgba(0,0,0,${blk})`; g.fillRect(0, 0, W, H); }
    // post
    g.drawImage(A.vignette, 0, 0);
    g.globalAlpha = 0.045;
    g.globalCompositeOperation = 'overlay';
    const ox = -Math.floor(rnd(Math.floor(t * 30)) * 512), oy = -Math.floor(rnd(Math.floor(t * 30) + 0.5) * 512);
    for (let x = ox; x < W; x += 512) for (let y = oy; y < H; y += 512) g.drawImage(A.grain, x, y);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // fade in / out
    const black = Math.max(1 - inv(0, 0.35, t), inv(T.fade, P.DUR - 0.1, t));
    if (black > 0) { g.fillStyle = `rgba(0,0,0,${black})`; g.fillRect(0, 0, W, H); }
    g.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
