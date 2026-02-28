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
