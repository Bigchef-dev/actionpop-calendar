import { describe, expect, it } from 'vitest';

import { parseRoute, serializeRoute } from '../../src/shared/composables/useUrlState';

const OPTIONS = { defaultLayout: 'mois' as const, knownTypes: ['tractage'] };

describe('shared address', () => {
  it('reproduces exactly the same subject, filters and period for the recipient', () => {
    const original = {
      subject: { kind: 'department', id: '69' },
      types: ['tractage'],
      layout: 'semaine' as const,
      eventId: null,
    };
    const received = parseRoute(serializeRoute(original, 'mois'), OPTIONS);
    expect(received.subject).toEqual(original.subject);
    expect(received.types).toEqual(original.types);
    expect(received.layout).toBe(original.layout);
  });

  it('never throws and never loses the view on a corrupted address', () => {
    const corrupted = '?sujet=commune&types=,,&vue=&evenement=%20';
    const state = parseRoute(corrupted, OPTIONS);
    expect(state.subject).toBeNull();
    expect(state.types).toEqual([]);
    expect(state.layout).toBe('mois');
    expect(state.eventId).toBeNull();
    expect(state.notices.length).toBeGreaterThan(0);
  });

  it('reports an unknown subject instead of throwing', () => {
    const state = parseRoute('?sujet=region:11', OPTIONS);
    expect(state.subject).toEqual({ kind: 'region', id: '11' });
    expect(state.notices).toEqual([]);
  });
});
