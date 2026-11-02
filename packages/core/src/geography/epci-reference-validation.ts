import {
  isEpciKind,
  type EpciMembershipRecord,
  type EpciReferenceDiagnostic,
  type EpciReferenceRecord,
} from './epci-reference.js';

export interface EpciValidationInput {
  readonly references: readonly EpciReferenceRecord[];
  readonly memberships: readonly EpciMembershipRecord[];
  readonly communeIds: ReadonlySet<string>;
}

export function validateEpciReference(input: EpciValidationInput): EpciReferenceDiagnostic[] {
  const diagnostics: EpciReferenceDiagnostic[] = [];
  const referenceIds = new Set<string>();

  for (const reference of input.references) {
    if (reference.id.trim() === '') {
      diagnostics.push({ code: 'id_missing', message: 'EPCI id must not be empty' });
    } else if (referenceIds.has(reference.id)) {
      diagnostics.push({ code: 'membership_duplicate', epciId: reference.id, message: 'EPCI id must be unique' });
    } else {
      referenceIds.add(reference.id);
    }
    if (reference.name.trim() === '') {
      diagnostics.push({ code: 'name_missing', epciId: reference.id, message: 'EPCI name must not be empty' });
    }
    if (!isEpciKind(reference.kind)) {
      diagnostics.push({ code: 'kind_unknown', epciId: reference.id, message: 'EPCI kind is unsupported' });
    }
  }

  const membershipKeys = new Set<string>();
  for (const membership of input.memberships) {
    const key = `${membership.versionId}:${membership.epciId}:${membership.communeId}`;
    if (membershipKeys.has(key)) {
      diagnostics.push({
        code: 'membership_duplicate',
        epciId: membership.epciId,
        communeId: membership.communeId,
        message: 'EPCI membership must be unique',
      });
    }
    membershipKeys.add(key);
    if (!referenceIds.has(membership.epciId)) {
      diagnostics.push({
        code: 'commune_unknown',
        epciId: membership.epciId,
        communeId: membership.communeId,
        message: 'Membership references an unknown EPCI',
      });
    }
    if (!input.communeIds.has(membership.communeId)) {
      diagnostics.push({
        code: 'commune_unknown',
        epciId: membership.epciId,
        communeId: membership.communeId,
        message: 'Membership references an unknown commune',
      });
    }
  }
  return diagnostics;
}
