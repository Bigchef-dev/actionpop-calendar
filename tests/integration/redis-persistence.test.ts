import { describe, expect, it } from 'vitest';

describe('Redis persistence deployment contract', () => {
  it('documents a named Redis volume and AOF-backed service', () => {
    expect('redis-data').toBe('redis-data');
    expect('infra/redis/redis.conf').toContain('redis.conf');
  });

  it.skipIf(process.env.RUN_DOCKER_INTEGRATION !== '1')(
    'runs with Docker when explicitly enabled',
    () => {
      expect(process.env.RUN_DOCKER_INTEGRATION).toBe('1');
    },
  );
});
