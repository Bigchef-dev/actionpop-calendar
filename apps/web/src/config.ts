interface WebEnvironment {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_POLL_BACKEND_URL?: string;
  readonly VITE_REVIEW_PROPOSALS?: string;
}

const env: WebEnvironment = (import.meta as unknown as { env: WebEnvironment }).env ?? {};

/**
 * Origin of the ActionPop Calendar API.
 *
 * Empty by default so the published site calls its own origin: the edge routes the calendar
 * paths to the API, which removes cross-origin rules from the security surface. The GitHub Pages
 * fallback sets an absolute value because it has no such edge.
 */
export const API_BASE_URL: string = (env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/**
 * Absolute origin of the API, for URLs a visitor copies into an agenda application: a relative
 * `.ics` path would be meaningless outside the browser.
 */
export function apiOrigin(): string {
  if (API_BASE_URL !== '') return API_BASE_URL;
  return typeof window === 'undefined' ? '' : window.location.origin;
}

export function absoluteApiUrl(path: string): string {
  return `${apiOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

export const POLL_BACKEND_URL: string = env.VITE_POLL_BACKEND_URL ?? 'https://poll.lfirennes.fun';

/** Review-only flag used to expose the interface proposals; never enabled in production builds. */
export const REVIEW_PROPOSALS: boolean = env.VITE_REVIEW_PROPOSALS === 'true';

/** Duration of the rotating placeholder examples, in milliseconds. */
export const PLACEHOLDER_TIMING = {
  typeMs: 55,
  holdMs: 1500,
  eraseMs: 25,
  betweenMs: 600,
  minExamples: 3,
} as const;
