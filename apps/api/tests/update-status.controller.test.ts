import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  CurrentRunCounts,
  CurrentRunReading,
  SettledRun,
  UpdateStatusReader,
} from '@actionpop/core';

import { buildApp } from '../src/server.js';
import { UpdateStatusService } from '../src/services/update-status.service.js';

const NOW = new Date('2026-11-23T21:00:00.000Z');
const INTERVAL = 15 * 60 * 1000;

function counts(processed: number, failed: number, remaining: number): CurrentRunCounts {
  return { processed, failed, remaining, total: processed + failed + remaining };
}

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function settled(minutes: number, value: CurrentRunCounts = counts(20, 0, 0)): SettledRun {
  return {
    periodStartUtc: minutesAgo(minutes + 5),
    completedAt: minutesAgo(minutes),
    counts: value,
    groups: value,
    events: value,
  };
}

class StubReader implements UpdateStatusReader {
  public currentReading: CurrentRunReading | null = null;
  public currentFailure: Error | null = null;
  public settledRuns: readonly SettledRun[] = [];
  public settledFailure: Error | null = null;
  public calls = { current: 0, settled: 0 };

  public async current(): Promise<CurrentRunReading | null> {
    this.calls.current += 1;
    if (this.currentFailure !== null) throw this.currentFailure;
    return this.currentReading;
  }

  public async settled(): Promise<readonly SettledRun[]> {
    this.calls.settled += 1;
    if (this.settledFailure !== null) throw this.settledFailure;
    return this.settledRuns;
  }
}

const apps: NestFastifyApplication[] = [];

