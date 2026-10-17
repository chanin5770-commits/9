// קריינות — מתמלא בשלב 5, אחרי שמגיעה ההקלטה.
//
// file: נתיב הקובץ בתוך public/ (למשל 'audio/narration.wav'), או null כשאין עדיין הקלטה.
// cues: כתוביות לפי זמן בסרט (שניות). כל cue הוא עד שתי שורות; '\n' מפריד בין השורות.
//       המוזיקה יורדת אוטומטית בזמן כל cue.
// הסרט עצמו לא מייצר קול — רק מנגן את הקובץ שסופק.

export type Cue = { start: number; end: number; text: string };

export const NARRATION: { file: string | null; offset: number; cues: Cue[] } = {
  file: null,
  offset: 0,
  cues: [],
};
