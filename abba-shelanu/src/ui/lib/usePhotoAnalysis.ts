import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../shared/types';
import { analyzePhoto } from './photoAnalysis';
import type { Update } from '../App';

/** Background queue: face detection + measurements for every photo that has not been analyzed yet. */
export function usePhotoAnalysis(project: Project | null, update: Update) {
  const busy = useRef(false);
  const failed = useRef(new Set<string>());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!project || busy.current) return;
    const next = project.photos.find((p) => p.faces === null && !failed.current.has(p.id));
    if (!next) return;
    busy.current = true;
    const pid = project.id;
    analyzePhoto(pid, next)
      .then((res) => update((p) => (p.id !== pid ? p : { ...p, photos: p.photos.map((x) => (x.id === next.id ? { ...x, ...res } : x)) }), { history: false }))
      .catch(() => failed.current.add(next.id))
      .finally(() => { busy.current = false; setTick((t) => t + 1); });
  }, [project, tick, update]);
}
