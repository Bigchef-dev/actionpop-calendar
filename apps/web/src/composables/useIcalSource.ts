import { parse, Component } from 'ical.js'
import type { AgendaConfig, ModalEvent } from '../types'
import { NEXTCLOUD_BASE, PROXY_BASE, PROXY_KEY } from '../config'

type EventStatus = ModalEvent['extendedProps']['status']

export function buildEventSource(agenda: AgendaConfig) {
  const feedUrl = `${NEXTCLOUD_BASE}/${agenda.id}?export&_nocache=${Date.now()}`
  const proxiedUrl = `${PROXY_BASE}/?key=${PROXY_KEY}&url=${encodeURIComponent(feedUrl)}`

  return {
    id: agenda.id,
    color: agenda.color,
    events: async (
      _fetchInfo: unknown,
      successCallback: (events: object[]) => void,
      failureCallback: (err: Error) => void,
    ) => {
      try {
        const res = await fetch(proxiedUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const icsText = await res.text()
        const comp = new Component(parse(icsText))
        const vevents = comp.getAllSubcomponents('vevent')

        const events = vevents
          .map((vevent) => {
            const summary = vevent.getFirstPropertyValue('summary') ?? '(sans titre)'
            const uid = vevent.getFirstPropertyValue('uid') ?? ''
            const description = vevent.getFirstPropertyValue('description') ?? ''
            const location = vevent.getFirstPropertyValue('location') ?? ''
            const statusRaw = vevent.getFirstPropertyValue('status')
            const status: EventStatus =
              (statusRaw?.toUpperCase() as EventStatus | undefined) ?? 'CONFIRMED'

            const dtstartProp = vevent.getFirstProperty('dtstart')
            const dtendProp = vevent.getFirstProperty('dtend')
            const startIcal = dtstartProp?.getFirstValue() ?? null
            const endIcal = dtendProp?.getFirstValue() ?? null
            const startDate = startIcal?.toJSDate() ?? null
            const endDate = endIcal?.toJSDate() ?? null
            const allDay = startIcal?.isDate ?? false

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
          })
          .filter((e) => e.start !== null)

        successCallback(events)
      } catch (err) {
        console.error(`Erreur agenda "${agenda.name}":`, err)
        failureCallback(err as Error)
      }
    },
  }
}
