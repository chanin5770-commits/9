#!/usr/bin/env python3
"""Assemble "תן לי לגדול" from timeline.json.

  python3 tools/build.py --check     # which assets exist, which are missing or too short
  python3 tools/build.py --draft     # timing preview: storyboard panels stand in for missing shots (watermarked)
  python3 tools/build.py             # final MP4, refuses to run while any asset is missing
  python3 tools/build.py --stills 3,40,118   # PNG frames from the last build, for checking

Only needs ffmpeg/ffprobe (with libass) and Pillow.
"""
import argparse
import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "fonts"
WORK = ROOT / "dist" / "work"
DIST = ROOT / "dist"
T = json.loads((ROOT / "timeline.json").read_text(encoding="utf-8"))
W, H, FPS, DUR = (T["format"][k] for k in ("width", "height", "fps", "duration"))
NAME = "ten-li-ligdol"


def run(cmd, quiet=True):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write(r.stderr[-4000:])
        sys.exit(f"ffmpeg failed: {' '.join(map(str, cmd[:6]))} ...")
    return r


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate",
                        "-of", "json", str(path)], capture_output=True, text=True)
    if r.returncode:
        return None
    j = json.loads(r.stdout)
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video"), {})
    return {"duration": float(j.get("format", {}).get("duration", 0) or 0), "width": v.get("width"), "height": v.get("height"),
            "fps": v.get("r_frame_rate")}


def need_len(s):
    return s["end"] - s["start"] + (s.get("out_dur", 0) if s["out"] == "dissolve" else 0)


def vo_path(v):
    return ROOT / "vo" / f"{v['id']}.wav"


def vo_len(v):
    p = vo_path(v)
    if p.exists():
        info = probe(p)
        if info and info["duration"]:
            return info["duration"]
    return v["est"]


VO = {v["id"]: v for v in T["vo"]}


# ---------------------------------------------------------------- check

def check():
    rows, missing = [], []
    for s in T["shots"]:
        p = ROOT / s["file"]
        need = s["in"] + need_len(s)
        if not p.exists():
            rows.append((s["file"], "חסר", f"צריך {need:.1f} שנ׳"))
            missing.append(s["file"])
            continue
        info = probe(p)
        note = f"{info['width']}x{info['height']} {info['duration']:.1f}s"
        if info["duration"] < need:
            note += f"  !! קצר מדי, צריך {need:.1f}s (הפריים האחרון יוקפא)"
        if info["width"] and info["height"] and info["width"] > info["height"]:
            note += "  !! לא אנכי, ייחתך למרכז"
        rows.append((s["file"], "יש", note))
    for v in T["vo"]:
        p = vo_path(v)
        rel = p.relative_to(ROOT).as_posix()
        if not p.exists():
            rows.append((rel, "חסר", v["text"]))
            missing.append(rel)
            continue
        d = vo_len(v)
        nxt = next((n for n in T["vo"] if n["at"] > v["at"]), None)
        note = f"{d:.2f}s"
        if nxt and v["at"] + d > nxt["at"] - 0.15:
            note += f"  !! עולה על {nxt['id']}: להזיז את at או לקצר את הטייק"
        rows.append((rel, "יש", note))
    for f in [T["music"]["file"]] + sorted({x["file"] for x in T["sfx"]}):
        ok = (ROOT / f).exists()
        rows.append((f, "יש" if ok else "חסר", ""))
        if not ok:
            missing.append(f)
    w = max(len(r[0]) for r in rows)
    for f, st, note in rows:
        print(f"{f.ljust(w)}  {st:4}  {note}")
    print(f"\n{len(missing)} נכסים חסרים מתוך {len(rows)}. פרומפטים ליצירתם: PROMPTS.md")
    return missing


# ---------------------------------------------------------------- subtitles

