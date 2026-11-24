"""
Gan Malchut Hanukkah film — THE EDIT.

Every version is described here as a sequence of scenes. A scene rides on one continuous stretch
of ORIGINAL audio from one clip (the "bed"); shots from that same clip are lip/beat-synced to it
automatically, cutaways from other clips start on one of their own beats. Shot lengths are given
in beats ("n") of the bed's music, or in seconds ("s").

Usage:
  python3 tools/edit.py                      # render everything
  python3 tools/edit.py part1 part2          # selected versions
  python3 tools/edit.py part2 --preview      # quick half-res check
  python3 tools/edit.py part1 --stills 1,5,9 # single graded frames to work/stills
Versions: part1 (portrait, ends with the rotate-your-phone moment), part2 (landscape),
          story (one continuous vertical film), short (vertical, <=30s), cover (poster image)
"""
import os, sys, math
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine as E
from engine import ease, ease_out, ease_in

OUT = os.path.join(E.ROOT, 'output')
PORTRAIT = (1080, 1920)
LANDSCAPE = (1920, 1080)

# ----------------------------------------------------------------------------------------------
class Builder:
    def __init__(self, canvas):
        self.canvas = canvas
        self.t = 0.0
        self.clips, self.beds, self.ov, self.sfx, self.auto = [], [], [], [], []
        self.bed = None

    # ---- audio beds ----
    def bed_start(self, src, hint, gain=1.0, snap=True, fade=0.25, **kw):
        self.bed_end(fade)
        beats = E.ANALYSIS[src]['beats']
        a = hint
        if snap:
            nxt = [b for b in beats if b >= hint - 0.03]
            a = nxt[0] if nxt else hint
        self.bed = dict(src=src, s0=a, T0=self.t, gain=gain, fade_in=fade, pos=a, **kw)

    def bed_end(self, fade=0.25):
        if self.bed:
            b = self.bed; b['T1'] = self.t; b['fade_out'] = fade
            self.beds.append({k: v for k, v in b.items() if k != 'pos'})
            self.bed = None

    def beat_dur(self, n):
        src, pos = self.bed['src'], self.bed['pos']
        beats = E.ANALYSIS[src]['beats']
        period = 60 / E.ANALYSIS[src]['tempo']
        k = int(np.argmin([abs(b - pos) for b in beats])) if beats else 0
        if beats and abs(beats[k] - pos) > 0.15:
            later = [i for i, b in enumerate(beats) if b > pos]
            k = later[0] - 1 if later else len(beats) - 1
        tgt = k + n
        if tgt < len(beats):
            return beats[tgt] - pos
        return beats[-1] + (tgt - len(beats) + 1) * period - pos

    # ---- shots ----
    def shot(self, n=None, s=None, src=None, at=None, speed=1.0, trans=('cut', 0), layout=None, **kw):
        dur = self.beat_dur(n) if n is not None else s
        layout = layout or ('window' if kw.pop('window', False) else 'fill')
        if src is None:  # synced to the bed
            src, at = self.bed['src'], self.bed['pos']
        elif at is not None and speed == 1.0 and not kw.get('nosnap'):
            beats = E.ANALYSIS[src]['beats']
            if beats:
                at = min(beats, key=lambda b: abs(b - at))
        kw.pop('nosnap', None)
        cw, ch = self.canvas
        if layout == 'window':
            pic = kw.pop('pic', LANDSCAPE)
        else:
            pic = kw.pop('pic', (cw, ch))
        info = E.probe(src)
        if layout == 'fill' and cw < ch and info['w'] > info['h'] and 'crop_x' not in kw:
            kw['crop_x'] = 0.5
        c = E.Clip(src=src, t0=self.t, t1=self.t + dur, src_t0=at, speed=speed, trans_in=trans,
                   layout=layout, pic=pic, **kw)
        self.clips.append(c)
        t0 = self.t
        self.t += dur
        if self.bed: self.bed['pos'] += dur
        # automatic sound design for transitions
        k, d = trans
        if k == 'whip': self.fx('whoosh', t0, dur=0.55, gain=0.5)
        if k == 'zoom': self.fx('whoosh', t0, dur=0.6, f0=150, f1=2500, gain=0.45)
        if k == 'lightwipe': self.fx('sparkle', t0 - 0.2, dur=1.0, gain=0.14)
        if k == 'gold': self.fx('shimmer', t0 - 0.25, dur=2.0, gain=0.14)
        return t0, self.t

    # ---- overlays / sfx / automation ----
    def add(self, fn, t0, t1, **p):
        self.ov.append(dict(fn=fn, t0=t0, t1=t1, **p))

    def fx(self, kind, t, **kw):
        self.sfx.append((kind, t, kw))

    def duck(self, t0, t1, db=0, lp=None, reverb=None, ramp=0.2):
        self.auto.append(dict(t0=t0, t1=t1, db=db, lp=lp, reverb=reverb, ramp=ramp))

    def version(self, name, out, extra_end=0.0):
        self.bed_end(0.6)
        return E.Version(name, self.canvas, self.clips, self.ov, self.sfx, self.beds, self.t + extra_end, out, self.auto)

