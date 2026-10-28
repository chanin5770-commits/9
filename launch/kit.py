"""Drawing toolkit for the launch film: text, gold, phones, sparkles, transitions.

Everything here is a pure function of its arguments (plus caches), so any frame
can be rendered on its own and the render can be split across processes.
"""
import math
import os
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS = 1080, 1920, 30

# brand palette
CREAM = (253, 247, 241)
PEARL = (255, 252, 249)
POWDER = (249, 221, 229)
ROSE = (196, 92, 132)
OLD_ROSE = (176, 98, 128)
PLUM = (122, 31, 78)
MAUVE = (92, 52, 80)
GOLD = (214, 166, 72)
GOLD_DARK = (138, 92, 24)

FONTS = {
    'display': 'FrankRuhlLibre-Black.ttf',
    'serif': 'FrankRuhlLibre-Bold.ttf',
    'serif-md': 'FrankRuhlLibre-Medium.ttf',
    'sans': 'Heebo-Medium.ttf',
    'sans-b': 'Heebo-Bold.ttf',
    'sans-xb': 'Heebo-ExtraBold.ttf',
}


@lru_cache(maxsize=None)
def font(name, size):
    return ImageFont.truetype(os.path.join(HERE, 'fonts', FONTS[name]), size)


# ---------------------------------------------------------------- easing
def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def ease_out(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_back(x, s=1.9):
    x = clamp01(x)
    x -= 1
    return x * x * ((s + 1) * x + s) + 1


def prog(t, t0, dur):
    return clamp01((t - t0) / dur)


# ---------------------------------------------------------------- gradients
def vgrad(w, h, stops):
    """Vertical gradient as an RGB uint8 array; stops = [(pos, (r,g,b)), ...]."""
    ys = np.linspace(0, 1, h)
    out = np.zeros((h, 3))
    pos = [s[0] for s in stops]
    for c in range(3):
        out[:, c] = np.interp(ys, pos, [s[1][c] for s in stops])
    return np.repeat(out[:, None, :], w, axis=1).astype(np.uint8)


GOLD_STOPS = [(0, (255, 246, 214)), (0.32, (244, 210, 120)), (0.55, (204, 146, 50)),
              (0.78, (234, 186, 86)), (1, (255, 233, 168))]
ROSE_STOPS = [(0, (214, 112, 152)), (1, (160, 58, 104))]


# ---------------------------------------------------------------- text
@lru_cache(maxsize=None)
def text_img(txt, face, size, fill='plum', stroke=0, stroke_col=None, shadow=0.35,
             glow=0, glow_col=(255, 255, 255), direction='rtl', spacing=0):
    """Render one line of text to a tight RGBA image (cached)."""
    f = font(face, size)
    pad = int(size * 0.35) + stroke + glow * 2 + 10
    l, t, r, b = f.getbbox(txt, direction=direction, stroke_width=stroke)
    w, h = r - l + 2 * pad, b - t + 2 * pad
    org = (pad - l, pad - t)

    def mask(sw=0):
        m = Image.new('L', (w, h), 0)
        ImageDraw.Draw(m).text(org, txt, font=f, fill=255, direction=direction, stroke_width=sw,
                               stroke_fill=255)
        return m

    core = mask()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    if shadow:
        sh = mask(stroke).filter(ImageFilter.GaussianBlur(max(2, size * 0.05)))
        layer = Image.new('RGBA', (w, h), (90, 30, 60, 0))
        layer.putalpha(sh.point(lambda v: int(v * shadow)))
        out.alpha_composite(layer, (0, int(size * 0.04) + 2))
    if glow:
        g = mask(stroke + glow).filter(ImageFilter.GaussianBlur(glow))
        layer = Image.new('RGBA', (w, h), glow_col + (0,))
        layer.putalpha(g.point(lambda v: min(255, int(v * 1.6))))
        out.alpha_composite(layer)
    if stroke:
        layer = Image.new('RGBA', (w, h), (stroke_col or GOLD_DARK) + (0,))
        layer.putalpha(mask(stroke))
        out.alpha_composite(layer)
    if fill == 'gold':
        col = Image.fromarray(vgrad(w, h, [(0, GOLD_STOPS[0][1])] + [(pad / h + (h - 2 * pad) / h * p, c) for p, c in GOLD_STOPS] + [(1, GOLD_STOPS[-1][1])]))
    elif fill == 'rose':
        col = Image.fromarray(vgrad(w, h, [(pad / h, ROSE_STOPS[0][1]), (1 - pad / h, ROSE_STOPS[1][1])]))
    else:
        c = {'plum': PLUM, 'mauve': MAUVE, 'cream': PEARL, 'rose': ROSE}.get(fill, fill)
        col = Image.new('RGB', (w, h), c)
    layer = col.convert('RGBA')
    layer.putalpha(core)
    out.alpha_composite(layer)
    return out.crop(out.getbbox())


def place(canvas, img, cx, cy, scale=1.0, alpha=1.0):
    """Composite an RGBA sprite centred at (cx, cy)."""
    if alpha <= 0.003 or scale <= 0.01:
        return
    if abs(scale - 1) > 0.004:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))),
                         Image.BICUBIC)
    if alpha < 0.997:
        img = img.copy()
        img.putalpha(img.getchannel('A').point(lambda v: int(v * alpha)))
    canvas.alpha_composite(img, (round(cx - img.width / 2), round(cy - img.height / 2))) \
        if _inside(canvas, img, cx, cy) else _paste_clipped(canvas, img, cx, cy)


