#!/usr/bin/env python3
"""Render the launch film.

    python3 render.py                    -> dist/kingdom-launch-9x16.mp4 (video + score)
    python3 render.py --stills 1.5,9,48  -> work/stills/*.jpg for checking frames
    python3 render.py --jobs 4           -> number of parallel render workers

Needs ffmpeg, numpy and Pillow built with raqm (for Hebrew shaping).
"""
import argparse
import os
import subprocess
import sys
from multiprocessing import Process

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import film  # noqa: E402
import score  # noqa: E402
from kit import FPS, W, H  # noqa: E402

DIST = os.path.join(HERE, 'dist')
OUT = os.path.join(DIST, 'kingdom-launch-9x16.mp4')


def worker(i, f0, f1, path):
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                            '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium',
                            '-crf', '10', '-pix_fmt', 'yuv420p', path], stdin=subprocess.PIPE)
    for n in range(f0, f1):
        enc.stdin.write(film.frame(n / FPS).tobytes())
        if i == 0 and (n - f0) % 60 == 0:
            print(f'  worker 0: {n - f0}/{f1 - f0}', flush=True)
    enc.stdin.close()
    enc.wait()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stills')
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 4)
    a = ap.parse_args()
    film.extract_all()
    if a.stills:
        d = os.path.join(film.WORK, 'stills')
        os.makedirs(d, exist_ok=True)
        for s in a.stills.split(','):
            film.frame(float(s)).save(os.path.join(d, f'{float(s):06.2f}.jpg'), quality=88)
        return
    os.makedirs(DIST, exist_ok=True)
    total = int(round(film.DURATION * FPS))
    print(f'{total} frames, {film.DURATION:.2f}s')
    wav = os.path.join(film.WORK, 'score.wav')
    score.write(wav, film)
    parts, procs = [], []
    step = -(-total // a.jobs)
    for i in range(a.jobs):
        f0, f1 = i * step, min(total, (i + 1) * step)
        p = os.path.join(film.WORK, f'part{i}.mp4')
        parts.append(p)
        pr = Process(target=worker, args=(i, f0, f1, p))
        pr.start()
        procs.append(pr)
    for pr in procs:
        pr.join()
        if pr.exitcode:
            sys.exit('a render worker failed')
    lst = os.path.join(film.WORK, 'parts.txt')
    with open(lst, 'w') as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-i', wav,
                    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
                    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                    '-c:a', 'aac', '-b:a', '256k', '-shortest', OUT], check=True)
    print('wrote', OUT)


if __name__ == '__main__':
    main()
