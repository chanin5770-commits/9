"""The launch film: shot list, scenes and the frame function.

Timing follows the beat grid of the original song (149.65 BPM, first beat at 0.331s), so
every cut and every text hit lands on a beat.
"""
import math
import os
import subprocess
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import kit
from kit import (W, H, FPS, SW, SH, place, text_img, panel, prog, ease_out, ease_back, ease_in_out,
                 clamp01, twinkles, burst, dust, light_sweep, ripple, phone, crown, heart, star)

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source')
WORK = os.path.join(HERE, 'work')

BPM = 149.65
BEAT0 = 0.331
SPB = 60 / BPM


def beat(k):
    return BEAT0 + k * SPB


# ------------------------------------------------------------------ sources
ORIG = os.path.join(SRC, 'kit-summary-50s.mp4')
REC = os.path.join(SRC, 'site-scroll-recording.mp4')
SHOTS_IMG = {   # tall site screenshots: file, top crop (status bar), bottom limit
    'alef': ('site-letters.jpg', 112, 4560),
    'mail': ('site-mail.jpg', 112, 5420),
    'home': ('site-home.jpg', 112, 3260),
    'songs': ('site-songs.webp', 112, 8370),
    'letter': ('site-letter-alef.jpg', 112, 2190),
    'builder': ('site-booklet-builder.jpg', 112, 2190),
}
REC_CROP = (0, 0, 1080, 1625)     # source is pre-cropped below the notification banner, above the nav bar

# footage clips: name -> (source, src start, src end, out duration, kind)
CLIPS = {}


def clip(name, src, s0, s1, dur, kind='full'):
    CLIPS[name] = (src, s0, s1, dur, kind)
    return name


def extract_all():
    os.makedirs(WORK, exist_ok=True)
    for name, (src, s0, s1, dur, kind) in CLIPS.items():
        d = os.path.join(WORK, name)
        if os.path.isdir(d) and len(os.listdir(d)) >= int(dur * FPS):
            continue
        os.makedirs(d, exist_ok=True)
        speed = (s1 - s0) / dur
        if kind == 'full':
            vf = f'setpts=(PTS-STARTPTS)/{speed:.5f},fps={FPS},scale={W}:{H}:flags=lanczos'
        else:  # screen recording, framed for the phone screen
            x0, y0, x1, y1 = REC_CROP
            vf = (f'setpts=(PTS-STARTPTS)/{speed:.5f},fps={FPS},crop={x1 - x0}:{y1 - y0}:{x0}:{y0},'
                  f'scale={SW}:{SH}:flags=lanczos')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{s0}', '-t', f'{s1 - s0 + 0.2}', '-i', src,
                        '-vf', vf, '-frames:v', str(int(dur * FPS) + 8), '-q:v', '2',
                        os.path.join(d, '%04d.jpg')], check=True)


@lru_cache(maxsize=12)
def _frame_file(path):
    return Image.open(path).convert('RGB')


def footage(name, tl):
    d = os.path.join(WORK, name)
    n = len([f for f in os.listdir(d) if f.endswith('.jpg')]) if name not in _COUNTS else _COUNTS[name]
    _COUNTS[name] = n
    i = min(n, max(1, int(tl * FPS) + 1))
    return _frame_file(os.path.join(d, f'{i:04d}.jpg'))


_COUNTS = {}


@lru_cache(maxsize=None)
def screenshot(key):
    f, top, bottom = SHOTS_IMG[key]
    im = Image.open(os.path.join(SRC, f)).convert('RGB')
    if im.width != 1080:
        im = im.resize((1080, round(im.height * 1080 / im.width)), Image.LANCZOS)
    im = im.crop((0, top, 1080, min(bottom, im.height)))
    k = SW / 1080
    return im.resize((SW, round(im.height * k)), Image.LANCZOS)


def screen_at(key, y_src):
    """Phone-screen window of a screenshot; y_src in original 1080-wide pixels from the crop top."""
    im = screenshot(key)
    y = int(round(y_src * SW / 1080))
    y = max(0, min(im.height - SH, y))
    return im.crop((0, y, SW, y + SH))


def scroll(key, t, keys):
    """Piecewise eased scroll; keys = [(time, y_src), ...]."""
    if t <= keys[0][0]:
        return screen_at(key, keys[0][1])
    for (t0, y0), (t1, y1) in zip(keys, keys[1:]):
        if t <= t1:
            return screen_at(key, y0 + (y1 - y0) * ease_in_out((t - t0) / (t1 - t0)))
    return screen_at(key, keys[-1][1])


