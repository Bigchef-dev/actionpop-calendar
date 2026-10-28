import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const cleanup: string[] = [];

afterEach(() => {
  vi.resetModules();
  delete process.env.ACTIONPOP_ENV_TEST;
  for (const directory of cleanup.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createEnvDirectory(base: string, local?: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'actionpop-env-'));
  cleanup.push(directory);
  writeFileSync(join(directory, '.env'), base);
  if (local !== undefined) writeFileSync(join(directory, '.env.local'), local);
  return directory;
}

describe('loadEnvFile', () => {
  it('loads .env values when no local override exists', async () => {
    const directory = createEnvDirectory('ACTIONPOP_ENV_TEST=base\n');
    const { loadEnvFile } = await import('./load-env.js');

    loadEnvFile(directory);

    expect(process.env.ACTIONPOP_ENV_TEST).toBe('base');
  });

  it('lets .env.local override .env values', async () => {
    const directory = createEnvDirectory('ACTIONPOP_ENV_TEST=base\n', 'ACTIONPOP_ENV_TEST=local\n');
    const { loadEnvFile } = await import('./load-env.js');

    loadEnvFile(directory);

    expect(process.env.ACTIONPOP_ENV_TEST).toBe('local');
  });
});
