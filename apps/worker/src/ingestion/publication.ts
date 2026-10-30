import type {
  IncomingEvent,
  MetricsRegistry,
  PublicationSummary,
  PublishedEvent,
  PublishedGroupSnapshot,
  ScopeKind,
} from '@actionpop/core';

export interface PublicationDependencies {
  readonly revisions: {
    publish(
      scopeId: string,
      incoming: IncomingEvent[],
      complete?: boolean,
      periodToken?: string,
    ): Promise<{ snapshot: PublishedGroupSnapshot; events: PublishedEvent[] }>;
  };
  readonly publisher: {
    publish(
      scopeId: string,
      snapshot: PublishedGroupSnapshot,
      events: PublishedEvent[],
    ): Promise<PublicationSummary>;
  };
}

/**
 * Publishes one complete observation, whatever produced it: a group listing and an
 * event detail must land on the same revision, snapshot and attribution path.
 */
export async function publishObservation(
  scopeId: string,
  scopeKind: ScopeKind,
  incoming: readonly IncomingEvent[],
  periodToken: string,
  deps: PublicationDependencies,
): Promise<PublicationSummary> {
  const publication = await deps.revisions.publish(scopeId, [...incoming], true, periodToken);
  return deps.publisher.publish(
    scopeId,
    { ...publication.snapshot, scopeKind },
    publication.events,
  );
}

/**
 * Cumulative mirror of the per-cycle publication counters, so `/metrics` answers "how
 * many unlisted groups, group-less events and attribution changes so far". A zero
 * change publishes nothing, which keeps the registry readable.
 */
export function countPublication(metrics: MetricsRegistry, summary: PublicationSummary): void {
  const counters: readonly (readonly [string, number])[] = [
    ['actionpop_groups_discovered_total', summary.discoveredUnlisted],
    ['actionpop_groups_re_enabled_total', summary.reEnabled],
    ['actionpop_events_without_group_total', summary.eventsWithoutGroup],
    ['actionpop_attributions_added_total', summary.attributionsAdded],
    ['actionpop_attributions_removed_total', summary.attributionsRemoved],
    ['actionpop_event_ingestions_created_total', summary.eventScopesCreated],
    ['actionpop_event_ingestions_retired_total', summary.eventScopesRetired],
  ];

  for (const [name, value] of counters) {
    if (value > 0) metrics.increment(name, {}, value);
  }
}
