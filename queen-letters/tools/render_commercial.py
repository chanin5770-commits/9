#!/usr/bin/env python3
"""פרסומת ״מלך ומלכת האותיות״: עריכה מהקליפים המקוריים על הקריינות (80 שניות, 9:16).

  python3 tools/render_commercial.py                    # -> dist/commercial-80s-9x16.mp4
  python3 tools/render_commercial.py --stills 3,9,22    # preview frames

Picture: only the 16 supplied clips (footage/ and footage/king/), muted. Sound: the supplied narration
(assets/commercial-narration.mp3), untouched. Sentence times come from a Whisper transcription of
the narration (tools/whisper_onnx.py); cuts are snapped to the music's beats. Titles are exactly the
requested copy.
"""
import argparse, math, os, subprocess
import numpy as np, cv2, librosa

import render_clip as RC
import render_teaser as RT
import render_summary as RS

ROOT = RC.ROOT
W, H, FPS = 1080, 1920, 24
NARR = os.path.join(ROOT, "assets", "commercial-narration.mp3")
DUR = 80.0
ease = RT.ease
K = "king/"

# sentence starts (s), from the transcription
S = dict(dear=0.0, ready=1.92, meet=8.48, kit=12.04, inside=19.24, three=21.34, tracks=23.78, books=27.06,
         games=28.9, every=33.56, best=37.56, site=41.16, find=44.54, nohunt=48.36, pick=52.62, because=56.74,
         world=60.26, name=62.7, house=65.52, ideas=68.34, why=71.36, bring=75.6)

_BEATS = None
def beat(t, tol=.2):
    """snap a time to the nearest music beat if one is close."""
    global _BEATS
    if _BEATS is None:
        y, sr = librosa.load(NARR, sr=22050)
        _BEATS = np.array(librosa.beat.beat_track(y=y, sr=sr, units="time")[1])
    i = np.argmin(np.abs(_BEATS - t))
    return float(_BEATS[i]) if abs(_BEATS[i] - t) <= tol else t


