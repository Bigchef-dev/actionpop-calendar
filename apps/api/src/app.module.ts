import { Module } from '@nestjs/common';

import { DATASET_REPOSITORY } from './constants.js';
import { CalendarController } from './controllers/calendar.controller.js';
import type { ServerOptions } from './server.js';
import { CalendarService } from './services/calendar.service.js';

export function createAppModule(options: ServerOptions) {
  @Module({
    controllers: [CalendarController],
    providers: [
      CalendarService,
      { provide: DATASET_REPOSITORY, useValue: options.datasetRepository },
    ],
  })
  class AppModule {}

  return AppModule;
}
