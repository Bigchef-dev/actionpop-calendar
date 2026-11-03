import { Controller, Get, Res, Inject } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { runHealthCheck, type HealthResult, MetricsRegistry } from '@actionpop/core';
import type { ServerOptions } from '../server.js'; // À adapter
import { SERVER_OPTIONS } from '../constants.js';
import { buildInfo, buildInfoLabels } from '../observability/build-info.js';

export { SERVER_OPTIONS };

@Controller('internal')
export class InternalController {
  constructor(
    @Inject(SERVER_OPTIONS)
    private readonly options: ServerOptions,
  ) {}

  @Get('live')
  getLive() {
    return { status: 'ready' };
  }

  @Get('metrics')
  async getMetrics(@Res() reply: FastifyReply) {
    const metrics = this.options.metrics ?? new MetricsRegistry();
    let redisReady = 1;

    if (this.options.health?.redis !== undefined) {
      try {
        await this.options.health.redis();
      } catch {
        redisReady = 0;
      }
    }

    metrics.setGauge('actionpop_redis_ready', {}, redisReady);
    metrics.setGauge(
      'actionpop_build_info',
      buildInfoLabels(this.options.buildInfo ?? buildInfo()),
      1,
    );

    return reply.type('text/plain; version=0.0.4').send(Buffer.from(metrics.prometheus()));
  }

  @Get('ready')
  async getReady(@Res() reply: FastifyReply) {
    const checks: HealthResult[] = [];

    if (this.options.health?.redis !== undefined) {
      checks.push(await runHealthCheck('redis', this.options.health.redis));
    }

    if (this.options.health?.postgres !== undefined) {
      checks.push(await runHealthCheck('postgres', this.options.health.postgres));
    }

    const ready = checks.every((check) => check.status === 'ready');

    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks });
  }
}