# --- shots -----------------------------------------------------------------------------------------
# (start, clip, src_in, speed, (z0, z1), (cx0, cy0), (cx1, cy1)); a shot runs until the next one starts.
# "split:<clipA>|<clipB>" puts two clips one above the other (the boys' and the girls' worlds together).
def shots():
    b = beat
    return [
        (0.0,              K + "king-book-light",   5.6, .85, (1.0, 1.10), (.55, .5), (.55, .46)),   # light: something opens
        (b(S["ready"]),    K + "king-first-letter", 1.0, 1.0, (1.0, 1.06), (.36, .45), (.37, .45)),
        (b(4.85),          "letter-dance",          0.2, 1.0, (1.0, 1.05), (.44, .5), (.46, .5)),       # "won't want to stop"
        (b(S["meet"]),     K + "king-first-letter", 5.4, 1.0, (1.08, 1.14), (.36, .42), (.37, .42)),  # meet the king...
        (b(10.3),          "finale-circle",         0.0, 1.0, (1.06, 1.0), (.5, .5), (.5, .5)),        # ...and the queen
        (b(S["kit"]),      "magic-books",           0.0, 1.0, (1.12, 1.04), (.42, .5), (.45, .5)),
        (b(14.5),          K + "king-flying-pages", 1.4, 1.0, (1.0, 1.08), (.42, .5), (.44, .5)),
        (b(16.9),          "great-book",            0.4, 1.0, (1.0, 1.08), (.45, .45), (.5, .42)),
        (b(S["inside"]),   K + "king-golden-door",  6.0, .9, (1.0, 1.14), (.5, .5), (.52, .44)),      # what's inside? the door
        (b(S["three"]),    "palace-gate",           6.9, .55, (1.0, 1.12), (.52, .5), (.52, .46)),     # match cut: into the light
        (b(S["tracks"]),   K + "king-library-light", 2.6, 1.0, (1.0, 1.06), (.46, .48), (.45, .46)),  # לבנים
        (b(24.6),          "letter-stairs",         0.4, 1.0, (1.04, 1.0), (.38, .5), (.40, .5)),      # לבנות
        (b(25.35),         "split:" + K + "king-cloud-castle|golden-bridge", 3.6, 1.0, (1.0, 1.04), (.5, .5), (.5, .5)),  # מסלול משותף
        (b(S["books"]),    K + "king-great-book",   2.0, 1.0, (1.0, 1.06), (.47, .5), (.5, .48)),
        (b(S["games"]),    "letter-stairs",         4.8, 1.0, (1.1, 1.04), (.45, .5), (.45, .45)),     # משחקים
        (b(29.85),         "world-in-book",         1.0, 1.0, (1.0, 1.06), (.4, .5), (.45, .5)),       # כרטיסיות
        (b(30.75),         "finale-circle",         3.2, 1.0, (1.1, 1.14), (.48, .5), (.48, .5)),      # פעילויות
        (b(31.6),          K + "king-letter-hall",  5.2, 1.0, (1.0, 1.06), (.4, .45), (.4, .42)),      # שירים
        (b(32.5),          "letter-dance",          4.0, 1.0, (1.05, 1.1), (.46, .5), (.47, .5)),      # וקליפים
        (b(S["every"]),    "great-book",            2.6, .85, (1.12, 1.24), (.52, .40), (.55, .38)),   # each letter, its own content
        (b(S["best"]),     K + "king-cloud-castle", 4.0, 1.0, (1.0, 1.08), (.5, .5), (.52, .46)),     # all in one place
        (b(S["site"]),     K + "king-library-light", 5.0, .9, (1.04, 1.0), (.5, .45), (.48, .45)),
        (b(S["find"]),     "magic-books",           3.6, .95, (1.0, 1.1), (.5, .48), (.56, .46)),
        (b(S["nohunt"]),   "letter-stairs",         1.6, 1.0, (1.06, 1.0), (.42, .5), (.45, .48)),
        (b(50.5),          "world-in-book",         4.6, 1.0, (1.0, 1.06), (.5, .5), (.5, .5)),
        (b(S["pick"]),     K + "king-great-book",   4.0, 1.0, (1.06, 1.12), (.3, .5), (.33, .5)),      # בוחרת
        (b(53.9),          "magic-books",           5.6, .9, (1.0, 1.12), (.6, .5), (.62, .46)),       # פותחת: the book opens in light
        (b(55.0),          "letter-dance",          5.6, 1.0, (1.0, 1.06), (.48, .5), (.48, .48)),     # ומתחילה ליהנות
        (b(S["because"]),  K + "king-book-light",   2.4, .9, (1.0, 1.08), (.4, .5), (.42, .5)),
        (b(58.6),          "world-in-book",         0.0, .8, (1.0, 1.22), (.42, .55), (.62, .52)),     # a letter becomes a whole world
        (b(S["name"]),     K + "king-letter-hall",  6.0, 1.0, (1.0, 1.06), (.4, .45), (.42, .44)),
        (b(64.1),          "finale-circle",         4.4, 1.0, (1.04, 1.0), (.48, .5), (.5, .5)),
        (b(S["house"]),    "golden-bridge",         5.4, .9, (1.0, 1.08), (.58, .46), (.6, .44)),      # ChaniLi Studio (logo over it)
        (b(S["ideas"]),    K + "king-flying-pages", 5.0, 1.0, (1.0, 1.06), (.4, .5), (.42, .48)),
        (b(69.9),          "great-book",            5.0, 1.0, (1.0, 1.06), (.5, .48), (.52, .46)),
        (b(S["why"]),      "palace-gate",           0.0, .85, (1.12, 1.22), (.70, .45), (.66, .40)),   # the gate...
        (b(73.0),          K + "king-golden-door",  6.6, .75, (1.0, 1.15), (.5, .5), (.5, .44)),      # ...opens
        (b(S["bring"]),    K + "king-cloud-castle", 5.6, 1.0, (1.0, 1.06), (.5, .5), (.5, .48)),     # bring it to your kindergarten
        (b(77.0),          "finale-circle",         6.0, 1.0, (1.0, 1.06), (.5, .5), (.5, .48)),       # the queen waves
        (b(78.4),          "card", 0, 1, (1, 1), (.5, .5), (.5, .5)),
    ]

# titles: (text lines, start, end, y)
TITLES = [
    (["מלך ומלכת האותיות"], S["meet"] + .2, S["kit"] - .1, 380),
    (["ערכה חסידית שהיא חוויה!"], S["kit"] + .6, S["inside"] - .2, 380),
    (["3 מסלולי למידה"], S["three"] + .1, S["books"] - .2, 380),
    (["חוברות • משחקים • שירים • קליפים"], S["books"] + .1, S["every"] - .15, 380),
    (["כל מה שצריך במקום אחד"], S["best"] + 1.4, S["find"] + 1.6, 380),
    (["22 אותיות.", "שנה שלמה.", "אינסוף חוויות חסידיות!"], S["ideas"] + .1, S["bring"] - .2, 420),
]


