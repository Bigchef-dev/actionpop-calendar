<script setup lang="ts">
import type { AgendaConfig } from '../types'

defineProps<{
  agendas: AgendaConfig[]
  activeIds: Set<string>
}>()

const emit = defineEmits<{
  (e: 'toggle', id: string): void
}>()
</script>

<template>
  <div class="mb-6">
    <h3 class="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-3">
      Filtrer l'affichage
    </h3>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="agenda in agendas"
        :key="agenda.id"
        :style="
          activeIds.has(agenda.id)
            ? { backgroundColor: agenda.color, color: 'white', borderColor: agenda.color }
            : { backgroundColor: '', color: '', borderColor: '' }
        "
        :class="[
          'filter-btn border px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide',
          activeIds.has(agenda.id) ? 'active' : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-600'
        ]"
        @click="emit('toggle', agenda.id)"
      >
        {{ agenda.name }}
      </button>
    </div>
  </div>
</template>
