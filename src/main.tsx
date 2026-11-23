import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/big-shoulders-stencil-display/800';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/martian-mono/400';
import '@fontsource/martian-mono/600';
import '@fontsource/doto/700';
import '@fontsource/archivo/400';
import '@fontsource/archivo/600';
import { App } from './App';
import './style.css';
import './site/discover.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
