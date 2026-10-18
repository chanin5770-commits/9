import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, random, staticFile, useCurrentFrame } from 'remotion';
import { Frame } from '../components/Shot';
import { COLORS } from '../config';
import { SANS, SERIF } from '../components/text';
import clipFrames from '../data/clip-frames.json';
import { PILOT_SHOTS, PILOT_TAIL, PILOT_VO, PilotShot, VO_WPS } from './pilot-data';

export const PFPS = 24;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// ---- פריסה ----
const lenOf = (s: PilotShot) => (s.kind === 'clip' ? (clipFrames as Record<string, number>)[s.src!] - 1 : Math.round(s.sec! * PFPS));
export const PILOT_LAYOUT = (() => {
  let t = 0;
  return PILOT_SHOTS.map((s, i) => {
    const fade = i === 0 ? 0 : s.fade ?? 0;
    t -= fade;
    const placed = { shot: s, from: t, dur: lenOf(s), fade };
    t += placed.dur;
    return placed;
  });
})();
const last = PILOT_LAYOUT[PILOT_LAYOUT.length - 1];
export const PILOT_FRAMES = last.from + last.dur + Math.round(PILOT_TAIL * PFPS);

// קול פנימי: זמן התחלה מהשוט המעוגן, אורך משוער לפי מספר המילים
export const PILOT_CUES = PILOT_VO.map((v) => {
  const p = PILOT_LAYOUT.find((x) => x.shot.id === v.shot)!;
  const start = p.from / PFPS + v.at;
  const words = v.text.split(/\s+/).filter((w) => /[א-ת]/.test(w)).length;
  return { ...v, start, end: start + words / VO_WPS + 0.3 };
});

// ---- שוט ----
const ShotLayer: React.FC<{ s: PilotShot; dur: number; fade: number }> = ({ s, dur, fade }) => {
  const f = useCurrentFrame();
  const p = Math.min(1, f / Math.max(1, dur - 1));
  const opacity = fade ? interpolate(f, [0, fade], [0, 1], clamp) : 1;
  return (
    <AbsoluteFill style={{ opacity, background: '#000' }}>
      {s.kind === 'clip' ? <Frame src={s.src!} kind="clip" p={p} move="hold" focus={[0.5, 0.45]} /> : null}
      {s.kind === 'still' ? <Frame src={s.src!} kind="still" p={p} move={s.move ?? 'in'} /> : null}
      {s.kind === 'card' ? (
        <>
          <Frame src={s.src!} kind="still" p={p} move="hold" blur={26} />
          <AbsoluteFill style={{ background: 'rgba(4,7,13,.55)' }} />
        </>
      ) : null}
      {s.light === 'split' ? (
        <AbsoluteFill style={{
          mixBlendMode: 'soft-light',
          opacity: interpolate(f, [30, 70], [0, 0.85], clamp),
          background: 'linear-gradient(to left, rgba(255,190,100,.75) 0%, rgba(255,190,100,0) 48%, rgba(80,130,230,0) 52%, rgba(80,130,230,.75) 100%)',
        }} />
      ) : null}
      {s.missing ? <MissingBadge code={s.missing.code} what={s.missing.what} card={s.kind === 'card'} /> : null}
      {s.onScreen ? <OnScreen o={s.onScreen} f={f} /> : null}
    </AbsoluteFill>
  );
};

// סימון ״קליף חסר״: בפינה על פריים זמני, ובמרכז על כרטיס תיאור
const MissingBadge: React.FC<{ code: string; what: string; card: boolean }> = ({ code, what, card }) =>
  card ? (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', direction: 'rtl' }}>
      <div style={{ textAlign: 'center', padding: '26px 40px', border: `2px dashed ${COLORS.verify}`, borderRadius: 18, background: 'rgba(4,7,13,.55)', maxWidth: 1300 }}>
        <div style={{ fontFamily: SANS, fontSize: 30, fontWeight: 500, color: COLORS.verify, letterSpacing: 2 }}>קליפ חסר {code}</div>
        <div style={{ fontFamily: SERIF, fontSize: 52, color: COLORS.text, marginTop: 8 }}>{what}</div>
      </div>
    </AbsoluteFill>
  ) : (
    <div style={{ position: 'absolute', top: 30, left: 36, direction: 'rtl', fontFamily: SANS, fontSize: 24, fontWeight: 500, color: '#111', background: COLORS.verify, borderRadius: 8, padding: '6px 14px' }}>
      קליפ חסר {code} · {what} (פריים זמני)
    </div>
  );

