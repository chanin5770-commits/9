#!/usr/bin/env python3
"""Original festive soundtrack for "Zvi, King of the letter Hei".

120 BPM (one bar = 2.0 s), D major. Written to the video's structure (bar numbers):
  0-3   intro: palace shimmer, bells, pad
  4-7   letters: a chime + stab on each downbeat (Alef, Bet, Gimel, Dalet at 8/10/12/14 s)
  8-9   build: snare roll and riser, half-beat of silence
  10    WOW: crash, boom, bright chord - the Hei appears (20 s)
  12    royal fanfare - Zvi is revealed (24 s)
  15-22 verse groove + melody A
  23-28 the objects (steering wheel 46 s, helicopter 52 s)
  29-40 chorus, full band + melody B
  41-48 finale, final chord rings out to 102 s
Output: audio/song.wav (44.1 kHz, 16-bit stereo)
"""
import os
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
DUR = 102.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'audio', 'song.wav')

dry = np.zeros((2, N))
wet = np.zeros((2, N))  # sent to reverb


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_of(n):
    return np.arange(n) / SR


def add(sig, start, gain=1.0, pan=0.0, rev=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4) * gain
    r = np.sin((pan + 1) * np.pi / 4) * gain
    dry[0, i:i + len(sig)] += sig * l * (1 - rev * 0.5)
    dry[1, i:i + len(sig)] += sig * r * (1 - rev * 0.5)
    if rev:
        wet[0, i:i + len(sig)] += sig * l * rev
        wet[1, i:i + len(sig)] += sig * r * rev


def env_ad(n, a, d_tau):
    t = t_of(n)
    e = np.exp(-t / d_tau)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR * 0.45), 'low', fs=SR, output='sos'), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)


def saw(f, n, detune=0.0):
    t = t_of(n)
    ph = (f * (1 + detune)) * t + rng.random()
    return 2 * (ph - np.floor(ph + 0.5))


# ---------------- instruments ----------------
def bell(m, dur=2.5):
    n = int(dur * SR); t = t_of(n); f = mtof(m)
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9)
         + 0.45 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.35)
         + 0.25 * np.sin(2 * np.pi * f * 5.40 * t) * np.exp(-t / 0.15)
         + 0.15 * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t / 0.5))
    s[:60] *= np.linspace(0, 1, 60)
    return s * 0.5


def pluck(m, dur_beats):
    dur = max(dur_beats * BEAT, 0.25) + 0.4
    n = int(dur * SR); t = t_of(n); f = mtof(m)
    s = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.12)
         + 0.25 * np.sign(np.sin(2 * np.pi * f * t)) * np.exp(-t / 0.08))
    e = env_ad(n, 0.004, 0.35 + 0.25 * dur_beats)
    rel = int(0.08 * SR); cut = int(max(dur_beats * BEAT, 0.2) * SR)
    if cut + rel < n:
        e[cut:cut + rel] *= np.linspace(1, 0, rel); e[cut + rel:] = 0
    return lp(s * e, 6000) * 0.45


def pad_chord(notes, dur, bright=1.0):
    n = int(dur * SR); s = np.zeros(n)
    for m in notes:
        for d in (-0.004, 0.0, 0.0045):
            s += saw(mtof(m), n, d)
    s = lp(s / (len(notes) * 3), 900 + 1800 * bright, 2)
    a = int(0.45 * SR); r = int(0.5 * SR)
    e = np.ones(n); e[:a] = np.linspace(0, 1, a); e[-r:] = np.linspace(1, 0, r)
    return s * e * 0.55


def bass(m, dur):
    n = int(dur * SR); t = t_of(n); f = mtof(m)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.tanh(3 * np.sin(2 * np.pi * f * t))
    e = env_ad(n, 0.005, 0.6)
    e[-int(0.03 * SR):] *= np.linspace(1, 0, int(0.03 * SR))
    return lp(s * e, 700) * 0.55


