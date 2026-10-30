import { toObservedGroups, type StatedGroup } from '../groups/observed-groups.js';
import type { RetrievalStatus } from '../groups/group-status.js';

/** One complete observation, reduced to what decides an event scope's life. */
export interface EventObservationShape {
  readonly groups?: readonly StatedGroup[] | undefined;
  readonly endTime: string;
}

export type EventRetirementReason = 'event_ended' | 'event_group_stated' | 'event_unknown';

export type EventScopeDecision =
  | { readonly type: 'retire'; readonly reason: EventRetirementReason }
  | { readonly type: 'reopen' }
  | { readonly type: 'unchanged' };

export interface EventScopeState {
  readonly retrievalStatus: RetrievalStatus;
  readonly eventEndsAt: Date | null;
  /** True when the observation that produced this state states at least one group. */
  readonly statesGroup: boolean;
  readonly unknownAnswer: boolean;
  /** Present when this cycle produced a complete observation of the event. */
  readonly observation?: EventObservationShape;
}

const UNCHANGED: EventScopeDecision = { type: 'unchanged' };
const REOPEN: EventScopeDecision = { type: 'reopen' };

function retire(reason: EventRetirementReason): EventScopeDecision {
  return { type: 'retire', reason };
}

/**
 * An event needs its own ingestion when a complete observation states no group for it
 * and it has not ended: nothing else will observe it again. The same rule decides
 * creation and re-opening, so a lost organizer never strands an event.
 */
export function requiresEventIngestion(
  observation: EventObservationShape,
  observedAt: Date,
): boolean {
  const { groups } = toObservedGroups(observation.groups ?? []);
  if (groups.length > 0) return false;

  const endsAt = new Date(observation.endTime);
  if (Number.isNaN(endsAt.getTime())) return false;
  return endsAt.getTime() > observedAt.getTime();
}

/**
 * Applies one cycle to an event scope. A definitive unknown answer wins over the other
 * reasons, a scope is never retired twice, and a retired scope only comes back when the
 * event qualifies again.
 */
export function nextEventScopeStatus(state: EventScopeState, now: Date): EventScopeDecision {
  if (state.retrievalStatus === 'retired') {
    return state.observation !== undefined && requiresEventIngestion(state.observation, now)
      ? REOPEN
      : UNCHANGED;
  }
  if (state.retrievalStatus !== 'pending' && state.retrievalStatus !== 'active') {
    return UNCHANGED;
  }

  if (state.unknownAnswer) return retire('event_unknown');
  if (state.statesGroup) return retire('event_group_stated');
  if (state.eventEndsAt !== null && state.eventEndsAt.getTime() <= now.getTime()) {
    return retire('event_ended');
  }
  return UNCHANGED;
}
