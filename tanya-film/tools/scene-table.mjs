#!/usr/bin/env node
// מפיק את טבלת הסצנות (זמנים, מקור חזותי, טקסט מסך, מקור תוכן) מתוך נתוני הסרט
// -> docs/SCENES.md + docs/scene-times.json.  הרצה: node tools/scene-table.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, 'out', 'scene-data.mjs');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
await build({
  stdin: {
    contents: "export { SCENES, GATES } from './src/data/scenes'; export { TIMELINE, sceneTimes, FPS, TOTAL_FRAMES } from './src/lib/timeline';",
    resolveDir: root, loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'error',
});
const { SCENES, GATES, TIMELINE, sceneTimes, FPS, TOTAL_FRAMES } = await import(pathToFileURL(tmp).href);
const timing = JSON.parse(fs.readFileSync(path.join(root, 'src/data/timing.json'), 'utf8'));

const mmss = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const times = sceneTimes();
const src = (sh) => (sh.kind === 'clip' ? `🎬 ${sh.src}` : `🖼 ${sh.src}`);
let md = `# טבלת סצנות — המסע בדרך הארוכה־קצרה\n\n`;
md += `> נוצר אוטומטית מ-\`src/data/scenes.ts\` ו-\`src/data/timing.json\` (\`node tools/scene-table.mjs\`). לא לערוך ידנית.\n\n`;
md += `**סטטוס תזמון:** ${timing.status === 'provisional' ? 'זמני — ללא קריינות' : timing.status} · **אורך כולל:** ${mmss(TOTAL_FRAMES / FPS)}\n\n`;
md += `מקרא: 🖼 = תמונת סטילס מונפשת (זום/פאן, לא וידאו) · 🎬 = קליפ וידאו שסופק (Flow/Veo) · ⚑ = ציטוט שדורש אימות\n\n`;
md += `| # | סצנה | שער / תחנה | התחלה | סיום | משך | שוטים | מעבר |\n|---|---|---|---|---|---|---|---|\n`;
SCENES.forEach((s, i) => {
  const t = times[i];
  const st = s.station ? `${s.gate ? GATES[s.gate].name + ' · ' : ''}תחנה ${s.station} (${s.chapter})` : '—';
  md += `| ${s.id} | ${s.title} | ${st} | ${mmss(t.start)} | ${mmss(t.end)} | ${(t.end - t.start).toFixed(1)} ש׳ | ${s.shots.map(src).join(' → ')} | ${s.transition === 'black' ? 'דרך חושך' : 'הצלבה'} |\n`;
});
md += `\n## טקסט מסך ומקורות לפי סצנה\n`;
SCENES.forEach((s) => {
  md += `\n### ${s.id} · ${s.title}\n\n`;
  md += `- **מקור תוכן:** ${s.contentRef}\n`;
  s.beats.forEach((b) => {
    const kind = { title: 'כותרת', question: 'שאלה', insight: 'חידוש (ניסוח שלנו)', quote: 'ציטוט', message: 'מסר אישי (פרשנות)', ref: 'הפניה' }[b.kind];
    md += `- **${kind}:** ${b.text.replace(/\n/g, ' / ')}${b.source ? ` — _${b.source}_` : ''}${b.verify ? ' ⚑ דורש אימות' : ''}\n`;
  });
  if (s.overlay === 'map') md += `- **גרפיקה:** מפת המסע — 17 תחנות בחמישה שערים\n`;
  if (s.overlay === 'finale') md += `- **גרפיקה:** שורות הסיום, הפסוק ״כי קרוב אליך...״ (דברים ל, יד) ⚑, המשפט המסכם וכותרת הסיום\n`;
});
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/SCENES.md'), md);
fs.writeFileSync(path.join(root, 'docs/scene-times.json'), JSON.stringify(times.map((t) => ({ ...t, start: +t.start.toFixed(2), end: +t.end.toFixed(2) })), null, 2));
fs.rmSync(tmp);
console.log('docs/SCENES.md, docs/scene-times.json — total', mmss(TOTAL_FRAMES / FPS));
