import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Booking API (npm run server) on :3001.
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  build: {
    // The only chunk over Vite's 500 kB default is three.js itself (~790 kB, ~200 kB gzipped),
    // a single library that cannot be split further.
    chunkSizeWarningLimit: 850,
    // React sits in its own long-cacheable chunk. three.js is only reachable through the lazy 3D
    // routes, so the bundler splits it out and discovery pages never download it.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
