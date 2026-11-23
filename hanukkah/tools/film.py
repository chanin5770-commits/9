"""
Gan Malchut Hanukkah — THE PARTY FILM (vertical 9:16, the whole party).

* Every clip in the order it was filmed, at real speed, with its ORIGINAL sound (light noise
  reduction + level balancing between clips). Only blocked-lens / camera-reset moments are trimmed.
* Portrait clips fill the screen. Landscape clips are shown COMPLETE (16:9, nothing cropped) inside a
  designed frame: blurred deep-blue background, gold hairlines, slow light, particles that stay in the
  background, a menorah and the section title.
* Effects live at the openings and between sections (golden light sweep, sparkles, section titles),
  never on top of a performance.

Usage:
  python3 tools/film.py plan            # print the timeline
  python3 tools/film.py stills 10,60    # check frames (work/stills)
  python3 tools/film.py film            # render the full film (parallel chunks)
  python3 tools/film.py parts           # cut the full film into WhatsApp-status parts (<= 60s)
  python3 tools/film.py highlights      # render the ~1 minute highlights version
"""
import os, sys, math, subprocess, json
import numpy as np, cv2
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine as E
import edit as ED
from edit import Builder, text_ov, rule_ov, particles, burst, flash_ov, rays_ov, black_in, black_out, flare_ov, _fade
from engine import ease

OUT = os.path.join(E.ROOT, 'output')
CANVAS = (1080, 1920)
WPIC = (1080, 608)          # landscape picture size inside the window (full width of the story frame)

E.AUDIO_FILTER['*'] = 'highpass=f=50,afftdn=nr=10:nf=-42'
E.AUDIO_FILTER['20261123_165803'] = 'highpass=f=90,afftdn=nr=16:nf=-38,acompressor=threshold=-32dB:ratio=3:attack=10:release=200'

PORTRAIT = {'20261123_165803', '20261123_165911'}

# (section title, [(clip, start, end), ...]) in filming order
SECTIONS = [
    ('המופע מתחיל', [('20261123_165803', 0.0, 16.8), ('20261123_165911', 0.0, 7.55)]),
    ('אורות החנוכה', [('20261123_170036', 0.0, 38.0)]),
    ('תזמורת הדליים', [('20261123_170613', 0.0, 12.9), ('20261123_170651', 0.0, 25.4), ('20261123_170949', 0.0, 38.75),
                       ('20261123_171620', 0.0, 5.4)]),
    ('ריקוד במעגל', [('20261123_172300', 0.0, 108.4)]),
    ('ריקוד הסרטים', [('20261123_172542', 0.0, 21.4), ('20261123_172647', 0.0, 12.05)]),
    ('משחק המצנח', [('20261123_173020', 0.0, 68.8), ('20261123_173233', 0.0, 25.45), ('20261123_173453', 0.0, 19.4)]),
    ('רוקדות יחד', [('20261123_173639', 0.0, 71.25)]),
    ('ריקוד אמהות ובנות', [('20261123_174001', 0.0, 41.55), ('20261123_174046', 0.0, 5.1), ('20261123_174055', 0.0, 32.45),
                           ('20261123_174135', 0.0, 22.35)]),
]
STAB = {'20261123_170651', '20261123_170949', '20261123_171620', '20261123_172300', '20261123_172542', '20261123_172647', '20261123_174001'}

def auto_gain(src, a, b, target_db=-19.0):
    x = E.seg(src, a, b - a)
    rms = float(np.sqrt(np.mean(x ** 2)) + 1e-6)
    return float(np.clip(10 ** ((target_db - 20 * np.log10(rms)) / 20), 0.35, 6.0))

# ---------------------------------------------------------------- overlays for the designed frame
def frame_design(frame, t, ov):
    """background life + menorah + brand around the landscape window (never over the picture)."""
    a = _fade(t, ov, 0.8, 0.8)
    if a <= 0.01: return frame
    key = 'design'
    if key not in ED._PS: ED._PS[key] = E.Particles(frame.shape[1], frame.shape[0], n=90, seed=77)
    def fx(f):
        f = E.light_leak(f, t * 0.6, 0.22 * a, seed=3)
        f = ED._PS[key].render(f, t, 0.75 * a)
        return f
    frame = E.outside_window(frame, fx)
    H, W = frame.shape[:2]
    frame = E.draw_menorah(frame, W / 2, H * 0.105, 1.0, 0.95 * a, t)
    frame = E.draw_text(frame, 'מסיבת חנוכה · גן מלכות', W / 2, H * 0.19, alpha=0.9 * a, size=58,
                        font='frank-ruhl-libre-700', style='cream')
    frame = E.draw_rule(frame, W / 2, H * 0.735, W * 0.2, 1.0, 0.8 * a)
    frame = E.draw_text(frame, 'מאירים את העולם', W / 2, H * 0.775, alpha=0.75 * a, size=56,
                        font='frank-ruhl-libre-700', style='cream')
    return frame

