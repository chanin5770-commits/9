#!/usr/bin/env python3
"""Gentle, per-photo enhancement for the Zvi video.

photos/original/*.jpg  (never modified)
  -> photos/enhanced/*.jpg   (exposure, white balance, light denoise, gentle sharpening)
  -> photos/bg/*.jpg         (small blurred, royal-blue tinted copy used behind framed photos)
  -> out/qa/enhance-before-after.jpg  (contact sheet: original on the right, enhanced on the left)

Faces, clothing, kippot and peyot are never altered: every step is a global tone/colour
operation applied to the whole frame, with no geometry change and no cropping.
"""
import glob, os
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'photos', 'original')
DST = os.path.join(ROOT, 'photos', 'enhanced')
BG = os.path.join(ROOT, 'photos', 'bg')
QA = os.path.join(ROOT, 'out', 'qa')
for d in (DST, BG, QA):
    os.makedirs(d, exist_ok=True)

# Softer source photos get a bit more sharpening (measured Laplacian variance < 200).
EXTRA_SHARP = {'p12_tiles', 'p17_puzzle2', 'p19_crown', 'p04_portrait', 'p20_treats2'}


def white_balance(img, strength=0.45):
    """Grey-world estimated only on neutral (low-saturation, mid-tone) pixels,
    so the red cape and blue chairs do not skew the result."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    v = hsv[..., 2]
    mask = (hsv[..., 1] < 45) & (v > 60) & (v < 235)
    if mask.sum() < 5000:
        return img
    f = img.astype(np.float32)
    means = np.array([f[..., c][mask].mean() for c in range(3)])
    gain = means.mean() / means
    gain = 1 + (gain - 1) * strength
    return np.clip(f * gain, 0, 255).astype(np.uint8)


def tone(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    L = lab[..., 0].astype(np.float32)
    # Levels: stretch black/white points slightly (bounded so nothing clips hard).
    lo = min(np.percentile(L, 0.5), 18)
    hi = max(np.percentile(L, 99.6), 238)
    L = np.clip((L - lo) / (hi - lo) * 255, 0, 255)
    # Midtone lift for darker photos (target mean ~150).
    m = L.mean()
    if m < 150:
        g = np.log(150 / 255) / np.log(max(m, 40) / 255)
        g = max(g, 0.78)
        L = 255 * (L / 255) ** g
    # Local contrast / shadow opening (CLAHE) blended softly.
    Lu = L.astype(np.uint8)
    cl = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(8, 8)).apply(Lu).astype(np.float32)
    L = L * 0.6 + cl * 0.4
    lab[..., 0] = np.clip(L, 0, 255).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def vibrance(img, amt=0.10):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    s = hsv[..., 1] / 255
    s = s + amt * (1 - s) * s * 1.6  # boosts muted colours more than saturated ones (keeps skin natural)
    hsv[..., 1] = np.clip(s * 255, 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


def sharpen(img, amount, sigma=1.1):
    blur = cv2.GaussianBlur(img, (0, 0), sigma)
    return cv2.addWeighted(img, 1 + amount, blur, -amount, 0)


def enhance(path):
    name = os.path.splitext(os.path.basename(path))[0]
    img = cv2.imread(path)
    out = cv2.fastNlMeansDenoisingColored(img, None, 3, 3, 7, 21)  # light: WhatsApp JPEG noise only
    out = white_balance(out)
    out = tone(out)
    out = vibrance(out)
    out = sharpen(out, 0.55 if name in EXTRA_SHARP else 0.35)
    cv2.imwrite(os.path.join(DST, name + '.jpg'), out, [cv2.IMWRITE_JPEG_QUALITY, 95])

    # Blurred background plate
    h, w = out.shape[:2]
    small = cv2.resize(out, (240, int(240 * h / w)), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 9)
    tint = np.zeros_like(small); tint[:] = (110, 40, 12)  # deep royal blue (BGR)
    small = cv2.addWeighted(small, 0.55, tint, 0.45, 0)
    cv2.imwrite(os.path.join(BG, name + '.jpg'), small, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return img, out


def main():
    rows = []
    for p in sorted(glob.glob(os.path.join(SRC, '*.jpg'))):
        a, b = enhance(p)
        th = 360
        sa = cv2.resize(a, (int(a.shape[1] * th / a.shape[0]), th))
        sb = cv2.resize(b, (int(b.shape[1] * th / b.shape[0]), th))
        pair = np.hstack([sb, np.full((th, 6, 3), 255, np.uint8), sa])
        cv2.putText(pair, os.path.basename(p)[:-4], (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        rows.append(pair)
        print('enhanced', os.path.basename(p))
    # Contact sheet, 4 pairs per row
    W = 1500
    lines, cur, cw = [], [], 0
    for r in rows:
        if cw + r.shape[1] > W and cur:
            lines.append(cur); cur, cw = [], 0
        cur.append(r); cw += r.shape[1] + 10
    if cur: lines.append(cur)
    out_rows = []
    for ln in lines:
        row = np.hstack(sum([[x, np.zeros((360, 10, 3), np.uint8)] for x in ln], []))
        row = np.hstack([row, np.zeros((360, W + 200 - row.shape[1], 3), np.uint8)]) if row.shape[1] < W + 200 else row[:, :W + 200]
        out_rows.append(row)
    cv2.imwrite(os.path.join(QA, 'enhance-before-after.jpg'), np.vstack(out_rows), [cv2.IMWRITE_JPEG_QUALITY, 85])


if __name__ == '__main__':
    main()
