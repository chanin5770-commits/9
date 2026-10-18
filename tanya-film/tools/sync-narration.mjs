#!/usr/bin/env node
// מסנכרן את הקריינות המוקלטת לסרט.
//
// קלט:  src/data/narration-align.json  (tools/align_narration.py — זמני כל קטע ומשפט בהקלטה)
// פלט:  src/data/narration-sync.json   (לכל קטע: השוט שבו הוא מתחיל + היסט, וקטע ההקלטה)
//       src/data/timing.json → shotExtra (תוספת זמן לשוטים, רק איפה שההקלטה ארוכה מהחלון)
//
// כל קטע מעוגן לשוט שבו התחיל החלון שלו בטיוטה (כך שהוא נשאר צמוד לתמונה גם אחרי שינויי תזמון).
// אם ההקלטה של קטע ארוכה מהחלון שלו, מוסיפים את הזמן החסר לשוט האחרון בחלון שאינו קליפ
// (סטילס או גרפיקה) — לא לשקטים המכוונים ולא לקליפים. ההקלטה עצמה לא נחתכת ולא מואצת.
//
// הרצה: node tools/sync-narration.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, 'out', 'sync-tl.mjs');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
await build({ stdin: { contents: "export { buildTimeline, FPS } from './src/lib/timeline';", resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'error' });
const { buildTimeline, FPS } = await import(pathToFileURL(tmp).href + '?' + Date.now());
fs.rmSync(tmp);

const align = JSON.parse(fs.readFileSync(path.join(root, 'src/data/narration-align.json'), 'utf8'));
const GAP = 0.25; // מינימום אוויר בין קטעים באותה סצנה
const SCENE_GAP = 0.9; // ובין סצנות — נשימה
const TAIL = 0.3; // אוויר בסוף חלון, לפני מה שבא אחריו

const shotsOf = (tl) => tl.scenes.flatMap((s) => s.shots);
const key = (p) => `${p.scene.id}/${p.index + 1}`;

// עיגון: השוט שמכיל את הרגע t (בשניות) בטיוטה בלי תוספות. בהצלבה — השוט החדש.
const base = buildTimeline({});
const anchor = (t) => {
  const f = t * FPS;
  const list = shotsOf(base);
  let hit = list[0];
  for (const p of list) if (p.from <= f + 0.5) hit = p;
  return { shot: key(hit), offset: +((f - hit.from) / FPS).toFixed(3) };
};
// סוף חלון מעוגן לסוף השוט שמכיל אותו (כדי שהארכת השוט תזיז גם את הגבול)
const endAnchor = (t) => {
  const f = t * FPS;
  const hit = shotsOf(base).find((p) => p.from + p.dur >= f - 0.5) ?? shotsOf(base).at(-1);
  return { shot: key(hit), fromEnd: +((hit.from + hit.dur - f) / FPS).toFixed(3) };
};
const timeOf = (tl, a) => {
  const p = shotsOf(tl).find((x) => key(x) === a.shot);
  return a.fromEnd !== undefined ? (p.from + p.dur) / FPS - a.fromEnd : p.from / FPS + a.offset;
};

const segs = align.segments.map((s) => ({
  scene: s.scene, audio: [s.start, s.end], sentences: s.sentences,
  startAnchor: anchor(s.window[0]), endAnchor: endAnchor(s.window[1]),
}));

const extra = {};
let tl, placed;
for (let iter = 0; iter < 200; iter++) {
  tl = buildTimeline(extra);
  placed = [];
  let prevEnd = -1, prevScene = null, prevQuestion = false, changed = false;
  for (const s of segs) {
    const gap = prevScene && prevScene !== s.scene ? SCENE_GAP : prevQuestion ? 0.7 : GAP;
    const start = Math.max(timeOf(tl, s.startAnchor), prevEnd + gap);
    const end = start + (s.audio[1] - s.audio[0]);
    const limit = timeOf(tl, s.endAnchor);
    const over = end + TAIL - limit;
    if (over > 0.04) {
      // השוט האחרון בחלון שאינו קליפ/שער
      const stretchable = (p) => p.shot.kind !== 'clip' && p.shot.kind !== 'gate';
      const own = shotsOf(tl).find((p) => key(p) === s.endAnchor.shot);
      const cand = shotsOf(tl).filter((p) => (p.from + p.dur) / FPS <= limit + 0.05 && (p.from + p.dur) / FPS > start && stretchable(p));
      const target = stretchable(own) ? own : cand[cand.length - 1];
      if (!target) throw new Error(`no stretchable shot for segment in scene ${s.scene}`);
      extra[key(target)] = +((extra[key(target)] ?? 0) + over + 0.05).toFixed(2);
      changed = true;
      break;
    }
    placed.push({ ...s, filmStart: start });
    prevEnd = end;
    prevScene = s.scene;
    prevQuestion = s.sentences.at(-1).text.trim().endsWith('?');
  }
  if (!changed) break;
  if (iter === 199) throw new Error('sync did not converge: ' + JSON.stringify(extra));
}

const timingPath = path.join(root, 'src/data/timing.json');
const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
timing.status = 'synced';
timing.note = 'מסונכרן להקלטת הקריינות (tools/sync-narration.mjs). shotExtra = שניות שנוספו לשוט כדי שהקריינות תיכנס בלי לחתוך או להאיץ.';
timing.shotExtra = extra;
fs.writeFileSync(timingPath, JSON.stringify(timing, null, 2) + '\n');

const sync = {
  file: 'audio/narration.wav',
  segments: placed.map((s) => ({
    scene: s.scene, ...s.startAnchor,
    audioStart: s.audio[0], audioEnd: s.audio[1],
    // היסט מתחילת הקטע (שניות) — לא צמוד לשוט, כך שהשוט יכול להשתנות בלי לשבור את הקטע
    lead: +(s.filmStart - timeOf(tl, s.startAnchor)).toFixed(3),
    sentences: s.sentences,
  })),
};
fs.writeFileSync(path.join(root, 'src/data/narration-sync.json'), JSON.stringify(sync, null, 1) + '\n');

const before = base.total / FPS, after = tl.total / FPS;
const fmt = (x) => `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`;
console.log(`film ${fmt(before)} → ${fmt(after)} (+${(after - before).toFixed(1)}s)`);
const byScene = {};
for (const [k, v] of Object.entries(extra)) byScene[k.split('/')[0]] = (byScene[k.split('/')[0]] ?? 0) + v;
console.log('added per scene:', Object.entries(byScene).map(([k, v]) => `${k}:+${v.toFixed(1)}s`).join('  ') || 'none');
console.log('shots extended:', JSON.stringify(extra));
