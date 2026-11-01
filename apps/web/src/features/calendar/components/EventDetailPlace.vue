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
    <div class="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <span>{{ location }}</span>
      <WeatherBadge :entry="weather" />
      <a
        v-if="map !== null"
        class="ap-focusable ap-primary-text font-semibold underline"
        :href="map"
        target="_blank"
        rel="noopener noreferrer"
      >
        Voir sur la carte
      </a>
    </div>
  </section>
</template>
