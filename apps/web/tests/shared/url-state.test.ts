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
      subject: null,
      types: [],
      layout: 'liste',
      eventId: null,
      notices: [],
    });
  });

  it('reads subject, types, layout and open event', () => {
    const state = parseRoute('?sujet=commune:69123&types=tractage&vue=mois&evenement=e1', OPTIONS);
    expect(state.subject).toEqual({ kind: 'commune', id: '69123' });
    expect(state.types).toEqual(['tractage']);
    expect(state.layout).toBe('mois');
    expect(state.eventId).toBe('e1');
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
});

describe('defaultLayoutFor', () => {
  it('lists on a narrow screen and shows a month otherwise', () => {
    expect(defaultLayoutFor(375)).toBe('liste');
    expect(defaultLayoutFor(1280)).toBe('mois');
  });
});
