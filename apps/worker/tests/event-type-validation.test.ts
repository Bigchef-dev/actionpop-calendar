import { describe, expect, it } from 'vitest';

import { classifyRetry } from '@actionpop/core';

import { toIncomingEvent } from '../src/ingestion/event-mapper.js';
import { EventTypeValidationError } from '../src/main.js';

const geography = { geographicStatus: 'national' as const, diagnostics: [] };

function payload(subtype: { label: string } | undefined) {
  return {
    id: 'event-1',
    name: 'Meeting',
    startTime: '2026-10-20T10:00:00+02:00',
    endTime: '2026-10-20T11:00:00+02:00',
    timezone: 'Europe/Paris',
    location: null,
    groups: [],
    ...(subtype === undefined ? {} : { subtype }),
  } as never;
}

describe('event type validation failure', () => {
  it('is classified as a non-retryable permanent failure', () => {
    const error = new EventTypeValidationError('subtype.label: "Type Invalide" is malformed');
    expect(classifyRetry(error)).toEqual({ retryable: false, reason: 'permanent' });
  });

  it('names the field and cause in the message', () => {
    const error = new EventTypeValidationError('subtype.label: "Type Invalide" is malformed');
    expect(error.message).toContain('subtype.label');
    expect(error.message).toContain('Type Invalide');
  });
});

describe('event type mapping', () => {
  it('publishes the normalized slug rather than the raw accented label', () => {
    expect(toIncomingEvent(payload({ label: 'Fête-locale' }), geography).eventType).toBe(
      'fete-locale',
    );
    expect(toIncomingEvent(payload({ label: 'Événement ILB' }), geography).eventType).toBe(
      'evenement-ilb',
    );
  });

  it('prefers the validated slug when the processor supplies one', () => {
    expect(
      toIncomingEvent(payload({ label: 'Fête-locale' }), geography, 'fete-locale').eventType,
    ).toBe('fete-locale');
  });

  it('publishes no type when the source states none', () => {
    expect(toIncomingEvent(payload(undefined), geography).eventType).toBeUndefined();
  });
});
