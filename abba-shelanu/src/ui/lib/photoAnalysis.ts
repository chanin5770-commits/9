// Face detection and image measurements, run locally in the browser (MediaPipe, on-device).
// Faces are only used to frame the photos safely; photos are never altered.
import type { Box, Photo } from '../../shared/types';
import { media } from './api';

type Detector = { detect: (img: HTMLCanvasElement) => { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number }; categories: { score: number }[] }[] } };
let detectorP: Promise<Detector | null> | null = null;

function getDetector() {
  detectorP ??= (async () => {
    try {
      const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe');
      return (await FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.55,
      })) as unknown as Detector;
    } catch (e) {
      console.warn('face detector unavailable', e);
      return null;
    }
  })();
  return detectorP;
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = () => rej(new Error('load ' + src));
  im.src = src;
});

const iou = (a: Box, b: Box) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return i / (a.w * a.h + b.w * b.h - i);
};
const contains = (big: Box, s: Box) => s.x >= big.x - 0.01 && s.y >= big.y - 0.01 && s.x + s.w <= big.x + big.w + 0.01 && s.y + s.h <= big.y + big.h + 0.01;

async function detectFaces(im: HTMLImageElement): Promise<Box[] | null> {
  const det = await getDetector();
  if (!det) return null;
  const W = im.naturalWidth, H = im.naturalHeight;
  const found: (Box & { s: number })[] = [];
  // the model is made for close faces and looks at a small square input, so the photo is also
  // scanned in overlapping tiles: that finds the small faces of a group photo
  const passes = [1, 2, 3, 4, 5];
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d')!;
  for (const n of passes) {
    const tw = W / n, th = H / n, ov = 0.25;
    for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
      const x0 = Math.max(0, (gx - ov / 2) * tw), y0 = Math.max(0, (gy - ov / 2) * th);
      const x1 = Math.min(W, (gx + 1 + ov / 2) * tw), y1 = Math.min(H, (gy + 1 + ov / 2) * th);
      const sw = x1 - x0, sh = y1 - y0;
      const k = Math.min(1, 640 / Math.max(sw, sh));
      cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
      g.drawImage(im, x0, y0, sw, sh, 0, 0, cv.width, cv.height);
      let dets: ReturnType<Detector['detect']>['detections'] = [];
      try { dets = det.detect(cv).detections; } catch { continue; }
      for (const d of dets) {
        const b = d.boundingBox;
        if (!b) continue;
        const box = { x: (x0 + b.originX / k) / W, y: (y0 + b.originY / k) / H, w: b.width / k / W, h: b.height / k / H, s: d.categories[0]?.score ?? 0 };
        if (box.w * W < Math.min(W, H) * 0.025) continue;
        found.push(box);
      }
    }
  }
  // merge duplicates across tiles
  found.sort((a, b) => b.s - a.s);
  const keep: (Box & { s: number })[] = [];
  for (const f of found) if (!keep.some((k) => iou(k, f) > 0.25 || contains(k, f) || contains(f, k))) keep.push(f);
  return keep.map(({ x, y, w, h }) => ({ x: Math.max(0, x), y: Math.max(0, y), w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) }));
}

function measure(im: HTMLImageElement) {
  const cv = document.createElement('canvas');
  const n = 192;
  const k = n / Math.max(im.naturalWidth, im.naturalHeight);
  cv.width = Math.max(8, Math.round(im.naturalWidth * k));
  cv.height = Math.max(8, Math.round(im.naturalHeight * k));
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(im, 0, 0, cv.width, cv.height);
  const { data, width, height } = g.getImageData(0, 0, cv.width, cv.height);
  let lum = 0, warm = 0;
  const L = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    L[p] = v * 255; lum += v; warm += (data[i] - data[i + 2]) / 255;
  }
  let s = 0, s2 = 0, c = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const lap = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - width] - L[i + width];
    s += lap; s2 += lap * lap; c++;
  }
  const mean = s / c;
  return { brightness: lum / (width * height), warmth: warm / (width * height), sharpness: Math.sqrt(s2 / c - mean * mean) };
}

export async function analyzePhoto(projectId: string, p: Photo): Promise<Pick<Photo, 'faces' | 'stats'>> {
  const im = await loadImage(media(projectId, 'preview', p.id));
  const stats = measure(im);
  const faces = await detectFaces(im);
  return { faces: faces ?? [], stats };
}
