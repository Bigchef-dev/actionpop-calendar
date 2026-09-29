import { describe, expect, it } from 'vitest';

import { buildIngestionJobId, normalizeScopeToken, normalizePeriodToken } from './job-identity.js';

describe('job identity', () => {
  it('normalizes scope and period tokens deterministically', () => {
    expect(normalizeScopeToken('  Group/Île 42 ')).toBe('group_ile_42');
    expect(normalizePeriodToken(new Date('2026-09-24T15:00:00.000Z'))).toBe('20260924T150000Z');
    expect(buildIngestionJobId(' Group/Île 42 ', new Date('2026-09-24T15:00:00Z'))).toBe(
      'ingest-v1_scope-group_ile_42_period-20260924T150000Z',
    );
  });

  it('rejects empty scope tokens', () => {
    expect(() => normalizeScopeToken('---')).toThrow(/scope/i);
  });
});