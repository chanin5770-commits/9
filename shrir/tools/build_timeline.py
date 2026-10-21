#!/usr/bin/env python3
"""Turns content/script.json (+ narration/timing.json when a recording exists)
into build/timeline.json and dist/shrir.srt.

Narration drives the edit: every line is placed after the previous one plus its
pause, and shots, captions, steps and music markers hang off the cue times.

Without a recording, line lengths are estimated from a calm Hebrew reading pace
(ESTIMATE_CPS letters per second). With narration/timing.json (written by
tools/align_narration.py) the measured lengths are used instead, so re-running
this script re-times the whole film to the real voice.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESTIMATE_CPS = 12.5          # Hebrew letters/sec for a warm, unhurried read
DEFAULT_PAUSE = 0.45
DEFAULT_LEAD = 0.6
DEFAULT_TAIL = 0.75
XFADE_IN = 0.55              # dissolve between shots of one section
XFADE_SECTION = 0.85         # dissolve between sections
XFADE_SAME = 0.3             # re-framing within one picture
MAX_HOLD = 1.5               # longest extra breath between sections


def letters(s):
    return len(re.findall(r'[א-ת]', s))


def estimate(text):
    commas = len(re.findall(r'[,:?—]', text))
    return round(0.3 + letters(text) / ESTIMATE_CPS + 0.16 * commas, 2)


def load_json(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def main():
    script = load_json(os.path.join(ROOT, 'content/script.json'))
    tpath = os.path.join(ROOT, 'narration/timing.json')
    timing = load_json(tpath) if os.path.exists(tpath) else None
    recorded = timing['lines'] if timing else {}

    t = 0.0
    out = {'fps': 30, 'width': 1080, 'height': 1920, 'narration': None,
           'sections': [], 'shots': [], 'cues': [], 'captions': [], 'steps': [],
           'tools': [], 'voice': [], 'markers': {}}
    if timing:
        out['narration'] = timing['file']

    for si, sec in enumerate(script['sections']):
        # follow the planned timecodes, but never wait more than MAX_HOLD for them;
        # the previous section's last shot holds over the breath
        start = max(min(sec.get('plannedStart', 0), t + MAX_HOLD), t) if si else 0.0
        if si and start > t:
            out['sections'][-1]['end'] = round(start, 3)
            out['shots'][-1]['end'] = round(start, 3)
        cur = start + sec.get('lead', DEFAULT_LEAD)
        cues = []          # (start, end, text) for this section
        line_starts = []
        last_end = cur
        for li, line in enumerate(sec['lines']):
            key = f"{sec['id']}.{li}"
            if key in recorded:
                r = recorded[key]
                dur = r['end'] - r['start']
                out['voice'].append({'id': key, 'at': round(cur, 3), 'src': r['start'], 'dur': round(dur, 3)})
            else:
                dur = estimate(line['text'])
            line_starts.append(cur)
            parts = line.get('cues', [line['text']])
            # split the line's time between its cues by letter count
            total = sum(max(letters(p), 1) for p in parts)
            c = cur
            for p in parts:
                d = dur * max(letters(p), 1) / total
                cues.append([c, c + d, p])
                c += d
            last_end = cur + dur
            cur = last_end + line.get('pauseAfter', DEFAULT_PAUSE)
        end = last_end + sec.get('tail', DEFAULT_TAIL)
        if 'endCard' in sec:
            out['markers']['endCard'] = round(last_end + 1.2, 3)
            end = last_end + 1.2 + sec['endCard']['hold']

        # subtitles: hold each cue until just before the next one, so text never flickers
        for k, (cs, ce, txt) in enumerate(cues):
            nxt = cues[k + 1][0] if k + 1 < len(cues) else ce + 0.6
            out['cues'].append({'section': sec['id'], 'start': round(cs, 3),
                                'end': round(min(max(ce + 0.35, cs + 1.2), nxt - 0.06), 3), 'text': txt})
        cue_t = [c[0] for c in cues] + [end]
        line_t = line_starts + [end]

        def at(spec, default):
            if 'untilCue' in spec: return cue_t[spec['untilCue']]
            if 'untilLine' in spec: return line_t[spec['untilLine']]
            return default

        def frm(spec):
            if 'fromCue' in spec: return cue_t[spec['fromCue']]
            if 'fromLine' in spec: return line_t[spec['fromLine']]
            return start

        # shots: cut a beat before the cue they belong to
        s0 = start
        for k, sh in enumerate(sec['shots']):
            s1 = at(sh, end) - (0.25 if k + 1 < len(sec['shots']) else 0)
            if k + 1 == len(sec['shots']): s1 = end
            out['shots'].append({'section': sec['id'], 'img': sh['img'], 'start': round(s0, 3), 'end': round(s1, 3),
                                 'from': sh['from'], 'to': sh['to'], 'dim': sh.get('dim', False),
                                 'warm': sh.get('warm', False), 'mood': sec.get('mood', 'warm'),
                                 # a quick dissolve between two framings of one picture, so it never ghosts
                                 'xfade': XFADE_SECTION if k == 0 else (XFADE_SAME if sec['shots'][k - 1]['img'] == sh['img'] else XFADE_IN)})
            s0 = s1

        caps = sec.get('captions') or ([dict(sec['caption'])] if 'caption' in sec else [])
        for cp in caps:
            cs = frm(cp)
            ce = line_t[cp['untilLine']] - 0.2 if 'untilLine' in cp else end - 0.5
            if 'endCard' in sec:
                ce = min(ce, out['markers']['endCard'] - 0.3)
            out['captions'].append({'text': cp['text'], 'start': round(cs + 0.2, 3), 'end': round(ce, 3)})
        steps = sec.get('steps', [])
        for k, st in enumerate(steps):
            # one step on screen at a time: each gives way just before the next
            e = cue_t[steps[k + 1]['atCue']] - 0.15 if k + 1 < len(steps) else cue_t[min(st['atCue'] + 1, len(cues))] + 1.6
            out['steps'].append({'text': st['text'], 'index': k, 'start': round(cue_t[st['atCue']], 3), 'end': round(e, 3)})
        for tl in sec.get('tools', []):
            out['tools'].append({'instead': tl['instead'], 'say': tl['say'],
                                 'insteadAt': round(cue_t[tl['insteadAtCue']], 3) if tl['instead'] else None,
                                 'sayAt': round(cue_t[tl['sayAtCue']], 3),
                                 'end': round(cue_t[tl['untilCue']] - 0.15, 3)})
        if 'musicStopAfterLine' in sec:
            li = sec['musicStopAfterLine']
            ln = sec['lines'][li]
            out['markers']['musicStop'] = round(line_starts[li] + (line_t[li + 1] - line_starts[li]) - ln.get('pauseAfter', DEFAULT_PAUSE), 3)
            out['markers']['musicResume'] = round(line_t[li + 1] - 0.1, 3)
        if 'heartRiseAtCue' in sec:
            out['markers']['climax'] = round(cue_t[sec['heartRiseAtCue']], 3)
        if sec['id'] == 's10':
            out['markers']['returnYard'] = round(start, 3)
        out['sections'].append({'id': sec['id'], 'name': sec['name'], 'start': round(start, 3), 'end': round(end, 3),
                                'heart': sec.get('heart', 0), 'mood': sec.get('mood', 'warm'),
                                'heartAt': round(cues[0][0] if cues else start, 3)})
        if 'endCard' in sec:
            out['endCard'] = dict(sec['endCard'], start=out['markers']['endCard'])
        t = end

    out['duration'] = round(t, 3)
    out['frames'] = int(round(t * out['fps']))
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    with open(os.path.join(ROOT, 'build/timeline.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    def ts(x):
        ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
        return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    with open(os.path.join(ROOT, 'dist/shrir.srt'), 'w', encoding='utf-8') as f:
        for i, c in enumerate(out['cues'], 1):
            # RLE/PDF marks keep players that ignore bidi from flipping trailing punctuation
            f.write(f"{i}\n{ts(c['start'])} --> {ts(c['end'])}\n‫{c['text']}‬\n\n")
    # human-readable scene timings next to the film
    with open(os.path.join(ROOT, 'dist/timings.csv'), 'w', encoding='utf-8-sig') as f:
        f.write('section,name,start,end,shot_image,shot_start,shot_end\n')
        for sc in out['sections']:
            for sh in (x for x in out['shots'] if x['section'] == sc['id']):
                f.write(f"{sc['id']},{sc['name']},{sc['start']:.2f},{sc['end']:.2f},{sh['img']},{sh['start']:.2f},{sh['end']:.2f}\n")
    mode = 'recorded narration' if timing else 'estimated narration pace (no recording yet)'
    print(f"timeline: {out['duration']:.1f}s, {len(out['shots'])} shots, {len(out['cues'])} cues — {mode}")
    for s in out['sections']:
        print(f"  {s['id']} {s['start']:6.1f}–{s['end']:6.1f}  {s['name']}")


if __name__ == '__main__':
    main()
