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
    <h3 class="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">
      Filtrer l'affichage
    </h3>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="agenda in agendas"
        :key="agenda.id"
        class="filter-btn border px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide"
        :class="{ active: activeIds.has(agenda.id) }"
        :style="
          activeIds.has(agenda.id)
            ? { backgroundColor: agenda.color, color: 'white', borderColor: agenda.color }
            : { backgroundColor: 'white', color: '#78716c', borderColor: '#e7e5e4' }
        "
        @click="emit('toggle', agenda.id)"
      >
        {{ agenda.name }}
      </button>
    </div>
  </div>
</template>
