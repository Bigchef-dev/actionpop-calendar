import { reEnrichEvents } from '../geography/re-enrichment.js';
import {
  refreshGeographicReference,
  type RefreshGeographicReferenceInput,
} from '../geography/reference-refresh.js';
import type { WorkerInfrastructure } from './infrastructure.js';
import type { RefreshGeographicReferenceResultSummary } from './types.js';

/** One-shot operations scripts invoke through the runtime, outside the dispatch cycle. */
export interface WorkerOperations {
  syncObservedEventTypes(values: string[], source?: string): Promise<number>;
  refreshGeographicReference(
    input: RefreshGeographicReferenceInput,
  ): Promise<RefreshGeographicReferenceResultSummary>;
}

export function createWorkerOperations(infra: WorkerInfrastructure): WorkerOperations {
  const { eventTypes, geographicReference, geographicReferenceWriter, postgres, observability } =
    infra;

  return {
    async syncObservedEventTypes(values, source = 'action-populaire') {
      await eventTypes.recordObservedEventTypes(values, source);
      observability.logger.info('event types synced', {
        operation: 'event-type-sync',
        outcome: 'completed',
        values: values.length,
      });
      return values.length;
    },

    async refreshGeographicReference(input) {
      const startedAt = Date.now();
      const previous = await geographicReference.findActiveVersion();
      const result = await refreshGeographicReference(input, geographicReferenceWriter);
      observability.logger.info('geographic reference refresh', {
        operation: 'geographic-refresh',
        outcome: result.status,
        version: result.version,
        source: input.source,
        communes: result.counts.communes,
        departments: result.counts.departments,
        epcis: result.counts.epcis,
        epciMemberships: result.counts.memberships,
        validationErrors: result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
          .length,
        durationMs: Date.now() - startedAt,
      });
      observability.metrics.increment('actionpop_geographic_refresh_total', {
        outcome: result.status,
      });
      observability.metrics.setGauge(
        'actionpop_geographic_reference_epci_count',
        {},
        result.counts.epcis,
      );
      observability.metrics.setGauge(
        'actionpop_geographic_reference_epci_membership_count',
        {},
        result.counts.memberships,
      );

      if (result.status === 'active' && previous !== null) {
        const reEnrichment = await reEnrichEvents(postgres, geographicReference, previous.version);
        observability.logger.info('geographic re-enrichment', {
          operation: 'geographic-re-enrichment',
          outcome: 'completed',
          referenceVersion: result.version,
          examined: reEnrichment.examined,
          updated: reEnrichment.updated,
        });
      }

      return {
        version: result.version,
        status: result.status,
        counts: result.counts,
        diagnosticCount: result.diagnostics.length,
      };
    },
  };
}
