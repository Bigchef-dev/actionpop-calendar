import {
  HttpError,
  NetworkError,
  TimeoutError,
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
}

export class ActionPopulaireClient {
  private readonly fetcher: typeof fetch;

  public constructor(private readonly options: ActionPopulaireClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  public async fetchGroupCatalogue(): Promise<GroupCatalogueEntry[]> {
    return validateGroupCatalogue(await this.request('/carte/liste_groupes/'));
  }

  public async fetchEventPage(groupId: string, page: number, pageSize: number): Promise<ActionPopulaireEventPayload[]> {
    const query = new URLSearchParams({ page: String(page), page_size: String(Math.min(1000, Math.max(1, pageSize))) });
    const value = await this.request(`/api/groupes/${encodeURIComponent(groupId)}/evenements/a-venir/?${query}`);
    if (!Array.isArray(value)) throw new Error('event page must be an array');
    return value.map(validateActionPopulaireEvent);
  }

  private async request(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (this.options.token) headers.authorization = `Bearer ${this.options.token}`;
      const response = await this.fetcher(new URL(path, this.options.baseUrl), { headers, signal: controller.signal });
      if (!response.ok) throw new HttpError(response.status);
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw new TimeoutError('upstream request timed out');
      if (error instanceof Error) throw new NetworkError(error.message);
      throw new NetworkError('upstream request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}