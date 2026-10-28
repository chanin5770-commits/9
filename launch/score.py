"""Soundtrack: the original song under the story, then a synthesized climax.

0 -> beat 118   the song from the original video (it fades under the riser)
beat 110 -> 118 riser: sweeping noise, rising tone, snare roll
beat 118        impact + the festive groove in F major for the price, payment and end screens
plus soft whooshes on transitions and chimes on text hits throughout.
"""
import subprocess
import wave

import numpy as np

SR = 48000
RNG = np.random.default_rng(2026)


def note(n):
    """MIDI note number -> Hz."""
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n, a=0.005, d=0.3, curve=1.0):
    t = np.arange(n) / SR
    e = np.exp(-t / d) ** curve
    att = np.clip(t / a, 0, 1) if a > 0 else 1
    return e * att


def add(buf, sig, t):
    i = int(round(t * SR))
    if i >= len(buf):
        return
    if i < 0:
        sig, i = sig[-i:], 0
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n]


def fft_filter(x, lo=None, hi=None, slope=4):
    """Zero-phase band filter in the frequency domain (smooth edges)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1)) ** slope)
    if hi:
        g *= 1 / (1 + (f / hi) ** slope)
    return np.fft.irfft(X * g, len(x))


# ---------------------------------------------------------------- instruments
def bell(freq, dur=1.4, amp=0.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * freq * t) * np.exp(-t / (dur * 0.45)) +
         0.35 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t / (dur * 0.18)) +
         0.12 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t / (dur * 0.08)))
    return amp * s * np.clip(t / 0.002, 0, 1)


def pad(freqs, dur, amp=0.05, attack=0.12, release=0.5):
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.12):
            ff = f * (1 + det / 100)
            for h in range(1, 9):
                s += np.sin(2 * np.pi * ff * h * t + h) / h ** 1.6
    e = np.clip(t / attack, 0, 1) * np.clip((dur + release - t) / release, 0, 1)
    return amp * s * e / len(freqs)


def bass(freq, dur, amp=0.32):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t)
    return amp * np.tanh(1.4 * s) * env(n, 0.004, dur * 0.6)


def kick(amp=0.55):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    f = 45 + 80 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return amp * np.sin(ph) * np.exp(-t / 0.16)


def noise_hit(dur, lo, hi, d, amp):
    n = int(dur * SR)
    x = fft_filter(RNG.standard_normal(n), lo, hi)
    x /= np.abs(x).max() + 1e-9
    return amp * x * env(n, 0.001, d)


def boom(amp=0.9):
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    f = 38 + 70 * np.exp(-t / 0.08)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    crash = fft_filter(RNG.standard_normal(n), 3000, None) * np.exp(-t / 0.9) * 0.18
    crash = crash / np.abs(crash).max() * 0.35
    return amp * (s * 0.9 + crash)


def whoosh(dur=0.5, amp=0.12):
    """Noise swell that peaks at its end, swept through a few bands."""
    n = int(dur * SR)
    t = np.arange(n) / n
    out = np.zeros(n)
    bands = [(300, 700), (700, 1500), (1500, 3200), (3200, 7000)]
    for i, (lo, hi) in enumerate(bands):
        b = fft_filter(RNG.standard_normal(n), lo, hi)
        b /= np.abs(b).max() + 1e-9
        centre = 0.35 + 0.18 * i
        out += b * np.exp(-((t - centre) / 0.28) ** 2)
    return amp * out * t ** 1.5


def riser(dur, amp=0.25):
    n = int(dur * SR)
    t = np.arange(n) / n
    out = np.zeros(n)
    bands = [(200, 500), (500, 1100), (1100, 2400), (2400, 5000), (5000, 10000)]
    for i, (lo, hi) in enumerate(bands):
        b = fft_filter(RNG.standard_normal(n), lo, hi)
        b /= np.abs(b).max() + 1e-9
        out += b * np.clip((t - i * 0.15) / 0.4, 0, 1) * (0.4 + 0.6 * t)
    f = note(41) * 2 ** (t * 3)          # F2 rising three octaves
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * t ** 2 * 0.5
    return amp * (out * t ** 1.2 * 0.6 + tone)


def reverb(x, rt=1.6, mix=0.25):
    n = int(rt * SR)
    t = np.arange(n) / SR
    ir = RNG.standard_normal(n) * np.exp(-t / (rt / 6.9) * 1.0)
    ir = fft_filter(ir, 200, 7000)
    ir /= np.sqrt((ir ** 2).sum())
    L = len(x) + n
    nfft = 1 << (L - 1).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[:len(x)]
    return x * (1 - mix) + wet * mix * 2.2


# ---------------------------------------------------------------- the song
def load_song(path, seconds):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-t', str(seconds), '-f', 's16le', '-ac', '2',
                          '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.int16).reshape(-1, 2).astype(np.float64) / 32768
    return a


# ---------------------------------------------------------------- arrangement
F_MAJOR_BARS = {  # chord tones (MIDI) per bar of the climax
    'F': [53, 57, 60, 65], 'Dm': [50, 57, 62, 65], 'Bb': [46, 58, 62, 65], 'C': [48, 55, 60, 64],
    'Gm': [43, 55, 58, 62],
}


def write(path, film):
    dur = film.DURATION
    n = int(dur * SR) + SR
    music = np.zeros((n, 2))
    fx = np.zeros(n)
    sparkle = np.zeros(n)
    b = film.beat

    # 1) the song, fading under the riser
    t_end = b(118)
    song = load_song(film.ORIG, t_end + 0.05)
    g = np.ones(len(song))
    f0, f1 = int(b(114) * SR), int(t_end * SR)
    g[f0:f1] = np.linspace(1, 0.0, f1 - f0) ** 1.5
    g[f1:] = 0
    music[:len(song)] += song * g[:, None] * 0.92

    # 2) transitions and text hits
    for t0, t1, fn, tr in film.SHOTS[1:]:
        if t0 >= t_end:
            continue
        L = film.TR_LEN.get(tr, 0.3)
        add(fx, whoosh(0.55, 0.07), t0 - 0.45 + L / 2)
    def chime(t, root=77, amp=0.05, steps=(0, 4, 7, 12)):
        for i, s in enumerate(steps):
            add(sparkle, bell(note(root + s), 1.2, amp), t + i * 0.055)
    chime(b(2), 81, 0.07)                                     # crown + "the kingdom opened"
    for i in range(4):                                         # letter-page tiles
        chime(b(32 + i * 1.5), 84, 0.035, (0, 7))
    for k in range(5):                                         # games, songs, clips...
        chime(b(83) + 0.25 + k * film.SPB * 1.5, 81 + [0, 2, 4, 5, 7][k], 0.04, (0, 12))
    for kb in (1, 4, 7):                                       # 22 letters / a whole year / endless
        chime(b(108 + kb), 77 + kb, 0.05)

    # 3) riser into the climax, with a snare roll and a breath before the hit
    rs = riser(b(118) - b(110) - 0.12, 0.2)
    add(fx, rs, b(110))
    for k in range(32):
        t = b(114) + k * (b(118) - b(114) - 0.15) / 32
        add(fx, noise_hit(0.12, 900, 5000, 0.05, 0.04 + 0.1 * k / 32), t)

    # 4) the climax groove, F major
    bars = [(118, 'F'), (122, 'Dm'), (126, 'Bb'), (130, 'C'), (134, 'F'), (138, 'Dm'), (142, 'Bb'), (144, 'C'),
            (146, 'F')]
    mus = np.zeros(n)
    bells = np.zeros(n)
    for j, (kb, ch) in enumerate(bars):
        nb = (bars[j + 1][0] if j + 1 < len(bars) else 150) - kb
        tones = F_MAJOR_BARS[ch]
        last = j == len(bars) - 1
        add(mus, pad([note(m) for m in tones], nb * film.SPB + (1.4 if last else 0), 0.055), b(kb))
        for q in range(nb):
            t = b(kb + q)
            if q % 2 == 0:
                add(mus, bass(note(tones[0] - 12), film.SPB * 1.8), t)
            if not last or q == 0:
                add(mus, kick(0.42 if q % 2 == 0 else 0.3), t)
                if q % 2 == 1:
                    add(mus, noise_hit(0.25, 1200, 6000, 0.07, 0.13), t)
                add(mus, noise_hit(0.06, 6000, 14000, 0.018, 0.05), t + film.SPB / 2)
            # celesta arpeggio on eighths, climbing through the chord
            arp = [tones[1] + 12, tones[2] + 12, tones[3] + 12, tones[1] + 24]
            for e in range(2):
                if last and q > 1:
                    break
                m = arp[(q * 2 + e) % 4]
                add(bells, bell(note(m), 0.9, 0.05 if e == 0 else 0.035), t + e * film.SPB / 2)
    # big hits: the price, the payment screen, the end card
    add(fx, boom(0.85), b(118))
    add(fx, boom(0.55), b(119))
    for i, m in enumerate([65, 69, 72, 77, 81, 84, 89, 93]):        # harp gliss on "79"
        add(bells, bell(note(m), 1.6, 0.06), b(119) + i * 0.035)
    add(fx, whoosh(0.5, 0.08), b(126) - 0.4)
    add(fx, boom(0.5), b(142))
    for i, m in enumerate([77, 81, 84, 89]):
        add(bells, bell(note(m), 2.6, 0.08), b(142) + i * 0.07)
    for i, m in enumerate([65, 72, 77, 81, 84, 89]):                 # final ring
        add(bells, bell(note(m), 3.0, 0.07), b(146) + i * 0.05)

    climax = reverb(mus, 1.4, 0.18) + reverb(bells, 2.2, 0.35)
    # match the climax loudness to the song's level
    song_rms = np.sqrt(np.mean(music[int(10 * SR):int(40 * SR)] ** 2))
    seg = climax[int(b(120) * SR):int(b(140) * SR)]
    climax *= song_rms / (np.sqrt(np.mean(seg ** 2)) + 1e-9) * 0.95
    fxr = reverb(fx, 1.2, 0.2) + reverb(sparkle, 2.0, 0.4)

    # light stereo: bells and sparkle slightly wide
    out = music.copy()
    out[:, 0] += climax + fxr * 0.95
    out[:, 1] += climax * 0.97 + fxr
    out[:, 0] += 0.02 * np.roll(climax, 240)
    # fade the very end
    fe0, fe1 = int((dur - 1.0) * SR), int(dur * SR)
    out[fe0:fe1] *= np.linspace(1, 0, fe1 - fe0)[:, None] ** 2
    out[fe1:] = 0
    out = out[:int(dur * SR)]
    out = np.tanh(out * 1.1) / np.tanh(1.1)
    out *= 0.93 / np.abs(out).max()
    pcm = (out * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
