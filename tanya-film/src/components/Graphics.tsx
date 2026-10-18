// הגרפיקות של הסרט — התרשימים מהמצגת, בנויים מחדש כגרפיקה נקייה שנחשפת בהדרגה.
// אין כאן דמויות אנושיות שמייצגות נפשות, ואין ייצוג גופני לקב״ה: רק אור, צורות וטקסט.
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile } from 'remotion';
import { COLORS, HEIGHT, WIDTH } from '../config';
import { GATES, GateShot, GraphicShot, SCENES, Text } from '../data/scenes';
import { Frame } from './Shot';
import { appear, LineSequence, SANS, SERIF } from './text';
import { graphicIntro } from '../lib/reading';
import { useCaptions } from '../lib/mode';
import { HAS_NARRATION } from '../data/narration';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const fadeIn = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], clamp);

// רקע: הפריים של הסצנה, מטושטש ומוחשך — כדי שהגרפיקה תישאר בתוך הסרט ולא תיראה כמו שקופית
const Bg: React.FC<{ src?: string; f: number; dur: number; blur?: number; dim?: number }> = ({ src, f, dur, blur = 18, dim = 0.62 }) => (
  <AbsoluteFill>
    {src ? <Frame src={src} kind="still" p={f / dur} move="in" blur={blur} /> : null}
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 75% at 50% 45%, rgba(6,10,20,${dim - 0.15}), rgba(4,7,13,${dim + 0.25}))` }} />
  </AbsoluteFill>
);

// ---- צמתים ותרשימים ----
const Node: React.FC<{ x: number; y: number; title: string; sub?: string; on: number; hi?: boolean; tint?: string; w?: number }> = ({ x, y, title, sub, on, hi, tint = COLORS.gold, w = 340 }) => (
  <div
    style={{
      position: 'absolute', left: x - w / 2, top: y - 85, width: w, height: 170, opacity: on,
      transform: `scale(${0.92 + 0.08 * on})`, borderRadius: 22, direction: 'rtl',
      border: `2px solid ${tint}`, background: hi ? 'rgba(217,179,106,.16)' : 'rgba(8,12,22,.55)',
      boxShadow: hi ? `0 0 40px ${tint}66` : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}
  >
    <div style={{ fontFamily: SERIF, fontSize: 58, fontWeight: 500, color: hi ? COLORS.goldSoft : COLORS.text }}>{title}</div>
    {sub ? <div style={{ fontFamily: SANS, fontSize: 30, color: COLORS.muted, marginTop: 4 }}>{sub}</div> : null}
  </div>
);

// חץ אופקי (מימין לשמאל — כיוון הקריאה)
const ArrowL: React.FC<{ x1: number; x2: number; y: number; on: number; color?: string }> = ({ x1, x2, y, on, color = COLORS.gold }) => (
  <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
    <line x1={x1} y1={y} x2={x1 + (x2 - x1) * on} y2={y} stroke={color} strokeWidth={4} strokeLinecap="round" />
    {on > 0.95 ? <path d={`M${x2 + 16},${y - 13} L${x2},${y} L${x2 + 16},${y + 13}`} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" /> : null}
  </svg>
);

const Mechanism: React.FC<{ f: number; dur: number; stage: number }> = ({ f, dur, stage }) => {
  const nodes = [
    { title: 'מוח', sub: 'חכמה · בינה · דעת' },
    { title: 'לב', sub: 'אהבה ויראה' },
    { title: 'לבושים', sub: 'מחשבה · דיבור · מעשה' },
    { title: 'תורה', sub: 'איחוד עם חכמת ה׳' },
  ];
  const xs = [1590, 1150, 710, 270];
  const shown = stage + 1; // שלב 1: מוח+לב; 2: +לבושים; 3: +תורה
  const y = 360;
  return (
    <>
      {nodes.slice(0, shown).map((n, i) => {
        const isNew = stage === 1 ? true : i === shown - 1;
        const start = isNew ? (stage === 1 ? 10 + i * 30 : 20) : 0;
        const on = isNew ? fadeIn(f, start, start + 20) : 0.55;
        return <Node key={i} x={xs[i]} y={y} title={n.title} sub={n.sub} on={on} hi={isNew} />;
      })}
      {nodes.slice(1, shown).map((_, i) => {
        const isNew = stage === 1 || i + 1 === shown - 1;
        const start = stage === 1 ? 30 : 10;
        return <ArrowL key={i} x1={xs[i] - 180} x2={xs[i + 1] + 185} y={y} on={isNew ? fadeIn(f, start, start + 20) : 1} />;
      })}
      <div style={{ position: 'absolute', top: 120, width: '100%', textAlign: 'center', fontFamily: SANS, fontSize: 30, letterSpacing: 4, color: COLORS.gold, opacity: fadeIn(f, 0, 20) }}>
        המנגנון של הנפש האלוקית
      </div>
    </>
  );
};

const Mirror: React.FC<{ f: number }> = ({ f }) => {
  const labels = [{ title: 'שכל' }, { title: 'מידות' }, { title: 'לבושים' }];
  const xs = [1340, 960, 580];
  return (
    <>
      {[0, 1].map((row) => {
        const y = row === 0 ? 260 : 560;
        const tint = row === 0 ? COLORS.gold : COLORS.blue;
        const base = row === 0 ? 0 : 50;
        return (
          <React.Fragment key={row}>
            <div style={{ position: 'absolute', right: 110, top: y - 24, fontFamily: SERIF, fontSize: 44, color: tint, opacity: fadeIn(f, base, base + 20), direction: 'rtl' }}>
              {row === 0 ? 'נפש אלוקית' : 'נפש בהמית'}
            </div>
            {labels.map((l, i) => (
              <Node key={i} x={xs[i]} y={y} title={l.title} on={fadeIn(f, base + 8 + i * 10, base + 26 + i * 10)} tint={tint} w={300} hi={row === 1} />
            ))}
            {[0, 1].map((i) => (
              <ArrowL key={i} x1={xs[i] - 160} x2={xs[i + 1] + 165} y={y} on={fadeIn(f, base + 20 + i * 10, base + 40 + i * 10)} color={tint} />
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
};

const Prism: React.FC<{ f: number; stage: number }> = ({ f, stage }) => {
  const up = stage === 1 ? fadeIn(f, 30, 90) : 1;
  const down = stage === 2 ? fadeIn(f, 20, 50) : 0;
  const particles = Array.from({ length: 14 }, (_, i) => {
    const ph = ((f * 1.6 + i * 23) % 140) / 140;
    return { x: 960 + ((i * 37) % 120) - 60, y: 330 - ph * 110, o: (1 - ph) * up };
  });
  return (
    <>
      <Node x={960} y={215} title="קדושה" on={fadeIn(f, 0, 20)} hi />
      <Node x={960} y={430} title="העולם" sub="קליפת נוגה — מותר" on={fadeIn(f, 10, 30)} tint={COLORS.goldSoft} w={420} />
      <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0 }}>
        {particles.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill={COLORS.goldSoft} opacity={p.o} />)}
      </svg>
      {stage === 2 ? (
        <>
          <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0, opacity: down }}>
            <line x1={700} y1={540} x2={1220} y2={540} stroke="#b2454a" strokeWidth={5} strokeDasharray="14 10" />
          </svg>
          <div style={{ position: 'absolute', left: 1250, top: 518, fontFamily: SANS, fontSize: 32, color: '#f0a0a0', opacity: down, direction: 'rtl' }}>אין עלייה דרך השימוש</div>
          <Node x={960} y={640} title="שלוש הקליפות הטמאות" sub="אסור" on={down} tint="#b2454a" w={620} />
        </>
      ) : null}
    </>
  );
};

const City: React.FC<{ f: number }> = ({ f }) => {
  const pulse = 0.5 + 0.5 * Math.sin(f / 6);
  const chamber = (x: number, label: string, sub: string, tint: string, on: number) => (
    <div style={{ position: 'absolute', left: x - 190, top: 365, width: 380, height: 180, borderRadius: x > 960 ? '40px 120px 120px 40px' : '120px 40px 40px 120px', border: `2px solid ${tint}`, background: `${tint}22`, opacity: on, direction: 'rtl', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: SERIF, fontSize: 46, color: COLORS.text }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 30, color: tint }}>{sub}</div>
    </div>
  );
  const gates = ['מחשבה', 'דיבור', 'מעשה'];
  return (
    <>
      <div style={{ position: 'absolute', top: 115, width: '100%', textAlign: 'center', fontFamily: SANS, fontSize: 30, letterSpacing: 4, color: COLORS.gold, opacity: fadeIn(f, 0, 20) }}>
        המאבק על ״העיר הקטנה״ — הגוף
      </div>
      <Node x={1150} y={250} title="מוח" sub="משכן הנפש האלוקית" on={fadeIn(f, 6, 26)} hi w={400} />
      {chamber(1150, 'חלל ימני', 'נפש אלוקית', COLORS.gold, fadeIn(f, 20, 40))}
      {chamber(770, 'חלל שמאלי', 'נפש בהמית', COLORS.blue, fadeIn(f, 34, 54))}
      {gates.map((g, i) => {
        const x = 1250 - i * 300;
        const on = fadeIn(f, 60 + i * 8, 80 + i * 8);
        return (
          <div key={g} style={{ position: 'absolute', left: x - 120, top: 590, width: 240, height: 86, borderRadius: 16, border: `2px solid ${COLORS.goldSoft}`, opacity: on, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontSize: 44, color: COLORS.text, boxShadow: `0 0 ${18 * pulse}px rgba(236,211,156,.35)` }}>
            {g}
          </div>
        );
      })}
    </>
  );
};

const Table: React.FC<{ f: number; stage: number }> = ({ f, stage }) => {
  const rows = [
    { who: 'צדיק', heart: 'הרע נהפך לטוב, או בטל', act: 'טוב', good: [true, true] },
    { who: 'רשע', heart: 'הרע קיים בלב', act: 'הרע מתלבש בפועל', good: [false, false] },
    { who: 'בינוני', heart: 'הרע עדיין קיים', act: 'הרע אינו שולט — טוב', good: [false, true] },
  ];
  const X0 = 260, W = 1400, colW = [300, 550, 550], top = 110, rowH = 128;
  const colX = (c: number) => X0 + W - colW.slice(0, c + 1).reduce((a, b) => a + b, 0); // RTL
  const cell = (c: number, y: number, h: number, content: React.ReactNode, style: React.CSSProperties = {}) => (
    <div style={{ position: 'absolute', left: colX(c), top: y, width: colW[c], height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl', ...style }}>{content}</div>
  );
  return (
    <>
      {cell(1, top, 80, <span style={{ fontFamily: SANS, fontSize: 36, color: COLORS.gold }}>מה קורה בלב?</span>)}
      {cell(2, top, 80, <span style={{ fontFamily: SANS, fontSize: 36, color: COLORS.gold }}>מה קורה במעשה?</span>)}
      {rows.map((r, i) => {
        const y = top + 90 + i * (rowH + 14);
        const isNew = i === stage - 1;
        const on = i < stage - 1 ? 0.5 : isNew ? fadeIn(f, 16, 40) : 0;
        const hi = isNew && stage === 3;
        return (
          <div key={r.who} style={{ opacity: on }}>
            <div style={{ position: 'absolute', left: X0, top: y, width: W, height: rowH, borderRadius: 18, border: `2px solid ${hi ? COLORS.gold : 'rgba(170,180,196,.35)'}`, background: hi ? 'rgba(217,179,106,.12)' : 'rgba(8,12,22,.5)', boxShadow: hi ? '0 0 50px rgba(217,179,106,.45)' : 'none' }} />
            {cell(0, y, rowH, <span style={{ fontFamily: SERIF, fontSize: 56, fontWeight: 500, color: hi ? COLORS.goldSoft : COLORS.text }}>{r.who}</span>)}
            {[r.heart, r.act].map((txt, k) =>
              cell(k + 1, y, rowH, (
                <span style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: SANS, fontSize: 36, color: COLORS.text }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: r.good[k] ? COLORS.gold : '#6b3b46', boxShadow: r.good[k] ? '0 0 14px rgba(217,179,106,.8)' : 'none' }} />
                  {txt}
                </span>
              )),
            )}
          </div>
        );
      })}
    </>
  );
};

const Columns: React.FC<{ f: number }> = ({ f }) => {
  const w = 620, h = 300, y0 = 180;
  const graph = (x: number, rising: boolean, tint: string, on: number) => {
    const pts = Array.from({ length: 30 }, (_, i) => {
      const t = i / 29;
      const yy = rising ? h - t * h * 0.8 - Math.sin(t * 18) * 26 * (1 - t * 0.3) : h * 0.62 + Math.sin(t * 9) * 4;
      return `${x + t * w * on},${y0 + yy}`;
    });
    return <polyline points={pts.join(' ')} fill="none" stroke={tint} strokeWidth={5} strokeLinejoin="round" />;
  };
  const on = fadeIn(f, 10, 70);
  return (
    <>
      <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0 }}>
        {graph(1080, true, COLORS.gold, on)}
        {graph(220, false, COLORS.blue, on)}
      </svg>
      {[
        { x: 1390, t: 'עובד אלוקים', s: 'יגיעה והתגברות', c: COLORS.gold },
        { x: 530, t: 'אשר לא עבדו', s: 'טבע והרגל', c: COLORS.blue },
      ].map((c) => (
        <div key={c.t} style={{ position: 'absolute', left: c.x - 300, width: 600, top: 520, textAlign: 'center', direction: 'rtl', opacity: fadeIn(f, 20, 40) }}>
          <div style={{ fontFamily: SERIF, fontSize: 58, color: c.c }}>{c.t}</div>
          <div style={{ fontFamily: SANS, fontSize: 34, color: COLORS.muted }}>{c.s}</div>
        </div>
      ))}
    </>
  );
};

const TwoSouls: React.FC<{ f: number }> = ({ f }) => {
  const s = Math.sin(f / 30);
  const on = fadeIn(f, 0, 30);
  return (
    <>
      <AbsoluteFill style={{ opacity: on * 0.9, background: `radial-gradient(ellipse 45% 60% at ${28 + s * 2}% 42%, rgba(70,120,220,.55), rgba(0,0,0,0) 70%), radial-gradient(ellipse 45% 60% at ${72 - s * 2}% 42%, rgba(230,170,80,.6), rgba(0,0,0,0) 70%)` }} />
      <div style={{ position: 'absolute', left: 959, top: 80, width: 2, height: 620, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,.8), transparent)', opacity: on }} />
      <div style={{ position: 'absolute', left: 1180, top: 300, fontFamily: SERIF, fontSize: 78, color: COLORS.goldSoft, opacity: fadeIn(f, 15, 35) }}>נפש אלוקית</div>
      <div style={{ position: 'absolute', left: 330, top: 300, fontFamily: SERIF, fontSize: 78, color: '#a9c6f2', opacity: fadeIn(f, 25, 45) }}>נפש בהמית</div>
    </>
  );
};

const Spark: React.FC<{ f: number }> = ({ f }) => {
  const beam = fadeIn(f, 0, 40);
  const glow = 0.8 + 0.2 * Math.sin(f / 8);
  return (
    <>
      <div style={{ position: 'absolute', left: 957, top: 0, width: 6, height: 400 * beam, background: 'linear-gradient(to bottom, rgba(255,230,170,0), rgba(255,220,150,.95))', filter: 'blur(1px)' }} />
      <div style={{ position: 'absolute', left: 960 - 140, top: 400 - 140, width: 280, height: 280, borderRadius: '50%', opacity: fadeIn(f, 30, 50) * glow, background: 'radial-gradient(circle, rgba(255,240,200,1) 0%, rgba(240,190,100,.65) 25%, rgba(240,170,80,0) 70%)' }} />
    </>
  );
};

const Embers: React.FC<{ f: number; dur: number }> = ({ f, dur }) => {
  const flick = 0.85 + 0.15 * Math.sin(f / 5) * Math.sin(f / 13 + 1);
  return (
    <AbsoluteFill>
      <Img src={staticFile('slides/embers.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.04 + 0.08 * (f / dur)})`, filter: `brightness(${flick})` }} />
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(4,7,13,.85), rgba(4,7,13,.25) 60%, rgba(4,7,13,.45))' }} />
    </AbsoluteFill>
  );
};

