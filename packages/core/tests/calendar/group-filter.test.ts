import { describe, expect, it } from 'vitest';

import { parseCalendarFilter } from '../../src/calendar-filters/calendar-filter.js';
import { resolveCalendarCriteria } from '../../src/calendar-filters/calendar-criteria.js';

describe('group criteria on the filtered calendar', () => {
  it('reads a single group identifier', async () => {
    const parsed = parseCalendarFilter({ group: 'npa-lyon' });
    expect(parsed).toEqual({ ok: true, criteria: { groupIds: ['npa-lyon'] } });
  });

  it('combines several group identifiers with OR', async () => {
    const parsed = parseCalendarFilter({ group: 'npa-lyon,attac-rennes' });
    expect(parsed).toEqual({ ok: true, criteria: { groupIds: ['npa-lyon', 'attac-rennes'] } });
  });

  it('combines group with a place with AND', async () => {
    const parsed = parseCalendarFilter({ group: 'npa-lyon', department: '69' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const resolved = await resolveCalendarCriteria(parsed.criteria, undefined);
    expect(resolved).toEqual({
      ok: true,
      criteria: { department: '69', groupIds: ['npa-lyon'] },
    });
  });

  it('rejects an empty group value', () => {
    expect(parseCalendarFilter({ group: '' })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'filter_value_invalid', field: 'group' }],
    });
  });

  it('leaves the criteria untouched when group is absent', async () => {
    const parsed = parseCalendarFilter({ department: '69' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const resolved = await resolveCalendarCriteria(parsed.criteria, undefined);
    expect(resolved).toEqual({ ok: true, criteria: { department: '69' } });
  });
});
