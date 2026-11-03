import type { CalendarEvent } from '../../../types';

/** Open-Meteo publishes a 16-day forecast horizon. */
export const FORECAST_HORIZON_DAYS = 16;
const HOUR_MS = 3_600_000;

export interface WeatherRequest {
  latitude: number;
  longitude: number;
  /** Midnight-free hour key, `YYYY-MM-DDTHH:00`, in local time. */
  hourKey: string;
  /** Cache key of the coordinates, rounded to two decimals. */
  coordinateKey: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function hourKeyFor(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
}

export function coordinateKeyFor(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
}

/**
 * The forecast request an event justifies, or `null` when none is meaningful: no coordinates,
 * an all-day event without a time, or a start outside the provider horizon.
 */
export function weatherRequestFor(
  event: CalendarEvent,
  now: Date = new Date(),
): WeatherRequest | null {
  if (event.coordinates === null) return null;
  if (event.allDay) return null;

  const start = event.start.getTime();
  if (Number.isNaN(start)) return null;
  if (start < now.getTime() - HOUR_MS) return null;
  if (start > now.getTime() + FORECAST_HORIZON_DAYS * 24 * HOUR_MS) return null;

  return {
    latitude: event.coordinates.latitude,
    longitude: event.coordinates.longitude,
    hourKey: hourKeyFor(event.start),
    coordinateKey: coordinateKeyFor(event.coordinates.latitude, event.coordinates.longitude),
  };
}
