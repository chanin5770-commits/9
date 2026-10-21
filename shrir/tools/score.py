#!/usr/bin/env python3
"""Score, sound design and final mix for ״שריר שצריך לאמן״ -> build/mix.wav.

Everything here is synthesised in code (no samples, no third-party music), and
every cue hangs off build/timeline.json, so re-timing the film re-times the
score:

  * music in G major at 70 BPM: a sparse piano in E minor colour at the start,
    a soft warm pulse from the third section, the music pausing for the hoop
    game, strings widening into the climax, and a warm resolution at the end;
  * sound design: distant yard air and birds, a far ball, footsteps on the
    approach and while running, water, wooden blocks, a soft chime when the
    heart rises;
  * narration from narration/timing.json when a recording exists, with the
    music and effects ducked under the voice; then loudness-normalised to
    -16 LUFS (mobile) with true peak under -1.5 dBTP.
"""
import json, os, subprocess, sys
import numpy as np
from scipy import signal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
rng = np.random.default_rng(11)

tl = json.load(open(os.path.join(ROOT, 'build/timeline.json'), encoding='utf-8'))
DUR = tl['duration']
N = int(DUR * SR) + SR
sec = {s['id']: s for s in tl['sections']}
M = tl['markers']
shots = tl['shots']


def buf():
    return np.zeros((2, N))


def place(bus, x, t, gain=1.0, pan=0.0):
    """Mix mono or stereo x into bus at time t (seconds)."""
    i = int(t * SR)
    if i >= N or i + 1 <= 0:
        return
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.vstack([x * l * 1.414, x * r * 1.414])
    n = min(x.shape[1], N - i)
    bus[:, i:i + n] += x[:, :n] * gain


def env_curve(points):
    """Piecewise-linear automation from [(t, value), ...]."""
    t = np.arange(N) / SR
    ts, vs = zip(*points)
    return np.interp(t, ts, vs)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- instruments
def piano(m, dur, vel=0.6, bright=1.0):
    f = mtof(m)
    n = int((dur + 2.5) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for h in range(1, 9):
        fh = f * h * np.sqrt(1 + 0.0004 * h * h)          # slight string inharmonicity
        if fh > 9000:
            break
        amp = (1 / h ** 1.25) * (bright if h > 2 else 1)
        dec = 0.55 + 0.45 * h + f / 900
        out += amp * np.sin(2 * np.pi * fh * t + rng.random() * 6.28) * np.exp(-t * dec)
    att = np.minimum(t / 0.004, 1)
    rel = np.clip(1 - (t - dur) / 0.6, 0, 1)
    hammer = rng.standard_normal(n) * np.exp(-t * 90) * 0.04
    return (out * att * rel + hammer * rel) * vel * 0.22


def pad(ms, dur, vel=0.5, att=1.6, rel=2.0, bright=0.5):
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for m in ms:
        for d in (-0.07, 0.0, 0.06):
            f = mtof(m) * 2 ** (d / 12)
            out += np.sin(2 * np.pi * f * t + rng.random() * 6.28) + bright * 0.35 * np.sin(4 * np.pi * f * t) + bright * 0.12 * np.sin(6 * np.pi * f * t)
    e = np.minimum(t / att, 1) * np.clip(1 - (t - dur) / rel, 0, 1)
    return out * e * vel * 0.05 / max(len(ms), 1)


def strings(ms, dur, vel=0.5, att=1.2, rel=1.8):
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    vib = 1 + 0.003 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(t / 1.5, 1)
    for m in ms:
        for d in (-0.08, -0.02, 0.05, 0.1):
            f = mtof(m) * 2 ** (d / 12)
            ph = 2 * np.pi * np.cumsum(f * vib) / SR + rng.random() * 6.28
            saw = sum(np.sin(k * ph) / k for k in range(1, 9))
            out += saw
    b, a = signal.butter(2, 2600 / (SR / 2))
    out = signal.lfilter(b, a, out)
    e = np.minimum(t / att, 1) ** 1.5 * np.clip(1 - (t - dur) / rel, 0, 1)
    return out * e * vel * 0.03 / max(len(ms), 1)


def bass(m, dur, vel=0.5):
    f = mtof(m)
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) * np.exp(-t * 4)
    e = np.minimum(t / 0.01, 1) * np.exp(-t * 1.6) * np.clip(1 - (t - dur) / 0.4, 0, 1)
    return x * e * vel * 0.30


