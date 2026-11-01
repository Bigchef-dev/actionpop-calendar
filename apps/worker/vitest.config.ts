import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolve the workspace package to its source so a test run never depends on a prior
    // `pnpm build`. The published artifacts are still validated by the Docker build.
    alias: {
      '@actionpop/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
