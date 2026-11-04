# Deployment

Copy `.env.example` to `.env`, replace the registry image names, and provide
deployment secrets through the environment rather than committing them. Set
`UPSTREAM_BASE_URL` for the worker; `UPSTREAM_TOKEN` is optional when the source
does not require authentication. `SOCK_PROXY` is optional: when set
(`socks5://host:1080` or `http(s)://host:3128`), the worker reaches the source
through that proxy instead of connecting directly.

```bash
# `api`, `worker` and `web` join the external `monitoring` network, which Compose never
# creates: provide it once on the host (see "Monitoring" below).
docker network create monitoring
docker compose -f infra/compose/docker-compose.yml up -d
docker compose -f infra/compose/docker-compose.yml ps
```

From the repository root, Compose can build both application images directly:

```bash
docker compose -f infra/compose/docker-compose.yml up --build
```

`up` also runs the one-shot `migrate` service, which applies the Prisma migrations with
the CLI bundled in the worker image; `api` and `worker` start only once it succeeded, so
the schema can never lag behind the images. Run it alone to migrate without restarting
the applications:

```bash
docker compose -f infra/compose/docker-compose.yml run --rm migrate
```

For local development, use the API from the private Compose network or add a
local-only port override. Production traffic goes through the HTTPS edge.

Set `API_IMAGE` and `WORKER_IMAGE` when the services should use registry images
instead of the local default tags.

`.github/workflows/publish-images.yml` publishes the three runtime images on every push to
`main`, each build under its commit SHA and under `latest`. A host can pull what it validated
and keep a reproducible tag:

```bash
API_IMAGE=ghcr.io/bigchef-dev/actionpop-api:<sha> \
WEB_IMAGE=ghcr.io/bigchef-dev/actionpop-web:<sha> \
WORKER_IMAGE=ghcr.io/bigchef-dev/actionpop-worker:<sha> \
docker compose -f infra/compose/docker-compose.yml pull
```

From a checkout that also holds the sources, those services declare a `build:` section, so a
plain `pull` tries to fetch them too and a tag that was never published fails the command. Add
`--ignore-buildable` to fetch only the third-party images and build the rest.

Build the independent runtime targets from the repository root:

```bash
docker build -t actionpop-api:test -f infra/docker/Dockerfile.api .
docker build -t actionpop-worker:test -f infra/docker/Dockerfile.worker .
```

Redis, worker, and internal health endpoints remain on the private network. TLS terminates at the
host-wide Caddy reverse proxy, which owns ports 80/443 for the whole server. The edge is a
plain-HTTP virtual host reachable only as `edge:8080` over the external `caddy_network`, and is started
explicitly with `docker compose --profile edge -f infra/compose/docker-compose.yml up -d`.

A minimal Caddy site for it:

```caddyfile
calendar.example {
	reverse_proxy edge:8080
}
```

Create the shared network once on the host (Compose never creates external networks):

```bash
docker network create caddy_network
```

## Published site

The `web` service builds `apps/web` and serves it as static files; the edge proxies `/` and
`/assets/` to it, so a visitor gets one origin and the calendar paths are same-origin. Set
`WEB_IMAGE` to use a registry image instead of the local default tag.

## Monitoring

`api` and `worker` also join the external `monitoring` network so the Prometheus already running
on the server can scrape them without a published port. Because Compose never creates an external
network, it must exist before the first `up`; the Deploy commands above create it, and on an
existing host it is already there:

```bash
docker network create monitoring
```

Rename it with `MONITORING_NETWORK` if your monitoring project uses another name; the variable
renames the network Compose joins, so create it under the same name. The dashboards and alert
rules live in `infra/monitoring/`; see its README for the mounts.

## Exploitation scan

`.github/workflows/security.yml` starts the stack with an extra overlay that publishes a
plain-HTTP twin of the edge on `127.0.0.1:8080`, then runs an OWASP ZAP baseline scan against it:

```bash
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/docker-compose.security.yml up -d --build
```

The scan attacks the real allowlist and the real header snippet, so what it validates is what
production serves. `scripts/zap-gate.mjs` fails the run on any high-severity alert.
