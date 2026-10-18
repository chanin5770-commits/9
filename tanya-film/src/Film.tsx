import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Sequence, continueRender, delayRender, random, staticFile, useCurrentFrame } from 'remotion';
import '@fontsource/heebo/300.css';
import '@fontsource/heebo/400.css';
import '@fontsource/heebo/500.css';
import '@fontsource/frank-ruhl-libre/400.css';
import '@fontsource/frank-ruhl-libre/500.css';
import '@fontsource/frank-ruhl-libre/700.css';
import { ShotView } from './components/Shot';
import { Bars } from './components/Bars';
import { Sound } from './components/Sound';
import { ALL_SHOTS, TIMELINE } from './lib/timeline';
import { CaptionsContext } from './lib/mode';

// צבעוניות: מקר וכחול בתחילת המסע לחם וזהוב בסופו
const Grade: React.FC = () => {
  const f = useCurrentFrame();
  let tone = 0;
  for (const s of TIMELINE.scenes) if (f >= s.from) tone = s.scene.tone;
  const cool = Math.max(0, -tone);
  const warm = Math.max(0, tone);
  return (
    <>
      <AbsoluteFill style={{ background: `rgba(24,56,120,${0.3 * cool})`, mixBlendMode: 'soft-light' }} />
      <AbsoluteFill style={{ background: `rgba(255,170,80,${0.22 * warm})`, mixBlendMode: 'soft-light' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 75% at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,.5) 100%)' }} />
    </>
  );
};

const Grain: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{
      backgroundImage: `url(${staticFile('fx/grain.png')})`,
      backgroundPosition: `${Math.floor(random(`gx${f}`) * 512)}px ${Math.floor(random(`gy${f}`) * 512)}px`,
      mixBlendMode: 'overlay', opacity: 0.08,
    }} />
  );
};

const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    const faces = ['300 40px Heebo', '400 40px Heebo', '500 40px Heebo', '400 40px "Frank Ruhl Libre"', '500 40px "Frank Ruhl Libre"', '700 40px "Frank Ruhl Libre"'];
    Promise.all(faces.map((x) => document.fonts.load(x, 'אבג')))
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle));
  }, [handle]);
};

export const Film: React.FC<{ captions: boolean }> = ({ captions }) => {
  useFonts();
  return (
    <CaptionsContext.Provider value={captions}>
    <AbsoluteFill style={{ background: '#000' }}>
      {ALL_SHOTS.map((p, i) => (
        <Sequence key={i} from={p.from} durationInFrames={p.dur} layout="none">
          <ShotView placed={p} />
        </Sequence>
      ))}
      <Grade />
      <Grain />
      <Bars />
      <Sound />
    </AbsoluteFill>
    </CaptionsContext.Provider>
  );
};
