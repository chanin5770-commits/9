#!/usr/bin/env python3
"""Cinematic real-estate cut of footage/source.mp4.

    python3 apartment/build.py              # 9:16 (1080x1920) + 16:9 (1920x1080)
    python3 apartment/build.py --logo PATH  # adds the ChaniLi Studio logo on the end shot

Needs ffmpeg (with libvidstab) and numpy. Intermediate files go to apartment/work/.
The edit itself lives in SHOTS below: source in-point, speed, crop/zoom moves and grade.
"""
import argparse, json, os, subprocess, wave
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "footage", "source.mp4")
WORK = os.path.join(ROOT, "work")
DIST = os.path.join(ROOT, "dist")

FPS = 30
BPM = 96
BEAT = 60 / BPM          # 0.625 s; every cut sits on a beat
XF = 0.5                 # crossfade length, centred on the cut
END = 30.0               # last picture frame (fade to black ends here)
TAIL = 0.5               # black + music ring-out after the picture

# Each shot: source in-point (s), speed (<1 = slow motion from the 60 fps source),
# output cut-in / cut-out (s on the final timeline), horizontal crop centre for 9:16
# as a fraction of the source width (start -> end), zoom (start -> end), gamma,
# and an optional cool shift for warm light.
SHOTS = [
    # Opening: living room, the sofa settling into frame, slow push-in.
    dict(name="living",   src=2.60,  speed=0.70, cut=(0.00,  6.25),  cx=(0.45, 0.40), z=(1.00, 1.06), gamma=1.12),
    # Dining corner: flowers, mirror, framed painting.
    dict(name="dining",   src=7.70,  speed=0.70, cut=(6.25,  10.00), cx=(0.36, 0.40), z=(1.04, 1.00), gamma=1.04),
    dict(name="kitchen",  src=14.35, speed=0.70, cut=(10.00, 12.50), cx=(0.62, 0.58), z=(1.00, 1.04), gamma=1.04),
    dict(name="bedroom1", src=24.00, speed=0.70, cut=(12.50, 15.00), cx=(0.45, 0.42), z=(1.04, 1.00), gamma=1.03),
    dict(name="bedroom2", src=28.00, speed=0.70, cut=(15.00, 18.125), cx=(0.72, 0.38), z=(1.00, 1.04), gamma=1.03),
    dict(name="vanity",   src=35.70, speed=0.75, cut=(18.125, 21.25), cx=(0.66, 0.52), z=(1.00, 1.03), gamma=1.10, cool=True),
    dict(name="bath",     src=49.40, speed=0.60, cut=(21.25, 23.75), cx=(0.58, 0.56), z=(1.04, 1.00), gamma=1.04),
    # Closing: dining table at half speed, gentle pull-out, fade to black.
    dict(name="closing",  src=10.65, speed=0.50, cut=(23.75, END),    cx=(0.42, 0.40), z=(1.06, 1.00), gamma=1.05),
]

FORMATS = {
    "vertical":   dict(w=1080, h=1920, out="apartment-reel-9x16.mp4"),
    "horizontal": dict(w=1920, h=1080, out="apartment-film-16x9.mp4"),
}


def run(cmd):
    print("+", " ".join(cmd)[:200])
    subprocess.run(cmd, check=True)


def ff(*args):
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args])


# ---------------------------------------------------------------- stabilise

def stabilise():
    """Constant 60 fps master, then two-pass vid.stab with light smoothing and denoise."""
    cfr = os.path.join(WORK, "cfr60.mp4")
    trf = os.path.join(WORK, "transforms.trf")
    stab = os.path.join(WORK, "stab60.mp4")
    if os.path.exists(stab):
        return stab
    ff("-i", SRC, "-an", "-vf", "fps=60", "-c:v", "libx264", "-crf", "10", "-preset", "fast", cfr)
    ff("-i", cfr, "-vf", f"vidstabdetect=shakiness=6:accuracy=15:result={trf}", "-f", "null", "-")
    ff("-i", cfr, "-vf",
       f"vidstabtransform=input={trf}:smoothing=15:zoom=3:optzoom=0:interpol=bicubic,"
       "hqdn3d=1.5:1.5:5:5",
       "-c:v", "libx264", "-crf", "10", "-preset", "fast", stab)
    return stab


# ---------------------------------------------------------------- shots

def ease(a, b, dur):
    """ffmpeg expression: smoothstep from a to b over dur seconds of t."""
    p = f"min(max(t/{dur},0),1)"
    return f"({a}+({b}-{a})*({p})*({p})*(3-2*({p})))"


def shot_len(i):
    s = SHOTS[i]
    a, b = s["cut"]
    start = a - (XF / 2 if i > 0 else 0)
    end = b + (XF / 2 if i < len(SHOTS) - 1 else 0)
    return start, end - start


