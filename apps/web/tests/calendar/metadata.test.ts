import { describe, expect, it } from 'vitest';

import type { CalendarEvent, MetadataEntry } from '../../src/types';
import {
  METADATA_EVENT_ID,
  METADATA_GROUP,
  groupCountsOf,
  groupIds,
  groupIdsOf,
  hasAnyGroup,
  metadataValue,
  metadataValues,
} from '../../src/features/calendar/utils/metadata';

function entry(name: string, value: string): MetadataEntry {
  return { name, value, parameters: {} };
}

function eventWith(id: string, groups: readonly string[]): CalendarEvent {
  return {
    id,
    summary: id,
    description: '',
    start: new Date(Date.UTC(2026, 10, 7, 13)),
    end: null,
    allDay: false,
    status: 'CONFIRMED',
    eventType: 'porte-a-porte',
    sourceUrl: null,
    location: null,
    coordinates: null,
    metadata: [
      entry(METADATA_EVENT_ID, `raw-${id}`),
      ...groups.map((group) => entry(METADATA_GROUP, group)),
    ],
  };
}

describe('metadataValues', () => {
  it('returns the values of one property in declaration order', () => {
    const entries = [entry(METADATA_GROUP, 'b'), entry(METADATA_GROUP, 'a')];

    expect(metadataValues(entries, METADATA_GROUP)).toEqual(['b', 'a']);
  });

  it('trims folded values, drops empty ones and removes duplicates', () => {
    const entries = [
      entry(METADATA_GROUP, ' ga-1 '),
      entry(METADATA_GROUP, ''),
      entry(METADATA_GROUP, 'ga-1'),
    ];

    expect(metadataValues(entries, METADATA_GROUP)).toEqual(['ga-1']);
  });

  it('ignores properties published under another name', () => {
    const entries = [entry(METADATA_EVENT_ID, 'event-1'), entry(METADATA_GROUP, 'ga-1')];

    expect(metadataValues(entries, METADATA_GROUP)).toEqual(['ga-1']);
  });

  it('returns nothing when the property is absent', () => {
    expect(metadataValues([], METADATA_GROUP)).toEqual([]);
  });
});

describe('metadataValue', () => {
  it('returns the first published value, skipping empty ones', () => {
    const entries = [entry(METADATA_EVENT_ID, ''), entry(METADATA_EVENT_ID, 'event-1')];

    expect(metadataValue(entries, METADATA_EVENT_ID)).toBe('event-1');
  });

  it('returns null when the property is absent or empty', () => {
    expect(metadataValue([], METADATA_EVENT_ID)).toBeNull();
    expect(metadataValue([entry(METADATA_EVENT_ID, '  ')], METADATA_EVENT_ID)).toBeNull();
  });
});

describe('groupIds', () => {
  it('lists the groups of one event without duplicates', () => {
    const event = eventWith('a', ['ga-1', 'ga-2', 'ga-1']);

    expect(groupIds(event)).toEqual(['ga-1', 'ga-2']);
  });

  it('is empty when the event publishes no group', () => {
    expect(groupIds(eventWith('a', []))).toEqual([]);
  });
});

describe('groupIdsOf', () => {
  it('unions the groups of the feed in first-seen order', () => {
    const events = [eventWith('a', ['ga-2', 'ga-1']), eventWith('b', ['ga-1', 'ga-3'])];

    expect(groupIdsOf(events)).toEqual(['ga-2', 'ga-1', 'ga-3']);
  });

  it('returns nothing for an empty feed', () => {
    expect(groupIdsOf([])).toEqual([]);
  });
});

describe('groupCountsOf', () => {
  it('counts the events each group appears on, once per event', () => {
    const events = [eventWith('a', ['ga-1', 'ga-1', 'ga-2']), eventWith('b', ['ga-1'])];

    expect([...groupCountsOf(events).entries()]).toEqual([
      ['ga-1', 2],
      ['ga-2', 1],
    ]);
  });
});

describe('hasAnyGroup', () => {
  it('matches an event organised by one of the selected groups', () => {
    expect(hasAnyGroup(eventWith('a', ['ga-1']), ['ga-1', 'ga-9'])).toBe(true);
  });

  it('rejects an event organised by none of them', () => {
    expect(hasAnyGroup(eventWith('a', ['ga-1']), ['ga-9'])).toBe(false);
  });

  it('rejects an event without group', () => {
    expect(hasAnyGroup(eventWith('a', []), ['ga-1'])).toBe(false);
  });
});
