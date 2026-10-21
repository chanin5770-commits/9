// Local server for the editor. Listens on 127.0.0.1 only: the family photos stay on this computer.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { ensureDirs, processPhoto, VARIANTS } from './media.mjs';
import { jobs, startRender } from './render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(process.env.ABBA_DATA_DIR || path.join(root, 'projects'));
const PORT = Number(process.env.PORT || 4321);
fs.mkdirSync(DATA, { recursive: true });

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });

const rid = () => Math.random().toString(36).slice(2, 10);
const projDir = (id) => {
  if (!/^[a-z0-9]+$/i.test(id)) throw Object.assign(new Error('bad id'), { status: 400 });
  return path.join(DATA, id);
};
const load = (id) => JSON.parse(fs.readFileSync(path.join(projDir(id), 'project.json'), 'utf8'));
const save = (p) => {
  const f = path.join(projDir(p.id), 'project.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(p));
  fs.renameSync(f + '.tmp', f);
};
// one write at a time per project
const locks = new Map();
const withLock = (id, fn) => {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(id, next.catch(() => {}));
  return next;
};

const DEFAULT_SETTINGS = {
  format: '16:9', resolution: 1080, fps: 30, grain: 0.5, lightLeaks: true, vignette: true, warmth: 0.6, showLyrics: false,
  openingPhotoId: null, closingPhotoId: null, familyPhotoId: null, climaxPhotoId: null,
};

// ------------------------------------------------------------------ projects

app.get('/api/projects', (req, res) => {
  const list = fs.readdirSync(DATA).filter((d) => fs.existsSync(path.join(DATA, d, 'project.json'))).map((d) => {
    const p = load(d);
    return { id: p.id, title: p.title, createdAt: p.createdAt, photos: p.photos.length, hasAudio: !!p.audio };
  });
  res.json(list.sort((a, b) => b.createdAt - a.createdAt));
});

app.post('/api/projects', (req, res) => {
  const id = rid();
  ensureDirs(projDir(id));
  const p = { id, title: req.body?.title || 'אבא שלנו', createdAt: Date.now(), audio: null, photos: [], order: [], clips: [], captions: [], lyrics: [], settings: DEFAULT_SETTINGS };
  save(p);
  res.json(p);
});

app.get('/api/projects/:id', (req, res) => res.json(load(req.params.id)));

// Save from the editor. Photos are only added by upload and only removed by DELETE,
// so a save that raced an upload can never lose photos.
app.put('/api/projects/:id', async (req, res) => {
  const out = await withLock(req.params.id, () => {
    const cur = load(req.params.id);
    const incoming = req.body;
    const known = new Map(cur.photos.map((p) => [p.id, p]));
    const photos = incoming.photos.filter((p) => known.has(p.id));
    const seen = new Set(photos.map((p) => p.id));
    for (const p of cur.photos) if (!seen.has(p.id)) photos.push(p);
    const next = { ...incoming, id: cur.id, createdAt: cur.createdAt, audio: incoming.audio && cur.audio ? { ...cur.audio, analysis: incoming.audio.analysis } : cur.audio, photos };
    save(next);
    return next;
  });
  res.json({ ok: true, photos: out.photos.length });
});

// ------------------------------------------------------------------ uploads

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(projDir(req.params.id), 'incoming')),
    filename: (req, file, cb) => cb(null, rid() + path.extname(file.originalname || '').toLowerCase()),
  }),
  limits: { fileSize: 400 * 1024 * 1024 },
  defParamCharset: 'utf8',
});

app.post('/api/projects/:id/audio', upload.single('audio'), async (req, res) => {
  const dir = projDir(req.params.id);
  const name = req.file.originalname;
  const file = 'song' + path.extname(name).toLowerCase();
  for (const f of fs.readdirSync(path.join(dir, 'audio'))) fs.rmSync(path.join(dir, 'audio', f));
  fs.renameSync(req.file.path, path.join(dir, 'audio', file));
  const p = await withLock(req.params.id, () => {
    const cur = load(req.params.id);
    cur.audio = { file, name, analysis: null };
    save(cur);
    return cur;
  });
  res.json(p.audio);
});

app.post('/api/projects/:id/photos', upload.array('photos', 200), async (req, res) => {
  const dir = projDir(req.params.id);
  let paths = [];
  try { paths = JSON.parse(req.body.paths || '[]'); } catch {}
  const added = [], failed = [];
  for (let i = 0; i < req.files.length; i++) {
    const f = req.files[i];
    const name = f.originalname;
    const id = rid();
    try {
      const info = await processPhoto(dir, id, f.path, name);
      const keep = path.join(dir, 'originals', id + path.extname(name).toLowerCase());
      fs.renameSync(f.path, keep);
      added.push({ id, name, relPath: paths[i] || name, ...info, faces: null, focus: null, stats: null, people: [], moments: [], hero: false, excluded: false });
    } catch (e) {
      failed.push({ name, error: String(e.message || e) });
      fs.rmSync(f.path, { force: true });
    }
  }
  await withLock(req.params.id, () => {
    const cur = load(req.params.id);
    cur.photos.push(...added);
    cur.order.push(...added.map((p) => p.id));
    save(cur);
  });
  res.json({ added, failed });
});

