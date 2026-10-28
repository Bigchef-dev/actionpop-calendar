import {
  ActionPopulaireEventPayload,
  ActionPopulaireLocation,
} from '../adapters/action-populaire-schemas.js';
import type { GeographicAttachment } from '../geography/reference-types.js';

export type LocationEvent = Pick<
  ActionPopulaireLocation,
  'address1' | 'city' | 'zip' | 'coordinates'
>;

export interface IncomingEvent extends Pick<
  ActionPopulaireEventPayload,
  'id' | 'name' | 'startTime' | 'endTime' | 'description'
> {
  location: LocationEvent | null;
  eventType?: string;
  geography?: GeographicAttachment;
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
}
