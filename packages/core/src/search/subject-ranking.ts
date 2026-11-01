import { normalizeGeographicName } from '../domain/geographic-identity.js';

import type { SearchSubject, SubjectCandidate } from './subject-search-types.js';

/** Rank tiers, ascending: exact name, name starts with the query, name contains it. */
export type SubjectRankTier = 0 | 1 | 2;

export interface RankingLimits {
  readonly perKind: number;
  readonly total: number;
}

export interface RankingQuery {
  readonly raw: string;
  readonly normalized: string;
}

const KIND_ORDER: readonly string[] = ['commune', 'department', 'group'];
const UNKNOWN_KIND_ORDER = 99;

export function normalizeSubjectQuery(value: string): string {
  return normalizeGeographicName(value).replace(/([a-z])\1+/g, '$1');
}

/**
 * Best tier a candidate reaches across its label and its aliases, or `null` when it does not
 * match. An identifier only matches exactly, so a code typed in full resolves its own subject
 * without letting every identifier containing those characters pollute the suggestions.
 */
export function subjectRankTier(
  candidate: SubjectCandidate,
  query: RankingQuery,
): SubjectRankTier | null {
  if (candidate.id.toLowerCase() === query.raw.trim().toLowerCase()) return 0;

  const normalizedQuery = normalizeSubjectQuery(query.normalized);
  const keys = [candidate.label, ...(candidate.aliases ?? [])]
    .map(normalizeSubjectQuery)
    .filter((key) => key !== '');

  let best: SubjectRankTier | null = null;
  for (const key of keys) {
    const tier: SubjectRankTier | null =
      key === normalizedQuery
        ? 0
        : key.startsWith(normalizedQuery)
          ? 1
          : key.includes(normalizedQuery)
            ? 2
            : null;
    if (tier === null) continue;
    if (best === null || tier < best) best = tier;
  }
  return best;
}

/**
 * Orders candidates by kind, then rank tier, then their own tie-breaker, keeps at most
 * `perKind` entries per kind and `total` overall. Duplicate `(kind, id)` entries collapse
 * to their best-ranked occurrence, and an entry missing a kind, an id or a label is dropped.
 */
export function rankSubjects(
  candidates: readonly SubjectCandidate[],
  query: RankingQuery,
  limits: RankingLimits,
): SearchSubject[] {
  const best = new Map<string, { candidate: SubjectCandidate; tier: SubjectRankTier }>();

  for (const candidate of candidates) {
    if (candidate.kind === '' || candidate.id === '' || candidate.label === '') continue;
    const tier = subjectRankTier(candidate, query);
    if (tier === null) continue;
    const key = `${candidate.kind}:${candidate.id}`;
    const current = best.get(key);
    if (current === undefined || tier < current.tier) best.set(key, { candidate, tier });
  }

  const ordered = [...best.values()].sort(compareRanked).map((entry) => toSubject(entry.candidate));

  const perKindCounts = new Map<string, number>();
  const retained: SearchSubject[] = [];
  for (const subject of ordered) {
    const count = perKindCounts.get(subject.kind) ?? 0;
    if (count >= limits.perKind) continue;
    perKindCounts.set(subject.kind, count + 1);
    retained.push(subject);
    if (retained.length >= limits.total) break;
  }
  return retained;
}

function compareRanked(
  left: { candidate: SubjectCandidate; tier: SubjectRankTier },
  right: { candidate: SubjectCandidate; tier: SubjectRankTier },
): number {
  const byKind = kindOrder(left.candidate.kind) - kindOrder(right.candidate.kind);
  if (byKind !== 0) return byKind;
  if (left.tier !== right.tier) return left.tier - right.tier;
  const byKey = tieBreaker(left.candidate).localeCompare(tieBreaker(right.candidate), 'fr');
  if (byKey !== 0) return byKey;
  return left.candidate.id.localeCompare(right.candidate.id);
}

function kindOrder(kind: string): number {
  const index = KIND_ORDER.indexOf(kind);
  return index === -1 ? UNKNOWN_KIND_ORDER : index;
}

function tieBreaker(candidate: SubjectCandidate): string {
  return candidate.sortKey ?? candidate.label;
}

function toSubject(candidate: SubjectCandidate): SearchSubject {
  return {
    kind: candidate.kind,
    id: candidate.id,
    label: candidate.label,
    ...(candidate.qualifier === undefined ? {} : { qualifier: candidate.qualifier }),
    ...(candidate.parent === undefined ? {} : { parent: candidate.parent }),
    calendar: candidate.calendar,
  };
}
