<script setup lang="ts">
import { h, ref, computed, watch } from 'vue'
import FullCalendar from '@fullcalendar/vue3'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import type { CalendarOptions, EventContentArg, EventClickArg, DatesSetArg } from '@fullcalendar/core'
// @ts-ignore — FullCalendar locale modules have no individual type exports
import frLocale from '@fullcalendar/core/locales/fr'
import type { AgendaConfig, ModalEvent } from '../../../types'
import { buildEventSource } from '../composables/useIcalSource'
import { getWeatherForEventRange } from '../composables/useWeather'
import StatusBadge from './StatusBadge.vue'
import WeatherBadge from './WeatherBadge.vue'

const props = defineProps<{
  agendas: AgendaConfig[]
  initialView?: string
  initialDate?: string
  targetEventId?: string
}>()

const emit = defineEmits<{
  (e: 'event-click', event: ModalEvent): void
  (e: 'dates-change', payload: { view: string; date: string }): void
}>()

const calendarRef = ref<InstanceType<typeof FullCalendar> | null>(null)

// Used to ensure the deep-linked event is only auto-opened once per page load
const targetEmitted = ref(false)

// Track current view range to know which events to copy
const viewStart = ref<Date | null>(null)
const viewEnd = ref<Date | null>(null)
const copiedWeek = ref(false)

