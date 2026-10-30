import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresGroupCatalogueRepository } from '../../apps/worker/src/catalogue/group-catalogue.js';
import {
  requestEventScopes,
  retireUnknownEventScope,
} from '../../packages/core/src/persistence/postgres-event-scopes.js';
import { countEventScopes } from '../../packages/core/src/persistence/postgres-scope-queries.js';
import { PostgresGroupRegistry } from '../../packages/core/src/persistence/postgres-group-registry.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_group_directory' });
const catalogue = new PostgresGroupCatalogueRepository(harness.prisma);
const registry = new PostgresGroupRegistry(harness.prisma);

beforeEach(async () => {
  await harness.prisma.ingestionLedger.deleteMany();
  await harness.prisma.ingestionScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

async function group(scopeId: string) {
  return harness.prisma.ingestionScope.findUnique({ where: { scopeId } });
}

describe('map directory synchronisation', () => {
  it('records listed and inactive groups with explicit statuses', async () => {
    await catalogue.synchronize([
      { id: 'group-listed', name: 'Listed', is_active: true },
      { id: 'group-inactive', name: 'Inactive', is_active: false },
    ]);

    expect(await group('group-listed')).toMatchObject({
      displayName: 'Listed',
      mapStatus: 'listed',
      retrievalStatus: 'active',
      discoverySource: 'directory',
    });
    expect(await group('group-inactive')).toMatchObject({
      mapStatus: 'inactive',
      retrievalStatus: 'stopped_inactive',
    });
    expect(await catalogue.activeScopes()).toEqual(['group-listed']);
  });

  it('marks a group absent from a complete directory as removed but keeps retrieving it', async () => {
    await catalogue.synchronize([{ id: 'group-listed', name: 'Listed', is_active: true }]);
    await catalogue.synchronize([{ id: 'group-other', name: 'Other', is_active: true }]);

    expect(await group('group-listed')).toMatchObject({
      mapStatus: 'removed',
      retrievalStatus: 'active',
    });
  });

  it('keeps one scope when a discovered group later appears on the map', async () => {
    await registry.bootstrapScope('group-discovered');
    const discovered = await group('group-discovered');
    expect(discovered).toMatchObject({
      mapStatus: 'unlisted',
      retrievalStatus: 'pending',
      discoverySource: 'event_payload',
    });

    await catalogue.synchronize([{ id: 'group-discovered', name: 'Now listed', is_active: true }]);

    const listed = await harness.prisma.ingestionScope.findMany({
      where: { scopeId: 'group-discovered' },
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      mapStatus: 'listed',
      retrievalStatus: 'active',
      discoverySource: 'event_payload',
    });
  });

  it('restores a group stopped for an unknown answer when the directory lists it', async () => {
    await catalogue.synchronize([{ id: 'group-listed', name: 'Listed', is_active: true }]);
    await registry.markStoppedUnknown('group-listed', 'upstream_unknown_group', new Date());
    expect(await group('group-listed')).toMatchObject({
      retrievalStatus: 'stopped_unknown',
      stoppedReason: 'upstream_unknown_group',
    });

    await catalogue.synchronize([{ id: 'group-listed', name: 'Listed', is_active: true }]);

    expect(await group('group-listed')).toMatchObject({
      retrievalStatus: 'active',
      stoppedReason: null,
    });
  });

  it('records when the map directory stopped a group', async () => {
    await catalogue.synchronize([{ id: 'group-listed', name: 'Listed', is_active: true }]);

    await catalogue.synchronize([{ id: 'group-listed', name: 'Listed', is_active: false }]);

    const inactive = await group('group-listed');
    expect(inactive).toMatchObject({
      mapStatus: 'inactive',
      retrievalStatus: 'stopped_inactive',
      stoppedReason: 'map_inactive',
    });
    expect(inactive?.stoppedAt).toBeInstanceOf(Date);
  });

  it('does not treat an explicit inactive entry as a discovery', async () => {
    await catalogue.synchronize([{ id: 'group-inactive', name: 'Inactive', is_active: false }]);

    await registry.registerObservedGroups([{ id: 'group-inactive' }], new Date());

    expect(await group('group-inactive')).toMatchObject({
      mapStatus: 'inactive',
      retrievalStatus: 'stopped_inactive',
    });
  });
});

describe('promotion ceiling', () => {
  it('promotes pending groups oldest first and at most the requested number', async () => {
    const earlier = new Date('2026-10-29T09:00:00.000Z');
    const later = new Date('2026-10-29T09:30:00.000Z');
    await registry.registerObservedGroups([{ id: 'group-2' }], later);
    await registry.registerObservedGroups([{ id: 'group-1' }], earlier);

    expect(await registry.promotePendingScopes(1)).toEqual(['group-1']);
    expect((await group('group-2'))?.retrievalStatus).toBe('pending');

    expect(await registry.promotePendingScopes(10)).toEqual(['group-2']);
    expect(await registry.promotePendingScopes(10)).toEqual([]);
  });
});

describe('kind isolation', () => {
  async function seedEventScope(eventId: string) {
    await requestEventScopes(
      harness.prisma,
      [
        {
          eventId,
          displayName: 'Event',
          endTime: '2026-12-01T12:00:00.000Z',
        },
      ],
      new Date('2026-10-29T10:00:00.000Z'),
    );
  }

  it('leaves every event scope untouched during a complete directory synchronisation', async () => {
    await seedEventScope('event-1');
    const before = await harness.prisma.ingestionScope.findUnique({
      where: { scopeId: 'event-1' },
    });

    await catalogue.synchronize([{ id: 'group-listed', name: 'Listed', is_active: true }]);
    await catalogue.synchronize([{ id: 'group-other', name: 'Other', is_active: false }]);

    const after = await harness.prisma.ingestionScope.findUnique({
      where: { scopeId: 'event-1' },
    });
    expect(after).toMatchObject({
      scopeKind: 'event',
      mapStatus: 'not_applicable',
      retrievalStatus: before?.retrievalStatus,
      eventEndsAt: before?.eventEndsAt,
    });
  });

  it('counts groups and event scopes apart', async () => {
    await seedEventScope('event-1');
    await retireUnknownEventScope(harness.prisma, 'event-1', new Date());
    await catalogue.synchronize([{ id: 'group-listed', name: 'Listed', is_active: true }]);

    expect(await registry.counts()).toEqual({
      active: 1,
      pending: 0,
      unlisted: 0,
      stopped: 0,
    });
    expect(await countEventScopes(harness.prisma)).toEqual({ pending: 0, active: 0, retired: 1 });
  });

  it('never exposes an event ingestion through the group catalogue', async () => {
    await seedEventScope('event-1');
    await harness.prisma.ingestionScope.update({
      where: { scopeId: 'event-1' },
      data: { retrievalStatus: 'active' },
    });

    expect(await catalogue.activeScopes()).toEqual([]);
    expect(await catalogue.get('event-1')).toBeUndefined();
    expect((await registry.activeScopes()).map((scope) => scope.scopeKind)).toEqual(['event']);
  });
});
