#!/usr/bin/env python3
"""Synthesises the provisional ambient score -> public/audio/score-draft.wav.

A placeholder only, generated here (no third-party audio, no licence issues):
slow pad chords that follow the arc of the film — cool D minor at the
crossroads, tension in the third gate, a held breath before the choice
(scene 12), and D major from the verse in scene 17 to the end.
Replace with a licensed track for the final film (src/Film.tsx, <Score/>).

Reads the scene lengths from src/data/timing.json, so re-run it after the
timing is synced to the narration:  python3 tools/score.py
"""
import json, os, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100
timing = json.load(open(os.path.join(ROOT, 'src', 'data', 'timing.json')))
secs = timing['sceneSeconds']
ids = sorted(secs)
starts, t = {}, 0.0
for i in ids:
    starts[i] = t
    t += secs[i]
TOTAL = t + 1.0

NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'])}
CHORDS = {
    'Dm': ['D', 'F', 'A'], 'Bb': ['Bb', 'D', 'F'], 'F': ['F', 'A', 'C'], 'C': ['C', 'E', 'G'],
    'Gm': ['G', 'Bb', 'D'], 'A': ['A', 'C#', 'E'], 'Asus': ['A', 'D', 'E'], 'D': ['D', 'F#', 'A'],
    'G': ['G', 'B', 'D'], 'Em': ['E', 'G', 'B'], 'Bm': ['B', 'D', 'F#'],
}
# two chords per scene (first half / second half); None = silence
PLAN = {
    '00': ('Dm', 'Dm'), '01': ('Dm', 'Bb'), '02': ('F', 'C'), '03': ('Dm', 'Bb'), '04': ('F', 'C'),
    '05': ('Bb', 'F'), '06': ('Dm', 'Gm'), '07': ('Bb', 'F'), '08': ('Gm', 'A'), '09': ('Dm', 'A'),
    '10': ('Bb', 'F'), '11': ('Gm', 'Dm'), '12': ('Asus', 'F'), '13': ('Dm', 'Bb'), '14': ('F', 'C'),
    '15': ('Bb', 'F'), '16': ('Gm', 'C'), '17': ('Dm', 'D'), '18': ('G', 'D'), '19': ('Bm', 'D'),
}
# energy per scene (0..1): density of the shimmer and the loudness of the pad
ENERGY = {'00': .35, '01': .35, '02': .45, '03': .45, '04': .5, '05': .55, '06': .5, '07': .5, '08': .55,
          '09': .7, '10': .55, '11': .5, '12': .45, '13': .5, '14': .6, '15': .6, '16': .6, '17': .8,
          '18': .85, '19': .75}


def hz(name, octave):
    return 440.0 * 2 ** ((NOTE[name] - 9) / 12 + (octave - 4))


n = int(TOTAL * SR)
out = np.zeros((2, n), dtype=np.float32)
rng = np.random.default_rng(3)


def add(sig, start, pan=0.0):
    a = int(start * SR)
    if a < 0:
        sig, a = sig[-a:], 0
    b = min(n, a + len(sig))
    if b <= a:
        return
    sig = sig[: b - a]
    out[0, a:b] += sig * np.float32(np.sqrt((1 - pan) / 2))
    out[1, a:b] += sig * np.float32(np.sqrt((1 + pan) / 2))


def pad_tone(f, dur, amp):
    tt = np.arange(int(dur * SR), dtype=np.float32) / SR
    env = np.minimum(1, tt / 2.5) * np.minimum(1, (dur - tt) / 2.5)
    lfo = 1 + 0.15 * np.sin(2 * np.pi * 0.11 * tt + rng.uniform(0, 6))
    s = np.zeros_like(tt)
    for det in (-0.12, 0.0, 0.13):
        ph = rng.uniform(0, 6)
        s += np.sin(2 * np.pi * (f + det) * tt + ph) + 0.18 * np.sin(2 * np.pi * 2 * (f + det) * tt + ph)
    return (s * env * lfo * amp / 3).astype(np.float32)


def bell(f, amp):
    dur = 4.0
    tt = np.arange(int(dur * SR), dtype=np.float32) / SR
    env = np.exp(-tt * 1.3) * np.minimum(1, tt / 0.01)
    s = np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2.01 * f * tt) * np.exp(-tt * 2)
    return (s * env * amp).astype(np.float32)


for sid in ids:
    s0, d = starts[sid], secs[sid]
    e = ENERGY[sid]
    halves = PLAN[sid]
    for h, ch in enumerate(halves):
        if ch is None:
            continue
        hs = s0 + h * d / 2 - 1.2
        hd = d / 2 + 2.4
        notes = CHORDS[ch]
        add(pad_tone(hz(notes[0], 2), hd, 0.10 + 0.05 * e), hs)  # bass
        for k, nm in enumerate(notes):
            add(pad_tone(hz(nm, 3), hd, 0.045 + 0.03 * e), hs, pan=(k - 1) * 0.5)
        add(pad_tone(hz(notes[1], 4), hd, 0.02 + 0.02 * e), hs, pan=0.3)
        # shimmer: sparse bell notes from the chord, density follows the energy
        tcur = hs + 2.0
        while tcur < hs + hd - 3:
            nm = notes[rng.integers(0, 3)]
            add(bell(hz(nm, 5 + int(rng.random() < .3)), 0.025 + 0.02 * e), tcur, pan=rng.uniform(-.7, .7))
            tcur += rng.uniform(4.5, 8.0) * (1.4 - e)

# reverb: FFT convolution with a decaying-noise impulse response (in chunks)
ir_len = int(3.2 * SR)
tt = np.arange(ir_len) / SR
wet = np.zeros_like(out)
for c in range(2):
    ir = (rng.standard_normal(ir_len) * np.exp(-tt * 2.2)).astype(np.float32)
    ir /= np.sqrt((ir ** 2).sum())
    block = 1 << 20
    nfft = 1 << int(np.ceil(np.log2(block + ir_len)))
    IR = np.fft.rfft(ir, nfft)
    for a in range(0, n, block):
        seg = out[c, a:a + block]
        y = np.fft.irfft(np.fft.rfft(seg, nfft) * IR, nfft)[: len(seg) + ir_len - 1]
        b = min(n, a + len(y))
        wet[c, a:b] += y[: b - a].astype(np.float32)
mix = out * 0.65 + wet * 0.55
mix /= np.abs(mix).max() / 0.8
pcm = (mix.T * 32767).astype('<i2')
os.makedirs(os.path.join(ROOT, 'public', 'audio'), exist_ok=True)
path = os.path.join(ROOT, 'public', 'audio', 'score-draft.wav')
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'{path}: {TOTAL:.1f}s')
