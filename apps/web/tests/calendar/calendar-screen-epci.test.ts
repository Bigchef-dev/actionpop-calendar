// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CalendarScreen from '../../src/features/calendar/components/CalendarScreen.vue';
import type { SearchSubject } from '../../src/types';

const EPCI: SearchSubject = {
  kind: 'epci',
  id: '200000001',
  label: 'Métropole du Grand Exemple',
  qualifier: 'Métropole · 01',
  calendar: { path: '/calendar.ics', params: { epci: '200000001' } },
};

const EMPTY_CALENDAR = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';

function mountScreen(subjects: readonly SearchSubject[]) {
  return mount(CalendarScreen, {
    props: { subjects: [...subjects] },
    global: {
      stubs: {
        CalendarView: true,
        EventDetail: true,
        FilterBar: true,
        GroupFilterBar: true,
      },
    },
  });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(EMPTY_CALENDAR, { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CalendarScreen with an EPCI territory', () => {
  it('names the territory it is displaying', async () => {
    const wrapper = mountScreen([EPCI]);
    await flushPromises();

    expect(wrapper.text()).toContain('Calendrier de');
    expect(wrapper.text()).toContain('Métropole du Grand Exemple');
    wrapper.unmount();
  });

  it('offers a subscription even when the territory has no event yet', async () => {
    const wrapper = mountScreen([EPCI]);
    await flushPromises();

    expect(wrapper.text()).toContain('Aucune action prévue pour le moment');
    // The subscription panel still produces a usable territory link.
    expect(wrapper.find('#ap-subscription').exists()).toBe(true);
    expect(wrapper.text()).toContain('epci=200000001');
    wrapper.unmount();
  });

  it('requests the feed of the territory only', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(EMPTY_CALENDAR, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = mountScreen([EPCI]);
    await flushPromises();

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('calendar.ics') && url.includes('epci=200000001'))).toBe(
      true,
    );
    wrapper.unmount();
  });

  it('explains an unavailable territory without showing unrelated events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'calendar scope unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })),
    );

    const wrapper = mountScreen([EPCI]);
    await flushPromises();

    expect(wrapper.text()).toContain('Territoire indisponible');
    expect(wrapper.text()).toContain('Réessayer');
    expect(wrapper.text()).not.toContain('Aucune action prévue');
    wrapper.unmount();
  });
});
