# -*- coding: utf-8 -*-
"""
Shot list for the Rosh Chodesh Kislev 5738 clip – version 2, built on the
20-panel storyboard (assets/source/storyboard-20-v4.png – realistic, white Torah mantles in panel 02; panels n01–n20).
Panel 16 in the storyboard is the slot for the real photo of the Rebbe; the
clip uses the real black-and-white photo (real_clean) there.

Song analysis (song.mp3, 3:18, tools/analyze_song.py):
  * Tempo 130 BPM (one beat = 0.4615 s, first beat at 0.455 s).
  * The arrangement plays twice: pass 2 starts 93.5 s after pass 1.
  * Section boundaries in pass 1: 7.5 / 14 / 34.5 / 42 / 53.5 / 66.5 / 75.5 / 83 / 90.5.
  * Fixed point from the brief: at 0:56, "יצא הרבי מחדרו פעם ראשונה",
    the real black-and-white photo appears.

Every shot starts on the nearest beat (b()). To move a shot, change its time
here and run tools/render.py again.

Fields:
  t     start time in seconds
  src   image name under assets/panels (upscaled versions in panels_hd are used)
  mode  'full'  = 16:9 window moving across the panel (Ken Burns)
        'frame' = whole panel in a frame on a blurred background
        'card'  = closing text card
  a, b  start / end window: (cx, cy, w) for 'full', (cx, cy, zoom) for 'frame'
  grade warm / cool / gold / none
  fx    leaves, sparkle, pulse (on the beat), glow
  tin   crossfade into this shot (seconds), or 'white' = through white light
  text  optional caption drawn over the shot
  lyric which line of the song the shot carries (documentation only)
"""

BPM = 130.02
BEAT = 60.0 / BPM
PHASE = 0.455
PASS = 93.5
PHOTO_T = 56.0


def b(t):
    n = round((t - PHASE) / BEAT)
    return round(PHASE + n * BEAT, 3)


def S(t, src, mode, a, b_, grade="warm", fx=(), tin=0.6, lyric="", text=None):
    return dict(t=t, src=src, mode=mode, a=a, b=b_, grade=grade, fx=set(fx), tin=tin, lyric=lyric, text=text)


WIDE = (0.5, 0.5, 0.9)   # the whole panel (panels are wider than 16:9)


