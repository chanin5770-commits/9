// Manual edits that keep the film tiled over the song (nothing drifts, the end stays on the last note).

import type { Clip, Project } from './types';
import { nearestBeat } from './audioAnalysis';

const MIN = 0.4;

/** Rolling edit: move the cut at the END of clip i; the next clip absorbs the change. */
export function moveCut(clips: Clip[], i: number, newEnd: number, beats: number[] | null): Clip[] {
  if (i < 0 || i >= clips.length - 1) return clips;
  const a = clips[i], b = clips[i + 1];
  let t = beats && beats.length ? nearestBeat(beats, newEnd) : newEnd;
  t = Math.min(b.start + b.dur - MIN, Math.max(a.start + MIN, t));
  const out = clips.slice();
  out[i] = { ...a, dur: t - a.start };
  out[i + 1] = { ...b, start: t, dur: b.start + b.dur - t };
  return out;
}

export function setDuration(clips: Clip[], i: number, dur: number, beats: number[] | null) {
  return moveCut(clips, i, clips[i].start + dur, beats);
}

/** Swap the pictures of two clips (keeps timing). */
export function swapPhotos(clips: Clip[], i: number, j: number): Clip[] {
  const out = clips.slice();
  out[i] = { ...clips[i], photoIds: clips[j].photoIds, layout: clips[j].layout };
  out[j] = { ...clips[j], photoIds: clips[i].photoIds, layout: clips[i].layout };
  return out;
}

/** Split a collage into separate shots of equal length. */
export function splitCollage(clips: Clip[], i: number): Clip[] {
  const c = clips[i];
  if (c.photoIds.length < 2) return clips;
  const n = c.photoIds.length, per = c.dur / n;
  const parts: Clip[] = c.photoIds.map((id, k) => ({ ...c, id: c.id + '-' + k, start: c.start + k * per, dur: per, layout: 'single', photoIds: [id], transition: k ? 'crossfade' : c.transition, transDur: k ? Math.min(0.5, per * 0.3) : c.transDur }));
  return [...clips.slice(0, i), ...parts, ...clips.slice(i + 1)];
}

/** Merge a clip with the following one (the following one's time is added). */
export function mergeWithNext(clips: Clip[], i: number): Clip[] {
  if (i >= clips.length - 1) return clips;
  const out = clips.slice();
  out[i] = { ...clips[i], dur: clips[i].dur + clips[i + 1].dur };
  out.splice(i + 1, 1);
  return out;
}

export const usedPhotoIds = (p: Project) => new Set(p.clips.flatMap((c) => c.photoIds));
