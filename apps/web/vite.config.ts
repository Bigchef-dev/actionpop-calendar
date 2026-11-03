import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// The published site is served from the root of the application edge; the GitHub Pages fallback
// passes `/agenda-rennes/`. One build definition, two deployments, no drift.
const basePath = process.env.VITE_BASE_PATH?.trim() || '/';

// Development only: the SPA calls its own origin in production, so a proxy keeps `pnpm dev`
// working without a CORS exception.
const devApiTarget = process.env.VITE_DEV_API_URL?.trim() || 'http://127.0.0.1:3000';

export default defineConfig({
  base: basePath,
  plugins: [vue()],
  resolve: {
    alias: {
      // The action-type catalogue is reference data shared with the worker, kept outside the app.
      '@data': fileURLToPath(new URL('../../data', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/calendar.ics': { target: devApiTarget, changeOrigin: true },
      '/search': { target: devApiTarget, changeOrigin: true },
      '/events': { target: devApiTarget, changeOrigin: true },
      '/feed': { target: devApiTarget, changeOrigin: true },
      '/telemetry': { target: devApiTarget, changeOrigin: true },
    },
  },
});
