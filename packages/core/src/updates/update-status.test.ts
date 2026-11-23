import { describe, expect, it } from 'vitest';

import type { CurrentRunCounts, SettledRun } from '../models/update-status.js';
import {
  buildUpdateStatus,
  countsFromStatuses,
  durationSeconds,
  outcomeFor,
} from './update-status.js';

const NOW = new Date('2026-11-23T21:00:00.000Z');
const INTERVAL = 15 * 60 * 1000;

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function counts(processed: number, failed: number, remaining: number): CurrentRunCounts {
  return { processed, failed, remaining, total: processed + failed + remaining };
}

function settled(minutes: number, value: CurrentRunCounts): SettledRun {
  const start = minutesAgo(minutes + 5);
  return {
    periodStartUtc: start,
    completedAt: minutesAgo(minutes),
    counts: value,
    groups: value,
    events: value,
  };
}

function currentAt(
  minutes: number,
  value: CurrentRunCounts,
  completedAt: Date | null = null,
): {
  startedAt: Date;
  counts: CurrentRunCounts;
  groups: CurrentRunCounts;
  events: CurrentRunCounts;
  completedAt: Date | null;
} {
  return {
    startedAt: minutesAgo(minutes),
    counts: value,
    groups: value,
    events: value,
    completedAt,
  };
}

function build(overrides: Partial<Parameters<typeof buildUpdateStatus>[0]> = {}) {
  return buildUpdateStatus({
    now: NOW,
    intervalMs: INTERVAL,
    current: null,
    currentAvailable: true,
    settled: [],
    ...overrides,
  });
}

describe('countsFromStatuses', () => {
  it('maps every ledger status into one of the three public buckets', () => {
    const result = countsFromStatuses({
      succeeded: 10,
      stopped: 2,
      failed: 3,
      scheduled: 4,
      running: 1,
      publishing: 1,
      retrying: 2,
    });

    expect(result).toEqual({ processed: 12, failed: 3, remaining: 8, total: 23 });
  });

  it('keeps the sum invariant for an unknown status and ignores invalid counts', () => {
    const result = countsFromStatuses({ succeeded: 2, 'mystery-status': 3, failed: -1 });

    expect(result).toEqual({ processed: 2, failed: 0, remaining: 3, total: 5 });
    expect(result.processed + result.failed + result.remaining).toBe(result.total);
  });
});

describe('outcomeFor', () => {
  it('classifies complete, partial and failed runs', () => {
    expect(outcomeFor(counts(10, 0, 0))).toBe('complete');
    expect(outcomeFor(counts(9, 1, 0))).toBe('partial');
    expect(outcomeFor(counts(0, 4, 0))).toBe('failed');
  });
});

describe('durationSeconds', () => {
  it('clamps a completion older than its period to zero', () => {
    const start = new Date('2026-11-23T20:00:00.000Z');
    expect(durationSeconds(start, new Date('2026-11-23T20:04:30.000Z'))).toBe(270);
    expect(durationSeconds(start, new Date('2026-11-23T19:59:00.000Z'))).toBe(0);
  });
});

