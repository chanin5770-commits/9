// פריסת הסרט על ציר הזמן: מאיפה מתחילה כל סצנה, וכל שוט בתוכה.
import timing from '../data/timing.json';
import clipFrames from '../data/clip-frames.json';
import { SCENES, Scene, Shot } from '../data/scenes';
import { SCENE_XFADE, SHOT_XFADE } from '../config';

export const FPS: number = timing.fps;

export type PlacedShot = { shot: Shot; from: number; dur: number };
export type PlacedScene = {
  scene: Scene;
  index: number;
  from: number; // פריים התחלה בסרט
  dur: number; // אורך בפריימים (כולל החפיפה עם הסצנה הבאה)
  shots: PlacedShot[];
  fadeOutToBlack: boolean;
};

const secs = timing.sceneSeconds as Record<string, number>;
const CLIP_SAFETY = 1; // לא לבקש את הפריים האחרון בקובץ

export const clipLength = (src: string): number => {
  const n = (clipFrames as Record<string, number>)[src];
  if (!n) throw new Error(`clip "${src}" missing from clip-frames.json — run: python3 tools/prepare_assets.py`);
  return n - CLIP_SAFETY;
};

function placeShots(scene: Scene, dur: number): PlacedShot[] {
  const n = scene.shots.length;
  const clipTotal = scene.shots.reduce((s, sh) => s + (sh.kind === 'clip' ? clipLength(sh.src) : 0), 0);
  const weights = scene.shots.reduce((s, sh) => s + (sh.kind === 'panel' ? sh.w : 0), 0);
  // סכום אורכי השוטים פחות החפיפות = אורך הסצנה
  const panelTotal = dur + (n - 1) * SHOT_XFADE - clipTotal;
  if (weights > 0 && panelTotal < weights * 48) {
    throw new Error(`scene ${scene.id}: too short for its shots`);
  }
  const lens = scene.shots.map((sh) => (sh.kind === 'clip' ? clipLength(sh.src) : Math.round((panelTotal * sh.w) / weights)));
  // מתקנים שארית עיגול בשוט האחרון שאינו קליפ
  const drift = dur + (n - 1) * SHOT_XFADE - lens.reduce((a, b) => a + b, 0);
  const lastPanel = scene.shots.map((s) => s.kind).lastIndexOf('panel');
  if (lastPanel >= 0) lens[lastPanel] += drift;
  let t = 0;
  return scene.shots.map((shot, i) => {
    const placed = { shot, from: t, dur: lens[i] };
    t += lens[i] - SHOT_XFADE;
    return placed;
  });
}

function layout(): { scenes: PlacedScene[]; total: number } {
  let t = 0;
  const out: PlacedScene[] = SCENES.map((scene, index) => {
    const base = Math.round(secs[scene.id] * FPS);
    if (!base) throw new Error(`timing.json: no duration for scene ${scene.id}`);
    const next = SCENES[index + 1];
    const overlap = next && next.transition === 'cross' ? SCENE_XFADE : 0;
    const dur = base + overlap;
    const placed: PlacedScene = {
      scene, index, from: t, dur,
      shots: placeShots(scene, dur),
      fadeOutToBlack: !next || next.transition === 'black',
    };
    t += base;
    return placed;
  });
  const last = out[out.length - 1];
  return { scenes: out, total: last.from + last.dur };
}

export const TIMELINE = layout();
export const TOTAL_FRAMES = TIMELINE.total;

// זמני התחלה/סיום של כל סצנה בשניות — לטבלת הקריינות ולסנכרון
export const sceneTimes = () =>
  TIMELINE.scenes.map((s) => ({
    id: s.scene.id,
    title: s.scene.title,
    start: s.from / FPS,
    end: (s.from + s.dur - (s.fadeOutToBlack ? 0 : SCENE_XFADE)) / FPS,
  }));
