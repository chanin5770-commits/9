# -*- coding: utf-8 -*-
"""
Shot list for the Rosh Chodesh Kislev 5738 clip, matched to the song's structure.

Song analysis (song.mp3, 3:18, measured with tools/analyze_song.py):
  * Tempo 130 BPM (one beat = 0.4615 s, first beat at 0.455 s).
  * The arrangement plays twice: pass 2 starts 93.5 s after pass 1
    and repeats the same music exactly.
  * Section boundaries in pass 1: 7.5 / 14 / 34.5 / 42 / 53.5 / 66.5 / 75.5 / 83 / 90.5.
  * Fixed point from the brief: at 0:56, "יצא הרבי מחדרו פעם ראשונה",
    the real black-and-white photo of the Rebbe appears.

Every shot starts on the nearest beat (see b()). To move a shot, change its
time here and run tools/render.py again.

Fields:
  t     start time in seconds (beat-snapped)
  src   image name under assets/panels (upscaled versions are used)
  mode  'frame' = whole storyboard panel in a frame on a blurred background
        'full'  = 16:9 window that moves across the panel (Ken Burns)
  a, b  start and end window (cx, cy, w), normalised to the panel ('full')
        or (cx, cy, zoom) inside the frame ('frame')
  grade warm / cool / gold / none
  fx    leaves, sparkle, pulse (on the beat), glow
  tin   crossfade length into this shot; 'white' = transition through white light
  lyric which line of the song this shot carries (documentation only)
"""

BPM = 130.02
BEAT = 60.0 / BPM
PHASE = 0.455
PASS = 93.5          # length of one pass of the arrangement
PHOTO_T = 56.0       # the brief: the real photo at 0:56


def b(t):
    """Snap a time to the nearest beat."""
    n = round((t - PHASE) / BEAT)
    return round(PHASE + n * BEAT, 3)


def S(t, src, mode, a, b_, grade="warm", fx=(), tin=0.6, lyric=""):
    return dict(t=t, src=src, mode=mode, a=a, b=b_, grade=grade, fx=set(fx), tin=tin, lyric=lyric)


