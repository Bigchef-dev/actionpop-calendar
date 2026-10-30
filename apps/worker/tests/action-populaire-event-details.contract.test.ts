import { describe, expect, it } from 'vitest';

import { EventIdentityMismatchError, UnknownEventError } from '@actionpop/core';

import { ActionPopulaireClient } from '../src/adapters/action-populaire-client.js';

const details = {
  id: 'event-1',
  url: 'https://actionpopulaire.fr/evenements/event-1/',
  name: 'Porte-à-porte',
  description: '',
  startTime: '2026-10-30T10:00:00+01:00',
  endTime: '2026-10-30T12:00:00+01:00',
  timezone: 'Europe/Paris',
  location: {
    name: 'Hubertine Auclert',
    address: '9 rue Jean Pont\n35136 Saint-Jacques de la Lande',
    zip: '35136',
    city: 'Saint-Jacques de la Lande',
    country: 'FR',
    coordinates: { type: 'Point', coordinates: [-1.69852, 48.091023] },
    staticMapUrl: 'https://media.actionpopulaire.fr/carte/staticmapimage/x',
  },
  groups: [{ id: 'group-1', name: 'LFI', isMember: false, eventCount: 1 }],
  illustration: { thumbnail: 'https://example.test/t.png' },
  routes: { details: 'https://example.test/details' },
  rsvp: null,
  calendars: [],
  isPast: false,
};

function client(payload: unknown, status = 200) {
  return new ActionPopulaireClient({
    baseUrl: 'https://example.test',
    fetcher: async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  });
}

describe('event detail resources', () => {
  it('parses a detail document with the listing schema and ignores presentation fields', async () => {
    const parsed = await client(details).fetchEventDetails('event-1');

    expect(parsed.id).toBe('event-1');
    expect(parsed.groups).toEqual([{ id: 'group-1', name: 'LFI' }]);
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'description',
        'endTime',
        'groups',
        'id',
        'location',
        'name',
        'startTime',
        'subtype',
        'timezone',
      ]
        .filter((key) => key in parsed)
        .sort(),
    );
    expect(parsed).not.toHaveProperty('illustration');
    expect(parsed).not.toHaveProperty('routes');
  });

  it('maps a 404 to an unknown event', async () => {
    await expect(client({}, 404).fetchEventDetails('event-1')).rejects.toBeInstanceOf(
      UnknownEventError,
    );
  });

  it('rejects a document describing another event', async () => {
    await expect(
      client({ ...details, id: 'event-2' }).fetchEventDetails('event-1'),
    ).rejects.toBeInstanceOf(EventIdentityMismatchError);
  });
});
