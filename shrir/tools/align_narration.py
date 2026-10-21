#!/usr/bin/env python3
"""Maps a narration recording onto the script's lines -> narration/timing.json.

Record every line of content/script.json in order, in one take, leaving a
short breath (about half a second or more) between lines. Then:

    python3 tools/align_narration.py narration/narration.wav
    python3 tools/build_timeline.py      # re-time the film to the voice
    python3 tools/score.py               # music, effects and the voice, ducked
    node tools/render.cjs

The script finds the pauses with ffmpeg's silencedetect and, when it finds more
pauses than line breaks (a breath inside a sentence), keeps the longest ones.
It prints every line with its time so the result can be checked by ear; fix any
line by hand in narration/timing.json if needed.
"""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    wav = sys.argv[1]
    noise = sys.argv[2] if len(sys.argv) > 2 else '-38dB'
    script = json.load(open(os.path.join(ROOT, 'content/script.json'), encoding='utf-8'))
    keys, texts = [], []
    for sec in script['sections']:
        for i, ln in enumerate(sec['lines']):
            keys.append(f"{sec['id']}.{i}"); texts.append(ln['text'])

    log = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', f'silencedetect=noise={noise}:d=0.28', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    dur = float(re.search(r'Duration: (\d+):(\d+):([\d.]+)', log).groups()[2]) + \
        60 * float(re.search(r'Duration: (\d+):(\d+)', log).group(2)) + 3600 * float(re.search(r'Duration: (\d+)', log).group(1))
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
    silences = list(zip(starts, ends + [dur] * (len(starts) - len(ends))))

    # speech runs between silences
    runs, t = [], 0.0
    for s0, s1 in silences:
        if s0 - t > 0.12:
            runs.append([t, s0])
        t = s1
    if dur - t > 0.12:
        runs.append([t, dur])
    if len(runs) < len(keys):
        sys.exit(f'found {len(runs)} spoken phrases but the script has {len(keys)} lines. '
                 f'Leave a clearer pause between lines, or try a different threshold, e.g. -32dB.')
    # merge the shortest gaps until there is one run per line
    while len(runs) > len(keys):
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        i = gaps.index(min(gaps))
        runs[i:i + 2] = [[runs[i][0], runs[i + 1][1]]]

    pad = 0.04
    lines = {k: {'start': round(max(r[0] - pad, 0), 3), 'end': round(min(r[1] + pad, dur), 3)} for k, r in zip(keys, runs)}
    out = {'file': os.path.relpath(os.path.abspath(wav), ROOT), 'lines': lines}
    os.makedirs(os.path.join(ROOT, 'narration'), exist_ok=True)
    with open(os.path.join(ROOT, 'narration/timing.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    for k, txt in zip(keys, texts):
        r = lines[k]
        print(f"{k:6s} {r['start']:7.2f}–{r['end']:7.2f}  ({r['end'] - r['start']:4.1f}s)  {txt}")
    print('wrote narration/timing.json')


if __name__ == '__main__':
    main()