def section_title(frame, t, ov):
    """section name above the window (landscape) or low on screen (portrait)."""
    return text_ov(frame, t, ov)

# ---------------------------------------------------------------- the film
def build_film(b):
    cw, ch = b.canvas
    # ----- opening (about 6.5s): title over the girls' lights, softly
    b.bed_start('20261123_165911', 0.3, gain=0.55, snap=False, fade=0.8)
    t0, t1 = b.shot(s=6.4, src='20261123_165911', at=0.3, speed=0.3, nosnap=True, blur_bg=True, dim=(0, 0.1, 0.5),
                    zoom=(1.08, 1.18), center=(0.5, 0.4))
    b.duck(0, t1 + 0.4, db=-4, lp=2400, reverb=0.3, ramp=0.6)
    b.add(black_in, 0, 0.9)
    b.add(particles, 0, t1 + 0.6, k=1.0, seed=2)
    b.add(rays_ov, 0, t1, k=0.5)
    b.add(lambda f, t, ov: E.draw_menorah(f, cw / 2, ch * 0.3, 1.5, _fade(t, ov, 1.0, 0.6), t), 0.6, t1 + 0.3)
    b.add(text_ov, 1.2, t1 + 0.3, txt='מסיבת חנוכה', y=0.43, size=110, font='frank-ruhl-libre-700', tin=1.0, fo=0.6)
    b.add(text_ov, 1.7, t1 + 0.3, txt='גן מלכות', y=0.515, size=230, tin=1.2, shimmer=1.2, fo=0.6, grow=0.01)
    b.add(rule_ov, 2.2, t1 + 0.3, y=0.59, w=0.26, grow=1.0)
    b.add(flare_ov, 1.9, 4.6, y=0.5, gain=0.8)
    b.fx('shimmer', 0.6, dur=3.5, gain=0.18)
    b.fx('impact', 1.7, gain=0.32)
    b.fx('sparkle', 2.0, dur=1.2, gain=0.1)

    # ----- the party, section by section
    items = []
    for si, (title, segs) in enumerate(SECTIONS):
        for k, (src, a, z) in enumerate(segs):
            items.append(dict(src=src, a=a, z=z, title=title if k == 0 else None, sec=si))
    # transition into each item
    for i, it in enumerate(items):
        prev = items[i - 1] if i else None
        if i == 0:
            it['trans'] = ('gold', 0.9)
        elif it['src'] not in PORTRAIT and prev['src'] in PORTRAIT:
            it['trans'] = ('morph', 1.3)
        elif it['title']:
            it['trans'] = ('lightwipe', 1.0)
        else:
            it['trans'] = ('dissolve', 0.6)
    win_start = None
    sec_marks = []
    for i, it in enumerate(items):
        d_in = it['trans'][1]
        d_out = items[i + 1]['trans'][1] if i + 1 < len(items) else 1.0
        at = it['a'] + d_in / 2
        dur = (it['z'] - it['a']) - d_in / 2 - d_out / 2
        g = auto_gain(it['src'], it['a'], it['z'])
        b.bed_start(it['src'], at, gain=g, snap=False, fade=d_in / 2)
        portrait = it['src'] in PORTRAIT
        kw = dict(stab=it['src'] in STAB)
        if not portrait:
            kw.update(window=True, pic=WPIC)
        c0, c1 = b.shot(s=dur, trans=it['trans'], **kw)
        if not portrait and win_start is None:
            win_start = c0 - d_in / 2
        if it['title']:
            sec_marks.append((c0, it['sec'], portrait))
            if i > 0:
                b.fx('shimmer', c0 - 0.3, dur=1.8, gain=0.1)
                b.fx('whoosh', c0, dur=0.9, f0=250, f1=3000, gain=0.12)
                b.add(burst, c0 - 0.2, c0 + 1.5, x=0.5, y=0.46 if not portrait else 0.5, seed=31 + i)
    film_end = b.t
    # section titles: portrait -> low on screen for a few seconds; landscape -> above the window until the next section
    for j, (c0, si, portrait) in enumerate(sec_marks):
        t_next = sec_marks[j + 1][0] - 0.5 if j + 1 < len(sec_marks) else film_end
        title = SECTIONS[si][0]
        if portrait:
            b.add(text_ov, c0 + 0.6, c0 + 4.8, txt=title, y=0.86, size=96, tin=0.8, shimmer=0.9, fo=0.7)
        else:
            b.add(text_ov, c0 + 0.1, t_next, txt=title, y=0.255, size=104, tin=0.9, shimmer=0.6, fo=0.5)
    b.add(frame_design, win_start, film_end + 6.0)

    # ----- end card
    b.bed_start('20261123_174135', 14.0, gain=auto_gain('20261123_174135', 14, 20) * 0.6, snap=False, fade=1.0)
    t0, t1 = b.shot(s=6.0, src='20261123_174135', at=16.0, speed=0.3, nosnap=True, blur_bg=True, dim=(0, 1.0, 0.45),
                    trans=('gold', 1.0), window=True, pic=WPIC)
    b.duck(t0 - 0.5, t1 + 0.5, db=-5, lp=2500, reverb=0.35, ramp=1.0)
    b.fx('shimmer', t0 + 0.2, dur=3.5, gain=0.2)
    b.fx('impact', t0 + 0.3, gain=0.3)
    b.add(particles, t0, t1 + 1, k=0.9, seed=61, fo=0.01)
    b.add(text_ov, t0 + 0.4, t1 + 1, txt='גן מלכות', y=0.43, size=200, tin=1.0, shimmer=0.9, fo=0.01, grow=0.01)
    b.add(rule_ov, t0 + 0.9, t1 + 1, y=0.485, w=0.24)
    b.add(text_ov, t0 + 1.2, t1 + 1, txt='מאירים את העולם!', y=0.53, size=104, font='frank-ruhl-libre-700', tin=0.9, shimmer=1.8, fo=0.01)
    b.add(flare_ov, t0 + 0.7, t0 + 3.2, y=0.43, gain=0.8)
    b.add(black_out, t1 - 0.9, t1 + 0.01)
    return film_end

