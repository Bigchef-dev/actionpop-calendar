import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { PostgresGeographicReferenceRepository } from '../../src/persistence/geographic-reference-repository.js';

interface EpciRow {
  epciId: string;
  kind: string;
  memberships: Array<{ communeId: string; quality: string }>;
}

function repository(options: {
  activeVersion?: string | null;
  rows?: EpciRow[];
}): PostgresGeographicReferenceRepository {
  const prisma = {
    geographicReferenceVersion: {
      findFirst: async () =>
        options.activeVersion === undefined || options.activeVersion === null
          ? null
          : {
              version: options.activeVersion,
              status: 'active',
              source: 'fixture',
              publicationDate: '2026-01-01',
              ingestedAt: new Date('2026-01-01T00:00:00.000Z'),
              license: 'Open Licence',
              communeCount: 2,
              departmentCount: 1,
              checksum: 'checksum',
            },
    },
    epciReference: {
      findMany: async () => options.rows ?? [],
    },
  };
  return new PostgresGeographicReferenceRepository(prisma as unknown as PrismaClient);
}

describe('EPCI membership resolution', () => {
  it('resolves one territory to sorted unique commune identifiers', async () => {
    const target = repository({
      activeVersion: 'geo-2026',
      rows: [
        {
          epciId: '200000001',
          kind: 'CC',
          memberships: [
            { communeId: '01002', quality: 'complete' },
            { communeId: '01001', quality: 'complete' },
            { communeId: '01002', quality: 'complete' },
          ],
        },
      ],
    });

    const resolution = await target.resolveEpcis(['200000001']);

    expect(resolution).toEqual({ inseeCodes: ['01001', '01002'], diagnostics: [] });
  });

  it('unions the communes of several territories', async () => {
    const target = repository({
      activeVersion: 'geo-2026',
      rows: [
        {
          epciId: '200000001',
          kind: 'CC',
          memberships: [{ communeId: '01001', quality: 'complete' }],
        },
        {
          epciId: '200000002',
          kind: 'METRO',
          memberships: [{ communeId: '75056', quality: 'complete' }],
        },
      ],
    });

    const resolution = await target.resolveEpcis(['200000002', '200000001']);

    expect(resolution.inseeCodes).toEqual(['01001', '75056']);
  });

  it('reports an unknown or retired identifier instead of a partial scope', async () => {
    const target = repository({ activeVersion: 'geo-2026', rows: [] });

    const resolution = await target.resolveEpcis(['299999999']);

    expect(resolution.inseeCodes).toEqual([]);
    expect(resolution.diagnostics[0]).toMatchObject({
      code: 'epci_invalid',
      severity: 'error',
    });
  });

  it('refuses a territory whose membership is empty or unverified', async () => {
    const empty = repository({
      activeVersion: 'geo-2026',
      rows: [{ epciId: '200000001', kind: 'CC', memberships: [] }],
    });
    const unverified = repository({
      activeVersion: 'geo-2026',
      rows: [
        {
          epciId: '200000001',
          kind: 'CC',
          memberships: [{ communeId: '01001', quality: 'unverified' }],
        },
      ],
    });

    await expect(empty.resolveEpcis(['200000001'])).resolves.toMatchObject({
      inseeCodes: [],
      diagnostics: [{ code: 'epci_membership_incomplete' }],
    });
    await expect(unverified.resolveEpcis(['200000001'])).resolves.toMatchObject({
      inseeCodes: [],
      diagnostics: [{ code: 'epci_membership_incomplete' }],
    });
  });

  it('reports unavailability when no reference version is active', async () => {
    const target = repository({ activeVersion: null });

    await expect(target.resolveEpcis(['200000001'])).resolves.toMatchObject({
      inseeCodes: [],
      diagnostics: [{ code: 'epci_unavailable' }],
    });
  });
});