def render_shot(i, stab, fmt):
    s = SHOTS[i]
    W, H = FORMATS[fmt]["w"], FORMATS[fmt]["h"]
    _, dur = shot_len(i)
    src_dur = dur * s["speed"] + 0.05
    nframes = round(dur * FPS)
    # Work 10% larger than the output so zoom never upsamples past the crop.
    bw, bh = round(W * 1.1 / 2) * 2, round(H * 1.1 / 2) * 2
    if fmt == "vertical":
        sh = bh                                    # full source height
        sw = round(854 / 480 * sh / 2) * 2         # upscaled full frame, then pan-crop
        cx = ease(s["cx"][0], s["cx"][1], dur)
        frame = (f"scale={sw}:{sh}:flags=lanczos,"
                 f"crop={bw}:{bh}:x='max(0,min(iw-{bw},{cx}*iw-{bw}/2))':y=0")
    else:
        frame = f"scale={bw}:{bh}:flags=lanczos"
    z0, z1 = s["z"]
    zexpr = f"{z0}+({z1}-{z0})*on/{max(nframes - 1, 1)}"
    grade = (f"eq=gamma={s['gamma']}:contrast=1.05:saturation=1.08,"
             "curves=m='0/0 0.25/0.23 0.75/0.78 1/0.98'")
    if s.get("cool"):
        grade += ",colorbalance=rs=-0.03:bs=0.03:rm=-0.04:bm=0.03"
    vf = (f"trim=start={s['src']}:duration={src_dur},setpts=(PTS-STARTPTS)/{s['speed']},"
          f"fps={FPS},{grade},{frame},"
          f"zoompan=z='{zexpr}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={W}x{H}:fps={FPS},"
          f"cas=0.45,trim=end_frame={nframes},setpts=PTS-STARTPTS,format=yuv420p")
    out = os.path.join(WORK, f"{fmt}-{i:02d}-{s['name']}.mp4")
    ff("-i", stab, "-an", "-vf", vf, "-c:v", "libx264", "-crf", "12", "-preset", "medium", out)
    return out


def join_shots(files, fmt, logo):
    W, H = FORMATS[fmt]["w"], FORMATS[fmt]["h"]
    inputs, fc = [], []
    for f in files:
        inputs += ["-i", f]
    prev = "[0:v]"
    for i in range(1, len(files)):
        off = SHOTS[i]["cut"][0] - XF / 2
        fc.append(f"{prev}[{i}:v]xfade=transition=fade:duration={XF}:offset={off}[x{i}]")
        prev = f"[x{i}]"
    fc.append(f"{prev}fade=t=in:st=0:d=1.0,fade=t=out:st={END - 1.4}:d=1.4,"
              f"tpad=stop_mode=add:stop_duration={TAIL}:color=black,"
              f"vignette=angle=PI/9,noise=alls=1:allf=t,format=yuv420p[v]")
    last = "[v]"
    if logo:
        lw = round(W * (0.42 if fmt == "vertical" else 0.22))
        n = len(files)
        inputs += ["-loop", "1", "-i", logo]
        fc.append(f"[{n}:v]scale={lw}:-1,format=rgba,fade=t=in:st={END - 3.0}:d=1.0:alpha=1,"
                  f"fade=t=out:st={END + TAIL - 0.8}:d=0.8:alpha=1[lg]")
        fc.append(f"[v][lg]overlay=x=(W-w)/2:y=(H-h)/2:shortest=1,format=yuv420p[vl]")
        last = "[vl]"
    out = os.path.join(WORK, f"{fmt}-video.mp4")
    ff(*inputs, "-filter_complex", ";".join(fc), "-map", last, "-t", str(END + TAIL),
       "-c:v", "libx264", "-crf", "12", "-preset", "medium", out)
    return out


# ---------------------------------------------------------------- music

