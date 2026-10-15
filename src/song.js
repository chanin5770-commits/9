/* Empowering music video for Adir Getz — "שיעורי תורה באוזניות".
 *
 * Everything is a pure function of time t (seconds), so frames render
 * deterministically and stay in sync with the track. Audio features come from
 * assets/song/analysis.js (tools/analyze-song.py). No people: a procedural
 * sunrise over mountain ranges, black and gold like the cover.
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

  // ---------- the world: no people, only light and landscape ----------
  // The song is a sunrise: dark mountains under stars, the sun breaking the
  // horizon in the build, and full golden light in the last choruses.
  const hash = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const noise1 = (x, s) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i, s), hash(i + 1, s), u); };
  const ridge = (x, s) => { let v = 0, a = 0.5, q = 1; for (let o = 0; o < 5; o++) { v += a * (1 - Math.abs(noise1(x * q, s + o * 7) * 2 - 1)); a *= 0.5; q *= 2.1; } return v; };
  const keys = (pts) => (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (t < pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], smooth((t - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])));
    return pts[pts.length - 1][1];
  };
  // how far the sun has risen (0 = below the horizon, 1 = high)
  const rise = keys([[0, -0.15], [30, 0], [52.5, 0.28], [62.5, 0.34], [72.5, 0.42], [100, 0.7], [132.5, 0.86], [151, 1]]);
  // camera: horizon height (fraction of H) and zoom toward the sun
  const horizon = keys([[0, 0.66], [32.5, 0.7], [52.5, 0.76], [62.5, 0.72], [72.5, 0.78], [132.5, 0.8], [156, 0.74]]);
  const zoom = keys([[0, 1.0], [32.5, 1.1], [52.5, 1.0], [62.5, 1.06], [72.5, 1.0], [100, 1.12], [100.01, 1.0], [132.5, 1.1], [156, 1.18]]);
  const LAYERS = [ // far -> near
    { s: 3, sc: 0.0012, amp: 0.2, off: 0.0, par: 0.25, col: [26, 22, 14], rim: 0.9 },
    { s: 11, sc: 0.0017, amp: 0.3, off: 0.05, par: 0.5, col: [14, 12, 8], rim: 0.6 },
    { s: 19, sc: 0.0022, amp: 0.36, off: 0.13, par: 0.85, col: [7, 6, 4], rim: 0.4 },
    { s: 29, sc: 0.003, amp: 0.42, off: 0.24, par: 1.4, col: [0, 0, 0], rim: 0.25 },
  ];
  const HITS = [32.5, 52.5, 72.5, 100, 122.5];

  let grain = [], dust = [], embers = [], stars = [], streaks = [];
  SONG.load = async () => {
    const r = rng(7);
    for (let i = 0; i < 6; i++) {
      const g = document.createElement('canvas'); g.width = 480; g.height = 270;
      const gc = g.getContext('2d'), id = gc.createImageData(480, 270);
      for (let p = 0; p < id.data.length; p += 4) { const v = 128 + (r() - 0.5) * 255; id.data[p] = id.data[p + 1] = id.data[p + 2] = v; id.data[p + 3] = 255; }
      gc.putImageData(id, 0, 0); grain.push(g);
    }
    for (let i = 0; i < 70; i++) dust.push({ x: r(), y: r(), z: 0.3 + r() * 0.7, ph: r() * 6.28, sp: 0.004 + r() * 0.012 });
    for (let i = 0; i < 110; i++) embers.push({ x: r(), off: r(), sp: 0.12 + r() * 0.25, sw: r() * 6.28, z: 0.4 + r() * 0.6 });
    for (let i = 0; i < 220; i++) stars.push({ x: r(), y: r() * 0.7, m: r() * r(), ph: r() * 6.28 });
    for (let i = 0; i < 90; i++) streaks.push({ a: r() * Math.PI * 2, off: r(), sp: 0.6 + r() * 0.9, w: 0.5 + r() * 2 });
    await Promise.all([document.fonts.load('800 100px Heebo', 'אור'), document.fonts.load('500 60px Heebo', 'אור')]);
  };

  function drawWorld(ctx, t, e, f) {
    const hy = horizon(t) * H, R = rise(t);
    const sunX = W / 2, sunY = hy + 70 - R * H * 0.3;
    const light = clamp(0.15 + R) * smooth((t - 0.3) / 4); // overall daylight
    const pulse = e >= 2 ? beatPulse(t) * (0.4 + f.bass) : f.bass * 0.4;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    // camera: zoom toward the sun, a punch on the beat in the choruses
    const z = zoom(t) * (1 + (e >= 2 ? 0.022 * pulse : 0) + 0.03 * hitFlash(t));
    ctx.translate(sunX, hy); ctx.scale(z, z); ctx.translate(-sunX, -hy);

    // sky
    const sky = ctx.createLinearGradient(0, -200, 0, hy + 40);
    sky.addColorStop(0, `rgb(${2 + 10 * light | 0},${2 + 8 * light | 0},${4 + 3 * light | 0})`);
    sky.addColorStop(0.6, `rgb(${10 + 60 * light | 0},${8 + 42 * light | 0},${8 + 10 * light | 0})`);
    sky.addColorStop(1, `rgb(${30 + 190 * light | 0},${22 + 140 * light | 0},${8 + 30 * light | 0})`);
    ctx.fillStyle = sky;
    ctx.fillRect(-200, -200, W + 400, hy + 400);

    // stars fade as the sun comes up
    const starVis = clamp(1 - R * 2.2) * smooth((t - 0.5) / 3);
    if (starVis > 0) {
      for (const s of stars) {
        const a = starVis * (0.25 + 0.75 * s.m) * (0.6 + 0.4 * Math.sin(t * 2 + s.ph));
        ctx.fillStyle = `rgba(255,248,225,${a})`;
        const sz = 1 + 2.2 * s.m;
        ctx.fillRect(s.x * W - t * 3 * s.m, s.y * hy, sz, sz);
      }
    }

    ctx.globalCompositeOperation = 'screen';
    // sun glow
    const gr = 700 + 500 * light + 200 * pulse;
    const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, gr);
    g.addColorStop(0, `rgba(255,240,190,${0.9 * light})`);
    g.addColorStop(0.12, `rgba(255,214,90,${0.55 * light})`);
    g.addColorStop(0.4, `rgba(242,180,40,${0.18 * light})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sunX - gr, sunY - gr, gr * 2, gr * 2);
    // rays
    const rays = 18, rI = light * (0.35 + 0.35 * (e / 3) + 0.5 * pulse);
    for (let i = 0; i < rays; i++) {
      const ang = (i / rays) * Math.PI * 2 + t * 0.03 + 0.15 * Math.sin(i * 3.1);
      const len = 1900, sp = 0.035 + 0.025 * Math.sin(t * 0.4 + i * 1.3);
      const a = rI * (0.07 + 0.06 * Math.sin(t * 0.7 + i * 2.3));
      const rg = ctx.createRadialGradient(sunX, sunY, 60, sunX, sunY, len);
      rg.addColorStop(0, `rgba(255,232,150,${a})`);
      rg.addColorStop(1, 'rgba(255,232,150,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.arc(sunX, sunY, len, ang - sp, ang + sp);
      ctx.closePath();
      ctx.fill();
    }
    // the sun disc
    const sr = 70 + 25 * light + 10 * pulse;
    const core = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sr * 1.6);
    core.addColorStop(0, `rgba(255,255,245,${light})`);
    core.addColorStop(0.55, `rgba(255,236,150,${light})`);
    core.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(sunX, sunY, sr * 1.6, 0, Math.PI * 2); ctx.fill();

    // shockwave rings: one on every bar in the choruses, a big one on each hit
    const rings = [];
    if (e >= 1.8) {
      const bar = Math.floor((t - D.beat0) / BAR);
      for (let k = 0; k < 3; k++) rings.push([D.beat0 + (bar - k) * BAR, 0.5]);
    }
    for (const h of HITS) rings.push([h, 1]);
    for (const [r0, s] of rings) {
      const age = t - r0;
      if (age < 0 || age > 2.2) continue;
      const rad = 60 + age * (700 + 500 * s);
      ctx.strokeStyle = `rgba(255,222,110,${(1 - age / 2.2) * 0.55 * s})`;
      ctx.lineWidth = 3 + 10 * s * (1 - age / 2.2);
      ctx.beginPath();
      ctx.ellipse(sunX, sunY, rad, rad * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // warp streaks out of the sun at the peak
    const warp = clamp((e - 2.4) / 0.6);
    if (warp > 0) {
      ctx.lineCap = 'round';
      for (const s of streaks) {
        const life = (t * s.sp + s.off) % 1;
        const d0 = 120 + life * life * 1600, d1 = d0 + 40 + 260 * life * (0.6 + f.bass);
        ctx.strokeStyle = `rgba(255,236,170,${warp * Math.sin(life * Math.PI) * 0.5})`;
        ctx.lineWidth = s.w * (0.5 + life * 2);
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(s.a) * d0, sunY + Math.sin(s.a) * d0 * 0.6);
        ctx.lineTo(sunX + Math.cos(s.a) * d1, sunY + Math.sin(s.a) * d1 * 0.6);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // mountains, far to near, with a gold rim where the light catches the ridge
    const step = 8;
    LAYERS.forEach((L, li) => {
      const scroll = t * 22 * L.par;
      const base = hy + L.off * H;
      const ys = [];
      for (let x = -240; x <= W + 240; x += step) ys.push(base - L.amp * H * ridge((x + scroll) * L.sc, L.s) * (0.55 + 0.45 * noise1((x + scroll) * L.sc * 0.3, L.s + 50)));
      // body: lit from behind, haze toward the far layers
      const body = ctx.createLinearGradient(0, base - L.amp * H, 0, base + 200);
      const k = light * (1 - li / LAYERS.length);
      body.addColorStop(0, `rgb(${L.col[0] + 50 * k | 0},${L.col[1] + 36 * k | 0},${L.col[2] + 12 * k | 0})`);
      body.addColorStop(1, `rgb(${L.col[0]},${L.col[1]},${L.col[2]})`);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-240, H + 300);
      ys.forEach((y, i) => ctx.lineTo(-240 + i * step, y));
      ctx.lineTo(W + 240, H + 300);
      ctx.closePath();
      ctx.fill();
      // rim light, strongest near the sun
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const rim = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 1100);
      rim.addColorStop(0, `rgba(255,220,110,${L.rim * light * (0.8 + 0.6 * pulse)})`);
      rim.addColorStop(1, 'rgba(255,220,110,0)');
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ys.forEach((y, i) => (i ? ctx.lineTo(-240 + i * step, y) : ctx.moveTo(-240, y)));
      ctx.stroke();
      ctx.restore();
      // mist between the ranges
      if (li < LAYERS.length - 1) {
        const m = ctx.createLinearGradient(0, base - 60, 0, base + 90);
        m.addColorStop(0, 'rgba(0,0,0,0)');
        m.addColorStop(0.6, `rgba(${120 + 100 * light | 0},${100 + 70 * light | 0},${60 + 20 * light | 0},${0.1 + 0.12 * light})`);
        m.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = m;
        ctx.fillRect(-240, base - 60, W + 480, 150);
      }
    });

    // pillars of light rising from the ranges through the build
    const pil = clamp((t - 32.5) / 20) * (1 - smooth((t - 52.5) / 1.5)) + (e > 2.5 ? 0.6 : 0) * (1 - smooth((t - 130) / 2));
    if (pil > 0) {
      ctx.globalCompositeOperation = 'screen';
      const n = 9;
      for (let i = 0; i < n * clamp(pil * 1.2); i++) {
        const px = W * (0.08 + 0.84 * hash(i, 91));
        const on = Math.sin(t * 0.8 + i * 1.9) * 0.5 + 0.5;
        const a = pil * (0.12 + 0.18 * on) * (0.6 + 0.6 * pulse);
        const pg = ctx.createLinearGradient(0, hy + 60, 0, -200);
        pg.addColorStop(0, `rgba(255,226,130,${a})`);
        pg.addColorStop(1, 'rgba(255,226,130,0)');
        ctx.fillStyle = pg;
        const pw = 10 + 26 * hash(i, 17);
        ctx.fillRect(px - pw / 2, -200, pw, hy + 260);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // fade in from black at the start and down for the end card
    const dark = 1 - smooth((t - 0.2) / 3.5) * (1 - 0.7 * smooth((t - 150.5) / 1.8));
    if (dark > 0) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, W, H); }
  }


  // ---------- overlays ----------
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
      ctx.fillStyle = `rgba(255,244,200,${0.5 * fl})`;
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
  const BIG_Y = H * 0.4; // big words sit above the sun
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
    const band = ctx.createLinearGradient(0, BIG_Y - 260, 0, BIG_Y + 260);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.5, `rgba(0,0,0,${0.45 * smooth(k) * out})`);
    band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, BIG_Y - 260, W, 520);
    ctx.restore();
    // echo trail on the hit
    const echo = Math.exp(-(t - it.a) * 4);
    if (echo > 0.02) drawBig(ctx, it.txt, W / 2, BIG_Y, px * (1 + 0.18 * (1 - echo)), 1, 0.22 * echo, t);
    drawBig(ctx, it.txt, W / 2, BIG_Y, px, k, smooth(k * 2) * out, t);
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
      if (k > 0) drawBig(ctx, p, x - ws[i] / 2, BIG_Y, 150, k, smooth(k * 2) * out, t);
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
    drawWorld(ctx, t, e, f);
    drawParticles(ctx, t, e, f);
    drawFinish(ctx, t, e, f);
    drawWave(ctx, t, e);
    drawText(ctx, t, e);
    ctx.restore();
  };

  SONG.SECTIONS = SECTIONS;
  SONG.TEXT = TEXT;
})();
