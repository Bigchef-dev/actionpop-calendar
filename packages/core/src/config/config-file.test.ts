import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ConfigurationError } from '../operations/errors.js';
import {
  applyEnvironmentOverrides,
  parseConfigurationDocument,
  readConfigDocument,
  resolveConfigPath,
  variableFor,
} from './config-file.js';
import { loadConfiguration, parseRuntimeConfig } from './runtime-config.js';

const directories: string[] = [];

function workspace(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'actionpop-config-'));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    const target = join(directory, name);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const BASE_ENV = { REDIS_URL: 'redis://localhost:6379' };

describe('configuration file', () => {
  it('loads a valid document and keeps calendar defaults for absent keys', () => {
    const directory = workspace({
      'app.yaml': 'calendar:\n  lookbackDays: 7\n',
    });

    const { config } = loadConfiguration({ ...BASE_ENV, APP_CONFIG_FILE: 'app.yaml' }, 'api', directory);

    expect(config.calendar.lookbackDays).toBe(7);
    expect(config.calendar.lookaheadDays).toBe(90);
    expect(config.calendar.maxEntries).toBe(1000);
    expect(config.calendar.maxGroupsPerEvent).toBe(5);
    expect(config.calendar.metadataLevel).toBe('standard');
  });

  it('falls back to defaults plus environment when no file exists', () => {
    const directory = workspace({});

    const result = loadConfiguration(BASE_ENV, 'api', directory);

    expect(result.path).toBeUndefined();
    expect(result.warning).toContain('no configuration file found');
    expect(result.config.calendar.lookbackDays).toBe(30);
    expect(result.config.redis.url).toBe('redis://localhost:6379');
  });

  it('fails when an explicitly named file is missing', () => {
    const directory = workspace({});

    expect(() =>
      loadConfiguration({ ...BASE_ENV, APP_CONFIG_FILE: 'absent.yaml' }, 'api', directory),
    ).toThrow(/APP_CONFIG_FILE points to a missing file/);
  });

  it('reports malformed YAML with the file path', () => {
    const directory = workspace({ 'app.yaml': 'calendar:\n  lookbackDays: [unclosed\n' });

    expect(() =>
      loadConfiguration({ ...BASE_ENV, APP_CONFIG_FILE: 'app.yaml' }, 'api', directory),
    ).toThrow(/is not valid YAML/);
  });

  it('rejects an unknown top-level key', () => {
    const directory = workspace({ 'app.yaml': 'calender:\n  lookbackDays: 7\n' });

    expect(() =>
      loadConfiguration({ ...BASE_ENV, APP_CONFIG_FILE: 'app.yaml' }, 'api', directory),
    ).toThrow(/configuration is invalid/);
  });

  it.each([
    ['lookbackDays: -1', /lookbackDays/],
    ['lookaheadDays: 0', /lookaheadDays/],
    ['maxEntries: 0', /maxEntries/],
    ['maxGroupsPerEvent: 0', /maxGroupsPerEvent/],
    ['revalidationSeconds: -5', /revalidationSeconds/],
    ['metadataLevel: verbose', /metadataLevel/],
    ['disabledFamilies: [colours]', /disabledFamilies/],
  ])('rejects %s', (fragment, pattern) => {
    const directory = workspace({ 'app.yaml': `calendar:\n  ${fragment}\n` });

    expect(() =>
      loadConfiguration({ ...BASE_ENV, APP_CONFIG_FILE: 'app.yaml' }, 'api', directory),
    ).toThrow(pattern);
  });

  it('lets the environment win without rewriting the file', () => {
    const directory = workspace({ 'app.yaml': 'calendar:\n  lookbackDays: 7\n' });
    const env = {
      ...BASE_ENV,
      APP_CONFIG_FILE: 'app.yaml',
      CALENDAR_LOOKBACK_DAYS: '12',
    };

    const { config } = loadConfiguration(env, 'api', directory);
    expect(config.calendar.lookbackDays).toBe(12);
    expect(readConfigDocument(env, directory).document).toMatchObject({
      calendar: { lookbackDays: 7 },
    });
  });

  it('names the environment variable as the origin of an invalid value', () => {
    const directory = workspace({ 'app.yaml': 'calendar:\n  lookbackDays: 7\n' });

    expect(() =>
      loadConfiguration(
        { ...BASE_ENV, APP_CONFIG_FILE: 'app.yaml', CALENDAR_LOOKAHEAD_DAYS: '0' },
        'api',
        directory,
      ),
    ).toThrow(/CALENDAR_LOOKAHEAD_DAYS/);
  });

  it('parses comma-separated families and boolean overrides', () => {
    const directory = workspace({ 'app.yaml': 'calendar:\n  metadataLevel: full\n' });

    const { config } = loadConfiguration(
      {
        ...BASE_ENV,
        APP_CONFIG_FILE: 'app.yaml',
        CALENDAR_DISABLED_FAMILIES: 'geography, diagnostics',
        CALENDAR_ENABLED: 'false',
      },
      'api',
      directory,
    );

    expect(config.calendar.disabledFamilies).toEqual(['geography', 'diagnostics']);
    expect(config.calendar.enabled).toBe(false);
  });

  it('prefers the runtime copy over the example when no path is given', () => {
    const directory = workspace({
      'config/actionpop.yaml': 'calendar:\n  lookbackDays: 3\n',
      'config/actionpop.example.yaml': 'calendar:\n  lookbackDays: 30\n',
    });

    expect(resolveConfigPath(BASE_ENV, directory)).toContain('actionpop.yaml');
    expect(parseRuntimeConfig(BASE_ENV, 'api', directory).calendar.lookbackDays).toBe(3);
  });

  it('exposes the merged document with environment keys for origin reporting', () => {
    const { document, environmentKeys } = applyEnvironmentOverrides(
      { CALENDAR_MAX_ENTRIES: '25' },
      { calendar: { maxEntries: 1000 } },
    );

    expect(document).toMatchObject({ calendar: { maxEntries: 25 } });
    expect(environmentKeys.has('calendar.maxEntries')).toBe(true);

    const parsed = parseConfigurationDocument(
      document,
      { path: undefined, environmentKeys },
      variableFor,
    );
    expect(parsed.calendar.maxEntries).toBe(25);
  });

  it('ignores an invalid document phase only through ConfigurationError', () => {
    expect(() =>
      parseConfigurationDocument(
        { calendar: { maxEntries: 'many' } },
        { path: 'app.yaml', environmentKeys: new Set() },
        variableFor,
      ),
    ).toThrow(ConfigurationError);
  });

  it('gives the API and the worker the same calendar settings from one document', () => {
    const directory = workspace({
      'config/actionpop.yaml': 'calendar:\n  maxEntries: 42\n  metadataLevel: full\n',
    });

    const api = loadConfiguration(BASE_ENV, 'api', directory);
    const worker = loadConfiguration({ ...BASE_ENV, UPSTREAM_BASE_URL: 'https://example.test' }, 'worker', directory);

    expect(api.config.calendar).toEqual(worker.config.calendar);
    expect(api.config.calendar.maxEntries).toBe(42);
    expect(api.config.calendar.metadataLevel).toBe('full');
    expect(api.config.app.service).toBe('api');
    expect(worker.config.app.service).toBe('worker');
  });

  it('names the environment variable when a list item is invalid', () => {
    const directory = workspace({ 'app.yaml': 'calendar:\n  metadataLevel: standard\n' });

    expect(() =>
      loadConfiguration(
        { ...BASE_ENV, APP_CONFIG_FILE: 'app.yaml', CALENDAR_DISABLED_FAMILIES: 'colours' },
        'api',
        directory,
      ),
    ).toThrow(/CALENDAR_DISABLED_FAMILIES/);
  });
});
