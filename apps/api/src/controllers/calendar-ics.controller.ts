import { createHash } from 'node:crypto';

import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Inject,
  MethodNotAllowedException,
  NotFoundException,
  Patch,
  Post,
  Put,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { CALENDAR_SERVICE, CALENDAR_SETTINGS, SERVER_OPTIONS } from '../constants.js';
import { ApiCalendarIcs } from './calendar-ics-contract.js';
import type { ServerOptions } from '../server.js';
import type {
  FilteredCalendarReader,
  FilteredCalendarSettings,
  MetadataFamily,
  MetadataLevel,
} from '@actionpop/core';

@Controller()
export class CalendarIcsController {
  public constructor(
    @Inject(CALENDAR_SERVICE) private readonly calendarService: FilteredCalendarReader,
    @Inject(CALENDAR_SETTINGS) private readonly settings: CalendarIcsSettings,
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}

  @Get('calendar.ics')
  @ApiCalendarIcs()
  public async getCalendar(
    @Query() query: Record<string, string | undefined>,
    @Res() reply: FastifyReply,
  ): Promise<unknown> {
    if (!this.settings.enabled) {
      throw new NotFoundException({ error: 'calendar disabled' });
    }

    const result = await this.calendarService.build(query).catch(() => {
      throw new ServiceUnavailableException({ error: 'event storage unavailable' });
    });

    if (!result.ok) {
      const availabilityFailure = result.diagnostics.some((diagnostic) =>
        diagnostic.code === 'epci_unavailable' ||
        diagnostic.code === 'epci_membership_incomplete',
      );
      if (availabilityFailure) {
        throw new ServiceUnavailableException({
          error: 'calendar scope unavailable',
          diagnostics: result.diagnostics,
        });
      }
      throw new BadRequestException({
        error: 'invalid calendar filter',
        diagnostics: result.diagnostics,
      });
    }

    this.reportTruncation(result.truncated, result.groupsTruncated, result.criteria);

    const etag = `"${createHash('sha256').update(result.body).digest('hex').slice(0, 16)}"`;
    reply.header('ETag', etag);
    reply.header('Cache-Control', `public, max-age=${this.settings.revalidationSeconds}`);

    const ifNoneMatch =
      typeof reply.request.headers['if-none-match'] === 'string'
        ? reply.request.headers['if-none-match']
        : undefined;
    if (ifNoneMatch === etag) {
      return reply.code(304).send();
    }

    return reply
      .type('text/calendar; charset=utf-8')
      .header('Content-Disposition', 'inline; filename="actionpop-calendar.ics"')
      .send(result.body);
  }

  @Post('calendar.ics')
  public rejectPost(): never {
    return this.rejectWrite();
  }

  @Put('calendar.ics')
  public rejectPut(): never {
    return this.rejectWrite();
  }

  @Patch('calendar.ics')
  public rejectPatch(): never {
    return this.rejectWrite();
  }

  @Delete('calendar.ics')
  public rejectDelete(): never {
    return this.rejectWrite();
  }

  /**
   * Makes a shortened calendar observable: an operator must be able to tell a
   * genuinely small result set from one cut by a ceiling.
   */
  private reportTruncation(truncated: boolean, groupsTruncated: boolean, criteria: object): void {
    if (!truncated && !groupsTruncated) return;
    const logger = this.options.logger;
    if (truncated) {
      logger?.warn('calendar truncated at the entry ceiling', {
        reason: 'entry_ceiling',
        maxEntries: this.settings.maxEntries,
        criteria: JSON.stringify(criteria),
      });
    }
    if (groupsTruncated) {
      logger?.warn('calendar group properties truncated', {
        reason: 'group_ceiling',
        maxGroupsPerEvent: this.settings.maxGroupsPerEvent ?? 5,
      });
    }
  }

  private rejectWrite(): never {
    throw new MethodNotAllowedException({ error: 'read-only calendar' });
  }
}

export interface CalendarIcsSettings extends FilteredCalendarSettings {
  readonly enabled: boolean;
  readonly revalidationSeconds: number;
  readonly metadataLevel?: MetadataLevel;
  readonly disabledFamilies?: readonly MetadataFamily[];
  readonly maxGroupsPerEvent?: number;
}
