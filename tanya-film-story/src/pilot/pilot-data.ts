// קטע ניסיון — ״הבוקר שבו הלב לא היה שם״ (כ-75 שניות)
// הכיוון החדש: הדמות מובילה בגוף ראשון מתוך הסצנה. השאלה צומחת ממה שקורה לה,
// הגילוי מפרק א׳ בתניא מגיע תוך כדי הדרך, ומשנה את הפעולה הבאה שלה.
//
// כל שוט הוא קליפ קיים (תנועה אמיתית), או **קליפ חסר** (M1, M2…) שמוחזק בינתיים בפריים
// מהסטוריבורד או בכרטיס תיאור. הקליפים החסרים מפורטים ב-docs/PILOT.md עם פרומפט ל-Flow.
//
// הקול: מחשבה פנימית בלבד — אין שוט שבו הוא מדבר, ולכן אין צורך בסנכרון שפתיים.

export type PilotShot = {
  id: string;
  kind: 'clip' | 'still' | 'card';
  src?: string; // clip: public/clips · still: public/panels · card: פריים לרקע מטושטש
  sec?: number; // לסטילס ולכרטיס (קליף — לפי אורכו)
  move?: 'in' | 'out' | 'left' | 'right' | 'hold' | 'rise';
  missing?: { code: string; what: string }; // קליף שצריך לייצר
  sfx?: { id: string; at?: number; vol?: number }[];
  amb?: { id: string; vol: number };
  onScreen?: { text: string; sub?: string; at: number; dur: number }; // טקסט קצר וגדול על המסך
  light?: 'split'; // המחשה: אור קר מצד אחד וחם מהצד השני
  fade?: number; // פריימים של הצלבה מהשוט הקודם
};

// קריינות פנימית: כל שורה מעוגנת לשוט שבו היא מתחילה (id + היסט בשניות)
export type VoLine = { shot: string; at: number; text: string };

export const PILOT_SHOTS: PilotShot[] = [
  // ---- חדר השינה, עם שחר ----
  { id: 'alarm', kind: 'still', src: '44', sec: 3.2, move: 'hold', missing: { code: 'M1', what: 'יד מכבה שעון מעורר 6:00' }, sfx: [{ id: 'alarm', at: 0.2, vol: 0.55 }], amb: { id: 'amb-night', vol: 0.35 } },
  { id: 'bed', kind: 'still', src: '45', sec: 8.5, move: 'in', missing: { code: 'M2', what: 'יושב על קצה המיטה, נושם, נשאר בשקט' }, amb: { id: 'amb-night', vol: 0.3 } },
  { id: 'shutters', kind: 'still', src: '47', sec: 5.5, move: 'rise', missing: { code: 'M3', what: 'פותח את התריסים, אור הבוקר נכנס' }, amb: { id: 'amb-day', vol: 0.35 }, fade: 10 },
  { id: 'wash', kind: 'still', src: '46', sec: 3.0, move: 'hold', missing: { code: 'M4', what: 'נטילת ידיים' }, sfx: [{ id: 'water', vol: 0.55 }], amb: { id: 'amb-day', vol: 0.3 } },
  { id: 'mirror', kind: 'card', src: '45', sec: 5.0, missing: { code: 'M5', what: 'מול המראה במסדרון: מכפתר את הז׳קט, מביט בעצמו' }, amb: { id: 'amb-day', vol: 0.3 } },
  // ---- יוצא לדרך ----
  { id: 'door', kind: 'card', src: '00', sec: 3.0, missing: { code: 'M6', what: 'יוצא מדלת הבניין אל רחוב ירושלמי בבוקר' }, sfx: [{ id: 'steps', vol: 0.4 }], amb: { id: 'amb-street', vol: 0.45 } },
  { id: 'bus', kind: 'clip', src: 'd-bus', amb: { id: 'amb-bus', vol: 0.45 } },
  // ---- בית הכנסת ----
  { id: 'shul', kind: 'still', src: '48', sec: 5.0, move: 'in', missing: { code: 'M7', what: 'נכנס לבית הכנסת, מתיישב במקומו' }, amb: { id: 'amb-shul', vol: 0.45 }, fade: 8 },
  { id: 'siddur', kind: 'still', src: '49', sec: 7.0, move: 'in', missing: { code: 'M8', what: 'פותח סידור, מנסה להתרכז — המבט נודד' }, sfx: [{ id: 'page', at: 0.4, vol: 0.5 }], amb: { id: 'amb-shul', vol: 0.4 } },
  { id: 'stop', kind: 'still', src: '52', sec: 4.0, move: 'hold', missing: { code: 'M9', what: 'עוצם עיניים בבית הכנסת, עוצר' }, amb: { id: 'amb-shul', vol: 0.25 } },
  // ---- בית המדרש: הגילוי ----
  { id: 'midrash', kind: 'clip', src: 'd-beit-midrash', sfx: [{ id: 'steps', vol: 0.3 }], amb: { id: 'amb-day', vol: 0.25 } },
  { id: 'shelf', kind: 'card', src: '05', sec: 4.5, missing: { code: 'M10', what: 'מוציא תניא מהמדף ופותח בפרק א׳' }, sfx: [{ id: 'page', at: 2.6, vol: 0.6 }], onScreen: { text: 'תניא · פרק א׳', at: 1.2, dur: 3.0 }, amb: { id: 'amb-day', vol: 0.25 } },
  { id: 'reading', kind: 'still', src: '05', sec: 6.5, move: 'in', missing: { code: 'M11', what: 'קורא — האצבע על השורה' }, light: 'split', onScreen: { text: 'נפש בהמית · נפש אלוקית', sub: 'תניא, פרק א׳', at: 2.6, dur: 3.6 }, amb: { id: 'amb-day', vol: 0.25 } },
  { id: 'realize', kind: 'still', src: '14', sec: 10.0, move: 'in', missing: { code: 'M12', what: 'מרים את העיניים מהספר; ההבנה נוחתת' }, amb: { id: 'amb-day', vol: 0.25 } },
  // ---- הגילוי משנה את הפעולה ----
  { id: 'return', kind: 'card', src: '48', sec: 8.5, missing: { code: 'M13', what: 'חוזר למקומו, פותח שוב את הסידור — והפעם המבט נשאר' }, amb: { id: 'amb-shul', vol: 0.35 }, fade: 10 },
  { id: 'out', kind: 'clip', src: 'd-stone-path-slow', sfx: [{ id: 'steps', vol: 0.45 }], amb: { id: 'amb-wind', vol: 0.4 }, fade: 10 },
];

