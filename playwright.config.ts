import { defineConfig, devices } from '@playwright/test';

/**
 * Browser acceptance suite for the public web experience.
 *
 * The app is served by Vite exactly as in development, and each scenario intercepts the
 * API responses it needs, so the suite validates the real rendering and URL behaviour
 * without requiring a seeded PostgreSQL instance in CI.
 */
export default defineConfig({
  testDir: 'apps/web/tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: process.env.CI === 'true',
  retries: process.env.CI === 'true' ? 1 : 0,
  reporter: process.env.CI === 'true' ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173/',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @actionpop/web dev --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: process.env.CI !== 'true',
    timeout: 120_000,
  },
});
