// Automatic storyboard: orders the photos into a story and lays them on the song.
//
// Story (from the brief):
//   opening   – black, soft light, Abba with one of the kids, three opening lines, then a family photo
//   part 2    – Abba through our eyes: Abba with the kids, long calm shots, chronological
//   part 3    – our family: family photos, trips, laughs – rhythmic, collages and quick runs
//   part 4    – the climax: Abba with each of the five kids, then THE family photo on the peak
//   ending    – the music calms down: full family photo, thank-you lines, happy birthday, fade out
//
// Every cut sits on a beat. Slot lengths follow the energy of the music: long holds in quiet
// parts, collages and quick runs in loud parts.

import type { AudioAnalysis, Caption, Child, Clip, Effect, LyricLine, Photo, Project, Transition } from './types';
import { CHILDREN, CHILD_ALIASES, MOMENT_KEYWORDS, MOMENTS, uid } from './types';
import { bestCollage } from './layouts';
import { energyAt, nearestBeat } from './audioAnalysis';

// ---------------------------------------------------------------- photo classification

export type Kind = 'family' | 'dadChild' | 'moment';

export function classify(p: Photo): Kind {
  const faces = p.faces?.length ?? 0;
  if (p.moments.includes('משפחה') || p.people.length >= 3 || faces >= 4) return 'family';
  if (p.people.length >= 1 || faces >= 2) return 'dadChild';
  return 'moment';
}

const quality = (p: Photo) => {
  let q = 0;
  if (p.stats) q += Math.min(1, p.stats.sharpness / 40) * 0.6 + (1 - Math.abs(p.stats.brightness - 0.52) * 2) * 0.4;
  else q += 0.5;
  if (p.lowRes) q -= 0.6;
  if (p.hero) q += 1;
  return q;
};

/** Pull child names and moments out of folder names / file names. */
export function tagsFromPath(relPath: string): { people: Child[]; moments: Photo['moments'] } {
  const s = relPath.toLowerCase().replace(/[_\-.]+/g, ' ');
  const people = CHILDREN.filter((c) => CHILD_ALIASES[c].some((a) => new RegExp(`(^|[^\\p{L}])${a}($|[^\\p{L}])`, 'u').test(s)));
  const moments = MOMENTS.filter((m) => MOMENT_KEYWORDS[m].some((k) => s.includes(k)));
  return { people, moments };
}

// hamming distance of two 64-bit hex hashes
export const hashDistance = (a: string, b: string) => {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
};

// ---------------------------------------------------------------- song regions

export type Regions = {
  end: number;
  photoIn: number;     // first light (opening photo starts fading in)
  openMid: number;     // opening photo -> family photo
  openEnd: number;     // end of the opening
  kidsStart: number;   // climax build: Abba with each of the kids
  heroStart: number;   // the peak
  heroEnd: number;
  closingStart: number;
};

const beatsBetween = (beats: number[], a: number, b: number) => beats.filter((t) => t >= a - 1e-3 && t <= b + 1e-3);