def one_pass(o, v):
    sh = []
    add = sh.append
    # ---- intro ----
    if v == 0:
        add(S(0.0, "n01", "full", WIDE, (0.60, 0.45, 0.58), "warm", ("leaves", "glow"), 0, "פתיחה – 770 בערב"))
    else:
        add(S(o, "n20", "full", (0.5, 0.45, 0.9), (0.50, 0.38, 0.60), "warm", ("leaves", "glow"), 1.2, "פתיחה – 770, החזרה"))
    # ---- verse 1 ----
    if v == 0:
        add(S(b(o + 7.5), "n02", "full", (0.34, 0.50, 0.72), (0.62, 0.50, 0.68), "warm", ("pulse", "glow"), 0.8, "בשמחת תורה באמצע הקפות"))
        add(S(b(o + 11.1), "n03", "full", WIDE, (0.36, 0.45, 0.64), "warm", ("pulse",), 0.5, "(הילד ואביו מוחאים כפיים)"))
    else:
        add(S(b(o + 7.5), "n03", "full", (0.62, 0.40, 0.62), (0.40, 0.45, 0.80), "warm", ("pulse", "glow"), 0.8, "בשמחת תורה באמצע הקפות"))
        add(S(b(o + 11.1), "n02", "frame", (0.5, 0.5, 1.0), (0.45, 0.48, 1.07), "warm", ("pulse",), 0.5, "(ריקודים עם ספרי התורה)"))
    add(S(b(o + 14.25), "n06", "full", WIDE, (0.40, 0.45, 0.60), "cool", (), 1.0, "לפתע הרבי בליבו"))
    if v == 0:
        add(S(b(o + 21.0), "n05", "full", WIDE, (0.56, 0.45, 0.68), "cool", (), 0.7, "כל החסידים היו מאוד עצובים (האב מרגיע את הילד)"))
        add(S(b(o + 24.5), "n06", "full", (0.75, 0.45, 0.55), (0.70, 0.42, 0.48), "cool", (), 0.6, "(חסידים מודאגים)"))
    else:
        add(S(b(o + 21.0), "n06", "frame", (0.5, 0.5, 1.0), (0.42, 0.46, 1.08), "cool", (), 0.7, "כל החסידים היו מאוד עצובים"))
        add(S(b(o + 24.5), "n05", "full", (0.62, 0.42, 0.55), (0.66, 0.42, 0.46), "cool", (), 0.6, "(הילד מביט באביו)"))
    add(S(b(o + 27.75), "n04", "full", WIDE, (0.72, 0.40, 0.60), "cool", (), 0.7, "רוצים את הרבי במהרה לראות"))
    add(S(b(o + 31.4), "n11", "full", WIDE, (0.56, 0.52, 0.55), "cool", ("leaves",), 0.6, "(חלונות 770)"))
    # ---- chorus ----
    add(S(b(o + 34.5), "n08", "full", WIDE, (0.55, 0.55, 0.68), "warm", ("glow",), 0.6, "כולם מתפללים לרפואתו"))
    add(S(b(o + 38.6), "n10", "full", (0.40, 0.50, 0.85), (0.62, 0.45, 0.58), "warm", ("glow",), 0.6, "מתי נראה אותו בתפילתו (מקומו של הרבי)"))
    add(S(b(o + 42.3), "n12", "full", WIDE, (0.45, 0.50, 0.68), "warm", ("leaves",), 0.6, "כולם מחכים לרבי שיבוא"))
    q = b(o + 46.6)
    cuts = [("n07", WIDE, (0.50, 0.58, 0.62)),
            ("n09", WIDE, (0.50, 0.45, 0.70)),
            ("n05", (0.68, 0.45, 0.55), (0.70, 0.45, 0.46)),
            ("n04", (0.25, 0.45, 0.55), (0.25, 0.42, 0.46))]
    if v == 1:
        cuts = [("n09", (0.40, 0.50, 0.70), (0.50, 0.45, 0.60)),
                ("n07", (0.50, 0.45, 0.70), (0.50, 0.40, 0.55)),
                ("n04", (0.75, 0.40, 0.55), (0.75, 0.38, 0.46)),
                ("n12", (0.66, 0.58, 0.55), (0.68, 0.58, 0.46))]
    for i, (src, a, bb) in enumerate(cuts):
        add(S(round(q + i * 3 * BEAT, 3), src, "full", a, bb, "warm", ("pulse",), 0.12, "מתי, מתי, עד מתי"))
    # ---- verse 2: the miracle ----
    add(S(b(o + 51.6), "n13", "full", (0.40, 0.48, 0.75), (0.38, 0.42, 0.55), "gold", ("glow", "sparkle"), 0.5, "בראש חודש כסלו קרה הנס", "ראש חודש כסלו"))
    add(S(b(o + 53.6), "n15", "full", WIDE, (0.52, 0.56, 0.36), "gold", ("glow",), 0.5, "(המצלמה מתקרבת לדלת 770)"))
    # THE REAL PHOTO (storyboard panel 16)
    p = 55.83 if v == 0 else b(o + PHOTO_T)
    add(S(p, "real_clean", "full", (0.50, 0.50, 1.00), (0.52, 0.44, 0.82), "none", (), "white", "יצא הרבי מחדרו פעם ראשונה – התמונה האמיתית"))
    add(S(b(p + 4.1), "real_clean", "full", (0.52, 0.44, 0.82), (0.50, 0.50, 1.00), "none", (), 0.0, "(התמונה האמיתית – תנועה חזרה)"))
    add(S(b(o + 63.5), "n14", "full", WIDE, (0.60, 0.50, 0.68), "warm", ("sparkle", "glow"), 0.9, "אל החסידים משבע מאות שבעים"))
    add(S(b(o + 66.6), "n20", "full", WIDE, (0.50, 0.40, 0.62), "warm", ("leaves", "sparkle"), 0.6, "(ההמון מול 770)"))
    if v == 0:
        add(S(b(o + 69.5), "n17", "full", WIDE, (0.36, 0.45, 0.68), "warm", ("sparkle", "pulse"), 0.6, "כולם כל כך שמחים, שרים ורוקדים"))
        add(S(b(o + 72.6), "n18", "full", (0.38, 0.50, 0.80), (0.62, 0.50, 0.80), "warm", ("sparkle", "pulse"), 0.5, "שרים ורוקדים"))
    else:
        add(S(b(o + 69.5), "n18", "full", (0.62, 0.50, 0.80), (0.40, 0.50, 0.80), "warm", ("sparkle", "pulse"), 0.6, "כולם כל כך שמחים, שרים ורוקדים"))
        add(S(b(o + 72.6), "n17", "frame", (0.5, 0.5, 1.0), (0.42, 0.46, 1.08), "warm", ("sparkle", "pulse"), 0.5, "שרים ורוקדים"))
    # ---- chorus (joyful, after the miracle) ----
    add(S(b(o + 75.6), "n19", "full", WIDE, (0.50, 0.45, 0.68), "warm", ("sparkle", "pulse", "leaves"), 0.6, "פזמון – ריקוד הילדים"))
    add(S(b(o + 79.3), "n08", "full", (0.55, 0.50, 0.75), (0.50, 0.50, 0.85), "gold", ("glow",), 0.6, "פזמון – מתי נראה אותו בתפילתו (תהילים – זיכרון חמים)"))
    add(S(b(o + 83.0), "n12" if v == 0 else "n20", "full", WIDE, (0.48, 0.48, 0.70) if v == 0 else (0.55, 0.42, 0.62), "warm", ("leaves", "sparkle"), 0.6, "פזמון – כולם מחכים לרבי (770)"))
    q = b(o + 86.6)
    joy = [("n17", (0.38, 0.45, 0.62), (0.36, 0.43, 0.52)),
           ("n18", (0.50, 0.50, 0.70), (0.55, 0.48, 0.60)),
           ("n19", (0.50, 0.48, 0.70), (0.50, 0.45, 0.58)),
           ("n14", (0.62, 0.48, 0.62), (0.64, 0.46, 0.52))]
    if v == 1:
        joy = joy[2:] + joy[:2]
    for i, (src, a, bb) in enumerate(joy):
        add(S(round(q + i * 4 * BEAT, 3), src, "full", a, bb, "warm", ("pulse", "sparkle"), 0.12, "פזמון – מתי, מתי (שמחה)"))
    return sh


