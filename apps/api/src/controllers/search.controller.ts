import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  parseSubjectSearchRequest,
  searchSubjects,
  type SearchAnswer,
  type SubjectSearchReader,
} from '@actionpop/core';

import { SUBJECT_SEARCH } from '../constants.js';

const SEARCH_ANSWER_SCHEMA = {
  type: 'object',
  required: ['query', 'subjects', 'total', 'kindCounts'],
  properties: {
    query: { type: 'string', example: 'lyon' },
    total: { type: 'integer', example: 3 },
    kindCounts: {
      type: 'object',
      additionalProperties: { type: 'integer' },
      example: { commune: 1, department: 1, group: 1 },
    },
    subjects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'id', 'label', 'calendar'],
        properties: {
          kind: { type: 'string', example: 'commune' },
          id: { type: 'string', example: '69123' },
          label: { type: 'string', example: 'Lyon' },
          qualifier: { type: 'string', example: 'Rhône' },
          parent: { type: 'string', example: 'Rhône' },
          calendar: {
            type: 'object',
            properties: {
              path: { type: 'string', example: '/calendar.ics' },
              params: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
        },
      },
    },
  },
};

@ApiTags('search')
@Controller('search')
export class SearchController {
  public constructor(@Inject(SUBJECT_SEARCH) private readonly reader: SubjectSearchReader) {}

  @Get('subjects')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Resolve a human query to calendar subjects',
    description:
      'Returns communes, departments and action groups matching the query, each carrying the ' +
      'calendar filter parameters that produce its calendar. The read is public and read-only.',
  })
  @ApiQuery({ name: 'q', required: true, description: 'Query, 2 to 64 characters' })
  @ApiQuery({
    name: 'kind',
    required: false,
    description: 'Comma-separated kinds among commune, department, group. Default: all',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Between 1 and 30. Default 18' })
  @ApiOkResponse({ schema: SEARCH_ANSWER_SCHEMA })
  public async search(@Query() query: Record<string, string | undefined>): Promise<SearchAnswer> {
    const parsed = parseSubjectSearchRequest(query);
    if (!parsed.ok) {
      throw new BadRequestException({
        error: 'invalid search request',
        diagnostics: parsed.diagnostics,
      });
    }

    try {
      return await searchSubjects(parsed.request, this.reader);
    } catch {
      throw new ServiceUnavailableException({ error: 'search unavailable' });
    }
  }
}
