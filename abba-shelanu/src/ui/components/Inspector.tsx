import React, { useMemo, useState } from 'react';
import type { Clip, Effect, Layout, Project, Transition } from '../../shared/types';
import { EFFECT_LABELS, LAYOUT_LABELS, TRANSITION_LABELS } from '../../shared/types';
import { mergeWithNext, setDuration, splitCollage, swapPhotos, usedPhotoIds } from '../../shared/edit';
import { bestCollage } from '../../shared/layouts';
import { media } from '../lib/api';
import { rebuild } from '../lib/build';
import type { Update } from '../App';

const ROLE: Record<string, string> = { opening: 'פתיחה', family: 'תמונה משפחתית', hero: 'רגע השיא', closing: 'סיום', rapid: 'רצף מהיר', child: 'אבא עם כל ילד' };
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export const Inspector: React.FC<{ project: Project; update: Update; clipId: string | null; setClipId: (id: string | null) => void; seek: (t: number) => void }> = ({ project, update, clipId, setClipId, seek }) => {
  const clips = useMemo(() => [...project.clips].sort((a, b) => a.start - b.start), [project.clips]);
  const i = clips.findIndex((c) => c.id === clipId);
  const c = i >= 0 ? clips[i] : null;
  const [replacing, setReplacing] = useState<number | null>(null);
  const beats = project.audio?.analysis?.beats ?? null;
  const spb = 60 / (project.audio?.analysis?.bpm || 100);
  const s = project.settings;

  const setClips = (fn: (cs: Clip[]) => Clip[]) => update((p) => ({ ...p, clips: fn([...p.clips].sort((a, b) => a.start - b.start)) }));
  const patch = (q: Partial<Clip>) => setClips((cs) => cs.map((x) => (x.id === c!.id ? { ...x, ...q } : x)));
  const setSetting = <K extends keyof Project['settings']>(k: K, v: Project['settings'][K]) => update((p) => ({ ...p, settings: { ...p.settings, [k]: v } }));

  const changeLayout = (layout: Layout) => {
    if (!c) return;
    const need = layout === 'single' ? 1 : layout === 'duo' ? 2 : 3;
    if (need === c.photoIds.length) return patch({ layout });
    if (need < c.photoIds.length) return setClips((cs) => splitCollage(cs, i));
    // borrow photos from the following clips
    setClips((cs) => {
      const out = [...cs];
      const ids = [...out[i].photoIds];
      let j = i + 1;
      while (ids.length < need && j < out.length) {
        if (out[j].photoIds.length === 1 && !out[j].role) { ids.push(out[j].photoIds[0]); out[i] = { ...out[i], dur: out[i].dur + out[j].dur }; out.splice(j, 1); }
        else j++;
      }
      const best = bestCollage(ids.map((id) => project.photos.find((p) => p.id === id)!).filter(Boolean), s.format);
      out[i] = { ...out[i], layout: ids.length >= need ? layout : ids.length === 2 ? 'duo' : 'single', photoIds: best ? best.order.map((p) => p.id) : ids };
      return out;
    });
  };

  return (
    <div className="inspector">
      <h3>הגדרות הסרט</h3>
      <div className="field-row">
        <span>פורמט</span>
        <div className="seg">
          <button className={s.format === '16:9' ? 'on' : ''} onClick={() => update((p) => rebuildIfFormat({ ...p, settings: { ...p.settings, format: '16:9' } }))}>16:9 טלוויזיה</button>
          <button className={s.format === '9:16' ? 'on' : ''} onClick={() => update((p) => rebuildIfFormat({ ...p, settings: { ...p.settings, format: '9:16' } }))}>9:16 טלפון</button>
        </div>
      </div>
      <label className="field-row"><span>גרעין פילם</span><input type="range" min={0} max={1} step={0.05} value={s.grain} onChange={(e) => setSetting('grain', Number(e.target.value))} /></label>
      <label className="field-row"><span>חום הצבע</span><input type="range" min={0} max={1} step={0.05} value={s.warmth} onChange={(e) => setSetting('warmth', Number(e.target.value))} /></label>
      <label className="field-row"><span>דליפות אור</span><input type="checkbox" checked={s.lightLeaks} onChange={(e) => setSetting('lightLeaks', e.target.checked)} /></label>
      <label className="field-row"><span>וינייט</span><input type="checkbox" checked={s.vignette} onChange={(e) => setSetting('vignette', e.target.checked)} /></label>
      <button className="ghost" onClick={() => { if (confirm('לבנות מחדש את כל הסטוריבורד? שינויים ידניים בשוטים יאבדו (הכיתובים נשמרים).')) update((p) => rebuild(p, { smart: false }).project); }}>בנייה מחדש של הסטוריבורד</button>

      <hr />
      {!c && <p className="muted">לחצו על שוט בציר הזמן כדי לערוך אותו.</p>}
      {c && (
        <div className="clip-edit">
          <div className="clip-head">
            <h3>שוט {i + 1} מתוך {clips.length}</h3>
            <div>
              <button className="ghost" disabled={i <= 0} onClick={() => { setClipId(clips[i - 1].id); seek(clips[i - 1].start + 0.05); }}>→</button>
              <button className="ghost" disabled={i >= clips.length - 1} onClick={() => { setClipId(clips[i + 1].id); seek(clips[i + 1].start + 0.05); }}>←</button>
            </div>
          </div>
          <p className="muted small">{fmt(c.start)} · {c.role ? ROLE[c.role] : LAYOUT_LABELS[c.layout]}</p>

          <div className="clip-photos">
            {c.photoIds.map((id, k) => (
              <button key={id + k} className={'clip-ph' + (replacing === k ? ' on' : '')} onClick={() => setReplacing(replacing === k ? null : k)} title="החלפת תמונה">
                <img src={media(project.id, 'thumb', id)} />
                <span>החלפה</span>
              </button>
            ))}
          </div>
          {replacing !== null && <Picker project={project} onPick={(pid) => {
            // if the photo is already in another shot, swap the two
            const other = clips.findIndex((x) => x.id !== c.id && x.photoIds.includes(pid));
            if (other >= 0 && clips[other].photoIds.length === 1 && c.photoIds.length === 1) setClips((cs) => swapPhotos(cs, i, other));
            else patch({ photoIds: c.photoIds.map((x, k) => (k === replacing ? pid : x)) });
            setReplacing(null);
          }} />}

          <label className="field">
            <span>משך: {c.dur.toFixed(2)} שניות ({Math.round(c.dur / spb)} פעמות)</span>
            <div className="btn-row">
              <button onClick={() => setClips((cs) => setDuration(cs, i, c.dur - spb, beats))} disabled={i >= clips.length - 1}>− פעמה</button>
              <button onClick={() => setClips((cs) => setDuration(cs, i, c.dur + spb, beats))} disabled={i >= clips.length - 1}>+ פעמה</button>
              <button onClick={() => setClips((cs) => setDuration(cs, i, c.dur + 4 * spb, beats))} disabled={i >= clips.length - 1}>+ תיבה</button>
            </div>
            <span className="muted small">השוט הבא מתקצר או מתארך בהתאם, כך שהסרט נשאר מסונכרן ונגמר עם השיר.</span>
          </label>

          <label className="field"><span>פריסה</span>
            <select value={c.layout} onChange={(e) => changeLayout(e.target.value as Layout)}>
              {(Object.keys(LAYOUT_LABELS) as Layout[]).map((l) => <option key={l} value={l}>{LAYOUT_LABELS[l]}</option>)}
            </select>
          </label>
          <label className="field"><span>תנועת מצלמה</span>
            <select value={c.effect} onChange={(e) => patch({ effect: e.target.value as Effect })}>
              {(Object.keys(EFFECT_LABELS) as Effect[]).map((x) => <option key={x} value={x}>{EFFECT_LABELS[x]}</option>)}
            </select>
            <span className="muted small">כשהתנועה תחתוך פנים, המערכת מקטינה אותה או מציגה את התמונה בשלמותה.</span>
          </label>
          <label className="field"><span>מעבר לשוט הזה</span>
            <select value={c.transition} onChange={(e) => { const tr = e.target.value as Transition; patch({ transition: tr, transDur: tr === 'cut' ? 0 : c.transDur || 0.8 }); }}>
              {(Object.keys(TRANSITION_LABELS) as Transition[]).map((x) => <option key={x} value={x}>{TRANSITION_LABELS[x]}</option>)}
            </select>
          </label>
          {c.transition !== 'cut' && (
            <label className="field"><span>משך המעבר: {c.transDur.toFixed(1)} ש׳</span>
              <input type="range" min={0.2} max={Math.max(0.3, Math.min(3, c.dur * 0.9))} step={0.1} value={c.transDur} onChange={(e) => patch({ transDur: Number(e.target.value) })} />
            </label>
          )}
          <div className="btn-row">
            {c.photoIds.length > 1 && <button onClick={() => setClips((cs) => splitCollage(cs, i))}>פירוק הקולאז׳ לשוטים</button>}
            {i < clips.length - 1 && <button onClick={() => setClips((cs) => swapPhotos(cs, i, i + 1))}>החלפה עם השוט הבא</button>}
            {i < clips.length - 1 && <button className="danger" onClick={() => setClips((cs) => mergeWithNext(cs, i))}>הסרת השוט הבא (השוט הזה מתארך)</button>}
          </div>
        </div>
      )}
    </div>
  );
};

// the collage layouts depend on the frame shape, so switching format rebuilds the shots with the same order
function rebuildIfFormat(p: Project): Project {
  return p.clips.length ? { ...rebuild(p, { smart: false }).project } : p;
}

const Picker: React.FC<{ project: Project; onPick: (id: string) => void }> = ({ project, onPick }) => {
  const used = usedPhotoIds(project);
  const [onlyUnused, setOnlyUnused] = useState(false);
  const list = project.order.map((id) => project.photos.find((p) => p.id === id)).filter((p) => p && !p.excluded && (!onlyUnused || !used.has(p.id)));
  return (
    <div className="picker">
      <label className="small"><input type="checkbox" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)} /> רק תמונות שלא בסרט</label>
      <div className="picker-grid">
        {list.map((p) => (
          <button key={p!.id} onClick={() => onPick(p!.id)} className={used.has(p!.id) ? 'used' : ''}><img src={media(project.id, 'thumb', p!.id)} loading="lazy" /></button>
        ))}
      </div>
    </div>
  );
};
