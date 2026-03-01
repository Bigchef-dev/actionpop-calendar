/**
 * Manages shareable URL state via the location hash.
 * Format: #v=timeGridWeek&d=2026-03-10&a=id1,id2&e=uid123
 *
 * v = FullCalendar view name
 * d = ISO date (YYYY-MM-DD) of the current calendar date
 * a = comma-separated list of active agenda IDs (omitted when all are active)
 * e = UID of the currently open event modal (omitted when none)
 */

export interface UrlState {
  v?: string
  d?: string
  a?: string
  e?: string
}

function getParams(): URLSearchParams {
  const hash = window.location.hash.replace(/^#/, '')
  return new URLSearchParams(hash)
}

function setParams(params: URLSearchParams): void {
  const str = params.toString()
  history.replaceState(null, '', str ? '#' + str : window.location.pathname + window.location.search)
}

export function parseHash(): UrlState {
  const params = getParams()
  const result: UrlState = {}
  if (params.has('v')) result.v = params.get('v')!
  if (params.has('d')) result.d = params.get('d')!
  if (params.has('a')) result.a = params.get('a')!
  if (params.has('e')) result.e = params.get('e')!
  return result
}

export function updateHash(patch: Partial<UrlState>): void {
  const params = getParams()
  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined || val === null || val === '') {
      params.delete(key)
    } else {
      params.set(key, val)
    }
  }
  setParams(params)
}

export function removeHashParam(key: keyof UrlState): void {
  const params = getParams()
  params.delete(key)
  setParams(params)
}
