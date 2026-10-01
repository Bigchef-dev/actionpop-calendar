import { describe, expect, it } from 'vitest';

import { loadWorkerConfig } from '../src/config.js';
import { createWorkerRuntime } from '../src/main.js';

describe('worker startup contract', () => {
  it('requires Redis configuration and exposes no HTTP server', () => {
    expect(() => loadWorkerConfig({})).toThrow(/REDIS_URL/);
    expect(() => loadWorkerConfig({ REDIS_URL: 'redis://localhost:6379' })).toThrow(/UPSTREAM_BASE_URL/);
    const runtime = createWorkerRuntime({
      REDIS_URL: 'redis://localhost:6379',
      UPSTREAM_BASE_URL: 'https://actionpopulaire.example',
    });
    expect('inject' in runtime).toBe(false);
  });
});
