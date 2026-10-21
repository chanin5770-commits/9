import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerRef } from '@remotion/player';
import type { Project, Section } from '../../shared/types';
import { moveCut } from '../../shared/edit';
import { regions } from '../../shared/storyboard';
import { media } from '../lib/api';
import type { Update } from '../App';

const SECTION_NAMES: Record<Section['kind'], string> = { intro: 'פתיחה', verse: 'בית', build: 'בנייה', chorus: 'פזמון', bridge: 'גשר', outro: 'סיום' };
const KINDS: Section['kind'][] = ['intro', 'verse', 'build', 'chorus', 'bridge', 'outro'];
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function usePlayerTime(playerRef: React.RefObject<PlayerRef | null>) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const f = playerRef.current?.getCurrentFrame();
      if (f !== undefined) setT((old) => (Math.abs(old - f / 30) > 1e-3 ? f / 30 : old));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playerRef]);
  return t;
}

export const Timeline: React.FC<{
  project: Project; update: Update; playerRef: React.RefObject<PlayerRef | null>; seek: (t: number) => void;
  selected: string | null; onSelect: (id: string) => void; selectedCaption: string | null; onSelectCaption: (id: string) => void;
}> = ({ project, update, playerRef, seek, selected, onSelect, selectedCaption, onSelectCaption }) => {
  const a = project.audio!.analysis!;
  const [zoom, setZoom] = useState(7); // px per second
  const t = usePlayerTime(playerRef);
  const scroller = useRef<HTMLDivElement>(null);
  const W = Math.ceil(a.duration * zoom);
  const x = (s: number) => s * zoom;
  const clips = useMemo(() => [...project.clips].sort((p, q) => p.start - q.start), [project.clips]);
  const r = useMemo(() => regions(a), [a]);
  const drag = useRef<{ i: number } | null>(null);

  // keep the playhead visible while playing
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playerRef.current?.isPlaying()) return;
    const px = x(t);
    if (px < el.scrollLeft + 40 || px > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = px - 120;
  }, [t]);

  const timeAt = (e: React.MouseEvent | MouseEvent) => {
    const el = scroller.current!;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(a.duration, (e.clientX - rect.left + el.scrollLeft) / zoom));
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      const i = drag.current.i;
      update((p) => {
        const sorted = [...p.clips].sort((u, v) => u.start - v.start);
        return { ...p, clips: moveCut(sorted, i, timeAt(e), e.altKey ? null : a.beats) };
      }, { history: false });
    };
    const up = () => { drag.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [zoom, a]);

  const cycleSection = (i: number) =>
    update((p) => {
      const an = p.audio!.analysis!;
      const sections = an.sections.map((s, k) => (k === i ? { ...s, kind: KINDS[(KINDS.indexOf(s.kind) + 1) % KINDS.length] } : s));
      return { ...p, audio: { ...p.audio!, analysis: { ...an, sections } } };
    });

  const wf = a.waveform;
  const wfPath = useMemo(() => {
    let d = '';
    wf.forEach((v, i) => { const px = (i / wf.length) * W; d += `M${px.toFixed(1)} ${20 - v * 18}V${20 + v * 18}`; });
    return d;
  }, [wf, W]);

  const captions = project.captions;
  const lyrics = project.lyrics.filter((l) => l.start != null);

  return (
    <div className="timeline">
      <div className="tl-bar">
        <span className="tl-time">{fmt(t)} / {fmt(a.duration)}</span>
        <span className="muted small">גררו את קצה השוט כדי לשנות משך (ננעל לפעמות; Alt לביטול הנעילה). לחיצה על שם חלק משנה את סוגו.</span>
        <span className="spacer" />
        <label className="small">זום <input type="range" min={3} max={40} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
      </div>
      <div className="tl-scroll" ref={scroller} dir="ltr">
        <div className="tl-inner" style={{ width: W }} onMouseDown={(e) => { if ((e.target as HTMLElement).closest('.tl-clip, .tl-cap, .tl-handle, .tl-sec')) return; seek(timeAt(e)); }}>
          <div className="tl-ruler">
            {Array.from({ length: Math.ceil(a.duration / 10) }, (_, i) => <span key={i} style={{ left: x(i * 10) }}>{fmt(i * 10)}</span>)}
          </div>
          <div className="tl-sections">
            {a.sections.map((s, i) => (
              <div key={i} className={'tl-sec ' + s.kind} style={{ left: x(s.start), width: x(s.end - s.start) }} onClick={() => cycleSection(i)} title="לחיצה: שינוי סוג החלק">
                {SECTION_NAMES[s.kind]}
              </div>
            ))}
            <div className="tl-marker" style={{ left: x(r.heroStart) }} title="רגע השיא">שיא</div>
          </div>
          <svg className="tl-wave" width={W} height={40}>
            <path d={wfPath} stroke="rgba(230,200,150,0.55)" strokeWidth={Math.max(1, W / wf.length)} />
            {a.downbeats.map((b, i) => <line key={i} x1={x(b)} x2={x(b)} y1={0} y2={6} stroke="rgba(255,220,160,0.6)" />)}
          </svg>
          <div className="tl-clips">
            {clips.map((c, i) => (
              <div key={c.id} className={'tl-clip ' + (c.layout !== 'single' ? 'collage ' : '') + (c.role ?? '') + (selected === c.id ? ' sel' : '')}
                style={{ left: x(c.start), width: Math.max(2, x(c.dur) - 1) }}
                onMouseDown={(e) => { e.stopPropagation(); onSelect(c.id); seek(c.start + 0.05); }}
                title={`${fmt(c.start)} · ${c.dur.toFixed(2)} ש׳`}>
                <div className="tl-thumbs">
                  {c.photoIds.map((id) => <img key={id} src={media(project.id, 'thumb', id)} draggable={false} />)}
                </div>
                {c.transition !== 'cut' && <div className="tl-trans" style={{ width: Math.min(x(c.transDur) / 2, x(c.dur)) }} />}
                {i < clips.length - 1 && <div className="tl-handle" onMouseDown={(e) => { e.stopPropagation(); drag.current = { i }; update((p) => ({ ...p })); }} />}
              </div>
            ))}
          </div>
          <div className="tl-caps">
            {captions.map((c) => (
              <div key={c.id} className={'tl-cap ' + c.style + (selectedCaption === c.id ? ' sel' : '')} style={{ left: x(c.start), width: Math.max(4, x(c.dur)) }}
                onMouseDown={(e) => { e.stopPropagation(); onSelectCaption(c.id); seek(c.start + 0.3); }} dir="rtl">
                {c.text.split('\n')[0]}
              </div>
            ))}
            {lyrics.map((l, i) => (
              <div key={l.id} className="tl-lyric" style={{ left: x(l.start!), width: Math.max(4, x((l.end ?? lyrics[i + 1]?.start ?? l.start! + 3) - l.start!)) }} dir="rtl">{l.text}</div>
            ))}
          </div>
          <div className="tl-playhead" style={{ left: x(t) }} />
        </div>
      </div>
    </div>
  );
};
