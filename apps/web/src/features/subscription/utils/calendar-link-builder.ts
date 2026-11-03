import { absoluteApiUrl } from '../../../config';
import type { CalendarLink, SearchSubject } from '../../../types';

export interface LinkOptions {
  types: readonly string[];
  groups?: readonly string[];
  scope?: 'display' | 'city-only';
  city?: SearchSubject;
  keepFilters?: boolean;
  period?: { from: Date; to: Date } | null;
}

function mergeParams(subjects: readonly SearchSubject[], types: readonly string[], groups: readonly string[]) {
  const values = new Map<string, Set<string>>();
  for (const subject of subjects) {
    for (const [key, value] of Object.entries(subject.calendar.params)) {
      const current = values.get(key) ?? new Set<string>();
      for (const item of value.split(',').map((part) => part.trim()).filter(Boolean)) current.add(item);
      values.set(key, current);
    }
  }
  if (groups.length > 0) values.set('group', new Set(groups));
  if (types.length > 0) values.set('event_type', new Set(types));
  return new URLSearchParams(
    [...values.entries()].map(([key, entries]) => [key, [...entries].sort().join(',')]),
  );
}

export function buildCalendarLink(
  input: readonly SearchSubject[] | SearchSubject,
  options: LinkOptions,
): CalendarLink | null {
  const subjects = Array.isArray(input) ? input : [input];
  const types = options.keepFilters === false ? [] : options.types;
  const selected =
    options.scope === 'city-only'
      ? options.city === undefined
        ? []
        : [options.city]
      : subjects;
  if (selected.length === 0) return null;
  const params = mergeParams(selected, types, options.groups ?? []);
  if ([...params.keys()].length === 0) return null;
  const path = selected[0].calendar.path.startsWith('/')
    ? selected[0].calendar.path
    : `/${selected[0].calendar.path}`;
  const subscriptionUrl = `${absoluteApiUrl(path)}?${params.toString()}`;
  const labels = selected.map((subject) => subject.label).join(' + ');
  const suffix = options.scope === 'city-only' ? ' (ville uniquement)' : '';
  return {
    subscriptionUrl,
    webcalUrl: subscriptionUrl.replace(/^https?:\/\//, 'webcal://'),
    downloadUrl: subscriptionUrl,
    calendarServiceUrl: `https://outlook.live.com/calendar/0/addfromweb/?url=${encodeURIComponent(subscriptionUrl)}&name=${encodeURIComponent(labels)}`,
    description: `${labels}${suffix} · ${types.length > 0 ? `types ${types.join(', ')}` : 'toutes les actions'}`,
    scope: options.scope ?? 'display',
    keepsFilters: types.length > 0,
  };
}
