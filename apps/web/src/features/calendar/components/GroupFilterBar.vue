<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import type { GroupColor } from '../utils/group-colors';

export interface AvailableGroup {
  id: string;
  label: string;
  count: number;
  color: GroupColor;
}

const props = defineProps<{
  available: AvailableGroup[];
  selected: readonly string[];
}>();

const emit = defineEmits<{
  (event: 'select', groups: readonly string[]): void;
}>();

/** Each arrow knows how far it moves the rail, what it announces and how it fades the edge. */
const DIRECTIONS = [
  {
    id: 'left',
    label: "Faire défiler les groupes d'action vers la gauche",
    glyph: '←',
    step: -220,
    modifier: 'ap-scroll-arrow--start',
  },
  {
    id: 'right',
    label: "Faire défiler les groupes d'action vers la droite",
    glyph: '→',
    step: 220,
    modifier: 'ap-scroll-arrow--end',
  },
] as const;

const SCROLL_HINT_TOLERANCE = 2;

const scrollRail = ref<HTMLElement | null>(null);
const canScroll = ref<Record<'left' | 'right', boolean>>({ left: false, right: false });

function updateScrollHint(): void {
  const rail = scrollRail.value;
  if (rail === null) {
    canScroll.value = { left: false, right: false };
    return;
  }
  const hiddenRight = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
  canScroll.value = {
    left: rail.scrollLeft > SCROLL_HINT_TOLERANCE,
    right: hiddenRight > SCROLL_HINT_TOLERANCE,
  };
}

function scrollGroups(step: number): void {
  scrollRail.value?.scrollBy({ left: step, behavior: 'smooth' });
}

/** Selecting a group toggles it: the rail never discards the other selected groups. */
function toggleGroup(groupId: string): void {
  emit(
    'select',
    props.selected.includes(groupId)
      ? props.selected.filter((id) => id !== groupId)
      : [...props.selected, groupId],
  );
}

/** The group color reaches the pill as custom properties, so the stylesheet owns both states. */
function colorVariables(group: AvailableGroup): Record<string, string> {
  return { '--ap-pill-color': group.color.color, '--ap-pill-ink': group.color.foreground };
}

onMounted(() => {
  updateScrollHint();
  window.addEventListener('resize', updateScrollHint);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateScrollHint);
});
</script>

<template>
  <section aria-label="Filtrer par groupe d'action">
    <div class="flex items-center gap-2">
      <h2 class="ap-eyebrow shrink-0">Par GA</h2>
      <div class="relative min-w-0 flex-1">
        <div
          ref="scrollRail"
          class="ap-scroll-x flex min-w-0 flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain py-0.5 pl-7 pr-7"
          role="group"
          aria-label="Groupes d'action"
          @scroll="updateScrollHint"
        >
          <button
            type="button"
            class="ap-pill ap-pill--ink ap-focusable shrink-0 font-bold"
            :aria-pressed="selected.length === 0"
            @click="emit('select', [])"
          >
            Tous
          </button>
          <button
            v-for="group in available"
            :key="group.id"
            type="button"
            class="ap-pill ap-pill--group ap-focusable max-w-[13rem] shrink-0 truncate font-semibold"
            :style="colorVariables(group)"
            :aria-pressed="selected.includes(group.id)"
            @click="toggleGroup(group.id)"
          >
            <span class="ap-group-marker" aria-hidden="true">{{ group.color.marker }}</span>
            {{ group.label }}
            <span class="opacity-60">({{ group.count }})</span>
          </button>
        </div>
        <button
          v-for="direction in DIRECTIONS"
          v-show="canScroll[direction.id]"
          :key="direction.id"
          type="button"
          class="ap-scroll-arrow ap-focusable"
          :class="direction.modifier"
          :aria-label="direction.label"
          @click="scrollGroups(direction.step)"
        >
          {{ direction.glyph }}
        </button>
      </div>
    </div>
  </section>
</template>
