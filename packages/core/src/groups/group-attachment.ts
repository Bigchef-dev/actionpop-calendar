import type { Diagnostic, GeographicAttachment } from '../geography/reference-types.js';

/**
 * Maps the geographic attachment the existing enricher already produces for a stated address to
 * the columns a group listing filters on.
 *
 * There is deliberately no group-specific resolution rule: the address of a group is enriched by
 * the same code as the address of an event, so a group and an event can never disagree about what
 * department or commune an address belongs to.
 */
export type GroupGeographicStatus = 'resolved' | 'incomplete' | 'international' | 'invalid';

export interface GroupAttachment {
  readonly status: GroupGeographicStatus;
  readonly countryCode?: string;
  readonly communeId?: string;
  readonly departmentCode?: string;
  readonly referenceVersion: string;
  readonly diagnostics: readonly Diagnostic[];
}

export interface GroupAttachmentNames {
  readonly communeName?: string;
  readonly departmentName?: string;
}

/**
 * `unavailable` means no reference version existed when the address was read. Writing nothing is
 * the honest answer: the group is retried on the next cycle instead of being pinned to a version
 * that never existed.
 */
export function groupAttachmentFromGeography(
  attachment: GeographicAttachment,
): GroupAttachment | undefined {
  const referenceVersion = attachment.referenceVersion;
  if (referenceVersion === undefined) return undefined;

  const base = {
    referenceVersion,
    ...(attachment.countryCode === undefined ? {} : { countryCode: attachment.countryCode }),
    ...(attachment.communeId === undefined ? {} : { communeId: attachment.communeId }),
    ...(attachment.departmentCode === undefined
      ? {}
      : { departmentCode: attachment.departmentCode }),
    diagnostics: attachment.diagnostics,
  };

  switch (attachment.geographicStatus) {
    case 'resolved':
      return { ...base, status: 'resolved' };
    case 'international':
      return { ...base, status: 'international' };
    case 'invalid':
      return { ...base, status: 'invalid' };
    case 'national':
    case 'incomplete':
      return { ...base, status: 'incomplete' };
    case 'unavailable':
      return undefined;
  }
}
