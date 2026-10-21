import React, { useEffect, useState } from 'react';
import type { Project } from '../../shared/types';
import { api } from '../lib/api';

export const Welcome: React.FC<{ onOpen: (p: Project) => void }> = ({ onOpen }) => {
  const [list, setList] = useState<Awaited<ReturnType<typeof api.list>>>([]);
  const [err, setErr] = useState('');
  useEffect(() => { api.list().then(setList).catch((e) => setErr(String(e.message))); }, []);
  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>אבא שלנו</h1>
        <p className="lead">קליפ יום הולדת ליוסף, מהלב של משי, ליבי, הדר, שרי ויוני.</p>
        <p className="muted">הכול נשאר במחשב הזה: השיר, התמונות והעיבוד. שום דבר לא עולה לאינטרנט.</p>
        <button className="primary big" onClick={() => api.create('אבא שלנו – יום הולדת ליוסף').then(onOpen).catch((e) => setErr(e.message))}>פרויקט חדש</button>
        {err && <p className="error">{err}</p>}
        {list.length > 0 && (
          <div className="project-list">
            <h3>פרויקטים קיימים</h3>
            {list.map((p) => (
              <button key={p.id} className="project-row" onClick={() => api.get(p.id).then(onOpen)}>
                <span>{p.title}</span>
                <span className="muted">{p.photos} תמונות · {p.hasAudio ? 'יש שיר' : 'בלי שיר'} · {new Date(p.createdAt).toLocaleDateString('he-IL')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
