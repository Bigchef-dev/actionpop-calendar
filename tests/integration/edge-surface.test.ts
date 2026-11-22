import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const EDGE = 'infra/edge';
const HTTPS = readFileSync(`${EDGE}/https.conf`, 'utf8');
const SCAN = readFileSync(`${EDGE}/http-scan.conf`, 'utf8');
const ROUTES = readFileSync(`${EDGE}/snippets/routes.conf`, 'utf8');
const DOCKERFILE = readFileSync('infra/docker/Dockerfile.edge', 'utf8');
const COMPOSE = readFileSync('infra/compose/docker-compose.yml', 'utf8');
const COMPOSE_SCAN = readFileSync('infra/compose/docker-compose.security.yml', 'utf8');
const CONTRACT = readFileSync(
  'specs/009-release-hardening-observability/contracts/edge-surface.md',
  'utf8',
);

/** Location directives, in the order they appear, with the upstream they proxy to. */
function locations(conf: string): Array<{ match: string; target: string }> {
  // Anchored on its own line: a `location` mentioned inside a comment must not open a block.
  const blocks = [...conf.matchAll(/^[ \t]*location\s+([^{\n]+?)\s*\{([\s\S]*?)\n\s*\}/gm)];
  return blocks.map(([, match, body]) => ({
    match: (match ?? '').trim(),
    target: /proxy_pass\s+http:\/\/([^;]+);/.exec(body ?? '')?.[1]?.trim() ?? 'no-upstream',
  }));
}

/** Every `include` directive of a configuration file, with the absolute path it names. */
function includes(conf: string): string[] {
  return [...conf.matchAll(/include\s+(\S+);/g)].map(([, path]) => (path ?? '').trim());
}

describe('published edge surface', () => {
  it('routes exactly the documented public paths', () => {
    const declared = locations(ROUTES)
      .map((location) => location.match)
      .sort();

    expect(declared).toEqual(
      [
        '= /',
        '/assets/',
        '~* ^/[^/]+\\.(png|ico|svg|webp|txt)$',
        '= /calendar.ics',
        '^~ /search/',
        '= /events',
        '^~ /events/',
        '= /groups',
        '^~ /groups/',
        '^~ /feed/',
        '= /telemetry/journey',
        '= /healthz',
        '^~ /errors/',
        '@read_method_not_allowed',
        '@write_method_not_allowed',
        '/',
      ].sort(),
    );

    for (const entry of [
      '/calendar.ics',
      '/search/',
      '/events',
      '/groups',
      '/feed/',
      '/telemetry/journey',
    ]) {
      expect(CONTRACT).toContain(entry);
    }
  });

  it('serves production and the CI scan from one routing table', () => {
    // The whole point of the refactor: a route added once cannot be missing from the other vhost,
    // which is exactly how `/groups` once answered nginx's 404 on the published site.
    for (const vhost of [HTTPS, SCAN]) {
      expect(includes(vhost)).toContain('/etc/nginx/app/snippets/routes.conf');
      expect(includes(vhost)).toContain('/etc/nginx/app/snippets/security-headers.conf');
      expect(includes(vhost)).toContain('/etc/nginx/app/snippets/proxy.conf');
      // Routing must never be declared twice: one table, included.
      expect(locations(vhost)).toHaveLength(0);
    }
  });

  it('only includes files this repository ships', () => {
    // A missing snippet used to leave an empty directory behind and take the whole site down.
    for (const conf of [HTTPS, SCAN, ROUTES]) {
      for (const include of includes(conf)) {
        const source = include.replace('/etc/nginx/app', EDGE);
        expect(existsSync(source), `${include} is included but ${source} does not exist`).toBe(
          true,
        );
      }
    }
  });

  it('never routes an internal or exploratory surface', () => {
    for (const location of locations(ROUTES)) {
      expect(location.match).not.toContain('/internal');
      expect(location.match).not.toContain('/reference');
      expect(location.match).not.toContain('/openapi');
    }
  });

  it('answers a branded page for anything unrouted instead of nginx’s default', () => {
    const fallback = locations(ROUTES).find((location) => location.match === '/');

    expect(fallback?.target).toBe('no-upstream');
    expect(ROUTES).toContain('return 404;');
    expect(ROUTES).toContain('error_page 404 /errors/404.html;');
    expect(ROUTES).toContain('error_page 500 502 503 504 /errors/50x.html;');
    expect(ROUTES).toMatch(/location \^~ \/errors\/ \{\s*internal;/);
    expect(existsSync(`${EDGE}/errors/404.html`)).toBe(true);
    expect(existsSync(`${EDGE}/errors/50x.html`)).toBe(true);
  });

  it('rejects a wrong method with 405 and Allow, re-including the header policy', () => {
    // `add_header` in a block discards the inherited set, so these named locations must include
    // the snippet or they would be the only responses served without a CSP.
    for (const named of ['read_method_not_allowed', 'write_method_not_allowed']) {
      const block = new RegExp(`location @${named} \\{([\\s\\S]*?)\\n\\}`).exec(ROUTES)?.[1];
      expect(block).toBeDefined();
      expect(block).toContain('include /etc/nginx/app/snippets/security-headers.conf;');
      expect(block).toContain('return 405');
      expect(block).toContain('add_header Allow');
    }

    expect(ROUTES).toContain('limit_except GET HEAD { deny all; }');
    expect(ROUTES).toContain('error_page 403 = @read_method_not_allowed;');
    expect(ROUTES).toContain('error_page 403 = @write_method_not_allowed;');
  });

  it('defers TLS to the host terminator and instructs browsers to stay secure', () => {
    // Caddy owns ports 80/443, the certificates and the HTTP -> HTTPS redirect; this config stays
    // a plain-HTTP virtual host reachable only over the caddy_network.
    expect(HTTPS).toMatch(/listen\s+80;/);
    expect(HTTPS).not.toMatch(/listen\s+443/);
    expect(HTTPS).not.toContain('ssl_certificate');
    expect(HTTPS).not.toContain('return 301');
    expect(readFileSync(`${EDGE}/snippets/security-headers.conf`, 'utf8')).toContain(
      'Strict-Transport-Security',
    );
    // Each vhost states its own transport, which is the only honest difference between them.
    expect(HTTPS).toContain('proxy_set_header X-Forwarded-Proto https;');
    expect(SCAN).toContain('proxy_set_header X-Forwarded-Proto $scheme;');
    expect(readFileSync(`${EDGE}/snippets/proxy.conf`, 'utf8')).toContain(
      'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    );
  });

  it('ships the configuration inside an image instead of bind-mounting it', () => {
    // A configuration directory copied onto a host is a deployment step that can be forgotten, and
    // nginx keeps serving what it loaded at start-up whatever the file says afterwards. Baking the
    // configuration into the image makes the running tag the running configuration.
    expect(DOCKERFILE).toContain('COPY infra/edge/https.conf /etc/nginx/conf.d/default.conf');
    expect(DOCKERFILE).toContain('COPY infra/edge/snippets/ /etc/nginx/app/snippets/');
    expect(DOCKERFILE).toContain('COPY infra/edge/errors/ /etc/nginx/app/errors/');
    expect(DOCKERFILE).toContain('FROM edge AS scan');
    expect(DOCKERFILE).toContain('COPY infra/edge/http-scan.conf /etc/nginx/conf.d/default.conf');
    // The image must refuse to be built from a configuration its runtime would reject.
    expect(DOCKERFILE).toContain('check-edge-config');

    for (const compose of [COMPOSE, COMPOSE_SCAN]) {
      // No configuration reaches the container through a volume any more.
      expect(compose).not.toMatch(/:\s*\n?\s*- \.\.\/edge:/);
      expect(compose).not.toContain('../edge/https.conf:');
      expect(compose).not.toContain('../edge/http-scan.conf:');
    }
    expect(COMPOSE).toContain('dockerfile: infra/docker/Dockerfile.edge');
    expect(COMPOSE_SCAN).toContain('target: scan');
  });

  it('declares a loopback-only health endpoint that no upstream can break', () => {
    const block = /location = \/healthz \{([\s\S]*?)\n\}/.exec(ROUTES)?.[1];

    expect(block).toBeDefined();
    expect(block).toContain('allow 127.0.0.1;');
    expect(block).toContain('deny all;');
    expect(block).toContain("return 200 'ok';");
    expect(block).not.toContain('proxy_pass');
    expect(COMPOSE).toContain('/healthz');
  });

  it('limits the write surface to the journey endpoint and caps its body', () => {
    expect(ROUTES).toContain('location = /telemetry/journey');
    expect(ROUTES).toContain('client_max_body_size 2k;');
    expect(ROUTES).toContain('limit_except POST { deny all; }');
    expect(locations(ROUTES).find((l) => l.match === '= /telemetry/journey')?.target).toBe(
      'api:3000',
    );
  });
});
