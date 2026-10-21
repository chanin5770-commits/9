// Local music analysis: tempo, beats, downbeats, loudness curve, song sections, the peak moment.
// Pure TypeScript over raw PCM so it runs in the browser (privacy: the song never leaves the
// computer) and in Node for tests.

import type { AudioAnalysis, Section } from './types';

const FRAME = 2048;
const HOP = 512;
export const ENERGY_STEP = 0.25;

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const percentile = (arr: ArrayLike<number>, p: number) => {
  const s = Array.from(arr).sort((a, b) => a - b);
  if (!s.length) return 0;
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
};

const movingAvg = (a: ArrayLike<number>, win: number) => {
  const out = new Float64Array(a.length);
  const half = Math.max(1, Math.floor(win / 2));
  let sum = 0, cnt = 0;
  for (let i = 0; i < Math.min(a.length, half); i++) { sum += a[i]; cnt++; }
  for (let i = 0; i < a.length; i++) {
    const add = i + half, rem = i - half - 1;
    if (add < a.length) { sum += a[add]; cnt++; }
    if (rem >= 0) { sum -= a[rem]; cnt--; }
    out[i] = sum / cnt;
  }
  return out;
};

export function analyzeAudio(samples: Float32Array, sampleRate: number): AudioAnalysis {
  const duration = samples.length / sampleRate;
  const nFrames = Math.max(1, Math.floor((samples.length - FRAME) / HOP) + 1);
  const hopSec = HOP / sampleRate;

  // --- spectral flux onset envelope (full band + low band for downbeats) ---
  const win = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  const half = FRAME / 2;
  const lowBin = Math.max(2, Math.round((150 * FRAME) / sampleRate));
  const maxBin = Math.min(half, Math.round((8000 * FRAME) / sampleRate));
  let prev = new Float64Array(half);
  const onset = new Float64Array(nFrames);
  const lowOnset = new Float64Array(nFrames);
  const rms = new Float64Array(nFrames);
  const re = new Float64Array(FRAME), im = new Float64Array(FRAME);
  for (let f = 0; f < nFrames; f++) {
    const off = f * HOP;
    let e = 0;
    for (let i = 0; i < FRAME; i++) {
      const v = samples[off + i] || 0;
      e += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(e / FRAME);
    fft(re, im);
    const mag = new Float64Array(half);
    let flux = 0, lflux = 0;
    for (let k = 1; k < maxBin; k++) {
      mag[k] = Math.log1p(1000 * Math.hypot(re[k], im[k]));
      const d = mag[k] - prev[k];
      if (d > 0) { flux += d; if (k < lowBin) lflux += d; }
    }
    onset[f] = flux;
    lowOnset[f] = lflux;
    prev = mag;
  }
  // normalize onset: subtract local mean, clip
  const localMean = movingAvg(onset, Math.round(1 / hopSec));
  const on = new Float64Array(nFrames);
  for (let i = 0; i < nFrames; i++) on[i] = Math.max(0, onset[i] - localMean[i]);
  const onStd = Math.sqrt(on.reduce((s, v) => s + v * v, 0) / nFrames) || 1;
  for (let i = 0; i < nFrames; i++) on[i] /= onStd;

  // --- tempo by autocorrelation ---
  const minLag = Math.round(60 / 180 / hopSec), maxLag = Math.round(60 / 55 / hopSec);
  let bestLag = Math.round(60 / 100 / hopSec), bestScore = -Infinity;
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = lag; i < nFrames; i++) s += on[i] * on[i - lag];
    ac[lag] = s / (nFrames - lag);
  }
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 / (lag * hopSec);
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 105) / 0.9, 2));
    const s = (ac[lag] + 0.5 * (ac[lag * 2] ?? 0)) * w;
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  // parabolic refinement
  const a0 = ac[bestLag - 1] ?? 0, a1 = ac[bestLag], a2 = ac[bestLag + 1] ?? 0;
  const den = a0 - 2 * a1 + a2;
  const lagF = bestLag + (den !== 0 ? (0.5 * (a0 - a2)) / den : 0);
  const period = lagF; // frames per beat
  const bpm = 60 / (period * hopSec);

  // --- beat tracking: dynamic programming (Ellis 2007) ---
  const score = new Float64Array(nFrames);
  const back = new Int32Array(nFrames).fill(-1);
  const alpha = 100;
  for (let t = 0; t < nFrames; t++) {
    let best = 0, bi = -1;
    const lo = Math.max(0, Math.round(t - 2 * period)), hi = Math.round(t - period / 2);
    for (let p = lo; p <= hi; p++) {
      const x = Math.log((t - p) / period);
      const s = score[p] - alpha * x * x;
      if (s > best) { best = s; bi = p; }
    }
    score[t] = on[t] + best;
    back[t] = bi;
  }
  // end at best score within the last beat period
  let end = nFrames - 1;
  for (let t = Math.max(0, Math.round(nFrames - period)); t < nFrames; t++) if (score[t] > score[end]) end = t;
  const beatFrames: number[] = [];
  for (let t = end; t >= 0; t = back[t]) { beatFrames.push(t); if (back[t] < 0) break; }
  beatFrames.reverse();
  // extend the grid backwards/forwards so the whole song is covered (quiet intro/outro)
  const beatsF = [...beatFrames];
  while (beatsF[0] - period > 0) beatsF.unshift(beatsF[0] - period);
  while (beatsF[beatsF.length - 1] + period < nFrames) beatsF.push(beatsF[beatsF.length - 1] + period);
  const toSec = (f: number) => (f * HOP + FRAME / 2) / sampleRate;
  const beats = beatsF.map(toSec).filter((t) => t >= 0 && t <= duration);

  // --- loudness curve ---
  const stepFrames = ENERGY_STEP / hopSec;
  const nE = Math.ceil(duration / ENERGY_STEP);
  const db = new Float64Array(nE);
  for (let i = 0; i < nE; i++) {
    const a = Math.floor(i * stepFrames), b = Math.min(nFrames, Math.floor((i + 1) * stepFrames));
    let s = 0, c = 0;
    for (let f = a; f < b; f++) { s += rms[f] * rms[f]; c++; }
    db[i] = 20 * Math.log10(Math.sqrt(s / Math.max(1, c)) + 1e-7);
  }
  const dbMax = percentile(db, 0.995);
  const silentDb = dbMax - 45;
  let firstSound = 0, lastSound = duration;
  for (let i = 0; i < nE; i++) if (db[i] > silentDb) { firstSound = i * ENERGY_STEP; break; }
  for (let i = nE - 1; i >= 0; i--) if (db[i] > silentDb) { lastSound = Math.min(duration, (i + 1) * ENERGY_STEP); break; }
  const lo = percentile(db.filter((v) => v > silentDb), 0.05), hi = percentile(db, 0.98);
  const smooth = movingAvg(db, Math.round(3 / ENERGY_STEP));
  const energy = Array.from(smooth, (v) => Math.min(1, Math.max(0, (v - lo) / Math.max(1e-6, hi - lo))));

  // --- downbeats: choose the 4/4 phase whose beats carry the most low-end attack + loudness rise ---
  const beatIdxFrame = (t: number) => Math.min(nFrames - 1, Math.max(0, Math.round((t * sampleRate - FRAME / 2) / HOP)));
  let bestPhase = 0, bestPhaseScore = -Infinity;
  for (let ph = 0; ph < 4; ph++) {
    let s = 0;
    for (let i = ph; i < beats.length; i += 4) {
      const f = beatIdxFrame(beats[i]);
      for (let d = -2; d <= 2; d++) s += lowOnset[f + d] || 0;
    }
    if (s > bestPhaseScore) { bestPhaseScore = s; bestPhase = ph; }
  }
  const downbeats = beats.filter((_, i) => i % 4 === bestPhase);

  // --- sections: 4-bar phrases grouped by loudness level ---
  const eAt = (t: number) => energy[Math.min(energy.length - 1, Math.max(0, Math.floor(t / ENERGY_STEP)))] ?? 0;
  const meanE = (a: number, b: number) => {
    let s = 0, c = 0;
    for (let t = a; t < b; t += ENERGY_STEP) { s += eAt(t); c++; }
    return c ? s / c : 0;
  };
  // choose phrase alignment (which downbeat starts a phrase) by loudness jumps at boundaries
  let bestOff = 0, bestJump = -Infinity;
  for (let off = 0; off < 4; off++) {
    let j = 0;
    for (let i = off + 4; i < downbeats.length - 1; i += 4) {
      const t = downbeats[i];
      j += Math.abs(meanE(t, t + 4) - meanE(Math.max(0, t - 4), t));
    }
    if (j > bestJump) { bestJump = j; bestOff = off; }
  }
  const bounds: number[] = [0];
  for (let i = bestOff; i < downbeats.length; i += 4) if (downbeats[i] > 4 && downbeats[i] < duration - 4) bounds.push(downbeats[i]);
  bounds.push(duration);
  const phrases = bounds.slice(0, -1).map((s, i) => ({ start: s, end: bounds[i + 1], e: meanE(s, bounds[i + 1]) }));
  // three loudness levels (1-D k-means)
  const es = phrases.map((p) => p.e);
  let c = [percentile(es, 0.15), percentile(es, 0.5), percentile(es, 0.88)];
  for (let it = 0; it < 20; it++) {
    const sums = [0, 0, 0], cnt = [0, 0, 0];
    es.forEach((v) => { const k = [0, 1, 2].reduce((b, k2) => (Math.abs(v - c[k2]) < Math.abs(v - c[b]) ? k2 : b), 0); sums[k] += v; cnt[k]++; });
    c = c.map((v, k) => (cnt[k] ? sums[k] / cnt[k] : v));
  }
  const level = (v: number) => [0, 1, 2].reduce((b, k) => (Math.abs(v - c[k]) < Math.abs(v - c[b]) ? k : b), 0);
  const merged: { start: number; end: number; lv: number }[] = [];
  for (const p of phrases) {
    const lv = level(p.e);
    const last = merged[merged.length - 1];
    if (last && last.lv === lv) last.end = p.end;
    else merged.push({ start: p.start, end: p.end, lv });
  }
  // absorb very short sections (< 7 s) into the neighbour
  for (let i = 0; i < merged.length; i++) {
    if (merged.length > 1 && merged[i].end - merged[i].start < 7) {
      const j = i === 0 ? 1 : i - 1;
      merged[j].start = Math.min(merged[j].start, merged[i].start);
      merged[j].end = Math.max(merged[j].end, merged[i].end);
      merged.splice(i, 1);
      i = -1;
    }
  }
  const sections: Section[] = merged.map((m, i) => {
    let kind: Section['kind'] = m.lv === 2 ? 'chorus' : m.lv === 1 ? 'build' : 'verse';
    if (i === 0 && m.lv < 2) kind = 'intro';
    else if (i === merged.length - 1 && m.lv < 2) kind = 'outro';
    else if (m.lv === 1 && merged[i - 1]?.lv === 2 && merged[i + 1]?.lv === 2) kind = 'bridge';
    return { start: m.start, end: m.end, kind, energy: meanE(m.start, m.end) };
  });

  // --- peak: the loudest bar in the last part of the song, preferring later bars ---
  let peak = duration * 0.7, peakScore = -Infinity;
  for (const d of downbeats) {
    if (d < duration * 0.4 || d > lastSound - 18) continue;
    const s = meanE(d, d + 2) * (1 + 0.25 * (d / duration)) + 0.15 * (meanE(d, d + 2) - meanE(d - 2, d));
    if (s > peakScore) { peakScore = s; peak = d; }
  }

  // --- quiet stretches ---
  const quiet: { start: number; end: number }[] = [];
  let qs = -1;
  for (let i = 0; i <= energy.length; i++) {
    const q = i < energy.length && energy[i] < 0.18;
    if (q && qs < 0) qs = i;
    if (!q && qs >= 0) {
      if ((i - qs) * ENERGY_STEP >= 2) quiet.push({ start: qs * ENERGY_STEP, end: i * ENERGY_STEP });
      qs = -1;
    }
  }

  // --- waveform for drawing ---
  const nW = 1200;
  const per = Math.max(1, Math.floor(samples.length / nW));
  const waveform: number[] = [];
  let wmax = 1e-6;
  for (let i = 0; i < nW; i++) {
    let m = 0;
    for (let j = i * per; j < Math.min(samples.length, (i + 1) * per); j += 8) m = Math.max(m, Math.abs(samples[j]));
    waveform.push(m);
    wmax = Math.max(wmax, m);
  }

  return {
    duration,
    bpm: Math.round(bpm * 10) / 10,
    beats,
    downbeats,
    energy: energy.map((v) => Math.round(v * 1000) / 1000),
    energyStep: ENERGY_STEP,
    waveform: waveform.map((v) => Math.round((v / wmax) * 1000) / 1000),
    sections,
    peak,
    firstSound,
    lastSound,
    quiet,
  };
}

export const energyAt = (a: AudioAnalysis, t: number) =>
  a.energy[Math.min(a.energy.length - 1, Math.max(0, Math.floor(t / a.energyStep)))] ?? 0;

export const nearestBeat = (beats: number[], t: number) => {
  let lo = 0, hi = beats.length - 1;
  if (hi < 0) return t;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (beats[m] < t) lo = m; else hi = m; }
  return Math.abs(beats[lo] - t) <= Math.abs(beats[hi] - t) ? beats[lo] : beats[hi];
};
