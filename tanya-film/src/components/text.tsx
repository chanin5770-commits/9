import React from 'react';
import { interpolate } from 'remotion';
import { COLORS, DRAFT } from '../config';

export const SANS = "'Heebo', 'Liberation Sans', sans-serif";
export const SERIF = "'Frank Ruhl Libre', 'Liberation Serif', serif";

// הופעה ונעלמות רכה של טקסט: שקיפות, תזוזה קטנה ופוקוס
export const appear = (f: number, start: number, len: number, inF = 16, outF = 16) => {
  const end = start + len;
  const o = interpolate(f, [start, start + inF, end - outF, end], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(f, [start, start + inF + 10], [14, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const blur = interpolate(f, [start, start + inF], [6, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return { opacity: o, transform: `translateY(${y}px)`, filter: `blur(${blur}px)`, visible: f >= start && f <= end };
};

export const Lines: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split('\n').map((l, i) => (
      <div key={i}>{l}</div>
    ))}
  </>
);

export const VerifyTag: React.FC = () =>
  DRAFT ? (
    <span
      style={{
        fontFamily: SANS, fontSize: 18, fontWeight: 500, color: COLORS.verify,
        border: `1px solid ${COLORS.verify}`, borderRadius: 4, padding: '1px 8px', marginInlineStart: 12,
        verticalAlign: 'middle',
      }}
    >
      טיוטה · ציטוט דורש אימות
    </span>
  ) : null;
