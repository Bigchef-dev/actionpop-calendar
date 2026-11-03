import { parseSubjectKey, subjectKey } from '../../../shared/composables/useUrlState';

export interface EncodedSubject {
  kind: string;
  id: string;
}

/** Encodes a subject as the address value `kind:id`. */
export function encodeSubject(subject: { kind: string; id: string }): string {
  return subjectKey(subject) ?? '';
}

/** Decodes an address value; returns `null` for anything that is not exactly `kind:id`. */
export function decodeSubject(value: string | null | undefined): EncodedSubject | null {
  if (value === null || value === undefined) return null;
  return parseSubjectKey(value);
}
