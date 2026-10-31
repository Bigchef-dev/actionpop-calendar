import { describe, expect, it } from 'vitest';

import { HttpError, PayloadValidationError } from '@actionpop/core';

import { ActionPopulaireClient } from '../src/adapters/action-populaire-client.js';

const entry = {
  id: 'event-1',
  name: 'Meeting',
  coordinates: { type: 'Point', coordinates: [2.35, 48.85] },
  date: 'le 23 octobre 2027 à 16:00 (Europe/Paris)',
  link: 'https://actionpopulaire.fr/evenements/carte/event-1/',
  start_time: '2027-10-23T16:00:00+02:00',
  end_time: '2027-10-23T18:00:00+02:00',
  subtype: 16,
};

describe('map listing contract', () => {
  it('requests the complete listing without pagination parameters', async () => {
    let requestedUrl = '';
    const client = new ActionPopulaireClient({
      baseUrl: 'https://upstream.test',
      fetcher: async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify([entry]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const result = await client.fetchMapEventListing();

    expect(requestedUrl).toBe('https://upstream.test/carte/liste_evenements/');
    expect(result.summaries).toEqual([entry]);
  });

  it('accepts an empty array as a complete listing', async () => {
    const client = new ActionPopulaireClient({
      baseUrl: 'https://upstream.test',
      fetcher: async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });

    await expect(client.fetchMapEventListing()).resolves.toMatchObject({ summaries: [] });
  });

  it('rejects a non-array body', async () => {
    const client = new ActionPopulaireClient({
      baseUrl: 'https://upstream.test',
      fetcher: async () =>
        new Response(JSON.stringify({ events: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });

    await expect(client.fetchMapEventListing()).rejects.toBeInstanceOf(PayloadValidationError);
  });

  it('retries a throttle in place', async () => {
    let calls = 0;
    const client = new ActionPopulaireClient({
      baseUrl: 'https://upstream.test',
      sleep: async () => undefined,
      fetcher: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response('', { status: 429, headers: { 'retry-after': '1' } });
        }
        return new Response(JSON.stringify([entry]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const result = await client.fetchMapEventListing();
    expect(result.summaries).toHaveLength(1);
    expect(calls).toBe(2);
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

    await expect(client.fetchMapEventListing()).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(1);
  });
});
