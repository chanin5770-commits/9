#!/usr/bin/env python3
"""פוסטר טיזר 4:5: ״הדלת לממלכת האותיות עומדת להיפתח...״

  python3 tools/render_poster.py   # -> dist/poster-teaser-4x5.png (2160x2700) + dist/poster-teaser-4x5-whatsapp.jpg (1080x1350)

The image is one real frame of the King of Letters clip (footage/king/king-golden-door.mp4, 6.85 s):
the gate open a crack, golden light, the king from behind. It is upscaled 4x with Real-ESRGAN
(tools/sr_anime.py) and nothing is drawn into it. The text is exactly the requested copy and the
logo is the original file, unchanged.
"""
import os, subprocess
import numpy as np, cv2

import render_clip as RC
import render_summary as RS
import sr_anime

ROOT = RC.ROOT
W, H = 2160, 2700
FRAME = (os.path.join(ROOT, "footage", "king", "king-golden-door.mp4"), 6.85)
WEIGHTS = os.path.join(ROOT, ".cache", "realesr-animevideov3.pth")
IMG_TOP = 800          # where the photo starts (it fades in above this)


def paste(f, spr, cx, cy):
    """alpha-composite a BGRA sprite centred at (cx, cy), clipped to this canvas."""
    h, w = spr.shape[:2]; x0, y0 = int(cx - w / 2), int(cy - h / 2)
    xa, ya, xb, yb = max(x0, 0), max(y0, 0), min(x0 + w, f.shape[1]), min(y0 + h, f.shape[0])
    s = spr[ya - y0:yb - y0, xa - x0:xb - x0]; al = s[..., 3:4] / 255
    f[ya:yb, xa:xb] = f[ya:yb, xa:xb] * (1 - al) + s[..., :3] * al


def hero():
    path, t = FRAME
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t}", "-i", path, "-frames:v", "1", "-f", "rawvideo",
                          "-pix_fmt", "bgr24", "-"], capture_output=True, check=True).stdout
    f = np.frombuffer(raw, np.uint8).reshape(360, 640, 3)
    big = sr_anime.upscale_tiled(f, sr_anime.load_pth(WEIGHTS))           # 2560x1440
    cw = 2000; cx = 1240                                                 # the whole gate, the king below it
    crop = big[:, cx - cw // 2:cx + cw // 2]
    img = cv2.resize(crop, (W, int(crop.shape[0] * W / crop.shape[1])), interpolation=cv2.INTER_LANCZOS4).astype(np.float32)
    # gentle finishing: a touch of bloom on the light, creamier highlights
    small = cv2.resize(img, None, fx=.25, fy=.25, interpolation=cv2.INTER_AREA)
    hl = cv2.GaussianBlur(np.clip(small - 205, 0, None), (0, 0), 12)
    img += cv2.resize(hl, (img.shape[1], img.shape[0])) * .35
    return np.clip(img, 0, 255)


def background():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = yy / H
    cream, pink = np.array([234, 244, 251], np.float32), np.array([216, 213, 243], np.float32)   # BGR #FBF4EA, #F3D5D8
    f = cream * (1 - v[..., None] * .6) + pink * (v[..., None] * .6)
    # a soft pale-blue whisper in the upper corners (brand תכלת), very light
    f += np.exp(-(((xx - W * .1) / (W * .45)) ** 2 + ((yy - H * .02) / (H * .18)) ** 2))[..., None] * np.array([12, 5, -6], np.float32)
    f += np.exp(-(((xx - W * .9) / (W * .45)) ** 2 + ((yy - H * .02) / (H * .18)) ** 2))[..., None] * np.array([12, 5, -6], np.float32)
    return f


def compose():
    f = background()
    img = hero(); ih = img.shape[0]
    y0, y1 = IMG_TOP, min(IMG_TOP + ih, H)
    a = np.ones(y1 - y0, np.float32)
    top_fade, bot_fade = 380, 430
    a[:top_fade] = np.linspace(0, 1, top_fade) ** 1.6                   # photo rises out of the cream
    a[-bot_fade:] = np.minimum(a[-bot_fade:], np.linspace(1, 0, bot_fade) ** 1.3)   # and settles into it for the logo
    a = a[:, None, None]
    f[y0:y1] = f[y0:y1] * (1 - a) + img[:y1 - y0] * a
    # the light of the gate warming the cream above it
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    f += np.exp(-(((xx - W * .55) / (W * .5)) ** 2 + ((yy - IMG_TOP * 1.05) / (H * .16)) ** 2))[..., None] * np.array([10, 30, 48], np.float32)

    burg = RS.BURG
    lines = [("22 אותיות.", 205, 250), ("שנה שלמה.", 205, 455), ("אינסוף חוויות חסידיות!", 148, 645)]
    for s, size, y in lines:
        paste(f, RS.text_sprite(s, RS.FR, size, "Black", burg, edge="gold"), W / 2, y)
    paste(f, RS.text_sprite("הצצה ראשונה — רק כאן!", RS.FR, 92, "Bold", (34, 98, 160), edge="gold", shadow=False), W / 2, 805)

    logo = RS.load("logo-chanili.png"); lw = 640
    logo = cv2.resize(logo, (lw, int(logo.shape[0] * lw / logo.shape[1])), interpolation=cv2.INTER_AREA)
    paste(f, logo, W / 2, H - 190)
    return np.clip(f, 0, 255).astype(np.uint8)


if __name__ == "__main__":
    out = compose()
    d = os.path.join(ROOT, "dist"); os.makedirs(d, exist_ok=True)
    cv2.imwrite(os.path.join(d, "poster-teaser-4x5.png"), out)
    cv2.imwrite(os.path.join(d, "poster-teaser-4x5-whatsapp.jpg"), cv2.resize(out, (1080, 1350), interpolation=cv2.INTER_AREA),
                [cv2.IMWRITE_JPEG_QUALITY, 93])
    print("wrote", os.path.join(d, "poster-teaser-4x5.png"))
