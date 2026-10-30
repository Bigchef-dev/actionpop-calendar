import { describe, expect, it } from 'vitest';

import { describeDependencyFailures, runPreflight } from './preflight.js';

describe('runPreflight', () => {
  it('returns only the failing dependencies', async () => {
    const failures = await runPreflight([
      { name: 'redis', probe: async () => undefined },
      {
        name: 'postgres',
        probe: async () => {
          throw new Error('connect ECONNREFUSED');
        },
      },
    ]);

    expect(failures).toEqual([{ name: 'postgres', message: 'connect ECONNREFUSED' }]);
  });

  it('times out probes that never settle', async () => {
    const failures = await runPreflight(
      [{ name: 'redis', probe: () => new Promise<void>(() => undefined) }],
      25,
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toMatch(/timed out after 25ms/);
  });

  it('asks for migrations when the database is reachable but behind', () => {
    const description = describeDependencyFailures([
      { name: 'postgres schema', message: 'missing tables ingestion_scope' },
    ]);

    expect(description).toContain('pnpm prisma:migrate');
    expect(description).not.toContain('pnpm dev:infra');
  });

  it('describes failures with the startup command', () => {
    const description = describeDependencyFailures(
      [
        { name: 'redis', message: 'boom' },
        { name: 'postgres', message: 'boom' },
      ],
      'pnpm dev:infra',
    );

    expect(description).toContain('redis, postgres');
    expect(description).toContain('pnpm dev:infra');
  });
});
