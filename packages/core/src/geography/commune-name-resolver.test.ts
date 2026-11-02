import { describe, expect, it } from 'vitest';

import { normalizeNameForSearch } from '../domain/geographic-identity.js';
import { CommuneNameResolver } from './commune-name-resolver.js';
import type { GeographicReferenceReader } from './geographic-reference-reader.js';
import type {
  CommuneReferenceRecord,
  DepartmentReferenceRecord,
  GeographicReferenceVersionRecord,
} from './reference-types.js';

const VERSION: GeographicReferenceVersionRecord = {
  version: 'communes-test',
  status: 'active',
  source: 'test',
  publicationDate: '2026-01-01',
  ingestedAt: '2026-01-02T00:00:00.000Z',
  license: 'test',
  communeCount: 3,
  departmentCount: 1,
  checksum: 'test',
};

function commune(inseeCode: string, name: string, departmentCode = '69'): CommuneReferenceRecord {
  return {
    inseeCode,
    name,
    normalizedName: name.toLowerCase(),
    pronounFreeNormalizedName: name.toLowerCase().replace(/^sainte-/, 'sainte '),
    postalCodes: [],
    departmentCode,
  };
}

const LYON = commune('69123', 'lyon');
const VILLEURBANNE = commune('69266', 'villeurbanne');
const SAINTE_COLOMBE_69 = commune('69162', 'sainte-colombe');
const SAINTE_COLOMBE_27 = commune('27567', 'sainte-colombe', '27');
const PARIS = commune('75056', 'paris', '75');

function readerWith(byName: Record<string, CommuneReferenceRecord[]>): GeographicReferenceReader {
  // The reader receives an already-normalized key, so the fixture is keyed the same way.
  const keys = new Map(
    Object.entries(byName).map(([name, communes]) => [normalizeNameForSearch(name), communes]),
  );
  return {
    findActiveVersion: async () => VERSION,
    findDepartment: async (): Promise<DepartmentReferenceRecord | null> => null,
    findCommunesByNormalizedName: async (_version, key) => keys.get(key) ?? [],
    findCommunesByPostalCode: async () => [],
  };
}

const READER = readerWith({
  lyon: [LYON],
  villeurbanne: [VILLEURBANNE],
  'sainte colombe': [SAINTE_COLOMBE_27, SAINTE_COLOMBE_69],
  paris: [PARIS],
});

describe('CommuneNameResolver', () => {
  it('resolves an exactly matching name', async () => {
    const resolver = new CommuneNameResolver(READER);
    await expect(resolver.resolve(['Lyon'], undefined)).resolves.toEqual({
      inseeCodes: ['69123'],
      diagnostics: [],
    });
  });

  it('resolves a case and accent variant to the same commune', async () => {
    const resolver = new CommuneNameResolver(READER);
    await expect(resolver.resolve(['  LYON  '], undefined)).resolves.toEqual({
      inseeCodes: ['69123'],
      diagnostics: [],
    });
  });

  it('resolves several names and unions the codes', async () => {
    const resolver = new CommuneNameResolver(READER);
    await expect(resolver.resolve(['Lyon', 'Villeurbanne'], undefined)).resolves.toEqual({
      inseeCodes: ['69123', '69266'],
      diagnostics: [],
    });
  });

  it('disambiguates an ambiguous name with the department', async () => {
    const resolver = new CommuneNameResolver(READER);
    await expect(resolver.resolve(['Sainte-Colombe'], '69')).resolves.toEqual({
      inseeCodes: ['69162'],
      diagnostics: [],
    });
  });

  it('rejects an ambiguous name without a department and names the candidates', async () => {
    const resolver = new CommuneNameResolver(READER);
    const result = await resolver.resolve(['Sainte-Colombe'], undefined);

    expect(result.inseeCodes).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'commune_name_ambiguous',
      field: 'commune_name',
      severity: 'error',
    });
    expect(result.diagnostics[0]?.message).toContain('27567');
    expect(result.diagnostics[0]?.message).toContain('69162');
    expect(result.diagnostics[0]?.message).toContain('insee_commune');
  });

  it('reports an unknown name without failing the request', async () => {
    const resolver = new CommuneNameResolver(READER);
    const result = await resolver.resolve(['Atlantide'], undefined);

    expect(result.inseeCodes).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('reports an unknown name when no reference version is active', async () => {
    const resolver = new CommuneNameResolver({
      ...READER,
      findActiveVersion: async () => null,
    });
    const result = await resolver.resolve(['Lyon'], undefined);

    expect(result.inseeCodes).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ code: 'commune_name_unavailable', severity: 'error' });
  });
});
