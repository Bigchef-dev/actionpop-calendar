import { reactive } from 'vue';

import type { CalendarLayout } from '../../types';

export const LAYOUTS: readonly CalendarLayout[] = ['mois', 'semaine', 'jour', 'liste'];

export interface RouteState {
  subject: { kind: string; id: string } | null;
  types: string[];
  group: string[];
  layout: CalendarLayout;
  eventId: string | null;
  /** Human-readable reports of the values that could not be used as written. */
  notices: string[];
}

/** Callers that never touch the group filter may omit it; it then stays absent from the address. */
export type RouteStateInput = Omit<RouteState, 'notices' | 'group'> & {
  group?: readonly string[];
};

export interface ParseOptions {
  /** Layout applied when none is valid; the caller decides from the viewport width. */
  defaultLayout: CalendarLayout;
  /** Known action-type slugs; when provided, an unknown slug is reported and dropped. */
  knownTypes?: readonly string[];
}

export function parseLayout(value: string | null): CalendarLayout | null {
  return LAYOUTS.find((layout) => layout === value) ?? null;
}

export function parseSubjectKey(value: string | null): { kind: string; id: string } | null {
  if (value === null) return null;
  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) return null;
  const kind = value.slice(0, separator).trim();
  const id = value.slice(separator + 1).trim();
  if (kind === '' || id === '' || id.includes(':')) return null;
  return { kind, id };
}

export function subjectKey(subject: { kind: string; id: string } | null): string | null {
  return subject === null ? null : `${subject.kind}:${subject.id}`;
}

/** Reads an address without ever throwing: every unusable value falls back and is reported. */
export function parseRoute(search: string, options: ParseOptions): RouteState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const notices: string[] = [];

  const rawSubject = params.get('sujet');
  const subject = parseSubjectKey(rawSubject);
  if (rawSubject !== null && subject === null) {
    notices.push(`Sujet « ${rawSubject} » illisible : recherche nécessaire.`);
  }

  const rawTypes = params.get('types');
  const types: string[] = [];
  if (rawTypes !== null) {
    for (const slug of rawTypes.split(',').map((value) => value.trim())) {
      if (slug === '') continue;
      if (options.knownTypes !== undefined && !options.knownTypes.includes(slug)) {
        notices.push(`Type d'action « ${slug} » inconnu : filtre ignoré.`);
        continue;
      }
      if (!types.includes(slug)) types.push(slug);
    }
  }

  const rawLayout = params.get('vue');
  const layout = parseLayout(rawLayout);
  if (rawLayout !== null && layout === null) {
    notices.push(`Vue « ${rawLayout} » inconnue : affichage par défaut.`);
  }

  const rawEvent = params.get('evenement');
  const rawGroup = params.get('ga');
  const group: string[] = [];
  if (rawGroup !== null) {
    for (const id of rawGroup.split(',').map((value) => value.trim())) {
      if (id !== '' && !group.includes(id)) group.push(id);
    }
  }

  return {
    subject,
    types,
    group,
    layout: layout ?? options.defaultLayout,
    eventId: rawEvent === null || rawEvent.trim() === '' ? null : rawEvent.trim(),
    notices,
  };
}

/** Serializes a route, omitting values that equal the defaults so the address stays short. */
export function serializeRoute(state: RouteStateInput, defaultLayout: CalendarLayout): string {
  const params = new URLSearchParams();
  const key = subjectKey(state.subject);
  if (key !== null) params.set('sujet', key);
  if (state.types.length > 0) params.set('types', [...state.types].sort().join(','));
  if (state.group !== undefined && state.group.length > 0) {
    params.set('ga', [...new Set(state.group)].sort().join(','));
  }
  if (state.layout !== defaultLayout) params.set('vue', state.layout);
  if (state.eventId !== null) params.set('evenement', state.eventId);
  const serialized = params.toString();
  return serialized === '' ? '' : `?${serialized}`;
}

export function replaceRoute(search: string): void {
  if (typeof window === 'undefined') return;
  const { pathname, hash } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}${hash}`);
}

/** Reactive route shared by every component of the experience. */
const route = reactive<{ search: string }>({
  search: typeof window === 'undefined' ? '' : window.location.search,
});

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    route.search = window.location.search;
  });
}

export function useRoute(): {
  readonly state: { search: string };
  write: (search: string) => void;
} {
  return {
    state: route,
    write(search: string): void {
      replaceRoute(search);
      route.search = search;
    },
  };
}

/** Layout used when the address does not state one: day on a narrow screen, month otherwise. */
export function defaultLayoutFor(width: number): CalendarLayout {
  return width < 768 ? 'jour' : 'mois';
}
