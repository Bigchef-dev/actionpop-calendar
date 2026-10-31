import { describe, expect, it } from 'vitest';

import { hasEnded, shouldRequestDetail, summaryFingerprint } from './map-selection.js';

const summary = {
  id: 'event-1',
  name: 'Meeting',
  coordinates: { type: 'Point' as const, coordinates: [2.35, 48.85] as [number, number] },
  date: 'le 23 octobre 2027 à 16:00 (Europe/Paris)',
  link: 'https://actionpopulaire.fr/evenements/carte/event-1/',
  start_time: '2027-10-23T16:00:00+02:00',
  end_time: '2027-10-23T18:00:00+02:00',
  subtype: 16,
};

const now = new Date('2026-10-31T00:00:00.000Z');

describe('summaryFingerprint', () => {
  it('changes for every machine hint', () => {
    const base = summaryFingerprint(summary);
    expect(summaryFingerprint({ ...summary, name: 'Other' })).not.toBe(base);
    expect(summaryFingerprint({ ...summary, start_time: '2027-10-23T17:00:00+02:00' })).not.toBe(
      base,
    );
    expect(summaryFingerprint({ ...summary, end_time: '2027-10-23T19:00:00+02:00' })).not.toBe(
      base,
    );
    expect(summaryFingerprint({ ...summary, subtype: 7 })).not.toBe(base);
    expect(
      summaryFingerprint({
        ...summary,
        coordinates: { type: 'Point', coordinates: [2.36, 48.86] },
      }),
    ).not.toBe(base);
  });

  it('ignores presentation-only date and link', () => {
    expect(summaryFingerprint({ ...summary, date: '', link: 'https://other.test' })).toBe(
      summaryFingerprint(summary),
    );
  });
});

describe('hasEnded', () => {
  it('treats a missing or invalid end time as not ended', () => {
    expect(hasEnded(undefined, now)).toBe(false);
    expect(hasEnded(null, now)).toBe(false);
    expect(hasEnded('not-a-date', now)).toBe(false);
  });

  it('compares end times inclusively', () => {
    expect(hasEnded(now.toISOString(), now)).toBe(true);
    expect(hasEnded(new Date(now.getTime() - 1), now)).toBe(true);
    expect(hasEnded(new Date(now.getTime() + 1), now)).toBe(false);
  });
});

describe('shouldRequestDetail', () => {
  it('selects an identity that was never requested', () => {
    expect(
      shouldRequestDetail({ lastRequestedAt: null, nextReconcileAt: null, lastOutcome: null }, now),
    ).toBe(true);
  });

  it('selects a new or changed identity when the deadline is null', () => {
    expect(
      shouldRequestDetail(
        { lastRequestedAt: now, nextReconcileAt: null, lastOutcome: 'resolved' },
        now,
      ),
    ).toBe(true);
  });

  it('selects a due reconciliation', () => {
    expect(
      shouldRequestDetail(
        { lastRequestedAt: now, nextReconcileAt: now, lastOutcome: 'resolved' },
        now,
      ),
    ).toBe(true);
    expect(
      shouldRequestDetail(
        {
          lastRequestedAt: now,
          nextReconcileAt: new Date(now.getTime() + 1),
          lastOutcome: 'resolved',
        },
        now,
      ),
    ).toBe(false);
  });

  it('selects a previous failed or mismatched attempt', () => {
    for (const lastOutcome of ['failed', 'mismatched']) {
      expect(
        shouldRequestDetail(
          {
            lastRequestedAt: now,
            nextReconcileAt: new Date(now.getTime() + 1),
            lastOutcome,
          },
          now,
        ),
      ).toBe(true);
    }
  });
});