function formatHour(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

function copyWeek(): void {
  const api = calendarRef.value?.getApi()
  if (!api) return
  const start = viewStart.value ?? api.view.currentStart
  const end = viewEnd.value ?? api.view.currentEnd

  // Collect & filter events in view range, skip cancelled
  type RawEvent = { start: Date; end: Date | null; title: string; allDay: boolean }
  const events: RawEvent[] = api.getEvents()
    .filter((e) => {
      const s = e.start
      if (!s) return false
      const status = (e.extendedProps as { status?: string }).status
      if (status === 'CANCELLED') return false
      return s >= start && s < end
    })
    .map((e) => ({ start: e.start as Date, end: e.end, title: e.title, allDay: e.allDay }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  // Group by calendar day (YYYY-MM-DD key)
  const byDay = new Map<string, RawEvent[]>()
  for (const ev of events) {
    const key = ev.start.toISOString().split('T')[0]
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(ev)
  }

  const lines: string[] = []
  for (const [key, dayEvents] of byDay) {
    const d = new Date(key + 'T00:00:00')
    lines.push(`${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`)
    for (const ev of dayEvents) {
      if (ev.allDay) {
        lines.push(`${ev.title}`)
      } else {
        const s = formatHour(ev.start)
        const e = ev.end ? ` à ${formatHour(ev.end)}` : ''
        lines.push(`${s}${e} : ${ev.title}`)
      }
    }
    lines.push('')
  }

  navigator.clipboard.writeText(lines.join('\n').trimEnd()).then(() => {
    copiedWeek.value = true
    setTimeout(() => (copiedWeek.value = false), 2500)
  })
}

// Plain (non-reactive) variable so that changes to targetEventId do NOT cause
// calendarOptions to recompute (which would make FullCalendar re-process
// initialDate and jump back to today).
let pendingEventId = props.targetEventId ?? ''
watch(() => props.targetEventId, (v) => {
  pendingEventId = v ?? ''
  if (!v) targetEmitted.value = false
})

function renderEventContent(arg: EventContentArg) {
  const { event, timeText } = arg
  const extProps = event.extendedProps as ModalEvent['extendedProps']
  const status = extProps.status ?? 'CONFIRMED'
  const weather = event.start && !event.allDay ? getWeatherForEventRange(event.start, event.end) : null

  const timeNode = event.allDay
    ? null
    : h('div', { class: 'text-xs opacity-90 mb-0.5' }, timeText)

  let titleNode
  if (status === 'CANCELLED') {
    titleNode = h('div', { class: 'leading-tight text-sm flex items-center gap-1 flex-wrap' }, [
      h('span', { style: 'text-decoration:line-through;opacity:0.75' }, event.title),
      h(StatusBadge, { status: 'CANCELLED' }),
    ])
  } else if (status === 'TENTATIVE') {
    titleNode = h('div', { class: 'leading-tight text-sm flex items-center gap-1 flex-wrap' }, [
      event.title,
      h(StatusBadge, { status: 'TENTATIVE' }),
    ])
  } else {
    titleNode = h('div', { class: 'leading-tight text-sm' }, event.title)
  }

  const weatherNode = weather
    ? h('div', { class: 'mt-1' }, [h(WeatherBadge, { weather })])
    : null

  return h(
    'div',
    { class: 'p-1 overflow-hidden h-full flex flex-col justify-start' },
    [timeNode, titleNode, weatherNode].filter(Boolean),
  )
}

const calendarOptions = computed<CalendarOptions>(() => ({
  plugins: [timeGridPlugin, dayGridPlugin, listPlugin],
  locale: frLocale,
  height: window.innerWidth < 768 ? '80dvh' : 680,
  initialView: props.initialView ?? (window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek'),
  initialDate: props.initialDate ?? undefined,
  firstDay: 1,
  headerToolbar: window.innerWidth < 768
    ? { left: 'prev,next', center: 'title', right: 'timeGridDay,listWeek' }
    : { left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek' },
  buttonText: { today: 'Auj.', month: 'Mois', week: 'Semaine', day: 'Jour', list: 'Liste' },
  slotMinTime: '07:00:00',
  slotMaxTime: '23:30:00',
  allDayText: 'Journée',
  eventSources: props.agendas.map(buildEventSource),
  eventContent: renderEventContent,
  datesSet: (arg: DatesSetArg) => {
    viewStart.value = arg.start
    viewEnd.value = arg.end
    const api = calendarRef.value?.getApi()
    if (!api) return
    const date = api.getDate()
    const iso = date.toISOString().split('T')[0]
    emit('dates-change', { view: arg.view.type, date: iso })
  },
  eventsSet: () => {
    if (targetEmitted.value || !pendingEventId) return
    const api = calendarRef.value?.getApi()
    if (!api) return
    const event = api.getEventById(pendingEventId)
    if (!event) return
    targetEmitted.value = true
    emit('event-click', {
      id: event.id,
      title: event.title,
      start: event.start as Date,
      end: event.end,
      allDay: event.allDay,
      extendedProps: event.extendedProps as ModalEvent['extendedProps'],
    })
  },
  eventClick: (info: EventClickArg) => {
    info.jsEvent.preventDefault()
    const e = info.event
    emit('event-click', {
      id: e.id,
      title: e.title,
      start: e.start as Date,
      end: e.end,
      allDay: e.allDay,
      extendedProps: e.extendedProps as ModalEvent['extendedProps'],
    })
  },
}))

function toggleSource(agendaId: string, active: boolean): void {
  const api = calendarRef.value?.getApi()
  if (!api) return
  if (active) {
    const agenda = props.agendas.find((a) => a.id === agendaId)
    if (agenda) api.addEventSource(buildEventSource(agenda))
  } else {
    api.getEventSourceById(agendaId)?.remove()
  }
}

function refreshRender(): void {
  calendarRef.value?.getApi().render()
}

defineExpose({ toggleSource, refreshRender })
</script>

<template>
  <div
    class="bg-white dark:bg-stone-900 rounded-xl sm:rounded-2xl p-2 sm:p-6 border border-stone-200 dark:border-stone-700 shadow-xl shadow-stone-200/50 dark:shadow-stone-900/50"
  >
    <div class="flex justify-end mb-2">
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border transition-colors"
        :class="copiedWeek
          ? 'bg-green-50 dark:bg-green-900/30 border-green-400 text-green-700 dark:text-green-400'
          : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:border-[#9750A4] hover:text-[#9750A4]'"
        :title="copiedWeek ? 'Copié !' : 'Copier les événements visibles'"
        @click="copyWeek"
      >
        <svg v-if="!copiedWeek" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
        <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        {{ copiedWeek ? 'Copié !' : 'Copier la semaine' }}
      </button>
    </div>
    <FullCalendar ref="calendarRef" :options="calendarOptions" />
  </div>
</template>
