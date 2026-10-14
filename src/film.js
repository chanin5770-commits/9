/* "חשמלי" — the live-footage cut.
 * Edit decision list, narration placement, subtitles, overlay and score for the
 * 30s film assembled from the three supplied clips (footage/).
 *
 * Music runs at 120 BPM: every cut sits on a beat (0.5 s grid). */
(function (global) {
  'use strict';

  const AD = global.AD;
  const F = (AD.FILM = {});
  const W = AD.W, H = AD.H;

  F.DUR = 30;
  F.BPM = 120;
  F.BEAT = 60 / F.BPM;

  F.CLIPS = {
    A: 'footage/clip-a-city.mp4',            // building lights up, city grid, EV, collision, logo
    B: 'footage/clip-b-infrastructure.mp4',  // cable, trays, switchboard, infra, building, EV, burst, logo
    C: 'footage/clip-c-contact-card.mp4',    // vertical contact card: real logo + phone number
  };

  // Edit decision list: [outStart, outEnd, clip, srcIn, srcOut, label]
  // Shorter source than slot = slow motion (motion-interpolated).
  F.SHOTS = [
    [0.0, 2.0, 'B', 0.0, 1.0, 'cable — the pulse ignites'],
    [2.0, 4.0, 'B', 1.0, 2.0, 'energy rips through the trays'],
    [4.0, 6.5, 'B', 2.0, 3.33, 'switchboard, breakers hit'],
    [6.5, 8.0, 'B', 3.4, 4.2, 'infrastructure in the ceiling'],
    [8.0, 10.5, 'A', 0.0, 2.0, 'the building lights up'],
    [10.5, 13.0, 'A', 2.0, 4.0, 'the city grid comes alive'],
    [13.0, 15.0, 'B', 4.25, 5.9, 'tower at night'],
    [15.0, 17.0, 'A', 4.0, 5.85, 'EV charger'],
    [17.0, 18.5, 'B', 5.9, 7.0, 'EV charger, second angle'],
    [18.5, 21.0, 'A', 6.2, 8.0, 'blue and gold energy collide'],
    [21.0, 22.5, 'B', 7.0, 8.2, 'the burst'],
    [22.5, 25.0, 'B', 8.2, 10.0, 'logo from the energy'],
    [25.0, 30.0, 'C', 0.0, 5.04, 'contact card'],
  ];

  // Moments the picture flashes (overlay) — [time, strength]
  F.FLASHES = [[2.0, 0.35], [8.0, 0.25], [13.0, 0.3], [16.5, 0.55], [18.5, 0.35], [21.625, 0.6], [22.5, 0.45], [25.0, 0.5]];

  // Narration (assets/narration-v2.wav): [srcStart, srcEnd, placeAt, text, gain?]
  F.VOICE_SRC = 'assets/narration-v2.wav';
  F.VO = [
    [0.0, 2.15, 2.25, 'כשזה חשמל — בוחרים נכון.'],
    [2.53, 4.46, 4.25, 'מתשתיות ולוחות חשמל...'],
    [4.69, 7.4, 6.6, 'ועד מערכות מתקדמות ופרויקטים מורכבים.'],
    [8.13, 9.76, 10.75, 'כאן אין מקום לפשרות.'],
    [10.36, 11.24, 13.25, 'יש חשמל...'],
    [11.55, 13.26, 15.45, 'ויש — חשמלי.'],   // "חשמלי" lands on the drop at 16.5
    [13.98, 14.62, 18.52, 'עוצמה.'],
    [14.98, 15.6, 19.52, 'דיוק.'],
    [15.86, 16.68, 20.5, 'מקצועיות.'],
    [17.24, 17.85, 23.0, 'חשמלי.'],
  ];

  // Subtitles — same look as the animated ad; the power words punch in on their hits.
  // The last "חשמלי" plays over the logo, so it has no subtitle.
  F.SUBS = [];
  F.VO.forEach(([s, e, at, text], i) => {
    if (at >= 22.5) return;
    const power = at >= 18.5 && at < 21;
    const next = F.VO[i + 1];
    const end = power ? (next && next[2] < 21 ? next[2] - 0.02 : 21.4) : at + (e - s) + 0.4;
    F.SUBS.push([at - 0.06, end, text, power ? 'power' : 'line']);
  });

  // ---------------------------------------------------------------------
  // Overlay drawn over the footage (transparent canvas): vignette, flashes,
  // letterbox, subtitles.
  // ---------------------------------------------------------------------
  let vignette = null;
  F.renderOverlay = function (ctx, t, opts = {}) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.__k = 1;
    if (!vignette) {
      vignette = document.createElement('canvas');
      vignette.width = W; vignette.height = H;
      const g = vignette.getContext('2d'), r = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.05);
      r.addColorStop(0, 'rgba(0,0,0,0)');
      r.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = r;
      g.fillRect(0, 0, W, H);
    }
    ctx.drawImage(vignette, 0, 0);
    // flashes on the big hits
    let fl = 0;
    for (const [t0, k] of F.FLASHES) if (t >= t0) fl = Math.max(fl, k * Math.exp(-(t - t0) * 9));
    if (fl > 0.003) { ctx.fillStyle = `rgba(232,244,255,${fl})`; ctx.fillRect(0, 0, W, H); }
    // fade in from black, fade out to black
    const fin = 1 - Math.min(1, t / 0.35), fout = Math.max(0, (t - (F.DUR - 0.6)) / 0.6);
    const blk = Math.max(fin, fout);
    if (blk > 0) { ctx.fillStyle = `rgba(0,0,0,${blk})`; ctx.fillRect(0, 0, W, H); }
    // letterbox
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 54);
    ctx.fillRect(0, H - 54, W, 54);
    if (opts.subtitles !== false) AD.drawSubtitles(ctx, t, F.SUBS);
    ctx.restore();
  };

  // ---------------------------------------------------------------------
  // Score + sound design
  // ---------------------------------------------------------------------
  const CHORDS = [
    [0.0, 38, [50, 57, 62, 64]],      // D5 add9 — darkness
    [2.0, 38, [50, 53, 57, 62]],      // Dm   trays
    [4.0, 34, [46, 50, 53, 58]],      // Bb   switchboard
    [6.5, 41, [53, 57, 60, 65]],      // F    infrastructure
    [8.0, 36, [48, 52, 55, 60]],      // C    building
    [10.5, 38, [50, 53, 57, 62]],     // Dm   city
    [11.75, 34, [46, 50, 53, 58]],    // Bb
    [13.0, 38, [50, 57, 62, 64]],     // D5 add9 — "יש חשמל..." (quiet)
    [15.0, 33, [45, 49, 52, 57]],     // A    "ויש —"
    [16.5, 38, [50, 53, 57, 62]],     // Dm   "חשמלי" — the drop
    [18.5, 34, [46, 50, 53, 58]],     // Bb   "עוצמה"
    [19.5, 41, [53, 57, 60, 65]],     // F    "דיוק"
    [20.5, 36, [48, 52, 55, 60]],     // C    "מקצועיות"
    [21.0, 43, [55, 58, 62, 67]],     // Gm
    [21.625, 33, [45, 49, 52, 57]],   // A    the burst
    [22.5, 38, [50, 57, 62, 66]],     // D major add9 — logo
  ];
  const chordAt = (t) => { let c = CHORDS[0]; for (const x of CHORDS) if (x[0] <= t + 1e-6) c = x; return c; };
  const MELODY = [   // [time, midi, beats]
    [10.5, 69, 2], [11.5, 74, 1], [12.0, 72, 1], [12.5, 69, 1],
    [16.5, 74, 2], [17.5, 77, 1], [18.0, 76, 1],
    [18.5, 74, 2], [19.5, 72, 2], [20.5, 76, 1], [21.0, 74, 1.25], [21.625, 73, 1.75],
  ];

  AD.buildFilmAudio = function (ac, opts = {}) {
    const B = F.BEAT;
    const K = AD.createKit(ac, { ...opts, dur: F.DUR, fadeAt: 29.2, gaps: [[16.32, 16.5], [21.42, 21.625]] });
    const { at, rand, music, seq, narrate, osc, filt, out, crackle, clack, whoosh, riser, boom, ting, zap, metalHit, subDrop,
      reverseSwell, arc, chargeUp, passby, thunder, impact, kick, snare, taiko, bass, lead, bell, braam } = K;
    const { beat, arpBar, bassBar, hats } = seq(B, chordAt);
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

    // ---------- beds ----------
    { // electrical hum, opening half
      const lp = filt('lowpass', 200, 3), g = ac.createGain();
      [['sawtooth', 50], ['sawtooth', 50.4], ['sine', 100]].forEach(([ty, f]) => { const o = osc(ty, f, 0, 16); o.connect(lp); });
      lp.connect(g); out(g, 0.05);
      const p = g.gain;
      p.setValueAtTime(0.0001, at(0));
      p.exponentialRampToValueAtTime(0.05, at(0.4));
      p.linearRampToValueAtTime(0.025, at(4));
      p.exponentialRampToValueAtTime(0.004, at(8));
      p.linearRampToValueAtTime(0.03, at(13.3));
      p.exponentialRampToValueAtTime(0.0001, at(15.5));
    }
    { // pad following the chords
      const lp = filt('lowpass', 300, 0.9), g = ac.createGain();
      for (let v = 0; v < 4; v++) {
        for (const det of [-9, 9]) {
          const o = osc('sawtooth', mtof(CHORDS[0][2][v]), 0, F.DUR);
          o.detune.value = det;
          for (const [ct, , voicing] of CHORDS) o.frequency.setTargetAtTime(mtof(voicing[v]), at(ct), 0.05);
          const vg = ac.createGain(); vg.gain.value = 0.16;
          o.connect(vg); vg.connect(lp);
        }
      }
      lp.connect(g); out(g, 0.5, music);
      const f = lp.frequency, p = g.gain;
      f.setValueAtTime(260, at(0));
      f.exponentialRampToValueAtTime(900, at(8));
      f.exponentialRampToValueAtTime(1800, at(12.9));
      f.setTargetAtTime(380, at(13.0), 0.08);
      f.setTargetAtTime(1200, at(15.0), 0.4);
      f.setTargetAtTime(2800, at(16.5), 0.1);
      f.setTargetAtTime(1600, at(22.5), 1.0);
      p.setValueAtTime(0.0001, at(0));
      p.exponentialRampToValueAtTime(0.05, at(2.0));
      p.linearRampToValueAtTime(0.09, at(12.9));
      p.setTargetAtTime(0.045, at(13.0), 0.1);
      p.setTargetAtTime(0.09, at(15.0), 0.5);
      p.setTargetAtTime(0.12, at(16.5), 0.05);
      p.setTargetAtTime(0.14, at(22.5), 0.05);
      p.setTargetAtTime(0.07, at(25.0), 0.6);
    }

    // ---------- 0–2: the cable ignites ----------
    crackle(0.05, 30, 0.35, 1.6);
    arc(0.1, 0.5, 0.11, -0.3);
    zap(0.3, 0.3, 0.12);
    whoosh(0.2, 1.2, 300, 3000, 0.18, -0.7, 0.7);
    riser(0.9, 1.1, 0.12);
    reverseSwell(2.0, 0.8, 0.16);
    kick(1.5, 0.3); kick(1.75, 0.35);

    // ---------- 2–4: trays — Dm ----------
    impact(2.0, 0.8, 0.6);
    braam(2.0, 38, 1.2, 0.07);
    for (const n of [0, 2]) kick(beat(2, n), 0.5);
    kick(beat(2, 3.5), 0.35);
    bassBar(2.0, 0.08, 4, 420);
    passby(2.05, 0.8, 0.14, 1); passby(3.0, 0.8, 0.14, -1);
    crackle(2.0, 24, 0.13, 2);
    reverseSwell(4.0, 0.5, 0.12);

    // ---------- 4–6.5: switchboard — Bb, breakers on 8ths ----------
    impact(4.0, 0.7, 0.5, -0.3);
    for (let n = 0; n < 5; n++) kick(beat(4, n), 0.45);
    snare(beat(4, 1), 0.18); snare(beat(4, 3), 0.2);
    bassBar(4.0, 0.09, 5, 600);
    hats(4.0, 0.05, 5, 2);
    for (let i = 0; i < 7; i++) {
      const b = 4.5 + i * 0.25;
      clack(b, i < 3 ? 1 : 0.75); metalHit(b, 0.12, (i - 3) / 4); arc(b + 0.01, 0.08, 0.07, (i - 3) / 4);
    }
    reverseSwell(6.5, 0.5, 0.12);

    // ---------- 6.5–8: infrastructure — F, arp enters ----------
    impact(6.5, 0.7, 0.5, 0.3);
    for (let n = 0; n < 3; n++) kick(beat(6.5, n), 0.45);
    snare(beat(6.5, 1), 0.2);
    bassBar(6.5, 0.1, 3, 750);
    hats(6.5, 0.055, 3, 4);
    arpBar(6.5, 0.045, 3);
    passby(6.6, 0.9, 0.1, 1);
    reverseSwell(8.0, 0.6, 0.13);

    // ---------- 8–10.5: the building lights up — C ----------
    impact(8.0, 0.8, 0.55);
    for (let n = 0; n < 5; n++) kick(beat(8, n), 0.45);
    for (const n of [1, 3]) snare(beat(8, n), 0.22);
    bassBar(8.0, 0.1, 5, 900);
    hats(8.0, 0.06, 5, 4);
    arpBar(8.0, 0.045, 5);
    arc(8.25, 1.25, 0.06, -0.2);     // lightning climbing the facade
    chargeUp(9.6, 1.2, 0.04);
    reverseSwell(10.5, 0.6, 0.14);

    // ---------- 10.5–13: the city grid — Dm | Bb, melody ----------
    impact(10.5, 0.9, 0.6); taiko(10.5, 0.35);
    for (let n = 0; n < 5; n++) kick(beat(10.5, n), 0.45);
    for (const n of [1, 3]) snare(beat(10.5, n), 0.24);
    bassBar(10.5, 0.1, 5, 1000);
    hats(10.5, 0.06, 5, 4);
    arpBar(10.5, 0.04, 5);
    for (let i = 0; i < 4; i++) whoosh(10.6 + i * 0.6, 0.6, 500, 2600, 0.07, i % 2 ? 0.8 : -0.8, i % 2 ? -0.8 : 0.8);
    riser(12.0, 1.0, 0.11);
    snare(beat(12, 1.5), 0.16); snare(beat(12, 1.75), 0.2);
    reverseSwell(13.0, 0.7, 0.18);

    // ---------- 13–15: "יש חשמל..." — everything drops away ----------
    impact(13.0, 1.2, 0.7);
    thunder(13.05, 0.16, 2.6);
    ting(13.02, 0.05);
    for (const n of [1, 3]) kick(beat(13, n), 0.22);   // heartbeat
    bass(13.0, 26, 2.0, 0.09, 200);
    arc(13.9, 0.3, 0.05, 0.6);
    riser(14.0, 1.0, 0.14);
    reverseSwell(15.0, 0.7, 0.16);

    // ---------- 15–16.5: "ויש —" — the charger draws power ----------
    impact(15.0, 0.6, 0.45);
    for (const n of [0, 1]) bass(beat(15, n), 33, B * 0.9, 0.08, 500);
    for (let i = 0; i < 10; i++) snare(15.5 + i * 0.08, 0.04 + i * 0.013);
    chargeUp(16.3, 1.1, 0.08);

    // ---------- 16.5–18.5: "חשמלי" — the drop ----------
    impact(16.5, 1.4, 0.85);
    braam(16.5, 38, 1.4, 0.13);
    thunder(16.55, 0.12, 2.0);
    arc(16.5, 0.45, 0.12);
    for (let n = 0; n < 4; n++) kick(beat(16.5, n), 0.5);
    for (const n of [1, 3]) snare(beat(16.5, n), 0.24);
    bassBar(16.5, 0.11, 4, 1100);
    hats(16.5, 0.065, 4, 4);
    arpBar(16.5, 0.05, 4);
    impact(17.0, 0.6, 0.4);

    // ---------- 18.5–21: "עוצמה. דיוק. מקצועיות." — a hit on every word ----------
    for (const [h, root] of [[18.5, 34], [19.5, 41], [20.5, 36]]) {
      impact(h, 1.0, 0.7); braam(h, root, 0.9, 0.1); taiko(h, 0.32); arc(h, 0.3, 0.1, (h - 19.5) * 0.5);
    }
    for (let n = 0; n < 5; n++) kick(beat(18.5, n), 0.42);
    bassBar(18.5, 0.1, 5, 1100);
    hats(18.5, 0.06, 5, 4);
    arpBar(18.5, 0.045, 5);

    // ---------- 21–22.5: the burst ----------
    kick(21.0, 0.45);
    for (let i = 0; i < 6; i++) snare(21.0 + i * 0.07, 0.12 + i * 0.03);
    riser(20.9, 0.52, 0.16, 400, 7000);
    reverseSwell(21.42, 0.9, 0.2);
    impact(21.625, 1.9, 1.0);
    thunder(21.65, 0.18, 3.0);
    metalHit(21.64, 0.3);
    arc(21.625, 0.6, 0.12);

    // ---------- 22.5–25: the logo — D major ----------
    impact(22.5, 1.0, 0.6);
    braam(22.5, 38, 2.4, 0.14);
    ting(22.52, 0.12);
    bass(22.5, 38, 2.4, 0.1, 500);
    crackle(22.6, 26, 0.18, 2.2);
    bell(22.5, 78, 0.06); bell(23.5, 81, 0.05); bell(24.25, 86, 0.05);

    // ---------- 25–30: contact card — the closing sting ----------
    reverseSwell(25.0, 0.8, 0.18);
    impact(25.0, 1.1, 0.65);
    metalHit(25.02, 0.25);
    bell(25.0, 74, 0.07); bell(25.5, 81, 0.05); bell(26.0, 78, 0.05); bell(27.0, 74, 0.06);
    subDrop(27.0, 0.12, 1.2);
    crackle(25.6, 14, 0.12, 2.4);

    for (const [t, m, beats] of MELODY) lead(t, m, beats * B, t < 13 ? 0.035 : 0.05);

    narrate(F.VO, F.voice);
    return K.master;
  };

  F.loadVoice = function (base = '') {
    return fetch(base + F.VOICE_SRC)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('narration ' + r.status))))
      .then((buf) => new OfflineAudioContext(1, 1, 48000).decodeAudioData(buf))
      .then((ab) => { F.voice = ab; });
  };
})(typeof window !== 'undefined' ? window : globalThis);
