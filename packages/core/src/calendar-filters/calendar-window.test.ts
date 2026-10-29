import { describe, expect, it } from 'vitest';

import { computeCalendarWindow, overlapsCalendarWindow } from './calendar-window.js';

const request = new Date('2026-10-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('calendar window', () => {
  it('applies the default 30/90 whole-day offsets', () => {
    const window = computeCalendarWindow({ lookbackDays: 30, lookaheadDays: 90 }, request);

    expect(window.startUtc.toISOString()).toBe('2026-09-15T12:00:00.000Z');
    expect(window.endUtc.toISOString()).toBe('2027-01-13T12:00:00.000Z');
  });

  it('accepts a zero lookback and a one-day lookahead', () => {
    const window = computeCalendarWindow({ lookbackDays: 0, lookaheadDays: 1 }, request);

    expect(window.startUtc.getTime()).toBe(request.getTime());
    expect(window.endUtc.getTime()).toBe(request.getTime() + DAY_MS);
  });

  it('includes an event ending exactly on the lookback boundary', () => {
    const window = computeCalendarWindow({ lookbackDays: 30, lookaheadDays: 90 }, request);

    expect(
      overlapsCalendarWindow(
        {
          startTime: new Date(window.startUtc.getTime() - 2 * DAY_MS),
          endTime: window.startUtc,
        },
        window,
      ),
    ).toBe(true);
  });

  it('includes an event starting exactly on the lookahead boundary', () => {
    const window = computeCalendarWindow({ lookbackDays: 30, lookaheadDays: 90 }, request);

    expect(
      overlapsCalendarWindow(
        { startTime: window.endUtc, endTime: new Date(window.endUtc.getTime() + DAY_MS) },
        window,
      ),
    ).toBe(true);
  });

  it('excludes an event entirely before the lookback', () => {
    const window = computeCalendarWindow({ lookbackDays: 30, lookaheadDays: 90 }, request);

    expect(
      overlapsCalendarWindow(
        {
          startTime: new Date(window.startUtc.getTime() - 5 * DAY_MS),
          endTime: new Date(window.startUtc.getTime() - DAY_MS),
        },
        window,
      ),
    ).toBe(false);
  });

  it('excludes an event entirely after the lookahead', () => {
    const window = computeCalendarWindow({ lookbackDays: 30, lookaheadDays: 90 }, request);

    expect(
      overlapsCalendarWindow(
        {
          startTime: new Date(window.endUtc.getTime() + DAY_MS),
          endTime: new Date(window.endUtc.getTime() + 3 * DAY_MS),
        },
        window,
      ),
    ).toBe(false);
  });

  it('includes an event spanning the whole window', () => {
    const window = computeCalendarWindow({ lookbackDays: 30, lookaheadDays: 90 }, request);

    expect(
      overlapsCalendarWindow(
        {
          startTime: new Date(window.startUtc.getTime() - 10 * DAY_MS),
          endTime: new Date(window.endUtc.getTime() + 10 * DAY_MS),
        },
        window,
      ),
    ).toBe(true);
  });
});