// מפת המסע: שביל מתפתל מימין (ההתחלה) לשמאל, 17 תחנות בחמישה שערים
const STATIONS = SCENES.filter((s) => s.station).map((s) => ({ n: s.station!, gate: s.gate! }));
const pathPoint = (t: number) => ({ x: WIDTH - 170 - t * (WIDTH - 340), y: 560 + Math.sin(t * Math.PI * 2.5) * 190 });
const JourneyMap: React.FC<{ f: number; dur: number }> = ({ f, dur }) => {
  const draw = interpolate(f, [20, dur * 0.75], [0, 1], clamp);
  const pts = Array.from({ length: 121 }, (_, i) => pathPoint(i / 120));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const head = pathPoint(draw);
  return (
    <>
      <div style={{ position: 'absolute', top: 60, width: '100%', textAlign: 'center', fontFamily: SERIF, fontSize: 64, color: COLORS.goldSoft, opacity: fadeIn(f, 0, 20) }}>מפת המסע</div>
      <svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', inset: 0 }}>
        <path d={d} fill="none" stroke="rgba(217,179,106,.25)" strokeWidth={4} strokeDasharray="2 12" />
        <path d={d} fill="none" stroke={COLORS.gold} strokeWidth={4} pathLength={1} strokeDasharray={`${draw} 1`} />
        {STATIONS.map((s, i) => {
          const t = i / 16;
          const p = pathPoint(t);
          const pop = interpolate(draw, [t, t + 0.04], [0, 1], clamp);
          return (
            <g key={s.n} opacity={0.3 + 0.7 * pop}>
              <circle cx={p.x} cy={p.y} r={9 + 6 * pop} fill={pop > 0 ? COLORS.gold : 'none'} stroke={COLORS.gold} strokeWidth={2} />
              <text x={p.x} y={p.y - 30} textAnchor="middle" fontFamily={SANS} fontSize={30} fontWeight={500} fill={COLORS.text} opacity={pop}>{s.n}</text>
            </g>
          );
        })}
        <circle cx={head.x} cy={head.y} r={20} fill="rgba(236,211,156,.35)" stroke={COLORS.goldSoft} strokeWidth={2} />
      </svg>
      {Object.entries(GATES).map(([g, info]) => {
        const first = STATIONS.find((s) => s.gate === Number(g))!.n;
        const t = (first - 1) / 16;
        const p = pathPoint(t);
        const vis = interpolate(draw, [t, t + 0.05], [0, 1], clamp);
        return (
          <div key={g} style={{ position: 'absolute', left: p.x - 170, width: 340, top: Number(g) % 2 ? 170 : 820, textAlign: 'center', direction: 'rtl', opacity: vis }}>
            <div style={{ fontFamily: SANS, fontSize: 26, letterSpacing: 3, color: COLORS.gold }}>{info.name}</div>
            <div style={{ fontFamily: SERIF, fontSize: 40, color: COLORS.text }}>{info.question}</div>
          </div>
        );
      })}
    </>
  );
};

