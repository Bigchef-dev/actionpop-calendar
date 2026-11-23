import { Module, type Type } from '@nestjs/common';

import {
  CALENDAR_SERVICE,
  CALENDAR_SETTINGS,
  DATASET_REPOSITORY,
  EVENT_QUERY,
  GROUP_AREA_RESOLVER,
  GROUP_LISTING,
  SUBJECT_SEARCH,
  UPDATE_STATUS,
} from './constants.js';
import { CalendarController } from './controllers/calendar.controller.js';
import { CalendarIcsController } from './controllers/calendar-ics.controller.js';
import { EventsController } from './controllers/events.controller.js';
import { GroupsController } from './controllers/groups.controller.js';
import { InternalController, SERVER_OPTIONS } from './internal/internal.controller.js';
import { SearchController } from './controllers/search.controller.js';
import { UpdateStatusController } from './controllers/update-status.controller.js';
import { TelemetryController } from './observability/telemetry.controller.js';
import type { ServerOptions } from './server.js';
import { CalendarService } from './services/calendar.service.js';

export function createAppModule(options: ServerOptions) {
  const controllers: Type[] = [
    CalendarController,
    EventsController,
    InternalController,
    TelemetryController,
  ];
  // The filtered calendar is registered only when its read path is wired, so a
  // deployment without a calendar query never exposes a route that cannot answer.
  if (options.calendarService !== undefined) controllers.push(CalendarIcsController);
  // Same rule for the search read: a deployment without a reader never exposes the route.
  if (options.subjectSearch !== undefined) controllers.push(SearchController);
  // And for the territory listing: without its reader there is nothing to answer with.
  if (options.groupListing !== undefined) controllers.push(GroupsController);
  // The public status read is registered only when its service is wired, same rule as above.
  if (options.updateStatus !== undefined) controllers.push(UpdateStatusController);

  @Module({
    controllers,
    providers: [
      CalendarService,
      { provide: DATASET_REPOSITORY, useValue: options.datasetRepository },
      { provide: EVENT_QUERY, useValue: options.eventQuery },
      { provide: CALENDAR_SERVICE, useValue: options.calendarService },
      { provide: CALENDAR_SETTINGS, useValue: options.calendarSettings },
      { provide: SUBJECT_SEARCH, useValue: options.subjectSearch },
      { provide: GROUP_LISTING, useValue: options.groupListing },
      { provide: GROUP_AREA_RESOLVER, useValue: options.groupAreaResolver },
      { provide: UPDATE_STATUS, useValue: options.updateStatus },
      { provide: SERVER_OPTIONS, useValue: options },
    ],
  })
  class AppModule {}

  return AppModule;
}
