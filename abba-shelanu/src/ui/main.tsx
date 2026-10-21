import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/heebo/300.css';
import '@fontsource/heebo/400.css';
import '@fontsource/heebo/500.css';
import '@fontsource/frank-ruhl-libre/400.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
