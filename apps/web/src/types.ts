export type CalendarLayout = 'mois' | 'semaine' | 'jour' | 'liste';

export type EventStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';

/** A subject a visitor can search for and then follow. */
export interface SearchSubject {
  kind: string;
  id: string;
  label: string;
  qualifier?: string;
  parent?: string;
  population?: number;
  calendar: { path: string; params: Record<string, string> };
}

export interface SearchAnswer {
  query: string;
  subjects: SearchSubject[];
  total: number;
  kindCounts: Record<string, number>;
}

/** One published extra property of an event, kept as received. */
export interface MetadataEntry {
  name: string;
  value: string;
  parameters: Record<string, string>;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  status: EventStatus;
  eventType: string | null;
  sourceUrl: string | null;
  location: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  metadata: MetadataEntry[];
}

export interface ActionType {
  slug: string;
  label: string;
  emoji: string;
  color: string;
  description: string;
}

export interface CalendarLink {
  subscriptionUrl: string;
  webcalUrl: string;
  downloadUrl: string;
  calendarServiceUrl: string;
  description: string;
  scope: 'display' | 'city-only';
  keepsFilters?: boolean;
}

export interface WeatherEntry {
  code: number;
  precip: number;
  wind: number;
}

/** Selection the visitor carries through the address. */
export interface ScopeSelection {
  kind: string;
  id: string;
  types: string[];
  layout: CalendarLayout;
  eventId: string | null;
}

/** Visitor-facing state of the periodic calendar refresh. */
export type UpdateState = 'updating' | 'up_to_date' | 'stale' | 'partial' | 'unknown';

export type UpdateOutcome = 'complete' | 'partial' | 'failed';

export interface UpdateCounts {
  processed: number;
  failed: number;
  remaining: number;
  total: number;
}

export interface UpdateKindCounts {
  groups: UpdateCounts;
  events: UpdateCounts;
}

export interface CurrentUpdateRun extends UpdateCounts, UpdateKindCounts {
  startedAt: string;
  takingLongerThanUsual: boolean;
}

export interface CompletedUpdateRun extends UpdateKindCounts {
  completedAt: string;
  durationSeconds: number;
  processed: number;
  failed: number;
  outcome: UpdateOutcome;
}

export interface UpdateStatusAnswer {
  checkedAt: string;
  refreshIntervalSeconds: number;
  state: UpdateState;
  current: CurrentUpdateRun | null;
  lastCompleted: CompletedUpdateRun | null;
  history: CompletedUpdateRun[];
  available: { current: boolean; lastCompleted: boolean; history: boolean };
}
