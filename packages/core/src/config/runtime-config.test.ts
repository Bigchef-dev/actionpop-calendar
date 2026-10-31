import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseRuntimeConfig } from './runtime-config.js';

/** A root without any configuration file, so built-in defaults are what is measured. */
function emptyConfigRoot(): string {
  return mkdtempSync(join(tmpdir(), 'actionpop-config-'));
}

describe('parseRuntimeConfig', () => {
  it('uses Europe/Paris and safe defaults', () => {
    const config = parseRuntimeConfig({ REDIS_URL: 'redis://localhost:6379' }, 'api');

    expect(config.app.timezone).toBe('Europe/Paris');
    expect(config.app.service).toBe('api');
    expect(config.queue.dispatcherIntervalMs).toBe(15 * 60 * 1000);
  });

  it('defaults the ingestion ceiling to 200 new groups per cycle', () => {
    const config = parseRuntimeConfig(
      { REDIS_URL: 'redis://localhost:6379' },
      'worker',
      emptyConfigRoot(),
    );

    expect(config.ingestion.maxNewGroupsPerCycle).toBe(200);
  });

  it('reads the ingestion ceiling from the environment and rejects invalid values', () => {
    expect(
      parseRuntimeConfig(
        { REDIS_URL: 'redis://localhost:6379', INGESTION_MAX_NEW_GROUPS_PER_CYCLE: '25' },
        'worker',
      ).ingestion.maxNewGroupsPerCycle,
    ).toBe(25);
    expect(() =>
      parseRuntimeConfig(
        { REDIS_URL: 'redis://localhost:6379', INGESTION_MAX_NEW_GROUPS_PER_CYCLE: '0' },
        'worker',
      ),
    ).toThrow(/INGESTION_MAX_NEW_GROUPS_PER_CYCLE/);
    expect(() =>
      parseRuntimeConfig(
        { REDIS_URL: 'redis://localhost:6379', INGESTION_MAX_NEW_GROUPS_PER_CYCLE: 'many' },
        'worker',
      ),
    ).toThrow(/INGESTION_MAX_NEW_GROUPS_PER_CYCLE/);
  });

  it('defaults the worker concurrency to 2 and reads it from the environment', () => {
    expect(
      parseRuntimeConfig({ REDIS_URL: 'redis://localhost:6379' }, 'worker').ingestion
        .workerConcurrency,
    ).toBe(2);
    expect(
      parseRuntimeConfig(
        { REDIS_URL: 'redis://localhost:6379', INGESTION_WORKER_CONCURRENCY: '1' },
        'worker',
      ).ingestion.workerConcurrency,
    ).toBe(1);
    expect(() =>
      parseRuntimeConfig(
        { REDIS_URL: 'redis://localhost:6379', INGESTION_WORKER_CONCURRENCY: '0' },
        'worker',
      ),
    ).toThrow(/INGESTION_WORKER_CONCURRENCY/);
  });

  it('defaults map discovery to enabled with a one-hour horizon and weekly reconciliation', () => {
    const config = parseRuntimeConfig(
      { REDIS_URL: 'redis://localhost:6379' },
      'worker',
      emptyConfigRoot(),
    );

    expect(config.ingestion.mapDiscoveryEnabled).toBe(true);
    expect(config.ingestion.mapFreshnessHorizonMs).toBe(3_600_000);
    expect(config.ingestion.mapReconciliationIntervalMs).toBe(604_800_000);
  });

  it('reads map discovery settings from the environment and rejects invalid values', () => {
    const config = parseRuntimeConfig(
      {
        REDIS_URL: 'redis://localhost:6379',
        INGESTION_MAP_DISCOVERY_ENABLED: 'false',
        INGESTION_MAP_FRESHNESS_HORIZON_MS: '120000',
        INGESTION_MAP_RECONCILIATION_INTERVAL_MS: '86400000',
      },
      'worker',
    );

    expect(config.ingestion.mapDiscoveryEnabled).toBe(false);
    expect(config.ingestion.mapFreshnessHorizonMs).toBe(120_000);
    expect(config.ingestion.mapReconciliationIntervalMs).toBe(86_400_000);
    expect(() =>
      parseRuntimeConfig(
        { REDIS_URL: 'redis://localhost:6379', INGESTION_MAP_DISCOVERY_ENABLED: 'maybe' },
        'worker',
      ),
    ).toThrow(/INGESTION_MAP_DISCOVERY_ENABLED/);
    expect(() =>
      parseRuntimeConfig(
        { REDIS_URL: 'redis://localhost:6379', INGESTION_MAP_FRESHNESS_HORIZON_MS: '0' },
        'worker',
      ),
    ).toThrow(/INGESTION_MAP_FRESHNESS_HORIZON_MS/);
  });

  it('rejects missing Redis configuration and invalid values', () => {
    expect(() => parseRuntimeConfig({}, 'worker')).toThrow(/REDIS_URL/);
    expect(() =>
      parseRuntimeConfig({ REDIS_URL: 'redis://localhost', DISPATCHER_INTERVAL_MS: '0' }, 'worker'),
    ).toThrow(/DISPATCHER_INTERVAL_MS/);
  });
});