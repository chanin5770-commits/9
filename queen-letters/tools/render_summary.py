#!/usr/bin/env python3
"""סרטון סיכום 50 שניות (9:16): מה יש בערכה ״מלך ומלכת האותיות״.

  python3 tools/render_summary.py                    # -> dist/kit-summary-50s-9x16.mp4
  python3 tools/render_summary.py --stills 2,6,10,15

Everything shown comes from the existing materials: the clip footage, the posters and logo in
assets/kit/, and the real worksheet pages and site screens taken from the site screen recording
(assets/kit/site-recording.mp4). Nothing is generated to look like kit content.
Music: 50 s of the original song (88.10 -> 138.10), which stops by itself at the end.
"""
import argparse, math, os, subprocess, json
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter

import render_clip as RC
import render_teaser as RT

ROOT = RC.ROOT
KIT = os.path.join(ROOT, "assets", "kit")
W, H, FPS, DUR = 1080, 1920, 24, 50.0
SONG_AT = 88.10
SR = 48000
# song downbeats from SONG_AT on, as video time
BARS = [round(b - SONG_AT, 3) for b in (88.10, 89.70, 91.32, 92.93, 94.53, 96.13, 97.73, 99.33, 100.94, 102.54,
        104.14, 105.74, 107.35, 108.95, 110.55, 112.15, 113.75, 115.36, 116.96, 118.56, 120.16, 121.79,
        123.39, 124.99, 126.60, 128.20, 129.80, 131.40, 133.00, 134.61, 136.21, 137.81)]
B = BARS

# brand colours (BGR)
BURG = (52, 22, 128); PLUM = (110, 40, 120)
TRACK = {  # title colour, panel colour  (taken from the site)
    "boys":  ((158, 94, 45), (248, 234, 220)),
    "girls": ((107, 51, 168), (230, 220, 246)),
    "mixed": ((180, 60, 110), (247, 224, 233)),
}

ease = RT.ease


# --- helpers -----------------------------------------------------------------------------------
def font(name, size, var=None):
    f = ImageFont.truetype(os.path.join(RC.FONTS, name), size, layout_engine=ImageFont.Layout.RAQM)
    if var: f.set_variation_by_name(var)
    return f

FR = "FrankRuhlLibre[wght].ttf"; HB = "Heebo[wght].ttf"

