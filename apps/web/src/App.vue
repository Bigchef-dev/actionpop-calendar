<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppHeader from './shared/components/AppHeader.vue'
import FilterBar from './features/calendar/components/FilterBar.vue'
import CalendarView from './features/calendar/components/CalendarView.vue'
import EventModal from './features/calendar/components/EventModal.vue'
import SubscriptionGrid from './shared/components/SubscriptionGrid.vue'
import PollCreator from './features/poll/components/PollCreator.vue'
import { AGENDAS } from './config'
import { fetchWeather } from './features/calendar/composables/useWeather'
import { useDarkMode } from './shared/composables/useDarkMode'
import { parseHash, updateHash, removeHashParam } from './shared/composables/useUrlState'
import type { ModalEvent } from './types'

// --- Poll page detection ---
// If ?chatId= is present in the query string, show the poll creator instead of the calendar.
const urlParams = new URLSearchParams(window.location.search)
const pollChatId = urlParams.has('chatId') ? (urlParams.get('chatId') ?? '') : null
const isPollPage = pollChatId !== null

const { isDark, toggle } = useDarkMode()

const calendarRef = ref<InstanceType<typeof CalendarView> | null>(null)

// --- URL state bootstrap ---
const urlState = parseHash()

const ALL_IDS = new Set(AGENDAS.map((a) => a.id))

function decodeActiveIds(raw: string | undefined): Set<string> {
  if (!raw) return new Set(ALL_IDS)
  const ids = raw.split(',').filter((id) => ALL_IDS.has(id))
  return ids.length ? new Set(ids) : new Set(ALL_IDS)
}

// Reactive Set — replaced on mutation to trigger Vue reactivity
const activeIds = ref<Set<string>>(decodeActiveIds(urlState.a))

const selectedEvent = ref<ModalEvent | null>(null)

// Props that seed FullCalendar's initial state (read-only after mount)
const initialView = urlState.v ?? undefined
const initialDate = urlState.d ?? undefined
const targetEventId = ref<string>(urlState.e ?? '')

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
  // Encode only when not all active (keeps URL clean by default)
  const isAll = AGENDAS.every((a) => next.has(a.id))
  updateHash({ a: isAll ? undefined : [...next].join(',') })
}

function onDatesChange(payload: { view: string; date: string }): void {
  updateHash({ v: payload.view, d: payload.date })
}

function onEventClick(event: ModalEvent): void {
  selectedEvent.value = event
  updateHash({ e: event.id })
}

function onModalClose(): void {
  selectedEvent.value = null
  targetEventId.value = ''
  removeHashParam('e')
}

onMounted(async () => {
  if (isPollPage) return
  // Disable agenda sources that are not in the URL-restored activeIds
  const restoredIds = activeIds.value
  for (const agenda of AGENDAS) {
    if (!restoredIds.has(agenda.id)) {
      calendarRef.value?.toggleSource(agenda.id, false)
    }
  }
  try {
    await fetchWeather()
    calendarRef.value?.refreshRender()
  } catch {
    console.warn('Météo indisponible.')
  }
})
</script>

<template>
  <!-- Poll creator page -->
  <PollCreator v-if="isPollPage" :chat-id="pollChatId!" />

  <!-- Calendar app (default) -->
  <div v-else class="min-h-dvh antialiased font-sans bg-gradient-to-br from-[#f8f5f9] via-[#f3eef5] to-[#ede5f0] dark:from-[#120a16] dark:via-[#0f0712] dark:to-[#0c050f] transition-colors duration-300">
    <div class="max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-10">
      <AppHeader :is-dark="isDark" @toggle-dark="toggle" />
      <FilterBar :agendas="AGENDAS" :active-ids="activeIds" @toggle="onToggle" />
      <CalendarView
        ref="calendarRef"
        :agendas="AGENDAS"
        :initial-view="initialView"
        :initial-date="initialDate"
        :target-event-id="targetEventId"
        @event-click="onEventClick"
        @dates-change="onDatesChange"
      />
      <SubscriptionGrid :agendas="AGENDAS" />
      <footer class="text-center mt-16 pb-6 border-t border-stone-200 dark:border-stone-700 pt-8">
        <p class="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">
          Utilise Nextcloud | GT Outils numériques Rennes 2026 | Mathéo, Lily, Amadou
        </p>
      </footer>
    </div>

    <EventModal :event="selectedEvent" @close="onModalClose" />
  </div>
</template>
