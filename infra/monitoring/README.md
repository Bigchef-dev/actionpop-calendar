# Monitoring package

Dashboards, alert rules and the scrape definition for the Prometheus and Grafana that already run
on the server. This directory is **mounted by the monitoring stack**, not by the application stack.

## What the application exposes

| Service | Address on the `monitoring` network | Path |
|---|---|---|
| API | `api:3000` | `/internal/metrics` |
| Worker | `worker:8081` | `/metrics` |

Neither is published on the host and neither is routed by the edge, so usage data is reachable
from the monitor only.

## Installation

1. **Create the shared network once** on the host, outside both Compose projects:

   ```bash
   docker network create monitoring
   ```

   Name it with `MONITORING_NETWORK` in the application `.env` if you need another name; declare
   the same name as `external: true` in the monitoring Compose project.

2. **Start the application stack** (it joins the network automatically):

   ```bash
   docker compose -f infra/compose/docker-compose.yml up -d
   ```

3. **Merge the scrape job** into the monitor's Prometheus configuration:

   ```bash
   cat infra/monitoring/prometheus/scrape-snippet.yml
   ```

   Copy the `actionpop` entry into `scrape_configs`. Reload Prometheus:

   ```bash
   curl -X POST http://localhost:9090/-/reload     # requires --web.enable-lifecycle
   ```

4. **Mount the alert rules** by adding the file to Prometheus `rule_files`:

   ```yaml
   rule_files:
     - /etc/prometheus/actionpop-alert-rules.yml
   ```

   ```yaml
   # monitoring compose, prometheus service
   volumes:
     - ./actionpop/prometheus/alert-rules.yml:/etc/prometheus/actionpop-alert-rules.yml:ro
   ```

5. **Mount the Grafana files**:

   ```yaml
   # monitoring compose, grafana service
   volumes:
     - ./actionpop/grafana/provisioning:/etc/grafana/provisioning/actionpop:ro
     - ./actionpop/grafana/dashboards:/etc/grafana/actionpop-dashboards:ro
   ```

   The provider points at `/etc/grafana/actionpop-dashboards`; if your Grafana keeps providers in
   a different directory, copy `provisioning/*` there and adjust only that path.

6. **Verify**:

   - Prometheus `/targets` shows `actionpop` with both targets `UP`.
   - Grafana shows an **ActionPop** folder containing *Launch review* and *Operations*.
   - Open *Launch review* after clicking through the site: visits must be non-zero.

If a target is red, check that both containers are on the same network:

```bash
docker network inspect monitoring --format '{{range .Containers}}{{.Name}} {{end}}'
```

### A note on the scan overlay

`infra/compose/docker-compose.security.yml` publishes the scanner's edge on the loopback
interface. Docker cannot publish a port from a network declared `internal: true`, so that service
also joins the project's default network. This is a property of the scan overlay only: neither the
API nor the worker ever publishes a port, which is what keeps usage data off the host.

## Reading the dashboards

- **Traffic panels** use `or vector(0)`: a quiet period is a real `0`, not "No data".
- **Health panels** use `absent(...)`: a disappeared target raises an alert. Confusing the two is
  how an outage gets read as "no visitors yet".
- **`deployment`** distinguishes two instances running at once. `instance` is added by Prometheus
  from the scrape target and is not the application's own label.

## Proving the alerts

Each rule can be provoked on a copy of the stack:

| Alert | Provoke with |
|---|---|
| `ActionPopUnreachable` | `docker compose stop api` |
| `ActionPopMetricsMissing` | stop both API and worker |
| `ActionPopDependencyDown` | `docker compose stop redis` |
| `ActionPopIngestionStale` | `docker compose stop worker` for over an hour |
| `ActionPopRejectedBurst` | loop a request that answers 404 through the edge |
| `ActionPopCalendarUnavailable` | stop `postgres`, then request `/calendar.ics` |
| `ActionPopQueueGrowing` | stop the worker while the dispatcher keeps scheduling |
| `ActionPopTruncation` | request a calendar whose result exceeds `CALENDAR_MAX_ENTRIES` |

Record each outcome here when performed:

| Alert | Date | Outcome |
|---|---|---|
| `ActionPopUnreachable` | | |
| `ActionPopMetricsMissing` | | |
| `ActionPopDependencyDown` | | |
| `ActionPopIngestionStale` | | |
| `ActionPopRejectedBurst` | | |
| `ActionPopCalendarUnavailable` | | |
| `ActionPopQueueGrowing` | | |
| `ActionPopTruncation` | | |

## Monitoring validation runs

The end-to-end scenarios of `specs/009-release-hardening-observability/quickstart.md` (5, 6 and 7)
are recorded here, not in the security checklist:

| Scenario | Date | Operator | Outcome |
|---|---|---|---|
| Package mounts without editing | | | |
| Every alert provable | | | |
| Quiet period shows zeros, not gaps | | | |
