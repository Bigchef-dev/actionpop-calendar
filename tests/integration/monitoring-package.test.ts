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

describe('common monitoring stack', () => {
  const COMPOSE_DIR = join(ROOT, 'compose');
  const STACK = readFileSync(join(COMPOSE_DIR, 'docker-compose.yml'), 'utf8');
  const PROMETHEUS_CONF = readFileSync(join(COMPOSE_DIR, 'prometheus.yml'), 'utf8');
  const SNIPPET = readFileSync(join(ROOT, 'prometheus/scrape-snippet.yml'), 'utf8');

  /**
   * The `actionpop` job definition, extracted by indentation so the two files can be compared.
   * Comment lines are dropped: each file explains the same rule in its own words, and only the
   * effective configuration has to match.
   */
  function actionpopJob(source: string): string {
    const lines = source.split('\n');
    const start = lines.findIndex((line) => line.trim() === '- job_name: actionpop');
    if (start === -1) return '';

    const block: string[] = [lines[start] ?? ''];
    for (const line of lines.slice(start + 1)) {
      const indented = line.startsWith('    ') || line.trim() === '';
      if (!indented) break;
      if (line.trim().startsWith('#')) continue;
      block.push(line);
    }
    return block.join('\n').replace(/\n{2,}/g, '\n').trimEnd();
  }

  it('owns the shared network under its plain name', () => {
    // The application joins `monitoring` as external, so this project must create exactly that
    // name rather than a project-prefixed one.
    expect(STACK).toContain('name: ${MONITORING_NETWORK:-monitoring}');
    const networkBlock = STACK.slice(STACK.indexOf('\nnetworks:'));
    expect(networkBlock).not.toContain('external: true');
  });

  it('publishes both consoles on the loopback interface only', () => {
    const portLines = STACK.split('\n').filter((line) => /^\s+- .*:\d+"?$/.test(line));
    expect(portLines.length).toBe(2);
    for (const line of portLines) expect(line.trim()).toMatch(/^- 127\.0\.0\.1:/);
  });

  it('defines the actionpop job exactly as the mergeable snippet does', () => {
    const inStack = actionpopJob(PROMETHEUS_CONF);
    const inSnippet = actionpopJob(SNIPPET);

    expect(inStack).not.toBe('');
    expect(inStack).toBe(inSnippet);
  });

  it('loads the shipped alert rules from the path it mounts', () => {
    expect(PROMETHEUS_CONF).toContain('/etc/prometheus/actionpop-alert-rules.yml');
    expect(STACK).toContain('../prometheus/alert-rules.yml:/etc/prometheus/actionpop-alert-rules.yml:ro');
    expect(STACK).toContain('--web.enable-lifecycle');
    expect(STACK).toMatch(/--storage\.tsdb\.retention\.time=/);
  });

  it('mounts dashboards where the provider looks for them', () => {
    const provider = readFileSync(
      join(ROOT, 'grafana/provisioning/dashboards/actionpop.yml'),
      'utf8',
    );
    const providerPath = /path:\s*(\/\S+)/.exec(provider)?.[1];

    expect(providerPath).toBe('/etc/grafana/actionpop-dashboards');
    expect(STACK).toContain('../grafana/dashboards:/etc/grafana/actionpop-dashboards:ro');
    expect(STACK).toContain('../grafana/provisioning:/etc/grafana/provisioning:ro');
  });

  it('points the datasource at the service defined here', () => {
    const datasource = readFileSync(
      join(ROOT, 'grafana/provisioning/datasources/actionpop.yml'),
      'utf8',
    );
    const url = /url:\s*http:\/\/([^:\s]+):\d+/.exec(datasource)?.[1];

    expect(url).toBe('prometheus');
    expect(STACK).toContain('prometheus:');
    expect(STACK).toContain('grafana:');
  });
});
