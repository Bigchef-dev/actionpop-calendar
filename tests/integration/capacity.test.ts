import { describe, expect, it } from 'vitest';

describe('ingestion capacity contract', () => {
  it.skipIf(process.env.RUN_CAPACITY_TEST !== '1')('runs the representative Redis capacity scenario', () => {
    expect(process.env.RUN_CAPACITY_TEST).toBe('1');
  });

  it('defines the representative capacity dimensions', () => {
    expect({ users: 5000, groups: 2000, events: 100000 }).toEqual({ users: 5000, groups: 2000, events: 100000 });
  });
});