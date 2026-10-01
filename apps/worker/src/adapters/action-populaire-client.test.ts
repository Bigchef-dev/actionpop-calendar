import { describe, expect, it } from 'vitest';

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
});