<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import type { GroupColor } from '../utils/group-colors';

export interface AvailableGroup {
  id: string;
  label: string;
  count: number;
  color: GroupColor;
}

defineProps<{
  available: AvailableGroup[];
  selected: readonly string[];
}>();

const emit = defineEmits<{
  (event: 'select', groups: readonly string[]): void;
}>();

const scrollRail = ref<HTMLElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

function updateScrollHint(): void {
  const rail = scrollRail.value;
  canScrollLeft.value = rail !== null && rail.scrollLeft > 2;
  canScrollRight.value = rail !== null && rail.scrollWidth - rail.clientWidth - rail.scrollLeft > 2;
}

function scrollGroups(direction: 'left' | 'right'): void {
  scrollRail.value?.scrollBy({ left: direction === 'right' ? 220 : -220, behavior: 'smooth' });
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
      <h2 class="shrink-0 text-[11px] font-bold uppercase tracking-widest opacity-60">Par GA</h2>
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
            class="ap-focusable shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
            :aria-pressed="selected.length === 0"
            :style="
              selected.length === 0
                ? {
                    backgroundColor: 'var(--ap-ink)',
                    color: 'var(--ap-surface)',
                  }
                : { backgroundColor: 'var(--ap-surface-muted)', color: 'var(--ap-ink)' }
            "
            @click="emit('select', [])"
          >
            Tous
          </button>
          <button
            v-for="group in available"
            :key="group.id"
            type="button"
            class="ap-focusable max-w-[13rem] shrink-0 truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold"
            :aria-pressed="selected.includes(group.id)"
            :style="
              selected.includes(group.id)
                ? {
                    backgroundColor: group.color.color,
                    borderColor: group.color.color,
                    color: group.color.foreground,
                  }
                : {
                    backgroundColor: group.color.tint,
                    borderColor: group.color.color,
                    color: 'var(--ap-ink)',
                  }
            "
            @click="
              emit(
                'select',
                selected.includes(group.id)
                  ? selected.filter((id) => id !== group.id)
                  : [...selected, group.id],
              )
            "
          >
            <span aria-hidden="true" :style="{ color: group.color.color }">{{
              group.color.marker
            }}</span>
            {{ group.label }}
            (<span class="opacity-60">{{ group.count }}</span
            >)
          </button>
        </div>
        <button
          v-if="canScrollLeft"
          type="button"
          class="ap-focusable pointer-events-auto absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border text-sm font-bold"
          aria-label="Faire défiler les groupes d'action vers la gauche"
          :style="{
            backgroundColor: 'var(--ap-surface)',
            borderColor: 'var(--ap-border)',
            color: 'var(--ap-ink)',
            boxShadow: '8px 0 10px var(--ap-surface)',
          }"
          @click="scrollGroups('left')"
        >
          ←
        </button>
        <button
          v-if="canScrollRight"
          type="button"
          class="ap-focusable pointer-events-auto absolute right-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border text-sm font-bold"
          aria-label="Faire défiler les groupes d'action vers la droite"
          :style="{
            backgroundColor: 'var(--ap-surface)',
            borderColor: 'var(--ap-border)',
            color: 'var(--ap-ink)',
            boxShadow: '-8px 0 10px var(--ap-surface)',
          }"
          @click="scrollGroups('right')"
        >
          →
        </button>
      </div>
    </div>
  </section>
</template>
