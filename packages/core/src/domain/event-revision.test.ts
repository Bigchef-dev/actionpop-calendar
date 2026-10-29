import { describe, expect, it } from 'vitest';

import { hashCalendarContent, nextEventRevision } from './event-revision.js';

describe('event revision', () => {
  const content = {
    sourceEventId: 'event-1',
    summary: 'Meeting',
    startTime: '2026-09-24T10:00:00+02:00',
    endTime: '2026-09-24T11:00:00+02:00',
    locationId: 'location-1',
    sourceUrl: 'https://example.test/event-1',
  };

  it('hashes normalized content and preserves sequence when unchanged', () => {
    const hash = hashCalendarContent(content);
    expect(hashCalendarContent({ ...content })).toBe(hash);
    expect(nextEventRevision(content, { contentHash: hash, sequence: 3 })).toMatchObject({
      contentHash: hash,
      sequence: 3,
    });
  });

  it('increments sequence when normalized content changes', () => {
    const previous = { ...content, contentHash: hashCalendarContent(content), sequence: 3 };
    expect(nextEventRevision({ ...content, summary: 'Updated' }, previous).sequence).toBe(4);
  });

  it('increments sequence when the stated organizers change, and only then', () => {
    const withGroups = { ...content, groupIds: ['group-b', 'group-a'] };
    const previous = { ...withGroups, contentHash: hashCalendarContent(withGroups), sequence: 2 };

    expect(hashCalendarContent({ ...withGroups, groupIds: ['group-a', 'group-b'] })).toBe(
      previous.contentHash,
    );
    expect(nextEventRevision({ ...withGroups }, previous).sequence).toBe(2);
    expect(nextEventRevision({ ...withGroups, groupIds: ['group-a'] }, previous).sequence).toBe(3);
  });

  it('leaves the hash unchanged when no organizer is stated', () => {
    expect(hashCalendarContent({ ...content, groupIds: [] })).toBe(hashCalendarContent(content));
  });

  it('increments sequence when the calendar-visible address changes', () => {
    const withAddress = { ...content, location: '12 rue de la République, 69003 Lyon' };
    const previous = { ...withAddress, contentHash: hashCalendarContent(withAddress), sequence: 1 };

    expect(
      nextEventRevision(
        { ...withAddress, location: '14 rue de la République, 69003 Lyon' },
        previous,
      ).sequence,
    ).toBe(2);
    expect(nextEventRevision({ ...withAddress }, previous).sequence).toBe(1);
  });
});
