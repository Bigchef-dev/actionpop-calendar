export class ConfigurationError extends Error {
  readonly code = 'CONFIGURATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class PayloadValidationError extends Error {
  readonly code = 'PAYLOAD_VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'PayloadValidationError';
  }
}

export class NetworkError extends Error {
  readonly code: string = 'NETWORK_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends NetworkError {
  override readonly code = 'TIMEOUT';
}

export class HttpError extends Error {
  readonly code = 'HTTP_ERROR';

  constructor(
    readonly status: number,
    message = `Upstream HTTP ${status}`,
    /** Delay the server asked for before retrying, when it stated one. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * The source answered that a group does not exist. Distinct from any other failure
 * so only a definitive answer can stop a retrieval.
 */
export class UnknownGroupError extends Error {
  readonly code = 'UNKNOWN_GROUP';

  constructor(readonly scopeId: string, message = `unknown group ${scopeId}`) {
    super(message);
    this.name = 'UnknownGroupError';
  }
}

export class TemporaryRedisError extends Error {
  readonly code = 'TEMPORARY_REDIS_ERROR';
}

export class PermanentAuthenticationError extends Error {
  readonly code = 'PERMANENT_AUTHENTICATION_ERROR';
}