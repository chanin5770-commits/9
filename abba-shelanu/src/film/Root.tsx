import React from 'react';
import { Composition, continueRender, delayRender } from 'remotion';
import { Film } from './Film';
import type { FilmProps } from '../shared/types';
import { DEFAULT_SETTINGS, frameSize } from '../shared/types';

// make sure the Hebrew fonts are in before the first frame is captured
const fontHandle = typeof document !== 'undefined' ? delayRender('fonts') : null;
if (fontHandle !== null) {
  Promise.all([
    document.fonts.load('300 64px "Frank Ruhl Libre"', 'אבא שלנו'),
    document.fonts.load('400 64px "Frank Ruhl Libre"', 'אבא שלנו'),
    document.fonts.load('300 40px "Heebo"', 'אבא שלנו'),
    document.fonts.load('200 40px "Heebo"', 'אבא שלנו'),
  ]).finally(() => continueRender(fontHandle));
}

const emptyProps: FilmProps = {
  project: { id: 'empty', title: '', createdAt: 0, audio: null, photos: [], order: [], clips: [], captions: [], lyrics: [], settings: DEFAULT_SETTINGS },
  mediaBase: '',
  quality: 'master',
};

export const Root: React.FC = () => (
  <Composition
    id="AbbaShelanu"
    component={Film}
    defaultProps={emptyProps}
    fps={30}
    width={1920}
    height={1080}
    durationInFrames={300}
    calculateMetadata={({ props }) => {
      const { width, height } = frameSize(props.project.settings);
      const dur = props.project.audio?.analysis?.duration ?? 10;
      return { width, height, fps: 30, durationInFrames: Math.max(1, Math.round(dur * 30)) };
    }}
  />
);
