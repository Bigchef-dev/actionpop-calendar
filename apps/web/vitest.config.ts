import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@data': fileURLToPath(new URL('../../data', import.meta.url)),
    },
  },
  // The published site is same-origin, so a browser provides the origin at runtime. Unit tests run
  // in Node, where there is no origin: an absolute base keeps link building deterministic and
  // mirrors the GitHub Pages deployment, which also sets one.
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://calendar.test'),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