def text_sprite(s, fname, size, var, color, edge=None, shadow=True, track=0):
    """Hebrew-safe text sprite (BGRA float32), supersampled. color: BGR tuple or 'gold'."""
    S = 2
    f = font(fname, size * S, var)
    box = f.getbbox(s, direction="rtl", language="he") if not track else (0, 0, 0, 0)
    if track:
        ws = [f.getlength(c) for c in s]; tw = sum(ws) + track * S * (len(s) - 1)
        asc, desc = f.getmetrics(); box = (0, 0, int(tw), asc + desc)
    pad = 30 * S
    w, h = box[2] - box[0] + 2 * pad, box[3] - box[1] + 2 * pad
    m = Image.new("L", (w, h), 0); d = ImageDraw.Draw(m)
    if track:
        x = pad
        for c, cw in zip(s, ws): d.text((x, pad), c, font=f, fill=255); x += cw + track * S
    else:
        d.text((pad - box[0], pad - box[1]), s, font=f, fill=255, direction="rtl", language="he")
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if shadow:
        sh = Image.new("RGBA", (w, h), (80, 30, 40, 0))
        sh.putalpha(m.filter(ImageFilter.GaussianBlur(8 * S)).point(lambda v: int(v * .28)))
        out = Image.alpha_composite(out, sh.transform(sh.size, Image.AFFINE, (1, 0, 0, 0, 1, -5 * S)))
    if edge == "gold":
        out = Image.alpha_composite(out, RC.gold_fill(m.filter(ImageFilter.MaxFilter(7))))
    if color == "gold":
        out = Image.alpha_composite(out, RC.gold_fill(m))
    else:
        c = Image.new("RGBA", (w, h), (color[2], color[1], color[0], 255)); c.putalpha(m)
        out = Image.alpha_composite(out, c)
    a = np.array(out.resize((w // S, h // S), Image.LANCZOS)).astype(np.float32)
    return a[..., [2, 1, 0, 3]]


def paste(f, spr, cx, cy, scale=1.0, alpha=1.0, angle=0.0):
    if alpha <= 0.003: return
    if angle:
        h, w = spr.shape[:2]; d = int(math.hypot(w, h)) + 4
        M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0); M[0, 2] += (d - w) / 2; M[1, 2] += (d - h) / 2
        spr = cv2.warpAffine(spr, M, (d, d), flags=cv2.INTER_CUBIC)
    RT.paste(f, spr, cx, cy, scale, alpha)


def rounded_mask(w, h, r):
    m = Image.new("L", (w * 2, h * 2), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w * 2 - 1, h * 2 - 1], radius=r * 2, fill=255)
    return np.array(m.resize((w, h), Image.LANCZOS), np.float32)


def with_shadow(img_bgr, radius=28, blur=26, opacity=.32, border=0, border_col=(255, 255, 255)):
    """image -> BGRA sprite with rounded corners and a soft drop shadow."""
    h, w = img_bgr.shape[:2]; pad = blur * 2
    if border:
        img_bgr = cv2.copyMakeBorder(img_bgr, border, border, border, border, cv2.BORDER_CONSTANT, value=border_col)
        h, w = img_bgr.shape[:2]
    m = rounded_mask(w, h, radius)
    out = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.float32)
    sh = np.zeros(out.shape[:2], np.float32); sh[pad + 14:pad + 14 + h, pad:pad + w] = m
    sh = cv2.GaussianBlur(sh, (0, 0), blur) * opacity
    out[..., :3] = np.array([60, 50, 70], np.float32); out[..., 3] = sh
    reg = out[pad:pad + h, pad:pad + w]
    a = m[..., None] / 255
    reg[..., :3] = img_bgr.astype(np.float32) * a + reg[..., :3] * (1 - a)
    reg[..., 3] = np.maximum(reg[..., 3], m)
    return out


def load(name):
    im = Image.open(os.path.join(KIT, name)).convert("RGBA")
    a = np.array(im).astype(np.float32)
    return a[..., [2, 1, 0, 3]]


def rec_frame(t, crop=None):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", os.path.join(KIT, "site-recording.mp4"),
                          "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True, check=True).stdout
    f = np.frombuffer(raw, np.uint8).reshape(2340, 1080, 3)
    if crop: x, y, w, h = crop; f = f[y:y + h, x:x + w]
    return f.copy()


# --- shared background and finishing ------------------------------------------------------
CREAM_BG = None
def cream(t):
    global CREAM_BG
    if CREAM_BG is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.clip(np.sqrt(((xx - W / 2) / (W * .75)) ** 2 + ((yy - H * .42) / (H * .62)) ** 2), 0, 1)
        c0, c1 = np.array([238, 246, 253], np.float32), np.array([219, 214, 244], np.float32)
        CREAM_BG = c0 * (1 - d[..., None] ** 1.4) + c1 * d[..., None] ** 1.4
    return CREAM_BG.copy()