app.delete('/api/projects/:id/photos/:pid', async (req, res) => {
  const dir = projDir(req.params.id);
  const pid = req.params.pid.replace(/[^a-z0-9]/gi, '');
  await withLock(req.params.id, () => {
    const cur = load(req.params.id);
    cur.photos = cur.photos.filter((p) => p.id !== pid);
    cur.order = cur.order.filter((x) => x !== pid);
    cur.clips = cur.clips.map((c) => ({ ...c, photoIds: c.photoIds.filter((x) => x !== pid) })).filter((c) => c.photoIds.length);
    save(cur);
  });
  for (const v of VARIANTS) fs.rmSync(path.join(dir, v, pid + '.jpg'), { force: true });
  for (const f of fs.readdirSync(path.join(dir, 'originals'))) if (f.startsWith(pid + '.')) fs.rmSync(path.join(dir, 'originals', f));
  res.json({ ok: true });
});

// ------------------------------------------------------------------ media

app.use('/media/:id', (req, res, next) => {
  try { express.static(projDir(req.params.id), { maxAge: '1h', fallthrough: false })(req, res, next); } catch (e) { next(e); }
});
app.use('/vendor/mediapipe', express.static(path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm')));
app.get('/api/projects/:id/exports/:file', (req, res) => {
  const f = path.join(projDir(req.params.id), 'exports', path.basename(req.params.file));
  res.download(f);
});

// ------------------------------------------------------------------ render

app.post('/api/projects/:id/render', (req, res) => {
  const stored = load(req.params.id);
  const { format = '16:9', resolution = 1080, sample = false } = req.body || {};
  // the editor sends its current state (no autosave lag); photos always come from disk
  const project = req.body?.project ? { ...req.body.project, id: stored.id, photos: stored.photos.map((p) => ({ ...p, ...(req.body.project.photos.find((x) => x.id === p.id) ?? {}) })), audio: stored.audio && { ...stored.audio, analysis: req.body.project.audio?.analysis ?? stored.audio.analysis } } : stored;
  if (!project.audio?.analysis || !project.clips.length) return res.status(400).json({ error: 'צריך שיר מנותח וסטוריבורד לפני ייצוא.' });
  // a 12 second sample around the peak to check the look quickly
  let range = null;
  if (sample) {
    const c = project.clips.find((x) => x.role === 'hero') ?? project.clips[Math.floor(project.clips.length / 2)];
    const s = Math.max(0, Math.round((c.start - 6) * 30));
    range = [s, Math.min(Math.round(project.audio.analysis.duration * 30) - 1, s + 12 * 30)];
  }
  const job = startRender({ root, project, projectDir: projDir(req.params.id), port: PORT, format, resolution: Number(resolution), range });
  res.json(job);
});

app.get('/api/render/:job', (req, res) => {
  const j = jobs.get(req.params.job);
  if (!j) return res.status(404).json({ error: 'not found' });
  res.json(j);
});

// ------------------------------------------------------------------ optional local transcription (whisper CLI)

const whisperCmd = () => {
  if (process.env.WHISPER_CMD) return process.env.WHISPER_CMD;
  const r = spawnSync('whisper', ['--help'], { stdio: 'ignore' });
  return r.status === 0 ? 'whisper' : null;
};
app.get('/api/capabilities', (req, res) => res.json({ whisper: !!whisperCmd() }));

const tjobs = new Map();
app.post('/api/projects/:id/transcribe', (req, res) => {
  const cmd = whisperCmd();
  if (!cmd) return res.status(400).json({ error: 'Whisper לא מותקן במחשב הזה.' });
  const project = load(req.params.id);
  const dir = projDir(req.params.id);
  const out = path.join(dir, 'transcript');
  fs.mkdirSync(out, { recursive: true });
  const id = rid();
  const job = { id, done: false, error: null, segments: null };
  tjobs.set(id, job);
  const model = process.env.WHISPER_MODEL || 'large-v3';
  const p = spawn(cmd, [path.join(dir, 'audio', project.audio.file), '--language', 'he', '--model', model, '--output_format', 'json', '--output_dir', out], { stdio: 'ignore' });
  p.on('close', (code) => {
    try {
      if (code !== 0) throw new Error('whisper exit ' + code);
      const f = fs.readdirSync(out).find((x) => x.endsWith('.json'));
      const j = JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));
      job.segments = j.segments.map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
    } catch (e) { job.error = String(e.message || e); }
    job.done = true;
  });
  res.json(job);
});
app.get('/api/transcribe/:job', (req, res) => res.json(tjobs.get(req.params.job) ?? { error: 'not found' }));

// ------------------------------------------------------------------ UI

const ui = path.join(root, 'dist-ui');
if (fs.existsSync(ui)) {
  app.use(express.static(ui));
  app.get(/^\/(?!api|media|vendor).*/, (req, res) => res.sendFile(path.join(ui, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err?.status === 404 || err?.code === 'ENOENT') return res.status(404).json({ error: 'not found' });
  console.error(err);
  res.status(err.status || 500).json({ error: String(err.message || err) });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  אבא שלנו – העורך פתוח בכתובת:  http://localhost:${PORT}\n  הקבצים נשמרים מקומית בתיקייה: ${DATA}\n`);
});
