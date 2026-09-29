import { ConfigurationError } from '../operations/errors.js';
import { normalizePeriodToken } from './job-identity.js';
import type { ProcessingPeriod } from './types.js';

const parisFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  calendar: 'iso8601',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'longOffset',
});

function parisIso(date: Date): string {
  const parts: Record<string, string> = {};
  const formattedParts = parisFormatter.formatToParts(date);

  for (const part of formattedParts) {
    parts[part.type] = part.value;
  }

  const timezoneName = parts.timeZoneName ?? 'GMT+00:00';
  const offset = timezoneName.replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

export function calculateProcessingPeriod(
  instant: Date,
  intervalMs = 15 * 60 * 1000,
): ProcessingPeriod {
  if (Number.isNaN(instant.getTime()) || !Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new ConfigurationError('processing period input is invalid');
  }
  const startMs = Math.floor(instant.getTime() / intervalMs) * intervalMs;
  const periodStartUtc = new Date(startMs);
  const periodEndUtc = new Date(startMs + intervalMs);
  return {
    periodStartUtc,
    periodEndUtc,
    periodStartEuropeParis: parisIso(periodStartUtc),
    periodEndEuropeParis: parisIso(periodEndUtc),
    periodToken: normalizePeriodToken(periodStartUtc),
  };
}