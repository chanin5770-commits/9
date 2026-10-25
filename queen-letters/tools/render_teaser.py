#!/usr/bin/env python3
"""טיזר 15 שניות אנכי (9:16) לקראת השקת הערכה, מתוך החומרים הקיימים של מלכת האותיות.

  python3 tools/render_teaser.py                 # -> dist/teaser-15s-9x16.mp4
  python3 tools/render_teaser.py --stills 1,4,7,10,13.5

Uses the ten Flow clips (via the 96 fps cache built by render_clip.py), the original
song (15 s excerpt from "כל אות היא אוצר" through the first chorus) and the clip's fonts.
The gold letters are drawn from a font, so every letter is a correct Hebrew letter.
"""
import argparse, math, os, subprocess
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.signal import butter, lfilter, fftconvolve

import render_clip as RC   # clip loading, colour matching, fonts and gold fill from the music video

ROOT = RC.ROOT
W, H, FPS, DUR = 1080, 1920, 24, 15.0
SONG_AT = 16.49            # song downbeat where the teaser starts ("כל אות היא אוצר")
SR = 48000
BEAT = (19.76 - 16.49) / 8  # 152 BPM in this passage

# teaser time = song time - SONG_AT; every cut is a downbeat of the song
T_GATE, T_DOORS, T_QUEEN, T_SPIN, T_KINGDOM, T_CARD = (t - SONG_AT for t in (19.76, 21.41, 23.06, 24.68, 26.33, 27.98))

# vertical shots from the footage: (start, end, clip, src_in, src_out, (z0, z1), [(p, cx, cy), ...])
SHOTS = [
    # the gate from outside, framed on the doorway (the girl stays out of frame), then through the doors
    (T_GATE,    T_DOORS,   "palace-gate",   0.00, 0.95, (1.08, 1.16), [(0, .70, .45), (1, .69, .42)]),
    (T_DOORS,   T_QUEEN,   "palace-gate",   6.90, 8.00, (1.0, 1.12), [(0, .52, .50), (1, .52, .47)]),
    # first glimpse of the queen, from behind, stepping into the light (cropped low: keeps the door glyphs out)
    (T_QUEEN,   T_SPIN,    "palace-gate",   2.00, 3.70, (1.3, 1.36), [(0, .47, .68), (1, .49, .68)]),
    (T_SPIN,    T_KINGDOM, "letter-dance",  4.00, 5.60, (1.0, 1.06), [(0, .46, .50), (1, .48, .50)]),
    (T_KINGDOM, T_CARD,    "golden-bridge", 5.40, 7.00, (1.0, 1.08), [(0, .52, .48), (1, .56, .46)]),
]
LETTERS = "אבגדהו"


def ease(x): x = min(max(x, 0.0), 1.0); return x * x * (3 - 2 * x)
def ease_out_back(x):
    x = min(max(x, 0.0), 1.0); c = 1.5
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


