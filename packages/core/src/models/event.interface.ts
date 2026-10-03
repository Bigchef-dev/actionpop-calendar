import { ActionPopulaireEventPayload } from "../adapters/action-populaire-schemas.js";

export interface IncomingEvent extends Pick<ActionPopulaireEventPayload, 'id' | 'name' | 'startTime' | 'endTime' | 'description'> {}

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