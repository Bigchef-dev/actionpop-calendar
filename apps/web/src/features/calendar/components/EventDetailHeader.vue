<script setup lang="ts">
import { computed } from 'vue';

import type { CalendarEvent } from '../../../types';
import StatusBadge from './StatusBadge.vue';
import TypeChip from './TypeChip.vue';

const props = defineProps<{ event: CalendarEvent }>();

const when = computed(() => {
  const date = props.event.start.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const start = props.event.start.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const end =
    props.event.end === null
      ? ''
      : props.event.end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const capitalized = date.charAt(0).toUpperCase() + date.slice(1);
  if (props.event.allDay) return `${capitalized} · journée`;
  return end === '' ? `${capitalized} · ${start}` : `${capitalized} · ${start} – ${end}`;
});
</script>

<template>
  <header>
    <div class="flex flex-wrap items-center gap-2">
      <TypeChip :slug="event.eventType" size="md" />
      <StatusBadge :status="event.status" />
    </div>
    <h1 id="ap-detail-title" class="mt-3 text-xl font-bold leading-tight sm:text-2xl">
      {{ event.summary }}
    </h1>
    <p class="mt-1 text-sm opacity-80">{{ when }}</p>
  </header>
</template>
