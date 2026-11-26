import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  countLedgerRowsForPeriod,
  countMapObservationRequests,
  countVisitedScopes,
  deleteLedgerRowsForPeriod,
  resetMapObservationRequests,
  resetVisitedScopesToPending,
} from '../../packages/core/src/persistence/ingestion-maintenance.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_ingestion_maintenance' });
const prisma = harness.prisma;

const PERIOD = '2026-10-29T10:00:00.000Z';

beforeEach(async () => {
  await prisma.ingestionLedger.deleteMany();
  await prisma.mapEventObservation.deleteMany();
  await prisma.eventObservation.deleteMany();
  await prisma.processingPeriod.deleteMany();
  await prisma.ingestionScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

async function scope(scopeId: string, kind: string, retrievalStatus: string): Promise<void> {
  await prisma.ingestionScope.create({
    data: { scopeId, scopeKey: scopeId, scopeKind: kind, retrievalStatus },
  });
}

describe('ingestion maintenance', () => {
  it('returns active scopes to pending without touching stopped, retired or map scopes', async () => {
    await scope('group-active', 'group', 'active');
    await scope('group-inactive', 'group', 'stopped_inactive');
    await scope('event-active', 'event', 'active');
    await scope('event-retired', 'event', 'retired');
    await scope('map-discovery', 'map', 'active');

    await expect(countVisitedScopes(prisma, ['group', 'event'])).resolves.toBe(2);
    await expect(resetVisitedScopesToPending(prisma, ['group', 'event'])).resolves.toBe(2);

    const rows = await prisma.ingestionScope.findMany({
      select: { scopeId: true, retrievalStatus: true },
      orderBy: { scopeId: 'asc' },
    });
    expect(rows).toEqual([
      { scopeId: 'event-active', retrievalStatus: 'pending' },
      { scopeId: 'event-retired', retrievalStatus: 'retired' },
      { scopeId: 'group-active', retrievalStatus: 'pending' },
      { scopeId: 'group-inactive', retrievalStatus: 'stopped_inactive' },
      { scopeId: 'map-discovery', retrievalStatus: 'active' },
    ]);
  });

  it('deletes only the selected kinds for the requested period', async () => {
    await scope('group-1', 'group', 'active');
    await scope('event-1', 'event', 'active');
    await scope('map-discovery', 'map', 'active');
    await prisma.processingPeriod.create({
      data: {
        periodToken: PERIOD,
        periodStartUtc: new Date(PERIOD),
        periodEndUtc: new Date('2026-10-29T10:15:00.000Z'),
      },
    });
    await prisma.ingestionLedger.createMany({
      data: [
        { jobId: 'group-job', scopeId: 'group-1', periodToken: PERIOD, status: 'succeeded' },
        { jobId: 'event-job', scopeId: 'event-1', periodToken: PERIOD, status: 'failed' },
        { jobId: 'map-job', scopeId: 'map-discovery', periodToken: PERIOD, status: 'succeeded' },
      ],
    });

    await expect(countLedgerRowsForPeriod(prisma, PERIOD, ['group'])).resolves.toBe(1);
    await expect(deleteLedgerRowsForPeriod(prisma, PERIOD, ['group'])).resolves.toEqual([
      'group-job',
    ]);
    await expect(deleteLedgerRowsForPeriod(prisma, PERIOD, ['event', 'map'])).resolves.toEqual(
      expect.arrayContaining(['event-job', 'map-job']),
    );
    await expect(prisma.ingestionLedger.count()).resolves.toBe(0);
  });

  it('forgets map requests while keeping the listing', async () => {
    await prisma.mapEventObservation.createMany({
      data: [
        {
          eventId: 'requested',
          summaryFingerprint: 'fingerprint',
          displayName: 'Event',
          firstSeenAt: new Date(PERIOD),
          lastSeenAt: new Date(PERIOD),
          lastRequestedAt: new Date(PERIOD),
          lastOutcome: 'resolved',
          nextReconcileAt: new Date(PERIOD),
        },
        {
          eventId: 'never-requested',
          summaryFingerprint: 'other',
          firstSeenAt: new Date(PERIOD),
          lastSeenAt: new Date(PERIOD),
        },
      ],
    });

    await expect(countMapObservationRequests(prisma)).resolves.toBe(1);
    await expect(resetMapObservationRequests(prisma)).resolves.toBe(1);

    const requested = await prisma.mapEventObservation.findUniqueOrThrow({
      where: { eventId: 'requested' },
    });
    expect(requested).toMatchObject({
      lastRequestedAt: null,
      lastOutcome: null,
      nextReconcileAt: null,
      displayName: 'Event',
      summaryFingerprint: 'fingerprint',
    });
  });
});
