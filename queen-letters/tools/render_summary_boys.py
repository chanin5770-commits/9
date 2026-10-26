#!/usr/bin/env python3
"""סרטון הסיכום ״מה יש בערכה״, גרסת הבנים: מלך האותיות, עם השיר ״מלך האותיות״.

  python3 tools/render_summary_boys.py          # -> dist/kit-summary-boys-51s-9x16.mp4
  python3 tools/render_summary_boys.py --stills 2,40,47

Same structure, kit content and end card as render_summary.py; the footage is the King of Letters
clips (footage/king/) and the music is the last 51 s of the song (124.60 s -> its own ending: the
final chorus "מלך, מלך, מלך האותיות!" and the clapping outro).
"""
import argparse, os, sys
import numpy as np

import render_clip as RC
import render_summary as RS

ROOT = RC.ROOT
RC.SONG = os.path.join(ROOT, "assets", "melech-haotiyot.mp3")
RS.SONG_AT = 124.60
RS.DUR = 51.0
# downbeats of "מלך האותיות" from 124.60 (152 BPM), as video time
SONG_BARS = (124.6, 126.2, 127.8, 129.4, 130.98, 132.59, 134.16, 135.74, 137.35, 138.92, 140.5, 142.11, 143.66,
             145.26, 146.82, 148.4, 149.98, 151.58, 153.16, 154.74, 156.32, 157.9, 159.47, 161.05, 162.63, 164.21,
             165.79, 167.37, 168.95, 170.53, 172.11, 173.69)
B = RS.BARS = RS.B = [round(b - RS.SONG_AT, 3) for b in SONG_BARS]
K = "king/"


def s_open(t):  # the King of Letters at his desk, the first letter floating up
    f = RS.clip(t, K + "king-first-letter", 0, B[2], 3.0, 6.2, (1.04, 1.0), ((0, .38, .45), (1, .37, .45)))
    if "brand" not in RS.CACHE:
        RS.CACHE["brand"] = RS.plate(RS.text_sprite("ChaniLi Studio", "CormorantGaramond[wght].ttf", 66, "Bold", RS.BURG, track=6), 34)
    RS.paste(f, RS.CACHE["brand"], RS.W / 2, 360, alpha=RS.ease((t - .5) / .7) * (1 - RS.ease((t - (B[2] - .5)) / .5)))
    return f, 0.75


def s_clips(t):  # clips and songs: the hall of letters, the great book
    a = B[22]; mid = (B[22] + B[24]) / 2
    if t < mid: f = RS.clip(t, K + "king-letter-hall", a, mid, 2.0, 3.8, (1.0, 1.06), ((0, .48, .5), (1, .49, .5)))
    else: f = RS.clip(t, K + "king-great-book", mid, B[24], 2.0, 3.8, (1.04, 1.1), ((0, .46, .5), (1, .48, .5)))
    if "clip_badge" not in RS.CACHE: RS.s_clips(a)        # builds the badge sprites (the footage it returns is discarded)
    al = RS.ease((t - a - .2) / .4)
    RS.paste(f, RS.CACHE["play"], RS.W / 2, 330, alpha=al)
    RS.paste(f, RS.CACHE["clip_badge"], RS.W / 2, 470, alpha=al)
    RS.paste(f, RS.CACHE["clip_sub"], RS.W / 2, 570, alpha=RS.ease((t - a - .45) / .4))
    return f, 0.6


def s_finale(t):  # final-chorus montage: the castle gate, flying pages, reaching for the letters, the golden door
    if t < B[25]: return RS.clip(t, K + "king-cloud-castle", B[24], B[25], 3.6, 5.2, (1.0, 1.06), ((0, .50, .5), (1, .51, .5))), 0.8
    if t < B[26]: return RS.clip(t, K + "king-flying-pages", B[25], B[26], 1.6, 3.2, (1.04, 1.1), ((0, .42, .5), (1, .44, .5))), 0.8
    if t < B[27]: return RS.clip(t, K + "king-library-light", B[26], B[27], 3.0, 4.6, (1.02, 1.08), ((0, .46, .48), (1, .44, .46))), 0.8
    return RS.clip(t, K + "king-golden-door", B[27], B[28], 6.4, 8.0, (1.0, 1.1), ((0, .50, .5), (1, .50, .46))), 0.7


RS.SCENES = [
    (0.0,   B[2],  s_open,       "fade"),
    (B[2],  B[5],  RS.s_poster,  "glow"),
    (B[5],  B[8],  RS.s_numbers, "glow"),
    (B[8],  B[12], RS.s_tracks,  "glow"),
    (B[12], B[16], RS.s_books,   "glow"),
    (B[16], B[19], RS.s_hasidic, "glow"),
    (B[19], B[22], RS.s_site,    "glow"),
    (B[22], B[24], s_clips,      "flash"),
    (B[24], B[28], s_finale,     "flash"),
    (B[28], RS.DUR, RS.s_end,    "glow"),
]
RS.ACCENTS = [B[25], B[26], B[27], (B[22] + B[24]) / 2]


def build_audio(path):
    """the song as is: it ends by itself under the end card; only a short fade-in and fade-out."""
    import subprocess
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{RS.SONG_AT}", "-t", f"{RS.DUR}", "-i", RC.SONG,
                          "-f", "f32le", "-ac", "2", "-ar", str(RS.SR), "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
    n = int(RS.DUR * RS.SR); x = np.pad(x, ((0, max(0, n - len(x))), (0, 0)))[:n]
    x[:int(.2 * RS.SR)] *= np.linspace(0, 1, int(.2 * RS.SR))[:, None] ** 2
    x[-int(.4 * RS.SR):] *= np.linspace(1, 0, int(.4 * RS.SR))[:, None]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(RS.SR), "-i", "-", path],
                   input=x.astype(np.float32).tobytes(), check=True)
RS.build_audio = build_audio


class Clips(RC.Clips):
    """the King of Letters clips are already consistent with each other: no colour shift for them."""
    def get(self, name):
        if name.startswith(K):
            self.shift.setdefault(name, np.zeros(3, np.float32))
            os.makedirs(os.path.join(RC.CACHE, "king"), exist_ok=True)
        return super().get(name)
RC.Clips = Clips


if __name__ == "__main__":
    if "--out" not in sys.argv: sys.argv += ["--out", os.path.join(ROOT, "dist", "kit-summary-boys-51s-9x16.mp4")]
    RS.main()
