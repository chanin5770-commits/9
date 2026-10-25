/* The 50-second vertical (9:16) launch teaser. Soundtrack: assets/launch-music-50.wav
 * (tools/make_music_50.py). Shared scenes: src/common.js. */
'use strict';

const DURATION = 50;
const STOP = bar(28), CHIME = STOP + BEAT;
setBeats(Array.from({ length: 112 }, (_, i) => i * BEAT));

const SHOTS = [
  // 0–6.5: something magical wakes up (the music is heard from behind the gate).
  { start: 0, end: bar(4), scene: 'lAwaken', text: [bar(2), bar(3)] },
  // 6.5–13.1: towards the golden gate; it opens on the downbeat and the music blooms.
  { start: bar(4), end: bar(8), scene: 'lGate', fade: 0.4, open: 4.6 },
  // 13.1–19.6: the King of the Letters, first from behind on the way to the castle.
  { start: bar(8), end: bar(10), scene: 'lSolo', flash: 0.5, tint: 'sky', seed: 82,
    win: { clip: 'castle-path', from: 0.3, tint: 'rgba(190,220,250,0.3)', cam: [{ zoom: 1.0, fx: 0.42 }, { zoom: 1.12, fx: 0.45 }] },
    pops: [{ ch: 'א', x: 110, y: 1400, b: 2 }, { ch: 'ב', x: 970, y: 1400, b: 4, face: 'sky' }] },
  { start: bar(10), end: bar(12), scene: 'lSolo', fade: 0.25, tint: 'sky', seed: 82, name: 'מלך האותיות', face: 'sky',
    win: { clip: 'desk-aleph', from: 4.3, speed: 0.95, tint: 'rgba(190,220,250,0.3)', cam: [{ zoom: 1.0, fx: 0.33 }, { zoom: 1.12, fx: 0.36 }] } },
  // 19.6–26.1: the Queen of the Letters, the same way.
  { start: bar(12), end: bar(14), scene: 'lSolo', fade: 0.25, tint: 'pink', seed: 83,
    win: { clip: 'golden-bridge', from: 3.9, tint: 'rgba(244,200,212,0.3)', cam: [{ zoom: 1.0, fx: 0.5 }, { zoom: 1.12, fx: 0.52 }] },
    pops: [{ ch: 'ג', x: 970, y: 1400, b: 2, face: 'rose' }, { ch: 'ד', x: 110, y: 1400, b: 4 }] },
  { start: bar(14), end: bar(16), scene: 'lSolo', fade: 0.25, tint: 'pink', seed: 83, name: 'מלכת האותיות', face: 'rose',
    win: { clip: 'letter-hall', from: 4.6, tint: 'rgba(244,200,212,0.3)', cam: [{ zoom: 1.0, fx: 0.5 }, { zoom: 1.12, fx: 0.56 }] } },
  // 26.1–32.7: side by side: boys, girls, mixed; then letters, values, experiences.
  { start: bar(16), end: bar(18), scene: 'lDuo', flash: 0.4,
    king: { clip: 'hall-pointing', from: 4.6, cam: [{ zoom: 1.0, fx: 0.47 }, { zoom: 1.08, fx: 0.48 }] },
    queen: { clip: 'first-letter', from: 0.3, cam: [{ zoom: 1.0, fx: 0.3 }, { zoom: 1.08, fx: 0.31 }] },
    words: [['בנים', 'sky', 360], ['בנות', 'rose', 150], ['גנים מעורבים', 'gold', -235]], dots: [255, 35] },
  { start: bar(18), end: bar(20), scene: 'lDuo', fade: 0.25,
    king: { clip: 'lectern-glow', from: 0.2, cam: [{ zoom: 1.0, fx: 0.33 }, { zoom: 1.08, fx: 0.36 }] },
    queen: { clip: 'great-book', from: 3.4, cam: [{ zoom: 1.0, fx: 0.38 }, { zoom: 1.08, fx: 0.4 }] },
    words: [['אותיות', 'gold', 300], ['ערכים', 'rose', 0], ['חוויות', 'sky', -300]], dots: [150, -150] },
  // 32.7–39.2: a look at the real kit.
  { start: bar(20), end: bar(24), scene: 'lKit', flash: 0.4 },
  // 39.2–42.5: the King and the Queen under one crown, and the name.
  { start: bar(24), end: bar(26), scene: 'lTitle', flash: 0.5,
    king: { clip: 'desk-aleph', from: 4.6, cam: [{ zoom: 1.0, fx: 0.32 }, { zoom: 1.1, fx: 0.34 }] },
    queen: { clip: 'first-letter', from: 4.7, cam: [{ zoom: 1.0, fx: 0.42 }, { zoom: 1.1, fx: 0.45 }] } },
  // 42.5–50: end card. The music stops on the downbeat at 45.7; "בקרוב..." on the chime.
  { start: bar(26), end: DURATION, scene: 'lEnd', flash: 0.5, lines: [bar(26) + BEAT * 2, bar(27)], studio: CHIME + 0.55, stop: STOP, chime: CHIME },
];
