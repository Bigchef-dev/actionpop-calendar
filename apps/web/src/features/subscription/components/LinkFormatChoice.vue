<script setup lang="ts">
defineProps<{ keepFilters: boolean; filterCount: number }>();
const emit = defineEmits<{ (event: 'update:keepFilters', value: boolean): void }>();
</script>

<template>
  <fieldset class="mt-4">
    <legend class="text-[11px] font-bold uppercase tracking-widest opacity-60">
      Ce que le lien doit contenir
    </legend>
    <div class="mt-2 flex flex-col gap-2 text-sm">
      <label class="flex items-start gap-2">
        <input
          type="radio"
          name="ap-link-scope"
          :checked="keepFilters"
          class="mt-1"
          @change="emit('update:keepFilters', true)"
        />
        <span>
          <strong>Le filtre affiché</strong>
          <span class="block text-xs opacity-70">
            {{ filterCount }} type{{ filterCount > 1 ? 's' : '' }} d'action sélectionné{{
              filterCount > 1 ? 's' : ''
            }}
          </span>
        </span>
      </label>
      <label class="flex items-start gap-2">
        <input
          type="radio"
          name="ap-link-scope"
          :checked="!keepFilters"
          class="mt-1"
          @change="emit('update:keepFilters', false)"
        />
        <span>
          <strong>Toutes les actions de ce sujet</strong>
          <span class="block text-xs opacity-70">Le filtre reste seulement à l'écran</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>
