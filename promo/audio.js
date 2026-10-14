/* Score and sound design for the "יומי" promo (Web Audio API).
 *
 * P.buildAudio(ac, {startAt, from}) schedules the full 30s mix on any
 * AudioContext or OfflineAudioContext. All timing comes from P.T / P.NOTES /
 * P.ROW_IN / P.CHECKS in promo.js, so picture and sound always line up.
 *
 * 120 BPM. 0–8 s: tension (ticking clock, drone, notification pings, a riser,
 * half a beat of silence). 8 s: the drop — uplifting D–A–Bm–G pop groove.
 * 23 s: breakdown for the calm night. 26 s: final hit and logo sting. */
(function (global) {
  'use strict';

  const P = global.P;
  const T = P.T, B = P.BEAT;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function noiseBuf(ac, sec) {
    const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, n, ac.sampleRate), r = lcg(99);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1; }
    return b;
  }
  function irBuf(ac, sec, decay) {
    const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, n, ac.sampleRate), r = lcg(7);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }

  // Progression from the drop: one chord per bar (2 s)
  const PROG = [[38, [62, 66, 69]], [33, [61, 64, 69]], [35, [62, 66, 71]], [31, [62, 67, 71]]]; // D A Bm G
  const chordAt = (t) => PROG[Math.floor((t - T.reveal) / (4 * B)) & 3];

  P.buildAudio = function (ac, o = {}) {
    const t0 = o.startAt || 0, from = o.from || 0;
    const at = (t) => t0 + t - from;
    const live = (t, len = 0) => t + len >= from;
    const NOISE = noiseBuf(ac, 3);

    // ---- buses ----
    const master = ac.createGain(); master.gain.value = 0.72;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(o.destination || ac.destination);
    const verb = ac.createConvolver(); verb.buffer = irBuf(ac, 2.8, 2.6);
    const verbIn = ac.createGain(); verbIn.gain.value = 0.35; verbIn.connect(verb); verb.connect(master);
    const delay = ac.createDelay(1); delay.delayTime.value = B * 0.75;
    const fb = ac.createGain(); fb.gain.value = 0.32; const dlIn = ac.createGain(); dlIn.gain.value = 0.25;
    const dlf = ac.createBiquadFilter(); dlf.type = 'highpass'; dlf.frequency.value = 600;
    dlIn.connect(delay); delay.connect(dlf); dlf.connect(fb); fb.connect(delay); dlf.connect(master);
    // music bus ducks on every kick (sidechain feel)
    const music = ac.createGain(); music.connect(master);
    const mduck = music.gain;
    mduck.setValueAtTime(1, 0);

    function env(g, t, a, peak, d, sus = 0, hold = 0) {
      const p = g.gain;
      p.setValueAtTime(0, at(t));
      p.linearRampToValueAtTime(peak, at(t + a));
      if (hold) p.setValueAtTime(peak, at(t + a + hold));
      p.setTargetAtTime(sus, at(t + a + hold), d / 4);
    }
    function out(node, dest = master, pan = 0, wet = 0, dly = 0) {
      let n = node;
      if (pan) { const p = ac.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
      n.connect(dest);
      if (wet) { const w = ac.createGain(); w.gain.value = wet; n.connect(w); w.connect(verbIn); }
      if (dly) { const w = ac.createGain(); w.gain.value = dly; n.connect(w); w.connect(dlIn); }
    }
    function noise(t, len, offset = 0) {
      const s = ac.createBufferSource(); s.buffer = NOISE; s.loop = true;
      s.start(at(t), offset % 2.5); s.stop(at(t + len));
      return s;
    }
    function osc(type, f, t, len) {
      const s = ac.createOscillator(); s.type = type; s.frequency.setValueAtTime(f, at(t));
      s.start(at(t)); s.stop(at(t + len));
      return s;
    }

    // ---- instruments ----
    function kick(t, v = 1) {
      if (!live(t, 0.5)) return;
      const s = osc('sine', 160, t, 0.5); s.frequency.exponentialRampToValueAtTime(42, at(t + 0.11));
      const g = ac.createGain(); env(g, t, 0.002, 1.0 * v, 0.4);
      s.connect(g); out(g);
      const c = noise(t, 0.02, t * 7), cf = ac.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 3000;
      const cg = ac.createGain(); env(cg, t, 0.001, 0.25 * v, 0.02); c.connect(cf); cf.connect(cg); out(cg);
      mduck.setValueAtTime(0.35, at(t)); mduck.setTargetAtTime(1, at(t + 0.02), 0.09);
    }
    function clap(t, v = 1) {
      if (!live(t, 0.4)) return;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.9;
      const g = ac.createGain(); g.gain.setValueAtTime(0, at(t));
      [0, 0.011, 0.022].forEach((d) => { g.gain.setValueAtTime(0.55 * v, at(t + d)); g.gain.setTargetAtTime(0.05, at(t + d + 0.001), 0.004); });
      g.gain.setValueAtTime(0.4 * v, at(t + 0.033)); g.gain.setTargetAtTime(0, at(t + 0.034), 0.05);
      const n = noise(t, 0.4, t * 3); n.connect(f); f.connect(g); out(g, master, 0, 0.35);
    }
    function hat(t, v = 1, open = false, pan = 0.2) {
      if (!live(t, 0.3)) return;
      const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
      const g = ac.createGain(); env(g, t, 0.001, 0.16 * v, open ? 0.3 : 0.05);
      const n = noise(t, open ? 0.35 : 0.08, t * 5); n.connect(f); f.connect(g); out(g, master, pan);
    }
    function bass(t, m, len, v = 1) {
      if (!live(t, len)) return;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(900, at(t)); f.frequency.setTargetAtTime(180, at(t), 0.08);
      const g = ac.createGain(); env(g, t, 0.005, 0.32 * v, len * 0.8, 0.12 * v);
      g.gain.setTargetAtTime(0, at(t + len - 0.03), 0.01);
      const a = osc('sawtooth', mtof(m), t, len + 0.1), sub = osc('sine', mtof(m - 12), t, len + 0.1);
      const sg = ac.createGain(); sg.gain.value = 0.9;
      a.connect(f); f.connect(g); sub.connect(sg); sg.connect(g); out(g, music);
    }
    function pluck(t, m, v = 1, pan = 0) {
      if (!live(t, 1)) return;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(5200, at(t)); f.frequency.setTargetAtTime(700, at(t), 0.09);
      const g = ac.createGain(); env(g, t, 0.003, 0.1 * v, 0.35);
      [-7, 7].forEach((dt) => { const s = osc('sawtooth', mtof(m), t, 0.9); s.detune.value = dt; s.connect(f); });
      f.connect(g); out(g, music, pan, 0.25, 0.5);
    }
    function pad(t, ms, len, v = 1, bright = 1800) {
      if (!live(t, len + 1.5)) return;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright; f.Q.value = 0.5;
      const g = ac.createGain(); env(g, t, Math.min(0.5, len * 0.3), 0.05 * v, 0.6, 0.045 * v);
      g.gain.setTargetAtTime(0, at(t + len), 0.35);
      ms.forEach((m, i) => [-12, 12].forEach((dt) => {
        const s = osc('sawtooth', mtof(m), t, len + 2); s.detune.value = dt + i * 2; s.connect(f);
      }));
      f.connect(g); out(g, music, 0, 0.5);
    }
    function bell(t, m, v = 1, pan = 0, dest = master) {
      if (!live(t, 2.5)) return;
      const g = ac.createGain(); env(g, t, 0.002, 0.16 * v, 1.6);
      [[1, 1], [2.76, 0.35], [5.4, 0.12], [2, 0.3]].forEach(([r, a]) => {
        const s = osc('sine', mtof(m) * r, t, 2.5), gg = ac.createGain();
        gg.gain.setValueAtTime(a, at(t)); gg.gain.setTargetAtTime(0, at(t), 0.25 / r + 0.1);
        s.connect(gg); gg.connect(g);
      });
      out(g, dest, pan, 0.45, 0.3);
    }
    function ping(t, f0, v = 1, pan = 0) {
      // notification pop: quick two-tone blip
      if (!live(t, 0.6)) return;
      [[0, f0], [0.07, f0 * 1.5]].forEach(([d, f]) => {
        const s = osc('sine', f, t + d, 0.4), g = ac.createGain(); env(g, t + d, 0.003, 0.13 * v, 0.18);
        s.connect(g); out(g, master, pan, 0.3);
      });
    }
    function tick(t, v = 1, hi = true) {
      if (!live(t, 0.1)) return;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hi ? 4200 : 2600; f.Q.value = 6;
      const g = ac.createGain(); env(g, t, 0.001, 0.9 * v, 0.018);
      const n = noise(t, 0.06, t * 11); n.connect(f); f.connect(g); out(g, master, 0, 0.2);
    }
    function whoosh(t, len, v = 1, p0 = -0.7, p1 = 0.7) {
      if (!live(t, len)) return;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(300, at(t)); f.frequency.exponentialRampToValueAtTime(4000, at(t + len * 0.6)); f.frequency.exponentialRampToValueAtTime(800, at(t + len));
      const g = ac.createGain(); g.gain.setValueAtTime(0, at(t)); g.gain.linearRampToValueAtTime(0.35 * v, at(t + len * 0.6)); g.gain.linearRampToValueAtTime(0, at(t + len));
      const p = ac.createStereoPanner(); p.pan.setValueAtTime(p0, at(t)); p.pan.linearRampToValueAtTime(p1, at(t + len));
      const n = noise(t, len, t); n.connect(f); f.connect(g); g.connect(p); out(p, master, 0, 0.3);
    }
    function riser(t, len, v = 1) {
      if (!live(t, len)) return;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(200, at(t)); f.frequency.exponentialRampToValueAtTime(9000, at(t + len));
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, at(t)); g.gain.exponentialRampToValueAtTime(0.4 * v, at(t + len - 0.01)); g.gain.linearRampToValueAtTime(0, at(t + len));
      const n = noise(t, len, 1.1); n.connect(f); f.connect(g); out(g, master, 0, 0.4);
      const s = osc('sawtooth', 110, t, len); s.frequency.exponentialRampToValueAtTime(880, at(t + len));
      const sf = ac.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2500;
      const sg = ac.createGain(); sg.gain.setValueAtTime(0.0001, at(t)); sg.gain.exponentialRampToValueAtTime(0.07 * v, at(t + len - 0.01)); sg.gain.linearRampToValueAtTime(0, at(t + len));
      s.connect(sf); sf.connect(sg); out(sg, master, 0, 0.3);
    }
    function impact(t, v = 1) {
      if (!live(t, 3)) return;
      const s = osc('sine', 90, t, 2.2); s.frequency.exponentialRampToValueAtTime(28, at(t + 1.2));
      const g = ac.createGain(); env(g, t, 0.003, 0.9 * v, 1.6); s.connect(g); out(g);
      const n = noise(t, 2.5, 0.3), f = ac.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(6000, at(t)); f.frequency.exponentialRampToValueAtTime(200, at(t + 1.5));
      const ng = ac.createGain(); env(ng, t, 0.002, 0.5 * v, 1.2); n.connect(f); f.connect(ng); out(ng, master, 0, 0.6);
      // crash cymbal
      const c = noise(t, 3, 0.7), cf = ac.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 5000;
      const cg = ac.createGain(); env(cg, t, 0.002, 0.22 * v, 2.4); c.connect(cf); cf.connect(cg); out(cg, master, 0, 0.5);
    }
    function reverseSwell(tEnd, len, v = 1) {
      const t = tEnd - len;
      if (!live(t, len)) return;
      const n = noise(t, len, 2), f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, at(t)); g.gain.exponentialRampToValueAtTime(0.35 * v, at(tEnd - 0.005)); g.gain.linearRampToValueAtTime(0, at(tEnd));
      n.connect(f); f.connect(g); out(g, master, 0, 0.5);
    }
    function sparkle(t, n, v = 1) {
      const r = lcg(Math.floor(t * 100));
      for (let i = 0; i < n; i++) bell(t + i * 0.045 + r() * 0.02, 86 + [0, 2, 4, 7, 9, 12][Math.floor(r() * 6)], 0.35 * v, r() * 1.6 - 0.8);
    }

    // =========== 0–8: tension ===========
    // ticking clock — quarter notes, getting more insistent
    for (let t = 0.25; t < T.night; t += B) tick(t, 0.25 + 0.25 * (t / T.night), Math.round(t / B) % 2 === 0);
    // low uneasy drone (D + Eb) swelling with the pile
    if (live(0, T.night)) {
      [26, 38, 39.0].forEach((m, i) => {
        const s = osc('sawtooth', mtof(m), 0, T.night + 0.5), f = ac.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(120, at(0)); f.frequency.linearRampToValueAtTime(900, at(T.night));
        const g = ac.createGain(); g.gain.setValueAtTime(0, at(0)); g.gain.linearRampToValueAtTime(i === 2 ? 0.035 : 0.06, at(T.night - 0.05));
        g.gain.linearRampToValueAtTime(0, at(T.night + 0.15));
        s.connect(f); f.connect(g); out(g, master, 0, 0.3);
      });
    }
    // heartbeat on the downbeats
    for (let t = 1; t < T.night; t += 4 * B) { kick(t, 0.45); kick(t + 0.22, 0.3); }
    // every note / reminder pops with its own ping
    P.NOTES.forEach((n, i) => ping(n.at, [988, 1175, 1319, 880, 1047, 1397][i % 6], n.kind === 'remind' ? 0.9 : 0.6, ((i * 0.37) % 1.4) - 0.7));
    // the big chaos words punch
    P.CHAOS_WORDS.forEach(([t], i) => { if (i < 3) { kick(t, 0.8); hat(t, 1.2, true); } });
    whoosh(3.8, 0.5, 0.7);
    // night: quiet, sad pad, slow clock
    kick(T.night, 0.7);
    pad(T.night, [50, 57, 62, 65], 3, 1.1, 900);
    for (let t = T.night + 0.5; t < T.implode; t += 2 * B) tick(t, 0.35, false);
    bell(T.night + 0.5, 74, 0.5, 0.2); bell(T.night + 1.0, 72, 0.45, -0.2); bell(T.night + 1.5, 69, 0.4, 0);
    // implosion: riser into half a beat of silence
    riser(T.implode - 0.5, 1.35, 1);
    reverseSwell(T.reveal - 0.12, 1.2, 1);

    // =========== 8: the drop ===========
    impact(T.reveal, 1.1);
    sparkle(T.reveal + 0.05, 10, 1);
    bell(T.reveal, 74, 0.8); bell(T.reveal, 81, 0.5);

    const grooveEnd = T.tomorrow;
    for (let t = T.reveal; t < grooveEnd - 1e-6; t += B) {
      const beat = Math.round((t - T.reveal) / B), bar = Math.floor(beat / 4);
      const intro = t < T.plan; // first bars: lighter
      kick(t, intro ? 0.85 : 1);
      if (beat % 2 === 1) clap(t, intro ? 0.6 : 1);
      hat(t + B / 2, 0.9, beat % 4 === 3, 0.25);
      if (!intro) { hat(t + B / 4, 0.4, false, -0.25); hat(t + 3 * B / 4, 0.4, false, -0.25); }
      const [root, ch] = chordAt(t);
      bass(t + B / 2, root + 12, B / 2 - 0.02);
      if (beat % 4 === 0) pad(t, ch.map((m) => m - 12).concat(ch), 4 * B - 0.05, 1, intro ? 1400 : 2600);
      // 16th-note pluck arpeggio once the phone is on
      if (!intro) {
        const arp = [ch[0], ch[1], ch[2], ch[0] + 12];
        for (let k = 0; k < 4; k++) pluck(t + k * B / 4, arp[(beat * 4 + k) % 4] + (bar % 2 ? 0 : 0), k === 0 ? 1 : 0.7, k % 2 ? 0.35 : -0.35);
      }
    }
    // hook melody over the plan section, again over the commit section
    const HOOK = [[0, 74, 1], [1, 76, 0.5], [1.5, 78, 1.5], [3, 76, 1], [4, 73, 1], [5, 74, 0.5], [5.5, 76, 1.5], [7, 69, 1],
      [8, 71, 1], [9, 74, 0.5], [9.5, 78, 1.5], [11, 76, 1], [12, 79, 1.5], [13.5, 78, 0.5], [14, 76, 1], [15, 74, 1]];
    [T.plan, T.commit - 2].forEach((s0, rep) => HOOK.forEach(([b, m, l]) => {
      const t = s0 + b * B;
      if (t >= (rep ? T.done : T.commit - 2)) return;
      if (!live(t, l * B + 1)) return;
      const g = ac.createGain(); env(g, t, 0.01, 0.07, l * B, 0.04); g.gain.setTargetAtTime(0, at(t + l * B * 0.9), 0.06);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
      [-6, 6].forEach((dt) => { const s = osc('square', mtof(m), t, l * B + 0.4); s.detune.value = dt; s.connect(f); });
      f.connect(g); out(g, music, 0, 0.35, 0.35);
    }));
    // UI sounds: rows sliding in
    P.ROW_IN.forEach((t, i) => { tick(t, 0.35, true); ping(t, 1568 + i * 40, 0.25, 0.3); });
    whoosh(T.plan - 0.6, 1.0, 0.9, 0.6, -0.6);
    whoosh(T.breaks - 0.4, 0.6, 0.6, -0.5, 0.5);
    whoosh(T.commit - 0.45, 0.6, 0.6, 0.5, -0.5);
    // checks: rising pentatonic dings + coin for the points
    const PENTA = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95];
    P.CHECKS.forEach((t, i) => {
      bell(t, PENTA[i], 0.9, -0.3);
      ping(t + 0.12, 2093 + i * 60, 0.35, 0.4);
    });
    // "לבצע." slam
    kick(18.5, 1.1); impact(18.5, 0.45);
    // 100%: celebration hit
    reverseSwell(T.done, 0.5, 0.7);
    impact(T.done, 0.8);
    sparkle(T.done + 0.02, 16, 1.1);
    bell(T.done, 86, 0.8); bell(T.done + 0.06, 90, 0.6); bell(T.done + 0.12, 93, 0.5);
    bell(T.done + 0.8, 86, 0.6, 0.3); // streak badge

    // =========== 23–26: calm night ===========
    pad(T.tomorrow, [50, 57, 62, 66, 69], 2.0, 1.4, 1600);
    pad(T.tomorrow + 2.0, [47, 54, 59, 62, 66], 1.0, 1.4, 1600);
    [[0, 78], [0.5, 76], [1, 74], [1.5, 69], [2, 71], [2.5, 74]].forEach(([d, m]) => bell(T.tomorrow + 0.25 + d, m, 0.6, Math.sin(d * 3) * 0.4));
    P.TOMORROW_IN.forEach((t, i) => ping(t, 1319 + i * 110, 0.22, -0.2));
    for (let t = T.tomorrow; t < T.end - 1e-6; t += B) {
      hat(t + B / 2, 0.45);
      if (t >= T.tomorrow + 1) bass(t, (t < T.tomorrow + 2 ? 38 : 35) + 12, B - 0.03, 0.7);
    }
    // READY stamp
    kick(T.ready, 0.9); bell(T.ready, 81, 0.9); bell(T.ready, 86, 0.5);
    // build into the end: snare roll + riser, then silence
    for (let t = T.ready + B, k = 0; t < T.end - 0.13; t += B / (k < 2 ? 2 : 4), k++) clap(t, 0.25 + 0.6 * ((t - T.ready) / (T.end - T.ready)));
    riser(T.ready + 0.1, T.end - T.ready - 0.22, 0.9);

    // =========== 26: end card ===========
    impact(T.end, 1.15);
    kick(T.end, 1.1);
    sparkle(T.end + 0.05, 12, 1);
    pad(T.end, [38, 50, 57, 62, 66, 69, 74], 3.6, 1.6, 3200);
    bass(T.end, 38, 3.4, 0.8);
    // logo sting: D–F#–A–D arpeggio, then the tagline chime
    [[0.35, 74], [0.5, 78], [0.65, 81], [0.8, 86]].forEach(([d, m], i) => bell(T.end + d, m, 0.9 - i * 0.1, i % 2 ? 0.3 : -0.3));
    bell(T.end + 1.0, 86, 0.6); bell(T.end + 1.0, 90, 0.4);
    ping(T.end + 1.65, 1760, 0.35); ping(T.end + 1.85, 2093, 0.35);

    // master fade at the very end
    master.gain.setValueAtTime(0.72, at(Math.max(from, T.fade)));
    master.gain.linearRampToValueAtTime(0, at(P.DUR - 0.05));
  };

  P.encodeWav = function (buf) {
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
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
    return new Uint8Array(out.buffer);
  };
})(typeof window !== 'undefined' ? window : globalThis);
