#!/usr/bin/env node
import { readFileSync } from 'node:fs';

/**
 * Fails when the ZAP report contains a high-severity alert.
 *
 * ZAP classifies risk on a 0-3 scale; `3` is High. The threshold lives here rather than in a flag
 * so the gate is reviewable and can be asserted by a unit test.
 */
const HIGH_RISK = 3;

const reportPath = process.argv[2] ?? 'zap-report/zap-report.json';

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`::error::cannot read the ZAP report at ${reportPath}: ${error.message}`);
  process.exit(1);
}

const alerts = report?.site?.[0]?.alerts ?? [];
const high = alerts.filter((alert) => Number(alert.riskcode) >= HIGH_RISK);

for (const alert of alerts) {
  const level = alert.riskdesc ?? 'Unknown';
  console.log(`${level}: ${alert.name} (${alert.pluginid}) — ${alert.instances?.length ?? 0} instance(s)`);
}

if (high.length > 0) {
  for (const alert of high) {
    console.error(`::error::high severity finding: ${alert.name} (${alert.pluginid})`);
    for (const instance of alert.instances ?? []) {
      console.error(`  ${instance.method ?? 'GET'} ${instance.uri ?? ''}`);
    }
  }
  process.exit(1);
}

console.log(`no high severity finding in ${alerts.length} alert(s)`);