SPARK = None
def finish(f, t, glow=0.0, spark=0.45):
    global SPARK
    if SPARK is None: SPARK = RT.Sparkles()
    small = cv2.resize(f, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    hl = cv2.GaussianBlur(np.clip(small - 200, 0, None) * 1.5, (0, 0), 9)
    f = f + cv2.resize(hl, (W, H)) * 0.25
    f = f + SPARK.layer(t, spark)[..., None] * RT.GOLD * 0.7
    if glow > 0: f = f * (1 - 0.4 * glow) + (RT.GOLD * 1.05 + 40) * 0.4 * glow + f * 0.3 * glow
    return np.clip(f, 0, 255)


def header(f, t, t0, title, sub=None, y=370):
    """section title (burgundy, gold edge) with an optional sub line, eased in from t0."""
    key = (title, sub)
    if key not in HEAD:
        HEAD[key] = (text_sprite(title, FR, 92, "Black", BURG, edge="gold"),
                     text_sprite(sub, HB, 46, "Medium", PLUM, shadow=False) if sub else None)
    a1 = ease((t - t0) / .45); a2 = ease((t - t0 - .25) / .45)
    paste(f, HEAD[key][0], W / 2, y + (1 - a1) * 16, alpha=a1)
    if HEAD[key][1] is not None: paste(f, HEAD[key][1], W / 2, y + 100 + (1 - a2) * 12, alpha=a2)
HEAD = {}


# --- scenes ---------------------------------------------------------------------------------
CLIPS = None
def clip(t, name, t0, t1, a, b, z=(1.0, 1.06), path=((0, .5, .5), (1, .5, .5))):
    return RT.vertical(CLIPS, (t0, t1, name, a, b, z, list(path)), t)


def s_open(t):  # 0 -> B2: the letter circle, brand line
    f = clip(t, "finale-circle", 0, B[2], 0.0, 3.2, (1.06, 1.0), ((0, .5, .52), (1, .5, .5)))
    if "brand" not in CACHE: CACHE["brand"] = plate(text_sprite("ChaniLi Studio", "CormorantGaramond[wght].ttf", 66, "Bold", BURG, track=6), 34)
    paste(f, CACHE["brand"], W / 2, 360, alpha=ease((t - .5) / .7) * (1 - ease((t - (B[2] - .5)) / .5)))
    return f, 0.75
CACHE = {}


def plate(spr, pad=40, alpha=.86):
    """put a text sprite on a soft cream rounded plate, so it reads over bright footage."""
    spr = np.pad(spr, ((pad, pad), (pad * 2, pad * 2), (0, 0)))
    a = spr[..., 3] > 8; ys, xs = np.where(a)
    x0, x1, y0, y1 = xs.min() - pad, xs.max() + pad, ys.min() - pad * .6, ys.max() + pad * .6
    h, w = spr.shape[:2]; out = spr.copy()
    m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rounded_rectangle([x0, y0, x1, y1], radius=int((y1 - y0) / 2), fill=255)
    m = np.array(m.filter(ImageFilter.GaussianBlur(3)), np.float32) * alpha
    base = np.zeros_like(spr); base[..., :3] = np.array([238, 246, 253], np.float32); base[..., 3] = m
    al = spr[..., 3:4] / 255
    out[..., :3] = spr[..., :3] * al + base[..., :3] * (1 - al)
    out[..., 3] = np.maximum(spr[..., 3], m)
    return out


def s_poster(t):  # B2 -> B5: the product poster
    if "poster" not in CACHE:
        p = load("poster-king-queen.png"); CACHE["poster"] = with_shadow(p[..., :3], radius=24, blur=30, opacity=.35)
        bg = cv2.GaussianBlur(cv2.resize(p[..., :3], (W, int(W * p.shape[0] / p.shape[1]))), (0, 0), 40)
        CACHE["poster_bg"] = cv2.resize(bg, (W, H)).astype(np.float32)
    k = (t - B[2]) / (B[5] - B[2])
    f = CACHE["poster_bg"] * 0.55 + cream(t) * 0.45
    paste(f, CACHE["poster"], W / 2, H / 2 + 10, scale=0.93 + 0.04 * ease(k), alpha=ease((t - B[2]) / .4))
    return f, 0.4


def counter(n, size, color):
    key = ("num", n, size)
    if key not in CACHE: CACHE[key] = text_sprite(str(n), FR, size, "Black", color, edge="gold")
    return CACHE[key]

def s_numbers(t):  # B5 -> B8: 22 letters, 387 pages
    f = cream(t)
    if "faint" not in CACHE:
        CACHE["faint"] = [(RT.letter_sprite(ch, 300), x, y) for ch, x, y in
                          (("א", .14, .20), ("ב", .86, .26), ("ג", .12, .78), ("ד", .88, .74), ("ה", .5, .9))]
    for i, (spr, x, y) in enumerate(CACHE["faint"]):
        paste(f, spr, x * W, y * H - (t - B[5]) * 14, scale=0.8, alpha=0.22)
    k1 = ease((t - B[5]) / 1.1); n1 = max(1, int(round(22 * k1)))
    paste(f, counter(n1, 270, "gold"), W / 2, 560, alpha=ease((t - B[5]) / .3))
    if "l_letters" not in CACHE:
        CACHE["l_letters"] = text_sprite("אותיות", FR, 96, "Black", BURG, edge="gold")
        CACHE["l_pages"] = text_sprite("דפי מקור בספרייה", FR, 86, "Black", BURG, edge="gold")
        CACHE["l_by"] = text_sprite("דפי עבודה, משחקים ופעילויות — לפי אות, מסלול ורמה", HB, 40, "Medium", PLUM, shadow=False)
    paste(f, CACHE["l_letters"], W / 2, 760, alpha=ease((t - B[5] - .2) / .4))
    k2 = ease((t - B[6]) / 1.1); n2 = int(round(387 * k2))
    if t >= B[6]:
        paste(f, counter(max(n2, 1), 230, "gold"), W / 2, 1030, alpha=ease((t - B[6]) / .3))
        paste(f, CACHE["l_pages"], W / 2, 1220, alpha=ease((t - B[6] - .2) / .4))
    paste(f, CACHE["l_by"], W / 2, 1400, alpha=ease((t - B[7]) / .5))
    return f, 0.5


def track_card(kind):
    title_col, panel = TRACK[kind]
    if kind == "boys":
        img = cv2.imread(os.path.join(KIT, "site-tracks.jpg"))[306:971, 76:1004]
        label, title, line = "מסלול לבנים", "מלך האותיות", "עולם של אותיות, קדושה וגילוי"
    elif kind == "girls":
        img = cv2.imread(os.path.join(KIT, "poster-queen.png"))[455:1265, 30:1025]
        label, title, line = "מסלול לבנות", "מלכת האותיות", "אותיות קטנות. רגעים גדולים של למידה."
    else:
        img = cv2.imread(os.path.join(KIT, "poster-king-queen.png"))[610:1250, 110:1000]
        label, title, line = "בנים ובנות יחד", "מסלול משולב", "שני עולמות קסומים, חוויה אחת שלמה"
    cw, ch = 880, 1060
    card = np.zeros((ch, cw, 3), np.float32) + np.array(panel, np.float32)
    iw = cw - 60; ih = int(iw * img.shape[0] / img.shape[1]); ih = min(ih, 620)
    im = cv2.resize(img, (iw, int(iw * img.shape[0] / img.shape[1])), interpolation=cv2.INTER_AREA)
    y0 = (im.shape[0] - ih) // 2; im = im[y0:y0 + ih]
    m = rounded_mask(iw, ih, 26)[..., None] / 255
    card[30:30 + ih, 30:30 + iw] = im * m + card[30:30 + ih, 30:30 + iw] * (1 - m)
    spr = with_shadow(card.astype(np.uint8), radius=40, blur=30, opacity=.3)
    pad = 60
    for s, fn, size, var, col, y in ((label, HB, 40, "Medium", title_col, 30 + ih + 70),
                                      (title, FR, 92, "Black", title_col, 30 + ih + 170),
                                      (line, HB, 42, "Regular", (90, 70, 80), 30 + ih + 280)):
        ts = text_sprite(s, fn, size, var, col, shadow=False)
        RT.paste(spr[pad:pad + ch, pad:pad + cw, :3], ts, cw / 2, y, 1.0, 1.0)   # writes through the view
    return spr

def s_tracks(t):  # B8 -> B12: three tracks, one per bar, then together
    f = cream(t)
    header(f, t, B[8], "שלושה מסלולים קסומים", "לכל גן, הדרך שלו", y=300)
    if "cards" not in CACHE: CACHE["cards"] = {k: track_card(k) for k in ("boys", "girls", "mixed")}
    starts = {"boys": B[8] + .15, "girls": B[9], "mixed": B[10]}
    if t < B[11]:
        for k, t0 in starts.items():
            t_in = ease((t - t0) / .45)
            nxt = [s for s in starts.values() if s > t0]
            t_out = ease((t - nxt[0]) / .45) if nxt else 0.0
            if t_in <= 0 or t_out >= 1: continue
            x = W / 2 - (1 - t_in) * W * .9 + t_out * W * .9      # new cards enter from the left (RTL)
            paste(f, CACHE["cards"][k], x, 1030, scale=0.98, alpha=min(t_in * 1.5, 1) * (1 - t_out))
    else:  # all three side by side, slightly fanned
        k = ease((t - B[11]) / .5)
        for name, dx, ang in (("boys", 285, -6), ("girls", 0, 0), ("mixed", -285, 6)):   # right to left
            a = 1.0 if name == "mixed" else k
            paste(f, CACHE["cards"][name], W / 2 + dx * k, 1030 + abs(dx) / 10 * k, scale=0.98 - 0.52 * k, alpha=a, angle=ang * k)
    return f, 0.4


PAGE_T = [("cover", 22.5), ("guide", 23.9), ("bet", 25.4), ("gimel", 26.4), ("dalet", 27.4), ("he", 28.4), ("vav", 29.1)]
HAS_T = [("aleph", 40.0), ("bet", 41.1), ("gimel", 42.1)]
BOOK_BOX = (124, 679, 832, 1177); COVER_BOX = (185, 755, 710, 1039)

def page_sprite(t_rec, box, width):
    pg = rec_frame(t_rec, box)
    pg = cv2.resize(pg, (width, int(width * pg.shape[0] / pg.shape[1])), interpolation=cv2.INTER_AREA)
    return with_shadow(pg, radius=10, blur=22, opacity=.35, border=6)

def s_books(t):  # B12 -> B16: original workbooks, three levels, the pages fall onto a stack
    f = cream(t)
    header(f, t, B[12], "חוברות עבודה מקוריות", "בשלוש רמות — והכול יחד, בחוברת מלאה", y=300)
    if "pages" not in CACHE:
        CACHE["pages"] = [page_sprite(tr, COVER_BOX if n == "cover" else BOOK_BOX, 560) for n, tr in PAGE_T]
        CACHE["levels"] = [text_sprite(s, HB, 44, "Bold", (255, 255, 255), shadow=False) for s in ("צעירים", "בינוני", "בוגרים")]
    # level pills (right to left), lit one after another
    for i, spr in enumerate(CACHE["levels"]):
        on = ease((t - (B[12] + .3 + i * .5)) / .3)
        x = W / 2 + (1 - i) * 250; y = 500
        pill = np.zeros((84, 220, 3), np.float32) + np.array(TRACK["boys"][0], np.float32)
        ps = with_shadow(pill.astype(np.uint8), radius=42, blur=10, opacity=.25)
        paste(f, ps, x, y, alpha=on); paste(f, spr, x, y - 2, alpha=on)
    step = (B[16] - B[12] - .8) / len(CACHE["pages"])
    for i, spr in enumerate(CACHE["pages"]):
        t0 = B[12] + .2 + i * step
        k = ease((t - t0) / .45)
        if k <= 0: continue
        ang = (-6, 5, -3, 4, -5, 3, 0)[i]
        paste(f, spr, W / 2 + (1 - k) * -700, 1080 + (1 - k) * 60, scale=1.0, alpha=min(k * 2, 1), angle=ang * (0.4 + 0.6 * k))
    return f, 0.3


def s_hasidic(t):  # B16 -> B19: the Hasidic letters booklet (א, ב, ג)
    f = cream(t)
    header(f, t, B[16], "אותיות חסידיות", "היכרות עם האותיות ועם המילים המלוות אותן", y=300)
    if "has" not in CACHE: CACHE["has"] = [page_sprite(tr, BOOK_BOX, 660) for _, tr in HAS_T]
    for i, spr in enumerate(CACHE["has"]):
        t0 = B[16] + i * (B[17] - B[16]) + (.15 if i == 0 else 0)
        k = ease((t - t0) / .5)
        nxt = B[16] + (i + 1) * (B[17] - B[16])
        out = ease((t - nxt) / .5) if i < 2 else 0
        if k <= 0 or out >= 1: continue
        paste(f, spr, W / 2 - (1 - k) * 760 + out * 140, 1050, scale=1.0 - out * .12, alpha=k * (1 - out), angle=(1 - k) * -8)
    return f, 0.35


PHONE = None
def phone_frame():
    sw, sh = 540, 1025                  # screen, same aspect as the recording without the system bars
    bez = 22
    w, h = sw + 2 * bez, sh + 2 * bez
    body = np.zeros((h, w, 3), np.float32) + np.array([150, 170, 205], np.float32)   # rose gold
    hl = np.linspace(1.15, .85, w)[None, :, None]; body *= hl
    spr = with_shadow(np.clip(body, 0, 255).astype(np.uint8), radius=70, blur=34, opacity=.35)
    return spr, (sw, sh, bez)

def s_site(t):  # B19 -> B22: the real site, all content in one place
    global PHONE
    f = cream(t)
    header(f, t, B[19], "כל התוכן, במקום אחד", "מסלולים · חוברות · קליפים ושירים · מועדפים", y=300)
    if PHONE is None:
        PHONE = phone_frame()
        rt0 = 6.2                                       # recording: home, tracks, features, played at 0.8x
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{rt0}", "-t", f"{(B[22] - B[19]) * .8 + .5}", "-i", os.path.join(KIT, "site-recording.mp4"),
                              "-vf", f"fps=30,crop=1080:2050:0:90,scale={PHONE[1][0]}:{PHONE[1][1]}:flags=lanczos",
                              "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True, check=True).stdout
        sw, sh, _ = PHONE[1]
        CACHE["rec"] = np.frombuffer(raw, np.uint8).reshape(-1, sh, sw, 3)
    spr, (sw, sh, bez) = PHONE
    k = ease((t - B[19]) / .5)
    ph = spr.copy()
    fr = CACHE["rec"][min(max(int((t - B[19]) * .8 * 30), 0), len(CACHE["rec"]) - 1)]
    pad = (ph.shape[1] - (sw + 2 * bez)) // 2
    m = rounded_mask(sw, sh, 52)[..., None] / 255
    reg = ph[pad + bez:pad + bez + sh, pad + bez:pad + bez + sw]
    reg[..., :3] = fr * m + reg[..., :3] * (1 - m)
    paste(f, ph, W / 2, 1080 + (1 - k) * 120, scale=0.98, alpha=k)
    return f, 0.3


def s_clips(t):  # B22 -> B24: the clips and songs
    a = B[22]; mid = (B[22] + B[24]) / 2
    if t < mid: f = clip(t, "letter-dance", a, mid, 0.2, 1.8, (1.0, 1.06), ((0, .45, .5), (1, .47, .5)))
    else: f = clip(t, "first-letter", mid, B[24], 6.2, 7.8, (1.08, 1.14), ((0, .42, .45), (1, .44, .45)))
    if "clip_badge" not in CACHE:
        CACHE["clip_badge"] = plate(text_sprite("קליפים ושירים", FR, 92, "Black", BURG, edge="gold"), 46)
        CACHE["clip_sub"] = plate(text_sprite("צפייה והאזנה", HB, 46, "Medium", PLUM, shadow=False), 30)
        d = 120; S2 = 4; m = Image.new("L", (d * S2, d * S2), 0); dr = ImageDraw.Draw(m)
        dr.ellipse([0, 0, d * S2 - 1, d * S2 - 1], fill=255)
        tri = Image.new("L", (d * S2, d * S2), 0)
        ImageDraw.Draw(tri).polygon([(d * S2 * .40, d * S2 * .29), (d * S2 * .40, d * S2 * .71), (d * S2 * .74, d * S2 * .5)], fill=255)
        m, tri = m.resize((d, d), Image.LANCZOS), tri.resize((d, d), Image.LANCZOS)
        g = np.zeros((d, d, 4), np.float32); g[..., :3] = np.array(BURG, np.float32); g[..., 3] = np.array(m, np.float32)
        tw = np.array(tri, np.float32)[..., None] / 255; g[..., :3] = g[..., :3] * (1 - tw) + 255 * tw
        CACHE["play"] = g
    al = ease((t - a - .2) / .4)
    paste(f, CACHE["play"], W / 2, 330, alpha=al)
    paste(f, CACHE["clip_badge"], W / 2, 470, alpha=al); paste(f, CACHE["clip_sub"], W / 2, 570, alpha=ease((t - a - .45) / .4))
    return f, 0.6


def kenburns(img, t, t0, t1, c0, c1, z0, z1):
    """vertical 9:16 crop of a still image with a slow move. c=(x,y) centre in 0..1."""
    h, w = img.shape[:2]; p = ease((t - t0) / (t1 - t0))
    z = z0 + (z1 - z0) * p; cx = c0[0] + (c1[0] - c0[0]) * p; cy = c0[1] + (c1[1] - c0[1]) * p
    ch = min(h, w * 16 / 9) / z; cw = ch * 9 / 16
    x0 = min(max(cx * w - cw / 2, 0), w - cw); y0 = min(max(cy * h - ch / 2, 0), h - ch)
    s = H / ch
    return cv2.warpAffine(img, np.float32([[s, 0, -x0 * s], [0, s, -y0 * s]]), (W, H), flags=cv2.INTER_LANCZOS4,
                          borderMode=cv2.BORDER_REFLECT).astype(np.float32)

def s_finale(t):  # B24 -> B28: chorus montage, queen and both characters
    if t < B[25]: return clip(t, "finale-circle", B[24], B[25], 3.2, 4.8, (1.0, 1.06)), 0.8
    if t < B[26]: return clip(t, "letter-stairs", B[25], B[26], 4.6, 6.2, (1.04, 1.1), ((0, .45, .45), (1, .45, .42))), 0.8
    if "lib" not in CACHE:
        CACHE["lib"] = cv2.imread(os.path.join(KIT, "queen-library.png"))
        CACHE["both"] = cv2.imread(os.path.join(KIT, "poster-king-queen.png"))
    if t < B[27]: return kenburns(CACHE["lib"], t, B[26], B[27], (.40, .5), (.40, .48), 1.0, 1.06), 0.7
    return kenburns(CACHE["both"], t, B[27], B[28], (.52, .62), (.52, .60), 1.05, 1.12), 0.6


def s_end(t):  # B28 -> end: product name, the ChaniLi logo
    if RT.CARD is None: RT.card(0)          # the teaser's end-card background and gold frame
    f = RT.CARD["bg"].copy()
    a = B[28]
    if "end" not in CACHE:
        CACHE["end"] = dict(
            title=text_sprite("מלך ומלכת האותיות", FR, 112, "Black", BURG, edge="gold"),
            sub=text_sprite("הא״ב החסידי שלי", FR, 70, "Bold", PLUM, shadow=False),
            line=text_sprite("תוכנית שנתית חסידית לגני חב״ד", HB, 46, "Medium", (90, 70, 80), shadow=False),
            logo=load("logo-chanili.png"))
        lg = CACHE["end"]["logo"]; s = 900 / lg.shape[1]
        CACHE["end"]["logo"] = cv2.resize(lg, (900, int(lg.shape[0] * s)), interpolation=cv2.INTER_AREA)
    E = CACHE["end"]
    ornament = RT.CARD["orn"]
    al = ease((t - a - .1) / .7)
    o = ornament[..., 3:4] / 255 * al; f = f * (1 - o) + ornament[..., :3] * o
    for key, y, t0 in (("title", 560, .25), ("sub", 690, .6), ("line", 790, .9)):
        k = ease((t - a - t0) / .6); paste(f, E[key], W / 2, y + (1 - k) * 14, alpha=k)
    k = ease((t - a - 1.4) / .8)
    paste(f, E["logo"], W / 2, 1180 + (1 - k) * 20, scale=0.96 + 0.04 * k, alpha=k)
    return f, 0.4


SCENES = [  # (start, end, fn, transition into this scene)
    (0.0,   B[2],  s_open,    "fade"),
    (B[2],  B[5],  s_poster,  "glow"),
    (B[5],  B[8],  s_numbers, "glow"),
    (B[8],  B[12], s_tracks,  "glow"),
    (B[12], B[16], s_books,   "glow"),
    (B[16], B[19], s_hasidic, "glow"),
    (B[19], B[22], s_site,    "glow"),
    (B[22], B[24], s_clips,   "flash"),
    (B[24], B[28], s_finale,  "flash"),
    (B[28], DUR,   s_end,     "glow"),
]
# hard cuts inside the montage scenes also get a short golden accent
ACCENTS = [B[25], B[26], B[27], (B[22] + B[24]) / 2]


def frame_at(t):
    i = max(k for k, s in enumerate(SCENES) if s[0] <= t)
    s0, s1, fn, tr = SCENES[i]
    f, spark = fn(t)
    glow = 0.0
    if tr == "glow" and t < s0 + .3:        # light dissolve, second half
        pf, _ = SCENES[i - 1][2](t)
        a = ease((t - (s0 - .3)) / .6); f = pf * (1 - a) + f * a; glow = math.sin(math.pi * a) * .55
    if i + 1 < len(SCENES) and SCENES[i + 1][3] == "glow" and t >= SCENES[i + 1][0] - .3:
        nf, _ = SCENES[i + 1][2](t)
        a = ease((t - (SCENES[i + 1][0] - .3)) / .6); f = f * (1 - a) + nf * a; glow = math.sin(math.pi * a) * .55
    if tr == "flash": glow = max(glow, .42 * math.exp(-(t - s0) / .22))
    for c in ACCENTS:
        if 0 <= t - c < .5: glow = max(glow, .3 * math.exp(-(t - c) / .18))
    if tr == "fade" and t < .5: f = f * ease(t / .5)
    return finish(f, t, glow, spark).astype(np.uint8)


# --- sound ------------------------------------------------------------------------------------------
def build_audio(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{SONG_AT}", "-t", f"{DUR}", "-i", RC.SONG,
                          "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
    n = int(DUR * SR); x = np.pad(x, ((0, max(0, n - len(x))), (0, 0)))[:n]
    x[:int(.25 * SR)] *= np.linspace(0, 1, int(.25 * SR))[:, None] ** 2
    # one bell as the logo lands (A, open), letting the song's own stop carry the ending
    s = (RT.bell(880.0, 3.5, SR) + .6 * RT.bell(440.0, 3.5, SR)) * .12
    i = int((B[28] + 1.4) * SR); x[i:i + len(s)] += np.stack([s * .9, s], 1)[:n - i]
    x[-int(.6 * SR):] *= np.linspace(1, 0, int(.6 * SR))[:, None]
    x *= min(1.0, .89 / np.abs(x).max())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-", path],
                   input=x.astype(np.float32).tobytes(), check=True)


def main():
    global CLIPS
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", default="")
    ap.add_argument("--out", default=os.path.join(ROOT, "dist", "kit-summary-50s-9x16.mp4"))
    a = ap.parse_args()
    CLIPS = RC.Clips()
    if a.stills:
        d = os.path.join(ROOT, ".cache", "summary-stills"); os.makedirs(d, exist_ok=True)
        for ts in a.stills.split(","):
            p = os.path.join(d, f"{float(ts):05.2f}.jpg"); cv2.imwrite(p, frame_at(float(ts))); print(p)
        return
    wav = os.path.join(ROOT, ".cache", "summary.wav"); build_audio(wav)
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-map", "0:v", "-map", "1:a",
           "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-maxrate", "6M", "-bufsize", "12M",
           "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
           "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
           "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-shortest", "-movflags", "+faststart", a.out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for n in range(int(DUR * FPS)):
        p.stdin.write(frame_at(n / FPS).tobytes())
        if n % 120 == 0: print(f"{n / FPS:5.1f}s", flush=True)
    p.stdin.close(); p.wait(); print("wrote", a.out)


if __name__ == "__main__":
    main()
