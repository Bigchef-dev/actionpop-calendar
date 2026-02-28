<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import FilterBar from './components/FilterBar.vue'
import CalendarView from './components/CalendarView.vue'
import EventModal from './components/EventModal.vue'
import SubscriptionGrid from './components/SubscriptionGrid.vue'
import { AGENDAS } from './config'
import { fetchWeather } from './composables/useWeather'
import type { ModalEvent } from './types'

const calendarRef = ref<InstanceType<typeof CalendarView> | null>(null)

// Reactive Set — replaced on mutation to trigger Vue reactivity
const activeIds = ref<Set<string>>(new Set(AGENDAS.map((a) => a.id)))

const selectedEvent = ref<ModalEvent | null>(null)

function onToggle(id: string): void {
  const next = new Set(activeIds.value)
  if (next.has(id)) {
    next.delete(id)
    calendarRef.value?.toggleSource(id, false)
  } else {
    next.add(id)
    calendarRef.value?.toggleSource(id, true)
  }
  activeIds.value = next
}

onMounted(async () => {
  try {
    await fetchWeather()
    calendarRef.value?.refreshRender()
  } catch {
    console.warn('Météo indisponible.')
  }
})
</script>

<template>
  <div class="min-h-screen antialiased font-sans bg-gradient-to-br from-[#f8f5f9] via-[#f3eef5] to-[#ede5f0]">
    <div class="max-w-6xl mx-auto px-4 py-10">
      <AppHeader />
      <FilterBar :agendas="AGENDAS" :active-ids="activeIds" @toggle="onToggle" />
      <CalendarView ref="calendarRef" :agendas="AGENDAS" @event-click="selectedEvent = $event" />
      <SubscriptionGrid :agendas="AGENDAS" />

      <footer class="text-center mt-16 pb-6 border-t border-stone-200 pt-8">
        <p class="text-xs font-bold text-stone-400 uppercase tracking-widest">
          Utilise Nextcloud | GT Outils numériques Rennes 2026 | Mathéo, Lily, Amadou
        </p>
      </footer>
    </div>

    <EventModal :event="selectedEvent" @close="selectedEvent = null" />
  </div>
</template>
