import { describe, expect, it } from 'vitest';

import {
  defaultLayoutFor,
  parseRoute,
  parseSubjectKey,
  serializeRoute,
} from '../../src/shared/composables/useUrlState';

const OPTIONS = { defaultLayout: 'liste' as const, knownTypes: ['tractage', 'collage'] };

describe('parseRoute', () => {
  it('reads an empty address as the discovery screen', () => {
    expect(parseRoute('', OPTIONS)).toEqual({
      subjects: [],
      groups: [],
      subject: null,
      types: [],
      group: [],
      layout: 'liste',
      eventId: null,
      notices: [],
    });
  });

  it('reads subject, types, group, layout and open event', () => {
    const state = parseRoute(
      '?sujet=commune:69123&types=tractage&ga=GA%20Paris%2012&vue=mois&evenement=e1',
      OPTIONS,
    );
    expect(state.subject).toEqual({ kind: 'commune', id: '69123' });
    expect(state.types).toEqual(['tractage']);
    expect(state.group).toEqual(['GA Paris 12']);
    expect(state.groups).toEqual(['GA Paris 12']);
    expect(state.layout).toBe('mois');
    expect(state.eventId).toBe('e1');
  });

  it('accepts the day layout', () => {
    expect(parseRoute('?vue=jour', OPTIONS).layout).toBe('jour');
  });

  it('falls back and reports every unusable value', () => {
    const state = parseRoute('?sujet=lyon&types=inconnu&vue=annee', OPTIONS);
    expect(state.subject).toBeNull();
    expect(state.types).toEqual([]);
    expect(state.layout).toBe('liste');
    expect(state.notices).toHaveLength(3);
  });

  it('rejects a subject key without a separator or with an empty part', () => {
    expect(parseSubjectKey('lyon')).toBeNull();
    expect(parseSubjectKey(':69123')).toBeNull();
    expect(parseSubjectKey('commune:')).toBeNull();
    expect(parseSubjectKey('commune:a:b')).toBeNull();
    expect(parseSubjectKey('department:2A')).toEqual({ kind: 'department', id: '2A' });
  });
});

describe('serializeRoute', () => {
  it('omits every value equal to the default', () => {
    const search = serializeRoute(
      { subject: null, types: [], layout: 'liste', eventId: null },
      'liste',
    );
    expect(search).toBe('');
  });

  it('round-trips a filtered view without losing part of it', () => {
    const search = serializeRoute(
      {
        subject: { kind: 'group', id: 'npa-lyon' },
        types: ['tractage', 'collage'],
        layout: 'mois',
        eventId: 'e1',
      },
      'liste',
    );
    const parsed = parseRoute(search, OPTIONS);
    expect(parsed.subject).toEqual({ kind: 'group', id: 'npa-lyon' });
    expect(parsed.types.sort()).toEqual(['collage', 'tractage']);
    expect(parsed.layout).toBe('mois');
    expect(parsed.eventId).toBe('e1');
  });

  it('carries multiple selected action groups and drops them when cleared', () => {
    const kept = serializeRoute(
      {
        subject: { kind: 'commune', id: '75112' },
        types: [],
        group: ['GA Paris 12', 'GA Lyon'],
        layout: 'liste',
        eventId: null,
      },
      'liste',
    );
    expect(parseRoute(kept, OPTIONS).group).toEqual(['GA Lyon', 'GA Paris 12']);
    expect(
      serializeRoute(
        {
          subject: { kind: 'commune', id: '75112' },
          types: [],
          group: [],
          layout: 'liste',
          eventId: null,
        },
        'liste',
      ),
    ).not.toContain('ga=');
  });

  it('round-trips multiple search items without a period parameter', () => {
    const search = serializeRoute(
      {
        subjects: [
          { kind: 'commune', id: '69123' },
          { kind: 'department', id: '69' },
        ],
        groups: ['ga-lyon'],
        types: ['tractage'],
        layout: 'liste',
        eventId: null,
      },
      'liste',
    );
    const params = new URLSearchParams(search.slice(1));
    expect(params.get('sujets')).toBe('commune:69123,department:69');
    expect(params.get('groups')).toBe('ga-lyon');
    expect(search).not.toContain('period');
    expect(parseRoute(search, OPTIONS).subjects).toEqual([
      { kind: 'commune', id: '69123' },
      { kind: 'department', id: '69' },
    ]);
  });
});

describe('EPCI territory address state', () => {
  it('round-trips an EPCI subject with filters', () => {
    const search = serializeRoute(
      {
        subjects: [{ kind: 'epci', id: '200000001' }],
        groups: ['ga-lyon'],
        types: ['tractage'],
        layout: 'mois',
        eventId: null,
      },
      'liste',
    );
    expect(search).toContain('sujets=epci%3A200000001');
    const state = parseRoute(search, OPTIONS);
    expect(state.subjects).toEqual([{ kind: 'epci', id: '200000001' }]);
    expect(state.types).toEqual(['tractage']);
    expect(state.groups).toEqual(['ga-lyon']);
  });

  it('keeps the territory when a filter is removed', () => {
    const cleared = serializeRoute(
      {
        subjects: [{ kind: 'epci', id: '200000001' }],
        groups: [],
        types: [],
        layout: 'liste',
        eventId: null,
      },
      'liste',
    );
    const state = parseRoute(cleared, OPTIONS);
    expect(state.subjects).toEqual([{ kind: 'epci', id: '200000001' }]);
    expect(state.types).toEqual([]);
    expect(state.groups).toEqual([]);
  });

  it('keeps an EPCI subject readable alongside existing kinds', () => {
    const search = serializeRoute(
      {
        subjects: [
          { kind: 'commune', id: '69123' },
          { kind: 'epci', id: '200000001' },
        ],
        types: [],
        groups: [],
        layout: 'liste',
        eventId: null,
      },
      'liste',
    );
    expect(parseRoute(search, OPTIONS).subjects).toEqual([
      { kind: 'commune', id: '69123' },
      { kind: 'epci', id: '200000001' },
    ]);
  });
});

describe('defaultLayoutFor', () => {
  it('shows a day on a narrow screen and a month otherwise', () => {
    expect(defaultLayoutFor(375)).toBe('jour');
    expect(defaultLayoutFor(1280)).toBe('mois');
  });
});
