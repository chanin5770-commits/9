#!/usr/bin/env python3
"""ChaniLi_Alphabet_Teaser_15s: a 15-second teaser cut from the commercial's footage (9:16).

  python3 tools/render_teaser_15s.py               # -> dist/ChaniLi_Alphabet_Teaser_15s.mp4
  python3 tools/render_teaser_15s.py --stills 1,5,9,13

No narration. Picture: the same supplied clips the 80-second commercial was cut from (taken clean,
without the commercial's titles). Music: the instrumental Hasidic niggun that opens "מלכת האותיות"
(14.84 -> 26.33 s, no sung words), a magical shimmer at the start, a rise, and a final hit into the
end card. Every cut is a downbeat of the song.
"""
import argparse, math, os, subprocess
import numpy as np, cv2
from scipy.signal import butter, lfilter, fftconvolve

import render_clip as RC
import render_teaser as RT
import render_summary as RS
import render_teaser_v2 as V2
import render_commercial as RCOM

ROOT = RC.ROOT
W, H, FPS, DUR, SR = 1080, 1920, 24, 15.0, 48000
SONG_AT = 14.84
BAR = [round(b - SONG_AT, 3) for b in (14.84, 16.49, 18.13, 19.76, 21.41, 23.06, 24.68, 26.33)]   # 0 .. 11.49
T_CARD = BAR[7]
K = "king/"
ease = RT.ease

# (start, clip, src_in, speed, (z0, z1), (cx0, cy0), (cx1, cy1)); each runs to the next start
SHOTS = [
    (BAR[0], "magic-books",          5.6, 1.0, (1.0, 1.12), (.6, .5), (.62, .46)),     # the magic book opens in light
    (BAR[1], "great-book",           2.0, 1.0, (1.06, 1.16), (.5, .42), (.53, .38)),   # golden letters burst out
    (BAR[2], "world-in-book",        0.6, 1.0, (1.0, 1.18), (.45, .55), (.6, .52)),    # a world rises from the page
    (BAR[3], K + "king-flying-pages", 1.4, 1.0, (1.0, 1.08), (.42, .5), (.45, .48)),   # letters and pages in the light
    (BAR[4], K + "king-first-letter", 5.4, 1.0, (1.1, 1.16), (.36, .42), (.37, .42)),  # glimpse: the King of Letters
    (BAR[5], "finale-circle",        3.2, 1.0, (1.06, 1.12), (.48, .5), (.48, .48)),   # glimpse: the Queen of Letters
    (BAR[6], K + "king-cloud-castle", 4.0, 1.0, (1.0, 1.08), (.45, .5), (.47, .46)),   # the kingdom's gate, the king walking to it
]


def shot_frame(i, t):
    s = SHOTS[i]; t_end = SHOTS[i + 1][0] if i + 1 < len(SHOTS) else T_CARD
    return RCOM.shot_img(s, t, t_end)


CACHE = {}
def card(tl):
    f = V2.card_bg().copy()
    if "lines" not in CACHE:
        CACHE["lines"] = [RS.text_sprite(s, RS.FR, size, "Black", RS.BURG, edge="gold")
                          for s, size in (("22 אותיות.", 132), ("שנה שלמה.", 132), ("אינסוף חוויות חסידיות!", 96))]
        CACHE["sub"] = RS.text_sprite("הצצה ראשונה — רק כאן!", RS.FR, 76, "Bold", (34, 98, 160), edge="gold")
        lg = RS.load("logo-chanili.png"); s = 420 / lg.shape[1]
        CACHE["logo"] = cv2.resize(lg, (420, int(lg.shape[0] * s)), interpolation=cv2.INTER_AREA)
    beat = (BAR[1] - BAR[0]) / 4
    for i, (spr, y) in enumerate(zip(CACHE["lines"], (560, 720, 880))):
        k = ease((tl - .15 - i * 2 * beat) / .5)
        if k > 0: RS.paste(f, V2.blur_in(spr, k), W / 2, y + (1 - k) * 22, alpha=k)
    sub = CACHE["sub"]; sx = (tl - 2.1) / .8
    if 0 < sx < 1.3:                    # one light sweep across the line, on the letters only
        h, w = sub.shape[:2]; xx = np.arange(w, dtype=np.float32)[None, :]; yy = np.arange(h, dtype=np.float32)[:, None]
        band = np.exp(-((((w - xx) + yy * .4) - sx * (w + h * .4)) / (w * .08)) ** 2)
        sub = sub.copy(); sub[..., :3] = np.clip(sub[..., :3] + band[..., None] * 150 * (sub[..., 3:4] / 255), 0, 255)
    k = ease((tl - 1.65) / .55); RS.paste(f, V2.blur_in(sub, k), W / 2, 1060 + (1 - k) * 14, alpha=k)
    k = ease((tl - 2.0) / .6); RS.paste(f, CACHE["logo"], W / 2, 1360, alpha=k)
    return f


