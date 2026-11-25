import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/archivo/400';
import '@fontsource/archivo/600';
import '@fontsource/martian-mono/400';
import './viewer.css';
import { Viewer } from './Viewer';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Viewer />
  </StrictMode>,
);
