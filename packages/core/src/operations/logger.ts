export type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  jobId?: string;
  scopeId?: string;
  period?: string;
  operation?: string;
  outcome?: string;
  durationMs?: number;
  failure?: string;
  [key: string]: unknown;
}

export interface LoggerOptions {
  service: string;
  environment: string;
  sink?: (line: string) => void;
}

const sensitiveKeys = new Set(['authorization', 'password', 'redisUrl', 'secret', 'token', 'upstreamToken']);

function sanitize(context: LogContext): Record<string, unknown> {
  const sanitizedContext: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (!sensitiveKeys.has(key)) sanitizedContext[key] = value;
  }

  return sanitizedContext;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export function createLogger({ service, environment, sink = console.log }: LoggerOptions): Logger {
  const write = (level: LogLevel, message: string, context: LogContext): void => {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service,
      environment,
      message,
      ...sanitize(context),
    };

    sink(JSON.stringify(record));
  };
  return {
    info: (message, context = {}) => write('info', message, context),
    warn: (message, context = {}) => write('warn', message, context),
    error: (message, context = {}) => write('error', message, context),
  };
}