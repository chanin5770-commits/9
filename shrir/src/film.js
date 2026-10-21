/* ״שריר שצריך לאמן״ — frame renderer.
 *
 * FILM.draw(ctx, t) paints frame t (seconds) of build/timeline.json onto a
 * 1080×1920 canvas: the shots with their camera moves and grading, light,
 * grain, the progress heart, captions, steps, the adult-tools cards,
 * subtitles and the end card. Pure function of t, so renders are repeatable.
 */
(function () {
  'use strict';
  const W = 1080, H = 1920;
  const FONT_UI = "'Assistant', 'Heebo', sans-serif";
  const FONT_TITLE = "'Frank Ruhl Libre', 'Heebo', serif";
  const GOLD = '#f4c35a';

  const FILM = { W, H, images: {}, blurred: {}, tl: null, grain: [] };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const easeInOut = (k) => { k = clamp(k, 0, 1); return 0.5 - 0.5 * Math.cos(Math.PI * k); };
  const fade = (t, a, b, fi = 0.5, fo = 0.5) => Math.min(smooth((t - a) / fi), smooth((b - t) / fo));

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // deterministic noise for grain and dust
  function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

  FILM.load = async function (timeline, imageUrls) {
    FILM.tl = timeline;
    await Promise.all(Object.entries(imageUrls).map(([k, url]) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => {
        FILM.images[k] = im;
        // soft, darkened plate used to extend the frame above and below the picture
        const b = canvas(270, 480), bx = b.getContext('2d');
        const s = Math.max(270 / im.width, 480 / im.height) * 1.15;
        bx.filter = 'blur(14px) saturate(0.9)';
        bx.drawImage(im, (270 - im.width * s) / 2, (480 - im.height * s) / 2, im.width * s, im.height * s);
        FILM.blurred[k] = b;
        res();
      };
      im.onerror = rej;
      im.src = url;
    })));
    const r = rng(7);
    for (let g = 0; g < 6; g++) {
      const c = canvas(540, 960), x = c.getContext('2d'), d = x.createImageData(540, 960);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = 128 + (r() + r() + r() - 1.5) * 70;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
      }
      x.putImageData(d, 0, 0);
      FILM.grain.push(c);
    }
    FILM.dust = Array.from({ length: 26 }, () => ({ x: r(), y: r(), r: 2 + r() * 7, s: 0.2 + r() * 0.8, p: r() * 6.28 }));
  };

  // ---- grading -------------------------------------------------------------
  // cool & distant at the start, warming through the middle, golden at the climax
  function gradeFor(shot) {
    if (shot.dim) return { filter: 'brightness(0.5) saturate(0.85) blur(2px)', tint: 'rgba(40,24,10,0.25)', warm: 0.5 };
    if (shot.mood === 'cool' && !shot.warm) return { filter: 'saturate(0.72) brightness(0.9) contrast(1.05)', tint: 'rgba(38,64,104,0.30)', warm: 0 };
    if (shot.mood === 'warming') return { filter: 'saturate(0.92) brightness(0.98) contrast(1.03)', tint: 'rgba(120,96,70,0.10)', warm: 0.35 };
    if (shot.mood === 'golden' || shot.warm) return { filter: 'saturate(1.08) brightness(1.03) contrast(1.04)', tint: 'rgba(255,170,70,0.16)', warm: 1 };
    return { filter: 'saturate(1.0) brightness(1.0) contrast(1.03)', tint: 'rgba(255,180,100,0.08)', warm: 0.7 };
  }

  // ---- one shot --------------------------------------------------------------
  const layer = canvas(W, H), lx = layer.getContext('2d');
  const pic = canvas(W, H), px = pic.getContext('2d');

  function drawShot(ctx, shot, t, alpha) {
    const im = FILM.images[shot.img];
    // camera runs a little past the shot so dissolves never freeze
    const k = easeInOut((t - shot.start + shot.xfade * 0.5) / (shot.end - shot.start + shot.xfade));
    const cam = {};
    for (const p of ['x', 'y', 'z', 'r']) cam[p] = lerp(shot.from[p] || 0, shot.to[p] || 0, k);
    const s = cam.z * W / im.width, dw = im.width * s, dh = im.height * s;
    let ox = W / 2 - cam.x * dw, oy = H / 2 - cam.y * dh;
    ox = clamp(ox, W - dw, 0);
    oy = dh >= H ? clamp(oy, H - dh, 0) : clamp(oy, H - dh - 260, 260);
    const g = gradeFor(shot);

    lx.save();
    lx.clearRect(0, 0, W, H);
    // background extension: the same picture, soft and dark, drifting with the camera
    lx.globalAlpha = 1;
    lx.filter = 'brightness(0.55) saturate(0.9)';
    const bs = 1.04 + 0.04 * k;
    lx.drawImage(FILM.blurred[shot.img], (W - W * bs) / 2, (H - H * bs) / 2, W * bs, H * bs);
    lx.filter = 'none';
    // the picture, feathered into the extension when it does not fill the height
    px.save();
    px.clearRect(0, 0, W, H);
    px.filter = g.filter;
    px.imageSmoothingQuality = 'high';
    if (cam.r) { px.translate(W / 2, H / 2); px.rotate(cam.r * Math.PI / 180); px.translate(-W / 2, -H / 2); }
    px.drawImage(im, ox, oy, dw, dh);
    px.setTransform(1, 0, 0, 1, 0, 0);
    px.filter = 'none';
    if (dh < H + 2) {
      const f = Math.min(220, dh * 0.22);
      const gr = px.createLinearGradient(0, oy, 0, oy + dh);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(f / dh, 'rgba(0,0,0,1)');
      gr.addColorStop(1 - f / dh, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      px.globalCompositeOperation = 'destination-in';
      px.fillStyle = gr;
      px.fillRect(0, 0, W, H);
    }
    px.restore();
    lx.drawImage(pic, 0, 0);
    // colour tint
    lx.globalCompositeOperation = 'soft-light';
    lx.fillStyle = g.tint;
    lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = 'source-over';
    lx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    return g.warm;
  }

  // ---- light, dust, vignette, grain -----------------------------------------
  function drawLight(ctx, t, warm) {
    if (warm <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const cx = W * (0.78 + 0.06 * Math.sin(t * 0.13)), cy = H * (0.18 + 0.03 * Math.cos(t * 0.11));
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.55);
    gr.addColorStop(0, `rgba(255,190,110,${0.16 * warm})`);
    gr.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    for (const d of FILM.dust) {
      const x = ((d.x + t * 0.006 * d.s) % 1) * W;
      const y = ((d.y - t * 0.01 * d.s + 10) % 1) * H;
      const a = (0.10 + 0.08 * Math.sin(t * d.s + d.p)) * warm;
      const g2 = ctx.createRadialGradient(x, y, 0, x, y, d.r * 3);
      g2.addColorStop(0, `rgba(255,225,170,${a})`);
      g2.addColorStop(1, 'rgba(255,225,170,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(x - d.r * 3, y - d.r * 3, d.r * 6, d.r * 6);
    }
    ctx.restore();
  }

  function drawVignette(ctx, strength) {
    const gr = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.28, W / 2, H * 0.5, H * 0.72);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
  }

  function drawGrain(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.07;
    ctx.drawImage(FILM.grain[Math.floor(t * 24) % FILM.grain.length], 0, 0, W, H);
    ctx.restore();
  }

  // ---- heart ------------------------------------------------------------------
  function heartPath(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.92);
    ctx.bezierCurveTo(cx - s * 1.25, cy + s * 0.05, cx - s * 1.05, cy - s * 0.95, cx, cy - s * 0.42);
    ctx.bezierCurveTo(cx + s * 1.05, cy - s * 0.95, cx + s * 1.25, cy + s * 0.05, cx, cy + s * 0.92);
    ctx.closePath();
  }

  function heartLevel(t) {
    // rises only; each section lifts it gently as its first learning moment begins
    let lvl = 0, glow = 0;
    const secs = FILM.tl.sections;
    for (let i = 0; i < secs.length; i++) {
      const s = secs[i], prev = i ? secs[i - 1].heart : 0;
      let at = s.heartAt + 1.2;
      if (s.id === 's10' && FILM.tl.markers.climax) at = FILM.tl.markers.climax;
      if (t >= at) {
        const k = smooth((t - at) / 1.6);
        lvl = lerp(prev, s.heart, k);
        if (s.heart > prev) glow = Math.max(glow, Math.sin(Math.PI * clamp((t - at) / 2.2, 0, 1)));
      }
    }
    return { lvl, glow };
  }

  function drawHeart(ctx, t, alpha) {
    if (alpha <= 0) return;
    const { lvl, glow } = heartLevel(t);
    const cx = W - 104, cy = 252, s = 30;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = `rgba(255,200,90,${0.35 + 0.5 * glow})`;
    ctx.shadowBlur = 14 + 26 * glow;
    heartPath(ctx, cx, cy, s);
    ctx.fillStyle = 'rgba(20,14,8,0.28)';
    ctx.fill();
    ctx.shadowBlur = 0;
    if (lvl > 0) {
      ctx.save();
      heartPath(ctx, cx, cy, s);
      ctx.clip();
      const top = cy + s * 0.92 - (s * 1.62) * lvl;
      const gr = ctx.createLinearGradient(0, cy - s, 0, cy + s);
      gr.addColorStop(0, '#ffd877'); gr.addColorStop(1, '#eaa93a');
      ctx.fillStyle = gr;
      // a soft surface on the fill line, like liquid settling
      ctx.beginPath();
      ctx.moveTo(cx - s * 1.4, cy + s * 1.2);
      for (let x = -1.4; x <= 1.41; x += 0.1) ctx.lineTo(cx + s * x, top + Math.sin(x * 3 + t * 2.2) * 1.6);
      ctx.lineTo(cx + s * 1.4, cy + s * 1.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    heartPath(ctx, cx, cy, s);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,250,240,0.95)';
    ctx.stroke();
    ctx.restore();
  }

  // ---- text ---------------------------------------------------------------------
  function wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    // balance two-line breaks so the second line is not a lone word
    if (lines.length === 2) {
      const all = text.split(' ');
      let best = null;
      for (let i = 1; i < all.length; i++) {
        const a = all.slice(0, i).join(' '), b = all.slice(i).join(' ');
        const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width;
        if (wa > maxW || wb > maxW) continue;
        const score = Math.abs(wa - wb) - (/[,.?:—]$/.test(a) ? 120 : 0);
        if (!best || score < best[0]) best = [score, [a, b]];
      }
      if (best) return best[1];
    }
    return lines;
  }

  function textBlock(ctx, text, y, o) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = o.font;
    const lines = wrap(ctx, text, o.maxW || 900);
    const lh = o.lineH;
    const top = y - (lines.length - 1) * lh / 2;
    if (o.box) {
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + o.box.padX * 2;
      const bh = lines.length * lh + o.box.padY * 2;
      ctx.fillStyle = o.box.fill;
      ctx.beginPath();
      ctx.roundRect(W / 2 - bw / 2, top - lh / 2 - o.box.padY, bw, bh, o.box.r);
      ctx.fill();
    }
    ctx.fillStyle = o.color;
    if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.shadowBlur || 18; ctx.shadowOffsetY = 2; }
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh));
    ctx.restore();
    return lines.length;
  }

  function drawSubtitles(ctx, t) {
    for (const c of FILM.tl.cues) {
      if (t < c.start - 0.12 || t > c.end + 0.12) continue;
      const a = fade(t, c.start - 0.12, c.end + 0.12, 0.16, 0.16);
      ctx.save();
      ctx.globalAlpha = a;
      textBlock(ctx, c.text, 1592, {
        font: `600 54px ${FONT_UI}`, lineH: 70, maxW: 900, color: '#fffaf2',
        box: { fill: 'rgba(12,9,6,0.46)', padX: 30, padY: 14, r: 22 },
      });
      ctx.restore();
    }
  }

  function drawCaptions(ctx, t) {
    for (const c of FILM.tl.captions) {
      if (t < c.start || t > c.end) continue;
      const a = fade(t, c.start, c.end, 0.9, 0.7);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(0, (1 - smooth((t - c.start) / 1.2)) * 14);
      // gentle scrim so the title reads on bright skies
      const gr = ctx.createLinearGradient(0, 250, 0, 500);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(10,6,2,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 250, W, 250);
      textBlock(ctx, c.text, 372, { font: `500 62px ${FONT_TITLE}`, lineH: 78, maxW: 820, color: '#fff6e6', shadow: 'rgba(0,0,0,0.55)', shadowBlur: 24 });
      ctx.fillStyle = GOLD;
      ctx.globalAlpha = a * 0.85;
      const lw = 90 * smooth((t - c.start - 0.3) / 1.0);
      ctx.fillRect(W / 2 - lw / 2, 447, lw, 3);
      ctx.restore();
    }
  }

  function drawSteps(ctx, t) {
    const steps = FILM.tl.steps;
    if (!steps.length) return;
    const first = steps[0].start, last = steps[steps.length - 1].end;
    if (t < first - 0.5 || t > last + 0.5) return;
    const groupA = fade(t, first - 0.5, last + 0.5, 0.6, 0.8);
    // progress dots: one per step, lit as each step is reached
    ctx.save();
    ctx.globalAlpha = groupA;
    steps.forEach((s, i) => {
      const x = W / 2 + (1.5 - i) * 44, y = 462;   // right-to-left order
      const on = smooth((t - s.start) / 0.6);
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,246,230,0.3)'; ctx.fill();
      if (on > 0) { ctx.beginPath(); ctx.arc(x, y, 9 * on, 0, Math.PI * 2); ctx.fillStyle = GOLD; ctx.fill(); }
    });
    ctx.restore();
    for (const s of steps) {
      if (t < s.start || t > s.end) continue;
      const a = fade(t, s.start, s.end, 0.6, 0.6) * groupA;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(0, (1 - smooth((t - s.start) / 0.9)) * 12);
      const gr = ctx.createLinearGradient(0, 270, 0, 500);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(10,6,2,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 270, W, 230);
      textBlock(ctx, s.text, 382, { font: `500 62px ${FONT_TITLE}`, lineH: 76, maxW: 860, color: '#fff6e6', shadow: 'rgba(0,0,0,0.6)', shadowBlur: 24 });
      ctx.restore();
    }
  }

  function drawTools(ctx, t) {
    for (const tl of FILM.tl.tools) {
      const a0 = tl.insteadAt ?? tl.sayAt;
      if (t < a0 - 0.3 || t > tl.end + 0.4) continue;
      const out = smooth((tl.end + 0.4 - t) / 0.6);
      ctx.save();
      if (tl.instead) {
        ctx.globalAlpha = smooth((t - tl.insteadAt) / 0.6) * out * 0.8;
        textBlock(ctx, tl.instead, 1230, { font: `500 44px ${FONT_UI}`, lineH: 56, color: '#efe4d2', shadow: 'rgba(0,0,0,0.6)' });
      }
      ctx.save();
      ctx.globalAlpha = smooth((t - a0) / 0.6) * out;
      const sg = ctx.createLinearGradient(0, 1120, 0, 1500);
      sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.5, 'rgba(12,7,2,0.38)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 1120, W, 380);
      ctx.restore();
      const k = smooth((t - tl.sayAt) / 0.8);
      ctx.globalAlpha = k * out;
      ctx.translate(0, (1 - k) * 16);
      const n = textBlock(ctx, tl.say, 1340, { font: `600 74px ${FONT_TITLE}`, lineH: 90, maxW: 860, color: '#ffe3a6', shadow: 'rgba(255,170,60,0.35)', shadowBlur: 30 });
      ctx.fillStyle = GOLD;
      const lw = 140 * smooth((t - tl.sayAt - 0.3) / 0.9);
      ctx.fillRect(W / 2 - lw / 2, 1340 + n * 45 + 18, lw, 3);
      ctx.restore();
    }
  }

  function drawEndCard(ctx, t) {
    const ec = FILM.tl.endCard;
    if (!ec || t < ec.start) return;
    const k = smooth((t - ec.start) / 1.6);
    ctx.save();
    ctx.fillStyle = `rgba(22,13,6,${0.62 * k})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = smooth((t - ec.start - 0.4) / 1.4);
    textBlock(ctx, ec.line, 880, { font: `600 80px ${FONT_TITLE}`, lineH: 100, maxW: 860, color: '#fff3dc', shadow: 'rgba(255,170,60,0.4)', shadowBlur: 34 });
    ctx.globalAlpha = smooth((t - ec.start - 1.6) / 1.2);
    ctx.fillStyle = GOLD;
    ctx.fillRect(W / 2 - 60, 1044, 120, 3);
    textBlock(ctx, ec.brand, 1120, { font: `500 50px ${FONT_UI}`, lineH: 60, color: '#f6e7c8' });
    ctx.restore();
  }

  // ---- frame ------------------------------------------------------------------------
  FILM.draw = function (ctx, t, opts = {}) {
    const tl = FILM.tl;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // active shots: the incoming shot dissolves over the outgoing one
    let warm = 0;
    const active = tl.shots.filter((s) => t >= s.start - s.xfade / 2 && t < s.end + 0.6);
    for (const s of active) {
      const next = tl.shots[tl.shots.indexOf(s) + 1];
      if (next && t >= next.start + next.xfade / 2) continue;
      const a = s.start === 0 ? 1 : smooth((t - (s.start - s.xfade / 2)) / s.xfade);
      warm = lerp(warm, drawShot(ctx, s, t, a), a);
    }
    drawLight(ctx, t, warm);
    drawVignette(ctx, 0.5);
    drawGrain(ctx, t);

    // opening: half a second of dark, then the yard fades up
    if (t < 3) { ctx.fillStyle = `rgba(0,0,0,${1 - smooth((t - 0.5) / 2.2)})`; ctx.fillRect(0, 0, W, H); }

    const endStart = tl.endCard ? tl.endCard.start : tl.duration;
    drawHeart(ctx, t, smooth((t - 2.2) / 1.5) * smooth((endStart + 0.5 - t) / 1.0));
    if (opts.text !== false) {
      drawCaptions(ctx, t);
      drawSteps(ctx, t);
      drawTools(ctx, t);
    }
    drawEndCard(ctx, t);
    if (opts.subtitles !== false) drawSubtitles(ctx, t);
    // final fade to black
    if (t > tl.duration - 1.4) { ctx.fillStyle = `rgba(0,0,0,${smooth((t - (tl.duration - 1.4)) / 1.3)})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  };

  window.FILM = FILM;
})();