# ---------------------------------------------------------------- highlights (~1 min)
HIGHLIGHTS = [('20261123_165803', 2.4, 7.6), ('20261123_165911', 0.0, 4.0), ('20261123_170036', 9.8, 13.6),
              ('20261123_170949', 18.9, 23.0), ('20261123_172300', 59.0, 63.6), ('20261123_172647', 0.0, 4.2),
              ('20261123_173020', 28.4, 35.0), ('20261123_173233', 4.0, 8.0), ('20261123_173639', 5.4, 9.4),
              ('20261123_174055', 0.0, 4.8), ('20261123_174135', 8.6, 12.6)]

def build_highlights(b):
    cw, ch = b.canvas
    b.bed_start('20261123_165911', 0.3, gain=0.55, snap=False, fade=0.6)
    t0, t1 = b.shot(s=3.8, src='20261123_165911', at=0.3, speed=0.3, nosnap=True, blur_bg=True, dim=(0, 0.1, 0.5),
                    zoom=(1.08, 1.16), center=(0.5, 0.4))
    b.duck(0, t1 + 0.3, db=-4, lp=2400, reverb=0.3, ramp=0.5)
    b.add(black_in, 0, 0.6); b.add(particles, 0, t1 + 0.5, k=1.0, seed=2); b.add(rays_ov, 0, t1, k=0.5)
    b.add(lambda f, t, ov: E.draw_menorah(f, cw / 2, ch * 0.3, 1.5, _fade(t, ov, 0.7, 0.5), t), 0.3, t1 + 0.3)
    b.add(text_ov, 0.6, t1 + 0.3, txt='מסיבת חנוכה', y=0.43, size=110, font='frank-ruhl-libre-700', tin=0.8, fo=0.5)
    b.add(text_ov, 0.9, t1 + 0.3, txt='גן מלכות', y=0.515, size=230, tin=1.0, shimmer=1.0, fo=0.5)
    b.add(rule_ov, 1.3, t1 + 0.3, y=0.59, w=0.26)
    b.fx('shimmer', 0.3, dur=3.0, gain=0.18); b.fx('impact', 0.9, gain=0.3)
    win_start = None
    prev_p = True
    for i, (src, a, z) in enumerate(HIGHLIGHTS):
        portrait = src in PORTRAIT
        tr = ('gold', 0.8) if i == 0 else (('morph', 1.2) if (not portrait and prev_p) else ('dissolve', 0.5))
        nxt = HIGHLIGHTS[i + 1][0] if i + 1 < len(HIGHLIGHTS) else None
        d_out = 1.0 if nxt is None else (1.2 if (nxt not in PORTRAIT and portrait) else 0.5)
        at = a + tr[1] / 2
        dur = (z - a) - tr[1] / 2 - d_out / 2
        b.bed_start(src, at, gain=auto_gain(src, a, z), snap=False, fade=tr[1] / 2)
        kw = dict(stab=src in STAB)
        if not portrait: kw.update(window=True, pic=WPIC)
        c0, _ = b.shot(s=dur, trans=tr, **kw)
        if not portrait and win_start is None: win_start = c0 - tr[1] / 2
        prev_p = portrait
    end = b.t
    b.add(frame_design, win_start, end + 5)
    b.bed_start('20261123_174135', 12.6, gain=auto_gain('20261123_174135', 12, 16) * 0.6, snap=False, fade=0.8)
    t0, t1 = b.shot(s=4.0, src='20261123_174135', at=14.0, speed=0.3, nosnap=True, blur_bg=True, dim=(0, 0.8, 0.45),
                    trans=('gold', 0.8), window=True, pic=WPIC)
    b.duck(t0 - 0.4, t1 + 0.5, db=-5, lp=2500, reverb=0.35, ramp=0.8)
    b.fx('shimmer', t0 + 0.2, dur=3.0, gain=0.2)
    b.add(particles, t0, t1 + 1, k=0.9, seed=61, fo=0.01)
    b.add(text_ov, t0 + 0.3, t1 + 1, txt='גן מלכות', y=0.43, size=200, tin=0.9, shimmer=0.8, fo=0.01)
    b.add(rule_ov, t0 + 0.7, t1 + 1, y=0.485, w=0.24)
    b.add(text_ov, t0 + 1.0, t1 + 1, txt='מאירים את העולם!', y=0.53, size=104, font='frank-ruhl-libre-700', tin=0.8, fo=0.01)
    b.add(black_out, t1 - 0.7, t1 + 0.01)

