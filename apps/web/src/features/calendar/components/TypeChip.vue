<script setup lang="ts">
import { computed } from 'vue';

import { actionTypeFor } from '../data/event-types';

const props = defineProps<{ slug: string | null; size?: 'sm' | 'md' }>();
const type = computed(() => actionTypeFor(props.slug));
</script>

<template>
  <span
    class="ap-chip-muted inline-flex items-center gap-1.5 rounded-full font-semibold"
    :class="size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'"
  >
    <span aria-hidden="true">{{ type.emoji }}</span>
    <span>{{ type.label }}</span>
  </span>
</template>