# ----------------------------------------------------------------------------------------------
# overlay primitives (fn(frame, t, ov) -> frame)
# ----------------------------------------------------------------------------------------------
def _fade(t, ov, fi=0.4, fo=0.4):
    a = 1.0
    if t < ov['t0'] + fi: a = ease((t - ov['t0']) / fi)
    if t > ov['t1'] - fo: a = min(a, ease((ov['t1'] - t) / fo))
    return a

_PS = {}
def particles(frame, t, ov):
    key = (frame.shape, ov.get('seed', 1), ov.get('n', 110))
    if key not in _PS: _PS[key] = E.Particles(frame.shape[1], frame.shape[0], n=ov.get('n', 110), seed=ov.get('seed', 1))
    return _PS[key].render(frame, t, ov.get('k', 0.8) * _fade(t, ov, ov.get('fi', 0.6), ov.get('fo', 0.6)))

def burst(frame, t, ov):
    key = (frame.shape, 'burst', ov.get('seed', 3))
    if key not in _PS: _PS[key] = E.Particles(frame.shape[1], frame.shape[0], n=70, seed=ov.get('seed', 3))
    H, W = frame.shape[:2]
    return _PS[key].render(frame, t, 1.3, burst=(ov['x'] * W, ov['y'] * H, t - ov['t0']))

def black_in(frame, t, ov):
    a = 1 - ease((t - ov['t0']) / (ov['t1'] - ov['t0']))
    return E.cv2.convertScaleAbs(frame, alpha=1 - a)

def black_out(frame, t, ov):
    a = ease((t - ov['t0']) / (ov['t1'] - ov['t0']))
    return E.cv2.convertScaleAbs(frame, alpha=1 - a)

def flash_ov(frame, t, ov):
    d = ov['t1'] - ov['t0']; p = (t - ov['t0']) / d
    a = ov.get('peak', 1.0) * (ease(p / 0.25) if p < 0.25 else (1 - ease((p - 0.25) / 0.75)))
    return E.flash(frame, a, ov.get('color', (170, 225, 255)))

def flare_ov(frame, t, ov):
    p = (t - ov['t0']) / (ov['t1'] - ov['t0'])
    return E.flare(frame, p, ov.get('y', 0.3), ov.get('gain', 0.9))

def rays_ov(frame, t, ov):
    return E.rays(frame, t, ov.get('k', 0.45) * _fade(t, ov, 0.8, 0.8))

def leak_ov(frame, t, ov):
    return E.light_leak(frame, t, ov.get('k', 0.35) * _fade(t, ov, 0.8, 0.8), ov.get('seed', 0))

def text_ov(frame, t, ov):
    """animated title: blur-to-sharp rise-in, shimmer sweep, fade out"""
    H, W = frame.shape[:2]
    tin = ov.get('tin', 0.7)
    lt = t - ov['t0']
    pin = ease_out(lt / tin)
    a = pin * _fade(t, ov, 0.01, ov.get('fo', 0.5))
    scale = ov.get('scale', 1.0) * (1.06 - 0.06 * pin) * (1 + ov.get('grow', 0.0) * lt)
    cy = ov['y'] * H + (1 - pin) * ov.get('rise', 26)
    sh = None
    if 'shimmer' in ov:
        sp = (t - (ov['t0'] + ov['shimmer'])) / 1.1
        if 0 <= sp <= 1: sh = sp
    return E.draw_text(frame, ov['txt'], ov.get('x', 0.5) * W, cy, alpha=a, scale=scale, shimmer=sh,
                       blur=(1 - pin) * 6, font=ov.get('font', 'frank-ruhl-libre-900'), size=ov.get('size', 150),
                       style=ov.get('style', 'gold'))

def rule_ov(frame, t, ov):
    H, W = frame.shape[:2]
    p = (t - ov['t0']) / ov.get('grow', 0.8)
    return E.draw_rule(frame, W / 2, ov['y'] * H, ov.get('w', 0.3) * W, p, _fade(t, ov, 0.05, 0.5))

def dim_ov(frame, t, ov):
    return E.cv2.convertScaleAbs(frame, alpha=1 - ov.get('k', 0.4) * _fade(t, ov, ov.get('fi', 0.3), ov.get('fo', 0.3)))

