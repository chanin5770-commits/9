import React from 'react';
import type { PlayerRef } from '@remotion/player';
import type { Caption, CaptionStyle, Project } from '../../shared/types';
import { CAPTION_STYLE_LABELS, uid } from '../../shared/types';
import { defaultCaptions, regions } from '../../shared/storyboard';
import type { Update } from '../App';

export const CaptionsPanel: React.FC<{ project: Project; update: Update; playerRef: React.RefObject<PlayerRef | null>; seek: (t: number) => void; selected: string | null; setSelected: (id: string | null) => void }> = ({ project, update, playerRef, seek, selected, setSelected }) => {
  const caps = [...project.captions].sort((a, b) => a.start - b.start);
  const now = () => (playerRef.current?.getCurrentFrame() ?? 0) / 30;
  const patch = (id: string, q: Partial<Caption>) => update((p) => ({ ...p, captions: p.captions.map((c) => (c.id === id ? { ...c, ...q } : c)) }), { history: !('text' in q) });
  const remove = (id: string) => update((p) => ({ ...p, captions: p.captions.filter((c) => c.id !== id) }));
  const add = () => {
    const c: Caption = { id: uid(), text: 'כיתוב חדש', start: now(), dur: 3.5, style: 'lower' };
    update((p) => ({ ...p, captions: [...p.captions, c] }));
    setSelected(c.id);
  };
  const reset = () => {
    if (!project.audio?.analysis) return;
    if (confirm('להחזיר את כל הכיתובים לנוסח ולתזמון המקוריים?')) update((p) => ({ ...p, captions: defaultCaptions(regions(p.audio!.analysis!)) }));
  };
  return (
    <div className="captions-panel">
      <div className="panel-head">
        <h3>כיתובים</h3>
        <div className="btn-row">
          <button onClick={add}>+ כיתוב בנקודה הנוכחית</button>
          <button className="ghost" onClick={reset}>שחזור</button>
        </div>
      </div>
      <p className="muted small">שורה חדשה (Enter) יוצרת שורה בכיתוב. ❤️ מוצג כלב מעוצב.</p>
      {caps.map((c) => (
        <div key={c.id} className={'cap-item' + (selected === c.id ? ' sel' : '')} onClick={() => setSelected(c.id)}>
          <textarea dir="rtl" value={c.text} rows={Math.max(1, c.text.split('\n').length)} onChange={(e) => patch(c.id, { text: e.target.value })} />
          <div className="cap-row">
            <label>התחלה <input type="number" step={0.1} min={0} value={c.start.toFixed(1)} onChange={(e) => patch(c.id, { start: Number(e.target.value) })} /></label>
            <label>משך <input type="number" step={0.1} min={0.5} value={c.dur.toFixed(1)} onChange={(e) => patch(c.id, { dur: Number(e.target.value) })} /></label>
            <select value={c.style} onChange={(e) => patch(c.id, { style: e.target.value as CaptionStyle })}>
              {(Object.keys(CAPTION_STYLE_LABELS) as CaptionStyle[]).map((s) => <option key={s} value={s}>{CAPTION_STYLE_LABELS[s]}</option>)}
            </select>
          </div>
          <div className="btn-row">
            <button className="ghost small" onClick={(e) => { e.stopPropagation(); seek(c.start); playerRef.current?.play(); }}>▶ צפייה</button>
            <button className="ghost small" onClick={(e) => { e.stopPropagation(); patch(c.id, { start: Math.round(now() * 10) / 10 }); }}>התחלה = עכשיו</button>
            <button className="ghost small danger" onClick={(e) => { e.stopPropagation(); remove(c.id); }}>מחיקה</button>
          </div>
        </div>
      ))}
    </div>
  );
};
