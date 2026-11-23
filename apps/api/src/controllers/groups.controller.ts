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
  namesAnArea,
  parseGroupArea,
  resolveGroupArea,
  type GroupAreaResolver,
  type GroupListingAnswer,
  type GroupListingReader,
} from '@actionpop/core';

import { GROUP_AREA_RESOLVER, GROUP_LISTING } from '../constants.js';
import { logger } from '../logger.js';
import { areaEcho } from './groups-area-echo.js';
import { GROUPS_ANSWER_SCHEMA } from './groups-answer-schema.js';

@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  public constructor(
    @Inject(GROUP_LISTING) private readonly reader: GroupListingReader,
    @Inject(GROUP_AREA_RESOLVER) private readonly resolver: GroupAreaResolver,
  ) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'List the action groups of a geographic area',
    description:
      'Returns each action group located in the requested territory once, with its identity, published name, location ' +
      'context and calendar reference. Criteria are the existing geographic parameters and combine with AND; values ' +
      'inside one parameter combine with OR. The read is a catalogue read: it never describes the events a group organizes.',
  })
  @ApiQuery({ name: 'country', required: false, description: 'ISO 3166-1 alpha-2 code' })
  @ApiQuery({ name: 'department', required: false, description: 'Department code' })
  @ApiQuery({ name: 'insee_commune', required: false, description: 'Comma-separated INSEE codes' })
  @ApiQuery({ name: 'commune', required: false, description: 'Alias of insee_commune' })
  @ApiQuery({ name: 'commune_name', required: false, description: 'Comma-separated commune names' })
  @ApiQuery({ name: 'epci', required: false, description: 'Comma-separated EPCI identifiers' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size, 1 to 200. Default 50' })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Groups skipped, at least 0. Default 0',
  })
  @ApiOkResponse({ schema: GROUPS_ANSWER_SCHEMA })
  public async list(
    @Query() query: Record<string, string | undefined>,
  ): Promise<GroupListingAnswer> {
    const parsed = parseGroupArea(query);
    if (!parsed.ok) throw new BadRequestException(invalidArea(parsed.diagnostics));
    if (!namesAnArea(parsed.criteria)) {
      throw new BadRequestException({
        error: 'invalid group area filter',
        diagnostics: [
          {
            code: 'area_missing',
            field: 'area',
            message:
              'at least one of country, department, insee_commune, commune, commune_name or epci is required',
            severity: 'error',
          },
        ],
      });
    }

    const version = await this.reader.findActiveVersion().catch(() => null);
    if (version === null) {
      throw new ServiceUnavailableException({
        error: 'group listing unavailable',
        diagnostics: [
          {
            code: 'reference_unavailable',
            field: 'referenceVersion',
            message: 'no geographic reference version is active',
            severity: 'error',
          },
        ],
      });
    }

    const unknown = (await this.reader.validateArea?.(version, parsed.criteria)) ?? [];
    if (unknown.length > 0) throw new BadRequestException(invalidArea(unknown));

    const resolved = await resolveGroupArea(parsed.criteria, version, this.resolver);
    if (!resolved.ok) throw mappingFailure(resolved.diagnostics);

    try {
      const result = await this.reader.list(resolved.criteria, {
        limit: parsed.criteria.limit,
        offset: parsed.criteria.offset,
      });
      return { ...result, area: areaEcho(parsed.criteria) };
    } catch (error) {
      logger.error({ err: error }, 'Group listing failed');
      throw new ServiceUnavailableException({ error: 'group storage unavailable' });
    }
  }
}

/** An EPCI or reference that cannot be resolved is an availability problem, not a bad request. */
function mappingFailure(
  diagnostics: readonly {
    readonly code: string;
    readonly field: string;
    readonly message: string;
  }[],
): BadRequestException | ServiceUnavailableException {
  const unavailable = diagnostics.some(
    (diagnostic) =>
      diagnostic.code === 'epci_unavailable' ||
      diagnostic.code === 'epci_membership_incomplete' ||
      diagnostic.code === 'commune_name_unavailable',
  );
  return unavailable
    ? new ServiceUnavailableException({ error: 'group listing unavailable', diagnostics })
    : new BadRequestException({ error: 'invalid group area filter', diagnostics });
}

function invalidArea(
  diagnostics: readonly {
    readonly code: string;
    readonly field: string;
    readonly message: string;
    readonly severity: 'error';
  }[],
) {
  return { error: 'invalid group area filter', diagnostics };
}
