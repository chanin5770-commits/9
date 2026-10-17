import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { BAR, COLORS, DRAFT, HEIGHT, LETTERBOX } from '../config';
import { GATES, SCENES } from '../data/scenes';
import { NARRATION } from '../data/narration';
import { FPS, TIMELINE } from '../lib/timeline';
import { SANS } from './text';

// לאיזו תחנה שייך כל שער (לסימון ההתקדמות)
const GATE_OF_STATION: number[] = [];
{
  let g = 0;
  SCENES.forEach((s) => {
    if (s.gate) g = s.gate;
    if (s.station) GATE_OF_STATION[s.station] = g;
  });
}

const currentScene = (f: number) => {
  let cur = TIMELINE.scenes[0];
  for (const s of TIMELINE.scenes) if (f >= s.from) cur = s;
  return cur;
};

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const Progress: React.FC<{ station: number }> = ({ station }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, direction: 'rtl' }}>
    {Array.from({ length: 17 }, (_, i) => {
      const n = i + 1;
      const gap = n > 1 && GATE_OF_STATION[n] !== GATE_OF_STATION[n - 1];
      const done = n < station;
      const now = n === station;
      return (
        <div
          key={n}
          style={{
            width: now ? 13 : 8, height: now ? 13 : 8, borderRadius: '50%',
            marginInlineStart: gap ? 12 : 0,
            background: now ? COLORS.gold : done ? 'rgba(217,179,106,.55)' : 'transparent',
            border: now || done ? 'none' : '1px solid rgba(217,179,106,.45)',
            boxShadow: now ? '0 0 12px rgba(217,179,106,.8)' : 'none',
          }}
        />
      );
    })}
  </div>
);

// הפס העליון: שער ותחנה. הפס התחתון: כתוביות, ובטיוטה גם מזהה סצנה וזמן.
export const Bars: React.FC = () => {
  const f = useCurrentFrame();
  const cur = currentScene(f);
  const sc = cur.scene;
  const station = sc.station ?? 0;
  const gate = station ? GATE_OF_STATION[station] : 0;
  const localF = f - cur.from;
  const fadeTop = interpolate(localF, [0, 24], [0, 1], { extrapolateRight: 'clamp' });
  const t = f / FPS;
  const cue = NARRATION.cues.find((c) => t >= c.start && t <= c.end);
  const top = LETTERBOX ? 0 : 16;
  const bottom = LETTERBOX ? HEIGHT - BAR : HEIGHT - 150;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* פס עליון */}
      <div
        style={{
          position: 'absolute', top, left: 0, right: 0, height: LETTERBOX ? BAR : 80,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 64px',
          direction: 'rtl', fontFamily: SANS, opacity: station ? fadeTop : 0.0,
        }}
      >
        <div style={{ fontSize: 24, color: COLORS.text, fontWeight: 300 }}>
          {gate ? (
            <>
              <span style={{ color: COLORS.gold, fontWeight: 500, letterSpacing: 2 }}>{GATES[gate].name}</span>
              <span style={{ color: COLORS.muted }}> · </span>
              {GATES[gate].question}
            </>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <span style={{ fontSize: 22, color: COLORS.muted }}>
            תחנה <span style={{ color: COLORS.text, fontWeight: 500 }}>{station}</span> מתוך 17
          </span>
          <Progress station={station} />
        </div>
      </div>

      {/* כתוביות קריינות */}
      {cue ? (
        <div
          style={{
            position: 'absolute', top: bottom, left: 0, right: 0, height: LETTERBOX ? BAR : 150,
            display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl',
          }}
        >
          <div
            style={{
              fontFamily: SANS, fontSize: 40, lineHeight: 1.3, color: COLORS.text, textAlign: 'center',
              maxWidth: 1500, textShadow: '0 2px 8px rgba(0,0,0,.9)',
              background: LETTERBOX ? 'none' : 'rgba(3,6,12,.55)', padding: LETTERBOX ? 0 : '6px 18px', borderRadius: 6,
            }}
          >
            {cue.text.split('\n').slice(0, 2).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      ) : null}

      {/* מידע טיוטה */}
      {DRAFT ? (
        <div
          style={{
            position: 'absolute', bottom: 14, left: 24, direction: 'rtl', fontFamily: SANS, fontSize: 17,
            color: 'rgba(154,166,184,.75)', fontVariantNumeric: 'tabular-nums',
          }}
        >
          טיוטה · {NARRATION.file ? 'עם קריינות' : 'ללא קריינות · תזמון זמני'} · סצנה {sc.id} · {sc.title} ·{' '}
          <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{fmt(t)}</span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
