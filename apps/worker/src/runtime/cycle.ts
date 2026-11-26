import { LEDGER_GRACE_MS } from '@actionpop/core';

import { synchronizeDirectory } from '../catalogue/directory-sync.js';
import { reconcileIngestionLedger } from '../operations/ledger-reconciliation.js';
import type { WorkerInfrastructure } from './infrastructure.js';

interface CycleDispatcher {
  runOnce(): Promise<void>;
}

/**
 * One periodic cycle. Every step before dispatch is fail-soft: an unavailable map
 * directory or spatial reference must not cost the catalogue that was just
 * synchronized, and a stale ledger must not block scheduling.
 */
export function createDispatchCycle(
  infra: WorkerInfrastructure,
  dispatcher: CycleDispatcher,
): () => Promise<void> {
  return async () => {
    await synchronizeCatalogue(infra);
    await refreshGroupAttachments(infra);
    await reconcileLedger(infra);
    await dispatcher.runOnce();
  };
}

async function synchronizeCatalogue(infra: WorkerInfrastructure): Promise<void> {
  const { client, catalogue, observability } = infra;
  const directory = await synchronizeDirectory(
    () => client.fetchGroupCatalogue(),
    (value) => catalogue.synchronize(value),
  );
  if (!directory.synced) {
    observability.logger.warn('map directory unavailable', {
      operation: 'catalogue-sync',
      outcome: 'skipped',
      ...(directory.failure === undefined ? {} : { failure: directory.failure }),
    });
  }
}

/** A spatial failure reports its own outcome and never throws into the cycle. */
async function refreshGroupAttachments(infra: WorkerInfrastructure): Promise<void> {
  const { geographicReference, groupAttachments, observability } = infra;
  const activeVersion = await geographicReference.findActiveVersion().catch(() => null);
  if (activeVersion === null) return;

  const attachment = await groupAttachments
    .refresh(activeVersion.version)
    .catch((error: unknown) => {
      observability.logger.warn('group attachment failed', {
        operation: 'group-attachment',
        outcome: 'failed',
        failure: error instanceof Error ? error.message : 'unknown failure',
      });
      return undefined;
    });
  if (attachment === undefined) return;

  observability.logger.info('group attachment', {
    operation: 'group-attachment',
    outcome: 'completed',
    referenceVersion: attachment.version,
    resolved: attachment.resolved,
    incomplete: attachment.incomplete,
    international: attachment.international,
    invalid: attachment.invalid,
    skipped: attachment.skipped,
    failed: attachment.failed,
  });
  for (const outcome of ['resolved', 'incomplete', 'international', 'invalid', 'failed'] as const) {
    observability.metrics.increment(
      'actionpop_group_attachment_total',
      { outcome },
      attachment[outcome],
    );
  }
  observability.metrics.increment(
    'actionpop_group_attachment_total',
    { outcome: 'skipped' },
    attachment.skipped,
  );
}

async function reconcileLedger(infra: WorkerInfrastructure): Promise<void> {
  const reconciled = await reconcileIngestionLedger(
    infra.postgres,
    infra.queue,
    new Date(Date.now() - LEDGER_GRACE_MS),
  );
  if (reconciled.succeeded + reconciled.failed > 0) {
    infra.observability.logger.warn('ingestion ledger reconciled', {
      operation: 'ingestion-ledger',
      outcome: 'reconciled',
      ...reconciled,
    });
  }
}
