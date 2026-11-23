import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresUpdateStatus } from '../../packages/core/src/persistence/postgres-update-status.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_update_status' });
const reader = new PostgresUpdateStatus(harness.prisma);

const NOW = new Date('2026-11-23T21:00:00.000Z');
const INTERVAL_MS = 15 * 60 * 1000;

function periodStart(minutesBeforeNow: number): Date {
  return new Date(NOW.getTime() - minutesBeforeNow * 60 * 1000);
}

async function seedEventCoverage(
  currentToken: string,
  previousToken: string | null,
): Promise<void> {
  const tokens = [currentToken, currentToken, previousToken ?? currentToken];
  for (const [index, token] of tokens.entries()) {
    const scopeId = `scope-event-${index}`;
    await harness.prisma.ingestionScope.create({
      data: { scopeId, scopeKey: scopeId, scopeKind: 'event' },
    });
    await harness.prisma.eventRecord.create({
      data: {
        sourceEventId: `event-${index}`,
        startTime: new Date('2026-11-24T10:00:00.000Z'),
        endTime: new Date('2026-11-24T12:00:00.000Z'),
        summary: `Événement ${index}`,
      },
    });
    await harness.prisma.eventObservation.create({
      data: {
        eventId: `event-${index}`,
        viaScopeId: scopeId,
        statedGroupCount: 0,
        firstSeenPeriod: token,
        lastSeenPeriod: token,
      },
    });
  }
}

async function seedPeriod(
  start: Date,
  statuses: readonly string[],
  updatedAt = new Date(start.getTime() + 5 * 60 * 1000),
): Promise<void> {
  await harness.prisma.processingPeriod.create({
    data: {
      periodToken: start.toISOString(),
      periodStartUtc: start,
      periodEndUtc: new Date(start.getTime() + INTERVAL_MS),
    },
  });
  for (const [index, status] of statuses.entries()) {
    const scopeId = `scope-${start.toISOString()}-${index}`;
    await harness.prisma.ingestionScope.create({
      data: { scopeId, scopeKey: scopeId, scopeKind: 'group' },
    });
    await harness.prisma.ingestionLedger.create({
      data: {
        jobId: `job-${scopeId}`,
        scopeId,
        periodToken: start.toISOString(),
        status,
        attempts: 0,
        updatedAt,
      },
    });
  }
}

beforeEach(async () => {
  await harness.prisma.ingestionLedger.deleteMany();
  await harness.prisma.eventObservation.deleteMany();
  await harness.prisma.eventRecord.deleteMany();
  await harness.prisma.processingPeriod.deleteMany();
  await harness.prisma.ingestionScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

describe('PostgresUpdateStatus current period', () => {
  it('buckets mixed live and terminal rows and keeps the sum invariant', async () => {
    const start = periodStart(0);
    await seedPeriod(start, [
      'succeeded',
      'succeeded',
      'stopped',
      'failed',
      'scheduled',
      'running',
      'publishing',
    ]);

    const reading = await reader.current(start);

    expect(reading?.counts).toEqual({ processed: 3, failed: 1, remaining: 3, total: 7 });
    expect(reading?.completedAt).toBeInstanceOf(Date);
    const counts = reading?.counts;
    expect((counts?.processed ?? 0) + (counts?.failed ?? 0) + (counts?.remaining ?? 0)).toBe(
      counts?.total,
    );
  });

  it('reports explicit group progress and event coverage', async () => {
    const start = periodStart(0);
    await seedPeriod(start, ['succeeded']);
    await seedEventCoverage(start.toISOString(), periodStart(15).toISOString());

    const reading = await reader.current(start);

    expect(reading?.groups).toEqual({ processed: 1, failed: 0, remaining: 0, total: 1 });
    expect(reading?.events).toEqual({ processed: 2, failed: 0, remaining: 1, total: 3 });
  });

  it('answers null for a period with no ledger row', async () => {
    await seedPeriod(periodStart(15), ['succeeded']);

    expect(await reader.current(periodStart(0))).toBeNull();
  });
});

describe('PostgresUpdateStatus settled periods', () => {
  it('returns the five most recent settled runs, newest first', async () => {
    for (let index = 1; index <= 7; index += 1) {
      await seedPeriod(periodStart(index * 15), ['succeeded', 'succeeded']);
    }

    const runs = await reader.settled(5, periodStart(0), NOW);

    expect(runs).toHaveLength(5);
    expect(runs[0]?.periodStartUtc.toISOString()).toBe(periodStart(15).toISOString());
    expect(runs.map((run) => run.periodStartUtc.getTime())).toEqual(
      [...runs.map((run) => run.periodStartUtc.getTime())].sort((left, right) => right - left),
    );
    expect(runs.every((run) => run.counts.processed === 2 && run.counts.failed === 0)).toBe(true);
  });

  it('reports per-kind figures on a settled period', async () => {
    const start = periodStart(15);
    await seedPeriod(start, ['succeeded', 'succeeded']);
    await seedEventCoverage(start.toISOString(), null);

    const runs = await reader.settled(5, periodStart(0), NOW);

    expect(runs[0]?.groups).toEqual({ processed: 2, failed: 0, remaining: 0, total: 2 });
    expect(runs[0]?.events).toEqual({ processed: 3, failed: 0, remaining: 0, total: 3 });
  });

  it('classifies partial and failed outcomes through their counts', async () => {
    await seedPeriod(periodStart(15), ['succeeded', 'failed']);
    await seedPeriod(periodStart(30), ['failed', 'failed']);

    const runs = await reader.settled(5, periodStart(0), NOW);

    expect(runs[0]?.counts).toEqual({ processed: 1, failed: 1, remaining: 0, total: 2 });
    expect(runs[1]?.counts).toEqual({ processed: 0, failed: 2, remaining: 0, total: 2 });
  });

  it('skips a period still running inside the grace window', async () => {
    await seedPeriod(periodStart(10), ['succeeded', 'running']);

    expect(await reader.settled(5, periodStart(0), NOW)).toEqual([]);
  });

  it('counts work abandoned past the grace window as failed', async () => {
    const start = periodStart(90);
    await seedPeriod(start, ['succeeded', 'running']);

    const runs = await reader.settled(5, periodStart(0), NOW);

    expect(runs).toHaveLength(1);
    expect(runs[0]?.counts).toEqual({ processed: 1, failed: 1, remaining: 0, total: 2 });
  });

  it('never exposes a scope, a job or an error through the settled projection', async () => {
    await seedPeriod(periodStart(15), ['succeeded']);

    const runs = await reader.settled(1, periodStart(0), NOW);

    expect(JSON.stringify(runs)).not.toContain('scope-');
    expect(JSON.stringify(runs)).not.toContain('job-');
  });
});
