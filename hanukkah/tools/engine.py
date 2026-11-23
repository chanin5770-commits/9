"""
Gan Malchut Hanukkah film — rendering engine.

A small compositor that turns an edit description (see edit.py) into finished MP4s:
  * reads source clips through ffmpeg (auto-rotation, optional vidstab stabilisation, denoise)
  * speed ramps / slow motion (true high-frame-rate frames for 120fps sources,
    optical-flow interpolation for 30fps sources), freeze frames, push-ins
  * per-frame colour grade (partial white balance + deep-blue/gold curves, bloom, vignette)
  * transitions: whip pan, zoom-blur, golden light wipe, flash, dissolve, rotate-to-window
  * canvas overlays: gold particles, light rays, lens flares, light leaks, Hebrew titles,
    the 3D "rotate your phone" animation
  * audio: original soundtrack beds with beat-aligned cuts + synthesised sound design
Everything here is actually rendered — nothing is a placeholder.
"""
import json, math, os, subprocess, sys, hashlib
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import signal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw')
WORK = os.path.join(ROOT, 'work')
FONTS = os.path.join(ROOT, 'assets', 'fonts')
FPS = 30
SR = 48000
cv2.setNumThreads(2)

ANALYSIS = json.load(open(os.path.join(WORK, 'audio_analysis.json')))

def src_path(name):
    return os.path.join(RAW, name + '.mp4')

_probe = {}
def probe(name):
    if name not in _probe:
        out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                              'stream=width,height,r_frame_rate:stream_side_data=rotation', '-of', 'json',
                              src_path(name)], capture_output=True, text=True).stdout
        s = json.loads(out)['streams'][0]
        rot = 0
        for sd in s.get('side_data_list', []):
            rot = int(sd.get('rotation', 0))
        w, h = s['width'], s['height']
        if abs(rot) == 90: w, h = h, w
        n, d = s['r_frame_rate'].split('/')
        _probe[name] = dict(w=w, h=h, fps=float(n) / float(d))
    return _probe[name]

def ease(p):  # smooth in-out
    p = min(max(p, 0.0), 1.0)
    return p * p * (3 - 2 * p)

def ease_out(p):
    p = min(max(p, 0.0), 1.0)
    return 1 - (1 - p) ** 3

def ease_in(p):
    p = min(max(p, 0.0), 1.0)
    return p ** 3

# ----------------------------------------------------------------------------------------------
# Timeline data
# ----------------------------------------------------------------------------------------------
class Clip:
    def __init__(self, **k):
        self.src = k['src']; self.t0 = k['t0']; self.t1 = k['t1']
        self.src_t0 = k['src_t0']
        self.speed = k.get('speed', 1.0)          # float or list of (t_rel, speed) keyframes
        self.zoom = k.get('zoom', (1.0, 1.0))      # start/end zoom factor
        self.center = k.get('center', (0.5, 0.5))  # zoom centre in picture coords (0..1)
        self.center_end = k.get('center_end', None)
        self.crop_x = k.get('crop_x', None)        # for portrait-from-landscape crops: centre x (0..1)
        self.layout = k.get('layout', 'fill')      # 'fill' or 'window'
        self.pic = k['pic']                        # picture size (w,h)
        self.stab = k.get('stab', False)
        self.interp = k.get('interp', 'blend')
        self.trans_in = k.get('trans_in', ('cut', 0))
        self.trans_out = ('cut', 0)
        self.grade = k.get('grade', {})
        self.name = k.get('name', '')
        self.blur_bg = k.get('blur_bg', False)     # e.g. behind titles
        self.dim = k.get('dim', None)               # (t_rel0, t_rel1, amount) darken ramp
        self._map = None

    # source time for timeline-relative time (t_rel may be negative for transition pre-roll)
    def src_time(self, t_rel):
        if isinstance(self.speed, (int, float)):
            return self.src_t0 + t_rel * self.speed
        if self._map is None:
            ks = self.speed
            dur = self.t1 - self.t0 + 4
            ts = np.arange(0, dur, 1 / 600)
            sp = np.interp(ts, [k[0] for k in ks], [k[1] for k in ks])
            self._map = (ts, np.concatenate([[0], np.cumsum(sp[:-1]) / 600]))
        if t_rel < 0:
            return self.src_t0 + t_rel * self.speed[0][1]
        ts, cum = self._map
        return self.src_t0 + float(np.interp(t_rel, ts, cum))

    def max_speed(self):
        if isinstance(self.speed, (int, float)): return self.speed
        return max(k[1] for k in self.speed)

# ----------------------------------------------------------------------------------------------
# Source reading
# ----------------------------------------------------------------------------------------------
def stab_file(src, s0, dur):
    key = hashlib.md5(f'{src}{s0:.3f}{dur:.3f}'.encode()).hexdigest()[:10]
    d = os.path.join(WORK, 'stab'); os.makedirs(d, exist_ok=True)
    trf = os.path.join(d, f'{src}_{key}.trf')
    if not os.path.exists(trf):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{s0:.3f}', '-t', f'{dur:.3f}', '-i', src_path(src),
                        '-vf', f'vidstabdetect=shakiness=6:accuracy=12:result={trf}', '-f', 'null', '-'], check=True)
    return trf

def stab_source(src):
    """whole-clip vidstab pass rendered once to a high-quality intermediate."""
    d = os.path.join(WORK, 'stab'); os.makedirs(d, exist_ok=True)
    out = os.path.join(d, f'{src}_stab.mp4')
    if not os.path.exists(out):
        trf = os.path.join(d, f'{src}.trf')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src_path(src), '-vf', f'vidstabdetect=shakiness=6:accuracy=12:result={trf}',
                        '-f', 'null', '-'], check=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src_path(src), '-vf',
                        f'vidstabtransform=input={trf}:smoothing=12:optzoom=1:zoomspeed=0.15:interpol=bicubic',
                        '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'copy', out + '.tmp.mp4'], check=True)
        os.replace(out + '.tmp.mp4', out)
    return out

