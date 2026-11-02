<script setup lang="ts">
import { computed } from 'vue';

import type { ActionType, CalendarEvent, WeatherEntry } from '../../../types';
import { actionTypeFor } from '../data/event-types';
import StatusBadge from './StatusBadge.vue';
import WeatherBadge from './WeatherBadge.vue';

const props = defineProps<{
  events: CalendarEvent[];
  weatherFor: (event: CalendarEvent) => WeatherEntry | null;
}>();

const emit = defineEmits<{ (event: 'open', target: CalendarEvent): void }>();

/** One rendered line: the event, its stable key, its time and its action type, resolved once. */
interface EventRow {
  event: CalendarEvent;
  key: string;
  time: string;
  type: ActionType;
}

const days = computed(() => {
  const grouped = new Map<string, EventRow[]>();
  for (const event of props.events) {
    const day = event.start.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const row: EventRow = {
      event,
      key: `${event.id}-${event.start.toISOString()}`,
      time: timeOf(event),
      type: actionTypeFor(event.eventType),
    };
    const bucket = grouped.get(day);
    if (bucket === undefined) grouped.set(day, [row]);
    else bucket.push(row);
  }
  return [...grouped.entries()];
});

function timeOf(event: CalendarEvent): string {
  if (event.allDay) return 'Journée';
  return event.start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <ul class="space-y-5">
    <li v-for="[day, rows] in days" :key="day">
      <h2 class="ap-eyebrow mb-2">{{ day }}</h2>
      <ul class="space-y-2">
        <li v-for="row in rows" :key="row.key">
          <button
            type="button"
            class="ap-focusable ap-surface flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left"
            @click="emit('open', row.event)"
          >
            <span class="w-14 shrink-0 text-xs font-bold tabular-nums opacity-70">
              {{ row.time }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-start gap-2">
                <span :title="row.type.label" role="img" :aria-label="row.type.label">
                  {{ row.type.emoji }}
                </span>
                <span class="min-w-0 flex-1 text-sm font-semibold leading-snug">
                  {{ row.event.summary }}
                </span>
                <StatusBadge :status="row.event.status" />
              </span>
              <span
                v-if="row.event.location !== null"
                class="mt-1 block truncate text-xs opacity-70"
              >
                📍 {{ row.event.location }}
              </span>
              <span class="mt-1.5 flex flex-wrap items-center gap-2">
                <WeatherBadge :entry="weatherFor(row.event)" />
              </span>
            </span>
          </button>
        </li>
      </ul>
    </li>
  </ul>
</template>
