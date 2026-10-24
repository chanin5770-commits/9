# Beat tracking and letter timing.
# Usage: python3 beats.py song.mp3 out.json
# The two alphabet sections sing one letter per beat; the first letter of each was
# located with transcribe_windows.py (2 s windows, 0.4 s hop) and confirmed against
# vocal onsets. The 22 letter times are a straight-line fit through those beats.
import sys, json
import numpy as np, librosa

y, sr = librosa.load(sys.argv[1], sr=22050, mono=True)
_, frames = librosa.beat.beat_track(y=y, sr=sr)
bt = librosa.frames_to_time(frames, sr=sr)

def letters(first):
    i = int(np.argmin(abs(bt - first)))
    k = np.arange(22)
    return [round(float(x), 3) for x in np.polyval(np.polyfit(k, bt[i:i + 22], 1), k)]

json.dump({'beats': [round(float(x), 3) for x in bt], 'chant1': letters(39.36), 'chant2': letters(89.95)}, open(sys.argv[2], 'w'))
