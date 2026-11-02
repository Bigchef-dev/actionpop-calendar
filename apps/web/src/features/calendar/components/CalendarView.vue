<script setup lang="ts">
import frLocale from '@fullcalendar/core/locales/fr';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import FullCalendar from '@fullcalendar/vue3';
import { computed } from 'vue';

import type { CalendarEvent, CalendarLayout, WeatherEntry } from '../../../types';
import { actionTypeFor } from '../data/event-types';
import { groupColorFor, type GroupColor } from '../utils/group-colors';
import { groupIds } from '../utils/metadata';
import EventList from './EventList.vue';

const props = defineProps<{
  events: CalendarEvent[];
  layout: CalendarLayout;
  weatherFor: (event: CalendarEvent) => WeatherEntry | null;
  groupColors: { id: string; color: GroupColor }[];
}>();

const emit = defineEmits<{ (event: 'open', target: CalendarEvent): void }>();

const calendarView = computed(() => {
  if (props.layout === 'semaine') return 'timeGridWeek';
  if (props.layout === 'jour') return 'timeGridDay';
  return 'dayGridMonth';
});

function minutesOfDay(value: Date): number {
  return value.getHours() * 60 + value.getMinutes();
}

function isNextDay(start: Date, end: Date): boolean {
  return (
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate()
  );
}

function timeValue(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}:00`;
}

const timeGridWindow = computed(() => {
  const defaultMin = 7 * 60;
  const defaultMax = 22 * 60;
  let min = defaultMax - 60;
  let max = 0;
  let hasTimedEvent = false;

  for (const event of props.events) {
    if (event.allDay) continue;
    hasTimedEvent = true;
    min = Math.min(min, minutesOfDay(event.start));
    if (event.end === null) {
      max = defaultMax;
    } else if (isNextDay(event.start, event.end)) {
      max = defaultMax;
    } else {
      max = Math.max(max, minutesOfDay(event.end));
    }
  }

  if (!hasTimedEvent) {
    min = defaultMin;
    max = defaultMax;
  } else if (max <= min) {
    max = Math.min(min + 60, defaultMax);
  }

  return {
    slotMinTime: timeValue(min),
    slotMaxTime: timeValue(max),
    scrollTime: timeValue(min),
  };
});

interface CalendarPresentation {
  emoji: string;
  color: GroupColor;
  label: string;
}

function calendarId(event: CalendarEvent): string {
  return `${event.id}-${event.start.toISOString()}`;
}

const presentationByEvent = computed(() => {
  const entries = new Map<string, CalendarPresentation>();
  for (const event of props.events) {
    const type = actionTypeFor(event.eventType);
    const groupId = groupIds(event)[0];
    const group =
      props.groupColors.find((candidate) => candidate.id === groupId)?.color ??
      (groupId === undefined ? undefined : groupColorFor(groupId));
    entries.set(calendarId(event), {
      emoji: type.emoji,
      color: group ?? {
        color: type.color,
        tint: 'var(--ap-surface)',
        foreground: '#FFFFFF',
        marker: '',
      },
      label: type.label,
    });
  }
  return entries;
});

const fullCalendarEvents = computed(() =>
  props.events.map((event) => ({
    id: calendarId(event),
    title: event.summary,
    start: event.start,
    ...(event.end === null ? {} : { end: event.end }),
    allDay: event.allDay,
    classNames: [
      'ap-event-item',
      event.status === 'CANCELLED'
        ? 'ap-event-cancelled'
        : event.status === 'TENTATIVE'
          ? 'ap-event-tentative'
          : 'ap-event-confirmed',
    ],
  })),
);

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface EventContentPayload {
  event: { id: string; title: string };
  timeText: string;
}

const isTimeGrid = computed(() => props.layout === 'jour' || props.layout === 'semaine');

/**
 * FullCalendar renders an HTML string rather than a component, so the group color travels as two
 * custom properties and the chip styling itself stays in the stylesheet.
 */
function chipHtml(payload: EventContentPayload): string {
  const presentation = presentationByEvent.value.get(payload.event.id);
  const color = presentation?.color.color ?? 'var(--ap-primary)';
  const ink = presentation?.color.foreground ?? 'var(--ap-on-primary)';
  const label = escapeHtml(presentation?.label ?? 'Action');
  const emoji = presentation?.emoji ?? '';
  const chipClass = isTimeGrid.value ? 'ap-event-chip ap-event-chip-timegrid' : 'ap-event-chip';
  const style = `--ap-chip-color:${color};--ap-chip-ink:${ink}`;
  const time =
    payload.timeText === ''
      ? ''
      : `<span class="ap-event-time">${escapeHtml(payload.timeText)}</span>`;
  const name = `<span class="ap-event-name">${emoji} ${escapeHtml(payload.event.title)}</span>`;

  return [
    `<span class="${chipClass}" style="${style}" title="${label}">`,
    time,
    name,
    '</span>',
  ].join('');
}

function eventContent(payload: EventContentPayload): { html: string } {
  return { html: chipHtml(payload) };
}

function onEventClick(payload: { event: { id: string } }): void {
  const target = props.events.find((event) => calendarId(event) === payload.event.id);
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
        :key="layout"
        :options="{
          plugins: [dayGridPlugin, timeGridPlugin],
          initialView: calendarView,
          locale: frLocale,
          firstDay: 1,
          height: 'auto',
          headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
          events: fullCalendarEvents,
          eventClick: onEventClick,
          eventContent,
          eventDisplay: 'block',
          displayEventEnd: true,
          ...timeGridWindow,
          dayMaxEventRows: 3,
          eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
        }"
      />
    </div>
  </div>
</template>