# ---------------------------------------------------------------- rendering helpers
def make(name):
    b = Builder(CANVAS)
    if name == 'film':
        build_film(b)
        return b.version('film', os.path.join(OUT, 'gan-malchut-hanukkah-party-film.mp4'))
    build_highlights(b)
    return b.version('highlights', os.path.join(OUT, 'gan-malchut-hanukkah-highlights-1min.mp4'))

def _chunk(args):
    name, a, z, path = args
    v = make(name)
    E.render(v, frame_range=(a, z), video_only_out=path)
    return path

def render_parallel(name, jobs=4):
    v = make(name)
    # pre-build stabilised intermediates once (shared by all chunks)
    srcs = sorted({c.src for c in v.clips if c.stab})
    with ProcessPoolExecutor(jobs) as ex:
        list(ex.map(E.stab_source, srcs))
    n = int(round(v.duration * E.FPS))
    # split at clip starts near equal shares
    starts = sorted(int(round(c.t0 * E.FPS)) for c in v.clips)
    cuts = [0]
    for k in range(1, jobs * 2):
        target = n * k / (jobs * 2)
        cuts.append(min(starts, key=lambda s: abs(s - target)))
    cuts = sorted(set(cuts)) + [n]
    d = os.path.join(E.WORK, 'chunks', name); os.makedirs(d, exist_ok=True)
    tasks = [(name, cuts[i], cuts[i + 1], os.path.join(d, f'{i:02d}.mp4')) for i in range(len(cuts) - 1)]
    print(f'{name}: {v.duration:.1f}s, {n} frames, {len(tasks)} chunks')
    with ProcessPoolExecutor(jobs) as ex:
        for p in ex.map(_chunk, tasks): print('  chunk done', os.path.basename(p), flush=True)
    lst = os.path.join(d, 'list.txt')
    open(lst, 'w').write(''.join(f"file '{t[3]}'\n" for t in tasks))
    wav = v.out[:-4] + '.wav'
    E.render_audio(v, wav)
    os.makedirs(OUT, exist_ok=True)
    ln = loudnorm_args(wav)
    # final encode: phone/WhatsApp friendly bitrate, two-pass loudness normalisation (true peak <= -2 dBTP)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-i', wav, '-map', '0:v', '-map', '1:a',
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-maxrate', '7M', '-bufsize', '14M', '-profile:v', 'high',
                    '-level', '4.2', '-pix_fmt', 'yuv420p', '-af', ln,
                    '-c:a', 'aac', '-b:a', '192k', '-ar', str(E.SR), '-movflags', '+faststart', '-shortest', v.out], check=True)
    print('->', v.out)
    return v

