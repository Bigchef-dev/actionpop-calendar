import { fileURLToPath } from 'node:url';

import { loadEnvFile } from '@actionpop/core';

import { createIngestionDependencies } from './runtime/ingestion-dependencies.js';
import { createWorkerInfrastructure } from './runtime/infrastructure.js';
import {
  applyReset,
  previewReset,
  runMapDiscoveryOnce,
  type ResetSummary,
} from './runtime/maintenance.js';
import { closeInfrastructure } from './runtime/startup.js';
import { CliUsageError, parseCliArgs, usageText } from './runtime/cli-args.js';

function printReset(summary: ResetSummary, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const mode = summary.applied ? 'applied' : 'dry-run (add --yes to apply)';
  console.log(`Reset ${mode} — period ${summary.periodToken}`);
  console.log(`  targets:            ${summary.targets.join(', ')}`);
  console.log(`  scopes -> pending:  ${summary.scopesToPending}`);
  console.log(`  ledger rows:        ${summary.ledgerRows}`);
  console.log(`  queued jobs:        ${summary.queuedJobs} (active, kept: ${summary.activeJobs})`);
  if (summary.targets.includes('map')) {
    console.log(`  map observations:   ${summary.observations}`);
  }
  if (summary.applied) {
    console.log(`  removed jobs:       ${summary.removedJobs}`);
    console.log(`  failed removals:    ${summary.failedRemovals}`);
  }
}

/** Runs the operator CLI and returns the process exit code. */
export async function runCli(argv: readonly string[]): Promise<number> {
  const command = parseCliArgs(argv);
  if (command.kind === 'help') {
    console.log(usageText());
    return 0;
  }

  loadEnvFile();
  const infra = createWorkerInfrastructure(process.env, {
    logSink: (line) => console.error(line),
  });
  try {
    if (command.kind === 'map:run') {
      const result = await runMapDiscoveryOnce(infra, createIngestionDependencies(infra));
      if (command.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Map discovery ${result.status} — job ${result.jobId}`);
        if (result.error !== undefined) console.log(`  error: ${result.error}`);
      }
      return result.status === 'failed' ? 1 : 0;
    }

    const summary = command.apply
      ? await applyReset(infra, { targets: command.targets })
      : await previewReset(infra, { targets: command.targets });
    printReset(summary, command.json);
    return summary.failedRemovals > 0 ? 1 : 0;
  } finally {
    await closeInfrastructure(infra);
  }
}

const isEntryModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryModule) {
  void runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      if (error instanceof CliUsageError) {
        console.error(error.message);
        console.error(usageText());
        process.exitCode = 2;
        return;
      }
      console.error('worker cli failed', error);
      process.exitCode = 1;
    });
}
