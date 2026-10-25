#!/usr/bin/env python3
"""טיזר השקה v2: ״ממלכת האותיות נפתחת״, ‏12 שניות, ‏9:16.

  python3 tools/render_teaser_v2.py                # -> dist/teaser-v2-12s-9x16.mp4
  python3 tools/render_teaser_v2.py --stills 1,2.5,3.6,5.2,7,8,8.6,9.6,11.5

0-3.3   mystery: dark cream-gold space, points of light gather into a 3D gold א
3.3-6.6 the reveal: the gate, light pours out, through the doors into the kingdom (music hits here)
6.6-9.05 three exclusive glimpses: the characters, the clip, the real worksheet pages
9.05-12 clean luxury end card

Only existing materials are used (clip footage, posters, the site recording's worksheet pages, the
logo, the song). The intro, the music build and the impacts are made in code.
"""
import argparse, math, os, subprocess
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.signal import butter, lfilter, fftconvolve

import render_clip as RC
import render_teaser as RT
import render_summary as RS

ROOT = RC.ROOT
W, H, FPS, DUR = 1080, 1920, 24, 12.0
SR = 48000
BEAT = (24.68 - 23.06) / 4
T_GATE = 3.30                      # song chorus downbeat (23.06 s in the song) lands here
SONG_AT = 23.06 - T_GATE
T_DOORS = T_GATE + 4 * BEAT        # 4.92
T_WORLD = T_DOORS + 2 * BEAT       # 5.73
T_PEEK = T_GATE + 8 * BEAT         # 6.57
T_P2, T_P3 = T_PEEK + 2 * BEAT, T_PEEK + 4 * BEAT
T_CARD = T_PEEK + 6 * BEAT         # 9.05 -- final hit
ease = RT.ease

def ease3(x):
    x = min(max(x, 0.0), 1.0); return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2


# --- the dark, warm space --------------------------------------------------------------------
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
def dark_bg(t, cx=.5, cy=.45, lift=0.0):
    d = np.sqrt(((XX - W * cx) / (W * .8)) ** 2 + ((YY - H * cy) / (H * .55)) ** 2)
    core = np.array([44, 62, 84], np.float32); edge = np.array([10, 13, 18], np.float32)   # BGR: warm espresso, gold-cream core
    k = np.clip(d, 0, 1)[..., None] ** 1.2
    f = core * (1 - k) + edge * k
    f += np.exp(-d ** 2 * 3.5)[..., None] * np.array([40, 70, 100], np.float32) * (0.5 + lift)
    # pale-blue whisper in the upper corner (brand תכלת)
    f += np.exp(-(((XX - W * .15) / (W * .5)) ** 2 + ((YY - H * .1) / (H * .3)) ** 2))[..., None] * np.array([38, 26, 14], np.float32)
    return f

