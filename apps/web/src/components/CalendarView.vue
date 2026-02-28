<script setup lang="ts">
import { h, ref, computed } from 'vue'
import FullCalendar from '@fullcalendar/vue3'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import type { CalendarOptions, EventContentArg, EventClickArg } from '@fullcalendar/core'
// @ts-ignore — FullCalendar locale modules have no individual type exports
import frLocale from '@fullcalendar/core/locales/fr'
import type { AgendaConfig, ModalEvent } from '../types'
import { buildEventSource } from '../composables/useIcalSource'
import { getWeatherForEvent } from '../composables/useWeather'
import StatusBadge from './StatusBadge.vue'
import WeatherBadge from './WeatherBadge.vue'

const props = defineProps<{ agendas: AgendaConfig[] }>()
const emit = defineEmits<{ (e: 'event-click', event: ModalEvent): void }>()

const calendarRef = ref<InstanceType<typeof FullCalendar> | null>(null)

function renderEventContent(arg: EventContentArg) {
  const { event, timeText } = arg
  const extProps = event.extendedProps as ModalEvent['extendedProps']
  const status = extProps.status ?? 'CONFIRMED'
  const weather = event.start && !event.allDay ? getWeatherForEvent(event.start) : null

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
  initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek',
  firstDay: 1,
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek',
  },
  buttonText: { today: 'Auj.', month: 'Mois', week: 'Semaine', day: 'Jour', list: 'Liste' },
  slotMinTime: '07:00:00',
  slotMaxTime: '22:00:00',
  allDayText: 'Journée',
  eventSources: props.agendas.map(buildEventSource),
  eventContent: renderEventContent,
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
