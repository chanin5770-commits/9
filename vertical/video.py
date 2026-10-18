"""Renders the vertical Hashmali ad, frame by frame, from edit.py.

    python vertical/video.py                    # full render -> dist/hashmali-cinematic-ad-vertical.mp4
    python vertical/video.py --stills 1,8.3,40  # single frames -> dist/stills/
    python vertical/video.py --out x.mp4 --crf 23 --preset veryfast   # quick preview

Footage is decoded by ffmpeg (trim, time-stretch, motion interpolation), the real
photos of Yosef get slow camera moves, and everything is framed, graded (one film
look for all sources, plus fine grain), titled and composited here with Pillow, then
piped to ffmpeg for H.264 encoding together with the mix from audio.py.
"""
import argparse
import hashlib
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from edit import (CARD_CHOOSE, CARD_END, CARD_LOGO, CONTACT, DURATION, FONTS, FPS, H, KITCHEN, LOGO,
                  PHONE, PHOTOS, ROOT, SHOTS, TITLES, W, WORK)

SRC_W, SRC_H = 1280, 720
SAFE_X = int(W * 0.08)          # 86 px each side
SAFE_BOTTOM = int(H * 0.80)     # nothing important below y=1536

RED = (227, 6, 19)
YELLOW = (255, 204, 0)
BLUE = (30, 84, 180)
NAVY = (20, 33, 61)
WHITE = (255, 255, 255)

GRADE = 'eq=contrast=1.05:saturation=1.06:gamma=0.98,unsharp=5:5:0.35'


def font(weight, size):
    return ImageFont.truetype(os.path.join(FONTS, f'Heebo-{weight}.ttf'), size)


def fitted(weight, size, lines, max_w=W - 2 * SAFE_X):
    """The largest font up to `size` at which every line fits inside the safe width."""
    while size > 40:
        f = font(weight, size)
        if max(f.getlength(l, direction='rtl') for l in lines) <= max_w:
            return f
        size -= 4
    return font(weight, size)


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


# ---------------------------------------------------------------- footage

def decode_shot(shot):
    """Returns the shot's frames as a list of HxWx3 uint8 arrays at the film's frame rate."""
    path = KITCHEN if shot['src'] == 'K' else WORK
    src_fps = 30 if shot['src'] == 'K' else 24
    n = round(shot['end'] * FPS) - round(shot['t'] * FPS)
    key = hashlib.sha1(repr((sorted(shot.items()), GRADE, n)).encode()).hexdigest()[:16]
    cache = os.path.join(ROOT, 'dist', 'work', f'shot-{key}.npy')
    if os.path.exists(cache):
        return list(np.load(cache))
    stretch = (shot['end'] - shot['t']) / (shot['b'] - shot['a'])
    vf = [f"trim=start={shot['a']:.4f}:end={shot['b'] + 1.0 / src_fps:.4f}",
          f'setpts=(PTS-STARTPTS)*{stretch:.5f}']
    if stretch > 1.05:
        vf.append(f'minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1')
    else:
        vf.append(f'fps={FPS}')
    vf += [GRADE, 'format=rgb24']
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', ','.join(vf), '-an',
                          '-frames:v', str(n), '-f', 'rawvideo', '-'],
                         check=True, capture_output=True).stdout
    size = SRC_W * SRC_H * 3
    frames = [np.frombuffer(raw[i:i + size], np.uint8).reshape(SRC_H, SRC_W, 3)
              for i in range(0, len(raw) - size + 1, size)]
    if not frames:
        raise RuntimeError(f'no frames decoded for shot at {shot["t"]}')
    while len(frames) < n:          # interpolation can come up a frame short
        frames.append(frames[-1])
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    np.save(cache, np.stack(frames))
    return frames


_photos = {}


def load_photo(name):
    if name not in _photos:
        _photos[name] = Image.open(os.path.join(PHOTOS, name)).convert('RGB')
    return _photos[name]


