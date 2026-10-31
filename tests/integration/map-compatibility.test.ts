import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { MapEventSummary } from '../../packages/core/src/adapters/action-populaire-schemas.js';
import { PostgresCalendarDatasetRepository } from '../../packages/core/src/persistence/postgres-calendar-repository.js';
import {
  recordListing,
  selectGapCandidates,
} from '../../packages/core/src/persistence/postgres-map-discovery.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_map_compatibility' });
const repository = new PostgresCalendarDatasetRepository(harness.prisma);
const now = new Date('2026-10-31T00:00:00.000Z');
const PERIOD = '2026-10-31T00:00:00.000Z';

beforeEach(async () => {
  await harness.prisma.mapEventObservation.deleteMany();
  await harness.prisma.ingestionCycleMetric.deleteMany();
  await harness.prisma.eventObservation.deleteMany();
  await harness.prisma.eventGroupLink.deleteMany();
  await harness.prisma.calendarSnapshot.deleteMany();
  await harness.prisma.eventRecord.deleteMany();
  await harness.prisma.processingPeriod.deleteMany();
  await harness.prisma.ingestionLedger.deleteMany();
  await harness.prisma.ingestionScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

function publishedEvent() {
  return {
    id: 'event-1',
    sourceEventId: 'event-1',
    name: 'Canonical name',
    startTime: '2027-10-23T16:00:00.000Z',
    endTime: '2027-10-23T18:00:00.000Z',
    location: null,
    contentHash: 'hash-1',
    sequence: 0,
    groups: [{ id: 'group-1' }],
  };
}

function mapSummary(overrides: Partial<MapEventSummary> = {}): MapEventSummary {
  return {
    id: 'event-1',
    name: 'Map name that must not win',
    start_time: '2027-10-23T17:00:00+02:00',
    end_time: '2027-10-23T19:00:00+02:00',
    subtype: 7,
    ...overrides,
  };
}

async function publish() {
  return repository.saveCurrent({
    scopeId: 'group-1',
    revision: 1,
    generatedAt: PERIOD,
    periodToken: PERIOD,
    events: [publishedEvent()] as never,
    status: 'complete',
  });
}

describe('map discovery compatibility', () => {
  it('never lets a map summary overwrite a canonical event', async () => {
    await publish();
    const before = await harness.prisma.eventRecord.findUnique({
      where: { sourceEventId: 'event-1' },
    });

    await recordListing(harness.prisma, [mapSummary()], now);
    await selectGapCandidates(harness.prisma, [mapSummary()], {
      now,
      freshnessHorizonMs: 3_600_000,
    });

    const after = await harness.prisma.eventRecord.findUnique({
      where: { sourceEventId: 'event-1' },
    });
    expect(after).toMatchObject({
      summary: before?.summary,
      startTime: before?.startTime,
      endTime: before?.endTime,
      status: 'ACTIVE',
    });
  });

  it('does not cancel or remove an event absent from the listing', async () => {
    await publish();

    await recordListing(harness.prisma, [], now);

    const event = await harness.prisma.eventRecord.findUnique({
      where: { sourceEventId: 'event-1' },
    });
    expect(event?.status).toBe('ACTIVE');
    expect(await harness.prisma.eventRecord.count({ where: { sourceEventId: 'event-1' } })).toBe(1);
  });

  it('keeps one canonical event for an identity observed by both sources', async () => {
    await publish();
    await recordListing(harness.prisma, [mapSummary()], now);

    expect(await harness.prisma.eventRecord.count({ where: { sourceEventId: 'event-1' } })).toBe(1);
  });
});
