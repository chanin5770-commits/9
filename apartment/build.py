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
BPM = 120
BEAT = 60 / BPM          # 0.5 s; every cut sits on a beat
BAR = BEAT * 4
END = 27.0               # last picture frame (fade to black ends here)
TAIL = 0.5               # black + music ring-out after the picture
PUNCH = 0.05             # quick zoom "punch" that settles after each cut

# Each shot: source in-point (s), speed (<1 = slow motion from the 60 fps source),
# output cut-in / cut-out (s on the final timeline), horizontal crop centre for 9:16
# as a fraction of the source width (start -> end), zoom (start -> end), gamma,
# an optional cool shift for warm light, and the transition INTO the shot
# (an ffmpeg xfade type and its length, centred on the cut).
SHOTS = [
    # Opening: living room, the sofa settling into frame, slow push-in.
    dict(name="living",   src=2.60,  speed=0.70, cut=(0.0,  6.0),  cx=(0.45, 0.40), z=(1.00, 1.06), gamma=1.12),
    # Dining corner: flowers, mirror, framed painting.
    dict(name="dining",   src=7.70,  speed=0.75, cut=(6.0,  9.0),  cx=(0.36, 0.40), z=(1.04, 1.00), gamma=1.04, tr="smoothleft", xf=0.4),
    dict(name="kitchen",  src=14.35, speed=0.75, cut=(9.0,  11.0), cx=(0.62, 0.58), z=(1.00, 1.04), gamma=1.04, tr="zoomin", xf=0.4),
    dict(name="bedroom1", src=24.00, speed=0.75, cut=(11.0, 13.0), cx=(0.45, 0.42), z=(1.04, 1.00), gamma=1.03, tr="hblur", xf=0.35),
    dict(name="bedroom2", src=28.00, speed=0.70, cut=(13.0, 16.0), cx=(0.72, 0.38), z=(1.00, 1.04), gamma=1.03, tr="smoothup", xf=0.4),
    dict(name="vanity",   src=35.70, speed=0.75, cut=(16.0, 19.0), cx=(0.66, 0.52), z=(1.00, 1.03), gamma=1.10, cool=True, tr="fadewhite", xf=0.5),
    dict(name="bath",     src=49.40, speed=0.70, cut=(19.0, 21.0), cx=(0.58, 0.56), z=(1.04, 1.00), gamma=1.04, tr="smoothright", xf=0.4),
    # Closing: dining table at half speed, gentle pull-out, fade to black.
    dict(name="closing",  src=10.65, speed=0.50, cut=(21.0, END),  cx=(0.42, 0.40), z=(1.06, 1.00), gamma=1.05, tr="dissolve", xf=0.8),
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
    a, b = SHOTS[i]["cut"]
    start = a - (SHOTS[i]["xf"] / 2 if i > 0 else 0)
    end = b + (SHOTS[i + 1]["xf"] / 2 if i < len(SHOTS) - 1 else 0)
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
    if i > 0:   # punch-in on the beat, settling within ~0.3 s after the transition
        lead = round(SHOTS[i]["xf"] / 2 * FPS)
        zexpr += f"+{PUNCH}*exp(-max(on-{lead},0)/4)*gte(on,{lead})"
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
        sh = SHOTS[i]
        off = sh["cut"][0] - sh["xf"] / 2
        fc.append(f"{prev}[{i}:v]xfade=transition={sh['tr']}:duration={sh['xf']}:offset={off}[x{i}]")
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
    "Bm9":   [47, 54, 57, 61, 62],
    "Gmaj7": [43, 50, 54, 59, 62],
    "Dmaj9": [50, 57, 61, 64, 66],
    "A":     [45, 52, 57, 61, 64],
    "Asus4": [45, 52, 57, 62, 64],
    "Em9":   [40, 47, 55, 59, 66],
}
# One chord per bar (2 s at 120 BPM).
PROGRESSION = ["Bm9", "Gmaj7", "Dmaj9", "A", "Bm9", "Gmaj7", "Dmaj9", "A",
               "Em9", "Gmaj7", "Asus4", "Dmaj9", "Dmaj9", "Dmaj9", "Dmaj9"]
