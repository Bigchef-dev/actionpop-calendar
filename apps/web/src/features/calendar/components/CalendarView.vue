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
  initialView: props.initialView ?? (window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek'),
  initialDate: props.initialDate ?? undefined,
  firstDay: 1,
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek',
  },
  buttonText: { today: 'Auj.', month: 'Mois', week: 'Semaine', day: 'Jour', list: 'Liste' },
  slotMinTime: '07:00:00',
  slotMaxTime: '23:30:00',
  allDayText: 'Journée',
  eventSources: props.agendas.map(buildEventSource),
  eventContent: renderEventContent,
  datesSet: (arg: DatesSetArg) => {
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
    class="bg-white dark:bg-stone-900 rounded-2xl p-6 border border-stone-200 dark:border-stone-700 shadow-xl shadow-stone-200/50 dark:shadow-stone-900/50 min-h-[600px]"
  >
    <FullCalendar ref="calendarRef" :options="calendarOptions" />
  </div>
</template>
