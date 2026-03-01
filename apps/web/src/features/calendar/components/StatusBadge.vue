<script setup lang="ts">
defineProps<{ status: 'TENTATIVE' | 'CANCELLED' }>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black uppercase"
    :class="
      status === 'TENTATIVE'
        ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300'
        : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
    "
  >
    {{ status === 'TENTATIVE' ? '⚠️ Prévu' : '✗ Annulé' }}
  </span>
</template>
