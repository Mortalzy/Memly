import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyTheme, readTheme } from './shared/theme';
import './app/styles.css';

applyTheme(readTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App demo={import.meta.env.VITE_DEMO_MODE === 'true'} />
  </StrictMode>,
);
