import { Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { MetricsRegistry } from '@actionpop/core';

import { SERVER_OPTIONS } from '../constants.js';
import type { ServerOptions } from '../server.js';
import { MAX_BODY_BYTES, isJsonContentType, parseJourneyBatch } from './journey-events.js';

/**
 * The only write surface of the application.
 *
 * It records counters and nothing else: no database write, no file, no log line carrying the
 * payload. Every response is empty, so a caller learns nothing beyond accepted or refused.
 */
@Controller('telemetry')
export class TelemetryController {
  public constructor(@Inject(SERVER_OPTIONS) private readonly options: ServerOptions) {}

  @Post('journey')
  public async record(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<unknown> {
    const metrics = this.metrics();
    const declaredLength = Number(request.headers['content-length'] ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return this.refuse(reply, metrics, 413, 'too_large');
    }
    if (!isJsonContentType(request.headers['content-type'])) {
      return this.refuse(reply, metrics, 415, 'wrong_type');
    }

    // Fastify parses JSON bodies, so a string is only seen when a caller sends a raw payload.
    const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    const result = parseJourneyBatch(body);

    if (!result.ok) {
      return this.refuse(reply, metrics, result.reason === 'too_large' ? 413 : 400, result.reason);
    }

    const { batch } = result;
    if (batch.unknownSteps > 0) {
      metrics.increment('actionpop_telemetry_rejected_total', { reason: 'unknown_step' }, batch.unknownSteps);
    }
    if (batch.malformedSteps > 0) {
      metrics.increment('actionpop_telemetry_rejected_total', { reason: 'malformed' }, batch.malformedSteps);
    }
    for (const entry of batch.steps) {
      metrics.increment('actionpop_journey_steps_total', {
        step: entry.step,
        subject_kind: entry.subjectKind,
      });
    }

    return reply.code(204).send();
  }

  @Get('journey')
  public rejectGet(@Res() reply: FastifyReply): unknown {
    return reply.code(405).send();
  }

  private metrics(): MetricsRegistry {
    if (this.options.metrics === undefined) {
      throw new Error('the telemetry controller requires a metrics registry');
    }
    return this.options.metrics;
  }

  private refuse(
    reply: FastifyReply,
    metrics: MetricsRegistry,
    status: number,
    reason: string,
  ): unknown {
    metrics.increment('actionpop_telemetry_rejected_total', { reason });
    return reply.code(status).send();
  }
}
