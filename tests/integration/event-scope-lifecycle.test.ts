import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresCalendarDatasetRepository } from '../../packages/core/src/persistence/postgres-calendar-repository.js';
import { retireEndedEventScopes } from '../../packages/core/src/persistence/postgres-event-scopes.js';
import { PostgresGroupRegistry } from '../../packages/core/src/persistence/postgres-group-registry.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_event_scope_lifecycle' });
const repository = new PostgresCalendarDatasetRepository(harness.prisma);
const registry = new PostgresGroupRegistry(harness.prisma);

const PERIOD = '2026-10-29T10:00:00.000Z';
const OBSERVED_AT = '2026-10-29T10:00:00.000Z';

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

function publishedEvent(
  sourceEventId: string,
  groups: string[],
  endTime = '2026-10-30T12:00:00.000Z',
) {
  return {
    id: sourceEventId,
    sourceEventId,
    name: `Event ${sourceEventId}`,
    startTime: '2026-10-30T10:00:00.000Z',
    endTime,
    location: null,
    contentHash: `hash-${sourceEventId}`,
    sequence: 0,
    groups: groups.map((id) => ({ id })),
  };
}

async function publish(scopeId: string, events: ReturnType<typeof publishedEvent>[], revision = 1) {
  return repository.saveCurrent({
    scopeId,
    revision,
    generatedAt: OBSERVED_AT,
    periodToken: PERIOD,
    events: events as never,
    status: 'complete',
  });
}

async function eventScopes() {
  return harness.prisma.ingestionScope.findMany({
    where: { scopeKind: 'event' },
    orderBy: { scopeId: 'asc' },
  });
}

describe('event scope discovery', () => {
  it('requests one event ingestion for a group-less upcoming event', async () => {
    await publish('listing-1', [publishedEvent('event-1', [])]);

    const scopes = await eventScopes();
    expect(scopes).toHaveLength(1);
    expect(scopes[0]).toMatchObject({
      scopeId: 'event-1',
      scopeKind: 'event',
      mapStatus: 'not_applicable',
      retrievalStatus: 'pending',
      discoverySource: 'event_payload',
    });
    expect(scopes[0]?.eventEndsAt?.toISOString()).toBe('2026-10-30T12:00:00.000Z');
    expect(scopes[0]?.firstObservedAt).toBeInstanceOf(Date);
  });

  it('requests none for an event that states a group', async () => {
    await publish('listing-1', [publishedEvent('event-1', ['group-b'])]);

    expect(await eventScopes()).toHaveLength(0);
  });

  it('requests none for a group-less event that has already ended, and still publishes it', async () => {
    await publish('listing-1', [publishedEvent('event-1', [], '2026-10-28T12:00:00.000Z')]);

    expect(await eventScopes()).toHaveLength(0);
    const event = await harness.prisma.eventRecord.findUnique({
      where: { sourceEventId: 'event-1' },
    });
    expect(event?.groupAttribution).toBe('none_stated');
  });

  it('creates nothing more when the same listing is replayed', async () => {
    await publish('listing-1', [publishedEvent('event-1', [])], 1);
    const replay = await publish('listing-1', [publishedEvent('event-1', [])], 2);

    expect(replay.eventScopesCreated).toBe(0);
    expect(await eventScopes()).toHaveLength(1);
  });
});

describe('event scope deduplication', () => {
  it('creates one ingestion when two listings return the same group-less event', async () => {
    await publish('listing-1', [publishedEvent('event-1', [])], 1);
    await publish('listing-2', [publishedEvent('event-1', [])], 1);

    const scopes = await eventScopes();
    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.scopeId).toBe('event-1');
  });

  it('keeps the ingestion scheduled when an observation states no group', async () => {
    // One listing attributes the event to a group, the other states none for it.
    await publish('listing-1', [publishedEvent('event-1', ['group-b'])], 1);
    const discovery = await publish('listing-2', [publishedEvent('event-1', [])], 1);

    const [scope] = await eventScopes();
    expect(discovery.eventScopesCreated).toBe(1);
    expect(discovery.eventScopesRetired).toBe(0);
    expect(scope).toMatchObject({ retrievalStatus: 'pending', stoppedReason: null });

    const replay = await publish('listing-2', [publishedEvent('event-1', [])], 2);
    expect(replay.eventScopesRetired).toBe(0);
    expect((await eventScopes())[0]?.retrievalStatus).toBe('pending');
  });

  it('refreshes the end time of a rescheduled event without changing its state', async () => {
    await publish('listing-1', [publishedEvent('event-1', [], '2026-10-30T12:00:00.000Z')], 1);
    await harness.prisma.ingestionScope.update({
      where: { scopeId: 'event-1' },
      data: { retrievalStatus: 'active' },
    });

    const second = await publish(
      'listing-1',
      [publishedEvent('event-1', [], '2026-11-05T12:00:00.000Z')],
      2,
    );

    const scope = (await eventScopes())[0];
    expect(scope?.eventEndsAt?.toISOString()).toBe('2026-11-05T12:00:00.000Z');
    expect(scope?.retrievalStatus).toBe('active');
    expect(second.eventScopesCreated).toBe(0);
    expect(await eventScopes()).toHaveLength(1);
  });

  it('reopens the same ingestion when the event stops stating a group again', async () => {
    await publish('listing-1', [publishedEvent('event-1', ['group-b'])], 1);
    expect(await eventScopes()).toHaveLength(0);

    await publish('listing-1', [publishedEvent('event-1', [])], 2);
    const [scope] = await eventScopes();
    expect(scope?.retrievalStatus).toBe('pending');

    await harness.prisma.ingestionScope.update({
      where: { scopeId: 'event-1' },
      data: { retrievalStatus: 'retired', stoppedReason: 'event_group_stated' },
    });
    const third = await publish('listing-2', [publishedEvent('event-1', [])], 1);

    const reopened = (await eventScopes())[0];
    expect(third.eventScopesCreated).toBe(0);
    expect(reopened).toMatchObject({ retrievalStatus: 'pending', stoppedReason: null });
    expect(await eventScopes()).toHaveLength(1);
  });
});

