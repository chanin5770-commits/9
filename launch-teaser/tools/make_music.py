# Builds the launch-teaser soundtrack (15 s) from the original "מלכת האותיות" song:
#   0.000–11.433  the song's instrumental break (36.101 s, a downbeat, to 47.534 s:
#                 7 bars at 147 BPM), so it carries no vocals
#   11.433        stops on the next downbeat, which rings out for a moment
#   0.41          a quiet chime as the first golden letter lights up
#   12.25         a crystal chime with a long tail for "בקרוב..."
#   11.6–15       a soft high pad under the end card
# Usage: python3 tools/make_music.py <malchat-haotiyot.mp3> <out.wav>
import subprocess, sys, wave
import numpy as np

SR = 48000
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', sys.argv[1], '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                     capture_output=True, check=True).stdout
song = np.frombuffer(raw, np.float32).reshape(-1, 2)
N = int(15.0 * SR)
out = np.zeros((N, 2), np.float32)
S = lambda t: int(round(t * SR))

def fade(x, a, b):
    x = x.copy(); na, nb = S(a), S(b)
    if na: x[:na] *= np.linspace(0, 1, na)[:, None]
    if nb: x[-nb:] *= np.linspace(1, 0, nb)[:, None]
    return x

START, STOP = 36.101, 11.433
body = song[S(START):S(START + STOP)]
out[:len(body)] += fade(body, 0.12, 0.01)
# The downbeat after the stop rings out briefly, then silence.
hit = song[S(START + STOP):S(START + STOP + 0.45)]
hit = hit * np.exp(-np.arange(len(hit)) / SR * 9)[:, None]
out[S(STOP):S(STOP) + len(hit)] += hit

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
    env = np.minimum(1, t / 0.8) * np.minimum(1, (t1 - t0 - t) / 1.2)
    # G sus4 high and soft, with a slow shimmer.
    x = sum(np.sin(2 * np.pi * f * t + p) * (1 + 0.3 * np.sin(2 * np.pi * 0.7 * t + p)) for f, p in [(783.99, 0), (1046.5, 1), (1174.66, 2), (1567.98, 3)])
    x = (x * env * gain / 4).astype(np.float32)
    out[S(t0):S(t0) + len(x)] += np.stack([x, np.roll(x, S(0.013))], 1)

chime(0.41, 0.07)
pad(11.6, 15.0, 0.035)
chime(12.25, 0.2, 2.4)
out[S(14.6):] *= np.linspace(1, 0, N - S(14.6))[:, None]
out *= 0.89 / np.abs(out).max()
pcm = (np.clip(out, -1, 1) * 32767).astype('<i2')
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', sys.argv[2])
