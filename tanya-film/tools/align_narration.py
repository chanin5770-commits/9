#!/usr/bin/env python3
"""Aligns the recorded narration to the narration script, sentence by sentence.

No speech recognition is available here, so the alignment is structural:
every sentence in the script ends at a pause in the recording, and a sentence's
spoken length is roughly proportional to its length in letters. A dynamic
programme picks, among all the pauses found in the audio, the set of sentence
boundaries that best fits those lengths (preferring longer pauses).

Output: src/data/narration-align.json — for every script segment (see
tools/narration_doc.py) its start/end in the recording and each sentence's
start/end. A report of the fit (how far each sentence is from its expected
length) is printed, so a bad fit is visible rather than silent.

Run:  python3 tools/align_narration.py [source/narration-v1.wav]
"""
import json, os, re, subprocess, sys
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WAV = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'source', 'narration-v1.wav')

spec = importlib.util.spec_from_file_location('nd', os.path.join(ROOT, 'tools', 'narration_doc.py'))
nd = importlib.util.module_from_spec(spec)
sys.argv_backup = sys.argv
spec.loader.exec_module(nd)  # also regenerates the docs; harmless

NIKUD = re.compile(r'[֑-ׇ]')


def sentences(text):
    """split a segment's voice text into sentences (they end in . ? or !; the voice
    tool does not reliably pause after a colon, so a colon does not split)"""
    t = nd.voice_text(text).replace('¶', ' ').replace('//', ' ').replace('/', ' ')
    t = re.sub(r'\s+', ' ', t).strip()
    parts = re.split(r'(?<=[.?!])\s+(?=[^\s])', t)
    out = []
    for p in parts:
        if out and len(re.findall(r'[א-ת]', p)) < 4:  # stray fragment: glue to previous
            out[-1] += ' ' + p
        else:
            out.append(p)
    return out


units = []  # (segment index, sentence text)
segs = [(i, s) for i, s in enumerate(nd.SEGMENTS) if s[4]]
for i, s in segs:
    for sen in sentences(s[4]):
        units.append((i, sen))
weight = [len(re.findall(r'[א-ת]', NIKUD.sub('', u[1]))) for u in units]

# ---- pauses in the recording ----
r = subprocess.run(['ffmpeg', '-nostdin', '-i', WAV, '-af', 'silencedetect=noise=-38dB:d=0.25', '-f', 'null', '-'],
                   capture_output=True, text=True)
starts = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', r.stderr)]
ends = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', r.stderr)]
dur = float(re.search(r'Duration: (\d+):(\d+):([0-9.]+)', r.stderr).groups()[2]) + 60 * int(re.search(r'Duration: (\d+):(\d+)', r.stderr).groups()[1])
pauses = list(zip(starts, ends + [dur] * (len(starts) - len(ends))))
speech0 = pauses[0][1] if pauses and pauses[0][0] < 0.05 else 0.0
pauses = [p for p in pauses if p[0] > speech0 + 0.05]
speech1 = pauses[-1][0] if pauses and pauses[-1][1] >= dur - 0.05 else dur
cuts = [p for p in pauses if p[1] < speech1 - 0.05]  # candidate boundaries (inside the speech)

N, M = len(units), len(cuts)
# expected seconds per letter, from the whole recording minus the pauses we will cut at
rate = (speech1 - speech0 - 0.75 * (N - 1)) / sum(weight)

# DP over (sentence i ends at cut j)
INF = float('inf')
pos_start = [speech0] + [c[1] for c in cuts]  # where a sentence may start
pos_end = [c[0] for c in cuts] + [speech1]    # where a sentence may end (index M = end of file)
best = [[INF] * (M + 1) for _ in range(N)]
back = [[-1] * (M + 1) for _ in range(N)]


def cost(i, a, b):
    exp = rate * weight[i]
    got = pos_end[b] - pos_start[a]
    if got <= 0:
        return INF
    c = ((got - exp) / max(0.8, exp ** 0.5)) ** 2
    if b < M:  # prefer cutting at longer pauses
        c -= 2.0 * min(1.2, cuts[b][1] - cuts[b][0])
    return c


for b in range(M + 1):
    best[0][b] = cost(0, 0, b)
for i in range(1, N):
    for b in range(i, M + 1):
        bi, bb = INF, -1
        lo = max(i - 1, b - 14)  # a sentence spans at most ~14 pauses
        for a in range(lo, b):
            if best[i - 1][a] == INF:
                continue
            v = best[i - 1][a] + cost(i, a + 1, b)
            if v < bi:
                bi, bb = v, a
        best[i][b], back[i][b] = bi, bb
# the last sentence must end at the end of the speech
path = [M]
for i in range(N - 1, 0, -1):
    path.append(back[i][path[-1]])
path.reverse()  # path[i] = end cut index of sentence i

sent_times = []
for i in range(N):
    a = speech0 if i == 0 else cuts[path[i - 1]][1]
    b = pos_end[path[i]]
    sent_times.append((round(a, 3), round(b, 3)))

# ---- report + output ----
out, worst = [], []
for k, (i, s) in enumerate(segs):
    ss = [(u[1], sent_times[n]) for n, u in enumerate(units) if u[0] == i]
    out.append({'segment': k, 'scene': s[0], 'window': [s[1], s[2]], 'start': ss[0][1][0], 'end': ss[-1][1][1],
                'sentences': [{'text': NIKUD.sub('', t), 'start': a, 'end': b} for t, (a, b) in ss]})
for n, (a, b) in enumerate(sent_times):
    exp = rate * weight[n]
    worst.append((abs((b - a) - exp) / exp, n, b - a, exp))
json.dump({'file': os.path.relpath(WAV, ROOT), 'duration': dur, 'rate_s_per_letter': rate, 'segments': out},
          open(os.path.join(ROOT, 'src', 'data', 'narration-align.json'), 'w'), ensure_ascii=False, indent=1)
print(f'{N} sentences, {M} candidate pauses, speech {speech0:.2f}–{speech1:.2f}s, {rate * 1000:.1f} ms/letter')
worst.sort(reverse=True)
print('largest deviations (actual vs expected length):')
for d, n, got, exp in worst[:8]:
    print(f'  {d * 100:4.0f}%  {got:5.2f}s vs {exp:5.2f}s  {NIKUD.sub("", units[n][1])[:60]}')
for o in out:
    print(f"{o['scene']} seg{o['segment']:02d}  audio {o['start']:7.2f}–{o['end']:7.2f} ({o['end'] - o['start']:5.2f}s)  window {o['window'][1] - o['window'][0]:5.1f}s")
