<script setup lang="ts">
import frLocale from '@fullcalendar/core/locales/fr';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import FullCalendar from '@fullcalendar/vue3';
import { computed } from 'vue';

import type { CalendarEvent, CalendarLayout, WeatherEntry } from '../../../types';
import EventList from './EventList.vue';

const props = defineProps<{
  events: CalendarEvent[];
  layout: CalendarLayout;
  weatherFor: (event: CalendarEvent) => WeatherEntry | null;
}>();

const emit = defineEmits<{ (event: 'open', target: CalendarEvent): void }>();

const calendarView = computed(() => (props.layout === 'semaine' ? 'timeGridWeek' : 'dayGridMonth'));

const fullCalendarEvents = computed(() =>
  props.events.map((event) => ({
    id: `${event.id}-${event.start.toISOString()}`,
    title: event.summary,
    start: event.start,
    ...(event.end === null ? {} : { end: event.end }),
    allDay: event.allDay,
    classNames:
      event.status === 'CANCELLED'
        ? ['ap-event-cancelled']
        : event.status === 'TENTATIVE'
          ? ['ap-event-tentative']
          : ['ap-event-confirmed'],
  })),
);

function onEventClick(payload: { event: { id: string } }): void {
  const target = props.events.find(
    (event) => `${event.id}-${event.start.toISOString()}` === payload.event.id,
  );
  if (target !== undefined) emit('open', target);
}
</script>

<template>
  <div>
    <EventList
      v-if="layout === 'liste'"
      :events="events"
      :weather-for="weatherFor"
      @open="emit('open', $event)"
    />
    <div v-else class="ap-surface rounded-2xl p-2 sm:p-3">
      <FullCalendar
        :options="{
          plugins: [dayGridPlugin, timeGridPlugin],
          initialView: calendarView,
          locale: frLocale,
          firstDay: 1,
          height: 'auto',
          headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
          events: fullCalendarEvents,
          eventClick: onEventClick,
          eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
        }"
      />
    </div>
  </div>
</template>
