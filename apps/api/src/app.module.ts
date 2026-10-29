import { Module, type Type } from '@nestjs/common';

import {
  CALENDAR_SERVICE,
  CALENDAR_SETTINGS,
  DATASET_REPOSITORY,
  EVENT_QUERY,
} from './constants.js';
import { CalendarController } from './controllers/calendar.controller.js';
import { CalendarIcsController } from './controllers/calendar-ics.controller.js';
import { EventsController } from './controllers/events.controller.js';
import { InternalController, SERVER_OPTIONS } from './internal/internal.controller.js';
import type { ServerOptions } from './server.js';
import { CalendarService } from './services/calendar.service.js';

export function createAppModule(options: ServerOptions) {
  const controllers: Type[] = [CalendarController, EventsController, InternalController];
  // The filtered calendar is registered only when its read path is wired, so a
  // deployment without a calendar query never exposes a route that cannot answer.
  if (options.calendarService !== undefined) controllers.push(CalendarIcsController);

  @Module({
    controllers,
    providers: [
      CalendarService,
      { provide: DATASET_REPOSITORY, useValue: options.datasetRepository },
      { provide: EVENT_QUERY, useValue: options.eventQuery },
      { provide: CALENDAR_SERVICE, useValue: options.calendarService },
      { provide: CALENDAR_SETTINGS, useValue: options.calendarSettings },
      { provide: SERVER_OPTIONS, useValue: options },
    ],
  })
  class AppModule {}

  return AppModule;
}
