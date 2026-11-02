import { describe, expect, it } from 'vitest';

import {
  categoryLabel,
  isEpciKind,
  normalizeEpciName,
  type EpciMembershipRecord,
  type EpciReferenceRecord,
} from './epci-reference.js';
import { validateEpciReference } from './epci-reference-validation.js';
import {
  EPCI_FIXTURE_MEMBERSHIPS,
  EPCI_FIXTURE_REFERENCES,
} from '../test-fixtures/epci.js';

const reference = (overrides: Partial<EpciReferenceRecord> = {}): EpciReferenceRecord => ({
  versionId: 'geo-1',
  id: '200000001',
  name: 'Communauté de communes du Rhône',
  normalizedName: normalizeEpciName('Communauté de communes du Rhône'),
  kind: 'CC',
  departmentCodes: ['69'],
  active: true,
  ...overrides,
});

const membership = (overrides: Partial<EpciMembershipRecord> = {}): EpciMembershipRecord => ({
  versionId: 'geo-1',
  epciId: '200000001',
  communeId: '69123',
  quality: 'complete',
  ...overrides,
});

describe('EPCI reference', () => {
  it('exposes stable category labels and official identifiers', () => {
    expect(categoryLabel('CC')).toBe('Communauté de communes');
    expect(categoryLabel('CA')).toBe("Communauté d'agglomération");
    expect(categoryLabel('CU')).toBe('Communauté urbaine');
    expect(categoryLabel('METRO')).toBe('Métropole');
  });

  it('normalizes names consistently for search', () => {
    expect(normalizeEpciName('Métropole du Grand Exemple')).toBe('metropole du grand exemple');
  });
  it('normalizes accents and repeated letters for search', () => {
    expect(normalizeEpciName('Communauté du Rhône')).toBe('comunaute du rhone');
  });

  it.each([
    ['CC', 'Communauté de communes'],
    ['CA', "Communauté d'agglomération"],
    ['CU', 'Communauté urbaine'],
    ['METRO', 'Métropole'],
  ] as const)('labels %s', (kind, label) => {
    expect(isEpciKind(kind)).toBe(true);
    expect(categoryLabel(kind)).toBe(label);
  });

  it('rejects duplicate memberships and unknown communes', () => {
    const diagnostics = validateEpciReference({
      references: [reference()],
      memberships: [membership(), membership(), membership({ communeId: '01001' })],
      communeIds: new Set(['69123']),
    });
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'membership_duplicate',
      'commune_unknown',
    ]);
  });

  it('accepts the shared reference fixture for all four public categories', () => {
    expect(EPCI_FIXTURE_REFERENCES.filter((reference) => reference.active).map((r) => r.kind))
      .toEqual(['CC', 'CA', 'CU', 'METRO']);

    const diagnostics = validateEpciReference({
      references: EPCI_FIXTURE_REFERENCES,
      memberships: EPCI_FIXTURE_MEMBERSHIPS,
      communeIds: new Set(EPCI_FIXTURE_MEMBERSHIPS.map((membership) => membership.communeId)),
    });

    expect(diagnostics).toEqual([]);
  });
});
