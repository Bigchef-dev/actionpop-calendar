import { describe, expect, it } from 'vitest';

import { CliUsageError, parseCliArgs } from './cli-args.js';

describe('worker CLI arguments', () => {
  it('prints help when no command is given', () => {
    expect(parseCliArgs([])).toEqual({ kind: 'help' });
    expect(parseCliArgs(['--help'])).toEqual({ kind: 'help' });
  });

  it('parses map:run', () => {
    expect(parseCliArgs(['map:run'])).toEqual({ kind: 'map:run', json: false });
    expect(parseCliArgs(['map:run', '--json'])).toEqual({ kind: 'map:run', json: true });
  });

  it('parses reset targets and defaults to dry-run', () => {
    expect(parseCliArgs(['reset', '--target', 'groups'])).toEqual({
      kind: 'reset',
      targets: ['groups'],
      apply: false,
      json: false,
    });
    expect(parseCliArgs(['reset', '--target=groups,events', '--yes', '--json'])).toEqual({
      kind: 'reset',
      targets: ['groups', 'events'],
      apply: true,
      json: true,
    });
  });

  it('accepts repeated, singular and duplicate targets', () => {
    expect(parseCliArgs(['reset', '--target', 'group', '--target', 'map,events'])).toMatchObject({
      targets: ['groups', 'map', 'events'],
    });
    expect(parseCliArgs(['reset', '--target', 'groups,groups'])).toMatchObject({
      targets: ['groups'],
    });
  });

  it('rejects an unknown target, flag or command', () => {
    expect(() => parseCliArgs(['reset', '--target', 'nope'])).toThrow(CliUsageError);
    expect(() => parseCliArgs(['reset'])).toThrow(/requires --target/);
    expect(() => parseCliArgs(['map:run', '--yes'])).toThrow(/only --json/);
    expect(() => parseCliArgs(['map:run', '--unknown'])).toThrow(/unknown argument/);
    expect(() => parseCliArgs(['inspect'])).toThrow(/unknown command/);
  });
});
