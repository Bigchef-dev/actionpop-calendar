import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Integration suites import `apps/worker/src`, which resolves `@actionpop/core`
    // through its `exports` map to `dist/`. Aliasing to the source keeps the run
    // independent of a prior build, like every other suite in the repository.
    alias: {
      '@actionpop/core': fileURLToPath(new URL('packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: [
      'packages/*/tests/**/*.test.ts',
      'apps/*/tests/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    passWithNoTests: true,
    setupFiles: ['tests/setup-env.ts'],
  },
});
