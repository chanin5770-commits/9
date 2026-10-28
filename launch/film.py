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
    'home': ('site-home.jpg', 112, 3260),
    'songs': ('site-songs.webp', 112, 8370),
    'letter': ('site-letter-alef.jpg', 112, 2190),
    'builder': ('site-booklet-builder.jpg', 112, 2190),
    'mailtop': ('site-mail-header.jpg', 112, 4721),
}
POSTERS = {
    'price': 'poster-price.png',
    'buy': 'poster-how-to-buy.png',
    'worksheets': 'poster-worksheets.png',
    'games': 'poster-games.png',
    'kit': 'poster-kit.png',
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


# ------------------------------------------------------------------ posters
PW = 1012                  # poster width on screen (the posters are 2:3)
PHH = round(PW * 1.5)


@lru_cache(maxsize=None)
def poster(key):
    return Image.open(os.path.join(SRC, POSTERS[key])).convert('RGB').resize((PW, PHH), Image.LANCZOS)


@lru_cache(maxsize=None)
def poster_backdrop(key):
    """The poster itself, blown up and blurred, behind the sharp copy."""
    im = poster(key)
    k = H / im.height * 1.08
    big = im.resize((round(im.width * k), round(im.height * k)), Image.BILINEAR)
    x, y = (big.width - W) // 2, (big.height - H) // 2
    big = big.crop((x, y, x + W, y + H)).filter(ImageFilter.GaussianBlur(28))
    return Image.blend(big, Image.new('RGB', (W, H), (255, 246, 240)), 0.35).convert('RGBA')


@lru_cache(maxsize=None)
def poster_frame():
    pad = 50
    im = Image.new('RGBA', (PW + 2 * pad, PHH + 2 * pad), (0, 0, 0, 0))
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((pad, pad + 14, pad + PW, pad + PHH + 14), 30, fill=130)
    sh = Image.new('RGBA', im.size, (110, 40, 70, 0))
    sh.putalpha(m.filter(ImageFilter.GaussianBlur(22)))
    im.alpha_composite(sh)
    return im


@lru_cache(maxsize=None)
def poster_mask():
    m = Image.new('L', (PW, PHH), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, PW - 1, PHH - 1), 28, fill=255)
    return m


def poster_scene(key, t, zoom=1.0, focus=(0.5, 0.5), scale=1.0, cy=H / 2):
    """The poster, untouched, framed on its own blurred backdrop; `zoom` pushes in on `focus`."""
    c = poster_backdrop(key).copy()
    im = poster(key)
    if zoom > 1.001:
        w, h = PW / zoom, PHH / zoom
        x = min(PW - w, max(0, PW * focus[0] - w / 2))
        y = min(PHH - h, max(0, PHH * focus[1] - h / 2))
        im = im.crop((x, y, x + w, y + h)).resize((PW, PHH), Image.BICUBIC)
    fr = poster_frame()
    card = fr.copy()
    card.paste(im, (50, 50), poster_mask())
    d = ImageDraw.Draw(card)
    d.rounded_rectangle((50, 50, 50 + PW - 1, 50 + PHH - 1), 28, outline=(226, 182, 96, 255), width=4)
    place(c, card, W / 2, cy, scale=scale)
    return c


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


# 8 — the worksheets poster
@shot(56, 62, 'page')
def s_sheets(t, d):
    c = poster_scene('worksheets', t, zoom=1.0 + 0.08 * ease_in_out(t / d), focus=(0.5, 0.45))
    light_sweep(c, prog(t, 0.5, 1.3), strength=0.25)
    twinkles(c, t, seed=16, n=12, strength=0.7)
    return c


# 9 — the real screen recording: "mail from the kingdom"
MAILTOP = 1.2
clip('r_mail', REC, 11.3, 15.3, beat(74) - beat(62) - MAILTOP, 'rec')


@shot(62, 74, 'flash')
def s_mail(t, d):
    c = brand_scene(t)
    headline(c, t, 0.1, 'דואר מהממלכה', 210, size=104)
    caption(c, t, 0.3, 'הודעות מעוצבות, פתקים וברכות להורי הגן', 318, size=44)
    scr = scroll('mailtop', t, [(0, 0), (0.35, 0), (MAILTOP, 520)]) if t < MAILTOP else footage('r_mail', t - MAILTOP)
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


# 13 — the games poster
@shot(101, 108, 'zoom')
def s_games(t, d):
    c = poster_scene('games', t, zoom=1.0 + 0.07 * ease_in_out(t / d), focus=(0.5, 0.42))
    twinkles(c, t, seed=17, n=14, strength=0.8)
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


# 15 — the climax: the launch-price poster
@shot(118, 126, 'flash')
def s_price(t, d):
    # opens close on the price, then the whole poster settles in on the beat
    e = ease_in_out(prog(t, SPB * 0.6, SPB * 1.6))
    c = poster_scene('price', t, zoom=1.55 - 0.55 * e, focus=(0.5, 0.31))
    burst(c, t, SPB, W / 2, 480, seed=91, n=60, speed=1500, life=1.5, size=(30, 110))
    light_sweep(c, prog(t, SPB * 2.4, 1.0), strength=0.28)
    twinkles(c, t, seed=93, n=18, strength=0.9)
    return c


# 16 — how to join: the poster
@shot(126, 142, 'slide')
def s_pay(t, d):
    # held still and full-size so the steps and the number can be read
    c = poster_scene('buy', t, zoom=1.0 + 0.025 * ease_in_out(t / d), focus=(0.5, 0.45))
    twinkles(c, t, seed=111, n=10, area=(0, 0, W, 180), strength=0.7)
    twinkles(c, t, seed=112, n=10, area=(0, 1740, W, H), strength=0.7)
    return c


# 17 — the end: the kit poster
@shot(142, 150, 'flash')
def s_end(t, d):
    c = poster_scene('kit', t, zoom=1.0 + 0.04 * ease_in_out(t / d), focus=(0.5, 0.5))
    light_sweep(c, prog(t, 0.6, 1.2), strength=0.22)
    twinkles(c, t, seed=121, n=20, strength=0.9)
    q = prog(t, d - 0.6, 0.6)
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