class Reader:
    """Streams frames of one clip from ffmpeg at the source's native frame rate."""
    def __init__(self, clip, pre, t_from=None):
        self.clip = clip
        info = probe(clip.src)
        self.fps = info['fps']
        rel = -pre if t_from is None else max(-pre, t_from - clip.t0)
        s_start = clip.src_time(rel) - 0.05
        s_end = clip.src_time(clip.t1 - clip.t0 + pre) + 0.2
        s_start = max(0.0, s_start)
        self.s0 = s_start
        dur = s_end - s_start
        w, h = clip.pic
        vf = []
        path = src_path(clip.src)
        if clip.stab:
            path = stab_source(clip.src)
        if self.fps > 31 and clip.max_speed() >= 0.99 and not isinstance(clip.speed, list):
            vf.append('fps=30'); self.fps = 30.0   # real-time playback of high-fps sources
        vf.append('hqdn3d=1.5:1.5:4:4')
        if clip.crop_x is not None:  # vertical crop from a landscape source
            cw = int(info['h'] * w / h) // 2 * 2
            x = int(np.clip(clip.crop_x * info['w'] - cw / 2, 0, info['w'] - cw))
            vf.append(f'crop={cw}:{info["h"]}:{x}:0')
        vf.append(f'scale={w}:{h}:flags=lanczos')
        self.w, self.h = w, h
        cmd = ['ffmpeg', '-v', 'error', '-ss', f'{s_start:.3f}', '-t', f'{dur:.3f}', '-i', path,
               '-vf', ','.join(vf), '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-']
        self.p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=w * h * 3 * 2)
        self.idx = -1
        self.cur = None
        self.nxt = None
        self.ended = False
        self.flow = None

    def _read(self):
        n = self.w * self.h * 3
        buf = self.p.stdout.read(n)
        if len(buf) < n:
            self.ended = True
            return None
        return np.frombuffer(buf, np.uint8).reshape(self.h, self.w, 3)

    def get(self, s):
        """frame at source time s (monotonic non-decreasing calls)."""
        fi = (s - self.s0) * self.fps
        k = int(math.floor(fi))
        if self.cur is None:
            self.cur = self._read(); self.nxt = self._read(); self.idx = 0
        while self.idx < k and not self.ended:
            f = self._read()
            if f is None: break
            self.cur, self.nxt = self.nxt, f
            self.idx += 1
        if self.nxt is None or self.ended:
            return self.cur if self.nxt is None else self.nxt
        a = fi - self.idx
        a = min(max(a, 0.0), 1.0)
        if a < 0.04: return self.cur
        if a > 0.96: return self.nxt
        if self.clip.interp == 'flow' and self.fps <= 31:
            return self.flow_interp(a)
        if self.fps > 50:  # high frame rate: nearest is fine
            return self.cur if a < 0.5 else self.nxt
        return cv2.addWeighted(self.cur, 1 - a, self.nxt, a, 0)

    def flow_interp(self, a):
        key = self.idx
        if self.flow is None or self.flow[0] != key:
            sc = 0.5
            g0 = cv2.cvtColor(cv2.resize(self.cur, None, fx=sc, fy=sc), cv2.COLOR_BGR2GRAY)
            g1 = cv2.cvtColor(cv2.resize(self.nxt, None, fx=sc, fy=sc), cv2.COLOR_BGR2GRAY)
            dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
            f01 = dis.calc(g0, g1, None)
            f10 = dis.calc(g1, g0, None)
            f01 = cv2.resize(f01, (self.w, self.h)) / sc
            f10 = cv2.resize(f10, (self.w, self.h)) / sc
            self.flow = (key, f01, f10)
        _, f01, f10 = self.flow
        gx, gy = np.meshgrid(np.arange(self.w, dtype=np.float32), np.arange(self.h, dtype=np.float32))
        w0 = cv2.remap(self.cur, gx + f10[..., 0] * a, gy + f10[..., 1] * a, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        w1 = cv2.remap(self.nxt, gx + f01[..., 0] * (1 - a), gy + f01[..., 1] * (1 - a), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        return cv2.addWeighted(w0, 1 - a, w1, a, 0)

    def close(self):
        try:
            self.p.stdout.close(); self.p.kill(); self.p.wait()
        except Exception:
            pass

# ----------------------------------------------------------------------------------------------
# Grade
# ----------------------------------------------------------------------------------------------
def curve(x, pts):
    xs, ys = zip(*pts)
    return np.interp(x, xs, ys)

X = np.arange(256, dtype=np.float32)
# deep blue shadows, cream mids, warm gold highlights, gentle filmic S
BASE_B = curve(X, [(0, 14), (40, 50), (128, 128), (200, 192), (255, 236)])
BASE_G = curve(X, [(0, 6), (40, 36), (128, 128), (200, 202), (255, 246)])
BASE_R = curve(X, [(0, 4), (40, 32), (128, 130), (200, 210), (255, 252)])

class Grader:
    def __init__(self, strength=0.4, exposure=1.0, contrast=1.0):
        self.ema = None
        self.strength = strength
        self.exposure = exposure
        self.contrast = contrast

    def __call__(self, img):
        small = cv2.resize(img, (64, 36), interpolation=cv2.INTER_AREA).reshape(-1, 3).astype(np.float32)
        m = small.mean(0) + 1
        self.ema = m if self.ema is None else self.ema * 0.85 + m * 0.15
        g = self.ema.mean()
        gains = (g / self.ema) ** self.strength
        # auto exposure toward mid-grey for dark clips (gentle)
        lum = float(g)
        expo = self.exposure * float(np.clip((118 / max(lum, 1)) ** 0.45, 0.85, 1.6))
        luts = []
        for c, base in enumerate((BASE_B, BASE_G, BASE_R)):
            v = X * gains[c] * expo
            v = (v - 128) * self.contrast + 128
            v = np.clip(v, 0, 255)
            luts.append(np.clip(np.interp(v, X, base), 0, 255).astype(np.uint8))
        lut = np.stack(luts, axis=1).reshape(256, 1, 3)
        out = cv2.LUT(img, lut)
        return out

def bloom(img, amount=0.28):
    h, w = img.shape[:2]
    s = cv2.resize(img, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    s = cv2.subtract(s, (165, 165, 165, 0))
    s = cv2.GaussianBlur(s, (0, 0), 9)
    s = cv2.resize(s, (w, h), interpolation=cv2.INTER_LINEAR)
    warm = cv2.multiply(s, (0.75 * amount * 2, 0.92 * amount * 2, 1.15 * amount * 2, 0), dtype=cv2.CV_8U)
    return cv2.add(img, warm)

def sharpen(img, amt=0.35):
    b = cv2.GaussianBlur(img, (0, 0), 1.6)
    return cv2.addWeighted(img, 1 + amt, b, -amt, 0)

_vig = {}
def vignette(img, strength=0.38):
    h, w = img.shape[:2]
    k = (w, h, strength)
    if k not in _vig:
        y, x = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.sqrt(((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2) / math.sqrt(2)
        m = 1 - strength * np.clip((d - 0.35) / 0.65, 0, 1) ** 1.6
        _vig[k] = np.dstack([m] * 3).astype(np.float32)
    return (img.astype(np.float32) * _vig[k]).astype(np.uint8)

def zoom_frame(img, z, cx, cy, out_wh=None):
    h, w = img.shape[:2]
    ow, oh = out_wh or (w, h)
    if abs(z - 1) < 1e-3 and out_wh is None:
        return img
    # keep the zoom window inside the frame
    cx = np.clip(cx, 0.5 / z, 1 - 0.5 / z); cy = np.clip(cy, 0.5 / z, 1 - 0.5 / z)
    M = np.array([[z * ow / w, 0, ow / 2 - z * ow / w * cx * w], [0, z * oh / h, oh / 2 - z * oh / h * cy * h]], np.float32)
    return cv2.warpAffine(img, M, (ow, oh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

# ----------------------------------------------------------------------------------------------
# Layout (picture -> canvas)
# ----------------------------------------------------------------------------------------------
GOLD = (92, 190, 245)      # BGR
GOLD_DEEP = (40, 130, 210)
CREAM = (200, 235, 255)

def window_rect(cw, ch, pw, ph):
    ww = cw - 2 * 0
    wh = int(round(ww * ph / pw / 2)) * 2
    x = (cw - ww) // 2
    y = int(ch * 0.46 - wh / 2)
    return x, y, ww, wh

def layout_window(pic, cw, ch, t):
    ph, pw = pic.shape[:2]
    x, y, ww, wh = window_rect(cw, ch, pw, ph)
    bg = cv2.resize(pic, (cw // 8, ch // 8), interpolation=cv2.INTER_AREA)
    # cover-crop the background
    bh, bw = bg.shape[:2]
    small = cv2.resize(pic, (int(pw * (ch / 8) / ph), ch // 8), interpolation=cv2.INTER_AREA)
    sx = (small.shape[1] - cw // 8) // 2
    bg = small[:, sx:sx + cw // 8]
    bg = cv2.GaussianBlur(bg, (0, 0), 5)
    bg = cv2.resize(bg, (cw, ch), interpolation=cv2.INTER_LINEAR)
    bg = cv2.convertScaleAbs(bg, alpha=0.42, beta=0)
    bg = cv2.add(bg, (22, 10, 4, 0))  # deep blue tint
    canvas = bg
    inner = cv2.resize(pic, (ww, wh), interpolation=cv2.INTER_AREA)
    canvas[y:y + wh, x:x + ww] = inner
    # gold hairlines above/below the window with a soft glow
    for yy in (y - 3, y + wh + 1):
        cv2.line(canvas, (0, yy), (cw, yy), GOLD, 2, cv2.LINE_AA)
    glow = np.zeros((ch // 4, cw // 4, 3), np.uint8)
    for yy in (y, y + wh):
        cv2.line(glow, (0, yy // 4), (cw // 4, yy // 4), (60, 140, 200), 3)
    glow = cv2.resize(cv2.GaussianBlur(glow, (0, 0), 4), (cw, ch))
    return cv2.add(canvas, glow)

# ----------------------------------------------------------------------------------------------
# Overlays
# ----------------------------------------------------------------------------------------------
class Particles:
    """Golden dust: drifting, twinkling motes with glow. Deterministic per seed."""
    def __init__(self, cw, ch, n=110, seed=1, mode='drift'):
        r = np.random.RandomState(seed)
        self.cw, self.ch, self.n, self.mode = cw, ch, n, mode
        self.p0 = r.rand(n, 2) * [cw, ch]
        self.v = (r.rand(n, 2) - [0.5, 0.75]) * [26, 40]
        self.size = r.rand(n) ** 3 * 4.5 + 0.8
        self.ph = r.rand(n) * 6.28
        self.fr = r.rand(n) * 2 + 0.8
        self.hue = r.rand(n)

    def render(self, frame, t, intensity=1.0, burst=None):
        if intensity <= 0.01: return frame
        cw, ch = self.cw, self.ch
        sc = 0.5
        layer = np.zeros((int(ch * sc), int(cw * sc), 3), np.uint8)
        pos = (self.p0 + self.v * t + np.stack([np.sin(t * 0.7 + self.ph) * 18, np.cos(t * 0.5 + self.ph) * 10], 1)) % [cw, ch]
        if burst is not None:  # radial burst from a point: (x, y, t_since)
            bx, by, bt = burst
            ang = self.ph
            rad = (60 + self.fr * 260) * ease_out(min(bt / 1.2, 1))
            pos = np.stack([bx + np.cos(ang) * rad * (0.4 + self.size / 5), by + np.sin(ang) * rad * (0.4 + self.size / 5)], 1)
            intensity *= max(0, 1 - bt / 1.6)
        tw = 0.55 + 0.45 * np.sin(t * self.fr * 3 + self.ph)
        for i in range(self.n):
            b = tw[i] * intensity
            if b < 0.05: continue
            col = (int(110 * b), int(205 * b), int(255 * b)) if self.hue[i] < 0.8 else (int(255 * b), int(240 * b), int(210 * b))
            cv2.circle(layer, (int(pos[i, 0] * sc * 16), int(pos[i, 1] * sc * 16)), int(self.size[i] * sc * 16), col, -1, cv2.LINE_AA, shift=4)
        glow = cv2.GaussianBlur(layer, (0, 0), 3)
        layer = cv2.add(layer, cv2.add(glow, glow))
        layer = cv2.resize(layer, (cw, ch), interpolation=cv2.INTER_LINEAR)
        return cv2.add(frame, layer)

_sprites = {}
def flare_sprite(size=900):
    if 'flare' in _sprites: return _sprites['flare']
    h, w = size // 3, size
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, h / 2
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    core = np.exp(-(d / 22) ** 2) * 1.0 + np.exp(-(d / 90) ** 2) * 0.35
    streak = np.exp(-((y - cy) / 3.5) ** 2) * np.exp(-((x - cx) / (w * 0.32)) ** 2) * 0.8
    m = np.clip(core + streak, 0, 1)
    spr = np.dstack([m * 255 * 0.75, m * 255 * 0.9, m * 255]).astype(np.uint8)  # warm
    _sprites['flare'] = spr
    return spr

def add_sprite(frame, spr, cx, cy, gain=1.0):
    h, w = spr.shape[:2]
    H, W = frame.shape[:2]
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    xa, ya, xb, yb = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
    if xa >= xb or ya >= yb: return frame
    s = spr[ya - y0:yb - y0, xa - x0:xb - x0]
    if gain != 1.0: s = cv2.convertScaleAbs(s, alpha=gain)
    frame[ya:yb, xa:xb] = cv2.add(frame[ya:yb, xa:xb], s)
    return frame

def flare(frame, p, y_rel=0.32, gain=1.0):
    """anamorphic flare sweeping across the frame; p 0..1"""
    H, W = frame.shape[:2]
    spr = flare_sprite(int(W * 1.1))
    cx = -0.2 * W + p * 1.4 * W
    g = gain * math.sin(math.pi * min(max(p, 0), 1))
    add_sprite(frame, spr, cx, H * y_rel, g)
    # ghosts on the opposite side
    for k, (s, a) in enumerate([(0.18, 0.25), (0.1, 0.35), (0.3, 0.15)]):
        gx = W - cx * (0.6 + 0.25 * k)
        gy = H * y_rel + (H * 0.5 - H * y_rel) * (0.8 + 0.5 * k)
        r = int(W * s * 0.25)
        lay = np.zeros((r * 2 + 2, r * 2 + 2, 3), np.uint8)
        cv2.circle(lay, (r + 1, r + 1), r, (int(90 * a * g * 2), int(160 * a * g * 2), int(200 * a * g * 2)), -1, cv2.LINE_AA)
        lay = cv2.GaussianBlur(lay, (0, 0), r / 5 + 1)
        add_sprite(frame, lay, gx, gy, 1.0)
    return frame

_rays = {}
def rays(frame, t, intensity=0.5):
    H, W = frame.shape[:2]
    key = (W, H)
    if key not in _rays:
        sw, sh = W // 4, H // 4
        y, x = np.mgrid[0:sh, 0:sw].astype(np.float32)
        ox, oy = sw * 0.62, -sh * 0.15
        ang = np.arctan2(y - oy, x - ox)
        dist = np.sqrt((x - ox) ** 2 + (y - oy) ** 2) / max(sw, sh)
        r = np.random.RandomState(4)
        pat = np.zeros_like(ang)
        for k in range(14):
            a0 = r.uniform(0.3, 2.8); wdt = r.uniform(0.01, 0.05)
            pat += np.exp(-((ang - a0) / wdt) ** 2) * r.uniform(0.3, 1)
        m = np.clip(pat, 0, 1) * np.exp(-dist * 1.6)
        _rays[key] = (m, ang)
    m, _ = _rays[key]
    g = intensity * (0.75 + 0.25 * math.sin(t * 1.3))
    lay = np.dstack([m * 150 * g, m * 215 * g, m * 255 * g]).astype(np.uint8)
    lay = cv2.resize(cv2.GaussianBlur(lay, (0, 0), 2), (W, H))
    return cv2.add(frame, lay)

def light_leak(frame, t, intensity=0.4, seed=0):
    H, W = frame.shape[:2]
    sw, sh = W // 8, H // 8
    lay = np.zeros((sh, sw, 3), np.float32)
    r = np.random.RandomState(seed)
    for k in range(3):
        cx = (r.rand() + 0.12 * math.sin(t * 0.4 + k * 2)) * sw
        cy = (r.rand() + 0.1 * math.cos(t * 0.3 + k)) * sh
        rad = (0.35 + 0.25 * r.rand()) * max(sw, sh)
        y, x = np.mgrid[0:sh, 0:sw].astype(np.float32)
        b = np.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / rad ** 2) * 3)
        col = np.array([60, 150, 255]) if k != 1 else np.array([255, 180, 90])
        lay += b[..., None] * col
    lay = np.clip(lay * intensity, 0, 255).astype(np.uint8)
    return cv2.add(frame, cv2.resize(lay, (W, H)))

def flash(frame, a, color=(170, 225, 255)):
    if a <= 0.005: return frame
    a = min(a, 1.0)
    c = np.full_like(frame, color, dtype=np.uint8)
    return cv2.addWeighted(frame, 1 - a * 0.85, c, a, 0)

def light_wipe(frame, p, angle=0.35):
    """a golden band of light sweeping diagonally; p 0..1"""
    H, W = frame.shape[:2]
    sw, sh = W // 4, H // 4
    y, x = np.mgrid[0:sh, 0:sw].astype(np.float32)
    proj = (x / sw) * math.cos(angle) + (y / sh) * math.sin(angle)
    pos = -0.4 + p * (1.8)
    band = np.exp(-((proj - pos) / 0.09) ** 2) + 0.5 * np.exp(-((proj - pos) / 0.25) ** 2)
    lay = np.dstack([band * 105, band * 150, band * 175]).clip(0, 255).astype(np.uint8)
    return cv2.add(frame, cv2.resize(lay, (W, H)))

# ----------------------------------------------------------------------------------------------
# Text
# ----------------------------------------------------------------------------------------------
_text_cache = {}
def render_text(txt, font='frank-ruhl-libre-900', size=150, style='gold', max_w=None, glow=True):
    key = (txt, font, size, style, max_w)
    if key in _text_cache: return _text_cache[key]
    F = ImageFont.truetype(os.path.join(FONTS, font + '.ttf'), size)
    bbox = F.getbbox(txt, direction='rtl', language='he')
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = int(size * 0.6)
    W, H = tw + pad * 2, th + pad * 2
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).text((pad - bbox[0], pad - bbox[1]), txt, font=F, fill=255, direction='rtl', language='he')
    m = np.asarray(mask).astype(np.float32) / 255
    yy = np.linspace(0, 1, H)[:, None]
    if style == 'gold':
        top = np.array([205, 245, 255]); mid = np.array([95, 195, 245]); bot = np.array([40, 120, 200])
        t0 = (pad) / H; t1 = (pad + th) / H
        rel = np.clip((yy - t0) / max(t1 - t0, 1e-3), 0, 1)
        col = np.where(rel[..., None] < 0.5, top + (mid - top) * (rel[..., None] * 2), mid + (bot - mid) * ((rel[..., None] - 0.5) * 2))
        col = np.broadcast_to(col, (H, W, 3))
    else:  # cream
        col = np.broadcast_to(np.array([225, 245, 255]), (H, W, 3))
    # thin bevel highlight
    edge = np.asarray(mask.filter(ImageFilter.GaussianBlur(size * 0.02))).astype(np.float32) / 255
    shade = np.clip(m - np.roll(edge, int(size * 0.025), axis=0), 0, 1)
    col = np.clip(col + shade[..., None] * 60, 0, 255)
    rgba = np.zeros((H, W, 4), np.float32)
    rgba[..., :3] = col
    rgba[..., 3] = m
    # glow + shadow layers (as separate additive / multiplicative maps)
    gl = np.asarray(mask.filter(ImageFilter.GaussianBlur(size * 0.16))).astype(np.float32) / 255 if glow else None
    sh = np.asarray(mask.filter(ImageFilter.GaussianBlur(size * 0.08))).astype(np.float32) / 255
    _text_cache[key] = (rgba, gl, sh)
    return _text_cache[key]

def draw_text(frame, txt, cx, cy, alpha=1.0, scale=1.0, shimmer=None, blur=0.0, **kw):
    if alpha <= 0.01: return frame
    rgba, gl, sh = render_text(txt, **kw)
    if scale != 1.0:
        rgba = cv2.resize(rgba, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        gl = cv2.resize(gl, None, fx=scale, fy=scale) if gl is not None else None
        sh = cv2.resize(sh, None, fx=scale, fy=scale)
    if blur > 0.3:
        rgba = cv2.GaussianBlur(rgba, (0, 0), blur)
    H, W = frame.shape[:2]
    h, w = rgba.shape[:2]
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    xa, ya, xb, yb = max(0, x0), max(0, y0), min(W, x0 + w), min(H, y0 + h)
    if xa >= xb or ya >= yb: return frame
    sl = (slice(ya - y0, yb - y0), slice(xa - x0, xb - x0))
    reg = frame[ya:yb, xa:xb].astype(np.float32)
    # shadow
    reg *= (1 - sh[sl][..., None] * 0.55 * alpha)
    # glow
    if gl is not None:
        reg += gl[sl][..., None] * np.array([40, 120, 220]) * 0.9 * alpha
    col = rgba[sl][..., :3].copy()
    if shimmer is not None:  # bright band moving across the letters
        xs = np.linspace(0, 1, w)[sl[1]][None, :]
        ys = np.linspace(0, 1, h)[sl[0]][:, None]
        band = np.exp(-(((xs + ys * 0.3) - (shimmer * 1.6 - 0.3)) / 0.06) ** 2)
        col = np.clip(col + band[..., None] * 160, 0, 255)
    a = rgba[sl][..., 3:4] * alpha
    reg = reg * (1 - a) + col * a
    frame[ya:yb, xa:xb] = np.clip(reg, 0, 255).astype(np.uint8)
    return frame

def draw_rule(frame, cx, cy, half_w, p, alpha=1.0):
    """gold ornament line that grows from the centre with a diamond in the middle."""
    if alpha <= 0.01 or p <= 0: return frame
    L = int(half_w * ease_out(p))
    lay = np.zeros_like(frame)
    cv2.line(lay, (int(cx - L), int(cy)), (int(cx + L), int(cy)), GOLD, 2, cv2.LINE_AA)
    d = 9
    pts = np.array([[cx, cy - d], [cx + d, cy], [cx, cy + d], [cx - d, cy]], np.int32)
    cv2.fillPoly(lay, [pts], (150, 225, 255), cv2.LINE_AA)
    glow = cv2.GaussianBlur(lay, (0, 0), 6)
    lay = cv2.add(lay, glow)
    return cv2.addWeighted(frame, 1, lay, alpha, 0)

# ----------------------------------------------------------------------------------------------
# Rotate-the-phone animation
# ----------------------------------------------------------------------------------------------
def phone_sprite(w=300, h=560):
    if ('phone', w, h) in _sprites: return _sprites[('phone', w, h)]
    S = 4
    img = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = 46 * S
    d.rounded_rectangle([6 * S, 6 * S, (w - 6) * S, (h - 6) * S], r, outline=(255, 214, 120, 255), width=10 * S, fill=(18, 22, 60, 235))
    # screen
    d.rounded_rectangle([26 * S, 40 * S, (w - 26) * S, (h - 40) * S], 22 * S, fill=(30, 40, 95, 255))
    # notch / speaker
    d.rounded_rectangle([(w / 2 - 40) * S, 18 * S, (w / 2 + 40) * S, 26 * S], 4 * S, fill=(255, 214, 120, 255))
    img = img.resize((w, h), Image.LANCZOS)
    arr = np.asarray(img).astype(np.float32)
    # little 9-branch menorah glyph on the screen in gold (correct: 8 + shamash)
    scr = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    ds = ImageDraw.Draw(scr)
    cx, base = w / 2 * S, h * 0.62 * S
    for i in range(9):
        x = cx + (i - 4) * 22 * S
        top = base - (95 if i == 4 else 75) * S
        ds.line([(x, base), (x, top)], fill=(255, 214, 120, 255), width=5 * S)
        ds.ellipse([x - 6 * S, top - 22 * S, x + 6 * S, top - 4 * S], fill=(255, 236, 170, 255))
    ds.line([(cx - 88 * S, base), (cx + 88 * S, base)], fill=(255, 214, 120, 255), width=6 * S)
    ds.line([(cx, base), (cx, base + 60 * S)], fill=(255, 214, 120, 255), width=6 * S)
    ds.line([(cx - 40 * S, base + 60 * S), (cx + 40 * S, base + 60 * S)], fill=(255, 214, 120, 255), width=6 * S)
    scr = np.asarray(scr.resize((w, h), Image.LANCZOS)).astype(np.float32)
    a = scr[..., 3:4] / 255
    arr[..., :3] = arr[..., :3] * (1 - a) + scr[..., :3] * a
    arr[..., 3] = np.maximum(arr[..., 3], scr[..., 3])
    bgra = arr[..., [2, 1, 0, 3]]
    _sprites[('phone', w, h)] = bgra
    return bgra

def draw_phone(frame, cx, cy, angle_deg, tilt, scale=1.0, alpha=1.0):
    spr = phone_sprite()
    h, w = spr.shape[:2]
    # 3D: rotate around z (screen rotation) and tilt around y for depth, perspective project
    a = math.radians(angle_deg); b = math.radians(tilt)
    pts = np.array([[-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0]], np.float32) * scale
    Rz = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
    Ry = np.array([[math.cos(b), 0, math.sin(b)], [0, 1, 0], [-math.sin(b), 0, math.cos(b)]])
    P = pts @ Rz.T @ Ry.T
    f = 1400.0
    proj = np.stack([cx + P[:, 0] * f / (f + P[:, 2]), cy + P[:, 1] * f / (f + P[:, 2])], 1).astype(np.float32)
    src = np.array([[0, 0], [w, 0], [w, h], [0, h]], np.float32)
    M = cv2.getPerspectiveTransform(src, proj)
    H, W = frame.shape[:2]
    warped = cv2.warpPerspective(spr, M, (W, H), flags=cv2.INTER_LINEAR)
    al = warped[..., 3:4] / 255 * alpha
    out = frame.astype(np.float32) * (1 - al) + warped[..., :3] * al
    return np.clip(out, 0, 255).astype(np.uint8), proj

def draw_arc_arrow(frame, cx, cy, r, a0, a1, alpha=1.0, thick=8):
    lay = np.zeros_like(frame)
    cv2.ellipse(lay, (int(cx), int(cy)), (int(r), int(r)), 0, a0, a1, GOLD, thick, cv2.LINE_AA)
    ang = math.radians(a1)
    tip = (cx + r * math.cos(ang), cy + r * math.sin(ang))
    tan = (-math.sin(ang), math.cos(ang))
    nrm = (math.cos(ang), math.sin(ang))
    s = 34
    p1 = (tip[0] + tan[0] * s, tip[1] + tan[1] * s)
    p2 = (tip[0] - tan[0] * s * 0.2 + nrm[0] * s * 0.8, tip[1] - tan[1] * s * 0.2 + nrm[1] * s * 0.8)
    p3 = (tip[0] - tan[0] * s * 0.2 - nrm[0] * s * 0.8, tip[1] - tan[1] * s * 0.2 - nrm[1] * s * 0.8)
    cv2.fillPoly(lay, [np.array([p1, p2, p3], np.int32)], GOLD, cv2.LINE_AA)
    lay = cv2.add(lay, cv2.GaussianBlur(lay, (0, 0), 8))
    return cv2.addWeighted(frame, 1, lay, alpha, 0)

# ----------------------------------------------------------------------------------------------
# Audio
# ----------------------------------------------------------------------------------------------
_audio = {}
AUDIO_FILTER = {}   # per-source ffmpeg audio filter (noise reduction etc.)
def load_audio(name):
    if name not in _audio:
        af = AUDIO_FILTER.get(name, AUDIO_FILTER.get('*'))
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src_path(name), '-vn'] + (['-af', af] if af else []) +
                             ['-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
        _audio[name] = np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
    return _audio[name]

def seg(name, s0, dur):
    a = load_audio(name)
    i0 = int(round(s0 * SR)); n = int(round(dur * SR))
    out = np.zeros((n, 2), np.float32)
    if i0 < 0:
        off = -i0; i0 = 0
    else:
        off = 0
    chunk = a[i0:i0 + n - off]
    out[off:off + len(chunk)] = chunk
    return out

R = np.random.RandomState(7)
def _env(n, a, d, shape=2.0):
    e = np.ones(n, np.float32)
    na, nd = int(a * SR), int(d * SR)
    if na: e[:na] = np.linspace(0, 1, na) ** shape
    if nd: e[-nd:] *= np.linspace(1, 0, nd) ** shape
    return e

def reverb_ir(dur=1.6, damp=3.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ir = R.randn(n, 2).astype(np.float32) * np.exp(-t * damp)[:, None]
    b, a = signal.butter(1, 6000 / (SR / 2), 'low')
    ir = signal.lfilter(b, a, ir, axis=0)
    ir /= np.sqrt((ir ** 2).sum(0)).max()
    return ir.astype(np.float32)
IR = reverb_ir()

def add_reverb(x, wet=0.35):
    y = np.stack([signal.fftconvolve(x[:, c], IR[:, c])[:len(x)] for c in range(2)], 1)
    return (x * (1 - wet) + y * wet).astype(np.float32)

def sfx_whoosh(dur=0.7, f0=300, f1=4000, pan=True, gain=0.5):
    n = int(dur * SR)
    noise = R.randn(n).astype(np.float32)
    # time-varying band-pass via STFT
    f, t, Z = signal.stft(noise, SR, nperseg=1024)
    tt = t / dur
    centre = f0 * (f1 / f0) ** np.clip(np.clip(np.sin(np.pi * np.clip(tt, 0, 1)), 0, 1) ** 0.7 * 0.5 + tt * 0.5, 0, 1)
    shape = np.exp(-((np.log(f[:, None] + 1) - np.log(centre[None, :])) / 0.55) ** 2)
    _, y = signal.istft(Z * shape, SR, nperseg=1024)
    y = y[:n]
    if len(y) < n: y = np.pad(y, (0, n - len(y)))
    env = np.sin(np.pi * np.linspace(0, 1, n)) ** 2.2
    y = y / (np.abs(y).max() + 1e-6) * env * gain
    if pan:
        p = np.linspace(-0.8, 0.8, n)
        return np.stack([y * np.sqrt((1 - p) / 2), y * np.sqrt((1 + p) / 2)], 1).astype(np.float32) * 1.4
    return np.stack([y, y], 1).astype(np.float32)

def sfx_shimmer(dur=2.2, gain=0.22, base=1046.5):
    n = int(dur * SR); t = np.arange(n) / SR
    y = np.zeros(n, np.float32)
    for k, m in enumerate([1, 1.25, 1.5, 2, 2.5, 3, 4]):
        f = base * m * (1 + R.uniform(-0.003, 0.003))
        st = R.uniform(0, 0.35)
        e = np.where(t > st, np.exp(-(t - st) * R.uniform(1.6, 3.0)), 0)
        y += np.sin(2 * np.pi * f * t + R.rand() * 6) * e * (1.0 / (1 + k * 0.4)) * (0.6 + 0.4 * np.sin(2 * np.pi * R.uniform(5, 9) * t))
    y = y / np.abs(y).max() * gain
    st = np.stack([y, np.roll(y, 300)], 1)
    return add_reverb(st, 0.5)

def sfx_sparkle(dur=1.0, gain=0.18, count=14):
    n = int(dur * SR); out = np.zeros((n, 2), np.float32)
    for _ in range(count):
        st = int(R.uniform(0, dur * 0.8) * SR); f = R.uniform(2500, 6500); L = int(0.12 * SR)
        tt = np.arange(L) / SR
        p = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 40) * R.uniform(0.4, 1)
        pan = R.uniform(-1, 1)
        e = min(n, st + L) - st
        out[st:st + e, 0] += p[:e] * np.sqrt((1 - pan) / 2)
        out[st:st + e, 1] += p[:e] * np.sqrt((1 + pan) / 2)
    out = out / (np.abs(out).max() + 1e-6) * gain
    return add_reverb(out, 0.45)

def sfx_rise(dur=2.0, gain=0.3):
    n = int(dur * SR); t = np.arange(n) / SR
    p = t / dur
    noise = R.randn(n).astype(np.float32)
    b, a = signal.butter(2, [400 / (SR / 2), 9000 / (SR / 2)], 'band')
    noise = signal.lfilter(b, a, noise)
    f = 180 * (8 ** p)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5 + np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR) * 0.3
    y = (noise * 0.25 + tone * 0.4) * p ** 2.2
    y = y / (np.abs(y).max() + 1e-6) * gain
    return add_reverb(np.stack([y, y], 1).astype(np.float32), 0.3)

def sfx_impact(gain=0.55, dur=1.8):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 62 * np.exp(-t * 2.5) + 34
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
    noise = R.randn(n) * np.exp(-t * 18)
    b, a = signal.butter(2, 1800 / (SR / 2), 'low')
    noise = signal.lfilter(b, a, noise)
    y = sub * 0.9 + noise * 0.35
    y = y / np.abs(y).max() * gain
    return add_reverb(np.stack([y, y], 1).astype(np.float32), 0.25)

def lowpass(x, hz):
    b, a = signal.butter(2, hz / (SR / 2), 'low')
    return signal.lfilter(b, a, x, axis=0).astype(np.float32)

# ----------------------------------------------------------------------------------------------
# Render
# ----------------------------------------------------------------------------------------------
class Version:
    def __init__(self, name, canvas, clips, overlays, sfx, beds, duration, out, audio_auto=None):
        self.name, self.canvas, self.clips, self.overlays = name, canvas, clips, overlays
        self.sfx, self.beds, self.duration, self.out = sfx, beds, duration, out
        self.audio_auto = audio_auto or []

def render_audio(v, path):
    n = int(math.ceil(v.duration * SR)) + SR
    mix = np.zeros((n, 2), np.float32)
    music = np.zeros((n, 2), np.float32)
    for b in v.beds:  # dict(src, s0, T0, T1, gain, fade_in, fade_out)
        dur = b['T1'] - b['T0'] + b.get('fade_out', 0.25)
        pre = b.get('fade_in', 0.25)
        x = seg(b['src'], b['s0'] - pre, dur + pre) * b.get('gain', 1.0)
        if b.get('lp'): x = lowpass(x, b['lp'])
        if b.get('reverb'): x = add_reverb(x, b['reverb'])
        e = np.ones(len(x), np.float32)
        ni, no = int(pre * 2 * SR), int(b.get('fade_out', 0.25) * 2 * SR)
        ni = min(ni, len(x)); no = min(no, len(x))
        if ni: e[:ni] = np.sin(np.linspace(0, np.pi / 2, ni))
        if no: e[-no:] *= np.cos(np.linspace(0, np.pi / 2, no))
        x *= e[:, None]
        i0 = int(round((b['T0'] - pre) * SR))
        a, z = max(0, i0), min(n, i0 + len(x))
        music[a:z] += x[a - i0:z - i0]
    # automation on the music (ducks, low-pass "dreamy" sections, stops)
    gain_curve = np.ones(n, np.float32)
    for au in v.audio_auto:
        t0, t1, g = au['t0'], au['t1'], 10 ** (au.get('db', 0) / 20)
        ramp = au.get('ramp', 0.15)
        i0, i1, r = max(0, int(t0 * SR)), int(t1 * SR), int(ramp * SR)
        seg_curve = np.full(max(1, i1 - i0), g, np.float32)
        if r:
            rr = min(r, len(seg_curve) // 2)
            seg_curve[:rr] = np.linspace(1, g, rr); seg_curve[-rr:] = np.linspace(g, 1, rr)
        gain_curve[i0:i0 + len(seg_curve)] *= seg_curve[:max(0, min(len(seg_curve), n - i0))]
        if au.get('lp'):
            a0, a1 = max(0, i0 - r), min(n, i1 + r)
            filt = lowpass(music[a0:a1], au['lp'])
            if au.get('reverb'): filt = add_reverb(filt, au['reverb'])
            w = np.ones(a1 - a0, np.float32)
            if r: w[:r] = np.linspace(0, 1, r); w[-r:] = np.linspace(1, 0, r)
            music[a0:a1] = music[a0:a1] * (1 - w[:, None]) + filt * w[:, None]
    music *= gain_curve[:, None]
    mix += music
    for s in v.sfx:  # (kind, t, params)
        kind, t, kw = s[0], s[1], (s[2] if len(s) > 2 else {})
        x = {'whoosh': sfx_whoosh, 'shimmer': sfx_shimmer, 'sparkle': sfx_sparkle, 'rise': sfx_rise, 'impact': sfx_impact}[kind](**kw)
        if kind == 'whoosh': t -= len(x) / SR / 2
        if kind == 'rise': t -= len(x) / SR
        i0 = int(round(t * SR))
        a, z = max(0, i0), min(n, i0 + len(x))
        if z > a: mix[a:z] += x[a - i0:z - i0]
    mix = np.nan_to_num(mix[:int(round(v.duration * SR))])
    # fade edges, normalise, soft limit
    f = int(0.02 * SR); mix[:f] *= np.linspace(0, 1, f)[:, None]
    fo = int(0.6 * SR); mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
    rms = np.sqrt(np.mean(mix ** 2) + 1e-9)
    mix *= 0.115 / rms
    mix = np.tanh(mix * 1.1) / np.tanh(1.1) * 0.88
    import wave
    pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

def transition_blend(kind, A, B, p, cw, ch):
    """A = outgoing canvas frame, B = incoming, p 0..1"""
    if kind == 'dissolve':
        return cv2.addWeighted(A, 1 - ease(p), B, ease(p), 0)
    if kind == 'flash':
        base = A if p < 0.5 else B
        return flash(base.copy(), 0.8 * math.sin(math.pi * p) ** 1.5)
    if kind == 'whip':
        e = ease(p)
        shift = int(e * cw)
        k = int(1 + 140 * math.sin(math.pi * p))
        M1 = np.float32([[1, 0, -shift], [0, 1, 0]])
        M2 = np.float32([[1, 0, cw - shift], [0, 1, 0]])
        a = cv2.warpAffine(A, M1, (cw, ch), borderMode=cv2.BORDER_REFLECT)
        b = cv2.warpAffine(B, M2, (cw, ch), borderMode=cv2.BORDER_REFLECT)
        out = a if p < 0.5 else b
        if k > 2:
            small = cv2.resize(out, (cw // 2, ch // 2))
            small = cv2.blur(small, (max(1, k // 2), 1))
            out = cv2.resize(small, (cw, ch))
        return out
    if kind == 'zoom':
        if p < 0.5:
            z = 1 + ease_in(p * 2) * 0.7; img = A
        else:
            z = 1 + (1 - ease_out((p - 0.5) * 2)) * 0.45; img = B
        frm = zoom_frame(img, z, 0.5, 0.5)
        # radial-ish blur: blend a few progressively zoomed copies
        amt = math.sin(math.pi * p)
        if amt > 0.05:
            acc = frm.astype(np.float32)
            for i in range(1, 4):
                acc += zoom_frame(frm, 1 + 0.025 * i * amt, 0.5, 0.5).astype(np.float32)
            frm = (acc / 4).astype(np.uint8)
        return flash(frm, amt ** 3 * 0.6)
    if kind == 'morph':  # full-screen portrait shrinks into the landscape window, then dissolves
        e = ease(min(p / 0.75, 1))
        x, y, ww, wh = window_rect(cw, ch, 16, 9)
        s = 1 - (1 - wh / ch) * e
        cy = ch / 2 + ((y + wh / 2) - ch / 2) * e
        M = np.float32([[s, 0, cw / 2 - s * cw / 2], [0, s, cy - s * ch / 2]])
        small = cv2.warpAffine(A, M, (cw, ch), borderValue=(0, 0, 0))
        mask = cv2.warpAffine(np.full((ch, cw), 255, np.uint8), M, (cw, ch)).astype(np.float32)[..., None] / 255
        out = B.astype(np.float32) * (1 - mask) + small.astype(np.float32) * mask
        out = np.clip(out, 0, 255).astype(np.uint8)
        if p > 0.6:
            q = (p - 0.6) / 0.4
            out = cv2.addWeighted(out, 1 - ease(q), B, ease(q), 0)
        return light_wipe(out, p) if p < 0.9 else out
    if kind == 'lightwipe':
        base = A if p < 0.5 else B
        return light_wipe(base.copy(), p)
    if kind == 'gold':  # dip through warm gold light
        base = A if p < 0.5 else B
        return flash(base.copy(), 0.62 * math.sin(math.pi * p) ** 1.2, color=(110, 200, 255))
    return B if p >= 0.5 else A

def render_clip_canvas(clip, reader, t, cw, ch, grader):
    t_rel = t - clip.t0
    s = clip.src_time(t_rel)
    pic = reader.get(s)
    if pic is None:
        pic = np.zeros((clip.pic[1], clip.pic[0], 3), np.uint8)
    dur = max(clip.t1 - clip.t0, 1e-3)
    p = min(max(t_rel / dur, 0), 1)
    z = clip.zoom[0] + (clip.zoom[1] - clip.zoom[0]) * ease(p)
    c = clip.center
    if clip.center_end:
        c = (c[0] + (clip.center_end[0] - c[0]) * ease(p), c[1] + (clip.center_end[1] - c[1]) * ease(p))
    pic = zoom_frame(pic, z, c[0], c[1])
    pic = grader(pic)
    pic = sharpen(pic, 0.3)
    pic = bloom(pic, clip.grade.get('bloom', 0.26))
    if clip.blur_bg:
        pic = cv2.GaussianBlur(pic, (0, 0), 7)
    if clip.dim:
        d0, d1, amt = clip.dim
        k = ease((t_rel - d0) / max(d1 - d0, 1e-3)) if t_rel < d1 else 1.0
        k = k if t_rel >= d0 else 0.0
        pic = cv2.convertScaleAbs(pic, alpha=1 - amt * k)
    if clip.layout == 'window':
        return layout_window(pic, cw, ch, t)
    if pic.shape[1] != cw or pic.shape[0] != ch:
        pic = cv2.resize(pic, (cw, ch))
    return pic

def render(v, preview=False, stills=None, stills_dir=None, frame_range=None, video_only_out=None):
    cw, ch = v.canvas
    os.makedirs(os.path.dirname(v.out), exist_ok=True)
    wav = v.out[:-4] + '.wav'
    if not stills and not video_only_out:
        render_audio(v, wav)
    nframes = int(round(v.duration * FPS))
    frames_to_do = range(nframes)
    if stills:
        frames_to_do = sorted(int(round(s * FPS)) for s in stills)
    if frame_range:
        frames_to_do = range(frame_range[0], min(frame_range[1], nframes))
    enc = None
    if video_only_out:
        enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{cw}x{ch}', '-r', str(FPS),
                                '-i', '-', '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
                                '-profile:v', 'high', '-level', '4.2', '-g', '60', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                                '-colorspace', 'bt709', video_only_out], stdin=subprocess.PIPE)
    elif not stills:
        ow, oh = (cw // 2, ch // 2) if preview else (cw, ch)
        enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{cw}x{ch}', '-r', str(FPS),
                                '-i', '-', '-i', wav, '-vf', f'scale={ow}:{oh}:flags=lanczos,format=yuv420p',
                                '-c:v', 'libx264', '-preset', 'veryfast' if preview else 'slow', '-crf', '23' if preview else '17',
                                '-profile:v', 'high', '-level', '4.2', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
                                '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.79:level=false:attack=2:release=60', '-c:a', 'aac', '-b:a', '192k', '-ar', str(SR), '-movflags', '+faststart', '-shortest', v.out],
                               stdin=subprocess.PIPE)
    readers = {}
    graders = {}
    parts = {}
    # transition durations stored on clips
    clips = v.clips
    for i, c in enumerate(clips):
        if i + 1 < len(clips):
            c.trans_out = clips[i + 1].trans_in
    for fi in frames_to_do:
        t = fi / FPS
        active = []
        for i, c in enumerate(clips):
            pre = c.trans_in[1] / 2
            post = c.trans_out[1] / 2
            if c.t0 - pre <= t < c.t1 + post:
                active.append(i)
        imgs = []
        for i in active:
            c = clips[i]
            if i not in readers:
                readers[i] = Reader(c, pre=max(c.trans_in[1], c.trans_out[1]) / 2 + 0.1, t_from=t)
                graders[i] = Grader(**c.grade.get('grader', {}))
            imgs.append(render_clip_canvas(c, readers[i], t, cw, ch, graders[i]))
        if len(imgs) == 0:
            frame = np.zeros((ch, cw, 3), np.uint8)
        elif len(imgs) == 1:
            frame = imgs[0]
        else:
            a_i, b_i = active[0], active[-1]
            cb = clips[b_i]
            kind, d = cb.trans_in
            p = (t - (cb.t0 - d / 2)) / d
            if kind == 'rotate_window':
                frame = rotate_to_window(imgs[0], imgs[-1], p, cw, ch, clips[b_i])
            else:
                frame = transition_blend(kind, imgs[0], imgs[-1], p, cw, ch)
        frame = np.ascontiguousarray(frame)
        for ov in v.overlays:
            if ov['t0'] <= t < ov['t1']:
                frame = ov['fn'](frame, t, ov)
        frame = vignette(frame, 0.34)
        # close finished readers
        for i in list(readers):
            c = clips[i]
            if t > c.t1 + c.trans_out[1] / 2 + 0.05:
                readers[i].close(); del readers[i]
        if stills:
            cv2.imwrite(os.path.join(stills_dir, f'{v.name}_{t:06.2f}.jpg'), frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
            for i in list(readers):
                readers[i].close(); del readers[i]
            continue
        enc.stdin.write(frame.tobytes())
        if fi % 300 == 0:
            print(f'  [{v.name}] {t:6.1f}s / {v.duration:.1f}s', flush=True)
    for r in readers.values(): r.close()
    if enc:
        enc.stdin.close(); enc.wait()
        print(f'  [{v.name}] done -> {v.out}')

def rotate_to_window(A, B, p, cw, ch, clipB):
    """story version: the portrait picture shrinks and turns 90 degrees into the landscape window."""
    e = ease(min(p / 0.8, 1))
    # B already laid out as window canvas
    x, y, ww, wh = window_rect(cw, ch, 1920, 1080)
    cx_t, cy_t = x + ww / 2, y + wh / 2
    s = 1 + (ww / ch - 1) * e        # portrait height (ch) maps to window width when rotated
    ang = 90 * e
    cx = cw / 2 + (cx_t - cw / 2) * e
    cy = ch / 2 + (cy_t - ch / 2) * e
    M = cv2.getRotationMatrix2D((cw / 2, ch / 2), ang, s)
    M[0, 2] += cx - cw / 2; M[1, 2] += cy - ch / 2
    bg = cv2.addWeighted(cv2.convertScaleAbs(A, alpha=0.25 * (1 - e)), 1, cv2.convertScaleAbs(B, alpha=e), 1, 0)
    rotated = cv2.warpAffine(A, M, (cw, ch), borderValue=(0, 0, 0))
    mask = cv2.warpAffine(np.full((ch, cw), 255, np.uint8), M, (cw, ch))
    m = (mask.astype(np.float32) / 255)[..., None]
    out = bg.astype(np.float32) * (1 - m) + rotated.astype(np.float32) * m
    # gold outline of the turning frame
    corners = cv2.transform(np.array([[[0, 0], [cw, 0], [cw, ch], [0, ch]]], np.float32), M)[0]
    out = np.clip(out, 0, 255).astype(np.uint8)
    cv2.polylines(out, [corners.astype(np.int32)], True, GOLD, 3, cv2.LINE_AA)
    if p > 0.8:  # settle into the incoming window picture with a light flash
        q = (p - 0.8) / 0.2
        out = cv2.addWeighted(out, 1 - q, B, q, 0)
        out = flash(out, math.sin(math.pi * q) * 0.5)
    return out


def remux_audio(v):
    """re-render only the soundtrack and swap it into an already rendered video."""
    wav = v.out[:-4] + '.wav'
    render_audio(v, wav)
    tmp = v.out[:-4] + '.tmp.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', v.out, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.79:level=false:attack=2:release=60', '-c:a', 'aac', '-b:a', '192k', '-ar', str(SR), '-movflags', '+faststart', '-shortest', tmp], check=True)
    os.replace(tmp, v.out)
    print(f'  [{v.name}] audio remuxed')


def draw_menorah(frame, cx, cy, scale=1.0, alpha=1.0, t=0.0):
    """gold line-art hanukkiah: 8 branches + a taller shamash in the middle, flickering flames."""
    if alpha <= 0.01: return frame
    lay = np.zeros_like(frame)
    s = scale
    base = cy + 40 * s
    for i in range(9):
        x = cx + (i - 4) * 26 * s
        top = base - (88 if i == 4 else 66) * s
        cv2.line(lay, (int(x), int(base)), (int(x), int(top)), GOLD, max(2, int(4 * s)), cv2.LINE_AA)
        fl = 1 + 0.15 * math.sin(t * 9 + i * 1.7)
        cv2.ellipse(lay, (int(x), int(top - 11 * s * fl)), (max(2, int(5 * s)), max(3, int(10 * s * fl))), 0, 0, 360, (170, 235, 255), -1, cv2.LINE_AA)
    cv2.line(lay, (int(cx - 108 * s), int(base)), (int(cx + 108 * s), int(base)), GOLD, max(2, int(5 * s)), cv2.LINE_AA)
    cv2.line(lay, (int(cx), int(base)), (int(cx), int(base + 46 * s)), GOLD, max(2, int(5 * s)), cv2.LINE_AA)
    cv2.line(lay, (int(cx - 42 * s), int(base + 46 * s)), (int(cx + 42 * s), int(base + 46 * s)), GOLD, max(2, int(5 * s)), cv2.LINE_AA)
    lay = cv2.add(lay, cv2.GaussianBlur(lay, (0, 0), 7))
    return cv2.addWeighted(frame, 1, lay, alpha, 0)

def outside_window(frame, fx):
    """apply fx only to the designed background around the landscape window."""
    ch, cw = frame.shape[:2]
    x, y, ww, wh = window_rect(cw, ch, 16, 9)
    keep = frame[y:y + wh].copy()
    out = fx(frame)
    out[y:y + wh] = keep
    return out
