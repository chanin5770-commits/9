// הקריינות: ההקלטה, מיקום כל קטע בסרט, והכתוביות.
//
// הנתונים מגיעים מ-narration-sync.json (tools/sync-narration.mjs), שבו כל קטע מעוגן לשוט שבו
// הוא מתחיל. כאן מחושבים מזה הזמנים בסרט, כך שהם נשארים נכונים גם אם התזמון משתנה.
// הסרט לא מייצר קול — רק מנגן את ההקלטה שסופקה, בלי חיתוך ובלי שינוי מהירות.
import sync from './narration-sync.json';
import { ALL_SHOTS, FPS } from '../lib/timeline';

export type Cue = { start: number; end: number; text: string };
type Segment = { filmStart: number; audioStart: number; audioEnd: number };

const MAX_CUE = 64; // תווים לכתובית — עד שתי שורות

// משפט ארוך מתפצל לשתי כתוביות, בסימן הפיסוק הקרוב לאמצע; הזמן מתחלק לפי האורך
function splitCue(text: string, start: number, end: number): Cue[] {
  if (text.length <= MAX_CUE) return [{ start, end, text }];
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (/[,—:;]/.test(text[i]) && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best < 0) best = text.lastIndexOf(' ', mid);
  const a = text.slice(0, best + 1).trim();
  const b = text.slice(best + 1).trim();
  const t = start + ((end - start) * a.length) / text.length;
  return [...splitCue(a, start, t), ...splitCue(b, t, end)];
}

const shotStart = (key: string) => {
  const p = ALL_SHOTS.find((x) => `${x.scene.id}/${x.index + 1}` === key);
  if (!p) throw new Error(`narration anchor ${key} not found — re-run tools/sync-narration.mjs`);
  return p.from / FPS;
};

const segments: Segment[] = [];
const cues: Cue[] = [];
for (const s of sync.segments) {
  const filmStart = shotStart(s.shot) + s.offset + s.lead;
  segments.push({ filmStart, audioStart: s.audioStart, audioEnd: s.audioEnd });
  for (const sen of s.sentences) {
    const a = filmStart + (sen.start - s.audioStart);
    const b = filmStart + (sen.end - s.audioStart);
    // הכתובית: בלי הוראות ההגייה (״השם״ נשאר כפי שנאמר)
    cues.push(...splitCue(sen.text.replace(/\s+/g, ' ').trim(), a, b + 0.15));
  }
}

export const NARRATION = { file: sync.file as string | null, segments, cues };
export const HAS_NARRATION = !!NARRATION.file && segments.length > 0;
