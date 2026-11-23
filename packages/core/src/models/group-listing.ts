import type { GroupGeographicStatus } from '../groups/group-attachment.js';

/**
 * The public shape of one group in a territory listing. It carries what a consumer needs to
 * present the group and link to its calendar; no retrieval status, geometry, diagnostic or
 * source token ever reaches it.
 */
export interface GroupListingCalendar {
  readonly path: '/calendar.ics';
  readonly params: { readonly group: string };
}

export interface GroupListingItem {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string | null;
  readonly departmentCode: string | null;
  readonly departmentName: string | null;
  readonly communeId: string | null;
  readonly communeName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly calendar: GroupListingCalendar;
}

export interface GroupListingResult {
  readonly items: readonly GroupListingItem[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly referenceVersion: string;
}

/** Area criteria after resolution: every commune dimension member is an INSEE code. */
export interface GroupAreaCriteria {
  readonly country?: string;
  readonly department?: string;
  readonly communeIds?: readonly string[];
  readonly referenceVersion: string;
}

/**
 * The area a successful answer was computed for, echoed so a page can be attributed to the
 * territory it describes without replaying the request. Values inside one dimension are the
 * deduplicated union the read applied.
 */
export interface GroupAreaEcho {
  readonly country?: string;
  readonly department?: string;
  readonly communeIds?: readonly string[];
  readonly epci?: readonly string[];
}

export type GroupListingAnswer = GroupListingResult & { readonly area: GroupAreaEcho };

export const GROUP_LISTING_LIMIT = {
  default: 50,
  min: 1,
  max: 200,
} as const;

export interface GroupAttachmentSnapshot {
  readonly status: GroupGeographicStatus;
  readonly countryCode?: string;
  readonly communeId?: string;
  readonly communeName?: string;
  readonly departmentCode?: string;
  readonly departmentName?: string;
}

export function groupCalendar(groupId: string): GroupListingCalendar {
  return { path: '/calendar.ics', params: { group: groupId } };
}

export interface GroupListingPaging {
  readonly limit: number;
  readonly offset: number;
}

/** Port the HTTP layer depends on, so the route is testable with prepared rows. */
export interface GroupListingReader {
  findActiveVersion(): Promise<string | null>;
  /**
   * Diagnoses an identifier the active reference does not know, so "this area holds no group" and
   * "this area does not exist" are never the same answer. Optional: a stub may omit it.
   */
  validateArea?(
    version: string,
    identifiers: { readonly department?: string; readonly communeIds?: readonly string[] },
  ): Promise<readonly GroupAreaDiagnostic[]>;
  list(criteria: GroupAreaCriteria, paging: GroupListingPaging): Promise<GroupListingResult>;
}

export interface GroupAreaDiagnostic {
  readonly code: string;
  readonly field: string;
  readonly message: string;
  readonly severity: 'error';
}
