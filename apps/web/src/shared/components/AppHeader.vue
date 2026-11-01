<script setup lang="ts">
defineProps<{ onDiscovery?: boolean }>();
const emit = defineEmits<{ (event: 'home'): void }>();
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
        :style="{ backgroundColor: 'var(--ap-primary)', color: 'var(--ap-on-primary)' }"
        aria-hidden="true"
      >
        🐢
      </span>
      <span class="leading-tight">
        <span class="block text-sm font-bold uppercase tracking-widest">Agenda des actions</span>
        <span class="block text-xs opacity-70">Action Populaire</span>
      </span>
    </button>
    <slot name="actions" />
    <span
      v-if="onDiscovery"
      class="hidden text-xs font-semibold uppercase tracking-widest opacity-60 sm:block"
    >
      Campagne 2027
    </span>
  </header>
</template>
