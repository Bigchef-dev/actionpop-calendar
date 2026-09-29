# ActionPop Calendar

ActionPop Calendar is a pnpm TypeScript monorepo with three workspace units:

- `packages/core`: shared domain contracts and adapters
- `apps/api`: public read-only calendar API
- `apps/worker`: scheduled ingestion and BullMQ processing

## Requirements

- Node.js 20+ LTS
- Corepack with pnpm enabled

Enable the pinned package-manager version and install dependencies from the lockfile:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Run the complete repository quality pipeline:

```bash
pnpm quality
```

The quality pipeline runs strict project-reference type checking, linting, package
tests, integration tests, and builds for all workspace units. Individual checks are
also available:

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm lint
pnpm build
```

Focused package commands use pnpm filters:

```bash
pnpm --filter @actionpop/core test
pnpm --filter @actionpop/api test
pnpm --filter @actionpop/worker test
```

To verify the typecheck gate, run the dedicated regression test. It creates a
temporary public TypeScript value with an invalid type and expects `tsc -b` to report
the affected file:

```bash
pnpm exec vitest run tests/integration/typecheck-gate.test.ts --config vitest.config.ts
```

The workspace keeps the API and worker independently deployable. Shared code belongs
in `packages/core`; service-specific code stays in its application package. Runtime
configuration and deployment details are documented in the technical foundation
quickstart under `specs/001-technical-foundation/quickstart.md`.