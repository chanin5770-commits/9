import React, { useEffect, useState } from 'react';
import type { PlayerRef } from '@remotion/player';
import type { LyricLine, Project } from '../../shared/types';
import { uid } from '../../shared/types';
import { matchLyrics } from '../../shared/storyboard';
import { api } from '../lib/api';
import type { Update } from '../App';

const fmt = (t: number | null) => (t == null ? '—' : `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);

/**
 * Lyrics are never invented: the user pastes the real words, then syncs them by tapping along
 * with the song (or, if Whisper is installed locally, starts from a draft transcript to correct).
 */
export const LyricsPanel: React.FC<{ project: Project; update: Update; playerRef: React.RefObject<PlayerRef | null>; seek: (t: number) => void }> = ({ project, update, playerRef, seek }) => {
  const [draft, setDraft] = useState(project.lyrics.map((l) => l.text).join('\n'));
  const [tapIdx, setTapIdx] = useState<number | null>(null);
  const [whisper, setWhisper] = useState(false);
  const [tstate, setTstate] = useState('');
  const [note, setNote] = useState('');
  const lines = project.lyrics;
  useEffect(() => { api.capabilities().then((c) => setWhisper(c.whisper)).catch(() => {}); }, []);

  const now = () => (playerRef.current?.getCurrentFrame() ?? 0) / 30;
  const applyText = () => {
    const texts = draft.split('\n').map((s) => s.trim()).filter(Boolean);
    update((p) => ({ ...p, lyrics: texts.map((text, i) => ({ id: p.lyrics[i]?.id ?? uid(), text, start: p.lyrics[i]?.text === text ? p.lyrics[i].start : null, end: null })) }));
  };
  const setLine = (i: number, q: Partial<LyricLine>) => update((p) => ({ ...p, lyrics: p.lyrics.map((l, k) => (k === i ? { ...l, ...q } : l)) }));

  // tap sync: Space / the big button stamps the current line and moves to the next
  const tap = () => {
    if (tapIdx === null) return;
    const t = Math.round(now() * 100) / 100;
    setLine(tapIdx, { start: t });
    if (tapIdx + 1 >= lines.length) { setTapIdx(null); playerRef.current?.pause(); setNote('הסנכרון הסתיים. אפשר לתקן כל שורה ידנית.'); }
    else setTapIdx(tapIdx + 1);
  };
  useEffect(() => {
    if (tapIdx === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Enter' || e.code === 'KeyJ') { e.preventDefault(); tap(); } if (e.code === 'Escape') { setTapIdx(null); playerRef.current?.pause(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const startTap = () => {
    if (!lines.length) return;
    const first = lines.findIndex((l) => l.start == null);
    const i = first >= 0 ? first : 0;
    setTapIdx(i);
    const back = i > 0 && lines[i - 1].start != null ? lines[i - 1].start! : 0;
    seek(back);
    playerRef.current?.play();
  };

  const transcribe = async () => {
    setTstate('מתמלל במחשב (Whisper). זה יכול לקחת כמה דקות…');
    try {
      let job = await api.transcribe(project.id);
      while (!job.done) { await new Promise((r) => setTimeout(r, 2000)); job = await api.transcribeStatus(job.id); }
      if (job.error || !job.segments) throw new Error(job.error || 'no result');
      const segs = job.segments;
      update((p) => ({ ...p, lyrics: segs.map((s) => ({ id: uid(), text: s.text, start: Math.round(s.start * 100) / 100, end: Math.round(s.end * 100) / 100 })), settings: { ...p.settings, showLyrics: false } }));
      setDraft(segs.map((s) => s.text).join('\n'));
      setTstate('נוצרה טיוטת תמלול. תמלול אוטומטי של שירה בעברית אינו מדויק: בדקו ותקנו כל שורה לפני שמציגים את המילים.');
    } catch (e) { setTstate('התמלול נכשל: ' + (e as Error).message); }
  };

  const synced = lines.length > 0 && lines.every((l) => l.start != null);
  return (
    <div className="lyrics-panel">
      <h3>מילות השיר</h3>
      <p className="muted small">המערכת לא ממציאה מילים. הדביקו את המילים המדויקות, שורה בכל שורה, וסנכרנו אותן לשיר. מילים שמזכירות ילד או רגע (למשל "טיול" או "חיבוק") ימשכו לאותו רגע תמונה מתאימה.</p>
      <textarea dir="rtl" className="lyrics-text" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="הדביקו כאן את מילות השיר…" />
      <div className="btn-row">
        <button onClick={applyText}>שמירת המילים</button>
        {whisper && <button className="ghost" onClick={transcribe}>טיוטת תמלול מקומית (Whisper)</button>}
      </div>
      {tstate && <p className="status small">{tstate}</p>}
      {lines.length > 0 && (
        <>
          <div className="btn-row">
            {tapIdx === null ? <button className="primary" onClick={startTap}>סנכרון בהקשה</button> : <button className="primary big tap" onClick={tap}>הקשה (Enter): "{lines[tapIdx]?.text}"</button>}
            {tapIdx !== null && <button className="ghost" onClick={() => { setTapIdx(null); playerRef.current?.pause(); }}>עצירה</button>}
          </div>
          {tapIdx !== null && <p className="muted small">השיר מתנגן. הקישו Enter בדיוק כשכל שורה מתחילה. Esc לעצירה.</p>}
          {note && <p className="status small">{note}</p>}
          <ol className="lyric-lines">
            {lines.map((l, i) => (
              <li key={l.id} className={tapIdx === i ? 'current' : ''}>
                <button className="ghost small" onClick={() => l.start != null && seek(l.start)}>{fmt(l.start)}</button>
                <span className="lt">{l.text}</span>
                <input type="number" step={0.05} value={l.start ?? ''} placeholder="שנייה" onChange={(e) => setLine(i, { start: e.target.value === '' ? null : Number(e.target.value) })} />
              </li>
            ))}
          </ol>
          <label className="field-row">
            <span>הצגת המילים בסרט</span>
            <input type="checkbox" checked={project.settings.showLyrics} disabled={!synced} onChange={(e) => update((p) => ({ ...p, settings: { ...p.settings, showLyrics: e.target.checked } }))} />
          </label>
          {!synced && <p className="muted small">אפשר להציג את המילים רק אחרי שכל השורות מסונכרנות.</p>}
          <button disabled={!lines.some((l) => l.start != null) || !project.clips.length} onClick={() => {
            update((p) => { const clips = p.clips.map((c) => ({ ...c })); matchLyrics(clips, p.lyrics, new Map(p.photos.map((x) => [x.id, x]))); return { ...p, clips }; });
            setNote('התמונות הותאמו למילים, בכל מקום שנמצאה תמונה מתאימה.');
          }}>התאמת תמונות למילים</button>
        </>
      )}
    </div>
  );
};
