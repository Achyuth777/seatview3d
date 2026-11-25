import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Builds the private-demo Chrome extension into extension-dist/ (load it unpacked).
 * Two passes: EXT_PART=viewer builds the panel page; EXT_PART=content builds the content script as one
 * self-contained file, because content scripts cannot load ES modules.
 */
const part = process.env.EXT_PART ?? 'viewer';

export default defineConfig(
  part === 'content'
    ? {
        publicDir: false,
        build: {
          outDir: 'extension-dist',
          emptyOutDir: false,
          lib: { entry: 'src/extension/content.ts', formats: ['iife'], name: 'SeatViewDistrict', fileName: () => 'content.js' },
        },
      }
    : {
        root: here('./extension'),
        base: './',
        publicDir: here('./extension/public'),
        plugins: [react()],
        build: { outDir: here('./extension-dist'), emptyOutDir: true, chunkSizeWarningLimit: 1200, rolldownOptions: { input: here('./extension/viewer.html') } },
      },
);
