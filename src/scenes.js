/* Procedural, deterministic renderer for the "חשמלי" commercial.
 * AD.render(ctx, t, k) draws the frame at time t (seconds) onto a canvas whose
 * logical size is 1920x1080, scaled by k. Same t => same frame, always. */
(function (global) {
  'use strict';

  const AD = global.AD;
  const W = AD.W, H = AD.H, TAU = Math.PI * 2;

  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, x) => clamp((x - a) / (b - a));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const pulse = (t, t0, rise, fall) => (t < t0 ? 0 : t < t0 + rise ? (t - t0) / rise : Math.exp(-(t - t0 - rise) / fall));

  const BLUE = '70,160,255';
  const ICE = '190,228,255';
  const GOLD = '255,176,72';
  const AMBER = '255,140,40';

  // ---------- assets ----------
  const assets = { logo: null, grain: null, vignette: null, brushed: null };

  AD.loadAssets = function (base = '') {
    const logo = new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { assets.logo = prepLogo(img); res(); };
      img.onerror = rej;
      img.src = base + 'assets/logo.png';
    });
    const fonts = document.fonts
      ? Promise.all([document.fonts.load('300 56px Heebo', 'עוצמה'), document.fonts.load('500 56px Heebo', 'עוצמה')])
      : Promise.resolve();
    prepPost();
    return Promise.all([logo, fonts]);
  };

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Soft-fade the left/right ends of the wires so the logo floats in space.
  function prepLogo(img) {
    const c = makeCanvas(img.width, img.height);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    const grad = g.createLinearGradient(0, 0, c.width, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.13, 'rgba(0,0,0,1)');
    grad.addColorStop(0.87, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function prepPost() {
    const n = makeCanvas(512, 512), g = n.getContext('2d');
    const id = g.createImageData(512, 512);
    let s = 1234567;
    for (let i = 0; i < id.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = (s >> 8) & 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    assets.grain = n;

    const v = makeCanvas(W, H), vg = v.getContext('2d');
    const r = vg.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, 'rgba(0,0,0,0.78)');
    vg.fillStyle = r;
    vg.fillRect(0, 0, W, H);
    assets.vignette = v;

    // brushed metal texture
    const b = makeCanvas(1024, 1024), bg = b.getContext('2d');
    bg.fillStyle = '#14171c';
    bg.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 1400; i++) {
      const y = rnd(i * 3.1) * 1024, x = rnd(i * 7.7) * 1024, len = 80 + rnd(i * 1.3) * 500;
      const l = rnd(i * 9.9);
      bg.strokeStyle = l > 0.5 ? `rgba(255,255,255,${0.015 + l * 0.03})` : `rgba(0,0,0,${0.1 + l * 0.15})`;
      bg.lineWidth = 0.6 + rnd(i * 4.4) * 1.2;
      bg.beginPath(); bg.moveTo(x, y); bg.lineTo(x + len, y + (rnd(i) - 0.5) * 2); bg.stroke();
    }
    assets.brushed = b;
  }

  // ---------- drawing primitives ----------
  function pathOf(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }

  // Layered additive stroke: wide soft halo -> bright hot core.
  function glowPath(ctx, pts, w, rgb, a = 1) {
    if (a <= 0.002 || pts.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    pathOf(ctx, pts);
    const passes = [[9, 0.035], [4.2, 0.09], [2, 0.26], [0.9, 0.75]];
    for (const [m, al] of passes) {
      ctx.strokeStyle = `rgba(${rgb},${al * a})`;
      ctx.lineWidth = w * m;
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`;
    ctx.lineWidth = Math.max(0.7, w * 0.32);
    ctx.stroke();
    ctx.restore();
  }

  function flare(ctx, x, y, r, a, rgb = '120,190,255', streak = 1) {
    if (a <= 0.002 || r <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${Math.min(1, a)})`);
    g.addColorStop(0.1, `rgba(${rgb},${a * 0.7})`);
    g.addColorStop(0.4, `rgba(${rgb},${a * 0.16})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (streak > 0) {
      ctx.translate(x, y);
      ctx.scale(7 * streak, 0.05);
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(${rgb},${a * 0.8})`);
      g.addColorStop(0.35, `rgba(${rgb},${a * 0.2})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // Midpoint-displacement lightning between two points.
  function boltPts(x1, y1, x2, y2, seed, depth = 5, jit = 0.28) {
    let pts = [[x1, y1], [x2, y2]];
    let amp = Math.hypot(x2 - x1, y2 - y1) * jit;
    for (let d = 0; d < depth; d++) {
      const np = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
        const off = (rnd(seed + d * 97.3 + i * 13.7) - 0.5) * amp;
        np.push([(ax + bx) / 2 - (dy / L) * off, (ay + by) / 2 + (dx / L) * off], pts[i + 1]);
      }
      pts = np;
      amp *= 0.52;
    }
    return pts;
  }

  // Ballistic sparks; origin may be a function of birth time (moving emitter).
  function sparks(ctx, origin, t, t0, n, seed, o = {}) {
    const spread = o.spread ?? 0.1, s0 = o.speed?.[0] ?? 200, s1 = o.speed?.[1] ?? 800;
    const l0 = o.life?.[0] ?? 0.3, l1 = o.life?.[1] ?? 0.9, g = o.grav ?? 900;
    const a0 = o.angle ?? -Math.PI / 2, cone = o.cone ?? TAU, sc = o.scale ?? 1, slow = o.slow ?? 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const b = t0 + rnd(seed + i * 7.13) * spread;
      const life = lerp(l0, l1, rnd(seed + i * 3.7));
      const age = (t - b) * slow;
      if (age < 0 || age > life) continue;
      const O = typeof origin === 'function' ? origin(b) : origin;
      if (!O) continue;
      const ang = a0 + (rnd(seed + i * 1.91) - 0.5) * cone;
      const sp = lerp(s0, s1, rnd(seed + i * 5.3)) * sc;
      const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
      const drag = Math.exp(-age * 1.5);
      const x = O[0] + vx * age * drag, y = O[1] + vy * age * drag + 0.5 * g * sc * age * age;
      const dvx = vx * drag, dvy = vy * drag + g * sc * age;
      const k = 1 - age / life;
      ctx.strokeStyle = `rgba(255,${(170 + 85 * k) | 0},${(70 + 170 * k * k) | 0},${Math.min(1, k * 1.3)})`;
      ctx.lineWidth = (0.9 + 2.2 * k) * sc;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dvx * 0.03, y - dvy * 0.03);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Floating dust / bokeh, lit by an optional light position.
  function dust(ctx, t, seed, n, a, rgb = ICE, light = null) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const x = ((rnd(seed + i) * W + t * (rnd(seed + i * 2.3) - 0.5) * 60) % W + W) % W;
      const y = ((rnd(seed + i * 4.1) * H - t * (8 + rnd(seed + i * 5.9) * 20)) % H + H) % H;
      const r = 0.8 + rnd(seed + i * 6.6) * (i % 9 === 0 ? 7 : 2.2);
      let al = a * (0.3 + 0.7 * rnd(seed + i * 8.8)) * (0.6 + 0.4 * Math.sin(t * 2 + i));
      if (light) al *= clamp(1.4 - Math.hypot(x - light[0], y - light[1]) / light[2], 0, 1.4);
      if (al <= 0.003) continue;
      ctx.fillStyle = `rgba(${rgb},${al * (r > 4 ? 0.25 : 1)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function overlay(ctx, color, a, mode = 'source-over') {
    if (a <= 0.002) return;
    ctx.save();
    ctx.setTransform(ctx.__k, 0, 0, ctx.__k, 0, 0);
    ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = clamp(a);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function shade(v, rgb) { return `rgb(${(rgb[0] * v) | 0},${(rgb[1] * v) | 0},${(rgb[2] * v) | 0})`; }

  // =====================================================================
  // SCENE 0 — black, then the very first spark
  // =====================================================================
  function sceneIntro(ctx, t) {
    const S = 1.62;
    const k = pulse(t, S, 0.02, 0.09);
    if (t > S) {
      flare(ctx, 960, 540, 260, k * 0.9, BLUE, 0.8);
      if (t < S + 0.12) {
        for (let i = 0; i < 3; i++) {
          const a = rnd(i + 3) * TAU;
          glowPath(ctx, boltPts(960, 540, 960 + Math.cos(a) * 90, 540 + Math.sin(a) * 60, 40 + i * 7 + Math.floor(t * 40), 4), 1.6, ICE, 1 - inv(S, S + 0.12, t));
        }
      }
      sparks(ctx, [960, 540], t, S, 34, 11, { spread: 0.04, speed: [250, 900], life: [0.25, 0.75], grav: 1100 });
    }
    // second, bigger crack right before the cut
    const k2 = pulse(t, 1.9, 0.03, 0.05);
    flare(ctx, 960, 540, 520, k2 * 0.8, ICE, 1.6);
  }

  // =====================================================================
  // SCENE 1 — macro industrial cable, energy pulse racing inside
  // =====================================================================
  const cablePulseS = (lt) => lerp(2.5, 31, 0.55 * easeIn(inv(0.3, 3.9, lt)) + 0.45 * inv(0.3, 3.9, lt));

  function sceneCable(ctx, t) {
    const lt = t - 2;
    const f = 900;
    const sp = cablePulseS(lt);
    const follow = (s) => Math.max(0, s - 2.5) * 0.74;
    const cam = follow(sp);
    const camX = cam * 0.55 + lerp(0, 0.6, ease(inv(0, 4, lt)));
    const camY = -cam * 0.12;
    const camZ = cam;
    const ignite = inv(0.3, 0.42, lt);
    const expo = 0.25 + 0.75 * inv(0, 0.6, lt);

    const P = (s) => {
      const x = -3 + s * 0.55 - camX, y = 1.25 - s * 0.12 - camY, z = 2 + s - camZ;
      return z > 0.35 ? [W / 2 + (x / z) * f, H / 2 + (y / z) * f, (0.62 / z) * f, z] : null;
    };

    // background haze lit by the pulse
    const pp = P(sp);
    if (pp) {
      const g = ctx.createRadialGradient(pp[0], pp[1], 0, pp[0], pp[1], 900);
      g.addColorStop(0, `rgba(30,70,140,${0.35 * ignite})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    dust(ctx, t, 77, 70, 0.35 * expo, ICE, pp ? [pp[0], pp[1], 700] : null);

    // tube as stacked shaded cross-sections, far -> near
    const sFar = camZ + 42;
    let s = sFar;
    const slices = [];
    while (s > 0) {
      const p = P(s);
      if (!p) break;
      slices.push([s, p]);
      s -= Math.max(0.018, 0.02 * p[3]);
    }
    for (let i = 0; i < slices.length; i++) {
      const [ss, p] = slices[i];
      const q = P(ss + 0.2) || p;
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const [x, y, r, z] = p;
      if (x + r < -50 || x - r > W + 50 || y - r > H + 50 || y + r < -50) continue;
      const rib = 0.5 + 0.5 * Math.sin(ss * TAU * 2.4);
      const fog = clamp(1.25 - z / 34);
      const d = ss - sp;
      const em = ignite * (Math.exp(-(d * d) / 0.9) + (d < 0 ? 0.35 * Math.exp(d / 5) : 0));
      const v = 1.35 * expo * fog * (0.78 + 0.22 * rib);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, -r, 0, r);
      const e = (base, add) => [base[0] + add[0] * em, base[1] + add[1] * em, base[2] + add[2] * em];
      g.addColorStop(0, shade(v, e([10, 12, 16], [10, 40, 90])));
      g.addColorStop(0.18, shade(v, e([70, 78, 92], [60, 140, 255])));
      g.addColorStop(0.32, shade(v, e([34, 38, 46], [40, 110, 230])));
      g.addColorStop(0.7, shade(v, e([14, 16, 20], [20, 70, 170])));
      g.addColorStop(0.93, shade(v, e([6, 7, 9], [10, 30, 80])));
      g.addColorStop(1, shade(v, e([22, 34, 52], [40, 100, 200])));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.3, r, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    if (pp) {
      // glowing core trail inside the cable
      const trail = [];
      for (let k = 0; k <= 16; k++) {
        const p = P(sp - k * 0.45);
        if (p) trail.push(p);
      }
      for (let k = 0; k < trail.length - 1; k++) {
        glowPath(ctx, [trail[k], trail[k + 1]], trail[k][2] * 0.16, BLUE, ignite * 0.6 * (1 - k / 16));
      }
      const r = pp[2];
      flare(ctx, pp[0], pp[1], r * 4.2, ignite * 0.95, BLUE, 1.2);
      flare(ctx, pp[0], pp[1], r * 1.3, ignite, ICE, 0);
      // arcs crawling over the jacket
      const fr = Math.floor(t * 30);
      for (let i = 0; i < 5; i++) {
        const a = rnd(fr * 3.1 + i) * TAU;
        const len = r * (1.2 + rnd(fr + i * 9) * 1.4);
        glowPath(ctx, boltPts(pp[0], pp[1], pp[0] + Math.cos(a) * len, pp[1] + Math.sin(a) * len * 0.7, fr * 17 + i * 5, 5),
          Math.max(1.2, r * 0.035), ICE, ignite * (0.5 + 0.5 * rnd(fr + i)));
      }
      sparks(ctx, (b) => { const q = P(cablePulseS(b - 2)); return q ? [q[0], q[1] - q[2] * 0.6] : null; },
        t, 2.35, 120, 21, { spread: 3.3, speed: [150, 700], life: [0.3, 0.9], grav: 700, scale: 0.9 });
    }

    // whip into the next shot
    const out = inv(5.55, 6.0, t);
    if (out > 0 && pp) flare(ctx, pp[0], pp[1], 300 + out * 1600, out, ICE, 2);
    overlay(ctx, '#dff0ff', easeIn(inv(5.75, 6.0, t)) * 0.9);
    overlay(ctx, '#000', 1 - inv(2.0, 2.12, t));
  }

  // =====================================================================
  // SCENE 2 — advanced switchboard, breakers close one by one
  // =====================================================================
  function sceneBoard(ctx, t) {
    const lt = t - 6;
    const sc = lerp(1.0, 1.13, ease(inv(0, 3.5, lt)));
    const px = lerp(40, -40, ease(inv(0, 3.5, lt)));
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2 + px, -H / 2);

    // cabinet
    ctx.drawImage(assets.brushed, 60, 40, 1800, 1000);
    let g = ctx.createLinearGradient(0, 40, 0, 1040);
    g.addColorStop(0, 'rgba(40,50,64,0.35)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = g;
    ctx.fillRect(60, 40, 1800, 1000);
    ctx.strokeStyle = 'rgba(160,180,210,0.25)';
    ctx.lineWidth = 3;
    ctx.strokeRect(90, 70, 1740, 940);

    // busbars
    const busFront = lerp(150, 1770, easeOut(inv(0.02, 0.45, lt)));
    for (let b = 0; b < 3; b++) {
      const y = 150 + b * 42;
      g = ctx.createLinearGradient(0, y, 0, y + 22);
      g.addColorStop(0, '#9a6a3a'); g.addColorStop(0.4, '#d39a5c'); g.addColorStop(1, '#4a2c14');
      ctx.fillStyle = g;
      ctx.fillRect(150, y, 1620, 22);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(150, y, 1620, 22);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = '#20242b';
        ctx.fillRect(200 + i * 190, y - 4, 26, 30);
      }
      glowPath(ctx, [[150, y + 11], [busFront, y + 11]], 5, BLUE, 0.75);
      flare(ctx, busFront, y + 11, 90, 1 - inv(0.4, 0.6, lt), ICE, 0.6);
    }

    // breakers
    const N = AD.BREAKERS.length;
    for (let i = 0; i < N; i++) {
      const x = 250 + i * 182, y = 330, w = 148, h = 380;
      const T = AD.BREAKERS[i];
      const on = inv(T, T + 0.07, t);
      const lit = inv(T, T + 0.25, t);
      // feeder from busbar
      ctx.fillStyle = '#2a2f37';
      ctx.fillRect(x + w / 2 - 9, 236, 18, 96);
      glowPath(ctx, [[x + w / 2, 236], [x + w / 2, 330]], 6, BLUE, lit * 0.85);
      // body
      g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, '#1b1e23'); g.addColorStop(0.25, '#363b44'); g.addColorStop(0.6, '#262a31'); g.addColorStop(1, '#121418');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
      ctx.strokeStyle = `rgba(${BLUE},${0.15 + 0.55 * lit})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      // screws
      for (const sy of [y + 22, y + h - 22]) {
        ctx.fillStyle = '#5c636e';
        ctx.beginPath(); ctx.arc(x + w / 2, sy, 9, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#1a1c20'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x + w / 2 - 6, sy); ctx.lineTo(x + w / 2 + 6, sy); ctx.stroke();
      }
      // LED
      ctx.fillStyle = lit > 0 ? `rgb(${(60 + 195 * lit) | 0},${(30 + 110 * lit) | 0},20)` : '#2a1608';
      ctx.beginPath(); ctx.arc(x + w / 2, y + 62, 9, 0, TAU); ctx.fill();
      flare(ctx, x + w / 2, y + 62, 70, lit * 0.8, AMBER, 0.3);
      // lever slot + lever
      ctx.fillStyle = '#07080a';
      ctx.beginPath(); ctx.roundRect(x + w / 2 - 26, y + 115, 52, 150, 8); ctx.fill();
      const ly = lerp(y + 205, y + 120, on);
      g = ctx.createLinearGradient(0, ly, 0, ly + 56);
      g.addColorStop(0, '#e8ecf2'); g.addColorStop(0.5, '#a3aab4'); g.addColorStop(1, '#5e646d');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(x + w / 2 - 22, ly, 44, 56, 6); ctx.fill();
      // label plate
      ctx.fillStyle = '#0d0f12';
      ctx.fillRect(x + 20, y + 290, w - 40, 46);
      ctx.fillStyle = `rgba(${ICE},${0.12 + 0.25 * lit})`;
      ctx.fillRect(x + 30, y + 302, w - 80, 5);
      ctx.fillRect(x + 30, y + 318, w - 100, 4);
      // outgoing cable lights downward
      const cx = x + w / 2;
      const head = easeOut(inv(T + 0.05, T + 0.55, t));
      ctx.strokeStyle = '#0c0d10';
      ctx.lineWidth = 22;
      ctx.beginPath(); ctx.moveTo(cx, y + h); ctx.bezierCurveTo(cx, 860, cx + (i - 3.5) * 30, 900, cx + (i - 3.5) * 40, 1060); ctx.stroke();
      if (head > 0) {
        const pts = [];
        for (let k = 0; k <= 20; k++) {
          const u = (k / 20) * head;
          const bx = Math.pow(1 - u, 3) * cx + 3 * Math.pow(1 - u, 2) * u * cx + 3 * (1 - u) * u * u * (cx + (i - 3.5) * 30) + u * u * u * (cx + (i - 3.5) * 40);
          const by = Math.pow(1 - u, 3) * (y + h) + 3 * Math.pow(1 - u, 2) * u * 860 + 3 * (1 - u) * u * u * 900 + u * u * u * 1060;
          pts.push([bx, by]);
        }
        glowPath(ctx, pts, 5, BLUE, 0.7);
      }
      sparks(ctx, [cx, ly + 10], t, T, 14, 300 + i * 31, { spread: 0.015, speed: [120, 480], life: [0.12, 0.4], grav: 1400, scale: 0.8 });
      flare(ctx, cx, ly + 20, 160, pulse(t, T, 0.01, 0.06) * 0.7, ICE, 0.8);
    }

    // DIN rail
    ctx.fillStyle = '#3b414b';
    ctx.fillRect(150, 515, 1620, 14);

    ctx.restore();

    // volumetric top light
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    g = ctx.createLinearGradient(0, 0, 900, 1080);
    g.addColorStop(0, 'rgba(80,140,255,0.10)');
    g.addColorStop(0.5, 'rgba(80,140,255,0.02)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(300, 0); ctx.lineTo(820, 0); ctx.lineTo(1400, 1080); ctx.lineTo(600, 1080); ctx.fill();
    ctx.restore();
    dust(ctx, t, 501, 60, 0.3, ICE);

    overlay(ctx, '#dff0ff', (1 - inv(6.0, 6.3, t)) * 0.85);
    overlay(ctx, '#000', 0.55 * (1 - inv(6.0, 6.5, t)));
    overlay(ctx, '#e8f4ff', easeIn(inv(9.3, 9.5, t)) * 0.7);
  }

  // =====================================================================
  // SCENE 3 — high-speed flight along cable trays
  // =====================================================================
  function sceneConduit(ctx, t) {
    const lt = t - 9.5;
    const camZ = lt * 7 + lt * lt * 2.4;
    const f = 820;
    const roll = Math.sin(lt * 1.1) * 0.06;
    const front = camZ + 1 + lt * 30;
    const zMax = 95;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(roll);
    const proj = (x, y, z) => { const dz = z - camZ; return dz > 0.25 ? [(x / dz) * f, (y / dz) * f, f / dz, dz] : null; };
    const fog = (dz) => clamp(1.15 - dz / 70);

    // vanishing glow
    let g = ctx.createRadialGradient(0, 0, 0, 0, 0, 700);
    g.addColorStop(0, 'rgba(40,90,170,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-W, -H, 2 * W, 2 * H);

    // structural frames
    const step = 3;
    for (let z = Math.ceil((camZ + zMax) / step) * step; z > camZ + 0.3; z -= step) {
      const a = proj(-4.2, -2.8, z), b = proj(4.2, 2.6, z);
      if (!a || !b) continue;
      const fo = fog(a[3]);
      ctx.strokeStyle = `rgba(110,125,150,${0.35 * fo})`;
      ctx.lineWidth = Math.min(40, a[2] * 0.12);
      ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      // ceiling fixture
      if (Math.round(z / step) % 2 === 0) {
        const c = proj(0, -2.75, z);
        const on = z < front ? 1 : 0;
        ctx.fillStyle = on ? `rgba(255,236,200,${0.85 * fo})` : `rgba(60,60,60,${fo})`;
        ctx.fillRect(c[0] - c[2] * 0.5, c[1] - c[2] * 0.03, c[2], c[2] * 0.06);
        if (on) flare(ctx, c[0], c[1], c[2] * 0.9, 0.35 * fo, GOLD, 0.3);
      }
    }

    // floor sheen
    const fl = proj(0, 2.6, camZ + 1.2);
    g = ctx.createLinearGradient(0, 0, 0, H / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(20,40,70,0.35)');
    ctx.fillStyle = g;
    if (fl) ctx.fillRect(-W, 30, 2 * W, H);

    // cable trays
    const trays = [[-3.4, -2.3], [3.4, -2.3], [-1.3, -2.55], [1.3, -2.55], [-3.95, -0.7], [3.95, -0.7], [-3.95, 0.7], [3.95, 0.7], [-2.2, 2.55], [2.2, 2.55]];
    trays.forEach(([x, y], ti) => {
      const pts = [];
      for (let k = 0; k <= 34; k++) {
        const z = camZ + 0.3 + Math.pow(k / 34, 2) * zMax;
        const p = proj(x, y, z);
        if (p) pts.push([p[0], p[1], p[2], z]);
      }
      // dim tray body
      ctx.strokeStyle = 'rgba(70,78,92,0.6)';
      ctx.lineCap = 'round';
      for (let k = 0; k < pts.length - 1; k++) {
        ctx.lineWidth = pts[k][2] * 0.22;
        ctx.globalAlpha = fog(pts[k][3] - camZ);
        ctx.beginPath(); ctx.moveTo(pts[k][0], pts[k][1]); ctx.lineTo(pts[k + 1][0], pts[k + 1][1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // lit section
      for (let k = 0; k < pts.length - 1; k++) {
        if (pts[k][3] > front) break;
        glowPath(ctx, [pts[k], pts[k + 1]], Math.min(16, pts[k][2] * 0.05), ti % 3 === 2 ? GOLD : BLUE, 0.75 * fog(pts[k][3] - camZ));
      }
      // racing pulses
      for (let j = 0; j < 2; j++) {
        const pz = camZ + 2 + ((lt * 38 + rnd(ti * 5 + j) * 60) % 60);
        if (pz > front) continue;
        const p = proj(x, y, pz);
        if (p) flare(ctx, p[0], p[1], Math.min(260, p[2] * 0.5), 0.9 * fog(p[3]), ICE, 0.6);
      }
    });

    // speed streaks
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const a = rnd(i * 3.3) * TAU, r0 = ((lt * (600 + rnd(i) * 900) + rnd(i * 7) * 900) % 900) + 60;
      const len = 30 + r0 * 0.25;
      ctx.strokeStyle = `rgba(${ICE},${0.12 * inv(60, 400, r0)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.6);
      ctx.lineTo(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len) * 0.6);
      ctx.stroke();
    }
    ctx.restore();

    overlay(ctx, '#e8f4ff', (1 - inv(9.5, 9.75, t)) * 0.7);
    overlay(ctx, '#000', easeIn(inv(12.2, 12.5, t)));
  }

  // =====================================================================
  // SCENE 4 — modern tower at night lights up floor by floor
  // =====================================================================
  const CITY = [];
  for (let i = 0; i < 46; i++) {
    const x = -500 + i * 62 + rnd(i * 3) * 30;
    if (x > 520 && x < 1400) continue;
    CITY.push({ x, w: 60 + rnd(i * 5) * 110, h: 150 + rnd(i * 7) * 430 + (Math.abs(x - 960) < 900 ? 80 : 0), seed: i });
  }

  function drawTower(ctx, t, reflected) {
    const x0 = 600, x1 = 1320, top = 150, ground = 900;
    const n = AD.FLOORS, fh = (ground - top) / n, cols = 14, cw = (x1 - x0) / cols;
    let g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#0b1424'); g.addColorStop(0.5, '#070d18'); g.addColorStop(1, '#03060c');
    ctx.fillStyle = g;
    ctx.fillRect(x0, top, x1 - x0, ground - top);
    for (let k = 0; k < n; k++) {
      const T = AD.floorTime(k);
      const lit = inv(T, T + 0.12, t);
      const yb = ground - k * fh;
      for (let j = 0; j < cols; j++) {
        const r = rnd(k * 31 + j * 7);
        const q2 = rnd(k * 13 + j);
        const b = lit * (r < 0.24 ? 0.1 : 0.35 + 0.55 * q2 * q2);
        const wx = x0 + j * cw + 7, wy = yb - fh + 9;
        ctx.fillStyle = b > 0.01 ? (r > 0.85 ? `rgba(200,225,255,${b})` : `rgba(255,${(170 + 40 * r) | 0},${(80 + 50 * r) | 0},${b})`) : 'rgba(30,44,70,0.3)';
        ctx.fillRect(wx, wy, cw - 14, fh - 16);
      }
      if (lit > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(${GOLD},${0.07 * lit})`;
        ctx.fillRect(x0 - 30, yb - fh - 10, x1 - x0 + 60, fh + 20);
        ctx.restore();
        glowPath(ctx, [[x0, yb - 2], [x1, yb - 2]], 2.2, BLUE, 0.55 * lit);
      }
    }
    // mullions
    ctx.strokeStyle = 'rgba(4,8,14,0.9)';
    ctx.lineWidth = 3;
    for (let j = 0; j <= cols; j++) {
      ctx.beginPath(); ctx.moveTo(x0 + j * cw, top); ctx.lineTo(x0 + j * cw, ground); ctx.stroke();
    }
    // corner LED strips climbing with the energy
    const climb = inv(AD.floorTime(0) - 0.05, AD.floorTime(n - 1) + 0.12, t);
    if (climb > 0) {
      const yTop = lerp(ground, top, climb);
      glowPath(ctx, [[x0, ground], [x0, yTop]], 4, BLUE, 0.9);
      glowPath(ctx, [[x1, ground], [x1, yTop]], 4, BLUE, 0.9);
      if (!reflected && climb < 1) {
        flare(ctx, x0, yTop, 120, 0.9, ICE, 0.6);
        flare(ctx, x1, yTop, 120, 0.9, ICE, 0.6);
      }
    }
    // crown
    const crown = inv(AD.floorTime(n - 1) + 0.1, AD.floorTime(n - 1) + 0.4, t);
    glowPath(ctx, [[x0 - 10, top], [x1 + 10, top]], 5, ICE, crown);
    if (!reflected) flare(ctx, 960, top, 600, crown * 0.35 * (1 - 0.5 * inv(16, 17, t)), BLUE, 1.4);
  }

  function sceneBuilding(ctx, t) {
    const lt = t - 12.5;
    const pb = ease(inv(0.15, 4.3, lt));
    const sc = lerp(1.8, 1.0, pb);
    const cy = lerp(830, 540, pb);
    const ground = 900;

    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#010309'); g.addColorStop(0.75, '#0a1430'); g.addColorStop(1, '#050a18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -cy);

    // background city — wakes up after the tower
    for (const b of CITY) {
      ctx.fillStyle = '#050911';
      ctx.fillRect(b.x, ground - b.h, b.w, b.h);
      const rows = Math.floor(b.h / 26), colsN = Math.floor(b.w / 18);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < colsN; c++) {
          const q = rnd(b.seed * 101 + r * 7 + c);
          if (q > 0.42) continue;
          const on = inv(15.2 + q * 3.2, 15.4 + q * 3.2, t);
          const a = 0.06 + on * (0.25 + q);
          ctx.fillStyle = `rgba(255,190,120,${a})`;
          ctx.fillRect(b.x + 5 + c * 18, ground - b.h + 8 + r * 26, 8, 12);
        }
      }
    }

    drawTower(ctx, t, false);

    // reflection in the wet plaza
    ctx.save();
    ctx.translate(0, 2 * ground);
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.25;
    drawTower(ctx, t, true);
    ctx.restore();
    g = ctx.createLinearGradient(0, ground, 0, ground + 420);
    g.addColorStop(0, 'rgba(3,6,14,0.35)');
    g.addColorStop(1, 'rgba(3,6,14,1)');
    ctx.fillStyle = g;
    ctx.fillRect(-600, ground, W + 1200, 800);

    // ground feeder line carrying the energy in
    const feed = easeOut(inv(12.55, 13.05, t));
    if (feed > 0) {
      const fx = lerp(-400, 600, feed);
      glowPath(ctx, [[-400, ground + 4], [fx, ground + 4]], 4, BLUE, 0.9);
      if (feed < 1) flare(ctx, fx, ground + 4, 180, 1, ICE, 1);
      glowPath(ctx, [[1320, ground + 4], [2400, ground + 4]], 3, BLUE, 0.6 * inv(16.0, 16.6, t));
    }
    ctx.restore();

    overlay(ctx, '#000', 1 - inv(12.5, 12.8, t));
    overlay(ctx, '#e8f4ff', easeIn(inv(16.85, 17.0, t)) * 0.6);
  }

  // =====================================================================
  // SCENE 5 — montage, all connected by one energy line
  // =====================================================================
  function headAlong(pts, u) {
    // returns subpath from start up to fraction u of total length, plus head point
    let total = 0;
    const seg = [];
    for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); total += l; }
    let need = total * clamp(u);
    const out = [pts[0]];
    for (let i = 0; i < seg.length; i++) {
      if (need <= seg[i]) {
        const k = seg[i] ? need / seg[i] : 0;
        out.push([lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)]);
        return out;
      }
      need -= seg[i];
      out.push(pts[i + 1]);
    }
    return out;
  }

  function energy(ctx, pts, u, w, rgb, a = 1) {
    const sub = headAlong(pts, u);
    glowPath(ctx, sub, w, rgb, 0.8 * a);
    const h = sub[sub.length - 1];
    if (u > 0 && u < 1) flare(ctx, h[0], h[1], w * 40, a, ICE, 1);
    return h;
  }

  function shotEV(ctx, t, u) {
    const vp = [960, 470];
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05070b'); g.addColorStop(0.5, '#0b0f15'); g.addColorStop(1, '#06080b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // ceiling light strips receding
    for (let i = 0; i < 9; i++) {
      const d = 1 / (1 + i * 0.55);
      for (const side of [-1, 1]) {
        const x = vp[0] + side * 520 * d, y = vp[1] - 420 * d;
        ctx.fillStyle = `rgba(255,240,215,${0.5 * d + 0.1})`;
        ctx.fillRect(x - 90 * d, y - 4 * d, 180 * d, 8 * d);
        flare(ctx, x, y, 140 * d, 0.18 * d, GOLD, 0.6);
      }
    }
    // floor bay lines
    ctx.strokeStyle = 'rgba(200,210,225,0.12)';
    ctx.lineWidth = 3;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath(); ctx.moveTo(vp[0] + i * 12, vp[1] + 60); ctx.lineTo(vp[0] + i * 420, H); ctx.stroke();
    }
    // pillar
    const px = 1180, py = 230, pw = 230, ph = 690;
    g = ctx.createLinearGradient(px, 0, px + pw, 0);
    g.addColorStop(0, '#2b3037'); g.addColorStop(0.3, '#c7ced8'); g.addColorStop(0.55, '#7b838e'); g.addColorStop(1, '#22262c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 40); ctx.fill();
    ctx.fillStyle = '#0a0c10';
    ctx.beginPath(); ctx.roundRect(px + 40, py + 60, pw - 80, 110, 12); ctx.fill();
    const charge = inv(0.62, 0.8, u);
    ctx.fillStyle = `rgba(${BLUE},${0.15 + 0.6 * charge})`;
    ctx.fillRect(px + 58, py + 140, (pw - 116) * charge, 12);
    // ring LED + holster
    const rc = [px + pw / 2, py + 330];
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#11161d';
    ctx.beginPath(); ctx.arc(rc[0], rc[1], 74, 0, TAU); ctx.stroke();
    if (charge > 0) {
      const ring = [];
      for (let k = 0; k <= 48; k++) { const a = -Math.PI / 2 + (k / 48) * TAU * charge; ring.push([rc[0] + Math.cos(a) * 74, rc[1] + Math.sin(a) * 74]); }
      glowPath(ctx, ring, 6, BLUE, 1);
      flare(ctx, rc[0], rc[1], 260, 0.35 * charge, BLUE, 0.6);
    }
    ctx.fillStyle = '#0d1015';
    ctx.beginPath(); ctx.arc(rc[0], rc[1], 46, 0, TAU); ctx.fill();
    // charging cable
    ctx.strokeStyle = '#0b0d11';
    ctx.lineWidth = 26;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px + 10, py + 400); ctx.bezierCurveTo(1000, 760, 760, 900, 520, 700); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,180,210,0.18)';
    ctx.lineWidth = 4;
    ctx.stroke();
    // energy: floor -> pillar -> ring
    energy(ctx, [[-60, 960], [700, 960], [rc[0], 960], [rc[0], rc[1] + 74]], inv(0.0, 0.62, u), 4, BLUE);
    // floor reflection of pillar
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#9fb3cc';
    ctx.fillRect(px + 30, py + ph, pw - 60, 120);
    ctx.restore();
  }

  function catenary(x1, y1, x2, y2, sag, n = 24) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      pts.push([lerp(x1, x2, s), lerp(y1, y2, s) + sag * 4 * s * (1 - s)]);
    }
    return pts;
  }

  function shotGrid(ctx, t, u) {
    const hz = 600;
    let g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#0e0a16'); g.addColorStop(0.55, '#4a2524'); g.addColorStop(0.9, '#ff8a2c'); g.addColorStop(1, '#ffc46a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, hz);
    flare(ctx, 1380, hz - 20, 520, 0.55, GOLD, 1.6);
    // skyline
    ctx.fillStyle = '#1a0e10';
    for (let i = 0; i < 70; i++) {
      const w = 18 + rnd(i * 2) * 50, h = 10 + rnd(i * 4) * (i % 7 === 0 ? 120 : 55);
      ctx.fillRect(i * 28 - 20, hz - h, w, h + 2);
    }
    // ground + solar rows
    g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, '#120b0e'); g.addColorStop(1, '#040507');
    ctx.fillStyle = g;
    ctx.fillRect(0, hz, W, H - hz);
    const front = lerp(-200, 2200, inv(0.05, 0.9, u));
    for (let r = 0; r < 9; r++) {
      const d = Math.pow((r + 1) / 9, 1.6);
      const y = hz + 12 + d * (H - hz - 40);
      const ph = 10 + d * 70, pw = 40 + d * 210;
      for (let x = -pw + ((r * 37) % pw); x < W + pw; x += pw + 8 * d + 4) {
        g = ctx.createLinearGradient(0, y - ph, 0, y);
        const lit = x < front ? clamp((front - x) / 400) : 0;
        g.addColorStop(0, `rgb(${(70 + 30 * lit) | 0},${(60 + 80 * lit) | 0},${(90 + 150 * lit) | 0})`);
        g.addColorStop(0.3, '#15203a');
        g.addColorStop(1, '#070a12');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x + ph * 0.5, y - ph); ctx.lineTo(x + pw + ph * 0.5, y - ph); ctx.lineTo(x + pw, y); ctx.lineTo(x, y); ctx.fill();
        ctx.strokeStyle = `rgba(255,170,90,${0.2 * (1 - d * 0.5)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // transmission towers
    const towers = [[230, 560, 1.0], [1060, 600, 0.55], [1640, 598, 0.32]];
    ctx.strokeStyle = '#0a0607';
    ctx.fillStyle = '#0a0607';
    for (const [x, base, s] of towers) {
      const h = 520 * s, w = 120 * s;
      ctx.lineWidth = 7 * s;
      ctx.beginPath();
      ctx.moveTo(x - w, base); ctx.lineTo(x - w * 0.18, base - h); ctx.lineTo(x + w * 0.18, base - h); ctx.lineTo(x + w, base);
      for (let k = 1; k < 7; k++) {
        const y = base - (h * k) / 7, hw = lerp(w, w * 0.18, k / 7);
        const y2 = base - (h * (k - 1)) / 7, hw2 = lerp(w, w * 0.18, (k - 1) / 7);
        ctx.moveTo(x - hw, y); ctx.lineTo(x + hw2, y2); ctx.moveTo(x + hw, y); ctx.lineTo(x - hw2, y2);
      }
      ctx.moveTo(x - w * 1.1, base - h * 0.82); ctx.lineTo(x + w * 1.1, base - h * 0.82);
      ctx.stroke();
    }
    // power lines with energy
    const lines = [];
    for (const dy of [0, 26]) {
      const a = catenary(-100, 120 + dy, 230 - 132, 560 - 520 * 0.82 + dy * 1.0, 40);
      const b = catenary(230 + 132, 560 - 520 * 0.82 + dy, 1060 - 72, 600 - 286 * 0.82 + dy * 0.55, 90);
      const c = catenary(1060 + 72, 600 - 286 * 0.82 + dy * 0.55, 1640 - 42, 598 - 166 * 0.82 + dy * 0.32, 40);
      const d = catenary(1640 + 42, 598 - 166 * 0.82 + dy * 0.32, 2050, 470 + dy * 0.3, 30);
      lines.push(a.concat(b, c, d));
    }
    for (const L of lines) {
      ctx.strokeStyle = 'rgba(20,10,12,0.9)';
      ctx.lineWidth = 2;
      pathOf(ctx, L); ctx.stroke();
      energy(ctx, L, inv(0.0, 0.92, u), 3, GOLD);
    }
  }

  function shotFacade(ctx, t, u) {
    ctx.fillStyle = '#03050a';
    ctx.fillRect(0, 0, W, H);
    // two-point perspective facade
    const L = [[120, 1080], [120, 80]], R = [[1800, 760], [1800, 330]];
    const quad = (s0, s1, v0, v1) => {
      const P = (s, v) => [lerp(lerp(L[0][0], R[0][0], s), lerp(L[1][0], R[1][0], s), v), lerp(lerp(L[0][1], R[0][1], s), lerp(L[1][1], R[1][1], s), v)];
      return [P(s0, v0), P(s1, v0), P(s1, v1), P(s0, v1)];
    };
    const P = (s, v) => [lerp(lerp(L[0][0], R[0][0], s), lerp(L[1][0], R[1][0], s), v), lerp(lerp(L[0][1], R[0][1], s), lerp(L[1][1], R[1][1], s), v)];
    let q = quad(0, 1, 0, 1);
    let g = ctx.createLinearGradient(120, 0, 1800, 0);
    g.addColorStop(0, '#0d1626'); g.addColorStop(1, '#04070d');
    ctx.fillStyle = g;
    pathOf(ctx, q); ctx.fill();
    // vertical fins
    for (let i = 0; i <= 28; i++) {
      const s = Math.pow(i / 28, 1.25);
      const a = P(s, 0), b = P(s, 1);
      ctx.strokeStyle = 'rgba(70,90,120,0.35)';
      ctx.lineWidth = lerp(10, 3, s);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    // LED bands sweeping in
    const bands = 9;
    for (let k = 0; k < bands; k++) {
      const v = (k + 0.5) / bands;
      const delay = k * 0.035;
      const fs = clamp(inv(0.02 + delay, 0.75 + delay, u));
      const pts = [];
      for (let i = 0; i <= 20; i++) pts.push(P((i / 20) * Math.pow(fs, 0.8), v));
      if (fs > 0) {
        glowPath(ctx, pts, lerp(5, 3, v), k % 3 === 1 ? GOLD : BLUE, 0.85);
        const h = pts[pts.length - 1];
        if (fs < 1) flare(ctx, h[0], h[1], 120, 0.7, ICE, 0.8);
      }
      // warm windows between bands
      for (let i = 0; i < 26; i++) {
        const s = Math.pow((i + 0.5) / 26, 1.25);
        if (s > Math.pow(fs, 0.8)) break;
        const c = quad(s - 0.012, s + 0.012, v + 0.02, v + 0.085);
        ctx.fillStyle = `rgba(255,190,120,${0.18 + 0.4 * rnd(k * 50 + i)})`;
        pathOf(ctx, c); ctx.fill();
      }
    }
    // plaza reflection glow
    g = ctx.createLinearGradient(0, 860, 0, H);
    g.addColorStop(0, `rgba(${BLUE},0)`);
    g.addColorStop(1, `rgba(${BLUE},${0.18 * u})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 860, W, 220);
  }

  function shotData(ctx, t, u) {
    const vp = [960, 520];
    ctx.fillStyle = '#020407';
    ctx.fillRect(0, 0, W, H);
    const front = lerp(0.02, 1, easeOut(inv(0.0, 0.8, u)));
    const depthAt = (i) => 1 / (1 + i * 0.42);
    for (let i = 14; i >= 0; i--) {
      const d0 = depthAt(i), d1 = depthAt(i + 1);
      for (const side of [-1, 1]) {
        const xa = vp[0] + side * 620 * d0, xb = vp[0] + side * 620 * d1;
        const ya = vp[1] - 470 * d0, yb = vp[1] - 470 * d1, ya2 = vp[1] + 520 * d0, yb2 = vp[1] + 520 * d1;
        ctx.fillStyle = i % 2 ? '#0b0f16' : '#0e131b';
        ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.lineTo(xb, yb2); ctx.lineTo(xa, ya2); ctx.fill();
        ctx.strokeStyle = 'rgba(90,110,140,0.25)';
        ctx.lineWidth = 2 * d0;
        ctx.stroke();
        const on = 1 - i / 15 < front ? 1 : 0;
        for (let r = 0; r < 18; r++) {
          for (let c = 0; c < 3; c++) {
            const s = (c + 0.5) / 3, v = (r + 0.5) / 18;
            const x = lerp(xa, xb, s), yt = lerp(ya, yb, s), yb3 = lerp(ya2, yb2, s);
            const y = lerp(yt, yb3, v);
            const q = rnd(i * 999 + r * 31 + c * 7 + (side > 0 ? 5 : 0));
            const blink = 0.5 + 0.5 * Math.sin(t * (6 + q * 20) + q * 40);
            const a = on ? (0.4 + 0.6 * blink) * (q > 0.15 ? 1 : 0.2) : 0.04;
            ctx.fillStyle = q > 0.85 ? `rgba(${GOLD},${a})` : `rgba(${q > 0.5 ? ICE : BLUE},${a})`;
            const sz = Math.max(1.2, 6 * lerp(d0, d1, s));
            ctx.fillRect(x - sz / 2, y - sz / 2, sz * 1.6, sz * 0.7);
          }
        }
      }
    }
    // floor energy groove to vanishing point
    const pts = [[vp[0], H + 20], [vp[0], vp[1] + 520 * depthAt(15)]];
    energy(ctx, pts, front, 5, BLUE);
    let g = ctx.createRadialGradient(vp[0], vp[1], 0, vp[0], vp[1], 520);
    g.addColorStop(0, `rgba(${BLUE},${0.25 * front})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  const MONTAGE = [shotEV, shotGrid, shotFacade, shotData];

  function sceneMontage(ctx, t) {
    const lt = t - AD.MONTAGE_START;
    const m = Math.min(3, Math.floor(lt / AD.MONTAGE_SHOT));
    const u = (lt - m * AD.MONTAGE_SHOT) / AD.MONTAGE_SHOT;
    const sc = lerp(1.0, 1.07, u);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2 + lerp(20, -20, u), -H / 2);
    MONTAGE[m](ctx, t, m === 3 ? clamp(u * 0.9) : u);
    ctx.restore();
    dust(ctx, t, 900 + m, 40, 0.25, ICE);
    overlay(ctx, '#e8f4ff', Math.exp(-u * AD.MONTAGE_SHOT * 14) * 0.6);
    overlay(ctx, '#000', easeIn(inv(21.05, 21.45, t)));
  }

  // =====================================================================
  // SCENE 6 — silence, giant main breaker, BOOM
  // =====================================================================
  function sceneBreaker(ctx, t) {
    if (t < 21.92) return;
    const C = AD.MAIN_CLICK, B = AD.MAIN_BOOM;
    const push = lerp(1.0, 1.08, ease(inv(21.9, 24.5, t)));
    const rim = inv(21.92, 22.0, t);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(push, push);
    ctx.translate(-W / 2, -H / 2);

    // breaker housing
    const x = 640, y = 110, w = 640, h = 860;
    ctx.globalAlpha = rim * 0.8 + 0.2 * rim;
    ctx.drawImage(assets.brushed, 0, 0, 640, 860, x, y, w, h);
    let g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.7)'); g.addColorStop(0.35, 'rgba(70,90,120,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    // rim lights
    ctx.strokeStyle = `rgba(140,190,255,${0.55 * rim})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 24); ctx.stroke();
    // big slot
    ctx.fillStyle = '#020305';
    ctx.beginPath(); ctx.roundRect(x + 220, y + 170, 200, 520, 20); ctx.fill();
    // massive lever
    const up = easeIn(inv(C, C + 0.11, t));
    const ly = lerp(y + 470, y + 190, up);
    g = ctx.createLinearGradient(x + 200, 0, x + 440, 0);
    g.addColorStop(0, '#3c424b'); g.addColorStop(0.3, '#dfe5ec'); g.addColorStop(0.6, '#8d949e'); g.addColorStop(1, '#2a2e34');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x + 196, ly, 248, 200, 18); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 6; i++) ctx.fillRect(x + 220, ly + 30 + i * 26, 200, 8);
    // status window
    const on = inv(B, B + 0.1, t);
    ctx.fillStyle = on ? `rgba(${BLUE},${0.4 + 0.6 * on})` : '#0a0d12';
    ctx.beginPath(); ctx.roundRect(x + 250, y + 740, 140, 50, 10); ctx.fill();
    ctx.restore();

    // CLICK glint
    flare(ctx, W / 2, 380, 240, pulse(t, C + 0.1, 0.01, 0.05) * 0.8, ICE, 1);

    // BOOM — light wave floods the frame
    if (t >= B) {
      const a = t - B;
      const wave = a * 2600;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      g = ctx.createRadialGradient(W / 2, 540, Math.max(0, wave - 260), W / 2, 540, wave + 60);
      g.addColorStop(0, `rgba(${BLUE},0)`);
      g.addColorStop(0.7, `rgba(${ICE},${0.6 * Math.exp(-a * 2.5)})`);
      g.addColorStop(1, `rgba(${BLUE},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      // radiating arcs
      const fr = Math.floor(t * 30);
      const arcA = Math.exp(-a * 1.6);
      for (let i = 0; i < 22; i++) {
        const ang = (i / 22) * TAU + rnd(i) * 0.2;
        const len = 300 + Math.min(1, a * 3) * (600 + rnd(i * 3) * 600);
        glowPath(ctx, boltPts(W / 2, 540, W / 2 + Math.cos(ang) * len, 540 + Math.sin(ang) * len, fr * 13 + i * 7, 6, 0.18), 2.2, i % 4 === 0 ? GOLD : BLUE, arcA * (0.4 + 0.6 * rnd(fr + i)));
      }
      flare(ctx, W / 2, 540, 900, Math.exp(-a * 1.2) * 0.9 + 0.12, BLUE, 2);
      // slow-motion particles
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 260; i++) {
        const ang = rnd(i * 1.7) * TAU, sp = 40 + rnd(i * 2.9) * 520;
        const r = sp * (1 - Math.exp(-a * 3)) / 3 * 4 + a * sp * 0.15;
        const px = W / 2 + Math.cos(ang) * r, py = 540 + Math.sin(ang) * r * 0.8;
        const al = clamp(1.1 - a / 2.4) * (0.4 + 0.6 * rnd(i * 4.4));
        ctx.fillStyle = i % 5 === 0 ? `rgba(${GOLD},${al})` : `rgba(${ICE},${al})`;
        const s = 1.2 + rnd(i * 6.1) * 3;
        ctx.beginPath(); ctx.arc(px, py, s, 0, TAU); ctx.fill();
      }
      ctx.restore();
      sparks(ctx, [W / 2, 520], t, B, 70, 2200, { spread: 0.05, speed: [400, 1500], life: [0.5, 1.4], grav: 500, slow: 0.6 });
      overlay(ctx, '#f2f8ff', pulse(t, B, 0.03, 0.18) * 0.92);
    }
    overlay(ctx, '#000', easeIn(inv(24.25, 24.55, t)) * 0.85);
  }

  // =====================================================================
  // SCENE 7 — every energy line converges to one point
  // =====================================================================
  function sceneConverge(ctx, t) {
    const cx = W / 2, cy = 470;
    const all = inv(24.5, AD.FLASH, t);
    let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 900);
    g.addColorStop(0, `rgba(20,50,110,${0.5 * all})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    dust(ctx, t, 1301, 90, 0.3 + all * 0.4, ICE, [cx, cy, 900]);

    const N = 12;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU + rnd(i * 5) * 0.4;
      const dir = i % 2 ? 1 : -1;
      const start = 24.52 + rnd(i * 9) * 0.3;
      const hp = Math.pow(inv(start, AD.FLASH - 0.02, t), 1.6);
      if (hp <= 0) continue;
      const P = (p) => {
        const r = 980 * Math.pow(1 - p, 1.1);
        const a = a0 + dir * (1 - p) * 1.5;
        return [cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 0.62];
      };
      const tail = Math.max(0, hp - 0.42);
      const pts = [];
      for (let k = 0; k <= 26; k++) pts.push(P(lerp(tail, hp, k / 26)));
      const rgb = i % 3 === 0 ? GOLD : BLUE;
      for (let k = 0; k < pts.length - 1; k += 2) glowPath(ctx, [pts[k], pts[k + 1], pts[Math.min(pts.length - 1, k + 2)]], 4, rgb, 0.15 + (k / pts.length) * 0.85);
      const h = pts[pts.length - 1];
      flare(ctx, h[0], h[1], 90, 0.8, rgb === GOLD ? GOLD : ICE, 0.5);
    }
    // core charge
    const core = easeIn(all);
    flare(ctx, cx, cy, 120 + core * 600, 0.2 + core * 0.8, BLUE, 1.5);
    if (all > 0.7) {
      const fr = Math.floor(t * 30);
      for (let i = 0; i < 6; i++) {
        const a = rnd(fr * 7 + i) * TAU, len = 60 + rnd(fr + i * 3) * 220 * core;
        glowPath(ctx, boltPts(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, fr * 11 + i, 5), 1.8, ICE, core);
      }
    }
    overlay(ctx, '#fff', easeIn(inv(AD.FLASH - 0.12, AD.FLASH, t)));
  }

  // =====================================================================
  // SCENE 8 — FLASH, logo reveal, tagline, cut to black
  // =====================================================================
  let glossCanvas = null;

  function sceneLogo(ctx, t) {
    const lt = t - AD.FLASH;
    const logo = assets.logo;
    const cx = W / 2, cy = 430;

    let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1100);
    g.addColorStop(0, '#0b1222'); g.addColorStop(0.55, '#04060b'); g.addColorStop(1, '#010103');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    dust(ctx, t, 1700, 110, 0.35, ICE);
    dust(ctx, t, 1900, 40, 0.3, GOLD);

    if (logo) {
      const reveal = easeOut(inv(0, 1.9, lt));
      const sc = lerp(1.07, 1.0, reveal);
      const dw = 1240 * sc, dh = (dw * logo.height) / logo.width;
      const x = cx - dw / 2, y = cy - dh / 2;
      const a = inv(0.0, 0.3, lt);

      // aura
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 640);
      g.addColorStop(0, `rgba(255,50,40,${0.16 * a})`);
      g.addColorStop(0.5, `rgba(${BLUE},${0.07 * a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // reflection
      ctx.save();
      ctx.globalAlpha = 0.07 * a;
      ctx.translate(0, y + dh * 2 + 6);
      ctx.scale(1, -1);
      ctx.drawImage(logo, x, 0, dw, dh);
      ctx.restore();
      g = ctx.createLinearGradient(0, y + dh, 0, y + dh + 150);
      g.addColorStop(0, 'rgba(3,5,10,0.2)');
      g.addColorStop(1, 'rgba(3,5,10,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y + dh, W, 300);

      ctx.globalAlpha = a;
      ctx.drawImage(logo, x, y, dw, dh);
      ctx.globalAlpha = 1;

      // light sweep across the metal
      const sw = inv(0.35, 1.35, lt);
      if (sw > 0 && sw < 1) {
        if (!glossCanvas) glossCanvas = makeCanvas(logo.width, logo.height);
        const gc = glossCanvas.getContext('2d');
        gc.globalCompositeOperation = 'source-over';
        gc.clearRect(0, 0, logo.width, logo.height);
        gc.drawImage(logo, 0, 0);
        gc.globalCompositeOperation = 'source-atop';
        const bx = lerp(-0.3, 1.3, ease(sw)) * logo.width;
        const lg = gc.createLinearGradient(bx - 180, 0, bx + 180, logo.height * 0.3);
        lg.addColorStop(0, 'rgba(255,255,255,0)');
        lg.addColorStop(0.5, 'rgba(255,245,230,0.85)');
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        gc.fillStyle = lg;
        gc.fillRect(0, 0, logo.width, logo.height);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55;
        ctx.drawImage(glossCanvas, x, y, dw, dh);
        ctx.restore();
      }

      // spark running along the wires
      const sp = inv(AD.LOGO_SPARK, AD.LOGO_SPARK + 0.55, t);
      if (sp > 0 && sp < 1) {
        const wy = y + dh * 0.85;
        const sx = lerp(x + dw * 0.14, x + dw * 0.86, ease(sp));
        const wob = Math.sin(sp * 28) * dh * 0.02;
        flare(ctx, sx, wy + wob, 140, 0.95, ICE, 1);
        sparks(ctx, (b) => [lerp(x + dw * 0.14, x + dw * 0.86, ease(inv(AD.LOGO_SPARK, AD.LOGO_SPARK + 0.55, b))), wy], t, AD.LOGO_SPARK, 40, 4100,
          { spread: 0.55, speed: [80, 360], life: [0.2, 0.5], grav: 900, scale: 0.8 });
      }
      // final pulse on the last "חשמלי"
      flare(ctx, x + dw * 0.33, y + dh * 0.3, 380, pulse(t, AD.FINAL_HIT, 0.02, 0.25) * 0.45, '255,90,70', 1.2);

      // tagline
      ctx.save();
      ctx.font = '300 58px Heebo, "Noto Sans Hebrew", Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl';
      const words = AD.TAGLINE.map(([, w]) => w);
      const widths = words.map((w) => ctx.measureText(w).width);
      const gap = 44, sepW = 4;
      const total = widths.reduce((s, w) => s + w, 0) + (words.length - 1) * (gap * 2 + sepW);
      let xr = cx + total / 2;
      const ty = y + dh + 120;
      AD.TAGLINE.forEach(([T, word], i) => {
        const k = easeOut(inv(T, T + 0.45, t));
        ctx.globalAlpha = k;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#eef2f7';
        ctx.fillText(word, xr, ty + (1 - k) * 16);
        xr -= widths[i];
        if (i < words.length - 1) {
          xr -= gap;
          const sk = easeOut(inv(AD.TAGLINE[i + 1][0] - 0.1, AD.TAGLINE[i + 1][0] + 0.25, t));
          ctx.globalAlpha = sk;
          ctx.fillStyle = '#e0aa4e';
          ctx.fillRect(xr - sepW, ty - 30 * sk, sepW, 60 * sk);
          xr -= sepW + gap;
        }
      });
      ctx.restore();
      // thin gold rule
      const rule = easeOut(inv(27.0, 28.4, t));
      if (rule > 0) {
        ctx.save();
        g = ctx.createLinearGradient(cx - 420, 0, cx + 420, 0);
        g.addColorStop(0, 'rgba(224,170,78,0)');
        g.addColorStop(0.5, 'rgba(224,170,78,0.85)');
        g.addColorStop(1, 'rgba(224,170,78,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 420 * rule, ty + 62, 840 * rule, 2);
        ctx.restore();
      }
    }

    overlay(ctx, '#ffffff', Math.exp(-lt * 4.2) * 0.95);
    overlay(ctx, '#000', t >= AD.CUT_TO_BLACK ? 1 : 0);
  }

  // =====================================================================
  // camera shake, post, dispatch
  // =====================================================================
  const IMPACTS = [[AD.MAIN_BOOM, 16, 0.9], [AD.FLASH, 12, 0.7], [AD.MAIN_CLICK + 0.11, 6, 0.25], [2.3, 5, 0.4]]
    .concat(AD.BREAKERS.map((b, i) => [b, i < 3 ? 4 : 2.5, 0.18]));

  function shake(t) {
    let x = 0, y = 0;
    for (const [t0, amp, dur] of IMPACTS) {
      const a = t - t0;
      if (a < 0 || a > dur) continue;
      const k = amp * Math.pow(1 - a / dur, 2);
      x += Math.sin(a * 83 + t0) * k;
      y += Math.cos(a * 71 + t0 * 2) * k;
    }
    return [x, y];
  }

  const DISPATCH = { intro: sceneIntro, cable: sceneCable, board: sceneBoard, conduit: sceneConduit, building: sceneBuilding, montage: sceneMontage, breaker: sceneBreaker, converge: sceneConverge, logo: sceneLogo };

  AD.sceneAt = (t) => {
    for (const s of AD.SCENES) if (t >= s[0] && t < s[1]) return s[2];
    return 'logo';
  };

  AD.render = function (ctx, t, k = 1) {
    t = clamp(t, 0, AD.DUR - 1e-4);
    ctx.__k = k;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const [sx, sy] = shake(t);
    ctx.translate(sx, sy);
    DISPATCH[AD.sceneAt(t)](ctx, t);
    ctx.restore();

    // post: vignette, grain, letterbox
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.drawImage(assets.vignette, 0, 0);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.07;
    const f = Math.floor(t * 24);
    const ox = -rnd(f) * 512, oy = -rnd(f * 1.7) * 512;
    for (let gx = ox; gx < W; gx += 512) for (let gy = oy; gy < H; gy += 512) ctx.drawImage(assets.grain, gx, gy);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 54);
    ctx.fillRect(0, H - 54, W, 54);
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
