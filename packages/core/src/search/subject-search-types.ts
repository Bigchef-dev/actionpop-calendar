/** Kinds a visitor can search for. The list is the server-side catalogue: extending it is a
 * server change, and a client renders any kind it receives without a code change. */
export const SUBJECT_KINDS = ['commune', 'department', 'group', 'epci'] as const;

export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export interface SubjectCalendar {
  readonly path: '/calendar.ics';
  readonly params: Readonly<Record<string, string>>;
}

/** One thing a visitor can search for and then follow. */
export interface SearchSubject {
  readonly kind: string;
  readonly id: string;
  readonly label: string;
  readonly qualifier?: string;
  readonly parent?: string;
  readonly population?: number;
  readonly calendar: SubjectCalendar;
}

export interface SearchAnswer {
  readonly query: string;
  readonly subjects: readonly SearchSubject[];
  readonly total: number;
  readonly kindCounts: Readonly<Record<string, number>>;
}

/** Row returned by a reader before ranking. */
export interface SubjectCandidate extends SearchSubject {
  /** Extra strings the same subject answers to (department code, postal codes). */
  readonly aliases?: readonly string[];
  /** Ascending tie-breaker inside a rank tier. */
  readonly sortKey?: string;
}

export interface SubjectReadResult {
  readonly candidates: readonly SubjectCandidate[];
  /** Matches before the candidate limit; the use case caps what it reports. */
  readonly total: number;
}

/** A query carries both forms: names match on the normalized form, identifiers on the raw one. */
export interface SubjectQuery {
  readonly raw: string;
  readonly normalized: string;
}

export interface SubjectSearchReader {
  read(kind: SubjectKind, query: SubjectQuery, candidateLimit: number): Promise<SubjectReadResult>;
}

export interface SubjectSearchDiagnostic {
  readonly code: 'query_too_short' | 'query_too_long' | 'kind_unknown' | 'limit_invalid';
  readonly field: string;
  readonly message: string;
  readonly severity: 'error';
}
