import type { PublishedGroupSnapshot } from '@actionpop/core';

/** A snapshot in the making: the metadata plus the event identifiers it owns. */
export interface PublishedGroupSnapshotEventIds extends PublishedGroupSnapshot {
  eventIds: string[];
}
