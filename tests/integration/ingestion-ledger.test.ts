import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresIngestionLedgerStore } from '../../apps/worker/src/operations/ingestion-ledger.js';
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
