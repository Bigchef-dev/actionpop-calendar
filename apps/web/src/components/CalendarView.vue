<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Calendar } from '@fullcalendar/core'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import type { EventContentArg, EventClickArg } from '@fullcalendar/core'
// @ts-ignore — FullCalendar locale modules have no individual type exports
import frLocale from '@fullcalendar/core/locales/fr'
import type { AgendaConfig, ModalEvent } from '../types'
import { buildEventSource } from '../composables/useIcalSource'
import { getWeatherForEvent, getWeatherIcon } from '../composables/useWeather'

const props = defineProps<{ agendas: AgendaConfig[] }>()
const emit = defineEmits<{ (e: 'event-click', event: ModalEvent): void }>()

const calendarEl = ref<HTMLElement | null>(null)
let calendar: Calendar | null = null

function renderEventContent(arg: EventContentArg): { html: string } {
  const { event, timeText } = arg
  const extProps = event.extendedProps as ModalEvent['extendedProps']
  const status = extProps.status ?? 'CONFIRMED'

  // Weather
  let weatherInfo = ''
  if (event.start) {
    const weather = getWeatherForEvent(event.start)
    if (weather) {
      const icon = getWeatherIcon(weather.code)
      let details = ''
      if (weather.precip > 0)
        details += `<span class="ml-1 text-[10px] bg-blue-100 text-blue-800 px-1 rounded">${weather.precip}mm</span>`
      if (weather.wind > 20)
        details += `<span class="ml-1 text-[10px] bg-slate-100 text-slate-600 px-1 rounded">💨${Math.round(weather.wind)}km/h</span>`
      weatherInfo = `<div class="flex items-center mt-1" title="Météo prévue">${icon} ${details}</div>`
    }
  }

  const timeHtml = event.allDay
    ? ''
    : `<div class="text-xs opacity-90 mb-0.5">${timeText}</div>`

  let titleHtml: string
  if (status === 'CANCELLED') {
    titleHtml = `<div class="leading-tight text-sm"><span style="text-decoration:line-through;opacity:0.75">${event.title}</span> <span class="text-[9px] bg-red-200 text-red-700 px-1 rounded font-black uppercase">Annulé</span></div>`
  } else if (status === 'TENTATIVE') {
    titleHtml = `<div class="leading-tight text-sm">${event.title} <span class="text-[9px] bg-yellow-100 text-yellow-800 px-1 rounded font-black uppercase">Provisoire</span></div>`
  } else {
    titleHtml = `<div class="leading-tight text-sm">${event.title}</div>`
  }

  return {
    html: `<div class="p-1 overflow-hidden h-full flex flex-col justify-start">${timeHtml}${titleHtml}${weatherInfo}</div>`,
  }
}

onMounted(() => {
  if (!calendarEl.value) return

  calendar = new Calendar(calendarEl.value, {
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
  })

  for (const agenda of props.agendas) {
    calendar.addEventSource(buildEventSource(agenda))
  }

  calendar.render()
})

function toggleSource(agendaId: string, active: boolean): void {
  if (!calendar) return
  if (active) {
    const agenda = props.agendas.find((a) => a.id === agendaId)
    if (agenda) calendar.addEventSource(buildEventSource(agenda))
  } else {
    calendar.getEventSourceById(agendaId)?.remove()
  }
}

function refreshRender(): void {
  calendar?.render()
}

defineExpose({ toggleSource, refreshRender })
</script>

<template>
  <div
    ref="calendarEl"
    class="bg-white dark:bg-stone-900 rounded-2xl p-6 border border-stone-200 dark:border-stone-700 shadow-xl shadow-stone-200/50 dark:shadow-stone-900/50 min-h-[600px]"
  ></div>
</template>
