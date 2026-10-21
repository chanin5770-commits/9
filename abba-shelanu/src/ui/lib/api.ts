import type { Photo, Project } from '../../shared/types';

const j = async <T,>(r: Response): Promise<T> => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};

export const api = {
  list: () => fetch('/api/projects').then((r) => j<{ id: string; title: string; createdAt: number; photos: number; hasAudio: boolean }[]>(r)),
  create: (title: string) => fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }).then((r) => j<Project>(r)),
  get: (id: string) => fetch(`/api/projects/${id}`).then((r) => j<Project>(r)),
  save: (p: Project) => fetch(`/api/projects/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then((r) => j<{ ok: boolean }>(r)),
  uploadAudio: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('audio', file, file.name);
    return fetch(`/api/projects/${id}/audio`, { method: 'POST', body: fd }).then((r) => j<NonNullable<Project['audio']>>(r));
  },
  uploadPhotos: (id: string, files: { file: File; path: string }[]) => {
    const fd = new FormData();
    fd.append('paths', JSON.stringify(files.map((f) => f.path)));
    files.forEach((f) => fd.append('photos', f.file, f.file.name));
    return fetch(`/api/projects/${id}/photos`, { method: 'POST', body: fd }).then((r) => j<{ added: Photo[]; failed: { name: string; error: string }[] }>(r));
  },
  deletePhoto: (id: string, pid: string) => fetch(`/api/projects/${id}/photos/${pid}`, { method: 'DELETE' }).then((r) => j(r)),
  render: (id: string, body: { format: string; resolution: number; sample: boolean; project?: Project }) =>
    fetch(`/api/projects/${id}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => j<RenderJob>(r)),
  renderStatus: (job: string) => fetch(`/api/render/${job}`).then((r) => j<RenderJob>(r)),
  capabilities: () => fetch('/api/capabilities').then((r) => j<{ whisper: boolean }>(r)),
  transcribe: (id: string) => fetch(`/api/projects/${id}/transcribe`, { method: 'POST' }).then((r) => j<TranscribeJob>(r)),
  transcribeStatus: (job: string) => fetch(`/api/transcribe/${job}`).then((r) => j<TranscribeJob>(r)),
};

export type RenderJob = { id: string; stage: string; progress: number; file: string | null; name: string; error: string | null; startedAt: number };
export type TranscribeJob = { id: string; done: boolean; error: string | null; segments: { start: number; end: number; text: string }[] | null };

export const media = (projectId: string, kind: 'thumb' | 'preview' | 'master' | 'bg', photoId: string) => `/media/${projectId}/${kind}/${photoId}.jpg`;
