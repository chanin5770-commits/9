// שכבת המידע מעל התמונה: סימון התקדמות, שם התחנה, כתוביות קריינות ומידע טיוטה
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COLORS, DRAFT } from '../config';
import { GATES, SCENES } from '../data/scenes';
import { NARRATION } from '../data/narration';
import { ALL_SHOTS, FPS, TIMELINE } from '../lib/timeline';
import { appear, SANS, SERIF } from './text';
import { useCaptions } from '../lib/mode';

// ציטוט בתוך הכתובית (״…״) מודגש בזהב
const renderCue = (text: string) =>
  text.split(/(״[^״]*״)/).map((part, i) =>
    part.startsWith('״') ? <span key={i} style={{ color: COLORS.goldSoft }}>{part}</span> : <span key={i}>{part}</span>,
  );

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const GATE_OF: Record<number, number> = {};
SCENES.forEach((s) => s.station && (GATE_OF[s.station] = s.gate!));

const Dots: React.FC<{ station: number }> = ({ station }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, direction: 'rtl' }}>
    {Array.from({ length: 17 }, (_, i) => {
      const n = i + 1;
      const now = n === station;
      const done = n < station;
      return (
        <div key={n} style={{
          width: now ? 14 : 9, height: now ? 14 : 9, borderRadius: '50%',
          marginInlineStart: n > 1 && GATE_OF[n] !== GATE_OF[n - 1] ? 12 : 0,
          background: now ? COLORS.gold : done ? 'rgba(217,179,106,.6)' : 'transparent',
          border: now || done ? 'none' : '1.5px solid rgba(217,179,106,.5)',
          boxShadow: now ? '0 0 12px rgba(217,179,106,.9)' : 'none',
        }} />
      );
    })}
  </div>
);

export const Bars: React.FC = () => {
  const f = useCurrentFrame();
  let cur = TIMELINE.scenes[0];
  for (const s of TIMELINE.scenes) if (f >= s.from) cur = s;
  const shot = [...ALL_SHOTS].reverse().find((s) => f >= s.from) ?? ALL_SHOTS[0];
  const sc = cur.scene;
  const onGate = shot.shot.kind === 'gate';
  const t = f / FPS;
  const captions = useCaptions();
  const cue = NARRATION.cues.find((c) => t >= c.start && t <= c.end);
  const cueFade = cue ? Math.min(1, (t - cue.start) / 0.12, (cue.end - t) / 0.12) : 0;

  // שם התחנה מופיע בתחילת התחנה (אחרי כרטיס השער, אם יש)
  const firstReal = cur.shots.find((s) => s.shot.kind !== 'gate')!;
  const tag = appear(f, firstReal.from + 8, 4 * FPS, 16, 18);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* סימון התקדמות — עדין, בפינה */}
      {sc.station && !onGate ? (
        <div style={{ position: 'absolute', top: 34, left: 48, display: 'flex', alignItems: 'center', gap: 18, direction: 'rtl', fontFamily: SANS, padding: '10px 18px', borderRadius: 12, background: 'rgba(4,7,13,.45)' }}>
          <span style={{ fontSize: 26, color: COLORS.text }}>
            <span style={{ color: COLORS.gold, fontWeight: 500 }}>{GATES[sc.gate!].name}</span>
            <span style={{ color: COLORS.muted }}> · </span>תחנה {sc.station} מתוך 17
          </span>
          <Dots station={sc.station} />
        </div>
      ) : null}

      {/* שם התחנה */}
      {sc.station && tag.visible ? (
        <div style={{ position: 'absolute', top: 40, right: 64, direction: 'rtl', opacity: tag.opacity, transform: tag.transform, filter: tag.filter }}>
          <div style={{ fontFamily: SANS, fontSize: 32, fontWeight: 500, letterSpacing: 3, color: COLORS.gold, textShadow: '0 2px 10px rgba(0,0,0,.9)' }}>
            תחנה {sc.station} · {sc.chapter}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 84, fontWeight: 500, color: COLORS.text, textShadow: '0 3px 20px rgba(0,0,0,.9)' }}>{sc.title}</div>
        </div>
      ) : null}

      {/* כתוביות קריינות — עד שתי שורות. בכרטיסי טקסט: גדולות במרכז; בזמן הפסוק: לא מוצגות (הוא כבר על המסך) */}
      {cue && captions && !(shot.shot.kind === 'graphic' && shot.shot.g === 'verse') ? (
        shot.shot.kind === 'graphic' && shot.shot.g === 'text' ? (
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ opacity: cueFade, fontFamily: SERIF, fontSize: 64, fontWeight: 500, lineHeight: 1.35, color: COLORS.cream, textAlign: 'center', direction: 'rtl', maxWidth: 1500, textShadow: '0 2px 18px rgba(0,0,0,.9)' }}>
              {renderCue(cue.text)}
            </div>
          </AbsoluteFill>
        ) : (
          <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 72 }}>
            <div style={{ opacity: cueFade, fontFamily: SANS, fontSize: 50, fontWeight: 500, lineHeight: 1.32, color: '#fff', textAlign: 'center', direction: 'rtl', maxWidth: 1560, padding: '8px 26px', borderRadius: 10, background: 'rgba(3,6,12,.62)' }}>
              {renderCue(cue.text)}
            </div>
          </AbsoluteFill>
        )
      ) : null}

      {/* מידע טיוטה */}
      {DRAFT ? (
        <div style={{ position: 'absolute', bottom: 14, left: 24, direction: 'rtl', fontFamily: SANS, fontSize: 20, color: 'rgba(170,180,196,.8)', fontVariantNumeric: 'tabular-nums', textShadow: '0 1px 4px #000' }}>
          טיוטה {NARRATION.file ? '· קריינות v1' : '· ללא קריינות · תזמון זמני'} · סצנה {sc.id} · שוט {shot.index + 1}
          {shot.shot.kind === 'still' ? <span style={{ color: COLORS.verify }}> · סטילס זמני (פריים {shot.shot.src})</span> : null}
          {shot.shot.kind === 'clip' ? <span style={{ color: '#8fd19e' }}> · קליפ</span> : null} ·{' '}
          <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{fmt(t)}</span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