def ts(t):
    t = max(0, t)
    cs = int(round(t * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def srt_ts(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def sub_span(ids):
    a, b = VO[ids[0]], VO[ids[-1]]
    return a["at"] - 0.1, b["at"] + vo_len(b) + 0.45


ASS_HEAD = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Heebo Medium,62,&H00FFFFFF,&H00FFFFFF,&H64000000,&H8C000000,0,0,0,0,100,100,0,0,1,2.2,3,2,90,90,560,-1
Style: Child,Heebo Medium,58,&H00D8EEFF,&H00FFFFFF,&H64000000,&H8C000000,0,0,0,0,100,100,0,0,1,2.2,3,2,90,90,560,-1
Style: Quote,Heebo Light,66,&H00FFFFFF,&H00FFFFFF,&H64000000,&H8C000000,0,0,0,0,100,100,0,0,1,2.0,3,2,90,90,560,-1
Style: Stack,Heebo Medium,70,&H00FFFFFF,&H00FFFFFF,&H5A000000,&H8C000000,0,0,0,0,100,100,0,0,1,2.4,3,5,90,90,0,-1
Style: Accent,Heebo Medium,74,&H00A8E4FF,&H00FFFFFF,&H5A000000,&H8C000000,0,0,0,0,100,100,0,0,1,2.4,3,2,90,90,600,-1
Style: Title,Amatic SC,190,&H00FFFFFF,&H00FFFFFF,&H50101830,&H64000000,1,0,0,0,100,100,0,0,1,3,5,5,60,60,0,-1
Style: Studio,Cormorant Garamond Medium,96,&H00F2F6FF,&H00FFFFFF,&H50101830,&H64000000,0,0,0,0,100,100,2,0,1,1.5,3,5,60,60,0,-1
Style: Mark,Heebo Medium,34,&H40FFFFFF,&H00FFFFFF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,1,1.5,0,8,40,40,70,-1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def endcard_events():
    e = T["endcard"]
    t0, t1 = e["start"], DUR
    cx, ty = W // 2, 860
    ev = []
    # title fades up and settles
    ev.append(f"Dialogue: 2,{ts(t0)},{ts(t1)},Title,,0,0,0,,{{\\an5\\pos({cx},{ty})\\fad(900,0)\\blur1.2"
              f"\\fscx94\\fscy94\\t(0,1800,0.6,\\fscx100\\fscy100)}}{e['title']}")
    # hand-drawn underline: a vector stroke revealed right-to-left (reading direction)
    sx, sy = cx - 330, ty + 120
    path = "m 0 18 b 120 2 330 -6 660 8 l 660 16 b 330 4 120 10 0 26"
    ev.append(f"Dialogue: 1,{ts(t0 + 0.9)},{ts(t1)},Title,,0,0,0,,{{\\an7\\pos({sx},{sy})\\bord0\\shad0\\1c&HFFFFFF&\\blur1"
              f"\\clip({sx + 660},{sy - 20},{sx + 661},{sy + 60})\\t(0,900,0.7,\\clip({sx - 4},{sy - 20},{sx + 664},{sy + 60}))}}{{\\p1}}{path}{{\\p0}}")
    # small heart above the title
    heart = "m 30 52 b 12 38 0 26 0 14 b 0 4 8 -2 16 -2 b 22 -2 27 2 30 7 b 33 2 38 -2 44 -2 b 52 -2 60 4 60 14 b 60 26 48 38 30 52"
    ev.append(f"Dialogue: 1,{ts(t0 + 0.4)},{ts(t1)},Title,,0,0,0,,{{\\an5\\pos({cx + 210},{ty - 175})\\bord5\\shad0\\1a&HFF&\\3c&H9A5AE8&"
              f"\\blur0.8\\fad(700,0)\\fscx90\\fscy90\\frz-8}}{{\\p1}}{heart}{{\\p0}}")
    ev.append(f"Dialogue: 2,{ts(t0 + 1.6)},{ts(t1)},Studio,,0,0,0,,{{\\an5\\pos({cx},{ty + 330})\\fad(900,0)\\blur0.6}}{e['studio']}")
    return ev


def write_subs(draft_note=None, all_vo=False):
    ev = []
    if all_vo:
        # draft: every narration line, so the timing can be judged without audio
        for v in T["vo"]:
            style = "Child" if v.get("voice") == "child" else "Default"
            ev.append(f"Dialogue: 0,{ts(v['at'])},{ts(v['at'] + vo_len(v) + 0.25)},{style},,0,0,0,,{{\\fad(120,120)}}{v['text']}")
    else:
        for s in T["subtitles"]:
            a, b = sub_span(s["vo"])
            style = s.get("style", "Default")
            if style == "Stack":
                lines = s["text"].split("\\N")
                for i, (vid, line) in enumerate(zip(s["lines"], lines)):
                    y = 1290 + (i - 1) * 104
                    ev.append(f"Dialogue: 0,{ts(VO[vid]['at'] - 0.05)},{ts(b)},Stack,,0,0,0,,"
                              f"{{\\an5\\pos({W // 2},{y})\\fad(220,300)\\blur0.4\\fscx96\\fscy96\\t(0,350,\\fscx100\\fscy100)}}{line}")
                continue
            ev.append(f"Dialogue: 0,{ts(a)},{ts(b)},{style},,0,0,0,,{{\\fad(200,260)\\blur0.4}}{s['text']}")
    if draft_note:
        ev.append(f"Dialogue: 5,{ts(0)},{ts(DUR)},Mark,,0,0,0,,{draft_note}")
    path = WORK / "subs.ass"
    path.write_text(ASS_HEAD + "\n".join(ev + endcard_events()) + "\n", encoding="utf-8")
    # the end card title is part of the picture, so the clean version keeps it
    (WORK / "endcard.ass").write_text(ASS_HEAD + "\n".join(endcard_events()) + "\n", encoding="utf-8")
    # full narration as SRT (for platforms that take a caption file)
    srt = []
    for i, v in enumerate(T["vo"], 1):
        srt.append(f"{i}\n{srt_ts(v['at'])} --> {srt_ts(v['at'] + vo_len(v) + 0.25)}\n{v['text'].replace(chr(0x5f4), chr(34))}\n")
    (DIST / f"{NAME}.srt").write_text("\n".join(srt), encoding="utf-8")
    return path


# ---------------------------------------------------------------- picture

GRADES = {
    None: "eq=contrast=1.04:saturation=1.03,colorbalance=rh=0.03:bh=-0.03",
    # flashback: warmer, lifted blacks, softer, a touch of halation
    "flashback": "eq=contrast=0.92:brightness=0.03:saturation=0.82,colorbalance=rs=0.06:gs=0.02:bs=-0.07:rh=0.05:bh=-0.05,"
                 "split[a][b];[b]gblur=sigma=14[g];[a][g]blend=all_mode=screen:all_opacity=0.22,vignette=PI/4.2",
}
COVER = f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},setsar=1"


def placeholder_png(s):
    sb = Image.open(ROOT / "reference" / "storyboard.png").convert("RGB")
    crop = sb.crop(tuple(s["board"]))
    bg = crop.copy()
    scale = max(W / bg.width, H / bg.height)
    bg = bg.resize((math.ceil(bg.width * scale), math.ceil(bg.height * scale)), Image.LANCZOS)
    bg = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H))
    bg = bg.filter(ImageFilter.GaussianBlur(40)).point(lambda v: int(v * 0.55))
    k = W / crop.width
    fg = crop.resize((W, int(crop.height * k)), Image.LANCZOS)
    bg.paste(fg, (0, (H - fg.height) // 2 - 120))
    d = ImageDraw.Draw(bg)
    f = ImageFont.truetype(str(FONTS / "Heebo-Medium.ttf"), 40)
    label = f"PLACEHOLDER  {s['id']}  ({s['file']})"
    d.rounded_rectangle((40, 150, 88 + d.textlength(label, font=f), 220), 14, fill=(0, 0, 0))
    d.text((64, 160), label, font=f, fill=(255, 210, 120))
    out = WORK / f"ph_{s['id']}.png"
    bg.save(out)
    return out


def endcard_bg_png():
    """Sunset glow used under the end card when no A23 plate has been supplied."""
    import numpy as np
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    top, mid, low = np.array([46, 30, 52]), np.array([214, 120, 70]), np.array([28, 18, 22])
    t = y / H
    col = np.where((t < 0.55)[..., None], top + (mid - top) * (t / 0.55)[..., None],
                   mid + (low - mid) * ((t - 0.55) / 0.45)[..., None])
    sun = np.exp(-(((x - W * 0.7) ** 2 + (y - H * 0.36) ** 2) / (2 * 150 ** 2)))[..., None]
    glow = np.exp(-(((x - W * 0.7) ** 2 + (y - H * 0.40) ** 2) / (2 * 520 ** 2)))[..., None]
    col = col + sun * np.array([255, 230, 180]) * 0.9 + glow * np.array([255, 150, 80]) * 0.35
    rng = np.random.default_rng(7)
    img = Image.fromarray(np.clip(col, 0, 255).astype("uint8"))
    # soft out-of-focus highlights along the bottom, like light on grass
    bokeh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(bokeh)
    for _ in range(18):
        cx, cy, r = rng.uniform(0, W), rng.uniform(H * 0.8, H * 1.02), rng.uniform(14, 40)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 196, 130, int(rng.uniform(25, 60))))
    img = Image.alpha_composite(img.convert("RGBA"), bokeh.filter(ImageFilter.GaussianBlur(6))).convert("RGB")
    out = WORK / "endcard_bg.png"
    img.save(out)
    return out


