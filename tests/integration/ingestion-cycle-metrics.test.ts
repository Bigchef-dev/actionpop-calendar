import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresCalendarDatasetRepository } from '../../packages/core/src/persistence/postgres-calendar-repository.js';
import { PostgresCycleMetrics } from '../../packages/core/src/persistence/postgres-cycle-metrics.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_ingestion_cycle_metrics' });
const repository = new PostgresCalendarDatasetRepository(harness.prisma);
const metrics = new PostgresCycleMetrics(harness.prisma);

const PERIOD = '2026-10-29T10:00:00.000Z';
const NEXT = '2026-10-29T10:15:00.000Z';

beforeEach(async () => {
  await harness.prisma.ingestionCycleMetric.deleteMany();
  await harness.prisma.eventObservation.deleteMany();
  await harness.prisma.eventGroupLink.deleteMany();
  await harness.prisma.calendarSnapshot.deleteMany();
  await harness.prisma.eventRecord.deleteMany();
  await harness.prisma.processingPeriod.deleteMany();
  await harness.prisma.groupScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

function event(sourceEventId: string, groups: string[], extra: Record<string, unknown> = {}) {
  return {
    id: sourceEventId,
    sourceEventId,
    name: `Event ${sourceEventId}`,
    startTime: '2026-10-20T10:00:00+02:00',
    endTime: '2026-10-20T11:00:00+02:00',
    location: null,
    contentHash: `hash-${sourceEventId}`,
    sequence: 0,
    groups: groups.map((id) => ({ id })),
    ...extra,
  };
}

function publish(events: ReturnType<typeof event>[], revision: number, periodToken = PERIOD) {
  return repository.saveCurrent({
    scopeId: 'listing-1',
    revision,
    generatedAt: '2026-10-29T10:00:00.000Z',
    periodToken,
    events: events as never,
    status: 'complete',
  });
}

describe('per-cycle operator metrics', () => {
  it('counts discoveries, blank identifiers, no-group events and added attributions', async () => {
    await publish(
      [
        event('event-1', ['group-a'], { blankGroupIdentifiers: 2 }),
        event('event-2', []),
      ],
      1,
    );

    const reading = await metrics.read(PERIOD);
    expect(reading?.metrics).toEqual({
      'attributions.added': 1,
      'events.without_group': 1,
      'groups.blank_identifier': 2,
      'groups.discovered_unlisted': 1,
    });
  });

  it('reports zero changes when the same source data is replayed', async () => {
    await publish([event('event-1', ['group-a'])], 1);
    const before = await metrics.read(PERIOD);

    await publish([event('event-1', ['group-a'])], 2, NEXT);
    const after = await metrics.read(NEXT);

    expect(after?.metrics['attributions.added']).toBeUndefined();
    expect(after?.metrics['attributions.removed']).toBeUndefined();
    expect(before?.metrics['attributions.added']).toBe(1);
  });

  it('counts a removal when a complete observation stops stating a group', async () => {
    await publish([event('event-1', ['group-a', 'group-b'])], 1);
    await publish([event('event-1', ['group-a'])], 2, NEXT);

    const reading = await metrics.read(NEXT);
    expect(reading?.metrics['attributions.removed']).toBe(1);
  });

  it('writes nothing when the publication fails', async () => {
    await publish([event('event-1', ['group-a'])], 1);
    const before = await harness.prisma.ingestionCycleMetric.findMany();

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(
      publish(
        [event('event-2', ['group-b'], { geography: { geographicStatus: 'national', diagnostics: [circular] } })],
        2,
        NEXT,
      ),
    ).rejects.toThrow();

    const after = await harness.prisma.ingestionCycleMetric.findMany();
    expect(after).toHaveLength(before.length);
  });

  it('exposes the previous cycle for the dispatcher report', async () => {
    await publish([event('event-1', ['group-a'])], 1);

    const previous = await metrics.latestBefore(NEXT);
    expect(previous?.periodToken).toBe(PERIOD);
    expect(await metrics.latestBefore(PERIOD)).toBeUndefined();
  });
});