def phone_ov(frame, t, ov):
    """3D phone turning 90 degrees with motion blur, light trails and an arrow."""
    H, W = frame.shape[:2]
    lt = t - ov['t0']
    r0, r1 = ov.get('r0', 0.55), ov.get('r1', 1.45)  # rotation window (relative)
    appear = ease_out(lt / 0.45)
    cx, cy = W * 0.5, H * ov.get('y', 0.6)
    sc = ov.get('scale', 1.0) * (0.75 + 0.25 * appear)
    def ang_at(x):
        q = (x - r0) / (r1 - r0)
        return -90 * (ease(q) if 0 <= q <= 1 else (0 if q < 0 else 1))
    angle = ang_at(lt)
    moving = r0 < lt < r1 + 0.02
    if moving:  # light trails from the corners over the last few positions
        lay = np.zeros_like(frame)
        sw, sh = 300 * sc / 2, 560 * sc / 2
        for k in range(14):
            x = lt - k * 0.018
            a = math.radians(ang_at(x))
            for (px, py) in [(-sw, -sh), (sw, -sh), (sw, sh), (-sw, sh)]:
                X = cx + px * math.cos(a) - py * math.sin(a)
                Y = cy + px * math.sin(a) + py * math.cos(a)
                rr = max(1, int(7 - k * 0.4))
                E.cv2.circle(lay, (int(X), int(Y)), rr, (int(120 * (1 - k / 14)), int(210 * (1 - k / 14)), int(255 * (1 - k / 14))), -1, E.cv2.LINE_AA)
        lay = E.cv2.add(lay, E.cv2.GaussianBlur(lay, (0, 0), 6))
        frame = E.cv2.add(frame, lay)
    # arrow arc around the phone
    if lt > 0.25:
        arc_a = ease_out((lt - 0.25) / 0.5)
        frame = E.draw_arc_arrow(frame, cx, cy, 380 * sc, -150, -150 + 110 * arc_a, alpha=0.9 * appear * (1 - 0.6 * ease((lt - r1) / 0.3) if lt > r1 else 1))
    # motion-blurred phone: average of sub-frames while turning
    if moving:
        acc = np.zeros(frame.shape, np.float32)
        subs = 6
        for k in range(subs):
            img, _ = E.draw_phone(frame, cx, cy, ang_at(lt - k * 0.012), math.sin(math.pi * min(max((lt - r0) / (r1 - r0), 0), 1)) * 28, sc, appear)
            acc += img
        frame = (acc / subs).astype(np.uint8)
    else:
        frame, _ = E.draw_phone(frame, cx, cy, angle, 0, sc, appear)
    # impact glow when the turn lands
    if r1 <= lt < r1 + 0.5:
        frame = E.flash(frame, (1 - (lt - r1) / 0.5) * 0.45)
    return frame

# ----------------------------------------------------------------------------------------------
# reusable title cards
# ----------------------------------------------------------------------------------------------
def opening_title(b, t0, t1, ys=(0.40, 0.505, 0.585), big=200, small=96, sub=None):
    b.add(text_ov, t0 + 0.15, t1, txt='מסיבת חנוכה', y=ys[0], size=small, font='frank-ruhl-libre-700', tin=0.9, fo=0.5)
    b.add(text_ov, t0 + 0.55, t1, txt='גן מלכות', y=ys[1], size=big, tin=1.0, shimmer=0.9, fo=0.5, grow=0.012)
    b.add(rule_ov, t0 + 0.9, t1, y=ys[2], w=0.26, grow=0.9)
    b.add(flare_ov, t0 + 0.4, t0 + 2.6, y=ys[1] - 0.02, gain=0.8)

def header(b, t0, t1):
    """subtle title above the landscape window in the vertical versions"""
    b.add(text_ov, t0, t1, txt='מסיבת חנוכה', y=0.205, size=70, font='frank-ruhl-libre-700', tin=0.8, fo=0.6)
    b.add(text_ov, t0 + 0.3, t1, txt='גן מלכות', y=0.245, size=120, tin=0.9, shimmer=1.0, fo=0.6)
    b.add(text_ov, t0 + 0.6, t1, txt='מאירות את העולם', y=0.72, size=64, font='frank-ruhl-libre-700', style='cream', tin=0.9, fo=0.6)


def end_title(b, t0, t1, ys=(0.43, 0.53), big=210, small=110):
    b.add(text_ov, t0 + 0.2, t1 + 1, txt='גן מלכות', y=ys[0], size=big, tin=1.0, shimmer=0.8, fo=0.01, grow=0.01)
    b.add(rule_ov, t0 + 0.7, t1 + 1, y=(ys[0] + ys[1]) / 2 + 0.005, w=0.24)
    b.add(text_ov, t0 + 1.0, t1 + 1, txt='מאירות את העולם!', y=ys[1] + 0.03, size=small, font='frank-ruhl-libre-700', tin=0.9, shimmer=1.6, fo=0.01)
    b.add(flare_ov, t0 + 0.5, t0 + 3.0, y=ys[0], gain=0.9)

