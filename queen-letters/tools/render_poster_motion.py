#!/usr/bin/env python3
"""פוסטר הטיזר עם אותיות זהב מרחפות סביב השער: תמונה סטטית וגרסת וידאו 4:5.

  python3 tools/render_poster_motion.py            # -> dist/poster-teaser-4x5-letters.png / -whatsapp.jpg / poster-teaser-4x5-motion.mp4
  python3 tools/render_poster_motion.py --still    # only the still

The scene is the real King of Letters frame used by render_poster.py. The floating letters are
drawn from a Hebrew font (Frank Ruhl Libre), so every letter is a correct letter: א ב ג ד ה ו.
They are extruded in gold away from the light of the gate. The copy and the logo are unchanged.
"""
import argparse, math, os, subprocess
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter

import render_clip as RC
import render_teaser as RT
import render_summary as RS
import render_teaser_v2 as V2
import render_poster as P

ROOT = RC.ROOT
W, H = P.W, P.H                 # 2160 x 2700 working canvas
OW, OH = 1080, 1350             # video size (4:5)
FPS, DUR, SR = 24, 10.0, 48000
DOOR = (1180, 1260)             # the light in the doorway, in canvas pixels
ease = RT.ease

# letter, font size, rest position, depth (0 near .. 1 far), appear time
LETTERS = [("א", 560, (420, 1180), 0.0, 0.60), ("ב", 480, (1780, 1110), 0.1, 0.90),
           ("ג", 360, (250, 1640), 0.35, 1.20), ("ד", 380, (1930, 1560), 0.3, 1.50),
           ("ה", 270, (660, 975), 0.8, 1.80), ("ו", 310, (1540, 975), 0.65, 2.10)]