async function buildAppWith(
  reader: UpdateStatusReader,
  cacheTtlMs = 0,
): Promise<NestFastifyApplication> {
  const app = await buildApp({
    datasetRepository: {
      getCurrent: async () => ({
        scopeId: 'group-1',
        revision: 1,
        generatedAt: NOW.toISOString(),
        events: [],
      }),
    },
    updateStatus: new UpdateStatusService({
      reader,
      intervalMs: INTERVAL,
      now: () => NOW,
      cacheTtlMs,
    }),
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  return app;
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

const TOP_LEVEL_KEYS = [
  'available',
  'checkedAt',
  'current',
  'history',
  'lastCompleted',
  'refreshIntervalSeconds',
  'state',
];

const FORBIDDEN = [
  'scopeId',
  'jobId',
  'periodToken',
  'lastError',
  'displayName',
  'communeId',
  'countryCode',
  'queue',
  'workerId',
  'host',
  'error',
];

describe('GET /updates', () => {
  it('answers the freshness payload with the public cache header', async () => {
    const reader = new StubReader();
    reader.settledRuns = [settled(5)];
    const app = await buildAppWith(reader);

    const response = await app.inject({ method: 'GET', url: '/updates' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=15');
    expect(Object.keys(body).sort()).toEqual(TOP_LEVEL_KEYS);
    expect(body.state).toBe('up_to_date');
    expect(body.refreshIntervalSeconds).toBe(900);
    expect(body.current).toBeNull();
    expect(body.lastCompleted).toEqual({
      completedAt: minutesAgo(5).toISOString(),
      durationSeconds: 300,
      processed: 20,
      failed: 0,
      outcome: 'complete',
      groups: counts(20, 0, 0),
      events: counts(20, 0, 0),
    });
    expect(body.history).toEqual([body.lastCompleted]);
    expect(body.available).toEqual({ current: true, lastCompleted: true, history: true });
  });

  it('never exposes an identifier, a failure reason or an internal section', async () => {
    const reader = new StubReader();
    reader.settledRuns = [settled(5), settled(20, counts(19, 1, 0))];
    const app = await buildAppWith(reader);

    const body = (await app.inject({ method: 'GET', url: '/updates' })).body;

    for (const key of FORBIDDEN) expect(body).not.toContain(key);
    expect(Object.keys(JSON.parse(body).lastCompleted).sort()).toEqual([
      'completedAt',
      'durationSeconds',
      'events',
      'failed',
      'groups',
      'outcome',
      'processed',
    ]);
  });

  it('degrades to unknown without a 5xx when the settled read fails', async () => {
    const reader = new StubReader();
    reader.settledFailure = new Error('database down');
    const app = await buildAppWith(reader);

    const response = await app.inject({ method: 'GET', url: '/updates' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.state).toBe('unknown');
    expect(body.lastCompleted).toBeNull();
    expect(body.history).toEqual([]);
    expect(body.available.lastCompleted).toBe(false);
    expect(response.body).not.toContain('database down');
  });

  it('keeps the settled answer when only the current-period read fails', async () => {
    const reader = new StubReader();
    reader.currentFailure = new Error('database down');
    reader.settledRuns = [settled(5)];
    const app = await buildAppWith(reader);

    const body = (await app.inject({ method: 'GET', url: '/updates' })).json();

    expect(body.state).toBe('up_to_date');
    expect(body.current).toBeNull();
    expect(body.available.current).toBe(false);
  });

  it('reports a live run with counts that add up', async () => {
    const reader = new StubReader();
    reader.currentReading = {
      counts: counts(12, 1, 7),
      groups: counts(10, 1, 5),
      events: counts(2, 0, 1638),
      completedAt: null,
    };
    reader.settledRuns = [settled(20)];
    const app = await buildAppWith(reader);

    const body = (await app.inject({ method: 'GET', url: '/updates' })).json();

    expect(body.state).toBe('updating');
    expect(body.current).toEqual({
      startedAt: '2026-11-23T21:00:00.000Z',
      processed: 12,
      failed: 1,
      remaining: 7,
      total: 20,
      groups: counts(10, 1, 5),
      events: counts(2, 0, 1638),
      takingLongerThanUsual: false,
    });
  });

  it('exposes explicit group and event n/total figures', async () => {
    const reader = new StubReader();
    reader.settledRuns = [
      {
        periodStartUtc: minutesAgo(10),
        completedAt: minutesAgo(5),
        counts: counts(20, 0, 0),
        groups: counts(15, 0, 0),
        events: counts(5, 0, 1515),
      },
    ];
    const app = await buildAppWith(reader);

    const body = (await app.inject({ method: 'GET', url: '/updates' })).json();

    expect(body.lastCompleted.groups).toEqual({
      processed: 15,
      failed: 0,
      remaining: 0,
      total: 15,
    });
    expect(body.lastCompleted.events).toEqual({
      processed: 5,
      failed: 0,
      remaining: 1515,
      total: 1520,
    });
  });

  it('returns at most five runs, newest first, starting with lastCompleted', async () => {
    const reader = new StubReader();
    reader.settledRuns = [5, 20, 35, 50, 65, 80, 95].map((minutes) => settled(minutes));
    const app = await buildAppWith(reader);

    const body = (await app.inject({ method: 'GET', url: '/updates' })).json();

    expect(body.history).toHaveLength(5);
    expect(body.history[0]).toEqual(body.lastCompleted);
    const times = body.history.map((run: { completedAt: string }) => Date.parse(run.completedAt));
    expect(times).toEqual([...times].sort((left, right) => right - left));
    expect(Object.keys(body.history[0]).sort()).toEqual([
      'completedAt',
      'durationSeconds',
      'events',
      'failed',
      'groups',
      'outcome',
      'processed',
    ]);
  });

  it('caches a successful answer for the configured window', async () => {
    const reader = new StubReader();
    reader.settledRuns = [settled(5)];
    const app = await buildAppWith(reader, 10_000);

    await app.inject({ method: 'GET', url: '/updates' });
    await app.inject({ method: 'GET', url: '/updates' });

    expect(reader.calls.settled).toBe(1);
  });
});
