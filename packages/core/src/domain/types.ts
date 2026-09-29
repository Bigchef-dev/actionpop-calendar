export interface GeoPoint {
  type: 'Point';
  coordinates: [longitude: number, latitude: number];
}

export interface LocationRecord {
  locationId: string;
  name?: string;
  address1?: string;
  address2?: string | null;
  zip?: string;
  city?: string;
  country?: string;
  coordinates?: GeoPoint;
}

export interface Scope {
  scopeId: string;
  displayName: string;
  active: boolean;
  scopeType: string;
  sourceSubtype?: string | number | number[];
  certified?: boolean;
  locationId?: string;
  sourceLink?: string;
  sourceFilter?: string;
}

export interface ProcessingPeriod {
  periodStartUtc: Date;
  periodEndUtc: Date;
  periodStartEuropeParis: string;
  periodEndEuropeParis: string;
  periodToken: string;
}

export type EventStatus = 'ACTIVE' | 'CANCELLED';

export interface EventRecord {
  sourceEventId: string;
  contentHash: string;
  sequence: number;
  status: EventStatus;
  scopeMembership: string[];
  startTime: string;
  endTime: string;
  summary: string;
  description?: string;
  locationId?: string;
  sourceUrl?: string;
  lastSeenPeriod: string;
  updatedAt: string;
}

export interface CalendarSnapshot {
  snapshotId: string;
  scopeId: string;
  status: 'staging' | 'complete';
  eventIds: string[];
  generatedAt: string;
  revision: number;
  currentPointer?: string;
}

export type IngestionJobStatus = 'waiting' | 'delayed' | 'active' | 'completed' | 'failed';
export type IngestionLedgerStatus =
  | 'scheduled'
  | 'running'
  | 'publishing'
  | 'succeeded'
  | 'retrying'
  | 'failed';

export interface IngestionJob {
  jobId: string;
  scopeId: string;
  periodStartUtc: string;
  status: IngestionJobStatus;
  attemptsMade: number;
  createdAt: string;
  lastError?: string;
}

export interface IngestionLedger {
  jobId: string;
  scopeId: string;
  periodToken: string;
  status: IngestionLedgerStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  workerId?: string;
  sourceRevision?: string;
  error?: string;
}