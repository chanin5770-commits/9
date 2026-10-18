#!/usr/bin/env python3
"""Builds the preview assets in public/ from the originals in source/.

1. Cuts the 20 frames out of the storyboard board (source/storyboard.png) and
   upscales each one (Lanczos + light sharpening). These are PREVIEW frames:
   every panel is only ~380x155 px, so they will look soft at 1080p. Replace
   them with full-resolution stills (same file name) for the final film.
2. Cuts the supplied Flow/Veo clips into the individual shots used by the
   film, slowed down with motion interpolation where a shot is too short.

Run from the project root:  python3 tools/prepare_assets.py
"""
import json, os, subprocess, sys
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'source')
PANELS = os.path.join(ROOT, 'public', 'panels')
CLIPS = os.path.join(ROOT, 'public', 'clips')

# storyboard boards: grid measured from the gold frame lines; frames are numbered
# row by row starting at `first`. `trim_bottom` cuts off the frame-number badge.
BOARDS = [
    dict(file='storyboard.png', first=0, trim_bottom=0,
         cols=[(13, 390), (399, 764), (772, 1136), (1146, 1524)],
         rows=[(64, 217), (251, 404), (436, 588), (621, 765), (798, 971)]),
    dict(file='storyboard-2-choice-moments.png', first=40, trim_bottom=26,
         cols=[(10, 381), (393, 763), (774, 1144), (1155, 1527)],
         rows=[(52, 201), (210, 355), (364, 508), (517, 666), (674, 813), (822, 997)]),
]
UPSCALE_W = 2880

# shot id -> (source clip, start s, end s, speed); speed < 1 = slow motion
CLIP_SHOTS = {
    'a-crossroads':  ('clip-a-road-to-jerusalem.mp4', 0.10, 2.90, 0.60),
    'a-profile':     ('clip-a-road-to-jerusalem.mp4', 3.10, 5.90, 0.60),
    'a-walk-turn':   ('clip-a-road-to-jerusalem.mp4', 6.10, 9.95, 0.75),
    'b-crossroads':  ('clip-b-crossroads-desk.mp4',  0.04, 0.96, 0.40),
    'b-window':      ('clip-b-crossroads-desk.mp4',  1.04, 1.96, 0.40),
    'b-coin':        ('clip-b-crossroads-desk.mp4',  2.04, 2.96, 0.40),
    'b-phone':       ('clip-b-crossroads-desk.mp4',  3.04, 4.08, 0.40),
    'b-crossroads2': ('clip-b-crossroads-desk.mp4',  4.17, 5.12, 0.40),
    'b-strain':      ('clip-b-crossroads-desk.mp4',  5.21, 6.05, 0.40),
    'b-write':       ('clip-b-crossroads-desk.mp4',  6.10, 7.04, 0.40),
    'b-walk':        ('clip-b-crossroads-desk.mp4',  7.13, 8.33, 0.45),
    'b-smile':       ('clip-b-crossroads-desk.mp4',  8.42, 9.98, 0.55),
    'c-phone-down':  ('clip-c-day-in-life.mp4',      2.92, 3.88, 0.45),
    'c-street-help': ('clip-c-day-in-life.mp4',      3.92, 5.18, 0.55),
    'c-desk':        ('clip-c-day-in-life.mp4',      5.22, 7.75, 0.80),
    'c-walk':        ('clip-c-day-in-life.mp4',      7.85, 9.98, 0.80),
    'd-bus':         ('clip-d-bus-path.mp4',         0.05, 1.95, 0.60),
    'd-beit-midrash': ('clip-d-bus-path.mp4',        2.05, 3.95, 0.60),
    'd-stone-path':  ('clip-d-bus-path.mp4',         4.05, 5.90, 0.60),
    'd-sunrise':     ('clip-d-bus-path.mp4',         6.00, 9.98, 0.85),
}


def panels():
    os.makedirs(PANELS, exist_ok=True)
    n = 0
    for b in BOARDS:
        board = Image.open(os.path.join(SRC, b['file'])).convert('RGB')
        for r, (y0, y1) in enumerate(b['rows']):
            for c, (x0, x1) in enumerate(b['cols']):
                crop = board.crop((x0, y0, x1, y1 - b['trim_bottom']))
                h = round(UPSCALE_W * crop.height / crop.width)
                big = crop.resize((UPSCALE_W, h), Image.LANCZOS)
                big = big.filter(ImageFilter.UnsharpMask(radius=3, percent=60, threshold=2))
                big.save(os.path.join(PANELS, f"{b['first'] + r * len(b['cols']) + c:02d}.jpg"), quality=92)
                n += 1
    print(f'panels: {n} frames ->', PANELS)


def clips():
    os.makedirs(CLIPS, exist_ok=True)
    meta = {}
    for sid, (name, s0, s1, speed) in CLIP_SHOTS.items():
        out = os.path.join(CLIPS, sid + '.mp4')
        dur = (s1 - s0) / speed
        if not os.path.exists(out) or '--force' in sys.argv:
            encode(name, s0, s1, speed, out)
            print('clip', sid, f'{dur:.2f}s')
        meta[sid] = frame_count(out)
    with open(os.path.join(ROOT, 'src', 'data', 'clip-frames.json'), 'w') as f:
        json.dump(meta, f, indent=2)


def frame_count(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries',
                        'stream=nb_read_frames', '-of', 'csv=p=0', path], check=True, capture_output=True, text=True)
    return int(r.stdout.strip())


def encode(name, s0, s1, speed, out):
    vf = f'trim={s0}:{s1},setpts=(PTS-STARTPTS)/{speed}'
    if speed < 0.95:
        vf += ',minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1'
    vf += ',fps=24,scale=1920:1080:flags=lanczos,unsharp=5:5:0.4,format=yuv420p'
    subprocess.run(['ffmpeg', '-y', '-nostdin', '-loglevel', 'error', '-i', os.path.join(SRC, name),
                    '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', out], check=True)


def grain():
    # tileable film-grain texture, shifted every frame by the film
    import numpy as np
    rng = np.random.default_rng(7)
    n = rng.normal(128, 38, (512, 512)).clip(0, 255).astype('uint8')
    os.makedirs(os.path.join(ROOT, 'public', 'fx'), exist_ok=True)
    Image.fromarray(n, 'L').save(os.path.join(ROOT, 'public', 'fx', 'grain.png'))


def narration():
    # the recorded narration (source/) is played from public/audio/narration.wav
    import shutil
    src = os.path.join(SRC, 'narration-v1.wav')
    if os.path.exists(src):
        os.makedirs(os.path.join(ROOT, 'public', 'audio'), exist_ok=True)
        shutil.copyfile(src, os.path.join(ROOT, 'public', 'audio', 'narration.wav'))


if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, 'src', 'data'), exist_ok=True)
    panels()
    grain()
    narration()
    clips()
