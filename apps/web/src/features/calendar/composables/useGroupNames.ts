import { ref, watch, type Ref } from 'vue';

import { searchSubjects } from '../../../shared/api/client';
import type { CalendarEvent } from '../../../types';

export const GROUP_METADATA = 'X-ACTIONPOP-GROUP';

/** Identifiers of the action groups published with the events, in first-seen order. */
export function groupIdsOf(events: readonly CalendarEvent[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    for (const entry of event.metadata) {
      if (entry.name !== GROUP_METADATA) continue;
      const id = entry.value.trim();
      if (id !== '' && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export interface GroupNamesHandle {
  readonly names: Ref<Record<string, string>>;
}

/**
 * The feed publishes group identifiers only, so their readable names are resolved through the
 * search read and cached. A group that cannot be resolved keeps no name rather than blocking.
 */
export function useGroupNames(events: Ref<CalendarEvent[]>): GroupNamesHandle {
  const names = ref<Record<string, string>>({});
  const requested = new Set<string>();

  watch(
    events,
    (list) => {
      for (const id of groupIdsOf(list)) {
        if (names.value[id] !== undefined || requested.has(id)) continue;
        requested.add(id);
        searchSubjects(id, { kind: ['group'], limit: 30 })
          .then((answer) => {
            const found = answer.subjects.find(
              (subject) => subject.kind === 'group' && subject.id === id,
            );
            if (found !== undefined) names.value = { ...names.value, [id]: found.label };
          })
          .catch(() => undefined);
      }
    },
    { immediate: true },
  );

  return { names };
}
