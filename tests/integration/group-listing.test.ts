import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresGroupListing } from '../../packages/core/src/persistence/postgres-group-listing.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_group_listing' });
const listing = new PostgresGroupListing(harness.prisma);

const VERSION = 'communes-20261028-listing-fixture';

interface SeedOptions {
  readonly scopeId: string;
  readonly name?: string | null;
  readonly mapStatus?: string;
  readonly retrievalStatus?: string;
  readonly referenceVersion?: string | null;
  readonly communeId?: string | null;
  readonly departmentCode?: string | null;
  readonly countryCode?: string | null;
  readonly status?: string | null;
}

async function seedGroup(options: SeedOptions): Promise<void> {
  await harness.prisma.ingestionScope.create({
    data: {
      scopeId: options.scopeId,
      scopeKey: options.scopeId,
      scopeKind: 'group',
      displayName: options.name === undefined ? `Group ${options.scopeId}` : options.name,
      mapStatus: options.mapStatus ?? 'listed',
      retrievalStatus: options.retrievalStatus ?? 'active',
      referenceVersion: options.referenceVersion === undefined ? VERSION : options.referenceVersion,
      communeId: options.communeId ?? null,
      departmentCode: options.departmentCode ?? null,
      countryCode: options.countryCode ?? 'FR',
      geographicStatus: options.status ?? 'resolved',
      enrichedAt: new Date(),
    },
  });
}

beforeEach(async () => {
  await harness.prisma.ingestionLedger.deleteMany();
  await harness.prisma.ingestionScope.deleteMany();
  await harness.prisma.geographicReferenceVersion.deleteMany();
  await harness.prisma.geographicReferenceVersion.create({
    data: {
      version: VERSION,
      status: 'active',
      source: 'fixture',
      publicationDate: '2026-10-28',
      ingestedAt: new Date('2026-10-28T00:00:00Z'),
      license: 'Open Licence',
      communeCount: 2,
      departmentCount: 1,
      checksum: 'fixture',
    },
  });
});

afterAll(async () => {
  await harness.stop();
});

