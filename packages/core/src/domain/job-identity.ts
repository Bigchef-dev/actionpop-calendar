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
  if (Number.isNaN(periodStartUtc.getTime())) throw new ConfigurationError('period date is invalid');
  return periodStartUtc.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildIngestionJobId(scopeId: string, periodStartUtc: Date): string {
  return `ingest-v1_scope-${normalizeScopeToken(scopeId)}_period-${normalizePeriodToken(periodStartUtc)}`;
}