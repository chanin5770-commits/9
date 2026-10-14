/* Synthesized sound design for the "חשמלי" commercial (Web Audio API).
 * AD.buildAudio(ac, {startAt, from, destination}) schedules the full 30s track on
 * any AudioContext or OfflineAudioContext. startAt = context time of ad t=0;
 * `from` skips one-shots before that ad time (used when playing from mid-ad). */
(function (global) {
  'use strict';

  const AD = global.AD;

  function lcg(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function makeNoise(ac, seconds) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    const r = lcg(99);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    }
    return buf;
  }

  function makeIR(ac, seconds, decay) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    const r = lcg(7);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  AD.buildAudio = function (ac, opts = {}) {
    const T0 = opts.startAt ?? ac.currentTime + 0.05;
    const from = opts.from ?? 0;
    const dest = opts.destination || ac.destination;
    const at = (t) => Math.max(0, T0 + t);
    const live = (t) => t >= from - 0.02;
    const rand = lcg(2024);

    // master chain
    const master = ac.createGain();
    master.gain.setValueAtTime(0.72, 0);
    master.gain.setValueAtTime(0.72, at(AD.CUT_TO_BLACK - 0.05));
    master.gain.linearRampToValueAtTime(0, at(AD.DUR));
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.3;
    master.connect(comp);
    comp.connect(dest);

    const rev = ac.createConvolver();
    rev.buffer = makeIR(ac, 3.4, 2.8);
    const revOut = ac.createGain();
    revOut.gain.value = 0.4;
    rev.connect(revOut);
    revOut.connect(master);

    const noise = makeNoise(ac, 2.5);

    function out(node, wet = 0) {
      node.connect(master);
      if (wet) { const g = ac.createGain(); g.gain.value = wet; node.connect(g); g.connect(rev); }
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
      s.buffer = noise;
      s.loop = true;
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

    // ---------- one-shot instruments ----------
    function tick(t, g, hp = 3500) {
      if (!live(t)) return;
      const s = noiseSrc(t, 0.03), f = filt('highpass', hp), e = envGain(t, 0.0008, g, 0.012 + rand() * 0.02);
      s.connect(f); f.connect(e); out(e, 0.15);
    }
    function crackle(t, n, g, spread = 0.25) {
      for (let i = 0; i < n; i++) tick(t + rand() * spread, g * (0.3 + rand() * 0.7), 2500 + rand() * 5000);
    }
    function clack(t, heavy = 1) {
      if (!live(t)) return;
      let s = noiseSrc(t, 0.12), f = filt('lowpass', 2400, 1.2), e = envGain(t, 0.001, 0.55 * heavy, 0.07);
      s.connect(f); f.connect(e); out(e, 0.25);
      s = noiseSrc(t, 0.03); f = filt('highpass', 5200); e = envGain(t, 0.0005, 0.35 * heavy, 0.014);
      s.connect(f); f.connect(e); out(e, 0.1);
      const o = osc('sine', 130, t, 0.25);
      o.frequency.exponentialRampToValueAtTime(48, at(t + 0.12));
      e = envGain(t, 0.002, 0.8 * heavy, 0.16);
      o.connect(e); out(e, 0.2);
    }
    function whoosh(t, dur, f0, f1, g) {
      if (!live(t)) return;
      const s = noiseSrc(t, dur), f = filt('bandpass', f0, 1.4);
      f.frequency.setValueAtTime(f0, at(t));
      f.frequency.exponentialRampToValueAtTime(f1, at(t + dur));
      const e = ac.createGain();
      e.gain.setValueAtTime(0.0001, at(t));
      e.gain.exponentialRampToValueAtTime(g, at(t + dur * 0.7));
      e.gain.exponentialRampToValueAtTime(0.0001, at(t + dur));
      s.connect(f); f.connect(e); out(e, 0.3);
    }
    function boom(t, size, g) {
      if (!live(t)) return;
      let o = osc('sine', 150, t, 3 * size);
      o.frequency.exponentialRampToValueAtTime(30, at(t + 1.3 * size));
      let e = envGain(t, 0.004, g, 2.4 * size);
      o.connect(e); out(e, 0.35);
      o = osc('triangle', 42, t, 3.2 * size);
      e = envGain(t, 0.01, g * 0.45, 3 * size);
      o.connect(e); out(e, 0.2);
      const s = noiseSrc(t, 1.2 * size), f = filt('lowpass', 520, 0.8);
      f.frequency.setValueAtTime(900, at(t));
      f.frequency.exponentialRampToValueAtTime(120, at(t + 0.9 * size));
      e = envGain(t, 0.003, g * 0.7, 0.9 * size);
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
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 6); }
      ws.curve = curve;
      const bp = filt('bandpass', 1100, 0.9), e = envGain(t, 0.003, g, dur);
      [55, 82.5, 110.7].forEach((f) => { const o = osc('sawtooth', f, t, dur + 0.1); o.connect(ws); });
      ws.connect(bp); bp.connect(e); out(e, 0.3);
      crackle(t, 10, g * 0.7, dur);
    }
    function kick(t, g) {
      if (!live(t)) return;
      const o = osc('sine', 165, t, 0.45);
      o.frequency.exponentialRampToValueAtTime(46, at(t + 0.13));
      const e = envGain(t, 0.002, g, 0.38);
      o.connect(e); out(e, 0.12);
    }
    function softHit(t, g) {
      if (!live(t)) return;
      const o = osc('sine', 96, t, 0.9);
      o.frequency.exponentialRampToValueAtTime(52, at(t + 0.3));
      const e = envGain(t, 0.004, g, 0.8);
      o.connect(e); out(e, 0.4);
      const s = noiseSrc(t, 0.2), f = filt('lowpass', 800), e2 = envGain(t, 0.002, g * 0.25, 0.12);
      s.connect(f); f.connect(e2); out(e2, 0.4);
    }

    // ---------- beds ----------
    // 1. electrical hum: rises out of silence, carries the first half
    {
      const lp = filt('lowpass', 180, 3);
      const g = ac.createGain();
      [['sawtooth', 50], ['sawtooth', 50.4], ['sine', 100], ['square', 150]].forEach(([ty, f], i) => {
        const o = osc(ty, f, 0, 17);
        const og = ac.createGain();
        og.gain.value = [0.5, 0.5, 0.6, 0.06][i];
        o.connect(og); og.connect(lp);
      });
      lp.connect(g); out(g, 0.05);
      const p = g.gain;
      p.setValueAtTime(0.0001, at(0));
      p.exponentialRampToValueAtTime(0.05, at(1.5));
      p.linearRampToValueAtTime(0.12, at(1.97));
      p.setValueAtTime(0.07, at(2.0));
      p.linearRampToValueAtTime(0.06, at(6.0));
      p.linearRampToValueAtTime(0.05, at(9.5));
      p.linearRampToValueAtTime(0.03, at(12.5));
      p.exponentialRampToValueAtTime(0.0001, at(16.5));
      lp.frequency.setValueAtTime(160, at(0));
      lp.frequency.linearRampToValueAtTime(520, at(1.97));
      lp.frequency.setValueAtTime(380, at(2.0));
    }
    // 2. sizzle of live current during the cable + switchboard + conduit
    {
      const s = noiseSrc(2.0, 10.5), f = filt('bandpass', 3800, 2), g = ac.createGain();
      g.gain.setValueAtTime(0.0001, at(2.0));
      g.gain.linearRampToValueAtTime(0.025, at(2.4));
      g.gain.linearRampToValueAtTime(0.018, at(9.5));
      g.gain.linearRampToValueAtTime(0.0001, at(12.5));
      s.connect(f); f.connect(g); out(g, 0.2);
    }
    // 3. cinematic music bed: opens with the building, drops for "כאן אין מקום לפשרות"
    {
      const chords = [
        [12.5, [73.42, 110.0, 146.83, 174.61, 220.0]],
        [15.0, [58.27, 116.54, 146.83, 174.61, 233.08]],
        [17.0, [65.41, 130.81, 164.81, 196.0, 261.63]],
        [18.5, [55.0, 110.0, 138.59, 164.81, 220.0]],
      ];
      const lp = filt('lowpass', 200, 1.1);
      const g = ac.createGain();
      for (let v = 0; v < 5; v++) {
        for (const det of [-8, 8]) {
          const o = osc('sawtooth', chords[0][1][v], 12.5, 9);
          o.detune.value = det;
          for (const [ct, fr] of chords) o.frequency.setTargetAtTime(fr[v], at(ct), 0.04);
          const vg = ac.createGain();
          vg.gain.value = v === 0 ? 0.3 : 0.16;
          o.connect(vg); vg.connect(lp);
        }
      }
      lp.connect(g); out(g, 0.45);
      lp.frequency.setValueAtTime(200, at(12.5));
      lp.frequency.exponentialRampToValueAtTime(2200, at(19.9));
      lp.frequency.setValueAtTime(260, at(19.97));
      const p = g.gain;
      p.setValueAtTime(0.0001, at(12.5));
      p.exponentialRampToValueAtTime(0.09, at(14.0));
      p.linearRampToValueAtTime(0.13, at(19.9));
      p.exponentialRampToValueAtTime(0.008, at(20.05));
      p.exponentialRampToValueAtTime(0.0001, at(21.3));
    }
    // 4. sub drone under "כאן אין מקום לפשרות"
    {
      const o = osc('sine', 41, 19.95, 1.6), g = ac.createGain();
      g.gain.setValueAtTime(0.0001, at(19.95));
      g.gain.linearRampToValueAtTime(0.09, at(20.2));
      g.gain.exponentialRampToValueAtTime(0.0001, at(21.45));
      o.connect(g); out(g);
    }

    // ---------- the cue sheet ----------
    // intro spark
    crackle(1.62, 14, 0.5, 0.12);
    zap(1.62, 0.12, 0.12);
    crackle(1.9, 10, 0.6, 0.08);
    // cable: ignition + chase
    zap(2.3, 0.35, 0.18);
    whoosh(2.25, 1.1, 300, 2800, 0.22);
    whoosh(3.6, 1.0, 400, 3500, 0.16);
    crackle(2.3, 40, 0.25, 3.3);
    whoosh(5.3, 0.7, 500, 6000, 0.3);
    boom(6.0, 0.5, 0.35);
    // switchboard
    whoosh(6.0, 0.45, 2000, 300, 0.12);
    AD.BREAKERS.forEach((b, i) => { clack(b, i < 3 ? 1 : 0.65); crackle(b + 0.01, 4, 0.18, 0.08); });
    // conduit flight
    whoosh(9.3, 0.5, 600, 5000, 0.2);
    for (let i = 0; i < 6; i++) whoosh(9.6 + i * 0.48, 0.42, 900 + i * 150, 250, 0.08 + i * 0.012);
    crackle(9.5, 30, 0.15, 3);
    // building: energy arrives, floors switch on
    whoosh(12.4, 0.6, 3000, 300, 0.15);
    for (let k = 0; k < AD.FLOORS; k++) tick(AD.floorTime(k), 0.07 + k * 0.004, 1800);
    softHit(AD.floorTime(AD.FLOORS - 1) + 0.15, 0.25);
    // pulse beat + riser
    for (let b = 14.0; b < 18.5; b += 0.6) kick(b, 0.32);
    for (let b = 18.5; b < 19.9; b += 0.3) kick(b, 0.42);
    {
      const s = noiseSrc(18.3, 1.7), f = filt('highpass', 400, 0.9), g = ac.createGain();
      f.frequency.setValueAtTime(400, at(18.3));
      f.frequency.exponentialRampToValueAtTime(7000, at(19.95));
      g.gain.setValueAtTime(0.0001, at(18.3));
      g.gain.exponentialRampToValueAtTime(0.12, at(19.93));
      g.gain.setValueAtTime(0.0001, at(19.96));
      s.connect(f); f.connect(g); out(g, 0.3);
    }
    // montage cuts
    for (let m = 0; m < 4; m++) whoosh(AD.MONTAGE_START + m * AD.MONTAGE_SHOT - 0.18, 0.36, 400, 4000, 0.14);
    zap(17.6, 0.2, 0.08);
    // drop
    softHit(19.97, 0.3);
    // main breaker
    clack(AD.MAIN_CLICK + 0.1, 1.5);
    ting(AD.MAIN_CLICK + 0.1, 0.05);
    boom(AD.MAIN_BOOM, 1.15, 0.85);
    zap(AD.MAIN_BOOM, 0.6, 0.22);
    crackle(AD.MAIN_BOOM, 30, 0.35, 0.9);
    // convergence riser
    {
      const s = noiseSrc(24.5, 1.75), f = filt('bandpass', 200, 0.8), g = ac.createGain();
      f.frequency.setValueAtTime(200, at(24.5));
      f.frequency.exponentialRampToValueAtTime(5000, at(AD.FLASH));
      g.gain.setValueAtTime(0.0001, at(24.5));
      g.gain.exponentialRampToValueAtTime(0.2, at(AD.FLASH - 0.01));
      g.gain.setValueAtTime(0.0001, at(AD.FLASH));
      s.connect(f); f.connect(g); out(g, 0.4);
      for (const [f0, ty] of [[110, 'sine'], [165, 'triangle']]) {
        const o = osc(ty, f0, 24.6, 1.6), og = ac.createGain();
        o.frequency.exponentialRampToValueAtTime(f0 * 6, at(AD.FLASH));
        og.gain.setValueAtTime(0.0001, at(24.6));
        og.gain.exponentialRampToValueAtTime(0.045, at(AD.FLASH - 0.01));
        og.gain.setValueAtTime(0.0001, at(AD.FLASH));
        o.connect(og); out(og, 0.3);
      }
      crackle(25.6, 18, 0.2, 0.6);
    }
    // FLASH — logo: big clean boom + metallic ting + wide chord
    boom(AD.FLASH, 1.5, 0.95);
    ting(AD.FLASH + 0.02, 0.12);
    {
      const lp = filt('lowpass', 1400, 0.7), g = ac.createGain();
      [36.71, 55.0, 73.42, 110.0, 146.83, 185.0].forEach((f, i) => {
        const o = osc(i < 3 ? 'triangle' : 'sawtooth', f, AD.FLASH, 3.8);
        const og = ac.createGain();
        og.gain.value = i < 3 ? 0.35 : 0.1;
        o.connect(og); og.connect(lp);
      });
      lp.frequency.setValueAtTime(1400, at(AD.FLASH));
      lp.frequency.exponentialRampToValueAtTime(300, at(AD.FLASH + 3.5));
      g.gain.setValueAtTime(0.0001, at(AD.FLASH));
      g.gain.linearRampToValueAtTime(0.16, at(AD.FLASH + 0.03));
      g.gain.exponentialRampToValueAtTime(0.0001, at(AD.DUR));
      lp.connect(g); out(g, 0.5);
    }
    AD.TAGLINE.forEach(([T]) => softHit(T, 0.22));
    crackle(AD.LOGO_SPARK, 22, 0.22, 0.55);
    zap(AD.LOGO_SPARK, 0.18, 0.06);
    boom(AD.FINAL_HIT, 0.7, 0.5);
    ting(AD.FINAL_HIT + 0.01, 0.1);

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
