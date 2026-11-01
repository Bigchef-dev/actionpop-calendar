import { ref, watch, type Ref } from 'vue'
import { parse, Component } from 'ical.js'
import type { AgendaConfig } from '../legacy-agendas'
import { LEGACY_CALDAV_BASE } from '../legacy-agendas'
import { readDateValue, readText } from '../../calendar/utils/ical-values'

export interface PollEvent {
  id: string
  title: string
  description: string
  startDate: Date | null
  endDate: Date | null
  allDay: boolean
  color: string
  agendaName: string
  agendaId: string
}

async function fetchAgendaEvents(agenda: AgendaConfig, date: Date): Promise<PollEvent[]> {
  const feedUrl = `${LEGACY_CALDAV_BASE}/${agenda.id}?export&_nocache=${Date.now()}`

  const res = await fetch(feedUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const icsText = await res.text()
  const comp = new Component(parse(icsText))
  const vevents = comp.getAllSubcomponents('vevent')

  const targetDay = new Date(date)
  targetDay.setHours(0, 0, 0, 0)
  const nextDay = new Date(targetDay)
  nextDay.setDate(nextDay.getDate() + 1)

  // Separate masters from RECURRENCE-ID exceptions
  const masters: typeof vevents = []
  const exceptions: typeof vevents = []
  for (const v of vevents) {
    if (v.getFirstProperty('recurrence-id')) exceptions.push(v)
    else masters.push(v)
  }

  // Set of (uid + startDate ISO) covered by an exception
  const exceptionKeys = new Set<string>()
  for (const v of exceptions) {
    const uid = String(v.getFirstPropertyValue('uid') ?? '')
    const rid = readDateValue(v.getFirstProperty('recurrence-id')?.getFirstValue())
    if (rid !== null) exceptionKeys.add(`${uid}::${rid.date.toISOString()}`)
  }

  const mapVevent = (vevent: (typeof vevents)[number], isException: boolean): PollEvent | null => {
    const summary = readText(vevent.getFirstPropertyValue('summary')) ?? '(sans titre)'
    const uid = readText(vevent.getFirstPropertyValue('uid')) ?? ''
    const description = readText(vevent.getFirstPropertyValue('description')) ?? ''
    const status = readText(vevent.getFirstPropertyValue('status'))?.toUpperCase() ?? 'CONFIRMED'

    // Skip cancelled exceptions (deleted occurrences)
    if (isException && status === 'CANCELLED') return null

    const dtstartProp = vevent.getFirstProperty('dtstart')
    const dtendProp = vevent.getFirstProperty('dtend')
    const startIcal = readDateValue(dtstartProp?.getFirstValue())
    const endIcal = readDateValue(dtendProp?.getFirstValue())
    const startDate: Date | null = startIcal?.date ?? null
    const endDate: Date | null = endIcal?.date ?? null
    const allDay = startIcal?.allDay ?? false

    // Skip master occurrences overridden by an exception
    if (!isException && startDate) {
      const key = `${uid}::${startDate.toISOString()}`
      if (exceptionKeys.has(key)) return null
    }

    return {
      id: uid,
      title: summary,
      description,
      startDate,
      endDate,
      allDay,
      color: agenda.color,
      agendaName: agenda.name,
      agendaId: agenda.id,
    } satisfies PollEvent
  }

  return [
    ...masters.map((v) => mapVevent(v, false)),
    ...exceptions.map((v) => mapVevent(v, true)),
  ]
    .filter((e): e is PollEvent & { startDate: Date } => {
      if (!e || !e.startDate) return false
      const s = new Date(e.startDate)
      s.setHours(s.getHours(), s.getMinutes(), 0, 0)
      return s >= targetDay && s < nextDay
    })
    .sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0))
}

export function usePollEvents(date: Ref<Date>, activeAgendas: Ref<AgendaConfig[]>) {
  const events = ref<PollEvent[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    events.value = []
    try {
      const results = await Promise.allSettled(
        activeAgendas.value.map((a) => fetchAgendaEvents(a, date.value)),
      )
      const all: PollEvent[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') all.push(...r.value)
        else console.warn('Erreur agenda:', r.reason)
      }
      all.sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0))
      events.value = all
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur inconnue'
    } finally {
      loading.value = false
    }
  }

  watch([date, activeAgendas], load, { immediate: true, deep: true })

  return { events, loading, error, reload: load }
}