describe('buildUpdateStatus', () => {
  it('reports up_to_date with the last completed run', () => {
    const answer = build({ settled: [settled(5, counts(20, 0, 0))] });

    expect(answer.state).toBe('up_to_date');
    expect(answer.refreshIntervalSeconds).toBe(900);
    expect(answer.lastCompleted).toEqual({
      completedAt: minutesAgo(5).toISOString(),
      durationSeconds: 300,
      processed: 20,
      failed: 0,
      outcome: 'complete',
      groups: counts(20, 0, 0),
      events: counts(20, 0, 0),
    });
    expect(answer.available).toEqual({ current: true, lastCompleted: true, history: true });
  });

  it('keeps group progress and event coverage explicit and separate', () => {
    const answer = build({
      settled: [
        {
          periodStartUtc: minutesAgo(10),
          completedAt: minutesAgo(5),
          counts: counts(20, 0, 0),
          groups: counts(15, 0, 0),
          events: counts(5, 0, 1515),
        },
      ],
    });

    expect(answer.lastCompleted?.groups).toEqual(counts(15, 0, 0));
    expect(answer.lastCompleted?.events).toEqual(counts(5, 0, 1515));
  });

  it('is not stale exactly at the interval and is stale beyond it', () => {
    expect(build({ settled: [settled(15, counts(20, 0, 0))] }).state).toBe('up_to_date');
    expect(build({ settled: [settled(16, counts(20, 0, 0))] }).state).toBe('stale');
  });

  it('reports partial when the last completed run failed some work', () => {
    const answer = build({ settled: [settled(5, counts(19, 1, 0))] });

    expect(answer.state).toBe('partial');
    expect(answer.lastCompleted?.outcome).toBe('partial');
  });

  it('reports unknown when no run has ever completed', () => {
    const answer = build();

    expect(answer.state).toBe('unknown');
    expect(answer.lastCompleted).toBeNull();
    expect(answer.history).toEqual([]);
    expect(answer.available.lastCompleted).toBe(true);
  });

  it('reports unknown when the settled read failed', () => {
    const answer = build({ settled: null });

    expect(answer.state).toBe('unknown');
    expect(answer.available.lastCompleted).toBe(false);
    expect(answer.available.history).toBe(false);
  });

  it('reports updating while work remains inside the grace window', () => {
    const answer = build({
      current: currentAt(2, counts(12, 1, 7)),
      settled: [settled(17, counts(20, 0, 0))],
    });

    expect(answer.state).toBe('updating');
    expect(answer.current).toEqual({
      startedAt: minutesAgo(2).toISOString(),
      processed: 12,
      failed: 1,
      remaining: 7,
      total: 20,
      groups: counts(12, 1, 7),
      events: counts(12, 1, 7),
      takingLongerThanUsual: false,
    });
    expect(answer.current?.processed).toBe(12);
  });

  it('flags a run taking longer than the interval', () => {
    const atInterval = build({
      current: currentAt(15, counts(10, 0, 5)),
    });
    const later = build({
      current: currentAt(16, counts(10, 0, 5)),
    });

    expect(atInterval.current?.takingLongerThanUsual).toBe(true);
    expect(later.current?.takingLongerThanUsual).toBe(true);
  });

  it('does not call an abandoned current period updating', () => {
    const answer = build({
      current: currentAt(61, counts(10, 0, 5), minutesAgo(60)),
      settled: [settled(75, counts(20, 0, 0))],
    });

    expect(answer.state).toBe('stale');
    expect(answer.current).toBeNull();
  });

  it('counts a finished current period as the latest completion', () => {
    const answer = build({
      current: currentAt(3, counts(20, 0, 0), minutesAgo(1)),
      settled: [settled(18, counts(20, 0, 0))],
    });

    expect(answer.state).toBe('up_to_date');
    expect(answer.lastCompleted?.completedAt).toBe(minutesAgo(1).toISOString());
    expect(answer.history[0]).toBe(answer.lastCompleted);
  });

  it('returns at most five runs, newest first, starting with lastCompleted', () => {
    const runs = [1, 2, 3, 4, 5, 6, 7].map((index) => settled(index * 15, counts(20, 0, 0)));
    const answer = build({ settled: runs });

    expect(answer.history).toHaveLength(5);
    expect(answer.history[0]).toBe(answer.lastCompleted);
    const times = answer.history.map((run) => Date.parse(run.completedAt));
    expect(times).toEqual([...times].sort((left, right) => right - left));
  });

  it('uses a finished current period even when the settled read failed', () => {
    const answer = build({
      current: currentAt(3, counts(20, 0, 0), minutesAgo(1)),
      settled: null,
    });

    expect(answer.state).toBe('up_to_date');
    expect(answer.available.lastCompleted).toBe(true);
    expect(answer.available.history).toBe(true);
    expect(answer.history).toHaveLength(1);
  });

  it('marks the current section unavailable without hiding the settled answer', () => {
    const answer = build({
      currentAvailable: false,
      current: currentAt(2, counts(3, 0, 4)),
      settled: [settled(5, counts(20, 0, 0))],
    });

    expect(answer.state).toBe('up_to_date');
    expect(answer.current).toBeNull();
    expect(answer.available.current).toBe(false);
  });
});
