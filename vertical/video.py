"""Renders the vertical Hashmali ad, frame by frame, from edit.py.

    python vertical/video.py                    # full render -> dist/hashmali-cinematic-ad-vertical.mp4
    python vertical/video.py --stills 1,8.3,40  # single frames -> dist/stills/
    python vertical/video.py --out x.mp4 --crf 23 --preset veryfast   # quick preview

Footage is decoded by ffmpeg (trim, time-stretch, motion interpolation, grade),
then framed, titled and composited here with Pillow, and piped to ffmpeg for
H.264 encoding together with the mix from audio.py.
"""
import argparse
import hashlib
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from edit import (CARD_CHOOSE, CARD_END, CARD_LOGO, DURATION, FONTS, FPS, H, KITCHEN, LOGO,
                  PHONE, ROOT, SHOTS, TITLES, W, WORK)

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


def frame_shot(src, shot, k):
    """Crops the source frame to 9:16 with a sub-pixel push-in and drift."""
    h = shot['h'] * (1 + (shot.get('z', 1) - 1) * k)
    w = h * 9 / 16
    cx = shot['cx'] + shot.get('dx', 0) * k
    cy = shot['cy'] + shot.get('dy', 0) * k
    cx = min(max(cx, w / 2), SRC_W - w / 2)
    cy = min(max(cy, h / 2), SRC_H - h / 2)
    im = Image.fromarray(src).transform((W, H), Image.Transform.EXTENT,
                                        (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2),
                                        Image.Resampling.BICUBIC)
    return im.filter(ImageFilter.UnsharpMask(radius=2.2, percent=55, threshold=2))


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
    pad = 40
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
        sh = mask.filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.55))
        base = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
        base.putalpha(sh)
        base = Image.alpha_composite(base, layer)
        return base, pad
    return layer, pad


def tricolor(width=170, height=9, gap=6):
    seg = (width - 2 * gap) // 3
    im = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, c in enumerate((BLUE, YELLOW, RED)):          # reads red-yellow-blue from the right
        x0 = i * (seg + gap)
        d.rounded_rectangle([x0, 0, x0 + seg, height - 1], radius=height // 2, fill=c + (255,))
    return im


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
    sprite = layer
    if bar_gap is not None:
        bar = tricolor(200 if style in ('q2', 'service') else 170)
        sprite = Image.new('RGBA', (layer.width, layer.height + bar_gap + bar.height), (0, 0, 0, 0))
        sprite.alpha_composite(layer, (0, 0))
        sprite.alpha_composite(bar, (layer.width - pad - bar.width, layer.height - pad + bar_gap))
        bottom += bar_gap + bar.height
    x = right - (sprite.width - pad)
    y = bottom - (sprite.height - pad)
    if style == 'service':
        idx = ['תשתיות', 'לוחות חשמל', 'תאורה חכמה', 'עמדות טעינה'].index(title['text'])
        num, npad = text_layer([f'0{idx + 1}/04'], font(700, 46), YELLOW, direction='ltr')
        s2 = Image.new('RGBA', (sprite.width, sprite.height + num.height - npad), (0, 0, 0, 0))
        s2.alpha_composite(num, (sprite.width - num.width - (pad - npad), 0))
        s2.alpha_composite(sprite, (0, num.height - npad))
        y -= num.height - npad
        sprite = s2
    _cache[key] = (sprite, x, y)
    return _cache[key]


def draw_titles(canvas, t):
    for title in TITLES:
        if not title['t'] <= t < title['end']:
            continue
        sprite, x, y = title_sprite(title)
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
    return logo, bg


LOGO_IM, CARD_BG = load_logo()


def place_logo(canvas, cy, alpha=1.0, scale=1.0, dy=0.0):
    lg = LOGO_IM
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
            place_logo(canvas, 1050, alpha=k, dy=(1 - k) * 28, scale=0.96 + 0.04 * k)
    elif kind == 'CARD_LOGO':
        k = ease_out((t - CARD_LOGO['logo_at']) / 0.5)
        place_logo(canvas, 900, scale=1.05 - 0.05 * k)
    elif kind == 'CARD_END':
        e = CARD_END
        k = ease_out((t - e['logo_at']) / 0.45)
        drift = 0.012 * (t - e['logo_at']) / (DURATION - e['logo_at'])
        place_logo(canvas, 740, alpha=k, dy=(1 - k) * 28, scale=0.97 + 0.03 * k + drift)
        if t >= e['slogan_at']:
            k = ease_out((t - e['slogan_at']) / 0.35)
            centered(canvas, 'יש על מי לבנות.', font(800, 104), NAVY, 1140, k, (1 - k) * 24)
        if t >= e['phone_at']:
            k = ease_out((t - e['phone_at']) / 0.35)
            centered(canvas, PHONE, font(900, 136), RED, 1300, k, (1 - k) * 24, direction='ltr')
        if t >= e['cta_at']:
            k = ease_out((t - e['cta_at']) / 0.35)
            cta(canvas, 1462, k, (1 - k) * 20)
    return canvas


def cta(canvas, cy, alpha, dy):
    fnt = font(700, 56)
    text = 'לתיאום וייעוץ — דברו איתנו'
    tw = int(fnt.getlength(text, direction='rtl'))
    pw, ph = tw + 110, 104
    pill = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    d = ImageDraw.Draw(pill)
    d.rounded_rectangle([0, 0, pw - 1, ph - 1], radius=ph // 2, fill=RED + (255,))
    asc, desc = fnt.getmetrics()
    d.text((pw / 2, ph / 2 + (asc - desc) / 2 - 2), text, font=fnt, fill=WHITE, anchor='ms', direction='rtl')
    if alpha < 1:
        pill.putalpha(pill.getchannel('A').point(lambda v: int(v * alpha)))
    canvas.alpha_composite(pill, (round((W - pw) / 2), round(cy - ph / 2 + dy)))


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
        frames = None if shot['src'].startswith('CARD') else decode_shot(shot)
        for i in idx:
            t = i / FPS
            if frames is None:
                canvas = card(shot['src'], t)
            else:
                k = (i - f0) / max(1, f1 - f0 - 1)
                canvas = frame_shot(frames[i - f0], shot, k).convert('RGBA')
                canvas.alpha_composite(shade)
            draw_titles(canvas, t)
            yield t, canvas.convert('RGB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stills', help='comma-separated times in seconds')
    ap.add_argument('--stills-dir', default=os.path.join(ROOT, 'dist', 'stills'))
    ap.add_argument('--audio', default=os.path.join(ROOT, 'dist', 'hashmali-cinematic-ad-vertical.wav'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'dist', 'hashmali-cinematic-ad-vertical.mp4'))
    ap.add_argument('--crf', default='16')
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
