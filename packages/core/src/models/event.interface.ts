import {
  ActionPopulaireEventPayload,
  ActionPopulaireLocation,
} from '../adapters/action-populaire-schemas.js';
import type { GeographicAttachment } from '../geography/reference-types.js';
import type { ObservedGroup } from '../groups/observed-groups.js';

export type LocationEvent = Pick<
  ActionPopulaireLocation,
  | 'name'
  | 'address'
  | 'address1'
  | 'address2'
  | 'zip'
  | 'city'
  | 'shortAddress'
  | 'shortLocation'
  | 'coordinates'
>;

export interface IncomingEvent extends Pick<
  ActionPopulaireEventPayload,
  'id' | 'name' | 'startTime' | 'endTime' | 'description'
> {
  location: LocationEvent | null;
  eventType?: string;
  geography?: GeographicAttachment;
  /** Groups the source states for this event; empty means "no group stated". */
  groups?: readonly ObservedGroup[];
  /** Identifiers dropped because they trim to empty, reported as a data-quality signal. */
  blankGroupIdentifiers?: number;
}

export interface PublishedEvent extends IncomingEvent {
  sourceEventId: string;
  contentHash: string;
  sequence: number;
}

export interface PublishedGroupSnapshot {
  scopeId: string;
  revision: number;
  generatedAt: string;
  /** Processing period of the observation, used for attribution metrics. */
  periodToken?: string;
}
