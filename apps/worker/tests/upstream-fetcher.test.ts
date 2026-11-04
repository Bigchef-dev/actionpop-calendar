import { createServer, type Server } from 'node:http';
import { createServer as createTcpServer, type AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createUpstreamFetcher } from '../src/adapters/upstream-fetcher.js';
import { parseSockProxy } from '../src/config.js';

describe('SOCK_PROXY configuration', () => {
  it('is absent when unset or blank', () => {
    expect(parseSockProxy(undefined)).toBeUndefined();
    expect(parseSockProxy('   ')).toBeUndefined();
  });

  it('accepts the proxy schemes the worker can dispatch through', () => {
    expect(parseSockProxy(' socks5://proxy.local:1080 ')).toBe('socks5://proxy.local:1080');
    expect(parseSockProxy('socks://proxy.local:1080')).toBe('socks://proxy.local:1080');
    expect(parseSockProxy('http://proxy.local:3128')).toBe('http://proxy.local:3128/');
    expect(parseSockProxy('https://proxy.local:3128')).toBe('https://proxy.local:3128/');
  });

  it('rejects a malformed or unsupported proxy URL', () => {
    expect(() => parseSockProxy('not a url')).toThrow(/valid URL/);
    expect(() => parseSockProxy('ftp://proxy.local:21')).toThrow(/socks5/);
  });
});

describe('upstream fetcher', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server === undefined) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  it('uses the runtime fetch when no proxy is configured', () => {
    expect(createUpstreamFetcher(undefined)).toBe(fetch);
  });

  it('sends the upstream request through the configured proxy', async () => {
    const proxy = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json', connection: 'close' });
      response.end(JSON.stringify({ path: request.url }));
    });
    server = proxy;
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const { port } = proxy.address() as AddressInfo;

    const fetcher = createUpstreamFetcher(`http://127.0.0.1:${port}`);
    const response = await fetcher(new URL('http://upstream.invalid/carte/liste_groupes/'), {
      headers: { connection: 'close' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      path: 'http://upstream.invalid/carte/liste_groupes/',
    });
  });

  it('dials the SOCKS5 proxy instead of the upstream host', async () => {
    let dialed = false;
    const proxy = createTcpServer((socket) => {
      socket.once('data', () => {
        dialed = true;
        // SOCKS5 greeting reply: version 5, "no acceptable methods".
        socket.end(Buffer.from([0x05, 0xff]));
      });
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const { port } = proxy.address() as AddressInfo;

    try {
      const fetcher = createUpstreamFetcher(`socks5://127.0.0.1:${port}`);
      await expect(
        fetcher(new URL('http://upstream.invalid/carte/liste_groupes/')),
      ).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }

    expect(dialed).toBe(true);
  });
});
