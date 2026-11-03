import type { CalendarEventCriteria } from './calendar-event.js';
import type { CalendarFilterCriteria } from './calendar-filter.js';
import type { CalendarFilterDiagnostic } from './calendar-filter-parameters.js';

export interface CommuneNameResolution {
  readonly inseeCodes: readonly string[];
  readonly diagnostics: readonly CalendarFilterDiagnostic[];
}

export interface CalendarCommuneResolver {
  resolve(names: readonly string[], department: string | undefined): Promise<CommuneNameResolution>;
  resolveEpcis?(ids: readonly string[]): Promise<CommuneNameResolution>;
}

export type CriteriaResolution =
  | { readonly ok: true; readonly criteria: CalendarEventCriteria }
  | { readonly ok: false; readonly diagnostics: readonly CalendarFilterDiagnostic[] };

/**
 * Merges `commune_name` and `insee_commune` into one commune dimension: names
 * are resolved to INSEE codes and unioned with the explicit codes, so an event
 * matches when it belongs to any selected commune. Every other criterion is
 * forwarded unchanged and combines with AND at query time.
 */
export async function resolveCalendarCriteria(
  parsed: CalendarFilterCriteria,
  resolver: CalendarCommuneResolver | undefined,
): Promise<CriteriaResolution> {
  const names = parsed.communeNames ?? [];
  const explicitCodes = parsed.communeIds ?? [];
  const epciIds = parsed.epciIds ?? [];

  let resolvedCodes: readonly string[] = [];
  if (epciIds.length > 0) {
    if (resolver?.resolveEpcis === undefined) {
      return {
        ok: false,
        diagnostics: [
          {
            code: 'epci_unavailable',
            field: 'epci',
            message: 'epci cannot be resolved without an active EPCI reference',
            severity: 'error',
          },
        ],
      };
    }
    const epciResolution = await resolver.resolveEpcis(epciIds);
    if (epciResolution.diagnostics.length > 0) {
      return { ok: false, diagnostics: epciResolution.diagnostics };
    }
    if (epciResolution.inseeCodes.length === 0) {
      return {
        ok: false,
        diagnostics: [
          {
            code: 'epci_membership_incomplete',
            field: 'epci',
            message: 'epci has no usable commune membership',
            severity: 'error',
          },
        ],
      };
    }
    resolvedCodes = epciResolution.inseeCodes;
  }
  if (names.length > 0) {
    if (resolver === undefined) {
      return {
        ok: false,
        diagnostics: [
          {
            code: 'commune_name_unavailable',
            field: 'commune_name',
            message: 'commune_name cannot be resolved without an active geographic reference',
            severity: 'error',
          },
        ],
      };
    }
    const resolution = await resolver.resolve(names, parsed.department);
    if (resolution.diagnostics.length > 0) {
      return { ok: false, diagnostics: resolution.diagnostics };
    }
    resolvedCodes = [...resolvedCodes, ...resolution.inseeCodes];
  }

  const communeIds = [...new Set([...resolvedCodes, ...explicitCodes])].sort();

  return {
    ok: true,
    criteria: {
      ...(parsed.country === undefined ? {} : { country: parsed.country }),
      ...(parsed.department === undefined ? {} : { department: parsed.department }),
      ...(communeIds.length === 0 ? {} : { communeIds }),
      ...(parsed.eventTypes === undefined ? {} : { eventTypes: parsed.eventTypes }),
      ...(parsed.groupIds === undefined ? {} : { groupIds: parsed.groupIds }),
      ...(parsed.epciIds === undefined ? {} : { epciIds: parsed.epciIds }),
    },
  };
}