def brass(m, dur):
    n = int(dur * SR); t = t_of(n)
    s = sum(saw(mtof(m), n, d) for d in (-0.003, 0.003)) / 2
    fc = 600 + 3000 * (1 - np.exp(-t / 0.06)) * np.exp(-t / 1.2) + 800
    # time-varying LP approximated by blending two fixed filters
    bright = (fc - 600) / 3800
    s = lp(s, 900) * (1 - bright) + lp(s, 4200) * bright
    a = int(0.02 * SR); r = int(0.12 * SR)
    e = np.ones(n); e[:a] = np.linspace(0, 1, a); e[-r:] = np.linspace(1, 0, r)
    return s * e * 0.5


def kick(g=1.0):
    n = int(0.45 * SR); t = t_of(n)
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t / 0.16)
    s[:200] += rng.standard_normal(200) * np.linspace(0.4, 0, 200)
    return np.tanh(1.6 * s) * g


def clap(g=1.0):
    n = int(0.3 * SR); t = t_of(n)
    nz = rng.standard_normal(n)
    e = np.exp(-t / 0.06)
    for k in (0.0, 0.011, 0.022):
        i = int(k * SR); e[i:i + 80] += 0.6
    return bp(nz * e, 900, 5000) * 0.6 * g


def hat(open_=False, g=1.0):
    n = int((0.35 if open_ else 0.06) * SR); t = t_of(n)
    return hp(rng.standard_normal(n), 7000) * np.exp(-t / (0.12 if open_ else 0.018)) * 0.35 * g


def crash(dur=3.5, g=1.0):
    n = int(dur * SR); t = t_of(n)
    s = hp(rng.standard_normal(n), 3500) * np.exp(-t / 1.1)
    s += hp(rng.standard_normal(n), 8000) * np.exp(-t / 0.4) * 0.5
    return s * 0.45 * g


def boom(g=1.0):
    n = int(2.5 * SR); t = t_of(n)
    f = 32 + 70 * np.exp(-t / 0.08)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.8)
    return np.tanh(2 * s) * 0.9 * g


def riser(dur, g=1.0):
    n = int(dur * SR); t = t_of(n)
    nz = rng.standard_normal(n)
    out = np.zeros(n)
    seg = int(0.05 * SR)
    for i in range(0, n, seg):
        frac = i / n
        lo = 400 + 5000 * frac ** 1.5
        out[i:i + seg] = bp(nz[max(0, i - 2000):i + seg], lo, min(lo * 2.2, 18000))[-len(out[i:i + seg]):]
    tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * (t / dur) ** 2) / SR) * 0.25
    return (out * 0.5 + tone) * (t / dur) ** 2 * g


def whoosh(dur=0.9, g=1.0):
    n = int(dur * SR); t = t_of(n)
    nz = bp(rng.standard_normal(n), 500, 6000)
    e = np.sin(np.pi * t / dur) ** 2
    return nz * e * 0.5 * g


def sparkle(start, dur=1.2, g=1.0, base=86):
    """Rising cascade of tiny bells."""
    k = 9
    for j in range(k):
        m = base + [0, 2, 4, 7, 9, 12, 14, 16, 19][j]
        add(bell(m, 1.2) * 0.35, start + j * dur / k, g, pan=(j / k - 0.5) * 1.2, rev=0.6)


# ---------------- harmony ----------------
D, Bm, G, A = [62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]
ROOTS = {id(D): 38, id(Bm): 35, id(G): 31, id(A): 33}
PROG = [D, Bm, G, A]

MEL_A = [(0, 69, 1), (1, 66, .5), (1.5, 69, .5), (2, 74, 1.5),
         (4, 71, 1), (5, 74, .5), (5.5, 71, .5), (6, 66, 1.5),
         (8, 67, .5), (8.5, 69, .5), (9, 71, 1), (10, 74, 1), (11, 71, 1),
         (12, 69, 1), (13, 73, 1), (14, 76, 2)]
MEL_A2 = MEL_A[:-3] + [(12, 69, .5), (12.5, 73, .5), (13, 76, 1), (14, 74, 2)]
MEL_B = [(0, 74, .5), (.5, 74, .5), (1, 78, 1), (2, 81, 1), (3, 78, 1),
         (4, 78, .5), (4.5, 76, .5), (5, 74, 1), (6, 71, 1.5), (7.5, 74, .5),
         (8, 79, .5), (8.5, 78, .5), (9, 76, 1), (10, 74, 1), (11, 71, 1),
         (12, 73, 1), (13, 76, 1), (14, 81, 1.5), (15.5, 79, .5)]
