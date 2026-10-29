import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresIngestionLedgerStore } from '../../apps/worker/src/operations/ingestion-ledger.js';
import { reconcileIngestionLedger } from '../../apps/worker/src/operations/ledger-reconciliation.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_ingestion_ledger' });
const ledger = new PostgresIngestionLedgerStore(harness.prisma);

beforeEach(async () => {
  await harness.prisma.ingestionLedger.deleteMany();
  await harness.prisma.processingPeriod.deleteMany();
  await harness.prisma.groupScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

describe('PostgresIngestionLedgerStore period tokens', () => {
  it('accepts the compact token emitted by the dispatcher', async () => {
    await ledger.transition('job-1', {
      scopeId: 'group-1',
      periodToken: '20261028T201500Z',
      status: 'scheduled',
      attempts: 0,
    });

    const periods = await harness.prisma.processingPeriod.findMany();
    expect(periods).toHaveLength(1);
    expect(periods[0]?.periodToken).toBe('2026-10-28T20:15:00.000Z');
    expect(periods[0]?.periodStartUtc.toISOString()).toBe('2026-10-28T20:15:00.000Z');
    expect(periods[0]?.periodEndUtc.toISOString()).toBe('2026-10-28T20:30:00.000Z');
  });

  it('stores the same canonical token for the compact and ISO forms', async () => {
    await ledger.transition('job-compact_group-1', {
      scopeId: 'group-1',
      periodToken: '20261028T201500Z',
      status: 'scheduled',
    });
    await ledger.transition('job-iso_group-2', {
      scopeId: 'group-2',
      periodToken: '2026-10-28T20:15:00.000Z',
      status: 'scheduled',
    });

    expect(await harness.prisma.processingPeriod.count()).toBe(1);
    const ledgers = await harness.prisma.ingestionLedger.findMany({ orderBy: { jobId: 'asc' } });
    expect(ledgers.map((row) => row.periodToken)).toEqual([
      '2026-10-28T20:15:00.000Z',
      '2026-10-28T20:15:00.000Z',
    ]);
  });

  it('rejects an invalid token instead of writing an invalid date', async () => {
    await expect(
      ledger.transition('job-bad', {
        scopeId: 'group-1',
        periodToken: 'not-a-token',
        status: 'scheduled',
      }),
    ).rejects.toThrow(/period token/);
    expect(await harness.prisma.processingPeriod.count()).toBe(0);
  });
});

describe('PostgresIngestionLedgerStore concurrency', () => {
  it('does not fail when several scopes share the same period at once', async () => {
    const scopes = ['group-a', 'group-b', 'group-c', 'group-d'];
    await Promise.all(
      scopes.map((scopeId, index) =>
        ledger.transition(`job-${index}`, {
          scopeId,
          periodToken: '20261028T203000Z',
          status: 'scheduled',
        }),
      ),
    );

    expect(await harness.prisma.processingPeriod.count()).toBe(1);
    expect(await harness.prisma.ingestionLedger.count()).toBe(scopes.length);
  });

  it('does not fail when the same job is transitioned concurrently', async () => {
    await Promise.all([
      ledger.transition('job-1', {
        scopeId: 'group-1',
        periodToken: '20261028T203000Z',
        status: 'scheduled',
      }),
      ledger.transition('job-1', {
        scopeId: 'group-1',
        periodToken: '20261028T203000Z',
        status: 'running',
        attempts: 1,
      }),
    ]);

    const rows = await harness.prisma.ingestionLedger.findMany({ where: { jobId: 'job-1' } });
    expect(rows).toHaveLength(1);
    expect(await harness.prisma.processingPeriod.count()).toBe(1);
  });

  it('keeps updating the same job through its lifecycle', async () => {
    await ledger.transition('job-1', {
      scopeId: 'group-1',
      periodToken: '20261028T203000Z',
      status: 'scheduled',
    });
    await ledger.transition('job-1', { status: 'running', attempts: 1 });
    await ledger.transition('job-1', { status: 'succeeded', attempts: 1 });

    const row = await harness.prisma.ingestionLedger.findUnique({ where: { jobId: 'job-1' } });
    expect(row?.status).toBe('succeeded');
    expect(row?.attempts).toBe(1);
    expect(await harness.prisma.processingPeriod.count()).toBe(1);
  });
});


describe('ingestion ledger reconciliation', () => {
  const cutoff = new Date('2026-10-29T10:00:00.000Z');

  async function seed(jobId: string, status: string, updatedAt: string) {
    await ledger.transition(jobId, {
      scopeId: `scope-${jobId}`,
      periodToken: '20261029T091500Z',
      status: status as never,
    });
    await harness.prisma.ingestionLedger.update({
      where: { jobId },
      data: { updatedAt: new Date(updatedAt) },
    });
  }

  function queueWith(states: Record<string, string | undefined>) {
    return {
      getJob: async (jobId: string) => {
        const state = states[jobId];
        return state === undefined ? undefined : { getState: async () => state };
      },
    };
  }

  it('aligns every stale row with what the queue actually recorded', async () => {
    await seed('job-completed', 'scheduled', '2026-10-29T08:00:00.000Z');
    await seed('job-lost', 'running', '2026-10-29T08:05:00.000Z');
    await seed('job-still-live', 'scheduled', '2026-10-29T08:10:00.000Z');
    await seed('job-recent', 'scheduled', '2026-10-29T10:05:00.000Z');
    await seed('job-done', 'succeeded', '2026-10-29T08:00:00.000Z');

    const reconciled = await reconcileIngestionLedger(
      harness.prisma,
      queueWith({ 'job-completed': 'completed', 'job-still-live': 'active' }),
      cutoff,
    );

    expect(reconciled).toEqual({ succeeded: 1, failed: 1 });

    const rows = await harness.prisma.ingestionLedger.findMany({ orderBy: { jobId: 'asc' } });
    expect(rows.map((row) => [row.jobId, row.status])).toEqual([
      ['job-completed', 'succeeded'],
      ['job-done', 'succeeded'],
      ['job-lost', 'failed'],
      ['job-recent', 'scheduled'],
      ['job-still-live', 'scheduled'],
    ]);
    expect(rows.find((row) => row.jobId === 'job-lost')?.lastError).toContain('abandoned');
  });

  it('records the reason the queue reported for a failed job', async () => {
    await seed('job-throttled', 'retrying', '2026-10-29T08:00:00.000Z');

    await reconcileIngestionLedger(
      harness.prisma,
      { getJob: async () => ({ getState: async () => 'failed', failedReason: 'Upstream HTTP 429' }) },
      cutoff,
    );

    const row = await harness.prisma.ingestionLedger.findUnique({ where: { jobId: 'job-throttled' } });
    expect(row?.status).toBe('failed');
    expect(row?.lastError).toBe('Upstream HTTP 429');
  });

  it('is idempotent', async () => {
    await seed('job-lost', 'scheduled', '2026-10-29T08:00:00.000Z');
    const queue = queueWith({});

    expect(await reconcileIngestionLedger(harness.prisma, queue, cutoff)).toEqual({
      succeeded: 0,
      failed: 1,
    });
    expect(await reconcileIngestionLedger(harness.prisma, queue, cutoff)).toEqual({
      succeeded: 0,
      failed: 0,
    });
  });
});
