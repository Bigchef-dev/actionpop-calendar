import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../src/types';
import {
  coordinateKeyFor,
  hourKeyFor,
  weatherRequestFor,
} from '../../src/features/calendar/utils/weather-window';

const NOW = new Date('2026-11-01T10:00:00Z');

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    summary: 'Action',
    description: '',
    start: new Date('2026-11-03T18:00:00Z'),
    end: null,
    allDay: false,
    status: 'CONFIRMED',
    eventType: null,
    sourceUrl: null,
    location: null,
    coordinates: { latitude: 45.7578, longitude: 4.832 },
    metadata: [],
    ...overrides,
  };
}

describe('weatherRequestFor', () => {
  it('requests a forecast for an upcoming event with coordinates', () => {
    const request = weatherRequestFor(event(), NOW);
    expect(request).not.toBeNull();
    expect(request?.coordinateKey).toBe(coordinateKeyFor(45.7578, 4.832));
    expect(request?.hourKey).toBe(hourKeyFor(new Date('2026-11-03T18:00:00Z')));
  });

  it('requests nothing without coordinates', () => {
    expect(weatherRequestFor(event({ coordinates: null }), NOW)).toBeNull();
  });

  it('requests nothing for an all-day event', () => {
    expect(weatherRequestFor(event({ allDay: true }), NOW)).toBeNull();
  });

  it('requests nothing beyond the provider horizon', () => {
    expect(weatherRequestFor(event({ start: new Date('2026-12-15T18:00:00Z') }), NOW)).toBeNull();
  });

  it('requests nothing for an already started event', () => {
    expect(weatherRequestFor(event({ start: new Date('2026-10-30T18:00:00Z') }), NOW)).toBeNull();
  });
});

describe('coordinateKeyFor', () => {
  it('rounds coordinates so nearby events share one request', () => {
    expect(coordinateKeyFor(45.75781, 4.83201)).toBe(coordinateKeyFor(45.7578, 4.832));
  });
});
