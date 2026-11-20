"""Gently enhance photos: auto-level, lift shadows, mild saturation+sharpen. Also bake a blurred
royal-tinted 1080x1920 background per photo (for vertical-frame fill)."""
import glob, os, sys
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageOps
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for f in sorted(glob.glob(os.path.join(src, '*.jpg'))):
    n = os.path.splitext(os.path.basename(f))[0]
    im = ImageOps.exif_transpose(Image.open(f)).convert('RGB')
    a = np.asarray(im).astype(np.float32) / 255
    lum = a.mean(2)
    lo, hi = np.percentile(lum, 0.5), np.percentile(lum, 99.6)
    a = np.clip((a - lo) / max(hi - lo, 1e-3), 0, 1)          # per-image levels (same for all channels: keeps skin tones)
    m = a.mean()
    g = np.log(0.56) / np.log(max(min(m, 0.9), 0.1))          # gamma towards mid-bright
    g = float(np.clip(g, 0.8, 1.0))
    a = a ** g
    im2 = Image.fromarray((a * 255 + 0.5).astype(np.uint8))
    im2 = ImageEnhance.Color(im2).enhance(1.08)
    im2 = ImageEnhance.Contrast(im2).enhance(1.04)
    im2 = im2.filter(ImageFilter.UnsharpMask(radius=1.6, percent=55, threshold=2))
    im2.save(os.path.join(dst, n + '.jpg'), quality=93)
    # background: cover 1080x1920, heavy blur, blue tint, darken
    bg = ImageOps.fit(im2, (540, 960), Image.LANCZOS).filter(ImageFilter.GaussianBlur(28))
    b = np.asarray(bg).astype(np.float32) / 255
    tint = np.array([0.10, 0.20, 0.55])
    b = b * 0.45 + tint * 0.35
    Image.fromarray((np.clip(b, 0, 1) * 255).astype(np.uint8)).resize((1080, 1920), Image.BICUBIC).save(os.path.join(dst, n + '-bg.jpg'), quality=88)
    print(n, 'gamma', round(g, 2), 'mean', round(float(m), 2))
