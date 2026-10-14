/* Shared timeline for the "חשמלי" 30s commercial.
 * Follows the 12-panel storyboard. Music runs at 80 BPM, so every 3-second
 * panel is exactly one 4/4 bar and every cut lands on a downbeat.
 * Picture, sound effects, music and narration all read their timing from here. */
(function (global) {
  'use strict';

  const AD = global.AD || (global.AD = {});

  AD.W = 1920;
  AD.H = 1080;
  AD.DUR = 30;

  // ---------- musical grid ----------
  AD.BPM = 80;
  AD.BEAT = 60 / AD.BPM;   // 0.75 s
  AD.BAR = AD.BEAT * 4;    // 3 s
  AD.GRID0 = 2;            // bar 1 starts at 0:02 (0:00–0:02 is the pickup)

  // ---------- storyboard panels ----------
  // [start, end, scene, sourceStart?, sourceEnd?]
  // Scenes with a source range are drawn by a renderer authored on its own clock;
  // the panel's time is mapped linearly onto that range.
  AD.SCENES = [
    [0.0, 0.45, 'intro', 1.5, 1.98],       // 1  darkness, first spark
    [0.45, 2.0, 'cable', 2.0, 6.0],        // 1  power pulse through an industrial cable
    [2.0, 5.0, 'conduit', 9.5, 12.5],      // 2  energy flows through cables and trays
    [5.0, 8.0, 'board', 6.0, 9.5],         // 3  breakers close one after another
    [8.0, 11.0, 'data'],                   // 4  infrastructure in big buildings, advanced systems
    [11.0, 14.0, 'building', 12.5, 17.0],  // 5  tower lights up floor by floor, city wakes
    [14.0, 17.0, 'city'],                  // 6  across environments: industry, commerce, institutions
    [17.0, 20.0, 'ev'],                    // 7  EV charging, smart systems
    [20.0, 23.0, 'grid'],                  // 8  large projects: solar fields, power lines at sunset
    [23.0, 26.0, 'converge', 24.5, 26.2],  // 9  every energy line converges to one point
    [26.0, 30.0, 'logo', 26.2, 30.2],      // 10–12  logo from energy, slogan, clean ending
  ];

  // Breakers — on 8th notes, the last ones tighten to 16ths (panel time)
  AD.BREAKERS_AT = [5.375, 5.75, 6.125, 6.5, 6.875, 7.25, 7.4375, 7.625];
  AD.BREAKERS = AD.BREAKERS_AT.map((n) => 6.0 + ((n - 5.0) * 3.5) / 3); // board renderer clock

  // Building floors (panel time / renderer clock)
  AD.FLOORS = 16;
  AD.floorAt = (k) => 11.375 + k * 0.125;   // sextuplet 16ths
  AD.floorTime = (k) => 12.5 + (AD.floorAt(k) - 11.0) * 1.5;

  // Logo renderer clock = panel time + 0.2
  AD.FLASH = 26.2;                 // panel 26.0
  AD.TAGLINE = [                   // panel 28.0 / 28.375 / 28.75 (8th notes)
    [28.2, 'עוצמה'],
    [28.575, 'דיוק'],
    [28.95, 'מקצועיות'],
  ];
  AD.LOGO_SPARK = 27.4;            // panel 27.2
  AD.FINAL_HIT = 26.65;            // panel 26.45 — on the last spoken "חשמלי"
  AD.CUT_TO_BLACK = 29.6;          // panel 29.4 — fade to the clean ending

  // ---------- narration ----------
  // assets/narration.wav phrases: [sourceStart, sourceEnd, placeAt, text]
  AD.VOICE_SRC = 'assets/narration.wav';
  AD.VO = [
    [0.0, 2.68, 2.25, 'כשזה חשמל — בוחרים נכון.'],
    [3.1, 5.45, 5.25, 'מתשתיות ולוחות חשמל...'],
    [5.79, 8.43, 8.2, 'ועד מערכות מתקדמות ופרויקטים מורכבים.'],
    [9.34, 11.0, 11.85, 'כאן אין מקום לפשרות.'],
    [11.36, 12.84, 14.45, 'יש חשמל...'],
    [13.57, 15.52, 17.52, 'ויש — חשמלי.'],
    [16.23, 16.83, 20.2, 'עוצמה.'],
    [17.54, 18.3, 21.32, 'דיוק.'],
    [18.78, 19.68, 22.44, 'מקצועיות.'],
    [20.35, 21.05, 26.45, 'חשמלי.'],
  ];

  // Captions for the player (derived from the narration placement)
  AD.CUES = AD.VO.map(([s, e, at, text]) => [at, at + (e - s) + 0.15, text]);
})(typeof window !== 'undefined' ? window : globalThis);
