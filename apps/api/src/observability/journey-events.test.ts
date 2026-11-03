import { describe, expect, it } from 'vitest';

import {
  MAX_BODY_BYTES,
  MAX_STEPS_PER_BATCH,
  isJsonContentType,
  parseJourneyBatch,
} from './journey-events.js';

function batch(steps: readonly unknown[], visit = 'abcdefgh'): string {
  return JSON.stringify({ v: 1, visit, steps });
}

describe('journey batch parsing', () => {
  it('accepts a well-formed batch and keeps the subject kind', () => {
    const result = parseJourneyBatch(
      batch([{ s: 'arrival' }, { s: 'subject_selected', k: 'commune' }]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.steps).toEqual([
      { step: 'arrival', subjectKind: 'none' },
      { step: 'subject_selected', subjectKind: 'commune' },
    ]);
    expect(result.batch.visit).toBe('abcdefgh');
  });

  it('drops an unknown step and an unknown subject kind instead of rejecting the batch', () => {
    const result = parseJourneyBatch(batch([{ s: 'teleport' }, { s: 'search', k: 'galaxy' }]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.unknownSteps).toBe(1);
    expect(result.batch.steps).toEqual([{ step: 'search', subjectKind: 'none' }]);
  });

  it('counts a step without a usable name as malformed', () => {
    const result = parseJourneyBatch(batch([{ s: 12 }, 'arrival']));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batch.malformedSteps).toBe(2);
    expect(result.batch.steps).toEqual([]);
  });

  it('rejects a body that is not JSON, or whose envelope is out of range', () => {
    expect(parseJourneyBatch('not json')).toEqual({ ok: false, reason: 'malformed' });
    expect(parseJourneyBatch('[]')).toEqual({ ok: false, reason: 'malformed' });
    expect(parseJourneyBatch(JSON.stringify({ v: 2, visit: 'a', steps: [{ s: 'arrival' }] }))).toEqual(
      { ok: false, reason: 'malformed' },
    );
    expect(parseJourneyBatch(JSON.stringify({ v: 1, visit: 'bad visit', steps: [] }))).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(parseJourneyBatch(batch([]))).toEqual({ ok: false, reason: 'malformed' });
    expect(
      parseJourneyBatch(batch(Array.from({ length: MAX_STEPS_PER_BATCH + 1 }, () => ({ s: 'search' })))),
    ).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects a visit identifier that is not opaque and bounded', () => {
    expect(parseJourneyBatch(batch([{ s: 'arrival' }], 'x'.repeat(65)))).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(parseJourneyBatch(batch([{ s: 'arrival' }], 'has space'))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects a body above the size ceiling', () => {
    const oversized = JSON.stringify({ v: 1, visit: 'abcdefgh', steps: [], padding: 'a'.repeat(MAX_BODY_BYTES) });

    expect(parseJourneyBatch(oversized)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('accepts JSON content types with a charset suffix only', () => {
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('application/json; charset=utf-8')).toBe(true);
    expect(isJsonContentType('Application/JSON')).toBe(true);
    expect(isJsonContentType('text/plain')).toBe(false);
    expect(isJsonContentType(undefined)).toBe(false);
  });
});
