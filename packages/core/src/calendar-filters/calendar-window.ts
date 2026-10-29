import type { CalendarWindow } from './calendar-event.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CalendarWindowSettings {
  readonly lookbackDays: number;
  readonly lookaheadDays: number;
}

/**
 * Whole-day offsets around the request instant. The canonical project timezone
 * applies to the instants themselves; whole days keep the boundary independent
 * of month length and of daylight-saving transitions.
 */
export function computeCalendarWindow(
  settings: CalendarWindowSettings,
  requestInstant: Date = new Date(),
): CalendarWindow {
  const startMs = requestInstant.getTime() - settings.lookbackDays * DAY_MS;
  const endMs = requestInstant.getTime() + settings.lookaheadDays * DAY_MS;
  return { startUtc: new Date(startMs), endUtc: new Date(endMs) };
}

/**
 * An event belongs to the calendar when it overlaps the window, that is when it
 * does not end before the window starts and does not start after it ends.
 */
export function overlapsCalendarWindow(
  event: { readonly startTime: Date; readonly endTime: Date },
  window: CalendarWindow,
): boolean {
  return (
    event.endTime.getTime() >= window.startUtc.getTime() &&
    event.startTime.getTime() <= window.endUtc.getTime()
  );
}
