# -*- coding: utf-8 -*-
"""
Renders the clip: kislev-clip/dist/rosh-chodesh-kislev-clip.mp4

  python3 kislev-clip/tools/render.py            # full render (4 processes)
  python3 kislev-clip/tools/render.py --preview 50 66   # quick render of one range

Each frame is built from the storyboard panels (assets/panels, upscaled 4x
into assets/panels_hd), following the shot list in timeline.py. The real photo
of the Rebbe (real_clean / real_panel) is only resized, never retouched or
colour-graded, and no effects are drawn over it.
"""
import os, sys, math, subprocess, argparse
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import timeline as TL

W, H, FPS = 1920, 1080, 25
PANELS = os.path.join(ROOT, "assets", "panels")
HD = os.path.join(ROOT, "assets", "panels_hd")
FONT_TITLE = os.path.join(ROOT, "assets", "fonts", "FrankRuhlLibre-Hebrew-900.woff2")
FONT_SUB = os.path.join(ROOT, "assets", "fonts", "Heebo-Hebrew-700.woff2")
AUDIO = os.path.join(ROOT, "assets", "song.mp3")
REAL = {"real_clean", "real_panel"}

# ------------------------------------------------------------------ helpers
def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)

def ease_io(x):
    x = min(1.0, max(0.0, x))
    return 0.5 - 0.5 * math.cos(math.pi * x)

def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))

_cache = {}
def load(name):
    if name in _cache:
        return _cache[name]
    hd = os.path.join(HD, name + ".png")
    lo = os.path.join(PANELS, name + ".png")
    if name in REAL or not os.path.exists(hd):
        im = Image.open(lo).convert("RGB")
        if name not in REAL:
            im = im.resize((im.width * 4, im.height * 4), Image.LANCZOS)
        else:  # real photo: plain resize only (no AI upscaling)
            im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    else:
        im = Image.open(hd).convert("RGB")
        im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=40, threshold=2))
    _cache[name] = im
    return im

def to_np(im):
    return np.asarray(im, dtype=np.float32) / 255.0

# vignette
_yy, _xx = np.mgrid[0:H, 0:W].astype(np.float32)
_r = np.sqrt(((_xx - W / 2) / (W / 2)) ** 2 + ((_yy - H / 2) / (H / 2)) ** 2)
VIGNETTE = (1.0 - 0.38 * np.clip((_r - 0.55) / 0.85, 0, 1) ** 1.6)[..., None]

