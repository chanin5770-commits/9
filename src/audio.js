/* Score, sound design and narration for the "חשמלי" commercial (Web Audio API).
 *
 * AD.buildAudio(ac, {startAt, from, destination}) schedules the full 30s mix on any
 * AudioContext or OfflineAudioContext. startAt = context time of ad t=0; `from`
 * skips events before that ad time (used when the player starts mid-ad).
 *
 * Music: 80 BPM in D minor, one 4/4 bar per storyboard panel (bar 1 = 0:02).
 * Every cut, breaker CLACK, floor light and impact is placed on the beat grid.
 * The music bus ducks under each narration phrase. */
(function (global) {
  'use strict';

  const AD = global.AD;
  const B = AD.BEAT;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Chord track: [time, bass midi, voicing]
  const CHORDS = [
    [0.0, 38, [50, 57, 62, 64]],     // pickup drone: D5 add9
    [2.0, 38, [50, 53, 57, 62]],     // Dm      panel 2
    [5.0, 34, [46, 50, 53, 58]],     // Bb      panel 3
    [8.0, 41, [53, 57, 60, 65]],     // F       panel 4
    [9.5, 36, [48, 52, 55, 60]],     // C
    [11.0, 38, [50, 53, 57, 62]],    // Dm      panel 5
    [12.5, 34, [46, 50, 53, 58]],    // Bb
    [14.0, 38, [50, 57, 62, 64]],    // D5 add9 panel 6 (quiet: "יש חשמל...")
    [17.0, 33, [45, 49, 52, 57]],    // A       panel 7 ("ויש —")
    [18.5, 38, [50, 53, 57, 62]],    // Dm      ("חשמלי" — the drop)
    [20.0, 34, [46, 50, 53, 58]],    // Bb      panel 8 ("עוצמה")
    [21.125, 41, [53, 57, 60, 65]],  // F       ("דיוק")
    [22.25, 36, [48, 52, 55, 60]],   // C       ("מקצועיות")
    [23.0, 43, [55, 58, 62, 67]],    // Gm      panel 9
    [24.5, 33, [45, 49, 52, 57]],    // A       (dominant build)
    [26.0, 38, [50, 57, 62, 66]],    // D major add9 — logo resolution
  ];
  const chordAt = (t) => { let c = CHORDS[0]; for (const x of CHORDS) if (x[0] <= t + 1e-6) c = x; return c; };

  // Lead melody [time, midi, beats]
  const MELODY = [
    // panel 5 motif
    [11.0, 69, 1], [11.75, 74, 0.5], [12.125, 72, 0.5], [12.5, 69, 1], [13.25, 67, 0.5], [13.625, 65, 0.5],
    // the drop + panel 8 chorus
    [18.5, 74, 1], [19.25, 77, 0.5], [19.625, 76, 0.5],
    [20.0, 74, 1.5], [21.125, 72, 1.5], [22.25, 76, 1],
    // panel 9 build
    [23.0, 74, 2], [24.5, 73, 2],
  ];

  function lcg(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  function makeNoise(ac, seconds) {
    const len = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(2, len, ac.sampleRate), r = lcg(99);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = r() * 2 - 1; }
    return buf;
  }
  function makeIR(ac, seconds, decay) {
    const len = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(2, len, ac.sampleRate), r = lcg(7);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }

  AD.buildAudio = function (ac, opts = {}) {
    const T0 = opts.startAt ?? ac.currentTime + 0.05;
    const from = opts.from ?? 0;
    const dest = opts.destination || ac.destination;
    const at = (t) => Math.max(0, T0 + t);
    const live = (t) => t >= from - 0.02;
    const rand = lcg(2024);

    // ---------- buses ----------
    const master = ac.createGain();
    master.gain.setValueAtTime(0.8, 0);
    master.gain.setValueAtTime(0.8, at(29.4));
    master.gain.linearRampToValueAtTime(0, at(AD.DUR));
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 3.5;
    comp.attack.value = 0.005; comp.release.value = 0.25;
    const limiter = ac.createDynamicsCompressor();   // brick-wall safety for the big hits
    limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.1;
    master.connect(comp);
    comp.connect(limiter);
    limiter.connect(dest);
    // a breath of silence right before the two biggest hits
    for (const [g0, g1] of [[18.3, 18.5], [25.75, 26.0]]) {
      master.gain.setValueAtTime(0.8, at(g0));
      master.gain.linearRampToValueAtTime(0.06, at(g0 + 0.05));
      master.gain.setValueAtTime(0.06, at(g1 - 0.01));
      master.gain.linearRampToValueAtTime(0.8, at(g1));
    }

    const rev = ac.createConvolver();
    rev.buffer = makeIR(ac, 3.2, 2.6);
    const revOut = ac.createGain();
    revOut.gain.value = 0.42;
    rev.connect(revOut);
    revOut.connect(master);

    const music = ac.createGain();   // ducked under the narration
    music.connect(master);
    const sfx = ac.createGain();
    sfx.connect(master);
    const voiceBus = ac.createGain();
    voiceBus.gain.value = 1.7;
    voiceBus.connect(master);

    const noise = makeNoise(ac, 2.5);

    function out(node, wet = 0, bus = sfx, pan = 0) {
      let n = node;
      if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
      n.connect(bus);
      if (wet) { const g = ac.createGain(); g.gain.value = wet; n.connect(g); g.connect(rev); }
    }
    function envGain(t, a, peak, d) {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, at(t));
      g.gain.linearRampToValueAtTime(peak, at(t + a));
      g.gain.exponentialRampToValueAtTime(0.0001, at(t + a + d));
      return g;
    }
    function noiseSrc(t, dur) {
      const s = ac.createBufferSource();
      s.buffer = noise; s.loop = true;
      s.start(at(t), rand() * 2);
      s.stop(at(t + dur + 0.05));
      return s;
    }
    function osc(type, f, t, dur) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, at(t));
      o.start(at(t));
      o.stop(at(t + dur + 0.05));
      return o;
    }
    function filt(type, f, q = 0.7) {
      const b = ac.createBiquadFilter();
      b.type = type; b.frequency.value = f; b.Q.value = q;
      return b;
    }
    const shaper = (() => {
      const c = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * 3); }
      return c;
    })();

    // =====================================================================
    // sound effects
    // =====================================================================
    function tick(t, g, hp = 3500, pan = 0) {
      if (!live(t)) return;
      const s = noiseSrc(t, 0.03), f = filt('highpass', hp), e = envGain(t, 0.0008, g, 0.012 + rand() * 0.02);
      s.connect(f); f.connect(e); out(e, 0.15, sfx, pan);
    }
    function crackle(t, n, g, spread = 0.25) {
      for (let i = 0; i < n; i++) tick(t + rand() * spread, g * (0.3 + rand() * 0.7), 2500 + rand() * 5000, (rand() - 0.5) * 1.2);
    }
    function clack(t, heavy = 1) {
      if (!live(t)) return;
      let s = noiseSrc(t, 0.12), f = filt('lowpass', 2400, 1.2), e = envGain(t, 0.001, 0.5 * heavy, 0.07);
      s.connect(f); f.connect(e); out(e, 0.25);
      s = noiseSrc(t, 0.03); f = filt('highpass', 5200); e = envGain(t, 0.0005, 0.32 * heavy, 0.014);
      s.connect(f); f.connect(e); out(e, 0.1);
      const o = osc('sine', 130, t, 0.25);
      o.frequency.exponentialRampToValueAtTime(48, at(t + 0.12));
      e = envGain(t, 0.002, 0.7 * heavy, 0.16);
      o.connect(e); out(e, 0.2);
    }
    function whoosh(t, dur, f0, f1, g, pan = 0, p1 = null) {
      if (!live(t)) return;
      const s = noiseSrc(t, dur), f = filt('bandpass', f0, 1.4);
      f.frequency.setValueAtTime(f0, at(t));
      f.frequency.exponentialRampToValueAtTime(f1, at(t + dur));
      const e = ac.createGain();
      e.gain.setValueAtTime(0.0001, at(t));
      e.gain.exponentialRampToValueAtTime(g, at(t + dur * 0.75));
      e.gain.exponentialRampToValueAtTime(0.0001, at(t + dur));
      s.connect(f); f.connect(e);
      if (p1 !== null && ac.createStereoPanner) {
        const p = ac.createStereoPanner();
        p.pan.setValueAtTime(pan, at(t)); p.pan.linearRampToValueAtTime(p1, at(t + dur));
        e.connect(p); out(p, 0.3);
      } else out(e, 0.3, sfx, pan);
    }
    function riser(t, dur, g, f0 = 300, f1 = 6000) {
      if (!live(t)) return;
      const s = noiseSrc(t, dur), f = filt('bandpass', f0, 0.9), e = ac.createGain();
      f.frequency.setValueAtTime(f0, at(t));
      f.frequency.exponentialRampToValueAtTime(f1, at(t + dur));
      e.gain.setValueAtTime(0.0001, at(t));
      e.gain.exponentialRampToValueAtTime(g, at(t + dur - 0.01));
      e.gain.setValueAtTime(0.0001, at(t + dur));
      s.connect(f); f.connect(e); out(e, 0.35);
      for (const [m, ty] of [[45, 'sawtooth'], [52, 'triangle']]) {
        const o = osc(ty, mtof(m), t, dur), og = ac.createGain(), lp = filt('lowpass', 1800);
        o.frequency.exponentialRampToValueAtTime(mtof(m + 24), at(t + dur));
        og.gain.setValueAtTime(0.0001, at(t));
        og.gain.exponentialRampToValueAtTime(g * 0.25, at(t + dur - 0.01));
        og.gain.setValueAtTime(0.0001, at(t + dur));
        o.connect(lp); lp.connect(og); out(og, 0.3);
      }
    }
    function boom(t, size, g) {
      if (!live(t)) return;
      let o = osc('sine', 150, t, 3 * size);
      o.frequency.exponentialRampToValueAtTime(30, at(t + 1.2 * size));
      let e = envGain(t, 0.004, g, 2.2 * size);
      o.connect(e); out(e, 0.35);
      const s = noiseSrc(t, 1.2 * size), f = filt('lowpass', 520, 0.8);
      f.frequency.setValueAtTime(1000, at(t));
      f.frequency.exponentialRampToValueAtTime(120, at(t + 0.9 * size));
      e = envGain(t, 0.003, g * 0.6, 0.9 * size);
      s.connect(f); f.connect(e); out(e, 0.6);
    }
    function ting(t, g) {
      if (!live(t)) return;
      [[1720, 1, 1.9], [2493, 0.6, 1.4], [3611, 0.4, 1.0], [5133, 0.25, 0.7]].forEach(([f, m, d]) => {
        const o = osc('sine', f, t, d + 0.1), e = envGain(t, 0.002, g * m, d);
        o.connect(e); out(e, 0.7);
      });
    }
    function zap(t, dur, g) {
      if (!live(t)) return;
      const ws = ac.createWaveShaper();
      ws.curve = shaper;
      const bp = filt('bandpass', 1100, 0.9), e = envGain(t, 0.003, g, dur);
      [55, 82.5, 110.7].forEach((f) => { const o = osc('sawtooth', f, t, dur + 0.1); o.connect(ws); });
      ws.connect(bp); bp.connect(e); out(e, 0.3);
      crackle(t, 10, g * 0.7, dur);
    }
    function blip(t, f, g, pan) {
      if (!live(t)) return;
      const o = osc('sine', f, t, 0.08), e = envGain(t, 0.002, g, 0.05);
      o.connect(e); out(e, 0.2, sfx, pan);
    }

    // ---------- dramatic layer ----------
    // Metallic clang: inharmonic partials + bright transient.
    function metalHit(t, g, pan = 0) {
      if (!live(t)) return;
      [[523, 1, 1.1], [1187, 0.7, 0.8], [1730, 0.5, 0.6], [2611, 0.35, 0.45], [3890, 0.22, 0.3]].forEach(([f, m, d], i) => {
        const o = osc(i % 2 ? 'triangle' : 'sine', f * (1 + (rand() - 0.5) * 0.01), t, d + 0.1), e = envGain(t, 0.001, g * m * 0.5, d);
        o.connect(e); out(e, 0.6, sfx, pan);
      });
      const s = noiseSrc(t, 0.1), f = filt('bandpass', 3200, 1.5), e = envGain(t, 0.0005, g * 0.8, 0.05);
      s.connect(f); f.connect(e); out(e, 0.4, sfx, pan);
    }
    // Sub drop: a falling sine that you feel more than hear.
    function subDrop(t, g, dur = 2.2) {
      if (!live(t)) return;
      const o = osc('sine', 95, t, dur + 0.1);
      o.frequency.exponentialRampToValueAtTime(24, at(t + dur));
      const e = envGain(t, 0.01, g, dur);
      o.connect(e); out(e, 0.05);
    }
    // Reverse swell: rises out of nothing and stops dead on t1 (the cut).
    function reverseSwell(t1, dur, g) {
      const t = t1 - dur;
      if (!live(t)) return;
      const s = noiseSrc(t, dur), hp = filt('highpass', 600), bp = filt('bandpass', 700, 0.8), e = ac.createGain();
      bp.frequency.setValueAtTime(700, at(t));
      bp.frequency.exponentialRampToValueAtTime(7500, at(t1));
      e.gain.setValueAtTime(0.0001, at(t));
      e.gain.exponentialRampToValueAtTime(g, at(t1 - 0.006));
      e.gain.setValueAtTime(0.0001, at(t1));
      s.connect(hp); hp.connect(bp); bp.connect(e); out(e, 0.25);
    }
    // Electric arc: a 100 Hz buzz, distorted and stuttering like a Jacob's ladder.
    function arc(t, dur, g, pan = 0) {
      if (!live(t)) return;
      const ws = ac.createWaveShaper(); ws.curve = shaper;
      const bp = filt('bandpass', 1600, 0.8), e = ac.createGain();
      [100, 150.5, 201].forEach((f) => { const o = osc('sawtooth', f, t, dur + 0.05); o.connect(ws); });
      const n = noiseSrc(t, dur), ng = ac.createGain(); ng.gain.value = 0.6; n.connect(ng); ng.connect(ws);
      e.gain.setValueAtTime(0.0001, at(t));
      for (let x = 0; x < dur; x += 0.018) e.gain.setValueAtTime(g * (0.25 + 0.75 * rand()) * (rand() > 0.15 ? 1 : 0.1), at(t + x));
      e.gain.setValueAtTime(g * 0.3, at(t + dur - 0.02));
      e.gain.exponentialRampToValueAtTime(0.0001, at(t + dur));
      ws.connect(bp); bp.connect(e); out(e, 0.3, sfx, pan);
      crackle(t, Math.ceil(dur * 40), g * 0.8, dur);
    }
    // Charge-up whine ending on t1.
    function chargeUp(t1, dur, g) {
      const t = t1 - dur;
      if (!live(t)) return;
      const o = osc('sawtooth', 180, t, dur), lp = filt('lowpass', 2500, 4), e = ac.createGain();
      o.frequency.exponentialRampToValueAtTime(1800, at(t1));
      e.gain.setValueAtTime(0.0001, at(t));
      e.gain.exponentialRampToValueAtTime(g, at(t1 - 0.01));
      e.gain.setValueAtTime(0.0001, at(t1));
      o.connect(lp); lp.connect(e); out(e, 0.3);
    }
    // Pass-by: a whoosh that pans across with a doppler pitch drop.
    function passby(t, dur, g, dir = 1) {
      if (!live(t)) return;
      whoosh(t, dur, 900, 280, g, -0.9 * dir, 0.9 * dir);
      const o = osc('triangle', 520, t, dur), e = envGain(t, dur * 0.5, g * 0.25, dur * 0.5);
      o.frequency.setValueAtTime(560, at(t));
      o.frequency.exponentialRampToValueAtTime(230, at(t + dur));
      o.connect(e); out(e, 0.2, sfx, 0.5 * dir);
    }
    // Distant thunder roll.
    function thunder(t, g, dur = 2.8) {
      if (!live(t)) return;
      const s = noiseSrc(t, dur), lp = filt('lowpass', 260, 0.7), e = ac.createGain();
      e.gain.setValueAtTime(0.0001, at(t));
      e.gain.exponentialRampToValueAtTime(g, at(t + 0.25));
      e.gain.exponentialRampToValueAtTime(g * 0.4, at(t + 0.9));
      e.gain.exponentialRampToValueAtTime(g * 0.7, at(t + 1.3));
      e.gain.exponentialRampToValueAtTime(0.0001, at(t + dur));
      s.connect(lp); lp.connect(e); out(e, 0.5);
    }
    // The layered cinematic impact used on every cut.
    function impact(t, size, g, pan = 0) {
      boom(t, size, g * 0.7);
      subDrop(t, g * 0.55, 1.4 * size);
      metalHit(t, g * 0.32, pan);
      if (live(t)) {
        const s = noiseSrc(t, 0.5), f = filt('lowpass', 5000), e = envGain(t, 0.001, g * 0.4, 0.35 * size);
        s.connect(f); f.connect(e); out(e, 0.7);
      }
      crackle(t, Math.round(10 * size), g * 0.3, 0.35 * size);
    }

    // =====================================================================
    // instruments
    // =====================================================================
    function kick(t, g, bus = music) {
      if (!live(t)) return;
      const o = osc('sine', 160, t, 0.5);
      o.frequency.exponentialRampToValueAtTime(44, at(t + 0.13));
      const e = envGain(t, 0.002, g, 0.42);
      o.connect(e); out(e, 0.1, bus);
      const c = noiseSrc(t, 0.02), f = filt('highpass', 3000), e2 = envGain(t, 0.0005, g * 0.25, 0.01);
      c.connect(f); f.connect(e2); out(e2, 0, bus);
    }
    function snare(t, g, bus = music) {
      if (!live(t)) return;
      const s = noiseSrc(t, 0.3), f = filt('bandpass', 1900, 0.6), e = envGain(t, 0.001, g, 0.2);
      s.connect(f); f.connect(e); out(e, 0.4, bus);
      const o = osc('triangle', 200, t, 0.2);
      o.frequency.exponentialRampToValueAtTime(130, at(t + 0.08));
      const e2 = envGain(t, 0.001, g * 0.7, 0.1);
      o.connect(e2); out(e2, 0.3, bus);
    }
    function hat(t, g, pan = 0.25) {
      if (!live(t)) return;
      const s = noiseSrc(t, 0.06), f = filt('highpass', 8000), e = envGain(t, 0.0008, g, 0.028);
      s.connect(f); f.connect(e); out(e, 0.05, music, pan);
    }
    function taiko(t, g) {
      if (!live(t)) return;
      const o = osc('sine', 92, t, 1.0);
      o.frequency.exponentialRampToValueAtTime(48, at(t + 0.3));
      const e = envGain(t, 0.003, g, 0.8);
      o.connect(e); out(e, 0.45);
      const s = noiseSrc(t, 0.2), f = filt('lowpass', 900), e2 = envGain(t, 0.002, g * 0.35, 0.12);
      s.connect(f); f.connect(e2); out(e2, 0.45);
    }
    function bass(t, m, dur, g, cut = 700) {
      if (!live(t)) return;
      const lp = filt('lowpass', cut, 3), e = envGain(t, 0.004, g, dur);
      lp.frequency.setValueAtTime(cut * 2.2, at(t));
      lp.frequency.exponentialRampToValueAtTime(cut * 0.6, at(t + dur));
      const a = osc('sawtooth', mtof(m), t, dur + 0.05), sub = osc('sine', mtof(m - 12), t, dur + 0.05);
      const sg = ac.createGain(); sg.gain.value = 0.9;
      a.connect(lp); sub.connect(sg); sg.connect(e); lp.connect(e); out(e, 0.05, music);
    }
    function pluck(t, m, g, pan = 0, cut = 2600) {
      if (!live(t)) return;
      const lp = filt('lowpass', cut, 4), e = envGain(t, 0.002, g, 0.22);
      lp.frequency.setValueAtTime(cut, at(t));
      lp.frequency.exponentialRampToValueAtTime(260, at(t + 0.2));
      const a = osc('sawtooth', mtof(m), t, 0.3), b = osc('square', mtof(m) * 1.003, t, 0.3);
      a.connect(lp); b.connect(lp); lp.connect(e); out(e, 0.3, music, pan);
    }
    function lead(t, m, dur, g) {
      if (!live(t)) return;
      const lp = filt('lowpass', 2400, 1.2), e = ac.createGain();
      e.gain.setValueAtTime(0.0001, at(t));
      e.gain.linearRampToValueAtTime(g, at(t + 0.04));
      e.gain.setValueAtTime(g * 0.85, at(t + dur - 0.05));
      e.gain.exponentialRampToValueAtTime(0.0001, at(t + dur + 0.25));
      const vib = osc('sine', 5.5, t, dur + 0.3), vg = ac.createGain();
      vg.gain.setValueAtTime(0, at(t)); vg.gain.linearRampToValueAtTime(7, at(t + Math.min(0.4, dur)));
      vib.connect(vg);
      for (const [ty, det, mul, lv] of [['sawtooth', -7, 1, 0.5], ['sawtooth', 7, 1, 0.5], ['triangle', 0, 0.5, 0.6]]) {
        const o = osc(ty, mtof(m) * mul, t, dur + 0.3);
        o.detune.value = det;
        vg.connect(o.detune);
        const og = ac.createGain(); og.gain.value = lv;
        o.connect(og); og.connect(lp);
      }
      lp.connect(e); out(e, 0.45, music);
    }
    function bell(t, m, g, bus = music) {
      if (!live(t)) return;
      const f = mtof(m);
      [[1, 1, 2.2], [2.76, 0.4, 1.2], [5.4, 0.2, 0.6]].forEach(([k, lv, d]) => {
        const o = osc('sine', f * k, t, d + 0.1), e = envGain(t, 0.002, g * lv, d);
        o.connect(e); out(e, 0.6, bus);
      });
    }
    function braam(t, root, dur, g) {
      if (!live(t)) return;
      const ws = ac.createWaveShaper(); ws.curve = shaper;
      const lp = filt('lowpass', 300, 1.5), e = envGain(t, 0.02, g, dur);
      lp.frequency.setValueAtTime(300, at(t));
      lp.frequency.exponentialRampToValueAtTime(1600, at(t + 0.12));
      lp.frequency.exponentialRampToValueAtTime(350, at(t + dur));
      for (const [iv, det] of [[-12, -9], [-12, 9], [0, -6], [7, 5], [12, 0]]) {
        const o = osc('sawtooth', mtof(root + iv), t, dur + 0.1);
        o.detune.value = det;
        o.connect(ws);
      }
      ws.connect(lp); lp.connect(e); out(e, 0.5);
      const sub = osc('sine', mtof(root - 12), t, dur), se = envGain(t, 0.01, g * 1.2, dur);
      sub.connect(se); out(se, 0);
    }

    // =====================================================================
    // continuous beds
    // =====================================================================
    // electrical hum — rises out of the dark, carries panels 1–4
    {
      const lp = filt('lowpass', 180, 3), g = ac.createGain();
      [['sawtooth', 50], ['sawtooth', 50.4], ['sine', 100]].forEach(([ty, f], i) => {
        const o = osc(ty, f, 0, 17), og = ac.createGain();
        og.gain.value = [0.5, 0.5, 0.6][i];
        o.connect(og); og.connect(lp);
      });
      lp.connect(g); out(g, 0.05);
      const p = g.gain;
      p.setValueAtTime(0.0001, at(0));
      p.exponentialRampToValueAtTime(0.09, at(0.4));
      p.linearRampToValueAtTime(0.05, at(2.0));
      p.linearRampToValueAtTime(0.03, at(8.0));
      p.exponentialRampToValueAtTime(0.008, at(11.0));
      p.linearRampToValueAtTime(0.04, at(14.3));   // returns for the tense "יש חשמל..."
      p.exponentialRampToValueAtTime(0.0001, at(17.0));
      lp.frequency.setValueAtTime(140, at(0));
      lp.frequency.linearRampToValueAtTime(480, at(0.45));
      lp.frequency.setValueAtTime(320, at(0.6));
    }
    // pad — follows the chord track, opens with the story
    {
      const lp = filt('lowpass', 300, 0.9), g = ac.createGain();
      for (let v = 0; v < 4; v++) {
        for (const det of [-9, 9]) {
          const o = osc('sawtooth', mtof(CHORDS[0][2][v]), 0, AD.DUR);
          o.detune.value = det;
          for (const [ct, , voicing] of CHORDS) o.frequency.setTargetAtTime(mtof(voicing[v]), at(ct), 0.05);
          const vg = ac.createGain(); vg.gain.value = 0.16;
          o.connect(vg); vg.connect(lp);
        }
      }
      lp.connect(g); out(g, 0.5, music);
      const f = lp.frequency, p = g.gain;
      f.setValueAtTime(260, at(0));
      f.exponentialRampToValueAtTime(700, at(8));
      f.exponentialRampToValueAtTime(1600, at(13.9));
      f.setTargetAtTime(380, at(14.0), 0.08);
      f.setTargetAtTime(1200, at(17.0), 0.5);
      f.setTargetAtTime(2600, at(18.5), 0.1);
      f.exponentialRampToValueAtTime(3200, at(25.9));
      f.setTargetAtTime(1500, at(26.0), 1.2);
      p.setValueAtTime(0.0001, at(0));
      p.exponentialRampToValueAtTime(0.05, at(2.0));
      p.linearRampToValueAtTime(0.08, at(11.0));
      p.linearRampToValueAtTime(0.1, at(13.95));
      p.setTargetAtTime(0.05, at(14.0), 0.1);
      p.setTargetAtTime(0.09, at(17.0), 0.6);
      p.setTargetAtTime(0.12, at(18.5), 0.05);
      p.setTargetAtTime(0.14, at(26.0), 0.05);
      p.setTargetAtTime(0.0001, at(28.6), 0.45);
    }

    // =====================================================================
    // the score, bar by bar (bar n starts at 2 + 3n)
    // =====================================================================
    const beat = (t0, n) => t0 + n * B;
    const arpPat = [0, 2, 1, 3, 2, 0, 3, 1, 0, 2, 1, 3, 2, 3, 1, 2];
    function arpBar(t0, g, beats = 4, oct = 12) {
      for (let i = 0; i < beats * 4; i++) {
        const t = t0 + i * (B / 4), v = chordAt(t)[2];
        pluck(t, v[arpPat[i % 16]] + oct, g * (i % 4 === 0 ? 1 : 0.7), i % 2 ? 0.35 : -0.35);
      }
    }
    function bassBar(t0, g, beats = 4, cut = 700, sixteenths = false) {
      const step = sixteenths ? B / 4 : B / 2;
      for (let i = 0; i < (beats * B) / step - 0.01; i++) {
        const t = t0 + i * step, root = chordAt(t)[1];
        bass(t, root + (i % 4 === 2 ? 12 : 0), step * 0.85, g * (i % 2 ? 0.75 : 1), cut);
      }
    }
    function hats(t0, g, beats = 4, every = 4) {
      for (let i = 0; i < beats * 4; i++) if (i % (4 / every) === 0) hat(t0 + i * (B / 4), g * (i % 4 === 2 ? 1 : 0.6));
    }

    // ---- panel 1 (0–2): darkness, spark, ignition, pickup ----
    crackle(0.12, 12, 0.45, 0.1);
    zap(0.12, 0.1, 0.1);
    crackle(0.375, 10, 0.55, 0.08);
    zap(0.57, 0.35, 0.16);
    whoosh(0.55, 0.9, 300, 3000, 0.22, -0.6, 0.6);
    crackle(0.6, 26, 0.22, 1.3);
    riser(1.0, 1.0, 0.13);
    kick(beat(2, -1), 0.25); kick(beat(2, -0.5), 0.3);   // pickup into bar 1

    // ---- panel 2 (2–5): energy flows through cables — Dm ----
    boom(2.0, 0.6, 0.45); kick(2.0, 0.55); braam(2.0, 38, 1.4, 0.07);
    for (const n of [0, 2, 2.5]) kick(beat(2, n), 0.45);
    bassBar(2.0, 0.08, 4, 380);
    for (let i = 0; i < 4; i++) whoosh(beat(2, i) - 0.25, 0.5, 700 + i * 200, 250, 0.08, i % 2 ? 0.7 : -0.7, i % 2 ? -0.7 : 0.7);
    crackle(2.0, 24, 0.13, 3);
    whoosh(4.7, 0.3, 500, 5000, 0.18);

    // ---- panel 3 (5–8): the switchboard — Bb, breakers on 8ths ----
    kick(5.0, 0.55); taiko(5.0, 0.3);
    for (const n of [0, 1, 2, 3]) kick(beat(5, n), 0.42);
    snare(beat(5, 2), 0.18);
    bassBar(5.0, 0.09, 4, 550);
    hats(5.0, 0.05, 4, 2);
    AD.BREAKERS_AT.forEach((b, i) => { clack(b, i < 3 ? 1 : 0.7); crackle(b + 0.01, 4, 0.16, 0.06); });
    whoosh(7.7, 0.3, 600, 5000, 0.16);

    // ---- panel 4 (8–11): building infrastructure — F | C, arp enters ----
    kick(8.0, 0.55); boom(8.0, 0.4, 0.25);
    for (const n of [0, 1, 1.5, 2, 3, 3.5]) kick(beat(8, n), 0.42);
    snare(beat(8, 2), 0.22);
    bassBar(8.0, 0.1, 4, 700);
    hats(8.0, 0.055, 4, 4);
    arpBar(8.0, 0.045);
    for (let i = 0; i < 18; i++) blip(8.0 + Math.floor(rand() * 16) * (B / 4), 1800 + Math.floor(rand() * 4) * 450, 0.035, (rand() - 0.5) * 1.4);
    whoosh(10.7, 0.3, 500, 5000, 0.16);

    // ---- panel 5 (11–14): the tower lights up — Dm | Bb, melody ----
    kick(11.0, 0.55); taiko(11.0, 0.35);
    for (const n of [0, 1, 2, 3]) kick(beat(11, n), 0.42);
    for (const n of [1.5, 3.5]) kick(beat(11, n), 0.3);
    snare(beat(11, 2), 0.24);
    bassBar(11.0, 0.1, 4, 900);
    hats(11.0, 0.06, 4, 4);
    arpBar(11.0, 0.04);
    for (let k = 0; k < AD.FLOORS; k++) {                 // each floor = a rising note
      const v = chordAt(AD.floorAt(k))[2];
      pluck(AD.floorAt(k), v[k % 4] + 12 + 12 * Math.floor(k / 8), 0.03 + k * 0.002, (k % 2 ? 0.5 : -0.5), 3800);
      tick(AD.floorAt(k), 0.05, 2000);
    }
    riser(13.0, 1.0, 0.1);
    snare(beat(11, 3.5), 0.16); snare(beat(11, 3.75), 0.2);

    // ---- panel 6 (14–17): "יש חשמל..." — the music drops away ----
    boom(14.0, 0.9, 0.5); taiko(14.0, 0.4); ting(14.02, 0.05);
    for (const n of [1, 3]) kick(beat(14, n), 0.22);     // heartbeat
    bass(14.0, 26, 2.8, 0.09, 200);
    crackle(14.2, 30, 0.12, 2.6);
    riser(16.0, 1.0, 0.14);

    // ---- panel 7 (17–20): "ויש —" … "חשמלי" = the drop on beat 3 ----
    kick(17.0, 0.5); snare(17.0, 0.15);
    whoosh(16.75, 0.3, 400, 4000, 0.18);
    for (const n of [0, 1]) bass(beat(17, n), 33, B * 0.9, 0.08, 500);
    for (let i = 0; i < 8; i++) snare(beat(17, 1) + i * (B / 8), 0.04 + i * 0.012);   // roll into the drop
    boom(18.5, 1.1, 0.75); braam(18.5, 38, 1.4, 0.13); ting(18.52, 0.08);
    for (const n of [2, 2.5, 3, 3.5]) kick(beat(17, n), 0.5);
    bassBar(18.5, 0.11, 2, 1100);
    hats(18.5, 0.065, 2, 4);
    arpBar(18.5, 0.05, 2);

    // ---- panel 8 (20–23): "עוצמה. דיוק. מקצועיות." — a hit on every word ----
    for (const [h, root] of [[20.0, 34], [21.125, 41], [22.25, 36]]) {
      boom(h, 0.7, 0.42); braam(h, root, 1.0, 0.1); taiko(h, 0.32);
    }
    for (const n of [0, 1, 2, 3]) kick(beat(20, n), 0.42);
    snare(beat(20, 2), 0.2);
    bassBar(20.0, 0.1, 4, 1100);
    hats(20.0, 0.06, 4, 4);
    arpBar(20.0, 0.045);

    // ---- panel 9 (23–26): everything converges — Gm → A, the build ----
    kick(23.0, 0.5);
    for (let i = 0; i < 4; i++) kick(beat(23, i), 0.45);
    for (let i = 0; i < 4; i++) kick(beat(24.5, i * 0.5), 0.45);
    for (let i = 0; i < 6; i++) kick(beat(25.25, i * 0.25), 0.4 + i * 0.02);
    for (let i = 0; i < 16; i++) snare(23.0 + i * (B / 2), 0.04 + i * 0.006);            // 8ths
    for (let i = 0; i < 8; i++) snare(beat(24.5, 2) + i * (B / 4), 0.14 + i * 0.012);     // 16ths
    bassBar(23.0, 0.1, 2, 900);
    bassBar(24.5, 0.11, 2, 1300, true);
    arpBar(23.0, 0.045);
    hats(23.0, 0.07, 4, 4);
    riser(23.0, 2.74, 0.2, 200, 6500);
    for (let i = 0; i < 6; i++) whoosh(23.1 + i * 0.45, 0.45, 600, 3000, 0.07, i % 2 ? 0.8 : -0.8, 0);
    crackle(25.3, 18, 0.22, 0.6);

    // ---- panels 10–12 (26–30): FLASH, logo, slogan, clean ending ----
    boom(26.0, 1.5, 0.9); braam(26.0, 38, 2.6, 0.15); ting(26.02, 0.12); taiko(26.0, 0.4);
    bass(26.0, 38, 3.2, 0.1, 500);
    crackle(AD.LOGO_SPARK - 0.2, 20, 0.2, 0.55);
    zap(AD.LOGO_SPARK - 0.2, 0.18, 0.05);
    bell(26.75, 74, 0.05); bell(27.125, 81, 0.04);
    AD.TAGLINE.forEach(([T], i) => { bell(T - 0.2, [86, 81, 78][i], 0.07); taiko(T - 0.2, 0.12); });
    bell(29.125, 74, 0.05);

    // =====================================================================
    // dramatic sound design layer — every cut is a hit, every hit is announced
    // =====================================================================
    // swells that slam shut on the cuts
    for (const [c, g] of [[2, 0.16], [5, 0.12], [8, 0.13], [11, 0.14], [14, 0.18], [17, 0.12], [20, 0.16], [23, 0.12]]) reverseSwell(c, 0.7, g);
    // impacts on the cuts and on the key words
    for (const [c, size, g, pan] of [
      [2.0, 0.8, 0.6, 0], [5.0, 0.7, 0.5, -0.3], [8.0, 0.8, 0.55, 0.3], [11.0, 0.9, 0.6, 0],
      [14.0, 1.2, 0.7, 0], [17.0, 0.6, 0.45, 0], [18.5, 1.4, 0.85, 0],
      [20.0, 1.0, 0.7, -0.25], [21.125, 1.0, 0.7, 0.25], [22.25, 1.1, 0.75, 0], [23.0, 0.7, 0.5, 0],
    ]) impact(c, size, g, pan);

    // panel 1: the spark and the ignition really crack
    arc(0.12, 0.09, 0.14);
    arc(0.36, 0.06, 0.12);
    metalHit(0.57, 0.12);
    arc(0.57, 0.5, 0.11, -0.3);
    chargeUp(2.0, 1.2, 0.05);
    // panel 2: the camera rips through the trays
    for (let i = 0; i < 4; i++) passby(beat(2, i) + 0.05, 0.6, 0.12, i % 2 ? -1 : 1);
    // panel 3: every breaker lands with metal and a spit of current
    AD.BREAKERS_AT.forEach((b, i) => { metalHit(b, i < 3 ? 0.16 : 0.1, (i - 3.5) / 5); arc(b + 0.01, 0.07, 0.07, (i - 3.5) / 5); });
    // panel 4: servers spin up
    chargeUp(9.5, 1.4, 0.03);
    // panel 5: floors thump on as they light
    for (let k = 0; k < AD.FLOORS; k += 2) subDrop(AD.floorAt(k), 0.05, 0.25);
    metalHit(AD.floorAt(AD.FLOORS - 1) + 0.1, 0.12);
    // panel 6: "יש חשמל..." — dark, distant, dangerous
    thunder(14.05, 0.16, 2.9);
    arc(15.1, 0.35, 0.05, -0.6);
    arc(16.2, 0.25, 0.05, 0.6);
    // panel 7: the charger draws power, then everything goes
    chargeUp(18.3, 0.8, 0.08);
    arc(18.5, 0.45, 0.12);
    thunder(18.55, 0.12, 2.0);
    // panel 8: power lines arc on every word
    arc(20.0, 0.3, 0.1, -0.5); arc(21.125, 0.3, 0.1, 0.5); arc(22.25, 0.35, 0.11, 0);
    // panel 9: streams fly past from every side, then the suck-in
    for (let i = 0; i < 5; i++) passby(23.2 + i * 0.5, 0.55, 0.09 + i * 0.015, i % 2 ? 1 : -1);
    reverseSwell(25.75, 1.4, 0.22);
    chargeUp(25.75, 1.6, 0.07);
    // panel 10: the flash — the biggest hit of the ad
    impact(26.0, 1.9, 1.0);
    thunder(26.05, 0.18, 3.5);
    arc(26.0, 0.6, 0.1);
    metalHit(26.02, 0.3);
    // spark crossing the logo, tagline hits
    arc(AD.LOGO_SPARK - 0.2, 0.55, 0.06, -0.4);
    AD.TAGLINE.forEach(([T], i) => { metalHit(T - 0.2, 0.07, (i - 1) * 0.4); subDrop(T - 0.2, 0.12, 0.6); });
    subDrop(29.125, 0.15, 0.9);

    // lead melody
    for (const [t, m, beats] of MELODY) lead(t, m, beats * B, t < 14 ? 0.035 : 0.05);

    // =====================================================================
    // narration + ducking
    // =====================================================================
    if (AD.voice) {
      const hp = filt('highpass', 90);
      hp.connect(voiceBus);
      const vw = ac.createGain(); vw.gain.value = 0.08; hp.connect(vw); vw.connect(rev);
      for (const [s0, s1, place, , gain = 1] of AD.VO) {
        const dur = s1 - s0;
        if (place + dur < from) continue;
        const skip = Math.max(0, from - place);
        const src = ac.createBufferSource();
        src.buffer = AD.voice;
        const pg = ac.createGain();
        pg.gain.value = gain;
        src.connect(pg);
        pg.connect(hp);
        src.start(at(place + skip), s0 + skip, dur - skip);
      }
    }
    // music dips to 35%, effects/impacts to 42% while a phrase is spoken
    for (const [bus, lv] of [[music, 0.35], [sfx, 0.42]]) {
      const dg = bus.gain;
      dg.setValueAtTime(1, 0);
      for (const [s0, s1, place] of AD.VO) {
        const end = place + (s1 - s0);
        dg.setValueAtTime(1, at(place - 0.1));
        dg.linearRampToValueAtTime(lv, at(place));
        dg.setValueAtTime(lv, at(end));
        dg.linearRampToValueAtTime(1, at(end + 0.3));
      }
    }

    return master;
  };

  // Encode an AudioBuffer as 16-bit PCM WAV bytes.
  AD.encodeWav = function (buf) {
    const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
    const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true);
    out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const data = [];
    for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        const v = Math.max(-1, Math.min(1, data[c][i]));
        out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        o += 2;
      }
    }
    return new Uint8Array(out.buffer);
  };
})(typeof window !== 'undefined' ? window : globalThis);
