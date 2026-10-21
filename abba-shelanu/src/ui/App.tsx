import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Film } from '../film/Film';
import type { Project } from '../shared/types';
import { frameSize } from '../shared/types';
import { api } from './lib/api';
import { ImportPanel } from './components/ImportPanel';
import { Library } from './components/Library';
import { Timeline } from './components/Timeline';
import { Inspector } from './components/Inspector';
import { CaptionsPanel } from './components/CaptionsPanel';
import { LyricsPanel } from './components/LyricsPanel';
import { ExportPanel } from './components/ExportPanel';
import { Welcome } from './components/Welcome';
import { usePhotoAnalysis } from './lib/usePhotoAnalysis';

export type Update = (fn: (p: Project) => Project, opts?: { history?: boolean }) => void;
type Tab = 'import' | 'photos' | 'edit' | 'words' | 'export';
const TABS: { id: Tab; label: string }[] = [
  { id: 'import', label: '1. שיר ותמונות' },
  { id: 'photos', label: '2. סדר הסיפור' },
  { id: 'edit', label: '3. עריכה' },
  { id: 'words', label: '4. כיתובים ומילים' },
  { id: 'export', label: '5. בדיקה וייצוא' },
];

export const App: React.FC = () => {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>('import');
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error'>('saved');
  const [selClip, setSelClip] = useState<string | null>(null);
  const [selCaption, setSelCaption] = useState<string | null>(null);
  const history = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const playerRef = useRef<PlayerRef>(null);
  const loaded = useRef(false);

  // open the last project automatically
  useEffect(() => {
    const id = localStorage.getItem('abba:last');
    if (id) api.get(id).then((p) => { openProject(p); }).catch(() => localStorage.removeItem('abba:last'));
  }, []);

  const openProject = (p: Project) => {
    loaded.current = false;
    history.current = []; future.current = [];
    setProject(p);
    localStorage.setItem('abba:last', p.id);
    setTab(p.clips.length ? 'edit' : p.photos.length && p.audio ? 'photos' : 'import');
  };

  const update: Update = useCallback((fn, opts) => {
    setProject((p) => {
      if (!p) return p;
      const next = fn(p);
      if (next !== p && opts?.history !== false) {
        history.current.push(p);
        if (history.current.length > 60) history.current.shift();
        future.current = [];
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) setProject((cur) => { if (cur) future.current.push(cur); return prev; });
  }, []);
  const redo = useCallback(() => {
    const nxt = future.current.pop();
    if (nxt) setProject((cur) => { if (cur) history.current.push(cur); return nxt; });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select');
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // autosave
  useEffect(() => {
    if (!project) return;
    if (!loaded.current) { loaded.current = true; return; }
    setSaved('saving');
    const h = setTimeout(() => api.save(project).then(() => setSaved('saved')).catch(() => setSaved('error')), 700);
    return () => clearTimeout(h);
  }, [project]);

  usePhotoAnalysis(project, update);

  const seek = useCallback((t: number) => {
    playerRef.current?.seekTo(Math.max(0, Math.round(t * 30)));
  }, []);

  const filmProps = useMemo(() => (project ? { project: { ...project, settings: { ...project.settings, resolution: 1080 as const } }, mediaBase: '', quality: 'preview' as const } : null), [project]);

  if (!project) return <Welcome onOpen={openProject} />;

  const dur = project.audio?.analysis?.duration ?? 0;
  const { width, height } = frameSize({ format: project.settings.format, resolution: 1080 });
  const showPlayer = tab === 'edit' || tab === 'words' || tab === 'export';
  const canPlay = dur > 0 && project.clips.length > 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">אבא שלנו <span className="heart">♥</span></div>
        <input className="title-input" value={project.title} onChange={(e) => update((p) => ({ ...p, title: e.target.value }), { history: false })} />
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)} disabled={((t.id === 'edit' || t.id === 'export') && !canPlay) || (t.id === 'words' && !canPlay)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button className="ghost" onClick={undo} title="ביטול (Ctrl+Z)">↶</button>
          <button className="ghost" onClick={redo} title="חזרה (Ctrl+Shift+Z)">↷</button>
          <span className={'save-state ' + saved}>{saved === 'saved' ? 'נשמר' : saved === 'saving' ? 'שומר…' : 'שגיאת שמירה'}</span>
          <button className="ghost" onClick={() => { localStorage.removeItem('abba:last'); setProject(null); }}>פרויקטים</button>
        </div>
      </header>

      {tab === 'import' && <ImportPanel project={project} update={update} onDone={() => setTab('photos')} goEdit={() => setTab('edit')} />}
      {tab === 'photos' && <Library project={project} update={update} goEdit={() => setTab('edit')} />}

      {showPlayer && (
        <div className="workspace">
          <aside className="side">
            {tab === 'edit' && <Inspector project={project} update={update} clipId={selClip} setClipId={setSelClip} seek={seek} />}
            {tab === 'words' && (
              <>
                <CaptionsPanel project={project} update={update} playerRef={playerRef} seek={seek} selected={selCaption} setSelected={setSelCaption} />
                <LyricsPanel project={project} update={update} playerRef={playerRef} seek={seek} />
              </>
            )}
            {tab === 'export' && <ExportPanel project={project} seek={seek} setClip={(id) => { setSelClip(id); setTab('edit'); }} />}
          </aside>
          <section className="stage">
            {canPlay && filmProps ? (
              <div dir="ltr" className={'player-wrap ' + (project.settings.format === '9:16' ? 'portrait' : '')}>
                <Player
                  ref={playerRef}
                  component={Film}
                  inputProps={filmProps}
                  durationInFrames={Math.max(1, Math.round(dur * 30))}
                  fps={30}
                  compositionWidth={width}
                  compositionHeight={height}
                  style={{ width: '100%', height: '100%' }}
                  controls
                  showVolumeControls
                  allowFullscreen
                  doubleClickToFullscreen
                  spaceKeyToPlayOrPause
                  acknowledgeRemotionLicense
                />
              </div>
            ) : (
              <div className="empty-stage">אחרי העלאת השיר והתמונות ובניית הסטוריבורד, הסרט יופיע כאן.</div>
            )}
          </section>
        </div>
      )}
      {showPlayer && canPlay && (
        <Timeline project={project} update={update} playerRef={playerRef} seek={seek} selected={selClip} onSelect={(id) => { setSelClip(id); if (tab !== 'edit' && tab !== 'words') setTab('edit'); }} selectedCaption={selCaption} onSelectCaption={(id) => { setSelCaption(id); setTab('words'); }} />
      )}
    </div>
  );
};
