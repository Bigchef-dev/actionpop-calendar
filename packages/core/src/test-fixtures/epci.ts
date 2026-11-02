import type { EpciMembershipRecord, EpciReferenceRecord } from '../geography/epci-reference.js';

export const EPCI_FIXTURE_REFERENCES: readonly EpciReferenceRecord[] = [
  {
    versionId: 'fixture-2026',
    id: '200000001',
    name: 'Communauté de communes des Rivières',
    normalizedName: 'communaute de communes des rivieres',
    kind: 'CC',
    departmentCodes: ['01'],
    active: true,
  },
  {
    versionId: 'fixture-2026',
    id: '200000002',
    name: "Communauté d'agglomération du Grand Lac",
    normalizedName: "communaute d'agglomeration du grand lac",
    kind: 'CA',
    departmentCodes: ['69'],
    active: true,
  },
  {
    versionId: 'fixture-2026',
    id: '200000003',
    name: 'Communauté urbaine des Collines',
    normalizedName: 'communaute urbaine des collines',
    kind: 'CU',
    departmentCodes: ['59'],
    active: true,
  },
  {
    versionId: 'fixture-2026',
    id: '200000004',
    name: 'Métropole du Grand Exemple',
    normalizedName: 'metropole du grand exemple',
    kind: 'METRO',
    departmentCodes: ['75'],
    active: true,
  },
  {
    versionId: 'fixture-2026',
    id: '200000099',
    name: 'Territoire retiré',
    normalizedName: 'territoire retire',
    kind: 'CC',
    departmentCodes: ['01'],
    active: false,
  },
];

export const EPCI_FIXTURE_MEMBERSHIPS: readonly EpciMembershipRecord[] = [
  { versionId: 'fixture-2026', epciId: '200000001', communeId: '01001', quality: 'complete' },
  { versionId: 'fixture-2026', epciId: '200000001', communeId: '01002', quality: 'complete' },
  { versionId: 'fixture-2026', epciId: '200000002', communeId: '69123', quality: 'complete' },
  { versionId: 'fixture-2026', epciId: '200000003', communeId: '59001', quality: 'complete' },
  { versionId: 'fixture-2026', epciId: '200000004', communeId: '75056', quality: 'complete' },
];
