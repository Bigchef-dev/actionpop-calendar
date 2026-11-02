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
    class="ap-chip-muted inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-black uppercase"
    :class="{ 'ap-chip-alert': status === 'CANCELLED' }"
  >
    <span aria-hidden="true">{{ ICONS[status] }}</span>
    {{ LABELS[status] }}
  </span>
</template>
