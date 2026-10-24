/* The edit: every shot of the clip, timed to the song.
 *
 * Section and line times come from the analysis in analysis/ (vocal separation +
 * Whisper transcription in short windows + beat tracking, see analysis/README.md).
 * The letters of both alphabet sections use the beat each letter is sung on. */
'use strict';

setBeats(ANALYSIS.beats);
const DURATION = 175.6;
const C1 = ANALYSIS.chant1, C2 = ANALYSIS.chant2;

// Nearest detected beat to t, and n beats starting there, `step` beats apart.
function beat(t) { return BEATS.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a)); }
function beatsFrom(t, step, n) { const i = BEATS.indexOf(beat(t)); return Array.from({ length: n }, (_, k) => BEATS[i + k * step]); }

// Sung lines (start times, seconds).
const L = {
  v1: [13.0, 16.14, 19.5, 22.58],
  ch1: [25.9, 29.1, 32.3, 35.5],
  chant1: 38.9, chant1End: 52.0,
  v2: [64.12, 67.54, 70.7, 73.9],
  ch2: [77.09, 80.3, 83.4, 86.6],
  chant2: 89.6, chant2End: 102.7,
  bridge: [115.08, 118.31, 121.5, 124.63],
  ch3: [132.6, 135.8, 138.95, 142.2],
  outro: [145.4, 148.6, 151.8, 155.0],
};

