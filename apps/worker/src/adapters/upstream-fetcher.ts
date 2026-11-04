import { fetch as undiciFetch, ProxyAgent, Socks5ProxyAgent, type Dispatcher } from 'undici';

type UndiciFetchInput = Parameters<typeof undiciFetch>[0];
type UndiciFetchInit = Parameters<typeof undiciFetch>[1];

/**
 * Builds the fetcher the upstream client uses. Without `SOCK_PROXY` it stays the runtime
 * `fetch`; with it, every upstream request tunnels through that proxy. A SOCKS5 proxy lets
 * the worker leave from an address the source accepts without exposing the host's own.
 */
export function createUpstreamFetcher(proxyUrl: string | undefined): typeof fetch {
  if (proxyUrl === undefined) return fetch;

  const dispatcher = createProxyDispatcher(proxyUrl);
  // `undici` ships its own `Response` declaration, which TypeScript keeps distinct from the
  // runtime's; the client only reads `ok`, `status`, `headers` and `json`, so the shapes agree.
  return (input, init) =>
    undiciFetch(input as UndiciFetchInput, {
      ...(init ?? {}),
      dispatcher,
    } as UndiciFetchInit) as unknown as Promise<Response>;
}

/**
 * An agent per protocol family: `undici` dispatches SOCKS5 itself, and its `ProxyAgent`
 * covers the classic HTTP(S) proxies.
 */
function createProxyDispatcher(proxyUrl: string): Dispatcher {
  const { protocol } = new URL(proxyUrl);
  if (protocol === 'socks5:' || protocol === 'socks:') return new Socks5ProxyAgent(proxyUrl);
  return new ProxyAgent(proxyUrl);
}
