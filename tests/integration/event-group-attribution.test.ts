import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresCalendarDatasetRepository } from '../../packages/core/src/persistence/postgres-calendar-repository.js';
import { PostgresCycleMetrics } from '../../packages/core/src/persistence/postgres-cycle-metrics.js';
import { PostgresGroupRegistry } from '../../packages/core/src/persistence/postgres-group-registry.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_event_group_attribution' });
const repository = new PostgresCalendarDatasetRepository(harness.prisma);

beforeEach(async () => {
  await harness.prisma.ingestionCycleMetric.deleteMany();
  await harness.prisma.eventObservation.deleteMany();
  await harness.prisma.eventGroupLink.deleteMany();
  await harness.prisma.calendarSnapshot.deleteMany();
  await harness.prisma.eventRecord.deleteMany();
  await harness.prisma.processingPeriod.deleteMany();
  await harness.prisma.ingestionScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

const PERIOD = '2026-10-29T10:00:00.000Z';

function publishedEvent(
  sourceEventId: string,
  groups: string[],
  extra: Record<string, unknown> = {},
) {
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

async function publish(scopeId: string, events: ReturnType<typeof publishedEvent>[], revision = 1) {
  return repository.saveCurrent({
    scopeId,
    revision,
    generatedAt: '2026-10-29T10:00:00.000Z',
    periodToken: PERIOD,
    events: events as never,
    status: 'complete',
  });
}

async function attributionOf(eventId: string) {
  const links = await harness.prisma.eventGroupLink.findMany({
    where: { eventId },
    orderBy: [{ scopeId: 'asc' }, { observedViaScopeId: 'asc' }],
  });
  return links.map((link) => `${link.scopeId}<-${link.observedViaScopeId}`);
}

describe('event attribution from the source payload', () => {
  it('attributes an event to the stated groups, never to the retrieving listing', async () => {
    await publish('listing-a', [publishedEvent('event-1', ['group-b', 'group-c'])]);

    expect(await attributionOf('event-1')).toEqual(['group-b<-listing-a', 'group-c<-listing-a']);

    const groups = await harness.prisma.ingestionScope.findMany({ orderBy: { scopeId: 'asc' } });
    expect(groups.map((group) => group.scopeId)).toEqual(['group-b', 'group-c', 'listing-a']);
    const discovered = groups.filter((group) => group.scopeId !== 'listing-a');
    expect(discovered.map((group) => group.retrievalStatus)).toEqual(['pending', 'pending']);
    expect(discovered.map((group) => group.mapStatus)).toEqual(['unlisted', 'unlisted']);
    expect(harness.prisma.ingestionScope.findMany).toBeDefined();
  });

  it('unions the observations and removes only the contribution that stopped stating a group', async () => {
    await publish('listing-1', [publishedEvent('event-1', ['group-b'])], 1);
    await publish('listing-2', [publishedEvent('event-1', ['group-b', 'group-c'])], 1);
    expect(await attributionOf('event-1')).toEqual([
      'group-b<-listing-1',
      'group-b<-listing-2',
      'group-c<-listing-2',
    ]);

    await publish('listing-1', [publishedEvent('event-1', ['group-c'])], 2);
    expect(await attributionOf('event-1')).toEqual([
      'group-b<-listing-2',
      'group-c<-listing-1',
      'group-c<-listing-2',
    ]);

    await publish('listing-2', [publishedEvent('event-1', ['group-c'])], 2);
    expect(await attributionOf('event-1')).toEqual(['group-c<-listing-1', 'group-c<-listing-2']);
  });

  it('records the observation and reports a no-group event as none_stated', async () => {
    const summary = await publish('listing-a', [publishedEvent('event-1', [])]);

    expect(summary.eventsWithoutGroup).toBe(1);
    expect(await attributionOf('event-1')).toEqual([]);
    const event = await harness.prisma.eventRecord.findUnique({
      where: { sourceEventId: 'event-1' },
    });
    expect(event?.groupAttribution).toBe('none_stated');
    const observation = await harness.prisma.eventObservation.findUnique({
      where: { eventId_viaScopeId: { eventId: 'event-1', viaScopeId: 'listing-a' } },
    });
    expect(observation?.statedGroupCount).toBe(0);
  });

  it('is idempotent when the same observation is replayed', async () => {
    await publish('listing-a', [publishedEvent('event-1', ['group-b'])], 1);
    const replay = await publish('listing-a', [publishedEvent('event-1', ['group-b'])], 2);

    expect(replay.attributionsAdded).toBe(0);
    expect(replay.attributionsRemoved).toBe(0);
    expect(await attributionOf('event-1')).toEqual(['group-b<-listing-a']);
  });

  it('keeps the previous publication when a listing fails mid-transaction', async () => {
    await publish('listing-a', [publishedEvent('event-1', ['group-b'])], 1);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const broken = publishedEvent('event-2', ['group-c'], {
      geography: { geographicStatus: 'national', diagnostics: [circular] },
    });

    await expect(publish('listing-a', [broken], 2)).rejects.toThrow();
    expect(await attributionOf('event-1')).toEqual(['group-b<-listing-a']);
    expect(await harness.prisma.eventRecord.count()).toBe(1);
    expect(await harness.prisma.calendarSnapshot.count()).toBe(1);
  });

  it('does not duplicate attribution when the same event comes through two listings', async () => {
    await publish('listing-1', [publishedEvent('event-1', ['group-b'])], 1);
    await publish('listing-2', [publishedEvent('event-1', ['group-b'])], 1);

    const links = await harness.prisma.eventGroupLink.findMany({ where: { eventId: 'event-1' } });
    expect(links).toHaveLength(2);
    const groups = await harness.prisma.ingestionScope.findMany({
      where: { scopeId: 'group-b' },
    });
    expect(groups).toHaveLength(1);
  });

  it('resolves a case-only identifier difference onto the registered scope', async () => {
    await publish('listing-1', [publishedEvent('event-1', ['Group-A'])], 1);
    const second = await publish('listing-2', [publishedEvent('event-1', ['group-a'])], 1);

    expect(second.attributionsRemoved).toBe(0);
    expect(await attributionOf('event-1')).toEqual(['Group-A<-listing-1', 'Group-A<-listing-2']);
    const groups = await harness.prisma.ingestionScope.findMany({ orderBy: { scopeId: 'asc' } });
    expect(groups.map((group) => group.scopeId)).toEqual(['Group-A', 'listing-1', 'listing-2']);
  });

  it('publishes through a listing spelled differently from its registration', async () => {
    await publish('listing-a', [publishedEvent('event-1', ['group-b'])], 1);
    const second = await publish('Listing-A', [publishedEvent('event-1', ['group-b'])], 2);

    expect(second.attributionsAdded).toBe(0);
    expect(second.attributionsRemoved).toBe(0);
    expect(await attributionOf('event-1')).toEqual(['group-b<-listing-a']);
    const snapshots = await harness.prisma.calendarSnapshot.findMany();
    expect(snapshots.map((snapshot) => snapshot.scopeId)).toEqual(['listing-a', 'listing-a']);
  });

  it('keeps an inactive group inactive even when a payload names it', async () => {
    const registry = new PostgresGroupRegistry(harness.prisma);
    await registry.bootstrapScope('group-b');
    await harness.prisma.ingestionScope.update({
      where: { scopeId: 'group-b' },
      data: { mapStatus: 'inactive', retrievalStatus: 'stopped_inactive' },
    });

    await publish('listing-a', [publishedEvent('event-1', ['group-b'])]);

    const group = await harness.prisma.ingestionScope.findUnique({ where: { scopeId: 'group-b' } });
    expect(group?.mapStatus).toBe('inactive');
    expect(group?.retrievalStatus).toBe('stopped_inactive');
    expect(await attributionOf('event-1')).toEqual(['group-b<-listing-a']);
  });

  it('re-enables a group stopped for an unknown answer when it is observed again', async () => {
    const registry = new PostgresGroupRegistry(harness.prisma);
    await registry.bootstrapScope('group-b');
    await registry.markStoppedUnknown('group-b', 'upstream_unknown_group', new Date());

    await publish('listing-a', [publishedEvent('event-1', ['group-b'])]);

    const group = await harness.prisma.ingestionScope.findUnique({ where: { scopeId: 'group-b' } });
    expect(group?.retrievalStatus).toBe('active');
    expect(group?.stoppedReason).toBeNull();
  });
});

describe('per-cycle attribution metrics', () => {
  it('records the seven counters of a cycle', async () => {
    await publish('listing-a', [
      publishedEvent('event-1', ['group-b']),
      publishedEvent('event-2', []),
    ]);

    const reading = await new PostgresCycleMetrics(harness.prisma).read(PERIOD);
    expect(reading?.metrics).toMatchObject({
      'groups.discovered_unlisted': 1,
      'events.without_group': 1,
      'attributions.added': 1,
    });
  });

  it('exposes the previous cycle to the dispatcher', async () => {
    await publish('listing-a', [publishedEvent('event-1', ['group-b'])]);

    const metrics = new PostgresCycleMetrics(harness.prisma);
    const previous = await metrics.latestBefore('2026-10-29T10:15:00.000Z');
    expect(previous?.periodToken).toBe(PERIOD);
    expect(previous?.metrics['groups.discovered_unlisted']).toBe(1);
  });
});
