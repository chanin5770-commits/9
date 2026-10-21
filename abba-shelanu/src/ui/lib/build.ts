import type { Project } from '../../shared/types';
import { buildStoryboard, smartOrder } from '../../shared/storyboard';

/** (Re)build the storyboard. With smart=true the photos are first put in story order. */
export function rebuild(p: Project, opts: { smart: boolean; resetCaptions?: boolean }): { project: Project; warnings: string[] } {
  let next = { ...p };
  const known = new Set(p.order);
  // photos that are not in the order yet go to the end
  next.order = [...p.order.filter((id) => p.photos.some((x) => x.id === id)), ...p.photos.filter((x) => !known.has(x.id)).map((x) => x.id)];
  if (opts.smart) {
    const sm = smartOrder(next);
    next.order = [...sm.order, ...next.order.filter((id) => p.photos.find((x) => x.id === id)?.excluded)];
    next.settings = { ...next.settings, autoClimaxId: sm.picks.climax || null };
  }
  const sb = buildStoryboard(next);
  next = { ...next, clips: sb.clips, captions: opts.resetCaptions || !p.captions.length ? sb.captions : p.captions };
  return { project: next, warnings: sb.warnings };
}