export function regions(a: AudioAnalysis): Regions {
  const end = a.duration;
  const spb = 60 / (a.bpm || 100);
  const db = a.downbeats.length ? a.downbeats : a.beats;
  const snapBar = (t: number) => nearestBeat(db, t);
  const photoIn = Math.min(4, Math.max(0.8, a.firstSound + 0.4));
  const intro = a.sections[0];
  const introEnd = intro && intro.kind === 'intro' ? intro.end : 12;
  const openEnd = snapBar(Math.min(24, Math.max(15, introEnd)));
  const openMid = snapBar(photoIn + (openEnd - photoIn) * 0.62);

  // the ending: on the outro if the song has one of a sensible length, else the last ~20 s
  const last = a.sections[a.sections.length - 1];
  let closingStart = last && last.kind === 'outro' && last.start >= end - 34 && last.start <= end - 12 ? last.start : snapBar(Math.max(end * 0.8, end - 21));

  // the climax: the loudest chorus (later ones win ties). Abba with each child starts on the chorus,
  // the big family photo lands on its strongest bar after that.
  const kidsLen = 5 * Math.max(2.2, 4 * spb);
  const heroLen = Math.max(4.5, 8 * spb);
  const choruses = a.sections.filter((x) => x.kind === 'chorus' && x.start >= end * 0.35 && x.start < closingStart - 10);
  const main = choruses.reduce<typeof choruses[number] | null>((b, x) => (!b || x.energy >= b.energy * 0.97 ? x : b), null);
  let kidsStart: number, heroStart: number;
  if (main) {
    const lim = Math.min(main.end - 3, closingStart - heroLen - 2);
    let best = -1, bestE = -1;
    const eAt = (t: number) => energyAt(a, t);
    const cands = db.filter((t) => t >= main.start + kidsLen - 0.5 && t <= lim);
    for (const t of cands) { const e = eAt(t + 1) + eAt(t + 2); if (e > bestE * 1.03) { bestE = e; best = t; } }
    heroStart = best >= 0 ? best : snapBar(Math.min(lim, main.start + kidsLen));
    kidsStart = nearestBeat(a.beats, Math.max(openEnd + 8, Math.min(main.start, heroStart - kidsLen)));
  } else {
    heroStart = snapBar(Math.min(Math.max(a.peak, end * 0.55), closingStart - heroLen - 6));
    kidsStart = nearestBeat(a.beats, Math.max(openEnd + 8, heroStart - kidsLen));
  }
  let heroEnd = nearestBeat(a.beats, heroStart + heroLen);
  if (heroEnd <= heroStart) heroEnd = heroStart + heroLen;
  if (heroEnd > closingStart - 1) closingStart = heroEnd;
  return { end, photoIn, openMid, openEnd, kidsStart, heroStart, heroEnd, closingStart };
}

// ---------------------------------------------------------------- smart order

export type Picks = { opening: string; family: string; climax: string; closing: string; kids: string[] };

