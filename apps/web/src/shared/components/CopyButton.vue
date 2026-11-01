<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  value: string;
  label: string;
  confirmation?: string;
}>();

const state = ref<'idle' | 'copied' | 'failed'>('idle');

async function copy(): Promise<void> {
  try {
    if (navigator.clipboard === undefined) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(props.value);
    state.value = 'copied';
  } catch {
    state.value = 'failed';
  }
  window.setTimeout(() => {
    state.value = 'idle';
  }, 4000);
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <button type="button" class="ap-button rounded-xl px-5 py-3 text-sm" @click="copy">
      {{ label }}
    </button>
    <p v-if="state === 'copied'" class="text-xs font-semibold ap-primary-text" role="status">
      {{ confirmation ?? 'Lien copié.' }}
    </p>
    <p v-else-if="state === 'failed'" class="text-xs font-semibold ap-secondary-text" role="status">
      Copie impossible : sélectionnez le lien affiché pour le copier à la main.
    </p>
  </div>
</template>
