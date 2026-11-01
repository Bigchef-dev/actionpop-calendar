<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';

import { REVIEW_PROPOSALS } from '../../../config';
import type { CalendarEvent, WeatherEntry } from '../../../types';
import EventDetailActions from './EventDetailActions.vue';
import EventDetailHeader from './EventDetailHeader.vue';
import EventDetailPlace from './EventDetailPlace.vue';
import MetadataSection from './MetadataSection.vue';
import DetailVariantA from './proposals/DetailVariantA.vue';
import DetailVariantB from './proposals/DetailVariantB.vue';

const props = defineProps<{
  event: CalendarEvent | null;
  weather: WeatherEntry | null;
}>();

const emit = defineEmits<{ (event: 'close'): void }>();

// Escape closes the detail, so the overlay never traps a keyboard-only visitor.
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

watch(
  () => props.event,
  (event) => {
    if (typeof window === 'undefined') return;
    if (event === null) window.removeEventListener('keydown', onKeydown);
    else window.addEventListener('keydown', onKeydown);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown);
});

const variant = computed(() => {
  if (!REVIEW_PROPOSALS || typeof window === 'undefined') return DetailVariantA;
  const flag = new URLSearchParams(window.location.search).get('propositionDetail');
  return flag === 'b' ? DetailVariantB : DetailVariantA;
});
</script>

<template>
  <div
    v-if="event !== null"
    class="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
    role="dialog"
    aria-modal="true"
    aria-labelledby="ap-detail-title"
    @click.self="emit('close')"
  >
    <div class="max-h-[92vh] w-full max-w-xl overflow-auto">
      <component :is="variant">
        <button
          type="button"
          class="ap-focusable float-right rounded-lg px-2 py-1 text-sm font-semibold"
          aria-label="Fermer le détail de l'action"
          @click="emit('close')"
        >
          Fermer ✕
        </button>
        <EventDetailHeader :event="event" />
        <EventDetailPlace :location="event.location" :weather="weather" />
        <p v-if="event.description !== ''" class="mt-4 whitespace-pre-line text-sm opacity-90">
          {{ event.description }}
        </p>
        <MetadataSection :entries="event.metadata" />
        <EventDetailActions :event="event" />
      </component>
    </div>
  </div>
</template>
