<script setup lang="ts">
import { computed } from 'vue';

import type {
  CompletedUpdateRun,
  CurrentUpdateRun,
  UpdateCounts,
  UpdateOutcome,
} from '../../../types';
import { formatCount, kindProgress } from '../utils/update-status-format';

const props = defineProps<{
  current: CurrentUpdateRun | null;
  lastCompleted: CompletedUpdateRun | null;
  history: readonly CompletedUpdateRun[];
}>();

interface ProgressRow {
  readonly label: string;
  readonly counts: UpdateCounts;
  readonly color: string;
}

const source = computed(() => props.current ?? props.lastCompleted);

const rows = computed<readonly ProgressRow[]>(() => {
  const reading = source.value;
  if (reading === null) return [];
  return [
    { label: 'Groupes', counts: reading.groups, color: 'var(--ap-primary)' },
    { label: 'Événements', counts: reading.events, color: 'var(--ap-secondary)' },
  ];
});

const recent = computed(() => props.history.slice(0, 5));
const longest = computed(() => Math.max(1, ...recent.value.map((run) => run.durationSeconds)));

const OUTCOME_COLORS: Record<UpdateOutcome, string> = {
  complete: 'var(--ap-primary)',
  partial: 'var(--ap-yellow)',
  failed: 'var(--ap-secondary)',
};

function done(counts: UpdateCounts): number {
  return counts.processed + counts.failed;
}

function percent(counts: UpdateCounts): number {
  return counts.total > 0 ? Math.min(100, Math.round((done(counts) / counts.total) * 100)) : 0;
}

function barHeight(run: CompletedUpdateRun): string {
  return `${Math.max(6, Math.round((run.durationSeconds / longest.value) * 28))}px`;
}
</script>

<template>
  <div class="mt-5">
    <div v-if="rows.length > 0" class="space-y-4">
      <div v-for="row in rows" :key="row.label">
        <div class="flex items-baseline justify-between gap-3 text-sm">
          <span class="font-semibold">{{ row.label }}</span>
          <span class="ap-secondary-text">{{ kindProgress(row.counts) }}</span>
        </div>
        <div
          class="mt-1 h-2 w-full overflow-hidden rounded-full"
          :style="{ backgroundColor: 'var(--ap-surface-muted)' }"
          role="progressbar"
          :aria-label="`Progression des ${row.label.toLowerCase()}`"
          aria-valuemin="0"
          :aria-valuemax="row.counts.total"
          :aria-valuenow="done(row.counts)"
          :aria-valuetext="`${formatCount(done(row.counts))} sur ${formatCount(row.counts.total)}`"
        >
          <div
            class="h-full rounded-full"
            :style="{ width: `${percent(row.counts)}%`, backgroundColor: row.color }"
          />
        </div>
      </div>
    </div>
    <p v-else class="text-xs ap-secondary-text">Aucune mise à jour en cours.</p>

    <div v-if="recent.length > 0" class="mt-4">
      <p class="ap-eyebrow">Cinq derniers cycles</p>
      <div
        class="mt-1 flex h-8 items-end justify-center gap-1"
        aria-hidden="true"
        data-testid="recent-cycles-visual"
      >
        <span
          v-for="run in recent"
          :key="run.completedAt"
          data-testid="recent-cycle-bar"
          class="w-3 rounded-sm"
          :style="{ height: barHeight(run), backgroundColor: OUTCOME_COLORS[run.outcome] }"
        />
      </div>
    </div>
  </div>
</template>