_SEGS = {}


def segment(s, draft, missing):
    if s["id"] in _SEGS:
        return _SEGS[s["id"]]
    out = _SEGS[s["id"]] = WORK / f"seg_{s['id']}.mp4"
    L = need_len(s)
    src = ROOT / s["file"]
    deps = [ROOT / "timeline.json", Path(__file__)] + ([src] if src.exists() else [])
    if out.exists() and out.stat().st_mtime > max(d.stat().st_mtime for d in deps):
        if not src.exists() and not s.get("endcard"):
            missing.append(s["id"])
        return out  # unchanged since the last build
    grade = GRADES[s.get("grade")]
    if src.exists():
        info = probe(src)
        pad = max(0.0, s["in"] + L - info["duration"]) + 0.1
        inp = ["-ss", str(s["in"]), "-i", str(src)]
        vf = f"{COVER},fps={FPS},tpad=stop_mode=clone:stop_duration={pad:.2f},{grade}"
        if s.get("endcard"):
            vf += ",eq=brightness=-0.06:saturation=0.9,gblur=sigma=3"  # quiet plate under the title
    elif s.get("endcard"):
        inp = ["-loop", "1", "-i", str(endcard_bg_png())]
        vf = f"scale=w='{W}*(1+0.03*t/{L})':h=-2:eval=frame,crop={W}:{H},fps={FPS}"
    else:
        if not draft:
            sys.exit(f"missing {s['file']}")
        missing.append(s["id"])
        inp = ["-loop", "1", "-i", str(placeholder_png(s))]
        vf = f"fps={FPS},{grade}"
    vf += f",trim=duration={L:.3f},setpts=PTS-STARTPTS,format=yuv420p"
    run(["ffmpeg", "-y", "-hide_banner", *inp, "-an", "-filter_complex", f"[0:v]{vf}[v]", "-map", "[v]",
         "-t", f"{L:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-r", str(FPS), str(out)])
    return out


