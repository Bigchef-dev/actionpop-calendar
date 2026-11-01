<script setup lang="ts">
import type { EventStatus } from '../../../types';

defineProps<{ status: EventStatus }>();

const LABELS: Record<EventStatus, string> = {
  CONFIRMED: 'Confirmé',
  TENTATIVE: 'Provisoire',
  CANCELLED: 'Annulé',
};

const ICONS: Record<EventStatus, string> = {
  CONFIRMED: '✓',
  TENTATIVE: '⚠️',
  CANCELLED: '✗',
};
</script>

<template>
  <span
    v-if="status !== 'CONFIRMED'"
    class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-black uppercase"
    :style="
      status === 'TENTATIVE'
        ? { backgroundColor: 'var(--ap-surface-muted)', color: 'var(--ap-ink)' }
        : { backgroundColor: 'var(--ap-secondary)', color: '#fffcf4' }
    "
  >
    <span aria-hidden="true">{{ ICONS[status] }}</span>
    {{ LABELS[status] }}
  </span>
</template>