const Crossroads: React.FC<{ f: number }> = ({ f }) => {
  const card = (side: 'r' | 'l', title: string, sub: string, start: number, tint: string) => (
    <div style={{ position: 'absolute', top: 90, [side === 'r' ? 'right' : 'left']: 110, width: 700, direction: 'rtl', textAlign: 'center', opacity: fadeIn(f, start, start + 20), padding: '22px 26px', borderRadius: 20, background: 'rgba(4,7,13,.6)', border: `2px solid ${tint}` }}>
      <div style={{ fontFamily: SERIF, fontSize: 56, color: tint }}>{title}</div>
      <div style={{ fontFamily: SANS, fontSize: 34, color: COLORS.text, marginTop: 6 }}>{sub}</div>
    </div>
  );
  return (
    <>
      {card('r', 'הדרך הארוכה־קצרה', 'בנייה פנימית: מסע של הבנת הנפש', 30, COLORS.goldSoft)}
      {card('l', 'הדרך הקצרה־ארוכה', 'פתרונות קסם שנגמרים במבוי סתום', 60, '#c99')}
      <div style={{ position: 'absolute', bottom: 34, width: '100%', textAlign: 'center', fontFamily: SANS, fontSize: 28, color: COLORS.muted, opacity: fadeIn(f, 10, 30) }}>
        על פי עירובין נג, ב
      </div>
    </>
  );
};

