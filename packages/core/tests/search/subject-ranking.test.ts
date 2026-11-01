import { describe, expect, it } from 'vitest';

import {
  rankSubjects,
  subjectRankTier,
  type RankingQuery,
  type SubjectCandidate,
} from '../../src/search/index.js';

function q(value: string): RankingQuery {
  return {
    raw: value,
    normalized: value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim(),
  };
}

function commune(
  id: string,
  label: string,
  department: string,
  extra: Partial<SubjectCandidate> = {},
): SubjectCandidate {
  return {
    kind: 'commune',
    id,
    label,
    qualifier: department,
    parent: department,
    calendar: { path: '/calendar.ics', params: { insee_commune: id } },
    sortKey: `${department}:${id}`,
    ...extra,
  };
}

describe('subjectRankTier', () => {
  it('is insensitive to accents, case and punctuation', () => {
    expect(subjectRankTier(commune('69123', 'Saint-Étienne', '42'), q('saint etienne'))).toBe(0);
  });

  it('tolerates repeated-letter typos in geographic names', () => {
    expect(
      subjectRankTier(
        {
          kind: 'department',
          id: '35',
          label: 'Ille-et-Vilaine',
          calendar: { path: '/calendar.ics', params: { department: '35' } },
        },
        q('ile et vilaine'),
      ),
    ).toBe(0);
  });

  it('ranks exact before prefix before contains', () => {
    expect(subjectRankTier(commune('1', 'Lyon', '69'), q('lyon'))).toBe(0);
    expect(subjectRankTier(commune('1', 'Lyon', '69'), q('ly'))).toBe(1);
    expect(subjectRankTier(commune('1', 'Villeurbanne', '69'), q('urban'))).toBe(2);
    expect(subjectRankTier(commune('1', 'Lyon', '69'), q('zz'))).toBeNull();
  });

  it('matches a department by its code as well as by its name', () => {
    const department: SubjectCandidate = {
      kind: 'department',
      id: '69',
      label: 'Rhône',
      calendar: { path: '/calendar.ics', params: { department: '69' } },
      aliases: ['69'],
    };
    expect(subjectRankTier(department, q('69'))).toBe(0);
    expect(subjectRankTier(department, q('rhone'))).toBe(0);
  });
});

describe('rankSubjects', () => {
  it('orders communes before departments before groups', () => {
    const ranked = rankSubjects(
      [
        {
          kind: 'group',
          id: 'g',
          label: 'Lyon',
          calendar: { path: '/calendar.ics', params: { group: 'g' } },
        },
        {
          kind: 'department',
          id: '69',
          label: 'Lyon',
          calendar: { path: '/calendar.ics', params: { department: '69' } },
        },
        commune('69123', 'Lyon', '69'),
      ],
      q('lyon'),
      { perKind: 6, total: 18 },
    );
    expect(ranked.map((subject) => subject.kind)).toEqual(['commune', 'department', 'group']);
  });

  it('keeps homonymous communes once per department', () => {
    const ranked = rankSubjects(
      [commune('93066', 'Saint-Denis', '93'), commune('97411', 'Saint-Denis', '974')],
      q('saint denis'),
      { perKind: 6, total: 18 },
    );
    expect(ranked.map((subject) => subject.id)).toEqual(['93066', '97411']);
    expect(ranked.every((subject) => subject.qualifier !== undefined)).toBe(true);
  });

  it('caps entries per kind and in total', () => {
    const candidates = Array.from({ length: 10 }, (_, index) =>
      commune(`${index}`, `Lyon ${index}`, '69'),
    );
    const perKind = rankSubjects(candidates, q('lyon'), { perKind: 3, total: 18 });
    expect(perKind).toHaveLength(3);
    const total = rankSubjects(candidates, q('lyon'), { perKind: 6, total: 2 });
    expect(total).toHaveLength(2);
  });

  it('collapses duplicate identities and drops invalid entries', () => {
    const ranked = rankSubjects(
      [
        commune('69123', 'Lyon', '69'),
        commune('69123', 'Lyon', '69'),
        { kind: 'commune', id: '', label: 'Vide', calendar: { path: '/calendar.ics', params: {} } },
      ],
      q('lyon'),
      { perKind: 6, total: 18 },
    );
    expect(ranked).toHaveLength(1);
  });
});

describe('identifier resolution', () => {
  it('resolves a subject by its exact identifier, whatever its punctuation', () => {
    const group: SubjectCandidate = {
      kind: 'group',
      id: '1ec42e84-da74-440c-a123-3d56551213aa',
      label: 'Lyon 6e insoumis',
      calendar: {
        path: '/calendar.ics',
        params: { group: '1ec42e84-da74-440c-a123-3d56551213aa' },
      },
    };
    expect(subjectRankTier(group, q('1ec42e84-da74-440c-a123-3d56551213aa'))).toBe(0);
    expect(subjectRankTier(group, q('1ec42e84'))).toBeNull();
  });
});
