import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Headers,
  Res,
  Inject,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  MethodNotAllowedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiHeader, ApiResponse } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

// Remplacez par le bon chemin vers votre token et type
import { DATASET_REPOSITORY } from '../constants.js';
import { logger } from '../logger.js';
import type { DatasetReader } from '../server.js';
import {
  CalendarService,
  DataUnavailableError,
  ScopeNotFoundError,
  ScopeValidationError,
} from '../services/calendar.service.js';

@ApiTags('calendar')
@Controller('feed')
export class CalendarController {
  constructor(
    @Inject(CalendarService)
    private readonly calendarService: CalendarService,
    // On injecte le repository directement au lieu de le lire dans request.server
    @Inject(DATASET_REPOSITORY)
    private readonly datasetRepository: DatasetReader,
  ) {}

  @Get(':scopeId')
  @ApiOperation({ summary: 'Read a calendar feed' })
  @ApiParam({
    name: 'scopeId',
    type: 'string',
    schema: { pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
  })
  @ApiHeader({
    name: 'if-none-match',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'The calendar in iCalendar format',
    content: { 'text/calendar': { schema: { type: 'string' } } },
  })
  @ApiResponse({ status: 304, description: 'The calendar has not changed' })
  @ApiResponse({ status: 400, description: 'Invalid scope identifier' })
  @ApiResponse({ status: 404, description: 'Scope not found' })
  @ApiResponse({ status: 503, description: 'Calendar data unavailable' })
  async getFeed(
    @Param('scopeId') scopeId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    try {
      const feed = await this.calendarService.getFeed(this.datasetRepository, scopeId);

      reply.header('ETag', `"${feed.revision}"`);
      reply.header('Cache-Control', 'public, max-age=900');

      if (ifNoneMatch === `"${feed.revision}"`) {
        return reply.code(304).send();
      }

      return reply.type('text/calendar; charset=utf-8').send(feed.body);
    } catch (error) {
      logger.error({ err: error, scopeId }, 'Feed request failed');

      // Dans NestJS, on lance des HttpExceptions qui sont interceptées et formatées automatiquement
      if (error instanceof ScopeValidationError) {
        throw new BadRequestException({ error: 'invalid scope identifier' });
      }
      if (error instanceof ScopeNotFoundError) {
        throw new NotFoundException({ error: 'scope not found' });
      }
      if (error instanceof DataUnavailableError) {
        throw new ServiceUnavailableException({ error: 'calendar data unavailable' });
      }

      throw error;
    }
  }

  @Post(':scopeId')
  @Put(':scopeId')
  @Patch(':scopeId')
  @Delete(':scopeId')
  handleReadOnly() {
    throw new MethodNotAllowedException({ error: 'read-only feed' });
  }
}