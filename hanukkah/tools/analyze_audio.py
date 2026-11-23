"""Analyse every clip's original soundtrack: loudness, tempo, beats, onsets, music-vs-quiet."""
import json, glob, os, sys
import numpy as np, librosa
out = {}
for p in sorted(glob.glob('work/audio/*.wav')):
    b = os.path.basename(p)[:-4]
    y, sr = librosa.load(p, sr=22050)
    hop = 512
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    db = 20*np.log10(rms+1e-6)
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=hop)
    bt = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
    # beat regularity: std of IBI relative to mean
    ibi = np.diff(bt); reg = float(np.std(ibi)/np.mean(ibi)) if len(ibi)>2 else 9
    # 1-second loudness profile
    sec = int(len(y)/sr)
    prof = [round(float(20*np.log10(np.sqrt(np.mean(y[i*sr:(i+1)*sr]**2))+1e-6)),0) for i in range(sec)]
    peaks = librosa.onset.onset_detect(onset_envelope=onset, sr=sr, hop_length=hop, units='time')
    # strong hits: top 5% onset strength
    thr = np.percentile(onset, 97)
    strong = librosa.frames_to_time(np.where((onset>thr)&(onset==np.maximum.reduce([np.roll(onset,i) for i in range(-3,4)])))[0], sr=sr, hop_length=hop)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=2048).mean(axis=1)
    out[b] = dict(dur=len(y)/sr, tempo=float(np.atleast_1d(tempo)[0]), regularity=reg, beats=[round(float(t),3) for t in bt],
                  strong=[round(float(t),3) for t in strong], loud=prof, chroma=[round(float(c),3) for c in chroma/chroma.max()])
    print(f"{b} dur={len(y)/sr:5.1f} tempo={out[b]['tempo']:6.1f} reg={reg:.2f} meandb={np.mean(prof):.0f} loud={prof}")
json.dump(out, open('work/audio_analysis.json','w'))