MEL_B2 = MEL_B[:-4] + [(12, 76, 1), (13, 73, 1), (14, 74, 2)]


def bar_t(b):
    return b * BAR


def melody(phrase, bar0, gain=1.0, octave=0, inst='pluck'):
    for (bt, m, d) in phrase:
        s = pluck(m + octave, d) if inst == 'pluck' else bell(m + octave, 1.5) * 0.6
        add(s, bar_t(bar0) + bt * BEAT, gain, pan=0.1 if inst == 'pluck' else -0.25, rev=0.25)


def chords(b0, b1, bright=1.0, gain=1.0, prog=PROG):
    for b in range(b0, b1):
        ch = prog[(b - b0) % len(prog)]
        add(pad_chord(ch + [ch[0] + 12], BAR + 0.5, bright), bar_t(b), 0.5 * gain, rev=0.45)


def bassline(b0, b1, eighths=False, prog=PROG, gain=1.0):
    for b in range(b0, b1):
        ch = prog[(b - b0) % len(prog)]
        r = ROOTS[id(ch)]
        steps = range(8) if eighths else (0, 2, 3)
        for s in steps:
            m = r + (12 if (eighths and s % 2) else 0)
            add(bass(m, BEAT * (0.45 if eighths else 0.9)), bar_t(b) + s * BEAT * (0.5 if eighths else 1), 0.8 * gain)


def drums(b0, b1, style='verse', fill_every=4):
    for b in range(b0, b1):
        t0 = bar_t(b)
        last = ((b - b0) % fill_every) == fill_every - 1
        for beat in range(4):
            tb = t0 + beat * BEAT
            if style == 'chorus' or beat in (0, 2):
                add(kick(), tb, 0.95)
            if beat in (1, 3):
                add(clap(), tb, 0.7, pan=0.05, rev=0.15)
            for h in (0, 0.5):
                add(hat(False), tb + h * BEAT, 0.6 if h else 0.4, pan=0.35)
            if style == 'chorus':
                add(hat(True), tb + 0.5 * BEAT, 0.25, pan=-0.3)
        if last:  # small fill
            for k in range(4):
                add(clap(0.6), t0 + 3 * BEAT + k * BEAT / 4, 0.45 + k * 0.1, pan=-0.2 + k * 0.13)


# ================= ARRANGEMENT =================
# Intro (bars 0-3): pad swells, bell arpeggio, sparkles
chords(0, 4, bright=0.3, gain=0.55)
arp = [74, 78, 81, 86, 81, 78]
for b in range(4):
    ch = PROG[b % 4]
    for k in range(8):
        m = ch[k % 3] + 12 + (12 if k >= 4 else 0)
        add(bell(m, 2.0), bar_t(b) + k * BEAT / 2, 0.11 + 0.025 * b, pan=np.sin(k) * 0.6, rev=0.7)
sparkle(0.2, 1.6, 0.45)
sparkle(2.0, 1.4, 0.35, base=93)

# Letters (bars 4-7): chime + stab on each downbeat, groove grows
chords(4, 8, bright=0.55, gain=0.9)
bassline(4, 8)
for i, b in enumerate(range(4, 8)):
    t0 = bar_t(b)
    add(crash(1.6, 0.5), t0, 0.6)
    add(kick(1.1), t0, 1.0)
    add(boom(0.5), t0, 0.5)
    for m in ([74, 78, 81], [76, 79, 83], [78, 81, 86], [79, 83, 88])[i]:
        add(bell(m, 2.2), t0, 0.45, rev=0.6)
    add(whoosh(0.7), t0 - 0.55, 0.6)
    # light pulse after the stab
    for beat in (1, 2, 3):
        add(hat(False), t0 + beat * BEAT, 0.35 + 0.1 * i, pan=0.3)
        if i >= 2:
            add(kick(0.6), t0 + beat * BEAT, 0.45)
    for k in range(4):
        add(bell(PROG[i][k % 3] + 24, 1.0), t0 + BEAT * (1 + k * 0.75), 0.18, pan=0.4, rev=0.6)

