# Builds the 50-second launch-teaser soundtrack from the original "מלכת האותיות" song.
# It uses only the song's instrumental break (36.101–49.167 s: 8 bars at 147 BPM,
# no vocals), played 3½ times, every pass joined on a downbeat:
#   0.00–13.07   pass 1, muffled as if heard from behind the gate; it opens up as
#                the doors open, with a riser into the downbeat at 13.07
#   13.07–39.20  passes 2 and 3, full
#   39.20–45.73  the first half once more; stops on the next downbeat, which rings out
#   46.14        a crystal chime with a long tail for "בקרוב..."
#   0.41         a quiet chime as the first golden letter lights up
#   45.9–50      a soft high pad under the end card
# Usage: python3 tools/make_music_50.py <malchat-haotiyot.mp3> <out.wav>
import subprocess, sys, wave
import numpy as np

SR = 48000
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', sys.argv[1], '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                     capture_output=True, check=True).stdout
song = np.frombuffer(raw, np.float32).reshape(-1, 2)
DUR = 50.0
N = int(DUR * SR)
out = np.zeros((N, 2), np.float32)
S = lambda t: int(round(t * SR))

BAR = 4 * 60 / 146.95
START = 36.101
PASS = 8 * BAR
loop = song[S(START):S(START) + S(PASS)].copy()

def place(x, t0, xf=0.006):
    x = x.copy(); n = S(xf)
    x[:n] *= np.linspace(0, 1, n)[:, None]; x[-n:] *= np.linspace(1, 0, n)[:, None]
    a = S(t0); m = min(len(x), N - a)
    out[a:a + m] += x[:m]

# Pass 1: blend from a low-passed copy into the full sound as the gate opens.
spec = np.fft.rfft(loop, axis=0)
f = np.fft.rfftfreq(len(loop), 1 / SR)
muffled = np.fft.irfft(spec * (1 / (1 + (f / 650) ** 4))[:, None], n=len(loop), axis=0).astype(np.float32)
tt = np.arange(len(loop)) / SR
w = np.where(tt < 11.4, 0.12 + 0.18 * tt / 11.4, 0.3 + 0.7 * ((tt - 11.4) / (PASS - 11.4)) ** 2)[:, None]
gain = np.where(tt < 11.4, 0.8, 0.8 + 0.2 * (tt - 11.4) / (PASS - 11.4))[:, None]
pass1 = (muffled * (1 - w) + loop * w) * gain
pass1[:S(0.15)] *= np.linspace(0, 1, S(0.15))[:, None]
place(pass1, 0)
place(loop, PASS)
place(loop, 2 * PASS)
STOP = 3 * PASS + 4 * BAR
place(loop[:S(4 * BAR)], 3 * PASS)
# The downbeat after the stop rings out briefly, then silence.
hit = song[S(START + 4 * BAR):S(START + 4 * BAR + 0.5)]
place(hit * np.exp(-np.arange(len(hit)) / SR * 8)[:, None], STOP)

def noise_riser(t0, t1, gain):
    n = S(t1 - t0); rng = np.random.default_rng(3)
    x = rng.standard_normal(n).astype(np.float32)
    # Brighter as it rises: mix white noise over a smoothed copy.
    sm = np.convolve(x, np.ones(24) / 24, 'same')
    k = np.linspace(0, 1, n)
    y = (sm * (1 - k) + x * k) * k ** 2 * gain
    out[S(t0):S(t0) + n] += np.stack([y, np.roll(y, 300)], 1)

def chime(t0, gain, length=1.6, base=1567.98):
    t = np.arange(S(length)) / SR
    env = np.exp(-t * 3.0) * (1 - np.exp(-t * 400))
    tone = sum(a * np.sin(2 * np.pi * base * r * t) for r, a in [(1, 1), (1.498, 0.55), (2, 0.35), (2.997, 0.15)])
    x = (tone * env * gain).astype(np.float32)
    y = np.zeros((len(x) + S(0.5), 2), np.float32)
    for d, g, pan in [(0, 1, (1, 1)), (0.11, 0.35, (1, 0.4)), (0.19, 0.28, (0.4, 1)), (0.31, 0.18, (1, 0.6)), (0.43, 0.12, (0.6, 1))]:
        y[S(d):S(d) + len(x)] += x[:, None] * g * np.array(pan, np.float32)
    a = S(t0); n = min(len(y), N - a)
    out[a:a + n] += y[:n]

def pad(t0, t1, gain):
    t = np.arange(S(t1 - t0)) / SR
    env = np.minimum(1, t / 0.8) * np.minimum(1, (t1 - t0 - t) / 1.5)
    x = sum(np.sin(2 * np.pi * fr * t + p) * (1 + 0.3 * np.sin(2 * np.pi * 0.7 * t + p)) for fr, p in [(783.99, 0), (1046.5, 1), (1174.66, 2), (1567.98, 3)])
    x = (x * env * gain / 4).astype(np.float32)
    out[S(t0):S(t0) + len(x)] += np.stack([x, np.roll(x, S(0.013))], 1)

chime(0.41, 0.07)
noise_riser(PASS - 2.2, PASS, 0.05)
chime(PASS, 0.09, 2.0, 1046.5)        # the doors open
chime(3 * PASS, 0.07, 1.8, 1174.66)   # the King and the Queen together, the name
pad(STOP + 0.15, DUR, 0.035)
chime(STOP + BAR / 4, 0.2, 2.6)       # "בקרוב..."
out[S(DUR - 0.5):] *= np.linspace(1, 0, N - S(DUR - 0.5))[:, None]
out *= 0.89 / np.abs(out).max()
pcm = (np.clip(out, -1, 1) * 32767).astype('<i2')
with wave.open(sys.argv[2], 'wb') as wv:
    wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR); wv.writeframes(pcm.tobytes())
print('wrote', sys.argv[2], 'stop at', round(STOP, 3))
