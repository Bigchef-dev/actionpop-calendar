<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.0.1
- Modified principles: none
- Added sections: Europe/Paris timezone constraint in Technology and Deployment
- Removed sections: none
- Follow-up TODOs: none
-->

# ActionPop Calendar Constitution

## Core Principles

### I. Independent Features
Every feature MUST have a clear boundary, a focused public contract, and tests that
can run independently of unrelated features. Business logic MUST remain separate
from transport, persistence, and external API adapters so that feature behavior can
be verified without requiring the full application stack. This keeps changes
isolated and makes failures actionable.

### II. TypeScript and Verified Types
Production code MUST use TypeScript with strict type checking enabled. Public
interfaces, domain models, external payloads, and adapter boundaries MUST have
explicit types. Type assertions and `any` MUST be avoided; when unavoidable, they
require a narrow boundary and a documented reason. The type checker is a required
quality gate.

### III. Test-First Quality
Every feature MUST include automated tests for its business rules before it is
considered complete. Tests MUST cover the normal path, relevant validation and
error paths, and stable contracts at integration boundaries. A feature is not
complete when its implementation works locally but its independent test does not.

### IV. Small and Maintainable Business Logic
Business modules SHOULD remain between 100 and 150 lines maximum unless a larger
size is justified by a cohesive contract. When a module exceeds that limit, its
responsibilities MUST be reviewed and split where the boundaries are meaningful.
Code MUST favor simple control flow, named domain concepts, and existing project
patterns over premature abstraction. The limit exists to preserve reviewability
and maintenance, not to encourage artificial fragmentation.

### V. Deployable by Default
The application MUST be runnable and deployable through Docker with a documented,
repeatable build and startup path. Runtime configuration MUST be supplied through
environment variables or deployment configuration rather than hard-coded secrets
or host-specific assumptions. A feature is deployable only when it preserves the
documented container workflow and required health or failure behavior.

## Technology and Deployment

The implementation stack is TypeScript on Node.js, with strict type checking and
an automated test runner selected in the project tooling. HTTP, external API, and
calendar-format dependencies MUST be isolated behind adapters or focused services.
Docker images MUST use reproducible dependency installation and expose only the
runtime configuration needed by the application. Feature-level choices, including
cache strategy and event sequencing, belong in the relevant feature specification
and MUST NOT be treated as global architectural rules without amendment. All
application date and time handling MUST use `Europe/Paris` as the canonical
project timezone unless a feature specification explicitly defines another zone.

## Development Workflow

Each change MUST identify its affected feature boundary, update or add the
corresponding tests, and pass type checking before review. Reviews MUST verify
independent testability, module size, error handling, and Docker deployability
when those surfaces are affected. Changes that alter an external or user-facing
contract MUST document the compatibility impact and update contract tests.

## Governance

This constitution is the governing quality standard for the repository. Amendments
MUST state the reason for the change, update the semantic version, and record the
last amendment date. Versioning follows semantic versioning: MAJOR for removed or
incompatible governance rules, MINOR for new or materially expanded rules, and
PATCH for clarifications or non-semantic corrections.

Every feature review MUST check compliance with the principles and workflow above.
Exceptions MUST be explicit in the feature plan or review record, explain the
tradeoff, and define a follow-up when the exception is temporary. The constitution
MUST be reviewed whenever the project stack, deployment model, or quality gates
change materially.

**Version**: 1.0.1 | **Ratified**: 2026-09-14 | **Last Amended**: 2026-09-24