# Build (bars 8-9)
chords(8, 9, bright=0.6, gain=0.9, prog=[G])
chords(9, 10, bright=0.8, gain=0.9, prog=[A])
add(bass(31, BAR), bar_t(8), 0.7); add(bass(33, BAR * 0.9), bar_t(9), 0.7)
for beat in range(4):
    add(kick(0.8), bar_t(8) + beat * BEAT, 0.7)
    add(hat(False), bar_t(8) + (beat + .5) * BEAT, 0.4)
# accelerating snare roll in bar 9 (stops half a beat before the hit)
t, step = bar_t(9), BEAT / 2
while t < bar_t(10) - BEAT / 2:
    frac = (t - bar_t(9)) / BAR
    add(clap(0.5 + frac), t, 0.5 + 0.9 * frac, pan=np.sin(t * 7) * 0.3)
    t += step
    step = max(BEAT / 8, step * 0.86)
add(riser(BAR - BEAT / 2, 1.0), bar_t(9), 2.2, rev=0.3)
add(riser(2 * BAR - BEAT / 2, 1.0), bar_t(8), 1.0, rev=0.3)

# WOW (bar 10 = 20 s): the Hei appears
add(boom(1.2), bar_t(10), 1.0)
add(crash(5, 1.3), bar_t(10), 0.9, rev=0.4)
add(kick(1.3), bar_t(10), 1.0)
chords(10, 12, bright=1.0, gain=1.2, prog=[D, D])
for m in (74, 78, 81, 86, 90):
    add(bell(m, 3.5), bar_t(10), 0.35, rev=0.8)
sparkle(bar_t(10) + 0.3, 1.8, 1.0)
sparkle(bar_t(11), 1.5, 0.7, base=91)
add(bass(38, BAR * 2), bar_t(10), 0.7)
for b in (10, 11):
    for beat in range(4):
        if b == 11 or beat:
            add(hat(beat % 2 == 1), bar_t(b) + beat * BEAT, 0.35)
    add(kick(0.7), bar_t(b) + 2 * BEAT, 0.6)
# fill into reveal
for k in range(6):
    add(clap(0.8), bar_t(11) + 2.5 * BEAT + k * BEAT / 4, 0.4 + 0.08 * k)
add(whoosh(1.0, 1.2), bar_t(12) - 0.8, 0.8)

# Royal fanfare (bar 12 = 24 s): Zvi is revealed
add(crash(4, 1.2), bar_t(12), 0.9, rev=0.4)
add(boom(1.0), bar_t(12), 0.9)
fan = [(0, 62, 1/3), (1/3, 66, 1/3), (2/3, 69, 1/3), (1, 74, 2.5),
       (4, 71, .5), (4.5, 74, .5), (5, 78, 1), (6, 81, 2)]
for (bt, m, d) in fan:
    for o in (0, -12):
        add(brass(m + o, d * BEAT + 0.1), bar_t(12) + bt * BEAT, 0.42 if o == 0 else 0.3, pan=0.15 if o else -0.15, rev=0.35)
chords(12, 15, bright=1.0, gain=1.0, prog=[D, G, A])
bassline(12, 15, prog=[D, G, A])
drums(12, 15, 'verse', fill_every=3)
sparkle(bar_t(12) + 0.1, 1.5, 1.0)
for (bt, m, d) in [(8, 81, 1), (9, 78, 1), (10, 74, 2)]:
    add(bell(m, 2.5), bar_t(12) + bt * BEAT, 0.4, rev=0.6)

# Verse (bars 15-22)
chords(15, 23, bright=0.6)
bassline(15, 23)
drums(15, 23, 'verse')
melody(MEL_A, 15)
melody(MEL_A2, 19)
for b in (15, 19):
    add(crash(2.5, 0.6), bar_t(b), 0.5)

# Objects (bars 23-28)
chords(23, 29, bright=0.75)
bassline(23, 29)
drums(23, 29, 'verse', fill_every=3)
melody(MEL_A, 23, 0.8, 12, 'bell')
melody(MEL_A2[:10], 27, 0.8, 12, 'bell')
for t0 in (bar_t(23), bar_t(26)):  # steering wheel 46 s, helicopter 52 s
    add(whoosh(0.9, 1.1), t0 - 0.7, 0.8)
    add(crash(2.5, 0.8), t0, 0.7, rev=0.3)
    add(boom(0.6), t0, 0.6)
    sparkle(t0 + 0.1, 1.0, 0.8)
