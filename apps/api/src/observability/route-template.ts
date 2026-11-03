/** Bounded route labels. A raw URL would carry query strings, so it can never be a label value. */
export const ROUTE_TEMPLATES = [
  '/calendar.ics',
  '/events',
  '/search/subjects',
  '/feed/:scopeId',
  '/telemetry/journey',
  '/internal/live',
  '/internal/ready',
  '/internal/metrics',
  '/openapi.json',
  '/other',
] as const;

export type RouteTemplate = (typeof ROUTE_TEMPLATES)[number];

export const HTTP_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'other',
] as const;

export type HttpMethodLabel = (typeof HTTP_METHODS)[number];

const EXACT_ROUTES: Readonly<Record<string, RouteTemplate>> = {
  '/calendar.ics': '/calendar.ics',
  '/events': '/events',
  '/search/subjects': '/search/subjects',
  '/telemetry/journey': '/telemetry/journey',
  '/internal/live': '/internal/live',
  '/internal/ready': '/internal/ready',
  '/internal/metrics': '/internal/metrics',
  '/openapi.json': '/openapi.json',
};

/** Drops the query string and the fragment before anything is matched or recorded. */
export function requestPath(url: string): string {
  const withoutFragment = url.split('#')[0] ?? '';
  const withoutQuery = withoutFragment.split('?')[0] ?? '';
  return withoutQuery === '' ? '/' : withoutQuery;
}

export function routeTemplate(url: string): RouteTemplate {
  const path = requestPath(url);
  const exact = EXACT_ROUTES[path];
  if (exact !== undefined) return exact;
  if (/^\/feed\/[^/]+\/?$/.test(path)) return '/feed/:scopeId';
  return '/other';
}

export function methodLabel(method: string | undefined): HttpMethodLabel {
  const upper = (method ?? '').toUpperCase();
  return (HTTP_METHODS as readonly string[]).includes(upper)
    ? (upper as HttpMethodLabel)
    : 'other';
}

export function statusClass(statusCode: number): string {
  const group = Math.floor(statusCode / 100);
  return group >= 1 && group <= 5 ? `${group}xx` : '5xx';
}