// הקול הפנימי — מחשבה, לא הרצאה. שורות קצרות, עם שקט ביניהן.
export const PILOT_VO: VoLine[] = [
  { shot: 'bed', at: 1.8, text: 'קמתי הבוקר.' },
  { shot: 'bed', at: 3.8, text: 'אני יודע שאני רוצה להתפלל… אבל הלב שלי לא שם.' },
  { shot: 'shutters', at: 2.0, text: 'למה זה קורה לי?' },
  { shot: 'mirror', at: 1.0, text: 'לפעמים אני לא בטוח מי עומד מולי.' },
  { shot: 'bus', at: 0.4, text: 'הידיים יודעות את הדרך.' },
  { shot: 'shul', at: 1.8, text: 'רק הלב נשאר מאחור.' },
  { shot: 'siddur', at: 1.2, text: 'אני מנסה להתרכז.' },
  { shot: 'siddur', at: 3.8, text: 'והמחשבות — כבר בכל מקום אחר.' },
  // עצירה: שקט. ואז השאלה, בדרך לבית המדרש
  { shot: 'midrash', at: 0.2, text: 'אולי זה פשוט מי שאני — רוצה טוב, ומיד את ההפך?' },
  // שליפת התניא: שקט, רק הכותרת
  { shot: 'reading', at: 0.6, text: 'ופה כתוב: בכל יהודי יש שתי נפשות — נפש בהמית, ונפש אלוקית.' },
  { shot: 'realize', at: 0.8, text: 'אז המשיכה הזאת — היא לא כל מי שאני.' },
  { shot: 'realize', at: 5.6, text: 'אני לא חייב להגדיר את עצמי לפי כל רצון.' },
  { shot: 'return', at: 1.4, text: 'הלב עדיין לא בוער. אבל עכשיו אני יודע עם מה אני נאבק.' },
  { shot: 'out', at: 0.8, text: 'ואם יש בי נפש אלוקית — למה אני לא מרגיש אותה?' },
];

export const PILOT_TAIL = 2.5; // שניות אחרי השוט האחרון — יציאה לחושך
export const VO_WPS = 1.9; // קצב משוער של קול פנימי, שקט ואיטי מעט
