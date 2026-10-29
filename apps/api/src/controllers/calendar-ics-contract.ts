import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { METADATA_PREFIX, METADATA_PROPERTIES } from '@actionpop/core';

const METADATA_DOCUMENTATION = METADATA_PROPERTIES.map(
  (property) => `${METADATA_PREFIX}${property.name}`,
).join(', ');

const DESCRIPTION =
  'Returns, as an iCalendar document, every published event matching every supplied criterion. ' +
  'Values inside one parameter combine with OR; distinct parameters combine with AND. ' +
  'commune_name and insee_commune form one commune dimension whose values union. ' +
  'Identifiers are strings, so leading zeroes and 2A/2B are preserved. ' +
  'The calendar covers a configurable window and excludes events that do not overlap it. ' +
  'Example: /calendar.ics?department=69&insee_commune=69123,69124&event_type=tractage. ' +
  'Each entry also carries the standard LOCATION, URL, CATEGORIES and GEO properties when the event states them, ' +
  'plus experimental properties whose set depends on the configured metadata level: ' +
  'identity emits the identity family; standard (the default) adds the classification and provenance families; ' +
  `full adds geography, diagnostics and raw source values. Documented properties: ${METADATA_DOCUMENTATION}. ` +
  `${METADATA_PREFIX}EVENT-ID is stable across updates, while ${METADATA_PREFIX}UPDATED-AT and ` +
  `${METADATA_PREFIX}PERIOD describe the last successful observation.`;

/** Documents the filtered calendar contract next to the handler it describes. */
export function ApiCalendarIcs(): MethodDecorator {
  return applyDecorators(
    ApiTags('calendar'),
    ApiOperation({ summary: 'Read a filtered calendar feed', description: DESCRIPTION }),
    ApiQuery({
      name: 'country',
      required: false,
      description: 'Stated ISO 3166-1 alpha-2 country code',
      schema: { type: 'string', pattern: '^[A-Za-z]{2}$', example: 'FR' },
    }),
    ApiQuery({
      name: 'department',
      required: false,
      description: 'Department code; leading zeroes and 2A/2B are preserved',
      schema: { type: 'string', example: '69' },
    }),
    ApiQuery({
      name: 'commune_name',
      required: false,
      description: 'Comma-separated commune names, matched exactly after normalization',
      schema: { type: 'string', example: 'Lyon,Villeurbanne' },
    }),
    ApiQuery({
      name: 'insee_commune',
      required: false,
      description: 'Comma-separated INSEE codes',
      schema: { type: 'string', example: '69123,69124' },
    }),
    ApiQuery({
      name: 'event_type',
      required: false,
      description: 'Comma-separated event-type labels',
      schema: { type: 'string', example: 'tractage' },
    }),
    ApiResponse({
      status: 200,
      description: 'Events satisfying every criterion, each returned once, in iCalendar format',
      content: { 'text/calendar': { schema: { type: 'string' } } },
    }),
    ApiResponse({ status: 304, description: 'The calendar has not changed' }),
    ApiResponse({
      status: 400,
      description: 'Unsupported, unknown or malformed filter parameter',
    }),
    ApiResponse({ status: 405, description: 'The calendar route is read-only' }),
    ApiResponse({ status: 503, description: 'Event storage unavailable' }),
  );
}
