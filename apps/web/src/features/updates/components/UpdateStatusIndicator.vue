<script setup lang="ts">
import { computed } from 'vue';

import { UPDATES_PAGE_HREF } from '../../../config';
import { useUpdateStatus } from '../composables/useUpdateStatus';
import {
  formatDuration,
  formatUpdateTime,
  outcomeLabel,
  statusLine,
} from '../utils/update-status-format';

const { answer, failed, refreshing, refresh } = useUpdateStatus();

const line = computed(() => (answer.value === null ? null : statusLine(answer.value, new Date())));
const history = computed(() => answer.value?.history.slice(0, 5) ?? []);
</script>

<template>
  <section class="mt-4 text-xs ap-secondary-text" aria-label="État des mises à jour">
    <div class="flex flex-wrap items-center justify-center gap-2" role="status" aria-live="polite">
      <span>{{ line ?? 'État des mises à jour indisponible' }}</span>
      <button
        type="button"
        class="ap-focusable rounded px-2 py-1 font-semibold"
        :style="{ borderColor: 'var(--ap-border)' }"
        :disabled="refreshing"
        @click="refresh"
      >
        Actualiser
      </button>
      <a :href="UPDATES_PAGE_HREF" class="ap-focusable font-semibold underline">
        Voir l’état détaillé
      </a>
    </div>
    <p v-if="failed" class="mt-1 text-center">
      Actualisation impossible ; la dernière information connue reste affichée.
    </p>
    <details v-if="history.length > 0" class="mt-2 text-center">
      <summary class="ap-focusable cursor-pointer font-semibold">Derniers cycles</summary>
      <ul class="mt-1 space-y-1">
        <li v-for="run in history" :key="run.completedAt">
          {{ formatUpdateTime(run.completedAt) }} — {{ outcomeLabel(run.outcome) }} —
          {{ formatDuration(run.durationSeconds) }}
        </li>
      </ul>
    </details>
  </section>
</template>
