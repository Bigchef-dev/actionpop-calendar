import { describe, expect, it } from 'vitest';

import { normalizePeriodToken, parsePeriodToken } from '../../src/domain/job-identity.js';
import { ConfigurationError } from '../../src/operations/errors.js';

describe('parsePeriodToken', () => {
  it('parses the compact token written in job identifiers', () => {
    expect(parsePeriodToken('20261028T201500Z').toISOString()).toBe('2026-10-28T20:15:00.000Z');
  });

  it('parses the ISO form carried in job data', () => {
    expect(parsePeriodToken('2026-10-28T20:15:00.000Z').toISOString()).toBe(
      '2026-10-28T20:15:00.000Z',
    );
  });

  it('round-trips with normalizePeriodToken', () => {
    const start = parsePeriodToken('20261028T201500Z');
    expect(normalizePeriodToken(start)).toBe('20261028T201500Z');
    expect(parsePeriodToken(normalizePeriodToken(start)).getTime()).toBe(start.getTime());
  });

  it('rejects an invalid token instead of producing an invalid date', () => {
    expect(() => parsePeriodToken('not-a-token')).toThrow(ConfigurationError);
    expect(() => parsePeriodToken('')).toThrow(ConfigurationError);
  });
});