describe('group territory listing', () => {
  it('returns the groups attached to the requested department', async () => {
    await seedGroup({ scopeId: 'a-inside', departmentCode: '69', communeId: '69123' });
    await seedGroup({ scopeId: 'b-outside', departmentCode: '42', communeId: '42218' });

    const result = await listing.list(
      { department: '69', referenceVersion: VERSION },
      { limit: 50, offset: 0 },
    );

    expect(result.items.map((item) => item.id)).toEqual(['a-inside']);
    expect(result.total).toBe(1);
    expect(result.referenceVersion).toBe(VERSION);
    expect(result.items[0]?.calendar).toEqual({
      path: '/calendar.ics',
      params: { group: 'a-inside' },
    });
  });

  it('returns each group once when it matches several values of one parameter', async () => {
    await seedGroup({ scopeId: 'shared', communeId: '69123', departmentCode: '69' });

    const result = await listing.list(
      { communeIds: ['69123', '69124'], referenceVersion: VERSION },
      { limit: 50, offset: 0 },
    );

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('excludes unlisted, inactive, nameless and stale-version groups', async () => {
    await seedGroup({ scopeId: 'listed', departmentCode: '69' });
    await seedGroup({ scopeId: 'unlisted', departmentCode: '69', mapStatus: 'unlisted' });
    await seedGroup({
      scopeId: 'inactive',
      departmentCode: '69',
      retrievalStatus: 'stopped_inactive',
    });
    await seedGroup({ scopeId: 'removed', departmentCode: '69', mapStatus: 'removed' });
    await seedGroup({ scopeId: 'nameless', departmentCode: '69', name: null });
    await seedGroup({ scopeId: 'stale', departmentCode: '69', referenceVersion: 'communes-old' });

    const result = await listing.list(
      { department: '69', referenceVersion: VERSION },
      { limit: 50, offset: 0 },
    );

    expect(result.items.map((item) => item.id)).toEqual(['listed']);
  });

  it('orders by published name and then identifier', async () => {
    await seedGroup({ scopeId: 'c', name: 'Charlie', departmentCode: '69' });
    await seedGroup({ scopeId: 'a', name: 'Alpha', departmentCode: '69' });
    await seedGroup({ scopeId: 'b', name: 'Bravo', departmentCode: '69' });

    const result = await listing.list(
      { department: '69', referenceVersion: VERSION },
      { limit: 50, offset: 0 },
    );

    expect(result.items.map((item) => item.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });
});

describe('group listing boundary honesty', () => {
  it('never returns a group whose attachment could not be resolved for a commune criterion', async () => {
    await seedGroup({ scopeId: 'no-coords', communeId: null, status: 'invalid' });
    await seedGroup({ scopeId: 'outside', communeId: null, status: 'incomplete' });
    await seedGroup({ scopeId: 'boundary', communeId: null, status: 'ambiguous' });
    await seedGroup({ scopeId: 'resolved', communeId: '69123' });

    const result = await listing.list(
      { communeIds: ['69123'], referenceVersion: VERSION },
      { limit: 50, offset: 0 },
    );

    expect(result.items.map((item) => item.id)).toEqual(['resolved']);
  });

  it('keeps an unresolved group visible under its country only', async () => {
    await seedGroup({
      scopeId: 'foreign',
      communeId: null,
      status: 'international',
      countryCode: 'GP',
    });

    const result = await listing.list(
      { country: 'GP', referenceVersion: VERSION },
      { limit: 50, offset: 0 },
    );

    expect(result.items.map((item) => item.id)).toEqual(['foreign']);
    expect(result.items[0]?.communeId).toBeNull();
  });

  it('returns a group once when it matches both its commune and its department', async () => {
    await seedGroup({ scopeId: 'both', communeId: '69123', departmentCode: '69' });

    const result = await listing.list(
      { department: '69', communeIds: ['69123'], referenceVersion: VERSION },
      { limit: 50, offset: 0 },
    );

    expect(result.items).toHaveLength(1);
  });

  it('answers nothing when no reference version is active', async () => {
    await harness.prisma.geographicReferenceVersion.updateMany({ data: { status: 'superseded' } });

    expect(await listing.findActiveVersion()).toBeNull();
  });
});

describe('group listing paging', () => {
  const SEEDED = 120;

  beforeEach(async () => {
    for (let index = 0; index < SEEDED; index += 1) {
      const suffix = String(index).padStart(3, '0');
      await seedGroup({ scopeId: `bulk-${suffix}`, name: `Group ${suffix}`, communeId: '69123' });
    }
  });

  it('never duplicates or omits a group across pages', async () => {
    const first = await listing.list(
      { communeIds: ['69123'], referenceVersion: VERSION },
      { limit: 50, offset: 0 },
    );
    const second = await listing.list(
      { communeIds: ['69123'], referenceVersion: VERSION },
      { limit: 50, offset: 50 },
    );
    const third = await listing.list(
      { communeIds: ['69123'], referenceVersion: VERSION },
      { limit: 50, offset: 100 },
    );

    const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);

    expect(first.total).toBe(SEEDED);
    expect(ids).toHaveLength(SEEDED);
    expect(new Set(ids).size).toBe(SEEDED);
    expect(third.items).toHaveLength(20);
  });

  it('returns an identical order for two identical reads', async () => {
    const first = await listing.list(
      { communeIds: ['69123'], referenceVersion: VERSION },
      { limit: 25, offset: 25 },
    );
    const second = await listing.list(
      { communeIds: ['69123'], referenceVersion: VERSION },
      { limit: 25, offset: 25 },
    );

    expect(first.items.map((item) => item.id)).toEqual(second.items.map((item) => item.id));
  });
});
