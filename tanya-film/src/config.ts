// הגדרות כלליות של הסרט
export const WIDTH = 1920;
export const HEIGHT = 1080;

// מסגרת קולנועית 2.39:1. הפאנלים בסטוריבורד הם ביחס ~2.4:1, כך שהם ממלאים את
// התמונה בלי חיתוך ובלי הגדלה מוגזמת; הפסים העליון והתחתון נושאים את סימון
// ההתקדמות ואת הכתוביות. LETTERBOX=false => התמונה ממלאת את כל 16:9.
export const LETTERBOX = true;
export const BAR = LETTERBOX ? 138 : 0;
export const PIC_TOP = BAR;
export const PIC_H = HEIGHT - 2 * BAR;

// גרסת טיוטה: מציגה מזהה סצנה, תזמון ותגיות ״דורש אימות״. לכבות לייצוא הסופי.
export const DRAFT = true;

// מעברים (בפריימים, ב-24fps)
export const SHOT_XFADE = 16; // בין שוטים בתוך סצנה
export const SCENE_XFADE = 24; // מעבר ״cross״ בין סצנות
export const FADE_IN_BLACK = 20; // כניסה מחושך (מעבר ״black״)
export const FADE_OUT_BLACK = 16; // יציאה לחושך לפני סצנה עם מעבר ״black״

export const COLORS = {
  navy: '#0a1426',
  ink: '#05080f',
  gold: '#d9b36a',
  goldSoft: '#e8cf98',
  text: '#f2efe8',
  muted: '#9aa6b8',
  verify: '#ff9f43',
};
