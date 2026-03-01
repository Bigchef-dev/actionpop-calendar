<script setup lang="ts">
import { getWeatherIcon } from '../composables/useWeather'
import type { WeatherEntry } from '../../../types'

defineProps<{ weather: WeatherEntry }>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5 flex-wrap">
    <span class="text-base leading-none" title="Météo prévue à cette heure">
      {{ getWeatherIcon(weather.code) }}
    </span>
    <span
      v-if="weather.precip > 0"
      class="text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full"
    >
      💧 {{ weather.precip }} mm
    </span>
    <span
      v-if="weather.wind > 20"
      class="text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full"
    >
      💨 {{ Math.round(weather.wind) }} km/h
    </span>
    <span
      v-if="weather.precip === 0 && weather.wind <= 20"
      class="text-xs text-stone-400 dark:text-stone-500"
    >
    </span>
  </span>
</template>
