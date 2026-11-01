interface WebEnvironment {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_POLL_BACKEND_URL?: string;
  readonly VITE_REVIEW_PROPOSALS?: string;
}

const env: WebEnvironment = (import.meta as unknown as { env: WebEnvironment }).env ?? {};

/** Origin of the ActionPop Calendar API. */
export const API_BASE_URL: string = env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

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
