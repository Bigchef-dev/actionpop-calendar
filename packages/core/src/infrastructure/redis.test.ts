import { describe, expect, it } from 'vitest';

import { buildRedisKey, createRedisConnection } from './redis.js';

describe('Redis infrastructure', () => {
  it('builds isolated namespaced keys', () => {
    expect(buildRedisKey('test-run', 'dataset', 'group_1', 'current')).toBe(
      'test-run:dataset:group_1:current',
    );
  });

  it('rejects empty namespace or key parts', () => {
    expect(() => buildRedisKey('', 'dataset')).toThrow(/cannot be empty/);
    expect(() => buildRedisKey('test-run', ' ')).toThrow(/cannot be empty/);
  });

  it('creates a lazy connection without connecting during construction', async () => {
    const redis = createRedisConnection('redis://localhost:6379');
    expect(redis.status).toBe('wait');
    await redis.quit();
  });
});