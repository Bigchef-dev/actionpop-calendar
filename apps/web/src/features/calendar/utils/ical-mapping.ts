import { Component, parse } from 'ical.js';

import type { CalendarEvent } from '../../../types';
import {
  readCoordinates,
  readDateValue,
  readEventType,
  readMetadata,
  readSourceUrl,
  readStatus,
  readText,
} from './ical-values';

export interface ParsedCalendar {
  events: CalendarEvent[];
  /** Components skipped because they carry no usable identity or start. */
  dropped: number;
}

/** Parses a calendar document into the events the experience displays. Never throws. */
export function parseCalendar(icsText: string): ParsedCalendar {
  let root: InstanceType<typeof Component>;
  try {
    root = new Component(parse(icsText));
  } catch {
    return { events: [], dropped: 0 };
  }

  const components = root.getAllSubcomponents('vevent');
  const replaced = new Set<string>();
  const cancelled = new Set<string>();

  for (const component of components) {
    const recurrenceId = readDateValue(
      component.getFirstProperty('recurrence-id')?.getFirstValue(),
    );
    if (recurrenceId === null) continue;
    const key = occurrenceKey(component, recurrenceId.date);
    replaced.add(key);
    if (readStatus(component) === 'CANCELLED') cancelled.add(key);
  }

  const events: CalendarEvent[] = [];
  let dropped = 0;

  for (const component of components) {
    const uid = readText(component.getFirstPropertyValue('uid'));
    const start = readDateValue(component.getFirstProperty('dtstart')?.getFirstValue());
    if (uid === null || start === null) {
      dropped += 1;
      continue;
    }

    const key = `${uid}::${start.date.toISOString()}`;
    const isException = component.getFirstProperty('recurrence-id') !== null;
    if (isException ? cancelled.has(key) : replaced.has(key)) continue;

    const end = readDateValue(component.getFirstProperty('dtend')?.getFirstValue());
    const metadata = readMetadata(component);

    events.push({
      id: uid,
      summary: readText(component.getFirstPropertyValue('summary')) ?? 'Action sans titre',
      description: readText(component.getFirstPropertyValue('description')) ?? '',
      start: start.date,
      end: end === null ? null : end.date,
      allDay: start.allDay,
      status: readStatus(component),
      eventType: readEventType(component),
      sourceUrl: readSourceUrl(component, metadata),
      location: readText(component.getFirstPropertyValue('location')),
      coordinates: readCoordinates(component),
      metadata,
    });
  }

  events.sort((left, right) => left.start.getTime() - right.start.getTime());
  return { events, dropped };
}

function occurrenceKey(component: InstanceType<typeof Component>, date: Date): string {
  const uid = readText(component.getFirstPropertyValue('uid')) ?? '';
  return `${uid}::${date.toISOString()}`;
}
