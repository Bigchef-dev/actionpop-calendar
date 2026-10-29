import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { ConfigurationError } from '../operations/errors.js';
import { applyEnvironmentOverrides, variableFor } from './config-environment.js';
import { parseConfigurationDocument, type ParsedConfigurationDocument } from './config-schema.js';

export {
  applyEnvironmentOverrides,
  ENVIRONMENT_MAPPINGS,
  variableFor,
} from './config-environment.js';
export { parseConfigurationDocument } from './config-schema.js';
export type {
  ConfigurationOrigin,
  EnvironmentMapping,
  ParsedConfigurationDocument,
} from './config-schema.js';

export const DEFAULT_CONFIG_FILE = 'config/actionpop.yaml';
export const EXAMPLE_CONFIG_FILE = 'config/actionpop.example.yaml';

interface LoadedDocument {
  readonly path: string | undefined;
  readonly document: Record<string, unknown>;
  readonly warning: string | undefined;
}

export function resolveConfigPath(
  env: Record<string, string | undefined>,
  rootDirectory: string,
): string | undefined {
  const configured = env.APP_CONFIG_FILE?.trim();
  if (configured !== undefined && configured !== '') {
    return isAbsolute(configured) ? configured : resolve(rootDirectory, configured);
  }
  return [DEFAULT_CONFIG_FILE, EXAMPLE_CONFIG_FILE]
    .map((name) => resolve(rootDirectory, name))
    .find((candidate) => existsSync(candidate));
}

export function readConfigDocument(
  env: Record<string, string | undefined>,
  rootDirectory: string,
): LoadedDocument {
  const path = resolveConfigPath(env, rootDirectory);
  if (path === undefined) {
    return {
      path: undefined,
      document: {},
      warning: `no configuration file found under ${dirname(resolve(rootDirectory, DEFAULT_CONFIG_FILE))}; using built-in defaults and environment variables`,
    };
  }
  if (!existsSync(path)) {
    throw new ConfigurationError(`APP_CONFIG_FILE points to a missing file: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError(`configuration file ${path} is not valid YAML: ${message}`);
  }

  const document = parsed ?? {};
  if (typeof document !== 'object' || Array.isArray(document)) {
    throw new ConfigurationError(`configuration file ${path} must contain a mapping`);
  }

  return { path, document: document as Record<string, unknown>, warning: undefined };
}

export interface ConfigurationReadResult {
  readonly path: string | undefined;
  readonly warning: string | undefined;
  readonly parsed: ParsedConfigurationDocument;
}

/**
 * Reads the shared YAML document, overlays environment variables and validates
 * the merged result. Environment values always win and the file is never
 * rewritten.
 */
export function readConfiguration(
  env: Record<string, string | undefined>,
  rootDirectory: string,
): ConfigurationReadResult {
  const { path, document, warning } = readConfigDocument(env, rootDirectory);
  const overridden = applyEnvironmentOverrides(env, document);
  const parsed = parseConfigurationDocument(
    overridden.document,
    { path, environmentKeys: overridden.environmentKeys },
    variableFor,
  );
  return { path, warning, parsed };
}
