#!/usr/bin/env python3
"""מלכת האותיות: renders the music video from the ten Flow clips and the song.

  python3 tools/render_clip.py                  # full render -> dist/malchat-haotiyot.mp4
  python3 tools/render_clip.py --from 23 --to 40  # render a time range only (preview)
  python3 tools/render_clip.py --stills 30,101,210 # write PNG stills instead of video

The edit lives in SHOTS below: every cut sits on a downbeat of the song (152 BPM,
bars ~1.62 s). The song itself is passed through untouched (re-encoded to AAC only).
"""
import argparse, math, os, subprocess, sys, json
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOOT = os.path.join(ROOT, "footage")
SONG = os.path.join(ROOT, "assets", "malchat-haotiyot.mp3")
FONTS = os.path.join(ROOT, "assets", "fonts")
CACHE = os.path.join(ROOT, ".cache")          # 96 fps motion-interpolated clips (not committed)
W, H, FPS = 1920, 1080, 24
SRC_W, SRC_H = 640, 360
INTERP = 96                                   # interpolated frame rate used for sampling
TITLE_AT = 206.47                             # last downbeat after the final peak
END = 217.0

# ---------------------------------------------------------------------------
# The edit. (start, end, clip, src_in, src_out, move, transition_in)
# move: (z0, z1, (cx0, cy0), (cx1, cy1)) zoom relative to full frame, centre in 0..1
# transition_in: "cut" | "flash" (cut + golden light on the downbeat) |
#                ("glow", seconds) golden light dissolve | ("black", seconds) fade from black
# ---------------------------------------------------------------------------
C = (0.5, 0.5)
def mv(z0=1.0, z1=1.06, c0=C, c1=None):
    return (z0, z1, c0, c1 or c0)

