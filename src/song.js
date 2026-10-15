/* Empowering music video for Adir Getz — "שיעורי תורה באוזניות".
 *
 * Everything is a pure function of time t (seconds), so frames render
 * deterministically and stay in sync with the track. Audio features come from
 * assets/song/analysis.js (tools/analyze-song.py). Palette follows the cover:
 * black and white, with the cover's yellow-gold as the only colour.
 */
(function () {
  'use strict';
  const D = window.SONG_DATA;
  const W = 1920, H = 1080;
  const SONG = (window.SONG = {});
  SONG.DUR = D.dur;
  SONG.W = W; SONG.H = H;

  const BEAT = 60 / D.bpm, BAR = 4 * BEAT;
  const GOLD = '#f2d42c', GOLD_DEEP = '#c9a40e';

  // ---------- helpers ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
  const easeOut = (k) => 1 - Math.pow(1 - clamp(k), 3);
  const easeOutBack = (k) => { k = clamp(k); const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const win = (t, a, b, fin, fout) => smooth((t - a) / fin) * (1 - smooth((t - (b - fout)) / fout));
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };

  const fidx = (t) => clamp(Math.round(t * D.fps), 0, D.rms.length - 1);
  const feat = (t) => { const i = fidx(t); return { rms: D.rms[i], bass: D.bass[i], high: D.high[i], onset: D.onset[i] }; };
  const beatPhase = (t) => { const b = (t - D.beat0) / BEAT; return b - Math.floor(b); };
  const beatPulse = (t) => Math.exp(-beatPhase(t) * 5);

  // ---------- song map (bars of 2.5s at 96 BPM) ----------
  // energy: 0 calm verse, 1 build, 2 chorus, 3 peak chorus
  const SECTIONS = [
    { t: 0, name: 'intro', energy: 0 },
    { t: 2.5, name: 'verse1', energy: 0 },
    { t: 32.5, name: 'build', energy: 1 },
    { t: 52.5, name: 'chorus1', energy: 2 },
    { t: 62.5, name: 'verse2', energy: 0 },
    { t: 72.5, name: 'chorus2', energy: 2 },
    { t: 100, name: 'chorus3', energy: 3 },
    { t: 132.5, name: 'outro', energy: 0 },
    { t: 151.25, name: 'end', energy: 0 },
  ];
  const section = (t) => { let s = SECTIONS[0]; for (const x of SECTIONS) if (t >= x.t) s = x; return s; };
  // smoothed energy level so letterbox, colour and glow glide between sections
  const energyAt = (t) => {
    let e = 0;
    for (let i = 0; i < SECTIONS.length; i++) {
      const a = SECTIONS[i], b = SECTIONS[i + 1];
      if (t >= a.t && (!b || t < b.t)) {
        const prev = i ? SECTIONS[i - 1].energy : 0;
        e = lerp(prev, a.energy, smooth((t - a.t) / 0.6));
        if (b && b.energy < a.energy) e = lerp(e, b.energy, smooth((t - (b.t - 1.5)) / 1.5));
        if (b && b.energy > a.energy) e = lerp(e, (a.energy + b.energy) / 2, smooth((t - (b.t - BAR)) / BAR)); // riser
      }
    }
    return e;
  };
  // hits: section starts that get a flash + punch
  const HITS = [32.5, 52.5, 72.5, 100, 122.5];

  // ---------- framings of the cover (source px, image is 1200x1200; title text sits below y≈700) ----------
  const F = {
    WIDE: { x: 600, y: 338, w: 1200 },
    FACE: { x: 650, y: 400, w: 780 },
    EYES: { x: 610, y: 440, w: 520 },
    HAIR: { x: 640, y: 300, w: 700 },
    ARM: { x: 330, y: 330, w: 640 },
    CHEST: { x: 780, y: 470, w: 700 },
    PROFILE: { x: 680, y: 430, w: 620 },
  };
  const P = (f, dx = 0, dy = 0, k = 1) => ({ x: f.x + dx, y: f.y + dy, w: f.w * k });

  // [start, end, from, to, flip]
  const SHOTS = [];
  const shot = (a, b, from, to, flip = false) => SHOTS.push([a, b, from, to, flip]);
  shot(0, 12.5, F.WIDE, P(F.FACE, 0, -20, 1.15));
  shot(12.5, 22.5, P(F.FACE, -40, 0), P(F.FACE, 30, 10, 0.88));
  shot(22.5, 32.5, P(F.EYES, -30, -10, 1.15), P(F.EYES, 20, 10, 0.95));
  // build: every two bars, slowly tightening
  [[F.ARM, P(F.ARM, 40, 0, 0.85)], [P(F.HAIR, -40), P(F.HAIR, 40, 0, 0.9)], [F.PROFILE, P(F.PROFILE, 0, 0, 0.8)], [P(F.FACE, 0, 0, 0.9), P(F.EYES, 0, 0, 1.1)]]
    .forEach(([a, b], i) => shot(32.5 + i * 5, 37.5 + i * 5, a, b, i % 2 === 1));
  // chorus 1: a cut on every bar
  [F.FACE, F.CHEST, F.EYES, F.WIDE].forEach((f, i) => shot(52.5 + i * BAR, 52.5 + (i + 1) * BAR, P(f, 0, 0, 1.08), P(f, 0, 0, 0.94), i % 2 === 1));
  shot(62.5, 72.5, P(F.WIDE, 0, 0, 1), P(F.PROFILE, 0, -20, 1.3));
  // big choruses: cut every two bars, cycling framings and mirroring
  const CYCLE = [F.FACE, F.ARM, F.EYES, F.WIDE, F.CHEST, F.HAIR, F.PROFILE];
  for (let t = 72.5, i = 0; t < 132.5 - 0.01; t += 2 * BAR, i++) {
    const f = CYCLE[i % CYCLE.length];
    shot(t, Math.min(t + 2 * BAR, 132.5), P(f, -30, 0, 1.1), P(f, 30, 0, 0.92), i % 3 === 1);
  }
  shot(132.5, 156, P(F.EYES, 0, 0, 1.2), F.WIDE);

  // ---------- text ----------
  // style: line (words reveal one by one; *word* is gold), punch (one huge word on the downbeat),
  // triad (three words landing on successive beats), title.
  const TEXT = [
    { a: 0.4, b: 4.6, s: 'title' },
    { a: 5.0, b: 11.6, s: 'line', txt: 'כל יום הוא *הזדמנות* להתחיל מחדש' },
    { a: 12.6, b: 21.6, s: 'line', txt: 'גם בחושך הכי עמוק — *יש אור*' },
    { a: 22.6, b: 31.6, s: 'line', txt: 'תקשיבו *לקול* שבפנים' },
    { a: 32.6, b: 37.2, s: 'line', txt: 'צעד *אחרי* צעד' },
    { a: 37.6, b: 42.2, s: 'line', txt: 'נופלים — *וקמים*' },
    { a: 42.6, b: 47.2, s: 'line', txt: 'לומדים. גדלים. *מתחזקים.*' },
    { a: 47.6, b: 52.2, s: 'line', txt: 'והלב *יודע* את הדרך' },
    { a: 52.5, b: 55.0, s: 'punch', txt: 'אמונה' },
    { a: 55.0, b: 57.5, s: 'punch', txt: 'כוח' },
    { a: 57.5, b: 60.0, s: 'punch', txt: 'תקווה' },
    { a: 60.0, b: 62.4, s: 'punch', txt: 'אור' },
    { a: 63.0, b: 67.3, s: 'line', txt: 'לא מחכים *לרגע המושלם*' },
    { a: 67.5, b: 72.2, s: 'line', txt: '*יוצרים* אותו' },
    { a: 72.5, b: 77.4, s: 'punch', txt: 'קדימה' },
    { a: 77.6, b: 82.3, s: 'line', txt: 'האור שבך *חזק* מכל חושך' },
    { a: 82.5, b: 87.4, s: 'punch', txt: 'מאמינים' },
    { a: 87.6, b: 92.3, s: 'line', txt: 'אף פעם *לא לבד* בדרך' },
    { a: 92.5, b: 97.4, s: 'punch', txt: 'חזקים' },
    { a: 97.6, b: 99.9, s: 'line', txt: '*וממשיכים...*' },
    { a: 100, b: 105, s: 'triad', txt: 'להאמין. ללמוד. לצמוח.' },
    { a: 105.1, b: 109.9, s: 'line', txt: 'כל רגע הוא *הזדמנות* לגדול' },
    { a: 110, b: 115, s: 'punch', txt: 'הכוח בפנים' },
    { a: 115.1, b: 119.9, s: 'line', txt: 'השמיים הם לא הגבול — *הם ההתחלה*' },
    { a: 120, b: 125, s: 'triad', txt: 'אמונה. כוח. אור.' },
    { a: 125.1, b: 130.2, s: 'line', txt: 'קדימה — *תמיד קדימה*' },
    { a: 134.0, b: 140.0, s: 'line', txt: 'קחו *נשימה*' },
    { a: 141.0, b: 146.8, s: 'line', txt: 'והמשיכו *להאמין*' },
    { a: 147.2, b: 151.0, s: 'line', txt: 'המסע *רק מתחיל*' },
    { a: 151.4, b: 156, s: 'end' },
  ];

  // ---------- assets ----------
  let cover = null, grain = [], dust = [], embers = [];
  SONG.load = async (base = '') => {
    const img = new Image();
    img.src = base + 'assets/song/cover.jpg';
    await img.decode();
    // pre-grade once: a touch more contrast, deeper blacks
    cover = document.createElement('canvas');
    cover.width = img.width; cover.height = img.height;
    const c = cover.getContext('2d');
    c.filter = 'grayscale(1) contrast(1.12) brightness(1.32)';
    c.drawImage(img, 0, 0);

    const r = rng(7);
    for (let i = 0; i < 6; i++) {
      const g = document.createElement('canvas'); g.width = 480; g.height = 270;
      const gc = g.getContext('2d'), id = gc.createImageData(480, 270);
      for (let p = 0; p < id.data.length; p += 4) { const v = 128 + (r() - 0.5) * 255; id.data[p] = id.data[p + 1] = id.data[p + 2] = v; id.data[p + 3] = 255; }
      gc.putImageData(id, 0, 0); grain.push(g);
    }
    for (let i = 0; i < 70; i++) dust.push({ x: r(), y: r(), z: 0.3 + r() * 0.7, ph: r() * 6.28, sp: 0.004 + r() * 0.012 });
    for (let i = 0; i < 90; i++) embers.push({ x: r(), off: r(), sp: 0.12 + r() * 0.25, sw: r() * 6.28, z: 0.4 + r() * 0.6 });
    await Promise.all([document.fonts.load('800 100px Heebo', 'אור'), document.fonts.load('500 60px Heebo', 'אור')]);
  };

  // ---------- layers ----------
  function drawShot(ctx, t, s, alpha, punch) {
    const [a, b, from, to, flip] = s;
    const k = smooth((t - a) / (b - a));
    let w = lerp(from.w, to.w, k) / punch;
    w = Math.min(w, 1200);
    const h = (w * H) / W;
    const x = clamp(lerp(from.x, to.x, k), w / 2, 1200 - w / 2);
    const y = clamp(lerp(from.y, to.y, k), h / 2, 700 - h / 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flip) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(cover, x - w / 2, y - h / 2, w, h, 0, 0, W, H);
    ctx.restore();
  }

  function drawBackground(ctx, t, e, f) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const punch = 1 + (e >= 2 ? 0.035 * beatPulse(t) * (0.5 + f.bass) : 0) + 0.02 * hitFlash(t);
    let cur = SHOTS.findIndex(([a, b]) => t >= a && t < b);
    if (cur < 0) cur = SHOTS.length - 1;
    const s = SHOTS[cur];
    // soft crossfades in calm parts, hard cuts once the song is driving
    const xf = e < 1.5 ? 0.9 : 0.12;
    const prev = SHOTS[cur - 1];
    if (prev && t - s[0] < xf && prev[1] === s[0]) {
      drawShot(ctx, t, prev, 1, punch);
      drawShot(ctx, t, s, smooth((t - s[0]) / xf), punch);
    } else drawShot(ctx, t, s, 1, punch);

    // exposure: fade up from black, dim for text-only end card
    const fadeIn = smooth((t - 0.2) / 3.2);
    const fadeOut = 1 - 0.75 * smooth((t - 150.5) / 1.6);
    const breathe = 0.9 + 0.1 * f.rms + 0.05 * e;
    const dark = 1 - clamp(fadeIn * fadeOut * breathe, 0, 1);
    if (dark > 0) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, W, H); }

    // gold grade: grows with energy, in the highlights only
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(242,212,44,${0.10 + 0.16 * (e / 3) + 0.10 * f.bass * (e / 3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawLight(ctx, t, e, f) {
    // light from the top-left, like the studio light on the cover, pulsing with the bass
    const I = (0.18 + 0.22 * (e / 3) + 0.35 * f.bass * (0.3 + e / 3)) * smooth(t / 3);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(-100, -150, 0, -100, -150, 1500);
    g.addColorStop(0, `rgba(255,236,150,${0.55 * I})`);
    g.addColorStop(0.35, `rgba(242,212,44,${0.18 * I})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // god rays
    const rays = 7;
    for (let i = 0; i < rays; i++) {
      const ang = 0.35 + i * 0.13 + 0.04 * Math.sin(t * 0.21 + i * 1.7);
      const len = 2400, spread = 0.025 + 0.02 * Math.sin(t * 0.33 + i);
      const a = (0.05 + 0.05 * Math.sin(t * 0.5 + i * 2.1)) * I * (1 + f.high);
      const rg = ctx.createLinearGradient(-100, -150, -100 + Math.cos(ang) * len, -150 + Math.sin(ang) * len);
      rg.addColorStop(0, `rgba(255,240,180,${a})`);
      rg.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(-100, -150);
      ctx.lineTo(-100 + Math.cos(ang - spread) * len, -150 + Math.sin(ang - spread) * len);
      ctx.lineTo(-100 + Math.cos(ang + spread) * len, -150 + Math.sin(ang + spread) * len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles(ctx, t, e, f) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const vis = smooth((t - 1) / 3) * (1 - smooth((t - 152) / 3));
    // drifting dust in the light
    for (const p of dust) {
      const x = ((p.x + Math.sin(t * 0.1 + p.ph) * 0.02 + 1) % 1) * W;
      const y = ((p.y - t * p.sp * p.z + 10) % 1) * H;
      const r = 1.5 + 5 * p.z * p.z;
      const a = vis * (0.12 + 0.25 * f.rms) * p.z * (0.6 + 0.4 * Math.sin(t * 1.3 + p.ph));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, `rgba(255,236,160,${a})`);
      g.addColorStop(1, 'rgba(255,236,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    // rising embers once the song lifts
    const amount = clamp((e - 0.8) / 2);
    if (amount > 0) {
      for (let i = 0; i < embers.length * amount; i++) {
        const p = embers[i];
        const life = (t * p.sp + p.off) % 1;
        const x = p.x * W + Math.sin(t * 1.5 + p.sw) * 30 * p.z;
        const y = H + 40 - life * (H + 120);
        const a = vis * Math.sin(life * Math.PI) * (0.35 + 0.65 * f.high) * p.z;
        const len = 10 + 26 * p.z * (0.5 + f.bass);
        ctx.strokeStyle = `rgba(255,${200 + 40 * p.z | 0},80,${a})`;
        ctx.lineWidth = 1.2 + 2 * p.z;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.cos(t * 1.5 + p.sw) * 4, y + len);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // the "headphones" line: a gold audio trace along the bottom, current moment in the centre
  function drawWave(ctx, t, e) {
    const vis = smooth((t - 2.5) / 2) * (1 - smooth((t - 150) / 2));
    if (vis <= 0) return;
    const n = 120, gap = W / n, lb = letterbox(t, e), y0 = lb > 40 ? H - lb / 2 : H - 60; // sits inside the bottom bar
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < n; i++) {
      const d = Math.abs(i - n / 2) / (n / 2);
      const v = feat(t - d * 1.6).rms;
      const h = 2 + v * (16 + 40 * (e / 3)) * (1 - d * 0.6);
      ctx.fillStyle = `rgba(242,212,44,${vis * (0.18 + 0.4 * (1 - d)) * (0.5 + 0.5 * e / 3)})`;
      ctx.fillRect(i * gap + gap * 0.3, y0 - h, gap * 0.4, h * 2);
    }
    ctx.restore();
  }

  const letterbox = (t, e) => 130 * clamp(1 - e / 1.6);

  const hitFlash = (t) => { let v = 0; for (const h of HITS) if (t >= h - 0.02) v = Math.max(v, Math.exp(-(t - h) * 6) * (t - h < 3 ? 1 : 0)); return v; };

  function drawFinish(ctx, t, e, f) {
    // flash on the big entrances
    const fl = hitFlash(t);
    if (fl > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,244,200,${0.75 * fl})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${0.62 - 0.12 * f.bass * (e / 3)})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    // grain
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.09;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(grain[Math.floor(t * 24) % grain.length], 0, 0, W, H);
    ctx.restore();
    // cinematic bars in the verses, opening up for the choruses
    const lb = letterbox(t, e);
    if (lb > 0.5) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, lb); ctx.fillRect(0, H - lb, W, lb); }
  }

  // ---------- typography ----------
  const font = (wgt, px) => `${wgt} ${px}px Heebo, sans-serif`;

  function words(txt) {
    // "*gold words*" markup -> [{w, gold}]
    const out = [];
    let gold = false;
    for (const raw of txt.split(' ')) {
      let w = raw, g = gold;
      if (w.startsWith('*')) { w = w.slice(1); g = true; gold = true; }
      if (w.endsWith('*')) { w = w.slice(0, -1); gold = false; }
      out.push({ w, gold: g });
    }
    return out;
  }

  function drawLine(ctx, t, it, e) {
    const ws = words(it.txt);
    const px = it.txt.length > 24 ? 74 : 86;
    ctx.save();
    ctx.font = font(700, px);
    ctx.direction = 'rtl';
    ctx.textBaseline = 'middle';
    const space = px * 0.28;
    const widths = ws.map((w) => ctx.measureText(w.w).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (ws.length - 1);
    const y = H - 225 + (e >= 2 ? -20 : 0);
    let x = W / 2 + total / 2; // RTL: start at the right edge
    const out = 1 - smooth((t - (it.b - 0.6)) / 0.6);
    ws.forEach((w, i) => {
      const k = easeOut((t - it.a - i * 0.16) / 0.7);
      if (k > 0) {
        ctx.globalAlpha = k * out;
        const cx = x - widths[i] / 2;
        const dy = (1 - k) * 28 - (1 - out) * 14;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 30;
        if (w.gold) {
          ctx.fillStyle = GOLD;
          ctx.fillText(w.w, cx, y + dy);
          ctx.shadowColor = 'rgba(242,212,44,0.55)';
          ctx.shadowBlur = 26 * (0.6 + 0.4 * beatPulse(t));
          ctx.fillText(w.w, cx, y + dy);
        } else {
          ctx.fillStyle = '#fff';
          ctx.fillText(w.w, cx, y + dy);
        }
      }
      x -= widths[i] + space;
    });
    // thin gold rule under the line
    const rk = easeOut((t - it.a - 0.2) / 1.2) * out;
    ctx.globalAlpha = rk;
    ctx.shadowBlur = 0;
    ctx.fillStyle = GOLD;
    const rw = Math.min(total * 0.5, 420) * rk;
    ctx.fillRect(W / 2 - rw / 2, y + px * 0.72, rw, 3);
    ctx.restore();
  }

  function drawBig(ctx, word, cx, cy, px, k, alpha, t) {
    ctx.save();
    ctx.translate(cx, cy);
    const sc = lerp(1.35, 1, easeOutBack(k)) * (1 + 0.025 * beatPulse(t));
    ctx.scale(sc, sc);
    ctx.font = font(900, px);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = alpha;
    // glow
    ctx.shadowColor = 'rgba(242,212,44,0.8)';
    ctx.shadowBlur = 60 + 40 * beatPulse(t);
    const g = ctx.createLinearGradient(0, -px / 2, 0, px / 2);
    g.addColorStop(0, '#fff6c4');
    g.addColorStop(0.45, GOLD);
    g.addColorStop(1, GOLD_DEEP);
    ctx.fillStyle = g;
    ctx.fillText(word, 0, 0);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeText(word, 0, 0);
    ctx.restore();
  }

  function drawPunch(ctx, t, it) {
    const k = (t - it.a) / 0.45;
    const out = 1 - smooth((t - (it.b - 0.35)) / 0.35);
    const px = it.txt.length > 6 ? 230 : 280;
    // dark band behind for legibility
    ctx.save();
    const band = ctx.createLinearGradient(0, H / 2 - 260, 0, H / 2 + 260);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.5, `rgba(0,0,0,${0.45 * smooth(k) * out})`);
    band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, H / 2 - 260, W, 520);
    ctx.restore();
    // echo trail on the hit
    const echo = Math.exp(-(t - it.a) * 4);
    if (echo > 0.02) drawBig(ctx, it.txt, W / 2, H / 2, px * (1 + 0.18 * (1 - echo)), 1, 0.22 * echo, t);
    drawBig(ctx, it.txt, W / 2, H / 2, px, k, smooth(k * 2) * out, t);
  }

  function drawTriad(ctx, t, it) {
    const parts = it.txt.split(' ');
    const out = 1 - smooth((t - (it.b - 0.4)) / 0.4);
    ctx.save();
    ctx.font = font(900, 150);
    const ws = parts.map((p) => ctx.measureText(p).width);
    ctx.restore();
    const gap = 70, total = ws.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
    let x = W / 2 + total / 2;
    parts.forEach((p, i) => {
      const at = it.a + i * 2 * BEAT; // one word every two beats, on the beat
      const k = (t - at) / 0.4;
      if (k > 0) drawBig(ctx, p, x - ws[i] / 2, H / 2, 150, k, smooth(k * 2) * out, t);
      x -= ws[i] + gap;
    });
  }

  function drawTitle(ctx, t, it, endCard) {
    const k = easeOut((t - it.a) / 1.4);
    const out = endCard ? 1 - smooth((t - 155) / 0.9) : 1 - smooth((t - (it.b - 0.8)) / 0.8);
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cy = endCard ? H / 2 - 20 : H / 2;
    ctx.globalAlpha = k * out;
    ctx.font = font(900, endCard ? 190 : 150);
    ctx.shadowColor = 'rgba(242,212,44,0.6)';
    ctx.shadowBlur = 50;
    ctx.fillStyle = GOLD;
    // letter-spacing opens up as it settles
    ctx.letterSpacing = `${lerp(40, 6, k)}px`;
    ctx.fillText('אדיר גץ', W / 2, cy - 50 + (1 - k) * 20);
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.letterSpacing = '4px';
    ctx.font = font(500, endCard ? 64 : 56);
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = easeOut((t - it.a - 0.5) / 1.2) * out;
    ctx.fillText('שיעורי תורה באוזניות', W / 2, cy + (endCard ? 110 : 85));
    const rw = 360 * easeOut((t - it.a - 0.3) / 1.5);
    ctx.fillStyle = GOLD;
    ctx.fillRect(W / 2 - rw / 2, cy + (endCard ? 40 : 30), rw, 3);
    ctx.restore();
  }

  function drawText(ctx, t, e) {
    for (const it of TEXT) {
      if (t < it.a || t >= it.b) continue;
      if (it.s === 'line') drawLine(ctx, t, it, e);
      else if (it.s === 'punch') drawPunch(ctx, t, it);
      else if (it.s === 'triad') drawTriad(ctx, t, it);
      else if (it.s === 'title') drawTitle(ctx, t, it, false);
      else if (it.s === 'end') drawTitle(ctx, t, it, true);
    }
  }

  // ---------- frame ----------
  SONG.render = (ctx, t) => {
    const e = energyAt(t), f = feat(t);
    ctx.save();
    drawBackground(ctx, t, e, f);
    drawLight(ctx, t, e, f);
    drawParticles(ctx, t, e, f);
    drawFinish(ctx, t, e, f);
    drawWave(ctx, t, e);
    drawText(ctx, t, e);
    ctx.restore();
  };

  SONG.SECTIONS = SECTIONS;
  SONG.TEXT = TEXT;
})();
