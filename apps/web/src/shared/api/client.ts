import { API_BASE_URL } from '../../config';
import type { SearchAnswer, SearchSubject } from '../../types';

export class ApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface SearchOptions {
  kind?: readonly string[];
  limit?: number;
  signal?: AbortSignal;
  cache?: RequestCache;
}

function buildSearchUrl(query: string, options: SearchOptions): string {
  const params = new URLSearchParams({ q: query });
  if (options.kind !== undefined && options.kind.length > 0)
    params.set('kind', options.kind.join(','));
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  return `${API_BASE_URL}/search/subjects?${params.toString()}`;
}

export async function searchSubjects(
  query: string,
  options: SearchOptions = {},
): Promise<SearchAnswer> {
  const response = await fetch(buildSearchUrl(query, options), {
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.cache === undefined ? {} : { cache: options.cache }),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new ApiError(`search failed with ${response.status}`, response.status);
  return (await response.json()) as SearchAnswer;
}

/** Resolves an address-provided `kind:id` back to its subject, or `null` when it no longer exists. */
export async function resolveSubject(
  kind: string,
  id: string,
  signal?: AbortSignal,
): Promise<SearchSubject | null> {
  const answer = await searchSubjects(id, {
    kind: [kind],
    limit: 30,
    // An exact identity is revalidated: a renamed or merged subject must not be served stale.
    cache: 'no-cache',
    ...(signal === undefined ? {} : { signal }),
  });
  return answer.subjects.find((subject) => subject.kind === kind && subject.id === id) ?? null;
}

export function buildFeedUrl(params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return `${API_BASE_URL}/calendar.ics?${search}`;
}

export async function fetchCalendarText(
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(buildFeedUrl(params), {
    ...(signal === undefined ? {} : { signal }),
    headers: { accept: 'text/calendar' },
  });
  if (!response.ok) throw new ApiError(`calendar failed with ${response.status}`, response.status);
  return await response.text();
}
