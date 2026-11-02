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
export function useCalendarFeed(subjects: Ref<readonly SearchSubject[]>): CalendarFeedHandle {
  const events = ref<CalendarEvent[]>([]);
  const dropped = ref(0);
  const status = ref<FeedStatus>('idle');

  let controller: AbortController | null = null;

  function load(): void {
    const current = subjects.value;
    if (current.length === 0) {
      events.value = [];
      status.value = 'idle';
      return;
    }

    controller?.abort();
    controller = new AbortController();
    status.value = 'loading';

    Promise.all(current.map((subject) => fetchCalendarText(subject.calendar.params, controller!.signal)))
      .then((texts) => {
        const parsed = texts.map(parseCalendar);
        const unique = new Map(parsed.flatMap((result) => result.events).map((event) => [event.id, event]));
        events.value = [...unique.values()];
        dropped.value = parsed.reduce((total, result) => total + result.dropped, 0);
        status.value = events.value.length === 0 ? 'empty' : 'ready';
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        events.value = [];
        status.value = 'error';
      });
  }

  watch(subjects, load, { immediate: true });

  return { events, dropped, status, retry: load };
}
