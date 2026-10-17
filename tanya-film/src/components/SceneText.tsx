import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../config';
import { Beat, GATES, Scene } from '../data/scenes';
import { appear, Lines, SANS, SERIF, VerifyTag } from './text';

export const GATE_CARD = 128; // פריימים של כרטיס השער בתחילת הסצנה

const shade = (o: number, at: 'bottom' | 'center') => ({
  position: 'absolute' as const,
  inset: 0,
  opacity: o,
  background:
    at === 'center'
      ? 'radial-gradient(ellipse 60% 70% at 50% 50%, rgba(3,6,12,.72), rgba(3,6,12,0) 75%)'
      : 'linear-gradient(to top, rgba(3,6,12,.85) 0%, rgba(3,6,12,.55) 35%, rgba(3,6,12,0) 65%)',
});

const BeatView: React.FC<{ beat: Beat; dur: number }> = ({ beat, dur }) => {
  const f = useCurrentFrame();
  const start = Math.round(beat.at * dur);
  const len = Math.round(beat.dur * dur);
  const a = appear(f, start, len, 18, 18);
  if (!a.visible) return null;
  const anim = { opacity: a.opacity, transform: a.transform, filter: a.filter };

  if (beat.kind === 'title') {
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={shade(a.opacity, 'center')} />
        <div style={{ ...anim, textAlign: 'center', direction: 'rtl' }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 104, color: COLORS.goldSoft, letterSpacing: 1, textShadow: '0 4px 30px rgba(0,0,0,.7)' }}>
            {beat.text}
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 300, fontSize: 30, color: COLORS.text, marginTop: 10, letterSpacing: 2 }}>
            17 פרקים · 17 תחנות · מסע אחד אל תוך הנפש
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  const label: Record<string, string> = {
    question: '',
    insight: beat.source ?? '',
    quote: '',
    message: '',
    ref: '',
  };
  const isQuote = beat.kind === 'quote';
  const isMsg = beat.kind === 'message';
  const big = isQuote ? 62 : isMsg ? 50 : beat.kind === 'question' ? 48 : 46;

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 70 }}>
      <div style={shade(a.opacity, 'bottom')} />
      <div style={{ ...anim, textAlign: 'center', direction: 'rtl', maxWidth: 1500 }}>
        {label[beat.kind] ? (
          <div style={{ fontFamily: SANS, fontSize: 24, fontWeight: 500, color: COLORS.gold, letterSpacing: 3, marginBottom: 12 }}>
            {label[beat.kind]}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: isQuote || isMsg || beat.kind === 'ref' ? SERIF : SANS,
            fontWeight: isQuote ? 500 : beat.kind === 'question' ? 300 : 400,
            fontSize: big,
            lineHeight: 1.3,
            color: isQuote ? COLORS.goldSoft : COLORS.text,
            textShadow: '0 2px 18px rgba(0,0,0,.85)',
          }}
        >
          {isQuote ? (
            beat.text.split('\n').map((l, i, all) => (
              <div key={i}>
                {i === 0 ? <span style={{ color: COLORS.gold }}>״</span> : null}
                {l}
                {i === all.length - 1 ? <span style={{ color: COLORS.gold }}>״</span> : null}
              </div>
            ))
          ) : (
            <Lines text={beat.text} />
          )}
        </div>
        {beat.kind !== 'insight' && beat.source ? (
          <div style={{ fontFamily: SANS, fontSize: 24, fontWeight: 400, color: COLORS.muted, marginTop: 14 }}>
            {beat.source}
            {beat.verify ? <VerifyTag /> : null}
          </div>
        ) : null}
        {isMsg ? <div style={{ width: 80, height: 2, background: COLORS.gold, margin: '18px auto 0', opacity: 0.7 }} /> : null}
      </div>
    </AbsoluteFill>
  );
};

// כרטיס השער: התמונה מתעמעמת, שם השער ושאלתו במרכז
const GateCard: React.FC<{ gate: number }> = ({ gate }) => {
  const f = useCurrentFrame();
  const g = GATES[gate];
  const dim = interpolate(f, [0, 10, GATE_CARD - 30, GATE_CARD], [0.75, 0.75, 0.75, 0], { extrapolateRight: 'clamp' });
  const a = appear(f, 8, GATE_CARD - 8, 22, 26);
  const line = interpolate(f, [14, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: '#03060c', opacity: dim }} />
      {a.visible ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', direction: 'rtl' }}>
          <div style={{ opacity: a.opacity, transform: a.transform, filter: a.filter, textAlign: 'center' }}>
            <div style={{ fontFamily: SANS, fontSize: 30, fontWeight: 500, letterSpacing: 8, color: COLORS.gold }}>{g.name}</div>
            <div style={{ width: 360 * line, height: 1, background: COLORS.gold, margin: '18px auto', opacity: 0.8 }} />
            <div style={{ fontFamily: SERIF, fontSize: 84, fontWeight: 500, color: COLORS.text }}>{g.question}</div>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

// שם התחנה בפינת התמונה
const StationTag: React.FC<{ scene: Scene; start: number }> = ({ scene, start }) => {
  const f = useCurrentFrame();
  const a = appear(f, start, 150, 20, 24);
  if (!a.visible) return null;
  return (
    <div style={{ position: 'absolute', top: 44, right: 64, direction: 'rtl', opacity: a.opacity, transform: a.transform, filter: a.filter }}>
      <div style={{ fontFamily: SANS, fontSize: 22, fontWeight: 500, letterSpacing: 4, color: COLORS.gold }}>
        {scene.station ? `תחנה ${scene.station} · ${scene.chapter}` : ''}
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 500, color: COLORS.text, textShadow: '0 2px 16px rgba(0,0,0,.8)' }}>
        {scene.title}
      </div>
    </div>
  );
};

export const SceneText: React.FC<{ scene: Scene; dur: number }> = ({ scene, dur }) => (
  <AbsoluteFill>
    {scene.gate ? <GateCard gate={scene.gate} /> : null}
    {scene.station ? <StationTag scene={scene} start={scene.gate ? GATE_CARD - 6 : 12} /> : null}
    {scene.beats.map((b, i) => (
      <BeatView key={i} beat={b} dur={dur} />
    ))}
  </AbsoluteFill>
);
