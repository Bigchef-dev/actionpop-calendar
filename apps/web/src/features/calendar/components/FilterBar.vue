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

interface TypeRow {
  slug: string;
  count: number;
  label: string;
  emoji: string;
}

/** The catalogue is read once per type, so the template never repeats the lookup. */
const rows = computed<TypeRow[]>(() =>
  props.available.map((type) => {
    const { label, emoji } = actionTypeFor(type.slug);
    return { slug: type.slug, count: type.count, label, emoji };
  }),
);

const hasSelection = computed(() => props.selected.length > 0);

/** An empty selection shows every type, so every pill reads as active. */
function isActive(slug: string): boolean {
  return props.selected.length === 0 || props.selected.includes(slug);
}
</script>

<template>
  <section aria-label="Filtrer par type d'action">
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="ap-eyebrow">Type d'action</h2>
      <p class="text-xs opacity-70" role="status">
        {{ shown }} sur {{ total }} action{{ total > 1 ? 's' : '' }}
      </p>
    </div>

    <div class="mt-1.5 flex flex-wrap gap-1.5">
      <button
        v-for="row in rows"
        :key="row.slug"
        type="button"
        class="ap-pill ap-focusable font-semibold"
        :aria-pressed="isActive(row.slug)"
        @click="emit('toggle', row.slug)"
      >
        <span aria-hidden="true">{{ row.emoji }}</span>
        {{ row.label }}
        <span class="opacity-70">({{ row.count }})</span>
      </button>
    </div>

    <button
      v-if="hasSelection"
      type="button"
      class="ap-focusable mt-2 text-[11px] font-semibold underline opacity-80"
      @click="emit('clear')"
    >
      Tout afficher
    </button>
  </section>
</template>
