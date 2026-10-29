import { describe, expect, it } from 'vitest';

import { HttpError } from '@actionpop/core';

import { ActionPopulaireClient } from './action-populaire-client.js';

describe('Action Populaire client', () => {
  it('requests the upcoming group events endpoint with bounded pagination', async () => {
    let requestedUrl = '';
    const client = new ActionPopulaireClient({
      baseUrl: 'https://upstream.test',
      fetcher: async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify([{
          id: 'event-1', name: 'Meeting', startTime: '2026-10-01T10:00:00+02:00',
          endTime: '2026-10-01T11:00:00+02:00', timezone: 'Europe/Paris', location: { city: 'Paris' },
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });

    await client.fetchEventPage('group-1', 1, 5000);

    expect(requestedUrl).toBe('https://upstream.test/api/groupes/group-1/evenements/a-venir/?page=1&page_size=1000');
  });

  it('waits for the delay the server asks for and retries a throttled request in place', async () => {
    const waits: number[] = [];
    let calls = 0;
    const client = new ActionPopulaireClient({
      baseUrl: 'https://upstream.test',
      sleep: async (ms) => {
        waits.push(ms);
      },
      fetcher: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response('', { status: 429, headers: { 'retry-after': '7' } });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await expect(client.fetchEventPage('group-1', 1, 100)).resolves.toEqual([]);
    expect(calls).toBe(2);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(7_000);
    expect(waits[0]).toBeLessThan(7_300);
  });

  it('raises the throttle as an HttpError carrying its delay once the budget is spent', async () => {
    const waits: number[] = [];
    let calls = 0;
    const client = new ActionPopulaireClient({
      baseUrl: 'https://upstream.test',
      maxRateLimitRetries: 1,
      sleep: async (ms) => {
        waits.push(ms);
      },
      fetcher: async () => {
        calls += 1;
        return new Response('', { status: 429, headers: { 'retry-after': '1' } });
      },
    });

    const error = await client.fetchEventPage('group-1', 1, 100).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(429);
    expect((error as HttpError).retryAfterMs).toBe(1000);
    expect(calls).toBe(2);
    expect(waits).toHaveLength(1);
  });

  it('does not retry a client error', async () => {
    let calls = 0;
    const client = new ActionPopulaireClient({
      baseUrl: 'https://upstream.test',
      fetcher: async () => {
        calls += 1;
        return new Response('', { status: 403 });
      },
    });

    await expect(client.fetchEventPage('group-1', 1, 100)).rejects.toThrow(/403/);
    expect(calls).toBe(1);
  });
});