# ----------------------------------------------------------------------------------------------
# PART 1 — portrait
# ----------------------------------------------------------------------------------------------
def build_part1(b, ending='phone'):
    W_ = 'w'
    # --- HOOK: out of darkness, the girls raise their lights (slow motion) ---
    b.bed_start('20261123_165911', 0.2, gain=0.9, fade=0.6)
    t0, t1 = b.shot(n=5, src='20261123_165911', at=0.42, speed=0.42, interp='flow', zoom=(1.05, 1.28), center=(0.5, 0.36),
                    nosnap=True)
    b.add(black_in, 0, 0.55)
    b.add(flash_ov, 0.32, 0.95, peak=0.9)
    b.add(particles, 0, t1 + 0.3, k=1.0, seed=2)
    b.add(rays_ov, 0, t1, k=0.4)
    b.fx('shimmer', 0.05, dur=2.6, gain=0.2)
    b.fx('impact', 0.32, gain=0.35)
    b.duck(0, t1, db=-4, lp=2600, reverb=0.25, ramp=0.3)
    # --- teaser: four peak moments, one beat each ---
    teaser = [('20261123_173020', 29.7, 0.5), ('20261123_170949', 19.6, 0.32), ('20261123_172647', 0.9, 0.42), ('20261123_174055', 0.35, 0.42)]
    for i, (src, at, cx) in enumerate(teaser):
        tr = ('whip', 0.22) if i % 2 == 0 else ('flash', 0.16)
        b.shot(n=1, src=src, at=at, crop_x=cx, zoom=(1.08, 1.2), center=(0.5, 0.45), trans=tr)
    t_stop = b.t
    b.fx('rise', t_stop, dur=1.6, gain=0.22)
    # --- dramatic stop -> TITLE over the line-up ---
    b.bed_start('20261123_165803', 2.4, gain=3.2, snap=False, fade=0.05)
    t0, t1 = b.shot(s=4.4, zoom=(1.18, 1.34), center=(0.5, 0.34), trans=('gold', 0.5), dim=(0.0, 0.4, 0.42))
    b.fx('impact', t0, gain=0.55)
    b.fx('shimmer', t0 + 0.4, dur=3.0, gain=0.2)
    b.add(particles, t0, t1 + 0.4, k=0.9, seed=5)
    b.add(rays_ov, t0, t1, k=0.5)
    opening_title(b, t0, t1)
    # --- THE MAGIC BEGINS: the line-up, synced to its own sound ---
    b.shot(s=3.3, zoom=(1.34, 1.42), center=(0.45, 0.35), trans=('dissolve', 0.5))
    b.shot(s=3.6, zoom=(1.5, 1.38), center=(0.58, 0.35), trans=('zoom', 0.36))
    # --- THE LIGHTS: full scene with a time-freeze on the raised lights ---
    b.bed_start('20261123_165911', 0.0, gain=1.0, snap=False, fade=0.35)
    t0, t1 = b.shot(s=1.5, zoom=(1.1, 1.22), center=(0.5, 0.36), trans=('lightwipe', 0.45))
    tf0, tf1 = b.shot(s=1.0, src='20261123_165911', at=1.5, speed=0.0, zoom=(1.22, 1.3), center=(0.5, 0.36), nosnap=True)
    b.add(flash_ov, tf0, tf0 + 0.35, peak=0.8)
    b.add(burst, tf0, tf0 + 1.6, x=0.5, y=0.33, seed=8)
    b.fx('shimmer', tf0, dur=1.8, gain=0.24)
    b.fx('sparkle', tf0, dur=1.0, gain=0.16)
    b.duck(tf0, tf1, db=-5, lp=1800, ramp=0.08)
    b.shot(s=1.6, zoom=(1.18, 1.1), center=(0.5, 0.36), trans=('flash', 0.14))
    b.add(particles, t0, b.t, k=0.6, seed=9)
    # --- THE BIG ROTATION WOW ---
    tr0 = b.t
    if ending == 'phone':
        t0, t1 = b.shot(s=4.0, src='20261123_165911', at=6.35, speed=0.3, blur_bg=True, dim=(0, 0.5, 0.55),
                        zoom=(1.15, 1.25), center=(0.5, 0.4), trans=('dissolve', 0.3), nosnap=True)
        b.duck(t0 - 0.1, t1 + 0.5, db=-14, lp=700, ramp=0.25)
        b.add(flash_ov, t0, t0 + 0.5, peak=0.75)
        b.add(particles, t0, t1, k=1.1, seed=11)
        b.add(text_ov, t0 + 0.15, t1, txt='רגע...', y=0.2, size=110, font='frank-ruhl-libre-700', tin=0.6)
        b.add(text_ov, t0 + 0.55, t1, txt='הקסם רק מתחיל!', y=0.27, size=118, font='frank-ruhl-libre-900', tin=0.7, shimmer=0.7)
        b.add(phone_ov, t0 + 1.0, t1, y=0.58, r0=0.7, r1=1.55, scale=1.0)
        b.add(text_ov, t0 + 1.25, t1, txt='סובבו את המסך!', y=0.86, size=124, font='frank-ruhl-libre-900', tin=0.6, shimmer=1.5)
        b.fx('shimmer', t0, dur=2.5, gain=0.18)
        b.fx('rise', t0 + 1.7, dur=1.2, gain=0.18)
        b.fx('whoosh', t0 + 1.0 + 1.12, dur=0.9, gain=0.6)
        b.fx('impact', t0 + 1.0 + 1.55, gain=0.6)
        b.fx('sparkle', t0 + 1.0 + 1.55, dur=1.2, gain=0.16)
        b.add(black_out, t1 - 0.35, t1 + 0.01)
    else:  # story version: the picture itself turns into the landscape window
        t0, t1 = b.shot(s=1.9, src='20261123_165911', at=6.35, speed=0.35, dim=(0, 0.4, 0.5), blur_bg=True,
                        zoom=(1.15, 1.2), center=(0.5, 0.4), trans=('dissolve', 0.3), nosnap=True)
        b.duck(t0 - 0.1, t1 + 0.6, db=-12, lp=800, ramp=0.25)
        b.add(flash_ov, t0, t0 + 0.5, peak=0.7)
        b.add(particles, t0, t1 + 1.0, k=1.0, seed=11)
        b.add(text_ov, t0 + 0.1, t1 + 0.4, txt='רגע...', y=0.4, size=120, font='frank-ruhl-libre-700', tin=0.5, fo=0.3)
        b.add(text_ov, t0 + 0.45, t1 + 0.4, txt='הקסם רק מתחיל!', y=0.49, size=130, tin=0.6, shimmer=0.6, fo=0.3)
        b.fx('shimmer', t0, dur=2.2, gain=0.18)
        b.fx('rise', t1 + 0.3, dur=1.4, gain=0.2)
    return tr0

