import { validateGroupCatalogue, type GroupCatalogueEntry } from '@actionpop/core';

interface RedisValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

export class GroupCatalogueRepository {
  private entries = new Map<string, GroupCatalogueEntry>();

  public async synchronize(value: unknown): Promise<void> {
    const entries = validateGroupCatalogue(value);
    const next = new Map(entries.map((entry) => [entry.id, entry]));
    this.entries = next;
  }

  public async synchronizePartial(value: unknown): Promise<void> {
    validateGroupCatalogue(value);
    throw new Error('partial catalogue cannot replace the last complete catalogue');
  }

  public activeScopes(): string[] {
    return [...this.entries.values()].filter((entry) => entry.is_active).map((entry) => entry.id);
  }

  public get(id: string): GroupCatalogueEntry | undefined {
    return this.entries.get(id);
  }
}

export class RedisGroupCatalogueRepository {
  public constructor(private readonly redis: RedisValueStore, private readonly key = 'actionpop:catalogue:groups') {}

  public async synchronize(value: unknown): Promise<void> {
    const entries = validateGroupCatalogue(value);
    await this.redis.set(this.key, JSON.stringify(entries));
  }

  public async synchronizePartial(value: unknown): Promise<void> {
    validateGroupCatalogue(value);
    throw new Error('partial catalogue cannot replace the last complete catalogue');
  }

  public async activeScopes(): Promise<string[]> {
    const entries = await this.read();
    return entries.filter((entry) => entry.is_active).map((entry) => entry.id);
  }

  public async get(id: string): Promise<GroupCatalogueEntry | undefined> {
    return (await this.read()).find((entry) => entry.id === id);
  }

  private async read(): Promise<GroupCatalogueEntry[]> {
    const value = await this.redis.get(this.key);
    return value === null ? [] : validateGroupCatalogue(JSON.parse(value) as unknown);
  }
}