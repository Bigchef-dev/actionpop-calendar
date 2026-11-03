<script setup lang="ts">
defineProps<{
  title: string;
  message: string;
  primaryLabel?: string;
  secondaryLabel?: string;
}>();

const emit = defineEmits<{
  (event: 'primary'): void;
  (event: 'secondary'): void;
}>();
</script>

<template>
  <section class="ap-surface rounded-2xl px-5 py-8 text-center" role="status" aria-live="polite">
    <h2 class="text-lg font-semibold">{{ title }}</h2>
    <p class="mt-2 text-sm opacity-80">{{ message }}</p>
    <div
      v-if="primaryLabel || secondaryLabel"
      class="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center"
    >
      <button
        v-if="primaryLabel"
        type="button"
        class="ap-button rounded-xl px-5 py-3 text-sm"
        @click="emit('primary')"
      >
        {{ primaryLabel }}
      </button>
      <button
        v-if="secondaryLabel"
        type="button"
        class="ap-focusable rounded-xl border px-5 py-3 text-sm font-semibold"
        :style="{ borderColor: 'var(--ap-border)', color: 'var(--ap-ink)' }"
        @click="emit('secondary')"
      >
        {{ secondaryLabel }}
      </button>
    </div>
  </section>
</template>
