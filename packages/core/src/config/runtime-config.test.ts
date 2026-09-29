import { describe, expect, it } from 'vitest';

import { parseRuntimeConfig } from './runtime-config.js';

describe('parseRuntimeConfig', () => {
  it('uses Europe/Paris and safe defaults', () => {
    const config = parseRuntimeConfig({ REDIS_URL: 'redis://localhost:6379' }, 'api');

    expect(config.timezone).toBe('Europe/Paris');
    expect(config.service).toBe('api');
    expect(config.dispatcherIntervalMs).toBe(15 * 60 * 1000);
  });

  it('rejects missing Redis configuration and invalid values', () => {
    expect(() => parseRuntimeConfig({}, 'worker')).toThrow(/REDIS_URL/);
    expect(() =>
      parseRuntimeConfig({ REDIS_URL: 'redis://localhost', DISPATCHER_INTERVAL_MS: '0' }, 'worker'),
    ).toThrow(/DISPATCHER_INTERVAL_MS/);
  });
});