import { API_BASE_URL } from '../../../config';
import type { CalendarLink, SearchSubject } from '../../../types';

export interface LinkOptions {
  /** Whether the displayed type filter is part of the link. */
  keepFilters: boolean;
  types: readonly string[];
  period?: { from: Date; to: Date } | null;
}

function toDateLabel(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Builds the personal link offer for a subject. Returns `null` when the subject carries no
 * filter parameter, so the panel never shows a link the feed would answer with everything.
 */
export function buildCalendarLink(
  subject: SearchSubject,
  options: LinkOptions,
): CalendarLink | null {
  const baseParams = subject.calendar.params;
  if (Object.keys(baseParams).length === 0) return null;

  const params = new URLSearchParams(baseParams);
  const keptTypes = options.keepFilters ? [...options.types].sort() : [];
  if (keptTypes.length > 0) params.set('event_type', keptTypes.join(','));

  const path = subject.calendar.path.startsWith('/')
    ? subject.calendar.path
    : `/${subject.calendar.path}`;
  const subscriptionUrl = `${API_BASE_URL}${path}?${params.toString()}`;

  const filterStatement =
    keptTypes.length === 0 ? 'toutes les actions' : `les actions de type ${keptTypes.join(', ')}`;
  const from =
    options.period === undefined || options.period === null
      ? null
      : toDateLabel(options.period.from);
  const to =
    options.period === undefined || options.period === null ? null : toDateLabel(options.period.to);
  const periodStatement =
    from === null || to === null
      ? 'sur la période publiée'
      : from === to
        ? `le ${from}`
        : `du ${from} au ${to}`;

  return {
    subscriptionUrl,
    webcalUrl: subscriptionUrl.replace(/^https?:\/\//, 'webcal://'),
    downloadUrl: subscriptionUrl,
    calendarServiceUrl: `https://outlook.live.com/calendar/0/addfromweb/?url=${encodeURIComponent(subscriptionUrl)}&name=${encodeURIComponent(subject.label)}`,
    keepsFilters: keptTypes.length > 0,
    description: `${subject.label} · ${filterStatement} · ${periodStatement}`,
  };
}
