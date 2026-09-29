# ActionPop Calendar

ActionPop Calendar is a pnpm TypeScript monorepo with three workspace units:

- `packages/core`: shared domain contracts and adapters
- `apps/api`: public read-only calendar API
- `apps/worker`: scheduled ingestion and BullMQ processing

## Requirements

- Node.js 20+ LTS
- Corepack with pnpm enabled

Enable the pinned package-manager version and install dependencies:

```bash
corepack enable
pnpm install
```

Run the repository quality checks:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Focused package commands use pnpm filters:

```bash
pnpm --filter @actionpop/core test
pnpm --filter @actionpop/api test
pnpm --filter @actionpop/worker test
```

The workspace keeps the API and worker independently deployable. Shared code belongs
in `packages/core`; service-specific code stays in its application package. Runtime
configuration and deployment details are documented in the technical foundation
quickstart under `specs/001-technical-foundation/quickstart.md`.