def soft_kick(vel=0.5):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 48 + 60 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * vel * 0.5


def brush(vel=0.3):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    b, a = signal.butter(2, [3000 / (SR / 2), 9000 / (SR / 2)], 'band')
    return signal.lfilter(b, a, x) * np.exp(-t * 22) * np.minimum(t / 0.01, 1) * vel * 0.12


def bell(m, vel=0.3):
    f = mtof(m)
    n = int(3 * SR)
    t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in ((1, 1, 1.4), (2.76, 0.4, 2.6), (5.4, 0.18, 4.5), (2.0, 0.25, 2.0)))
    return x * np.minimum(t / 0.003, 1) * vel * 0.12


def reverb_ir(seconds=3.2, damp=6000):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((2, n)) * np.exp(-t * 6.9 / seconds)
    b, a = signal.butter(1, damp / (SR / 2))
    ir = signal.lfilter(b, a, ir, axis=1)
    ir[:, :int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))


def reverb(x, ir, wet):
    y = np.vstack([signal.fftconvolve(x[c], ir[c])[:N] for c in range(2)])
    return x * (1 - wet * 0.3) + y * wet


# ---------------------------------------------------------------- music
BPM = 70
BEAT = 60 / BPM
BAR = 4 * BEAT
T0 = 0.9

# chords as (bass root, pad voicing, arpeggio notes) in G major
CH = {
    'Em': (40, [55, 59, 64, 67], [64, 67, 71, 74, 71, 67]),
    'C':  (36, [55, 60, 64, 67], [60, 64, 67, 72, 67, 64]),
    'G':  (43, [55, 59, 62, 67], [62, 67, 71, 74, 71, 67]),
    'D':  (38, [54, 57, 62, 66], [62, 66, 69, 74, 69, 66]),
    'Am': (45, [57, 60, 64, 69], [64, 69, 72, 76, 72, 69]),
    'Dsus': (38, [55, 57, 62, 67], [62, 67, 69, 74, 69, 67]),
    'Gadd9': (43, [55, 59, 62, 69], [62, 67, 69, 71, 74, 79]),
}
OPEN = ['Em', 'C', 'G', 'D']
MAIN = ['G', 'D', 'Em', 'C']
LIFT = ['C', 'D', 'G', 'Em', 'C', 'D', 'G', 'G']

s10, s11, s12 = sec['s10']['start'], sec['s11']['start'], sec['s12']['start']
stop, resume = M.get('musicStop'), M.get('musicResume')
climax = M.get('climax', s10 + 12)
end_card = M.get('endCard', DUR - 6)