BOKEH = None
def bokeh(f, t, amount):
    global BOKEH
    if BOKEH is None:
        r = np.random.default_rng(5)
        BOKEH = [(r.uniform(0, W), r.uniform(0, H), r.uniform(40, 110), r.uniform(-6, 6), r.uniform(-14, -4), r.uniform(.2, 1)) for _ in range(14)]
    L = np.zeros((H // 4, W // 4), np.float32)
    for x, y, rad, vx, vy, b in BOKEH:
        cv2.circle(L, (int((x + vx * t) / 4) % (W // 4), int((y + vy * t) / 4) % (H // 4)), int(rad / 4), b, -1, cv2.LINE_AA)
    L = cv2.resize(cv2.GaussianBlur(L, (0, 0), 3), (W, H))
    return f + L[..., None] * np.array([60, 110, 150], np.float32) * amount


# --- the 3D gold letter ---------------------------------------------------------------------
LET = {}
def letter_assets():
    if LET: return LET
    f = RS.font(RS.FR, 1250, "Black")
    box = f.getbbox("א", direction="rtl", language="he"); pad = 80
    w, h = box[2] - box[0] + 2 * pad, box[3] - box[1] + 2 * pad
    m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).text((pad - box[0], pad - box[1]), "א", font=f, fill=255, direction="rtl", language="he")
    M = np.array(m, np.float32) / 255
    face = np.array(RC.gold_fill(m), np.float32)[..., [2, 1, 0]]
    mi = np.array(m, np.int16)
    hi = cv2.GaussianBlur(np.clip(mi - np.roll(mi, (7, 7), (0, 1)), 0, 255).astype(np.float32), (0, 0), 3) / 255
    lo = cv2.GaussianBlur(np.clip(mi - np.roll(mi, (-7, -7), (0, 1)), 0, 255).astype(np.float32), (0, 0), 3) / 255
    face = face + hi[..., None] * 110 - lo[..., None] * 90
    LET.update(M=M, face=np.clip(face, 0, 255), w=w, h=h)
    ys, xs = np.where(M > .6)
    r = np.random.default_rng(2); idx = r.choice(len(xs), 1700, replace=False)
    LET["pts"] = np.stack([xs[idx] - w / 2, ys[idx] - h / 2], 1).astype(np.float32)
    n = len(idx)
    ang = r.uniform(0, 2 * np.pi, n); rad = r.uniform(380, 1300, n)
    LET["p0"] = np.stack([np.cos(ang) * rad * .8, np.sin(ang) * rad * 1.2], 1).astype(np.float32)
    LET["ps"] = r.uniform(0.05, 1.3, n); LET["pd"] = r.uniform(0.9, 1.35, n)
    LET["pc"] = r.uniform(-1, 1, n); LET["pb"] = r.uniform(.5, 1, n); LET["ph"] = r.uniform(0, 6.28, n)
    return LET

def letter_layer(theta, sweep):
    """returns (rgb, alpha) of the extruded letter at rotation theta (rad), cropped to its box."""
    L = letter_assets(); M, face, w, h = L["M"], L["face"], L["w"], L["h"]
    sx = max(math.cos(theta), .2); nw = max(int(w * sx), 8)
    Ms = cv2.resize(M, (nw, h), interpolation=cv2.INTER_AREA); Fs = cv2.resize(face, (nw, h), interpolation=cv2.INTER_AREA)
    depth = 26; ex, ey = math.sin(theta) * 1.3 + .35, .75
    rgb = np.zeros((h + 60, nw + 80, 3), np.float32); al = np.zeros((h + 60, nw + 80), np.float32)
    ox, oy = 40, 20
    for d in range(depth, 0, -1):          # back to front: dark bronze sides
        dx, dy = int(round(d * ex)), int(round(d * ey))
        sl = (slice(oy + dy, oy + dy + h), slice(ox + dx, ox + dx + nw))
        shade = 0.28 + 0.4 * (1 - d / depth)
        c = np.array([38, 78, 122], np.float32) * shade * 1.5     # dark bronze sides
        a = Ms * (1 - al[sl])
        rgb[sl] += c * a[..., None]; al[sl] += a
    if 0 <= sweep <= 1.4:                  # one specular sweep across the face
        xx = np.arange(nw, dtype=np.float32)[None, :]; yy = np.arange(h, dtype=np.float32)[:, None]
        band = np.exp(-(((xx + yy * .45) - sweep * (nw + h * .45)) / 70) ** 2)
        Fs = np.clip(Fs + band[..., None] * 150, 0, 255)
    sl = (slice(oy, oy + h), slice(ox, ox + nw))
    rgb[sl] = rgb[sl] * (1 - Ms[..., None]) + Fs * Ms[..., None]; al[sl] = np.maximum(al[sl], Ms)
    return rgb, al

def comp(f, rgb, al, cx, cy, scale, alpha):
    if alpha <= 0: return f
    h, w = al.shape; nw, nh = int(w * scale), int(h * scale)
    rgb = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA); al = cv2.resize(al, (nw, nh), interpolation=cv2.INTER_AREA) * alpha
    x0, y0 = int(cx - nw / 2), int(cy - nh / 2)
    xa, ya, xb, yb = max(x0, 0), max(y0, 0), min(x0 + nw, W), min(y0 + nh, H)
    a = al[ya - y0:yb - y0, xa - x0:xb - x0, None]
    f[ya:yb, xa:xb] = f[ya:yb, xa:xb] * (1 - a) + rgb[ya - y0:yb - y0, xa - x0:xb - x0] * a
    return f

def s_intro(t):
    L = letter_assets()
    cam = 0.80 + 0.12 * ease(t / T_GATE)                 # slow push-in on the whole space
    f = bokeh(dark_bg(t, lift=.4 * ease((t - 1.8) / 1.5)), t, .10 + .1 * ease(t / 3))
    cx, cy = W / 2 + 18 * math.sin(t * .6), H * .46
    # light points gathering into the letter
    form = ease((t - 2.0) / .7)
    theta = math.radians(38) * (1 - ease3((t - 0.6) / 2.4))
    sx = max(math.cos(theta), .2)
    k = np.clip((t - L["ps"]) / L["pd"], 0, 1); k = np.where(k < .5, 4 * k ** 3, 1 - (-2 * k + 2) ** 3 / 2)
    tgt = L["pts"] * np.array([sx, 1], np.float32)
    perp = np.stack([-L["p0"][:, 1], L["p0"][:, 0]], 1) / 1000
    p = L["p0"] * (1 - k[:, None]) + tgt * k[:, None] + perp * (np.sin(k * np.pi) * 180 * L["pc"])[:, None]
    p = p * cam + np.array([cx, cy], np.float32)
    vis = (t > L["ps"] - .15)
    b = L["pb"] * (0.55 + 0.45 * np.sin(t * 5 + L["ph"])) * vis * (1 - form * .9) * np.clip((t - L["ps"] + .15) / .3, 0, 1)
    acc = np.zeros((H, W), np.float32)
    xi, yi = p[:, 0].astype(int), p[:, 1].astype(int); ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
    np.add.at(acc, (yi[ok], xi[ok]), b[ok])
    pts = cv2.GaussianBlur(acc, (0, 0), 1.6) * 9 + cv2.GaussianBlur(acc, (0, 0), 7) * 14
    f += np.clip(pts, 0, 3)[..., None] * np.array([150, 215, 255], np.float32)
    if form > 0:
        rgb, al = letter_layer(theta, (t - 2.45) / .7)
        if "glow" not in L:   # padded before blurring, so the halo has no edges
            L["glow"] = cv2.GaussianBlur(np.pad(cv2.resize(L["M"], None, fx=.25, fy=.25), 60), (0, 0), 12)
        gp = L["glow"]
        g = cv2.resize(gp, (int(gp.shape[1] * 4 * cam * sx), int(gp.shape[0] * 4 * cam)))
        gl = np.zeros((H, W), np.float32); gh, gw = g.shape
        x0, y0 = int(cx - gw / 2), int(cy - gh / 2)
        gl[max(y0, 0):min(y0 + gh, H), max(x0, 0):min(x0 + gw, W)] = g[max(-y0, 0):gh - max(y0 + gh - H, 0), max(-x0, 0):gw - max(x0 + gw - W, 0)]
        f += gl[..., None] * np.array([60, 140, 215], np.float32) * form * 1.1
        f = comp(f, rgb, al, cx + 10 * cam, cy + 14 * cam, cam, form)
    # the flare that opens the way (3.0 -> 3.3)
    flare = ease((t - 2.95) / .35)
    return f, flare


# --- light: god rays, flares, grade ------------------------------------------------------------
def rays(f, cx, cy, strength, thr=200):
    small = cv2.resize(f, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    lum = small.mean(2); src = np.clip(lum - thr, 0, None)[..., None] * (small / np.maximum(lum[..., None], 1))
    acc = np.zeros_like(small); c = (cx / 4, cy / 4)
    for k in range(1, 18):
        s = 1 + k * .045
        M = cv2.getRotationMatrix2D(c, 0, s)
        acc += cv2.warpAffine(src, M, (W // 4, H // 4)) * (1 - k / 18)
    return f + cv2.resize(cv2.GaussianBlur(acc, (0, 0), 2), (W, H)) * strength

def streak(f, amount):
    if amount <= 0: return f
    small = cv2.resize(f, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    hl = np.clip(small - 210, 0, None)
    s = cv2.blur(hl, (121, 3))
    return f + cv2.resize(s, (W, H)) * np.array([1.0, 1.1, 1.25], np.float32) * amount * 3

def grade(f, warm=1.0):
    """gentle filmic curve: deeper shadows, creamy highlights, a hint of blue in the shadows."""
    x = np.clip(f / 255, 0, None)
    x = x / (1 + .18 * x)
    x = np.clip((x - .02) * 1.08, 0, 1) ** 1.06
    sh = (1 - x.mean(2, keepdims=True)) ** 2
    x = x + sh * np.array([.035, .012, -.01], np.float32) * warm
    return x * 255

GRAIN = None
def grain(f, t):
    global GRAIN
    if GRAIN is None:
        r = np.random.default_rng(9)
        GRAIN = [cv2.GaussianBlur(r.standard_normal((H, W)).astype(np.float32), (0, 0), .7) for _ in range(6)]
    return f + GRAIN[int(t * FPS) % 6][..., None] * 3.2

VIG = None
def vignette(f, amt=.32):
    global VIG
    if VIG is None:
        d = np.sqrt(((XX - W / 2) / (W / 2)) ** 2 + ((YY - H / 2) / (H / 2)) ** 2)
        VIG = (1 - np.clip(d - .45, 0, None) ** 1.7 * .9)[..., None]
    return f * (1 - amt + amt * VIG)


# --- the reveal ---------------------------------------------------------------------------------
CLIPS = None
def shot(t, name, t0, t1, a, b, z, path):
    return RT.vertical(CLIPS, (t0, t1, name, a, b, z, list(path)), t)

def s_gate(t):
    if t < T_DOORS:     # the gate from outside: strong push toward the light in the doorway
        f = shot(t, "palace-gate", T_GATE, T_DOORS, 0.0, 0.95, (1.08, 1.34), ((0, .70, .45), (1, .66, .40)))
        k = (t - T_GATE) / (T_DOORS - T_GATE)
        f = rays(f, W * .45, H * .40, .28 + .5 * k, thr=205)
        glow = .55 * math.exp(-(t - T_GATE) / .25) + .5 * ease((t - (T_DOORS - .3)) / .3)
    elif t < T_WORLD:   # through the open doors, into the light
        f = shot(t, "palace-gate", T_DOORS, T_WORLD, 6.9, 7.75, (1.02, 1.22), ((0, .52, .50), (1, .52, .44)))
        f = rays(f, W * .5, H * .58, .5, thr=205)
        glow = .55 * math.exp(-(t - T_DOORS) / .22) + .35 * ease((t - (T_WORLD - .25)) / .25)
    else:               # the kingdom opens: colour, water, the golden palace
        f = shot(t, "golden-bridge", T_WORLD, T_PEEK, 5.5, 6.4, (1.0, 1.1), ((0, .58, .46), (1, .58, .43)))
        f = rays(f, W * .62, H * .30, .25, thr=210)
        glow = .4 * math.exp(-(t - T_WORLD) / .22)
    return f, glow


# --- three exclusive glimpses ------------------------------------------------------------------------
CACHE = {}
def showcase_bg(t, spot=(.5, .5)):
    f = dark_bg(t, *spot, lift=.6)
    return bokeh(f, t, .18)

def persp(spr, ay, ax=0.0):
    """tilt a BGRA sprite around its vertical axis (ay, deg) for a 3D feel."""
    h, w = spr.shape[:2]
    a = math.radians(ay); dz = math.sin(a) * .5; sx = math.cos(a)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    cx = w / 2; hw = w / 2 * sx
    dl, dr = h * dz * .25, -h * dz * .25
    dst = np.float32([[cx - hw, -dl], [cx + hw, -dr], [cx + hw, h + dr], [cx - hw, h + dl]])
    dst[:, 1] += h * abs(dz) * .25
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(spr, M, (w, int(h * (1 + abs(dz) * .5))), flags=cv2.INTER_LINEAR)

def gold_rim(img, r=30, wpx=4):
    """rounded image with a thin gold rim and a soft shadow (BGRA)."""
    h, w = img.shape[:2]
    m = RS.rounded_mask(w, h, r)
    rim = Image.fromarray(m.astype(np.uint8)); inner = rim.filter(ImageFilter.MinFilter(wpx * 2 + 1))
    ring = Image.fromarray(np.clip(np.array(rim, np.int16) - np.array(inner, np.int16), 0, 255).astype(np.uint8))
    gold = np.array(RC.gold_fill(ring), np.float32)[..., [2, 1, 0, 3]]
    spr = RS.with_shadow(img.astype(np.uint8), radius=r, blur=34, opacity=.55)
    pad = (spr.shape[0] - h) // 2
    reg = spr[pad:pad + h, pad:pad + w]; ga = gold[..., 3:4] / 255
    reg[..., :3] = reg[..., :3] * (1 - ga) + gold[..., :3] * ga
    return spr

def s_peeks(t):
    if t < T_P2:          # 1) the original characters: the king and the queen, from the poster
        if "kids" not in CACHE:
            img = cv2.imread(os.path.join(RS.KIT, "poster-king-queen.png"))[600:1260, 95:1010]
            CACHE["kids"] = gold_rim(cv2.resize(img, (960, int(960 * img.shape[0] / img.shape[1])), interpolation=cv2.INTER_AREA))
        k = (t - T_PEEK) / (T_P2 - T_PEEK)
        f = showcase_bg(t, (.5, .48))
        spr = persp(CACHE["kids"], 14 * (1 - ease3(k * 1.3)))
        RS.paste(f, spr, W / 2, H * .48, scale=0.96 + .08 * ease(k))
        return rays(f, W / 2, H * .30, .35, thr=215), .5 * math.exp(-(t - T_PEEK) / .2)
    if t < T_P3:          # 2) the clip
        f = shot(t, "letter-dance", T_P2, T_P3, 4.0, 4.85, (1.0, 1.1), ((0, .46, .5), (1, .47, .48)))
        return f, .45 * math.exp(-(t - T_P2) / .2)
    # 3) the real worksheet pages, from the site
    if "pages" not in CACHE:
        CACHE["pages"] = [RS.page_sprite(tr, RS.BOOK_BOX, w) for tr, w in ((25.4, 520), (26.4, 520), (40.0, 600))]
    k = (t - T_P3) / (T_CARD - T_P3)
    f = showcase_bg(t, (.5, .52))
    back_l, back_r, front = CACHE["pages"]
    RS.paste(f, back_l, W / 2 - 200 - 40 * ease(k), H * .52, scale=.9, angle=9)
    RS.paste(f, back_r, W / 2 + 200 + 40 * ease(k), H * .53, scale=.9, angle=-8)
    RS.paste(f, persp(front, 10 * (1 - ease3(k * 1.4))), W / 2, H * .51 - 30 * ease(k), scale=1.0 + .05 * ease(k))
    return f, .45 * math.exp(-(t - T_P3) / .2)


# --- the end card -------------------------------------------------------------------------------------
def card_bg():
    if "card_bg" in CACHE: return CACHE["card_bg"]
    v = (YY / H)[..., None]
    top, bot = np.array([234, 244, 251], np.float32), np.array([214, 211, 242], np.float32)   # cream -> powder pink
    f = top * (1 - v) + bot * v
    f += np.exp(-(((XX - W * .2) / (W * .6)) ** 2 + ((YY - H * .12) / (H * .25)) ** 2))[..., None] * np.array([14, 6, -6], np.float32)
    f += np.exp(-(((XX - W * .5) / (W * .55)) ** 2 + ((YY - H * .42) / (H * .3)) ** 2))[..., None] * 10
    # a single gold hairline frame
    m = Image.new("L", (W * 2, H * 2), 0)
    ImageDraw.Draw(m).rounded_rectangle([60 * 2, 230 * 2, (W - 60) * 2, (H - 330) * 2], radius=36 * 2, outline=255, width=3)
    m = m.resize((W, H), Image.LANCZOS)
    g = np.array(RC.gold_fill(m), np.float32)[..., [2, 1, 0, 3]]
    a = g[..., 3:4] / 255 * .85
    CACHE["card_bg"] = f * (1 - a) + g[..., :3] * a
    return CACHE["card_bg"]

def blur_in(spr, k):
    if k >= .999: return spr
    s = (1 - k) * 9
    return cv2.GaussianBlur(spr, (0, 0), s) if s > .3 else spr

def s_card(t):
    f = card_bg().copy()
    if "txt" not in CACHE:
        CACHE["txt"] = [RS.text_sprite(s, RS.FR, size, "Black", RS.BURG, edge="gold")
                        for s, size in (("22 אותיות.", 132), ("שנה שלמה.", 132), ("אינסוף חוויות חסידיות!", 96))]
        CACHE["soon"] = RS.text_sprite("החשיפה הראשונה — בקרוב", RS.FR, 82, "Bold", (34, 98, 160), edge="gold")   # antique gold
        lg = RS.load("logo-chanili.png"); s = 440 / lg.shape[1]
        CACHE["logo"] = cv2.resize(lg, (440, int(lg.shape[0] * s)), interpolation=cv2.INTER_AREA)
        d = Image.new("L", (900, 40), 0); dr = ImageDraw.Draw(d)
        for side in (-1, 1):
            for k in range(0, 300, 2): dr.line([450 + side * (30 + k), 19, 450 + side * (30 + k), 21], fill=int(255 * (1 - k / 300) ** .8))
        dr.polygon([(450, 8), (462, 20), (450, 32), (438, 20)], fill=255)
        CACHE["div"] = np.array(RC.gold_fill(d), np.float32)[..., [2, 1, 0, 3]]
    a = T_CARD
    for i, (spr, y) in enumerate(zip(CACHE["txt"], (560, 720, 880))):
        k = ease((t - a - .12 - i * BEAT) / .5)
        if k > 0: RS.paste(f, blur_in(spr, k), W / 2, y + (1 - k) * 22, alpha=k)
    k = ease((t - a - 1.45) / .5); RS.paste(f, CACHE["div"], W / 2, 1000, alpha=k)
    k = ease((t - a - 1.6) / .6); RS.paste(f, blur_in(CACHE["soon"], k), W / 2, 1110 + (1 - k) * 16, alpha=k)
    sx = (t - a - 2.15) / .8                      # one light sweep over "בקרוב"
    if 0 < sx < 1.3:
        band = np.exp(-((((W - XX) + (YY - 1110) * .4) - sx * W) / 80) ** 2) * (np.abs(YY - 1110) < 60)
        f += band[..., None] * np.array([60, 120, 160], np.float32)
    k = ease((t - a - 2.0) / .6); RS.paste(f, CACHE["logo"], W / 2, 1400, alpha=k)
    return f, .7 * math.exp(-(t - a) / .3)


# --- timeline ----------------------------------------------------------------------------------------------
def frame_at(t):
    if t < T_GATE:
        f, flare = s_intro(t)
        # white-gold bloom growing out of the letter, then filling the frame for the cut
        d2 = ((XX - W / 2) / (W * (.35 + .9 * flare))) ** 2 + ((YY - H * .46) / (H * (.25 + .7 * flare))) ** 2
        bloom = np.exp(-d2)[..., None] * flare + ease((t - 3.12) / .18) * .9
        f = f + (1 - f / 420) * bloom * np.array([175, 218, 248], np.float32) * 1.2
        f = streak(f, .35 + flare * .5)
        f = vignette(f, .45 * (1 - flare))
        if t < .6: f = f * ease(t / .6)
    elif t < T_PEEK:
        f, glow = s_gate(t)
        f = grade(f); f = streak(f, .35)
        f = f * (1 - .45 * glow) + np.array([170, 215, 245], np.float32) * .45 * glow + f * .35 * glow
        f = vignette(f, .3)
    elif t < T_CARD:
        f, glow = s_peeks(t)
        f = grade(f); f = streak(f, .25)
        f = f * (1 - .4 * glow) + np.array([170, 215, 245], np.float32) * .4 * glow + f * .3 * glow
        f = vignette(f, .35)
    else:
        f, glow = s_card(t)
        f = f * (1 - .5 * glow) + np.array([200, 230, 250], np.float32) * .5 * glow + f * .2 * glow
        f = vignette(f, .12)
        if t > DUR - .35: f = f * (.85 + .15 * ease((DUR - t) / .35))
    return np.clip(grain(f, t), 0, 255).astype(np.uint8)


# --- sound: a built-in rise into the song's chorus, two clear hits --------------------------------------------
def tone(f0, dur, amp=1.0, attack=.01, decay=None):
    t = np.arange(int(dur * SR)) / SR
    env = np.minimum(t / attack, 1) * (np.exp(-t / decay) if decay else 1)
    return np.sin(2 * np.pi * f0 * t) * env * amp

def impact(dur=2.6, depth=1.0, seed=0):
    t = np.arange(int(dur * SR)) / SR
    f = 30 + 32 * np.exp(-t / .12)                         # pitch-dropping sub
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (.55 * depth)) * 1.0
    r = np.random.default_rng(seed); n = r.standard_normal(len(t))
    b, a = butter(2, 2500 / (SR / 2)); thump = lfilter(b, a, n) * np.exp(-t / .06) * .9
    b, a = butter(2, [3000 / (SR / 2), 12000 / (SR / 2)], btype="band"); air = lfilter(b, a, n) * np.exp(-t / .5) * .12
    return sub + thump + air

def riser(dur, seed=1):
    t = np.arange(int(dur * SR)) / SR; r = np.random.default_rng(seed); n = r.standard_normal(len(t))
    out = np.zeros_like(t); seg = int(.05 * SR)
    for i in range(0, len(t), seg):           # band-pass noise sweeping up
        fc = 600 * (14 ** (i / len(t)))
        b, a = butter(2, [fc / (SR / 2), min(fc * 1.8, SR / 2 - 100) / (SR / 2)], btype="band")
        out[i:i + seg] = lfilter(b, a, n[i:i + seg])
    pitch = 220 * 2 ** (t / dur * 2)
    sw = np.sin(2 * np.pi * np.cumsum(pitch) / SR) * .18
    return (out * .6 + sw) * (t / dur) ** 2.2

def build_audio(path):
    n = int(DUR * SR); y = np.zeros((n, 2))
    def add(sig, at, gain=1.0, pan=0.0):
        i = int(at * SR); s = sig[:max(0, n - i)] * gain
        y[i:i + len(s), 0] += s * (1 - max(pan, 0)); y[i:i + len(s), 1] += s * (1 + min(pan, 0))
    # 0-3.3: a warm D drone that slowly swells, light chimes as the points gather, a rise into the gate
    t = np.arange(int(T_GATE * SR)) / SR
    sw = np.clip(t / 2.8, 0, 1) ** 1.5
    drone = (np.sin(2 * np.pi * 73.42 * t) * .5 + np.sin(2 * np.pi * 110 * t + .4 * np.sin(2 * np.pi * .3 * t)) * .35
             + np.sin(2 * np.pi * 146.83 * t * 1.002) * .25) * sw * .11
    add(drone, 0, 1.0)
    for i, (f0, at) in enumerate(((1174.7, .35), (1396.9, .9), (1760, 1.45), (2349.3, 2.0), (1760, 2.35), (2793.8, 2.6))):
        add(RT.bell(f0, 2.2, SR), at, .035, pan=(-.4, .4)[i % 2])
    rs = riser(1.45); add(rs, T_GATE - 1.45 - .06, .28)
    # 3.3: the song's chorus enters with the gate, on a deep hit
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{23.06}", "-t", f"{T_CARD - T_GATE + .02}", "-i", RC.SONG,
                          "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    song = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
    song[-int(.03 * SR):] *= np.linspace(1, 0, int(.03 * SR))[:, None]
    i = int(T_GATE * SR); y[i:i + len(song)] += song[:n - i] * 1.0
    add(impact(2.4, 1.0, 1), T_GATE, .5)
    # the song's last moment rings out in a long reverb under the card
    ir_t = np.arange(int(3.2 * SR)) / SR; r = np.random.default_rng(3)
    ir = r.standard_normal((len(ir_t), 2)) * np.exp(-ir_t / .9)[:, None]
    tail = song[-int(.35 * SR):]
    wet = np.stack([fftconvolve(tail[:, c], ir[:, c]) for c in range(2)], 1); wet /= np.abs(wet).max()
    b, a = butter(2, 1800 / (SR / 2)); wet = lfilter(b, a, wet, axis=0)
    j = int((T_CARD - .35) * SR); m = min(len(wet), n - j); y[j:j + m] += wet[:m] * .22
    # 9.05: the final hit, an open chord that stays, one bell on "בקרוב"
    add(impact(2.8, 1.4, 2), T_CARD, .6)
    t = np.arange(int((DUR - T_CARD) * SR)) / SR
    pad = sum(np.sin(2 * np.pi * f0 * t * (1 + dt)) for f0, dt in ((146.83, 0), (220, .001), (293.66, -.001), (329.63, .0015), (440, 0)))
    pad *= np.minimum(t / .5, 1) * np.exp(-t / 3.5) * .09
    b, a = butter(2, 2200 / (SR / 2)); add(lfilter(b, a, pad), T_CARD, 1.0)
    add(RT.bell(880, 3.0, SR) + .5 * RT.bell(1318.5, 3.0, SR), T_CARD + 1.6, .14)
    y[-int(.4 * SR):] *= np.linspace(1, 0, int(.4 * SR))[:, None] ** 1.5
    y = np.tanh(y / .8) * .8               # soft clip: the hits stay punchy without pulling the music down
    y *= .89 / np.abs(y).max()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-", path],
                   input=y.astype(np.float32).tobytes(), check=True)


def main():
    global CLIPS
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", default="")
    ap.add_argument("--audio-only", action="store_true", help="rebuild the sound and remux it onto the existing render")
    ap.add_argument("--out", default=os.path.join(ROOT, "dist", "teaser-v2-12s-9x16.mp4"))
    a = ap.parse_args()
    def level(wav):  # one fixed gain to -14 LUFS keeps the build intact (loudnorm's dynamic mode flattens it)
        out = subprocess.run(["ffmpeg", "-i", wav, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
        I = float(out.rsplit("I:", 1)[1].split("LUFS")[0])
        return f"volume={-14 - I:.2f}dB,alimiter=limit=0.84:level=disabled"
    if a.audio_only:
        wav = os.path.join(ROOT, ".cache", "teaser-v2.wav"); build_audio(wav); AF = level(wav); tmp = a.out + ".tmp.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.out, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                        "-af", AF, "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-shortest", "-movflags", "+faststart", tmp], check=True)
        os.replace(tmp, a.out); print("remuxed", a.out); return
    CLIPS = RC.Clips(); RS.CLIPS = CLIPS
    if a.stills:
        d = os.path.join(ROOT, ".cache", "teaser-v2-stills"); os.makedirs(d, exist_ok=True)
        for ts in a.stills.split(","):
            p = os.path.join(d, f"{float(ts):05.2f}.jpg"); cv2.imwrite(p, frame_at(float(ts))); print(p)
        return
    wav = os.path.join(ROOT, ".cache", "teaser-v2.wav"); build_audio(wav); AF = level(wav)
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-map", "0:v", "-map", "1:a",
           "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-maxrate", "9M", "-bufsize", "18M", "-tune", "film",
           "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
           "-af", AF,
           "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-shortest", "-movflags", "+faststart", a.out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for k in range(int(DUR * FPS)):
        p.stdin.write(frame_at(k / FPS).tobytes())
    p.stdin.close(); p.wait(); print("wrote", a.out)


if __name__ == "__main__":
    main()