// טקסט קצר וגדול שעולה תוך כדי התנועה — בלי לעצור את הסיפור
const OnScreen: React.FC<{ o: NonNullable<PilotShot['onScreen']>; f: number }> = ({ o, f }) => {
  const a = o.at * PFPS, b = (o.at + o.dur) * PFPS;
  const op = interpolate(f, [a, a + 12, b - 12, b], [0, 1, 1, 0], clamp);
  if (op <= 0) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', direction: 'rtl' }}>
      <div style={{ opacity: op, transform: `translateY(${interpolate(f, [a, a + 18], [12, 0], clamp)}px)`, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontSize: 96, fontWeight: 500, color: COLORS.goldSoft, textShadow: '0 3px 26px rgba(0,0,0,.9)' }}>{o.text}</div>
        {o.sub ? <div style={{ fontFamily: SANS, fontSize: 32, color: COLORS.muted, marginTop: 8, textShadow: '0 2px 8px #000' }}>{o.sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

// ---- הקול הפנימי (זמני, עד שתגיע ההקלטה) ----
const InnerVoice: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / PFPS;
  const cue = PILOT_CUES.find((c) => t >= c.start && t <= c.end);
  if (!cue) return null;
  const op = Math.min(1, (t - cue.start) / 0.15, (cue.end - t) / 0.15);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 80 }}>
      <div style={{ opacity: op, direction: 'rtl', textAlign: 'center', maxWidth: 1500, fontFamily: SERIF, fontSize: 54, fontWeight: 500, lineHeight: 1.3, color: COLORS.cream, textShadow: '0 2px 14px rgba(0,0,0,.95), 0 0 2px #000' }}>
        {cue.text}
      </div>
    </AbsoluteFill>
  );
};

// ---- צבע: מכחול של שחר לאור בוקר ----
const Grade: React.FC = () => {
  const f = useCurrentFrame();
  const k = f / PILOT_FRAMES;
  const cool = interpolate(k, [0, 0.35, 1], [0.7, 0.25, 0], clamp);
  const warm = interpolate(k, [0, 0.6, 1], [0, 0.1, 0.35], clamp);
  return (
    <>
      <AbsoluteFill style={{ background: `rgba(24,56,120,${0.3 * cool})`, mixBlendMode: 'soft-light' }} />
      <AbsoluteFill style={{ background: `rgba(255,170,80,${0.22 * warm})`, mixBlendMode: 'soft-light' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 75% at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,.5) 100%)' }} />
      <AbsoluteFill style={{ backgroundImage: `url(${staticFile('fx/grain.png')})`, backgroundPosition: `${Math.floor(random(`x${f}`) * 512)}px ${Math.floor(random(`y${f}`) * 512)}px`, mixBlendMode: 'overlay', opacity: 0.08 }} />
    </>
  );
};

const PilotSound: React.FC = () => {
  const speaking = (f: number) => PILOT_CUES.some((c) => f / PFPS > c.start - 0.3 && f / PFPS < c.end + 0.4);
  return (
    <>
      {/* מוזיקה שקטה מאוד — הקול והצלילים של המקום מובילים */}
      <Audio src={staticFile('audio/score-draft.wav')} volume={(f) => Math.min(1, f / 48, (PILOT_FRAMES - f) / 60) * (speaking(f) ? 0.08 : 0.16)} />
      {PILOT_LAYOUT.map((p, i) => (
        <React.Fragment key={i}>
          {p.shot.amb ? (
            <Sequence from={p.from} durationInFrames={p.dur} layout="none">
              <Audio src={staticFile(`sfx/${p.shot.amb.id}.wav`)} loop volume={(f) => p.shot.amb!.vol * interpolate(f, [0, 10, p.dur - 10, p.dur], [0, 1, 1, 0], clamp)} />
            </Sequence>
          ) : null}
          {(p.shot.sfx ?? []).map((x, k) => (
            <Sequence key={k} from={p.from + Math.round((x.at ?? 0) * PFPS)} durationInFrames={5 * PFPS} layout="none">
              <Audio src={staticFile(`sfx/${x.id}.wav`)} volume={x.vol ?? 0.5} />
            </Sequence>
          ))}
        </React.Fragment>
      ))}
    </>
  );
};

export const Pilot: React.FC = () => {
  const f = useCurrentFrame();
  const endFade = interpolate(f, [last.from + last.dur - 30, last.from + last.dur], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ opacity: endFade }}>
        {PILOT_LAYOUT.map((p, i) => (
          <Sequence key={i} from={p.from} durationInFrames={p.dur} layout="none">
            <ShotLayer s={p.shot} dur={p.dur} fade={p.fade} />
          </Sequence>
        ))}
        <Grade />
      </AbsoluteFill>
      <InnerVoice />
      <div style={{ position: 'absolute', bottom: 16, left: 24, fontFamily: SANS, fontSize: 20, color: 'rgba(170,180,196,.8)', direction: 'rtl' }}>
        קטע ניסיון · טקסט זמני לקול הפנימי · {Math.floor(f / PFPS / 60)}:{String(Math.floor((f / PFPS) % 60)).padStart(2, '0')}
      </div>
      <PilotSound />
    </AbsoluteFill>
  );
};
