<script setup lang="ts">
import { computed } from 'vue';

import type { CalendarEvent } from '../../../types';
import { actionPopulaireUrl, googleCalendarUrl, toIcsDocument } from '../utils/event-links';

const props = defineProps<{ event: CalendarEvent }>();

const google = computed(() => googleCalendarUrl(props.event));
const source = computed(() => actionPopulaireUrl(props.event));

function downloadCopy(): void {
  const blob = new Blob([toIcsDocument(props.event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${props.event.id}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
    <a
      class="ap-button ap-focusable rounded-xl px-4 py-3 text-center text-sm"
      :href="google"
      target="_blank"
      rel="noopener noreferrer"
    >
      Ajouter à mon agenda
    </a>
    <button
      type="button"
      class="ap-focusable rounded-xl border px-4 py-3 text-sm font-semibold"
      :style="{ borderColor: 'var(--ap-border)' }"
      @click="downloadCopy"
    >
      Télécharger l'événement (.ics)
    </button>
    <a
      v-if="source !== null"
      class="ap-focusable flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm font-bold"
      :style="{ backgroundColor: '#f4c542', color: '#231800' }"
      :href="source"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span class="flex h-6 w-6 items-center justify-center rounded-full bg-[#231800] text-xs text-[#f4c542]">AP</span>
      Action Populaire
    </a>
  </div>
</template>
