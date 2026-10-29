import type { CalendarEvent } from '../calendar-filters/calendar-event.js';
import {
  isMetadataFamilyEmitted,
  type MetadataFamily,
  type MetadataLevel,
} from './metadata-levels.js';
import { escapeText, formatContentLine, formatUtcInstant } from './ical-writer.js';

export const METADATA_PREFIX = 'X-ACTIONPOP-';

export interface MetadataSettings {
  readonly level: MetadataLevel;
  readonly disabledFamilies: readonly MetadataFamily[];
  readonly maxGroupsPerEvent: number;
}

export interface MetadataEmission {
  readonly lines: readonly string[];
  readonly groupsTruncated: boolean;
}

/** Declarative contract of every experimental property. */
export const METADATA_PROPERTIES: ReadonlyArray<{
  readonly name: string;
  readonly family: MetadataFamily;
}> = [
  { name: 'EVENT-ID', family: 'identity' },
  { name: 'UPDATED-AT', family: 'identity' },
  { name: 'PERIOD', family: 'identity' },
  { name: 'EVENT-TYPE', family: 'classification' },
  { name: 'SOURCE-URL', family: 'provenance' },
  { name: 'GROUP', family: 'provenance' },
  { name: 'GEO-STATUS', family: 'geography' },
  { name: 'COUNTRY', family: 'geography' },
  { name: 'DEPARTMENT', family: 'geography' },
  { name: 'INSEE-COMMUNE', family: 'geography' },
  { name: 'GEO-REFERENCE', family: 'geography' },
  { name: 'GEO-DIAGNOSTIC-COUNT', family: 'diagnostics' },
  { name: 'GEO-DIAGNOSTIC', family: 'diagnostics' },
  { name: 'RAW-DEPARTMENT', family: 'raw_source' },
  { name: 'RAW-COMMUNE', family: 'raw_source' },
];

export function buildMetadataLines(
  event: CalendarEvent,
  settings: MetadataSettings,
): MetadataEmission {
  const lines: string[] = [];
  let groupsTruncated = false;

  const push = (property: string, family: MetadataFamily, value: string | null): void => {
    if (value === null || value === '') return;
    if (!isMetadataFamilyEmitted(settings.level, family, settings.disabledFamilies)) return;
    lines.push(
      formatContentLine({ name: `${METADATA_PREFIX}${property}`, value: escapeText(value) }),
    );
  };

  push('EVENT-ID', 'identity', event.sourceEventId);
  push('UPDATED-AT', 'identity', formatUtcInstant(event.updatedAt));
  push('PERIOD', 'identity', event.lastSeenPeriod);
  push('EVENT-TYPE', 'classification', event.eventType);
  push('SOURCE-URL', 'provenance', event.sourceUrl);

  if (isMetadataFamilyEmitted(settings.level, 'provenance', settings.disabledFamilies)) {
    const retained = event.groupIds.slice(0, settings.maxGroupsPerEvent);
    groupsTruncated = event.groupIds.length > retained.length;
    for (const groupId of retained) push('GROUP', 'provenance', groupId);
  }

  const geography = event.geography;
  if (geography !== null) {
    push('GEO-STATUS', 'geography', geography.status);
    push('COUNTRY', 'geography', geography.countryCode);
    push('DEPARTMENT', 'geography', geography.departmentCode);
    push('INSEE-COMMUNE', 'geography', geography.communeId);
    push('GEO-REFERENCE', 'geography', geography.referenceVersion);
    push('GEO-DIAGNOSTIC-COUNT', 'diagnostics', String(geography.diagnostics.length));
    push('RAW-DEPARTMENT', 'raw_source', geography.rawDepartmentCode);
    push('RAW-COMMUNE', 'raw_source', geography.rawCommuneName);

    if (isMetadataFamilyEmitted(settings.level, 'diagnostics', settings.disabledFamilies)) {
      const ordered = [...geography.diagnostics].sort(
        (a, b) => a.code.localeCompare(b.code) || a.field.localeCompare(b.field),
      );
      for (const diagnostic of ordered) {
        lines.push(
          formatContentLine({
            name: `${METADATA_PREFIX}GEO-DIAGNOSTIC`,
            parameters: {
              code: diagnostic.code,
              field: diagnostic.field,
              severity: diagnostic.severity,
            },
            value: escapeText(diagnostic.message),
          }),
        );
      }
    }
  }

  return { lines, groupsTruncated };
}
