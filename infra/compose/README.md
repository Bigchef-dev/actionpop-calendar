# Deployment

Copy `.env.example` to `.env`, replace the registry image names, and provide
deployment secrets through the environment rather than committing them. Set
`UPSTREAM_BASE_URL` for the worker; `UPSTREAM_TOKEN` is optional when the source
does not require authentication. `SOCK_PROXY` is optional: when set
(`socks5://host:1080` or `http(s)://host:3128`), the worker reaches the source
through that proxy instead of connecting directly.

```bash
# The services join external networks Compose never creates: `monitoring` (see "Monitoring"
# below) and `caddy_network` (see "Create the shared network"). Provide both once on the host.
docker network create monitoring
docker network create caddy_network
docker compose -f infra/compose/docker-compose.yml pull
docker compose -f infra/compose/docker-compose.yml up -d --remove-orphans
docker compose -f infra/compose/docker-compose.yml ps
```

Deploying an update is the same two commands without the network setup:

```bash
git pull
docker compose -f infra/compose/docker-compose.yml pull
docker compose -f infra/compose/docker-compose.yml up -d --remove-orphans
```

The production file declares images only — no `build:`, no profile — so `pull` fetches every
service and `up -d` starts the whole stack, edge included.

**Pull every service, not only the one you changed.** The routing table is baked into the edge
image, so a deployment that recreates `web` alone serves a current site behind an old routing
table: every new page answers the edge's branded `404` while the bundle already links to it.
After any deployment, prove the published surface before walking away:

```bash
EDGE_BASE_URL=https://your.host pnpm exec playwright test apps/web/tests/edge-smoke.spec.ts
```

The smoke test asserts `/updates` and `/etat`, the header policy and the closed-by-default
surfaces; a stale edge fails it on the first route. To build the images on the host instead
of pulling them, combine the build override:

```bash
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/docker-compose.build.yml up -d --build
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

The `build:` sections live in `docker-compose.build.yml`, not in the production file: a `build:`
key would make `pull` try to build the service too, and fail when the tag was never published. This
is why a deployment never needs `--ignore-buildable`, and why the CI scan and a local build pass
`-f docker-compose.build.yml` explicitly.

Build the independent runtime targets from the repository root:

```bash
docker build -t actionpop-api:test -f infra/docker/Dockerfile.api .
docker build -t actionpop-worker:test -f infra/docker/Dockerfile.worker .
```

Redis, worker, and internal health endpoints remain on the private network. TLS terminates at the
host-wide Caddy reverse proxy, which owns ports 80/443 for the whole server. The edge is a
plain-HTTP virtual host that listens on `8080` only and is reachable as `edge:8080` over the
external `caddy_network`. It is a regular service of this stack — no profile to remember — shipped
as its own image built from [`infra/docker/Dockerfile.edge`](../docker/Dockerfile.edge):

```bash
docker compose -f infra/compose/docker-compose.yml pull edge
docker compose -f infra/compose/docker-compose.yml up -d edge
```

The Caddy site **must** target `edge:8080`; the vhost no longer listens on port 80, so a deployment
left on `edge:80` would answer nothing.

Nothing is copied onto the host: the routing table, headers and error pages live in the image, and
the build refuses to produce an unusable configuration. See
[`infra/edge/README.md`](../edge/README.md) for the layout and how to add a route.

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

The `web` service serves the built `apps/web` as static files (its `build:` lives in
`docker-compose.build.yml`); the edge proxies `/` and `/assets/` to it, so a visitor gets one origin
and the calendar paths are same-origin. Set `WEB_IMAGE` to use a registry image instead of the
local default tag.

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
