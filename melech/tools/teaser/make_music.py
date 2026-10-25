# Builds the teaser soundtrack (15 s) from the original song:
#   0.000–7.825  the instrumental intro of the song (from its first beat, 0.07 s)
#   7.825–13.49  the chorus with the vocals removed (instrumental stem from
#                tools/analysis/separate_vocals.py), cut in on a beat
#   13.49        hard stop on the beat, one beat of silence
#   13.89        a single crystal chime with a long tail (the "coming soon" sting)
#   0.45         a quieter chime as the first golden letter lights up
# Usage: python3 make_music.py song44.wav inst.wav out.wav
import sys
import numpy as np, soundfile as sf

song, sr = sf.read(sys.argv[1], dtype='float32')
inst, sr2 = sf.read(sys.argv[2], dtype='float32')
assert sr == sr2
N = int(15.0 * sr)
out = np.zeros((N, 2), 'float32')
S = lambda t: int(round(t * sr))

def fade(x, a, b):
    x = x.copy(); na, nb = S(a), S(b)
    if na: x[:na] *= np.linspace(0, 1, na)[:, None]
    if nb: x[-nb:] *= np.linspace(1, 0, nb)[:, None]
    return x

cut, stop = 7.825, 13.49
intro = song[S(0.07):S(0.07 + cut) + S(0.02)]
out[:len(intro)] += fade(intro, 0.25, 0.02)
chorus = inst[S(25.681) - S(0.01):S(25.681 + (stop - cut))]
chorus = fade(chorus, 0.01, 0.04) * 1.05
out[S(cut) - S(0.01):S(cut) - S(0.01) + len(chorus)] += chorus

def chime(t0, gain, length=1.6):
    t = np.arange(S(length)) / sr
    env = np.exp(-t * 3.2) * (1 - np.exp(-t * 400))
    tone = sum(a * np.sin(2 * np.pi * f * t) for f, a in [(1567.98, 1), (2349.32, 0.55), (3135.96, 0.35), (4698.6, 0.15)])
    x = (tone * env * gain).astype('float32')
    # Simple stereo shimmer: a few delayed, quieter copies.
    y = np.zeros((len(x) + S(0.5), 2), 'float32')
    for d, g, pan in [(0, 1, (1, 1)), (0.11, 0.35, (1, 0.4)), (0.19, 0.28, (0.4, 1)), (0.31, 0.18, (1, 0.6)), (0.43, 0.12, (0.6, 1))]:
        y[S(d):S(d) + len(x)] += x[:, None] * g * np.array(pan, 'float32')
    a = S(t0)
    n = min(len(y), N - a)
    out[a:a + n] += y[:n]

chime(0.45, 0.10)
chime(13.89, 0.22, 1.8)
out[S(14.75):] *= np.linspace(1, 0, N - S(14.75))[:, None]
peak = np.abs(out).max()
out *= 0.89 / peak
sf.write(sys.argv[3], out, sr, subtype='PCM_16')
print('peak before norm', peak)
