import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { COLORS, DRAFT, SAFE_X, TEXT_BOTTOM } from '../config';
import { Text } from '../data/scenes';
import { lineSlots } from '../lib/reading';

export const SANS = "'Heebo', 'Liberation Sans', sans-serif";
export const SERIF = "'Frank Ruhl Libre', 'Liberation Serif', serif";

// הופעה ונעלמות רכה: שקיפות, תזוזה קטנה ופוקוס
export const appear = (f: number, start: number, len: number, inF = 14, outF = 14) => {
  const end = start + len;
  const o = interpolate(f, [start, start + inF, end - outF, end], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(f, [start, start + inF + 8], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const blur = interpolate(f, [start, start + inF], [5, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return { opacity: o, transform: `translateY(${y}px)`, filter: `blur(${blur}px)`, visible: f >= start && f <= end };
};

export const VerifyTag: React.FC = () =>
  DRAFT ? (
    <span style={{ fontFamily: SANS, fontSize: 22, fontWeight: 500, color: COLORS.verify, border: `1.5px solid ${COLORS.verify}`, borderRadius: 5, padding: '1px 10px', marginInlineStart: 14, verticalAlign: 'middle' }}>
      טיוטה · דורש אימות
    </span>
  ) : null;

const STYLE: Record<Text['kind'], { font: string; weight: number; size: number; color: string }> = {
  title: { font: SERIF, weight: 700, size: 116, color: COLORS.goldSoft },
  question: { font: SANS, weight: 300, size: 62, color: COLORS.text },
  line: { font: SANS, weight: 400, size: 58, color: COLORS.text },
  message: { font: SERIF, weight: 500, size: 62, color: COLORS.cream },
  insight: { font: SANS, weight: 500, size: 56, color: COLORS.text },
  quote: { font: SERIF, weight: 500, size: 72, color: COLORS.goldSoft },
  mashal: { font: SANS, weight: 400, size: 56, color: COLORS.text },
};

// בלוק טקסט אחד: משפט קצר, עד שתי שורות, עם תווית מקור כשצריך
export const TextBlock: React.FC<{ t: Text; scale?: number }> = ({ t, scale = 1 }) => {
  const st = STYLE[t.kind];
  const lines = t.text.split('\n').slice(0, 2);
  const label = t.kind === 'insight' ? t.source : t.kind === 'mashal' ? 'משל' : null;
  return (
    <div style={{ textAlign: 'center', direction: 'rtl', maxWidth: 1920 - 2 * SAFE_X }}>
      {label ? (
        <div style={{ fontFamily: SANS, fontSize: 30, fontWeight: 500, color: COLORS.gold, letterSpacing: 2, marginBottom: 14 }}>{label}</div>
      ) : null}
      <div style={{ fontFamily: st.font, fontWeight: st.weight, fontSize: st.size * scale, lineHeight: 1.28, color: st.color, textShadow: '0 2px 18px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.6)' }}>
        {lines.map((l, i) => (
          <div key={i}>
            {t.kind === 'quote' && i === 0 ? <span style={{ color: COLORS.gold }}>״</span> : null}
            {l}
            {t.kind === 'quote' && i === lines.length - 1 ? <span style={{ color: COLORS.gold }}>״</span> : null}
          </div>
        ))}
      </div>
      {t.kind !== 'insight' && t.source && t.kind !== 'mashal' ? (
        <div style={{ fontFamily: SANS, fontSize: 30, color: COLORS.muted, marginTop: 16 }}>
          {t.source}
          {t.verify ? <VerifyTag /> : null}
        </div>
      ) : null}
      {t.kind === 'message' ? <div style={{ width: 96, height: 3, background: COLORS.gold, margin: '20px auto 0', opacity: 0.75 }} /> : null}
    </div>
  );
};

// טקסט על צילום: בתחתית, עם הצללה כהה עדינה מאחוריו
export const ShotText: React.FC<{ t: Text; f: number; dur: number }> = ({ t, f, dur }) => {
  const a = appear(f, 6, Math.max(20, dur - 10), 14, 12);
  if (!a.visible) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: TEXT_BOTTOM }}>
      <div style={{ position: 'absolute', inset: 0, opacity: a.opacity, background: 'linear-gradient(to top, rgba(3,6,12,.82) 0%, rgba(3,6,12,.5) 28%, rgba(3,6,12,0) 50%)' }} />
      <div style={{ opacity: a.opacity, transform: a.transform, filter: a.filter }}>
        <TextBlock t={t} />
      </div>
    </AbsoluteFill>
  );
};

// רצף שורות בגרפיקה: כל שורה בתורה, אחת בכל פעם
export const LineSequence: React.FC<{ lines: Text[]; f: number; dur: number; intro: number; pos: 'bottom' | 'center' }> = ({ lines, f, dur, intro, pos }) => {
  if (!lines.length) return null;
  const slots = lineSlots(lines, dur, intro);
  return (
    <>
      {lines.map((t, i) => {
        const a = appear(f, slots[i][0], slots[i][1] - 2, 16, 14);
        if (!a.visible) return null;
        return (
          <AbsoluteFill key={i} style={{ justifyContent: pos === 'center' ? 'center' : 'flex-end', alignItems: 'center', paddingBottom: pos === 'center' ? 0 : TEXT_BOTTOM }}>
            <div style={{ opacity: a.opacity, transform: a.transform, filter: a.filter }}>
              <TextBlock t={t} scale={pos === 'center' ? 1.12 : 1} />
            </div>
          </AbsoluteFill>
        );
      })}
    </>
  );
};