def loudnorm_args(wav, I=-14, TP=-2, LRA=11):
    """two-pass loudnorm: measure, then apply linearly so the true-peak target holds."""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', f'loudnorm=I={I}:TP={TP}:LRA={LRA}:print_format=json',
                        '-f', 'null', '-'], capture_output=True, text=True).stderr
    d = json.loads(r[r.rindex('{'):r.rindex('}') + 1])
    return (f"loudnorm=I={I}:TP={TP}:LRA={LRA}:measured_I={d['input_i']}:measured_TP={d['input_tp']}:"
            f"measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:offset={d['target_offset']}:linear=true")

def plan_parts(v, max_len=59.0, min_len=35.0):
    """cut points for WhatsApp status parts: prefer clip changes, else a beat inside the clip."""
    bounds = sorted(c.t0 for c in v.clips[1:])
    beats = []
    for c in v.clips:
        if isinstance(c.speed, (int, float)) and c.speed == 1.0:
            for bt in E.ANALYSIS[c.src]['beats']:
                t = c.t0 + (bt - c.src_t0)
                if c.t0 + 1.0 < t < c.t1 - 1.0: beats.append(t)
    beats.sort()
    cuts, start = [0.0], 0.0
    while v.duration - start > max_len:
        win = [x for x in bounds if start + min_len <= x <= start + max_len]
        if win:
            nxt = win[-1]
        else:
            bw = [x for x in beats if start + min_len <= x <= start + max_len]
            # take a beat every 4th (bar line) when possible
            nxt = bw[-1] if bw else start + max_len
        # avoid a tiny last part
        if 0 < v.duration - nxt < 15:
            nxt = start + (v.duration - start) / 2
            bw = [x for x in beats + bounds if abs(x - nxt) < 6]
            if bw: nxt = min(bw, key=lambda x: abs(x - nxt))
        cuts.append(nxt); start = nxt
    cuts.append(v.duration)
    return cuts

def render_parts(v):
    cuts = plan_parts(v)
    m = len(cuts) - 1
    d = os.path.join(OUT, 'whatsapp-status'); os.makedirs(d, exist_ok=True)
    lab_dir = os.path.join(E.WORK, 'labels'); os.makedirs(lab_dir, exist_ok=True)
    for i in range(m):
        a, z = cuts[i], cuts[i + 1]
        lab = np.zeros((150, 600, 4), np.uint8)
        img = np.zeros((150, 600, 3), np.uint8)
        img = E.draw_text(img, f'חלק {i + 1} מתוך {m}', 300, 75, size=60, font='frank-ruhl-libre-700')
        alpha = np.clip(img.max(axis=2).astype(np.float32) * 1.4, 0, 255).astype(np.uint8)
        lab = np.dstack([img, alpha])
        lp = os.path.join(lab_dir, f'part{i + 1}.png'); cv2.imwrite(lp, lab)
        out = os.path.join(d, f'gan-malchut-hanukkah-part-{i + 1:02d}-of-{m:02d}.mp4')
        dur = z - a
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{a:.3f}', '-i', v.out, '-i', lp, '-t', f'{dur:.3f}',
                        '-filter_complex', f"[1]format=rgba,fade=t=out:st=2.6:d=0.6:alpha=1[l];[0][l]overlay=(W-w)/2:40:enable='lt(t,3.3)':shortest=0,format=yuv420p[v]",
                        '-map', '[v]', '-map', '0:a', '-af', f'afade=t=in:d=0.15,afade=t=out:st={max(0, dur - 0.35):.3f}:d=0.35',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], check=True)
        print(f'  part {i + 1}/{m}: {a:7.2f}-{z:7.2f} ({dur:.1f}s) -> {os.path.basename(out)}')

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'plan'
    if cmd == 'plan':
        for n in ('film', 'highlights'):
            v = make(n); ED.describe(v)
        v = make('film'); print('parts:', [round(x, 1) for x in plan_parts(v)])
    elif cmd == 'stills':
        v = make(sys.argv[3] if len(sys.argv) > 3 else 'film')
        sd = os.path.join(E.WORK, 'stills'); os.makedirs(sd, exist_ok=True)
        E.render(v, stills=[float(x) for x in sys.argv[2].split(',')], stills_dir=sd)
    elif cmd == 'film':
        render_parallel('film')
    elif cmd == 'parts':
        render_parts(make('film'))
    elif cmd == 'highlights':
        render_parallel('highlights')
