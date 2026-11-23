import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { PostgresUpdateStatus } from './postgres-update-status.js';

interface StubClient {
  readonly $queryRaw: () => Promise<readonly Record<string, unknown>[]>;
  readonly processingPeriod: {
    findMany(args: unknown): Promise<readonly Record<string, unknown>[]>;
  };
}

function reader(
  responses: readonly (readonly Record<string, unknown>[])[],
  periods: readonly Record<string, unknown>[] = [],
): PostgresUpdateStatus {
  let index = 0;
  const client: StubClient = {
    $queryRaw: async () => responses[index++] ?? [],
    processingPeriod: { findMany: async () => periods },
  };
  // Narrow boundary by design: the stub implements only the two calls this reader makes.
  return new PostgresUpdateStatus(client as unknown as PrismaClient);
}

const NOW = new Date('2026-11-23T21:00:00.000Z');

describe('PostgresUpdateStatus.current', () => {
  it('splits group progress by scope kind and event progress by coverage', async () => {
    const service = reader([
      [
        { scope_kind: 'group', status: 'succeeded', count: 30, updated_at: NOW },
        { scope_kind: 'group', status: 'scheduled', count: 10, updated_at: null },
        { scope_kind: 'event', status: 'succeeded', count: 2, updated_at: NOW },
      ],
      [{ observed: 120, total: 1640 }],
    ]);

    const result = await service.current(new Date('2026-11-23T20:45:00.000Z'));

    expect(result?.counts).toEqual({ processed: 32, failed: 0, remaining: 10, total: 42 });
    expect(result?.groups).toEqual({ processed: 30, failed: 0, remaining: 10, total: 40 });
    expect(result?.events).toEqual({ processed: 120, failed: 0, remaining: 1520, total: 1640 });
    expect(result?.completedAt).toBe(NOW);
  });

  it('answers null when the period holds no ledger row', async () => {
    const service = reader([[], [{ observed: 0, total: 0 }]]);

    expect(await service.current(NOW)).toBeNull();
  });
});

describe('PostgresUpdateStatus.settled', () => {
  const before = new Date('2026-11-23T21:00:00.000Z');

  it('returns group progress and event coverage for a settled period', async () => {
    const start = new Date('2026-11-23T20:45:00.000Z');
    const service = reader(
      [
        [
          {
            period_token: 'p1',
            scope_kind: 'group',
            status: 'succeeded',
            count: 40,
            updated_at: new Date('2026-11-23T20:50:00.000Z'),
          },
        ],
        [{ period_token: 'p1', observed: 100 }],
        [{ total: 1640 }],
      ],
      [{ periodToken: 'p1', periodStartUtc: start }],
    );

    const result = await service.settled(5, before, NOW);

    expect(result).toHaveLength(1);
    expect(result[0]?.counts).toEqual({ processed: 40, failed: 0, remaining: 0, total: 40 });
    expect(result[0]?.groups).toEqual({ processed: 40, failed: 0, remaining: 0, total: 40 });
    expect(result[0]?.events).toEqual({ processed: 100, failed: 0, remaining: 1540, total: 1640 });
  });

  it('skips a period still running inside the grace window', async () => {
    const start = new Date('2026-11-23T20:45:00.000Z');
    const service = reader(
      [
        [{ period_token: 'p1', scope_kind: 'group', status: 'running', count: 2, updated_at: NOW }],
        [],
        [{ total: 1640 }],
      ],
      [{ periodToken: 'p1', periodStartUtc: start }],
    );

    expect(await service.settled(5, before, NOW)).toEqual([]);
  });

  it('counts abandoned work as failed, per kind too', async () => {
    const start = new Date('2026-11-23T19:00:00.000Z');
    const service = reader(
      [
        [
          {
            period_token: 'p1',
            scope_kind: 'group',
            status: 'succeeded',
            count: 8,
            updated_at: new Date('2026-11-23T19:10:00.000Z'),
          },
          {
            period_token: 'p1',
            scope_kind: 'group',
            status: 'running',
            count: 2,
            updated_at: new Date('2026-11-23T19:10:00.000Z'),
          },
        ],
        [{ period_token: 'p1', observed: 50 }],
        [{ total: 1640 }],
      ],
      [{ periodToken: 'p1', periodStartUtc: start }],
    );

    const result = await service.settled(5, before, NOW);

    expect(result[0]?.counts).toEqual({ processed: 8, failed: 2, remaining: 0, total: 10 });
    expect(result[0]?.groups).toEqual({ processed: 8, failed: 2, remaining: 0, total: 10 });
    expect(result[0]?.events).toEqual({ processed: 50, failed: 0, remaining: 1590, total: 1640 });
  });

  it('ignores a period without any terminal row', async () => {
    const start = new Date('2026-11-23T19:00:00.000Z');
    const service = reader(
      [
        [
          {
            period_token: 'p1',
            scope_kind: 'group',
            status: 'scheduled',
            count: 4,
            updated_at: start,
          },
        ],
        [],
        [{ total: 1640 }],
      ],
      [{ periodToken: 'p1', periodStartUtc: start }],
    );

    expect(await service.settled(5, before, NOW)).toEqual([]);
  });
});
