# The published edge

One nginx hop between the host-wide Caddy (which owns TLS) and the `web` / `api` containers.
The whole public surface is decided here.

## Layout, and why

| File                                 | Owns                                                                                 | Read it when                            |
| ------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------- |
| `https.conf`                         | the production vhost: listeners, `server_name`, which snippets to include            | you change a port or a transport detail |
| `http-scan.conf`                     | the plain-HTTP twin used by the CI exploitation scan                                 | never, unless the scan itself changes   |
| `snippets/routes.conf`               | **the routing table** — every public path, the error pages, the method rejections    | you add, remove or move a route         |
| `snippets/security-headers.conf`     | the response-header policy (CSP, HSTS, frame, permissions, COOP/COEP/CORP)           | you change a header                     |
| `snippets/proxy.conf`                | proxy defaults inherited by every location (HTTP version, client identity, timeouts) | you change an upstream behaviour        |
| `errors/404.html`, `errors/50x.html` | the pages a visitor sees instead of nginx's default                                  | you change the wording or the styling   |
| `web.conf`                           | the static server of the `web` image (not this container)                            | you change caching of the built site    |

The two vhosts include the same three snippets, so a route or a header cannot exist in production
and be missing from the scan. `tests/integration/edge-surface.test.ts` asserts that, and also that
every `include` names a file this repository actually ships — a missing snippet used to leave an
empty directory in the tree and take the whole site down.

## Adding a route

1. Add the `location` to `snippets/routes.conf`. Both vhosts pick it up; do not edit them.
2. Choose the match deliberately:
   - `= /path` for an exact route, plus `^~ /path/` if sub-paths belong to the same upstream.
     A bare `^~ /path` also matches `/pathXYZ`, so prefer the pair.
   - `^~ /prefix/` for a route family.
   - Keep the fallback `location /` last.
3. Reads go to `api:3000` with `limit_except GET HEAD { deny all; }` and
   `error_page 403 = @read_method_not_allowed;`. Only `/telemetry/journey` accepts a write.
4. Never route `/internal/*`, `/reference` or `/openapi.json`. They are private on purpose.
5. Record the path in `specs/contracts/http/observability.md` (the normative table) and in
   `specs/009-release-hardening-observability/contracts/edge-surface.md` (the decision history).

## Validating a change

Syntax, without running the stack (the fake hosts only satisfy name resolution at config load):

```bash
docker run --rm --add-host web:127.0.0.1 --add-host api:127.0.0.1 \
  -v "$PWD/infra/edge/https.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$PWD/infra/edge:/etc/nginx/app:ro" \
  nginx:1.29-alpine nginx -t
```

Behaviour, against stub upstreams: start two containers aliased `web` and `api` on a scratch
network, run this edge on it, then check that a routed path answers JSON from the API, that an
unknown path answers the branded page with the full header set, and that a wrong method answers
`405` with `Allow`.

Automated checks:

```bash
pnpm test:integration            # tests/integration/edge-surface.test.ts
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/docker-compose.security.yml up -d --build   # then ZAP
```

## Applying a change to a running deployment

The vhost and its snippets are bind-mounted read-only; nginx reads them **only at start**, so
editing a file changes nothing until the container is restarted:

```bash
docker compose -f infra/compose/docker-compose.yml --profile edge up -d --force-recreate edge
docker compose -f infra/compose/docker-compose.yml --profile edge exec edge nginx -t
```

A route that answers nginx's bare 404 while the API serves it is almost always this: the config
on disk is newer than the config in the running container.

## Deliberate non-goals

- **No `upstream` block / keepalive.** An `upstream` cannot be declared inside a `server`, and the
  API answers in single-digit milliseconds on the private network: the extra file and mount would
  buy nothing measurable.
- **Two listeners (80 and 8080).** Caddy reaches this vhost as `edge:8080` in the documented
  topology and as `edge:80` on some deployments. Answering both keeps a port mismatch from
  becoming an outage. Neither port is published to the host.
- **No SPA history fallback.** The web app owns its state in the query string and has no client
  routes, so an unknown path is genuinely absent and gets the branded 404.
