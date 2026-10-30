import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresCalendarDatasetRepository } from '../../packages/core/src/persistence/postgres-calendar-repository.js';
import { PostgresGroupRegistry } from '../../packages/core/src/persistence/postgres-group-registry.js';
import {
  PostgresSnapshotPublisher,
  SnapshotPublisher,
} from '../../apps/worker/src/persistence/snapshot-publisher.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_event_ingestion_publication' });
const repository = new PostgresCalendarDatasetRepository(harness.prisma);
const revisions = new SnapshotPublisher();
const publisher = new PostgresSnapshotPublisher(repository);
const registry = new PostgresGroupRegistry(harness.prisma);

const PERIOD = '2026-10-29T10:00:00.000Z';
const OBSERVED_AT = '2026-10-29T10:00:00.000Z';
const EVENT_ID = '777ed907-c8fa-4f3b-9209-9c73c6b7b23a';

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

// A detail publication stamps the wall clock, so the end time must stay in the future
// for the reading to describe an upcoming event whatever the day the suite runs.
const UPCOMING_END = '2099-01-01T12:00:00.000Z';

function incoming(name: string, groups: string[] = [], endTime = UPCOMING_END) {
  return {
    id: EVENT_ID,
    name,
    startTime: '2026-10-30T10:00:00.000Z',
    endTime,
    location: null,
    groups: groups.map((id) => ({ id })),
  };
}

async function readEvent() {
  return harness.prisma.eventRecord.findUnique({ where: { sourceEventId: EVENT_ID } });
}

describe('a detail observation of one event', () => {
  it('refreshes the content and bumps the revision exactly once', async () => {
    const first = await revisions.publish(EVENT_ID, [incoming('Tractage')], true, PERIOD);
    await publisher.publish(EVENT_ID, { ...first.snapshot, scopeKind: 'event' }, first.events);
    expect(await readEvent()).toMatchObject({ summary: 'Tractage', sequence: 0 });

    const second = await revisions.publish(EVENT_ID, [incoming('Tractage annulé')], true, PERIOD);
    await publisher.publish(EVENT_ID, { ...second.snapshot, scopeKind: 'event' }, second.events);

    expect(await readEvent()).toMatchObject({ summary: 'Tractage annulé', sequence: 1 });
  });

  it('records the observation and keeps the event as stating no group', async () => {
    const revision = await revisions.publish(EVENT_ID, [incoming('Tractage')], true, PERIOD);
    const summary = await publisher.publish(
      EVENT_ID,
      { ...revision.snapshot, scopeKind: 'event' },
      revision.events,
    );

    expect(summary.eventsWithoutGroup).toBe(1);
    expect(await readEvent()).toMatchObject({ groupAttribution: 'none_stated' });
    const observation = await harness.prisma.eventObservation.findUnique({
      where: { eventId_viaScopeId: { eventId: EVENT_ID, viaScopeId: EVENT_ID } },
    });
    expect(observation?.statedGroupCount).toBe(0);
    expect(await harness.prisma.eventGroupLink.count()).toBe(0);
  });

  it('uses the event scope as provenance and never as an attribution', async () => {
    const revision = await revisions.publish(
      EVENT_ID,
      [incoming('Tractage', ['group-b'])],
      true,
      PERIOD,
    );
    const summary = await publisher.publish(
      EVENT_ID,
      { ...revision.snapshot, scopeKind: 'event' },
      revision.events,
    );

    const links = await harness.prisma.eventGroupLink.findMany();
    expect(links.map((link) => `${link.scopeId}<-${link.observedViaScopeId}`)).toEqual([
      `group-b<-${EVENT_ID}`,
    ]);
    expect(await registry.activeScopes()).not.toContainEqual(
      expect.objectContaining({ scopeId: 'group-b' }),
    );
    expect(summary.attributionsAdded).toBe(1);
  });

  it('is idempotent when the same document is replayed', async () => {
    const first = await revisions.publish(EVENT_ID, [incoming('Tractage')], true, PERIOD);
    await publisher.publish(EVENT_ID, { ...first.snapshot, scopeKind: 'event' }, first.events);

    const replay = await revisions.publish(EVENT_ID, [incoming('Tractage')], true, PERIOD);
    const summary = await publisher.publish(
      EVENT_ID,
      { ...replay.snapshot, scopeKind: 'event' },
      replay.events,
    );

    expect(summary.attributionsAdded).toBe(0);
    expect(summary.attributionsRemoved).toBe(0);
    expect(summary.eventScopesCreated).toBe(0);
    expect(summary.eventScopesRetired).toBe(0);
  });
});

