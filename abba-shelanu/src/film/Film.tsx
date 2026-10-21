// The film. The same component plays in the editor (Remotion Player) and renders the MP4,
// so what you see in the preview is exactly what gets exported.

import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Img, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import '@fontsource/frank-ruhl-libre/300.css';
import '@fontsource/frank-ruhl-libre/400.css';
import '@fontsource/heebo/200.css';
import '@fontsource/heebo/300.css';
import type { Caption, Clip, FilmProps, Photo, Project } from '../shared/types';
import { frameAt, planShot } from '../shared/framing';
import { cellsFor } from '../shared/layouts';
import { regions } from '../shared/storyboard';

const SERIF = '"Frank Ruhl Libre", "David", serif';
const SANS = '"Heebo", "Arial", sans-serif';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => { const x = clamp01(v); return x * x * (3 - 2 * x); };
const ramp = (t: number, a: number, b: number) => (b <= a ? (t >= a ? 1 : 0) : smooth((t - a) / (b - a)));

const SOFT: Clip['transition'][] = ['crossfade', 'memory', 'lightLeak'];

export type Span = { inStart: number; outEnd: number };
export function clipSpans(clips: Clip[], duration: number): Span[] {
  return clips.map((c, i) => {
    const next = clips[i + 1];
    const inStart = SOFT.includes(c.transition) && i > 0 ? c.start - c.transDur / 2 : c.start;
    const outEnd = next && SOFT.includes(next.transition) ? c.start + c.dur + next.transDur / 2 : c.start + c.dur;
    return { inStart: Math.max(0, inStart), outEnd: Math.min(duration, outEnd) };
  });
}

const mediaUrl = (base: string, project: Project, kind: 'thumb' | 'preview' | 'master' | 'bg', id: string) =>
  `${base}/media/${project.id}/${kind}/${id}.jpg`;

