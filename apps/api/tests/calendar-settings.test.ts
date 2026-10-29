import { describe, expect, it } from 'vitest';

import { FilteredCalendarService } from '@actionpop/core';

import { buildApp } from '../src/server.js';
import type { CalendarIcsSettings } from '../src/controllers/calendar-ics.controller.js';

const BASE: CalendarIcsSettings = {
  enabled: true,
  lookbackDays: 30,
  lookaheadDays: 90,
  maxEntries: 1000,
  revalidationSeconds: 900,
};

async function appWith(settings: Partial<CalendarIcsSettings>, maxEntries = 1000) {
  const limits: number[] = [];
  const service = new FilteredCalendarService(
    {
      listCalendarEvents: async (_criteria, _window, limit) => {
        limits.push(limit);
        return { events: [], truncated: false };
      },
    },
    {
      lookbackDays: settings.lookbackDays ?? BASE.lookbackDays,
      lookaheadDays: settings.lookaheadDays ?? BASE.lookaheadDays,
      maxEntries,
    },
  );

  const server = await buildApp({
    datasetRepository: {
      getCurrent: async () => ({
        scopeId: 'group-1',
        revision: 1,
        generatedAt: new Date().toISOString(),
        events: [],
      }),
    },
    calendarService: service,
    calendarSettings: { ...BASE, ...settings },
  });

  return { server, limits };
}

describe('calendar settings applied end to end', () => {
  it('passes the configured entry ceiling to the query', async () => {
    const { server, limits } = await appWith({ maxEntries: 25 }, 25);
    try {
      await server.inject({ method: 'GET', url: '/calendar.ics' });
      expect(limits).toEqual([25]);
    } finally {
      await server.close();
    }
  });

  it('drives Cache-Control from the revalidation setting', async () => {
    const { server } = await appWith({ revalidationSeconds: 60 });
    try {
      const response = await server.inject({ method: 'GET', url: '/calendar.ics' });
      expect(response.headers['cache-control']).toBe('public, max-age=60');
    } finally {
      await server.close();
    }
  });

  it('reflects a zero lookback in the query window', async () => {
    const windows: Array<{ start: string; end: string }> = [];
    const service = new FilteredCalendarService(
      {
        listCalendarEvents: async (_criteria, window) => {
          windows.push({
            start: window.startUtc.toISOString(),
            end: window.endUtc.toISOString(),
          });
          return { events: [], truncated: false };
        },
      },
      { lookbackDays: 0, lookaheadDays: 1, maxEntries: 10 },
    );

    const server = await buildApp({
      datasetRepository: {
        getCurrent: async () => ({
          scopeId: 'group-1',
          revision: 1,
          generatedAt: new Date().toISOString(),
          events: [],
        }),
      },
      calendarService: service,
      calendarSettings: { ...BASE, lookbackDays: 0, lookaheadDays: 1 },
    });

    try {
      await server.inject({ method: 'GET', url: '/calendar.ics' });
      const window = windows[0];
      expect(window).toBeDefined();
      if (window === undefined) return;
      const spanMs = Date.parse(window.end) - Date.parse(window.start);
      expect(spanMs).toBe(24 * 60 * 60 * 1000);
    } finally {
      await server.close();
    }
  });
});
