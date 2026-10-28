import { ConfigurationError } from '../operations/errors.js';

export function normalizeScopeToken(scopeId: string): string {
  const token = scopeId
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!token) throw new ConfigurationError('scope identifier cannot be empty');
  return token;
}

export function normalizePeriodToken(periodStartUtc: Date): string {
  if (Number.isNaN(periodStartUtc.getTime()))
    throw new ConfigurationError('period date is invalid');
  return periodStartUtc
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * Accepts both representations the worker produces: the compact token written in job IDs
 * (`20261028T201500Z`) and the ISO form carried in job data (`2026-10-28T20:15:00.000Z`).
 */
export function parsePeriodToken(token: string): Date {
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(token.trim());
  if (compact !== null) {
    const [, year, month, day, hour, minute, second] = compact;
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
    );
  }

  const parsed = new Date(token);
  if (Number.isNaN(parsed.getTime())) {
    throw new ConfigurationError(`period token "${token}" is invalid`);
  }
  return parsed;
}

export function buildIngestionJobId(scopeId: string, periodStartUtc: Date): string {
  return `ingest-v1_scope-${normalizeScopeToken(scopeId)}_period-${normalizePeriodToken(periodStartUtc)}`;
}
