import type { Prisma, PrismaClient } from '@prisma/client';

import type {
  CalendarEvent,
  CalendarEventCriteria,
  CalendarQueryResult,
  CalendarWindow,
} from '../calendar-filters/calendar-event.js';
import { readDiagnostics } from './diagnostic-json.js';

const EVENT_SELECT = {
  sourceEventId: true,
  summary: true,
  description: true,
  startTime: true,
  endTime: true,
  sequence: true,
  status: true,
  updatedAt: true,
  lastSeenPeriod: true,
  eventType: true,
  sourceUrl: true,
  geographicStatus: true,
  countryCode: true,
  departmentCode: true,
  communeId: true,
  referenceVersion: true,
  rawDepartmentCode: true,
  rawCommuneName: true,
  geographicDiagnostics: true,
  location: {
    select: {
      name: true,
      fullAddress: true,
      shortAddress: true,
      address1: true,
      address2: true,
      city: true,
      zip: true,
      geoPoint: { select: { latitude: true, longitude: true } },
    },
  },
  groupLinks: { select: { scopeId: true } },
} satisfies Prisma.EventRecordSelect;

type EventRow = Prisma.EventRecordGetPayload<{ select: typeof EVENT_SELECT }>;

export class PostgresCalendarEventQuery {
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * Returns the events matching every supplied criterion inside the window,
   * once each, ordered deterministically. One extra row is fetched to report
   * truncation instead of silently shortening the calendar.
   */
  public async listCalendarEvents(
    criteria: CalendarEventCriteria,
    window: CalendarWindow,
    limit: number,
  ): Promise<CalendarQueryResult> {
    const rows = await this.prisma.eventRecord.findMany({
      where: buildWhere(criteria, window),
      select: EVENT_SELECT,
      orderBy: [{ startTime: 'asc' }, { sourceEventId: 'asc' }],
      take: limit + 1,
    });

    const truncated = rows.length > limit;
    const retained = truncated ? rows.slice(0, limit) : rows;
    return { events: retained.map(toCalendarEvent), truncated };
  }
}

function buildWhere(
  criteria: CalendarEventCriteria,
  window: CalendarWindow,
): Prisma.EventRecordWhereInput {
  const communeIds = criteria.communeIds ?? [];
  const eventTypes = criteria.eventTypes ?? [];
  const groupIds = criteria.groupIds ?? [];

  return {
    ...(criteria.country === undefined ? {} : { countryCode: criteria.country }),
    ...(criteria.department === undefined ? {} : { departmentCode: criteria.department }),
    ...(communeIds.length === 0 ? {} : { communeId: { in: [...communeIds] } }),
    ...(eventTypes.length === 0 ? {} : { eventType: { in: [...eventTypes] } }),
    ...(groupIds.length === 0 ? {} : { groupLinks: { some: { scopeId: { in: [...groupIds] } } } }),
    endTime: { gte: window.startUtc },
    startTime: { lte: window.endUtc },
  };
}

function toCalendarEvent(row: EventRow): CalendarEvent {
  const geoPoint = row.location?.geoPoint ?? null;
  return {
    sourceEventId: row.sourceEventId,
    summary: row.summary,
    description: row.description,
    startTime: row.startTime,
    endTime: row.endTime,
    sequence: row.sequence,
    status: row.status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE',
    updatedAt: row.updatedAt,
    lastSeenPeriod: row.lastSeenPeriod,
    eventType: row.eventType,
    sourceUrl: row.sourceUrl,
    geography:
      row.geographicStatus === null
        ? null
        : {
            status: row.geographicStatus,
            countryCode: row.countryCode,
            departmentCode: row.departmentCode,
            communeId: row.communeId,
            referenceVersion: row.referenceVersion,
            rawDepartmentCode: row.rawDepartmentCode,
            rawCommuneName: row.rawCommuneName,
            diagnostics: readDiagnostics(row.geographicDiagnostics),
          },
    location:
      row.location === null
        ? null
        : {
            name: row.location.name,
            fullAddress: row.location.fullAddress,
            shortAddress: row.location.shortAddress,
            address1: row.location.address1,
            address2: row.location.address2,
            city: row.location.city,
            zip: row.location.zip,
          },
    coordinates:
      geoPoint === null
        ? null
        : { latitude: geoPoint.latitude.toString(), longitude: geoPoint.longitude.toString() },
    // The link key includes the observing listing, so one event can reference the
    // same organizer through several observations; the calendar exposes it once.
    groupIds: [...new Set(row.groupLinks.map((link) => link.scopeId))].sort(),
  };
}