describe('event scope re-qualification', () => {
  it('retires on a stated group and re-opens the same row when the group disappears', async () => {
    // A listing attributes the event, so the calendar has a link that survives everything.
    await publish('listing-1', [publishedEvent('event-1', ['group-b'])], 1);
    const discovery = await publish('listing-2', [publishedEvent('event-1', [])], 1);
    expect(discovery).toMatchObject({ eventScopesCreated: 1, eventScopesRetired: 0 });

    const stated = await repository.saveCurrent({
      scopeId: 'event-1',
      scopeKind: 'event',
      revision: 1,
      generatedAt: OBSERVED_AT,
      periodToken: PERIOD,
      events: [publishedEvent('event-1', ['group-c'])] as never,
      status: 'complete',
    });
    expect(stated.eventScopesRetired).toBe(1);
    expect((await eventScopes())[0]).toMatchObject({
      retrievalStatus: 'retired',
      stoppedReason: 'event_group_stated',
    });

    const reopened = await publish('listing-2', [publishedEvent('event-1', [])], 2);
    expect(reopened).toMatchObject({ eventScopesCreated: 0, eventScopesRetired: 0 });
    expect((await eventScopes())[0]).toMatchObject({
      retrievalStatus: 'pending',
      stoppedReason: null,
      stoppedAt: null,
    });
    expect(await eventScopes()).toHaveLength(1);
    expect(
      (await harness.prisma.eventGroupLink.findMany({ orderBy: { scopeId: 'asc' } })).map(
        (link) => link.scopeId,
      ),
    ).toEqual(['group-b', 'group-c']);
  });
});

describe('event scope retirement on end', () => {
  it('retires an event ingestion whose event has ended, keeping the event', async () => {
    await publish('listing-1', [publishedEvent('event-1', [])]);

    const retired = await retireEndedEventScopes(
      harness.prisma,
      new Date('2026-10-31T00:00:00.000Z'),
    );

    expect(retired).toBe(1);
    const scope = (await eventScopes())[0];
    expect(scope).toMatchObject({
      retrievalStatus: 'retired',
      stoppedReason: 'event_ended',
    });
    expect(scope?.stoppedAt).toBeInstanceOf(Date);
    expect(await harness.prisma.eventRecord.count()).toBe(1);
    expect(await harness.prisma.eventObservation.count()).toBe(1);
  });

  it('leaves an upcoming event ingestion scheduled', async () => {
    await publish('listing-1', [publishedEvent('event-1', [])]);

    expect(await retireEndedEventScopes(harness.prisma, new Date('2026-10-29T12:00:00.000Z'))).toBe(
      0,
    );
    expect((await eventScopes())[0]?.retrievalStatus).toBe('pending');
  });

  it('refreshes the end time of a scope whose detail reading reports an earlier end', async () => {
    await publish('listing-1', [publishedEvent('event-1', [], '2026-11-10T12:00:00.000Z')]);
    await harness.prisma.ingestionScope.update({
      where: { scopeId: 'event-1' },
      data: { retrievalStatus: 'active' },
    });

    const summary = await repository.saveCurrent({
      scopeId: 'event-1',
      scopeKind: 'event',
      revision: 1,
      generatedAt: OBSERVED_AT,
      periodToken: PERIOD,
      events: [publishedEvent('event-1', [], '2026-10-28T12:00:00.000Z')] as never,
      status: 'complete',
    });

    const scope = (await eventScopes())[0];
    expect(scope?.eventEndsAt?.toISOString()).toBe('2026-10-28T12:00:00.000Z');
    expect(scope).toMatchObject({ retrievalStatus: 'retired', stoppedReason: 'event_ended' });
    expect(summary.eventScopesRetired).toBe(1);
    expect(await harness.prisma.eventRecord.count()).toBe(1);
  });

  it('keeps the end time current without retiring an event that has not ended', async () => {
    await publish('listing-1', [publishedEvent('event-1', [], '2026-10-30T12:00:00.000Z')]);
    await harness.prisma.ingestionScope.update({
      where: { scopeId: 'event-1' },
      data: { retrievalStatus: 'active' },
    });

    const summary = await repository.saveCurrent({
      scopeId: 'event-1',
      scopeKind: 'event',
      revision: 1,
      generatedAt: OBSERVED_AT,
      periodToken: PERIOD,
      events: [publishedEvent('event-1', [], '2026-11-20T12:00:00.000Z')] as never,
      status: 'complete',
    });

    const scope = (await eventScopes())[0];
    expect(scope?.eventEndsAt?.toISOString()).toBe('2026-11-20T12:00:00.000Z');
    expect(scope?.retrievalStatus).toBe('active');
    expect(summary.eventScopesRetired).toBe(0);
    expect(await retireEndedEventScopes(harness.prisma, new Date('2026-10-31T00:00:00.000Z'))).toBe(
      0,
    );
  });

  it('never retires a group scope', async () => {
    await registry.bootstrapScope('group-b');

    expect(await retireEndedEventScopes(harness.prisma, new Date('2030-01-01T00:00:00.000Z'))).toBe(
      0,
    );
    const group = await harness.prisma.ingestionScope.findUnique({ where: { scopeId: 'group-b' } });
    expect(group?.retrievalStatus).toBe('pending');
  });
});
