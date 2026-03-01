import { parse, Component } from 'ical.js'
import type { AgendaConfig, ModalEvent } from '../../../types'
import { NEXTCLOUD_BASE } from '../../../config'

type EventStatus = ModalEvent['extendedProps']['status']

export function buildEventSource(agenda: AgendaConfig) {
  return {
    id: agenda.id,
    color: agenda.color,
    events: async (
      _fetchInfo: unknown,
      successCallback: (events: object[]) => void,
      failureCallback: (err: Error) => void,
    ) => {
      try {
        const feedUrl = `${NEXTCLOUD_BASE}/${agenda.id}?export&_nocache=${Date.now()}`
        const res = await fetch(feedUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const icsText = await res.text()
        const comp = new Component(parse(icsText))
        const vevents = comp.getAllSubcomponents('vevent')

        // Separate masters from RECURRENCE-ID exceptions
        const masters: typeof vevents = []
        const exceptions: typeof vevents = []
        for (const v of vevents) {
          if (v.getFirstProperty('recurrence-id')) exceptions.push(v)
          else masters.push(v)
        }

        // Build a set of (uid + startDate ISO) covered by an exception
        const exceptionKeys = new Set<string>()
        for (const v of exceptions) {
          const uid = String(v.getFirstPropertyValue('uid') ?? '')
          const rid = v.getFirstProperty('recurrence-id')?.getFirstValue()
          if (rid) exceptionKeys.add(`${uid}::${rid.toJSDate().toISOString()}`)
        }

        const mapVevent = (vevent: (typeof vevents)[number], isException: boolean) => {
          const summary = vevent.getFirstPropertyValue('summary') ?? '(sans titre)'
          const uid = vevent.getFirstPropertyValue('uid') ?? ''
          const description = vevent.getFirstPropertyValue('description') ?? ''
          const location = vevent.getFirstPropertyValue('location') ?? ''
          const statusRaw = vevent.getFirstPropertyValue('status')
          const status: EventStatus =
            (statusRaw?.toUpperCase() as EventStatus | undefined) ?? 'CONFIRMED'

          // Skip cancelled exceptions (deleted occurrences)
          if (isException && status === 'CANCELLED') return null

          const dtstartProp = vevent.getFirstProperty('dtstart')
          const dtendProp = vevent.getFirstProperty('dtend')
          const startIcal = dtstartProp?.getFirstValue() ?? null
          const endIcal = dtendProp?.getFirstValue() ?? null
          const startDate = startIcal?.toJSDate() ?? null
          const endDate = endIcal?.toJSDate() ?? null
          const allDay = startIcal?.isDate ?? false

          // Skip master occurrences overridden by an exception
          if (!isException && startDate) {
            const key = `${uid}::${startDate.toISOString()}`
            if (exceptionKeys.has(key)) return null
          }

          const classNames: string[] = []
          if (status === 'TENTATIVE') classNames.push('event-tentative')
          if (status === 'CANCELLED') classNames.push('event-cancelled')

          return {
            id: uid,
            title: summary,
            start: startDate,
            end: endDate,
            allDay,
            color: agenda.color,
            classNames,
            extendedProps: { status, description, location },
          }
        }

        const events = [
          ...masters.map((v) => mapVevent(v, false)),
          ...exceptions.map((v) => mapVevent(v, true)),
        ].filter((e): e is NonNullable<ReturnType<typeof mapVevent>> & { start: Date } =>
          e !== null && e.start !== null,
        )

        successCallback(events)
      } catch (err) {
        console.error(`Erreur agenda "${agenda.name}":`, err)
        failureCallback(err as Error)
      }
    },
  }
}
