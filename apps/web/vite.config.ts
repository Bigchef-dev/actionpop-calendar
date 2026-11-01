import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  base: '/agenda-rennes/',
  resolve: {
    alias: {
      // The action-type catalogue is reference data shared with the worker, kept outside the app.
      '@data': fileURLToPath(new URL('../../data', import.meta.url)),
    },
  },
});