export const Graphic: React.FC<{ shot: GraphicShot; f: number; dur: number }> = ({ shot, f, dur }) => {
  const captions = useCaptions();
  const g = shot.g;
  // מה מוצג מהשורות של הגרפיקה:
  //  בלי קריינות — הכול.
  //  עם קריינות וכתוביות — רק הפסוק (הכתוביות נושאות את השאר; בכרטיסי טקסט הן מוצגות במרכז).
  //  עם קריינות בלי כתוביות — בכרטיסי טקסט הכול; בתרשימים רק ציטוט, חידוש ומשל.
  const all: Text[] = shot.lines ?? [];
  const lines: Text[] = !HAS_NARRATION
    ? all
    : captions
      ? g === 'verse' ? all : []
      : g === 'text' || g === 'verse' ? all : all.filter((t) => t.kind === 'quote' || t.kind === 'insight' || t.kind === 'mashal');
  const stage = shot.stage ?? 1;
  const centered = g === 'text' || g === 'verse';
  // כמה זמן התרשים לבד על המסך לפני שהשורה הראשונה עולה
  const intro = graphicIntro(g, dur);
  return (
    <AbsoluteFill>
      {g === 'embers' ? <Embers f={f} dur={dur} /> : g === 'crossroads' || g === 'title' || g === 'end' ? (
        <AbsoluteFill>
          <Frame src={shot.bg ?? '00'} kind="still" p={f / dur} move="in" focus={[0.5, 0.45]} />
          <AbsoluteFill style={{ background: 'rgba(4,7,13,.45)' }} />
        </AbsoluteFill>
      ) : (
        <Bg src={shot.bg} f={f} dur={dur} />
      )}
      {g === 'mechanism' ? <Mechanism f={f} dur={dur} stage={stage} /> : null}
      {g === 'mirror' ? <Mirror f={f} /> : null}
      {g === 'prism' ? <Prism f={f} stage={stage} /> : null}
      {g === 'city' ? <City f={f} /> : null}
      {g === 'table' ? <Table f={f} stage={stage} /> : null}
      {g === 'columns' ? <Columns f={f} /> : null}
      {g === 'two-souls' ? <TwoSouls f={f} /> : null}
      {g === 'spark' ? <Spark f={f} /> : null}
      {g === 'map' ? <JourneyMap f={f} dur={dur} /> : null}
      {g === 'crossroads' ? <Crossroads f={f} /> : null}
      {g === 'title' || g === 'end' ? <TitleCard f={f} dur={dur} end={g === 'end'} /> : null}
      {lines.length ? (
        <>
          {!centered ? <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(3,6,12,.8) 0%, rgba(3,6,12,0) 40%)' }} /> : null}
          <LineSequence lines={lines} f={f} dur={dur} intro={intro} pos={centered ? 'center' : 'bottom'} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

const TitleCard: React.FC<{ f: number; dur: number; end: boolean }> = ({ f, dur, end }) => {
  const a = appear(f, 8, dur - 8, 24, end ? 4 : 20);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', direction: 'rtl' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(3,6,12,.7), rgba(3,6,12,0))', opacity: a.opacity }} />
      <div style={{ opacity: a.opacity, transform: a.transform, filter: a.filter, textAlign: 'center' }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 120, color: COLORS.goldSoft, textShadow: '0 4px 30px rgba(0,0,0,.8)' }}>המסע בדרך הארוכה־קצרה</div>
        <div style={{ fontFamily: SANS, fontWeight: 300, fontSize: 44, color: COLORS.text, marginTop: 14 }}>
          {end ? 'על פי ספר התניא, פרקים א׳–י״ז' : '17 פרקים. 17 תחנות. דרך אחת לחיים.'}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const GateCard: React.FC<{ shot: GateShot; f: number; dur: number }> = ({ shot, f, dur }) => {
  const g = GATES[shot.gate];
  const a = appear(f, 6, dur - 6, 20, 16);
  const sub = appear(f, 40, dur - 40, 18, 16);
  const rule = fadeIn(f, 14, 46);
  return (
    <AbsoluteFill>
      <Bg src={shot.bg} f={f} dur={dur} blur={22} dim={0.7} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', direction: 'rtl' }}>
        <div style={{ opacity: a.opacity, transform: a.transform, filter: a.filter, textAlign: 'center' }}>
          <div style={{ fontFamily: SANS, fontSize: 42, fontWeight: 500, letterSpacing: 10, color: COLORS.gold }}>{g.name}</div>
          <div style={{ width: 420 * rule, height: 2, background: COLORS.gold, margin: '22px auto', opacity: 0.8 }} />
          <div style={{ fontFamily: SERIF, fontSize: 108, fontWeight: 500, color: COLORS.text }}>{g.question}</div>
          <div style={{ opacity: sub.opacity, fontFamily: SANS, fontWeight: 300, fontSize: 46, lineHeight: 1.3, color: COLORS.muted, marginTop: 26 }}>
            {g.sub.split('\n').map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
