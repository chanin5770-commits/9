import React from 'react';
import { Composition } from 'remotion';
import { Film } from './Film';
import { HEIGHT, WIDTH } from './config';
import { FPS, TOTAL_FRAMES } from './lib/timeline';

export const RemotionRoot: React.FC = () => (
  <Composition id="Film" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />
);