def picture(draft, ass_path):
    missing = []
    segs = [segment(s, draft, missing) for s in T["shots"]]
    args, fc = [], []
    for i, p in enumerate(segs):
        args += ["-i", str(p)]
        fc.append(f"[{i}:v]settb=AVTB,fps={FPS},format=yuv420p[s{i}]")
    cur = "s0"
    for i in range(1, len(segs)):
        prev, s = T["shots"][i - 1], T["shots"][i]
        nxt = f"j{i}"
        if prev["out"] == "dissolve":
            fc.append(f"[{cur}][s{i}]xfade=transition=fade:duration={prev['out_dur']}:offset={s['start']:.3f},settb=AVTB,fps={FPS}[{nxt}]")
        else:
            fc.append(f"[{cur}][s{i}]concat=n=2:v=1:a=0,settb=AVTB,fps={FPS}[{nxt}]")
        cur = nxt
    fc.append(f"[{cur}]noise=alls=5:allf=t,format=yuv420p,ass={ass_path.as_posix()}:fontsdir={FONTS.as_posix()},"
              f"fade=t=in:st=0:d=0.8,trim=duration={DUR}[v]")
    out = WORK / f"picture-{ass_path.stem}.mp4"
    run(["ffmpeg", "-y", "-hide_banner", *args, "-filter_complex", ";".join(fc), "-map", "[v]",
         "-c:v", "libx264", "-preset", "slow", "-crf", "17" if not draft else "23", "-pix_fmt", "yuv420p", "-r", str(FPS), str(out)])
    return out, missing


