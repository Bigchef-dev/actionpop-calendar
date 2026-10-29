import { z } from 'zod';

import {
  METADATA_FAMILIES,
  METADATA_LEVELS,
  type MetadataFamily,
  type MetadataLevel,
} from '../calendar/metadata-levels.js';
import { ConfigurationError } from '../operations/errors.js';
import {
  DEFAULT_INGESTION_MAX_NEW_GROUPS_PER_CYCLE,
  DEFAULT_INGESTION_WORKER_CONCURRENCY,
  DEFAULT_CALENDAR_ENABLED,
  DEFAULT_CALENDAR_LOOKAHEAD_DAYS,
  DEFAULT_CALENDAR_LOOKBACK_DAYS,
  DEFAULT_CALENDAR_MAX_ENTRIES,
  DEFAULT_CALENDAR_MAX_GROUPS_PER_EVENT,
  DEFAULT_CALENDAR_METADATA_LEVEL,
  DEFAULT_CALENDAR_REVALIDATION_SECONDS,
} from './defaults.config.js';

export interface EnvironmentMapping {
  readonly key: string;
  readonly variable: string;
  readonly read: (raw: string) => unknown;
}

export interface ConfigurationOrigin {
  readonly path: string | undefined;
  readonly environmentKeys: ReadonlySet<string>;
}

const calendarSchema = z
  .object({
    enabled: z.boolean().default(DEFAULT_CALENDAR_ENABLED),
    lookbackDays: z.number().int().min(0).default(DEFAULT_CALENDAR_LOOKBACK_DAYS),
    lookaheadDays: z.number().int().min(1).default(DEFAULT_CALENDAR_LOOKAHEAD_DAYS),
    maxEntries: z.number().int().min(1).default(DEFAULT_CALENDAR_MAX_ENTRIES),
    maxGroupsPerEvent: z.number().int().min(1).default(DEFAULT_CALENDAR_MAX_GROUPS_PER_EVENT),
    revalidationSeconds: z.number().int().min(0).default(DEFAULT_CALENDAR_REVALIDATION_SECONDS),
    metadataLevel: z.enum(METADATA_LEVELS).default(DEFAULT_CALENDAR_METADATA_LEVEL),
    disabledFamilies: z.array(z.enum(METADATA_FAMILIES)).default([]),
  })
  .strict();

const appSchema = z
  .object({
    environment: z.enum(['development', 'production', 'test']).optional(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    timezone: z.string().trim().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
  })
  .strict();

const ingestionSchema = z
  .object({
    maxNewGroupsPerCycle: z
      .number()
      .int()
      .min(1)
      .default(DEFAULT_INGESTION_MAX_NEW_GROUPS_PER_CYCLE),
    workerConcurrency: z
      .number()
      .int()
      .min(1)
      .default(DEFAULT_INGESTION_WORKER_CONCURRENCY),
  })
  .strict();

const queueSchema = z
  .object({
    attempts: z.number().int().min(1).optional(),
    backoffMs: z.number().int().min(1).optional(),
    dispatcherIntervalMs: z.number().int().min(1).optional(),
  })
  .strict();

const documentSchema = z
  .object({
    app: appSchema.optional(),
    calendar: calendarSchema.optional(),
    queue: queueSchema.optional(),
    ingestion: ingestionSchema.optional(),
  })
  .strict();

export interface ParsedConfigurationDocument {
  readonly app: {
    readonly environment?: string | undefined;
    readonly logLevel?: string | undefined;
    readonly timezone?: string | undefined;
    readonly port?: number | undefined;
  };
  readonly calendar: {
    readonly enabled: boolean;
    readonly lookbackDays: number;
    readonly lookaheadDays: number;
    readonly maxEntries: number;
    readonly maxGroupsPerEvent: number;
    readonly revalidationSeconds: number;
    readonly metadataLevel: MetadataLevel;
    readonly disabledFamilies: readonly MetadataFamily[];
  };
  readonly queue: {
    readonly attempts?: number | undefined;
    readonly backoffMs?: number | undefined;
    readonly dispatcherIntervalMs?: number | undefined;
  };
  readonly ingestion: {
    readonly maxNewGroupsPerCycle: number;
    readonly workerConcurrency: number;
  };
}

export function parseConfigurationDocument(
  document: Record<string, unknown>,
  origin: ConfigurationOrigin,
  variableFor: (key: string) => string | undefined,
): ParsedConfigurationDocument {
  const result = documentSchema.safeParse(document);
  if (!result.success) {
    throw new ConfigurationError(describeIssue(result.error, origin, variableFor));
  }
  return {
    app: result.data.app ?? {},
    calendar: result.data.calendar ?? calendarSchema.parse({}),
    queue: result.data.queue ?? {},
    ingestion: result.data.ingestion ?? ingestionSchema.parse({}),
  };
}

/**
 * A list item reports a path such as `calendar.disabledFamilies.0`, so the origin
 * matches the environment key that produced the enclosing value.
 */
function matchingEnvironmentKey(
  path: string,
  environmentKeys: ReadonlySet<string>,
): string | undefined {
  return [...environmentKeys].find(
    (key) => path === key || path.startsWith(`${key}.`) || key.startsWith(`${path}.`),
  );
}

function describeIssue(
  error: z.ZodError,
  origin: ConfigurationOrigin,
  variableFor: (key: string) => string | undefined,
): string {
  const issue = error.issues[0];
  if (issue === undefined) return 'configuration is invalid';
  const path = issue.path.join('.');
  const environmentKey = matchingEnvironmentKey(path, origin.environmentKeys);
  const where =
    environmentKey === undefined
      ? `configuration file ${origin.path ?? '(defaults)'}`
      : `environment variable ${variableFor(environmentKey) ?? environmentKey}`;
  return `${path || 'configuration'} is invalid (from ${where}): ${issue.message}`;
}
