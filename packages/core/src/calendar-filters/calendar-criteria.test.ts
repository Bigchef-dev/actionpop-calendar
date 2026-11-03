import { describe, expect, it } from 'vitest';

import { resolveCalendarCriteria } from './calendar-criteria.js';

describe('resolveCalendarCriteria', () => {
  it('unions EPCI communes with explicit criteria and preserves AND filters', async () => {
    const result = await resolveCalendarCriteria(
      {
        epciIds: ['200000001'],
        eventTypes: ['tractage'],
        groupIds: ['group-1'],
      },
      {
        resolve: async () => ({ inseeCodes: [], diagnostics: [] }),
        resolveEpcis: async () => ({ inseeCodes: ['01002', '01001'], diagnostics: [] }),
      },
    );

    expect(result).toEqual({
      ok: true,
      criteria: {
        epciIds: ['200000001'],
        communeIds: ['01001', '01002'],
        eventTypes: ['tractage'],
        groupIds: ['group-1'],
      },
    });
  });

  it('fails closed when an EPCI has no usable membership', async () => {
    const result = await resolveCalendarCriteria(
      { epciIds: ['200000001'] },
      {
        resolve: async () => ({ inseeCodes: [], diagnostics: [] }),
        resolveEpcis: async () => ({ inseeCodes: [], diagnostics: [] }),
      },
    );

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'epci_membership_incomplete', field: 'epci' }],
    });
  });
});
