#!/usr/bin/env python3
"""Gentle photo enhancement for the Libi clip.

  python3 libi/tools/enhance.py

Reads libi/assets/photos-original/*.jpg and writes:
  libi/assets/photos/<name>.jpg   enhanced (portraits upscaled to 1080x1920)
  libi/assets/bg/<name>.jpg       soft, pink-tinted blurred backdrop (540x960)

Only global corrections are applied (white balance, exposure, levels,
mild clarity and sharpening). Faces are never retouched or reshaped.
"""
import glob
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/photos-original')
OUT = os.path.join(ROOT, 'assets/photos')
BG = os.path.join(ROOT, 'assets/bg')


def luma(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def enhance(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255.0

    # 1) Partial grey-world white balance, measured on mid-tones only so the
    #    pink cape / purple box do not drag the balance.
    L = luma(a)
    mid = (L > 0.2) & (L < 0.85)
    means = a[mid].mean(0)
    gain = means.mean() / means
    gain = 1 + (gain - 1) * 0.35          # 35% of the way: keeps the warm room light
    a = np.clip(a * gain, 0, 1)

    # 2) Soft auto-levels (60% strength).
    L = luma(a)
    lo, hi = np.percentile(L, 0.4), np.percentile(L, 99.6)
    lo, hi = lo * 0.6, hi + (1 - hi) * 0.4
    a = np.clip((a - lo) / max(hi - lo, 1e-3), 0, 1)

    # 3) Exposure: lift darker shots toward a mean of ~0.52 with a gamma curve.
    m = luma(a).mean()
    target = 0.52
    if m < target:
        g = np.log(target) / np.log(max(m, 1e-3))
        g = max(g, 0.72)                   # never more than a gentle lift
        a = a ** g

    # 4) A touch of saturation (skin-safe, 6%).
    L = luma(a)[..., None]
    a = np.clip(L + (a - L) * 1.06, 0, 1)

    out = Image.fromarray((a * 255 + 0.5).astype(np.uint8))
    # 5) Light clarity + sharpening.
    out = out.filter(ImageFilter.UnsharpMask(radius=24, percent=12, threshold=0))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(BG, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(SRC, '*.jpg'))):
        name = os.path.basename(f)
        im = Image.open(f)
        e = enhance(im)
        w, h = e.size
        if h > w:   # portrait 9:16 -> 1080x1920
            e = e.resize((1080, round(1080 * h / w)), Image.LANCZOS)
        e = e.filter(ImageFilter.UnsharpMask(radius=1.1, percent=55, threshold=2))
        e.save(os.path.join(OUT, name), quality=94, subsampling=0)

        # blurred backdrop
        b = e.copy()
        bw, bh = b.size
        s = max(540 / bw, 960 / bh) * 1.15
        b = b.resize((round(bw * s), round(bh * s)), Image.LANCZOS)
        l, t = (b.width - 540) // 2, (b.height - 960) // 2
        b = b.crop((l, t, l + 540, t + 960)).filter(ImageFilter.GaussianBlur(26))
        tint = Image.new('RGB', b.size, (250, 214, 226))
        b = Image.blend(b, tint, 0.42)
        b.save(os.path.join(BG, name), quality=90)
        print(f'{name:32s} {im.size} -> {e.size}  mean {luma(np.asarray(im)/255.).mean():.2f} -> {luma(np.asarray(e)/255.).mean():.2f}')


if __name__ == '__main__':
    main()