def build():
    shots = one_pass(0.0, 0) + one_pass(PASS, 1)
    shots = [s for s in shots if s["t"] < b(183.5)]
    shots.append(S(b(183.5), "n20", "full", (0.5, 0.42, 0.62), (0.5, 0.48, 0.9), "warm", ("leaves", "sparkle", "glow"), 0.9,
                   "סיום – 770 בשמחה", "ראש חודש כסלו\nיום של הודיה ושמחה!"))
    shots = sorted(shots, key=lambda s: s["t"])
    return add_camera_moves(shots)


def add_camera_moves(shots):
    """Camera language (inspired by the movements in the reference video):
    slow push-ins with a gentle roll, hand-held drift on every shot, a focus pull
    into the prayer shots, an orbit-like roll on the dancing, whip-pans on the quick cuts."""
    for s in shots:
        if s["mode"] != "full" or s["src"] == "real_clean":
            continue
        if s["tin"] == 0.12:                       # quick cuts -> whip pan
            s["fx"].add("whip"); s["tin"] = 0.28
            s["roll"] = (-1.2, 1.2) if int(s["t"] / BEAT) % 2 else (1.2, -1.2)
        elif s["grade"] == "cool":                 # worry: slow uneasy roll settling
            s["roll"] = (-1.5, 0.0)
        elif "pulse" in s["fx"] and "sparkle" in s["fx"]:   # joy: orbiting camera
            s["roll"] = (2.0, -2.0); s["hand"] = 1.6
        elif s["src"] == "n15":                    # push into the 770 door
            s["roll"] = (0.0, 2.5)
        elif "glow" in s["fx"] and s["src"] in ("n08", "n10", "n13"):
            s["fx"].add("focus"); s["roll"] = (0.8, -0.4)
        elif s["src"] in ("n01", "n20", "n11", "n12"):
            s["roll"] = (-0.8, 0.4)                # crane / establishing
        else:
            s["roll"] = (0.6, -0.6)
    return shots


END = 198.0
TITLE = ("ראש חודש כסלו תשל״ח", "סיפור של תפילה, ציפייה ונס")
TITLE_T = (1.2, 6.9)
CARD_BG = "n20"

if __name__ == "__main__":
    for s in build():
        m, sec = divmod(s["t"], 60)
        print(f"{int(m)}:{sec:05.2f}  {s['src']:10s} {s['mode']:6s} {s['lyric']}")
