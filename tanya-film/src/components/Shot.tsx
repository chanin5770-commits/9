import React from 'react';
import { AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FOCUS, Move, Shot } from '../data/scenes';
import { PlacedShot } from '../lib/timeline';
import { Graphic, GateCard } from './Graphics';
import { ShotText } from './text';

const ease = Easing.inOut(Easing.sin);

// תנועת מצלמה: [x, y, zoom] בהתחלה ובסוף, סביב נקודת הפנים/הפעולה
const MOVES: Record<Move, (fx: number, fy: number) => [number, number, number, number, number, number]> = {
  in: (x, y) => [x, y, 1.03, x, y, 1.13],
  out: (x, y) => [x, y, 1.14, x, y, 1.03],
  left: (x, y) => [x + 0.05, y, 1.1, x - 0.04, y, 1.1],
  right: (x, y) => [x - 0.05, y, 1.1, x + 0.04, y, 1.1],
  hold: (x, y) => [x, y, 1.06, x, y, 1.085],
  rise: (x, y) => [x, y + 0.06, 1.1, x, y - 0.04, 1.12],
};

export const Frame: React.FC<{ src: string; kind: 'still' | 'clip'; p: number; move: Move; focus?: [number, number]; blur?: number }> = ({ src, kind, p, move, focus, blur = 0 }) => {
  const [fx, fy] = focus ?? FOCUS[src] ?? [0.5, 0.5];
  const [x0, y0, z0, x1, y1, z1] = MOVES[move](fx, fy);
  const e = ease(p);
  const x = Math.min(1, Math.max(0, x0 + (x1 - x0) * e));
  const y = Math.min(1, Math.max(0, y0 + (y1 - y0) * e));
  const z = z0 + (z1 - z0) * e;
  const style: React.CSSProperties = {
    width: '100%', height: '100%', objectFit: 'cover',
    objectPosition: `${x * 100}% ${y * 100}%`,
    transform: `scale(${Math.max(1, z) * (blur ? 1.08 : 1)})`,
    transformOrigin: `${x * 100}% ${y * 100}%`,
    filter: blur ? `blur(${blur}px)` : undefined,
  };
  return kind === 'still' ? (
    <Img src={staticFile(`panels/${src}.jpg`)} style={style} />
  ) : (
    <OffthreadVideo src={staticFile(`clips/${src}.mp4`)} muted style={style} />
  );
};

export const ShotView: React.FC<{ placed: PlacedShot }> = ({ placed }) => {
  const f = useCurrentFrame();
  const { shot, dur, fadeIn, fadeOutToBlack } = placed;
  const p = Math.min(1, Math.max(0, f / Math.max(1, dur - 1)));
  const opacity = Math.min(
    fadeIn ? interpolate(f, [0, fadeIn], [0, 1], { extrapolateRight: 'clamp' }) : 1,
    fadeOutToBlack ? interpolate(f, [dur - fadeOutToBlack, dur], [1, 0], { extrapolateLeft: 'clamp' }) : 1,
  );
  return (
    <AbsoluteFill style={{ opacity, background: '#000' }}>
      {shot.kind === 'still' || shot.kind === 'clip' ? (
        <>
          <Frame src={shot.src} kind={shot.kind} p={p} move={shot.move ?? (shot.kind === 'clip' ? 'hold' : 'in')} focus={shot.kind === 'still' ? shot.focus : [0.5, 0.45]} />
          {shot.dim ? <AbsoluteFill style={{ background: '#000', opacity: interpolate(p, [0, 1], [0.1, 0.55]) }} /> : null}
        </>
      ) : shot.kind === 'gate' ? (
        <GateCard shot={shot} f={f} dur={dur} />
      ) : (
        <Graphic shot={shot} f={f} dur={dur} />
      )}
      {(shot.kind === 'still' || shot.kind === 'clip') && shot.text ? <ShotText t={shot.text} f={f} dur={dur} /> : null}
    </AbsoluteFill>
  );
};

export const isPlaceholder = (s: Shot) => s.kind === 'still';
