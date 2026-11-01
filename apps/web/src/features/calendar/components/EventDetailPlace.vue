<script setup lang="ts">
import { computed } from 'vue';

import type { WeatherEntry } from '../../../types';
import { mapsUrl } from '../utils/event-links';
import WeatherBadge from './WeatherBadge.vue';

const props = defineProps<{
  location: string | null;
  weather: WeatherEntry | null;
}>();

const map = computed(() => (props.location === null ? null : mapsUrl(props.location)));
</script>

<template>
  <section v-if="location !== null" class="mt-4">
    <h2 class="text-[11px] font-bold uppercase tracking-widest opacity-60">Lieu</h2>
    <div
      class="mt-1.5 flex items-start gap-2.5 rounded-xl px-3 py-2.5"
      :style="{ backgroundColor: 'var(--ap-surface-muted)' }"
    >
      <span class="shrink-0" aria-hidden="true">📍</span>
      <p class="min-w-0 flex-1 break-words text-sm">{{ location }}</p>
      <WeatherBadge :entry="weather" />
    </div>
    <a
      v-if="map !== null"
      class="ap-focusable ap-primary-text mt-2 inline-flex items-center gap-1 text-xs font-semibold underline"
      :href="map"
      target="_blank"
      rel="noopener noreferrer"
    >
      Voir sur la carte <span aria-hidden="true">↗</span>
    </a>
  </section>
</template>
