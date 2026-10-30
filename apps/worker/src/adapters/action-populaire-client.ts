import {
  EventIdentityMismatchError,
  HttpError,
  NetworkError,
  TimeoutError,
  UnknownEventError,
  UnknownGroupError,
  validateActionPopulaireEvent,
  validateGroupCatalogue,
  type ActionPopulaireEventPayload,
  type GroupCatalogueEntry,
} from '@actionpop/core';

export interface ActionPopulaireClientOptions {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRateLimitRetries?: number;
}

export class ActionPopulaireClient {
  private readonly fetcher: typeof fetch;

  public constructor(private readonly options: ActionPopulaireClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  public async fetchGroupCatalogue(): Promise<GroupCatalogueEntry[]> {
    return validateGroupCatalogue(await this.request('/carte/liste_groupes/'));
  }

  /**
   * One event's detail resource. A 404 is a definitive answer, and a document that
   * describes another event is an upstream inconsistency that must stay retryable.
   */
  public async fetchEventDetails(eventId: string): Promise<ActionPopulaireEventPayload> {
    let value: unknown;
    try {
      value = await this.request(`/api/evenements/${encodeURIComponent(eventId)}/details/`);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        throw new UnknownEventError(eventId);
      }
      throw error;
    }

    const event = validateActionPopulaireEvent(value);
    if (event.id !== eventId) throw new EventIdentityMismatchError(eventId, event.id);
    return event;
  }

  public async fetchEventPage(
    groupId: string,
    page: number,
    pageSize: number,
  ): Promise<ActionPopulaireEventPayload[]> {
    const query = new URLSearchParams({
      page: String(page),
      page_size: String(Math.min(1000, Math.max(1, pageSize))),
    });
    let value: unknown;
    try {
      value = await this.request(
        `/api/groupes/${encodeURIComponent(groupId)}/evenements/a-venir/?${query}`,
      );
    } catch (error) {
      // Only a definitive "this group does not exist" answer may stop a retrieval;
      // every other status keeps the current retry behaviour.
      if (error instanceof HttpError && error.status === 404) {
        throw new UnknownGroupError(groupId);
      }
      throw error;
    }
    if (!Array.isArray(value)) throw new Error('event page must be an array');
    return value.map(validateActionPopulaireEvent);
  }

  /**
   * A 429 is a throttle, not a failure: wait for the delay the server asked for and
   * retry in place, so a burst does not consume the job's whole retry budget.
   */
  private async request(path: string): Promise<unknown> {
    const maxRetries = this.options.maxRateLimitRetries ?? DEFAULT_MAX_RATE_LIMIT_RETRIES;

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.requestOnce(path);
      } catch (error) {
        if (error instanceof HttpError && error.status === 429 && attempt < maxRetries) {
          await (this.options.sleep ?? defaultSleep)(rateLimitDelayMs(error, attempt));
          continue;
        }
        throw error;
      }
    }
  }

  private async requestOnce(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (this.options.token) headers.authorization = `Bearer ${this.options.token}`;
      const response = await this.fetcher(new URL(path, this.options.baseUrl), {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) throw new HttpError(response.status, undefined, retryAfterMs(response));
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError')
        throw new TimeoutError('upstream request timed out');
      if (error instanceof Error) throw new NetworkError(error.message);
      throw new NetworkError('upstream request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}

const DEFAULT_MAX_RATE_LIMIT_RETRIES = 2;
const DEFAULT_RATE_LIMIT_DELAY_MS = 2_000;
const MAX_RATE_LIMIT_DELAY_MS = 30_000;
const RATE_LIMIT_JITTER_MS = 250;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rateLimitDelayMs(error: HttpError, attempt: number): number {
  const base = error.retryAfterMs ?? DEFAULT_RATE_LIMIT_DELAY_MS * 2 ** attempt;
  return Math.min(base, MAX_RATE_LIMIT_DELAY_MS) + Math.floor(Math.random() * RATE_LIMIT_JITTER_MS);
}

/** Accepts both forms of `Retry-After`: delta seconds or an HTTP date. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after')?.trim();
  if (header === undefined || header === '') return undefined;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
