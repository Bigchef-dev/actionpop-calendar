import { ref, watch, type Ref } from 'vue';

import { fetchCalendarText } from '../../../shared/api/client';
import type { CalendarEvent, SearchSubject } from '../../../types';
import { parseCalendar } from '../utils/ical-mapping';

export type FeedStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface CalendarFeedHandle {
  readonly events: Ref<CalendarEvent[]>;
  readonly dropped: Ref<number>;
  readonly status: Ref<FeedStatus>;
  readonly retry: () => void;
}

/** Reads the published calendar of one subject, once per subject change. */
export function useCalendarFeed(subject: Ref<SearchSubject | null>): CalendarFeedHandle {
  const events = ref<CalendarEvent[]>([]);
  const dropped = ref(0);
  const status = ref<FeedStatus>('idle');

  let controller: AbortController | null = null;

  function load(): void {
    const current = subject.value;
    if (current === null) {
      events.value = [];
      status.value = 'idle';
      return;
    }

    controller?.abort();
    controller = new AbortController();
    status.value = 'loading';

    fetchCalendarText(current.calendar.params, controller.signal)
      .then((text) => {
        const parsed = parseCalendar(text);
        events.value = parsed.events;
        dropped.value = parsed.dropped;
        status.value = parsed.events.length === 0 ? 'empty' : 'ready';
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        events.value = [];
        status.value = 'error';
      });
  }

  watch(subject, load, { immediate: true });

  return { events, dropped, status, retry: load };
}
