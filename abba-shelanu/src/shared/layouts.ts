// Collage layouts and picking the most flattering arrangement for a group of photos.

import type { Format, Layout, Photo } from './types';
import { coverLoss, protectedBox } from './framing';

export type Cell = { x: number; y: number; w: number; h: number }; // px inside the frame

export function cellsFor(layout: Layout, W: number, H: number, format: Format): Cell[] {
  if (layout === 'single') return [{ x: 0, y: 0, w: W, h: H }];
  const m = Math.round(Math.min(W, H) * 0.045); // outer margin
  const g = Math.round(Math.min(W, H) * 0.018); // gap
  const iw = W - 2 * m, ih = H - 2 * m;
  const wide = format === '16:9';
  if (layout === 'duo') {
    if (wide) { const w = (iw - g) / 2; return [{ x: m + w + g, y: m, w, h: ih }, { x: m, y: m, w, h: ih }]; }
    const h = (ih - g) / 2; return [{ x: m, y: m, w: iw, h }, { x: m, y: m + h + g, w: iw, h }];
  }
  if (layout === 'trio') {
    if (wide) { const w = (iw - 2 * g) / 3; return [2, 1, 0].map((i) => ({ x: m + i * (w + g), y: m, w, h: ih })); }
    const h = (ih - 2 * g) / 3; return [0, 1, 2].map((i) => ({ x: m, y: m + i * (h + g), w: iw, h }));
  }
  // feature: one large photo + two small. The large one sits on the right (Hebrew reading order).
  if (wide) {
    const bw = Math.round((iw - g) * 0.6), sw = iw - g - bw, sh = (ih - g) / 2;
    return [{ x: m + sw + g, y: m, w: bw, h: ih }, { x: m, y: m, w: sw, h: sh }, { x: m, y: m + sh + g, w: sw, h: sh }];
  }
  const bh = Math.round((ih - g) * 0.58), sh = ih - g - bh, sw = (iw - g) / 2;
  return [{ x: m, y: m, w: iw, h: bh }, { x: m + sw + g, y: m + bh + g, w: sw, h: sh }, { x: m, y: m + bh + g, w: sw, h: sh }];
}

const MAX_CELL_LOSS = 0.42;

/** Can this photo fill this cell without cutting faces or losing too much of it? Returns crop loss or null. */
export function cellFit(p: Pick<Photo, 'w' | 'h' | 'faces' | 'focus'>, cell: Cell): number | null {
  const ar = p.w / p.h, car = cell.w / cell.h;
  const loss = coverLoss(ar, car);
  if (loss > MAX_CELL_LOSS) return null;
  const box = protectedBox(p);
  if (box) {
    const vw = ar > car ? car / ar : 1, vh = ar > car ? 1 : ar / car;
    if (box.w > vw * 0.97 || box.h > vh * 0.97) return null;
  }
  return loss;
}

const perms = <T,>(a: T[]): T[][] => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r])));

/** Best layout + photo arrangement for 2-3 photos, or null if none is flattering. */
export function bestCollage(photos: Photo[], format: Format, W = 1920, H = 1080): { layout: Layout; order: Photo[]; cost: number } | null {
  if (format === '9:16') { W = 1080; H = 1920; }
  const layouts: Layout[] = photos.length === 2 ? ['duo'] : ['trio', 'feature'];
  let best: { layout: Layout; order: Photo[]; cost: number } | null = null;
  for (const layout of layouts) {
    const cells = cellsFor(layout, W, H, format);
    for (const order of perms(photos)) {
      let cost = layout === 'feature' ? 0.05 : 0;
      let ok = true;
      order.forEach((p, i) => {
        const f = cellFit(p, cells[i]);
        if (f === null) ok = false; else cost += f;
      });
      if (ok && (!best || cost < best.cost)) best = { layout, order, cost };
    }
  }
  return best;
}