def frame_shot(src, shot, k):
    """Crops the source to 9:16 with a sub-pixel push-in and drift.

    src is a video frame (array) or, for photos, the photo itself. Photo moves are
    eased in and out so they read as a slow dolly rather than a zoom."""
    im = src if isinstance(src, Image.Image) else Image.fromarray(src)
    sw, sh = im.size
    if isinstance(src, Image.Image):
        k = k * k * (3 - 2 * k)
    h = min(shot['h'] * (1 + (shot.get('z', 1) - 1) * k), sh)
    w = h * 9 / 16
    cx = shot['cx'] + shot.get('dx', 0) * k
    cy = shot['cy'] + shot.get('dy', 0) * k
    cx = min(max(cx, w / 2), sw - w / 2)
    cy = min(max(cy, h / 2), sh - h / 2)
    box = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    if h > H:   # downscaling a large photo: Lanczos via resize keeps it crisp
        out = im.resize((W, H), Image.Resampling.LANCZOS, box=box)
        return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=30, threshold=2))
    out = im.transform((W, H), Image.Transform.EXTENT, box, Image.Resampling.BICUBIC)
    return out.filter(ImageFilter.UnsharpMask(radius=2.2, percent=55, threshold=2))


def film_look(im, exposure=1.0):
    """One grade for every source: gentle S-curve, cool shadows, warm highlights,
    slightly restrained saturation."""
    x = np.asarray(im, np.float32) / 255.0 * exposure
    s = x * x * (3 - 2 * x)
    x = x * 0.72 + s * 0.28
    lum = (x[..., 0] * 0.2126 + x[..., 1] * 0.7152 + x[..., 2] * 0.0722)[..., None]
    x = lum + (x - lum) * 0.93
    hi, lo = lum ** 2, (1 - lum) ** 2
    x += np.concatenate([0.022 * hi - 0.018 * lo, 0.004 * lo, -0.018 * hi + 0.026 * lo], axis=2)
    return np.clip(x, 0, 1)


_grain = None


def add_grain(x, i):
    """Fine luminance grain (cycled plates, so it is cheap and stable between renders)."""
    global _grain
    if _grain is None:
        g = np.random.default_rng(3)
        _grain = [g.normal(0, 1, (H, W, 1)).astype(np.float32) for _ in range(6)]
    return x + _grain[i % 6] * (0.010 * (1.0 - 0.5 * x.mean(axis=2, keepdims=True)))


