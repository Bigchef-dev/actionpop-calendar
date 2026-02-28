import type { AgendaConfig } from './types'

export const NEXTCLOUD_BASE = 'https://cloud.lfirennes.fun/remote.php/dav/public-calendars'
export const PROXY_BASE = 'https://corsproxy.io'
export const PROXY_KEY = '1aae6667'

export const CITY_LAT = 48.117266
export const CITY_LON = -1.6777926

export const AGENDAS: AgendaConfig[] = [
  { name: '🌟 Grands événements', id: 'gAqqiNmEaBEZFaeL', color: '#D50000' },
  { name: '📢 Manifestations',    id: 'K9AeAK7ncMtpfM2G', color: '#F57C00' },
  { name: '🥕 Marchés / Tractage', id: 'CRXwn5t7yCF6N4CL', color: '#C51162' },
  { name: '🚪 Porte à portes',    id: 'j48w2LiW2kY5D8dK', color: '#43A047' },
  { name: '🖌️ Collages',          id: 'nSHtRyZzKnHzPSt6', color: '#546E7A' },
  { name: '🧠 Réunions internes', id: '3abw23FbM2oZnLSg', color: '#3949AB' },
  { name: '🏫 Écoles',            id: 'z7aLi4NqGH6rBKYw', color: '#12d108' },
  { name: '🔥 Actions jeunes',    id: 'dZfyNGEkfBMi5yB9', color: '#FAD02E' },
]
