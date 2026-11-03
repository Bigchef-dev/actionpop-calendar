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

const epci: SearchSubject = {
  kind: 'epci',
  id: '200000001',
  label: 'Grand Exemple',
  qualifier: 'Communauté de communes · 01',
  calendar: { path: '/calendar.ics', params: { epci: '200000001' } },
};

describe('buildCalendarLink', () => {
  it('builds an exact link for several selected items and a separate city-only link', () => {
    const city = commune;
    const departmentItem = department;
    const link = buildCalendarLink([city, departmentItem], {
      groups: ['ga-lyon'],
      types: ['tractage'],
    });
    const cityOnly = buildCalendarLink([city, departmentItem], {
      groups: ['ga-lyon'],
      types: ['tractage'],
      scope: 'city-only',
      city,
    });
    expect(link?.subscriptionUrl).toContain('insee_commune=69123');
    expect(link?.subscriptionUrl).toContain('department=69');
    expect(link?.subscriptionUrl).toContain('group=ga-lyon');
    expect(link?.subscriptionUrl).toContain('event_type=tractage');
    expect(link?.subscriptionUrl).not.toContain('period');
    expect(cityOnly?.subscriptionUrl).toContain('insee_commune=69123');
    expect(cityOnly?.subscriptionUrl).not.toContain('department=69');
    expect(cityOnly?.scope).toBe('city-only');
  });
  it('builds every consumable form for a commune, a department and a group', () => {
    for (const subject of [commune, department, group, epci]) {
      const link = buildCalendarLink(subject, { keepFilters: false, types: [], period: PERIOD });
      expect(link).not.toBeNull();
      expect(link?.subscriptionUrl).toContain('/calendar.ics?');
      expect(link?.webcalUrl.startsWith('webcal://')).toBe(true);
      expect(link?.downloadUrl).toBe(link?.subscriptionUrl);
      expect(link?.calendarServiceUrl).toContain(encodeURIComponent(link?.subscriptionUrl ?? ''));
      expect(link?.keepsFilters).toBe(false);
    }
  });

  it('round-trips an EPCI with event and group filters', () => {
    const link = buildCalendarLink(epci, {
      keepFilters: true,
      types: ['tractage'],
      groups: ['group-1'],
    });
    expect(link?.subscriptionUrl).toContain('epci=200000001');
    expect(link?.subscriptionUrl).toContain('event_type=tractage');
    expect(link?.subscriptionUrl).toContain('group=group-1');
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
    expect(link?.description).not.toContain('2026');
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
