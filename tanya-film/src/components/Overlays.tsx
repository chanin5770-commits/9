import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, PIC_H, WIDTH } from '../config';
import { FINALE_LINES, GATES, SCENES } from '../data/scenes';
import { appear, SANS, SERIF, VerifyTag } from './text';

// ---- סצנה 18: מפת המסע ----
// שביל מתפתל מימין (ההתחלה) לשמאל, 17 תחנות בחמישה שערים.
const STATIONS = SCENES.filter((s) => s.station).map((s) => ({ n: s.station! }));
const GATE_START: Record<number, number> = {};
SCENES.forEach((s) => {
  if (s.gate && s.station) GATE_START[s.gate] = s.station;
});

const pathPoint = (t: number) => {
  const x = WIDTH - 170 - t * (WIDTH - 340);
  const y = PIC_H * 0.56 + Math.sin(t * Math.PI * 2.5) * PIC_H * 0.17;
  return { x, y };
};

export const MapOverlay: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const start = Math.round(dur * 0.1);
  const end = Math.round(dur * 0.64);
  const span = end - start;
  const a = appear(f, start, span, 24, 30);
  if (!a.visible) return null;
  const draw = interpolate(f, [start + 10, start + span * 0.62], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pts = Array.from({ length: 121 }, (_, i) => pathPoint(i / 120));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <AbsoluteFill style={{ opacity: a.opacity }}>
      <AbsoluteFill style={{ background: 'rgba(3,6,12,.55)' }} />
      <svg width={WIDTH} height={PIC_H} style={{ position: 'absolute', inset: 0 }}>
        <path d={d} fill="none" stroke="rgba(217,179,106,.25)" strokeWidth={3} strokeDasharray="2 10" />
        <path d={d} fill="none" stroke={COLORS.gold} strokeWidth={3} pathLength={1} strokeDasharray={`${draw} 1`} />
        {STATIONS.map((s, i) => {
          const t = i / 16;
          const p = pathPoint(t);
          const on = draw >= t - 0.001;
          const pop = interpolate(draw, [t, t + 0.04], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <g key={s.n} opacity={on ? 1 : 0.25}>
              <circle cx={p.x} cy={p.y} r={7 + 5 * pop} fill={on ? COLORS.gold : 'none'} stroke={COLORS.gold} strokeWidth={1.5} />
              <text x={p.x} y={p.y - 24} textAnchor="middle" fontFamily={SANS} fontSize={22} fontWeight={500} fill={COLORS.text} opacity={pop}>
                {s.n}
              </text>
            </g>
          );
        })}
        {(() => {
          const p = pathPoint(draw);
          return <circle cx={p.x} cy={p.y} r={16} fill="rgba(232,207,152,.35)" stroke={COLORS.goldSoft} strokeWidth={2} />;
        })()}
      </svg>
      {Object.entries(GATES).map(([g, info]) => {
        const first = GATE_START[Number(g)];
        const t = (first - 1) / 16;
        const p = pathPoint(t);
        const vis = interpolate(draw, [t, t + 0.05], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div
            key={g}
            style={{
              position: 'absolute', left: p.x - 150, width: 300, top: Number(g) % 2 ? 26 : PIC_H - 92,
              textAlign: 'center', direction: 'rtl', opacity: vis,
            }}
          >
            <div style={{ fontFamily: SANS, fontSize: 20, letterSpacing: 3, color: COLORS.gold }}>{info.name}</div>
            <div style={{ fontFamily: SERIF, fontSize: 30, color: COLORS.text }}>{info.question}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---- סצנה 19: הסיום ----
export const FinaleOverlay: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const at = (x: number) => Math.round(x * dur);
  const linesEnd = at(0.5);
  const verse = appear(f, at(0.52), at(0.21), 26, 26);
  const closing = appear(f, at(0.74), at(0.15), 24, 24);
  const endTitle = appear(f, at(0.9), at(0.1), 24, 2);
  const shade = interpolate(f, [0, 20, linesEnd, linesEnd + 20], [0, 1, 1, 0.6], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(3,6,12,.85), rgba(3,6,12,.2) 70%)', opacity: shade }} />
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 60, direction: 'rtl' }}>
        {FINALE_LINES.map((l, i) => {
          const a = appear(f, at(0.03 + i * 0.1), linesEnd - at(0.03 + i * 0.1), 20, 22);
          if (!a.visible) return null;
          const last = i === FINALE_LINES.length - 1;
          return (
            <div
              key={i}
              style={{
                opacity: a.opacity, transform: a.transform, filter: a.filter,
                fontFamily: last ? SERIF : SANS, fontWeight: last ? 500 : 300, fontSize: last ? 56 : 42,
                color: last ? COLORS.goldSoft : COLORS.text, lineHeight: 1.45, textShadow: '0 2px 14px rgba(0,0,0,.85)',
              }}
            >
              {l}
            </div>
          );
        })}
      </AbsoluteFill>
      {verse.visible ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', direction: 'rtl' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 60% at 50% 50%, rgba(3,6,12,.6), rgba(3,6,12,0))', opacity: verse.opacity }} />
          <div style={{ opacity: verse.opacity, transform: verse.transform, filter: verse.filter, textAlign: 'center' }}>
            <div style={{ fontFamily: SERIF, fontSize: 78, fontWeight: 500, color: COLORS.goldSoft, lineHeight: 1.35, textShadow: '0 3px 24px rgba(0,0,0,.8)' }}>
              <div>״כי קרוב אליך הדבר מאד</div>
              <div>בפיך ובלבבך לעשותו״</div>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 24, color: COLORS.muted, marginTop: 14 }}>
              דברים ל, יד
              <VerifyTag />
            </div>
          </div>
        </AbsoluteFill>
      ) : null}
      {closing.visible ? (
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 80, direction: 'rtl' }}>
          <div style={{ opacity: closing.opacity, transform: closing.transform, filter: closing.filter, textAlign: 'center', fontFamily: SERIF, fontSize: 46, color: COLORS.text, lineHeight: 1.4, textShadow: '0 2px 14px rgba(0,0,0,.85)' }}>
            <div>חשבתי שאני יוצא למסע כדי להפוך למישהו אחר.</div>
            <div style={{ color: COLORS.goldSoft }}>בסוף גיליתי איך לעבוד את ה׳ עם מי שאני.</div>
          </div>
        </AbsoluteFill>
      ) : null}
      {endTitle.visible ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', direction: 'rtl' }}>
          <AbsoluteFill style={{ background: '#03060c', opacity: endTitle.opacity * 0.8 }} />
          <div style={{ opacity: endTitle.opacity, fontFamily: SERIF, fontSize: 92, fontWeight: 700, color: COLORS.goldSoft }}>
            המסע בדרך הארוכה־קצרה
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
