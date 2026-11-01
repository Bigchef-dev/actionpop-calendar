<script setup lang="ts">
defineProps<{ text: string; visible: boolean }>();
</script>

<template>
  <!-- Decorative only: the field label and the static example list carry the meaning. -->
  <span
    v-if="visible && text !== ''"
    aria-hidden="true"
    class="pointer-events-none absolute inset-y-0 left-12 flex items-center text-base opacity-60"
  >
    {{ text }}<span class="ml-0.5 inline-block w-px animate-pulse bg-current">&nbsp;</span>
  </span>
</template>