def _inside(canvas, img, cx, cy):
    x, y = round(cx - img.width / 2), round(cy - img.height / 2)
    return x >= 0 and y >= 0 and x + img.width <= canvas.width and y + img.height <= canvas.height


def _paste_clipped(canvas, img, cx, cy):
    x, y = round(cx - img.width / 2), round(cy - img.height / 2)
    l, t = max(0, -x), max(0, -y)
    r, b = min(img.width, canvas.width - x), min(img.height, canvas.height - y)
    if r > l and b > t:
        canvas.alpha_composite(img.crop((l, t, r, b)), (x + l, y + t))


def wipe_rtl(img, p):
    """Reveal a sprite from its right edge leftwards (Hebrew reading order)."""
    p = clamp01(p)
    if p >= 1:
        return img
    w = img.width
    edge = w * (1 - p)
    ramp = np.clip((np.arange(w) - edge) / 60 + 0.5, 0, 1)
    a = np.asarray(img.getchannel('A')).astype(np.float32) * ramp[None, :]
    out = img.copy()
    out.putalpha(Image.fromarray(a.astype(np.uint8)))
    return out


# ---------------------------------------------------------------- panels & shapes
@lru_cache(maxsize=None)
def panel(w, h, r=44, fill=(255, 251, 247), alpha=0.9, border=GOLD, bw=3, shadow=True):
    pad = 40
    im = Image.new('RGBA', (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    if shadow:
        m = Image.new('L', im.size, 0)
        ImageDraw.Draw(m).rounded_rectangle((pad, pad + 10, pad + w, pad + h + 10), r, fill=90)
        m = m.filter(ImageFilter.GaussianBlur(18))
        s = Image.new('RGBA', im.size, (120, 50, 80, 0))
        s.putalpha(m)
        im.alpha_composite(s)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((pad, pad, pad + w, pad + h), r, fill=fill + (int(255 * alpha),))
    if bw:
        d.rounded_rectangle((pad, pad, pad + w, pad + h), r, outline=border + (255,), width=bw)
        d.rounded_rectangle((pad + bw + 5, pad + bw + 5, pad + w - bw - 5, pad + h - bw - 5), r - 8,
                            outline=border + (110,), width=1)
    return im


def gold_fill_mask(mask):
    """Fill an L mask with the gold gradient, return RGBA."""
    w, h = mask.size
    bb = mask.getbbox() or (0, 0, w, h)
    g = np.zeros((h, w, 3), np.uint8)
    g[bb[1]:bb[3]] = vgrad(w, bb[3] - bb[1], GOLD_STOPS)
    im = Image.fromarray(g).convert('RGBA')
    im.putalpha(mask)
    return im


@lru_cache(maxsize=None)
def crown(width):
    """A gold crown with rose jewels, drawn at 4x and downsampled."""
    k = 4
    w = width * k
    h = int(w * 0.78)
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    base_y, top_y = h * 0.78, h * 0.18
    pts = [(w * 0.06, base_y), (w * 0.02, top_y + h * 0.18), (w * 0.27, h * 0.48), (w * 0.5, top_y),
           (w * 0.73, h * 0.48), (w * 0.98, top_y + h * 0.18), (w * 0.94, base_y)]
    d.polygon(pts, fill=255)
    d.rounded_rectangle((w * 0.05, base_y - h * 0.02, w * 0.95, h * 0.97), radius=h * 0.05, fill=255)
    for x, y in [(0.02, top_y + h * 0.18), (0.5, top_y), (0.98, top_y + h * 0.18)]:
        rr = w * 0.055
        d.ellipse((w * x - rr, y - rr * 1.6, w * x + rr, y + rr * 0.4), fill=255)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    edge = m.filter(ImageFilter.MaxFilter(9))
    e = Image.new('RGBA', (w, h), GOLD_DARK + (0,))
    e.putalpha(edge)
    out.alpha_composite(e)
    out.alpha_composite(gold_fill_mask(m))
    d = ImageDraw.Draw(out)
    band = (w * 0.05, base_y - h * 0.02, w * 0.95, h * 0.97)
    d.line((band[0] + 20, band[1] + 10, band[2] - 20, band[1] + 10), fill=(255, 245, 210, 200), width=10)
    for i, x in enumerate([0.22, 0.5, 0.78]):
        rr = w * (0.075 if i == 1 else 0.055)
        cy = (band[1] + band[3]) / 2
        d.ellipse((w * x - rr, cy - rr, w * x + rr, cy + rr), fill=(206, 84, 132, 255),
                  outline=(255, 236, 190, 255), width=8)
        d.ellipse((w * x - rr * 0.45, cy - rr * 0.6, w * x - rr * 0.05, cy - rr * 0.2),
                  fill=(255, 220, 235, 230))
    return out.resize((width, int(h / k)), Image.LANCZOS)


@lru_cache(maxsize=None)
def heart(width):
    k = 4
    w = width * k
    pts = []
    for i in range(400):
        a = i / 400 * 2 * math.pi
        x = 16 * math.sin(a) ** 3
        y = 13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a) - math.cos(4 * a)
        pts.append((w / 2 + x * w / 36, w * 0.45 - y * w / 36))
    m = Image.new('L', (w, w), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    out = Image.new('RGBA', (w, w), (0, 0, 0, 0))
    e = Image.new('RGBA', (w, w), (230, 180, 90, 0))
    e.putalpha(m.filter(ImageFilter.MaxFilter(13)))
    out.alpha_composite(e)
    fill = Image.fromarray(vgrad(w, w, [(0.1, (255, 170, 196)), (0.8, (214, 76, 128))])).convert('RGBA')
    fill.putalpha(m)
    out.alpha_composite(fill)
    d = ImageDraw.Draw(out)
    d.ellipse((w * 0.26, w * 0.2, w * 0.4, w * 0.32), fill=(255, 235, 242, 200))
    out = out.crop(out.getbbox())
    return out.resize((width, int(out.height * width / out.width)), Image.LANCZOS)


# ---------------------------------------------------------------- sparkles
@lru_cache(maxsize=None)
def star(size, tint=(255, 236, 180)):
    """Four-point twinkle: soft core plus two thin streaks."""
    s = size
    y, x = np.mgrid[-1:1:s * 1j, -1:1:s * 1j]
    r = np.sqrt(x * x + y * y)
    core = np.exp(-(r / 0.16) ** 2)
    streak = np.exp(-(np.abs(x) / 0.035)) * np.exp(-(np.abs(y) / 0.55)) + \
        np.exp(-(np.abs(y) / 0.035)) * np.exp(-(np.abs(x) / 0.55))
    a = np.clip(core + streak * 0.9, 0, 1)
    rgb = np.zeros((s, s, 3))
    white = np.clip(core * 1.5, 0, 1)[..., None]
    rgb[:] = np.array(tint) * (1 - white) + 255 * white
    img = np.dstack([rgb, a * 255]).astype(np.uint8)
    return Image.fromarray(img, 'RGBA')


@lru_cache(maxsize=None)
def bokeh(size, tint=(255, 226, 170)):
    y, x = np.mgrid[-1:1:size * 1j, -1:1:size * 1j]
    r = np.sqrt(x * x + y * y)
    a = np.clip((1 - r) * 3, 0, 1) * (0.35 + 0.65 * np.clip((r - 0.6) * 3, 0, 1)) * 0.5
    img = np.dstack([np.broadcast_to(np.array(tint), (size, size, 3)), a * 255]).astype(np.uint8)
    return Image.fromarray(img, 'RGBA')


def twinkles(canvas, t, seed, n=26, area=(0, 0, W, H), smin=24, smax=74, strength=1.0):
    """Stationary stars that twinkle in and out."""
    rng = np.random.default_rng(seed)
    x0, y0, x1, y1 = area
    for _ in range(n):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        size = int(rng.uniform(smin, smax)) // 2 * 2 + 1
        per, ph = rng.uniform(1.4, 3.2), rng.uniform(0, 1)
        tint = (255, 236, 180) if rng.random() < 0.7 else (255, 210, 228)
        v = math.sin(2 * math.pi * (t / per + ph))
        a = clamp01(v) ** 2 * strength
        if a > 0.02:
            place(canvas, star(size, tint), x, y, scale=0.6 + 0.4 * a, alpha=a)


def burst(canvas, t, t0, cx, cy, seed, n=34, speed=900, life=1.3, size=(30, 90)):
    """Stars thrown outward from a point at t0, slowing and fading."""
    dt = t - t0
    if dt < 0 or dt > life:
        return
    rng = np.random.default_rng(seed)
    for _ in range(n):
        ang = rng.uniform(0, 2 * math.pi)
        v = rng.uniform(0.35, 1) * speed
        s = int(rng.uniform(*size)) // 2 * 2 + 1
        lf = rng.uniform(0.6, 1) * life
        if dt > lf:
            continue
        k = 1 - math.exp(-dt * 3.2)
        d = v * k / 3.2
        x, y = cx + math.cos(ang) * d, cy + math.sin(ang) * d + 140 * dt * dt
        a = (1 - dt / lf) ** 1.3
        tint = (255, 236, 180) if rng.random() < 0.75 else (255, 214, 230)
        place(canvas, star(s, tint), x, y, scale=0.5 + 0.5 * a, alpha=a)


def dust(canvas, t, seed, n=40, strength=0.8):
    """Slow rising gold dust and bokeh."""
    rng = np.random.default_rng(seed)
    for i in range(n):
        x0, y0 = rng.uniform(0, W), rng.uniform(0, H)
        sp = rng.uniform(25, 70)
        s = int(rng.uniform(10, 46)) // 2 * 2 + 1
        y = (y0 - sp * t) % (H + 100) - 50
        x = x0 + 26 * math.sin(t * rng.uniform(0.4, 0.9) + i)
        a = strength * (0.35 + 0.65 * (0.5 + 0.5 * math.sin(t * 2 + i)))
        place(canvas, bokeh(s) if i % 3 else star(s), x, y, alpha=a * (0.7 if i % 3 else 0.9))


@lru_cache(maxsize=None)
def sweep_band(angle=-24, width=260):
    """A soft diagonal light band (L mask, wider than the frame)."""
    big = Image.new('L', (W * 3, H * 2), 0)
    arr = np.zeros((H * 2, W * 3), np.float32)
    xs = np.arange(W * 3) - W * 1.5
    prof = np.exp(-(xs / width) ** 2) * 0.9 + np.exp(-((xs - width * 1.1) / (width * 0.18)) ** 2) * 0.6
    arr[:] = prof[None, :]
    big = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).rotate(angle, resample=Image.BICUBIC)
    return big


def light_sweep(canvas, p, strength=0.38, tint=(255, 240, 210)):
    """Slide a warm sheen across the whole frame, p from 0 to 1."""
    if p <= 0 or p >= 1:
        return
    band = sweep_band()
    off = int(-W * 1.6 + p * W * 2.2)
    crop = band.crop((W - off, H // 2, 2 * W - off, H // 2 + H))
    layer = Image.new('RGBA', (W, H), tint + (0,))
    layer.putalpha(crop.point(lambda v: int(v * strength)))
    canvas.alpha_composite(layer)


def ripple(canvas, t, t0, cx, cy):
    """A tap: finger dot plus expanding gold ring."""
    dt = t - t0
    if dt < -0.15 or dt > 0.9:
        return
    d = ImageDraw.Draw(canvas, 'RGBA')
    if dt < 0.25:
        a = int(200 * (1 - abs(dt - 0.05) / 0.3))
        r = 34
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, max(0, a)),
                  outline=(214, 166, 72, max(0, a)), width=4)
    if dt > 0:
        for k, lag in enumerate((0, 0.14)):
            q = clamp01((dt - lag) / 0.7)
            if 0 < q < 1:
                r = 30 + 150 * ease_out(q)
                a = int(230 * (1 - q))
                d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(232, 186, 90, a), width=7 - 3 * k)


