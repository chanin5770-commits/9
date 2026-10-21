// MP4 export with Remotion: the same React film as the preview, rendered frame by frame.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

let bundled = null;
const getBundle = (root) => (bundled ??= bundle({ entryPoint: path.join(root, 'src/film/index.ts') }).catch((e) => { bundled = null; throw e; }));

function browserExecutable() {
  if (process.env.REMOTION_BROWSER_EXECUTABLE) return process.env.REMOTION_BROWSER_EXECUTABLE;
  // reuse a locally installed headless Chromium if there is one (otherwise Remotion downloads its own once)
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (pw && fs.existsSync(pw)) {
    const shell = fs.readdirSync(pw).find((d) => d.startsWith('chromium_headless_shell-'));
    const exe = shell && path.join(pw, shell, 'chrome-linux', 'headless_shell');
    if (exe && fs.existsSync(exe)) return exe;
  }
  return null;
}

export const jobs = new Map();

export function startRender({ root, project, projectDir, port, format, resolution, range }) {
  const id = Math.random().toString(36).slice(2, 10);
  const tag = format === '9:16' ? '9x16' : '16x9';
  const name = `abba-shelanu-${tag}-${resolution}p${range ? '-sample' : ''}.mp4`;
  const out = path.join(projectDir, 'exports', name);
  const job = { id, stage: 'מכין', progress: 0, file: null, name, error: null, startedAt: Date.now() };
  jobs.set(id, job);

  (async () => {
    const serveUrl = await getBundle(root);
    job.stage = 'טוען את הסרט';
    const inputProps = {
      project: { ...project, settings: { ...project.settings, format, resolution } },
      mediaBase: `http://127.0.0.1:${port}`,
      quality: 'master',
    };
    const exe = browserExecutable();
    const composition = await selectComposition({ serveUrl, id: 'AbbaShelanu', inputProps, browserExecutable: exe, logLevel: 'error' });
    job.stage = 'מרנדר';
    await renderMedia({
      composition, serveUrl, inputProps, codec: 'h264', outputLocation: out + '.part.mp4',
      browserExecutable: exe,
      crf: resolution >= 2160 ? 20 : 18,
      pixelFormat: 'yuv420p',
      colorSpace: 'bt709',
      x264Preset: 'slow',
      audioCodec: 'aac',
      audioBitrate: '320k',
      imageFormat: 'jpeg',
      jpegQuality: 95,
      concurrency: Math.max(1, Math.min(8, Math.floor(os.cpus().length / 2))),
      timeoutInMilliseconds: 120000,
      frameRange: range ?? null,
      logLevel: 'error',
      onProgress: ({ progress, stitchStage }) => {
        job.progress = progress;
        job.stage = stitchStage === 'muxing' ? 'מחבר סאונד' : 'מרנדר';
      },
    });
    fs.renameSync(out + '.part.mp4', out);
    job.progress = 1;
    job.stage = 'מוכן';
    job.file = name;
  })().catch((e) => {
    job.error = String(e?.message || e);
    job.stage = 'שגיאה';
    console.error(e);
  });
  return job;
}