SHOTS = [
    # Intro: niggun pad, then claps / "hei!" -- scene 1, the palace gates
    (0.00,   4.97,  "palace-gate",   0.00, 4.00, mv(1.12, 1.02, (.45, .45), (.5, .5)), ("black", 2.6)),
    (4.97,   8.24,  "palace-gate",   4.00, 6.60, mv(1.0, 1.07, (.45, .5)), "cut"),
    (8.24,   9.89,  "palace-gate",   6.60, 8.00, mv(1.04, 1.12, (.5, .55)), "cut"),
    # Verse 1 -- entering the world of letters, scene 2 the first letter
    (9.89,  13.19,  "letter-hall",   0.00, 3.30, mv(1.0, 1.07, (.42, .5)), ("glow", .6)),
    (13.19, 16.49,  "letter-hall",   3.30, 6.60, mv(1.08, 1.0, (.5, .45)), "cut"),
    (16.49, 19.76,  "first-letter",  0.00, 3.27, mv(1.0, 1.06), "cut"),
    (19.76, 23.06,  "first-letter",  3.27, 6.57, mv(1.12, 1.2, (.45, .45)), "cut"),
    # Chorus 1 -- scene 3 dance, scene 4 stairs
    (23.06, 26.33,  "letter-dance",  0.00, 3.27, mv(1.0, 1.06, (.42, .5)), "flash"),
    (26.33, 29.63,  "letter-stairs", 0.00, 3.30, mv(1.08, 1.0, (.4, .5)), "cut"),
    (29.63, 32.90,  "letter-dance",  3.27, 6.54, mv(1.04, 1.1, (.45, .5)), "cut"),
    (32.90, 36.18,  "letter-stairs", 3.30, 6.58, mv(1.0, 1.07, (.45, .45)), "cut"),
    # Instrumental niggun -- scene 5 books, scene 6 the world inside the book
    (36.18, 42.70,  "magic-books",   0.00, 6.52, mv(1.1, 1.1, (.44, .5), (.56, .5)), ("glow", .7)),
    (42.70, 47.60,  "world-in-book", 0.00, 4.60, mv(1.0, 1.15, (.5, .5), (.62, .55)), "cut"),
    (47.60, 50.87,  "world-in-book", 4.60, 7.75, mv(1.0, 1.06), ("glow", .6)),
    # "ay-ay-ay" vocalise -- scene 7 the golden path and bridges
    (50.87, 55.75,  "golden-bridge", 0.00, 4.60, mv(1.0, 1.08, (.4, .5)), "cut"),
    (55.75, 59.03,  "golden-bridge", 4.60, 8.00, mv(1.08, 1.0, (.45, .5)), "cut"),
    (59.03, 60.65,  "first-letter",  6.57, 8.00, mv(1.1, 1.16, (.42, .45)), "cut"),
    (60.65, 62.28,  "letter-hall",   6.60, 8.00, mv(1.08, 1.14, (.5, .45)), "cut"),
    # Verse 2 -- scene 8 palace doors ("מתקרבות"), scene 9 the great book
    (62.28, 68.75,  "palace-gate",   0.00, 6.00, mv(1.18, 1.1, (.42, .5), (.48, .48)), ("glow", .6)),
    (68.75, 71.98,  "great-book",    0.00, 3.23, mv(1.0, 1.05, (.45, .5)), "cut"),
    (71.98, 75.21,  "great-book",    3.23, 6.46, mv(1.15, 1.2, (.4, .45)), "cut"),
    # Chorus 2 -- same scenes, tighter angles
    (75.21, 78.44,  "letter-dance",  0.00, 3.23, mv(1.2, 1.24, (.42, .42)), "flash"),
    (78.44, 81.66,  "magic-books",   2.00, 5.22, mv(1.15, 1.05, (.5, .45)), "cut"),
    (81.66, 84.87,  "letter-dance",  3.40, 6.61, mv(1.18, 1.12, (.45, .45)), "cut"),
    (84.87, 88.10,  "great-book",    4.77, 8.00, mv(1.0, 1.08, (.5, .5)), "cut"),
    # Alphabet chant -- letters everywhere: steps, path, book, the letter circle
    (88.10, 91.32,  "letter-stairs", 0.00, 3.22, mv(1.25, 1.15, (.45, .62), (.45, .55)), ("glow", .5)),
    (91.32, 94.53,  "letter-hall",   0.00, 3.21, mv(1.2, 1.2, (.62, .38), (.55, .4)), "cut"),
    (94.53, 97.73,  "golden-bridge", 0.00, 3.20, mv(1.2, 1.12, (.5, .6)), "cut"),
    (97.73, 100.94, "great-book",    0.00, 3.21, mv(1.25, 1.18, (.55, .38), (.52, .42)), "cut"),
    (100.94, 104.14, "finale-circle", 0.00, 3.20, mv(1.0, 1.06), "flash"),
    (104.14, 107.35, "first-letter", 0.00, 3.21, mv(1.2, 1.15, (.6, .4)), "cut"),
    (107.35, 110.55, "letter-stairs", 4.80, 8.00, mv(1.15, 1.05, (.45, .45)), "cut"),
    (110.55, 113.75, "magic-books",  0.00, 3.20, mv(1.2, 1.12, (.5, .32), (.5, .4)), "cut"),
    (113.75, 116.96, "letter-hall",  3.20, 6.41, mv(1.0, 1.08, (.48, .5)), "cut"),
    (116.96, 120.16, "golden-bridge", 3.20, 6.40, mv(1.12, 1.0, (.45, .5)), "cut"),
    (120.16, 123.39, "world-in-book", 0.00, 3.23, mv(1.15, 1.08, (.58, .5)), "cut"),
    (123.39, 126.60, "finale-circle", 3.20, 6.41, mv(1.12, 1.2, (.48, .5)), "cut"),
    # Chorus 3
    (126.60, 129.80, "letter-dance", 0.00, 3.20, mv(1.0, 1.06, (.42, .5)), "flash"),
    (129.80, 133.00, "letter-hall",  4.50, 7.70, mv(1.05, 1.1, (.5, .45)), "cut"),
    (133.00, 136.21, "letter-dance", 3.27, 6.47, mv(1.0, 1.06), "cut"),
    (136.21, 139.41, "first-letter", 4.40, 8.00, mv(1.08, 1.16, (.42, .45)), "cut"),
    # Breakdown -- the music almost stops; slow, wondrous shots
    (139.41, 144.17, "magic-books",  3.60, 7.60, mv(1.0, 1.12, (.55, .5), (.6, .48)), ("glow", .8)),
    (144.17, 148.93, "great-book",   0.00, 4.00, mv(1.12, 1.0, (.5, .45), (.5, .5)), ("glow", .8)),
    # Build back -- the doors open again
    (148.93, 152.16, "palace-gate",  4.00, 7.20, mv(1.0, 1.08), "flash"),
    (152.16, 155.36, "golden-bridge", 0.00, 3.20, mv(1.0, 1.05, (.42, .5)), "cut"),
    (155.36, 158.57, "letter-stairs", 1.60, 4.80, mv(1.1, 1.04, (.42, .5)), "cut"),
    (158.57, 161.75, "letter-hall",  0.00, 3.18, mv(1.0, 1.05, (.42, .5)), "cut"),
    (161.75, 164.95, "great-book",   4.80, 8.00, mv(1.1, 1.0), "cut"),
    # Final chorus -- scene 10, the letter circle
    (164.95, 168.14, "finale-circle", 0.00, 3.19, mv(1.06, 1.0), "flash"),
    (168.14, 171.34, "letter-dance", 0.00, 3.20, mv(1.06, 1.1, (.45, .5)), "cut"),
    (171.34, 174.52, "finale-circle", 3.20, 6.38, mv(1.0, 1.08), "cut"),
    (174.52, 177.73, "letter-dance", 3.20, 6.41, mv(1.12, 1.12, (.45, .47)), "cut"),
    # Outro -- "אותיות של תורה, איזו זכות"
    (177.73, 182.49, "first-letter", 0.00, 4.60, mv(1.0, 1.08, (.5, .48)), ("glow", .6)),
    (182.49, 188.82, "letter-stairs", 1.60, 7.60, mv(1.0, 1.1, (.42, .5), (.45, .42)), "cut"),
    # Final alphabet chant -- one bar per shot, then the peak in the circle and the wave goodbye
    (188.82, 190.40, "letter-hall",  0.60, 2.20, mv(1.08, 1.12, (.45, .5)), "flash"),
    (190.40, 191.98, "golden-bridge", 1.00, 2.60, mv(1.1, 1.14, (.45, .5)), "cut"),
    (191.98, 193.56, "magic-books",  0.40, 2.00, mv(1.08, 1.12, (.45, .5)), "cut"),
    (193.56, 195.16, "great-book",   1.20, 2.80, mv(1.08, 1.12, (.4, .5)), "cut"),
    (195.16, 196.74, "letter-stairs", 2.20, 3.80, mv(1.08, 1.12, (.45, .5)), "cut"),
    (196.74, 198.37, "letter-dance", 4.60, 6.20, mv(1.08, 1.12, (.45, .5)), "cut"),
    (198.37, 200.02, "world-in-book", 1.00, 2.65, mv(1.08, 1.12, (.45, .5)), "cut"),
    (200.02, TITLE_AT, "finale-circle", 1.55, 8.00, mv(1.0, 1.1, (.5, .5), (.5, .55)), "flash"),
]