def chord_at(t):
    b = int((t - T0) // BAR)
    if t < sec['s03']['start']:
        return OPEN[b % 4]
    if t < s10:
        return MAIN[b % 4]
    if t < s11:
        return LIFT[b % 8]
    if t < s12:
        return MAIN[b % 4]
    return LIFT[b % 8]


piano_bus, pad_bus, str_bus, rhythm_bus = buf(), buf(), buf(), buf()
nbars = int((DUR - T0) / BAR) + 1
final_bar = int((end_card - T0) // BAR) + 1   # bar on which the music resolves

for b in range(nbars):
    t = T0 + b * BAR
    if t > DUR - 1:
        break
    if b >= final_bar:
        break
    name = chord_at(t + 0.01)
    root, voicing, arp = CH[name]
    # piano: sparse quarter notes at the start, flowing eighths later, octave melody at the climax
    if t < sec['s02']['start']:
        pat = [(0, arp[0], 0.45), (1.5, arp[2], 0.35), (2.5, arp[1], 0.3)]
        if b == 0:
            pat = [(0, arp[2], 0.35), (2, arp[0], 0.3)]
    elif t < sec['s03']['start'] or (s11 <= t < s12):
        pat = [(i, arp[i % len(arp)], 0.38 - 0.03 * (i % 2)) for i in range(0, 4)]
    else:
        pat = [(i * 0.5, arp[i % len(arp)], 0.34 - 0.05 * (i % 2)) for i in range(8)]
    for beat, m, v in pat:
        tt = t + beat * BEAT
        if stop and stop - 0.1 < tt < resume:
            continue
        piano_bus_note = piano(m, BEAT * 1.4, v * 0.9)
        place(piano_bus, piano_bus_note, tt + rng.normal(0, 0.006), pan=(m - 66) / 30)
    piano_left = piano(root + 12, BAR * 0.9, 0.42)
    if not (stop and stop - 0.1 < t < resume):
        place(piano_bus, piano_left, t, pan=-0.25)
    # melody over the climax and the ending
    if climax - BAR * 0.5 <= t < s11 or (s12 + BAR <= t):
        top = max(arp) + 12
        for beat, m in ((0, top), (1.5, top - (3 if name in ('Em', 'Am') else 4)), (3, top - 5)):
            place(piano_bus, piano(m, BEAT * 1.6, 0.3, bright=1.2), t + beat * BEAT, pan=0.2)
    # pad from the start, thin at first
    pv = 0.45 if t < sec['s02']['start'] else 0.75
    place(pad_bus, pad(voicing, BAR, pv), t)
    # strings widen from the return to the yard to the end of the climax, and again at the close
    if s10 - BAR <= t < s11 + BAR:
        sv = 0.35 + 0.65 * np.clip((t - s10) / max(climax - s10, 1), 0, 1)
        place(str_bus, strings([v + 12 for v in voicing] + [root + 12], BAR, sv), t - 0.3)
    elif t >= s12:
        place(str_bus, strings([v + 12 for v in voicing], BAR, 0.45), t - 0.3)
    # soft pulse: bass on 1 and 3, a felt kick, brushes on the off-beats
    pulse_on = (sec['s03']['start'] - 0.2 <= t < s11) and not (stop and stop - BAR < t < resume)
    if pulse_on:
        energy = 1.25 if t >= climax - BAR else 1.0
        for beat in (0, 2):
            place(rhythm_bus, bass(root if root >= 38 else root + 12, BEAT * 1.6, 0.55 * energy), t + beat * BEAT)
            place(rhythm_bus, soft_kick(0.38 * energy), t + beat * BEAT)
        for beat in (1, 3) if t < climax - BAR else (0.5, 1, 1.5, 2.5, 3, 3.5):
            place(rhythm_bus, brush(0.5 * energy), t + beat * BEAT, pan=0.3)

# the resolution: a long Gadd9 on the end card
root, voicing, arp = CH['Gadd9']
tr = T0 + final_bar * BAR
tr = min(tr, end_card + 0.4)
place(piano_bus, piano(root, 5, 0.5), tr, pan=-0.2)
place(piano_bus, piano(root + 12, 5, 0.45), tr, pan=-0.1)
for i, m in enumerate(arp):
    place(piano_bus, piano(m + 12, 4.5 - i * 0.35, 0.32), tr + i * 0.24, pan=(m - 66) / 30)
place(pad_bus, pad(voicing, 6, 0.8, att=0.8, rel=3), tr)
place(str_bus, strings([v + 12 for v in voicing], 5, 0.5, att=0.6, rel=3), tr)

# section intensity automation
music_gain = env_curve([
    (0, 0.0), (0.4, 0.0), (2.5, 0.75), (sec['s02']['start'], 0.85), (sec['s03']['start'], 0.95),
    (s10, 0.95), (climax, 1.15), (s11 - 1, 1.1), (s11 + 2, 0.85), (s12, 0.9), (end_card, 1.05), (DUR - 1.5, 0.8), (DUR, 0.0),
])
if stop:
    music_gain *= env_curve([(0, 1), (stop, 1), (stop + 0.18, 0.0), (resume - 0.05, 0.0), (resume + 0.6, 1), (DUR, 1)])

ir = reverb_ir()
music = (reverb(piano_bus, ir, 0.32) + reverb(pad_bus, ir, 0.4) + reverb(str_bus, ir, 0.38) * 1.1 + reverb(rhythm_bus, ir, 0.12) * 0.9)
music *= music_gain

# ---------------------------------------------------------------- sound design
sfx = buf()


def band_noise(n, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return signal.lfilter(b, a, rng.standard_normal(n))


def step(vel=0.5, bright=1800):
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    crunch = band_noise(n, 400, bright) * np.exp(-t * 40)
    thud = np.sin(2 * np.pi * 90 * t) * np.exp(-t * 35)
    return (crunch * 0.6 + thud * 0.5) * vel * 0.12


def birds(t0, count, gain=0.05):
    for _ in range(count):
        t = t0 + rng.random() * 3
        f0 = 2800 + rng.random() * 1800
        for k in range(rng.integers(2, 5)):
            n = int(0.09 * SR)
            tt = np.arange(n) / SR
            f = f0 + 900 * np.sin(np.pi * tt / 0.09) * (1 if k % 2 else -0.6)
            x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / 0.09) ** 2
            place(sfx, x * gain, t + k * 0.12, pan=rng.uniform(-0.8, 0.8))


def ball(t, vel=0.2):
    n = int(0.3 * SR)
    tt = np.arange(n) / SR
    x = np.sin(2 * np.pi * (140 + 80 * np.exp(-tt * 40)) * tt) * np.exp(-tt * 18) + band_noise(n, 600, 2500) * np.exp(-tt * 60) * 0.4
    b, a = signal.butter(2, 1800 / (SR / 2))
    place(sfx, signal.lfilter(b, a, x) * vel * 0.25, t, pan=0.5)


def shot_span(img, section=None, k=0):
    sel = [s for s in shots if s['img'] == img and (section is None or s['section'] == section)]
    return (sel[k]['start'], sel[k]['end']) if len(sel) > k else (None, None)


# distant yard air: always there, more present in the yard scenes, cooler and further at the start
air = band_noise(N, 250, 2600) * 0.5 + band_noise(N, 80, 300) * 0.4
mod = 1 + 0.25 * np.sin(2 * np.pi * np.arange(N) / SR * 0.13)
yard = env_curve([(0, 0), (0.2, 0.0), (0.6, 0.8), (sec['s02']['start'], 0.55), (sec['s04']['start'], 0.35), (s10, 0.45), (climax, 0.7), (s11, 0.25), (s12, 0.5), (DUR - 1.5, 0.3), (DUR, 0)])
sfx += np.vstack([air * mod, np.roll(air, 2400) * mod]) * yard * 0.010
for t in np.arange(1.5, DUR - 4, 7.5):
    birds(t + rng.random() * 3, 1 + int(rng.random() * 2), gain=0.035 if t < sec['s02']['start'] else 0.05)

# a far ball in the opening yard and when we return to it
for t in (2.4, 3.1, 3.55, 9.2, 9.8):
    ball(t, 0.16)
ball(s10 + 0.8, 0.2); ball(s10 + 1.4, 0.16)

# Yoav's approach (shot 13): unhurried steps; running (shots 14 and 15): quicker, brighter steps
a0, a1 = shot_span('13', 's10')
if a0:
    t = a0 + 0.4
    while t < a0 + 4.2:
        place(sfx, step(0.7), t, pan=-0.1 if int(t / 0.55) % 2 else 0.1); t += 0.58
for img, section in (('14', 's10'), ('15', 's12')):
    for k in range(2):
        r0, r1 = shot_span(img, section, k)
        if not r0:
            continue
        t = r0 + 0.2
        while t < min(r1, r0 + 5.5):
            for j, off in enumerate((0, 0.04, 0.11)):     # a few children together
                place(sfx, step(0.45 - 0.1 * j, 2600), t + off + rng.normal(0, 0.01), pan=(-0.4, 0.3, 0.6)[j])
            t += 0.31

# water at the sink (shot 09)
w0, w1 = shot_span('09', 's07', 0)
if w0:
    _, w1b = shot_span('09', 's07', 1)
    n = int((w1b - w0 + 1) * SR)
    water = band_noise(n, 900, 7000) * (0.6 + 0.4 * np.abs(signal.lfilter([1], [1, -0.999], rng.standard_normal(n)) / 40).clip(0, 1))
    e = np.minimum(np.arange(n) / SR / 0.6, 1) * np.clip((n / SR - np.arange(n) / SR) / 0.8, 0, 1)
    place(sfx, water * e * 0.022, w0 - 0.2, pan=0.2)

# wooden blocks into the basket (shot 10)
b0, b1 = shot_span('10', 's07', 0)
if b0:
    for k, t in enumerate(np.cumsum([0.5, 0.7, 0.45, 0.9, 0.6, 0.55])):
        n = int(0.25 * SR)
        tt = np.arange(n) / SR
        f = 700 + rng.random() * 600
        knock = (np.sin(2 * np.pi * f * tt) + 0.5 * np.sin(2 * np.pi * f * 2.3 * tt)) * np.exp(-tt * 45) + band_noise(n, 1500, 5000) * np.exp(-tt * 120) * 0.3
        place(sfx, knock * 0.05, b0 + t, pan=rng.uniform(-0.3, 0.3))

# hoop game: a short breath of silence, then the music resumes (handled in the music gain)

# the heart rising: a soft, high chime (gentle, never a "score")
for s in tl['sections']:
    prev = None
for i, s in enumerate(tl['sections']):
    prev = tl['sections'][i - 1]['heart'] if i else 0
    if s['heart'] > prev:
        at = M['climax'] if s['id'] == 's10' and 'climax' in M else s['heartAt'] + 1.2
        place(sfx, bell(83 if s['id'] != 's10' else 86, 0.32 if s['id'] != 's10' else 0.45), at, pan=0.55)
        place(sfx, bell(90, 0.16), at + 0.09, pan=0.6)

sfx = reverb(sfx, reverb_ir(1.6, 5000), 0.18)

# ---------------------------------------------------------------- narration + mix
voice = buf()
voice_mask = np.zeros(N)
if tl.get('narration') and tl['voice']:
    import wave
    path = os.path.join(ROOT, tl['narration'])
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    vo = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    for v in tl['voice']:
        a = int(max(v['src'] - 0.05, 0) * SR)
        b = int((v['src'] + v['dur'] + 0.12) * SR)
        seg = vo[a:b].copy()
        fl = int(0.02 * SR)
        seg[:fl] *= np.linspace(0, 1, fl); seg[-fl:] *= np.linspace(1, 0, fl)
        place(voice, np.vstack([seg, seg]) * 0.7071, v['at'] - 0.05)
        i0, i1 = int((v['at'] - 0.25) * SR), int((v['at'] + v['dur'] + 0.35) * SR)
        voice_mask[max(i0, 0):min(i1, N)] = 1
    duck_depth = 0.38   # about -8 dB under the voice
else:
    for c in tl['cues']:
        i0, i1 = int((c['start'] - 0.2) * SR), int((c['end']) * SR)
        voice_mask[max(i0, 0):min(i1, N)] = 1
    duck_depth = 0.72   # no voice yet: only a gentle dip while subtitles are read

# smooth the duck so it breathes rather than pumps
k = int(0.35 * SR)
smooth = np.convolve(voice_mask, np.hanning(k) / np.hanning(k).sum(), mode='same')
duck = 1 - (1 - duck_depth) * smooth
mix = (music * 0.9 + sfx) * duck + voice
mix = mix[:, :int(DUR * SR)]

os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
pre = os.path.join(ROOT, 'build/mix-pre.wav')
peak = np.abs(mix).max()
pcm = (mix / peak * 0.89 * 32767).T.astype('<i2')
import wave
with wave.open(pre, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

# loudness: two-pass EBU R128 to -16 LUFS for phones
out = os.path.join(ROOT, 'build/mix.wav')
meas = subprocess.run(['ffmpeg', '-hide_banner', '-i', pre, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
js = json.loads(meas[meas.rindex('{'):meas.rindex('}') + 1])
af = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:"
      f"measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', pre, '-af', af, '-ar', str(SR), '-c:a', 'pcm_s16le', out], check=True)
os.remove(pre)
print(f"mix: {DUR:.1f}s -> build/mix.wav ({'with narration' if tl['voice'] else 'music + sound design only, no narration yet'}); input {js['input_i']} LUFS")
