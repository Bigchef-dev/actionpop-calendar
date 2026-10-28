import { Module } from '@nestjs/common';

import { DATASET_REPOSITORY } from './constants.js';
import { CalendarController } from './controllers/calendar.controller.js';
import { InternalController, SERVER_OPTIONS } from './internal/internal.controller.js';
import type { ServerOptions } from './server.js';
import { CalendarService } from './services/calendar.service.js';

export function createAppModule(options: ServerOptions) {
  @Module({
    controllers: [CalendarController, InternalController],
    providers: [
      CalendarService,
      { provide: DATASET_REPOSITORY, useValue: options.datasetRepository },
      { provide: SERVER_OPTIONS, useValue: options },
    ],
  })
  class AppModule {}

  return AppModule;
}