# Sparkle density per section (0..1) -- subtle in verses, fuller in choruses and the peak.
DENSITY = [(0, .25), (9.89, .35), (23.06, .8), (36.18, .55), (62.28, .35), (75.21, .8),
           (88.10, .6), (126.60, .85), (139.41, .3), (148.93, .55), (164.95, 1.0),
           (177.73, .45), (188.82, .8), (200.02, 1.0), (TITLE_AT, .55)]


# ---------------------------------------------------------------------------
def ensure_interp(name):
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, f"{name}.mp4")
    if not os.path.exists(out):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(FOOT, f"{name}.mp4"), "-an",
                        "-vf", f"minterpolate=fps={INTERP}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
                        "-c:v", "libx264", "-crf", "10", "-preset", "veryfast", out], check=True)
    return out


def read_frames(path):
    cap = cv2.VideoCapture(path); fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(f)
    return np.stack(fr)


class Clips:
    """Loads interpolated clips on demand, colour-matched toward a shared grade."""
    def __init__(self):
        self.cache, self.order = {}, []
        names = sorted({s[2] for s in SHOTS})
        stats = {}
        for n in names:
            fr = read_frames(os.path.join(FOOT, f"{n}.mp4"))[::8]
            lab = cv2.cvtColor(np.concatenate(list(fr), axis=0), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
            stats[n] = lab.mean(0)
        target = np.mean(list(stats.values()), axis=0)
        # pull each clip halfway toward the common mean (keeps each scene's mood, removes jumps)
        self.shift = {n: (target - m) * 0.5 for n, m in stats.items()}

    def get(self, name):
        if name not in self.cache:
            fr = read_frames(ensure_interp(name))
            sh = self.shift[name]
            out = np.empty_like(fr)
            for i, f in enumerate(fr):
                lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float32) + sh
                out[i] = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
            # letterbox (the end of world-in-book) -> zoom needed to hide it, smoothed
            g = out.mean(axis=3)
            bars = np.array([max(int(np.argmax(r.mean(1) > 12)), int(np.argmax(r.mean(1)[::-1] > 12))) for r in g])
            need = SRC_H / np.maximum(SRC_H - 2 * (bars + 2 * (bars > 0)), 1)
            need = np.maximum.accumulate(need) if need[-1] > 1 else need
            need = np.convolve(np.pad(need, 24, mode="edge"), np.ones(49) / 49, mode="valid")
            self.cache[name] = (out, need)
            self.order.append(name)
            if len(self.order) > 4:
                del self.cache[self.order.pop(0)]
        return self.cache[name]


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def shot_frame(clips, shot, t):
    start, end, name, a, b, move, _ = shot
    fr, need = clips.get(name)
    speed = (b - a) / (end - start)
    st = a + (t - start) * speed
    idx = int(round(st * INTERP)); idx = min(max(idx, 0), len(fr) - 1)
    src = fr[idx]
    z0, z1, c0, c1 = move
    p = ease((t - start) / (end - start))
    z = max(z0 + (z1 - z0) * p, need[idx] * 1.005)
    cx = c0[0] + (c1[0] - c0[0]) * p; cy = c0[1] + (c1[1] - c0[1]) * p
    cw, ch = SRC_W / z, SRC_H / z
    x0 = min(max(cx * SRC_W - cw / 2, 0), SRC_W - cw); y0 = min(max(cy * SRC_H - ch / 2, 0), SRC_H - ch)
    s = W / cw
    M = np.float32([[s, 0, -x0 * s], [0, s, -y0 * s]])
    img = cv2.warpAffine(src, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    # restore crispness lost in the 3x upscale
    blur = cv2.GaussianBlur(img, (0, 0), 2.2)
    return cv2.addWeighted(img, 1.55, blur, -0.55, 0)


# --- light, sparkle, finishing ----------------------------------------------
GOLD = np.array([120, 205, 255], np.float32)  # BGR warm gold light

def density(t):
    d = DENSITY[0][1]
    for s, v in DENSITY:
        if t >= s: d = v
    # ease between sections
    for (s0, v0), (s1, v1) in zip(DENSITY, DENSITY[1:]):
        if s1 - .8 <= t < s1:
            return v0 + (v1 - v0) * ease((t - (s1 - .8)) / .8)
    return d


class Sparkles:
    def __init__(self, n=170, seed=7):
        r = np.random.default_rng(seed)
        self.x = r.uniform(0, W, n); self.y = r.uniform(0, H, n)
        self.vy = r.uniform(18, 55, n); self.vx = r.uniform(-8, 8, n)
        self.size = r.choice([1.2, 1.6, 2.2, 3.0, 4.2], n, p=[.3, .3, .2, .13, .07])
        self.ph = r.uniform(0, 2 * np.pi, n); self.tw = r.uniform(1.5, 4.0, n)
        self.rank = r.uniform(0, 1, n)
        self.sprites = {}

    def sprite(self, s):
        if s not in self.sprites:
            k = int(s * 6) | 1
            g = cv2.getGaussianKernel(k, s); core = g @ g.T; core /= core.max()
            self.sprites[s] = core.astype(np.float32)
        return self.sprites[s]

    def layer(self, t, amount):
        L = np.zeros((H, W), np.float32)
        if amount <= 0.01: return L
        for i in range(len(self.x)):
            if self.rank[i] > amount: continue
            x = (self.x[i] + self.vx[i] * t + 20 * math.sin(t * .4 + self.ph[i])) % W
            y = (self.y[i] - self.vy[i] * t) % H
            b = (0.5 + 0.5 * math.sin(t * self.tw[i] + self.ph[i])) ** 3
            sp = self.sprite(self.size[i]); k = sp.shape[0]; h = k // 2
            xi, yi = int(x) - h, int(y) - h
            if xi < 0 or yi < 0 or xi + k > W or yi + k > H: continue
            L[yi:yi + k, xi:xi + k] += sp * b
        return L


VIGNETTE = None
def finish(img, t, sparkles, glow):
    global VIGNETTE
    f = img.astype(np.float32)
    # soft bloom on highlights
    small = cv2.resize(f, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    hl = np.clip(small - 190, 0, None) * 1.6
    hl = cv2.GaussianBlur(hl, (0, 0), 9)
    f += cv2.resize(hl, (W, H), interpolation=cv2.INTER_LINEAR) * 0.35
    # sparkles + golden light accents
    sp = sparkles.layer(t, density(t)) * 0.8
    f += sp[..., None] * GOLD[None, None, :] * 0.9
    if glow > 0:
        f = f * (1 - 0.35 * glow) + (GOLD * 1.05 + 30) * 0.35 * glow + f * 0.25 * glow
    if VIGNETTE is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
        VIGNETTE = (1 - 0.18 * np.clip(d - 0.55, 0, None) ** 1.6)[..., None]
    f *= VIGNETTE
    return np.clip(f, 0, 255).astype(np.uint8)


# --- end title ----------------------------------------------------------------
def font(name, size, var=None):
    f = ImageFont.truetype(os.path.join(FONTS, name), size, layout_engine=ImageFont.Layout.RAQM)
    if var: f.set_variation_by_name(var)
    return f


def gold_fill(mask):
    """mask (L) -> RGBA filled with a metallic gold gradient."""
    w, h = mask.size
    y = np.linspace(0, 1, h)[:, None]
    stops = np.array([[176, 128, 46], [242, 214, 140], [196, 150, 62], [250, 228, 160], [168, 118, 40]], np.float32)
    pos = np.linspace(0, 1, len(stops))
    col = np.stack([np.interp(y[:, 0], pos, stops[:, c]) for c in range(3)], 1)
    rgb = np.repeat(col[:, None, :], w, 1).astype(np.uint8)
    im = Image.fromarray(rgb, "RGB").convert("RGBA"); im.putalpha(mask)
    return im


def build_title():
    S = 2  # supersample
    w, h = W * S, H * S
    # background: cream centre to blush pink edges
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.clip(np.sqrt(((xx - W / 2) / (W * .62)) ** 2 + ((yy - H * .47) / (H * .75)) ** 2), 0, 1)
    c0, c1 = np.array([253, 246, 238]), np.array([244, 214, 219])
    bg = (c0[None, None] * (1 - d[..., None] ** 1.4) + c1[None, None] * d[..., None] ** 1.4).astype(np.uint8)
    bg = Image.fromarray(bg, "RGB").convert("RGBA")

    # ornaments (gold): fine double frame with rounded corner scrolls, divider with diamonds
    m = Image.new("L", (w, h), 0); dr = ImageDraw.Draw(m)
    for inset, wd in ((70, 4), (86, 2)):
        i = inset * S
        dr.rounded_rectangle([i, i, w - i, h - i], radius=46 * S, outline=255, width=wd * S)
    for cx, cy, sx, sy in ((1, 1, 1, 1), (W - 1, 1, -1, 1), (1, H - 1, 1, -1), (W - 1, H - 1, -1, -1)):
        # corner scroll: three nested arcs and a dot
        ox, oy = (cx + sx * 118) * S, (cy + sy * 118) * S
        for r in (26, 40):
            dr.arc([ox - r * S, oy - r * S, ox + r * S, oy + r * S], 0, 360, fill=255, width=2 * S)
        dr.ellipse([ox - 7 * S, oy - 7 * S, ox + 7 * S, oy + 7 * S], fill=255)
    # divider
    yD = 640 * S
    for side in (-1, 1):
        x0 = W // 2 * S + side * 46 * S; x1 = W // 2 * S + side * 330 * S
        for k in range(0, abs(x1 - x0), S):
            a = 1 - k / abs(x1 - x0)
            xx_ = x0 + side * k
            dr.line([xx_, yD - S, xx_, yD + S], fill=int(255 * a ** .7))
        for off in (60, 96):
            px = W // 2 * S + side * off * S
            dr.ellipse([px - 4 * S, yD - 4 * S, px + 4 * S, yD + 4 * S], fill=255)
    cx = W // 2 * S
    dr.polygon([(cx, yD - 18 * S), (cx + 18 * S, yD), (cx, yD + 18 * S), (cx - 18 * S, yD)], fill=255)
    dr.polygon([(cx, yD - 9 * S), (cx + 9 * S, yD), (cx, yD + 9 * S), (cx - 9 * S, yD)], fill=0)
    # small arc of dots above the title
    for k in range(-6, 7):
        ang = math.radians(90 + k * 7.5)
        px = cx + math.cos(ang) * 520 * S; py = (930 - math.sin(ang) * 640) * S
        r = (6 if k % 3 == 0 else 4) * S
        dr.ellipse([px - r, py - r, px + r, py + r], fill=255)
    orn = gold_fill(m)

    # title: deep burgundy, thin gold edge, soft shadow
    title = "מלכת האותיות"
    ft = font("FrankRuhlLibre[wght].ttf", 215 * S, "Black")
    tm = Image.new("L", (w, h), 0); td = ImageDraw.Draw(tm)
    td.text((w / 2, 470 * S), title, font=ft, fill=255, anchor="mm", direction="rtl", language="he")
    edge = tm.filter(ImageFilter.MaxFilter(11))
    shadow = Image.new("RGBA", (w, h), (90, 20, 40, 0))
    shadow.putalpha(tm.filter(ImageFilter.GaussianBlur(14 * S)).point(lambda v: int(v * .35)))
    shadow = shadow.transform(shadow.size, Image.AFFINE, (1, 0, 0, 0, 1, -8 * S))
    yy2 = np.linspace(0, 1, h)[:, None]
    top, bot = np.array([128, 22, 52]), np.array([84, 8, 30])
    burg = (top * (1 - yy2) + bot * yy2).astype(np.uint8)
    burg = Image.fromarray(np.repeat(burg[:, None, :], w, 1), "RGB").convert("RGBA"); burg.putalpha(tm)
    ttl = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ttl = Image.alpha_composite(ttl, shadow)
    ttl = Image.alpha_composite(ttl, gold_fill(edge))
    ttl = Image.alpha_composite(ttl, burg)

    # studio name, letter-spaced
    fs = font("CormorantGaramond[wght].ttf", 78 * S, "SemiBold")
    text = "ChaniLi Studio"; track = 10 * S
    widths = [fs.getlength(ch) for ch in text]; total = sum(widths) + track * (len(text) - 1)
    sm = Image.new("L", (w, h), 0); sd = ImageDraw.Draw(sm); x = (w - total) / 2
    for ch, cw in zip(text, widths):
        sd.text((x, 742 * S), ch, font=fs, fill=255, anchor="lm"); x += cw + track
    sub = Image.new("RGBA", (w, h), (112, 20, 46, 0)); sub.putalpha(sm)

    def down(im):  # PIL works in RGB(A), the frame pipeline in BGR
        a = np.array(im.resize((W, H), Image.LANCZOS)).astype(np.float32)
        return a[..., [2, 1, 0, 3]] if a.shape[2] == 4 else a[..., ::-1]
    return down(bg)[..., :3], down(orn), down(ttl), down(sub)


TITLE = None
def title_frame(t, sparkles):
    """t = seconds since TITLE_AT. Returns RGB float image."""
    global TITLE
    if TITLE is None: TITLE = build_title()
    bg, orn, ttl, sub = TITLE
    f = bg.copy()
    def over(f, layer, a, dy=0.0, scale=1.0):
        if a <= 0: return f
        L = layer
        if dy or scale != 1.0:
            M = cv2.getRotationMatrix2D((W / 2, 520), 0, scale); M[1, 2] += dy
            L = cv2.warpAffine(layer, M, (W, H), flags=cv2.INTER_CUBIC)
        al = L[..., 3:4] / 255 * a
        return f * (1 - al) + L[..., :3] * al
    a_orn = ease((t - 0.9) / 1.4)
    o = orn.copy()
    # a slow shimmer that sweeps across the gold once
    sx = (t - 3.2) / 2.4
    if 0 < sx < 1.3:
        xx = np.arange(W, dtype=np.float32)[None, :]; yy = np.arange(H, dtype=np.float32)[:, None]
        band = np.exp(-(((xx + yy * .5) - (sx * (W + H * .5))) / 140) ** 2)
        o[..., :3] = np.clip(o[..., :3] + band[..., None] * 120, 0, 255)
    f = over(f, o, a_orn)
    a_t = ease((t - 1.3) / 1.6)
    f = over(f, ttl, a_t, dy=(1 - a_t) * 18, scale=1.04 - 0.04 * a_t)
    f = over(f, sub, ease((t - 2.6) / 1.3), dy=(1 - ease((t - 2.6) / 1.3)) * 12)
    sp = sparkles.layer(t + TITLE_AT, 0.45) * 0.7
    f += sp[..., None] * np.array([90, 180, 235], np.float32)[None, None] * 0.7
    return np.clip(f, 0, 255)


# --- timeline -------------------------------------------------------------------
def shot_at(t):
    for i, s in enumerate(SHOTS):
        if s[0] <= t < s[1]: return i
    return len(SHOTS) - 1


def render_frame(clips, sparkles, t):
    glow = 0.0
    if t >= TITLE_AT - 0.6:
        tt = t - TITLE_AT
        if tt < 0.6:  # golden light dissolve from the last shot into the title
            a = ease((tt + 0.6) / 1.2)
            img = shot_frame(clips, SHOTS[-1], min(t, TITLE_AT - 1e-3)).astype(np.float32)
            img = finish(img.astype(np.uint8), t, sparkles, math.sin(math.pi * a) * .9).astype(np.float32)
            out = img * (1 - a) + title_frame(max(tt, 0), sparkles) * a
        else:
            out = title_frame(tt, sparkles)
        fade = ease((END - t) / 1.2)
        return np.clip(out * fade, 0, 255).astype(np.uint8)

    i = shot_at(t); s = SHOTS[i]
    img = shot_frame(clips, s, t).astype(np.float32)
    tr = s[6]
    # incoming transition of this shot
    if isinstance(tr, tuple) and tr[0] == "glow" and i > 0:
        d = tr[1]
        if t < s[0] + d / 2:  # second half of the dissolve, first half is in the previous shot
            a = ease((t - (s[0] - d / 2)) / d)
            img = shot_frame(clips, SHOTS[i - 1], t).astype(np.float32) * (1 - a) + img * a
        glow = max(glow, math.sin(math.pi * min(max((t - (s[0] - d / 2)) / d, 0), 1)) * .55)
    if isinstance(tr, tuple) and tr[0] == "black":
        pass
    if tr == "flash":
        glow = max(glow, 0.38 * math.exp(-(t - s[0]) / 0.22))
    # outgoing: next shot dissolves in
    if i + 1 < len(SHOTS):
        n = SHOTS[i + 1]; trn = n[6]
        if isinstance(trn, tuple) and trn[0] == "glow" and t >= n[0] - trn[1] / 2:
            d = trn[1]; a = ease((t - (n[0] - d / 2)) / d)
            img = img * (1 - a) + shot_frame(clips, n, t).astype(np.float32) * a
            glow = max(glow, math.sin(math.pi * a) * .55)
    out = finish(np.clip(img, 0, 255).astype(np.uint8), t, sparkles, glow)
    if isinstance(SHOTS[0][6], tuple) and SHOTS[0][6][0] == "black" and t < SHOTS[0][6][1]:
        out = (out.astype(np.float32) * ease(t / SHOTS[0][6][1])).astype(np.uint8)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="t0", type=float, default=0.0)
    ap.add_argument("--to", dest="t1", type=float, default=END)
    ap.add_argument("--stills", default="")
    ap.add_argument("--out", default=os.path.join(ROOT, "dist", "malchat-haotiyot.mp4"))
    ap.add_argument("--crf", default="18")
    a = ap.parse_args()
    clips, sparkles = Clips(), Sparkles()

    if a.stills:
        os.makedirs(os.path.join(ROOT, ".cache", "stills"), exist_ok=True)
        for ts in a.stills.split(","):
            t = float(ts); p = os.path.join(ROOT, ".cache", "stills", f"{t:07.2f}.jpg")
            cv2.imwrite(p, render_frame(clips, sparkles, t)); print(p)
        return

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    n0, n1 = int(round(a.t0 * FPS)), int(round(a.t1 * FPS))
    cmd = ["ffmpeg", "-v", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-ss", f"{a.t0:.3f}", "-t", f"{(n1 - n0) / FPS:.3f}", "-i", SONG,
           "-map", "0:v", "-map", "1:a",
           "-c:v", "libx264", "-preset", "slow", "-crf", a.crf, "-profile:v", "high", "-pix_fmt", "yuv420p",
           "-x264-params", "keyint=48", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
           "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-af", "apad",
           "-t", f"{(n1 - n0) / FPS:.3f}", "-movflags", "+faststart", a.out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for n in range(n0, n1):
        t = n / FPS
        p.stdin.write(render_frame(clips, sparkles, t).tobytes())
        if n % 240 == 0: print(f"{t:7.2f}s", flush=True)
    p.stdin.close(); p.wait()
    print("wrote", a.out)


if __name__ == "__main__":
    main()
