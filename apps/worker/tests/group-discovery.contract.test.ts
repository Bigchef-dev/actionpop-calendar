import { describe, expect, it } from 'vitest';

import { validateActionPopulaireEvent } from '@actionpop/core';

import { toIncomingEvent } from '../src/ingestion/event-mapper.js';

const geography = {
  geographicStatus: 'national' as const,
  diagnostics: [],
};

function payload(groups: { id: string; name: string }[]) {
  return {
    id: 'event-1',
    name: 'Tractage',
    startTime: '2026-10-20T10:00:00+02:00',
    endTime: '2026-10-20T11:00:00+02:00',
    timezone: 'Europe/Paris',
    location: null,
    groups,
  } as never;
}

describe('observed group discovery', () => {
  it('carries every stated group into the published event', () => {
    const incoming = toIncomingEvent(
      payload([
        { id: 'group-b', name: 'Beta' },
        { id: 'group-a', name: 'Alpha' },
      ]),
      geography,
    );

    expect(incoming.groups).toEqual([
      { id: 'group-a', name: 'Alpha' },
      { id: 'group-b', name: 'Beta' },
    ]);
    expect(incoming.blankGroupIdentifiers).toBeUndefined();
  });

  it('publishes the event even when a stated identifier is blank or duplicated', () => {
    const incoming = toIncomingEvent(
      payload([
        { id: '   ', name: 'Blank' },
        { id: 'Group-A', name: 'First' },
        { id: 'group-a', name: 'Second' },
      ]),
      geography,
    );

    expect(incoming.groups).toEqual([{ id: 'Group-A', name: 'First' }]);
    expect(incoming.blankGroupIdentifiers).toBe(1);
  });

  it('publishes an event whose payload states an unnamed group or a blank identifier', () => {
    const validated = validateActionPopulaireEvent({
      id: 'event-2',
      name: 'Réunion',
      startTime: '2026-10-20T10:00:00+02:00',
      endTime: '2026-10-20T11:00:00+02:00',
      timezone: 'Europe/Paris',
      location: { name: 'Place' },
      groups: [{ id: 'group-a' }, { id: '   ', name: 'Blank' }, { id: 'group-b', name: '  ' }],
    });

    const incoming = toIncomingEvent(validated, geography, undefined);

    expect(incoming.groups).toEqual([{ id: 'group-a' }, { id: 'group-b' }]);
    expect(incoming.blankGroupIdentifiers).toBe(1);
  });

  it('treats a missing or empty group list as "no group stated"', () => {
    expect(toIncomingEvent(payload([]), geography).groups).toEqual([]);
  });
});