export const Film: React.FC<FilmProps> = ({ project, mediaBase, quality }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const t = frame / fps;
  const a = project.audio?.analysis;
  const duration = a?.duration ?? durationInFrames / fps;
  const clips = useMemo(() => [...project.clips].sort((x, y) => x.start - y.start), [project.clips]);
  const spans = useMemo(() => clipSpans(clips, duration), [clips, duration]);
  const byId = useMemo(() => new Map(project.photos.map((p) => [p.id, p])), [project.photos]);
  const r = useMemo(() => (a ? regions(a) : null), [a]);
  const s = project.settings;

  // final fade to black over the last seconds, and the very first light
  const fadeOut = 1 - ramp(t, duration - 3.2, duration - 0.15);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {project.audio && <Audio src={`${mediaBase}/media/${project.id}/audio/${project.audio.file}`} />}
      {clips.map((c, i) => {
        const sp = spans[i];
        const from = Math.round(sp.inStart * fps);
        const len = Math.max(1, Math.round(sp.outEnd * fps) - from);
        return (
          <Sequence key={c.id} from={from} durationInFrames={len} premountFor={Math.round(fps * 1.5)}>
            <ClipView clip={c} span={sp} next={clips[i + 1]} index={i} byId={byId} project={project} mediaBase={mediaBase} quality={quality} photoIn={r?.photoIn ?? 0.5} />
          </Sequence>
        );
      })}
      <Grade warmth={s.warmth} />
      {s.lightLeaks && <LightLeaks clips={clips} t={t} photoIn={r?.photoIn ?? 0.5} />}
      {s.vignette && <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 48%, rgba(0,0,0,0) 55%, rgba(8,4,0,0.5) 100%)' }} />}
      {s.grain > 0 && <Grain amount={s.grain} frame={frame} />}
      <AbsoluteFill style={{ background: '#000', opacity: 1 - fadeOut }} />
      <Captions captions={project.captions} t={t} />
      {s.showLyrics && <Lyrics project={project} t={t} />}
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------------------- one clip

const ClipView: React.FC<{
  clip: Clip; span: Span; next?: Clip; index: number; byId: Map<string, Photo>; project: Project;
  mediaBase: string; quality: FilmProps['quality']; photoIn: number;
}> = ({ clip, span, next, index, byId, project, mediaBase, quality, photoIn }) => {
  const { fps, width: W, height: H } = useVideoConfig();
  const frame = useCurrentFrame(); // relative to the Sequence
  const t = span.inStart + frame / fps;
  const p = (t - span.inStart) / Math.max(0.01, span.outEnd - span.inStart);

  // incoming transition
  let opacity = 1, blur = 0, glow = 0;
  const T = clip.transDur;
  if (index === 0 && clip.transition === 'dipBlack') {
    opacity = ramp(t, photoIn - 0.2, photoIn + Math.max(1.2, T));
  } else if (clip.transition === 'dipBlack') {
    opacity = ramp(t, clip.start, clip.start + T / 2);
  } else if (SOFT.includes(clip.transition) && index > 0) {
    const k = ramp(t, clip.start - T / 2, clip.start + T / 2);
    opacity = k;
    if (clip.transition === 'memory') { blur = (1 - k) * 10; glow = (1 - k) * 0.18; }
  }
  // outgoing dip to black
  if (next?.transition === 'dipBlack') opacity *= 1 - ramp(t, next.start - next.transDur / 2, next.start);

  const cells = cellsFor(clip.layout, W, H, project.settings.format);
  const photos = clip.photoIds.map((id) => byId.get(id)).filter(Boolean) as Photo[];
  const collage = clip.layout !== 'single';
  const src = (kind: 'preview' | 'master' | 'bg', id: string) => mediaUrl(mediaBase, project, kind, id);

  return (
    <AbsoluteFill style={{ opacity, filter: blur > 0.2 ? `blur(${blur.toFixed(2)}px) brightness(${1 + glow})` : undefined }}>
      {collage && (
        <AbsoluteFill style={{ background: '#15100b' }}>
          {photos[0] && <Img src={src('bg', photos[0].id)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55, transform: `scale(${1.1 + p * 0.06})` }} />}
        </AbsoluteFill>
      )}
      {photos.map((ph, k) => {
        const cell = cells[k] ?? cells[0];
        const delay = collage ? k * 0.22 : 0;
        const cellIn = collage ? ramp(t, span.inStart + delay, span.inStart + delay + 0.7) : 1;
        // collage cells drift in slightly different directions, a calm sense of depth
        const fx = collage ? (['zoomIn', 'panLeft', 'zoomOut'] as const)[k % 3] : clip.effect;
        return (
          <div key={ph.id + k} style={{
            position: 'absolute', left: cell.x, top: cell.y, width: cell.w, height: cell.h, overflow: 'hidden',
            opacity: cellIn, transform: collage ? `translateY(${(1 - cellIn) * 14}px)` : undefined,
            boxShadow: collage ? '0 18px 50px rgba(0,0,0,0.45)' : undefined, borderRadius: collage ? 3 : 0,
          }}>
            <Shot photo={ph} w={cell.w} h={cell.h} effect={fx} p={p} maxLoss={collage ? 0.42 : 0.3} src={src} quality={quality} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Shot: React.FC<{
  photo: Photo; w: number; h: number; effect: Clip['effect']; p: number; maxLoss: number;
  src: (kind: 'preview' | 'master' | 'bg', id: string) => string; quality: FilmProps['quality'];
}> = ({ photo, w, h, effect, p, maxLoss, src, quality }) => {
  const plan = useMemo(() => planShot(photo, w, h, effect, maxLoss), [photo, w, h, effect, maxLoss]);
  const ar = photo.w / photo.h;
  const f = frameAt(plan, ar, w, h, p);
  const main = src(quality === 'master' ? 'master' : 'preview', photo.id);
  if (f.mode === 'contain') {
    // parallax: the blurred backdrop drifts one way, the sharp photo the other - real layers, no invented pixels
    const dir = photo.id.charCodeAt(0) % 2 ? 1 : -1;
    const bgScale = 1.18 + p * 0.1, bgX = dir * (p - 0.5) * w * 0.035;
    const fgX = -dir * (p - 0.5) * w * 0.012;
    return (
      <>
        <Img src={src('bg', photo.id)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${bgX}px) scale(${bgScale})` }} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: f.w, height: f.h, transform: `translate3d(${f.left + fgX}px, ${f.top}px, 0)`, boxShadow: '0 30px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,240,220,0.06)' }}>
          <Img src={main} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      </>
    );
  }
  const z = f.w / Math.max(w, h * ar);
  const bw = f.w / z;
  return (
    <Img src={main} style={{ position: 'absolute', left: 0, top: 0, width: bw, height: bw / ar, transformOrigin: '0 0', transform: `translate3d(${f.left}px, ${f.top}px, 0) scale(${z})` }} />
  );
};

// ----------------------------------------------------------------------------- look

const Grade: React.FC<{ warmth: number }> = ({ warmth }) => (
  <>
    <AbsoluteFill style={{ background: `rgba(255, 186, 110, ${0.16 * warmth})`, mixBlendMode: 'soft-light' }} />
    <AbsoluteFill style={{ background: `rgba(60, 38, 18, ${0.07 * warmth})`, mixBlendMode: 'screen' }} />
  </>
);

const LightLeaks: React.FC<{ clips: Clip[]; t: number; photoIn: number }> = ({ clips, t, photoIn }) => {
  const { width: W, height: H } = useVideoConfig();
  const leaks: { at: number; len: number; seed: number; strength: number }[] = [{ at: photoIn + 0.6, len: 4.5, seed: 3, strength: 0.55 }];
  clips.forEach((c, i) => {
    if (c.transition === 'lightLeak') leaks.push({ at: c.start, len: Math.max(1.1, c.transDur * 2.2), seed: i, strength: c.role === 'hero' ? 1 : 0.75 });
  });
  const active = leaks.filter((l) => t > l.at - l.len / 2 && t < l.at + l.len / 2);
  if (!active.length) return null;
  return (
    <>
      {active.map((l) => {
        const u = (t - (l.at - l.len / 2)) / l.len; // 0..1
        const env = Math.sin(Math.PI * clamp01(u));
        const side = l.seed % 2 ? 1 : -1;
        const x = 50 + side * (35 - u * 55), y = 30 + ((l.seed * 37) % 40);
        return (
          <AbsoluteFill key={l.at} style={{
            mixBlendMode: 'screen', opacity: env * env * l.strength,
            background: `radial-gradient(ellipse ${W * 0.55}px ${H * 0.75}px at ${x}% ${y}%, rgba(255,170,80,0.85), rgba(255,120,40,0.35) 40%, rgba(0,0,0,0) 70%),
                         radial-gradient(ellipse ${W * 0.3}px ${H * 0.5}px at ${100 - x}% ${100 - y}%, rgba(255,226,170,0.5), rgba(0,0,0,0) 70%)`,
          }} />
        );
      })}
    </>
  );
};

let grainTiles: string[] | null = null;
function makeGrain(): string[] {
  if (grainTiles) return grainTiles;
  if (typeof document === 'undefined') return [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  grainTiles = [0, 1, 2, 3].map(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 95;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  });
  return grainTiles;
}

const Grain: React.FC<{ amount: number; frame: number }> = ({ amount, frame }) => {
  const { height, width } = useVideoConfig();
  const tiles = makeGrain();
  if (!tiles.length) return null;
  // soft, slightly enlarged grain: reads as film, not as digital noise (and keeps the MP4 a sane size)
  const size = Math.round(256 * 1.7 * (Math.min(width, height) / 1080));
  const k = Math.floor(frame / 2);
  return (
    <AbsoluteFill style={{
      backgroundImage: `url(${tiles[k % tiles.length]})`, backgroundSize: `${size}px ${size}px`,
      backgroundPosition: `${(k * 73) % size}px ${(k * 151) % size}px`,
      mixBlendMode: 'overlay', opacity: 0.09 * amount, pointerEvents: 'none',
    }} />
  );
};

// ----------------------------------------------------------------------------- words

const Heart: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: '-0.12em', margin: '0 0.18em' }}>
    <path d="M12 21s-7.5-4.6-10-9.3C0.3 8.4 2.2 4.5 6 4.5c2.2 0 3.6 1.2 6 3.6 2.4-2.4 3.8-3.6 6-3.6 3.8 0 5.7 3.9 4 7.2C19.5 16.4 12 21 12 21z" fill="#c8323c" />
  </svg>
);

const withHearts = (line: string, size: number) =>
  line.split(/(❤️|❤)/u).map((part, i) => (part === '❤️' || part === '❤' ? <Heart key={i} size={size} /> : <React.Fragment key={i}>{part}</React.Fragment>));

export const Captions: React.FC<{ captions: Caption[]; t: number }> = ({ captions, t }) => {
  const { width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080; // type scale
  const portrait = H > W;
  const active = captions.filter((c) => t >= c.start - 0.1 && t <= c.start + c.dur + 1.2);
  if (!active.length) return null;
  const hasSignature = active.some((c) => c.style === 'signature' && t >= c.start - 0.1);
  return (
    <>
      {active.map((c) => {
        const inK = ramp(t, c.start, c.start + 1.1);
        const outK = 1 - ramp(t, c.start + c.dur, c.start + c.dur + 1.0);
        const k = inK * outK;
        if (k <= 0.001) return null;
        const lines = c.text.split('\n');
        const base: React.CSSProperties = {
          position: 'absolute', left: '7%', right: '7%', textAlign: 'center', direction: 'rtl', unicodeBidi: 'plaintext',
          color: '#f7eedd', textShadow: '0 2px 18px rgba(0,0,0,0.65), 0 0 2px rgba(0,0,0,0.4)',
          opacity: k, filter: inK < 1 ? `blur(${((1 - inK) * 6).toFixed(2)}px)` : undefined,
        };
        if (c.style === 'title' || c.style === 'lower') {
          const size = (c.style === 'title' ? 66 : 54) * u * (portrait ? 1.05 : 1);
          const perLine = (c.dur * 0.55) / Math.max(1, lines.length);
          return (
            <React.Fragment key={c.id}>
              <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(10,6,2,0.62), rgba(10,6,2,0.0) 48%)', opacity: k }} />
              <div style={{ ...base, bottom: portrait ? '14%' : '11%', fontFamily: SERIF, fontWeight: 300, fontSize: size, lineHeight: 1.38, letterSpacing: '0.01em', transform: `translateY(${(1 - inK) * 10 * u}px)` }}>
                {lines.map((line, i) => {
                  const lk = c.style === 'lower' ? ramp(t, c.start + i * perLine, c.start + i * perLine + 0.9) : 1;
                  return <div key={i} style={{ opacity: lk, filter: lk < 1 ? `blur(${((1 - lk) * 5).toFixed(2)}px)` : undefined }}>{withHearts(line, size * 0.8)}</div>;
                })}
              </div>
            </React.Fragment>
          );
        }
        if (c.style === 'big') {
          const size = 96 * u * (portrait ? 0.95 : 1);
          return (
            <React.Fragment key={c.id}>
              <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 45% at 50% 50%, rgba(8,5,2,0.6), rgba(8,5,2,0) 75%)', opacity: k }} />
              <div style={{ ...base, top: hasSignature ? (portrait ? '36%' : '33%') : '43%', fontFamily: SERIF, fontWeight: 400, fontSize: size, lineHeight: 1.25, color: '#f6e6c2', letterSpacing: `${0.02 + (1 - inK) * 0.04}em` }}>
                {lines.map((line, i) => <div key={i}>{withHearts(line, size * 0.75)}</div>)}
              </div>
            </React.Fragment>
          );
        }
        // signature
        const size = 46 * u;
        return (
          <div key={c.id} style={{ ...base, top: portrait ? '52%' : '55%', fontFamily: SANS, fontWeight: 300, fontSize: size, lineHeight: 1.6, letterSpacing: '0.04em', color: '#efe2c8' }}>
            {lines.map((line, i) => <div key={i} style={{ fontSize: i === 0 ? size * 0.82 : size, opacity: i === 0 ? 0.85 : 1 }}>{withHearts(line, size * 0.9)}</div>)}
          </div>
        );
      })}
    </>
  );
};

const Lyrics: React.FC<{ project: Project; t: number }> = ({ project, t }) => {
  const { width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const timed = project.lyrics.filter((l) => l.start != null && l.text.trim()).sort((x, y) => x.start! - y.start!);
  const i = timed.findIndex((l, k) => t >= l.start! && t < (l.end ?? timed[k + 1]?.start ?? l.start! + 4));
  if (i < 0) return null;
  const l = timed[i];
  // never on top of a caption
  if (project.captions.some((c) => t >= c.start - 0.3 && t <= c.start + c.dur + 0.8)) return null;
  const end = l.end ?? timed[i + 1]?.start ?? l.start! + 4;
  const k = ramp(t, l.start!, l.start! + 0.35) * (1 - ramp(t, end - 0.3, end));
  return (
    <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: H > W ? '8%' : '6%', textAlign: 'center', direction: 'rtl', fontFamily: SANS, fontWeight: 300, fontSize: 38 * u, color: '#f4ead8', opacity: k * 0.92, textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
      {l.text}
    </div>
  );
};
