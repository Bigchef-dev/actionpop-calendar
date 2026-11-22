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

## Deployment: one image, no file transfer

The configuration is **baked into an image** (`infra/docker/Dockerfile.edge`), not bind-mounted:

```bash
# build and validate locally
docker build -f infra/docker/Dockerfile.edge --target edge -t actionpop-edge:local .
```

The build runs `check-config.sh` and fails if the vhost, a snippet or an error page cannot start,
so a broken configuration never produces an image. Two targets share every layer:

| Target | Vhost                                   | Used by                  |
| ------ | --------------------------------------- | ------------------------ |
| `edge` | `https.conf` (`listen 80` and `8080`)   | the production stack     |
| `scan` | `http-scan.conf` (plain HTTP on `8080`) | the CI exploitation scan |

Deploying is therefore a pull, never a copy:

```bash
docker compose -f infra/compose/docker-compose.yml pull edge
docker compose -f infra/compose/docker-compose.yml --profile edge up -d edge
```

Pin `EDGE_IMAGE` to an immutable tag (`...:${GIT_SHA}`) to roll back by changing one value. The
running tag _is_ the running routing table, which is what removes the "the file on disk is newer
than the container" failure for good.

## Validating a change

Everything is checked by the image build:

```bash
docker build -f infra/docker/Dockerfile.edge --target edge .
docker build -f infra/docker/Dockerfile.edge --target scan .
```

The same check on the working tree, without building an image:

```bash
docker run --rm -v "$PWD/infra/edge:/src:ro" nginx:1.29-alpine sh -c \
  'mkdir -p /etc/nginx/app && cp -r /src/snippets /src/errors /src/check-config.sh /etc/nginx/app/ \
   && cp /src/https.conf /etc/nginx/conf.d/default.conf \
   && /etc/nginx/app/check-config.sh /etc/nginx/conf.d/default.conf'
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

## Diagnosing a route that answers 404

Ask the two questions in order; they are different failures.

```bash
# 1. Does the API serve it? (bypasses the edge entirely)
docker compose -f infra/compose/docker-compose.yml exec api \
  node -e "fetch('http://127.0.0.1:3000/groups?department=35').then(async r=>console.log(r.status, (await r.text()).slice(0,120)))"

# 2. Which routing table is the edge running?
docker compose -f infra/compose/docker-compose.yml --profile edge exec edge \
  sh -lc 'grep -c "location = /groups" /etc/nginx/conf.d/default.conf; grep -c . /etc/nginx/app/snippets/routes.conf'
```

A `404` from the API (JSON) means an image without the route; a branded `404` means the edge does
not route the path. Since the configuration ships in the image, the second case now means "the
edge image was not rebuilt and pulled", never "a file was not copied".

## Deliberate non-goals

- **No `upstream` block / keepalive.** An `upstream` cannot be declared inside a `server`, and the
  API answers in single-digit milliseconds on the private network: the extra file and mount would
  buy nothing measurable.
- **Two listeners (80 and 8080).** Caddy reaches this vhost as `edge:8080` in the documented
  topology and as `edge:80` on some deployments. Answering both keeps a port mismatch from
  becoming an outage. Neither port is published to the host.
- **No SPA history fallback.** The web app owns its state in the query string and has no client
  routes, so an unknown path is genuinely absent and gets the branded 404.