# ----------------------------------------------------------------------------------------------
# PART 2 — landscape (or the same edit laid out in a window inside the vertical frame)
# ----------------------------------------------------------------------------------------------
def build_part2(b, window=False, first_trans=('cut', 0)):
    w = dict(window=window)
    cw, ch = b.canvas
    wstart = b.t + 0.6
    # --- THE MAGIC BEGINS: wide slow-motion reveal of the whole circle (120fps) ---
    b.bed_start('20261123_170036', 11.0, gain=1.0, fade=0.3)
    t0, t1 = b.shot(s=4.4, src='20261123_170036', at=11.0, speed=[(0, 0.32), (3.0, 0.32), (4.0, 1.0)],
                    zoom=(1.16, 1.0), center=(0.5, 0.5), trans=first_trans, nosnap=True, **w)
    b.fx('impact', t0 + (first_trans[1] * 0.3), gain=0.6)
    b.fx('shimmer', t0 + 0.1, dur=2.8, gain=0.18)
    if not window:
        b.add(black_in, t0, t0 + 0.45)
    b.add(flash_ov, t0, t0 + 0.6, peak=0.7)
    b.add(rays_ov, t0, t1 + 0.3, k=0.5)
    b.add(particles, t0, t1 + 0.4, k=0.8, seed=21)
    b.add(flare_ov, t0 + 0.3, t0 + 3.6, y=0.25 if not window else 0.36)
    b.duck(t0, t0 + 3.0, db=-3, lp=3000, ramp=0.6)
    # --- ENERGY: bucket drums, cut on the beat of their own song ---
    b.bed_start('20261123_170949', 19.0, gain=1.0, fade=0.12)
    b.shot(n=6, zoom=(1.0, 1.1), center=(0.42, 0.5), trans=('whip', 0.3), **w)
    b.shot(n=2, src='20261123_170613', at=0.6, zoom=(1.06, 1.14), **w)
    b.shot(n=2, src='20261123_170651', at=19.2, zoom=(1.12, 1.04), stab=True, **w)
    b.shot(n=2, src='20261123_170613', at=7.0, zoom=(1.0, 1.08), center=(0.35, 0.5), **w)
    b.bed_start('20261123_170949', 28.9, gain=1.0, fade=0.04)   # same song, re-synced on a beat
    b.shot(n=4, zoom=(1.04, 1.12), stab=True, trans=('zoom', 0.3), **w)
    b.shot(n=2, src='20261123_170651', at=4.4, zoom=(1.1, 1.18), stab=True, **w)
    b.shot(n=4, zoom=(1.0, 1.1), center=(0.5, 0.5), stab=True, trans=('flash', 0.12), **w)
    # --- RIBBONS & DANCE ---
    b.bed_start('20261123_172647', 0.0, gain=1.0, fade=0.15)
    t0, _ = b.shot(n=4, zoom=(1.02, 1.12), stab=True, trans=('lightwipe', 0.45), **w)
    b.shot(n=2, src='20261123_172542', at=3.0, zoom=(1.05, 1.12), stab=True, **w)
    b.shot(n=4, src='20261123_172647', at=8.0, zoom=(1.0, 1.08), stab=True, **w)
    b.shot(n=2, src='20261123_172300', at=45.0, zoom=(1.08, 1.0), stab=True, trans=('whip', 0.26), **w)
    b.shot(n=2, src='20261123_172300', at=15.0, zoom=(1.0, 1.1), stab=True, **w)
    # --- MAGIC: the parachute, with a time-freeze on the raised hands ---
    b.bed_start('20261123_173020', 25.9, gain=1.0, fade=0.3)
    t0, _ = b.shot(n=4, zoom=(1.0, 1.08), trans=('gold', 0.5), **w)
    b.shot(n=4, zoom=(1.08, 1.16), center=(0.5, 0.45), **w)
    tf, _ = b.shot(n=2, zoom=(1.16, 1.2), center=(0.5, 0.4), **w)
    fat = b.bed['pos']
    f0, f1 = b.shot(n=2, src='20261123_173020', at=fat, speed=0.0, zoom=(1.2, 1.3), center=(0.5, 0.38), nosnap=True, **w)
    b.add(flash_ov, f0, f0 + 0.35, peak=0.85)
    b.add(burst, f0, f0 + 1.7, x=0.5, y=0.32 if not window else 0.4, seed=31)
    b.fx('shimmer', f0, dur=1.8, gain=0.24); b.fx('sparkle', f0, dur=1.0, gain=0.16)
    b.duck(f0, f1, db=-4, lp=1600, ramp=0.06)
    b.shot(n=4, src='20261123_173233', at=4.2, zoom=(1.0, 1.1), trans=('flash', 0.14), **w)
    b.shot(n=2, src='20261123_173453', at=9.6, zoom=(1.06, 1.12), **w)
    b.shot(n=4, src='20261123_173020', at=b.bed['pos'], nosnap=True, zoom=(1.0, 1.1), **w)
    b.shot(n=4, src='20261123_173020', at=b.bed['pos'], nosnap=True, zoom=(1.1, 1.02), trans=('dissolve', 0.3), **w)
    b.add(particles, t0, b.t, k=0.75, seed=33)
    b.add(rays_ov, t0, b.t, k=0.35)
    # --- EMOTIONAL: mothers and daughters, real slow motion, music softened ---
    b.bed_start('20261123_174055', 0.0, gain=0.8, fade=0.6)
    e0 = b.t
    b.shot(s=3.3, src='20261123_174055', at=0.15, speed=0.3, nosnap=True, zoom=(1.05, 1.16), center=(0.42, 0.45), trans=('dissolve', 0.9), **w)
    b.shot(s=3.0, src='20261123_174135', at=8.9, speed=0.3, nosnap=True, zoom=(1.12, 1.04), center=(0.55, 0.5), trans=('dissolve', 0.6), **w)
    b.shot(s=2.8, src='20261123_174001', at=6.5, speed=0.5, interp='flow', stab=True, nosnap=True, zoom=(1.1, 1.18), center=(0.6, 0.4), trans=('dissolve', 0.6), **w)
    t0, t1 = b.shot(s=2.4, src='20261123_174055', at=23.9, speed=0.3, nosnap=True, zoom=(1.04, 1.12), center=(0.45, 0.42), trans=('dissolve', 0.6), **w)
    f0, f1 = b.shot(s=1.2, src='20261123_174055', at=23.9 + 2.4 * 0.3, speed=0.0, nosnap=True, zoom=(1.12, 1.18), center=(0.45, 0.42), **w)
    b.add(flash_ov, f0, f0 + 0.4, peak=0.5)
    b.fx('shimmer', f0, dur=2.0, gain=0.2)
    b.duck(e0 - 0.4, b.t, db=-5, lp=2200, reverb=0.35, ramp=0.6)
    b.add(leak_ov, e0, b.t, k=0.35, seed=4)
    b.add(particles, e0, b.t, k=0.45, seed=41, n=60)
    b.fx('rise', b.t, dur=1.8, gain=0.24)
    # --- GRAND FINALE: rapid beat montage ---
    b.bed_start('20261123_172300', 59.0, gain=1.0, fade=0.12)
    g0, _ = b.shot(n=4, zoom=(1.0, 1.1), stab=True, trans=('zoom', 0.4), **w)
    b.fx('impact', g0, gain=0.5)
    montage = [('20261123_173639', 5.9, ('whip', 0.24)), ('20261123_170949', 20.4, ('cut', 0)), ('20261123_173020', 36.9, ('flash', 0.12)),
               ('20261123_172647', 1.4, ('whip', 0.24)), ('20261123_174055', 18.5, ('cut', 0))]
    for src, at, tr in montage:
        b.shot(n=2, src=src, at=at, zoom=(1.04, 1.14), trans=tr, stab=src in ('20261123_172647', '20261123_170949'), **w)
    b.shot(n=1, src='20261123_173233', at=6.3, zoom=(1.1, 1.16), trans=('flash', 0.1), **w)
    b.shot(n=1, src='20261123_170651', at=19.4, zoom=(1.1, 1.16), stab=True, **w)
    l0, l1 = b.shot(n=4, src='20261123_173639', at=53.4, speed=0.6, nosnap=True, zoom=(1.0, 1.12), trans=('lightwipe', 0.4), **w)
    b.add(particles, g0, l1, k=0.6, seed=51)
    if window:
        header(b, wstart, b.t)
    # --- END CARD ---
    t0, t1 = b.shot(s=4.8, src='20261123_173639', at=57.0, speed=0.3, nosnap=True, zoom=(1.0, 1.08), blur_bg=True,
                    dim=(0, 0.8, 0.5), trans=('gold', 0.6), **w)
    b.fx('impact', t0, gain=0.55)
    b.fx('shimmer', t0 + 0.2, dur=3.5, gain=0.22)
    b.duck(t0, t1 + 0.6, db=-6, lp=3500, ramp=0.8)
    b.add(particles, t0, t1 + 1, k=1.0, seed=61, fo=0.01)
    b.add(rays_ov, t0, t1 + 1, k=0.5)
    if window:
        end_title(b, t0, t1, ys=(0.72, 0.80), big=200, small=100)
    else:
        end_title(b, t0, t1, ys=(0.41, 0.57), big=250, small=120)
    b.add(black_out, t1 - 0.7, t1 + 0.01)

