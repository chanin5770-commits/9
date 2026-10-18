import React from 'react';
import { Composition } from 'remotion';
import { Film } from './Film';
import { HEIGHT, WIDTH } from './config';
import { FPS, TOTAL_FRAMES } from './lib/timeline';
import { Pilot, PFPS, PILOT_FRAMES } from './pilot/Pilot';

// Film — עם כתוביות לקריינות · FilmClean — בלי כתוביות (להעלאה עם כתוביות של הפלטפורמה)
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ captions: true }} />
 {/* קטע הניסיון בכיוון הסיפורי החדש */}
    <Composition id="Pilot" component={Pilot} durationInFrames={PILOT_FRAMES} fps={PFPS} width={WIDTH} height={HEIGHT} />
    <Composition id="FilmClean" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ captions: false }} />
  </>
);
