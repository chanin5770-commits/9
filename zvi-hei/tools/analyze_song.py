#!/usr/bin/env python3
"""Swap in your own song:  python3 tools/analyze_song.py audio/my-song.mp3
Detects tempo, the first downbeat and the length, and rewrites src/config.js.
The video timeline then re-flows: every cut stays on a bar line, and photo scenes
stretch (or shrink) so the finale lands on the end of the song. Then: node tools/render.cjs
"""
import sys, os, json
import numpy as np, librosa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
song = sys.argv[1]
y, sr = librosa.load(os.path.join(ROOT, song) if not os.path.isabs(song) else song, sr=22050, mono=True)
dur = len(y) / sr
tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
bt = librosa.frames_to_time(beats, sr=sr)
onset = librosa.onset.onset_strength(y=y, sr=sr)
# downbeat phase = the beat position (of 4) with the strongest accents
strength = [onset[beats[k::4]].sum() if len(beats[k::4]) else 0 for k in range(4)]
first = float(bt[int(np.argmax(strength))]) if len(bt) else 0.0
bpm = float(np.atleast_1d(tempo)[0])
cfg = {'song': os.path.relpath(os.path.join(ROOT, song), ROOT) if not os.path.isabs(song) else song,
       'bar': round(4 * 60 / bpm, 4), 'offset': round(first, 3), 'duration': round(dur, 3)}
with open(os.path.join(ROOT, 'src', 'config.js'), 'w') as f:
    f.write('// Written by tools/analyze_song.py\nwindow.ZVI_CONFIG = ' + json.dumps(cfg) + ';\n')
print(f'BPM {bpm:.1f}  bar {cfg["bar"]}s  first downbeat {first:.2f}s  length {dur:.1f}s')