# ---------------------------------------------------------------- phone mock-up
SW, SH = 700, 1053          # screen
BZ = 20                     # bezel
PR = 70                     # outer corner radius
PH_W, PH_H = SW + 2 * BZ, SH + 2 * BZ
PH_PAD = 60


@lru_cache(maxsize=None)
def _phone_parts():
    w, h = PH_W + 2 * PH_PAD, PH_H + 2 * PH_PAD
    o = (PH_PAD, PH_PAD, PH_PAD + PH_W, PH_PAD + PH_H)
    sc = (PH_PAD + BZ, PH_PAD + BZ, PH_PAD + BZ + SW, PH_PAD + BZ + SH)
    shadow = Image.new('L', (w, h), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((o[0] + 8, o[1] + 34, o[2] - 8, o[3] + 26), PR, fill=120)
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    sh = Image.new('RGBA', (w, h), (120, 46, 80, 0))
    sh.putalpha(shadow)
    body = Image.new('L', (w, h), 0)
    ImageDraw.Draw(body).rounded_rectangle(o, PR, fill=255)
    hole = Image.new('L', (w, h), 0)
    ImageDraw.Draw(hole).rounded_rectangle(sc, PR - BZ + 4, fill=255)
    ring = Image.fromarray(np.clip(np.asarray(body).astype(int) - np.asarray(hole), 0, 255).astype(np.uint8))
    # gold bezel with a diagonal sheen
    g = np.zeros((h, w, 3))
    yy, xx = np.mgrid[0:h, 0:w]
    s = ((xx + yy * 0.6) / (w + h * 0.6))
    for c, (a, b) in enumerate(zip((255, 246, 214), (196, 138, 52))):
        g[..., c] = a + (b - a) * (0.5 + 0.5 * np.cos(s * 2 * math.pi * 2.2))
    bez = Image.fromarray(g.astype(np.uint8)).convert('RGBA')
    bez.putalpha(ring)
    d = ImageDraw.Draw(bez)
    d.rounded_rectangle(o, PR, outline=(150, 102, 34, 255), width=3)
    d.rounded_rectangle((sc[0] - 2, sc[1] - 2, sc[2] + 2, sc[3] + 2), PR - BZ + 5, outline=(120, 80, 30, 160), width=3)
    # speaker slot
    d.rounded_rectangle((w / 2 - 50, o[1] + 7, w / 2 + 50, o[1] + 13), 3, fill=(140, 96, 40, 200))
    m = Image.new('L', (SW, SH), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, SW, SH), PR - BZ + 4, fill=255)
    glare = Image.new('L', (SW, SH), 0)
    gd = ImageDraw.Draw(glare)
    gd.polygon([(SW * 0.55, 0), (SW, 0), (SW, SH * 0.22), (SW * 0.2, SH * 0.6)], fill=22)
    glare = glare.filter(ImageFilter.GaussianBlur(30))
    return sh, bez, m, glare