# ------------------------------------------------------------------ backgrounds
@lru_cache(maxsize=None)
def brand_bg():
    g = kit.vgrad(W, H, [(0, (255, 249, 244)), (0.45, (253, 238, 236)), (1, (248, 214, 224))]).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / W) ** 2 + ((yy - H * 0.42) / H) ** 2)
    glow = np.clip(1 - r * 1.9, 0, 1)[..., None]
    g = g * (1 - glow * 0.5) + np.array([255, 253, 248]) * glow * 0.5
    return Image.fromarray(g.astype(np.uint8)).convert('RGBA')


LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת'


def floating_letters(canvas, t, seed=7, n=12, alpha=0.2):
    rng = np.random.default_rng(seed)
    for i in range(n):
        ch = LETTERS[int(rng.integers(0, len(LETTERS)))]
        size = int(rng.uniform(80, 170))
        x = rng.uniform(40, W - 40)
        y0 = rng.uniform(0, H)
        sp = rng.uniform(14, 34)
        y = (y0 - sp * t) % (H + 240) - 120
        x += 30 * math.sin(t * 0.5 + i)
        a = alpha * (0.6 + 0.4 * math.sin(t * 0.8 + i * 1.7))
        place(canvas, text_img(ch, 'display', size, fill='gold', stroke=0, shadow=0), x, y, alpha=a)


def brand_scene(t, letters=True):
    c = brand_bg().copy()
    if letters:
        floating_letters(c, t)
    dust(c, t, seed=3, n=18, strength=0.5)
    return c


@lru_cache(maxsize=None)
def vignette():
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
    a = np.clip((r - 0.75) * 0.9, 0, 0.45)
    img = np.dstack([np.full((H, W), 120), np.full((H, W), 50), np.full((H, W), 80), a * 255]).astype(np.uint8)
    return Image.fromarray(img, 'RGBA')


def film_frame(name, tl, zoom=(1.0, 1.0), dur=1.0, focus=(0.5, 0.5)):
    """A footage frame with a slow camera push."""
    f = footage(name, tl)
    s = zoom[0] + (zoom[1] - zoom[0]) * ease_in_out(tl / dur)
    if abs(s - 1) > 0.002:
        w, h = W / s, H / s
        x = (W - w) * focus[0]
        y = (H - h) * focus[1]
        f = f.crop((int(x), int(y), int(x + w), int(y + h))).resize((W, H), Image.BICUBIC)
    c = f.convert('RGBA')
    c.alpha_composite(vignette())
    return c


# ------------------------------------------------------------------ text helpers
def headline(c, t, t0, txt, y, size=96, fill='plum', face='display', glow=10, wipe=False, stroke=0,
             stroke_col=None):
    im = text_img(txt, face, size, fill=fill, glow=glow, stroke=stroke, stroke_col=stroke_col)
    p = prog(t, t0, 0.55)
    if p <= 0:
        return
    if wipe:
        place(c, kit.wipe_rtl(im, ease_out(p * 1.2)), W / 2, y)
    else:
        place(c, im, W / 2, y + 40 * (1 - ease_out(p)), scale=0.9 + 0.1 * ease_back(p), alpha=ease_out(p))


def pop(c, t, t0, im, x, y, dur=0.45, s0=0.4):
    p = prog(t, t0, dur)
    if p <= 0:
        return
    place(c, im, x, y, scale=s0 + (1 - s0) * ease_back(p), alpha=clamp01(p * 2.5))


def plate(c, t, t0, w, h, y, alpha=0.86):
    p = prog(t, t0, 0.4)
    if p <= 0:
        return
    place(c, panel(w, h, alpha=alpha), W / 2, y, scale=0.94 + 0.06 * ease_out(p), alpha=ease_out(p))


def phone_in(c, t, content, cx=W / 2, cy=1035, t_in=0.0, scale=1.0, rise=True):
    p = ease_out(prog(t, t_in, 0.6)) if rise else 1.0
    ph = phone(content)
    place(c, ph, cx, cy + 260 * (1 - p), scale=scale * (0.92 + 0.08 * p), alpha=clamp01(p * 1.6))


