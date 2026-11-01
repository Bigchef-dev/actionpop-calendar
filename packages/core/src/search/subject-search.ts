import { normalizeSubjectQuery, rankSubjects } from './subject-ranking.js';
import {
  SUBJECT_KINDS,
  type SearchAnswer,
  type SubjectKind,
  type SubjectReadResult,
  type SubjectSearchDiagnostic,
  type SubjectSearchReader,
} from './subject-search-types.js';

export const QUERY_MIN_LENGTH = 2;
export const QUERY_MAX_LENGTH = 64;
export const DEFAULT_LIMIT = 18;
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 30;
/** Ceiling reported for `total` and `kindCounts`, so a huge corpus never needs a full count. */
export const COUNT_CAP = 100;

const PER_KIND_LIMIT = 6;
const CANDIDATE_MULTIPLIER = 3;

export interface SubjectSearchRequest {
  /** Trimmed query as typed. */
  readonly query: string;
  readonly normalizedQuery: string;
  readonly kinds: readonly SubjectKind[];
  readonly limit: number;
}

export type SubjectSearchParse =
  | { readonly ok: true; readonly request: SubjectSearchRequest }
  | { readonly ok: false; readonly diagnostics: readonly SubjectSearchDiagnostic[] };

/** Validates the query string of a search request against the published contract. */
export function parseSubjectSearchRequest(
  query: Record<string, string | undefined>,
): SubjectSearchParse {
  const diagnostics: SubjectSearchDiagnostic[] = [];
  const raw = (query.q ?? '').trim();

  if (raw.length > QUERY_MAX_LENGTH) {
    diagnostics.push({
      code: 'query_too_long',
      field: 'q',
      message: `q must be at most ${QUERY_MAX_LENGTH} characters`,
      severity: 'error',
    });
  } else if (raw.length < QUERY_MIN_LENGTH) {
    diagnostics.push({
      code: 'query_too_short',
      field: 'q',
      message: `q must be at least ${QUERY_MIN_LENGTH} characters`,
      severity: 'error',
    });
  }

  const kinds = readKinds(query.kind, diagnostics);
  const limit = readLimit(query.limit, diagnostics);

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  return {
    ok: true,
    request: { query: raw, normalizedQuery: normalizeSubjectQuery(raw), kinds, limit },
  };
}

/** Reads every requested kind and returns the ranked answer. */
export async function searchSubjects(
  request: SubjectSearchRequest,
  reader: SubjectSearchReader,
): Promise<SearchAnswer> {
  if (request.normalizedQuery === '') {
    return { query: request.normalizedQuery, subjects: [], total: 0, kindCounts: {} };
  }

  const candidates = [];
  const kindCounts: Record<string, number> = {};
  let total = 0;

  for (const kind of request.kinds) {
    const result: SubjectReadResult = await reader.read(
      kind,
      { raw: request.query, normalized: request.normalizedQuery },
      PER_KIND_LIMIT * CANDIDATE_MULTIPLIER,
    );
    const reported = Math.min(result.total, COUNT_CAP);
    kindCounts[kind] = reported;
    total += reported;
    candidates.push(...result.candidates);
  }

  return {
    query: request.normalizedQuery,
    subjects: rankSubjects(
      candidates,
      { raw: request.query, normalized: request.normalizedQuery },
      {
        perKind: PER_KIND_LIMIT,
        total: request.limit,
      },
    ),
    total: Math.min(total, COUNT_CAP),
    kindCounts,
  };
}

function readKinds(
  raw: string | undefined,
  diagnostics: SubjectSearchDiagnostic[],
): readonly SubjectKind[] {
  if (raw === undefined) return [...SUBJECT_KINDS];

  const requested = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');

  if (requested.length === 0) {
    diagnostics.push({
      code: 'kind_unknown',
      field: 'kind',
      message: 'kind must name at least one searchable kind',
      severity: 'error',
    });
    return [];
  }

  const accepted: SubjectKind[] = [];
  for (const value of requested) {
    const kind = SUBJECT_KINDS.find((candidate) => candidate === value);
    if (kind === undefined) {
      diagnostics.push({
        code: 'kind_unknown',
        field: 'kind',
        message: `"${value}" is not a searchable kind`,
        severity: 'error',
      });
      continue;
    }
    if (!accepted.includes(kind)) accepted.push(kind);
  }
  return accepted;
}

function readLimit(raw: string | undefined, diagnostics: SubjectSearchDiagnostic[]): number {
  if (raw === undefined) return DEFAULT_LIMIT;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < MIN_LIMIT || value > MAX_LIMIT) {
    diagnostics.push({
      code: 'limit_invalid',
      field: 'limit',
      message: `limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}`,
      severity: 'error',
    });
    return DEFAULT_LIMIT;
  }
  return value;
}
