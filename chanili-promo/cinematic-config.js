/* "אל תציגו רק את הפרויקט. תנו ללקוחות שלכם להיכנס אליו."
 * Settings for the 40-second cinematic ad (cinematic.js). For another project, replace
 * the images and the wording here and run:  node chanili-promo/tools/render.cjs --film cinematic
 *
 * Narration: record each line below as its own file, vo/01.wav … vo/15.wav (or .mp3), and
 * re-render. Each line starts at its `t` (seconds); the subtitle follows the recording's
 * length, and the music dips under the voice automatically. Without recordings, the
 * subtitles carry the script on their own (most feeds play muted anyway).
 * `big: true` lines are shown as large on-screen titles instead of subtitles. */
window.CINE = {
  dur: 40,
  logo: 'assets/logo.png',
  phone: '054-593-5578',
  slogan: 'החזון שלכם. החוויה שלנו.',
  services: 'הדמיות אדריכליות | חוויות תלת־ממד',
  rights: '© כל הזכויות שמורות לחני לי',

  // Scene 1–2: line drawing traced from the hero render, then the render itself
  lines: 'assets/lines-aerial-front.png',
  hero: 'assets/render-aerial-front.jpg',
  heroFocus: [0.52, 0.47],

  // Scene 3: the "drone" sequence (focus points are fractions of the image)
  orbit: { img: 'assets/render-corner.jpg', from: [0.64, 0.5], to: [0.4, 0.46] },
  detail: { img: 'assets/render-front.jpg', from: [0.56, 0.52], to: [0.5, 0.46] },
  street: { img: 'assets/render-street.jpg', from: [0.42, 0.5], to: [0.56, 0.46] },
  aerial: { img: 'assets/render-aerial-back.jpg', from: [0.5, 0.56], to: [0.5, 0.44] },

  // Scene 4: screen capture of the real interactive tour (tools/capture-ui.cjs)
  ui: { dir: 'assets/ui/', frames: 120, fps: 15, clicks: [50, 90, 104] },
  concept: ['אל תציגו רק את הפרויקט.', 'תנו ללקוחות שלכם להיכנס אליו.'],

  // Scene 5: fast montage
  montage: ['assets/render-aerial-front.jpg', 'assets/render-front.jpg', 'assets/render-corner.jpg', 'assets/render-street.jpg', 'assets/render-aerial-back.jpg', 'assets/ui/119.jpg', 'assets/tour/131.jpg', 'assets/render-front.jpg'],

  vo: [
    { t: 0.35, text: 'אדריכלים ומעצבים!', big: true },
    { t: 1.75, text: 'אתם עדיין מציגים ללקוחות שלכם רק תמונות סטטיות?' },
    { t: 6.4, text: 'תארו לעצמכם שהלקוחות שלכם יכולים לראות את הפרויקט...' },
    { t: 10.3, text: 'עוד לפני שהוא נבנה.', big: true },
    { t: 13.3, text: 'להתרשם מכל זווית.', big: true },
    { t: 15.6, text: 'להתקרב לכל פרט.', big: true },
    { t: 17.6, text: 'ולחוות את התכנון שלכם בצורה שלא הכירו.' },
    { t: 21.4, text: 'הדמיות אדריכליות מרהיבות.' },
    { t: 23.6, text: 'סיורים אינטראקטיביים.' },
    { t: 25.6, text: 'וחוויה ויזואלית שהופכת כל פרויקט לבלתי נשכח.' },
    { t: 29.3, text: 'כי התכנון שלכם ראוי להרבה יותר מתמונה.', big: true },
    { t: 33.3, text: 'CHANILI Studio.', big: true },
    { t: 34.6, text: 'החזון שלכם. החוויה שלנו.', big: true },
    { t: 36.6, text: 'רוצים להעניק גם לפרויקט שלכם את אפקט הוואו?' },
    { t: 38.7, text: 'בואו נדבר.' },
  ],
};
