# Data Model: Technical Foundation

The data model is split by responsibility:

- [Groups and scheduling](data-model-groups.md): scopes, active group catalogue
  records, and processing periods.
- [Events and calendar snapshots](data-model-events.md): event identity, content
  revisions, cancellation, and atomic dataset publication.
- [Locations](data-model-location.md): typed addresses and optional GeoJSON points
  shared by groups and events.
- [Operations](data-model-operations.md): BullMQ jobs, ingestion ledger, runtime
  configuration, and operational signals.

The split preserves this file as the canonical data-model entry point for Spec Kit.
