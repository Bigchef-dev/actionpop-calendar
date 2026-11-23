<script setup lang="ts">
import { computed } from 'vue';

import { useUpdateStatus } from '../composables/useUpdateStatus';
import {
  formatAge,
  formatDuration,
  formatUpdateTime,
  kindProgress,
  outcomeLabel,
  stateLabel,
  statusLine,
} from '../utils/update-status-format';
import UpdateProgressVisual from './UpdateProgressVisual.vue';

const { answer, failed, refreshing, refresh } = useUpdateStatus();

const line = computed(() =>
  answer.value === null
    ? 'Chargement de l’état des mises à jour…'
    : statusLine(answer.value, new Date()),
);
const lastCompleted = computed(() => answer.value?.lastCompleted ?? null);
const history = computed(() => answer.value?.history.slice(0, 5) ?? []);
const lastAge = computed(() =>
  lastCompleted.value === null ? null : formatAge(lastCompleted.value.completedAt, new Date()),
);
const state = computed(() => answer.value?.state ?? null);
</script>

<template>
  <section class="mx-auto w-full max-w-2xl">
    <p class="ap-eyebrow">Mises à jour</p>
    <h1 class="mt-1 text-2xl font-bold">État des données</h1>
    <p class="mt-2 text-sm opacity-80">
      Le calendrier se met à jour par cycles. Cette page indique si un rafraîchissement est en
      cours, quand le dernier a réussi et comment se sont passés les cinq derniers.
    </p>

    <div class="ap-surface mt-5 rounded-2xl px-5 py-6">
      <div role="status" aria-live="polite">
        <span
          v-if="state !== null"
          class="ap-chip-muted inline-block rounded-full px-3 py-1 text-xs font-semibold"
        >
          {{ stateLabel(state) }}
        </span>
        <p class="mt-3 text-sm font-semibold">{{ line }}</p>
      </div>

      <UpdateProgressVisual
        :current="answer?.current ?? null"
        :last-completed="answer?.lastCompleted ?? null"
        :history="history"
      />

      <dl class="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt class="ap-eyebrow">Dernière mise à jour</dt>
          <dd class="mt-1">
            {{
              lastCompleted === null ? 'Indisponible' : formatUpdateTime(lastCompleted.completedAt)
            }}
          </dd>
        </div>
        <div>
          <dt class="ap-eyebrow">Ancienneté</dt>
          <dd class="mt-1">{{ lastAge ?? 'Indisponible' }}</dd>
        </div>
        <div>
          <dt class="ap-eyebrow">Durée du dernier cycle</dt>
          <dd class="mt-1">
            {{
              lastCompleted === null
                ? 'Indisponible'
                : formatDuration(lastCompleted.durationSeconds)
            }}
          </dd>
        </div>
        <div>
          <dt class="ap-eyebrow">Bilan</dt>
          <dd class="mt-1">
            {{ lastCompleted === null ? 'Indisponible' : outcomeLabel(lastCompleted.outcome) }}
          </dd>
        </div>
      </dl>

      <div class="mt-5 flex items-center justify-between gap-3">
        <p v-if="failed" class="text-xs ap-secondary-text">
          Actualisation impossible ; la dernière information connue reste affichée.
        </p>
        <button
          type="button"
          class="ap-focusable ml-auto rounded-xl border px-4 py-2 text-sm font-semibold"
          :style="{ borderColor: 'var(--ap-border)' }"
          :disabled="refreshing"
          @click="refresh"
        >
          Actualiser
        </button>
      </div>
    </div>

    <section class="mt-6" aria-labelledby="recent-cycles-title">
      <h2 id="recent-cycles-title" class="text-lg font-semibold">Derniers cycles</h2>
      <ol v-if="history.length > 0" class="mt-2 space-y-2 text-sm">
        <li
          v-for="run in history"
          :key="run.completedAt"
          class="flex flex-wrap items-baseline justify-between gap-2"
        >
          <span>{{ formatUpdateTime(run.completedAt) }}</span>
          <span class="opacity-80">
            Groupes {{ kindProgress(run.groups) }} · Événements {{ kindProgress(run.events) }} —
            {{ outcomeLabel(run.outcome) }} — {{ formatDuration(run.durationSeconds) }}
          </span>
        </li>
      </ol>
      <p v-else class="mt-2 text-sm opacity-80">Aucun cycle terminé n’est connu.</p>
    </section>
  </section>
</template>