export function smartOrder(project: Project): { order: string[]; picks: Picks } {
  const a = project.audio?.analysis;
  const s = project.settings;
  const pool = project.photos.filter((p) => !p.excluded);
  if (pool.length === 0) return { order: [], picks: { opening: '', family: '', climax: '', closing: '', kids: [] } };
  const byId = new Map(pool.map((p) => [p.id, p]));
  const used = new Set<string>();
  const time = (p: Photo) => p.takenAt ?? Number.MAX_SAFE_INTEGER;
  const chrono = (x: Photo[]) => [...x].sort((p, q) => time(p) - time(q) || p.relPath.localeCompare(q.relPath, 'he', { numeric: true }));
  const take = (cands: Photo[], score: (p: Photo) => number) => {
    const best = cands.filter((p) => !used.has(p.id)).sort((p, q) => score(q) - score(p))[0];
    if (best) used.add(best.id);
    return best;
  };
  const pinned = (id: string | null) => (id && byId.has(id) ? (used.add(id), byId.get(id)!) : undefined);
  const faces = (p: Photo) => p.faces?.length ?? 0;
  const landscapeBonus = (p: Photo) => (s.format === '16:9' ? (p.w >= p.h ? 0.4 : 0) : p.h > p.w ? 0.4 : 0);

  const closing = pinned(s.closingPhotoId) ?? take(pool, (p) => (classify(p) === 'family' ? 2 : 0) + faces(p) * 0.25 + p.people.length * 0.3 + quality(p) + landscapeBonus(p));
  const climax = pinned(s.climaxPhotoId) ?? take(pool, (p) => (classify(p) === 'family' ? 3 : 0) + (p.hero ? 1.5 : 0) + faces(p) * 0.2 + quality(p) + landscapeBonus(p));
  const opening = pinned(s.openingPhotoId) ?? take(pool, (p) => (classify(p) === 'dadChild' ? 2 : 0) + (faces(p) === 2 ? 0.5 : 0) + quality(p) + (p.moments.includes('חיבוק') ? 0.6 : 0));
  const family = pinned(s.familyPhotoId) ?? take(pool, (p) => (classify(p) === 'family' ? 2 : 0) + quality(p) + (p.moments.includes('חיבוק') ? 0.3 : 0));

  // the climax build: one photo of Abba with each child, in birth order
  const kids: Photo[] = [];
  for (const c of CHILDREN) {
    const k = take(pool.filter((p) => p.people.includes(c)), (p) => (p.people.length === 1 ? 1 : 0) + quality(p) + (p.moments.includes('חיבוק') ? 0.5 : 0));
    if (k) kids.push(k);
  }
  while (kids.length < Math.min(5, pool.length - used.size)) {
    const k = take(pool, (p) => (classify(p) === 'dadChild' ? 1 : 0) + quality(p));
    if (!k) break;
    kids.push(k);
  }

  const rest = pool.filter((p) => !used.has(p.id));
  // Part 2 – Abba with the kids, chronological, children in turn so everyone appears
  const dad = chrono(rest.filter((p) => classify(p) === 'dadChild'));
  const others = chrono(rest.filter((p) => classify(p) !== 'dadChild'));
  // Part 3 – the family: interleave family photos / trips / laughs for variety
  const funny = others.filter((p) => p.moments.includes('צחוק') || p.moments.includes('משחק'));
  const fam = others.filter((p) => !funny.includes(p));

  // how many photos the calm part can carry vs the energetic part
  let calmShare = 0.4;
  if (a) {
    const r = regions(a);
    const calmT = (r.kidsStart - r.openEnd) * 0.45, busyT = (r.kidsStart - r.openEnd) * 0.55 + (r.closingStart - r.heroEnd);
    calmShare = (calmT / 3.6) / (calmT / 3.6 + busyT / 2.0);
  }
  const calmCount = Math.round(rest.length * calmShare);
  const part2: Photo[] = [];
  const queues = new Map<string, Photo[]>();
  for (const p of dad) {
    const key = p.people[0] ?? 'x';
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key)!.push(p);
  }
  while (part2.length < Math.min(calmCount, dad.length)) {
    for (const q of queues.values()) if (q.length && part2.length < calmCount) part2.push(q.shift()!);
  }
  const leftoverDad = [...queues.values()].flat();
  let part3 = interleave(chrono([...fam, ...leftoverDad]), funny);
  // fill the calm part from part 3 if there were not enough "Abba with the kids" photos
  while (part2.length < calmCount && part3.length) part2.push(part3.shift()!);
  part2.sort((p, q) => time(p) - time(q));

  // a few joyful photos for after the peak, before the ending
  let after: Photo[] = [];
  if (a) {
    const r = regions(a);
    const nAfter = Math.round(((r.closingStart - r.heroEnd) / ((r.kidsStart - r.openEnd) + (r.closingStart - r.heroEnd))) * rest.length);
    after = part3.splice(Math.max(0, part3.length - nAfter), nAfter);
  }
  part3 = spreadSimilar(part3);

  const order = [opening, family, ...part2, ...part3, ...kids, climax, ...after, closing].filter(Boolean).map((p) => p!.id);
  const uniq = [...new Set(order)];
  return {
    order: uniq,
    picks: { opening: opening?.id ?? '', family: family?.id ?? '', climax: climax?.id ?? '', closing: closing?.id ?? '', kids: kids.map((k) => k.id) },
  };
}

function interleave<T>(main: T[], extra: T[]): T[] {
  if (!extra.length) return main;
  const out: T[] = [];
  const step = (main.length + extra.length) / extra.length;
  let ei = 0, mi = 0;
  for (let i = 0; i < main.length + extra.length; i++) {
    if (ei < extra.length && (i + 1) >= step * (ei + 0.5)) out.push(extra[ei++]);
    else if (mi < main.length) out.push(main[mi++]);
    else out.push(extra[ei++]);
  }
  return out;
}

