// Quality control before export.

import type { Project } from './types';
import { frameSize } from './types';
import { planShot, checkFaces } from './framing';
import { cellsFor } from './layouts';
import { nearestBeat } from './audioAnalysis';
import { hashDistance } from './storyboard';

export type QcItem = { level: 'error' | 'warn' | 'ok'; title: string; detail?: string; at?: number; clipId?: string };

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export function runQc(project: Project): QcItem[] {
  const out: QcItem[] = [];
  const a = project.audio?.analysis;
  const clips = [...project.clips].sort((x, y) => x.start - y.start);
  const byId = new Map(project.photos.map((p) => [p.id, p]));
  const { width: W, height: H } = frameSize(project.settings);

  if (!a) { out.push({ level: 'error', title: 'לא הועלה שיר' }); return out; }
  if (!clips.length) { out.push({ level: 'error', title: 'אין סטוריבורד', detail: 'לחצו על "בניית סטוריבורד אוטומטי".' }); return out; }

  // 1) crops and faces
  let faceIssues = 0, unanalyzed = 0;
  for (const c of clips) {
    const cells = cellsFor(c.layout, W, H, project.settings.format);
    c.photoIds.forEach((id, k) => {
      const p = byId.get(id);
      if (!p) { out.push({ level: 'error', title: 'תמונה חסרה בקליפ', at: c.start, clipId: c.id }); return; }
      if (p.faces === null && !p.focus) unanalyzed++;
      const cell = cells[k] ?? cells[0];
      const plan = planShot(p, cell.w, cell.h, c.effect, c.layout === 'single' ? 0.3 : 0.42);
      if (!checkFaces(p, plan, cell.w, cell.h)) {
        faceIssues++;
        out.push({ level: 'warn', title: 'פנים עלולות להיחתך', detail: `${p.name} ב-${fmt(c.start)}. כדאי לבחור תמונה בודדת או לסמן נקודת מוקד.`, at: c.start, clipId: c.id });
      }
      const need = Math.min(cell.w, cell.h) * 0.85;
      if (Math.min(p.w, p.h) < need * (c.layout === 'single' ? 0.75 : 0.6)) out.push({ level: 'warn', title: 'תמונה ברזולוציה נמוכה', detail: `${p.name} (${p.w}×${p.h}) תיראה מעט רכה.`, at: c.start, clipId: c.id });
    });
  }
  if (unanalyzed) out.push({ level: 'warn', title: `${unanalyzed} תמונות עוד לא נותחו לזיהוי פנים`, detail: 'הניתוח רץ ברקע אחרי הייבוא. אפשר גם לסמן נקודת מוקד ידנית.' });
  if (!faceIssues) out.push({ level: 'ok', title: 'אין פנים חתוכות', detail: 'כל תמונה רק מוגדלת ומוזזת באופן אחיד, בלי עיוות. אזורי הפנים נשמרים בתוך המסגרת לאורך כל תנועת המצלמה.' });

  // 2) coverage - no unplanned black
  let gaps = 0;
  let t = 0;
  for (const c of clips) {
    if (c.start - t > 0.04) { gaps++; out.push({ level: 'error', title: 'מסך שחור לא מתוכנן', detail: `${fmt(t)}–${fmt(c.start)}`, at: t }); }
    if (c.start < t - 0.04) out.push({ level: 'warn', title: 'קליפים חופפים', at: c.start, clipId: c.id });
    t = Math.max(t, c.start + c.dur);
  }
  const end = a.duration;
  if (end - t > 0.04) { gaps++; out.push({ level: 'error', title: 'הסרט נגמר לפני השיר', detail: `חסרות ${(end - t).toFixed(1)} שניות.`, at: t }); }
  if (t - end > 0.04) out.push({ level: 'warn', title: 'הסרט ארוך מהשיר', detail: `${(t - end).toFixed(1)} שניות אחרי סוף השיר ייחתכו.` });
  if (!gaps) out.push({ level: 'ok', title: 'אין מסכים שחורים לא מתוכננים', detail: 'השחור היחיד הוא בפתיחה (לפני האור הראשון) ובדעיכה של הסיום.' });

  // 3) pacing / harsh cuts
  const tooShort = clips.filter((c) => c.dur < 0.38);
  tooShort.forEach((c) => out.push({ level: 'warn', title: 'שוט קצר מאוד', detail: `${fmt(c.start)} (${c.dur.toFixed(2)} ש׳)`, at: c.start, clipId: c.id }));
  const longCut = clips.filter((c, i) => i > 0 && c.transition === 'cut' && c.dur > 4);
  longCut.forEach((c) => out.push({ level: 'warn', title: 'חיתוך חד לשוט ארוך ושקט', detail: `ב-${fmt(c.start)} כדאי מעבר רך.`, at: c.start, clipId: c.id }));
  const badTrans = clips.filter((c, i) => i > 0 && c.transDur > Math.min(c.dur, clips[i - 1].dur) * 0.9);
  badTrans.forEach((c) => out.push({ level: 'warn', title: 'מעבר ארוך מדי לשוט', at: c.start, clipId: c.id }));
  if (!tooShort.length && !longCut.length && !badTrans.length) out.push({ level: 'ok', title: 'אין מעברים חדים או תקיעות', detail: 'כל תמונה בתנועה רציפה, גם בזמן המעברים.' });

  // 4) sync
  const cuts = clips.slice(1).map((c) => c.start);
  const onBeat = cuts.filter((c) => Math.abs(nearestBeat(a.beats, c) - c) < 0.045).length;
  const pct = cuts.length ? Math.round((onBeat / cuts.length) * 100) : 100;
  out.push({ level: pct >= 90 ? 'ok' : 'warn', title: `סנכרון למוזיקה: ${pct}% מהחיתוכים על פעמה`, detail: `${a.bpm} BPM, ${a.beats.length} פעמות.` });

  // 5) ending exactly with the song
  const last = clips[clips.length - 1];
  if (Math.abs(last.start + last.dur - end) <= 0.04) out.push({ level: 'ok', title: 'הסרט מסתיים בדיוק עם השיר', detail: `${fmt(end)}, עם דעיכה איטית לשחור.` });

  // 6) captions
  const caps = [...project.captions].sort((x, y) => x.start - y.start);
  let capIssues = 0;
  for (const c of caps) {
    const text = c.text.trim();
    if (!text) { capIssues++; out.push({ level: 'error', title: 'כיתוב ריק', at: c.start }); continue; }
    if (/[a-zA-Z]{3,}/.test(text)) out.push({ level: 'warn', title: 'כיתוב עם אותיות לטיניות', detail: text, at: c.start });
    const need = 1.2 + text.replace(/\s/g, '').length * 0.055;
    if (c.dur < need) { capIssues++; out.push({ level: 'warn', title: 'כיתוב קצר מכדי לקרוא', detail: `"${text.split('\n')[0]}" מוצג ${c.dur.toFixed(1)} ש׳, מומלץ ${need.toFixed(1)}.`, at: c.start }); }
    if (c.start < 0 || c.start + c.dur > end + 0.01) { capIssues++; out.push({ level: 'error', title: 'כיתוב מחוץ לשיר', detail: text, at: c.start }); }
    if (/ {2,}|\s[,.!?]/.test(text)) out.push({ level: 'warn', title: 'רווח מיותר בכיתוב', detail: text, at: c.start });
  }
  for (let i = 1; i < caps.length; i++) {
    const p = caps[i - 1], c = caps[i];
    const pairOk = (p.style === 'big' && c.style === 'signature') || (p.style === 'signature' && c.style === 'big');
    if (!pairOk && c.start < p.start + p.dur - 0.05) { capIssues++; out.push({ level: 'warn', title: 'שני כיתובים חופפים', detail: `"${p.text.split('\n')[0]}" ו-"${c.text.split('\n')[0]}"`, at: c.start }); }
  }
  if (!capIssues) out.push({ level: 'ok', title: 'הכיתובים תקינים', detail: `${caps.length} כיתובים בעברית, מימין לשמאל, בזמן קריאה מספיק.` });

  // 7) lyrics
  if (project.settings.showLyrics) {
    const unsynced = project.lyrics.filter((l) => l.text.trim() && l.start == null).length;
    if (unsynced) out.push({ level: 'error', title: `${unsynced} שורות מילים בלי תזמון`, detail: 'מילים מוצגות רק אחרי סנכרון. סנכרנו אותן או כבו את הצגת המילים.' });
  }

  // 8) photos
  const used = new Set(clips.flatMap((c) => c.photoIds));
  const active = project.photos.filter((p) => !p.excluded);
  const unused = active.filter((p) => !used.has(p.id));
  out.push(unused.length
    ? { level: 'warn', title: `${unused.length} תמונות לא נכנסו לסרט`, detail: unused.slice(0, 6).map((p) => p.name).join(', ') + (unused.length > 6 ? '…' : '') }
    : { level: 'ok', title: `כל ${active.length} התמונות בסרט` });
  const dups: string[] = [];
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++)
    if (hashDistance(active[i].hash, active[j].hash) <= 3) dups.push(`${active[i].name} ≈ ${active[j].name}`);
  if (dups.length) out.push({ level: 'warn', title: `${dups.length} זוגות של תמונות כמעט זהות`, detail: dups.slice(0, 4).join(' · ') });
  const appear = new Map<string, number>();
  clips.forEach((c) => c.photoIds.forEach((id) => appear.set(id, (appear.get(id) ?? 0) + 1)));
  const twice = [...appear.entries()].filter(([, n]) => n > 1);
  if (twice.length) out.push({ level: 'warn', title: `${twice.length} תמונות מופיעות יותר מפעם אחת` });

  return out;
}
