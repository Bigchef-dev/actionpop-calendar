import type {
  CalendarEventCriteria,
  CalendarQueryResult,
  CalendarWindow,
} from '../calendar-filters/calendar-event.js';
import {
  resolveCalendarCriteria,
  type CalendarCommuneResolver,
} from '../calendar-filters/calendar-criteria.js';
import {
  parseCalendarFilter,
  type CalendarFilterDiagnostic,
} from '../calendar-filters/calendar-filter.js';
import { computeCalendarWindow } from '../calendar-filters/calendar-window.js';
import { buildFilteredCalendarDocument } from './filtered-ical.js';
import type { MetadataSettings } from './ical-metadata.js';

export type { CalendarCommuneResolver } from '../calendar-filters/calendar-criteria.js';

export interface CalendarQueryReader {
  listCalendarEvents(
    criteria: CalendarEventCriteria,
    window: CalendarWindow,
    limit: number,
  ): Promise<CalendarQueryResult>;
}

export interface FilteredCalendarSettings {
  readonly lookbackDays: number;
  readonly lookaheadDays: number;
  readonly maxEntries: number;
  readonly metadata?: MetadataSettings;
}

export interface CalendarBuildOptions {
  readonly requestInstant?: Date;
  readonly now?: () => Date;
}

export type CalendarBuildResult =
  | {
      readonly ok: true;
      readonly body: string;
      readonly truncated: boolean;
      readonly groupsTruncated: boolean;
      readonly criteria: CalendarEventCriteria;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CalendarFilterDiagnostic[];
    };

export interface FilteredCalendarReader {
  build(
    query: Record<string, string | undefined>,
    options?: CalendarBuildOptions,
  ): Promise<CalendarBuildResult>;
}

/**
 * Composes the read path: parse the criteria, resolve commune names, compute the
 * window, query and assemble the document. Free of transport concerns so it can
 * be exercised without an HTTP server.
 */
export class FilteredCalendarService implements FilteredCalendarReader {
  public constructor(
    private readonly query: CalendarQueryReader,
    private readonly settings: FilteredCalendarSettings,
    private readonly communeResolver?: CalendarCommuneResolver,
  ) {}

  public async build(
    query: Record<string, string | undefined>,
    options: CalendarBuildOptions = {},
  ): Promise<CalendarBuildResult> {
    const parsed = parseCalendarFilter(query);
    if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics };

    const criteria = await resolveCalendarCriteria(parsed.criteria, this.communeResolver);
    if (!criteria.ok) return { ok: false, diagnostics: criteria.diagnostics };

    const now = options.now ?? (() => new Date());
    const requestInstant = options.requestInstant ?? now();
    const window = computeCalendarWindow(
      {
        lookbackDays: this.settings.lookbackDays,
        lookaheadDays: this.settings.lookaheadDays,
      },
      requestInstant,
    );

    const result = await this.query.listCalendarEvents(
      criteria.criteria,
      window,
      this.settings.maxEntries,
    );

    const document = buildFilteredCalendarDocument({
      events: result.events,
      generatedAt: requestInstant,
      ...(this.settings.metadata === undefined ? {} : { metadata: this.settings.metadata }),
    });

    return {
      ok: true,
      body: document.body,
      truncated: result.truncated,
      groupsTruncated: document.groupsTruncated,
      criteria: criteria.criteria,
    };
  }
}
