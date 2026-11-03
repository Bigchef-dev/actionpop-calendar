import { normalizeNameForSearch } from '../domain/geographic-identity.js';

export const EPCI_KINDS = ['CC', 'CA', 'CU', 'METRO'] as const;
export type EpciKind = (typeof EPCI_KINDS)[number];

export interface EpciReferenceRecord {
  readonly versionId: string;
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly kind: EpciKind;
  readonly departmentCodes: readonly string[];
  readonly active: boolean;
}

export interface EpciMembershipRecord {
  readonly versionId: string;
  readonly epciId: string;
  readonly communeId: string;
  readonly quality: 'complete' | 'unverified';
}

export interface EpciReferenceDiagnostic {
  readonly code:
    | 'id_missing'
    | 'name_missing'
    | 'kind_unknown'
    | 'commune_unknown'
    | 'membership_duplicate'
    | 'date_invalid';
  readonly epciId?: string;
  readonly communeId?: string;
  readonly message: string;
}

export function normalizeEpciName(value: string): string {
  return normalizeNameForSearch(value);
}

export function isEpciKind(value: string): value is EpciKind {
  return EPCI_KINDS.includes(value as EpciKind);
}

export function categoryLabel(kind: EpciKind): string {
  switch (kind) {
    case 'CC':
      return 'Communauté de communes';
    case 'CA':
      return "Communauté d'agglomération";
    case 'CU':
      return 'Communauté urbaine';
    case 'METRO':
      return 'Métropole';
  }
}
