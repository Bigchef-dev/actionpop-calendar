<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ModalEvent } from '../types'
import { getWeatherForEventRange } from '../composables/useWeather'
import StatusBadge from './StatusBadge.vue'
import WeatherBadge from './WeatherBadge.vue'

const props = defineProps<{ event: ModalEvent | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

function toICSDate(date: Date): string {
  return date.toISOString().replace(/-|:|\.\d{3}/g, '')
}

const dateTimeStr = computed(() => {
  if (!props.event?.start) return ''
  const d = props.event.start
  const dateStr = d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return dateStr.charAt(0).toUpperCase() + dateStr.slice(1) + ' à ' + timeStr
})

const googleLink = computed(() => {
  if (!props.event) return '#'
  const { title, start, end, extendedProps } = props.event
  const s = toICSDate(start)
  const e = end ? toICSDate(end) : toICSDate(new Date(start.getTime() + 3_600_000))
  return (
    `https://www.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${s}/${e}` +
    `&details=${encodeURIComponent(extendedProps.description)}` +
    `&location=${encodeURIComponent(extendedProps.location)}` +
    `&sf=true&output=xml`
  )
})

const mapsLink = computed(() => {
  const loc = props.event?.extendedProps.location
  return loc ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}` : '#'
})

const weather = computed(() =>
  props.event?.start && !props.event.allDay
    ? getWeatherForEventRange(props.event.start, props.event.end ?? null)
    : null,
)

const copied = ref(false)

function copyLink(): void {
  navigator.clipboard.writeText(window.location.href).then(() => {
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  })
}

function downloadICS(): void {
  if (!props.event) return
  const { id, title, start, end, extendedProps } = props.event
  const { status, description, location } = extendedProps
  const s = toICSDate(start)
  const e = end ? toICSDate(end) : toICSDate(new Date(start.getTime() + 3_600_000))
  const statusLine = status !== 'CONFIRMED' ? `\nSTATUS:${status}` : ''
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FaireMieuxRennes//Agenda//FR',
    'BEGIN:VEVENT',
    `UID:${id || 'uid-' + Date.now()}@fairemieuxrennes`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${s}`,
    `DTEND:${e}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `LOCATION:${location}${statusLine}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n')

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'evenement.ics',
  })
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="event"
      class="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      @keydown.esc="emit('close')"
    >
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <!-- Overlay -->
        <div
          class="fixed inset-0 bg-stone-900 bg-opacity-75 dark:bg-opacity-85 transition-opacity"
          @click="emit('close')"
        ></div>

        <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <!-- Panel -->
        <div class="inline-block align-bottom bg-white dark:bg-stone-900 rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full relative">
          <div class="bg-white dark:bg-stone-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <!-- Titre -->
            <h3 class="text-2xl font-black text-[#4A235A] dark:text-[#e7d9ec] uppercase mb-2 leading-tight">
              {{ event.title }}
            </h3>
            
            <!-- Badge statut -->
            <div v-if="event.extendedProps.status !== 'CONFIRMED'" class="mb-3">
              <StatusBadge :status="event.extendedProps.status" />
            </div>

            <!-- Heure -->
            <div class="flex items-center gap-2 text-[#F97316] font-bold mb-3">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{{ dateTimeStr }}</span>
            </div>

            <!-- Météo -->
            <div v-if="weather" class="flex items-center gap-2 mb-3">
              <WeatherBadge :weather="weather" />
            </div>

            <!-- Lieu -->
            <div class="flex items-start gap-2 text-stone-600 dark:text-stone-300 font-medium mb-4 group">
              <svg class="w-5 h-5 mt-0.5 flex-shrink-0 text-stone-400 group-hover:text-[#F97316] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <a
                v-if="event.extendedProps.location"
                :href="mapsLink"
                target="_blank"
                class="hover:text-[#F97316] dark:text-stone-300 dark:hover:text-[#F97316] transition-colors hover:underline decoration-2 underline-offset-2 break-words"
              >
                {{ event.extendedProps.location }}
                <span class="text-xs text-stone-400 font-normal ml-2">↗ S'y rendre</span>
              </a>
              <span v-else class="text-stone-400 dark:text-stone-500 italic">Lieu non précisé</span>
            </div>

            <!-- Description -->
            <div class="bg-stone-50 dark:bg-stone-800 p-4 rounded-xl border border-stone-100 dark:border-stone-700 text-sm text-stone-700 dark:text-stone-300 mb-6">
              <p style="white-space: pre-wrap">
                {{ event.extendedProps.description || 'Aucune description.' }}
              </p>
            </div>

            <!-- Actions export -->
            <div class="border-t border-stone-100 dark:border-stone-700 pt-4">
              <p class="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-3">
                Ajouter cet événement (⚠️ Pour mise à jour auto, abonnez-vous en bas de page)
              </p>
              <div class="grid grid-cols-2 gap-3 mb-3">
                <a
                  :href="googleLink"
                  target="_blank"
                  class="flex items-center justify-center gap-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 py-2 rounded-lg font-bold text-xs uppercase hover:bg-stone-50 dark:hover:bg-stone-700 transition"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.5 2C7 2 2.5 6.5 2.5 12C2.5 17.5 7 22 12.5 22C18 22 22.5 17.5 22.5 12C22.5 6.5 18 2 12.5 2ZM12.5 20C8.1 20 4.5 16.4 4.5 12C4.5 7.6 8.1 4 12.5 4C16.9 4 20.5 7.6 20.5 12C20.5 16.4 16.9 20 12.5 20ZM16.5 13H13.5V16H11.5V13H8.5V11H11.5V8H13.5V11H16.5V13Z" />
                  </svg>
                  Google
                </a>
                <button
                  class="flex items-center justify-center gap-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 py-2 rounded-lg font-bold text-xs uppercase hover:bg-stone-50 dark:hover:bg-stone-700 transition"
                  @click="downloadICS"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19,4H5A2,2 0 0,0 3,6V18A2,2 0 0,0 5,20H19A2,2 0 0,0 21,18V6A2,2 0 0,0 19,4M19,18H5V8H19V18Z" />
                  </svg>
                  Apple / Outlook
                </button>
              </div>
              <!-- Bouton partage événement -->
              <button
                class="w-full flex items-center justify-center gap-2 border py-2 rounded-lg font-bold text-xs uppercase transition"
                :class="copied
                  ? 'bg-green-50 dark:bg-green-900/30 border-green-400 text-green-700 dark:text-green-400'
                  : 'bg-white dark:bg-stone-800 border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700'"
                @click="copyLink"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path v-if="!copied" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                {{ copied ? 'Lien copié !' : 'Copier le lien vers cet événement' }}
              </button>
            </div>
          </div>

          <div class="bg-stone-50 dark:bg-stone-800 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              class="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-[#4A235A] text-white font-medium hover:bg-[#371b43] sm:ml-3 sm:w-auto sm:text-sm"
              @click="emit('close')"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
