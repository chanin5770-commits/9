// Shared data model for the editor (UI), the film composition (Remotion) and the server.

export const CHILDREN = ['משי', 'ליבי', 'הדר', 'שרי', 'יוני'] as const;
export type Child = (typeof CHILDREN)[number];

// Alternative spellings that should map to the same child (folder names, file names, lyrics).
export const CHILD_ALIASES: Record<Child, string[]> = {
  'משי': ['משי', 'mushi', 'meshi'],
  'ליבי': ['ליבי', 'libi', 'livi'],
  'הדר': ['הדר', 'hadar'],
  'שרי': ['שרי', 'שטערנא', 'שטערנא שרה', 'שרה', 'sari', 'sheri', 'shterna', 'sterna'],
  'יוני': ['יוני', 'יונתן', 'yoni', 'yonatan'],
};

export const MOMENTS = ['חיבוק', 'חיוך', 'טיול', 'צחוק', 'משחק', 'משפחה', 'מבט', 'חג'] as const;
export type Moment = (typeof MOMENTS)[number];

export const MOMENT_KEYWORDS: Record<Moment, string[]> = {
  'חיבוק': ['חיבוק', 'מחבק', 'חיבוקים', 'hug'],
  'חיוך': ['חיוך', 'חיוכים', 'smile'],
  'טיול': ['טיול', 'טיולים', 'ים', 'חוף', 'יער', 'נופש', 'trip', 'beach', 'travel', 'vacation', 'hike'],
  'צחוק': ['צחוק', 'מצחיק', 'צחוקים', 'funny', 'laugh', 'fun'],
  'משחק': ['משחק', 'משחקים', 'play', 'game'],
  'משפחה': ['משפחה', 'משפחתי', 'כולנו', 'family', 'all'],
  'מבט': ['מבט', 'עיניים', 'look'],
  'חג': ['חג', 'שבת', 'פסח', 'סוכות', 'חנוכה', 'פורים', 'holiday'],
};

export type Box = { x: number; y: number; w: number; h: number }; // normalized 0..1

export type Photo = {
  id: string;
  name: string;            // original file name
  relPath: string;         // path inside the imported folder
  w: number;               // pixel size after EXIF rotation
  h: number;
  takenAt: number | null;  // ms since epoch (EXIF), null if unknown
  hash: string;            // 64-bit dHash, hex
  faces: Box[] | null;     // null = not analyzed yet
  focus: { x: number; y: number } | null; // manual point of interest (overrides faces)
  stats: { brightness: number; warmth: number; sharpness: number } | null;
  people: Child[];
  moments: Moment[];
  hero: boolean;           // "key photo" - gets long, prominent slots
  excluded: boolean;
  lowRes: boolean;
};

export type Section = {
  start: number;
  end: number;
  kind: 'intro' | 'verse' | 'build' | 'chorus' | 'bridge' | 'outro';
  energy: number; // 0..1 relative
};

export type AudioAnalysis = {
  duration: number;
  bpm: number;
  beats: number[];      // seconds
  downbeats: number[];  // seconds (bar starts, 4/4 assumed)
  energy: number[];     // smoothed loudness 0..1, one value per ENERGY_STEP seconds
  energyStep: number;
  waveform: number[];   // peak per waveform bucket 0..1 (for drawing)
  sections: Section[];
  peak: number;         // strongest musical moment (s)
  firstSound: number;   // first audible moment (s)
  lastSound: number;    // last audible moment (s)
  quiet: { start: number; end: number }[];
};

export type Effect =
  | 'zoomIn' | 'zoomOut' | 'pushIn' | 'panLeft' | 'panRight' | 'panUp' | 'panDown' | 'parallax' | 'still';
