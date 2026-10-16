/* Promo settings. To make a video for another architect or project: replace the
 * images in assets/, update the paths and wording here, and run
 *   node chanili-promo/tools/render.cjs
 * Every caption is optional: an empty string hides it. */
window.PROMO = {
  brand: {
    logo: 'assets/logo.png',
    phone: '054-593-5578',
    services: 'הדמיות אדריכליות · סיורי תלת־ממד',
    rights: '© כל הזכויות שמורות לחני לי',
  },

  // Scene 1–2: the architect's model, then the wipe to the finished render
  before: 'assets/revit.jpg',
  reveal: 'assets/render-aerial-front.jpg',
  eyebrow: 'לאדריכלים · ליזמים · למשרדי תכנון',
  hook: 'יש לכם מודל ב־Revit?',
  revealLine: 'הופכים אותו להדמיה',
  revealLine2: 'שנראית כמו צילום',

  // Scenes 3–6: one image each, with a short caption
  shots: [
    { img: 'assets/render-front.jpg', caption: 'אבן ירושלמית · אור טבעי · צללים אמיתיים' },
    { img: 'assets/render-corner.jpg', caption: 'כל חזית. כל זווית.' },
    { img: 'assets/render-aerial-back.jpg', caption: 'מבט ממעוף הציפור' },
    { img: 'assets/render-street.jpg', caption: 'סביבה חיה: רחוב, גינון ואנשים' },
  ],

  // Scene 7: frames captured from the interactive 3D tour (tools/capture-tour.cjs)
  tour: { dir: 'assets/tour/', frames: 132, nightFrom: 72 },
  tourTitle: 'ועכשיו גם סיור תלת־ממדי',
  tourSub: 'אינטראקטיבי · 360° · יום ולילה · בכל טלפון',

  // Scene 8: collage
  collage: ['assets/render-aerial-front.jpg', 'assets/render-front.jpg', 'assets/render-corner.jpg', 'assets/render-street.jpg', 'assets/render-aerial-back.jpg', 'assets/revit.jpg'],
  collageLine: 'הדמיות שמוכרות את הפרויקט',
  collageLine2: 'עוד לפני שהוא נבנה',

  // Scene 9: end card
  cta: 'שלחו מודל או תוכניות, ונחזור אליכם עם הדמיה',
};
