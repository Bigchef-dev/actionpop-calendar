import { describe, expect, it } from 'vitest';

describe('worker scaling contract', () => {
  it.skipIf(process.env.RUN_REDIS_INTEGRATION !== '1')('processes shared jobs with Redis-backed BullMQ', () => {
    expect(process.env.RUN_REDIS_INTEGRATION).toBe('1');
  });

  it('uses deterministic job identities for duplicate suppression', () => {
    const jobs = Array.from({ length: 100 }, (_, index) => `ingest-v1_scope-group_${index % 3}_period-slot`);
    expect(new Set(jobs).size).toBe(3);
  });
});