import 'reflect-metadata';

import { buildIcalFeed, type CalendarDataset, type CalendarFeed } from '@actionpop/core';
import { Injectable } from '@nestjs/common';

import type { DatasetReader } from '../server.js';

export class ScopeValidationError extends Error {}
export class ScopeNotFoundError extends Error {}
export class DataUnavailableError extends Error {}

@Injectable()
export class CalendarService {
  private readonly scopePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  validateScope(scopeId: string): void {
    if (!this.scopePattern.test(scopeId)) throw new ScopeValidationError('invalid scope');
  }

  async getFeed(datasetRepository: DatasetReader, scopeId: string): Promise<CalendarFeed> {
    this.validateScope(scopeId);

    let dataset: CalendarDataset | null;
    try {
      dataset = await datasetRepository.getCurrent(scopeId);
    } catch {
      throw new DataUnavailableError('calendar data unavailable');
    }
    if (dataset === null) throw new ScopeNotFoundError('scope not found');

    return buildIcalFeed({ ...dataset, events: dataset.events });
  }
}