# ---------------------------------------------------------------- sound

def db(x):
    return 10 ** (x / 20)


def envelope_expr(points):
    expr = f"{db(points[-1][1]):.5f}"
    for (t0, d0), (t1, d1) in reversed(list(zip(points, points[1:]))):
        seg = f"pow(10,({d0}+({d1 - d0})*(t-{t0})/{t1 - t0})/20)"
        expr = f"if(lt(t,{t1}),{seg},{expr})"
    return f"if(lt(t,{points[0][0]}),{db(points[0][1]):.5f},{expr})"


def sound(draft):
    inputs, fc, vo_labels, sfx_labels = [], [], [], []
    n_in = lambda: sum(1 for x in inputs if x == "-i")
    for v in T["vo"]:
        p = vo_path(v)
        if not p.exists():
            if not draft:
                sys.exit(f"missing {p}")
            continue
        i = n_in()
        inputs += ["-i", str(p)]
        g = T["mix"]["child_gain_db" if v.get("voice") == "child" else "vo_gain_db"]
        fc.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,volume={db(g):.4f},"
                  f"adelay=delays={int(v['at'] * 1000)}:all=1[vo{i}]")
        vo_labels.append(f"[vo{i}]")
    for x in T["sfx"]:
        p = ROOT / x["file"]
        if not p.exists():
            continue
        i = n_in()
        inputs += ["-stream_loop", "-1", "-i", str(p)]
        chain = f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration={x['dur']},asetpts=PTS-STARTPTS"
        if x.get("fade_in"):
            chain += f",afade=t=in:d={x['fade_in']}"
        if x.get("fade_out"):
            chain += f",afade=t=out:st={x['dur'] - x['fade_out']}:d={x['fade_out']}"
        chain += f",volume={db(x['gain_db']):.4f},adelay=delays={int(x['at'] * 1000)}:all=1[fx{i}]"
        fc.append(chain)
        sfx_labels.append(f"[fx{i}]")
    m = T["music"]
    music = ROOT / m["file"]
    bus = []
    if vo_labels:
        fc.append(f"{''.join(vo_labels)}amix=inputs={len(vo_labels)}:normalize=0,apad=whole_dur={DUR},asplit=2[vobus][vokey]"
                  if len(vo_labels) > 1 else f"{vo_labels[0]}apad=whole_dur={DUR},asplit=2[vobus][vokey]")
        bus.append("[vobus]")
    if music.exists():
        i = n_in()
        inputs += ["-i", str(music)]
        fc.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur={DUR},atrim=duration={DUR},"
                  f"volume={db(m['gain_db']):.4f},volume='{envelope_expr(m['envelope'])}':eval=frame[mus]")
        if vo_labels:
            d = m["duck"]
            fc.append(f"[mus][vokey]sidechaincompress=threshold={d['threshold']}:ratio={d['ratio']}:attack={d['attack']}:"
                      f"release={d['release']}:makeup=1[musd]")
            bus.append("[musd]")
        else:
            bus.append("[mus]")
    elif vo_labels:
        fc.append("[vokey]anullsink")
    bus += sfx_labels
    pre = WORK / "mix-pre.wav"
    if not bus:
        run(["ffmpeg", "-y", "-hide_banner", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", str(DUR), str(pre)])
        return pre, False
    if not draft and not music.exists():
        sys.exit(f"missing {m['file']}")
    fc.append(f"{''.join(bus)}amix=inputs={len(bus)}:normalize=0,apad=whole_dur={DUR},atrim=duration={DUR},"
              f"afade=t=out:st={DUR - 2.5}:d=2.5[mix]")
    run(["ffmpeg", "-y", "-hide_banner", *inputs, "-filter_complex", ";".join(fc), "-map", "[mix]",
         "-ar", "48000", "-c:a", "pcm_s24le", str(pre)])
    # two-pass loudness to the platform target
    mx = T["mix"]
    r = run(["ffmpeg", "-hide_banner", "-i", str(pre), "-af",
             f"loudnorm=I={mx['loudness_lufs']}:TP={mx['true_peak']}:LRA=11:print_format=json", "-f", "null", "-"])
    j = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
    out = DIST / f"{NAME}.wav"
    run(["ffmpeg", "-y", "-hide_banner", "-i", str(pre), "-af",
         f"loudnorm=I={mx['loudness_lufs']}:TP={mx['true_peak']}:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
         f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true",
         "-ar", "48000", "-c:a", "pcm_s24le", str(out)])
    return out, True


def mux(pic, wav, out):
    run(["ffmpeg", "-y", "-hide_banner", "-i", str(pic), "-i", str(wav), "-map", "0:v", "-map", "1:a",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-t", str(DUR), str(out)])


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--draft", action="store_true")
    ap.add_argument("--stills")
    a = ap.parse_args()
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found")
    WORK.mkdir(parents=True, exist_ok=True)
    if a.check:
        check()
        return
    if a.stills:
        src = DIST / f"{NAME}{'' if (DIST / f'{NAME}.mp4').exists() else '-DRAFT'}.mp4"
        for t in a.stills.split(","):
            run(["ffmpeg", "-y", "-hide_banner", "-ss", t, "-i", str(src), "-frames:v", "1", str(WORK / f"still_{t}.png")])
            print(WORK / f"still_{t}.png")
        return
    missing = check()
    if missing and not a.draft:
        sys.exit("\nהגרסה הסופית לא תיבנה עם נכסים חסרים. אפשר להריץ --draft לטיוטת תזמון.")
    print()
    if a.draft:
        n = sum(1 for s in T["shots"] if not (ROOT / s["file"]).exists() and not s.get("endcard"))
        note = f"טיוטת תזמון · לא הסרטון הסופי · {n} שוטים חסרים" if n else "טיוטת תזמון · לא הסרטון הסופי"
        no_vo = not any(vo_path(v).exists() for v in T["vo"])
        subs = write_subs(draft_note=note, all_vo=no_vo)
        pic, _ = picture(True, subs)
        wav, _ = sound(True)
        out = DIST / f"{NAME}-DRAFT.mp4"
        mux(pic, wav, out)
        print(f"טיוטה: {out}")
        return
    subs = write_subs()
    pic, _ = picture(False, subs)
    clean, _ = picture(False, WORK / "endcard.ass")
    wav, _ = sound(False)
    mux(pic, wav, DIST / f"{NAME}.mp4")
    mux(clean, wav, DIST / f"{NAME}-clean.mp4")
    print(f"\n{DIST / (NAME + '.mp4')}\n{DIST / (NAME + '-clean.mp4')}\n{DIST / (NAME + '.wav')}\n{DIST / (NAME + '.srt')}")


if __name__ == "__main__":
    main()