rng = np.random.default_rng(7)
GRAIN = [rng.normal(0, 1, (H // 2, W // 2)).astype(np.float32) for _ in range(6)]

# ------------------------------------------------------------------ framed panel
_frame_cache = {}
def frame_assets(name):
    if name in _frame_cache:
        return _frame_cache[name]
    im = load(name)
    ar = im.width / im.height
    ph = 980
    pw = int(round(ph * ar))
    if pw > 1800:
        pw = 1800; ph = int(round(pw / ar))
    # blurred background (covers frame with margin for drift)
    bw, bh = int(W * 1.12), int(H * 1.12)
    s = max(bw / im.width, bh / im.height)
    bg = im.resize((int(im.width * s) + 1, int(im.height * s) + 1), Image.BILINEAR)
    bg = bg.crop(((bg.width - bw) // 2, (bg.height - bh) // 2, (bg.width - bw) // 2 + bw, (bg.height - bh) // 2 + bh))
    bg = bg.resize((bw // 4, bh // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(10)).resize((bw, bh), Image.BILINEAR)
    bg = to_np(bg) * 0.42
    # rounded mask + shadow
    rad = 22
    m = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, pw - 1, ph - 1), rad, fill=255)
    mask = to_np(m)[..., None]
    sh = Image.new("L", (W, H), 0)
    x0, y0 = (W - pw) // 2, (H - ph) // 2
    ImageDraw.Draw(sh).rounded_rectangle((x0 - 6, y0 + 10, x0 + pw + 6, y0 + ph + 22), rad, fill=200)
    sh = to_np(sh.filter(ImageFilter.GaussianBlur(26)))[..., None]
    border = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(border).rounded_rectangle((1, 1, pw - 2, ph - 2), rad, outline=255, width=3)
    border = to_np(border)[..., None]
    _frame_cache[name] = (im, pw, ph, x0, y0, bg, mask, sh, border)
    return _frame_cache[name]

def render_frame_mode(shot, u, t, zoom_pulse):
    im, pw, ph, x0, y0, bg, mask, sh, border = frame_assets(shot["src"])
    # background drift
    dx = int((W * 0.12) * (0.25 + 0.5 * u) * 0.5)
    dy = int((H * 0.12) * 0.5)
    out = bg[dy:dy + H, dx:dx + W].copy()
    out *= (1 - sh * 0.75)
    cx, cy, z = lerp(shot["a"], shot["b"], ease_io(u))
    z *= zoom_pulse
    sw, shh = im.width / z, im.height / z
    l = min(max(cx * im.width - sw / 2, 0), im.width - sw)
    tp = min(max(cy * im.height - shh / 2, 0), im.height - shh)
    fg = to_np(im.transform((pw, ph), Image.EXTENT, (l, tp, l + sw, tp + shh), Image.BICUBIC))
    reg = out[y0:y0 + ph, x0:x0 + pw]
    reg[:] = reg * (1 - mask) + fg * mask
    gold = np.array([0.93, 0.80, 0.52], np.float32)
    reg[:] = reg * (1 - border * 0.85) + gold * border * 0.85
    return out

def render_full_mode(shot, u, t, zoom_pulse):
    im = load(shot["src"])
    cx, cy, w = lerp(shot["a"], shot["b"], ease_io(u))
    w /= zoom_pulse
    sw = w * im.width
    shh = sw * 9 / 16
    if shh > im.height:
        shh = im.height; sw = shh * 16 / 9
    l = min(max(cx * im.width - sw / 2, 0), im.width - sw)
    tp = min(max(cy * im.height - shh / 2, 0), im.height - shh)
    return to_np(im.transform((W, H), Image.EXTENT, (l, tp, l + sw, tp + shh), Image.BICUBIC))

_banner = {}
def render_banner(shot, u, t):
    if not _banner:
        bgsrc = load("g12")
        bgim = bgsrc.crop((0, 0, bgsrc.width, int(bgsrc.width * 9 / 16))).resize((W, H), Image.BILINEAR)
        _banner["bg"] = to_np(bgim.resize((W // 4, H // 4)).filter(ImageFilter.GaussianBlur(6)).resize((W, H), Image.BILINEAR)) * 0.55
        _banner["im"] = load("banner")
    bg = _banner["bg"].copy()
    im = _banner["im"]
    s = 0.96 + 0.05 * ease_io(u)
    bw = int(W * s); bh = int(bw * im.height / im.width)
    b = to_np(im.resize((bw, bh), Image.BICUBIC))
    x0 = (W - bw) // 2; y0 = (H - bh) // 2
    xs0, ys0 = max(0, -x0), 0
    x0c = max(0, x0)
    wv = min(W, bw - xs0)
    bg[y0:y0 + bh, x0c:x0c + wv] = b[ys0:ys0 + bh, xs0:xs0 + wv]
    return bg

_card = {}
_title = {}
def render_card(shot, u, t):
    if not _card:
        src = load("g08")
        crop = src.crop((0, 0, src.width, int(src.width * 9 / 16))).resize((W, H), Image.BILINEAR)
        bg = crop.resize((W // 6, H // 6)).filter(ImageFilter.GaussianBlur(4)).resize((W, H), Image.BILINEAR)
        _card["bg"] = to_np(bg) * 0.38
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        f = ImageFont.truetype(FONT_TITLE, 104)
        lines = TL.CLOSING.split("\n")
        y = H / 2 - 150
        for ln in lines:
            bb = d.textbbox((0, 0), ln, font=f, direction="rtl", language="he")
            x = (W - (bb[2] - bb[0])) / 2 - bb[0]
            d.text((x + 4, y + 6), ln, font=f, fill=(40, 15, 5, 200), direction="rtl", language="he")
            d.text((x, y), ln, font=f, fill=(250, 226, 160, 255), direction="rtl", language="he")
            y += 160
        a = np.asarray(layer, np.float32) / 255
        glow = np.asarray(layer.filter(ImageFilter.GaussianBlur(18)), np.float32) / 255
        _card["rgb"], _card["a"], _card["glow"] = a[..., :3], a[..., 3:], glow[..., 3:]
    out = _card["bg"].copy()
    k = ease(u * 3.0)
    out = out + _card["glow"] * np.array([1.0, 0.75, 0.3], np.float32) * 0.35 * k
    out = out * (1 - _card["a"] * k) + _card["rgb"] * _card["a"] * k
    return out

# ------------------------------------------------------------------ grading & overlays
def grade(img, g):
    if g == "warm":
        img = img * np.array([1.05, 1.0, 0.92], np.float32) + np.array([0.012, 0.006, 0.0], np.float32)
    elif g == "gold":
        img = img * np.array([1.08, 1.02, 0.88], np.float32) + np.array([0.025, 0.014, 0.0], np.float32)
    elif g == "cool":
        lum = img.mean(axis=2, keepdims=True)
        img = (img * 0.72 + lum * 0.28) * np.array([0.93, 0.97, 1.04], np.float32) * 0.93
    return img

def leaf_sprites():
    sprites = []
    cols = [(214, 110, 30), (235, 150, 40), (190, 70, 25), (240, 185, 60), (170, 60, 20), (225, 128, 35)]
    for i, c in enumerate(cols):
        s = 64
        im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        pts = []
        for k in range(10):
            ang = math.pi * 2 * k / 10 - math.pi / 2
            r = (s * 0.46) if k % 2 == 0 else (s * 0.24)
            if k in (4, 6):
                r *= 0.8
            pts.append((s / 2 + r * math.cos(ang), s / 2 + r * math.sin(ang) * 0.9))
        d.polygon(pts, fill=c + (235,))
        d.line([(s / 2, s / 2), (s / 2, s * 0.95)], fill=(c[0] // 2, c[1] // 2, c[2] // 3, 230), width=2)
        sprites.append(im.filter(ImageFilter.GaussianBlur(0.6)))
    return sprites

LEAVES = leaf_sprites()
LEAF_SEEDS = np.random.default_rng(3).random((34, 6))
SPARK_SEEDS = np.random.default_rng(5).random((60, 5))

def draw_leaves(canvas, t, alpha):
    if alpha <= 0.01:
        return
    for i, (sx, sy, sp, sz, rot, ph) in enumerate(LEAF_SEEDS):
        size = int(22 + sz * 46)
        depth = 0.5 + sz
        period = 9.0 / depth
        y = ((t / period + sy) % 1.0) * (H + 200) - 100
        x = (sx * (W + 300) - 150 + math.sin(t * (0.6 + sp) + ph * 6) * 80 + t * 18 * depth) % (W + 200) - 100
        a = (t * (40 + 90 * sp) + rot * 360) % 360
        spr = LEAVES[i % len(LEAVES)].resize((size, size), Image.BILINEAR).rotate(a, Image.BILINEAR, expand=True)
        if sz > 0.85:
            spr = spr.filter(ImageFilter.GaussianBlur(2.5))
        if alpha < 1:
            r, g, b_, aa = spr.split()
            aa = aa.point(lambda v: int(v * alpha))
            spr = Image.merge("RGBA", (r, g, b_, aa))
        canvas.alpha_composite(spr, (int(x), int(y)))

def sparkle_layer(t, alpha):
    layer = Image.new("L", (W // 2, H // 2), 0)
    d = ImageDraw.Draw(layer)
    for (sx, sy, sp, sz, ph) in SPARK_SEEDS:
        y = (sy - t * (0.02 + 0.05 * sp)) % 1.0
        x = sx + 0.02 * math.sin(t * 1.3 + ph * 6)
        tw = 0.5 + 0.5 * math.sin(t * (2 + 3 * sp) + ph * 9)
        r = 1.5 + sz * 5
        v = int(255 * tw * alpha)
        d.ellipse((x * W / 2 - r, y * H / 2 - r, x * W / 2 + r, y * H / 2 + r), fill=v)
    layer = layer.filter(ImageFilter.GaussianBlur(2.2)).resize((W, H), Image.BILINEAR)
    return to_np(layer)[..., None] * np.array([1.0, 0.82, 0.45], np.float32)

def glow_layer(t, alpha):
    gx = W * (0.75 + 0.1 * math.sin(t * 0.2))
    gy = H * (0.15 + 0.05 * math.cos(t * 0.17))
    d2 = ((_xx - gx) / (W * 0.55)) ** 2 + ((_yy - gy) / (H * 0.7)) ** 2
    g = np.exp(-d2 * 2.2)[..., None]
    return g * np.array([1.0, 0.62, 0.25], np.float32) * 0.22 * alpha

# ------------------------------------------------------------------ composition
SHOTS = TL.build()
BEATS = np.arange(TL.PHASE, TL.END, TL.BEAT)

def shot_window(i):
    s = SHOTS[i]
    tin = s["tin"]
    tin_d = 0.5 if tin == "white" else float(tin)
    start = s["t"] - tin_d / 2
    if i + 1 < len(SHOTS):
        nt = SHOTS[i + 1]["tin"]
        nd = 0.5 if nt == "white" else float(nt)
        end = SHOTS[i + 1]["t"] + nd / 2
    else:
        end = TL.END
    return start, end, tin_d

def beat_pulse(t):
    k = np.searchsorted(BEATS, t) - 1
    if k < 0:
        return 0.0
    dt = t - BEATS[k]
    return math.exp(-dt * 9.0)

def render_shot(i, t):
    s = SHOTS[i]
    start, end, _ = shot_window(i)
    u = (t - start) / max(1e-3, end - start)
    pulse = beat_pulse(t) if "pulse" in s["fx"] else 0.0
    zp = 1.0 + 0.012 * pulse
    if s["mode"] == "frame":
        img = render_frame_mode(s, u, t, zp)
    elif s["mode"] == "full":
        img = render_full_mode(s, u, t, zp)
    elif s["mode"] == "banner":
        img = render_banner(s, u, t)
    else:
        img = render_card(s, u, t)
    if s["src"] in REAL:
        return img  # the real photo stays exactly as it is
    img = grade(img, s["grade"])
    if pulse:
        img = img * (1 + 0.045 * pulse)
    if "glow" in s["fx"]:
        img = img + glow_layer(t, 1.0)
    if "sparkle" in s["fx"]:
        img = img + sparkle_layer(t, 0.9) * 0.55
    return img

def active(t):
    res = []
    for i in range(len(SHOTS)):
        st, en, _ = shot_window(i)
        if st <= t < en:
            res.append(i)
    return res

def title_overlay(t):
    t0, t1 = TL.TITLE_T
    if not (t0 <= t <= t1):
        return None, 0
    if "title" not in _title:
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        f1 = ImageFont.truetype(FONT_TITLE, 150)
        f2 = ImageFont.truetype(FONT_SUB, 56)
        for txt, f, y, col in ((TL.TITLE[0], f1, H * 0.36, (252, 232, 170, 255)), (TL.TITLE[1], f2, H * 0.36 + 200, (255, 245, 225, 255))):
            bb = d.textbbox((0, 0), txt, font=f, direction="rtl", language="he")
            x = (W - (bb[2] - bb[0])) / 2 - bb[0]
            d.text((x + 4, y + 6), txt, font=f, fill=(30, 10, 0, 190), direction="rtl", language="he")
            d.text((x, y), txt, font=f, fill=col, direction="rtl", language="he")
        a = np.asarray(layer, np.float32) / 255
        _title["title"] = (a[..., :3], a[..., 3:], np.asarray(layer.filter(ImageFilter.GaussianBlur(24)), np.float32)[..., 3:] / 255)
    k = min(ease((t - t0) / 1.0), ease((t1 - t) / 0.9))
    return _title["title"], k

def compose(t):
    ids = active(t)
    out = None
    for i in ids:
        s = SHOTS[i]
        start, end, tin_d = shot_window(i)
        img = render_shot(i, t)
        if out is None:
            out = img
            continue
        k = ease((t - start) / tin_d)
        if s["tin"] == "white":
            # previous shot blooms to white, then the photo emerges from the light
            if k < 0.5:
                out = out * (1 - k * 2) + 1.0 * (k * 2)
            else:
                out = 1.0 * (1 - (k - 0.5) * 2) + img * ((k - 0.5) * 2)
        else:
            out = out * (1 - k) + img * k
    if out is None:
        out = np.zeros((H, W, 3), np.float32)
    real_on = any(SHOTS[i]["src"] in REAL for i in ids) and not any(SHOTS[i]["src"] not in REAL for i in ids)
    # leaves (not over the real photo)
    la = 0.0
    for i in ids:
        if "leaves" in SHOTS[i]["fx"]:
            st, en, td = shot_window(i)
            la = max(la, min(ease((t - st) / max(td, 0.3)), ease((en - t) / 0.6)))
    if la > 0 and not real_on:
        base = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
        draw_leaves(base, t, la)
        out = np.asarray(base.convert("RGB"), np.float32) / 255
    tt, k = title_overlay(t)
    if tt is not None and k > 0:
        rgb, a, glow = tt
        out = out * (1 - glow * 0.45 * k)
        out = out * (1 - a * k) + rgb * a * k
    if not real_on:
        out = out * VIGNETTE
        g = GRAIN[int(t * FPS) % len(GRAIN)]
        g = np.repeat(np.repeat(g, 2, 0), 2, 1)[..., None]
        out = out + g * 0.012
    # fade in / out
    out = out * min(1.0, ease(t / 0.8), ease((TL.END - t) / 1.2))
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)

def render_range(f0, f1, path):
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                          "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-pix_fmt", "yuv420p", path],
                         stdin=subprocess.PIPE)
    for f in range(f0, f1):
        p.stdin.write(compose(f / FPS).tobytes())
        if (f - f0) % 250 == 0:
            print(f"  {path}: {f - f0}/{f1 - f0}", flush=True)
    p.stdin.close(); p.wait()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", nargs=2, type=float)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--still", type=float, nargs="*")
    ap.add_argument("--part", type=int, nargs=2)  # internal: index, total
    args = ap.parse_args()
    out_dir = os.path.join(ROOT, "dist"); os.makedirs(out_dir, exist_ok=True)
    work = os.path.join(ROOT, "build"); os.makedirs(work, exist_ok=True)
    total = int(TL.END * FPS)
    if args.still:
        for t in args.still:
            Image.fromarray(compose(t)).save(os.path.join(work, f"still_{t:06.2f}.jpg"), quality=90)
        return
    if args.part:
        i, n = args.part
        f0, f1 = total * i // n, total * (i + 1) // n
        render_range(f0, f1, os.path.join(work, f"part{i}.mp4"))
        return
    if args.preview:
        a, b = args.preview
        tmp = os.path.join(work, "preview_v.mp4")
        render_range(int(a * FPS), int(b * FPS), tmp)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-ss", str(a), "-t", str(b - a), "-i", AUDIO,
                        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
                        os.path.join(work, f"preview_{a:g}-{b:g}.mp4")], check=True)
        return
    n = args.jobs
    procs = [subprocess.Popen([sys.executable, __file__, "--part", str(i), str(n)]) for i in range(n)]
    for p in procs:
        p.wait()
        if p.returncode:
            sys.exit("render part failed")
    lst = os.path.join(work, "parts.txt")
    with open(lst, "w") as fh:
        for i in range(n):
            fh.write(f"file 'part{i}.mp4'\n")
    final = os.path.join(out_dir, "rosh-chodesh-kislev-clip.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-i", AUDIO,
                    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", final], check=True)
    print("done:", final)

if __name__ == "__main__":
    main()
