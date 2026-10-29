import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { parseGeographicFilter, type GeographicFilter } from '@actionpop/core';

import { EVENT_QUERY } from '../constants.js';

export interface GeographicEventItem {
  sourceEventId: string;
  eventType: string | null;
  countryCode: string | null;
  departmentCode: string | null;
  communeId: string | null;
  geographicStatus: string | null;
  referenceVersion: string | null;
}

export interface GeographicQueryResult {
  items: GeographicEventItem[];
  total: number;
}

export class GeographicEventItemDto implements GeographicEventItem {
  @ApiProperty({ type: String, example: 'event-1' })
  public sourceEventId!: string;

  @ApiProperty({ type: String, example: 'tractage', nullable: true })
  public eventType!: string | null;

  @ApiProperty({
    example: 'FR',
    nullable: true,
    type: String,
    description: 'Stated ISO 3166-1 alpha-2 code, kept as a string',
  })
  public countryCode!: string | null;

  @ApiProperty({
    example: '01',
    nullable: true,
    type: String,
    description: 'Department code kept as a string, including leading zeroes and 2A/2B',
  })
  public departmentCode!: string | null;

  @ApiProperty({
    example: '01001',
    nullable: true,
    type: String,
    description: 'INSEE code kept as a string, including leading zeroes',
  })
  public communeId!: string | null;

  @ApiProperty({ type: String, example: 'resolved', nullable: true })
  public geographicStatus!: string | null;

  @ApiProperty({ type: String, example: 'communes-20261028-b81cad794b9c', nullable: true })
  public referenceVersion!: string | null;
}

export class GeographicQueryResultDto implements GeographicQueryResult {
  @ApiProperty({ type: () => [GeographicEventItemDto] })
  public items!: GeographicEventItemDto[];

  @ApiProperty({ type: Number, example: 1 })
  public total!: number;
}

@ApiTags('events')
@Controller('events')
export class EventsController {
  public constructor(@Inject(EVENT_QUERY) private readonly eventQuery: EventQueryReader) {}

  @Get()
  @ApiOperation({
    summary: 'List events matching every supplied geographic criterion',
    description:
      'Criteria combine with AND semantics: an event is returned only when it matches all supplied parameters. Identifiers are strings, so leading zeroes are preserved. Region, EPCI, constituency and coordinate parameters are rejected.',
  })
  @ApiQuery({
    name: 'country',
    required: false,
    description: 'Stated ISO 3166-1 alpha-2 code',
    schema: { type: 'string', pattern: '^[A-Za-z]{2}$', example: 'FR' },
  })
  @ApiQuery({
    name: 'department',
    required: false,
    description: 'Department code; leading zeroes and 2A/2B are preserved',
    schema: { type: 'string', example: '01' },
  })
  @ApiQuery({
    name: 'commune',
    required: false,
    description: 'INSEE code of the resolved commune',
    schema: { type: 'string', example: '01001' },
  })
  @ApiQuery({
    name: 'event_type',
    required: false,
    description: 'Event-type label published by the source',
    schema: { type: 'string', example: 'tractage' },
  })
  @ApiResponse({
    status: 200,
    description: 'Events satisfying every criterion, each returned once',
    type: GeographicQueryResultDto,
  })
  @ApiResponse({ status: 400, description: 'Unsupported, unknown or malformed filter parameter' })
  @ApiResponse({ status: 503, description: 'Event storage unavailable' })
  public async list(
    @Query() query: Record<string, string | undefined>,
  ): Promise<GeographicQueryResult> {
    const parsed = parseGeographicFilter(query);
    if (!parsed.ok) {
      throw new BadRequestException({
        error: 'invalid geographic filter',
        diagnostics: parsed.diagnostics,
      });
    }

    try {
      return await this.eventQuery.list(parsed.filter as GeographicFilter);
    } catch {
      throw new ServiceUnavailableException({ error: 'event storage unavailable' });
    }
  }
}

export interface EventQueryReader {
  list(filter: GeographicFilter): Promise<GeographicQueryResult>;
}
