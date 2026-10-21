#!/usr/bin/env python3
"""Cuts the storyboard into one clean picture per scene.

assets/source/storyboard.png (5 columns × 3 rows, read right-to-left) ->
  assets/scenes/raw/NN.png    exact cell, no margins, separators or scene numbers
  assets/scenes/clean/NN.png  same, with the heart badge in the top-right removed
                              (the film draws its own progress heart)
Then run tools/upscale.py for assets/scenes/hd/.
"""
import os
import cv2, numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREAM = np.array([254, 247, 232])     # board background


def runs(mask, th):
    out, s = [], None
    for i, v in enumerate(mask > th):
        if v and s is None: s = i
        if not v and s is not None: out.append((s, i - 1)); s = None
    if s is not None: out.append((s, len(mask) - 1))
    return out


def cells(img):
    im = np.asarray(img).astype(int)
    cream = np.abs(im - CREAM).sum(2) < 22
    gx = runs(cream.mean(0), 0.6)            # vertical gutters
    gy = runs(cream.mean(1), 0.6)            # horizontal gutters (with the number strips)
    xs = [0] + [v for g in gx for v in (g[0], g[1] + 1)] + [im.shape[1]]
    ys = [0] + [v for g in gy for v in (g[0], g[1] + 1)] + [im.shape[0]]
    cols = [(xs[i], xs[i + 1]) for i in range(0, len(xs) - 1, 2) if xs[i + 1] - xs[i] > 100]
    rows = [(ys[i], ys[i + 1]) for i in range(0, len(ys) - 1, 2) if ys[i + 1] - ys[i] > 100]
    assert len(cols) == 5 and len(rows) == 3, (cols, rows)
    loose = np.abs(im - CREAM).sum(2) < 40
    out = []
    for y0, y1 in rows:
        for x0, x1 in reversed(cols):        # scene 01 is the rightmost cell
            sub = ~loose[y0:y1, x0:x1]
            r = np.where(sub.mean(1) > 0.9)[0]
            c = np.where(sub.mean(0) > 0.9)[0]
            # a bright sky can read as board colour: only trust trims of a few pixels
            ty0 = y0 + (r[0] if r[0] < 8 else 0); ty1 = y0 + (r[-1] if y1 - y0 - r[-1] < 8 else y1 - y0 - 1)
            tx0 = x0 + (c[0] if c[0] < 8 else 0); tx1 = x0 + (c[-1] if x1 - x0 - c[-1] < 8 else x1 - x0 - 1)
            out.append((tx0 + 2, ty0 + 2, tx1 - 1, ty1 - 1))   # drop the anti-aliased edge
    return out


def ring_mask(reg):
    sat = reg.max(2) - reg.min(2)
    return ndimage.binary_closing((reg.min(2) > 170) & (sat < 60), iterations=1)


def heart_from_ring(ring):
    full = ndimage.binary_fill_holes(ring)
    lab, n = ndimage.label(full)
    if n == 0: return full
    sizes = ndimage.sum(full, lab, range(1, n + 1))
    return lab == (np.argmax(sizes) + 1)


def main():
    img = Image.open(os.path.join(ROOT, 'assets/source/storyboard.png')).convert('RGB')
    for d in ('raw', 'clean'):
        os.makedirs(os.path.join(ROOT, 'assets/scenes', d), exist_ok=True)
    boxes = cells(img)
    for n, box in enumerate(boxes, 1):
        img.crop(box).save(os.path.join(ROOT, f'assets/scenes/raw/{n:02d}.png'))
        print(f'{n:02d}', box)

    # reference heart shape from a cell whose badge outline is closed
    ref = cv2.imread(os.path.join(ROOT, 'assets/scenes/raw/10.png')).astype(int)
    w = ref.shape[1]
    tpl = heart_from_ring(ring_mask(ref[5:42, w - 42:w - 5]))
    ys, xs = np.where(tpl)
    tpl = tpl[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    tpl_outline = tpl & ~ndimage.binary_erosion(tpl, iterations=2)
    for n in range(1, len(boxes) + 1):
        im = cv2.imread(os.path.join(ROOT, f'assets/scenes/raw/{n:02d}.png'))
        H, W = im.shape[:2]
        x0, y0, x1, y1 = W - 42, 5, W - 5, 42
        ring = ring_mask(im[y0:y1, x0:x1].astype(int))
        full = heart_from_ring(ring)
        if full.sum() < 300:   # outline not closed on a bright background: place the reference shape
            res = cv2.matchTemplate(ring.astype(np.float32), tpl_outline.astype(np.float32), cv2.TM_CCORR)
            _, _, _, (px, py) = cv2.minMaxLoc(res)
            full = np.zeros_like(ring); full[py:py + tpl.shape[0], px:px + tpl.shape[1]] = tpl
        m = np.zeros((H, W), np.uint8); m[y0:y1, x0:x1] = full * 255
        m = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=2)
        cv2.imwrite(os.path.join(ROOT, f'assets/scenes/clean/{n:02d}.png'), cv2.inpaint(im, m, 4, cv2.INPAINT_TELEA))


if __name__ == '__main__':
    main()