def pass_one(o, variant):
    """One pass of the song. o = time offset; variant 0/1 swaps framings so the repeat feels new."""
    v = variant
    shots = []
    add = shots.append
    # ---- intro (instrumental) ----
    if v == 0:
        add(S(0.0, "s04", "full", (0.50, 0.36, 0.96), (0.53, 0.31, 0.62), "warm", ("leaves", "glow"), 0, "פתיחה – 770 בשקיעה"))
    else:
        add(S(o + 0.0, "g08", "full", (0.50, 0.34, 0.95), (0.62, 0.30, 0.60), "warm", ("leaves", "glow"), 1.2, "פתיחה – 770, החזרה"))
    # ---- verse 1 ----
    t = o + 7.5
    if v == 0:
        add(S(b(t), "g01", "frame", (0.5, 0.45, 1.0), (0.48, 0.42, 1.07), "warm", ("pulse", "glow"), 0.8, "בשמחת תורה באמצע הקפות"))
        add(S(b(t + 3.7), "s01", "full", (0.42, 0.31, 0.78), (0.58, 0.30, 0.64), "warm", ("pulse",), 0.5, "בשמחת תורה (ריקודים עם ספר התורה)"))
    else:
        add(S(b(t), "s01", "frame", (0.5, 0.45, 1.0), (0.52, 0.42, 1.07), "warm", ("pulse", "glow"), 0.8, "בשמחת תורה באמצע הקפות"))
        add(S(b(t + 3.7), "g01", "full", (0.40, 0.36, 0.80), (0.62, 0.30, 0.62), "warm", ("pulse",), 0.5, "בשמחת תורה (ספר התורה והילד)"))
    add(S(b(o + 14.25), "p_worry", "frame", (0.5, 0.42, 1.0), (0.55, 0.40, 1.09), "cool", (), 1.0, "לפתע הרבי בליבו"))
    if v == 0:
        add(S(b(o + 21.0), "g02", "frame", (0.5, 0.40, 1.0), (0.45, 0.38, 1.07), "cool", (), 0.7, "כל החסידים היו מאוד עצובים"))
        add(S(b(o + 24.5), "g02", "full", (0.66, 0.42, 0.62), (0.71, 0.40, 0.50), "cool", (), 0.6, "(הילד מביט באביו)"))
    else:
        add(S(b(o + 21.0), "g02", "full", (0.40, 0.36, 0.80), (0.30, 0.34, 0.60), "cool", (), 0.7, "כל החסידים היו מאוד עצובים"))
        add(S(b(o + 24.5), "g02", "frame", (0.5, 0.40, 1.0), (0.62, 0.38, 1.08), "cool", (), 0.6, "(הילד מביט באביו)"))
    add(S(b(o + 27.75), "g05", "frame", (0.5, 0.40, 1.0), (0.55, 0.36, 1.07), "cool", ("leaves",), 0.7, "רוצים את הרבי במהרה לראות"))
    add(S(b(o + 31.4), "g05", "full", (0.50, 0.34, 0.92), (0.57, 0.38, 0.52), "cool", ("leaves",), 0.6, "(חלונות 770)"))
    # ---- chorus ----
    add(S(b(o + 34.5), "g03", "frame", (0.5, 0.42, 1.0), (0.45, 0.40, 1.07), "warm", ("glow",), 0.6, "כולם מתפללים לרפואתו"))
    add(S(b(o + 38.6), "g04", "frame", (0.5, 0.38, 1.0), (0.60, 0.33, 1.08), "warm", ("glow",), 0.6, "מתי נראה אותו בתפילתו"))
    add(S(b(o + 42.3), "g08", "full", (0.55, 0.34, 0.94), (0.66, 0.42, 0.58), "warm", ("leaves",), 0.6, "כולם מחכים לרבי שיבוא"))
    # "מתי, מתי, עד מתי" – quick cuts on the beat
    q = b(o + 46.6)
    cuts = [("g03", (0.27, 0.40, 0.55), (0.25, 0.38, 0.47)),
            ("g04", (0.55, 0.36, 0.60), (0.57, 0.34, 0.50)),
            ("p_worry", (0.62, 0.48, 0.55), (0.64, 0.46, 0.46)),
            ("g05", (0.56, 0.36, 0.55), (0.57, 0.38, 0.42))]
    if v == 1:
        cuts = [("g02", (0.30, 0.34, 0.58), (0.28, 0.32, 0.48)),
                ("g04", (0.62, 0.30, 0.55), (0.64, 0.30, 0.46)),
                ("g03", (0.62, 0.40, 0.55), (0.64, 0.38, 0.46)),
                ("g08", (0.70, 0.45, 0.50), (0.70, 0.46, 0.40))]
    for i, (src, a, bb) in enumerate(cuts):
        add(S(round(q + i * 3 * BEAT, 3), src, "full", a, bb, "warm", ("pulse",), 0.12, "מתי, מתי, עד מתי"))
    # ---- verse 2: the miracle ----
    add(S(b(o + 51.6), "g06", "frame", (0.5, 0.42, 1.0), (0.5, 0.38, 1.08), "gold", ("glow", "sparkle"), 0.5, "בראש חודש כסלו קרה הנס"))
    add(S(b(o + 53.6), "g08", "full", (0.62, 0.38, 0.70), (0.70, 0.49, 0.30), "gold", ("glow",), 0.5, "(המצלמה מתקרבת לדלתות 770)"))
    # THE REAL PHOTO – starts on the beat just before 0:56 and is fully visible by 0:56
    p = b(o + PHOTO_T) if v == 1 else 55.83
    add(S(p, "real_clean", "full", (0.50, 0.50, 1.00), (0.52, 0.44, 0.84), "none", (), "white", "יצא הרבי מחדרו פעם ראשונה (התמונה האמיתית)"))
    add(S(b(p + 4.0), "real_panel", "frame", (0.5, 0.45, 1.0), (0.5, 0.43, 1.03), "none", (), 0.9, "יצא הרבי מחדרו פעם ראשונה"))
    add(S(b(o + 63.5), "g07", "frame", (0.5, 0.42, 1.0), (0.55, 0.40, 1.07), "warm", ("sparkle", "glow"), 0.9, "אל החסידים משבע מאות שבעים"))
    add(S(b(o + 66.6), "s04", "frame", (0.5, 0.40, 1.0), (0.5, 0.35, 1.06), "warm", ("leaves", "sparkle"), 0.6, "אל החסידים משבע מאות שבעים (770)"))
    if v == 0:
        add(S(b(o + 69.5), "s06", "frame", (0.5, 0.42, 1.0), (0.45, 0.40, 1.07), "warm", ("sparkle", "pulse"), 0.6, "כולם כל כך שמחים, שרים ורוקדים"))
        add(S(b(o + 72.6), "g10", "full", (0.50, 0.35, 0.92), (0.40, 0.34, 0.66), "warm", ("sparkle", "pulse"), 0.5, "שרים ורוקדים"))
    else:
        add(S(b(o + 69.5), "g10", "frame", (0.5, 0.42, 1.0), (0.55, 0.40, 1.07), "warm", ("sparkle", "pulse"), 0.6, "כולם כל כך שמחים, שרים ורוקדים"))
        add(S(b(o + 72.6), "s06", "full", (0.50, 0.32, 0.90), (0.40, 0.34, 0.62), "warm", ("sparkle", "pulse"), 0.5, "שרים ורוקדים"))
    # ---- chorus (joyful, after the miracle) ----
    add(S(b(o + 75.6), "g11", "frame", (0.5, 0.42, 1.0), (0.5, 0.38, 1.07), "warm", ("sparkle", "pulse", "leaves"), 0.6, "פזמון – כולם מתפללים (ריקודי הודיה)"))
    add(S(b(o + 79.3), "g04", "full" if v == 0 else "frame", (0.52, 0.34, 0.70) if v == 0 else (0.5, 0.4, 1.0), (0.58, 0.30, 0.55) if v == 0 else (0.55, 0.36, 1.06), "gold", ("glow",), 0.6, "פזמון – מתי נראה אותו בתפילתו (תהילים, זיכרון)"))
    add(S(b(o + 83.0), "g08", "frame" if v == 0 else "full", (0.5, 0.40, 1.0) if v == 0 else (0.50, 0.33, 0.94), (0.52, 0.38, 1.06) if v == 0 else (0.60, 0.35, 0.66), "warm", ("leaves", "sparkle"), 0.6, "פזמון – כולם מחכים לרבי שיבוא (770)"))
    q = b(o + 86.6)
    joy = [("g10", (0.30, 0.42, 0.52), (0.32, 0.40, 0.44)),
           ("s06", (0.45, 0.36, 0.60), (0.47, 0.34, 0.50)),
           ("g11", (0.50, 0.30, 0.82), (0.50, 0.30, 0.70)),
           ("g07", (0.45, 0.35, 0.62), (0.47, 0.33, 0.52))]
    if v == 1:
        joy = joy[1:] + joy[:1]
    for i, (src, a, bb) in enumerate(joy):
        add(S(round(q + i * 4 * BEAT, 3), src, "full", a, bb, "warm", ("pulse", "sparkle"), 0.12, "פזמון – מתי, מתי (שמחה)"))
    return shots


