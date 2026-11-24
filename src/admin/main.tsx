import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/big-shoulders-stencil-display/800';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/martian-mono/400';
import '@fontsource/martian-mono/600';
import '@fontsource/archivo/400';
import '@fontsource/archivo/600';
import '../style.css';
import '../site/discover.css';
import './admin.css';
import { AdminApp } from './AdminApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
