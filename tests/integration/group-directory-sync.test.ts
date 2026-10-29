import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresGroupCatalogueRepository } from '../../apps/worker/src/catalogue/group-catalogue.js';
import { PostgresGroupRegistry } from '../../packages/core/src/persistence/postgres-group-registry.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_group_directory' });
const catalogue = new PostgresGroupCatalogueRepository(harness.prisma);
const registry = new PostgresGroupRegistry(harness.prisma);

beforeEach(async () => {
  await harness.prisma.ingestionLedger.deleteMany();
  await harness.prisma.groupScope.deleteMany();
});

afterAll(async () => {
  await harness.stop();
});

async function group(scopeId: string) {
  return harness.prisma.groupScope.findUnique({ where: { scopeId } });
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

    const listed = await harness.prisma.groupScope.findMany({
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