class Clips(RC.Clips):
    """colour-match the King of Letters clips to the same shared target as the queen's."""
    def __init__(self):
        super().__init__()
        def mean_lab(path):
            cap = cv2.VideoCapture(path); fr = []; i = 0
            while True:
                ok, f = cap.read()
                if not ok: break
                if i % 8 == 0: fr.append(f)
                i += 1
            return cv2.cvtColor(np.concatenate(fr, 0), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32).mean(0)
        q = [mean_lab(os.path.join(RC.FOOT, f"{n}.mp4")) for n in self.shift]
        target = np.mean(q, 0)
        for f in sorted(os.listdir(os.path.join(RC.FOOT, "king"))):
            n = K + f[:-4]; self.shift[n] = (target - mean_lab(os.path.join(RC.FOOT, "king", f))) * .5
        os.makedirs(os.path.join(RC.CACHE, "king"), exist_ok=True)


CLIPS = None
def view(name, src_t, ow, oh, z, cx, cy):
    """crop a clip at src_t to an ow x oh box (any aspect), zoom z >= 1, centre (cx, cy) in 0..1."""
    fr, need = CLIPS.get(name)
    idx = min(max(int(round(src_t * RC.INTERP)), 0), len(fr) - 1)
    asp = ow / oh
    ch = min(RC.SRC_H, RC.SRC_W / asp) / max(z, need[idx] * 1.005); cw = ch * asp
    x0 = min(max(cx * RC.SRC_W - cw / 2, 0), RC.SRC_W - cw); y0 = min(max(cy * RC.SRC_H - ch / 2, 0), RC.SRC_H - ch)
    s = oh / ch
    img = cv2.warpAffine(fr[idx], np.float32([[s, 0, -x0 * s], [0, s, -y0 * s]]), (ow, oh), flags=cv2.INTER_LANCZOS4,
                         borderMode=cv2.BORDER_REFLECT)
    bl = cv2.GaussianBlur(img, (0, 0), 2.6)
    return cv2.addWeighted(img, 1.55, bl, -.55, 0).astype(np.float32)


