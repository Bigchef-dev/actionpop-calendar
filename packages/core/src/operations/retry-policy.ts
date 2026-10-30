import {
  ConfigurationError,
  EventIdentityMismatchError,
  HttpError,
  NetworkError,
  PayloadValidationError,
  PermanentAuthenticationError,
  TemporaryRedisError,
  TimeoutError,
} from './errors.js';

export type RetryReason =
  | 'network'
  | 'timeout'
  | 'rate_limit'
  | 'upstream_server'
  | 'redis_temporary'
  | 'permanent'
  | 'other';

export interface RetryDecision {
  retryable: boolean;
  reason: RetryReason;
}

export function classifyRetry(error: unknown): RetryDecision {
  if (error instanceof TimeoutError) return { retryable: true, reason: 'timeout' };
  if (error instanceof NetworkError) return { retryable: true, reason: 'network' };
  if (error instanceof TemporaryRedisError) return { retryable: true, reason: 'redis_temporary' };
  if (error instanceof HttpError) {
    if (error.status === 429) return { retryable: true, reason: 'rate_limit' };
    if (error.status >= 500) return { retryable: true, reason: 'upstream_server' };
  }
  // A document describing another event is an upstream inconsistency, not a payload the
  // calendar can act on: it must stay retryable so a refresh is never stalled for good.
  if (error instanceof EventIdentityMismatchError) return { retryable: true, reason: 'other' };
  if (error instanceof PayloadValidationError) return { retryable: false, reason: 'permanent' };
  if (error instanceof ConfigurationError) return { retryable: false, reason: 'permanent' };
  if (error instanceof PermanentAuthenticationError)
    return { retryable: false, reason: 'permanent' };
  return { retryable: false, reason: 'permanent' };
}
