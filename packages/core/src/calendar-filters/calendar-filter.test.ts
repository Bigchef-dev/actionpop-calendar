import { describe, expect, it } from 'vitest';

import { parseCalendarFilter } from './calendar-filter.js';

describe('calendar filter', () => {
  it('accepts a single department', () => {
    const result = parseCalendarFilter({ department: '69' });
    expect(result).toEqual({ ok: true, criteria: { department: '69' } });
  });

  it('accepts a single event type', () => {
    const result = parseCalendarFilter({ event_type: 'tractage' });
    expect(result).toEqual({ ok: true, criteria: { eventTypes: ['tractage'] } });
  });

  it('parses EPCI identifiers as a list', () => {
    expect(parseCalendarFilter({ epci: '200000001,200000002' })).toEqual({
      ok: true,
      criteria: { epciIds: ['200000001', '200000002'] },
    });
  });

  it('combines comma-separated event types with OR semantics', () => {
    const result = parseCalendarFilter({ event_type: 'tractage, boitage' });
    expect(result).toEqual({ ok: true, criteria: { eventTypes: ['tractage', 'boitage'] } });
  });

  it('keeps department and event type as separate AND criteria', () => {
    const result = parseCalendarFilter({ department: '69', event_type: 'tractage' });
    expect(result).toEqual({
      ok: true,
      criteria: { department: '69', eventTypes: ['tractage'] },
    });
  });

  it('preserves leading zeroes and alphanumeric department codes', () => {
    expect(parseCalendarFilter({ department: '01' })).toEqual({
      ok: true,
      criteria: { department: '01' },
    });
    expect(parseCalendarFilter({ department: '2a' })).toEqual({
      ok: true,
      criteria: { department: '2A' },
    });
  });

  it('accepts an uppercase country code and normalizes it', () => {
    expect(parseCalendarFilter({ country: 'fr' })).toEqual({
      ok: true,
      criteria: { country: 'FR' },
    });
  });

  it('imposes no constraint when no criterion is supplied', () => {
    expect(parseCalendarFilter({})).toEqual({ ok: true, criteria: {} });
  });

  it('collapses duplicate list values', () => {
    expect(parseCalendarFilter({ event_type: 'tractage,tractage' })).toEqual({
      ok: true,
      criteria: { eventTypes: ['tractage'] },
    });
  });

  it('rejects an empty list item', () => {
    const result = parseCalendarFilter({ event_type: 'tractage,' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]).toMatchObject({
      code: 'filter_value_invalid',
      field: 'event_type',
    });
  });

  it('rejects an empty parameter value', () => {
    const result = parseCalendarFilter({ department: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed country code', () => {
    const result = parseCalendarFilter({ country: 'France' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]).toMatchObject({
      code: 'filter_value_invalid',
      field: 'country',
    });
  });

  it('accepts a comma-separated INSEE list and keeps codes as strings', () => {
    expect(parseCalendarFilter({ insee_commune: '69123,01001' })).toEqual({
      ok: true,
      criteria: { communeIds: ['69123', '01001'] },
    });
  });

  it('accepts several commune names as one dimension', () => {
    expect(parseCalendarFilter({ commune_name: 'Lyon,Villeurbanne' })).toEqual({
      ok: true,
      criteria: { communeNames: ['Lyon', 'Villeurbanne'] },
    });
  });

  it('keeps commune names and INSEE codes in separate criteria before resolution', () => {
    expect(parseCalendarFilter({ commune_name: 'Lyon', insee_commune: '69266' })).toEqual({
      ok: true,
      criteria: { communeNames: ['Lyon'], communeIds: ['69266'] },
    });
  });

  it('rejects an empty item inside the INSEE list', () => {
    const result = parseCalendarFilter({ insee_commune: '69123,' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]).toMatchObject({
      code: 'filter_value_invalid',
      field: 'insee_commune',
    });
  });

  it('collapses duplicate INSEE codes', () => {
    expect(parseCalendarFilter({ insee_commune: '69123,69123' })).toEqual({
      ok: true,
      criteria: { communeIds: ['69123'] },
    });
  });
});
