# Common monitoring stack

A self-contained Compose project that runs the shared supervision layer: a provisioned Prometheus
and a provisioned Grafana, both fed by the package one directory up.

It is deliberately separate from the application stack. This project owns the `monitoring` network;
the application declares that network as external. That single shared name is the whole contract
between the two projects, and it is why the application never publishes a metrics port.

## Run it

```bash
cp .env.example .env        # then set GRAFANA_ADMIN_PASSWORD
docker compose up -d
```

`GRAFANA_ADMIN_PASSWORD` is read once, when Grafana first initialises its database. Editing it
afterwards leaves the existing account untouched — a trap worth knowing, because the symptom is a
plain `401 Invalid username or password` with a correct-looking `.env`. To change it:

```bash
docker compose exec grafana grafana cli admin reset-admin-password '<new password>'
```

Recreating the `grafana-data` volume also works, but deletes every dashboard created by hand
(provisioned ones come back on their own).

| UI | Address |
|---|---|
| Grafana | <http://127.0.0.1:3001> |
| Prometheus | <http://127.0.0.1:9090> |

Both bind to the loopback interface. On a remote server, reach them through an SSH tunnel rather
than opening a port:

```bash
ssh -L 3001:127.0.0.1:3001 user@server
```

## With the application

```bash
docker compose up -d                                            # this project, first
docker compose -f ../../compose/docker-compose.yml up -d         # the application stack
```

Both commands run from `infra/monitoring/compose/`. The shared network is the only link between
the two projects, so neither needs a reference to the other.

Order matters only the first time: the network must exist before the application joins it. After
that, either side can restart independently.

Check the link:

```bash
docker network inspect monitoring --format '{{range .Containers}}{{.Name}} {{end}}'
```

Expected: the Prometheus and Grafana containers, plus `api` and `worker` once the application runs.
In Prometheus, `/targets` shows `up{job="actionpop"}` at `1` for both services within one scrape
interval — or `0` with a DNS error, which means the application stack is not up.

## What is provisioned

| Path | Purpose |
|---|---|
| `../prometheus/alert-rules.yml` | mounted as `/etc/prometheus/actionpop-alert-rules.yml` and loaded by `rule_files` |
| `../grafana/provisioning/` | mounted as `/etc/grafana/provisioning`, so the datasource and the dashboard provider need no manual import |
| `../grafana/dashboards/` | mounted as `/etc/grafana/actionpop-dashboards`, the path the provider points at |
| `./prometheus.yml` | the scrape configuration, including the `actionpop` job |

The Grafana datasource is named `ActionPop Prometheus` with the fixed uid `actionpop-prometheus`,
and points at `http://prometheus:9090`, which is the service name below.

## Already have a Grafana with other services?

Then do not run this project; keep your own and apply the package to it instead. The two things to
copy are:

- the `actionpop` entry of `../prometheus/scrape-snippet.yml`, into your Prometheus `scrape_configs`;
- the two files of `../grafana/provisioning/`, plus the dashboards directory, mounted where your
  Grafana reads provisioning.

The datasource url is the only value that changes: point it at your own Prometheus. The dashboards
reference the datasource by uid, so nothing else needs editing.

`../README.md` documents that path in detail, including how to prove each alert fires.

## Why a single job for two services

`api` and `worker` expose their metrics on different paths. Rather than two jobs — which would
split `up{job="actionpop"}` into two selectors for every alert and dashboard — one job relabels
`__metrics_path__` from the `service` label. The alerts keep using `up{job="actionpop"}`, and it
yields one series per service.

## Retention and volumes

Samples live in the `prometheus-data` volume for `PROMETHEUS_RETENTION` (15 days by default).
Grafana keeps its database in `grafana-data`. Both survive `docker compose down` and are removed
by `docker compose down -v`, which also drops every dashboard a user created by hand.
