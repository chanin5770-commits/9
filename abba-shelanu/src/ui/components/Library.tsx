import React, { useMemo, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Child, Moment, Photo, Project, Settings } from '../../shared/types';
import { CHILDREN, MOMENTS } from '../../shared/types';
import { classify } from '../../shared/storyboard';
import { protectedBox } from '../../shared/framing';
import { api, media } from '../lib/api';
import { rebuild } from '../lib/build';
import type { Update } from '../App';

type Filter = 'all' | Child | 'untagged' | 'excluded' | 'hero';
const PINS: { key: keyof Settings; label: string; short: string }[] = [
  { key: 'openingPhotoId', label: 'תמונת פתיחה', short: 'פתיחה' },
  { key: 'familyPhotoId', label: 'תמונה משפחתית אחרי הפתיחה', short: 'משפחה' },
  { key: 'climaxPhotoId', label: 'תמונת השיא', short: 'שיא' },
  { key: 'closingPhotoId', label: 'תמונת סיום', short: 'סיום' },
];
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export const Library: React.FC<{ project: Project; update: Update; goEdit: () => void }> = ({ project, update, goEdit }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [sel, setSel] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const byId = useMemo(() => new Map(project.photos.map((p) => [p.id, p])), [project.photos]);
  const order = useMemo(() => {
    const known = new Set(project.order);
    return [...project.order.filter((id) => byId.has(id)), ...project.photos.filter((p) => !known.has(p.id)).map((p) => p.id)];
  }, [project.order, project.photos, byId]);
  const timeOf = useMemo(() => {
    const m = new Map<string, number>();
    project.clips.forEach((c) => c.photoIds.forEach((id) => { if (!m.has(id)) m.set(id, c.start); }));
    return m;
  }, [project.clips]);

  const visible = order.filter((id) => {
    const p = byId.get(id)!;
    if (filter === 'all') return true;
    if (filter === 'untagged') return !p.people.length && !p.moments.length;
    if (filter === 'excluded') return p.excluded;
    if (filter === 'hero') return p.hero;
    return p.people.includes(filter);
  });

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    update((p) => {
      const o = [...order];
      const from = o.indexOf(String(active.id)), to = o.indexOf(String(over.id));
      return { ...p, order: arrayMove(o, from, to) };
    });
  };

  const click = (id: string, e: React.MouseEvent) => {
    setFocus(id);
    if (e.shiftKey && sel.length) {
      const a = visible.indexOf(sel[sel.length - 1]), b = visible.indexOf(id);
      const [x, y] = a < b ? [a, b] : [b, a];
      setSel([...new Set([...sel, ...visible.slice(x, y + 1)])]);
    } else if (e.ctrlKey || e.metaKey) setSel(sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]);
    else setSel([id]);
  };

  const targets = sel.length ? sel : focus ? [focus] : [];
  const setPhotos = (ids: string[], fn: (p: Photo) => Photo) =>
    update((p) => ({ ...p, photos: p.photos.map((x) => (ids.includes(x.id) ? fn(x) : x)) }));
  const toggleChild = (c: Child) => {
    const all = targets.every((id) => byId.get(id)?.people.includes(c));
    setPhotos(targets, (x) => ({ ...x, people: all ? x.people.filter((y) => y !== c) : [...new Set([...x.people, c])] }));
  };
  const toggleMoment = (m: Moment) => {
    const all = targets.every((id) => byId.get(id)?.moments.includes(m));
    setPhotos(targets, (x) => ({ ...x, moments: all ? x.moments.filter((y) => y !== m) : [...new Set([...x.moments, m])] }));
  };

  const smart = () => {
    const r = rebuild(project, { smart: true });
    update(() => r.project);
    setNote('התמונות סודרו לפי הסיפור והסטוריבורד נבנה מחדש.' + (r.warnings.length ? ' ' + r.warnings.join(' ') : ''));
  };
  const byDate = () => update((p) => ({ ...p, order: [...order].sort((a, b) => (byId.get(a)!.takenAt ?? 9e15) - (byId.get(b)!.takenAt ?? 9e15)) }));
  const applyOrder = () => {
    const r = rebuild(project, { smart: false });
    update(() => r.project);
    setNote('הסטוריבורד עודכן לפי הסדר שלכם.' + (r.warnings.length ? ' ' + r.warnings.join(' ') : ''));
  };
  const remove = async (ids: string[]) => {
    if (!confirm(`למחוק ${ids.length} תמונות מהפרויקט? (הקבצים המקוריים במחשב שלכם לא נמחקים)`)) return;
    for (const id of ids) await api.deletePhoto(project.id, id);
    update((p) => ({
      ...p,
      photos: p.photos.filter((x) => !ids.includes(x.id)),
      order: p.order.filter((x) => !ids.includes(x)),
      clips: p.clips.map((c) => ({ ...c, photoIds: c.photoIds.filter((x) => !ids.includes(x)) })).filter((c) => c.photoIds.length),
    }));
    setSel([]); setFocus(null);
  };

  const fp = focus ? byId.get(focus) : null;
  const counts = (f: Filter) => order.filter((id) => {
    const p = byId.get(id)!;
    return f === 'untagged' ? !p.people.length && !p.moments.length : f === 'excluded' ? p.excluded : f === 'hero' ? p.hero : f === 'all' ? true : p.people.includes(f as Child);
  }).length;

  return (
    <div className="library">
      <div className="lib-main">
        <div className="toolbar">
          <button className="primary" onClick={smart} disabled={!project.audio?.analysis}>סידור חכם לפי הסיפור</button>
          <button onClick={byDate}>לפי תאריך צילום</button>
          <button onClick={applyOrder} disabled={!project.audio?.analysis}>עדכון הסטוריבורד לפי הסדר שלי</button>
          {project.clips.length > 0 && <button onClick={goEdit}>לעריכה ←</button>}
          <span className="spacer" />
          <span className="muted small">גררו כדי לשנות סדר. Ctrl/Shift ללחיצה מרובה.</span>
        </div>
        {note && <p className="status">{note}</p>}
        <div className="filters">
          {(['all', ...CHILDREN, 'hero', 'untagged', 'excluded'] as Filter[]).map((f) => (
            <button key={f} className={'chip' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>
              {f === 'all' ? 'הכול' : f === 'untagged' ? 'בלי תיוג' : f === 'excluded' ? 'מחוץ לסרט' : f === 'hero' ? 'מרכזיות ★' : f} <span className="count">{counts(f)}</span>
            </button>
          ))}
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible} strategy={rectSortingStrategy}>
            <div className="grid">
              {visible.map((id) => {
                const p = byId.get(id)!;
                const pins = PINS.filter((x) => project.settings[x.key] === id).map((x) => x.short);
                return <Card key={id} p={p} index={order.indexOf(id) + 1} projectId={project.id} selected={sel.includes(id)} focused={focus === id} pins={pins} at={timeOf.get(id)} onClick={(e) => click(id, e)} />;
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <aside className="lib-side">
        {targets.length > 1 && <h3>{targets.length} תמונות נבחרו</h3>}
        {fp && targets.length <= 1 && <PhotoDetail p={fp} projectId={project.id} setFocusPoint={(pt) => setPhotos([fp.id], (x) => ({ ...x, focus: pt }))} />}
        {targets.length > 0 && (
          <>
            <h4>מי בתמונה (עם אבא)</h4>
            <div className="chips">
              {CHILDREN.map((c) => {
                const on = targets.every((id) => byId.get(id)?.people.includes(c));
                return <button key={c} className={'chip' + (on ? ' on' : '')} onClick={() => toggleChild(c)}>{c}</button>;
              })}
            </div>
            <h4>איזה רגע</h4>
            <div className="chips">
              {MOMENTS.map((m) => {
                const on = targets.every((id) => byId.get(id)?.moments.includes(m));
                return <button key={m} className={'chip' + (on ? ' on' : '')} onClick={() => toggleMoment(m)}>{m}</button>;
              })}
            </div>
            <h4>בסרט</h4>
            <div className="btn-col">
              <button className={targets.every((id) => byId.get(id)?.hero) ? 'on' : ''} onClick={() => { const all = targets.every((id) => byId.get(id)?.hero); setPhotos(targets, (x) => ({ ...x, hero: !all })); }}>★ תמונה מרכזית (זמן מסך ארוך)</button>
              {targets.length === 1 && PINS.map((pin) => (
                <button key={pin.key} className={project.settings[pin.key] === targets[0] ? 'on' : ''}
                  onClick={() => update((p) => ({ ...p, settings: { ...p.settings, [pin.key]: p.settings[pin.key] === targets[0] ? null : targets[0] } }))}>
                  {pin.label}
                </button>
              ))}
              <button onClick={() => { const all = targets.every((id) => byId.get(id)?.excluded); setPhotos(targets, (x) => ({ ...x, excluded: !all })); }}>
                {targets.every((id) => byId.get(id)?.excluded) ? 'להחזיר לסרט' : 'להוציא מהסרט'}
              </button>
              <button className="danger" onClick={() => remove(targets)}>מחיקה מהפרויקט</button>
            </div>
            <p className="muted small">אחרי שינויים לחצו "עדכון הסטוריבורד לפי הסדר שלי" או "סידור חכם".</p>
          </>
        )}
        {!targets.length && (
          <div className="muted">
            <p>בחרו תמונה כדי לתייג אותה, לסמן אותה כמרכזית או לקבוע אותה כתמונת פתיחה, שיא או סיום.</p>
            <p>הסדר בגריד הוא סדר הסיפור: הראשונה פותחת והאחרונה סוגרת.</p>
          </div>
        )}
      </aside>
    </div>
  );
};

const Card: React.FC<{ p: Photo; index: number; projectId: string; selected: boolean; focused: boolean; pins: string[]; at?: number; onClick: (e: React.MouseEvent) => void }> = ({ p, index, projectId, selected, focused, pins, at, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  const kind = classify(p);
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onClick}
      className={'card-photo' + (selected ? ' sel' : '') + (focused ? ' focus' : '') + (p.excluded ? ' excluded' : '') + (isDragging ? ' dragging' : '')}
      style={{ transform: CSS.Transform.toString(transform), transition }}>
      <img src={media(projectId, 'thumb', p.id)} alt={p.name} loading="lazy" draggable={false} />
      <span className="idx">{index}</span>
      {at !== undefined && <span className="at">{fmt(at)}</span>}
      {p.hero && <span className="star">★</span>}
      <div className="badges">
        {pins.map((x) => <span key={x} className="pin">{x}</span>)}
        {p.people.map((c) => <span key={c} className="kid">{c}</span>)}
        {kind === 'family' && !p.people.length && <span className="kid">משפחה</span>}
        {p.lowRes && <span className="lowres" title="רזולוציה נמוכה">!</span>}
      </div>
    </div>
  );
};

const PhotoDetail: React.FC<{ p: Photo; projectId: string; setFocusPoint: (pt: { x: number; y: number } | null) => void }> = ({ p, projectId, setFocusPoint }) => {
  const box = protectedBox(p);
  return (
    <div className="detail">
      <div className="detail-img" onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setFocusPoint({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
      }}>
        <img src={media(projectId, 'preview', p.id)} alt={p.name} />
        {p.faces?.map((f, i) => <div key={i} className="facebox" style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }} />)}
        {box && <div className="protbox" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} />}
        {p.focus && <div className="focuspt" style={{ left: `${p.focus.x * 100}%`, top: `${p.focus.y * 100}%` }} />}
      </div>
      <div className="small muted">
        {p.relPath} · {p.w}×{p.h} · {p.takenAt ? new Date(p.takenAt).toLocaleDateString('he-IL') : 'בלי תאריך'} · {p.faces === null ? 'מזהה פנים…' : `${p.faces.length} פנים`}
      </div>
      <div className="small muted">לחיצה על התמונה מסמנת נקודת מוקד שלא תיחתך (במקום הפנים שזוהו). {p.focus && <button className="link" onClick={(e) => { e.stopPropagation(); setFocusPoint(null); }}>ביטול נקודת המוקד</button>}</div>
    </div>
  );
};