DROP = 2.0               # full groove from here...
BREAK = (20.0, 21.0)     # ...a one-bar-ish breakdown into the closing shot...
OUTRO = 25.0             # ...and drums out for the final chord


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def music(path):
    total = END + TAIL
    n = int(total * SR)
    L, R = np.zeros(n), np.zeros(n)
    rng = np.random.default_rng(7)
    T = np.arange(n) / SR

    def add(sig, t0, gain=1.0, pan=0.0, bus=None):
        i0 = int(round(t0 * SR))
        if i0 >= n or i0 + len(sig) <= 0:
            return
        if i0 < 0:
            sig, i0 = sig[-i0:], 0
        sig = sig[: n - i0]
        l, r = (L, R) if bus is None else bus
        l[i0:i0 + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
        r[i0:i0 + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))

    def ts(length):
        return np.arange(int(length * SR)) / SR

    def lowpass(x, k):
        return np.convolve(x, np.ones(k) / k, "same")

    def pad(f, length):
        t = ts(length)
        e = np.minimum(1, t / 0.15) * np.minimum(1, np.maximum(0, (length - t) / 0.4))
        s = sum(np.sin(2 * np.pi * f * k * (1 + d) * t + k) / k ** 1.5
                for k in range(1, 8) for d in (-0.002, 0.002))
        return s * e

    def pluck(f, length=0.4):
        t = ts(length)
        s = sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (9 + 5 * k)) / k for k in range(1, 6))
        return s * np.minimum(1, t / 0.002)

    def bass(f, length):
        t = ts(length)
        s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
        return np.tanh(1.6 * s) * np.minimum(1, t / 0.005) * np.exp(-t * 3.5)

    def kick():
        t = ts(0.38)
        f = 46 + 120 * np.exp(-t * 35)
        click = rng.standard_normal(len(t)) * np.exp(-t * 400) * 0.25
        return np.tanh(1.5 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8)) + click

    def clap():
        t = ts(0.25)
        w = np.diff(np.concatenate([[0], rng.standard_normal(len(t))]))
        e = sum(np.exp(-np.maximum(t - d, 0) * 60) * (t >= d) for d in (0, 0.011, 0.022))
        return lowpass(w, 3) * (e + 0.4 * np.exp(-t * 12))

    def hat(open_=False):
        t = ts(0.22 if open_ else 0.05)
        w = np.diff(np.concatenate([[0], np.diff(np.concatenate([[0], rng.standard_normal(len(t))]))]))
        return w * np.exp(-t * (14 if open_ else 90))

    def whoosh(length=0.6):
        # Noise swept through a moving low-pass, swelling into the cut.
        t = ts(length)
        w = rng.standard_normal(len(t))
        out = np.zeros_like(w)
        for j, k in enumerate((40, 20, 10, 5, 3)):
            seg = slice(j * len(t) // 5, (j + 1) * len(t) // 5)
            out[seg] = lowpass(w, k)[seg]
        return out * (t / length) ** 2 * np.minimum(1, (length - t) / 0.03)

    def impact():
        t = ts(2.0)
        boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 10)) / SR) * np.exp(-t * 2.2)
        noise = lowpass(rng.standard_normal(len(t)), 6) * np.exp(-t * 5)
        return np.tanh(1.3 * boom) + 0.35 * noise

    def riser(length):
        t = ts(length)
        f = 200 * 2 ** (3 * t / length)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3 + lowpass(rng.standard_normal(len(t)), 4)
        return s * (t / length) ** 2

    drums = (np.zeros(n), np.zeros(n))
    music_bus = (np.zeros(n), np.zeros(n))
    kicks = []
    for b, name in enumerate(PROGRESSION):
        t0 = b * BAR
        if t0 >= total:
            break
        notes = CHORDS[name]
        final = t0 >= OUTRO - 1e-6
        length = (total - t0) if final else BAR + 0.05
        for j, m in enumerate(notes):
            add(pad(hz(m), length), t0, 0.028, pan=(j - 2) * 0.3, bus=music_bus)
        groove = DROP <= t0 < OUTRO
        for k in range(16):                                   # 16th-note grid
            t = t0 + k * BEAT / 4
            if t >= total - 0.3 or (final and k):
                break
            in_break = BREAK[0] <= t < BREAK[1]
            upper = [m + 12 for m in notes[1:]]
            if t >= DROP or k % 2 == 0:                       # arp: 8ths in the intro
                m = upper[(k * 3 + k // 4) % len(upper)] + (12 if k % 8 == 6 else 0)
                add(pluck(hz(m)), t, 0.07 * (1.0 if k % 4 == 0 else 0.75),
                    pan=0.4 * np.sin(k), bus=music_bus)
            if not groove or in_break:
                continue
            if k % 4 == 0:
                add(kick(), t, 0.55, bus=drums)
                kicks.append(t)
            if k % 8 == 4:
                add(clap(), t, 0.16, pan=0.05, bus=drums)
            if k % 4 == 2:
                add(hat(True), t, 0.05, pan=0.25, bus=drums)
                add(bass(hz(notes[0] - 12), BEAT / 2), t, 0.30, bus=music_bus)
            elif k % 2 == 0:
                add(bass(hz(notes[0] - 12), BEAT / 2), t, 0.22, bus=music_bus)
            add(hat(), t, 0.030 if k % 2 else 0.045, pan=-0.25, bus=drums)
    # Final chord: low root and a bell.
    tail = ts(total - OUTRO)
    add(np.sin(2 * np.pi * hz(38) * tail) * np.exp(-tail * 0.8), OUTRO, 0.25, bus=music_bus)
    for m, g in ((86, 0.06), (81, 0.04), (74, 0.04)):
        add(pluck(hz(m), 3.0), OUTRO, g * 2, bus=music_bus)

    # Sidechain pump on everything melodic, keyed by the kicks.
    pump = np.ones(n)
    for k in kicks:
        i0 = int(k * SR)
        seg = ts(BEAT)
        j1 = min(n, i0 + len(seg))
        pump[i0:j1] = np.minimum(pump[i0:j1], 1 - 0.55 * np.exp(-seg[: j1 - i0] * 9))
    L += music_bus[0] * pump + drums[0]
    R += music_bus[1] * pump + drums[1]

    # Transition FX: a whoosh into every cut, impacts on the drop and the closing shot.
    for s in SHOTS[1:]:
        c = s["cut"][0]
        add(whoosh(0.55), c - 0.55, 0.10, pan=0.4 if s["tr"].endswith("left") else -0.4)
    add(riser(DROP), 0, 0.06)
    add(riser(BREAK[1] - BREAK[0]), BREAK[0], 0.08)
    add(impact(), DROP, 0.30)
    add(impact(), BREAK[1], 0.34)

    # Short room reverb on the whole mix (kept low so the beat stays tight).
    ir_len = int(1.4 * SR)
    tt = ts(1.4)
    out = []
    for ch, seed in ((L, 1), (R, 2)):
        ir = np.random.default_rng(seed).standard_normal(ir_len) * np.exp(-tt * 4.5)
        ir = lowpass(ir, 8)
        ir /= np.sqrt(np.sum(ir ** 2))
        size = 1 << int(np.ceil(np.log2(n + ir_len)))
        wet = np.fft.irfft(np.fft.rfft(ch, size) * np.fft.rfft(ir, size), size)[:n]
        out.append(ch + 0.18 * wet)
    mix = np.stack(out, axis=1)
    fade = np.ones(n)
    fo = int(2.0 * SR)
    fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
    mix *= fade[:, None]
    mix /= np.sqrt(np.mean(mix ** 2)) / 10 ** (-15 / 20)   # ~-15 dBFS RMS
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)                  # glue / soft limit
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
