/* The 15-second vertical (9:16) launch teaser. Soundtrack: assets/launch-music.wav
 * (tools/make_music.py). Shared scenes: src/common.js. */
'use strict';

const DURATION = 15;
const STOP = bar(7), CHIME = 12.25;
setBeats(Array.from({ length: 28 }, (_, i) => i * BEAT));

const SHOTS = [
  { start: 0, end: bar(2), scene: 'lAwaken' },
  { start: bar(2), end: bar(3), scene: 'lSolo', flash: 0.4, tint: 'sky', seed: 82, name: 'מלך האותיות', face: 'sky',
    win: { clip: 'desk-aleph', from: 4.3, speed: 0.9, tint: 'rgba(190,220,250,0.3)', cam: [{ zoom: 1.0, fx: 0.33 }, { zoom: 1.1, fx: 0.36 }] },
    pops: [{ ch: 'א', x: 110, y: 1400, b: 1 }, { ch: 'ב', x: 970, y: 1400, b: 2, face: 'sky' }] },
  { start: bar(3), end: bar(4), scene: 'lSolo', fade: 0.2, tint: 'pink', seed: 83, name: 'מלכת האותיות', face: 'rose',
    win: { clip: 'letter-hall', from: 5.9, speed: 0.95, tint: 'rgba(244,200,212,0.3)', cam: [{ zoom: 1.0, fx: 0.5 }, { zoom: 1.1, fx: 0.55 }] },
    pops: [{ ch: 'ג', x: 970, y: 1400, b: 1, face: 'rose' }, { ch: 'ד', x: 110, y: 1400, b: 2 }] },
  { start: bar(4), end: bar(5), scene: 'lDuo', fade: 0.2,
    king: { clip: 'hall-pointing', from: 6.0, cam: [{ zoom: 1.0, fx: 0.47 }, { zoom: 1.08, fx: 0.48 }] },
    queen: { clip: 'first-letter', from: 0.3, cam: [{ zoom: 1.0, fx: 0.3 }, { zoom: 1.08, fx: 0.31 }] },
    words: [['בנים', 'sky', 360], ['בנות', 'rose', 150], ['גנים מעורבים', 'gold', -235]], dots: [255, 35] },
  { start: bar(5), end: STOP, scene: 'lKit', flash: 0.35 },
  { start: STOP, end: DURATION, scene: 'lEnd', flash: 0.5, lines: [STOP + 0.3, STOP + 0.3 + BEAT], studio: 12.75, stop: STOP, chime: CHIME },
];