def badge(c, t, t0, txt, y):
    """Small 'real site' pill with a pulsing dot."""
    p = prog(t, t0, 0.4)
    if p <= 0:
        return
    im = text_img(txt, 'sans-b', 36, fill=(255, 255, 255), shadow=0)
    w, h = im.width + 110, 66
    pill = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(pill)
    d.rounded_rectangle((0, 0, w - 1, h - 1), h // 2, fill=(170, 64, 110, 235), outline=(240, 200, 120, 255), width=3)
    pill.alpha_composite(im, (30, (h - im.height) // 2))
    k = 0.5 + 0.5 * math.sin(t * 7)
    r = 9 + 3 * k
    d.ellipse((w - 48 - r, h / 2 - r, w - 48 + r, h / 2 + r), fill=(255, 225, 140, 255))
    place(c, pill, W / 2, y, scale=0.8 + 0.2 * ease_back(p), alpha=ease_out(p))


# ------------------------------------------------------------------ the shot list
SHOTS = []


def shot(k0, k1, tr=None):
    def deco(fn):
        SHOTS.append((beat(k0) if k0 else 0.0, beat(k1), fn, tr))
        return fn
    return deco


# 1 — the kingdom opens: the original princess in the palace
clip('o_open', ORIG, 0.0, 3.0, beat(7))


@shot(0, 7)
def s_open(t, d):
    c = film_frame('o_open', t, (1.0, 1.06), d, (0.5, 0.35))
    p = prog(t, 0.0, 0.8)
    if p < 1:
        c.alpha_composite(Image.new('RGBA', (W, H), (255, 248, 240, int(255 * (1 - ease_out(p))))))
    t1 = beat(2)
    plate(c, t, t1 - 0.1, 900, 330, 1545, alpha=0.8)
    pop(c, t, t1, crown(200), W / 2, 1395, dur=0.55)
    headline(c, t, t1 + 0.25, 'הממלכה נפתחה!', 1580, size=128, fill='plum', glow=0)
    burst(c, t, t1, W / 2, 1400, seed=11, n=40, speed=1100)
    twinkles(c, t, seed=5, n=16, area=(0, 200, W, 1200), strength=0.8)
    return c


# 2 — the cover
clip('o_cover', ORIG, 3.05, 7.8, beat(15) - beat(7))


@shot(7, 15, 'flash')
def s_cover(t, d):
    c = film_frame('o_cover', t, (1.0, 1.1), d, (0.5, 0.4))
    light_sweep(c, prog(t, 0.6, 1.4), strength=0.42)
    twinkles(c, t, seed=8, n=22, strength=0.9)
    dust(c, t, seed=9, n=14, strength=0.6)
    return c


# 3 — the original counter: 22 letters, 387 source pages
clip('o_count', ORIG, 8.05, 11.7, beat(21) - beat(15))


@shot(15, 21, 'zoom')
def s_count(t, d):
    c = film_frame('o_count', t, (1.0, 1.05), d)
    twinkles(c, t, seed=12, n=14, strength=0.7)
    return c


# 4 — real site: the 22-letter world
@shot(21, 30, 'flash')
def s_alef(t, d):
    c = brand_scene(t)
    headline(c, t, 0.15, 'בוחרים אות —', 205, size=94)
    headline(c, t, 0.35, 'ויוצאים לדרך!', 318, size=94)
    scr = scroll('alef', t, [(0, 0), (0.6, 0), (2.4, 1350)])
    phone_in(c, t, scr, cy=1060, t_in=0.0)
    # tap on the א tile (top-right of the grid) right before diving into its page
    k = SW / 1080
    ripple(c, t, d - 0.6, W / 2 - SW / 2 + 850 * k, 1060 - SH / 2 + (1770 - 112 - 1350) * k)
    caption(c, t, 0.9, '22 אותיות · 387 דפי מקור בספרייה', 1715)
    return c


def caption(c, t, t0, txt, y, size=46):
    p = prog(t, t0, 0.5)
    if p <= 0:
        return
    im = text_img(txt, 'sans-b', size, fill='mauve', glow=8, shadow=0.15)
    place(c, im, W / 2, y + 24 * (1 - ease_out(p)), alpha=ease_out(p))


# 5 — the letter page: everything for one letter in one place
TILES = [(795, 1340), (287, 1340), (795, 1705), (287, 1705)]   # worksheets, games, activities, screening


@shot(30, 39, 'zoom')
def s_letter(t, d):
    c = brand_scene(t)
    headline(c, t, 0.1, 'כל התכנים של האות', 205, size=90)
    headline(c, t, 0.3, 'במקום אחד', 315, size=90, fill='gold', stroke=3)
    y_src = 250 + 200 * ease_in_out(prog(t, 0.2, 2.4))
    scr = screen_at('letter', y_src).convert('RGBA')
    # glow each content tile on the beat
    d2 = ImageDraw.Draw(scr, 'RGBA')
    for i, (x, y) in enumerate(TILES):
        tt = t - (beat(32 + i * 1.5) - beat(30))
        if 0 < tt < 1.2:
            a = math.sin(math.pi * clamp01(tt / 1.2))
            k = SW / 1080
            cx, cy = x * k, (y - 112 - y_src) * k
            d2.rounded_rectangle((cx - 156, cy - 106, cx + 156, cy + 106), 26,
                                 outline=(226, 172, 70, int(255 * a)), width=7)
    phone_in(c, t, scr, cy=1060, rise=False)
    for i, (x, y) in enumerate(TILES):
        tt = beat(32 + i * 1.5) - beat(30)
        k = SW / 1080
        burst(c, t, tt, W / 2 - SW / 2 + x * k, 1060 - SH / 2 + (y - 112 - y_src) * k, seed=40 + i,
              n=12, speed=420, life=0.8, size=(20, 50))
    caption(c, t, 0.8, 'דפי עבודה · משחקים · פעילויות · הקרנה בגן', 1715, size=42)
    return c


# 6 — the original "three magical paths"
clip('o_paths', ORIG, 13.05, 17.85, beat(47) - beat(39))


@shot(39, 47, 'page')
def s_paths(t, d):
    c = film_frame('o_paths', t, (1.0, 1.06), d, (0.5, 0.45))
    twinkles(c, t, seed=14, n=14, strength=0.7)
    return c


# 7 — the original booklets
clip('o_books', ORIG, 20.05, 25.45, beat(56) - beat(47))


@shot(47, 56, 'slide')
def s_books(t, d):
    c = film_frame('o_books', t, (1.02, 1.1), d, (0.5, 0.6))
    light_sweep(c, prog(t, 1.4, 1.3), strength=0.3)
    twinkles(c, t, seed=15, n=12, strength=0.6)
    return c


# 8 — the original letter worksheets
clip('o_sheets', ORIG, 26.0, 29.6, beat(62) - beat(56))


@shot(56, 62, 'page')
def s_sheets(t, d):
    c = film_frame('o_sheets', t, (1.0, 1.05), d, (0.5, 0.55))
    return c


# 9 — the real screen recording: "mail from the kingdom"
clip('r_mailhero', REC, 1.95, 2.75, 0.8, 'rec')
clip('r_mail', REC, 11.3, 15.3, beat(74) - beat(62) - 0.8, 'rec')


@shot(62, 74, 'flash')
def s_mail(t, d):
    c = brand_scene(t)
    headline(c, t, 0.1, 'דואר מהממלכה', 210, size=104)
    caption(c, t, 0.3, 'הודעות מעוצבות, פתקים וברכות להורי הגן', 318, size=44)
    scr = footage('r_mailhero', t) if t < 0.8 else footage('r_mail', t - 0.8)
    phone_in(c, t, scr, cy=1070, t_in=0.0)
    badge(c, t, 0.6, 'הצצה אמיתית לאתר', 1690)
    return c


# 10 — three phones: songs, home, message library
clip('r_library', REC, 5.6, 7.9, beat(83) - beat(74), 'rec')


@shot(74, 83, 'zoom')
def s_trio(t, d):
    c = brand_scene(t)
    headline(c, t, 0.1, 'שירים • קליפים • הודעות', 200, size=82)
    caption(c, t, 0.3, 'הכול מוכן לשימוש, ישר מהטלפון', 300, size=44)
    left = scroll('home', t, [(0, 0), (0.6, 0), (3.2, 1400)])
    right = footage('r_library', t)
    mid = scroll('songs', t, [(0, 0), (0.5, 0), (3.3, 2100)])
    e = ease_out(prog(t, 0.0, 0.7))
    phone_in(c, t, left, cx=W / 2 - 330 * e, cy=1080, scale=0.6, rise=False)
    phone_in(c, t, right, cx=W / 2 + 330 * e, cy=1080, scale=0.6, rise=False)
    phone_in(c, t, mid, cx=W / 2, cy=1040, scale=0.78, t_in=0.0)
    return c


# 11 — the original princess in the library + what's inside
clip('o_lib', ORIG, 35.0, 38.6, beat(92) - beat(83))
WORDS = [('משחקים', 0), ('שירים', 0), ('סרטונים', 0), ('חוברות', 1), ('דפי עבודה', 1)]


@shot(83, 92, 'flash')
def s_words(t, d):
    c = film_frame('o_lib', t, (1.0, 1.04), d)
    plate(c, t, 0.15, 960, 300, 1590, alpha=0.84)
    lines = [[w for w, l in WORDS if l == 0], [w for w, l in WORDS if l == 1]]
    k = 0
    for li, words in enumerate(lines):
        imgs = [text_img(w, 'display', 84, fill='plum', glow=0) for w in words]
        dot = text_img('•', 'display', 70, fill='gold', shadow=0)
        total = sum(i.width for i in imgs) + (len(imgs) - 1) * (dot.width + 40)
        x = W / 2 + total / 2
        y = 1525 + li * 128
        for j, im in enumerate(imgs):
            t0 = 0.25 + k * SPB * 1.5
            pop(c, t, t0, im, x - im.width / 2, y)
            burst(c, t, t0, x - im.width / 2, y, seed=60 + k, n=10, speed=380, life=0.7, size=(18, 44))
            x -= im.width
            if j < len(imgs) - 1:
                pop(c, t, t0 + 0.1, dot, x - 20 - dot.width / 2, y)
                x -= dot.width + 40
            k += 1
    return c


# 12 — real site: the home screen
@shot(92, 101, 'slide')
def s_home(t, d):
    c = brand_scene(t)
    headline(c, t, 0.1, 'מעטפת שנתית עשירה', 200, size=92)
    headline(c, t, 0.3, 'לגננת!', 312, size=104, fill='gold', stroke=3)
    scr = scroll('home', t, [(0, 0), (0.5, 0), (3.3, 1560)])
    phone_in(c, t, scr, cy=1070, t_in=0.0)
    caption(c, t, 0.8, 'החוברות · הקליפים והשירים · ההורדות · המועדפים', 1715, size=40)
    return c


# 13 — real site: build your own booklet
@shot(101, 108, 'zoom')
def s_builder(t, d):
    c = brand_scene(t)
    headline(c, t, 0.1, 'בונות חוברת אישית', 205, size=92)
    headline(c, t, 0.3, 'ומדפיסות!', 315, size=100, fill='gold', stroke=3)
    scr = scroll('builder', t, [(0, 0), (0.4, 0), (1.8, 440)])
    phone_in(c, t, scr, cy=1060, rise=False)
    # the "make me a booklet" button, left half of the builder card
    yb = (1385 - 112 - 440) * SW / 1080
    ripple(c, t, 1.95, W / 2 - SW / 2 + 290 * SW / 1080, 1060 - SH / 2 + yb)
    return c


# 14 — build-up: the princess twirls, the promise lands
clip('o_twirl', ORIG, 38.9, 42.6, beat(118) - beat(108))
TRIAD = [('22 אותיות.', 'plum', 1), ('שנה שלמה.', 'plum', 4), ('אינסוף חוויות חסידיות!', 'gold', 7)]


@shot(108, 118, 'flash')
def s_triad(t, d):
    c = film_frame('o_twirl', t, (1.0, 1.08), d, (0.5, 0.4))
    plate(c, t, beat(109) - beat(108) - 0.1, 980, 470, 1520, alpha=0.86)
    for i, (txt, fill, kb) in enumerate(TRIAD):
        t0 = beat(108 + kb) - beat(108)
        size = 96 if i < 2 else 82
        im = text_img(txt, 'display', size, fill=fill, glow=0, stroke=3 if fill == 'gold' else 0)
        pop(c, t, t0, im, W / 2, 1385 + i * 135, dur=0.5)
        burst(c, t, t0, W / 2, 1385 + i * 135, seed=80 + i, n=16, speed=600, life=0.9)
    # light builds towards the climax
    k = prog(t, d - 1.2, 1.2) ** 2
    if k > 0:
        c.alpha_composite(Image.new('RGBA', (W, H), (255, 246, 230, int(200 * k))))
    return c


# 15 — the climax: launch price
@lru_cache(maxsize=None)
def rays():
    n = 2400
    yy, xx = np.mgrid[0:n, 0:n] - n / 2
    ang = np.arctan2(yy, xx)
    r = np.sqrt(xx * xx + yy * yy) / (n / 2)
    a = (0.5 + 0.5 * np.cos(ang * 18)) ** 6 * np.clip(1 - r, 0, 1) ** 0.8 * 0.33
    img = np.dstack([np.full((n, n), 255), np.full((n, n), 222), np.full((n, n), 150), a * 255]).astype(np.uint8)
    return Image.fromarray(img, 'RGBA')


def climax_bg(t, cy=1000):
    c = brand_bg().copy()
    r = rays().rotate(t * 6, resample=Image.BILINEAR)
    place(c, r, W / 2, cy)
    floating_letters(c, t, seed=21, n=10, alpha=0.16)
    dust(c, t, seed=22, n=26, strength=0.7)
    return c


@lru_cache(maxsize=None)
def ribbon(txt):
    im = text_img(txt, 'display', 70, fill='cream', shadow=0.3)
    w, h = im.width + 150, 118
    rb = Image.new('RGBA', (w + 80, h + 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(rb)
    # tails
    for side in (0, 1):
        x = 0 if side == 0 else w + 80
        sgn = 1 if side == 0 else -1
        d.polygon([(x, 30), (x + sgn * 70, 30), (x + sgn * 70, h + 30), (x, h + 30), (x + sgn * 30, h / 2 + 30)],
                  fill=(150, 52, 96, 255))
    body = Image.fromarray(kit.vgrad(w, h, [(0, (212, 104, 148)), (1, (168, 62, 108))])).convert('RGBA')
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), 16, fill=255)
    body.putalpha(m)
    rb.alpha_composite(body, (40, 0))
    d.rounded_rectangle((40, 0, 40 + w - 1, h - 1), 16, outline=(240, 200, 120, 255), width=4)
    d.rounded_rectangle((52, 12, 28 + w - 1, h - 13), 10, outline=(255, 226, 170, 140), width=2)
    rb.alpha_composite(im, (40 + (w - im.width) // 2, (h - im.height) // 2))
    return rb


@lru_cache(maxsize=None)
def pill(txt, size=50, fill=(176, 66, 112), fg=(255, 255, 255), padx=60, h=None):
    im = text_img(txt, 'sans-xb', size, fill=fg, shadow=0)
    h = h or int(size * 2.1)
    w = im.width + 2 * padx
    out = Image.new('RGBA', (w + 40, h + 40), (0, 0, 0, 0))
    m = Image.new('L', out.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((20, 26, 20 + w, 26 + h), h // 2, fill=110)
    sh = Image.new('RGBA', out.size, (120, 40, 80, 0))
    sh.putalpha(m.filter(ImageFilter.GaussianBlur(12)))
    out.alpha_composite(sh)
    d = ImageDraw.Draw(out)
    d.rounded_rectangle((20, 20, 20 + w, 20 + h), h // 2, fill=fill + (255,), outline=(236, 194, 110, 255), width=4)
    out.alpha_composite(im, (20 + (w - im.width) // 2, 20 + (h - im.height) // 2))
    return out


@lru_cache(maxsize=None)
def price_img(num, size, **kw):
    """A price set the way Israeli price tags show it: the number, then a smaller ₪ on its right."""
    a = text_img(num, 'display', size, direction='ltr', **kw)
    b = text_img('₪', 'display', int(size * 0.46), **kw)
    gap = int(size * 0.0)
    out = Image.new('RGBA', (a.width + gap + b.width, a.height), (0, 0, 0, 0))
    out.alpha_composite(a, (0, 0))
    out.alpha_composite(b, (a.width + gap, int(a.height * 0.86 - b.height)))
    return out


@lru_cache(maxsize=None)
def struck(num, size):
    im = price_img(num, size, fill='mauve', shadow=0, glow=6).copy()
    d = ImageDraw.Draw(im)
    d.line((8, im.height * 0.62, im.width - 8, im.height * 0.38), fill=(200, 60, 100, 255), width=max(4, size // 14))
    return im


@shot(118, 126, 'flash')
def s_price(t, d):
    c = climax_bg(t)
    pop(c, t, 0.0, crown(190), W / 2, 250, dur=0.5)
    pop(c, t, 0.12, crown(96), W / 2 - 420, 445, dur=0.5)
    pop(c, t, 0.12, crown(96), W / 2 + 420, 445, dur=0.5)
    headline(c, t, 0.05, 'הממלכה נפתחה!', 460, size=116, fill='plum', glow=8)
    pop(c, t, SPB * 0.5, ribbon('מחיר השקה מיוחד'), W / 2, 650, dur=0.45, s0=0.7)
    t79 = SPB          # the price lands on the next beat
    big = price_img('79', 400, fill='gold', stroke=8, stroke_col=(150, 96, 26), glow=18, glow_col=(255, 248, 225))
    p = prog(t, t79, 0.5)
    if p > 0:
        s = 1.7 - 0.7 * ease_back(p, 2.4)
        place(c, big, W / 2, 975, scale=s, alpha=clamp01(p * 3))
        light_sweep(c, prog(t, t79 + 0.6, 1.0), strength=0.3)
    burst(c, t, t79, W / 2, 970, seed=91, n=60, speed=1500, life=1.5, size=(30, 110))
    pop(c, t, t79 + 0.35, text_img('בלבד!', 'display', 124, fill='plum', glow=8), W / 2, 1235)
    pop(c, t, t79 + SPB * 2, pill('ל־20 הרוכשות הראשונות בלבד!', 58), W / 2, 1440, s0=0.6)
    p2 = prog(t, t79 + SPB * 4, 0.5)
    if p2 > 0:
        line = text_img('לאחר מכן המחיר יעלה ל־179 ₪', 'sans-b', 54, fill='mauve', glow=8, shadow=0.1)
        place(c, line, W / 2, 1610 + 20 * (1 - ease_out(p2)), alpha=ease_out(p2))
        place(c, struck('179', 96), W / 2, 1735, alpha=ease_out(prog(t, t79 + SPB * 5, 0.4)))
    twinkles(c, t, seed=93, n=20, strength=0.9)
    return c


# 16 — how to join
STEPS = [
    ('1', ['מעבירים 79 ₪ בביט למספר:'], '054-593-5578'),
    ('2', ['שולחים צילום מסך של התשלום', 'בוואטסאפ לאותו מספר'], None),
    ('3', ['מקבלים את פרטי הכניסה', 'לממלכה!'], None),
]


@lru_cache(maxsize=None)
def medallion(n):
    s = 130
    k = 4
    m = Image.new('L', (s * k, s * k), 0)
    ImageDraw.Draw(m).ellipse((6 * k, 6 * k, (s - 6) * k, (s - 6) * k), fill=255)
    m = m.resize((s, s), Image.LANCZOS)
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    e = Image.new('RGBA', (s, s), (150, 100, 30, 0))
    e.putalpha(m.filter(ImageFilter.MaxFilter(5)))
    im.alpha_composite(e)
    im.alpha_composite(kit.gold_fill_mask(m))
    d = ImageDraw.Draw(im)
    d.ellipse((16, 16, s - 16, s - 16), outline=(255, 244, 210, 200), width=3)
    num = text_img(n, 'display', 80, fill=(122, 31, 78), shadow=0)
    im.alpha_composite(num, ((s - num.width) // 2, (s - num.height) // 2 - 4))
    return im


@lru_cache(maxsize=None)
def step_card(i):
    n, lines, phone_no = STEPS[i]
    w, h = 960, 300 if phone_no else 250
    card = panel(w, h, alpha=0.93)
    pad = 40
    card = card.copy()
    card.alpha_composite(medallion(n), (pad + w - 30 - 130, pad + (h - 130) // 2))
    tx = pad + w - 200      # right edge of the text column
    imgs = [text_img(l, 'sans-xb', 52, fill='plum', shadow=0) for l in lines]
    if phone_no:
        num = text_img(phone_no, 'display', 104, fill='gold', stroke=4, stroke_col=(140, 88, 22),
                       direction='ltr', glow=6, glow_col=(255, 250, 235))
        imgs.append(num)
    total = sum(im.height for im in imgs) + 16 * (len(imgs) - 1)
    y = pad + (h - total) // 2
    for j, im in enumerate(imgs):
        x = tx - im.width if not (phone_no and j == len(imgs) - 1) else pad + 40 + (tx - pad - 40 - im.width) // 2
        card.alpha_composite(im, (int(x), int(y)))
        y += im.height + 16
    return card


@shot(126, 142, 'slide')
def s_pay(t, d):
    c = climax_bg(t, cy=520)
    pop(c, t, 0.05, pill('79 ₪ בלבד · ל־20 הרוכשות הראשונות', 44, fill=(196, 92, 132)), W / 2, 150, s0=0.7)
    headline(c, t, 0.2, 'איך מצטרפים לממלכה?', 330, size=96)
    pop(c, t, 0.55, heart(86), W / 2, 450, dur=0.5)
    ys = [720, 1040, 1330]
    for i in range(3):
        t0 = 0.6 + i * SPB * 2
        p = prog(t, t0, 0.55)
        if p > 0:
            place(c, step_card(i), W / 2 + 140 * (1 - ease_out(p)), ys[i], alpha=ease_out(p))
            burst(c, t, t0 + 0.2, W / 2 + 400, ys[i], seed=100 + i, n=10, speed=380, life=0.7, size=(18, 44))
    p = prog(t, 0.6 + 6 * SPB, 0.6)
    if p > 0:
        logo = logo_img(560)
        place(c, logo, W / 2, 1670, alpha=ease_out(p), scale=0.9 + 0.1 * ease_out(p))
    # keep the phone number glinting while viewers read it
    if t > 1.2:
        k = (t - 1.2) % 2.4
        if k < 0.9:
            place(c, star(81), W / 2 - 330 + 560 * (k / 0.9), 768, alpha=math.sin(math.pi * k / 0.9))
    twinkles(c, t, seed=111, n=12, area=(0, 1450, W, H), strength=0.7)
    return c


@lru_cache(maxsize=None)
def logo_img(width):
    im = Image.open(os.path.join(HERE, 'assets', 'chanili-logo.png')).convert('RGBA')
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


# 17 — the end card
@lru_cache(maxsize=None)
def frame_border():
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = 56, 200, W - 56, H - 200
    d.rounded_rectangle((x0, y0, x1, y1), 40, outline=(222, 176, 90, 255), width=4)
    d.rounded_rectangle((x0 + 14, y0 + 14, x1 - 14, y1 - 14), 30, outline=(222, 176, 90, 150), width=2)
    for cx, cy in [(x0 + 44, y0 + 44), (x1 - 44, y0 + 44), (x0 + 44, y1 - 44), (x1 - 44, y1 - 44)]:
        d.ellipse((cx - 30, cy - 30, cx + 30, cy + 30), outline=(222, 176, 90, 220), width=3)
        d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=(222, 176, 90, 255))
    return im


@lru_cache(maxsize=None)
def divider():
    im = Image.new('RGBA', (620, 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.line((0, 20, 270, 20), fill=(222, 176, 90, 200), width=2)
    d.line((350, 20, 620, 20), fill=(222, 176, 90, 200), width=2)
    d.polygon([(310, 4), (326, 20), (310, 36), (294, 20)], outline=(214, 160, 60, 255), width=4)
    return im


@shot(142, 150, 'flash')
def s_end(t, d):
    c = brand_scene(t, letters=False)
    c.alpha_composite(frame_border())
    pop(c, t, 0.05, crown(170), W / 2, 440, dur=0.5)
    headline(c, t, 0.15, 'מלך ומלכת האותיות', 640, size=122, fill=(140, 36, 64), glow=8)
    headline(c, t, 0.45, '22 אותיות. שנה שלמה.', 815, size=72, fill='plum', face='serif', glow=6)
    headline(c, t, 0.65, 'אינסוף חוויות חסידיות!', 920, size=80, fill='gold', face='display', stroke=3, glow=6)
    pop(c, t, 0.85, divider(), W / 2, 1060, s0=0.8)
    p = prog(t, 0.9, 0.7)
    if p > 0:
        place(c, logo_img(840), W / 2, 1290, scale=0.92 + 0.08 * ease_out(p), alpha=ease_out(p))
        light_sweep(c, prog(t, 1.5, 1.1), strength=0.25)
    headline(c, t, 1.2, 'ChaniLi Studio', 1550, size=60, fill='mauve', face='serif-md', glow=4)
    twinkles(c, t, seed=121, n=24, strength=0.9)
    # fade out at the very end
    q = prog(t, d + 0.4, 0.6)
    if q > 0:
        c.alpha_composite(Image.new('RGBA', (W, H), (255, 250, 246, int(255 * q))))
    return c


TAIL = 1.0      # the end card holds a second past the last beat while the music rings out
DURATION = beat(150) + TAIL
TR_LEN = {'flash': 0.36, 'zoom': 0.4, 'page': 0.55, 'slide': 0.34}
TRANS = {'flash': kit.tr_flash, 'zoom': kit.tr_zoom, 'page': kit.tr_page, 'slide': kit.tr_slide}


def render_shot(i, t):
    t0, t1, fn, _ = SHOTS[i]
    d = (t1 - t0) + (TAIL if i == len(SHOTS) - 1 else 0)
    return fn(t - t0, d).convert('RGB')


def frame(t):
    for i, (t0, t1, fn, tr) in enumerate(SHOTS):
        last = i == len(SHOTS) - 1
        if t0 <= t < t1 or (last and t >= t0):
            # transition into this shot straddles its start
            if tr and i > 0:
                L = TR_LEN[tr]
                if t < t0 + L / 2:
                    p = (t - (t0 - L / 2)) / L
                    return TRANS[tr](render_shot(i - 1, t), render_shot(i, t), p)
            if not last:
                ntr = SHOTS[i + 1][3]
                if ntr:
                    L = TR_LEN[ntr]
                    if t >= t1 - L / 2:
                        p = (t - (t1 - L / 2)) / L
                        return TRANS[ntr](render_shot(i, t), render_shot(i + 1, t), p)
            return render_shot(i, t)
    return render_shot(len(SHOTS) - 1, t)
