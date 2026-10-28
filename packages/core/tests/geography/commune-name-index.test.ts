import { describe, expect, it } from 'vitest';

import { buildReferenceIndex, computeChecksum } from '../../src/geography/commune-name-index.js';
import type { CommuneCsvRow } from '../../src/geography/commune-csv-parser.js';

function row(overrides: Partial<CommuneCsvRow> = {}): CommuneCsvRow {
  return {
    inseeCode: '69123',
    name: 'Lyon',
    pronounFreeName: 'Lyon',
    postalCodes: ['69001'],
    departmentCode: '69',
    departmentName: 'Rhône',
    ...overrides,
  };
}

describe('buildReferenceIndex', () => {
  it('computes normalized names without touching the raw name', () => {
    const index = buildReferenceIndex([
      row({ name: 'Saint-Étienne', pronounFreeName: 'Saint-Étienne' }),
    ]);
    expect(index.communes[0]?.name).toBe('Saint-Étienne');
    expect(index.communes[0]?.normalizedName).toBe('saint etienne');
  });

  it('keeps homonyms as separate entries', () => {
    const index = buildReferenceIndex([
      row({
        inseeCode: '93066',
        name: 'Saint-Denis',
        pronounFreeName: 'Saint-Denis',
        departmentCode: '93',
        departmentName: 'Seine-Saint-Denis',
      }),
      row({
        inseeCode: '97411',
        name: 'Saint-Denis',
        pronounFreeName: 'Saint-Denis',
        departmentCode: '974',
        departmentName: 'La Réunion',
      }),
    ]);
    expect(index.communes).toHaveLength(2);
    expect(new Set(index.communes.map((commune) => commune.normalizedName))).toEqual(
      new Set(['saint denis']),
    );
    expect(index.communes.map((commune) => commune.inseeCode)).toEqual(['93066', '97411']);
  });

  it('falls back to the standard name when no pronoun-free alias exists', () => {
    const index = buildReferenceIndex([
      row({ name: "L'Abergement-Clémenciat", pronounFreeName: '' }),
    ]);
    expect(index.communes[0]?.pronounFreeNormalizedName).toBe('l abergement clemenciat');
  });

  it('derives departments with their commune counts', () => {
    const index = buildReferenceIndex([
      row({ inseeCode: '69123' }),
      row({ inseeCode: '69266', name: 'Villeurbanne', pronounFreeName: 'Villeurbanne' }),
      row({
        inseeCode: '75101',
        name: 'Paris 1er',
        pronounFreeName: 'Paris 1er',
        departmentCode: '75',
        departmentName: 'Paris',
      }),
    ]);
    expect(index.departments).toEqual([
      { code: '69', name: 'Rhône', communeCount: 2 },
      { code: '75', name: 'Paris', communeCount: 1 },
    ]);
  });
});

describe('computeChecksum', () => {
  it('is stable and content sensitive', () => {
    expect(computeChecksum([row()])).toBe(computeChecksum([row()]));
    expect(computeChecksum([row()])).not.toBe(computeChecksum([row({ name: 'Lyon 2e' })]));
  });
});
