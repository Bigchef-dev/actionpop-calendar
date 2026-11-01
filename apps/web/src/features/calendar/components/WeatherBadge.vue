<script setup lang="ts">
import { computed } from 'vue';

import type { WeatherEntry } from '../../../types';
import { weatherIcon } from '../composables/useWeather';

const props = defineProps<{ entry: WeatherEntry | null }>();

const label = computed(() => {
  if (props.entry === null) return '';
  const parts = [`Météo ${weatherIcon(props.entry.code)}`];
  if (props.entry.precip > 0) parts.push(`${props.entry.precip} mm`);
  if (props.entry.wind > 20) parts.push(`${Math.round(props.entry.wind)} km/h`);
  return parts.join(' · ');
});
</script>

<template>
  <span v-if="entry !== null" class="text-xs" :title="label">
    <span aria-hidden="true">{{ weatherIcon(entry.code) }}</span>
    <span class="sr-only">{{ label }}</span>
    <span v-if="entry.precip > 0" class="ml-1 opacity-70">{{ entry.precip }} mm</span>
  </span>
</template>
