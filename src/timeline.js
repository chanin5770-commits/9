/* Shared timeline for the "חשמלי" 30s commercial.
 * Every visual scene and every sound effect reads its timing from here,
 * so picture and audio stay in sync in the live player and in the MP4 export. */
(function (global) {
  'use strict';

  const AD = global.AD || (global.AD = {});

  AD.W = 1920;
  AD.H = 1080;
  AD.DUR = 30;

  // Scene blocks [start, end, id]
  AD.SCENES = [
    [0.0, 2.0, 'intro'],       // black, rising hum, first spark
    [2.0, 6.0, 'cable'],       // macro industrial cable, energy pulse
    [6.0, 9.5, 'board'],       // switchboard, breakers close one by one
    [9.5, 12.5, 'conduit'],    // camera flight along cable trays
    [12.5, 17.0, 'building'],  // dark tower lights up floor by floor
    [17.0, 21.5, 'montage'],   // EV charging, power lines, facade, data center
    [21.5, 24.5, 'breaker'],   // silence, giant main breaker, BOOM
    [24.5, 26.2, 'converge'],  // blue + gold energy converges to center
    [26.2, 30.0, 'logo'],      // FLASH, logo reveal, tagline
  ];

  // Breaker CLACK times in the switchboard scene
  AD.BREAKERS = [6.45, 6.85, 7.25, 7.6, 7.9, 8.15, 8.4, 8.65];

  // Building: time floor k (0 = ground) lights up
  AD.FLOORS = 16;
  AD.floorTime = (k) => 13.05 + k * 0.17;

  // Montage sub-shots
  AD.MONTAGE_START = 17.0;
  AD.MONTAGE_SHOT = 1.125;

  // Main breaker
  AD.MAIN_CLICK = 22.0;
  AD.MAIN_BOOM = 22.2;

  // Logo
  AD.FLASH = 26.2;
  AD.TAGLINE = [
    [27.1, 'עוצמה'],
    [27.6, 'דיוק'],
    [28.1, 'מקצועיות'],
  ];
  AD.LOGO_SPARK = 28.65;
  AD.FINAL_HIT = 29.2;
  AD.CUT_TO_BLACK = 29.75;

  // Voice-over cues [start, end, text] — the slots the music leaves open for the narrator
  AD.CUES = [
    [2.5, 4.8, 'כשזה חשמל — בוחרים נכון.'],
    [8.9, 11.3, 'מתשתיות ולוחות חשמל...'],
    [12.6, 16.2, 'ועד מערכות מתקדמות ופרויקטים מורכבים.'],
    [20.0, 21.6, 'כאן אין מקום לפשרות.'],
    [23.0, 24.4, 'יש חשמל...'],
    [24.9, 26.4, 'ויש — חשמלי.'],
    [27.1, 28.6, 'עוצמה. דיוק. מקצועיות.'],
    [29.15, 29.9, 'חשמלי.'],
  ];
})(typeof window !== 'undefined' ? window : globalThis);
