import type { Diagnostic } from '../geography/reference-types.js';

export interface CalendarEventGeography {
  readonly status: string | null;
  readonly countryCode: string | null;
  readonly departmentCode: string | null;
  readonly communeId: string | null;
  readonly referenceVersion: string | null;
  readonly rawDepartmentCode: string | null;
  readonly rawCommuneName: string | null;
  readonly diagnostics: readonly Diagnostic[];
}

export interface CalendarEventLocation {
  readonly name: string | null;
  readonly fullAddress: string | null;
  readonly shortAddress: string | null;
  readonly address1: string | null;
  readonly address2: string | null;
  readonly city: string | null;
  readonly zip: string | null;
}

export interface CalendarEventCoordinates {
  readonly latitude: string;
  readonly longitude: string;
}

/**
 * Projection emitted by the calendar read model. Every identifier stays a
 * string so leading zeroes and `2A`/`2B` survive, and every optional field is
 * `null` rather than absent so the emitter can omit its property explicitly.
 */
export interface CalendarEvent {
  readonly sourceEventId: string;
  readonly summary: string;
  readonly description: string | null;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly sequence: number;
  readonly updatedAt: Date;
  readonly lastSeenPeriod: string | null;
  readonly eventType: string | null;
  readonly sourceUrl: string | null;
  readonly geography: CalendarEventGeography | null;
  readonly location: CalendarEventLocation | null;
  readonly coordinates: CalendarEventCoordinates | null;
  readonly groupIds: readonly string[];
}

export interface CalendarEventCriteria {
  readonly country?: string | undefined;
  readonly department?: string | undefined;
  readonly communeIds?: readonly string[] | undefined;
  readonly eventTypes?: readonly string[] | undefined;
}

export interface CalendarWindow {
  readonly startUtc: Date;
  readonly endUtc: Date;
}

export interface CalendarQueryResult {
  readonly events: readonly CalendarEvent[];
  /** True when the entry ceiling cut the result set. */
  readonly truncated: boolean;
}