/** Near-identical shots (bursts) stay together so they can become a collage or a quick run. */
function spreadSimilar(list: Photo[]): Photo[] {
  const out: Photo[] = [];
  const left = [...list];
  while (left.length) {
    const p = left.shift()!;
    out.push(p);
    for (let i = 0; i < left.length && i < 12; i++) {
      if (hashDistance(p.hash, left[i].hash) <= 10) { out.push(left.splice(i, 1)[0]); i--; }
    }
  }
  return out;
}

// ---------------------------------------------------------------- slot allocation (DP over beats)

type BlockType = 'single' | 'duo' | 'trio' | 'rapid';
type Block = { type: BlockType; beats: number; photos: number };

// preferred seconds per block at quiet / medium / loud music
const IDEAL: Record<BlockType, [number, number, number]> = { single: [4.4, 3.0, 2.1], duo: [4.6, 3.6, 2.9], trio: [5.2, 4.2, 3.3], rapid: [0, 0.75, 0.6] };
const TYPE_COST: Record<BlockType, [number, number, number]> = { single: [0, 0, 0.15], duo: [1.4, 0.3, 0.1], trio: [2.4, 0.35, 0.05], rapid: [99, 4, 2.0] };

type FillResult = { blocks: { type: BlockType; b0: number; b1: number; p0: number; p1: number; layoutOrder?: string[]; layout?: Clip['layout'] }[] } | null;

