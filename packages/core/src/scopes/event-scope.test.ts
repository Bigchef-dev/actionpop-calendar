import { describe, expect, it } from 'vitest';

import {
  nextEventScopeStatus,
  requiresEventIngestion,
  type EventScopeState,
} from './event-scope.js';

const now = new Date('2026-10-29T10:00:00.000Z');

function event(
  overrides: Partial<{ groups: { id: string; name?: string }[]; endTime: string }> = {},
) {
  return {
    groups: [] as { id: string; name?: string }[],
    endTime: '2026-10-29T12:00:00.000Z',
    ...overrides,
  };
}

function scope(overrides: Partial<EventScopeState> = {}): EventScopeState {
  return {
    retrievalStatus: 'active',
    eventEndsAt: new Date('2026-10-29T12:00:00.000Z'),
    statesGroup: false,
    unknownAnswer: false,
    ...overrides,
  };
}

describe('event ingestion qualification', () => {
  it('qualifies an event that states no group and has not ended', () => {
    expect(requiresEventIngestion(event(), now)).toBe(true);
  });

  it('does not qualify an event that states a group', () => {
    expect(requiresEventIngestion(event({ groups: [{ id: 'group-a' }] }), now)).toBe(false);
  });

  it('treats blank identifiers as no stated group', () => {
    expect(requiresEventIngestion(event({ groups: [{ id: '   ' }] }), now)).toBe(true);
  });

  it('does not qualify an event that has already ended', () => {
    expect(requiresEventIngestion(event({ endTime: '2026-10-29T09:59:59.000Z' }), now)).toBe(false);
    expect(requiresEventIngestion(event({ endTime: now.toISOString() }), now)).toBe(false);
  });

  it('does not qualify an event whose end time is unreadable', () => {
    expect(requiresEventIngestion(event({ endTime: 'not a date' }), now)).toBe(false);
  });
});

describe('event scope transitions', () => {
  it('retires an ended event, a group-stating event and an unknown event', () => {
    expect(
      nextEventScopeStatus(scope({ eventEndsAt: new Date('2026-10-29T09:00:00.000Z') }), now),
    ).toEqual({ type: 'retire', reason: 'event_ended' });
    expect(nextEventScopeStatus(scope({ statesGroup: true }), now)).toEqual({
      type: 'retire',
      reason: 'event_group_stated',
    });
    expect(nextEventScopeStatus(scope({ unknownAnswer: true }), now)).toEqual({
      type: 'retire',
      reason: 'event_unknown',
    });
  });

  it('lets a definitive answer win over the other reasons', () => {
    expect(
      nextEventScopeStatus(
        scope({
          unknownAnswer: true,
          statesGroup: true,
          eventEndsAt: new Date('2026-10-29T09:00:00.000Z'),
        }),
        now,
      ),
    ).toEqual({ type: 'retire', reason: 'event_unknown' });
  });

  it('leaves a healthy or waiting scope untouched', () => {
    expect(nextEventScopeStatus(scope(), now)).toEqual({ type: 'unchanged' });
    expect(nextEventScopeStatus(scope({ retrievalStatus: 'pending' }), now)).toEqual({
      type: 'unchanged',
    });
  });

  it('never retires twice', () => {
    expect(
      nextEventScopeStatus(
        scope({ retrievalStatus: 'retired', eventEndsAt: new Date('2026-10-29T09:00:00.000Z') }),
        now,
      ),
    ).toEqual({ type: 'unchanged' });
  });

  it('reopens a retired scope only when the event qualifies again', () => {
    expect(
      nextEventScopeStatus(scope({ retrievalStatus: 'retired', observation: event() }), now),
    ).toEqual({ type: 'reopen' });
    expect(
      nextEventScopeStatus(
        scope({ retrievalStatus: 'retired', observation: event({ groups: [{ id: 'group-a' }] }) }),
        now,
      ),
    ).toEqual({ type: 'unchanged' });
    expect(nextEventScopeStatus(scope({ retrievalStatus: 'retired' }), now)).toEqual({
      type: 'unchanged',
    });
  });
});