# --- footage, cropped to 9:16 ------------------------------------------------------
def vertical(clips, shot, t):
    start, end, name, a, b, (z0, z1), path = shot
    fr, need = clips.get(name)
    st = a + (t - start) * (b - a) / (end - start)
    idx = min(max(int(round(st * RC.INTERP)), 0), len(fr) - 1)
    p = ease((t - start) / (end - start))
    z = max(z0 + (z1 - z0) * p, need[idx] * 1.005)
    cx = np.interp(p, [k[0] for k in path], [k[1] for k in path])
    cy = np.interp(p, [k[0] for k in path], [k[2] for k in path])
    ch = RC.SRC_H / z; cw = ch * 9 / 16
    x0 = min(max(cx * RC.SRC_W - cw / 2, 0), RC.SRC_W - cw); y0 = min(max(cy * RC.SRC_H - ch / 2, 0), RC.SRC_H - ch)
    s = H / ch
    img = cv2.warpAffine(fr[idx], np.float32([[s, 0, -x0 * s], [0, s, -y0 * s]]), (W, H),
                         flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    blur = cv2.GaussianBlur(img, (0, 0), 3.0)
    return cv2.addWeighted(img, 1.6, blur, -0.6, 0).astype(np.float32)


# --- opening: cream world, gold letters ----------------------------------------------
CREAM = np.array([234, 244, 251], np.float32)   # BGR of #FBF4EA

def letter_sprite(ch, size):
    S = 2
    f = RC.font("FrankRuhlLibre[wght].ttf", size * S, "Black")
    pad = size * S // 2
    box = f.getbbox(ch, direction="rtl", language="he")
    w, h = box[2] - box[0] + 2 * pad, box[3] - box[1] + 2 * pad
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).text((pad - box[0], pad - box[1]), ch, font=f, fill=255, direction="rtl", language="he")
    body = RC.gold_fill(m)
    # bevel: light from the top-left edge, shade on the bottom-right
    hi = Image.fromarray(np.clip(np.array(m, np.int16) - np.roll(np.array(m, np.int16), (6 * S, 6 * S), (0, 1)), 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2 * S))
    lo = Image.fromarray(np.clip(np.array(m, np.int16) - np.roll(np.array(m, np.int16), (-6 * S, -6 * S), (0, 1)), 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2 * S))
    arr = np.array(body).astype(np.float32)
    arr[..., :3] += np.array(hi, np.float32)[..., None] / 255 * 90
    arr[..., :3] -= np.array(lo, np.float32)[..., None] / 255 * 95
    rim = np.array(m.filter(ImageFilter.MaxFilter(5)), np.float32) - np.array(m, np.float32)
    arr[..., :3] = arr[..., :3] * (1 - rim[..., None] / 255) + np.array([120, 78, 22], np.float32) * rim[..., None] / 255
    arr[..., 3] = np.maximum(arr[..., 3], rim)
    glow = np.array(m.filter(ImageFilter.GaussianBlur(14 * S)), np.float32)
    out = np.zeros_like(arr)
    shadow = np.array(m.filter(ImageFilter.GaussianBlur(10 * S)), np.float32)
    shadow = np.roll(shadow, (10 * S, 4 * S), (0, 1))
    out[..., :3] = np.where((shadow > glow)[..., None], np.array([110, 70, 40], np.float32), np.array([255, 214, 140], np.float32))
    out[..., 3] = np.maximum(glow * 0.45, shadow * 0.35)
    a = arr[..., 3:4] / 255
    out[..., :3] = arr[..., :3] * a + out[..., :3] * (1 - a)
    out[..., 3] = np.maximum(arr[..., 3], out[..., 3])
    out = np.clip(out, 0, 255).astype(np.uint8)
    im = Image.fromarray(out, "RGBA").resize((w // S, h // S), Image.LANCZOS)
    a = np.array(im).astype(np.float32)
    return a[..., [2, 1, 0, 3]]                                     # BGRA


SPRITES = {}
LAYOUT = [  # letter, size, x, y, appear time (on the beat)
    ("א", 700, .50, .47, 0.10),
    ("ב", 400, .78, .27, 2 * BEAT), ("ג", 380, .22, .30, 3 * BEAT),
    ("ד", 370, .79, .67, 4 * BEAT), ("ה", 390, .21, .65, 5 * BEAT),
    ("ו", 360, .52, .82, 6 * BEAT),
]

def paste(f, spr, cx, cy, scale, alpha, squash=1.0):
    if alpha <= 0.003 or scale <= 0.01: return
    h, w = spr.shape[:2]
    nw, nh = max(int(w * scale * squash), 2), max(int(h * scale), 2)
    s = cv2.resize(spr, (nw, nh), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    x0, y0 = int(cx - nw / 2), int(cy - nh / 2)
    xa, ya, xb, yb = max(x0, 0), max(y0, 0), min(x0 + nw, W), min(y0 + nh, H)
    if xa >= xb or ya >= yb: return
    s = s[ya - y0:yb - y0, xa - x0:xb - x0]
    al = s[..., 3:4] / 255 * alpha
    f[ya:yb, xa:xb] = f[ya:yb, xa:xb] * (1 - al) + s[..., :3] * al


BG = None
def opening(clips, t):
    global BG
    if BG is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W * .7)) ** 2 + ((yy - H * .30) / (H * .55)) ** 2)
        BG = (np.clip(1 - d, 0, 1) ** 2.5)[..., None]
    # warm bokeh from the letter hall, blurred into a cream haze
    fr, _ = clips.get("magic-books")      # warm library bokeh, no character in this part of the frame
    src = fr[min(int((6.0 + t * 0.4) * RC.INTERP), len(fr) - 1)]
    crop = src[:, 380:582]
    haze = cv2.GaussianBlur(cv2.resize(crop, (W // 4, H // 4)), (0, 0), 9)
    haze = cv2.resize(haze, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    f = CREAM * 0.7 + haze * 0.3 * np.array([0.92, 0.97, 1.04], np.float32)
    f += BG * np.array([30, 70, 105], np.float32) * (0.4 + 0.6 * ease(t / T_GATE))    # glow, upper centre
    f = np.clip(f, 0, 255)
    for i, (ch, size, x, y, t0) in enumerate(LAYOUT):
        if ch not in SPRITES: SPRITES[ch] = letter_sprite(ch, size)
        k = (t - t0) / 0.55
        if k <= 0: continue
        sc = 0.55 + 0.45 * ease_out_back(k)
        al = ease(k * 1.4)
        bob = math.sin(t * 1.7 + i) * 10
        squash = 0.86 + 0.14 * math.cos(t * 1.1 + i * 1.3)       # slow turn, reads as 3D
        cx, cy = x * W, y * H + bob
        if ch == "א":   # flies up into the light at the end of the shot
            fly = ease((t - (T_GATE - 0.85)) / 0.85)
            cy = cy + (0.25 * H - cy) * fly; sc *= 1 - 0.55 * fly; al *= 1 - 0.6 * fly
        else:
            out = ease((t - (T_GATE - 0.8)) / 0.7)
            cx += (cx - W / 2) * 0.25 * out; al *= 1 - out
        paste(f, SPRITES[ch], cx, cy, sc, al, squash)
    return f


# --- end card --------------------------------------------------------------------------
CARD = None
def build_card():
    S = 2; w, h = W * S, H * S
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.clip(np.sqrt(((xx - W / 2) / (W * .75)) ** 2 + ((yy - H * .45) / (H * .62)) ** 2), 0, 1)
    c0, c1 = np.array([253, 246, 238]), np.array([244, 214, 219])
    bg = (c0 * (1 - d[..., None] ** 1.4) + c1 * d[..., None] ** 1.4).astype(np.uint8)
    def layer(draw_fn):
        m = Image.new("L", (w, h), 0); draw_fn(ImageDraw.Draw(m)); return m
    def text(dr, s, font, y, track=0):
        if not track:
            dr.text((w / 2, y * S), s, font=font, fill=255, anchor="mm", direction="rtl", language="he"); return
        ws = [font.getlength(c) for c in s]; x = (w - sum(ws) - track * S * (len(s) - 1)) / 2
        for c, cw in zip(s, ws): dr.text((x, y * S), c, font=font, fill=255, anchor="lm"); x += cw + track * S

    def frame(dr):
        for inset, wd in ((56, 4), (72, 2)):
            i = inset * S; dr.rounded_rectangle([i, i + 200 * S, w - i, h - i - 300 * S], radius=40 * S, outline=255, width=wd * S)
        for cx, cy in ((1, 201), (W - 1, 201), (1, H - 301), (W - 1, H - 301)):
            ox = (cx + (100 if cx < W / 2 else -100)) * S; oy = (cy + (100 if cy < H / 2 else -100)) * S
            for r in (22, 34): dr.arc([ox - r * S, oy - r * S, ox + r * S, oy + r * S], 0, 360, fill=255, width=2 * S)
            dr.ellipse([ox - 6 * S, oy - 6 * S, ox + 6 * S, oy + 6 * S], fill=255)
    def divider(dr, y):
        y *= S; cx = W // 2 * S
        for side in (-1, 1):
            x0 = cx + side * 40 * S; L = 250 * S
            for k in range(0, L, S):
                dr.line([x0 + side * k, y - S, x0 + side * k, y + S], fill=int(255 * (1 - k / L) ** .7))
            for off in (54, 84):
                px = cx + side * off * S; dr.ellipse([px - 4 * S, y - 4 * S, px + 4 * S, y + 4 * S], fill=255)
        dr.polygon([(cx, y - 16 * S), (cx + 16 * S, y), (cx, y + 16 * S), (cx - 16 * S, y)], fill=255)
        dr.polygon([(cx, y - 8 * S), (cx + 8 * S, y), (cx, y + 8 * S), (cx - 8 * S, y)], fill=0)

    fb = RC.font("FrankRuhlLibre[wght].ttf", 100 * S, "Black")
    fm = RC.font("FrankRuhlLibre[wght].ttf", 88 * S, "Bold")
    fk = RC.font("FrankRuhlLibre[wght].ttf", 150 * S, "Black")
    fs = RC.font("CormorantGaramond[wght].ttf", 74 * S, "SemiBold")

    def burgundy(m, shadow=True):
        yy2 = np.linspace(0, 1, h)[:, None]
        g = (np.array([128, 22, 52]) * (1 - yy2) + np.array([84, 8, 30]) * yy2).astype(np.uint8)
        b = Image.fromarray(np.repeat(g[:, None, :], w, 1), "RGB").convert("RGBA"); b.putalpha(m)
        out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        if shadow:
            sh = Image.new("RGBA", (w, h), (90, 20, 40, 0))
            sh.putalpha(m.filter(ImageFilter.GaussianBlur(10 * S)).point(lambda v: int(v * .3)))
            out = Image.alpha_composite(out, sh.transform(sh.size, Image.AFFINE, (1, 0, 0, 0, 1, -6 * S)))
        out = Image.alpha_composite(out, RC.gold_fill(m.filter(ImageFilter.MaxFilter(7))))
        return Image.alpha_composite(out, b)

    l1 = burgundy(layer(lambda d: text(d, "22 אותיות. שנה שלמה.", fb, 700)))
    l2 = burgundy(layer(lambda d: text(d, "אינסוף חוויות חסידיות!", fm, 850)))
    orn = RC.gold_fill(layer(lambda d: (frame(d), divider(d, 985))))
    soon_m = layer(lambda d: text(d, "בקרוב...", fk, 1135))
    sh = Image.new("RGBA", (w, h), (110, 60, 20, 0)); sh.putalpha(soon_m.filter(ImageFilter.GaussianBlur(9 * S)).point(lambda v: int(v * .35)))
    soon = Image.alpha_composite(sh.transform(sh.size, Image.AFFINE, (1, 0, 0, 0, 1, -5 * S)), RC.gold_fill(soon_m))
    mark = Image.new("RGBA", (w, h), (112, 20, 46, 0)); mark.putalpha(layer(lambda d: text(d, "ChaniLi Studio", fs, 1450, track=8)))
    mark_line = RC.gold_fill(layer(lambda d: [d.line([(W / 2 - 70) * S, 1380 * S, (W / 2 + 70) * S, 1380 * S], fill=255, width=2 * S),
                                               d.ellipse([(W / 2 - 5) * S, 1375 * S, (W / 2 + 5) * S, 1385 * S], fill=255)]))
    def down(im):
        a = np.array(im.resize((W, H), Image.LANCZOS)).astype(np.float32)
        return a[..., [2, 1, 0, 3]] if a.shape[2] == 4 else a[..., ::-1]
    return dict(bg=down(Image.fromarray(bg)), orn=down(orn), l1=down(l1), l2=down(l2), soon=down(soon),
                mark=down(mark), mark_line=down(mark_line))


def card(t):
    """t = seconds since the card starts."""
    global CARD
    if CARD is None: CARD = build_card()
    f = CARD["bg"].copy()
    def over(L, a, dy=0.0):
        nonlocal f
        if a <= 0: return
        if dy: L = cv2.warpAffine(L, np.float32([[1, 0, 0], [0, 1, dy]]), (W, H), flags=cv2.INTER_LINEAR)
        al = L[..., 3:4] / 255 * a; f = f * (1 - al) + L[..., :3] * al
    over(CARD["orn"], ease((t - 0.15) / 0.9))
    for key, t0 in (("l1", 0.35), ("l2", 0.85)):
        a = ease((t - t0) / 0.7); over(CARD[key], a, (1 - a) * 14)
    s = CARD["soon"].copy(); a = ease((t - 1.75) / 0.6)
    sx = (t - 2.2) / 0.9                    # one light sweep across "בקרוב..."
    if 0 < sx < 1.4:
        xx = np.arange(W, dtype=np.float32)[None, :]; yy = np.arange(H, dtype=np.float32)[:, None]
        band = np.exp(-(((W - xx) + (yy - 1135) * .4 - sx * W) / 90) ** 2)
        s[..., :3] = np.clip(s[..., :3] + band[..., None] * 140, 0, 255)
    over(s, a, (1 - a) * 10)
    over(CARD["mark_line"], ease((t - 2.2) / 0.6)); over(CARD["mark"], ease((t - 2.3) / 0.7))
    return f


# --- shared finishing: bloom, sparkles, golden light ---------------------------------------
class Sparkles(RC.Sparkles):
    def __init__(self):
        super().__init__(n=140, seed=11)
        r = np.random.default_rng(11); self.x = r.uniform(0, W, 140); self.y = r.uniform(0, H, 140)
    def layer(self, t, amount):
        L = np.zeros((H, W), np.float32)
        for i in range(len(self.x)):
            if self.rank[i] > amount: continue
            x = (self.x[i] + self.vx[i] * t + 18 * math.sin(t * .4 + self.ph[i])) % W
            y = (self.y[i] - self.vy[i] * t) % H
            b = (0.5 + 0.5 * math.sin(t * self.tw[i] + self.ph[i])) ** 3
            sp = self.sprite(self.size[i]); k = sp.shape[0]; hh = k // 2
            xi, yi = int(x) - hh, int(y) - hh
            if 0 <= xi and 0 <= yi and xi + k <= W and yi + k <= H: L[yi:yi + k, xi:xi + k] += sp * b
        return L

GOLD = np.array([120, 205, 255], np.float32)
VIG = None
def finish(f, t, sp, glow):
    global VIG
    small = cv2.resize(f, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    hl = cv2.GaussianBlur(np.clip(small - 190, 0, None) * 1.6, (0, 0), 9)
    f = f + cv2.resize(hl, (W, H)) * 0.3
    amount = 0.75 if t < T_CARD else 0.45
    f = f + sp.layer(t, amount)[..., None] * GOLD * 0.75
    if glow > 0: f = f * (1 - 0.4 * glow) + (GOLD * 1.05 + 40) * 0.4 * glow + f * 0.3 * glow
    if VIG is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
        VIG = (1 - 0.16 * np.clip(d - 0.6, 0, None) ** 1.6)[..., None]
    return np.clip(f * VIG, 0, 255).astype(np.uint8)


def frame_at(clips, sp, t):
    glow = 0.0
    if t < T_GATE - 0.25:
        f = opening(clips, t)
    elif t < T_GATE + 0.25:   # light dissolve: the letter flies into the light of the gate
        a = ease((t - (T_GATE - 0.25)) / 0.5)
        f = opening(clips, t) * (1 - a) + vertical(clips, SHOTS[0], max(t, T_GATE)) * a
        glow = math.sin(math.pi * a) * .8
    elif t < T_CARD - 0.3:
        s = next(s for s in SHOTS if s[0] <= t < s[1])
        f = vertical(clips, s, t)
        if abs(t - T_QUEEN) < 0.3 and t >= T_QUEEN:   # chorus downbeat: golden flash
            glow = 0.45 * math.exp(-(t - T_QUEEN) / 0.2)
        if s is SHOTS[0] and t > T_QUEEN - 0.35:      # the doors' light swells into the next shot
            glow = max(glow, ease((t - (T_QUEEN - 0.35)) / 0.35) * .45)
    elif t < T_CARD + 0.35:   # light wipe into the cream end card
        a = ease((t - (T_CARD - 0.3)) / 0.65)
        f = vertical(clips, SHOTS[-1], min(t, T_CARD - 1e-3)) * (1 - a) + card(max(t - T_CARD, 0)) * a
        glow = math.sin(math.pi * a) * .7
    else:
        f = card(t - T_CARD)
    if t < 0.35: f = f * ease(t / 0.35) + CREAM * (1 - ease(t / 0.35))
    return finish(f, t, sp, glow)


# --- sound: the song excerpt, a filtered fade into the card, letter chimes and one bell ------
def bell(f0, dur, sr, partials=((1, 1), (2.0, .5), (2.76, .35), (5.4, .18), (8.93, .08))):
    t = np.arange(int(dur * sr)) / sr; s = np.zeros_like(t)
    for r, a in partials: s += a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t * (1.2 + r * .9))
    return s * np.minimum(t / 0.004, 1)

def build_audio(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{SONG_AT}", "-t", f"{DUR}", "-i", RC.SONG,
                          "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
    n = int(DUR * SR); x = np.pad(x, ((0, max(0, n - len(x))), (0, 0)))[:n]
    t = np.arange(n) / SR
    b, a = butter(2, 700 / (SR / 2)); lp = lfilter(b, a, x, axis=0)
    mix = np.clip((t - (T_CARD - 0.2)) / 0.7, 0, 1)[:, None]
    gain = np.where(t < T_CARD - 0.2, 1.0, np.exp(-np.maximum(t - (T_CARD - 0.2), 0) / 0.75))[:, None]
    y = (x * (1 - mix) + lp * mix) * gain
    # airy tail: the filtered music through a soft synthetic reverb
    ir_t = np.arange(int(2.8 * SR)) / SR
    rng = np.random.default_rng(3); ir = rng.standard_normal((len(ir_t), 2)) * np.exp(-ir_t / 0.7)[:, None]
    seg = (lp * mix * gain)[:]
    wet = np.stack([fftconvolve(seg[:, c], ir[:, c])[:n] for c in range(2)], 1)
    y += wet / np.abs(wet).max() * 0.12
    # chimes on the letters (D minor: D6 F6 A6 D7 F7 A7) and the bell on "בקרוב..." (an open A)
    notes = [1174.7, 1396.9, 1760.0, 2349.3, 2793.8, 3520.0]
    for (_, _, _, _, t0), f0 in zip(LAYOUT, notes):
        s = bell(f0, 1.6, SR) * 0.05; i = int((t0 + 0.02) * SR); y[i:i + len(s)] += np.stack([s, s], 1)[:n - i]
    tb = T_CARD + 1.75
    s = (bell(880.0, 3.5, SR) + 0.6 * bell(440.0, 3.5, SR)) * 0.16
    i = int(tb * SR); y[i:i + len(s)] += np.stack([s * .9, s], 1)[:n - i]
    # a soft rising shimmer into the card
    sh_t = np.arange(int(0.9 * SR)) / SR
    noise = rng.standard_normal(len(sh_t)); bb, aa = butter(2, [3000 / (SR / 2), 9000 / (SR / 2)], btype="band")
    sh = lfilter(bb, aa, noise) * (sh_t / sh_t[-1]) ** 2 * 0.05
    i = int((T_CARD - 0.85) * SR); y[i:i + len(sh)] += np.stack([sh, sh], 1)
    y[:int(0.03 * SR)] *= np.linspace(0, 1, int(0.03 * SR))[:, None]
    y *= np.minimum(1.0, 0.89 / np.abs(y).max())
    y[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))[:, None]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-", path],
                   input=y.astype(np.float32).tobytes(), check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", default="")
    ap.add_argument("--out", default=os.path.join(ROOT, "dist", "teaser-15s-9x16.mp4"))
    a = ap.parse_args()
    clips, sp = RC.Clips(), Sparkles()
    if a.stills:
        d = os.path.join(ROOT, ".cache", "teaser-stills"); os.makedirs(d, exist_ok=True)
        for ts in a.stills.split(","):
            p = os.path.join(d, f"{float(ts):05.2f}.jpg"); cv2.imwrite(p, frame_at(clips, sp, float(ts))); print(p)
        return
    wav = os.path.join(ROOT, ".cache", "teaser.wav"); build_audio(wav)
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-map", "0:v", "-map", "1:a",
           "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-maxrate", "7M", "-bufsize", "14M",
           "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
           "-af", "volume=3dB,alimiter=limit=0.89:level=disabled",   # phone-friendly loudness (~-14 LUFS)
           "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-shortest", "-movflags", "+faststart", a.out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for n in range(int(DUR * FPS)):
        p.stdin.write(frame_at(clips, sp, n / FPS).tobytes())
    p.stdin.close(); p.wait(); print("wrote", a.out)


if __name__ == "__main__":
    main()
