import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

let directory: string;

function report(alerts: ReadonlyArray<{ riskcode: string; name: string }>): string {
  return JSON.stringify({ site: [{ alerts }] });
}

async function gate(json: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const path = join(directory, `report-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(path, json, 'utf8');
  try {
    const { stdout, stderr } = await run('node', ['scripts/zap-gate.mjs', path]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'zap-gate-'));
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('security gate', () => {
  it('passes a report with no high severity finding', async () => {
    const result = await gate(
      report([
        { riskcode: '1', name: 'Low informational' },
        { riskcode: '2', name: 'Medium finding' },
      ]),
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('no high severity finding in 2 alert(s)');
  });

  it('blocks a report containing one high severity finding', async () => {
    const result = await gate(
      report([
        { riskcode: '1', name: 'Low informational' },
        { riskcode: '3', name: 'Deliberately provoked high finding' },
      ]),
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('high severity finding: Deliberately provoked high finding');
  });

  it('blocks when the report cannot be read', async () => {
    const result = await gate('not json');

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('cannot read the ZAP report');
  });
});
