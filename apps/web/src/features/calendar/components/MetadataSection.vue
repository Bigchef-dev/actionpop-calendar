<script setup lang="ts">
import { computed } from 'vue';

import type { MetadataEntry } from '../../../types';
import { labelledMetadata } from '../utils/metadata-labels';

const props = defineProps<{ entries: MetadataEntry[] }>();
const groups = computed(() => labelledMetadata(props.entries));
</script>

<template>
  <details v-if="groups.length > 0" class="ap-surface mt-4 rounded-2xl px-4 py-3">
    <summary class="ap-focusable cursor-pointer text-sm font-semibold">
      Informations publiées ({{ groups.length }})
    </summary>
    <dl class="mt-3 space-y-2 text-xs">
      <div v-for="group in groups" :key="group.label">
        <dt class="font-bold uppercase tracking-wide opacity-60">{{ group.label }}</dt>
        <dd
          v-for="(value, index) in group.values"
          :key="`${group.label}-${index}`"
          class="mt-0.5 break-words"
        >
          {{ value.value }}
          <span v-for="qualifier in value.qualifiers" :key="qualifier" class="ml-1 opacity-60">
            ({{ qualifier }})
          </span>
        </dd>
      </div>
    </dl>
  </details>
</template>
