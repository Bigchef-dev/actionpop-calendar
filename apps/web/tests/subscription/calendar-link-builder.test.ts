import { describe, expect, it } from 'vitest';

import type { SearchSubject } from '../../src/types';
import { buildCalendarLink } from '../../src/features/subscription/utils/calendar-link-builder';

const PERIOD = { from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-12-31T00:00:00Z') };

const commune: SearchSubject = {
  kind: 'commune',
  id: '69123',
  label: 'Lyon',
  qualifier: 'Rhône',
  calendar: { path: '/calendar.ics', params: { insee_commune: '69123' } },
};

const department: SearchSubject = {
  kind: 'department',
  id: '69',
  label: 'Rhône',
  calendar: { path: '/calendar.ics', params: { department: '69' } },
};

const group: SearchSubject = {
  kind: 'group',
  id: 'npa-lyon',
  label: 'GA Strabourg Sud',
  calendar: { path: '/calendar.ics', params: { group: 'npa-lyon' } },
};

describe('buildCalendarLink', () => {
  it('builds every consumable form for a commune, a department and a group', () => {
    for (const subject of [commune, department, group]) {
      const link = buildCalendarLink(subject, { keepFilters: false, types: [], period: PERIOD });
      expect(link).not.toBeNull();
      expect(link?.subscriptionUrl).toContain('/calendar.ics?');
      expect(link?.webcalUrl.startsWith('webcal://')).toBe(true);
      expect(link?.downloadUrl).toBe(link?.subscriptionUrl);
      expect(link?.calendarServiceUrl).toContain(encodeURIComponent(link?.subscriptionUrl ?? ''));
      expect(link?.keepsFilters).toBe(false);
    }
  });

  it('carries the subject parameter verbatim', () => {
    expect(
      buildCalendarLink(group, { keepFilters: false, types: [], period: null })?.subscriptionUrl,
    ).toContain('group=npa-lyon');
    expect(
      buildCalendarLink(commune, { keepFilters: false, types: [], period: null })?.subscriptionUrl,
    ).toContain('insee_commune=69123');
  });

  it('adds the displayed types only when the visitor keeps them', () => {
    const kept = buildCalendarLink(commune, {
      keepFilters: true,
      types: ['tractage', 'collage'],
      period: PERIOD,
    });
    expect(kept?.subscriptionUrl).toContain('event_type=');
    expect(decodeURIComponent(kept?.subscriptionUrl ?? '')).toContain(
      'event_type=collage,tractage',
    );
    expect(kept?.keepsFilters).toBe(true);

    const dropped = buildCalendarLink(commune, {
      keepFilters: false,
      types: ['tractage'],
      period: PERIOD,
    });
    expect(dropped?.subscriptionUrl).not.toContain('event_type');
  });

  it('describes what the link covers', () => {
    const link = buildCalendarLink(department, {
      keepFilters: true,
      types: ['tractage'],
      period: PERIOD,
    });
    expect(link?.description).toContain('Rhône');
    expect(link?.description).toContain('tractage');
    expect(link?.description).toContain('2026');
  });

  it('offers nothing when the subject carries no filter parameter', () => {
    const empty: SearchSubject = {
      kind: 'all',
      id: 'all',
      label: 'Tout',
      calendar: { path: '/calendar.ics', params: {} },
    };
    expect(buildCalendarLink(empty, { keepFilters: false, types: [], period: null })).toBeNull();
  });
});
