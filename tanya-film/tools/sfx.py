#!/usr/bin/env python3
"""Synthesises the sound-effect library -> public/sfx/*.wav.

Everything is generated here from noise and sine waves (no third-party audio,
no licence questions). These are draft-quality effects that give each place
and action its sound; swap any file for a recorded effect of the same name.

  amb-*   loopable 20 s ambiences (night room, day room, street, wind,
          synagogue murmur, office, bus)
  others  one-shots: phone buzz, alarm, clock, water, page, glass, heartbeat,
          breath, typing, footsteps, coin, cutlery, whoosh, low hit

Run:  python3 tools/sfx.py
"""
import os, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'sfx')
SR = 44100
rng = np.random.default_rng(11)


def t(sec):
    return np.arange(int(sec * SR)) / SR


def noise(sec):
    return rng.standard_normal(int(sec * SR))


def band(x, lo, hi, slope=0.0):
    """FFT band-pass; slope<0 tilts towards the low end (pink/brown-ish)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = ((f >= lo) & (f <= hi)).astype(float)
    if slope:
        m *= np.where(f > 0, (np.maximum(f, 1) / 1000.0) ** slope, 0)
    return np.fft.irfft(X * m, len(x))


def env(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def loopable(x, fade=1.0):
    """crossfade the tail into the head so the file loops without a click"""
    n = int(fade * SR)
    head, tail = x[:n].copy(), x[-n:].copy()
    w = np.linspace(0, 1, n)
    x = x[:-n].copy()
    x[:n] = head * w + tail * (1 - w)
    return x


def place(buf, sig, at):
    a = int(at * SR)
    b = min(len(buf), a + len(sig))
    if b > a:
        buf[a:b] += sig[: b - a]


def save(name, x, peak=0.8):
    m = np.abs(x).max() or 1
    x = x / m * peak
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


def click(dur=0.03, lo=800, hi=6000, decay=120):
    x = band(noise(dur), lo, hi)
    return x * np.exp(-t(dur) * decay)


def thump(freq=55, dur=0.35, decay=12):
    tt = t(dur)
    return np.sin(2 * np.pi * freq * tt * (1 - 0.3 * tt)) * np.exp(-tt * decay) * np.minimum(1, tt / 0.004)


# ---- ambiences (20 s, loopable) ----
L = 21.0
night = band(noise(L), 40, 900, -1.0) * 0.5 + 0.08 * np.sin(2 * np.pi * 50 * t(L))
save('amb-night', loopable(night), 0.5)

day = band(noise(L), 60, 3000, -1.0) * 0.6
for at in rng.uniform(1, 19, 9):  # far birds
    tt = t(0.18)
    chirp = np.sin(2 * np.pi * (3200 + 1400 * np.sin(tt * 40)) * tt) * np.hanning(len(tt))
    place(day, chirp * 0.05, at)
save('amb-day', loopable(day), 0.5)

street = band(noise(L), 30, 2500, -1.4)
for at in rng.uniform(0, 18, 4):  # passing cars
    d = rng.uniform(3, 5)
    car = band(noise(d), 60, 1800, -0.8) * np.hanning(int(d * SR)) * 2.2
    place(street, car, at)
save('amb-street', loopable(street), 0.6)

wind = band(noise(L), 120, 2200, -0.6)
gust = 0.55 + 0.45 * np.sin(2 * np.pi * 0.09 * t(L)) * np.sin(2 * np.pi * 0.23 * t(L) + 1)
save('amb-wind', loopable(wind * gust[: len(wind)]), 0.55)

murmur = np.zeros(int(L * SR))
for k in range(14):  # many soft "voices": band noise with syllable-rate modulation
    v = band(noise(L), 180 + 40 * k, 900 + 60 * k)
    syl = np.clip(np.sin(2 * np.pi * rng.uniform(3, 5.5) * t(L) + rng.uniform(0, 6)), 0, 1) ** 2
    phr = np.clip(np.sin(2 * np.pi * rng.uniform(0.1, 0.3) * t(L) + rng.uniform(0, 6)), 0, 1)
    murmur += v * syl * phr
murmur += band(noise(L), 40, 400, -1.0) * 0.6
save('amb-shul', loopable(murmur), 0.5)

office = band(noise(L), 50, 1200, -1.0) * 0.5 + 0.05 * np.sin(2 * np.pi * 120 * t(L))
for at in np.cumsum(rng.uniform(0.08, 0.6, 60)):
    if at < L - 0.1:
        place(office, click(0.025, 1500, 7000, 200) * 0.25, at)
save('amb-office', loopable(office), 0.5)

bus = band(noise(L), 25, 300, -1.5) * (1 + 0.2 * np.sin(2 * np.pi * 0.4 * t(L)))
for at in rng.uniform(0, 20, 25):
    place(bus, click(0.05, 300, 3000, 60) * 0.3, at)
save('amb-bus', loopable(bus), 0.6)

# ---- one-shots ----
# phone vibration: two buzz pulses on a hard surface
buzz = np.zeros(int(1.4 * SR))
for at in (0.0, 0.7):
    tt = t(0.38)
    b = np.sign(np.sin(2 * np.pi * 172 * tt)) * 0.6 + np.sin(2 * np.pi * 344 * tt) * 0.3
    b = band(b, 80, 2500) * env(len(tt), 0.01, 0.04) * (1 + 0.3 * np.sin(2 * np.pi * 28 * tt))
    place(buzz, b, at)
save('phone-buzz', buzz, 0.7)

alarm = np.zeros(int(2.4 * SR))
for i in range(8):
    tt = t(0.09)
    place(alarm, np.sign(np.sin(2 * np.pi * 2050 * tt)) * env(len(tt), 0.002, 0.01) * 0.4, (i // 2) * 0.55 + (i % 2) * 0.14)
save('alarm', band(alarm, 300, 8000), 0.55)

clock = np.zeros(int(5 * SR))
for i in range(5):
    place(clock, click(0.02, 2000, 8000, 300) * (1 if i % 2 else 0.7), i * 1.0 + 0.05)
save('clock', clock, 0.5)

water = band(noise(2.6), 600, 5000) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 9 * t(2.6)))) * env(int(2.6 * SR), 0.08, 0.5)
save('water', water, 0.6)

page = band(noise(0.7), 1200, 9000) * np.hanning(int(0.7 * SR)) ** 2 * (1 + np.sin(2 * np.pi * 30 * t(0.7)))
save('page', page, 0.5)

glass = np.zeros(int(2.2 * SR))
tt = t(1.2)
for f, a in ((2480, 1), (3710, 0.6), (5200, 0.3)):
    place(glass, np.sin(2 * np.pi * f * tt) * np.exp(-tt * 7) * a * 0.5, 0.0)
place(glass, band(noise(1.4), 400, 6000) * np.exp(-t(1.4) * 3) * 0.8, 0.08)
save('glass', glass, 0.7)

heart = np.zeros(int(4.4 * SR))
for i in range(5):
    place(heart, thump(52, 0.3, 14), i * 0.86)
    place(heart, thump(46, 0.3, 16) * 0.6, i * 0.86 + 0.24)
save('heartbeat', heart, 0.9)

breath = band(noise(3.2), 300, 3500, -0.5)
shape = np.concatenate([np.hanning(int(1.4 * SR)), np.zeros(int(0.3 * SR)), np.hanning(int(1.5 * SR)) * 0.8])
breath = breath[: len(shape)] * shape[: len(breath)]
save('breath', breath, 0.5)

keys = np.zeros(int(2.2 * SR))
for at in np.cumsum(rng.uniform(0.09, 0.22, 14)):
    if at < 2.1:
        place(keys, click(0.02, 2500, 9000, 260), at)
save('keys', keys, 0.5)

steps = np.zeros(int(4.2 * SR))
for i in range(7):
    place(steps, click(0.06, 150, 3500, 70) * 0.9 + np.pad(thump(80, 0.12, 30) * 0.5, (0, int(0.06 * SR)))[: int(0.06 * SR)], 0.1 + i * 0.56)
save('steps', steps, 0.6)

coin = np.zeros(int(1.4 * SR))
tt = t(0.9)
for f in (3100, 4650, 6900):
    place(coin, np.sin(2 * np.pi * f * tt) * np.exp(-tt * 9) * 0.4, 0)
place(coin, click(0.03, 1000, 8000, 150), 0)
save('coin', coin, 0.5)

cutlery = np.zeros(int(2.0 * SR))
for at in (0.1, 0.55, 1.2):
    tt = t(0.5)
    place(cutlery, (np.sin(2 * np.pi * 4200 * tt) + 0.5 * np.sin(2 * np.pi * 6100 * tt)) * np.exp(-tt * 18) * 0.4, at)
save('cutlery', cutlery, 0.45)

whoosh = band(noise(1.6), 200, 6000, -0.4) * np.hanning(int(1.6 * SR)) ** 1.5
save('whoosh', whoosh, 0.45)

low = thump(42, 2.5, 1.6) + band(noise(2.5), 30, 200) * np.exp(-t(2.5) * 2.5) * 0.4
save('low-hit', low, 0.8)

print('sfx ->', OUT, sorted(os.listdir(OUT)))
