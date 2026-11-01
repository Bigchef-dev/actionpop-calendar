import { computed, ref } from 'vue';

import type { CalendarEvent, WeatherEntry } from '../../../types';
import { weatherRequestFor, type WeatherRequest } from '../utils/weather-window';

const WMO_ICONS: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌧️',
  61: '☂️',
  63: '🌧️',
  65: '🌧️',
  71: '❄️',
  73: '❄️',
  75: '❄️',
  80: '🌦️',
  81: '🌧️',
  82: '⛈️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

export function weatherIcon(code: number): string {
  return WMO_ICONS[code] ?? '🌡️';
}

/** hourKey → entry, per rounded coordinate pair. Shared for the whole page. */
const hourly = ref<Record<string, Record<string, WeatherEntry>>>({});
const inFlight = new Set<string>();

async function loadCoordinate(latitude: number, longitude: number, key: string): Promise<void> {
  if (inFlight.has(key) || hourly.value[key] !== undefined) return;
  inFlight.add(key);

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      '&hourly=weather_code,precipitation,wind_speed_10m&timezone=auto';
    const response = await fetch(url);
    if (!response.ok) return;
    const data = (await response.json()) as {
      hourly: {
        time: string[];
        weather_code: number[];
        precipitation: number[];
        wind_speed_10m: number[];
      };
    };
    const entries: Record<string, WeatherEntry> = {};
    data.hourly.time.forEach((time, index) => {
      entries[time] = {
        code: data.hourly.weather_code[index] ?? 0,
        precip: data.hourly.precipitation[index] ?? 0,
        wind: data.hourly.wind_speed_10m[index] ?? 0,
      };
    });
    hourly.value = { ...hourly.value, [key]: entries };
  } catch {
    // Weather is an enhancement: an unavailable forecast leaves the badge empty.
  } finally {
    inFlight.delete(key);
  }
}

export function useWeather() {
  function requestFor(event: CalendarEvent): WeatherRequest | null {
    return weatherRequestFor(event);
  }

  async function ensure(events: readonly CalendarEvent[]): Promise<void> {
    const seen = new Set<string>();
    const tasks: Promise<void>[] = [];
    for (const event of events) {
      const request = weatherRequestFor(event);
      if (request === null || seen.has(request.coordinateKey)) continue;
      seen.add(request.coordinateKey);
      tasks.push(loadCoordinate(request.latitude, request.longitude, request.coordinateKey));
    }
    await Promise.all(tasks);
  }

  function weatherFor(event: CalendarEvent): WeatherEntry | null {
    const request = weatherRequestFor(event);
    if (request === null) return null;
    return hourly.value[request.coordinateKey]?.[request.hourKey] ?? null;
  }

  return { weatherFor, ensure, requestFor, hourly: computed(() => hourly.value) };
}