def decode_contact(n):
    """The contact-card video, full frame (it is already 9:16), scaled to 1080x1920."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', CONTACT, '-an', '-vf',
                          f'fps={FPS},scale={W}:{H}:flags=lanczos,format=rgb24',
                          '-frames:v', str(n), '-f', 'rawvideo', '-'],
                         check=True, capture_output=True).stdout
    size = W * H * 3
    frames = [np.frombuffer(raw[i:i + size], np.uint8).reshape(H, W, 3)
              for i in range(0, len(raw) - size + 1, size)]
    while len(frames) < n:
        frames.append(frames[-1])
    return frames


def make_shade():
    """Soft vignette plus a bottom gradient so white titles always read."""
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(-1, 1, W)[None, :]
    r = np.sqrt(x ** 2 + ((y - 0.5) * 2) ** 2)
    vignette = np.clip((r - 0.75) / 0.9, 0, 1) * 0.35
    bottom = np.clip((y - 0.48) / 0.52, 0, 1) ** 1.6 * 0.62
    a = 1 - (1 - vignette) * (1 - bottom)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


# ---------------------------------------------------------------- titles

def text_layer(lines, fnt, fill, align='right', spacing=1.12, shadow=True, direction='rtl'):
    """Renders (possibly multi-line) text into a tight RGBA layer with a soft shadow."""
    asc, desc = fnt.getmetrics()
    lh = int((asc + desc) * spacing)
    pad = 90
    widths = [int(fnt.getlength(l, direction=direction)) for l in lines]
    tw = max(widths) + 2 * pad
    th = lh * len(lines) + 2 * pad
    layer = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    mask = Image.new('L', (tw, th), 0)
    d, dm = ImageDraw.Draw(layer), ImageDraw.Draw(mask)
    for i, l in enumerate(lines):
        y = pad + i * lh + asc
        if align == 'right':
            x, anchor = tw - pad, 'rs'
        elif align == 'center':
            x, anchor = tw / 2, 'ms'
        else:
            x, anchor = pad, 'ls'
        d.text((x, y), l, font=fnt, fill=fill, anchor=anchor, direction=direction)
        dm.text((x, y), l, font=fnt, fill=255, anchor=anchor, direction=direction)
    if shadow:
        # a tight shadow for edge definition plus a wide soft scrim, so white type
        # still reads on white walls and white work shirts
        tight = np.asarray(mask.filter(ImageFilter.GaussianBlur(12)), np.float32) * 0.6
        wide = np.asarray(mask.filter(ImageFilter.GaussianBlur(38)), np.float32) * 1.5 * 0.42
        sh = Image.fromarray(np.clip(np.maximum(tight, wide), 0, 255).astype(np.uint8), 'L')
        base = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
        base.putalpha(sh)
        base = Image.alpha_composite(base, layer)
        return base, pad
    return layer, pad


# Brand wires under the titles: three insulated cables (red, yellow, blue) twisted
# together like the cables in the logo, rendered as shaded 3D tubes.
WIRE_COLORS = [(196, 32, 30), (228, 188, 38), (52, 92, 168)]     # sampled from the logo's cables
WIRE_H = 40            # sprite height; the cable bundle is centred where the old colour bars sat
WIRE_SS = 3            # supersampling for clean edges


def render_wires(width, p):
    """Three twisted cables, `width` px long. p (0..1) animates the entrance: the bundle
    grows from the right (reading direction) while the cables wind into their twist."""
    e = ease_out(p)
    ss = WIRE_SS
    w, h = width * ss, WIRE_H * ss
    r, amp, lam = 5.6 * ss, 5.9 * ss, 86 * ss
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xx += 0.5
    yy += 0.5
    x0, x1 = w * (1 - e) + r, w - r                       # left end moves out as it enters
    if x1 - x0 < 1:
        return Image.new('RGBA', (width, WIRE_H), (0, 0, 0, 0))
    wind = 0.35 + 0.65 * e                                # untwisted -> fully wound
    spin = (1 - e) * 2.4
    cx = np.clip(xx, x0, x1)
    best_z = np.full((h, w), -9.0, np.float32)
    rgb = np.zeros((h, w, 3), np.float32)
    cover = np.zeros((h, w), np.float32)
    fields = []
    for i in range(3):
        ph = 2 * np.pi * (w - cx) / lam * wind + spin + 2 * np.pi * i / 3
        f = h / 2 + amp * np.sin(ph)
        df = -amp * np.cos(ph) * 2 * np.pi / lam * wind
        d = (yy - f) / np.sqrt(1 + df ** 2)
        dist = np.sqrt(d ** 2 + (xx - cx) ** 2)            # rounded, insulated end caps
        z = np.cos(ph)
        fields.append((dist, d, z))
    for i, (dist, d, z) in enumerate(fields):
        inside = dist < r
        u = np.clip(d / r, -1, 1)
        nz = np.sqrt(np.clip(1 - u ** 2, 0, 1))
        diff = np.clip(-0.55 * u + 0.84 * nz, 0, 1)
        spec = np.clip(-0.30 * u + 0.95 * nz, 0, 1) ** 28 * 0.55
        depth = 0.80 + 0.20 * (z + 1) / 2
        occl = np.ones_like(u)
        for j, (dj, _, zj) in enumerate(fields):
            if j != i:
                occl = np.minimum(occl, np.where((zj > z) & (dj < r * 1.45), 0.62 + 0.38 * np.clip((dj - r) / (0.45 * r), 0, 1), 1))
        col = np.array(WIRE_COLORS[i], np.float32) / 255
        c = col[None, None, :] * (0.30 + 0.85 * diff * depth * occl)[..., None] + spec[..., None]
        take = inside & (z > best_z)
        rgb[take] = c[take]
        best_z[take] = z[take]
        cover[inside] = 1
    # downsample (box filter) to the final size
    rgb = (rgb * cover[..., None]).reshape(WIRE_H, ss, width, ss, 3).mean(axis=(1, 3))
    a = cover.reshape(WIRE_H, ss, width, ss).mean(axis=(1, 3))
    rgb = np.where(a[..., None] > 0, rgb / np.maximum(a[..., None], 1e-6), 0)
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, a * 255]).astype(np.uint8), 'RGBA')
    # soft contact shadow so the cables sit on any background
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
    sh.putalpha(im.getchannel('A').filter(ImageFilter.GaussianBlur(3)).point(lambda v: int(v * 0.55)))
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.alpha_composite(sh, (0, 3))
    out.alpha_composite(im)
    return out


_wire_cache = {}


def wire_sprite(width, p):
    key = (width, min(30, max(0, round(p * 30))))
    if key not in _wire_cache:
        _wire_cache[key] = render_wires(width, key[1] / 30)
    return _wire_cache[key]


_cache = {}


def title_sprite(title):
    """Returns (sprite, x, y) for a title: an RGBA image and its top-left position."""
    key = (title['text'], title['style'], title.get('row'))
    if key in _cache:
        return _cache[key]
    style = title['style']
    lines = title['text'].split('\n')
    right = W - SAFE_X
    if style == 'title':
        layer, pad = text_layer(lines, fitted(800, 92, lines), WHITE)
        bar_gap, bottom = 26, 1490
    elif style == 'kicker':
        layer, pad = text_layer(lines, fitted(700, 62, lines), WHITE)
        bar_gap, bottom = 22, 1490
    elif style == 'q1':
        layer, pad = text_layer(lines, fitted(700, 88, lines), WHITE)
        bar_gap, bottom = None, 1250
    elif style == 'q2':
        layer, pad = text_layer(lines, fitted(900, 196, lines), WHITE)
        bar_gap, bottom = 18, 1490
    elif style == 'service':
        layer, pad = text_layer(lines, fitted(900, 116, lines), WHITE)
        bar_gap, bottom = 24, 1490
    elif style == 'stack':
        layer, pad = text_layer(lines, fitted(900, 128, lines), WHITE)
        bar_gap, bottom = None, 1200 + title['row'] * 150
    else:
        raise ValueError(style)
    wire = None
    if bar_gap is not None:
        # the cables take the slot the 9 px colour bars used, so the titles keep their layout
        bottom += bar_gap + 9
        wire_w = 300 if style in ('q2', 'service') else 260
        x = right - (layer.width - pad)
        y = bottom - 9 - bar_gap - (layer.height - pad)
        wire = (wire_w, right - wire_w, bottom - 9 / 2 - WIRE_H / 2)
    else:
        x = right - (layer.width - pad)
        y = bottom - (layer.height - pad)
    _cache[key] = (layer, x, y, wire)
    return _cache[key]


def draw_titles(canvas, t):
    for title in TITLES:
        if not title['t'] <= t < title['end']:
            continue
        sprite, x, y, wire = title_sprite(title)
        k = ease_out((t - title['t']) / 0.32)
        out = min(1.0, (title['end'] - t) / 0.12)
        alpha = k * out
        dy = (1 - k) * 34
        if alpha <= 0:
            continue
        s = sprite
        if alpha < 1:
            s = sprite.copy()
            s.putalpha(s.getchannel('A').point(lambda v: int(v * alpha)))
        canvas.alpha_composite(s, (int(x), int(y + dy)))
        if wire:
            ww, wx, wy = wire
            ws = wire_sprite(ww, (t - title['t'] - 0.08) / 0.55)
            if out < 1:
                ws = ws.copy()
                ws.putalpha(ws.getchannel('A').point(lambda v: int(v * out)))
            canvas.alpha_composite(ws, (int(wx), int(round(wy + dy))))


# ---------------------------------------------------------------- brand cards

def load_logo():
    """The original logo, untouched, scaled to the full frame width (its cables run edge to edge)."""
    im = Image.open(LOGO).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    bg = tuple(int(v) for v in np.median(a[100:350].reshape(-1, 3), axis=0))   # clean paper above the lettering
    logo = im.resize((W, round(im.height * W / im.width)), Image.Resampling.LANCZOS)
    # feather only the top and bottom margins into the card colour (the artwork is untouched)
    feather = np.ones((logo.height, 1), np.float32)
    f = 130
    ramp = np.linspace(0, 1, f)[:, None]
    feather[:f] = ramp
    feather[-f:] = ramp[::-1]
    alpha = Image.fromarray((np.repeat(feather, W, axis=1) * 255).astype(np.uint8), 'L')
    logo = logo.convert('RGBA')
    logo.putalpha(alpha)
    # where the artwork is (lettering, bolt, cables): used only to light it, never to cut it out
    la = np.asarray(logo.convert('RGB'), np.float32)
    ink = np.clip((np.abs(la - np.array(bg, np.float32)).max(axis=2) - 18) / 40, 0, 1)
    ink = np.asarray(Image.fromarray((ink * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)),
                     np.float32) / 255
    return logo, bg, ink


LOGO_IM, CARD_BG, LOGO_INK = load_logo()


def light_sweep(lg, p):
    """A soft band of light glides across the logo, right to left (p: 0..1).
    It brightens the artwork for a moment; the logo itself is not altered."""
    if not 0 < p < 1:
        return lg
    h, w = LOGO_INK.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    centre = w * (1.25 - 1.5 * p)
    band = np.exp(-(((xx - 0.45 * yy) - centre) / 60) ** 2) * np.sin(np.pi * p)
    a = np.asarray(lg, np.float32)
    rgb = a[..., :3] + (255 - a[..., :3]) * (0.38 * band * LOGO_INK)[..., None]
    return Image.fromarray(np.concatenate([rgb, a[..., 3:]], axis=2).astype(np.uint8), 'RGBA')


def place_logo(canvas, cy, alpha=1.0, scale=1.0, dy=0.0, sweep=None):
    lg = LOGO_IM if sweep is None else light_sweep(LOGO_IM, sweep)
    if scale != 1.0:
        lg = lg.resize((round(lg.width * scale), round(lg.height * scale)), Image.Resampling.LANCZOS)
    if alpha < 1:
        lg = lg.copy()
        lg.putalpha(lg.getchannel('A').point(lambda v: int(v * alpha)))
    canvas.alpha_composite(lg, (round((W - lg.width) / 2), round(cy - lg.height / 2 + dy)))


def centered(canvas, text, fnt, fill, cy, alpha, dy, direction='rtl', shadow=False):
    layer, pad = text_layer([text], fnt, fill, align='center', shadow=shadow, direction=direction)
    if alpha < 1:
        layer.putalpha(layer.getchannel('A').point(lambda v: int(v * alpha)))
    canvas.alpha_composite(layer, (round((W - layer.width) / 2), round(cy - layer.height / 2 + dy)))
    return layer.width - 2 * pad


def card(kind, t):
    canvas = Image.new('RGBA', (W, H), CARD_BG + (255,))
    if kind == 'CARD_CHOOSE':
        k = ease_out((t - CARD_CHOOSE['text_at']) / 0.35)
        centered(canvas, 'תבחרו נכון.', font(800, 118), NAVY, 690, k, (1 - k) * 26)
        if t >= CARD_CHOOSE['logo_at']:
            k = ease_out((t - CARD_CHOOSE['logo_at']) / 0.45)
            place_logo(canvas, 1050, alpha=k, dy=(1 - k) * 28, scale=0.96 + 0.04 * k,
                       sweep=(t - CARD_CHOOSE['logo_at'] - 0.3) / 0.9)
    elif kind == 'CARD_LOGO':
        k = ease_out((t - CARD_LOGO['logo_at']) / 0.5)
        place_logo(canvas, 900, scale=1.05 - 0.05 * k, sweep=(t - CARD_LOGO['logo_at'] - 0.05) / 0.8)
    elif kind == 'CARD_END':
        e = CARD_END
        k = ease_out((t - e['logo_at']) / 0.45)
        drift = 0.012 * (t - e['logo_at']) / (DURATION - e['logo_at'])
        place_logo(canvas, 740, alpha=k, dy=(1 - k) * 28, scale=0.97 + 0.03 * k + drift,
                   sweep=(t - e['logo_at'] - 0.35) / 1.0)
        if t >= e['slogan_at']:
            k = ease_out((t - e['slogan_at']) / 0.35)
            centered(canvas, 'יש על מי לבנות.', font(800, 104), NAVY, 1140, k, (1 - k) * 24)
        if t >= e['phone_at']:
            k = ease_out((t - e['phone_at']) / 0.35)
            centered(canvas, PHONE, font(900, 136), RED, 1300, k, (1 - k) * 24, direction='ltr')
    return canvas


# ---------------------------------------------------------------- render

def render_frames(times=None):
    """Yields (t, RGB image) for every frame (or only for the given times)."""
    shade = make_shade()
    n_total = round(DURATION * FPS)
    want = None if times is None else {min(n_total - 1, round(t * FPS)) for t in times}
    for shot in SHOTS:
        f0, f1 = round(shot['t'] * FPS), round(shot['end'] * FPS)
        idx = [i for i in range(f0, f1) if want is None or i in want]
        if not idx:
            continue
        if shot['src'].startswith('CARD'):
            frames = None
        elif shot['src'] == 'CONTACT':
            frames = decode_contact(f1 - f0)
        elif shot['src'] == 'P':
            frames = load_photo(shot['img'])
        else:
            frames = decode_shot(shot)
        for i in idx:
            t = i / FPS
            if frames is None:
                canvas = card(shot['src'], t)
            elif shot['src'] == 'CONTACT':      # shown as delivered: no crop, grade or grain
                canvas = Image.fromarray(frames[i - f0]).convert('RGBA')
            else:
                k = (i - f0) / max(1, f1 - f0 - 1)
                src = frames if isinstance(frames, Image.Image) else frames[i - f0]
                x = film_look(frame_shot(src, shot, k), 0.95 if shot['src'] == 'P' else 1.0)
                x = add_grain(x, i)
                fade = shot.get('fade_in')
                if fade:      # rises out of darkness on the bass hit
                    x *= 0.15 + 0.85 * ease_out((t - shot['t']) / fade)
                canvas = Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)).convert('RGBA')
                canvas.alpha_composite(shade)
            draw_titles(canvas, t)
            yield t, canvas.convert('RGB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stills', help='comma-separated times in seconds')
    ap.add_argument('--stills-dir', default=os.path.join(ROOT, 'dist', 'stills'))
    ap.add_argument('--audio', default=os.path.join(ROOT, 'dist', 'hashmali-cinematic-ad-vertical.wav'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'dist', 'hashmali-cinematic-ad-vertical.mp4'))
    ap.add_argument('--crf', default='19')
    ap.add_argument('--preset', default='slow')
    args = ap.parse_args()

    if args.stills:
        os.makedirs(args.stills_dir, exist_ok=True)
        times = [float(s) for s in args.stills.split(',')]
        for t, im in render_frames(times):
            p = os.path.join(args.stills_dir, f'still-{t:06.2f}.png')
            im.save(p)
            print(p)
        return

    cmd = ['ffmpeg', '-v', 'error', '-y',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-i', args.audio,
           '-map', '0:v', '-map', '1:a',
           '-c:v', 'libx264', '-preset', args.preset, '-crf', args.crf, '-profile:v', 'high',
           '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
           '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
           '-t', f'{DURATION:.3f}', '-movflags', '+faststart', args.out]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = 0
    for t, im in render_frames():
        enc.stdin.write(im.tobytes())
        n += 1
        if n % 150 == 0:
            print(f'  {t:5.1f}s', flush=True)
    enc.stdin.close()
    if enc.wait() != 0:
        sys.exit('ffmpeg failed')
    print(f'{n} frames -> {args.out}')


if __name__ == '__main__':
    main()
