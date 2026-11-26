import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresGroupCatalogueRepository } from '../../apps/worker/src/catalogue/group-catalogue.js';
import {
  PostgresGroupAttachmentRefresher,
  type GroupDetailSource,
} from '../../apps/worker/src/geography/group-attachment-refresher.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_group_attachment' });
const catalogue = new PostgresGroupCatalogueRepository(harness.prisma);

const VERSION = 'communes-20260301-address-fixture';

/** Two communes of one department, enough to tell a match from a near miss. */
const COMMUNES = [
  { code: '69123', name: 'Lyon' },
  { code: '42218', name: 'Saint-Étienne', departmentCode: '42', departmentName: 'Loire' },
];

async function seedReference(): Promise<void> {
  await harness.prisma.geographicReferenceVersion.create({
    data: {
      version: VERSION,
      status: 'active',
      source: 'fixture',
      publicationDate: '2026-03-01',
      ingestedAt: new Date('2026-03-01T00:00:00Z'),
      license: 'Open Licence',
      communeCount: COMMUNES.length,
      departmentCount: 2,
      checksum: 'fixture',
    },
  });
  await harness.prisma.departmentReference.createMany({
    data: [
      { versionId: VERSION, code: '69', name: 'Rhône', communeCount: 1 },
      { versionId: VERSION, code: '42', name: 'Loire', communeCount: 1 },
    ],
  });
  for (const commune of COMMUNES) {
    const departmentCode = commune.departmentCode ?? '69';
    await harness.prisma.communeReference.create({
      data: {
        versionId: VERSION,
        inseeCode: commune.code,
        name: commune.name,
        normalizedName: commune.name.toLowerCase(),
        pronounFreeNormalizedName: commune.name.toLowerCase(),
        postalCodes: ['69000'],
        departmentCode,
      },
    });
  }
}

function group(id: string): Record<string, unknown> {
  return { id, name: `Group ${id}`, is_active: true, location_country: 'FR' };
}

/** One detail document per group, shaped like the upstream group resource. */
class StubSource implements GroupDetailSource {
  public readonly details = new Map<string, unknown>();

  public async fetchGroupDetail(groupId: string) {
    const value = this.details.get(groupId);
    if (value === undefined) throw new Error(`no detail for ${groupId}`);
    return value as { location?: never };
  }
}

function detail(location: unknown): unknown {
  return { id: 'unused', name: 'Group', location };
}

beforeEach(async () => {
  await harness.prisma.ingestionLedger.deleteMany();
  await harness.prisma.ingestionScope.deleteMany();
  await harness.prisma.geoPoint.deleteMany();
  await harness.prisma.locationRecord.deleteMany();
  await harness.prisma.communeReference.deleteMany();
  await harness.prisma.departmentReference.deleteMany();
  await harness.prisma.geographicReferenceVersion.deleteMany();
  await seedReference();
});

afterAll(async () => {
  await harness.stop();
});