def build():
    shots = pass_one(0.0, 0) + pass_one(PASS, 1)
    # cut the second pass's last chorus short for the ending
    shots = [s for s in shots if s["t"] < b(183.5)]
    shots.append(S(b(183.5), "g12", "frame", (0.5, 0.45, 1.0), (0.5, 0.43, 1.06), "warm", ("leaves", "sparkle", "glow"), 0.9, "סיום – ראש חודש כסלו, יום של הודיה ושמחה"))
    shots.append(S(b(189.0), "banner", "banner", None, None, "warm", ("leaves", "sparkle"), 0.9, "באנר הסיום"))
    shots.append(S(b(192.6), "yechi", "card", None, None, "warm", ("sparkle",), 1.0, "יחי אדוננו מורנו ורבינו מלך המשיח לעולם ועד!"))
    return sorted(shots, key=lambda s: s["t"])


END = 198.0
TITLE = ("ראש חודש כסלו תשל״ח", "סיפור של תפילה, ציפייה ונס")
TITLE_T = (1.2, 6.9)
CLOSING = "יחי אדוננו מורנו ורבינו\nמלך המשיח לעולם ועד!"

if __name__ == "__main__":
    for s in build():
        m, sec = divmod(s["t"], 60)
        print(f"{int(m)}:{sec:05.2f}  {s['src']:10s} {s['mode']:6s} {s['lyric']}")
