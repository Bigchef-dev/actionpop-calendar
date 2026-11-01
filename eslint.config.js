import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'node_modules/**',
      // TODO(web): lint the Vue app once eslint-plugin-vue and the browser globals for
      // the public userscript are configured. Its own `vue-tsc` gate runs in web.yml.
      'apps/web/**',
    ],
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