export const EFFECT_LABELS: Record<Effect, string> = {
  zoomIn: 'זום קולנועי איטי',
  zoomOut: 'זום החוצה עדין',
  pushIn: 'התקרבות עדינה לפנים',
  panLeft: 'פאן שמאלה',
  panRight: 'פאן ימינה',
  panUp: 'פאן למעלה',
  panDown: 'פאן למטה',
  parallax: 'עומק (פרלקסה)',
  still: 'נשימה עדינה',
};

export type Transition = 'crossfade' | 'memory' | 'lightLeak' | 'dipBlack' | 'cut';
export const TRANSITION_LABELS: Record<Transition, string> = {
  memory: 'זיכרון (המסה רכה)',
  crossfade: 'המסה',
  lightLeak: 'דליפת אור',
  dipBlack: 'דרך שחור',
  cut: 'חיתוך על הביט',
};

export type Layout = 'single' | 'duo' | 'trio' | 'feature';
export const LAYOUT_LABELS: Record<Layout, string> = {
  single: 'תמונה בודדת',
  duo: 'קולאז׳ זוגי',
  trio: 'קולאז׳ משולש',
  feature: 'תמונה מרכזית + שתיים',
};

export type Clip = {
  id: string;
  start: number;       // seconds — boundaries sit on beats
  dur: number;
  layout: Layout;
  photoIds: string[];  // 1 for single, 2-3 for collages
  effect: Effect;
  transition: Transition; // transition INTO this clip
  transDur: number;       // seconds
  role?: 'opening' | 'family' | 'hero' | 'closing' | 'rapid' | 'child';
};

export type CaptionStyle = 'title' | 'lower' | 'big' | 'signature';
export const CAPTION_STYLE_LABELS: Record<CaptionStyle, string> = {
  title: 'כותרת מרכזית',
  lower: 'שורה תחתונה',
  big: 'כותרת גדולה',
  signature: 'חתימה',
};

export type Caption = {
  id: string;
  text: string;   // may contain \n
  start: number;
  dur: number;
  style: CaptionStyle;
};

export type LyricLine = { id: string; text: string; start: number | null; end: number | null };

export type Format = '16:9' | '9:16';

export type Settings = {
  format: Format;
  resolution: 1080 | 2160;
  fps: 30;
  grain: number;       // 0..1
  lightLeaks: boolean;
  vignette: boolean;
  warmth: number;      // 0..1 color grade amount
  showLyrics: boolean;
  openingPhotoId: string | null;
  closingPhotoId: string | null;
  familyPhotoId: string | null; // the family photo after the opening
  climaxPhotoId: string | null; // the photo on the strongest musical moment (pinned by the user)
  autoClimaxId?: string | null; // the smart order's choice when nothing is pinned
};

export type Project = {
  id: string;
  title: string;
  createdAt: number;
  audio: { file: string; name: string; analysis: AudioAnalysis | null } | null;
  photos: Photo[];
  order: string[];         // story order of photo ids
  clips: Clip[];
  captions: Caption[];
  lyrics: LyricLine[];
  settings: Settings;
};

export const DEFAULT_SETTINGS: Settings = {
  format: '16:9',
  resolution: 1080,
  fps: 30,
  grain: 0.5,
  lightLeaks: true,
  vignette: true,
  warmth: 0.6,
  showLyrics: false,
  openingPhotoId: null,
  closingPhotoId: null,
  familyPhotoId: null,
  climaxPhotoId: null,
};

export const frameSize = (s: Pick<Settings, 'format' | 'resolution'>) => {
  const k = s.resolution / 1080;
  return s.format === '16:9' ? { width: Math.round(1920 * k), height: Math.round(1080 * k) } : { width: Math.round(1080 * k), height: Math.round(1920 * k) };
};

// Props handed to the Remotion composition.
export type FilmProps = {
  project: Project;
  mediaBase: string;          // '' in the editor, 'http://127.0.0.1:PORT' while rendering
  quality: 'preview' | 'master';
};

export const uid = () => Math.random().toString(36).slice(2, 10);
