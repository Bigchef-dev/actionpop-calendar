import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { PostgresSubjectSearch } from '../../src/search/postgres-subject-search.js';

interface EpciRow {
  epciId: string;
  name: string;
  normalizedName?: string;
  kind: string;
  departmentCodes: string[];
}

function search(options: { activeVersion?: string | null; rows?: EpciRow[] }) {
  const received: unknown[] = [];
  const prisma = {
    geographicReferenceVersion: {
      findFirst: async () =>
        options.activeVersion === undefined || options.activeVersion === null
          ? null
          : { version: options.activeVersion },
    },
    epciReference: {
      findMany: async (args: unknown) => {
        received.push(args);
        return (options.rows ?? []).map((row) => ({
          normalizedName: row.name.toLowerCase(),
          ...row,
        }));
      },
    },
  };
  return {
    reader: new PostgresSubjectSearch(prisma as unknown as PrismaClient),
    received,
  };
}

describe('PostgresSubjectSearch EPCI candidates', () => {
  it('reads the active version and exposes stable identifiers with category context', async () => {
    const { reader, received } = search({
      activeVersion: 'geo-2026',
      rows: [
        {
          epciId: '200054781',
          name: 'Métropole du Grand Paris',
          normalizedName: 'metropole du grand paris',
          kind: 'METRO',
          departmentCodes: ['75', '93'],
        },
      ],
    });

    const result = await reader.read(
      'epci',
      { raw: 'grand', normalized: 'grand' },
      18,
    );

    expect(received[0]).toMatchObject({ where: { versionId: 'geo-2026', active: true } });
    expect(result.total).toBe(1);
    expect(result.candidates[0]).toMatchObject({
      kind: 'epci',
      id: '200054781',
      label: 'Métropole du Grand Paris',
      qualifier: 'Métropole · 75, 93',
      calendar: { params: { epci: '200054781' } },
    });
  });

  it('drops rows whose stored category is outside the supported set', async () => {
    const { reader } = search({
      activeVersion: 'geo-2026',
      rows: [
        {
          epciId: '200000001',
          name: 'Territoire inconnu',
          normalizedName: 'territoire inconnu',
          kind: 'SIVU',
          departmentCodes: ['01'],
        },
      ],
    });

    const result = await reader.read('epci', { raw: 'territoire', normalized: 'territoire' }, 18);

    expect(result.candidates).toEqual([]);
  });

  it('returns no candidate when no reference version is active', async () => {
    const { reader, received } = search({ activeVersion: null });

    const result = await reader.read('epci', { raw: 'grand', normalized: 'grand' }, 18);

    expect(result).toEqual({ candidates: [], total: 0 });
    expect(received).toHaveLength(0);
  });
});