const SHOTS = [
  // ---- Intro (instrumental): the golden gate opens onto the world of letters.
  { start: 0, end: 6.4, scene: 'gate' },
  { start: 6.4, end: L.v1[0], clip: 'grand-staircase', from: 0, cam: [{ zoom: 1.12, fx: 0.42, fy: 0.55 }, { zoom: 1.04, fx: 0.5 }], flash: 0.5,
    fx: [{ type: 'title', at: 7.3, size: 180, y: 200, out: L.v1[0] - 0.2 }, { type: 'sparkles', n: 40, seed: 2 }] },

  // ---- Verse 1
  // "בגן שלנו יש מלך מיוחד" — he walks into the hall of letters, smiling and waving.
  { start: L.v1[0], end: L.v1[1], clip: 'hall-pointing', from: 0, cam: [{ zoom: 1.08, fx: 0.4 }, { zoom: 1.16, fx: 0.45 }], fx: [{ type: 'sparkles', n: 30 }] },
  // "לומד אותיות, ושמח עד מאוד" — at his desk with the big letter book.
  { start: L.v1[1], end: L.v1[2], clip: 'desk-aleph', from: 0, cam: [{ zoom: 1.04, fx: 0.4, fy: 0.5 }, { zoom: 1.12, fx: 0.42, fy: 0.45 }] },
  // "כל אות היא אוצר, כל אות היא מתנה" — golden letters float up out of the book.
  { start: L.v1[2], end: L.v1[3], clip: 'library-book-burst', from: 4.6, cam: [{ zoom: 1.1, fx: 0.6 }, { zoom: 1.02, fx: 0.55 }],
    fx: [{ type: 'rise', x: 1180, y: 760, n: 8, every: 0.38, life: 2.4, size: 120, letters: ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'] }] },
  // "מאירה את הלב באור של אמונה" — soft golden light spreads through the room.
  { start: L.v1[3], end: L.ch1[0], clip: 'lectern-glow', from: 4.4, cam: [{ zoom: 1.04 }, { zoom: 1.14, fx: 0.55 }],
    fx: [{ type: 'wash', at: L.v1[3] + 0.3, rise: 2, x: 1150, y: 500, alpha: 0.45 }, { type: 'hearts', x: 700, y: 760, n: 7, spread: 700 }] },

  // ---- Chorus 1
  // "מלך, מלך, מלך האותיות!" — hands up, colourful letters circling him.
  { start: L.ch1[0], end: L.ch1[1], clip: 'library-hall', from: 2.0, punch: 0.02, flash: 0.35, cam: [{ zoom: 1.1, fx: 0.52, fy: 0.55 }, { zoom: 1.04 }],
    fx: [{ type: 'orbit', x: 1010, y: 560, rx: 430, ry: 120, size: 110, speed: 1.6 }] },
  // "איזה כיף ללמוד ולגלות!" — pointing up at new letters.
  { start: L.ch1[1], end: L.ch1[2], clip: 'hall-pointing', from: 4.6, punch: 0.02, cam: [{ zoom: 1.06, fx: 0.55 }, { zoom: 1.12, fx: 0.62, fy: 0.45 }],
    fx: [{ type: 'pop', items: beatsFrom(L.ch1[1] + 0.3, 2, 4).map((tt, i) => ({ t: tt, ch: ['ל', 'מ', 'ד', 'ה'][i], x: 1300 + i * 120 * (i % 2 ? -1 : 1), y: 260 + (i % 2) * 120, size: 140 })) }] },
  // "אות ועוד אות, איזו שמחה" — letters fly in on the beat and join together.
  { start: L.ch1[2], end: L.ch1[3], scene: 'word', text: 'תורה', times: beatsFrom(L.ch1[2] + 0.35, 2, 4), bg: 'library-book-burst', bgFrom: 1 },
  // "לומדים ביחד תורה קדושה" — learning from the holy book.
  { start: L.ch1[3], end: L.chant1, clip: 'lectern-glow', from: 0, cam: [{ zoom: 1.06, fx: 0.45 }, { zoom: 1.14, fx: 0.5 }] },

  // ---- Alphabet 1: one letter per beat, then all 22 together.
  { start: L.chant1, end: L.chant1End, scene: 'chant1', from: 0, speed: 0.6, times: C1, gridAt: C1[21] + 0.45, flash: 0.3 },

  // ---- Instrumental
  { start: L.chant1End, end: 57, scene: 'flythrough', bg: 'flying-pages', bgFrom: 4, fade: 0.6 },
  { start: 57, end: 61.4, clip: 'flying-pages', from: 3.6, cam: [{ zoom: 1.04 }, { zoom: 1.12, fx: 0.55, fy: 0.45 }], fx: [{ type: 'stream', start: 57.2, x: 1150, y: 420, n: 14, span: 4, life: 2.4 }] },
  { start: 61.4, end: L.v2[0], clip: 'grand-staircase', from: 3.3, cam: [{ zoom: 1.12, fx: 0.62, fy: 0.5 }, { zoom: 1.04 }] },

  // ---- Verse 2
  // "אותיות התורה הן אור יקר" — the Torah in a beautiful holy ark, soft light.
  { start: L.v2[0], end: L.v2[1], scene: 'ark', fade: 0.4 },
  // "כל יום מגלים אוצר נהדר" — opening the book and discovering letters.
  { start: L.v2[1], end: L.v2[2], clip: 'library-book-burst', from: 0, cam: [{ zoom: 1.04, fx: 0.45 }, { zoom: 1.12, fx: 0.55 }], fx: [{ type: 'sparkles', n: 40, seed: 5 }] },
  // "לומדים באהבה, לומדים בשמחה" — running joyfully over the pages.
  { start: L.v2[2], end: L.v2[3], clip: 'flying-pages', from: 0, cam: [{ zoom: 1.1, fx: 0.4 }, { zoom: 1.02 }] },
  // "ומתקרבים להשם בכל יום מחדש" — walking towards the light, looking up.
  { start: L.v2[3], end: L.ch2[0], clip: 'castle-path', from: 4.5, cam: [{ zoom: 1.04 }, { zoom: 1.12, fy: 0.42 }], fx: [{ type: 'glow', x: 1440, y: 380, r: 700, alpha: 0.4, at: L.v2[3], rise: 2.5, rays: 0.15 }] },

  // ---- Chorus 2 (livelier: beat punches, more letters)
  { start: L.ch2[0], end: L.ch2[1], clip: 'library-hall', from: 2.0, punch: 0.035, flash: 0.35, cam: [{ zoom: 1.04 }, { zoom: 1.12, fx: 0.52, fy: 0.55 }],
    fx: [{ type: 'orbit', x: 1010, y: 560, rx: 470, ry: 130, size: 120, speed: -1.8, offset: 5 }, { type: 'sparkles', n: 50, seed: 8 }] },
  { start: L.ch2[1], end: L.ch2[2], clip: 'grand-staircase', from: 3.4, punch: 0.035, cam: [{ zoom: 1.14, fx: 0.6, fy: 0.5 }, { zoom: 1.06, fx: 0.55 }],
    fx: [{ type: 'pop', items: beatsFrom(L.ch2[1] + 0.3, 2, 4).map((tt, i) => ({ t: tt, ch: ['א', 'ב', 'ג', 'ד'][i], x: 1580 - i * 170, y: 250 + (i % 2) * 90, size: 150 })) }] },
  { start: L.ch2[2], end: L.ch2[3], scene: 'word', text: 'שמחה', times: beatsFrom(L.ch2[2] + 0.35, 2, 4), bg: 'library-hall', bgFrom: 1, face: 'royal' },
  { start: L.ch2[3], end: L.chant2, clip: 'library-book-burst', from: 4.8, punch: 0.03, cam: [{ zoom: 1.16, fx: 0.62, fy: 0.55 }, { zoom: 1.06, fx: 0.55 }],
    fx: [{ type: 'rise', x: 1180, y: 760, n: 8, every: 0.36, life: 2.2, size: 110, seed: 3 }] },

  // ---- Alphabet 2: along the magic path; each letter lights up as it is sung.
  { start: L.chant2, end: L.chant2End, scene: 'chant2', from: 0, speed: 0.6, times: C2, gridAt: C2[21] + 0.6, flash: 0.3 },

  // ---- Instrumental
  { start: L.chant2End, end: 107.5, clip: 'flying-pages', from: 3.4, speed: 0.9, fade: 0.6, cam: [{ zoom: 1.04 }, { zoom: 1.14, fx: 0.55, fy: 0.42 }], fx: [{ type: 'stream', start: 103, x: 1150, y: 430, n: 16, span: 4.5, life: 2.4 }] },
  { start: 107.5, end: 111.3, scene: 'flythrough', bg: 'castle-path', bgFrom: 1, fade: 0.5 },
  { start: 111.3, end: L.bridge[0], clip: 'grand-staircase', from: 4.2, cam: [{ zoom: 1.04 }, { zoom: 1.2, fx: 0.5, fy: 0.45 }], fx: [{ type: 'wash', at: 113.5, rise: 1.6, alpha: 0.5 }] },

  // ---- Bridge
  // "אלף — אלופו של עולם!" — the golden Aleph in the centre.
  { start: L.bridge[0], end: L.bridge[1], scene: 'aleph', flash: 0.6 },
  // "השם איתנו בכל מקום וזמן" — looking up at the bright sky, smiling.
  { start: L.bridge[1], end: L.bridge[2], clip: 'castle-path', from: 6.1, speed: 0.6, cam: [{ zoom: 1.08, fy: 0.45 }, { zoom: 1.2, fx: 0.5, fy: 0.35 }],
    fx: [{ type: 'glow', x: 980, y: 120, r: 900, alpha: 0.45, at: L.bridge[1], rise: 2, rays: 0.2 }, { type: 'hearts', x: 960, y: 700, n: 6, spread: 500 }] },
  // "אותיות של תורה, אור לנשמה" — Torah letters shining around him.
  { start: L.bridge[2], end: L.bridge[3], clip: 'lectern-glow', from: 0.6, cam: [{ zoom: 1.1, fx: 0.4 }, { zoom: 1.03 }],
    fx: [{ type: 'wash', at: L.bridge[2], rise: 1.8, x: 1100, y: 420, alpha: 0.35 }, { type: 'orbit', x: 760, y: 600, rx: 360, ry: 110, size: 95, speed: 1.2, alpha: 0.95 }] },
  // "נגדל להיות חסידים באהבה" — good deeds: tzedakah, then learning Torah.
  { start: L.bridge[3], end: 127.6, scene: 'tzedakah', coins: beatsFrom(L.bridge[3] + 0.4, 2, 3), fade: 0.3 },
  { start: 127.6, end: 130.2, clip: 'desk-aleph', from: 1.2, cam: [{ zoom: 1.1, fx: 0.4, fy: 0.5 }, { zoom: 1.04 }] },
  { start: 130.2, end: L.ch3[0], scene: 'flythrough', bg: 'lectern-glow', bgFrom: 2, fade: 0.4 },

  // ---- Final chorus: the boy in the middle, every letter rises into a rainbow.
  { start: L.ch3[0], end: L.ch3[2], scene: 'finale', clip: 'library-hall', from: 2.6, speed: 0.45, flash: 0.5 },
  // "מאלף ועד תו, בקול גדול" — the whole alef-bet at once.
  { start: L.ch3[2], end: L.ch3[3], scene: 'grid', bg: 'castle-path', bgFrom: 2, fade: 0.3 },
  // "עם התורה נמשיך לגדול!"
  { start: L.ch3[3], end: L.outro[0], clip: 'castle-path', from: 2.6, cam: [{ zoom: 1.04 }, { zoom: 1.12, fy: 0.45 }], fx: [{ type: 'glow', x: 1440, y: 380, r: 700, alpha: 0.4, rays: 0.15 }] },

  // ---- Outro: "מלך האותיות!" with the title, music and clapping.
  { start: L.outro[0], end: L.outro[1], clip: 'hall-pointing', from: 1.5, punch: 0.03, flash: 0.4, cam: [{ zoom: 1.04 }, { zoom: 1.1, fx: 0.45 }],
    fx: [{ type: 'title', at: L.outro[0] + 0.1, size: 170, y: 190 }] },
  { start: L.outro[1], end: L.outro[2], clip: 'library-book-burst', from: 0.4, punch: 0.03, cam: [{ zoom: 1.1, fx: 0.4 }, { zoom: 1.04 }], fx: [{ type: 'sparkles', n: 50, seed: 11 }] },
  { start: L.outro[2], end: L.outro[3], clip: 'grand-staircase', from: 1.0, punch: 0.03, flash: 0.4, cam: [{ zoom: 1.06 }, { zoom: 1.14, fx: 0.48 }],
    fx: [{ type: 'title', at: L.outro[2] + 0.1, size: 170, y: 190 }] },
  { start: L.outro[3], end: 158.2, clip: 'lectern-glow', from: 4.4, punch: 0.03, cam: [{ zoom: 1.04 }, { zoom: 1.14, fx: 0.55 }], fx: [{ type: 'wash', at: L.outro[3] + 0.4, rise: 2, x: 1150, y: 500, alpha: 0.4 }] },
  { start: 158.2, end: 162.0, scene: 'flythrough', bg: 'library-hall', bgFrom: 3, fade: 0.4 },
  { start: 162.0, end: DURATION, scene: 'endTitle', faceFrame: 183, fade: 0.8 },
];
