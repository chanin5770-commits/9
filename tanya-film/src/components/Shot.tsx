import React from 'react';
import { AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Move, Shot } from '../data/scenes';

const ease = Easing.inOut(Easing.sin);

const lerpMove = (a: Move, b: Move, p: number): Move => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  z: a.z + (b.z - a.z) * p,
});

// מציג שוט אחד: תמונה עם תנועת מצלמה איטית, או קליפ וידאו.
// object-fit: cover שומר על יחס הממדים (בלי מתיחה), והזום תמיד >= 1 סביב
// נקודה בתוך התמונה, כך שלא נחשפים קצוות ריקים.
export const ShotView: React.FC<{ shot: Shot; dur: number; fadeIn: number }> = ({ shot, dur, fadeIn }) => {
  const f = useCurrentFrame();
  const p = ease(Math.min(1, Math.max(0, f / Math.max(1, dur - 1))));
  const from = shot.from ?? { x: 0.5, y: 0.5, z: 1 };
  const to = shot.to ?? from;
  const m = lerpMove(from, to, p);
  const opacity = fadeIn > 0 ? interpolate(f, [0, fadeIn], [0, 1], { extrapolateRight: 'clamp' }) : 1;
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${m.x * 100}% ${m.y * 100}%`,
    transform: `scale(${Math.max(1, m.z)})`,
    transformOrigin: `${m.x * 100}% ${m.y * 100}%`,
  };
  return (
    <AbsoluteFill style={{ opacity }}>
      {shot.kind === 'panel' ? (
        <Img src={staticFile(`panels/${shot.src}.jpg`)} style={style} />
      ) : (
        <OffthreadVideo src={staticFile(`clips/${shot.src}.mp4`)} muted style={style} />
      )}
    </AbsoluteFill>
  );
};
