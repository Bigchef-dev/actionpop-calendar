import { describe, expect, it } from 'vitest';

import { namesAnArea, parseGroupArea } from './group-area-filter.js';
import { resolveGroupArea } from './group-area-resolution.js';

function ok(query: Record<string, string | undefined>) {
  const result = parseGroupArea(query);
  if (!result.ok) throw new Error(`expected a valid area: ${JSON.stringify(result.diagnostics)}`);
  return result.criteria;
}

function codes(query: Record<string, string | undefined>): readonly string[] {
  const result = parseGroupArea(query);
  if (result.ok) return [];
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe('parseGroupArea', () => {
  it('normalizes a country and a department to their stored spelling', () => {
    expect(ok({ country: 'fr', department: ' 69 ' })).toMatchObject({
      country: 'FR',
      department: '69',
    });
  });

  it('merges insee_commune and commune into one commune dimension', () => {
    expect(ok({ insee_commune: '69123,69124', commune: '69124,75056' }).communeIds).toEqual([
      '69123',
      '69124',
      '75056',
    ]);
  });

  it('keeps distinct parameters as separate criteria', () => {
    const criteria = ok({ country: 'FR', department: '69', insee_commune: '69123' });

    expect(criteria).toMatchObject({
      country: 'FR',
      department: '69',
      communeIds: ['69123'],
    });
  });

  it('defaults paging to the documented values', () => {
    expect(ok({ department: '69' })).toMatchObject({ limit: 50, offset: 0 });
  });

  it('rejects an empty value', () => {
    expect(codes({ department: '  ' })).toEqual(['filter_value_invalid']);
  });

  it('rejects a country that is not a two-letter code', () => {
    expect(codes({ country: 'France' })).toEqual(['filter_value_invalid']);
  });

  it('rejects a criterion the catalogue read cannot apply', () => {
    expect(codes({ event_type: 'tractage' })).toEqual(['filter_parameter_unsupported']);
    expect(codes({ group: 'npa-lyon' })).toEqual(['filter_parameter_unsupported']);
  });

  it('rejects an unknown parameter', () => {
    expect(codes({ foo: 'bar' })).toEqual(['filter_parameter_unknown']);
  });
});

describe('namesAnArea', () => {
  it('is false when no area criterion is supplied', () => {
    expect(namesAnArea(ok({ limit: '10' }))).toBe(false);
  });

  it('is true as soon as one area criterion is supplied', () => {
    expect(namesAnArea(ok({ country: 'FR' }))).toBe(true);
  });
});

describe('resolveGroupArea', () => {
  const resolver = {
    resolve: async () => ({ inseeCodes: ['69123'], diagnostics: [] }),
    resolveEpcis: async () => ({ inseeCodes: ['69124'], diagnostics: [] }),
  };

  it('adds the communes named by a criterion to the commune dimension', async () => {
    const resolved = await resolveGroupArea(
      ok({ commune_name: 'Lyon', epci: '200054781', insee_commune: '75056' }),
      'v1',
      resolver,
    );

    expect(resolved).toEqual({
      ok: true,
      criteria: { communeIds: ['69123', '69124', '75056'], referenceVersion: 'v1' },
    });
  });

  it('carries the reference version it was resolved against', async () => {
    const resolved = await resolveGroupArea(ok({ department: '69' }), 'v1', resolver);

    expect(resolved).toMatchObject({ ok: true, criteria: { referenceVersion: 'v1' } });
  });
});

describe('resolveGroupArea with commune names and EPCI', () => {
  it('adds the communes a name criterion resolves to', async () => {
    const resolved = await resolveGroupArea(ok({ commune_name: 'lyon' }), 'v1', {
      resolve: async () => ({ inseeCodes: ['69123'], diagnostics: [] }),
    });

    expect(resolved).toMatchObject({ ok: true, criteria: { communeIds: ['69123'] } });
  });

  it('rejects an ambiguous commune name instead of selecting one', async () => {
    const resolved = await resolveGroupArea(ok({ commune_name: 'Sainte-Colombe' }), 'v1', {
      resolve: async () => ({
        inseeCodes: [],
        diagnostics: [
          {
            code: 'commune_name_ambiguous',
            field: 'commune_name',
            message: '"Sainte-Colombe" matches 69162, 69287',
            severity: 'error',
          },
        ],
      }),
    });

    expect(resolved).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'commune_name_ambiguous' }],
    });
  });

  it('reports an EPCI that cannot be resolved as unavailable', async () => {
    const resolved = await resolveGroupArea(ok({ epci: '200054781' }), 'v1', {
      resolve: async () => ({ inseeCodes: [], diagnostics: [] }),
    });

    expect(resolved).toMatchObject({ ok: false, diagnostics: [{ code: 'epci_unavailable' }] });
  });

  it('reports incomplete EPCI membership', async () => {
    const resolved = await resolveGroupArea(ok({ epci: '200054781' }), 'v1', {
      resolve: async () => ({ inseeCodes: [], diagnostics: [] }),
      resolveEpcis: async () => ({
        inseeCodes: [],
        diagnostics: [
          {
            code: 'epci_membership_incomplete',
            field: 'epci',
            message: 'epci has no usable commune membership',
            severity: 'error',
          },
        ],
      }),
    });

    expect(resolved).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'epci_membership_incomplete' }],
    });
  });
});