def frame_at(t):
    glow = 0.0
    if t < T_CARD:
        i = max(k for k, s in enumerate(SHOTS) if s[0] <= t)
        f = shot_frame(i, t)
        if i > 0 and t - SHOTS[i][0] < .5: glow = .3 * math.exp(-(t - SHOTS[i][0]) / .16)   # light accent on every cut
        if t > T_CARD - .35:            # light swells into the final hit
            glow = max(glow, ease((t - (T_CARD - .35)) / .35) * .75)
        f = V2.grade(f); f = V2.streak(f, .25)
        f = f * (1 - .45 * glow) + np.array([170, 215, 245], np.float32) * .45 * glow + f * .3 * glow
        f = RS.finish(f, t, 0, spark=.2)
        f = V2.vignette(f, .3)
    else:
        tl = t - T_CARD
        if tl < .45:                    # the white-gold flash resolves into the card
            a = ease(tl / .45)
            last = V2.grade(shot_frame(len(SHOTS) - 1, T_CARD - 1e-3))
            flash = np.array([200, 232, 250], np.float32)
            f = (last * .25 + flash * .75) * (1 - a) + card(tl) * a
        else:
            f = card(tl)
        f = V2.vignette(f, .1)
    return np.clip(V2.grain(f, t), 0, 255).astype(np.uint8)


def build_audio(path):
    n = int(DUR * SR); y = np.zeros((n, 2))
    def add(sig, at, gain=1.0, pan=0.0):
        i = int(at * SR); s = sig[:max(0, n - i)] * gain
        y[i:i + len(s), 0] += s * (1 - max(pan, 0)); y[i:i + len(s), 1] += s * (1 + min(pan, 0))
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{SONG_AT}", "-t", f"{T_CARD + .02}", "-i", RC.SONG,
                          "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    song = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
    song[:int(.03 * SR)] *= np.linspace(0, 1, int(.03 * SR))[:, None]
    song[-int(.03 * SR):] *= np.linspace(1, 0, int(.03 * SR))[:, None]
    y[:len(song)] += song[:n]
    # magical shimmer on the first frame
    for i, f0 in enumerate((1174.7, 1396.9, 1760.0, 2349.3)):
        add(RT.bell(f0, 2.4, SR), .02 + i * .07, .05, pan=(-.3, .3)[i % 2])
    add(V2.riser(1.5), T_CARD - 1.52, .22)                      # the rise into the peak
    add(V2.impact(2.8, 1.4, 5), T_CARD, .55)                    # the peak
    # the last moment of the niggun rings out under the card
    ir_t = np.arange(int(3.2 * SR)) / SR; r = np.random.default_rng(3)
    ir = r.standard_normal((len(ir_t), 2)) * np.exp(-ir_t / .9)[:, None]
    tail = song[-int(.35 * SR):]
    wet = np.stack([fftconvolve(tail[:, c], ir[:, c]) for c in range(2)], 1); wet /= np.abs(wet).max()
    b, a = butter(2, 1800 / (SR / 2)); wet = lfilter(b, a, wet, axis=0)
    j = int((T_CARD - .3) * SR); m = min(len(wet), n - j); y[j:j + m] += wet[:m] * .2
    t2 = np.arange(n - int(T_CARD * SR)) / SR
    pad = sum(np.sin(2 * np.pi * f0 * t2 * (1 + dt)) for f0, dt in ((146.83, 0), (220, .001), (293.66, -.001), (329.63, .0015), (440, 0)))
    pad *= np.minimum(t2 / .4, 1) * np.exp(-t2 / 3.2) * .08
    b, a = butter(2, 2200 / (SR / 2)); add(lfilter(b, a, pad), T_CARD)
    add(RT.bell(880, 3.0, SR) + .5 * RT.bell(1318.5, 3.0, SR), T_CARD + 1.65, .13)   # on "הצצה ראשונה"
    y[-int(.35 * SR):] *= np.linspace(1, 0, int(.35 * SR))[:, None] ** 1.5
    y = np.tanh(y / .8) * .8; y *= .89 / np.abs(y).max()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-", path],
                   input=y.astype(np.float32).tobytes(), check=True)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--stills", default="")
    ap.add_argument("--out", default=os.path.join(ROOT, "dist", "ChaniLi_Alphabet_Teaser_15s.mp4"))
    a = ap.parse_args()
    RCOM.CLIPS = RCOM.Clips(); RS.CLIPS = RCOM.CLIPS
    if a.stills:
        d = os.path.join(ROOT, ".cache", "teaser15-stills"); os.makedirs(d, exist_ok=True)
        for ts in a.stills.split(","):
            p = os.path.join(d, f"{float(ts):05.2f}.jpg"); cv2.imwrite(p, frame_at(float(ts))); print(p)
        return
    wav = os.path.join(ROOT, ".cache", "teaser15.wav"); build_audio(wav)
    out = subprocess.run(["ffmpeg", "-i", wav, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    gain = -14 - float(out.rsplit("I:", 1)[1].split("LUFS")[0])
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-map", "0:v", "-map", "1:a",
           "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-maxrate", "9M", "-bufsize", "18M", "-tune", "film",
           "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
           "-af", f"volume={gain:.2f}dB,alimiter=limit=0.84:level=disabled",
           "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-shortest", "-movflags", "+faststart", a.out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for k in range(int(DUR * FPS)):
        p.stdin.write(frame_at(k / FPS).tobytes())
    p.stdin.close(); p.wait(); print("wrote", a.out)


if __name__ == "__main__":
    main()
