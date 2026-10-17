import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, Img, Sequence, continueRender, delayRender, interpolate, random, staticFile, useCurrentFrame } from 'remotion';
import '@fontsource/heebo/300.css';
import '@fontsource/heebo/400.css';
import '@fontsource/heebo/500.css';
import '@fontsource/frank-ruhl-libre/400.css';
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/frank-ruhl-libre/700.css';
import { FADE_IN_BLACK, FADE_OUT_BLACK, HEIGHT, PIC_H, PIC_TOP, SCENE_XFADE, SHOT_XFADE, WIDTH } from './config';
import { NARRATION } from './data/narration';
import { ShotView } from './components/Shot';
import { SceneText } from './components/SceneText';
import { FinaleOverlay, MapOverlay } from './components/Overlays';
import { Bars } from './components/Bars';
import { FPS, PlacedScene, TIMELINE, TOTAL_FRAMES } from './lib/timeline';

// צבעוניות: מקר וכחול בתחילת המסע לחם וזהוב בסופו
const Grade: React.FC<{ tone: number }> = ({ tone }) => {
  const cool = Math.max(0, -tone);
  const warm = Math.max(0, tone);
  return (
    <>
      <AbsoluteFill style={{ background: `rgba(24,56,120,${0.34 * cool})`, mixBlendMode: 'soft-light' }} />
      <AbsoluteFill style={{ background: `rgba(255,170,80,${0.26 * warm})`, mixBlendMode: 'soft-light' }} />
    </>
  );
};

const SceneView: React.FC<{ placed: PlacedScene }> = ({ placed }) => {
  const f = useCurrentFrame();
  const { scene, dur } = placed;
  const fadeIn = scene.transition === 'black' ? FADE_IN_BLACK : placed.index === 0 ? FADE_IN_BLACK : SCENE_XFADE;
  const fadeOut = placed.fadeOutToBlack ? (placed.index === TIMELINE.scenes.length - 1 ? 40 : FADE_OUT_BLACK) : 0;
  const opacity = Math.min(
    interpolate(f, [0, fadeIn], [0, 1], { extrapolateRight: 'clamp' }),
    fadeOut ? interpolate(f, [dur - fadeOut, dur], [1, 0], { extrapolateLeft: 'clamp' }) : 1,
  );
  return (
    <AbsoluteFill style={{ opacity, background: '#000' }}>
      {placed.shots.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.dur} layout="none">
          <ShotView shot={s.shot} dur={s.dur} fadeIn={i === 0 ? 0 : SHOT_XFADE} />
        </Sequence>
      ))}
      <Grade tone={scene.tone} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%)' }} />
      {scene.overlay === 'map' ? <MapOverlay dur={dur} /> : null}
      {scene.overlay === 'finale' ? <FinaleOverlay dur={dur} /> : null}
      <SceneText scene={scene} dur={dur} />
    </AbsoluteFill>
  );
};

const Grain: React.FC = () => {
  const f = useCurrentFrame();
  const x = Math.floor(random(`gx${f}`) * 512);
  const y = Math.floor(random(`gy${f}`) * 512);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile('fx/grain.png')})`,
        backgroundPosition: `${x}px ${y}px`,
        mixBlendMode: 'overlay',
        opacity: 0.09,
      }}
    />
  );
};

// מוזיקת רקע זמנית (מסונתזת, ללא זכויות) — יורדת בזמן קריינות
const Score: React.FC = () => {
  const vol = (f: number) => {
    const t = f / FPS;
    const fade = Math.min(1, t / 3, (TOTAL_FRAMES / FPS - t) / 5);
    const speaking = NARRATION.cues.some((c) => t > c.start - 0.4 && t < c.end + 0.6);
    return Math.max(0, fade) * (speaking ? 0.22 : 0.6);
  };
  return <Audio src={staticFile('audio/score-draft.wav')} volume={vol} />;
};

const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    const faces = ['300 40px Heebo', '400 40px Heebo', '500 40px Heebo', '400 40px "Frank Ruhl Libre"', '500 40px "Frank Ruhl Libre"', '700 40px "Frank Ruhl Libre"'];
    Promise.all(faces.map((f) => document.fonts.load(f, 'אבג')))
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle));
  }, [handle]);
};

export const Film: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <div style={{ position: 'absolute', top: PIC_TOP, left: 0, width: WIDTH, height: PIC_H, overflow: 'hidden' }}>
        {TIMELINE.scenes.map((p) => (
          <Sequence key={p.scene.id} from={p.from} durationInFrames={p.dur} layout="none">
            <SceneView placed={p} />
          </Sequence>
        ))}
        <Grain />
      </div>
      <div style={{ position: 'absolute', inset: 0, width: WIDTH, height: HEIGHT }}>
        <Bars />
      </div>
      <Score />
      {NARRATION.file ? <Audio src={staticFile(NARRATION.file)} startFrom={Math.round(NARRATION.offset * FPS)} /> : null}
    </AbsoluteFill>
  );
};