def phone(content):
    """Wrap a SW x SH RGB(A) screen image in the gold phone; returns RGBA with padding."""
    sh, bez, m, glare = _phone_parts()
    out = sh.copy()
    scr = content.convert('RGBA') if content.size == (SW, SH) else content.convert('RGBA').resize((SW, SH))
    gl = Image.new('RGBA', (SW, SH), (255, 255, 255, 0))
    gl.putalpha(glare)
    scr.alpha_composite(gl)
    out.paste(scr, (PH_PAD + BZ, PH_PAD + BZ), m)
    out.alpha_composite(bez)
    return out


# ---------------------------------------------------------------- transitions (operate on RGB PIL)
def tr_flash(a, b, p, peak=0.85):
    """Crossfade through warm white light."""
    mix = Image.blend(a, b, ease_in_out(p))
    k = peak * math.sin(math.pi * clamp01(p)) ** 1.5
    return Image.blend(mix, Image.new('RGB', (W, H), (255, 246, 232)), k)


def _zoom(img, s):
    if abs(s - 1) < 0.002:
        return img
    w, h = int(W / s), int(H / s)
    x, y = (W - w) // 2, (H - h) // 2
    if s > 1:
        return img.crop((x, y, x + w, y + h)).resize((W, H), Image.BILINEAR)
    small = img.resize((int(W * s), int(H * s)), Image.BILINEAR)
    bg = img.resize((W, H), Image.BILINEAR)
    bg.paste(small, ((W - small.width) // 2, (H - small.height) // 2))
    return bg


def tr_zoom(a, b, p):
    """Push in: the outgoing shot zooms past camera while the next settles in."""
    e = ease_in_out(p)
    A = _zoom(a, 1 + 0.35 * e)
    B = _zoom(b, 1.25 - 0.25 * e)
    out = Image.blend(A, B, clamp01((p - 0.25) / 0.5))
    k = 0.35 * math.sin(math.pi * clamp01(p))
    return Image.blend(out, Image.new('RGB', (W, H), (255, 248, 238)), k)


def tr_slide(a, b, p):
    """Whip pan right-to-left with a little motion blur."""
    e = ease_in_out(p)
    off = int(W * e)
    out = Image.new('RGB', (W, H))
    out.paste(a, (off, 0))
    out.paste(b, (off - W, 0))
    blur = math.sin(math.pi * clamp01(p))
    if blur > 0.1:
        out = out.filter(ImageFilter.BoxBlur(int(24 * blur))) if blur > 0.5 else \
            Image.blend(out, out.filter(ImageFilter.BoxBlur(10)), blur)
    return out


def tr_page(a, b, p):
    """A book page turning towards a right-hand spine (Hebrew books open this way)."""
    e = ease_in_out(p)
    th = e * math.pi / 2
    out = b.copy()
    width = W * math.cos(th)
    if width > 4:
        lift = H * 0.07 * math.sin(th * 2) * 0.5 + H * 0.05 * math.sin(th)
        x_left = W - width
        # output quad (UL, LL, LR, UR) -> PIL wants source quad per output pixel, so map via QUAD on a
        # canvas: we render the page into its bounding box using a perspective fit
        box_w = int(math.ceil(width))
        box_h = int(H + 2 * lift)
        coeffs = persp_coeffs([(0, 0), (0, box_h), (box_w, box_h - lift), (box_w, lift)],
                              [(0, 0), (0, H), (W, H), (W, 0)])
        page = a.transform((box_w, box_h), Image.PERSPECTIVE, data=coeffs, resample=Image.BILINEAR)
        mask = Image.new('L', (box_w, box_h), 0)
        ImageDraw.Draw(mask).polygon([(0, 0), (0, box_h), (box_w, box_h - lift), (box_w, lift)], fill=255)
        shade = 1 - 0.38 * math.sin(th)
        page = Image.eval(page, lambda v: int(v * shade))
        # shadow cast on the next page
        sh = Image.new('L', (W, H), 0)
        sx = int(x_left)
        ImageDraw.Draw(sh).rectangle((max(0, sx - 140), 0, sx + 40, H), fill=int(150 * math.sin(th)))
        sh = sh.filter(ImageFilter.GaussianBlur(50))
        out = Image.composite(Image.new('RGB', (W, H), (110, 60, 80)), out, sh)
        out.paste(page, (int(x_left), int(-lift)), mask)
    return out


def persp_coeffs(dst, src):
    """PIL PERSPECTIVE coefficients mapping output points `dst` onto input points `src`."""
    A, B = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        B += [u, v]
    return tuple(np.linalg.solve(np.array(A, float), np.array(B, float)))
