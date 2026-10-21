import React, { useRef, useState } from 'react';
import type { Photo, Project } from '../../shared/types';
import { CHILDREN } from '../../shared/types';
import { tagsFromPath, hashDistance } from '../../shared/storyboard';
import { api } from '../lib/api';
import { analyzeSongFile } from '../lib/audio';
import { rebuild } from '../lib/build';
import type { Update } from '../App';

const IMG = /\.(jpe?g|png|webp|heic|heif|tiff?|avif)$/i;
const BATCH = 6;
const SECTION_NAMES: Record<string, string> = { intro: 'פתיחה', verse: 'בית', build: 'בנייה', chorus: 'פזמון', bridge: 'גשר', outro: 'סיום' };
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

type Picked = { file: File; path: string };

async function filesFromDrop(dt: DataTransfer): Promise<Picked[]> {
  const out: Picked[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const f = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file: f, path: prefix + f.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e, prefix + entry.name + '/');
      }
    }
  };
  const entries = Array.from(dt.items).map((i) => i.webkitGetAsEntry()).filter(Boolean) as FileSystemEntry[];
  if (entries.length) for (const e of entries) await walk(e, '');
  else Array.from(dt.files).forEach((f) => out.push({ file: f, path: f.name }));
  return out;
}

export const ImportPanel: React.FC<{ project: Project; update: Update; onDone: () => void; goEdit: () => void }> = ({ project, update, onDone, goEdit }) => {
  const [songState, setSongState] = useState('');
  const [up, setUp] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const a = project.audio?.analysis;

  const onSong = async (file: File) => {
    try {
      setSongState('מעלה את השיר…');
      const audio = await api.uploadAudio(project.id, file);
      setSongState('מנתח את השיר: קצב, פעמות, בתים ופזמונים…');
      const analysis = await analyzeSongFile(file);
      update((p) => ({ ...p, audio: { ...audio, analysis } }));
      setSongState('');
    } catch (e) {
      setSongState('שגיאה: ' + (e as Error).message + '. נסו קובץ MP3, WAV או M4A.');
    }
  };
  const reanalyze = async () => {
    if (!project.audio) return;
    setSongState('מנתח מחדש…');
    const blob = await fetch(`/media/${project.id}/audio/${project.audio.file}`).then((r) => r.blob());
    const analysis = await analyzeSongFile(blob);
    update((p) => ({ ...p, audio: p.audio && { ...p.audio, analysis } }));
    setSongState('');
  };

  const onPhotos = async (picked: Picked[]) => {
    const files = picked.filter((f) => IMG.test(f.file.name) && !f.file.name.startsWith('.'));
    if (!files.length) return;
    setUp({ done: 0, total: files.length, failed: [] });
    const failed: string[] = [];
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      try {
        const res = await api.uploadPhotos(project.id, batch);
        failed.push(...res.failed.map((f) => f.name));
        const added: Photo[] = res.added.map((ph) => ({ ...ph, ...tagsFromPath(ph.relPath) }));
        update((p) => ({ ...p, photos: [...p.photos, ...added], order: [...p.order, ...added.map((x) => x.id)] }), { history: false });
      } catch (e) {
        console.error('upload failed', e);
        failed.push(...batch.map((b) => b.file.name));
      }
      setUp({ done: Math.min(files.length, i + BATCH), total: files.length, failed: [...failed] });
    }
  };

  const build = () => {
    const r = rebuild(project, { smart: true, resetCaptions: true });
    update(() => r.project);
    setWarnings(r.warnings);
    if (!r.warnings.length) goEdit();
  };

  const photos = project.photos;
  const active = photos.filter((p) => !p.excluded);
  const analyzed = photos.filter((p) => p.faces !== null).length;
  const portrait = active.filter((p) => p.h > p.w).length;
  const perChild = CHILDREN.map((c) => [c, active.filter((p) => p.people.includes(c)).length] as const);
  const lowRes = active.filter((p) => p.lowRes).length;
  let dups = 0;
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) if (hashDistance(active[i].hash, active[j].hash) <= 3) dups++;

  return (
    <div className="page">
      <div className="cards">
        <section className="card">
          <h2>השיר</h2>
          <DropZone accept="audio/*" onFiles={(f) => f[0] && onSong(f[0].file)} label={project.audio ? `החלפת השיר (${project.audio.name})` : 'גררו לכאן את קובץ השיר, או לחצו לבחירה'} />
          {songState && <p className="status">{songState}</p>}
          {a && (
            <div className="analysis">
              <div className="stats-row">
                <Stat label="אורך" value={fmt(a.duration)} />
                <Stat label="קצב" value={`${a.bpm} BPM`} />
                <Stat label="פעמות" value={String(a.beats.length)} />
                <Stat label="חלקים" value={String(a.sections.length)} />
              </div>
              <div className="sections-list">
                {a.sections.map((s, i) => (
                  <span key={i} className={'sec-chip ' + s.kind}>{SECTION_NAMES[s.kind]} {fmt(s.start)}</span>
                ))}
              </div>
              <p className="muted small">הניתוח נעשה במחשב הזה. אם חלק סומן לא נכון, אפשר לתקן אותו בציר הזמן (לחיצה על שם החלק).</p>
              <button className="ghost" onClick={reanalyze}>ניתוח מחדש</button>
            </div>
          )}
        </section>

        <section className="card">
          <h2>התמונות</h2>
          <p className="muted">אפשר לייבא תיקייה שלמה בבת אחת (עד 150 תמונות, ויותר אם צריך). שמות תיקיות כמו <b>משי</b>, <b>ליבי</b>, <b>הדר</b>, <b>שרי</b>, <b>יוני</b>, <b>משפחה</b>, <b>טיול</b> או <b>צחוקים</b> יתויגו אוטומטית.</p>
          <div className="btn-row">
            <button className="primary" onClick={() => folderRef.current?.click()}>בחירת תיקייה שלמה</button>
            <button onClick={() => filesRef.current?.click()}>בחירת תמונות</button>
          </div>
          <input ref={folderRef} type="file" hidden multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={(e) => { onPhotos(Array.from(e.target.files ?? []).map((f) => ({ file: f, path: (f as File & { webkitRelativePath: string }).webkitRelativePath || f.name }))); e.target.value = ''; }} />
          <input ref={filesRef} type="file" hidden multiple accept="image/*,.heic,.heif"
            onChange={(e) => { onPhotos(Array.from(e.target.files ?? []).map((f) => ({ file: f, path: f.name }))); e.target.value = ''; }} />
          <DropZone multiple onPicked={onPhotos} label="או גררו לכאן תיקייה או תמונות" />
          {up && (
            <div className="progress-block">
              <div className="progress"><div style={{ width: `${(up.done / up.total) * 100}%` }} /></div>
              <span>{up.done < up.total ? `מעבד תמונות במחשב: ${up.done} מתוך ${up.total}` : `יובאו ${up.total - up.failed.length} תמונות`}</span>
              {up.failed.length > 0 && <p className="error small">לא הצלחנו לקרוא: {up.failed.join(', ')}</p>}
            </div>
          )}
          {photos.length > 0 && (
            <>
              <div className="stats-row">
                <Stat label="תמונות" value={String(active.length)} />
                <Stat label="לאורך" value={String(portrait)} />
                <Stat label="לרוחב" value={String(active.length - portrait)} />
                <Stat label="זיהוי פנים" value={`${analyzed}/${photos.length}`} />
              </div>
              <div className="sections-list">
                {perChild.map(([c, n]) => <span key={c} className="kid-chip">{c}: {n}</span>)}
              </div>
              {active.length > 150 && <p className="warn small">יש {active.length} תמונות. הסרט יכיל את כולן, אבל מעל 150 הקצב נעשה צפוף. כדאי להוציא כמה בלשונית "סדר הסיפור".</p>}
              {lowRes > 0 && <p className="warn small">{lowRes} תמונות ברזולוציה נמוכה. הן ייכנסו בעיקר לקולאז׳ים.</p>}
              {dups > 0 && <p className="warn small">נמצאו {dups} זוגות של תמונות כמעט זהות.</p>}
            </>
          )}
        </section>

        <section className="card highlight">
          <h2>סטוריבורד אוטומטי</h2>
          <p>המערכת מסדרת את התמונות לסיפור (פתיחה, אבא דרך העיניים שלנו, המשפחה שלנו, רגע השיא, סיום) ומניחה אותן על השיר: תמונות ארוכות בהתחלה, קולאז׳ים ורצפים קצביים בפזמונים, וכל חיתוך על פעמה.</p>
          <button className="primary big" disabled={!a || active.length < 8} onClick={build}>בניית סטוריבורד אוטומטי</button>
          {!a && <p className="muted small">צריך קודם להעלות את השיר.</p>}
          {a && active.length < 8 && <p className="muted small">צריך לפחות 8 תמונות.</p>}
          {analyzed < photos.length && photos.length > 0 && <p className="muted small">זיהוי הפנים עדיין רץ ({analyzed}/{photos.length}). אפשר לבנות כבר עכשיו, אבל עדיף לחכות: הפנים עוזרות למסגר כל תמונה.</p>}
          {warnings.map((w, i) => <p key={i} className="warn small">{w}</p>)}
          {project.clips.length > 0 && <div className="btn-row"><button onClick={onDone}>לסדר הסיפור</button><button onClick={goEdit}>לעריכה</button></div>}
        </section>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="stat"><div className="stat-v">{value}</div><div className="stat-l">{label}</div></div>
);

const DropZone: React.FC<{ label: string; accept?: string; multiple?: boolean; onFiles?: (f: Picked[]) => void; onPicked?: (f: Picked[]) => void }> = ({ label, accept, multiple, onFiles, onPicked }) => {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const cb = onPicked ?? onFiles!;
  return (
    <div className={'dropzone' + (over ? ' over' : '')} onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={async (e) => { e.preventDefault(); setOver(false); cb(await filesFromDrop(e.dataTransfer)); }}>
      {label}
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { cb(Array.from(e.target.files ?? []).map((f) => ({ file: f, path: f.name }))); e.target.value = ''; }} />
    </div>
  );
};
