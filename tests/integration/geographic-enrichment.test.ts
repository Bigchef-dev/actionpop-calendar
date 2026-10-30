import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { normalizeGeographicName } from '../../packages/core/src/domain/geographic-identity.js';
import { PostgresCalendarDatasetRepository } from '../../packages/core/src/persistence/postgres-calendar-repository.js';
import type { PublishedEvent } from '../../packages/core/src/models/event.interface.js';
import { startIntegrationPostgres, truncateGeographicReference } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_geographic_enrichment' });
const repository = new PostgresCalendarDatasetRepository(harness.prisma);

beforeEach(async () => {
  await harness.prisma.eventRecord.deleteMany();
  await harness.prisma.calendarSnapshot.deleteMany();
  await harness.prisma.ingestionScope.deleteMany();
  await truncateGeographicReference(harness.prisma);
});

afterAll(async () => {
  await harness.stop();
});

async function seedReference(version = 'communes-test-v1'): Promise<string> {
  await harness.prisma.geographicReferenceVersion.create({
    data: {
      version,
      status: 'active',
      source: 'data/communes-france-2026.csv',
      publicationDate: '2026-01-01',
      ingestedAt: new Date('2026-10-28T00:00:00.000Z'),
      license: 'Licence Ouverte 2.0',
      communeCount: 1,
      departmentCount: 1,
      checksum: 'checksum-test',
    },
  });
  await harness.prisma.departmentReference.create({
    data: { versionId: version, code: '69', name: 'Rhône', communeCount: 1 },
  });
  await harness.prisma.communeReference.create({
    data: {
      versionId: version,
      inseeCode: '69123',
      name: 'Lyon',
      normalizedName: normalizeGeographicName('Lyon'),
      pronounFreeNormalizedName: normalizeGeographicName('Lyon'),
      postalCodes: ['69001', '69002'],
      departmentCode: '69',
    },
  });
  return version;
}

function enrichedEvent(sourceEventId: string, version: string): PublishedEvent {
  return {
    id: sourceEventId,
    sourceEventId,
    name: 'Tractage Lyon',
    startTime: '2026-09-24T10:00:00+02:00',
    endTime: '2026-09-24T11:00:00+02:00',
    location: { address1: '1 rue de la Paix', city: 'Lyon', zip: '69001', coordinates: null },
    contentHash: 'hash-1',
    sequence: 0,
    geography: {
      geographicStatus: 'resolved',
      referenceVersion: version,
      countryCode: 'FR',
      departmentCode: '69',
      departmentSource: 'stated',
      rawDepartmentCode: '69',
      rawCommuneName: 'Lyon',
      communeId: '69123',
      diagnostics: [],
    },
  };
}

describe('geographic enrichment persistence', () => {
  it('writes the geographic columns and reads them back', async () => {
    const version = await seedReference();
    await repository.saveCurrent({
      scopeId: 'group-1',
      revision: 1,
      generatedAt: '2026-10-28T00:00:00.000Z',
      events: [enrichedEvent('event-1', version)],
      status: 'complete',
    });

    const row = await harness.prisma.eventRecord.findUnique({
      where: { sourceEventId: 'event-1' },
    });
    expect(row?.countryCode).toBe('FR');
    expect(row?.departmentCode).toBe('69');
    expect(row?.communeId).toBe('69123');
    expect(row?.geographicStatus).toBe('resolved');
    expect(row?.departmentSource).toBe('stated');
    expect(row?.rawCommuneName).toBe('Lyon');
    expect(row?.referenceVersion).toBe(version);

    const dataset = await repository.getCurrent('group-1');
    expect(dataset?.events[0]?.geography?.communeId).toBe('69123');
    expect(dataset?.events[0]?.geography?.diagnostics).toEqual([]);
  });

  it('keeps diagnostics round-trippable', async () => {
    const version = await seedReference();
    await repository.saveCurrent({
      scopeId: 'group-1',
      revision: 1,
      generatedAt: '2026-10-28T00:00:00.000Z',
      events: [
        {
          ...enrichedEvent('event-1', version),
          geography: {
            geographicStatus: 'incomplete',
            referenceVersion: version,
            countryCode: 'FR',
            diagnostics: [
              {
                code: 'commune_unknown',
                field: 'location.commune.name',
                message: 'no commune matches "Ville Inexistante"',
                severity: 'warning',
              },
            ],
          },
        },
      ],
      status: 'complete',
    });

    const dataset = await repository.getCurrent('group-1');
    expect(dataset?.events[0]?.geography?.diagnostics).toEqual([
      {
        code: 'commune_unknown',
        field: 'location.commune.name',
        message: 'no commune matches "Ville Inexistante"',
        severity: 'warning',
      },
    ]);
  });

  it('leaves no partially enriched event when the publication fails', async () => {
    const version = await seedReference();
    const broken = {
      ...enrichedEvent('event-broken', version),
      name: null,
    } as unknown as PublishedEvent;

    await expect(
      repository.saveCurrent({
        scopeId: 'group-1',
        revision: 1,
        generatedAt: '2026-10-28T00:00:00.000Z',
        events: [enrichedEvent('event-1', version), broken],
        status: 'complete',
      }),
    ).rejects.toThrow();

    expect(await harness.prisma.eventRecord.count()).toBe(0);
    expect(await harness.prisma.calendarSnapshot.count()).toBe(0);
  });
});
