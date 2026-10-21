// Engine self-test: analysis -> smart order -> storyboard -> QC on a song file and a photo folder.
//   npx tsx scripts/selftest.ts <song> <photos-dir>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeAudio, nearestBeat } from '../src/shared/audioAnalysis';
import { buildStoryboard, smartOrder, tagsFromPath, regions } from '../src/shared/storyboard';
import { runQc } from '../src/shared/qc';
import { DEFAULT_SETTINGS, type Photo, type Project } from '../src/shared/types';

const [song, dir] = process.argv.slice(2);
const SR = 22050;
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', song, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
let t0 = Date.now();
const a = analyzeAudio(samples, SR);
console.log(`analysis ${Date.now() - t0}ms  dur=${a.duration.toFixed(1)} bpm=${a.bpm} beats=${a.beats.length} peak=${a.peak.toFixed(1)} first=${a.firstSound} last=${a.lastSound}`);
console.log('sections', a.sections.map((s) => `${s.kind}@${s.start.toFixed(1)}-${s.end.toFixed(1)}(${s.energy.toFixed(2)})`).join(' '));
console.log('regions', JSON.stringify(regions(a), (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)));

const files: string[] = [];
const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name))));
walk(dir);
const photos: Photo[] = files.map((f, i) => {
  const rel = path.relative(dir, f);
  const sizes = [[4032, 3024], [3024, 4032], [1920, 1080], [1080, 1920], [3000, 3000]];
  const [w, h] = sizes[(i * 7) % 5];
  const tags = tagsFromPath(rel);
  return {
    id: 'p' + i, name: path.basename(f), relPath: rel, w, h, takenAt: 1.6e12 + i * 86400e3, hash: (i * 2654435761 % 2 ** 32).toString(16).padStart(16, '0'),
    faces: [{ x: 0.36, y: 0.3, w: 0.12, h: 0.16 }, { x: 0.55, y: 0.36, w: 0.1, h: 0.13 }].slice(0, 1 + (i % 2)), focus: null,
    stats: { brightness: 0.5, warmth: 0.5, sharpness: 30 }, people: tags.people, moments: tags.moments, hero: i % 37 === 0, excluded: false, lowRes: false,
  };
});
const project: Project = { id: 't', title: 't', createdAt: 0, audio: { file: 'x', name: 'x', analysis: a }, photos, order: photos.map((p) => p.id), clips: [], captions: [], lyrics: [], settings: { ...DEFAULT_SETTINGS } };
t0 = Date.now();
{ const sm = smartOrder(project); project.order = sm.order; project.settings.autoClimaxId = sm.picks.climax; }
const sb = buildStoryboard(project);
console.log(`storyboard ${Date.now() - t0}ms clips=${sb.clips.length} warnings=${sb.warnings.join(' | ')}`);
project.clips = sb.clips; project.captions = sb.captions;
const counts: Record<string, number> = {};
sb.clips.forEach((c) => { const k = c.role === 'rapid' ? 'rapid' : c.layout; counts[k] = (counts[k] || 0) + 1; });
console.log('layouts', counts, 'photos used', new Set(sb.clips.flatMap((c) => c.photoIds)).size);
const durs = sb.clips.map((c) => c.dur);
console.log('dur min/max', Math.min(...durs).toFixed(2), Math.max(...durs).toFixed(2));
const offBeat = sb.clips.slice(1).filter((c) => Math.abs(nearestBeat(a.beats, c.start) - c.start) > 0.045);
console.log('off-beat cuts', offBeat.length);
for (const c of sb.clips.filter((c) => c.role)) if (c.role !== 'rapid') console.log(' ', c.role, c.start.toFixed(1), c.dur.toFixed(1), c.photoIds.map((id) => photos.find((p) => p.id === id)!.relPath).join(','));
for (const q of runQc(project)) console.log(`[${q.level}] ${q.title}${q.detail ? ' — ' + q.detail : ''}`);
fs.writeFileSync(process.env.OUT || '/dev/null', JSON.stringify(project));
