// זמני קריאה: כמה זמן טקסט צריך להישאר על המסך, וכמה זמן התרשים לבד לפני השורה הראשונה.
import { Text } from '../data/scenes';

export const CPS = 13; // תווים לשנייה — קצב קריאה נוח גם בטלפון
export const readSec = (t: Text) => Math.max(2.8, t.text.replace(/\s+/g, ' ').length / CPS + 0.9);

// פריימים של ״התרשים לבד״ לפני השורה הראשונה
export const graphicIntro = (g: string, durFrames: number) =>
  g === 'map' ? durFrames : g === 'text' || g === 'verse' ? 10 : g === 'crossroads' ? 70 : Math.min(60, durFrames * 0.18);

// חלוקת זמן הגרפיקה בין השורות — כל שורה לפי האורך שלה. מחזיר [התחלה, אורך] בפריימים.
export const lineSlots = (lines: Text[], durFrames: number, intro: number): [number, number][] => {
  const w = lines.map(readSec);
  const total = w.reduce((a, b) => a + b, 0);
  let t = intro;
  return w.map((x) => {
    const len = ((durFrames - intro) * x) / total;
    const slot: [number, number] = [t, len];
    t += len;
    return slot;
  });
};
