<script setup lang="ts">
import { computed } from 'vue';

import { actionTypeFor } from '../data/event-types';
import type { AvailableType } from '../utils/type-filter';

const props = defineProps<{
  available: AvailableType[];
  selected: readonly string[];
  shown: number;
  total: number;
}>();

const emit = defineEmits<{
  (event: 'toggle', slug: string): void;
  (event: 'clear'): void;
}>();

function typeOf(slug: string): ReturnType<typeof actionTypeFor> {
  return actionTypeFor(slug);
}

const isActive = (slug: string): boolean => props.selected.includes(slug);
const hasSelection = computed(() => props.selected.length > 0);
</script>

<template>
  <section aria-label="Filtrer par type d'action" class="mb-4">
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="text-[11px] font-bold uppercase tracking-widest opacity-60">Type d'action</h2>
      <p class="text-xs opacity-70" role="status">
        {{ shown }} sur {{ total }} action{{ total > 1 ? 's' : '' }}
      </p>
    </div>

    <div class="mt-2 flex flex-wrap gap-2">
      <button
        v-for="type in available"
        :key="type.slug"
        type="button"
        class="ap-focusable rounded-full border px-3 py-2 text-xs font-semibold"
        :aria-pressed="isActive(type.slug)"
        :style="
          isActive(type.slug)
            ? {
                backgroundColor: 'var(--ap-primary)',
                borderColor: 'var(--ap-primary)',
                color: 'var(--ap-on-primary)',
              }
            : { borderColor: 'var(--ap-border)', color: 'var(--ap-ink)' }
        "
        @click="emit('toggle', type.slug)"
      >
        <span aria-hidden="true">{{ typeOf(type.slug).emoji }}</span>
        {{ typeOf(type.slug).label }}
        <span class="opacity-70">({{ type.count }})</span>
      </button>
    </div>

    <button
      v-if="hasSelection"
      type="button"
      class="ap-focusable mt-3 text-xs font-semibold underline opacity-80"
      @click="emit('clear')"
    >
      Tout afficher
    </button>
  </section>
</template>
