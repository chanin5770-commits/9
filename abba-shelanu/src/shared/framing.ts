// Face-safe framing and camera moves. Photos are only ever scaled uniformly and moved:
// no warping, no generated pixels, so faces stay exactly as they were photographed.

import type { Box, Effect, Photo } from './types';

export type Frame = {
  mode: 'cover' | 'contain';
  // displayed image size and position inside the cell (px)
  w: number; h: number; left: number; top: number;
};

export type Plan = {
  mode: 'cover' | 'contain';
  z0: number; z1: number;
  c0: { x: number; y: number }; c1: { x: number; y: number };
  faceSafe: boolean;   // all faces stay fully inside the cell for the whole move
  effect: Effect;      // effective effect (may differ from requested if unsafe)
};

const FACE_PAD_X = 0.35, FACE_PAD_TOP = 0.55, FACE_PAD_BOTTOM = 0.35; // head + hair + chin around a face box

/** Region that must never be cut: all faces (with hair/chin margin) or the manual focus. */
export function protectedBox(p: Pick<Photo, 'faces' | 'focus' | 'w' | 'h'>): Box | null {
  if (p.focus) return { x: Math.max(0, p.focus.x - 0.1), y: Math.max(0, p.focus.y - 0.1), w: 0.2, h: 0.2 };
  if (!p.faces || p.faces.length === 0) return null;
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const f of p.faces) {
    x0 = Math.min(x0, f.x - f.w * FACE_PAD_X);
    x1 = Math.max(x1, f.x + f.w * (1 + FACE_PAD_X));
    y0 = Math.min(y0, f.y - f.h * FACE_PAD_TOP);
    y1 = Math.max(y1, f.y + f.h * (1 + FACE_PAD_BOTTOM));
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(1, x1); y1 = Math.min(1, y1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const coverLoss = (imgAR: number, cellAR: number) => 1 - Math.min(imgAR, cellAR) / Math.max(imgAR, cellAR);

// visible window (fraction of the image) for a cover fit at zoom z
const windowSize = (imgAR: number, cellAR: number, z: number) =>
  imgAR > cellAR ? { vw: cellAR / imgAR / z, vh: 1 / z } : { vw: 1 / z, vh: imgAR / cellAR / z };

const rangeFor = (v: number, lo: number, hi: number, size: number) => {
  // centers c such that [c-size/2, c+size/2] stays inside [0,1] and contains [lo, hi]
  const a = Math.max(size / 2, hi - size / 2), b = Math.min(1 - size / 2, lo + size / 2);
  return a <= b + 1e-9 ? [a, Math.max(a, b)] : null;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function feasible(imgAR: number, cellAR: number, z: number, box: Box | null) {
  const { vw, vh } = windowSize(imgAR, cellAR, z);
  const bx = box ?? { x: 0.5, y: 0.4, w: 0, h: 0 };
  const rx = rangeFor(0, bx.x, bx.x + bx.w, vw), ry = rangeFor(0, bx.y, bx.y + bx.h, vh);
  if (!rx || !ry) return null;
  return { vw, vh, rx, ry };
}

/**
 * Decide how a photo sits in a cell and how the camera moves.
 * maxLoss: the largest share of the photo we accept to crop away (else: show it whole).
 */
export function planShot(photo: Pick<Photo, 'faces' | 'focus' | 'w' | 'h'>, cellW: number, cellH: number, effect: Effect, maxLoss = 0.3, seed = 0): Plan {
  const imgAR = photo.w / photo.h, cellAR = cellW / cellH;
  const box = protectedBox(photo);
  const loss = coverLoss(imgAR, cellAR);
  const coverOk = loss <= maxLoss && feasible(imgAR, cellAR, 1, box) !== null;

  if (!coverOk) {
    // whole photo visible, sharp, over a blurred copy of itself; depth comes from the layers
    const z0 = effect === 'zoomOut' ? 1.05 : 1.0, z1 = effect === 'zoomOut' ? 1.0 : 1.05;
    return { mode: 'contain', z0, z1, c0: { x: 0.5, y: 0.5 }, c1: { x: 0.5, y: 0.5 }, faceSafe: true, effect: effect === 'zoomOut' ? 'zoomOut' : 'parallax' };
  }

  const fc = box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : { x: 0.5, y: 0.42 };
  const at = (z: number, target: { x: number; y: number }) => {
    const f = feasible(imgAR, cellAR, z, box);
    if (!f) return null;
    return { x: clamp(target.x, f.rx[0], f.rx[1]), y: clamp(target.y, f.ry[0], f.ry[1]) };
  };
  const biggestZ = (want: number) => {
    for (let z = want; z >= 1; z -= 0.01) if (feasible(imgAR, cellAR, z, box)) return z;
    return 1;
  };
  const mid = { x: (0.5 + fc.x) / 2, y: (0.5 + fc.y) / 2 };

  let eff: Effect = effect === 'parallax' ? 'pushIn' : effect;
  let z0 = 1.0, z1 = 1.1, c0 = at(1, mid)!, c1 = c0;

  if (eff === 'panLeft' || eff === 'panRight' || eff === 'panUp' || eff === 'panDown') {
    const horiz = eff === 'panLeft' || eff === 'panRight';
    let best: { z: number; a: number; b: number } | null = null;
    for (const z of [1.06, 1.1, 1.15, 1.2]) {
      const f = feasible(imgAR, cellAR, z, box);
      if (!f) continue;
      const [a, b] = horiz ? f.rx : f.ry;
      if (!best || b - a > best.b - best.a + 0.01) best = { z, a, b };
    }
    if (best && best.b - best.a >= 0.025) {
      const travel = Math.min(best.b - best.a, horiz ? 0.1 : 0.08);
      const m = clamp(horiz ? fc.x : fc.y, best.a + travel / 2, best.b - travel / 2);
      const s = m - travel / 2, e = m + travel / 2;
      const forward = eff === 'panRight' || eff === 'panDown';
      const other = at(best.z, fc)!;
      z0 = z1 = best.z;
      c0 = horiz ? { x: forward ? s : e, y: other.y } : { x: other.x, y: forward ? s : e };
      c1 = horiz ? { x: forward ? e : s, y: other.y } : { x: other.x, y: forward ? e : s };
    } else eff = 'zoomIn';
  }
  if (eff === 'zoomIn' || eff === 'zoomOut' || eff === 'pushIn' || eff === 'still') {
    const want = eff === 'pushIn' ? 1.17 : eff === 'still' ? 1.05 : 1.11;
    const zmax = biggestZ(want);
    const zmin = eff === 'still' ? Math.min(zmax, 1.02) : 1.0;
    const near = at(zmax, fc)!, far = at(zmin, eff === 'pushIn' ? mid : { x: 0.5 * 0.6 + fc.x * 0.4, y: 0.5 * 0.6 + fc.y * 0.4 })!;
    if (eff === 'zoomOut') { z0 = zmax; z1 = zmin; c0 = near; c1 = far; }
    else { z0 = zmin; z1 = zmax; c0 = far; c1 = near; }
  }
  void seed;
  return { mode: 'cover', z0, z1, c0, c1, faceSafe: true, effect: eff };
}

const ease = (p: number) => 0.75 * p + 0.25 * (0.5 - 0.5 * Math.cos(Math.PI * p));

/** Image placement at progress p (0..1) through the clip. */
export function frameAt(plan: Plan, imgAR: number, cellW: number, cellH: number, p: number): Frame {
  const q = ease(Math.min(1, Math.max(0, p)));
  const z = plan.z0 + (plan.z1 - plan.z0) * q;
  const cx = plan.c0.x + (plan.c1.x - plan.c0.x) * q;
  const cy = plan.c0.y + (plan.c1.y - plan.c0.y) * q;
  if (plan.mode === 'contain') {
    const fit = Math.min(cellW / imgAR, cellH) * 0.92;
    const h = fit * z, w = h * imgAR;
    return { mode: 'contain', w, h, left: (cellW - w) / 2, top: (cellH - h) / 2 };
  }
  const baseW = Math.max(cellW, cellH * imgAR);
  const w = baseW * z, h = w / imgAR;
  return { mode: 'cover', w, h, left: cellW / 2 - cx * w, top: cellH / 2 - cy * h };
}

/** QC helper: does the protected area stay inside the cell along the whole move? */
export function checkFaces(photo: Pick<Photo, 'faces' | 'focus' | 'w' | 'h'>, plan: Plan, cellW: number, cellH: number) {
  const box = protectedBox(photo);
  if (!box) return true;
  const ar = photo.w / photo.h;
  for (let i = 0; i <= 10; i++) {
    const f = frameAt(plan, ar, cellW, cellH, i / 10);
    const x0 = f.left + box.x * f.w, x1 = f.left + (box.x + box.w) * f.w;
    const y0 = f.top + box.y * f.h, y1 = f.top + (box.y + box.h) * f.h;
    if (x0 < -1 || y0 < -1 || x1 > cellW + 1 || y1 > cellH + 1) return false;
  }
  return true;
}
