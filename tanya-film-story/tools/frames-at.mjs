#!/usr/bin/env node
// מדפיס את מספר הפריים באמצע שוטים נבחרים — לבדיקת סטילס.  שימוש: node tools/frames-at.mjs 00/1 12/4 ...
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, 'out', 'frames-at.mjs');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
await build({ stdin: { contents: "export { TIMELINE } from './src/lib/timeline';", resolveDir: root, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'error' });
const { TIMELINE } = await import(pathToFileURL(tmp).href);
fs.rmSync(tmp);
const at = Number(process.env.AT ?? 0.6);
for (const a of process.argv.slice(2)) {
  const [sid, n] = a.split('/');
  const p = TIMELINE.scenes.find((s) => s.scene.id === sid).shots[Number(n) - 1];
  console.log(`${a} ${Math.round(p.from + p.dur * at)}`);
}
