import { ref } from 'vue'
import type { WeatherEntry } from '../types'
import { CITY_LAT, CITY_LON } from '../config'

const WMO_ICONS: Record<number, string> = {
  0: '☀️',  1: '🌤️', 2: '⛅',  3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '☂️',  63: '🌧️', 65: '🌧️',
  71: '❄️',  73: '❄️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}

// Module-level cache — shared across the entire app (singleton)
const cache = ref<Record<string, WeatherEntry>>({})

export function getWeatherIcon(code: number): string {
  return WMO_ICONS[code] ?? '🌡️'
}

export async function fetchWeather(): Promise<void> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${CITY_LAT}&longitude=${CITY_LON}&hourly=weather_code,precipitation,wind_speed_10m&timezone=auto`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Météo HTTP ${res.status}`)
  const data = await res.json()
  const map: Record<string, WeatherEntry> = {}
  ;(data.hourly.time as string[]).forEach((time, i) => {
    map[time] = {
      code: data.hourly.weather_code[i] as number,
      precip: data.hourly.precipitation[i] as number,
      wind: data.hourly.wind_speed_10m[i] as number,
    }
  })
  cache.value = map
}

export function getWeatherForEvent(date: Date): WeatherEntry | null {
  const pad = (n: number) => String(n).padStart(2, '0')
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`
  return cache.value[key] ?? null
}

// Severity order for WMO codes (higher = worse)
const WMO_SEVERITY: Record<number, number> = {
  0: 0, 1: 1, 2: 2, 3: 3,
  45: 4, 48: 4,
  51: 5, 53: 6, 55: 7,
  61: 8, 63: 9, 65: 10,
  71: 8, 73: 9, 75: 10,
  80: 8, 81: 9, 82: 10,
  95: 11, 96: 12, 99: 13,
}

/**
 * Returns aggregated weather for the full event duration:
 * worst WMO code, total precipitation, max wind speed.
 * Falls back to single-hour lookup when end is null.
 */
export function getWeatherForEventRange(
  start: Date,
  end: Date | null,
): WeatherEntry | null {
  if (!end || end.getTime() <= start.getTime()) {
    return getWeatherForEvent(start)
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const entries: WeatherEntry[] = []

  // Walk hour by hour from start to end (exclusive of the last boundary)
  const cur = new Date(start)
  cur.setMinutes(0, 0, 0)
  while (cur < end) {
    const key = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}T${pad(cur.getHours())}:00`
    const entry = cache.value[key]
    if (entry) entries.push(entry)
    cur.setHours(cur.getHours() + 1)
  }

  if (entries.length === 0) return null

  const worst = entries.reduce((a, b) =>
    (WMO_SEVERITY[b.code] ?? 0) > (WMO_SEVERITY[a.code] ?? 0) ? b : a,
  )

  return {
    code: worst.code,
    precip: Math.round(entries.reduce((sum, e) => sum + e.precip, 0) * 10) / 10,
    wind: Math.max(...entries.map((e) => e.wind)),
  }
}
