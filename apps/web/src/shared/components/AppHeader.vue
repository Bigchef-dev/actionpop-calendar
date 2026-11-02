<script setup lang="ts">
import { useDarkMode } from '../composables/useDarkMode';

defineProps<{ onDiscovery?: boolean }>();
const emit = defineEmits<{ (event: 'home'): void }>();
const { isDark, toggle } = useDarkMode();
</script>

<template>
  <header class="flex items-center justify-between gap-3 py-4">
    <button
      type="button"
      class="ap-focusable flex items-center gap-3 rounded-lg text-left"
      @click="emit('home')"
    >
      <span
        class="grid h-10 w-10 place-items-center rounded-full text-lg"
        aria-hidden="true"
      >
              <img src="/tortue-hourra.png" alt="Tortue de la campagne">

      </span>
      <span class="leading-tight">
        <span class="block text-sm font-bold uppercase tracking-widest">Agenda des actions</span>
        <span class="block text-xs opacity-70">Action Populaire</span>
      </span>
    </button>
    <button
      type="button"
      class="ap-focusable rounded-lg border px-3 py-2 text-sm font-semibold"
      :style="{ borderColor: 'var(--ap-border)' }"
      :aria-label="isDark ? 'Activer le mode clair' : 'Activer le mode nuit'"
      :aria-pressed="isDark"
      @click="toggle"
    >
      <span aria-hidden="true">{{ isDark ? '☀️' : '🌙' }}</span>
      <span class="sr-only">{{ isDark ? 'Mode clair' : 'Mode nuit' }}</span>
    </button>
  </header>
</template>