def gold3d(ch, size, away):
    """BGRA sprite of a 3D gold letter; the extrusion points away from the light (away = unit vector)."""
    f = RS.font(RS.FR, size, "Black")
    box = f.getbbox(ch, direction="rtl", language="he"); pad = int(size * .25)
    w, h = box[2] - box[0] + 2 * pad, box[3] - box[1] + 2 * pad
    m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).text((pad - box[0], pad - box[1]), ch, font=f, fill=255, direction="rtl", language="he")
    M = np.array(m, np.float32) / 255
    face = np.array(RC.gold_fill(m), np.float32)[..., [2, 1, 0]]
    mi = np.array(m, np.int16); o = max(2, size // 90)
    hi = cv2.GaussianBlur(np.clip(mi - np.roll(mi, (o, -o), (0, 1)), 0, 255).astype(np.float32), (0, 0), 1.5) / 255
    lo = cv2.GaussianBlur(np.clip(mi - np.roll(mi, (-o, o), (0, 1)), 0, 255).astype(np.float32), (0, 0), 1.5) / 255
    face = np.clip(face + hi[..., None] * 100 - lo[..., None] * 80, 0, 255)
    depth = max(6, size // 26); rgb = np.zeros((h, w, 3), np.float32); al = np.zeros((h, w), np.float32)
    for d in range(depth, 0, -1):
        dx, dy = int(round(d * away[0])), int(round(d * away[1]))
        Ms = np.roll(M, (dy, dx), (0, 1)); shade = .30 + .45 * (1 - d / depth)
        a = Ms * (1 - al); rgb += np.array([38, 82, 128], np.float32) * shade * 1.5 * a[..., None]; al += a
    rgb = rgb * (1 - M[..., None]) + face * M[..., None]; al = np.maximum(al, M)
    # warm halo
    g = cv2.GaussianBlur(M, (0, 0), size / 18)
    out = np.zeros((h, w, 4), np.float32)
    halo_rgb = np.array([150, 215, 255], np.float32)
    out[..., :3] = rgb * al[..., None] + halo_rgb * (1 - al[..., None])
    out[..., 3] = np.clip(np.maximum(al, g * .45), 0, 1) * 255
    return out


def sweep(spr, k):
    """one specular sweep across a sprite, k in 0..1.3"""
    if not (0 < k < 1.3): return spr
    h, w = spr.shape[:2]; xx = np.arange(w, dtype=np.float32)[None, :]; yy = np.arange(h, dtype=np.float32)[:, None]
    band = np.exp(-(((xx + yy * .5) - k * (w + h * .5)) / (w * .12)) ** 2)
    s = spr.copy(); s[..., :3] = np.clip(s[..., :3] + band[..., None] * 140 * (s[..., 3:4] / 255), 0, 255)
    return s


def place(f, spr, cx, cy, scale=1.0, alpha=1.0, angle=0.0, turn=1.0, blur=0.0):
    if alpha <= .003: return
    h, w = spr.shape[:2]
    nw, nh = max(int(w * scale * turn), 2), max(int(h * scale), 2)
    s = cv2.resize(spr, (nw, nh), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    if angle:
        d = int(math.hypot(nw, nh)) + 4; Mr = cv2.getRotationMatrix2D((nw / 2, nh / 2), angle, 1.0)
        Mr[0, 2] += (d - nw) / 2; Mr[1, 2] += (d - nh) / 2; s = cv2.warpAffine(s, Mr, (d, d), flags=cv2.INTER_CUBIC)
    if blur > .3: s = cv2.GaussianBlur(s, (0, 0), blur)
    s = s.copy(); s[..., 3] *= alpha
    P.paste(f, s, cx, cy)


class Poster:
    def __init__(self):
        f = P.background(); img = P.hero(); ih = img.shape[0]
        y0, y1 = P.IMG_TOP, min(P.IMG_TOP + ih, H)
        a = np.ones(y1 - y0, np.float32); top_fade, bot_fade = 380, 430
        a[:top_fade] = np.linspace(0, 1, top_fade) ** 1.6
        a[-bot_fade:] = np.minimum(a[-bot_fade:], np.linspace(1, 0, bot_fade) ** 1.3)
        f[y0:y1] = f[y0:y1] * (1 - a[:, None, None]) + img[:y1 - y0] * a[:, None, None]
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        f += np.exp(-(((xx - W * .55) / (W * .5)) ** 2 + ((yy - P.IMG_TOP * 1.05) / (H * .16)) ** 2))[..., None] * np.array([10, 30, 48], np.float32)
        self.base = f
        self.door_glow = np.exp(-(((xx - DOOR[0]) / 260) ** 2 + ((yy - DOOR[1]) / 420) ** 2))[..., None] * np.array([60, 120, 160], np.float32)
        self.letters = []
        for ch, size, (x, y), depth, t0 in LETTERS:
            v = np.array([x - DOOR[0], y - DOOR[1]], np.float32); v = v / np.linalg.norm(v) * .55 + np.array([0, .55])
            self.letters.append((gold3d(ch, size, v), (x, y), depth, t0))
        self.lines = [(RS.text_sprite(s, RS.FR, size, "Black", RS.BURG, edge="gold"), y)
                      for s, size, y in (("22 אותיות.", 205, 250), ("שנה שלמה.", 205, 455), ("אינסוף חוויות חסידיות!", 148, 645))]
        self.sub = RS.text_sprite("הצצה ראשונה — רק כאן!", RS.FR, 92, "Bold", (34, 98, 160), edge="gold", shadow=False)
        logo = RS.load("logo-chanili.png"); lw = 640
        self.logo = cv2.resize(logo, (lw, int(logo.shape[0] * lw / logo.shape[1])), interpolation=cv2.INTER_AREA)

    def frame(self, t, still=False):
        """t in seconds; still=True gives the settled poster."""
        if still: t = 99.0
        push = 1.0 + .035 * ease(t / DUR) if not still else 1.0
        if push != 1.0:
            Mz = cv2.getRotationMatrix2D(DOOR, 0, push)
            f = cv2.warpAffine(self.base, Mz, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        else:
            f = self.base.copy()
        breathe = .55 + .25 * math.sin(t * 1.3) if not still else .6
        f = f + self.door_glow * breathe * ease(t / 1.2)
        # floating letters, far ones first
        for spr, (x, y), depth, t0 in sorted(self.letters, key=lambda l: -l[2]):
            k = ease((t - t0) / .7)
            if k <= 0: continue
            ph = t0 * 2.1
            bob = 0 if still else 16 * math.sin(t * (1.1 - depth * .3) + ph)
            turn = 1.0 if still else .88 + .12 * math.cos(t * .7 + ph)
            ang = 0 if still else 3 * math.sin(t * .5 + ph)
            # parallax: near letters drift a little more with the push
            px = (x - DOOR[0]) * (push - 1) * (1.6 - depth); py = (y - DOOR[1]) * (push - 1) * (1.6 - depth)
            s = spr if still else sweep(spr, (t - t0 - 2.4) / 1.1)
            place(f, s, x + px, y + py + bob + (1 - k) * 40, scale=.82 + .18 * RT.ease_out_back(k), alpha=k * (1 - depth * .15),
                  angle=ang, turn=turn, blur=depth * 3.0)
        for i, (spr, y) in enumerate(self.lines):
            k = ease((t - 2.6 - i * .4) / .6)
            if k > 0: P.paste(f, V2.blur_in(spr, k) * np.array([1, 1, 1, k], np.float32), W / 2, y + (1 - k) * 26)
        k = ease((t - 4.3) / .6)
        if k > 0:
            s = self.sub
            sx = (t - 4.9) / .9
            if 0 < sx < 1.3 and not still: s = sweep(s, sx)
            P.paste(f, V2.blur_in(s, k) * np.array([1, 1, 1, k], np.float32), W / 2, 805 + (1 - k) * 16)
        k = ease((t - 5.2) / .7)
        if k > 0: P.paste(f, self.logo * np.array([1, 1, 1, k], np.float32), W / 2, H - 190)
        if t < .5: f = f * ease(t / .5) + np.array([234, 244, 251], np.float32) * (1 - ease(t / .5))
        return np.clip(f, 0, 255)


def build_audio(path):
    n = int(DUR * SR); y = np.zeros((n, 2))
    def add(sig, at, gain=1.0, pan=0.0):
        i = int(at * SR); s = sig[:max(0, n - i)] * gain
        y[i:i + len(s), 0] += s * (1 - max(pan, 0)); y[i:i + len(s), 1] += s * (1 + min(pan, 0))
    t = np.arange(n) / SR
    env = np.minimum(t / 1.5, 1) * np.clip((DUR - t) / 1.2, 0, 1)
    drone = (np.sin(2 * np.pi * 73.42 * t) * .5 + np.sin(2 * np.pi * 110 * t + .4 * np.sin(2 * np.pi * .3 * t)) * .35
             + np.sin(2 * np.pi * 146.83 * t * 1.002) * .25) * env * .10
    y += np.stack([drone, drone], 1)
    for i, ((_, _, _, _, t0), f0) in enumerate(zip(LETTERS, (1174.7, 1396.9, 1760.0, 2349.3, 1760.0, 2793.8))):
        add(RT.bell(f0, 2.2, SR), t0 + .05, .045, pan=(-.35, .35)[i % 2])
    add(V2.impact(2.6, 1.0, 4), 2.6, .32)
    t2 = np.arange(int((DUR - 2.6) * SR)) / SR
    pad = sum(np.sin(2 * np.pi * f0 * t2 * (1 + dt)) for f0, dt in ((146.83, 0), (220, .001), (293.66, -.001), (329.63, .0015), (440, 0)))
    pad *= np.minimum(t2 / 1.2, 1) * np.clip((DUR - 2.6 - t2) / 1.5, 0, 1) * .05
    add(pad, 2.6, 1.0)
    add(RT.bell(880, 3.0, SR) + .5 * RT.bell(1318.5, 3.0, SR), 4.3, .12)
    y = np.tanh(y / .8) * .8; y *= .89 / np.abs(y).max()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-", path],
                   input=y.astype(np.float32).tobytes(), check=True)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--still", action="store_true"); ap.add_argument("--stills", default="")
    a = ap.parse_args()
    d = os.path.join(ROOT, "dist"); os.makedirs(d, exist_ok=True)
    p = Poster()
    still = p.frame(0, still=True).astype(np.uint8)
    cv2.imwrite(os.path.join(d, "poster-teaser-4x5-letters.png"), still)
    cv2.imwrite(os.path.join(d, "poster-teaser-4x5-letters-whatsapp.jpg"), cv2.resize(still, (OW, OH), interpolation=cv2.INTER_AREA),
                [cv2.IMWRITE_JPEG_QUALITY, 93])
    print("wrote still")
    if a.stills:
        sd = os.path.join(ROOT, ".cache", "poster-motion-stills"); os.makedirs(sd, exist_ok=True)
        for ts in a.stills.split(","):
            cv2.imwrite(os.path.join(sd, f"{float(ts):05.2f}.jpg"), cv2.resize(p.frame(float(ts)).astype(np.uint8), (OW, OH), interpolation=cv2.INTER_AREA))
        return
    if a.still: return
    wav = os.path.join(ROOT, ".cache", "poster-motion.wav"); build_audio(wav)
    out = os.path.join(d, "poster-teaser-4x5-motion.mp4")
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{OW}x{OH}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-map", "0:v", "-map", "1:a",
           "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-tune", "film", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
           "-af", "volume=1.3dB,alimiter=limit=0.84:level=disabled", "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-shortest", "-movflags", "+faststart", out]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for k in range(int(DUR * FPS)):
        fr = cv2.resize(p.frame(k / FPS).astype(np.uint8), (OW, OH), interpolation=cv2.INTER_AREA)
        pr.stdin.write(fr.tobytes())
    pr.stdin.close(); pr.wait(); print("wrote", out)


if __name__ == "__main__":
    main()