function fillRegion(beatT: number[], photos: Photo[], level: (t: number) => number, isBar: (i: number) => boolean, format: Project['settings']['format']): FillResult {
  const B = beatT.length - 1, n = photos.length;
  if (B <= 0) return n === 0 ? { blocks: [] } : null;
  if (n === 0) return null;
  const spb = (beatT[B] - beatT[0]) / B;
  // collage feasibility cache
  const coll = new Map<string, ReturnType<typeof bestCollage>>();
  const collAt = (p0: number, c: number) => {
    const k = p0 + ':' + c;
    if (!coll.has(k)) {
      const g = photos.slice(p0, p0 + c);
      coll.set(k, g.length === c && !g.some((p) => p.hero) ? bestCollage(g, format) : null);
    }
    return coll.get(k)!;
  };
  const types: BlockType[] = ['single', 'duo', 'trio', 'rapid'];
  const maxBeats = Math.max(2, Math.round(9 / spb), Math.ceil(B / n) + 1);
  const heroBefore = new Int32Array(n + 1); // prefix count of key photos
  photos.forEach((p, i) => (heroBefore[i + 1] = heroBefore[i] + (p.hero ? 1 : 0)));
  const anyHero = (p0: number, c: number) => heroBefore[p0 + c] - heroBefore[p0] > 0;
  const INF = 1e18;
  // state index: (beat, photo, lastType)
  const S = (B + 1) * (n + 1) * 5;
  const cost = new Float64Array(S).fill(INF);
  const prev = new Int32Array(S).fill(-1);
  const how = new Int32Array(S).fill(-1); // encoded block
  const idx = (b: number, p: number, t: number) => (b * (n + 1) + p) * 5 + t;
  cost[idx(0, 0, 4)] = 0;
  const rapidStep = spb < 0.42 ? 2 : 1;
  for (let b = 0; b < B; b++) {
    for (let p = 0; p < n; p++) {
      for (let lt = 0; lt < 5; lt++) {
        const c0 = cost[idx(b, p, lt)];
        if (c0 >= INF) continue;
        const lv = level(beatT[b]);
        for (let ti = 0; ti < 4; ti++) {
          const type = types[ti];
          const counts = type === 'single' ? [1] : type === 'duo' ? [2] : type === 'trio' ? [3] : [3, 4];
          for (const c of counts) {
            if (p + c > n) continue;
            if (type === 'rapid' && (lv === 0 || anyHero(p, c))) continue;
            if ((type === 'duo' || type === 'trio') && !collAt(p, c)) continue;
            const hero = type === 'single' && photos[p].hero;
            const ks = type === 'rapid' ? [c * rapidStep] : range(1, maxBeats);
            for (const k of ks) {
              if (b + k > B) break;
              const dur = beatT[b + k] - beatT[b];
              let cc = TYPE_COST[type][lv];
              if (type !== 'rapid') {
                const ideal = IDEAL[type][lv] * (hero ? 1.7 : 1);
                const r = Math.log(dur / ideal);
                cc += 3 * r * r;
                if (dur < (lv === 0 ? 2.2 : lv === 1 ? 1.5 : 1.0)) cc += 4;
              } else if (dur / c < 0.38) continue;
              // land long shots on bar lines in calm music
              if (!isBar(b + k) && b + k !== B) cc += lv === 0 ? 0.6 : lv === 1 ? 0.25 : 0.05;
              if (lt === ti) cc += type === 'single' ? 0.05 : 0.45;
              if (lt === 3 && ti === 3) cc += 3;
              const ni = idx(b + k, p + c, ti);
              if (c0 + cc < cost[ni]) { cost[ni] = c0 + cc; prev[ni] = idx(b, p, lt); how[ni] = ti * 1000 + k * 10 + c; }
            }
          }
        }
      }
    }
  }
  let bestT = -1, bc = INF;
  for (let t = 0; t < 5; t++) if (cost[idx(B, n, t)] < bc) { bc = cost[idx(B, n, t)]; bestT = t; }
  if (bestT < 0) return null;
  const blocks: NonNullable<FillResult>['blocks'] = [];
  let cur = idx(B, n, bestT);
  while (prev[cur] >= 0) {
    const h = how[cur];
    const type = types[Math.floor(h / 1000)], k = Math.floor((h % 1000) / 10), c = h % 10;
    const b1 = Math.floor(cur / 5 / (n + 1)), p1 = Math.floor(cur / 5) % (n + 1);
    const block: NonNullable<FillResult>['blocks'][number] = { type, b0: b1 - k, b1, p0: p1 - c, p1 };
    if (type === 'duo' || type === 'trio') {
      const bcol = collAt(p1 - c, c)!;
      block.layout = bcol.layout;
      block.layoutOrder = bcol.order.map((x) => x.id);
    }
    blocks.push(block);
    cur = prev[cur];
  }
  return { blocks: blocks.reverse() };
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ---------------------------------------------------------------- build the timeline

const CALM_FX: Effect[] = ['zoomIn', 'panLeft', 'pushIn', 'zoomOut', 'panRight', 'panUp'];
const BUSY_FX: Effect[] = ['pushIn', 'panRight', 'zoomIn', 'panLeft', 'zoomOut', 'panDown'];

export function buildStoryboard(project: Project): { clips: Clip[]; captions: Caption[]; warnings: string[] } {
  const a = project.audio?.analysis;
  const warnings: string[] = [];
  if (!a) return { clips: [], captions: [], warnings: ['צריך להעלות את השיר ולנתח אותו.'] };
  const s = project.settings;
  const byId = new Map(project.photos.map((p) => [p.id, p]));
  const order = project.order.filter((id) => byId.has(id) && !byId.get(id)!.excluded);
  if (order.length === 0) return { clips: [], captions: defaultCaptions(regions(a)), warnings: ['אין תמונות בסרט.'] };
  const r = regions(a);

  const opening = pick(s.openingPhotoId, order, 0);
  const closing = pick(s.closingPhotoId, order, order.length - 1);
  const flow0 = order.filter((id) => id !== opening && id !== closing);
  const family = s.familyPhotoId && flow0.includes(s.familyPhotoId) ? s.familyPhotoId : flow0[0];
  const flow1 = flow0.filter((id) => id !== family);
  let climax = s.climaxPhotoId && flow1.includes(s.climaxPhotoId) ? s.climaxPhotoId : null;
  if (!climax && s.autoClimaxId && flow1.includes(s.autoClimaxId)) climax = s.autoClimaxId;
  if (!climax && flow1.length) {
    // no choice stored: split the photos by the time before / after the peak, and take the
    // strongest family photo near that point
    const tA = r.heroStart - r.openEnd, tB = r.closingStart - r.heroEnd;
    const at = Math.min(flow1.length - 1, Math.round((flow1.length * tA) / (tA + tB * 1.15)));
    const score = (id: string) => { const p = byId.get(id)!; return (classify(p) === 'family' ? 2 : 0) + (p.hero ? 1 : 0) + (p.faces?.length ?? 0) * 0.1; };
    climax = flow1[at];
    for (let d = -3; d <= 3; d++) { const id = flow1[at + d]; if (id && score(id) > score(climax)) climax = id; }
  }
  const ci = climax ? flow1.indexOf(climax) : flow1.length;
  const before = flow1.slice(0, ci), afterIds = flow1.slice(ci + 1);
  const kidsN = Math.min(5, before.length);
  const kids = before.slice(before.length - kidsN), mainA = before.slice(0, before.length - kidsN);

  const clips: Clip[] = [];
  const firstChorus = a.sections.find((x) => x.kind === 'chorus')?.start ?? a.duration;
  const level = (t: number) => {
    const sec = a.sections.find((x) => t >= x.start && t < x.end);
    const e = energyAt(a, t);
    // the beginning of the song gets long, calm shots
    if (t < firstChorus && e < 0.5) return 0;
    if (sec?.kind === 'chorus' || e > 0.72) return 2;
    if (sec?.kind === 'intro' || sec?.kind === 'outro' || (sec?.kind === 'verse' && e < 0.55) || e < 0.35) return 0;
    return 1;
  };
  const barSet = new Set(a.downbeats.map((t) => Math.round(t * 100)));
  let fxI = 0;
  const nextFx = (lv: number) => (lv === 0 ? CALM_FX : BUSY_FX)[fxI++ % 6];

  const add = (c: Omit<Clip, 'id'>) => clips.push({ id: uid(), ...c });
  // opening: black, then the first photo comes out of the dark
  add({ start: 0, dur: r.openMid, layout: 'single', photoIds: [opening], effect: 'pushIn', transition: 'dipBlack', transDur: Math.min(3, r.photoIn * 2 + 1), role: 'opening' });
  if (family) add({ start: r.openMid, dur: r.openEnd - r.openMid, layout: 'single', photoIds: [family], effect: 'zoomOut', transition: 'memory', transDur: 1.8, role: 'family' });

  const layRegion = (t0: number, t1: number, ids: string[], roleFor?: (i: number) => Clip['role']) => {
    if (t1 - t0 < 0.3) return;
    const photos = ids.map((id) => byId.get(id)!);
    if (!photos.length) {
      // nothing to show: the previous shot holds longer
      const last = clips[clips.length - 1];
      if (last) last.dur = t1 - last.start;
      return;
    }
    let bt = beatsBetween(a.beats, t0, t1);
    if (!bt.length || Math.abs(bt[0] - t0) > 0.01) bt = [t0, ...bt.filter((t) => t > t0 + 0.05)];
    if (Math.abs(bt[bt.length - 1] - t1) > 0.01) bt = [...bt.filter((t) => t < t1 - 0.05), t1];
    const isBar = (i: number) => barSet.has(Math.round(bt[i] * 100));
    let res = fillRegion(bt, photos, level, isBar, s.format);
    if (!res) {
      // no comfortable arrangement: spread the photos evenly over the beats
      if (photos.length > bt.length - 1) warnings.push(`בקטע ${fmt(t0)}–${fmt(t1)} יש יותר תמונות ממה שהמוזיקה מאפשרת בנוחות. כדאי להוציא חלק מהתמונות.`);
      res = { blocks: [] };
      const n = photos.length, B = bt.length - 1;
      for (let i = 0; i < n; i++) {
        const b0 = Math.floor((i * B) / n), b1 = Math.max(b0 + 1, Math.floor(((i + 1) * B) / n));
        res.blocks.push({ type: 'single', b0, b1: Math.min(B, b1), p0: i, p1: i + 1 });
      }
    }
    for (const bl of res.blocks) {
      const lv = level(bt[bl.b0]);
      const start = bt[bl.b0], end = bt[bl.b1];
      const sectionStart = a.sections.some((x) => Math.abs(x.start - start) < 0.15 && x.kind === 'chorus');
      if (bl.type === 'rapid') {
        const per = (end - start) / (bl.p1 - bl.p0);
        for (let i = bl.p0; i < bl.p1; i++)
          add({ start: start + (i - bl.p0) * per, dur: per, layout: 'single', photoIds: [photos[i].id], effect: nextFx(2), transition: i === bl.p0 ? 'lightLeak' : 'cut', transDur: i === bl.p0 ? 0.35 : 0, role: 'rapid' });
        continue;
      }
      const dur = end - start;
      let transition: Transition = lv === 0 ? 'memory' : lv === 1 ? (fxI % 4 === 0 ? 'lightLeak' : 'crossfade') : fxI % 3 === 0 ? 'lightLeak' : 'cut';
      if (sectionStart) transition = 'lightLeak';
      const transDur = transition === 'cut' ? 0 : transition === 'memory' ? Math.min(1.6, dur * 0.4) : transition === 'lightLeak' ? Math.min(0.9, dur * 0.35) : Math.min(0.8, dur * 0.3);
      const photoIds = bl.layoutOrder ?? [photos[bl.p0].id];
      const role = roleFor?.(bl.p0);
      add({ start, dur, layout: bl.type === 'single' ? 'single' : bl.layout!, photoIds, effect: nextFx(lv), transition, transDur, role });
    }
  };

  layRegion(r.openEnd, r.kidsStart, mainA);
  // climax build: Abba with each child, equal slots, cuts getting closer
  if (kids.length) {
    // beats shared out with a gentle acceleration towards the peak (at least 2 beats each)
    let bt = beatsBetween(a.beats, r.kidsStart, r.heroStart);
    if (bt.length < kids.length + 1) bt = Array.from({ length: kids.length + 1 }, (_, i) => r.kidsStart + ((r.heroStart - r.kidsStart) * i) / kids.length);
    const B = bt.length - 1;
    const w = kids.map((_, i) => 1.25 - (i / Math.max(1, kids.length - 1)) * 0.45);
    const tw = w.reduce((x, y) => x + y, 0);
    const minB = Math.min(2, Math.floor(B / kids.length));
    const nb = w.map((x) => Math.max(minB, Math.floor((B * x) / tw)));
    for (let i = 0; nb.reduce((x, y) => x + y, 0) < B; i = (i + 1) % kids.length) nb[i]++;
    for (let i = kids.length - 1; nb.reduce((x, y) => x + y, 0) > B; i = (i + kids.length - 1) % kids.length) if (nb[i] > 1) nb[i]--;
    let bi = 0;
    kids.forEach((id, i) => {
      const t = bt[bi], e = bt[bi + nb[i]];
      bi += nb[i];
      add({ start: t, dur: e - t, layout: 'single', photoIds: [id], effect: i % 2 ? 'panLeft' : 'pushIn', transition: i === 0 ? 'lightLeak' : 'memory', transDur: Math.min(0.9, (e - t) * 0.35), role: 'child' });
    });
  } else if (clips.length) {
    clips[clips.length - 1].dur = r.heroStart - clips[clips.length - 1].start;
  }
  if (climax) add({ start: r.heroStart, dur: r.heroEnd - r.heroStart, layout: 'single', photoIds: [climax], effect: 'pushIn', transition: 'lightLeak', transDur: 1.0, role: 'hero' });
  layRegion(r.heroEnd, r.closingStart, afterIds);
  add({ start: r.closingStart, dur: r.end - r.closingStart, layout: 'single', photoIds: [closing], effect: 'zoomOut', transition: 'memory', transDur: 2.2, role: 'closing' });

  // remove zero-length clips and make sure clips tile the song exactly
  const out = clips.filter((c) => c.dur > 0.05).sort((x, y) => x.start - y.start);
  for (let i = 0; i < out.length; i++) {
    const nextStart = i + 1 < out.length ? out[i + 1].start : r.end;
    out[i].dur = nextStart - out[i].start;
  }
  if (out.length) { out[0].dur += out[0].start; out[0].start = 0; }
  // a transition never takes more than half of either neighbouring shot
  for (let i = 1; i < out.length; i++) {
    if (out[i].transition === 'cut') continue;
    const lim = 0.45 * Math.min(out[i].dur, out[i - 1].dur);
    if (out[i].transDur > lim) out[i].transDur = lim < 0.12 ? 0 : lim;
    if (out[i].transDur === 0) out[i].transition = 'cut';
  }
  matchLyrics(out, project.lyrics, byId);

  const captions = defaultCaptions(r);
  return { clips: out, captions, warnings };
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const pick = (id: string | null, order: string[], i: number) => (id && order.includes(id) ? id : order[i]);

/** When a lyric line names one of the kids or a moment, show a matching photo at that time. */
export function matchLyrics(clips: Clip[], lyrics: LyricLine[], byId: Map<string, Photo>) {
  const movable = (c: Clip) => c.layout === 'single' && !c.role;
  for (const line of lyrics) {
    if (line.start == null) continue;
    const t = line.start + 0.3;
    const want = CHILDREN.filter((c) => CHILD_ALIASES[c].some((al) => line.text.includes(al)));
    const moments = MOMENTS.filter((m) => MOMENT_KEYWORDS[m].some((k) => line.text.includes(k)));
    if (!want.length && !moments.length) continue;
    const i = clips.findIndex((c) => t >= c.start && t < c.start + c.dur);
    if (i < 0 || !movable(clips[i])) continue;
    const fits = (c: Clip) => {
      const p = byId.get(c.photoIds[0]);
      return !!p && (want.length ? want.some((w) => p.people.includes(w)) : moments.some((m) => p.moments.includes(m)));
    };
    if (fits(clips[i])) continue;
    let best = -1;
    for (let d = 1; d < 14 && best < 0; d++) {
      for (const j of [i + d, i - d]) if (j >= 0 && j < clips.length && movable(clips[j]) && fits(clips[j])) { best = j; break; }
    }
    if (best >= 0) [clips[i].photoIds, clips[best].photoIds] = [clips[best].photoIds, clips[i].photoIds];
  }
}

export function defaultCaptions(r: Regions): Caption[] {
  const c: Caption[] = [];
  const add = (text: string, start: number, dur: number, style: Caption['style']) => c.push({ id: uid(), text, start, dur, style });
  // opening lines between first light and the family photo
  const o0 = r.photoIn + 1.2, o1 = r.openMid - 0.4;
  const span = Math.max(6, o1 - o0);
  const w = [1, 1.35, 1.15], tw = w.reduce((x, y) => x + y, 0);
  let t = o0;
  const lines = ['אבא שלנו...', 'יש מתנות שאי אפשר לעטוף...', 'כי הן נמצאות בלב.'];
  lines.forEach((text, i) => {
    const d = (span * w[i]) / tw;
    add(text, t, d - 0.35, 'title');
    t += d;
  });
  add('אבא, אתה העולם שלנו.', r.heroStart + 0.5, Math.max(2.5, Math.min(5, r.heroEnd - r.heroStart - 0.6)), 'big');
  const cl = r.closingStart + 1.4;
  const remain = r.end - cl;
  const thanks = Math.min(8, remain * 0.42);
  add('יוסף שלנו,\nתודה על כל רגע,\nעל כל חיוך,\nעל כל חיבוק,\nועל האבא שאתה בשבילנו.', cl, thanks, 'lower');
  const hb = cl + thanks + 0.4;
  const tail = Math.max(3.5, r.end - hb - 1.2);
  add('יום הולדת שמח, אבא!', hb, tail, 'big');
  add('באהבה אינסופית,\nמשי, ליבי, הדר, שרי ויוני ❤️', hb + Math.min(2.2, tail * 0.3), tail - Math.min(2.2, tail * 0.3), 'signature');
  return c;
}
