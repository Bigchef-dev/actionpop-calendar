<script setup lang="ts">
import type { SearchSubject } from '../../../types';
import { suggestionContext, type SuggestionGroup } from '../utils/suggestion-shape';

defineProps<{
  groups: SuggestionGroup[];
  activeIndex: number;
  listId: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  (event: 'pick', subject: SearchSubject): void;
  (event: 'hover', index: number): void;
}>();

function indexOf(groups: readonly SuggestionGroup[], kind: string, id: string): number {
  let index = 0;
  for (const group of groups) {
    for (const subject of group.subjects) {
      if (subject.kind === kind && subject.id === id) return index;
      index += 1;
    }
  }
  return -1;
}
</script>

<template>
  <div
    :id="listId"
    role="listbox"
    class="ap-surface absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-auto rounded-2xl shadow-lg"
    :style="{ boxShadow: '0 18px 40px var(--ap-shadow)' }"
  >
    <div v-for="group in groups" :key="group.kind">
      <p
        class="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-widest opacity-60"
        aria-hidden="true"
      >
        {{ group.label }}
      </p>
      <ul>
        <li
          v-for="subject in group.subjects"
          :key="`${subject.kind}:${subject.id}`"
          role="option"
          :id="`${listId}-${subject.kind}-${subject.id}`"
          :aria-selected="indexOf(groups, subject.kind, subject.id) === activeIndex"
          class="cursor-pointer px-4 py-3"
          :style="
            indexOf(groups, subject.kind, subject.id) === activeIndex
              ? { backgroundColor: 'var(--ap-surface-muted)' }
              : {}
          "
          @mousedown.prevent="emit('pick', subject)"
          @mouseenter="emit('hover', indexOf(groups, subject.kind, subject.id))"
        >
          <span class="block text-sm font-semibold">{{ subject.label }}</span>
          <span class="block text-xs opacity-70">{{ suggestionContext(subject) }}</span>
        </li>
      </ul>
    </div>
    <p v-if="groups.length === 0" class="px-4 py-4 text-sm opacity-70">
      {{ busy ? 'Recherche…' : 'Aucun sujet ne correspond.' }}
    </p>
  </div>
</template>
