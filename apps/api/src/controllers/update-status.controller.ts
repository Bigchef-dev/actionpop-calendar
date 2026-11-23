import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import type { UpdateStatusAnswer } from '@actionpop/core';

import { UPDATE_STATUS } from '../constants.js';
import type { UpdateStatusService } from '../services/update-status.service.js';
import { UPDATE_STATUS_ANSWER_SCHEMA } from './update-status-answer-schema.js';

@ApiTags('updates')
@Controller('updates')
export class UpdateStatusController {
  public constructor(@Inject(UPDATE_STATUS) private readonly service: UpdateStatusService) {}

  @Get()
  @ApiOperation({
    summary: 'Report the freshness of the calendar data',
    description:
      'Returns aggregate-only refresh state: the run in progress, the last completed run, a ' +
      'bounded history and how old the published data is. No identifier, failure reason, ' +
      'organizer name or infrastructure detail is ever exposed.',
  })
  @ApiOkResponse({ schema: UPDATE_STATUS_ANSWER_SCHEMA })
  public async read(@Res({ passthrough: true }) reply: FastifyReply): Promise<UpdateStatusAnswer> {
    const answer = await this.service.answer();
    reply.header('Cache-Control', answer.state === 'unknown' ? 'no-store' : 'public, max-age=15');
    return answer;
  }
}
