"""Score, sound design and mix for the vertical Hashmali ad.

    python vertical/audio.py   # -> dist/hashmali-cinematic-ad-vertical.wav

Everything except the narration is synthesised here, so the score and effects are
original and free to publish. A dark, premium trailer score at 120 BPM in D minor
(Dm - Bb - F - C), resolving to D major on the end card. No plucks, bells or
toy-like timbres: sub bass, low synth-string ostinato, hybrid drums and toms,
brass braams, risers, whooshes, and restrained electrical foley (breaker clacks,
mains hum, arc crackle).

  0-5.3    the home: warm pad, low pulse, kick
  5.3      silence, then a deep hit on the cut to Yosef; sub drone, hum, heartbeat
  8.0      deep hit under "לחשמל?"
  9.2      silence; 9.5 dark accent on "תבחרו נכון."; 10.0 braam as the logo lands
  11.5     the beat comes in and builds (ostinato opens up, snare from 17, tom roll)
  25.2     silence, then the drop on "חשמלי."
  34       leaner beat for "בונים? משפצים?"
  38.7     silence; 39.0 sonic logo; 41.6 closing brand signature, long tail

Music and effects duck automatically under the narration.
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from edit import BPM, CUES, DURATION, NARRATION, ROOT, SHOTS, VO

SR = 48000
N = int(DURATION * SR) + SR
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)


def at(t):
    return int(round(t * SR))


def add(buf, sig, t, gain=1.0):
    i = at(t)
    if i >= len(buf):
        return
    if i < 0:
        sig, i = sig[-i:], 0
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[:j - i] * gain


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def saw(freq, t, n_harm=24):
    out = np.zeros_like(t)
    for k in range(1, n_harm + 1):
        if freq * k > 16000:
            break
        out += np.sin(2 * np.pi * freq * k * t + 0.3 * k) / k
    return out


def reverb(x, secs=2.2, mix=0.25, tone=5000):
    t = tt(secs)
    ir = rng.standard_normal(len(t)) * np.exp(-t / (secs / 5.5))
    ir = lp(ir, tone)
    ir /= np.sqrt((ir ** 2).sum())
    wet = fftconvolve(x, ir)[:len(x)]
    return x * (1 - mix) + wet * mix * 1.4


# ---------------------------------------------------------------- instruments

def kick(gain=1.0):
    t = tt(0.5)
    f = 42 + 120 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2)
    click = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.003) * 0.2
    return np.tanh((body + click) * 1.8) * gain


def snare():
    t = tt(0.45)
    noise = bp(rng.standard_normal(len(t)), 250, 7000) * np.exp(-t / 0.12)
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.06)
    return np.tanh((noise * 0.8 + body * 0.7) * 1.4) * 0.6


def tom(f0=92, gain=1.0):
    t = tt(0.7)
    f = f0 * (0.62 + 0.38 * np.exp(-t / 0.08))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    skin = bp(rng.standard_normal(len(t)), 120, 900) * np.exp(-t / 0.04) * 0.6
    return np.tanh((body + skin) * 1.6) * 0.75 * gain


def hat():
    t = tt(0.05)
    return hp(rng.standard_normal(len(t)), 8000) * np.exp(-t / 0.012) * 0.16


def sub_note(midi, dur):
    """Deep, round sub bass with a little grit on top."""
    t = tt(dur)
    f = hz(midi)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * saw(f, t, 6)
    e = np.minimum(1, t / 0.008) * np.minimum(1, (dur - t) / 0.03).clip(0)
    return lp(np.tanh(x * 1.4), 380) * e * 0.55


def ostinato(midi, dur, bright):
    """Short low synth-string note (spiccato-like), dark and tight."""
    t = tt(dur)
    f = hz(midi)
    x = saw(f * 0.997, t, 14) + saw(f * 1.003, t, 14)
    x = lp(x, 500 + 2600 * bright)
    e = np.minimum(1, t / 0.004) * np.exp(-t / 0.075)
    return x * e * 0.28


def pad(midis, dur, bright=0.4):
    t = tt(dur)
    out = np.zeros_like(t)
    for m in midis:
        for det in (-0.08, 0.0, 0.07):
            out += saw(hz(m + det), t, 10) * 0.1
    out = lp(out, 700 + 2200 * bright)
    a = np.minimum(1, t / 0.5) * np.minimum(1, (dur - t) / 0.5).clip(0)
    return out * a * 0.32


def brass(midi, dur, attack=0.05, bright=1.0):
    """Synth brass: detuned saws whose filter opens on the attack and closes again."""
    t = tt(dur)
    f = hz(midi)
    x = saw(f * 0.996, t, 20) + saw(f, t, 20) + saw(f * 1.004, t, 20)
    w = np.minimum(1, t / attack) * np.exp(-t / 0.7)
    x = lp(x, 260) * (1 - w) + lp(x, 300 + 2300 * bright) * w
    e = np.minimum(1, t / attack) * np.exp(-t / (dur / 2.2))
    return np.tanh(x * e * 0.9) * 0.45


def braam(midis, dur=3.2, bright=1.0):
    out = np.zeros(int(dur * SR))
    for m in midis:
        out += brass(m, dur, bright=bright)
    t = tt(dur)
    out += np.sin(2 * np.pi * hz(midis[0] - 12) * t) * np.exp(-t / 1.2) * 0.6
    return np.tanh(out * 0.8)


def impact(size=1.0, low=44):
    t = tt(2.6)
    f = low + 70 * np.exp(-t / 0.05)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.5 * size))
    crack = bp(rng.standard_normal(len(t)), 250, 5000) * np.exp(-t / 0.04) * 0.45
    tail = lp(rng.standard_normal(len(t)), 500) * np.exp(-t / (0.7 * size)) * 0.25
    return np.tanh((boom * 1.2 + crack + tail) * 1.2) * 0.8 * size


def sub_drop(dur=1.4):
    t = tt(dur)
    f = 65 * np.exp(-t / 0.5) + 28
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.01) * np.exp(-t / 0.55) * 0.7


def thump():
    """Heartbeat-like low thump."""
    t = tt(0.3)
    f = 38 + 30 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09) * 0.8


def riser(dur):
    t = tt(dur)
    k = t / dur
    noise = rng.standard_normal(len(t))
    lo, mid, hi = lp(noise, 700), bp(noise, 1200, 4500), hp(noise, 4500)
    x = lo * (1 - k) + mid * np.sin(np.pi * k) + hi * k
    tone = sum(np.sin(2 * np.pi * np.cumsum(f0 * (1 + 1.5 * k ** 2)) / SR) for f0 in (110, 165)) * 0.12
    return (x * 0.45 + tone) * k ** 2.4 * 0.7


def reverse_swell(dur):
    """Reversed reverb-like swell that ends sharply (into a cut or a silence)."""
    t = tt(dur)
    k = t / dur
    x = lp(rng.standard_normal(len(t)), 2500) * 0.5 + np.sin(2 * np.pi * hz(50) * t) * 0.4
    return x * k ** 3 * 0.7


def whoosh(dur=0.5, bright=1.0):
    t = tt(dur)
    k = t / dur
    noise = rng.standard_normal(len(t))
    x = bp(noise, 300, 1800 + 3500 * bright) * (0.3 + 0.7 * k)
    whoom = np.sin(2 * np.pi * np.cumsum(70 + 40 * k) / SR) * 0.5
    e = np.sin(np.pi * k) ** 2
    return (x * 0.5 + whoom * 0.6) * e * 0.5


def clack():
    """A breaker / cabinet latch: sharp click, plastic body, small low thud, second click."""
    t = tt(0.15)
    a = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.002)
    b = bp(rng.standard_normal(len(t)), 900, 3500) * np.exp(-t / 0.012) * 0.6
    c = np.sin(2 * np.pi * 140 * t) * np.exp(-t / 0.035) * 0.5
    out = a + b + c
    j = int(0.017 * SR)
    out[j:] += (a[:-j] * 0.4 + b[:-j] * 0.3)
    return out * 0.55


def click_plug():
    t = tt(0.12)
    a = bp(rng.standard_normal(len(t)), 1500, 7000) * np.exp(-t / 0.006)
    b = np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.03) * 0.5
    return (a + b) * 0.45


def hum(dur):
    """Mains hum: 100 Hz and harmonics, softly saturated, slowly breathing."""
    t = tt(dur)
    x = sum(np.sin(2 * np.pi * 100 * k * t) / k for k in (1, 2, 3, 5))
    x = np.tanh(x * 1.5) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.7 * t))
    return lp(x, 1200) * np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.4) * 0.12


def zap(dur=0.35):
    """Short, restrained arc crackle."""
    t = tt(dur)
    gate = (rng.random(len(t)) < 0.004).astype(float)
    gate = np.convolve(gate, np.exp(-np.arange(int(0.004 * SR)) / (0.0012 * SR)))[:len(t)]
    crackle = bp(rng.standard_normal(len(t)), 1800, 9000) * np.clip(gate, 0, 1)
    buzz = np.tanh(saw(100, t, 30) * 3) * (np.clip(gate, 0, 1) * 0.5 + 0.08)
    e = np.exp(-t / (dur / 2.5))
    return (crackle + lp(buzz, 4000) * 0.4) * e * 0.5


# ---------------------------------------------------------------- score

# Dm - Bb - F - C, one chord per bar: (sub root, pad voicing)
CHORDS = [(38, (57, 62, 65, 69)), (34, (58, 62, 65, 70)), (41, (57, 60, 65, 69)), (36, (55, 60, 64, 67))]
OSTINATO = [0, 0, 12, 0, 7, 0, 12, 7, 0, 0, 12, 0, 10, 0, 7, 12]


def section(t):
    """Arrangement map: which layers play when (0..1), and how bright the ostinato is."""
    c = CUES
    lv = dict(kick=0, snare=0, hat=0, sub=0, ost=0, pad=0, bright=0.2, tom=0, half=False)
    if t < c['dip'][0]:                      # the home
        lv.update(kick=0.75 if t >= 2.0 else 0, sub=0.7, ost=0.55, pad=0.8, bright=0.25, half=True)
    elif t < c['groove']:                    # question + brand frame: no beat
        pass
    elif t < c['brand']:                     # behind the walls: build
        b = (t - c['groove']) / (c['brand'] - c['groove'])
        lv.update(kick=0.9, sub=0.85, ost=0.6 + 0.4 * b, pad=0.6 + 0.3 * b, bright=0.25 + 0.55 * b,
                  snare=0.85 if t >= 17.0 else 0, hat=0.6 if t >= 17.0 else 0, tom=0.8)
    elif t < c['call']:                      # the drop
        lv.update(kick=1, snare=1, hat=0.8, sub=1, ost=1, pad=1, bright=0.9, tom=1)
    elif t < c['end']:                       # the call to action
        lv.update(kick=0.85, snare=0.8, hat=0.5, sub=0.85, ost=0.7, pad=0.7, bright=0.55, tom=0.6)
    return lv


def silence_gate():
    g = np.ones(N)
    r = int(0.012 * SR)
    for a, b in CUES['silences']:
        i, j = at(a), at(b)
        g[i - r:i] = np.minimum(g[i - r:i], np.linspace(1, 0, r))
        g[i:j] = 0
    return g


def build_music():
    music = np.zeros(N)       # pads, ostinato, sub
    drums = np.zeros(N)
    pump = np.ones(N)         # sidechain from the kick
    n_beats = int(CUES['end'] / BEAT)
    for b in range(n_beats):
        t = b * BEAT
        lv = section(t)
        bar = int(t // BAR)
        root, _ = CHORDS[bar % 4]
        beat = b % 4
        if lv['kick'] and (not lv['half'] or beat in (0, 2)):
            add(drums, kick(), t, lv['kick'])
            i = at(t)
            k = tt(0.22)
            pump[i:i + len(k)] = np.minimum(pump[i:i + len(k)], 0.45 + 0.55 * (k / 0.22) ** 0.7)
        if lv['snare'] and beat in (1, 3):
            add(drums, snare(), t, lv['snare'])
        if lv['tom'] and beat == 3 and bar % 2 == 1:
            add(drums, tom(98), t + BEAT / 2, 0.7 * lv['tom'])
            add(drums, tom(80), t + 3 * BEAT / 4, 0.8 * lv['tom'])
        for e in range(2):
            te = t + e * BEAT / 2
            l8 = section(te)
            if l8['hat']:
                add(drums, hat(), te, l8['hat'] * (0.6 if e == 0 else 1.0))
            if l8['sub']:
                add(music, sub_note(root, BEAT / 2 - 0.015), te, l8['sub'])
        for s in range(4):
            ts = t + s * BEAT / 4
            l16 = section(ts)
            if l16['ost'] and (not l16['half'] or s % 2 == 0):
                step = (b * 4 + s) % 16
                add(music, ostinato(root + 12 + OSTINATO[step], 0.2, l16['bright']), ts,
                    l16['ost'] * (1.0 if s == 0 else 0.75))
    for bar in range(int(CUES['end'] / BAR) + 1):
        t = bar * BAR
        lv = section(t + 0.01)
        if lv['pad']:
            add(music, pad(CHORDS[bar % 4][1], BAR + 0.5, lv['pad'] * 0.6), t, lv['pad'])
    # tom roll into the drop
    roll0 = CUES['brand'] - 1.0
    for i in range(16):
        tr = roll0 + i * BEAT / 8
        if tr < CUES['silences'][2][0]:
            add(drums, tom(88 + 3 * (i % 3)), tr, 0.35 + 0.6 * i / 15)
    music *= pump
    # the question: sub drone, mains hum, heartbeat
    d0, d1 = CUES['dip']
    t = tt(d1 - d0)
    drone = (np.sin(2 * np.pi * hz(26) * t) + 0.5 * np.sin(2 * np.pi * hz(38) * t)) * 0.3
    drone *= np.minimum(1, t / 0.3) * np.minimum(1, (t[-1] - t) / 0.3)
    add(music, lp(drone, 200), d0)
    add(music, hum(d1 - d0 - 0.3), d0, 1.0)
    for k in range(int((d1 - d0) / BAR) + 1):
        for off in (0.0, 0.28):
            tb = d0 + 0.5 + k * BAR + off
            if tb < CUES['silences'][1][0]:
                add(music, thump(), tb, 0.9 if off == 0 else 0.6)
    # the brand frame: a dark pad under "תבחרו נכון." and the logo
    add(music, pad((50, 57, 62, 65), CUES['groove'] - CUES['choose_text'] + 0.3, 0.3), CUES['choose_text'], 0.9)
    # end card: D major, settling
    end = CUES['end']
    add(music, pad((50, 57, 62, 66, 69), DURATION - end, 0.45), end, 1.1)
    add(music, sub_note(38, 5.0) * np.exp(-tt(5.0) / 2.5), end, 0.9)
    gate = silence_gate()
    return reverb(music, 2.8, 0.24, 4500) * gate, reverb(drums, 1.4, 0.16, 6000) * gate


def build_fx():
    fx = np.zeros(N)
    hits = np.zeros(N)        # placed after the silence gate, so they land in the clear
    c = CUES
    # opening: the film starts on an impact
    add(hits, impact(0.7, 50), 0.0, 0.7)
    add(hits, whoosh(0.6, 0.8)[::-1], 0.0, 0.5)
    # whooshes into cuts (not inside the question)
    for s in SHOTS[1:]:
        t = s['t']
        if c['dip'][0] - 0.1 < t < c['groove'] - 0.1 or t >= c['end']:
            continue
        add(fx, whoosh(0.45, 0.9), t - 0.3, 0.5)
    # the question
    add(fx, reverse_swell(0.9), c['silences'][0][0] - 0.9, 0.8)
    add(hits, impact(1.0, 38), c['dip'][0], 0.9)
    add(hits, sub_drop(1.6), c['dip'][0], 0.7)
    add(fx, riser(0.5) * 0.6, c['question_hit'] - 0.5)
    add(hits, impact(1.1, 34), c['question_hit'], 0.8)
    add(hits, sub_drop(1.2), c['question_hit'], 0.6)
    # "תבחרו נכון." / logo
    add(fx, reverse_swell(0.7), c['silences'][1][0] - 0.7, 0.6)
    add(hits, impact(0.6, 48), c['choose_text'], 0.55)
    add(hits, braam((38, 45, 50, 53), 3.0), c['choose_logo'], 0.85)
    add(hits, impact(1.0, 40), c['choose_logo'], 0.8)
    # the groove comes in
    add(fx, reverse_swell(0.5), c['groove'] - 0.5, 0.5)
    add(hits, impact(0.6, 46), c['groove'], 0.5)
    # electrical foley
    for t in c['clacks']:
        add(hits, clack(), t, 0.9)
    for t in c['zaps']:
        add(hits, zap(), t, 0.35)
    add(hits, click_plug(), c['plug'], 0.7)
    # into the drop
    add(fx, riser(2.0), c['silences'][2][0] - 2.0, 0.9)
    add(hits, braam((38, 45, 50, 53), 3.4), c['brand'], 1.0)
    add(hits, impact(1.2, 36), c['brand'])
    add(hits, sub_drop(1.5), c['brand'], 0.6)
    add(hits, impact(0.55, 46), c['call'], 0.5)
    # end: silence, then the sonic logo
    add(fx, riser(1.5), c['silences'][3][0] - 1.5, 0.8)
    add(hits, zap(0.18), c['end'] - 0.12, 0.45)
    add(hits, braam((38, 45, 50, 54), 3.6), c['end'], 1.0)
    add(hits, impact(1.2, 34), c['end'])
    add(hits, sub_drop(1.6), c['end'], 0.55)
    # closing signature after the last line: two brass notes (A -> D) over a low hit, long tail
    sig = c['signature']
    add(hits, brass(45, 1.2, attack=0.03, bright=0.7) + brass(57, 1.2, attack=0.03, bright=0.7) * 0.6, sig, 0.7)
    add(hits, braam((38, 50, 54, 57), 4.5, bright=0.6), sig + 0.5, 0.75)
    add(hits, impact(0.9, 38), sig + 0.5, 0.7)
    gate = silence_gate()     # hits that start at a silence's end are untouched; earlier tails are cut
    return reverb(fx, 2.4, 0.3) * gate, reverb(hits, 3.0, 0.28, 4500) * gate


# ---------------------------------------------------------------- narration

def read_wav(path):
    with wave.open(path) as w:
        sr, ch = w.getframerate(), w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return resample_poly(x, SR // 1000, sr // 1000) if sr != SR else x


def build_voice():
    src = read_wav(NARRATION)
    src = hp(src, 85)
    voice = np.zeros(N)
    active = np.zeros(N)
    for a, b, film_at, _ in VO:
        a, b = a - 0.07, b + 0.10                  # keep consonant onsets and breath-free tails
        seg = src[at(a):at(b)].copy()
        f = int(0.012 * SR)
        seg[:f] *= np.linspace(0, 1, f)
        seg[-f:] *= np.linspace(1, 0, f)
        add(voice, seg, film_at - 0.07)
        active[at(film_at - 0.07):at(film_at - 0.07) + len(seg)] = 1
    # gentle presence lift and compression
    voice = voice + 0.25 * bp(voice, 2500, 6000)
    voice = np.tanh(voice * 1.8) / np.tanh(1.8)
    return voice, active


def duck_curve(active, depth_db=-13, attack=0.08, release=0.35):
    target = np.where(active > 0, 10 ** (depth_db / 20), 1.0)
    out = np.empty_like(target)
    g = 1.0
    a_c = np.exp(-1 / (attack * SR))
    r_c = np.exp(-1 / (release * SR))
    # look ahead so the music is already down when a word starts
    look = int(0.06 * SR)
    target = np.concatenate([target[look:], np.ones(look)])
    for i in range(len(target)):
        c = a_c if target[i] < g else r_c
        g = c * g + (1 - c) * target[i]
        out[i] = g
    return out


def main():
    music, drums = build_music()
    fx, hits = build_fx()
    voice, active = build_voice()
    duck = duck_curve(active)
    # hits keep their transient (they land just before a word) but their tails get
    # out of the way of the voice
    duck_hits = duck_curve(active, depth_db=-20)
    bed = (music * 0.45 + drums * 0.42 + fx * 0.6) * duck + hits * 0.6 * duck_hits
    # final fade so nothing is cut at the end
    fade = np.ones(N)
    f0 = at(DURATION - 2.5)
    fade[f0:at(DURATION)] = np.linspace(1, 0, at(DURATION) - f0) ** 2
    fade[at(DURATION):] = 0
    mix = (bed + voice * 1.0) * fade
    mix = mix[:at(DURATION)]
    stereo = np.stack([mix, mix], axis=1)
    # mild width on the bed only
    width = ((music * 0.45) * duck * fade)[:at(DURATION)]
    delayed = np.concatenate([np.zeros(int(0.011 * SR)), width])[:len(width)]
    stereo[:, 0] += 0.12 * delayed
    stereo[:, 1] -= 0.12 * delayed
    stereo *= 0.5 / np.percentile(np.abs(stereo), 99.9)
    stereo *= limiter(stereo, 0.89)
    out = os.path.join(ROOT, 'dist', 'hashmali-cinematic-ad-vertical-premaster.wav')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((stereo * 32767).astype(np.int16).tobytes())
    master(out, os.path.join(ROOT, 'dist', 'hashmali-cinematic-ad-vertical.wav'))


def limiter(x, ceiling, look=0.004, release=0.12):
    """Look-ahead peak limiter: gain that keeps |x| under the ceiling, smoothed."""
    from scipy.ndimage import maximum_filter1d
    peak = maximum_filter1d(np.abs(x).max(axis=1), size=int(2 * look * SR) + 1)
    target = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    # instant attack (the max filter already looks ahead), exponential release
    g = np.empty_like(target)
    r = np.exp(-1 / (release * SR))
    cur = 1.0
    for i, v in enumerate(target):
        cur = v if v < cur else r * cur + (1 - r) * v
        g[i] = cur
    return g[:, None]


def master(src, dst, lufs=-14.0, tp=-1.5):
    """Two-pass EBU R128 loudness normalisation (social-media level), true peak limited."""
    ln = f'loudnorm=I={lufs}:TP={tp}:LRA=9'
    probe = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', ln + ':print_format=json',
                            '-f', 'null', '-'], capture_output=True, text=True).stderr
    m = json.loads(probe[probe.rindex('{'):probe.rindex('}') + 1])
    ln += (f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
           f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', ln, '-ar', str(SR),
                    '-c:a', 'pcm_s16le', dst], check=True)
    print(dst)


if __name__ == '__main__':
    main()