# helicopter: little "rotor" flutter (synth, subtle)
nrot = int(2.0 * SR); tr = t_of(nrot)
rotor = hp(rng.standard_normal(nrot), 200) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 14 * tr))) * np.sin(np.pi * tr / 2.0) ** 2
add(lp(rotor, 1800) * 0.25, bar_t(26) + 0.2, 0.6, pan=-0.3)

# Chorus (bars 29-40)
chords(29, 41, bright=1.0, gain=1.1)
bassline(29, 41, eighths=True)
drums(29, 41, 'chorus')
melody(MEL_B, 29, 1.0)
melody(MEL_B2, 33, 1.0)
melody(MEL_B, 37, 1.0)
melody(MEL_B, 29, 0.45, 12, 'bell')
melody(MEL_B2, 33, 0.45, 12, 'bell')
melody(MEL_B, 37, 0.45, 12, 'bell')
for b in (29, 33, 37):
    add(crash(3, 0.9), bar_t(b), 0.7, rev=0.3)
    add(whoosh(0.8), bar_t(b) - 0.6, 0.6)

# Finale (bars 41-48) + ending
add(boom(1.1), bar_t(41), 1.0)
add(crash(4, 1.2), bar_t(41), 0.9, rev=0.4)
sparkle(bar_t(41), 1.6, 1.0)
chords(41, 47, bright=1.0, gain=1.1)
bassline(41, 47, eighths=True)
drums(41, 47, 'chorus')
melody(MEL_B, 41, 1.0)
melody(MEL_B2[:-3], 45, 1.0)
melody(MEL_B, 41, 0.5, 12, 'bell')
add(crash(3, 1.0), bar_t(45), 0.8)
# Cadence G - A - D (bars 46, 47 -> final chord at bar 48 = 96 s)
for (b, ch, r) in ((46, G, 31), (47, A, 33)):
    add(brass(ch[0] + 12, BAR * 0.95), bar_t(b), 0.3); add(brass(ch[2] + 12, BAR * 0.95), bar_t(b), 0.25)
for (bt, m) in [(0, 79), (2, 78), (4, 76), (5, 73), (6, 76), (7, 79)]:
    add(pluck(m, 1), bar_t(46) + bt * BEAT, 1.0, rev=0.3)
t = bar_t(47) + 2 * BEAT; step = BEAT / 4
while t < bar_t(48) - 0.02:
    add(clap(0.8), t, 0.6); t += step
add(riser(BAR, 0.8), bar_t(47), 0.5)
END = bar_t(48)
add(boom(1.3), END, 1.0)
add(kick(1.3), END, 1.0)
add(crash(6, 1.4), END, 1.0, rev=0.5)
add(pad_chord([50, 62, 66, 69, 74, 78], 6.0, 1.0), END, 0.8, rev=0.5)
for m in (62, 66, 69, 74):
    add(brass(m, 3.0), END, 0.3, rev=0.4)
add(bass(38, 4.0), END, 0.8)
for k, m in enumerate([74, 78, 81, 86, 90, 93]):
    add(bell(m, 4.0), END + k * 0.09, 0.4, pan=(k - 2.5) / 3, rev=0.8)
sparkle(END + 0.5, 2.0, 0.8, base=93)

# ================= MIX =================
ir_n = int(2.4 * SR); ti = t_of(ir_n)
ir = rng.standard_normal((2, ir_n)) * np.exp(-ti / 0.75)
ir[:, :int(0.02 * SR)] = 0
ir = np.stack([lp(ir[0], 6000), lp(ir[1], 6000)])
rev = np.stack([fftconvolve(wet[c], ir[c])[:N] for c in range(2)]) * 0.18
mix = dry + rev
mix = hp(mix, 28)
# gentle master fade at the very end
fade = int(4.0 * SR)
mix[:, -fade:] *= np.linspace(1, 0, fade) ** 1.5
peak = np.abs(mix).max()
mix = np.tanh(mix / peak * 1.4) / np.tanh(1.4) * 0.89

os.makedirs(os.path.dirname(OUT), exist_ok=True)
pcm = (mix.T * 32767).astype('<i2')
import wave
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', OUT, f'{DUR:.1f}s')
