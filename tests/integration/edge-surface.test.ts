import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const HTTPS = readFileSync('infra/edge/https.conf', 'utf8');
const SCAN = readFileSync('infra/edge/http-scan.conf', 'utf8');
const HEADERS = readFileSync('infra/edge/security-headers.conf', 'utf8');
const CONTRACT = readFileSync(
  'specs/009-release-hardening-observability/contracts/edge-surface.md',
  'utf8',
);

/** Location directives, in the order they appear, with their target. */
function locations(conf: string): Array<{ match: string; target: string }> {
  const blocks = [...conf.matchAll(/location\s+([^{]+)\{([\s\S]*?)\n\s*\}/g)];
  return blocks.map(([, match, body]) => ({
    match: (match ?? '').trim(),
    target: /proxy_pass\s+http:\/\/([^;]+);/.exec(body ?? '')?.[1]?.trim() ?? 'return-404',
  }));
}

describe('published edge surface', () => {
  it('routes exactly the documented public paths', () => {
    const declared = locations(HTTPS)
      .map((location) => location.match)
      .sort();

    expect(declared).toEqual(
      [
        '= /',
        '/assets/',
        '~* ^/[^/]+\\.(png|ico|svg|webp|txt)$',
        '= /calendar.ics',
        '^~ /search/',
        '^~ /events',
        '^~ /feed/',
        '= /telemetry/journey',
        '/',
        '@journey_method_not_allowed',
      ].sort(),
    );
    for (const entry of ['/calendar.ics', '/search/', '/events', '/feed/', '/telemetry/journey']) {
      expect(CONTRACT).toContain(entry);
    }
  });

  it('never routes an internal or exploratory surface', () => {
    for (const conf of [HTTPS, SCAN]) {
      for (const location of locations(conf)) {
        expect(location.match).not.toContain('/internal');
        expect(location.match).not.toContain('/reference');
        expect(location.match).not.toContain('/openapi');
      }
    }
  });

  it('answers 404 for anything else instead of proxying it', () => {
    const fallback = locations(HTTPS).find((location) => location.match === '/');

    expect(fallback?.target).toBe('return-404');
    expect(HTTPS).toContain('return 404;');
  });

  it('applies the same header snippet to both servers', () => {
    expect(HTTPS).toContain('/etc/nginx/snippets/security-headers.conf');
    expect(SCAN).toContain('/etc/nginx/snippets/security-headers.conf');
  });

  it('declares the browser security rules the contract requires', () => {
    expect(HEADERS).toContain("frame-ancestors 'none'");
    expect(HEADERS).toContain("script-src 'self'");
    expect(HEADERS).toContain('X-Content-Type-Options');
    expect(HEADERS).toContain('X-Frame-Options');
    expect(HEADERS).toContain('Referrer-Policy');
    expect(HEADERS).toContain('Permissions-Policy');
    expect(HEADERS).toContain('Cross-Origin-Opener-Policy');
  });

  it('defers TLS to the host terminator and instructs browsers to stay secure', () => {
    // Caddy owns ports 80/443, the certificates and the HTTP -> HTTPS redirect; this config must
    // stay a plain-HTTP virtual host reachable only over the caddy_network.
    expect(HTTPS).toContain('listen 8080;');
    expect(HTTPS).not.toMatch(/listen\s+443/);
    expect(HTTPS).not.toContain('ssl_certificate');
    expect(HTTPS).not.toContain('return 301');
    expect(HTTPS).toContain('Strict-Transport-Security');
    expect(HTTPS).toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    expect(HTTPS).toContain('proxy_set_header X-Forwarded-Proto https;');
  });

  it('limits the write surface to the journey endpoint and caps its body', () => {
    expect(HTTPS).toContain('location = /telemetry/journey');
    expect(HTTPS).toContain('client_max_body_size 2k;');
    expect(locations(HTTPS).find((l) => l.match === '= /telemetry/journey')?.target).toBe('api:3000');
  });
});