SR = 48000
CHORDS = {   # MIDI notes, lowest first
    "Dmaj9":  [50, 57, 61, 64, 66],
    "Bm9":    [47, 54, 57, 61, 62],
    "Gmaj7":  [43, 50, 54, 59, 62],
    "Asus4":  [45, 52, 57, 62, 64],
    "A":      [45, 52, 57, 61, 64],
    "Em9":    [40, 47, 55, 59, 66],
    "Gmaj7#11": [43, 50, 54, 59, 61],
}
PROGRESSION = ["Dmaj9", "Bm9", "Gmaj7", "Asus4", "Dmaj9", "Bm9", "Gmaj7", "A",
               "Em9", "Gmaj7#11", "Asus4", "Dmaj9", "Dmaj9"]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def music(path):
    total = END + TAIL
    n = int(total * SR)
    L, R = np.zeros(n), np.zeros(n)
    rng = np.random.default_rng(7)
    bar = BEAT * 4

    def add(sig, t0, gain=1.0, pan=0.0):
        i0 = int(t0 * SR)
        if i0 >= n:
            return
        sig = sig[: n - i0]
        L[i0:i0 + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
        R[i0:i0 + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))

    def env(length, a, r):
        t = np.arange(int(length * SR)) / SR
        e = np.minimum(1, t / a) * np.minimum(1, np.maximum(0, (length - t) / r))
        return t, e

    def pad(f, length):
        t, e = env(length, 0.9, 1.2)
        s = sum(np.sin(2 * np.pi * f * k * (1 + d) * t + k) / k ** 1.6
                for k in range(1, 7) for d in (-0.0015, 0.0015))
        return s * e * (0.85 + 0.15 * np.sin(2 * np.pi * 0.3 * t))

    def piano(f, length=2.2):
        t = np.arange(int(length * SR)) / SR
        s = sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (2.2 + k * 1.3)) / k ** 1.2
                for k in range(1, 6))
        return s * np.minimum(1, t / 0.004)

    def kick():
        t = np.arange(int(0.45 * SR)) / SR
        f = 48 + 70 * np.exp(-t * 28)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)

    def shaker():
        t = np.arange(int(0.06 * SR)) / SR
        w = rng.standard_normal(len(t))
        w = np.diff(np.concatenate([[0], w]))          # crude high-pass
        return w * np.exp(-t * 70)

    def swell(length):
        t = np.arange(int(length * SR)) / SR
        w = rng.standard_normal(len(t))
        k = np.exp(-np.linspace(4, 0.2, len(t)))
        w = np.convolve(w, np.ones(24) / 24, "same")   # soft low-pass
        return w * (t / length) ** 2.5 * k

    for b, name in enumerate(PROGRESSION):
        t0 = b * bar
        if t0 >= total:
            break
        notes = CHORDS[name]
        last = b >= 11
        length = (total - t0) if last else bar + 1.2
        for j, m in enumerate(notes):
            add(pad(hz(m), length), t0, 0.050, pan=(j - 2) * 0.25)
        add(np.sin(2 * np.pi * hz(notes[0] - 12) * np.arange(int(length * SR)) / SR)
            * env(length, 0.05, 0.6)[1], t0, 0.10 if 4 <= b < 10 else 0.05)
        # Felt-piano arpeggio: quarters to start, eighths from the build, sparse at the end.
        step = BEAT / 2 if 4 <= b < 9 else BEAT
        if last:
            step = bar
        upper = [m + 12 for m in notes[1:]]
        k = 0
        while k * step < bar - 1e-6 and t0 + k * step < total - 1.5:
            m = upper[(k * 3 + b) % len(upper)]
            vel = 0.85 + 0.15 * rng.random()
            add(piano(hz(m)), t0 + k * step, 0.11 * vel, pan=rng.uniform(-0.35, 0.35))
            k += 1
    # Final bell on the closing chord.
    for m, g in ((86, 0.05), (81, 0.035)):
        add(piano(hz(m), 5.0), 11 * bar, g)
    # Rhythm: from the 10 s cut to the 23.75 s cut.
    t = 10.0
    while t < 23.75 - 1e-6:
        beat_i = round((t - 10.0) / BEAT)
        if beat_i % 2 == 0:
            add(kick(), t, 0.32)
        for h in range(4):
            add(shaker(), t + h * BEAT / 4, 0.020 if h % 2 else 0.032, pan=0.3)
        t += BEAT
    add(swell(2.5), 10.0 - 2.5, 0.18)
    add(swell(2.5), 23.75 - 2.5, 0.14)

    # Reverb: stereo exponentially decaying noise, FFT convolution.
    ir_len = int(2.8 * SR)
    tt = np.arange(ir_len) / SR
    out = []
    for ch, seed in ((L, 1), (R, 2)):
        ir = np.random.default_rng(seed).standard_normal(ir_len) * np.exp(-tt * 2.6)
        ir = np.convolve(ir, np.ones(8) / 8, "same")
        ir /= np.sqrt(np.sum(ir ** 2))
        size = 1 << int(np.ceil(np.log2(n + ir_len)))
        wet = np.fft.irfft(np.fft.rfft(ch, size) * np.fft.rfft(ir, size), size)[:n]
        out.append(ch + 0.35 * wet)
    mix = np.stack(out, axis=1)
    fade = np.ones(n)
    fi = int(0.4 * SR)
    fade[:fi] = np.linspace(0, 1, fi)
    fo = int(2.5 * SR)
    fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
    mix *= fade[:, None]
    mix /= np.sqrt(np.mean(mix ** 2)) / 10 ** (-17 / 20)   # ~-17 dBFS RMS
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)                  # gentle soft clip
    pcm = (np.clip(mix, -0.98, 0.98) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return path


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--logo", help="PNG with transparency, shown over the final shot")
    ap.add_argument("--only", choices=list(FORMATS), help="render one format")
    args = ap.parse_args()
    os.makedirs(WORK, exist_ok=True)
    os.makedirs(DIST, exist_ok=True)

    stab = stabilise()
    wav = music(os.path.join(DIST, "apartment-music.wav"))
    for fmt in ([args.only] if args.only else FORMATS):
        files = [render_shot(i, stab, fmt) for i in range(len(SHOTS))]
        video = join_shots(files, fmt, args.logo)
        out = os.path.join(DIST, FORMATS[fmt]["out"])
        ff("-i", video, "-i", wav, "-map", "0:v", "-map", "1:a",
           "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high",
           "-pix_fmt", "yuv420p", "-r", str(FPS),
           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
           "-c:a", "aac", "-b:a", "256k", "-ar", str(SR), "-shortest",
           "-movflags", "+faststart", out)
        print("wrote", out)


if __name__ == "__main__":
    main()