# ----------------------------------------------------------------------------------------------
# SHORT STORY (<=30s, vertical)
# ----------------------------------------------------------------------------------------------
def build_short(b):
    w = dict(window=True)
    b.bed_start('20261123_165911', 0.2, gain=0.9, fade=0.5)
    t0, t1 = b.shot(n=4, src='20261123_165911', at=0.42, speed=0.45, interp='flow', zoom=(1.05, 1.25), center=(0.5, 0.36), nosnap=True)
    b.add(black_in, 0, 0.5); b.add(flash_ov, 0.3, 0.9, peak=0.9)
    b.add(particles, 0, t1, k=1.0, seed=2)
    b.fx('impact', 0.3, gain=0.35); b.fx('shimmer', 0.05, dur=2.2, gain=0.2)
    b.duck(0, t1, db=-4, lp=2600, reverb=0.25, ramp=0.3)
    b.bed_start('20261123_165803', 2.4, gain=3.2, snap=False, fade=0.05)
    t0, t1 = b.shot(s=3.2, zoom=(1.18, 1.32), center=(0.5, 0.34), trans=('gold', 0.45), dim=(0, 0.3, 0.42))
    b.fx('impact', t0, gain=0.5)
    b.add(particles, t0, t1, k=0.9, seed=5); b.add(rays_ov, t0, t1, k=0.5)
    opening_title(b, t0, t1)
    # into the landscape window
    b.bed_start('20261123_170949', 19.0, gain=1.0, fade=0.12)
    b.shot(n=4, trans=('rotate_window', 1.0), zoom=(1.0, 1.08), **w)
    b.fx('whoosh', t1, dur=0.9, gain=0.55); b.fx('impact', t1 + 0.45, gain=0.45)
    b.shot(n=2, src='20261123_170613', at=0.6, zoom=(1.04, 1.1), **w)
    b.bed_start('20261123_173020', 27.8, gain=1.0, fade=0.15)
    b.shot(n=4, zoom=(1.06, 1.14), trans=('whip', 0.26), **w)
    f0, f1 = b.shot(n=2, src='20261123_173020', at=b.bed['pos'], speed=0.0, nosnap=True, zoom=(1.14, 1.22), **w)
    b.add(flash_ov, f0, f0 + 0.35, peak=0.8); b.add(burst, f0, f0 + 1.6, x=0.5, y=0.4, seed=31)
    b.fx('shimmer', f0, dur=1.6, gain=0.22)
    b.shot(n=2, src='20261123_173233', at=4.2, zoom=(1.0, 1.08), trans=('flash', 0.12), **w)
    b.bed_start('20261123_174055', 0.0, gain=0.8, fade=0.4)
    e0, _ = b.shot(s=2.6, src='20261123_174055', at=0.15, speed=0.3, nosnap=True, zoom=(1.05, 1.14), center=(0.42, 0.45), trans=('dissolve', 0.6), **w)
    b.shot(s=2.2, src='20261123_174135', at=8.9, speed=0.3, nosnap=True, zoom=(1.1, 1.04), trans=('dissolve', 0.5), **w)
    b.duck(e0 - 0.3, b.t, db=-5, lp=2200, reverb=0.3, ramp=0.5)
    b.add(leak_ov, e0, b.t, k=0.3)
    b.bed_start('20261123_172300', 59.0, gain=1.0, fade=0.12)
    g0, _ = b.shot(n=2, zoom=(1.0, 1.08), stab=True, trans=('zoom', 0.36), **w)
    for src, at, tr in [('20261123_173639', 5.9, ('whip', 0.22)), ('20261123_172647', 1.4, ('cut', 0)), ('20261123_173020', 36.9, ('flash', 0.1))]:
        b.shot(n=2, src=src, at=at, zoom=(1.04, 1.12), trans=tr, stab=src == '20261123_172647', **w)
    b.add(particles, g0, b.t, k=0.6, seed=51)
    header(b, 6.0, b.t)
    t0, t1 = b.shot(s=3.6, src='20261123_173639', at=57.0, speed=0.3, nosnap=True, blur_bg=True, dim=(0, 0.6, 0.5), trans=('gold', 0.5), **w)
    b.fx('impact', t0, gain=0.5); b.fx('shimmer', t0 + 0.2, dur=3.0, gain=0.2)
    b.duck(t0, t1 + 0.6, db=-6, lp=3500, ramp=0.6)
    b.add(particles, t0, t1 + 1, k=1.0, seed=61, fo=0.01)
    end_title(b, t0, t1, ys=(0.72, 0.80), big=200, small=100)
    b.add(black_out, t1 - 0.6, t1 + 0.01)