describe('group geographic attachment from a stated address', () => {
  it('resolves the commune and department of a French address', async () => {
    const source = new StubSource();
    source.details.set(
      'group-lyon',
      detail({
        zip: '69001',
        city: 'Lyon',
        departement: '69',
        country: 'FR',
        commune: { name: 'Lyon' },
        coordinates: { type: 'Point', coordinates: [4.8357, 45.764] },
      }),
    );
    await catalogue.synchronize([group('group-lyon')]);

    const outcome = await new PostgresGroupAttachmentRefresher(harness.prisma, source).refresh(
      VERSION,
    );
    const stored = await harness.prisma.ingestionScope.findUnique({
      where: { scopeId: 'group-lyon' },
    });

    expect(outcome.resolved).toBe(1);
    expect(stored).toMatchObject({
      countryCode: 'FR',
      departmentCode: '69',
      communeId: '69123',
      communeName: 'Lyon',
      departmentName: 'Rhône',
      referenceVersion: VERSION,
      geographicStatus: 'resolved',
    });
    expect(stored?.locationId).toBe('group:group-lyon');
  });

  it('stores the address and point the detail states', async () => {
    const source = new StubSource();
    source.details.set(
      'group-address',
      detail({
        zip: '42000',
        city: 'Saint-Étienne',
        departement: '42',
        country: 'FR',
        commune: { name: 'Saint-Étienne' },
        coordinates: { type: 'Point', coordinates: [4.388326, 45.43393] },
      }),
    );
    await catalogue.synchronize([group('group-address')]);

    await new PostgresGroupAttachmentRefresher(harness.prisma, source).refresh(VERSION);

    const location = await harness.prisma.locationRecord.findUnique({
      where: { locationId: 'group:group-address' },
    });
    const point = await harness.prisma.geoPoint.findUnique({
      where: { locationId: 'group:group-address' },
    });

    expect(location).toMatchObject({ ownerType: 'GROUP', zip: '42000', city: 'Saint-Étienne' });
    expect(Number(point?.latitude)).toBeCloseTo(45.43393, 5);
    expect(Number(point?.longitude)).toBeCloseTo(4.388326, 5);
  });

  it('keeps an address without a resolvable commune attached to its department only', async () => {
    const source = new StubSource();
    source.details.set(
      'group-partial',
      detail({ departement: '69', country: 'FR', commune: { name: 'Ville Inconnue' } }),
    );
    await catalogue.synchronize([group('group-partial')]);

    const outcome = await new PostgresGroupAttachmentRefresher(harness.prisma, source).refresh(
      VERSION,
    );
    const stored = await harness.prisma.ingestionScope.findUnique({
      where: { scopeId: 'group-partial' },
    });

    expect(outcome.incomplete).toBe(1);
    expect(stored).toMatchObject({ geographicStatus: 'incomplete', communeId: null });
  });

  it('keeps a foreign group international with its stated country only', async () => {
    const source = new StubSource();
    source.details.set(
      'group-overseas',
      detail({ country: 'GP', city: 'Pointe-à-Pitre', commune: { name: 'Pointe-à-Pitre' } }),
    );
    await catalogue.synchronize([group('group-overseas')]);

    const outcome = await new PostgresGroupAttachmentRefresher(harness.prisma, source).refresh(
      VERSION,
    );
    const stored = await harness.prisma.ingestionScope.findUnique({
      where: { scopeId: 'group-overseas' },
    });

    expect(outcome.international).toBe(1);
    expect(stored).toMatchObject({ geographicStatus: 'international', countryCode: 'GP' });
    expect(stored?.communeId).toBeNull();
  });

  it('counts an unreachable detail as a failure without losing the catalogue', async () => {
    const source = new StubSource();
    await catalogue.synchronize([group('group-unreadable')]);

    const outcome = await new PostgresGroupAttachmentRefresher(harness.prisma, source).refresh(
      VERSION,
    );
    const stored = await harness.prisma.ingestionScope.findUnique({
      where: { scopeId: 'group-unreadable' },
    });

    expect(outcome.failed).toBe(1);
    expect(stored).toMatchObject({ geographicStatus: null, mapStatus: 'listed' });
  });

  it('reports how far a long sequential run has advanced', async () => {
    const source = new StubSource();
    for (const scopeId of ['group-run-1', 'group-run-2', 'group-run-3']) {
      source.details.set(
        scopeId,
        detail({ departement: '69', country: 'FR', commune: { name: 'Lyon' } }),
      );
    }
    await catalogue.synchronize([group('group-run-1'), group('group-run-2'), group('group-run-3')]);
    const reports: { processed: number; total: number; failed: number }[] = [];

    await new PostgresGroupAttachmentRefresher(harness.prisma, source, {
      onProgress: (progress) => reports.push({ ...progress }),
    }).refresh(VERSION);

    expect(reports[0]).toEqual({ processed: 0, total: 3, failed: 0 });
    expect(reports.at(-1)).toEqual({ processed: 3, total: 3, failed: 0 });
  });

  it('does not re-read a fresh attachment', async () => {
    const source = new StubSource();
    source.details.set(
      'group-stable',
      detail({ departement: '69', country: 'FR', commune: { name: 'Lyon' } }),
    );
    await catalogue.synchronize([group('group-stable')]);
    const refresher = new PostgresGroupAttachmentRefresher(harness.prisma, source);

    await refresher.refresh(VERSION);
    const second = await refresher.refresh(VERSION);

    expect(second.resolved).toBe(0);
    expect(second.failed).toBe(0);
  });
});
