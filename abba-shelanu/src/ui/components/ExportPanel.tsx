import React, { useEffect, useMemo, useState } from 'react';
import type { Project } from '../../shared/types';
import { runQc } from '../../shared/qc';
import { api, type RenderJob } from '../lib/api';
import { rebuild } from '../lib/build';

export const ExportPanel: React.FC<{ project: Project; seek: (t: number) => void; setClip: (id: string) => void }> = ({ project, seek, setClip }) => {
  const qc = useMemo(() => runQc(project), [project]);
  const [format, setFormat] = useState(project.settings.format);
  const [resolution, setResolution] = useState<1080 | 2160>(project.settings.resolution);
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const errors = qc.filter((q) => q.level === 'error');
  const warns = qc.filter((q) => q.level === 'warn');

  useEffect(() => {
    if (!jobs.some((j) => !j.file && !j.error)) return;
    const h = setInterval(async () => {
      setJobs(await Promise.all(jobs.map((j) => (j.file || j.error ? j : api.renderStatus(j.id)))));
    }, 1000);
    return () => clearInterval(h);
  }, [jobs]);

  const start = async (sample: boolean) => {
    try {
      // the collage layouts depend on the frame shape: another format gets its own layout, same story order
      const p = format === project.settings.format ? project : { ...rebuild({ ...project, settings: { ...project.settings, format } }, { smart: false }).project, captions: project.captions };
      const j = await api.render(project.id, { format, resolution, sample, project: p });
      setJobs((x) => [j, ...x]);
    } catch (e) { alert((e as Error).message); }
  };
  const eta = (j: RenderJob) => {
    if (j.progress < 0.03) return '';
    const el = (Date.now() - j.startedAt) / 1000;
    const left = (el / j.progress) * (1 - j.progress);
    return ` · עוד כ-${Math.ceil(left / 60)} דק׳`;
  };

  return (
    <div className="export-panel">
      <h3>בקרת איכות</h3>
      <div className="qc-summary">
        <span className={errors.length ? 'bad' : 'good'}>{errors.length ? `${errors.length} בעיות לתיקון` : 'אין בעיות חוסמות'}</span>
        {warns.length > 0 && <span className="warn">{warns.length} הערות</span>}
      </div>
      <ul className="qc-list">
        {qc.map((q, i) => (
          <li key={i} className={q.level} onClick={() => { if (q.at !== undefined) seek(q.at); if (q.clipId) setClip(q.clipId); }}>
            <span className="qc-dot" />
            <div><b>{q.title}</b>{q.detail && <div className="small muted">{q.detail}</div>}</div>
          </li>
        ))}
      </ul>

      <h3>ייצוא</h3>
      <div className="field-row">
        <span>פורמט</span>
        <div className="seg">
          <button className={format === '16:9' ? 'on' : ''} onClick={() => setFormat('16:9')}>16:9 טלוויזיה</button>
          <button className={format === '9:16' ? 'on' : ''} onClick={() => setFormat('9:16')}>9:16 טלפון</button>
        </div>
      </div>
      {format !== project.settings.format && <p className="warn small">העריכה הנוכחית בנויה ל-{project.settings.format}. בייצוא ל-{format} השוטים ייבנו מחדש לפי אותו סדר סיפור (שינויים ידניים בשוטים לא יועברו). כדי לראות ולערוך קודם, החליפו פורמט בלשונית העריכה.</p>}
      <div className="field-row">
        <span>רזולוציה</span>
        <div className="seg">
          <button className={resolution === 1080 ? 'on' : ''} onClick={() => setResolution(1080)}>Full HD</button>
          <button className={resolution === 2160 ? 'on' : ''} onClick={() => setResolution(2160)}>4K</button>
        </div>
      </div>
      <p className="muted small">MP4 (H.264), ‏30 תמונות לשנייה, הסאונד המקורי ב-AAC ‏320kbps, בלי סימני מים. הייצוא נעשה במחשב הזה.</p>
      <div className="btn-row">
        <button onClick={() => start(true)} disabled={errors.length > 0}>דוגמה של 12 שניות (סביב השיא)</button>
        <button className="primary" onClick={() => start(false)} disabled={errors.length > 0}>ייצוא הסרט המלא</button>
      </div>
      {jobs.map((j) => (
        <div key={j.id} className="job">
          <div className="small">{j.name}</div>
          {j.error ? <p className="error small">{j.error}</p> : j.file ? (
            <a className="primary-link" href={`/api/projects/${project.id}/exports/${j.file}`} download>הורדת הסרט ⤓</a>
          ) : (
            <>
              <div className="progress"><div style={{ width: `${j.progress * 100}%` }} /></div>
              <div className="small muted">{j.stage} {Math.round(j.progress * 100)}%{eta(j)}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};
