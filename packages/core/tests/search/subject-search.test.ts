import { describe, expect, it } from 'vitest';

import {
  parseSubjectSearchRequest,
  searchSubjects,
  type SubjectCandidate,
  type SubjectKind,
  type SubjectQuery,
  type SubjectReadResult,
  type SubjectSearchReader,
} from '../../src/search/index.js';

class FakeReader implements SubjectSearchReader {
  public readonly calls: Array<{ kind: SubjectKind; query: SubjectQuery; limit: number }> = [];

  public constructor(private readonly results: Partial<Record<SubjectKind, SubjectReadResult>>) {}

  public async read(kind: SubjectKind, query: string, limit: number): Promise<SubjectReadResult> {
    this.calls.push({ kind, query, limit });
    return this.results[kind] ?? { candidates: [], total: 0 };
  }
}

function group(id: string, label: string): SubjectCandidate {
  return { kind: 'group', id, label, calendar: { path: '/calendar.ics', params: { group: id } } };
}

function epci(id: string, label: string): SubjectCandidate {
  return {
    kind: 'epci',
    id,
    label,
    qualifier: 'Métropole · 75',
    calendar: { path: '/calendar.ics', params: { epci: id } },
    sortKey: `${label}:${id}`,
  };
}

describe('parseSubjectSearchRequest', () => {
  it('rejects a query shorter than two characters', () => {
    expect(parseSubjectSearchRequest({ q: ' l ' })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'query_too_short', field: 'q' }],
    });
  });

  it('rejects a query longer than 64 characters', () => {
    expect(parseSubjectSearchRequest({ q: 'a'.repeat(65) })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'query_too_long' }],
    });
  });

  it('rejects an unknown kind by name', () => {
    const parsed = parseSubjectSearchRequest({ q: 'lyon', kind: 'commune,region' });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.diagnostics[0]?.code).toBe('kind_unknown');
    expect(parsed.diagnostics[0]?.message).toContain('region');
  });

  it('rejects a limit outside 1..30', () => {
    expect(parseSubjectSearchRequest({ q: 'lyon', limit: '0' })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'limit_invalid' }],
    });
    expect(parseSubjectSearchRequest({ q: 'lyon', limit: '1.5' })).toMatchObject({ ok: false });
  });

  it('defaults to every kind and a limit of 18', () => {
    const parsed = parseSubjectSearchRequest({ q: ' Lyon ' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.request.query).toBe('Lyon');
    expect(parsed.request.kinds).toEqual(['commune', 'department', 'group', 'epci']);
    expect(parsed.request.limit).toBe(18);
  });
});

describe('searchSubjects', () => {
  it('returns EPCI subjects with stable calendar parameters and deterministic ordering', async () => {
    const reader = new FakeReader({
      epci: {
        candidates: [
          epci('200000002', 'Grand Exemple'),
          epci('200000001', 'Grand Exemple'),
        ],
        total: 2,
      },
    });

    const parsed = parseSubjectSearchRequest({ q: 'grand', kind: 'epci' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const answer = await searchSubjects(parsed.request, reader);
    expect(answer.subjects.map((subject) => subject.id)).toEqual([
      '200000001',
      '200000002',
    ]);
    expect(answer.subjects[0]?.calendar.params).toEqual({ epci: '200000001' });
  });

  it('keeps retired EPCI candidates out of the public result', async () => {
    const reader = new FakeReader({
      epci: {
        candidates: [epci('200000001', 'Grand Exemple')],
        total: 1,
      },
    });
    const parsed = parseSubjectSearchRequest({ q: 'grand', kind: 'epci' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const answer = await searchSubjects(parsed.request, reader);
    expect(answer.subjects.every((subject) => subject.id !== '200000099')).toBe(true);
  });

  it('reads every requested kind and reports capped counts', async () => {
    const reader = new FakeReader({
      group: { candidates: [group('npa-lyon', 'NPA Lyon')], total: 250 },
    });
    const parsed = parseSubjectSearchRequest({ q: 'lyon', kind: 'group' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const answer = await searchSubjects(parsed.request, reader);

    expect(reader.calls).toEqual([
      { kind: 'group', query: { raw: 'lyon', normalized: 'lyon' }, limit: 18 },
    ]);
    expect(answer.total).toBe(100);
    expect(answer.kindCounts).toEqual({ group: 100 });
    expect(answer.subjects).toHaveLength(1);
    expect(answer.subjects[0]?.calendar.params).toEqual({ group: 'npa-lyon' });
  });

  it('returns an empty answer for an empty normalized query', async () => {
    const reader = new FakeReader({});
    const parsed = parseSubjectSearchRequest({ q: '--' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const answer = await searchSubjects(parsed.request, reader);
    expect(answer).toEqual({ query: '', subjects: [], total: 0, kindCounts: {} });
    expect(reader.calls).toHaveLength(0);
  });
});
