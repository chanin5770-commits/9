"""Score, sound design and mix for the vertical Hashmali ad.

    python vertical/audio.py   # -> dist/hashmali-cinematic-ad-vertical.wav

Everything except the narration is synthesised here, so the music and effects are
original and free to publish. 120 BPM in B minor / D major (vi-IV-I-V), built in
sections that follow the story:

  0-5.5    the home: bright plucks, pad, light kick
  5.5-9.5  the question: music falls away to a low drone and a ticking pulse
  9.5      "תבחרו נכון.": soft accent; 10.0 the logo: deep hit + chime
  11.5     the groove comes in and builds behind the work footage
  25.5     "חשמלי.": the drop, full beat under the services montage
  34       "בונים? משפצים?": lighter, rhythmic
  39       end card: final hit, resolving chord, clean tail

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
    j = min(len(buf), i + len(sig))
    if i < 0:
        sig, i = sig[-i:], 0
        j = min(len(buf), len(sig))
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


def env_ad(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


# ---------------------------------------------------------------- instruments

def kick(gain=1.0):
    t = tt(0.45)
    f = 45 + 110 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    click = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t / 0.004) * 0.25
    return np.tanh((body + click) * 1.6) * gain


def clap():
    t = tt(0.3)
    n = rng.standard_normal(len(t))
    e = np.zeros(len(t))
    for k, d in enumerate((0, 0.011, 0.022)):
        e += (t >= d) * np.exp(-(t - d).clip(0) / (0.008 if k < 2 else 0.11))
    return bp(n, 900, 4000) * e * 0.55


def hat(open_=False):
    t = tt(0.25 if open_ else 0.06)
    return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t / (0.08 if open_ else 0.018)) * 0.22


def tick():
    t = tt(0.05)
    return np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.006) * 0.25 + hp(rng.standard_normal(len(t)), 5000) * np.exp(-t / 0.004) * 0.1


def saw(freq, t, n_harm=24):
    out = np.zeros_like(t)
    for k in range(1, n_harm + 1):
        if freq * k > 16000:
            break
        out += np.sin(2 * np.pi * freq * k * t) / k
    return out


def pluck(midi, dur=0.32):
    t = tt(dur)
    f = hz(midi)
    out = np.zeros_like(t)
    for k in range(1, 14):
        if f * k > 15000:
            break
        out += np.sin(2 * np.pi * f * k * t + k) / k * np.exp(-t * (6 + 2.6 * k))
    return out * 0.32 * np.minimum(1, t / 0.002)


def bass_note(midi, dur):
    t = tt(dur)
    f = hz(midi)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * saw(f, t, 8)
    e = np.minimum(1, t / 0.006) * np.minimum(1, (dur - t) / 0.03).clip(0) * (0.75 + 0.25 * np.exp(-t / 0.12))
    return lp(np.tanh(x * 1.3), 900) * e * 0.5


def pad_chord(midis, dur, bright=0.5):
    t = tt(dur)
    out = np.zeros_like(t)
    for m in midis:
        for det in (-0.09, 0.0, 0.08):
            out += saw(hz(m + det), t, 10) * 0.12
    out = lp(out, 1200 + 2500 * bright)
    a = np.minimum(1, t / 0.35) * np.minimum(1, (dur - t) / 0.4).clip(0)
    return out * a * 0.35


def bell(midi, dur=2.5):
    t = tt(dur)
    f = hz(midi)
    out = np.zeros_like(t)
    for ratio, amp, dec in ((1, 1, 1.4), (2.0, 0.5, 0.9), (2.76, 0.35, 0.6), (5.4, 0.18, 0.3), (8.1, 0.1, 0.15)):
        out += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / dec)
    return out * 0.18 * np.minimum(1, t / 0.002)


def impact(size=1.0, low=48):
    t = tt(2.6)
    f = low + 70 * np.exp(-t / 0.05)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.45 * size))
    crack = bp(rng.standard_normal(len(t)), 300, 6000) * np.exp(-t / 0.05) * 0.5
    tail = lp(rng.standard_normal(len(t)), 600) * np.exp(-t / (0.8 * size)) * 0.25
    return np.tanh((boom * 1.2 + crack + tail) * 1.2) * 0.8 * size


def sub_drop(dur=1.2):
    t = tt(dur)
    f = 70 * np.exp(-t / 0.5) + 30
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.01) * np.exp(-t / 0.5) * 0.7


def riser(dur):
    t = tt(dur)
    k = t / dur
    noise = rng.standard_normal(len(t))
    # sweep a band upward by blending progressively brighter filtered copies
    lo, mid, hi = lp(noise, 900), bp(noise, 1500, 5000), hp(noise, 5000)
    x = lo * (1 - k) + mid * np.sin(np.pi * k) + hi * k
    tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * k ** 2) / SR) * 0.15
    return (x * 0.5 + tone) * k ** 2.2 * 0.6


def reverse_swell(dur):
    s = riser(dur)
    return s * 0.8


def whoosh(dur=0.55, bright=1.0):
    t = tt(dur)
    k = t / dur
    noise = rng.standard_normal(len(t))
    x = bp(noise, 400, 2500 + 4000 * bright)
    e = np.sin(np.pi * k) ** 2 * (0.4 + 0.6 * k)
    return x * e * 0.35


def click_plug():
    t = tt(0.12)
    a = bp(rng.standard_normal(len(t)), 1500, 7000) * np.exp(-t / 0.006)
    b = np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.03) * 0.5
    return (a + b) * 0.5


def reverb(x, secs=2.2, mix=0.25):
    t = tt(secs)
    ir = rng.standard_normal(len(t)) * np.exp(-t / (secs / 5.5))
    ir = lp(ir, 5000)
    ir /= np.sqrt((ir ** 2).sum())
    wet = fftconvolve(x, ir)[:len(x)]
    return x * (1 - mix) + wet * mix * 1.4


# ---------------------------------------------------------------- score

# vi-IV-I-V in D major (Bm, G, D, A); one chord per bar
CHORDS = [(47, (59, 62, 66)), (43, (59, 62, 67)), (50, (57, 62, 66)), (45, (57, 61, 64))]
ARP = [0, 1, 2, 1, 2, 0, 1, 2]


def section_level(t):
    """Arrangement map: which layers play when (0..1)."""
    dip0, dip1 = CUES['dip']
    lv = dict(kick=0, clap=0, hat=0, bass=0, pluck=0, pad=0, drone=0, tick=0)
    if t < dip0:                        # the home
        lv.update(kick=0.7 if t >= 2.0 else 0, hat=0.6, bass=0.6, pluck=1, pad=0.8)
    elif t < dip1:                      # the question
        lv.update(drone=1, tick=1, pad=0.35)
    elif t < CUES['groove']:            # the brand frame
        lv.update(pad=0.6)
    elif t < CUES['brand'] - BAR:       # behind the walls
        build = (t - CUES['groove']) / (CUES['brand'] - BAR - CUES['groove'])
        lv.update(kick=0.85, hat=0.5 + 0.4 * build, bass=0.85, pluck=0.7 + 0.3 * build, pad=0.7,
                  clap=1 if t >= 17.0 else 0)
    elif t < CUES['brand']:             # last bar before the drop: pull the floor out
        lv.update(pad=0.6, pluck=0.6, hat=0.8)
    elif t < CUES['call']:              # the drop
        lv.update(kick=1, clap=1, hat=1, bass=1, pluck=1, pad=1)
    elif t < CUES['end']:               # the call to action
        lv.update(kick=0.8, clap=0.8, hat=0.6, bass=0.8, pluck=0.6, pad=0.8)
    elif t < CUES['end'] + 4.0:         # end card: the arpeggio keeps moving over the final chord
        lv.update(pluck=0.55 * (1 - (t - CUES['end']) / 4.0), hat=0.3)
    return lv


def build_music():
    music = np.zeros(N)
    drums = np.zeros(N)
    n_beats = int((CUES['end'] + 4.0) / BEAT)
    for b in range(n_beats):
        t = b * BEAT
        lv = section_level(t)
        bar = int(t // BAR)
        root, chord = CHORDS[bar % 4]
        if t >= CUES['end']:
            root, chord = 50, (57, 62, 66)
        beat_in_bar = b % 4
        if lv['kick']:
            add(drums, kick(), t, lv['kick'])
        if lv['clap'] and beat_in_bar in (1, 3):
            add(drums, clap(), t, lv['clap'])
        for e in range(2):                      # 8th notes
            te = t + e * BEAT / 2
            lv8 = section_level(te)
            if lv8['hat']:
                add(drums, hat(open_=(e == 1 and beat_in_bar == 3)), te, lv8['hat'] * (0.7 if e == 0 else 1))
            if lv8['bass'] and te < CUES['end']:
                add(music, bass_note(root, BEAT / 2 - 0.02), te, lv8['bass'] * (1.0 if e == 1 else 0.75))
        for s in range(4):                      # 16th-note arpeggio
            ts = t + s * BEAT / 4
            lvs = section_level(ts)
            if lvs['pluck']:
                step = (b * 4 + s) % 8
                note = chord[ARP[step]] + (12 if step in (4, 6) else 0)
                add(music, pluck(note + 12), ts, lvs['pluck'] * (1.0 if s == 0 else 0.7))
        if lv['tick']:
            add(drums, tick(), t, 0.9 if beat_in_bar == 0 else 0.6)
    # pads, one per bar, scaled by the level at the bar's start
    for bar in range(int(CUES['end'] / BAR) + 1):
        t = bar * BAR
        if t >= CUES['end']:
            break
        lv = section_level(t + 0.01)
        root, chord = CHORDS[bar % 4]
        if lv['pad']:
            add(music, pad_chord(chord, BAR + 0.4, bright=0.3 + 0.5 * lv['pad']), t, lv['pad'])
    # the question: a low drone under Yosef
    d0, d1 = CUES['dip']
    t = tt(d1 - d0 + 0.6)
    drone = (np.sin(2 * np.pi * hz(35) * t) + 0.4 * np.sin(2 * np.pi * hz(47) * t * 1.001)) * 0.25
    drone *= np.minimum(1, t / 0.6) * np.minimum(1, (t[-1] - t) / 0.5)
    add(music, drone, d0)
    # end card: resolving D major chord with bells
    end = CUES['end']
    add(music, pad_chord((50, 57, 62, 66, 69), DURATION - end, bright=0.9), end, 1.2)
    add(music, bass_note(38, 3.5) * np.exp(-tt(3.5) / 1.8), end, 1.0)
    for i, m in enumerate((74, 78, 81, 86)):
        add(music, bell(m, 3.0), end + 0.12 * i, 0.9)
    return reverb(music, 2.4, 0.22), drums


def build_fx():
    fx = np.zeros(N)
    cuts = [s['t'] for s in SHOTS[1:]]
    # a light whoosh into the cuts of the opening and the services montage
    for c in cuts:
        if c < CUES['dip'][0] or CUES['brand'] < c < CUES['call'] + 0.1:
            add(fx, whoosh(0.45, 0.8), c - 0.32, 0.55)
    # the question: music sucks out
    add(fx, reverse_swell(0.9)[::-1] * 0.6, CUES['dip'][0] - 0.05)
    add(fx, sub_drop(1.4), CUES['dip'][0], 0.5)
    # "תבחרו נכון." / logo
    add(fx, reverse_swell(1.2), CUES['choose_text'] - 1.2, 0.5)
    add(fx, impact(0.6, 55) * 0.6, CUES['choose_text'])
    add(fx, impact(1.0, 42), CUES['choose_logo'])
    add(fx, bell(81, 2.5), CUES['choose_logo'], 0.9)
    add(fx, bell(86, 2.5), CUES['choose_logo'] + 0.08, 0.6)
    # the groove returns
    add(fx, whoosh(0.7, 1.0), CUES['groove'] - 0.5, 0.6)
    add(fx, impact(0.5, 50), CUES['groove'], 0.6)
    # plug seating in the socket
    add(fx, click_plug(), CUES['plug'], 0.7)
    # build and drop on "חשמלי."
    add(fx, riser(BAR), CUES['brand'] - BAR, 0.9)
    add(fx, impact(1.0, 40), CUES['brand'])
    add(fx, sub_drop(1.2), CUES['brand'], 0.45)
    add(fx, bell(78, 2.0), CUES['brand'], 0.7)
    # the call
    add(fx, impact(0.5, 55), CUES['call'], 0.5)
    # end card
    add(fx, riser(1.5), CUES['end'] - 1.5, 0.7)
    add(fx, impact(1.0, 38), CUES['end'])
    add(fx, sub_drop(1.4), CUES['end'], 0.4)
    return reverb(fx, 2.8, 0.3)


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
    voice = np.tanh(voice * 2.2) / np.tanh(2.2)
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
    fx = build_fx()
    voice, active = build_voice()
    duck = duck_curve(active)
    # music sits under the voice; effects duck a little less so accents still read
    bed = (music * 0.45 + drums * 0.42) * duck + fx * 0.6 * duck
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
    peak = np.abs(stereo).max()
    stereo *= 0.89 / peak
    out = os.path.join(ROOT, 'dist', 'hashmali-cinematic-ad-vertical-premaster.wav')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((stereo * 32767).astype(np.int16).tobytes())
    master(out, os.path.join(ROOT, 'dist', 'hashmali-cinematic-ad-vertical.wav'))


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
