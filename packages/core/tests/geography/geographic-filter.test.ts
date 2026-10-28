import { describe, expect, it } from 'vitest';

import { parseGeographicFilter } from '../../src/geography/geographic-filter.js';

describe('parseGeographicFilter', () => {
  it('accepts an empty query without imposing a criterion', () => {
    expect(parseGeographicFilter({})).toEqual({ ok: true, filter: {} });
  });

  it('accepts each supported criterion independently', () => {
    expect(parseGeographicFilter({ country: 'fr' })).toEqual({
      ok: true,
      filter: { country: 'FR' },
    });
    expect(parseGeographicFilter({ department: '01' })).toEqual({
      ok: true,
      filter: { department: '01' },
    });
    expect(parseGeographicFilter({ commune: '69123' })).toEqual({
      ok: true,
      filter: { commune: '69123' },
    });
    expect(parseGeographicFilter({ event_type: 'tractage' })).toEqual({
      ok: true,
      filter: { eventType: 'tractage' },
    });
  });

  it('combines several criteria', () => {
    expect(
      parseGeographicFilter({
        country: 'FR',
        department: '69',
        commune: '69123',
        event_type: 'tractage',
      }),
    ).toEqual({
      ok: true,
      filter: { country: 'FR', department: '69', commune: '69123', eventType: 'tractage' },
    });
  });

  it('rejects an empty value instead of relaxing the query', () => {
    const result = parseGeographicFilter({ department: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.field).toBe('department');
  });

  it('rejects a malformed country code', () => {
    const result = parseGeographicFilter({ country: 'France' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('filter_value_invalid');
  });

  it('rejects unsupported parameters from other versions', () => {
    for (const name of ['region', 'epci', 'constituency', 'lat', 'lon', 'coordinates']) {
      const result = parseGeographicFilter({ [name]: 'x' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe('filter_parameter_unsupported');
    }
  });

  it('rejects unknown parameters', () => {
    const result = parseGeographicFilter({ foo: 'bar' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('filter_parameter_unknown');
  });
});