describe('attribution through a detail observation', () => {
  it('unions the groups it states and removes nothing another observation stated', async () => {
    await repository.saveCurrent({
      scopeId: 'listing-1',
      revision: 1,
      generatedAt: OBSERVED_AT,
      periodToken: PERIOD,
      events: [
        {
          id: EVENT_ID,
          sourceEventId: EVENT_ID,
          name: 'Tractage',
          startTime: '2026-10-30T10:00:00.000Z',
          endTime: '2026-10-30T12:00:00.000Z',
          location: null,
          contentHash: 'hash-listing',
          sequence: 0,
          groups: [{ id: 'group-b' }],
        } as never,
      ],
      status: 'complete',
    });

    const revision = await revisions.publish(
      EVENT_ID,
      [incoming('Tractage', ['group-c'])],
      true,
      PERIOD,
    );
    const summary = await publisher.publish(
      EVENT_ID,
      { ...revision.snapshot, scopeKind: 'event' },
      revision.events,
    );

    const links = await harness.prisma.eventGroupLink.findMany({ orderBy: { scopeId: 'asc' } });
    expect(links.map((link) => link.scopeId)).toEqual(['group-b', 'group-c']);
    expect(summary.attributionsRemoved).toBe(0);

    const scopes = await harness.prisma.ingestionScope.findMany({
      where: { scopeKind: 'event' },
    });
    expect(scopes[0]).toMatchObject({
      retrievalStatus: 'retired',
      stoppedReason: 'event_group_stated',
    });
    const group = await harness.prisma.ingestionScope.findUnique({ where: { scopeId: 'group-b' } });
    expect(group).toMatchObject({ scopeKind: 'group', retrievalStatus: 'pending' });
  });

  it('leaves the ingestion active when the detail reading states no group', async () => {
    await repository.saveCurrent({
      scopeId: 'listing-1',
      revision: 1,
      generatedAt: OBSERVED_AT,
      periodToken: PERIOD,
      events: [
        {
          id: EVENT_ID,
          sourceEventId: EVENT_ID,
          name: 'Tractage',
          startTime: '2026-10-30T10:00:00.000Z',
          endTime: '2026-10-30T12:00:00.000Z',
          location: null,
          contentHash: 'hash-listing',
          sequence: 0,
          groups: [{ id: 'group-b' }],
        } as never,
      ],
      status: 'complete',
    });
    // A second listing states no group for the same event, which is what requests the
    // event's own ingestion even though the first listing attributed it.
    await repository.saveCurrent({
      scopeId: 'listing-2',
      revision: 1,
      generatedAt: OBSERVED_AT,
      periodToken: PERIOD,
      events: [
        {
          id: EVENT_ID,
          sourceEventId: EVENT_ID,
          name: 'Tractage',
          startTime: '2026-10-30T10:00:00.000Z',
          endTime: '2026-10-30T12:00:00.000Z',
          location: null,
          contentHash: 'hash-listing-2',
          sequence: 0,
          groups: [],
        } as never,
      ],
      status: 'complete',
    });
    await harness.prisma.ingestionScope.update({
      where: { scopeId: EVENT_ID },
      data: { retrievalStatus: 'active' },
    });

    const revision = await revisions.publish(EVENT_ID, [incoming('Tractage')], true, PERIOD);
    const summary = await publisher.publish(
      EVENT_ID,
      { ...revision.snapshot, scopeKind: 'event' },
      revision.events,
    );

    // The listing still attributes the event, but this reading states no group.
    expect(await harness.prisma.eventGroupLink.count()).toBe(1);
    expect(summary.attributionsRemoved).toBe(0);
    expect(summary.eventScopesRetired).toBe(0);
    expect(
      await harness.prisma.ingestionScope.findUnique({ where: { scopeId: EVENT_ID } }),
    ).toMatchObject({ retrievalStatus: 'active', stoppedReason: null });
  });
});
