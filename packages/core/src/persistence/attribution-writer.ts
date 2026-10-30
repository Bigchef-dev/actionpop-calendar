import { diffAttribution } from '../groups/attribution-reconciliation.js';
import { normalizeScopeIdentity, toObservedGroups } from '../groups/observed-groups.js';
import type { PublishedEvent } from '../models/event.interface.js';
import type { RegistryClient, ScopeIdLookup } from './postgres-group-registry.js';

export interface AttributionWriteResult {
  readonly added: number;
  readonly removed: number;
  readonly eventsWithoutGroup: number;
  /** Number of distinct groups this observation states for the event. */
  readonly statedGroups: number;
}

/**
 * Reconciles the attribution contributed by one observing listing. Links stated by
 * another listing are never touched, so the published attribution is the union of
 * the complete observations that still hold.
 *
 * `scopeIds` maps normalized identifiers to the registered spelling, which is what
 * the link foreign keys reference: a payload may spell a group differently from the
 * row that already exists for it.
 */
export async function writeEventAttribution(
  transaction: RegistryClient,
  event: PublishedEvent,
  observingScopeId: string,
  periodToken: string,
  scopeIds: ScopeIdLookup,
): Promise<AttributionWriteResult> {
  const { groups } = toObservedGroups(event.groups ?? []);
  const stated = [
    ...new Set(groups.map((group) => scopeIds.get(normalizeScopeIdentity(group.id)) ?? group.id)),
  ];

  const previous = await transaction.eventGroupLink.findMany({
    where: { eventId: event.sourceEventId, observedViaScopeId: observingScopeId },
    select: { scopeId: true },
  });
  const diff = diffAttribution(
    previous.map((link) => link.scopeId),
    stated,
  );

  const removed =
    diff.toRemove.length === 0
      ? 0
      : (
          await transaction.eventGroupLink.deleteMany({
            where: {
              eventId: event.sourceEventId,
              observedViaScopeId: observingScopeId,
              scopeId: { in: [...diff.toRemove] },
            },
          })
        ).count;

  const added =
    diff.toAdd.length === 0
      ? 0
      : (
          await transaction.eventGroupLink.createMany({
            data: diff.toAdd.map((scopeId) => ({
              eventId: event.sourceEventId,
              scopeId,
              observedViaScopeId: observingScopeId,
            })),
            skipDuplicates: true,
          })
        ).count;

  await transaction.eventObservation.upsert({
    where: {
      eventId_viaScopeId: { eventId: event.sourceEventId, viaScopeId: observingScopeId },
    },
    create: {
      eventId: event.sourceEventId,
      viaScopeId: observingScopeId,
      statedGroupCount: stated.length,
      firstSeenPeriod: periodToken,
      lastSeenPeriod: periodToken,
    },
    update: { statedGroupCount: stated.length, lastSeenPeriod: periodToken },
  });

  const linkCount = await transaction.eventGroupLink.count({
    where: { eventId: event.sourceEventId },
  });
  await transaction.eventRecord.update({
    where: { sourceEventId: event.sourceEventId },
    data: { groupAttribution: linkCount === 0 ? 'none_stated' : 'stated' },
  });

  return {
    added,
    removed,
    eventsWithoutGroup: stated.length === 0 ? 1 : 0,
    statedGroups: stated.length,
  };
}
