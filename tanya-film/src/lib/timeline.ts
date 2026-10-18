// פריסת הסרט על ציר הזמן: כל שוט מקבל פריים התחלה ואורך.
// - בתוך סצנה: חיתוך חד, אלא אם לשוט יש fade (הצלבה).
// - בין סצנות: הצלבה קצרה; לפני סצנה שנפתחת בשער — יציאה לחושך וכניסה מחושך.
// - timing.json/sceneSeconds (אופציונלי): משך יעד לסצנה. השוטים שאינם קליפים
//   נמתחים או מתכווצים יחסית כדי להגיע אליו (לסנכרון עם הקריינות).
import timing from '../data/timing.json';
import clipFrames from '../data/clip-frames.json';
import { SCENES, Scene, Shot } from '../data/scenes';

export const FPS: number = timing.fps;
export const SCENE_XFADE = 12;
export const TO_BLACK = 12;

export type PlacedShot = {
  shot: Shot;
  scene: Scene;
  sceneIndex: number;
  index: number; // מספר השוט בתוך הסצנה
  from: number;
  dur: number;
  fadeIn: number;
  fadeOutToBlack: number;
};
export type PlacedScene = { scene: Scene; index: number; from: number; dur: number; shots: PlacedShot[] };

const overrides = (timing.sceneSeconds ?? {}) as Record<string, number>;
// תוספת זמן לשוט מסוים, בשניות ("12/8": 3.2) — מהסנכרון לקריינות (tools/sync-narration.mjs)
export type ShotExtra = Record<string, number>;
const TIMING_EXTRA = ((timing as { shotExtra?: ShotExtra }).shotExtra ?? {}) as ShotExtra;

export const clipLength = (src: string): number => {
  const n = (clipFrames as Record<string, number>)[src];
  if (!n) throw new Error(`clip "${src}" missing from clip-frames.json — run: python3 tools/prepare_assets.py`);
  return n - 1; // לא לבקש את הפריים האחרון בקובץ
};

const baseLen = (s: Shot) =>
  s.kind === 'clip' ? Math.min(clipLength(s.src), s.maxSec ? Math.round(s.maxSec * FPS) : Infinity) : Math.round(s.sec * FPS);
const shotFade = (s: Shot, i: number) => (i === 0 ? 0 : s.fade ?? 0);

function sceneLengths(scene: Scene, extra: ShotExtra): number[] {
  const lens = scene.shots.map((s, i) => baseLen(s) + Math.round((extra[`${scene.id}/${i + 1}`] ?? 0) * FPS));
  const overlap = scene.shots.reduce((a, s, i) => a + shotFade(s, i), 0);
  const target = overrides[scene.id];
  if (!target) return lens;
  // משך יעד: מותחים רק את השוטים שאינם קליפים
  const fixed = scene.shots.reduce((a, s, i) => a + (s.kind === 'clip' ? lens[i] : 0), 0);
  const flex = lens.reduce((a, l) => a + l, 0) - fixed;
  const k = (Math.round(target * FPS) + overlap - fixed) / flex;
  if (k <= 0) throw new Error(`scene ${scene.id}: target ${target}s is shorter than its clips`);
  return scene.shots.map((s, i) => (s.kind === 'clip' ? lens[i] : Math.round(lens[i] * k)));
}

export function buildTimeline(extra: ShotExtra = TIMING_EXTRA) {
  const scenes: PlacedScene[] = [];
  let t = 0;
  SCENES.forEach((scene, si) => {
    const next = SCENES[si + 1];
    const nextIsGate = !!next && next.shots[0].kind === 'gate';
    const startsWithGate = scene.shots[0].kind === 'gate';
    if (si > 0 && !startsWithGate) t -= SCENE_XFADE; // הצלבה עם הסצנה הקודמת
    const lens = sceneLengths(scene, extra);
    const from = t;
    const shots: PlacedShot[] = [];
    scene.shots.forEach((shot, i) => {
      const fadeIn = i === 0 ? (si === 0 ? 0 : startsWithGate ? 16 : SCENE_XFADE) : shotFade(shot, i);
      if (i > 0) t -= fadeIn;
      const last = i === scene.shots.length - 1;
      shots.push({
        shot, scene, sceneIndex: si, index: i, from: t, dur: lens[i], fadeIn,
        fadeOutToBlack: last && (nextIsGate || !next) ? (next ? TO_BLACK : 36) : 0,
      });
      t += lens[i];
    });
    scenes.push({ scene, index: si, from, dur: t - from, shots });
  });
  return { scenes, total: t };
}

export const TIMELINE = buildTimeline();
export const TOTAL_FRAMES = TIMELINE.total;
export const ALL_SHOTS = TIMELINE.scenes.flatMap((s) => s.shots);

// זמני הסצנות בשניות — לטבלת הקריינות, למוזיקה ולסנכרון
export const sceneTimes = () =>
  TIMELINE.scenes.map((s) => ({ id: s.scene.id, title: s.scene.title, start: s.from / FPS, end: (s.from + s.dur) / FPS }));
