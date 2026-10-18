// הסאונד: רקע לכל סצנה, אפקטים לפי שוט, מוזיקה עם שקט מכוון, והקריינות
import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';
import { HAS_NARRATION, NARRATION } from '../data/narration';
import { ALL_SHOTS, FPS, TIMELINE, TOTAL_FRAMES } from '../lib/timeline';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// חלונות שקט: שוטים שמסומנים silence — המוזיקה יורדת לאפס
const SILENT = ALL_SHOTS.filter((s) => s.shot.silence).map((s) => [s.from, s.from + s.dur]);
const speaking = (f: number) => NARRATION.cues.some((c) => f / FPS > c.start - 0.4 && f / FPS < c.end + 0.6);
// בזמן דיבור: מוזיקה ואפקטים יורדים
const duck = (f: number) => (speaking(f) ? 0.35 : HAS_NARRATION ? 0.75 : 1);

const musicVol = (f: number) => {
  const fade = Math.min(1, f / (3 * FPS), (TOTAL_FRAMES - f) / (5 * FPS));
  let silence = 1;
  for (const [a, b] of SILENT) silence = Math.min(silence, interpolate(f, [a - 14, a, b, b + 20], [1, 0, 0, 1], clamp));
  let level = 1;
  for (const s of TIMELINE.scenes) if (f >= s.from) level = s.scene.music ?? 1;
  // עם קריינות המוזיקה נשארת ברקע: נמוכה בהפסקות, ונמוכה עוד יותר מתחת לדיבור
  const base = HAS_NARRATION ? (speaking(f) ? 0.1 : 0.26) : speaking(f) ? 0.22 : 0.5;
  return Math.max(0, fade) * silence * level * base;
};

export const Sound: React.FC = () => (
  <>
    <Audio src={staticFile('audio/score-draft.wav')} volume={musicVol} />

    {/* רקע קולי לכל סצנה, בלולאה, עם כניסה ויציאה רכות */}
    {TIMELINE.scenes.flatMap((s) =>
      (s.scene.amb ?? []).map((a, i) => (
        <Sequence key={`${s.scene.id}-amb-${i}`} from={s.from} durationInFrames={s.dur} layout="none">
          <Audio src={staticFile(`sfx/${a.id}.wav`)} loop
            volume={(f) => a.vol * duck(s.from + f) * interpolate(f, [0, 24, s.dur - 24, s.dur], [0, 1, 1, 0], clamp)} />
        </Sequence>
      )),
    )}

    {/* אפקטים לפי שוט */}
    {ALL_SHOTS.flatMap((p, k) =>
      (p.shot.sfx ?? []).map((x, i) => {
        const from = p.from + Math.round((x.at ?? 0) * FPS);
        const isBed = x.id.startsWith('amb-');
        return (
          <Sequence key={`${k}-${i}`} from={from} durationInFrames={isBed ? p.dur : 6 * FPS} layout="none">
            <Audio src={staticFile(`sfx/${x.id}.wav`)} loop={isBed}
              volume={(f) => (x.vol ?? 0.6) * duck(from + f) * (isBed ? interpolate(f, [0, 12, p.dur - 12, p.dur], [0, 1, 1, 0], clamp) : 1)} />
          </Sequence>
        );
      }),
    )}

    {/* הקריינות: כל קטע מההקלטה במקומו בסרט, באורכו המלא */}
    {HAS_NARRATION
      ? NARRATION.segments.map((s, i) => {
          const from = Math.round(s.filmStart * FPS) - 1;
          // חיתוך בתוך ההפסקות שבהקלטה: פריים לפני תחילת הדיבור, שני פריימים אחרי סופו
          const a = Math.max(0, Math.floor(s.audioStart * FPS) - 1);
          const b = Math.ceil(s.audioEnd * FPS) + 2;
          const len = b - a;
          return (
            <Sequence key={`vo-${i}`} from={from} durationInFrames={len} layout="none">
              <Audio src={staticFile(NARRATION.file!)} trimBefore={a} trimAfter={b} />
            </Sequence>
          );
        })
      : null}
  </>
);
