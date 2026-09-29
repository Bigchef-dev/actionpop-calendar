import { describe, expect, it } from 'vitest';

import { calculateProcessingPeriod } from './processing-period.js';

describe('processing periods', () => {
  it('floors a UTC instant to a fifteen-minute slot and records Paris time', () => {
    const period = calculateProcessingPeriod(new Date('2026-07-14T15:07:31.000Z'), 15 * 60 * 1000);

    expect(period.periodStartUtc.toISOString()).toBe('2026-07-14T15:00:00.000Z');
    expect(period.periodEndUtc.toISOString()).toBe('2026-07-14T15:15:00.000Z');
    expect(period.periodStartEuropeParis).toBe('2026-07-14T17:00:00+02:00');
    expect(period.periodToken).toBe('20260714T150000Z');
  });
});