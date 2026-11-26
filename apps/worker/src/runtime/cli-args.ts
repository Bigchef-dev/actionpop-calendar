import { parseResetTarget, type ResetTarget } from './maintenance-targets.js';

export type CliCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'map:run'; readonly json: boolean }
  | {
      readonly kind: 'reset';
      readonly targets: readonly ResetTarget[];
      readonly apply: boolean;
      readonly json: boolean;
    };

export class CliUsageError extends Error {}

export function usageText(): string {
  return [
    'Usage:',
    '  worker-cli map:run [--json]',
    '  worker-cli reset --target <groups,events,map> [--yes] [--json]',
    '',
    'reset est un dry-run par défaut : ajoutez --yes pour appliquer.',
  ].join('\n');
}

function takeTargets(raw: string | undefined): ResetTarget[] {
  if (raw === undefined || raw.trim() === '') {
    throw new CliUsageError('--target requires at least one of: groups, events, map');
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '')
    .map((value) => {
      try {
        return parseResetTarget(value);
      } catch (error) {
        throw new CliUsageError(error instanceof Error ? error.message : String(error));
      }
    });
}

/**
 * Parses the operator command line. Kept pure so the accepted grammar is unit-tested
 * without connecting to Redis or Postgres.
 */
export function parseCliArgs(argv: readonly string[]): CliCommand {
  const command = argv[0];
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    return { kind: 'help' };
  }

  let json = false;
  let apply = false;
  const targets: ResetTarget[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    if (argument === '--json') {
      json = true;
    } else if (argument === '--yes' || argument === '-y') {
      apply = true;
    } else if (argument === '--dry-run') {
      apply = false;
    } else if (argument === '--target' || argument.startsWith('--target=')) {
      const value =
        argument === '--target' ? argv[(index += 1)] : argument.slice('--target='.length);
      targets.push(...takeTargets(value));
    } else {
      throw new CliUsageError(`unknown argument "${argument}"`);
    }
  }

  if (command === 'map:run') {
    if (targets.length > 0 || apply) {
      throw new CliUsageError('map:run accepts only --json');
    }
    return { kind: 'map:run', json };
  }
  if (command === 'reset') {
    if (targets.length === 0) {
      throw new CliUsageError('reset requires --target groups, events and/or map');
    }
    return { kind: 'reset', targets: [...new Set(targets)], apply, json };
  }
  throw new CliUsageError(`unknown command "${command}"`);
}
