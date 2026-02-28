export interface AgendaConfig {
  name: string
  id: string
  color: string
}

export interface WeatherEntry {
  code: number
  precip: number
  wind: number
}

export interface ModalEvent {
  id: string
  title: string
  start: Date
  end: Date | null
  allDay: boolean
  extendedProps: {
    status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED'
    description: string
    location: string
  }
}
