#!/usr/bin/env node
// מפיק מתוך נתוני הסרט:
//   docs/SCENES.md        טבלת סצנות ושוטים: זמנים, נכס, סטטוס (קליפ / סטילס זמני), טקסט, סאונד, מקור
//   docs/scene-times.json זמני הסצנות (למוזיקה ולקריינות)
// ובודק זמן קריאה: טקסט שמופיע מהר מדי מסומן ⚠.   הרצה: node tools/scene-table.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, 'out', 'scene-data.mjs');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
await build({
  stdin: { contents: "export { SCENES, GATES } from './src/data/scenes'; export { TIMELINE, sceneTimes, FPS, TOTAL_FRAMES } from './src/lib/timeline'; export { graphicIntro, readSec, lineSlots } from './src/lib/reading';", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'error',
});
const { SCENES, GATES, TIMELINE, sceneTimes, FPS, TOTAL_FRAMES, graphicIntro, readSec, lineSlots } = await import(pathToFileURL(tmp).href + '?' + Date.now());
fs.rmSync(tmp);

const mmss = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const warnings = [];
const asset = (s) => (s.kind === 'clip' ? `🎬 ${s.src}` : s.kind === 'still' ? `🖼 ${s.src}` : s.kind === 'gate' ? `שער ${s.gate}` : `◆ ${s.g}${s.stage ? ' ' + s.stage : ''}`);
const status = (s) => (s.kind === 'clip' ? 'קליפ' : s.kind === 'still' ? '**מציין מקום**' : 'גרפיקה');
const kindName = { title: 'כותרת', question: 'שאלה', insight: 'חידוש', quote: 'ציטוט', message: 'מסר', mashal: 'משל', line: 'שורה' };

let md = `# טבלת סצנות ושוטים — המסע בדרך הארוכה־קצרה\n\n`;
md += `> נוצר אוטומטית מ-\`src/data/scenes.ts\` (\`node tools/scene-table.mjs\`). לא לערוך ידנית.\n\n`;
const nShots = TIMELINE.scenes.reduce((a, s) => a + s.shots.length, 0);
const count = (k) => TIMELINE.scenes.reduce((a, s) => a + s.shots.filter((p) => p.shot.kind === k).length, 0);
const secOf = (k) => TIMELINE.scenes.reduce((a, s) => a + s.shots.filter((p) => p.shot.kind === k).reduce((b, p) => b + p.dur, 0), 0) / FPS;
md += `**אורך:** ${mmss(TOTAL_FRAMES / FPS)} · **שוטים:** ${nShots} — קליפים ${count('clip')} (${secOf('clip').toFixed(0)} ש׳), סטילס זמני ${count('still')} (${secOf('still').toFixed(0)} ש׳), גרפיקה ושערים ${count('graphic') + count('gate')} (${(secOf('graphic') + secOf('gate')).toFixed(0)} ש׳)\n\n`;
md += `מקרא: 🎬 קליפ וידאו (תנועה אמיתית) · 🖼 סטילס מהסטוריבורד עם תנועת מצלמה — **מציין מקום** עד שיגיע קליפ · ◆ גרפיקה מהמצגת · ⚑ ציטוט שדורש אימות\n\n`;

md += `## סצנות\n\n| # | סצנה | תחנה | התחלה | סיום | משך | שקופיות מהמצגת |\n|---|---|---|---|---|---|---|\n`;
const times = sceneTimes();
SCENES.forEach((s, i) => {
  const t = times[i];
  md += `| ${s.id} | ${s.title} | ${s.station ? `${GATES[s.gate].name} · ${s.station} (${s.chapter})` : '—'} | ${mmss(t.start)} | ${mmss(t.end)} | ${(t.end - t.start).toFixed(1)} ש׳ | ${s.slides} |\n`;
});

md += `\n## שוטים\n`;
TIMELINE.scenes.forEach((ps) => {
  const s = ps.scene;
  md += `\n### ${s.id} · ${s.title}${s.station ? ` — תחנה ${s.station}, ${s.chapter}` : ''}\n\n`;
  md += `מקור תוכן: ${s.contentRef}${s.amb?.length ? ` · רקע קולי: ${s.amb.map((a) => a.id).join(', ')}` : ''}\n\n`;
  md += `| שוט | זמן | משך | נכס | סטטוס | טקסט | סאונד |\n|---|---|---|---|---|---|---|\n`;
  ps.shots.forEach((p) => {
    const sh = p.shot;
    const texts = sh.kind === 'graphic' ? sh.lines ?? [] : sh.text ? [sh.text] : [];
    const durS = p.dur / FPS;
    const slots = sh.kind === 'graphic' && texts.length ? lineSlots(texts, p.dur, graphicIntro(sh.g, p.dur)) : null;
    const txt = texts.map((t, ti) => {
      const per = slots ? slots[ti][1] / FPS : durS;
      const chars = t.text.replace(/\s+/g, ' ').length;
      const ok = per >= readSec(t) - 0.05;
      if (!ok) warnings.push(`${s.id}/${p.index + 1}: "${t.text.replace(/\n/g, ' ')}" — ${chars} תווים ב-${per.toFixed(1)} ש׳`);
      return `${kindName[t.kind]}: ${t.text.replace(/\n/g, ' / ')}${t.source && t.kind !== 'line' ? ` — _${t.source}_` : ''}${t.verify ? ' ⚑' : ''}${ok ? '' : ' ⚠'}`;
    }).join('<br>');
    const snd = [...(sh.sfx ?? []).map((x) => x.id), sh.silence ? 'שקט' : ''].filter(Boolean).join(', ');
    md += `| ${p.index + 1} | ${mmss(p.from / FPS)} | ${durS.toFixed(1)} | ${asset(sh)} | ${status(sh)} | ${txt || '—'} | ${snd || '—'} |\n`;
  });
});
if (warnings.length) md += `\n## ⚠ טקסט קצר מדי לקריאה\n\n${warnings.map((w) => `- ${w}`).join('\n')}\n`;

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/SCENES.md'), md);
fs.writeFileSync(path.join(root, 'docs/scene-times.json'), JSON.stringify(times.map((t) => ({ ...t, start: +t.start.toFixed(2), end: +t.end.toFixed(2) })), null, 2));
console.log(`docs/SCENES.md — ${mmss(TOTAL_FRAMES / FPS)}, ${nShots} shots; reading-time warnings: ${warnings.length}`);
warnings.forEach((w) => console.log('  ⚠ ' + w));