# ----------------------------------------------------------------------------------------------
def versions():
    v = {}
    b = Builder(PORTRAIT); build_part1(b, 'phone')
    v['part1'] = b.version('part1', os.path.join(OUT, 'gan-malchut-hanukkah-part1-portrait.mp4'))
    b = Builder(LANDSCAPE); build_part2(b)
    v['part2'] = b.version('part2', os.path.join(OUT, 'gan-malchut-hanukkah-part2-landscape.mp4'))
    b = Builder(PORTRAIT); build_part1(b, 'story'); build_part2(b, window=True, first_trans=('rotate_window', 1.1))
    v['story'] = b.version('story', os.path.join(OUT, 'gan-malchut-hanukkah-story-full.mp4'))
    b = Builder(PORTRAIT); build_short(b)
    v['short'] = b.version('short', os.path.join(OUT, 'gan-malchut-hanukkah-story-30s.mp4'))
    return v

def describe(v):
    print(f'== {v.name}: {v.duration:.2f}s, {len(v.clips)} shots')
    for c in v.clips:
        sp = c.speed if isinstance(c.speed, (int, float)) else 'ramp'
        print(f'  {c.t0:6.2f}-{c.t1:6.2f} ({c.t1 - c.t0:4.2f}) {c.src[9:]} @{c.src_t0:6.2f} x{sp} {c.trans_in[0]:9s} {c.layout}')

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    preview = '--preview' in sys.argv
    stills = None
    if '--stills' in sys.argv:
        stills = [float(x) for x in sys.argv[sys.argv.index('--stills') + 1].split(',')]
        args = [a for a in args if not a.replace('.', '').replace(',', '').isdigit()]
    vs = versions()
    names = args or ['part1', 'part2', 'story', 'short']
    for n in names:
        v = vs[n]
        describe(v)
        if '--plan' in sys.argv: continue
        if '--audio-only' in sys.argv:
            E.remux_audio(v); continue
        if preview:
            v.out = v.out.replace('output', 'work/preview')
        sd = os.path.join(E.WORK, 'stills'); os.makedirs(sd, exist_ok=True)
        E.render(v, preview=preview, stills=stills, stills_dir=sd)
