import { describe, expect, it } from 'vitest';

import type { UpdateStatusAnswer } from '../../src/types';
import {
  formatAge,
  formatCount,
  formatDuration,
  formatUpdateTime,
  outcomeLabel,
  stateLabel,
  statusLine,
} from '../../src/features/updates/utils/update-status-format';

const NOW = new Date('2026-11-23T21:00:00.000Z');

function answer(overrides: Partial<UpdateStatusAnswer> = {}): UpdateStatusAnswer {
  return {
    checkedAt: NOW.toISOString(),
    refreshIntervalSeconds: 900,
    state: 'up_to_date',
    current: null,
    lastCompleted: {
      completedAt: '2026-11-23T20:55:00.000Z',
      durationSeconds: 312,
      processed: 20,
      failed: 0,
      outcome: 'complete',
      groups: { processed: 20, failed: 0, remaining: 0, total: 20 },
      events: { processed: 20, failed: 0, remaining: 0, total: 20 },
    },
    history: [],
    available: { current: true, lastCompleted: true, history: true },
    ...overrides,
  };
}

describe('formatCount', () => {
  it('groups thousands with a regular space', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1640)).toBe('1 640');
    expect(formatCount(3281)).toBe('3 281');
  });
});

describe('formatAge', () => {
  it('uses French relative wording and clamps a future instant', () => {
    expect(formatAge('2026-11-23T20:59:50.000Z', NOW)).toBe("à l'instant");
    expect(formatAge('2026-11-23T20:55:00.000Z', NOW)).toBe('il y a 5 min');
    expect(formatAge('2026-11-23T18:00:00.000Z', NOW)).toBe('il y a 3 h');
    expect(formatAge('2026-11-20T21:00:00.000Z', NOW)).toBe('il y a 3 j');
    expect(formatAge('2026-11-23T22:00:00.000Z', NOW)).toBe("à l'instant");
  });
});

describe('formatUpdateTime', () => {
  it('renders in Europe/Paris, not the machine timezone', () => {
    const text = formatUpdateTime('2026-11-23T20:45:00.000Z');
    expect(text).toContain('23/11');
    expect(text).toContain('21:45');
  });
});

describe('formatDuration', () => {
  it('renders seconds and minutes', () => {
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(300)).toBe('5 min');
    expect(formatDuration(312)).toBe('5 min 12 s');
  });
});

describe('labels', () => {
  it('names every state and outcome in French', () => {
    expect(stateLabel('up_to_date')).toBe('Données à jour');
    expect(stateLabel('stale')).toBe('Données anciennes');
    expect(outcomeLabel('partial')).toBe('partiel');
  });
});

describe('statusLine', () => {
  it('combines state and age when idle', () => {
    expect(statusLine(answer(), NOW)).toBe(
      'Données à jour · il y a 5 min · Groupes 20/20 · Événements 20/20',
    );
  });

  it('shows processed, remaining and failures while updating', () => {
    const line = statusLine(
      answer({
        state: 'updating',
        lastCompleted: null,
        current: {
          startedAt: '2026-11-23T20:45:00.000Z',
          processed: 12,
          failed: 1,
          remaining: 7,
          total: 20,
          groups: { processed: 12, failed: 1, remaining: 7, total: 20 },
          events: { processed: 12, failed: 1, remaining: 7, total: 20 },
          takingLongerThanUsual: false,
        },
      }),
      NOW,
    );

    expect(line).toBe('Mise à jour en cours · Groupes 12/20 · Événements 12/20 · 1 en échec');
  });

  it('flags a run taking longer and omits a zero failure', () => {
    const line = statusLine(
      answer({
        state: 'updating',
        current: {
          startedAt: '2026-11-23T20:45:00.000Z',
          processed: 12,
          failed: 0,
          remaining: 7,
          total: 19,
          groups: { processed: 12, failed: 0, remaining: 7, total: 19 },
          events: { processed: 12, failed: 0, remaining: 7, total: 19 },
          takingLongerThanUsual: true,
        },
      }),
      NOW,
    );

    expect(line).toContain('Groupes 12/19');
    expect(line).toContain('plus longue que prévu');
    expect(line).not.toContain('en échec');
  });

  it('distinguishes an unreadable status from a system that never updated', () => {
    expect(
      statusLine(
        answer({
          state: 'unknown',
          lastCompleted: null,
          available: { current: true, lastCompleted: false, history: false },
        }),
        NOW,
      ),
    ).toBe('État des mises à jour indisponible');
    expect(statusLine(answer({ state: 'unknown', lastCompleted: null }), NOW)).toBe(
      'Aucune mise à jour connue',
    );
  });
});
