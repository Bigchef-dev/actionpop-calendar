<script setup lang="ts">
import { computed } from 'vue';

import type { CalendarEvent, WeatherEntry } from '../../../types';
import WeatherBadge from './WeatherBadge.vue';
import TypeChip from './TypeChip.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  events: CalendarEvent[];
  weatherFor: (event: CalendarEvent) => WeatherEntry | null;
}>();

const emit = defineEmits<{ (event: 'open', target: CalendarEvent): void }>();

const days = computed(() => {
  const grouped = new Map<string, CalendarEvent[]>();
  for (const event of props.events) {
    const key = event.start.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const bucket = grouped.get(key);
    if (bucket === undefined) grouped.set(key, [event]);
    else bucket.push(event);
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
    <li v-for="[day, dayEvents] in days" :key="day">
      <h2 class="mb-2 text-[11px] font-bold uppercase tracking-widest opacity-60">{{ day }}</h2>
      <ul class="space-y-2">
        <li v-for="event in dayEvents" :key="`${event.id}-${event.start.toISOString()}`">
          <button
            type="button"
            class="ap-focusable ap-surface flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left"
            @click="emit('open', event)"
          >
            <span class="w-14 shrink-0 text-xs font-bold tabular-nums opacity-70">
              {{ timeOf(event) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-semibold">{{ event.summary }}</span>
                <StatusBadge :status="event.status" />
              </span>
              <span class="mt-1 flex flex-wrap items-center gap-2">
                <TypeChip :slug="event.eventType" />
                <WeatherBadge :entry="weatherFor(event)" />
              </span>
              <span v-if="event.location !== null" class="mt-1 block truncate text-xs opacity-70">
                📍 {{ event.location }}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </li>
  </ul>
</template>