def shot_img(sh, t, t_end):
    start, name, a, speed, (z0, z1), c0, c1 = sh
    p = ease((t - start) / max(t_end - start, .01))
    z = z0 + (z1 - z0) * p; cx = c0[0] + (c1[0] - c0[0]) * p; cy = c0[1] + (c1[1] - c0[1]) * p
    st = a + (t - start) * speed
    if name == "card": return card(t - start)
    if name.startswith("split:"):
        top, bot = name[6:].split("|")
        f = np.zeros((H, W, 3), np.float32)
        f[:H // 2 - 4] = view(top, st, W, H // 2 - 4, z, .48, .5)
        f[H // 2 + 4:] = view(bot, st + 1.8, W, H // 2 - 4, z, .5, .5)
        f[H // 2 - 4:H // 2 + 4] = np.array([110, 190, 230], np.float32)          # a fine gold seam
        return f
    return view(name, st, W, H, z, cx, cy)


# --- titles, logo, end card ---------------------------------------------------------------------------
CACHE = {}
def title_sprites(lines):
    key = tuple(lines)
    if key not in CACHE:
        CACHE[key] = [RS.plate(RS.text_sprite(s, RS.FR, 104 if len(s) < 14 else 88 if len(s) < 24 else 66, "Black", RS.BURG, edge="gold"), 42)
                      for s in lines]
    return CACHE[key]

def draw_titles(f, t):
    for lines, t0, t1, y in TITLES:
        if not (t0 - .05 <= t <= t1 + .05): continue
        sprs = title_sprites(lines)
        for i, spr in enumerate(sprs):
            k_in = ease((t - t0 - i * .25) / .45); k_out = ease((t - (t1 - .35)) / .35)
            a = k_in * (1 - k_out)
            if a <= 0: continue
            s = RT_blur(spr, k_in)
            RS.paste(f, s, W / 2, y + i * 150 + (1 - k_in) * 20 - k_out * 10, alpha=a)

def RT_blur(spr, k):
    sgm = (1 - k) * 7
    return cv2.GaussianBlur(spr, (0, 0), sgm) if sgm > .3 else spr

def logo_sprite(w):
    key = ("logo", w)
    if key not in CACHE:
        lg = RS.load("logo-chanili.png"); CACHE[key] = cv2.resize(lg, (w, int(lg.shape[0] * w / lg.shape[1])), interpolation=cv2.INTER_AREA)
    return CACHE[key]

def card(tl):
    if RT.CARD is None: RT.card(0)
    f = RT.CARD["bg"].copy()
    o = RT.CARD["orn"]; a = o[..., 3:4] / 255 * ease(tl / .6); f = f * (1 - a) + o[..., :3] * a
    if "end_title" not in CACHE:
        CACHE["end_title"] = RS.text_sprite("מלך ומלכת האותיות", RS.FR, 112, "Black", RS.BURG, edge="gold")
    k = ease((tl - .1) / .5); RS.paste(f, CACHE["end_title"], W / 2, 640 + (1 - k) * 16, alpha=k)
    k = ease((tl - .5) / .6); RS.paste(f, logo_sprite(860), W / 2, 1150 + (1 - k) * 16, alpha=k)
    return f


# --- timeline ---------------------------------------------------------------------------------------------
SHOTS = None
def frame_at(t):
    i = max(k for k, s in enumerate(SHOTS) if s[0] <= t)
    sh = SHOTS[i]; t_end = SHOTS[i + 1][0] if i + 1 < len(SHOTS) else DUR
    f = shot_img(sh, t, t_end)
    glow = 0.0
    # soft golden dissolves at the big section changes, clean cuts elsewhere
    dissolve_at = {beat(S[k]) for k in ("kit", "inside", "because", "house")}
    if i + 1 < len(SHOTS):
        n0 = SHOTS[i + 1][0]
        if (n0 in dissolve_at or SHOTS[i + 1][1] == "card") and t > n0 - .3:
            a = ease((t - (n0 - .3)) / .6)
            f = f * (1 - a) + shot_img(SHOTS[i + 1], t, SHOTS[i + 2][0] if i + 2 < len(SHOTS) else DUR) * a
            glow = math.sin(math.pi * a) * .5
    if (sh[0] in dissolve_at or sh[1] == "card") and t < sh[0] + .3 and i > 0:
        p_end = sh[0]; pv = SHOTS[i - 1]
        a = ease((t - (sh[0] - .3)) / .6)
        f = shot_img(pv, t, p_end) * (1 - a) + f * a
        glow = math.sin(math.pi * a) * .5
    # a short golden accent on the title moments
    for _, t0, _, _ in TITLES:
        if 0 <= t - t0 < .5: glow = max(glow, .22 * math.exp(-(t - t0) / .2))
    if sh[1] != "card":
        # the ChaniLi Studio moment: the logo over the kingdom
        if S["house"] <= t < S["ideas"]:
            k = ease((t - S["house"] - .15) / .5) * (1 - ease((t - (S["ideas"] - .3)) / .3))
            veil = np.array([234, 244, 251], np.float32)
            f = f * (1 - .45 * k) + veil * .45 * k
            RS.paste(f, logo_sprite(820), W / 2, 980 + (1 - k) * 14, alpha=k)
        draw_titles(f, t)
    f = RS.finish(f, t, glow, spark=.25 if sh[1] != "card" else .4)
    if t < .4: f = f * ease(t / .4)
    return f.astype(np.uint8)


def main():
    global CLIPS, SHOTS
    ap = argparse.ArgumentParser(); ap.add_argument("--stills", default="")
    ap.add_argument("--out", default=os.path.join(ROOT, "dist", "commercial-80s-9x16.mp4"))
    a = ap.parse_args()
    CLIPS = Clips(); SHOTS = shots()
    if a.stills:
        d = os.path.join(ROOT, ".cache", "commercial-stills"); os.makedirs(d, exist_ok=True)
        for ts in a.stills.split(","):
            p = os.path.join(d, f"{float(ts):05.2f}.jpg"); cv2.imwrite(p, frame_at(float(ts))); print(p)
        return
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", NARR, "-map", "0:v", "-map", "1:a",
           "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-maxrate", "7M", "-bufsize", "14M", "-profile:v", "high",
           "-level", "4.1", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{DUR}", "-movflags", "+faststart", a.out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for n in range(int(DUR * FPS)):
        p.stdin.write(frame_at(n / FPS).tobytes())
        if n % 240 == 0: print(f"{n / FPS:5.1f}s", flush=True)
    p.stdin.close(); p.wait(); print("wrote", a.out)


if __name__ == "__main__":
    main()
