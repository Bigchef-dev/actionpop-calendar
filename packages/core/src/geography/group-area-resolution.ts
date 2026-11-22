import type { CalendarFilterDiagnostic } from '../calendar-filters/calendar-filter-parameters.js';
import type { GroupAreaCriteria } from '../models/group-listing.js';
import type { ParsedGroupArea } from './group-area-filter.js';

/**
 * Turns a parsed area into the criteria the reader applies.
 *
 * Commune names and EPCI identifiers only ever add INSEE codes to the one commune dimension, so a
 * group matches a territory exactly the way an event does.
 */
export interface ResolvedAreaCodes {
  readonly inseeCodes: readonly string[];
  readonly diagnostics: readonly CalendarFilterDiagnostic[];
}

/**
 * Same shape as the calendar resolver, so one implementation (`CommuneNameResolver`) serves both
 * reads and a group and an event can never disagree about what a commune name means.
 */
export interface GroupAreaResolver {
  resolve(names: readonly string[], department: string | undefined): Promise<ResolvedAreaCodes>;
  resolveEpcis?(ids: readonly string[]): Promise<ResolvedAreaCodes>;
}

export type GroupAreaResolution =
  | { readonly ok: true; readonly criteria: GroupAreaCriteria }
  | { readonly ok: false; readonly diagnostics: readonly CalendarFilterDiagnostic[] };

/**
 * Turns a parsed area into the criteria the reader applies. Commune names and EPCI identifiers
 * only ever add INSEE codes to the one commune dimension, so a group matches a territory the same
 * way an event does.
 */
export async function resolveGroupArea(
  parsed: ParsedGroupArea,
  referenceVersion: string,
  resolver: GroupAreaResolver,
): Promise<GroupAreaResolution> {
  const collected: string[] = [...(parsed.communeIds ?? [])];

  if (parsed.epciIds !== undefined && parsed.epciIds.length > 0) {
    if (resolver.resolveEpcis === undefined) {
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
    const epci = await resolver.resolveEpcis(parsed.epciIds);
    if (epci.diagnostics.length > 0) return { ok: false, diagnostics: epci.diagnostics };
    collected.push(...epci.inseeCodes);
  }

  if (parsed.communeNames !== undefined && parsed.communeNames.length > 0) {
    const names = await resolver.resolve(parsed.communeNames, parsed.department);
    if (names.diagnostics.length > 0) return { ok: false, diagnostics: names.diagnostics };
    collected.push(...names.inseeCodes);
  }

  const communeIds = [...new Set(collected)].sort();
  const criteria: GroupAreaCriteria = {
    ...(parsed.country === undefined ? {} : { country: parsed.country }),
    ...(parsed.department === undefined ? {} : { department: parsed.department }),
    ...(communeIds.length === 0 ? {} : { communeIds }),
    referenceVersion,
  };
  return { ok: true, criteria };
}
