import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = 'infra/monitoring';
const CONTRACT = readFileSync(
  'specs/009-release-hardening-observability/contracts/metrics-exposition.md',
  'utf8',
);
const DATA_MODEL = readFileSync(
  'specs/009-release-hardening-observability/data-model.md',
  'utf8',
);
const METRIC_SOURCE = `${CONTRACT}\n${DATA_MODEL}`;

interface Dashboard {
  uid?: string;
  schemaVersion?: number;
  panels?: Array<{ title?: string; targets?: Array<{ expr?: string }> }>;
}

function dashboards(): Array<{ file: string; dashboard: Dashboard }> {
  const directory = join(ROOT, 'grafana/dashboards');
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({
      file,
      dashboard: JSON.parse(readFileSync(join(directory, file), 'utf8')) as Dashboard,
    }));
}

function expressions(dashboard: Dashboard): string[] {
  return (dashboard.panels ?? []).flatMap((panel) =>
    (panel.targets ?? []).map((target) => target.expr ?? '').filter((expr) => expr !== ''),
  );
}

function metricNamesIn(source: string): Set<string> {
  return new Set([...source.matchAll(/`(actionpop_[a-z0-9_]+)`/g)].map((match) => match[1] ?? ''));
}

describe('monitoring package', () => {
  it('ships two dashboards with a stable uid and a supported schema', () => {
    const found = dashboards();

    expect(found).toHaveLength(2);
    for (const { dashboard } of found) {
      expect(dashboard.schemaVersion).toBe(39);
      expect(dashboard.uid).toMatch(/^actionpop-(launch|operations)$/);
      expect(dashboard.panels?.length ?? 0).toBeGreaterThan(3);
    }
  });

  it('references only metrics that exist in the exposition contract', () => {
    const known = metricNamesIn(METRIC_SOURCE);
    const unknown = new Set<string>();

    for (const { dashboard } of dashboards()) {
      for (const expr of expressions(dashboard)) {
        for (const match of expr.matchAll(/\b(actionpop_[a-z0-9_]+)/g)) {
          const name = (match[1] ?? '').replace(/_(bucket|sum|count)$/, '');
          if (!known.has(name)) unknown.add(name);
        }
      }
    }

    expect([...unknown]).toEqual([]);
  });

  it('keeps the alert rules complete, including absence guards', () => {
    const alerts = readFileSync(join(ROOT, 'prometheus/alert-rules.yml'), 'utf8');

    for (const name of [
      'ActionPopUnreachable',
      'ActionPopMetricsMissing',
      'ActionPopDependencyDown',
      'ActionPopIngestionStale',
      'ActionPopRejectedBurst',
      'ActionPopCalendarUnavailable',
      'ActionPopQueueGrowing',
      'ActionPopTruncation',
    ]) {
      expect(alerts).toContain(`alert: ${name}`);
    }
    expect(alerts).toContain('absent(actionpop_http_requests_total)');
    expect(alerts).toContain('severity: critical');
    expect(alerts).toContain('severity: warning');
  });

  it('scrapes both services over the private network', () => {
    const scrape = readFileSync(join(ROOT, 'prometheus/scrape-snippet.yml'), 'utf8');

    expect(scrape).toContain('job_name: actionpop');
    expect(scrape).toContain("api:3000");
    expect(scrape).toContain("worker:8081");
    expect(scrape).toContain('/internal/metrics');
  });

  it('ships provisioning that needs no manual mapping', () => {
    const datasource = readFileSync(
      join(ROOT, 'grafana/provisioning/datasources/actionpop.yml'),
      'utf8',
    );
    const provider = readFileSync(
      join(ROOT, 'grafana/provisioning/dashboards/actionpop.yml'),
      'utf8',
    );

    expect(datasource).toContain('uid: actionpop-prometheus');
    expect(provider).toContain('/etc/grafana/actionpop-dashboards');
  });

  it('shows a quiet period as zero rather than a gap on traffic panels', () => {
    const launch = dashboards().find(({ file }) => file === 'actionpop-launch.json');

    expect(launch).toBeDefined();
    const visitPanel = launch?.dashboard.panels?.find((panel) => panel.title === 'Visits');
    expect(visitPanel?.targets?.[0]?.expr).toContain('or vector(0)');
  });
});
